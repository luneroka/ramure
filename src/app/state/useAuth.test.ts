// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The three states of a session, and what the shell is allowed to conclude from
 * each. "Not signed in" and "not asked yet" look the same to a component that
 * only reads `user`, which is how a reload came to flash the sign-in card; these
 * tests pin the difference, and the grace that keeps a stalled network from
 * holding the app on the session screen.
 */
const mocked = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('@/sync/api', () => ({ api: { me: mocked.me } }));
import { useAuth } from './useAuth';

const HER = { id: 'U1', email: 'elle@example.org', name: 'Elle' };
const ME_KEY = 'ramure.me';

afterEach(() => {
  vi.useRealTimers();
  mocked.me.mockReset();
  localStorage.clear();
});

describe('useAuth', () => {
  it('restores before it answers, then reports the person and remembers them', async () => {
    mocked.me.mockResolvedValue({ user: HER });
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('restoring');
    expect(result.current.user).toBe(null);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual(HER);
    expect(JSON.parse(localStorage.getItem(ME_KEY)!)).toEqual(HER);
  });

  it('only says nobody is signed in once the answer says so', async () => {
    localStorage.setItem(ME_KEY, JSON.stringify(HER));
    mocked.me.mockResolvedValue({ user: null });
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('restoring');
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(localStorage.getItem(ME_KEY)).toBe(null);
  });

  it('opens the device copy when the answer is slow and the device knows whose it is', () => {
    vi.useFakeTimers();
    localStorage.setItem(ME_KEY, JSON.stringify(HER));
    mocked.me.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('restoring');
    act(() => void vi.advanceTimersByTime(2600));
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(HER);
  });

  it('keeps waiting when the answer is slow and there is nobody to fall back to', () => {
    vi.useFakeTimers();
    mocked.me.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAuth());
    act(() => void vi.advanceTimersByTime(2600));
    expect(result.current.status).toBe('restoring');
  });
});
