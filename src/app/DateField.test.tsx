// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatGedcomDate, type GDate } from '../gedcom/dates';
import { DateField } from './fields/DateField';

afterEach(cleanup);

describe('DateField', () => {
  it('turns the guided triplet into a GEDCOM date', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(d: GDate | undefined) => void>();
    render(<DateField lang="fr" value={undefined} onChange={onChange} />);
    await user.type(screen.getByLabelText('Jour'), '12');
    await user.selectOptions(screen.getByLabelText('Mois'), '3');
    await user.type(screen.getByLabelText('Année'), '1952');
    const last = onChange.mock.calls.at(-1)![0]!;
    expect(formatGedcomDate(last)).toBe('12 MAR 1952');
    await user.selectOptions(screen.getByLabelText('Précision'), 'about');
    expect(formatGedcomDate(onChange.mock.calls.at(-1)![0]!)).toBe('ABT 12 MAR 1952');
  });

  it('falls back to free text and keeps unreadable phrases as such', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(d: GDate | undefined) => void>();
    render(<DateField lang="fr" value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Saisie libre' }));
    await user.type(screen.getByRole('textbox'), 'vers 1850');
    expect(formatGedcomDate(onChange.mock.calls.at(-1)![0]!)).toBe('ABT 1850');
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'un jour de pluie');
    expect(onChange.mock.calls.at(-1)![0]!.kind).toBe('phrase');
  });
});
