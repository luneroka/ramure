// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error('kaboom');
  return <p>fine</p>;
}

function Host() {
  const [armed, setArmed] = useState(true);
  return (
    <ErrorBoundary>
      <button onClick={() => setArmed(false)}>disarm</button>
      <Bomb armed={armed} />
    </ErrorBoundary>
  );
}

describe('ErrorBoundary', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the crash surface with the message and recovers on retry', async () => {
    render(<Host />);
    expect(screen.getByRole('alert')).toHaveTextContent("Quelque chose s'est cassé");
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    // The retry re-renders the children; the bomb is still armed so it crashes again, proving the reset happened.
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
