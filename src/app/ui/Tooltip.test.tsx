// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { placeTip, tipFor, Tooltips } from './Tooltip';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('tipFor', () => {
  it('reads data-tip first, an icon-only button’s label next, and says nothing over visible text', () => {
    document.body.innerHTML = `
      <button id="a" data-tip="Annuler (⌘Z)" aria-label="Annuler"><svg><path id="ia" /></svg></button>
      <button id="b" aria-label="Thème"><svg><path id="ib" /></svg></button>
      <button id="c" aria-label="Fermer">Fermer</button>
      <div id="d" data-tip="Glisser pour redimensionner"></div>
      <span id="e">texte</span>`;
    const at = (id: string) => document.getElementById(id);
    expect(tipFor(at('ia'))?.text).toBe('Annuler (⌘Z)');
    expect(tipFor(at('ia'))?.el).toBe(at('a'));
    expect(tipFor(at('ib'))?.text).toBe('Thème');
    expect(tipFor(at('c'))).toBeNull();
    expect(tipFor(at('d'))?.text).toBe('Glisser pour redimensionner');
    expect(tipFor(at('e'))).toBeNull();
    expect(tipFor(null)).toBeNull();
  });
});

describe('placeTip', () => {
  const tip = { width: 100, height: 24 };
  it('sits centred above, and goes below when the top of the screen is too close', () => {
    expect(placeTip({ left: 200, top: 300, width: 40, bottom: 340 }, tip, { width: 1000 })).toEqual({ left: 170, top: 268, below: false });
    expect(placeTip({ left: 200, top: 10, width: 40, bottom: 50 }, tip, { width: 1000 })).toEqual({ left: 170, top: 58, below: true });
  });
  it('never runs past either side of the viewport', () => {
    expect(placeTip({ left: 0, top: 300, width: 20, bottom: 320 }, tip, { width: 400 }).left).toBe(8);
    expect(placeTip({ left: 390, top: 300, width: 10, bottom: 320 }, tip, { width: 400 }).left).toBe(292);
  });
});

describe('Tooltips', () => {
  it('shows a mouse hover after a short wait, hides on leaving, and ignores touch', () => {
    vi.useFakeTimers();
    render(
      <>
        <Tooltips />
        <button data-tip="Rechercher">🔍</button>
        <p>ailleurs</p>
      </>,
    );
    const button = screen.getByRole('button');
    fireEvent.pointerOver(button, { pointerType: 'touch' });
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerOver(button, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole('tooltip').textContent).toBe('Rechercher');
    expect(button.getAttribute('aria-describedby')).toBe('ramure-tip');

    fireEvent.pointerOut(button, { pointerType: 'mouse', relatedTarget: screen.getByText('ailleurs') });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('goes away when the button is pressed', () => {
    vi.useFakeTimers();
    render(
      <>
        <Tooltips />
        <button aria-label="Thème">
          <svg />
        </button>
      </>,
    );
    const button = screen.getByRole('button');
    fireEvent.pointerOver(button, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole('tooltip').textContent).toBe('Thème');
    // The label already names the button: the hint does not describe it a second time.
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
