/** Full-page sign-in. Nothing else is reachable before this. */

import { useState } from 'react';
import { t, type Lang } from '@/i18n';
import { api, ApiError } from '@/sync/api';
import type { Auth } from '@/app/state/useAuth';

interface Props {
  lang: Lang;
  auth: Auth;
  pendingInvite: { accountName: string; email: string | null } | null;
  toast(msg: string): void;
}

export function Login({ lang, auth, pendingInvite, toast }: Props) {
  // The address: what was kept for the session, else the one an invitation was sent to (the shell remounts
  // this form when that address arrives, so the initialiser sees it).
  const [email, setEmail] = useState(() => {
    try {
      return sessionStorage.getItem('ramure.signinEmail') || pendingInvite?.email || '';
    } catch {
      return pendingInvite?.email ?? '';
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

  const [asking, setAsking] = useState(false);
  const [reqEmail, setReqEmail] = useState('');
  const [reqMessage, setReqMessage] = useState('');
  const sendRequest = async () => {
    setBusy(true);
    try {
      await api.requestAccess(reqEmail.trim(), reqMessage);
      toast(t(lang, 'requestSent'));
      setAsking(false);
      setReqMessage('');
    } catch {
      toast(t(lang, 'syncError'));
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
        <h2 className="signin-title">{t(lang, 'signinTitle')}</h2>
        <p className="muted small signin-sub">{t(lang, 'signinSub')}</p>
        {pendingInvite && (
          <div className="callout">
            {t(lang, 'inviteFor')} <strong>{pendingInvite.accountName}</strong>. {t(lang, 'inviteSignIn')}
          </div>
        )}
        {auth.unavailable ? (
          <p className="muted">{t(lang, 'apiUnavailable')}</p>
        ) : (
          <form
            className="signin"
            onSubmit={(e) => {
              e.preventDefault();
              // Enter does whichever step the form is on, which is what its primary button does too.
              if (sent) void submitCode(e);
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
            {/* The step's primary action is the form's submit button, so Enter in either field does what
                clicking it does. The other button carries its own click and must not submit. */}
            <button
              type={sent ? 'button' : 'submit'}
              className={`btn ${sent ? '' : 'primary'}`}
              disabled={busy || !email.includes('@')}
              onClick={sent ? (e) => void request(e) : undefined}
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
              type={sent ? 'submit' : 'button'}
              className={`btn ${sent ? 'primary' : ''}`}
              disabled={busy || !canCode}
              onClick={sent ? undefined : (e) => void submitCode(e)}
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
        {!auth.unavailable && (
          <div className="access-request">
            {asking ? (
              <form
                className="signin"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendRequest();
                }}
              >
                <h3 className="signin-title small">{t(lang, 'requestAccess')}</h3>
                <p className="muted small">{t(lang, 'requestAccessHint')}</p>
                <label>
                  {t(lang, 'email')}
                  <input type="email" required autoComplete="email" value={reqEmail} onChange={(e) => setReqEmail(e.target.value)} />
                </label>
                <label>
                  {t(lang, 'requestMessage')}
                  <textarea rows={2} maxLength={600} value={reqMessage} onChange={(e) => setReqMessage(e.target.value)} />
                </label>
                <button className="btn primary" disabled={busy || !reqEmail.includes('@')}>
                  {t(lang, 'sendRequest')}
                </button>
                <button type="button" className="btn subtle" onClick={() => setAsking(false)}>
                  {t(lang, 'cancel')}
                </button>
              </form>
            ) : (
              <p className="muted small access-line">
                {t(lang, 'noAccessYet')}{' '}
                <button type="button" className="link" onClick={() => setAsking(true)}>
                  {t(lang, 'requestAccess')}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
