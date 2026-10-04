// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGedcom } from '@/gedcom/parse';
import type { PersonPatch } from '@/tree/edit';
import type { UnionChange } from './PersonEditor';

vi.mock('@/store', () => ({
  mediaStore: { get: async () => undefined, put: async () => undefined, delete: vi.fn(async () => undefined) },
}));
import { PersonEditor } from './PersonEditor';

afterEach(cleanup);
const tree = parseGedcom(readFileSync(join(process.cwd(), 'fixtures/geneanet/input-fixture.ged'), 'utf8'));

describe('PersonEditor', () => {
  it('saves the name, the flag and the events, dropping the suggested empty rows', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(p: PersonPatch) => void>();
    const person = tree.individuals.I3!; // Jeanne MARCHAL, born 1925: a death row is suggested but empty
    render(<PersonEditor tree={tree} person={person} lang="fr" onSave={onSave} onCancel={() => undefined} onDelete={() => undefined} />);
    await user.type(screen.getByLabelText('Surnom'), 'Jeannette');
    await user.click(screen.getByLabelText('Informations à vérifier'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const patch = onSave.mock.calls[0]![0]!;
    expect(patch.names?.[0]?.nick).toBe('Jeannette');
    expect(patch.unsure).toBe(true);
    expect(patch.events?.length).toBe(person.events.length);
  });

  describe('marriages, which GEDCOM keeps on the union', () => {
    const editorFor = (id: string) => {
      const onSave = vi.fn<(p: PersonPatch, u: UnionChange[]) => void>();
      render(
        <PersonEditor
          tree={tree}
          person={tree.individuals[id]!}
          lang="fr"
          onSave={onSave}
          onCancel={() => undefined}
          onDelete={() => undefined}
        />,
      );
      return onSave;
    };
    const typeSelects = () => screen.getAllByLabelText('Type') as HTMLSelectElement[];

    it('lists an imported marriage among the events, and leaves the union alone when nothing changes', async () => {
      const user = userEvent.setup();
      const onSave = editorFor('I3'); // Jeanne MARCHAL, married Henri LENOIR in 1948 (F2)
      expect(typeSelects().filter((s) => s.value === 'marriage')).toHaveLength(1);
      expect(screen.getByText(/avec Henri/)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const [patch, unions] = onSave.mock.calls[0]!;
      expect(patch.events?.some((e) => e.type === 'marriage')).toBe(false);
      expect(unions).toEqual([]);
    });

    it('saves an edited marriage on its union, keeping its date, place and source', async () => {
      const user = userEvent.setup();
      const onSave = editorFor('I3');
      const row = typeSelects()
        .find((s) => s.value === 'marriage')!
        .closest('.ev-draft') as HTMLElement;
      await user.type(row.querySelector('input[placeholder="Notes"]')!, 'À la mairie');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const unions = onSave.mock.calls[0]![1];
      expect(unions.map((u) => u.familyId)).toEqual(['F2']);
      const marr = unions[0]!.patch.events!.find((e) => e.type === 'marriage')!;
      // The imported note is in the field already; what is typed carries on from it.
      expect(marr.notes).toEqual(["Second mariage d'Henri, veuf d'Yvonne KERGOAT.À la mairie"]);
      expect(marr.date).toEqual(tree.families.F2!.events.find((e) => e.type === 'marriage')!.date);
      expect(marr.place).toEqual(tree.families.F2!.events.find((e) => e.type === 'marriage')!.place);
      expect(marr.extra).toEqual(tree.families.F2!.events.find((e) => e.type === 'marriage')!.extra);
    });

    it('removes a marriage from its union when its row is deleted', async () => {
      const user = userEvent.setup();
      const onSave = editorFor('I3');
      const row = typeSelects()
        .find((s) => s.value === 'marriage')!
        .closest('.ev-draft') as HTMLElement;
      await user.click(within(row).getByRole('button', { name: 'Supprimer' }));
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const unions = onSave.mock.calls[0]![1];
      expect(unions[0]!.familyId).toBe('F2');
      expect(unions[0]!.patch.events!.some((e) => e.type === 'marriage')).toBe(false);
    });

    it('offers « Mariage » when the person has a union, and files it under the partner picked', async () => {
      const user = userEvent.setup();
      const onSave = editorFor('I2'); // Henri LENOIR: two unions, F1 and F2
      await user.click(screen.getByRole('button', { name: /Événement/ }));
      const added = typeSelects().at(-1)!;
      expect([...added.options].map((o) => o.value)).toContain('marriage');
      await user.selectOptions(added, 'marriage');
      const row = added.closest('.ev-draft') as HTMLElement;
      const partner = within(row).getByLabelText('Marié·e avec') as HTMLSelectElement;
      await user.selectOptions(partner, 'F1');
      await user.type(within(row).getByPlaceholderText('Notes'), 'Seconde cérémonie');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const [patch, unions] = onSave.mock.calls[0]!;
      expect(patch.events?.some((e) => e.type === 'marriage')).toBe(false);
      const f1 = unions.find((u) => u.familyId === 'F1')!;
      expect(f1.patch.events!.filter((e) => e.type === 'marriage').map((e) => e.notes)).toContainEqual(['Seconde cérémonie']);
    });

    it('does not offer « Mariage » to someone with no union', () => {
      const lone = Object.values(tree.individuals).find((i) => i.partnerIn.length === 0)!;
      editorFor(lone.id);
      expect([...typeSelects()[0]!.options].map((o) => o.value)).not.toContain('marriage');
    });
  });

  it('cancels on Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <PersonEditor
        tree={tree}
        person={tree.individuals.I1!}
        lang="fr"
        onSave={() => undefined}
        onCancel={onCancel}
        onDelete={() => undefined}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('is drawn at the root of the page, outside the panel that opened it', () => {
    // The panel clips its content; Safari applied that clip to the editor's scrolling body and left the
    // form blank. Nothing of the dialog may sit inside the element it is opened from.
    const panel = document.createElement('aside');
    panel.style.overflow = 'hidden';
    document.body.appendChild(panel);
    const person = tree.individuals.I2!;
    render(
      <PersonEditor tree={tree} person={person} lang="fr" onSave={() => undefined} onCancel={() => undefined} onDelete={() => undefined} />,
      {
        container: panel,
      },
    );
    const dialog = screen.getByRole('dialog', { name: 'Modifier la fiche' });
    expect(panel.contains(dialog)).toBe(false);
    expect(dialog.closest('.editor-backdrop')!.parentElement).toBe(document.body);
    panel.remove();
  });
});
