// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGedcom } from '@/gedcom/parse';
import type { Citation } from '@/gedcom/model';
import { sourceRows, type SourceAt } from '@/app/lib/lifeEvents';

vi.mock('@/store', () => ({ mediaStore: { get: async () => undefined, put: async () => undefined, delete: async () => undefined } }));
import { SourceList } from './Documents';

afterEach(cleanup);

const long = 'https://www.archives.finistere.fr/ark:/12345/vta5a1b2c3d4e5f6a7b8c9/daogrp/0/3E210_12';
const tree = parseGedcom(
  [
    '0 HEAD',
    '0 @I1@ INDI',
    '1 NAME Rosalie /Guérin/',
    '1 BIRT',
    '2 SOUR @S1@',
    '1 SOUR Acte de naissance',
    `2 CONT ${long}`,
    '1 SOUR voir javascript:alert(1)',
    '0 @S1@ SOUR',
    '1 TITL Registre paroissial',
    '0 TRLR',
  ].join('\n'),
);
const person = tree.individuals.I1!;

function setup(readOnly = false) {
  const onChange = vi.fn<(at: SourceAt | null, next: Citation | null) => void>();
  render(<SourceList tree={tree} lang="fr" rows={sourceRows(tree, person, 'fr')} readOnly={readOnly} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

describe('SourceList', () => {
  it('shows a long link short, with the whole address kept on the link, and never links an unsafe scheme', () => {
    setup();
    const link = screen.getByRole('link', { name: /archives\.finistere\.fr/ });
    expect(link.textContent).toBe('archives.finistere.fr/…/3E210_12 ↗');
    expect(link.getAttribute('href')).toBe(long);
    expect(link.getAttribute('title')).toBe(long);
    expect(screen.getByText('voir javascript:alert(1)')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('adds a source from a link alone', async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole('button', { name: '+ Ajouter une source' }));
    await user.type(screen.getByLabelText('Lien (facultatif)'), 'example.org/acte');
    await user.click(screen.getByRole('button', { name: 'Ajouter une source' }));
    expect(onChange).toHaveBeenCalledWith(null, { flat: 'https://example.org/acte', notes: [] });
  });

  it('edits a written source with its text and link filled in', async () => {
    const { onChange, user } = setup();
    await user.click(screen.getAllByRole('button', { name: 'Modifier' })[0]!);
    expect((screen.getByLabelText('Source') as HTMLInputElement).value).toBe('Acte de naissance');
    expect((screen.getByLabelText('Lien (facultatif)') as HTMLInputElement).value).toBe(long);
    await user.type(screen.getByLabelText('Source'), ' n° 4');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onChange).toHaveBeenCalledWith({ on: 'person', index: 0 }, { flat: `Acte de naissance n° 4\n${long}`, notes: [] });
  });

  it('removes any source, but edits only the written ones', async () => {
    const { onChange, user } = setup();
    expect(screen.getAllByRole('button', { name: 'Supprimer' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Supprimer' })[2]!);
    expect(onChange).toHaveBeenCalledWith({ on: 'event', event: 0, index: 0 }, null);
  });

  it('only shows them to a viewer', () => {
    setup(true);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Registre paroissial')).toBeTruthy();
  });
});
