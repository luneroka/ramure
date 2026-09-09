/**
 * What every dialog owes the keyboard: focus moves in when it opens, Tab
 * stays inside, Escape closes, and focus goes back where it was.
 */

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  // The close callback is read through a ref so a new arrow function per render does not re-run the effect (and move focus).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    const before = document.activeElement as HTMLElement | null;
    const focusables = () => (root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    // Something inside may already hold focus (an autoFocus field): leave it there.
    if (!root || !root.contains(document.activeElement)) (initialFocus?.current ?? focusables()[0] ?? root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0]!,
        last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, initialFocus]);
  return ref;
}
