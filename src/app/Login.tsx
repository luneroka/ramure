/** Full-page sign-in. Nothing else is reachable before this. */

import { useState } from 'react';
import { t, type Lang } from '../i18n';
import type { Auth } from './useAuth';

interface Props {
  lang: Lang;
  auth: Auth;
  pendingInvite: { accountName: string } | null;
  toast(msg: string): void;
}

export function Login({ lang, auth, pendingInvite, toast }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ email: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const link = await auth.requestLink(email.trim());
      setSent({ email: email.trim(), link });
    } catch {
      toast(t(lang, 'signinFailed'));
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
            {sent.link && (
              <p className="small">
                <a href={sent.link}>{t(lang, 'devLink')}</a>
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
          </form>
        )}
      </div>
    </div>
  );
}
