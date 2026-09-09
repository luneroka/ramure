/**
 * Application administration, for the operator only: who is invited, who is
 * in, who asked to leave, and what each family account weighs.
 */

import { useEffect, useState } from 'react';
import { t, type Lang } from '../i18n';
import { localeOf } from './format';
import { formatBytes } from '../media/documents';
import { api, ApiError, type AdminOverview } from '../sync/api';
import type { AskSpec } from './Modal';

interface Props {
  lang: Lang;
  onBack(): void;
  toast(msg: string): void;
  ask(spec: AskSpec): Promise<string | null>;
}

export function Admin({ lang, onBack, toast, ask }: Props) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const locale = localeOf(lang);
  const day = (ms: number) => new Date(ms).toLocaleDateString(locale);

  useEffect(() => {
    let alive = true;
    api
      .adminOverview()
      .then((r) => alive && setData(r))
      .catch(() => alive && toast(t(lang, 'syncError')));
    return () => {
      alive = false;
    };
  }, [refresh, lang, toast]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.adminInvite(email.trim());
      toast(`${t(lang, 'inviteSentTo')} ${email.trim()}`);
      setEmail('');
      setRefresh((n) => n + 1);
    } catch (err) {
      toast(t(lang, err instanceof ApiError && err.status === 409 ? 'alreadyUser' : 'syncError'));
    } finally {
      setBusy(false);
    }
  };

  const approve = async (userId: string, who: string) => {
    const answer = await ask({
      title: t(lang, 'approveDeletion'),
      message: `${t(lang, 'approveDeletionMessage')} ${who}`,
      confirmLabel: t(lang, 'delete'),
      danger: true,
      requireText: who,
    });
    if (!answer) return;
    try {
      await api.adminApproveDeletion(userId);
      toast(t(lang, 'userDeleted'));
      setRefresh((n) => n + 1);
    } catch {
      toast(t(lang, 'syncError'));
    }
  };

  const pending = data?.users.filter((u) => u.deletion_requested_at) ?? [];

  return (
    <div className="settings admin">
      <div className="settings-head">
        <button className="btn subtle" onClick={onBack}>
          ← {t(lang, 'library')}
        </button>
        <h1>{t(lang, 'administration')}</h1>
      </div>
      <p className="muted">{t(lang, 'adminHint')}</p>

      <section className="home-card" id="admin-invites">
        <h2>{t(lang, 'appInvites')}</h2>
        <form className="row" onSubmit={invite}>
          <label className="field grow">
            {t(lang, 'email')}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.fr" />
          </label>
          <button className="btn primary" disabled={busy || !email.includes('@')}>
            {t(lang, 'sendInvite')}
          </button>
        </form>
        <p className="muted small">{t(lang, 'appInviteHint')}</p>
        {data && data.invites.length > 0 && (
          <ul className="member-list">
            {data.invites.map((i) => (
              <li key={i.id}>
                <span className="grow">
                  {i.email}{' '}
                  <span className="muted small">
                    · {t(lang, 'expires')} {day(i.expires_at)}
                  </span>
                </span>
                <button className="btn small subtle" onClick={() => api.adminRevokeInvite(i.id).then(() => setRefresh((n) => n + 1))}>
                  {t(lang, 'revoke')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && data.requests.length > 0 && (
        <section className="home-card" id="admin-requests">
          <h2>{t(lang, 'accessRequests')}</h2>
          <ul className="member-list">
            {data.requests.map((r) => (
              <li key={r.id}>
                <span className="grow">
                  <strong>{r.email}</strong>
                  <span className="muted small">
                    {' '}
                    · {day(r.requested_at)}
                    {r.message ? ` · « ${r.message} »` : ''}
                  </span>
                </span>
                <button className="btn small subtle" onClick={() => api.adminDeclineRequest(r.id).then(() => setRefresh((n) => n + 1))}>
                  {t(lang, 'decline')}
                </button>
                <button
                  className="btn small primary"
                  onClick={() =>
                    api
                      .adminInviteRequest(r.id)
                      .then(() => {
                        toast(`${t(lang, 'inviteSentTo')} ${r.email}`);
                        setRefresh((n) => n + 1);
                      })
                      .catch(() => toast(t(lang, 'syncError')))
                  }
                >
                  {t(lang, 'inviteThis')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section className="home-card" id="admin-deletions">
          <h2>{t(lang, 'deletionRequests')}</h2>
          <ul className="member-list">
            {pending.map((u) => (
              <li key={u.id}>
                <span className="grow">
                  <strong>{u.name || u.email}</strong> <span className="muted small">{u.email}</span>
                  <span className="muted small">
                    {' '}
                    · {day(u.deletion_requested_at!)}
                    {u.deletion_note ? ` · « ${u.deletion_note} »` : ''}
                  </span>
                </span>
                <button className="btn small subtle" onClick={() => api.adminDeclineDeletion(u.id).then(() => setRefresh((n) => n + 1))}>
                  {t(lang, 'decline')}
                </button>
                <button className="btn small danger" onClick={() => void approve(u.id, u.email)}>
                  {t(lang, 'approve')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-card" id="admin-users">
        <h2>{t(lang, 'users')}</h2>
        {data ? (
          <ul className="member-list">
            {data.users.map((u) => (
              <li key={u.id}>
                <span className="grow">
                  <strong>{u.name || u.email}</strong> <span className="muted small">{u.email}</span>
                  {u.is_admin ? <span className="tag"> {t(lang, 'adminTag')}</span> : null}
                </span>
                <span className="muted small">
                  {u.accounts} {t(lang, u.accounts === 1 ? 'accountOne' : 'accountMany')} · {day(u.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">…</p>
        )}
      </section>

      <section className="home-card" id="admin-accounts">
        <h2>{t(lang, 'familyAccounts')}</h2>
        {data && (
          <ul className="member-list">
            {data.accounts.map((a) => (
              <li key={a.id}>
                <span className="grow">
                  <strong>{a.name}</strong>
                </span>
                <span className="muted small">
                  {a.members} {t(lang, a.members === 1 ? 'memberOne' : 'memberMany')} · {a.trees}{' '}
                  {t(lang, a.trees === 1 ? 'treeOne' : 'treeMany')} · {formatBytes(a.bytes, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
