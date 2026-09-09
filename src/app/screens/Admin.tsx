/**
 * Application administration, for the operator only: who is invited, who is
 * in, who asked to leave, and what each family account weighs.
 */

import { useEffect, useState } from 'react';
import { t, type Lang } from '@/i18n';
import { localeOf } from '@/app/lib/format';
import { formatBytes } from '@/media/documents';
import { api, type AdminOverview, type ClientErrorRow } from '@/sync/api';
import type { AskSpec } from '@/app/ui/Modal';
import { errorText } from '@/app/lib/errorText';

interface Props {
  lang: Lang;
  onBack(): void;
  toast(msg: string): void;
  ask(spec: AskSpec): Promise<string | null>;
}

export function Admin({ lang, onBack, toast, ask }: Props) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [copies, setCopies] = useState<{ treeId: string; list: Array<{ day: string; size: number }> } | null>(null);
  const [errors, setErrors] = useState<ClientErrorRow[] | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
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
      toast(errorText(lang, err));
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

      {data?.config?.length ? (
        <section className="home-card admin-config" id="admin-config">
          <h2>{t(lang, 'configProblems')}</h2>
          <p className="muted small">{t(lang, 'configProblemsHint')}</p>
          <ul className="member-list">
            {data.config.map((p) => (
              <li key={p.setting}>
                <span className="grow">
                  <span className={p.severity === 'fatal' ? 'tag alarm' : 'tag'}>{p.setting}</span>{' '}
                  {/* The reason comes from the Worker in English: it is an operator diagnostic, like a log line, not app text. */}
                  <span className="muted small">{p.message}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      <section className="home-card" id="admin-errors">
        <h2>{t(lang, 'reportedErrors')}</h2>
        <p className="muted small">{t(lang, 'reportedErrorsHint')}</p>
        <div className="row">
          <button
            className="btn small"
            onClick={() =>
              api
                .adminErrors()
                .then((r) => setErrors(r.errors))
                .catch(() => toast(t(lang, 'syncError')))
            }
          >
            {errors ? t(lang, 'refresh') : t(lang, 'showErrors')}
          </button>
          {errors && errors.length > 0 && (
            <button
              className="btn small subtle"
              onClick={() =>
                api
                  .adminClearErrors()
                  .then(() => setErrors([]))
                  .catch(() => toast(t(lang, 'syncError')))
              }
            >
              {t(lang, 'clearErrors')}
            </button>
          )}
        </div>
        {errors && errors.length === 0 && <p className="muted small">{t(lang, 'noErrors')}</p>}
        {errors && errors.length > 0 && (
          <ul className="member-list error-list">
            {errors.map((e) => (
              <li key={e.id}>
                <span className="grow">
                  <span className="muted small">
                    {new Date(e.at).toLocaleString(locale)} · {e.kind} · {e.version ?? '?'}
                    {e.email ? ` · ${e.email}` : ''}
                  </span>
                  <br />
                  <strong>{e.message}</strong>
                  {openError === e.id && (
                    <pre className="error-stack">
                      {e.url ?? ''}
                      {'\n'}
                      {e.agent ?? ''}
                      {'\n\n'}
                      {e.stack ?? '—'}
                    </pre>
                  )}
                </span>
                <button className="btn small subtle" onClick={() => setOpenError(openError === e.id ? null : e.id)}>
                  {openError === e.id ? t(lang, 'close') : t(lang, 'details')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="home-card" id="admin-backups">
        <h2>{t(lang, 'backups')}</h2>
        <p className="muted small">{t(lang, 'backupsHint')}</p>
        {data && (
          <ul className="member-list">
            {data.trees.map((tr) => (
              <li key={tr.id}>
                <span className="grow">
                  <strong>{tr.name}</strong>
                  <span className="muted small">
                    {' '}
                    · {tr.account_name ?? '—'} · {tr.people} · {new Date(tr.updated_at).toLocaleDateString(locale)}
                  </span>
                  {copies?.treeId === tr.id && (
                    <ul className="backup-list">
                      {copies.list.length === 0 && <li className="muted small">{t(lang, 'noCopies')}</li>}
                      {copies.list.map((b) => (
                        <li key={b.day}>
                          <a href={`/api/admin/backups/${encodeURIComponent(tr.id)}/${b.day}`} download={`${tr.name}-${b.day}.ged`}>
                            {b.day}
                          </a>{' '}
                          <span className="muted small">{formatBytes(b.size, lang)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
                <button
                  className="btn small"
                  onClick={() =>
                    copies?.treeId === tr.id
                      ? setCopies(null)
                      : api
                          .adminBackups(tr.id)
                          .then((r) => setCopies({ treeId: tr.id, list: r.backups }))
                          .catch(() => toast(t(lang, 'syncError')))
                  }
                >
                  {t(lang, 'showCopies')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
