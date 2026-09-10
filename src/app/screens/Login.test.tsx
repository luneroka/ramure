// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';
import type { Auth } from '@/app/state/useAuth';

function fakeAuth(): Auth {
  return {
    user: null,
    loading: false,
    unavailable: false,
    requestLink: vi.fn(async () => ({ code: '123456' })),
    verifyCode: vi.fn(async () => {}),
    verifyLink: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  };
}

describe('Login', () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it('lets an invited address ask for a code and sign in with it', async () => {
    const auth = fakeAuth();
    render(<Login lang="fr" auth={auth} pendingInvite={{ accountName: 'Famille Vernay', email: 'cousin@example.org' }} toast={() => {}} />);
    const address = screen.getByLabelText('Adresse courriel') as HTMLInputElement;
    expect(address.value).toBe('cousin@example.org');
    const send = screen.getByRole('button', { name: /Recevoir un lien/ });
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(auth.requestLink).toHaveBeenCalledWith('cousin@example.org');
    const connect = screen.getByRole('button', { name: 'Se connecter' });
    expect(connect).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Code à six chiffres reçu par courriel'), '123456');
    expect(connect).toBeEnabled();
    await userEvent.click(connect);
    expect(auth.verifyCode).toHaveBeenCalledWith('cousin@example.org', '123456');
  });

  it('signs in from the keyboard alone: Enter asks for the code, then Enter sends it', async () => {
    const auth = fakeAuth();
    render(<Login lang="fr" auth={auth} pendingInvite={null} toast={() => {}} />);
    await userEvent.type(screen.getByLabelText('Adresse courriel'), 'me@example.org{Enter}');
    expect(auth.requestLink).toHaveBeenCalledWith('me@example.org');
    await userEvent.type(screen.getByLabelText('Code à six chiffres reçu par courriel'), '123456{Enter}');
    expect(auth.verifyCode).toHaveBeenCalledWith('me@example.org', '123456');
  });

  it('starts disabled without an address and enables once one is typed', async () => {
    render(<Login lang="fr" auth={fakeAuth()} pendingInvite={null} toast={() => {}} />);
    const send = screen.getByRole('button', { name: /Recevoir un lien/ });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Adresse courriel'), 'me@example.org');
    expect(send).toBeEnabled();
  });
});
