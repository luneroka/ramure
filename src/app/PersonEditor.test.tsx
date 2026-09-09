// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import type { PersonPatch } from '../tree/edit';

vi.mock('../store', () => ({
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
});
