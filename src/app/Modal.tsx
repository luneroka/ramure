/**
 * One modal for every question the app asks: confirmations, dangerous
 * actions guarded by typing a name, and short text prompts. Opened through
 * `ask()` which resolves with the answer, so callers read like a sentence.
 */

import { useEffect, useRef, useState } from 'react';
import { t, type Lang } from '../i18n';

export interface AskSpec {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Ask for a text value; resolves with the string. */
  input?: { label: string; initial?: string; placeholder?: string };
  /** Dangerous action: the user must type this exact text to enable the button. */
  requireText?: string;
}

export interface Pending {
  spec: AskSpec;
  resolve(value: string | null): void;
}

export function Modal({ pending, lang }: { pending: Pending | null; lang: Lang }) {
  const [value, setValue] = useState('');
  const [typed, setTyped] = useState('');
  const first = useRef<HTMLInputElement | HTMLButtonElement>(null);
  const key = pending ? pending.spec.title + (pending.spec.input?.initial ?? '') : '';
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setValue(pending?.spec.input?.initial ?? '');
    setTyped('');
  }
  useEffect(() => {
    if (pending) first.current?.focus();
  }, [pending]);
  if (!pending) return null;
  const { spec, resolve } = pending;
  const guardOk = !spec.requireText || typed.trim() === spec.requireText.trim();
  const ok = () => resolve(spec.input ? value : 'ok');
  return (
    <div className="dialog-backdrop" onClick={() => resolve(null)}>
      <form
        className="dialog modal"
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (guardOk) ok();
        }}
      >
        <h2 className="modal-title">{spec.title}</h2>
        {spec.message && <p className="modal-message">{spec.message}</p>}
        {spec.input && (
          <label className="field">
            {spec.input.label}
            <input
              ref={first as React.RefObject<HTMLInputElement>}
              value={value}
              placeholder={spec.input.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}
        {spec.requireText && (
          <label className="field">
            {t(lang, 'typeToConfirm')} <strong>{spec.requireText}</strong>
            <input
              ref={first as React.RefObject<HTMLInputElement>}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        <div className="row modal-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => resolve(null)}>
            {spec.cancelLabel ?? t(lang, 'cancel')}
          </button>
          <button
            ref={!spec.input && !spec.requireText ? (first as React.RefObject<HTMLButtonElement>) : undefined}
            type="submit"
            className={`btn ${spec.danger ? 'danger' : 'primary'}`}
            disabled={!guardOk || (!!spec.input && !value.trim())}
          >
            {spec.confirmLabel ?? t(lang, 'confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}
