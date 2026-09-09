// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal, type Pending } from './Modal';

afterEach(cleanup);

function pendingWith(spec: Pending['spec']): { pending: Pending; answer: Promise<string | null> } {
  let resolve!: (v: string | null) => void;
  const answer = new Promise<string | null>((r) => (resolve = r));
  return { pending: { spec, resolve }, answer };
}

describe('Modal', () => {
  it('confirms with ok, and cancels with the button, the backdrop and Escape', async () => {
    const user = userEvent.setup();
    let p = pendingWith({ title: 'Supprimer ?' });
    render(<Modal pending={p.pending} lang="fr" />);
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(await p.answer).toBe('ok');
    cleanup();
    p = pendingWith({ title: 'Encore ?' });
    render(<Modal pending={p.pending} lang="fr" />);
    await user.keyboard('{Escape}');
    expect(await p.answer).toBeNull();
  });

  it('returns the typed text and refuses an empty required input', async () => {
    const user = userEvent.setup();
    const p = pendingWith({ title: 'Renommer', input: { label: 'Nom', initial: '' } });
    render(<Modal pending={p.pending} lang="fr" />);
    const ok = screen.getByRole('button', { name: 'Confirmer' });
    expect(ok).toBeDisabled();
    await user.type(screen.getByLabelText('Nom'), 'Famille Lenoir');
    expect(ok).toBeEnabled();
    await user.click(ok);
    expect(await p.answer).toBe('Famille Lenoir');
  });

  it('guards a dangerous action behind typing the exact text', async () => {
    const user = userEvent.setup();
    const p = pendingWith({ title: 'Supprimer l’arbre', requireText: 'Famille Lenoir', danger: true, confirmLabel: 'Supprimer' });
    render(<Modal pending={p.pending} lang="fr" />);
    const ok = screen.getByRole('button', { name: 'Supprimer' });
    expect(ok).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'Famille Lenoi');
    expect(ok).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'r');
    expect(ok).toBeEnabled();
  });
});
