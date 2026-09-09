/** Full-page sign-in. Nothing else is reachable before this. */

import { useState } from 'react';
import { t, type Lang } from '../i18n';
import { ApiError } from '../sync/api';
import type { Auth } from './useAuth';

interface Props {
  lang: Lang;
  auth: Auth;
  pendingInvite: { accountName: string } | null;
  toast(msg: string): void;
}

export function Login({ lang, auth, pendingInvite, toast }: Props) {
  const [email, setEmail] = useState(() => {
    try {
      return sessionStorage.getItem('ramure.signinEmail') ?? '';
    } catch {
      return '';
    }
  });
  // The code screen survives a reload or a trip to the mail app: the address is kept for the session.
  const [sent, setSentState] = useState<{ email: string; link?: string; code?: string } | null>(() => {
    try {
      const e = sessionStorage.getItem('ramure.signinEmail');
      return e ? { email: e } : null;
    } catch {
      return null;
    }
  });
  const setSent = (v: { email: string; link?: string; code?: string } | null) => {
    setSentState(v);
    try {
      if (v) sessionStorage.setItem('ramure.signinEmail', v.email);
      else sessionStorage.removeItem('ramure.signinEmail');
    } catch {
      /* ignore */
    }
  };
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const request = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await auth.requestLink(email.trim());
      setSent({ email: email.trim(), ...r });
      setCode('');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      toast(t(lang, status === 429 ? 'signinThrottled' : status === 403 ? 'signinInviteOnly' : 'signinFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!sent) return;
    setBusy(true);
    try {
      await auth.verifyCode(sent.email, code);
      setSent(null);
      toast(t(lang, 'signedIn'));
    } catch {
      toast(t(lang, 'codeWrong'));
    } finally {
      setBusy(false);
    }
  };

  const digits = code.replace(/\D/g, '');
  const canCode = email.includes('@') && digits.length === 6;

  return (
    <div className="login">
      <div className="login-card">
        <h1>{t(lang, 'appName')}</h1>
        <p className="tagline">{t(lang, 'tagline')}</p>
        {pendingInvite && (
          <div className="callout">
            {t(lang, 'inviteFor')} <strong>{pendingInvite.accountName}</strong>. {t(lang, 'inviteSignIn')}
          </div>
        )}
        {auth.loading ? (
          <p className="muted">…</p>
        ) : auth.unavailable ? (
          <p className="muted">{t(lang, 'apiUnavailable')}</p>
        ) : (
          <form
            className="signin"
            onSubmit={(e) => {
              e.preventDefault();
              if (canCode) void submitCode(e);
              else void request(e);
            }}
          >
            <label>
              {t(lang, 'email')}
              <input
                type="email"
                required
                autoFocus={!sent}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
              />
            </label>
            {sent ? (
              <p className="signin-note">
                {t(lang, 'linkSent')} <strong>{sent.email}</strong>. {t(lang, 'linkSentHint')}
              </p>
            ) : (
              <p className="muted small">{t(lang, 'signinHint')}</p>
            )}
            <button
              type="button"
              className={`btn ${sent ? '' : 'primary'}`}
              disabled={busy || !email.includes('@')}
              onClick={(e) => void request(e)}
            >
              {t(lang, sent ? 'sendAgain' : 'sendLink')}
            </button>
            <label>
              {t(lang, 'codeLabel')}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                placeholder="483 921"
                value={code}
                autoFocus={!!sent}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ''))}
              />
            </label>
            <button
              type="button"
              className={`btn ${sent ? 'primary' : ''}`}
              disabled={busy || !canCode}
              onClick={(e) => void submitCode(e)}
            >
              {t(lang, 'codeSubmit')}
            </button>
            <p className="muted small">{t(lang, 'codeHint')}</p>
            {sent?.link && (
              <p className="small">
                <a href={sent.link}>{t(lang, 'devLink')}</a>
                {sent.code && <span className="muted"> · code {sent.code}</span>}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
