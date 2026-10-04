// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayName } from '@/gedcom/model';
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

  describe('union events, which GEDCOM keeps on the union', () => {
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

    it('adds a divorce in « Unions », filed under the partner picked', async () => {
      const user = userEvent.setup();
      const onSave = editorFor('I2'); // Henri LENOIR: two unions, F1 and F2, both with a marriage
      const unions = screen.getByText('Unions').closest('details')!;
      await user.click(within(unions).getByRole('button', { name: /Événement/ }));
      const added = within(unions).getAllByLabelText('Type').at(-1) as HTMLSelectElement;
      // The first union already has its marriage: the new row offers a divorce, among union events only.
      expect(added.value).toBe('divorce');
      const unionGroup = [...added.querySelectorAll('optgroup')].find((g) => g.label === 'Unions')!;
      expect([...unionGroup.querySelectorAll('option')].map((o) => o.value)).toEqual([
        'engagement',
        'marriage',
        'separation',
        'divorce',
        'annulment',
      ]);
      const row = added.closest('.ev-draft') as HTMLElement;
      await user.selectOptions(within(row).getByLabelText('Union avec'), 'F2');
      await user.type(within(row).getByPlaceholderText('Notes'), 'Jugement du tribunal');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const [patch, changed] = onSave.mock.calls[0]!;
      expect(patch.events?.some((e) => e.type === 'divorce')).toBe(false);
      expect(changed.map((u) => u.familyId)).toEqual(['F2']);
      const events = changed[0]!.patch.events!;
      expect(events.filter((e) => e.type === 'marriage')).toHaveLength(1);
      expect(events.find((e) => e.type === 'divorce')?.notes).toEqual(['Jugement du tribunal']);
    });

    it('takes a union event from « + Événement » under « Parcours », and saves it on the union', async () => {
      const user = userEvent.setup();
      const onSave = editorFor('I3'); // Jeanne MARCHAL: one union, F2
      const life = screen.getByText('Parcours').closest('details')!;
      await user.click(within(life).getByRole('button', { name: /Événement/ }));
      const added = within(life).getAllByLabelText('Type').at(-1) as HTMLSelectElement;
      await user.selectOptions(added, 'divorce');
      const row = added.closest('.ev-draft') as HTMLElement;
      // It stays where it was added, now naming the partner it belongs with.
      expect(life.contains(row)).toBe(true);
      expect(within(row).getByText(/avec Henri/)).toBeTruthy();
      await user.type(within(row).getByPlaceholderText('Notes'), 'Séparés depuis 1960');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const [patch, changed] = onSave.mock.calls[0]!;
      expect(patch.events?.some((e) => e.type === 'divorce')).toBe(false);
      expect(changed[0]!.familyId).toBe('F2');
      expect(changed[0]!.patch.events!.find((e) => e.type === 'divorce')?.notes).toEqual(['Séparés depuis 1960']);
    });

    it('marks a row added with « + Événement » apart from the rows the record had', async () => {
      const user = userEvent.setup();
      editorFor('I3');
      const life = screen.getByText('Parcours').closest('details')!;
      const before = life.querySelectorAll('.ev-draft').length;
      expect(life.querySelectorAll('.ev-draft.fresh')).toHaveLength(0);
      await user.click(within(life).getByRole('button', { name: /Événement/ }));
      const fresh = life.querySelectorAll('.ev-draft.fresh');
      expect(life.querySelectorAll('.ev-draft')).toHaveLength(before + 1);
      expect(fresh).toHaveLength(1);
      expect(within(fresh[0] as HTMLElement).getByText('Nouvel événement')).toBeTruthy();
    });

    it('lists an imported divorce in « Unions »', () => {
      // Marguerite LENOIR's own divorce, kept on her union in the fixture.
      editorFor('I1');
      const unions = screen.getByText('Unions').closest('details')!;
      const types = within(unions)
        .getAllByLabelText('Type')
        .map((s) => (s as HTMLSelectElement).value);
      expect(types).toContain('divorce');
    });

    const lone = () => Object.values(tree.individuals).filter((i) => i.partnerIn.length === 0);

    it('makes a union with someone in the tree, asked for when a union event is picked with no partner yet', async () => {
      const user = userEvent.setup();
      const [person, other] = lone();
      const onSave = editorFor(person!.id);
      const life = screen.getByText('Parcours').closest('details')!;
      await user.click(within(life).getByRole('button', { name: /Événement/ }));
      const added = within(life).getAllByLabelText('Type').at(-1) as HTMLSelectElement;
      await user.selectOptions(added, 'marriage');
      const row = added.closest('.ev-draft') as HTMLElement;
      // Nobody to be married to yet: the row asks who.
      expect(within(row).getByText('Union avec…')).toBeTruthy();
      const name = displayName(other!);
      await user.type(within(row).getByPlaceholderText('Choisir une personne…'), name);
      await user.click(within(row).getByRole('button', { name: new RegExp(`^${name}`) }));
      expect(within(row).getByLabelText('Union avec')).toBeTruthy();
      await user.type(within(row).getAllByPlaceholderText('Notes').at(-1)!, 'Mariage civil');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const [patch, unions] = onSave.mock.calls[0]!;
      expect(patch.events?.some((e) => e.type === 'marriage')).toBe(false);
      expect(unions).toHaveLength(1);
      expect(unions[0]!.create).toEqual({ partnerId: other!.id });
      expect(unions[0]!.patch.unionType).toBe('married');
      expect(unions[0]!.patch.events!.map((e) => [e.type, e.notes])).toEqual([['marriage', ['Mariage civil']]]);
    });

    it('makes a union with a new person named in the editor, from « + Union »', async () => {
      const user = userEvent.setup();
      const onSave = editorFor(lone()[0]!.id);
      const unionsSection = screen.getByText('Unions').closest('details')!;
      await user.click(within(unionsSection).getByRole('button', { name: /Union/ }));
      const chooser = unionsSection.querySelector('.union-chooser') as HTMLElement;
      await user.type(within(chooser).getByLabelText('Prénom(s)'), 'Rosa');
      await user.type(within(chooser).getByLabelText('Nom'), 'LO BUE');
      await user.click(within(chooser).getByRole('button', { name: 'Ajouter' }));
      // A marriage row joins the new union straight away.
      const row = unionsSection.querySelector('.ev-draft.fresh') as HTMLElement;
      expect((within(row).getByLabelText('Union avec') as HTMLSelectElement).selectedOptions[0]!.textContent).toContain('Rosa LO BUE');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const unions = onSave.mock.calls[0]![1];
      expect(unions).toHaveLength(1);
      expect(unions[0]!.create).toEqual({ partner: { given: 'Rosa', surname: 'LO BUE' } });
    });

    it('will not save a union event filled in with nobody chosen, and says so', async () => {
      const user = userEvent.setup();
      const onSave = editorFor(lone()[0]!.id);
      const life = screen.getByText('Parcours').closest('details')!;
      await user.click(within(life).getByRole('button', { name: /Événement/ }));
      const added = within(life).getAllByLabelText('Type').at(-1) as HTMLSelectElement;
      await user.selectOptions(added, 'divorce');
      const row = added.closest('.ev-draft') as HTMLElement;
      await user.click(within(row).getByRole('button', { name: 'Annuler' }));
      await user.type(within(row).getByPlaceholderText('Notes'), 'Tribunal de Palerme');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      expect(onSave).not.toHaveBeenCalled();
      expect(within(row).getByText('Choisissez avec qui avant d’enregistrer.')).toBeTruthy();
    });
  });

  it('opens on « Identité », which never folds, and « Parcours »; the other sections folded with their count', () => {
    render(
      <PersonEditor
        tree={tree}
        person={tree.individuals.I3!}
        lang="fr"
        onSave={() => undefined}
        onCancel={() => undefined}
        onDelete={() => undefined}
      />,
    );
    const open = (title: string) => (screen.getByText(title).closest('details') as HTMLDetailsElement).open;
    expect(open('Parcours')).toBe(true);
    // « Identité » does not fold at all: its fields are always there.
    expect(screen.getByText('Identité').closest('details')).toBeNull();
    expect(screen.getByLabelText('Prénom(s)')).toBeTruthy();
    expect(open('Unions')).toBe(false);
    expect(open('Suivi')).toBe(false);
    expect(within(screen.getByText('Unions').closest('summary')!).getByText('1')).toBeTruthy();
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
