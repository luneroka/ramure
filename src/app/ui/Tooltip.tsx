/**
 * The app's own tooltip, one for the whole page.
 *
 * The browser's `title` bubble is slow, unstyled, ignores the theme and never
 * appears for keyboard focus, so buttons carry their hint as `data-tip`
 * instead and this component draws it. An icon-only button needs no
 * `data-tip`: its `aria-label` is already the words a sighted user is missing,
 * so it is shown as is. A button with visible text and no `data-tip` gets
 * nothing — repeating its label would only be noise.
 *
 * One delegated listener on the document rather than a wrapper per button:
 * there are dozens of buttons and none of them has to know about this. Touch
 * is left out on purpose — a press is a click, and a bubble that appears under
 * the finger and stays would only hide what was tapped.
 *
 * What is drawn rather than built — the round handles on a card on the canvas
 * — has no element to hover, so its owner calls `showTip` with the rectangle it
 * drew and `hideTip` when the pointer leaves it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const SHOW_DELAY = 350;
const GAP = 8;
const MARGIN = 8;
const TIP_ID = 'ramure-tip';
const TIP_EVENT = 'ramure:tip';

type Anchor = { left: number; top: number; width: number; bottom: number };
type Shown = { text: string; anchor: () => Anchor; el?: HTMLElement };

/** A hint for something drawn rather than built, at its rectangle in viewport pixels. Mouse only, like the rest. */
export function showTip(anchor: Anchor, text: string): void {
  document.dispatchEvent(new CustomEvent<{ anchor: Anchor; text: string } | null>(TIP_EVENT, { detail: { anchor, text } }));
}

export function hideTip(): void {
  document.dispatchEvent(new CustomEvent(TIP_EVENT, { detail: null }));
}

/** The element a hint belongs to, and its words, or null when there is nothing to say. */
export function tipFor(target: EventTarget | null): { el: HTMLElement; text: string } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-tip], button, [role="button"]');
  if (!el) return null;
  const own = el.dataset.tip?.trim();
  if (own) return { el, text: own };
  if (el.textContent?.trim()) return null;
  const label = el.getAttribute('aria-label')?.trim();
  return label ? { el, text: label } : null;
}

/** Above the element when there is room, below otherwise, and never past the viewport's sides. */
export function placeTip(
  anchor: { left: number; top: number; width: number; bottom: number },
  tip: { width: number; height: number },
  viewport: { width: number },
): { left: number; top: number; below: boolean } {
  const below = anchor.top - GAP - tip.height < MARGIN;
  const top = below ? anchor.bottom + GAP : anchor.top - GAP - tip.height;
  const centred = anchor.left + anchor.width / 2 - tip.width / 2;
  const left = Math.max(MARGIN, Math.min(centred, viewport.width - MARGIN - tip.width));
  return { left, top, below };
}

export function Tooltips() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      current?.removeAttribute('aria-describedby');
      current = null;
      setShown(null);
    };
    const show = (found: { el: HTMLElement; text: string }, delay: number) => {
      clearTimeout(timer);
      current = found.el;
      timer = setTimeout(() => {
        // An element with an accessible name of its own only gains a description when the hint adds to it.
        if (found.el.getAttribute('aria-label') !== found.text) found.el.setAttribute('aria-describedby', TIP_ID);
        setShown({ text: found.text, el: found.el, anchor: () => found.el.getBoundingClientRect() });
      }, delay);
    };
    const drawn = (e: Event) => {
      const detail = (e as CustomEvent<{ anchor: Anchor; text: string } | null>).detail;
      hide();
      if (!detail) return;
      timer = setTimeout(() => setShown({ text: detail.text, anchor: () => detail.anchor }), SHOW_DELAY);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const found = tipFor(e.target);
      if (found?.el === current) return;
      if (!found) return hide();
      hide();
      show(found, SHOW_DELAY);
    };
    const out = (e: PointerEvent) => {
      if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) hide();
    };
    const focus = (e: FocusEvent) => {
      const found = tipFor(e.target);
      if (found && found.el.matches(':focus-visible')) show(found, 0);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener(TIP_EVENT, drawn);
    return () => {
      hide();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      document.removeEventListener(TIP_EVENT, drawn);
    };
  }, []);

  // A button that goes away under the pointer (a menu closing, a screen changing) takes its hint with it.
  useEffect(() => {
    const el = shown?.el;
    if (!el) return;
    const check = setInterval(() => {
      if (!el.isConnected) setShown(null);
    }, 250);
    return () => clearInterval(check);
  }, [shown]);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!shown || !tip) return setPos(null);
    setPos(placeTip(shown.anchor(), tip.getBoundingClientRect(), { width: window.innerWidth }));
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      ref={tipRef}
      id={TIP_ID}
      role="tooltip"
      className={'tip' + (pos?.below ? ' below' : '')}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
    >
      {shown.text}
    </div>
  );
}
