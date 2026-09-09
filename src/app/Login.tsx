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
  const [email, setEmail] = useState('');
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

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await auth.requestLink(email.trim());
      setSent({ email: email.trim(), ...r });
      setCode('');
    } catch (err) {
      toast(t(lang, err instanceof ApiError && err.status === 429 ? 'signinThrottled' : 'signinFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
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
        ) : sent ? (
          <div className="signin-sent">
            <p>
              {t(lang, 'linkSent')} <strong>{sent.email}</strong>. {t(lang, 'linkSentHint')}
            </p>
            <form className="signin code-form" onSubmit={submitCode}>
              <label>
                {t(lang, 'codeLabel')}
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  placeholder="483 921"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ''))}
                  autoFocus
                />
              </label>
              <button className="btn primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>
                {t(lang, 'codeSubmit')}
              </button>
              <p className="muted small">{t(lang, 'codeHint')}</p>
            </form>
            {sent.link && (
              <p className="small">
                <a href={sent.link}>{t(lang, 'devLink')}</a>
                {sent.code && <span className="muted"> · code {sent.code}</span>}
              </p>
            )}
            <button className="btn subtle" onClick={() => setSent(null)}>
              {t(lang, 'otherEmail')}
            </button>
          </div>
        ) : (
          <form className="signin" onSubmit={request}>
            <label>
              {t(lang, 'email')}
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
              />
            </label>
            <button className="btn primary" disabled={busy || !email.includes('@')}>
              {t(lang, 'sendLink')}
            </button>
            <p className="muted small">{t(lang, 'signinHint')}</p>
            <button type="button" className="link small" disabled={!email.includes('@')} onClick={() => setSent({ email: email.trim() })}>
              {t(lang, 'haveCode')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
