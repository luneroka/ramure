// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDate } from '@/gedcom/dates';
import type { Tree } from '@/gedcom/model';
import { parseGedcom } from '@/gedcom/parse';
import { serializeGedcom } from '@/gedcom/serialize';
import { planGraft } from '@/tree/graft';
import { applyOp, ops, type Op } from '@/tree/ops';
import { useGraft } from '@/app/hooks/useGraft';
import { UiProvider } from '@/app/ui/UiContext';
import { GraftDialog } from './GraftDialog';

/**
 * The preview's wiring: that it says in words what the plan holds, and that
 * nothing is written until the person asks. What a plan holds is tested in
 * src/tree/graft.test.ts.
 */

// A path from the project root: under happy-dom `import.meta.url` is not a file URL.
const original = parseGedcom(readFileSync('fixtures/geneanet/input-fixture.ged', 'utf8'));
const edit = (tree: Tree, list: Op[]): Tree => list.reduce((t, op) => applyOp(t, op).tree, tree);
const researched = edit(original, [
  ops.addChild('I25', { given: 'Jules', surname: 'FERRAND', sex: 'M' }, 'F11'),
  ops.updatePerson('I2', {
    events: original.individuals.I2!.events.map((e) => (e.type === 'birth' ? { ...e, date: parseDate('1922') } : e)),
  }),
]);
const file = parseGedcom(serializeGedcom(researched));
const plan = planGraft(original, file, 'recherches.ged');

afterEach(cleanup);

describe('GraftDialog', () => {
  it('says who is new, who gains what, and where the file disagrees', () => {
    const onApply = vi.fn();
    render(
      <UiProvider>
        <GraftDialog file="recherches.ged" plan={plan} onApply={onApply} onClose={() => undefined} />
      </UiProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Compléter l’arbre' });
    expect(dialog).toHaveTextContent('recherches.ged');
    expect(dialog).toHaveTextContent('33 personnes du fichier reconnues dans l’arbre.');
    expect(dialog).toHaveTextContent('1 nouvelle personne');
    expect(dialog).toHaveTextContent('Jules FERRAND');
    expect(dialog).toHaveTextContent(/Claire AUBRY · enfant/);
    expect(dialog).toHaveTextContent('1 différence');
    expect(dialog).toHaveTextContent(/Henri Marie LENOIR · naissance : « [^»]*1921 » dans l’arbre, « 1922 » dans le fichier/);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à l’arbre' }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('offers only to close when the file brings nothing new', () => {
    const onClose = vi.fn();
    render(
      <UiProvider>
        <GraftDialog file="pareil.ged" plan={planGraft(original, original, 'pareil.ged')} onApply={() => undefined} onClose={onClose} />
      </UiProvider>,
    );
    expect(screen.getByText('Ce fichier n’apporte rien que l’arbre ne sache déjà.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter à l’arbre' })).toBeNull();
    // The corner × and the button at the foot both close.
    const closers = screen.getAllByRole('button', { name: 'Fermer' });
    expect(closers).toHaveLength(2);
    fireEvent.click(closers[1]!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('useGraft', () => {
  const gedFile = () => new File([serializeGedcom(researched)], 'recherches.ged', { type: 'text/plain' });

  it('writes nothing until applied, then commits one graft op', async () => {
    const commit = vi.fn(() => true);
    const toast = vi.fn();
    const { result } = renderHook(() => useGraft({ lang: 'fr', tree: original, toast, commit }));
    await act(() => result.current.pick(gedFile()));
    expect(result.current.preview?.plan.added).toHaveLength(1);
    expect(commit).not.toHaveBeenCalled();
    act(() => result.current.apply());
    expect(commit).toHaveBeenCalledOnce();
    expect((commit.mock.calls[0] as unknown as [Op])[0].t).toBe('graft');
    expect(toast).toHaveBeenCalledWith('Arbre complété : 1 nouvelle personne');
    expect(result.current.preview).toBeNull();
  });

  it('plans again when the tree moved while the preview was open', async () => {
    const commit = vi.fn((_op: Op) => true);
    const { result, rerender } = renderHook(({ tree }) => useGraft({ lang: 'fr', tree, toast: () => undefined, commit }), {
      initialProps: { tree: original },
    });
    await act(() => result.current.pick(gedFile()));
    // A relative adds Jules in the meantime: once the tree has him, the file has nothing left to add.
    rerender({ tree: edit(original, [ops.addChild('I25', { given: 'Jules', surname: 'FERRAND', sex: 'M' }, 'F11')]) });
    act(() => result.current.apply());
    expect(commit).not.toHaveBeenCalled();
  });

  it('refuses a file with nobody in it', async () => {
    const toast = vi.fn();
    const { result } = renderHook(() => useGraft({ lang: 'fr', tree: original, toast, commit: () => true }));
    await act(() => result.current.pick(new File(['0 HEAD\n0 TRLR'], 'vide.ged')));
    expect(toast).toHaveBeenCalledWith('Ce fichier ne contient aucune personne.');
    expect(result.current.preview).toBeNull();
  });
});
