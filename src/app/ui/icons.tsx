/** The few inline icons of the chrome, in one place. */

import type { ThemeChoice } from '../../i18n';

const stroke = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === 'light')
    return (
      <svg {...stroke}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
    );
  if (choice === 'dark')
    return (
      <svg {...stroke}>
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    );
  return (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg {...stroke} strokeWidth={2}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function RedoIcon() {
  return (
    <svg {...stroke} strokeWidth={2}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}

export function ResourcesIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M4 3.5h5.5a2 2 0 0 1 1.5.7 2 2 0 0 1 1.5-.7H16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3.5a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0-1.5-1.5H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11 5.5v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export type StageMode = 'tree' | 'timeline' | 'map';

export function ModeIcon({ mode }: { mode: StageMode }) {
  if (mode === 'timeline')
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path d="M3 5h9M3 10h14M3 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    );
  if (mode === 'map')
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d="M10 17s-5-4.6-5-8.5a5 5 0 0 1 10 0C15 12.4 10 17 10 17Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="10" cy="8.5" r="1.8" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M10 3v5M4 8h12M4 8v4M16 8v4M10 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
