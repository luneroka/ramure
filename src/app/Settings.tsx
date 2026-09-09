/** Settings page: the family account, your profile, and preferences. */

import { useEffect, useState } from 'react';
import { formatBytes } from '../media/documents';
import { t, type Lang, type ThemeChoice } from '../i18n';
import { localeOf } from './format';
import { api, type Account, type AccountMember, type AccountRole, type Me, type StorageReport } from '../sync/api';
import type { AskSpec } from './Modal';
import { errorText } from './errorText';

export type DefaultView = 'all' | 'hourglass';

interface Props {
  lang: Lang;
  user: Me;
  account: Account | null;
  accounts: Account[];
  theme: ThemeChoice;
  defaultView: DefaultView;
  /** Which section to scroll to on open. */
  section?: 'account' | 'profile' | 'preferences';
  onSelectAccount(a: Account): void;
  onAccountRenamed(name: string): void;
  onLeftAccount(): void;
  onProfileRenamed(name: string): void;
  /** The deletion request was sent or cancelled: reload the user. */
  onDeletionChanged(): void;
  /** Every session was closed server-side: the app must forget the person too. */
  onSignedOutEverywhere(): void;
  onLang(lang: Lang): void;
  onTheme(theme: ThemeChoice): void;
  onDefaultView(v: DefaultView): void;
  onBack(): void;
  toast(msg: string): void;
  ask(spec: AskSpec): Promise<string | null>;
}

export function Settings(p: Props) {
  const { lang, account } = p;
  const [name, setName] = useState(account?.name ?? '');
  const [profileName, setProfileName] = useState(p.user.name ?? '');
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [invites, setInvites] = useState<Array<{ id: string; email: string | null; expiresAt: number; role: AccountRole }>>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');
  const [refresh, setRefresh] = useState(0);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const owner = account?.role === 'owner';
  const ownerCount = members.filter((m) => m.role === 'owner').length;
  const lastOwner = owner && ownerCount <= 1;

  useEffect(() => {
    if (!account) return;
    let alive = true;
    api.accountMembers(account.id).then((r) => alive && setMembers(r.members));
    if (owner) api.listAccountInvites(account.id).then((r) => alive && setInvites(r.invites));
    api
      .accountStorage(account.id)
      .then((r) => alive && setStorage(r))
      .catch(() => alive && setStorage(null));
    return () => {
      alive = false;
    };
  }, [account, owner, refresh]);

  useEffect(() => {
    if (p.section) document.getElementById(`settings-${p.section}`)?.scrollIntoView({ block: 'start' });
  }, [p.section]);

  const roleLabel = (r: AccountRole) => t(lang, r === 'owner' ? 'roleOwner' : r === 'member' ? 'roleMember' : 'roleViewer');

  return (
    <div className="settings">
      <div className="settings-head">
        <button className="btn subtle" onClick={p.onBack}>
          ← {t(lang, 'library')}
        </button>
        <h1>{t(lang, 'settings')}</h1>
      </div>

      <section className="home-card" id="settings-account">
        <h2>{t(lang, 'accountMembers')}</h2>
        {p.accounts.length > 1 && (
          <label className="field">
            {t(lang, 'account')}
            <select value={account?.id ?? ''} onChange={(e) => p.onSelectAccount(p.accounts.find((a) => a.id === e.target.value)!)}>
              {p.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {account && (
          <>
            {owner && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = name.trim();
                  if (!n || n === account.name) return;
                  api.renameAccount(account.id, n).then(() => p.onAccountRenamed(n));
                }}
              >
                <input className="grow" value={name} onChange={(e) => setName(e.target.value)} aria-label={t(lang, 'accountName')} />
                <button className="btn" disabled={!name.trim() || name.trim() === account.name}>
                  {t(lang, 'rename')}
                </button>
              </form>
            )}
            <h3>{t(lang, 'members')}</h3>
            <p className="muted small">{t(lang, 'membersHint')}</p>
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.id}>
                  <span className="member-name">
                    {m.name || m.email}
                    {m.id === p.user.id && <span className="muted"> ({t(lang, 'you')})</span>}
                  </span>
                  {owner ? (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        api
                          .setAccountRole(account.id, m.id, e.target.value as AccountRole)
                          .then(() => {
                            setRefresh((n) => n + 1);
                            p.toast(t(lang, 'roleChanged'));
                          })
                          .catch(() => p.toast(t(lang, 'lastOwner')))
                      }
                    >
                      <option value="owner">{t(lang, 'roleOwner')}</option>
                      <option value="member">{t(lang, 'roleMember')}</option>
                      <option value="viewer">{t(lang, 'roleViewer')}</option>
                    </select>
                  ) : (
                    <span className="tag">{roleLabel(m.role)}</span>
                  )}
                  {owner && m.id !== p.user.id && (
                    <button
                      className="icon-btn small"
                      title={t(lang, 'removeMember')}
                      aria-label={t(lang, 'removeMember')}
                      onClick={async () => {
                        const ok = await p.ask({
                          title: t(lang, 'removeMemberTitle'),
                          message: `${m.name || m.email} · ${t(lang, 'removeMemberMessage')}`,
                          confirmLabel: t(lang, 'removeMember'),
                          danger: true,
                        });
                        if (ok === null) return;
                        api.removeAccountMember(account.id, m.id).then(() => {
                          setRefresh((n) => n + 1);
                          p.toast(t(lang, 'memberRemoved'));
                        });
                      }}
                    >
                      ⨯
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {owner && (
              <>
                <h3>{t(lang, 'inviteSomeone')}</h3>
                <p className="muted small">{t(lang, 'accountInviteRule')}</p>
                <p className="muted small">
                  {t(lang, 'accountInviteHint')} {t(lang, 'viewerHint')}
                </p>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const address = inviteEmail.trim();
                    if (!address) return;
                    api
                      .createAccountInvite(account.id, address, inviteRole)
                      .then(() => {
                        setInviteEmail('');
                        setRefresh((n) => n + 1);
                        p.toast(t(lang, 'inviteSent'));
                      })
                      .catch((err: unknown) => p.toast(errorText(lang, err)));
                  }}
                >
                  <label className="field grow">
                    {t(lang, 'inviteEmail')}
                    <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} autoComplete="off" />
                  </label>
                  <label className="field">
                    {t(lang, 'inviteRole')}
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'member' | 'viewer')}>
                      <option value="member">{t(lang, 'roleMember')}</option>
                      <option value="viewer">{t(lang, 'roleViewer')}</option>
                    </select>
                  </label>
                  <button className="btn primary" disabled={!inviteEmail.trim()}>
                    {t(lang, 'sendInvite')}
                  </button>
                </form>
                {invites.length > 0 && (
                  <ul className="member-list">
                    {invites.map((i) => (
                      <li key={i.id}>
                        <span className="member-name">
                          {t(lang, 'invitePendingFor')} <strong>{i.email ?? '…'}</strong> · {roleLabel(i.role)} · {t(lang, 'until')}{' '}
                          {new Date(i.expiresAt).toLocaleDateString(localeOf(lang))}
                        </span>
                        <button
                          className="btn small"
                          onClick={() => api.revokeAccountInvite(account.id, i.id).then(() => setRefresh((n) => n + 1))}
                        >
                          {t(lang, 'revoke')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn subtle danger-text"
                disabled={lastOwner}
                title={lastOwner ? t(lang, 'lastOwnerLeave') : undefined}
                onClick={async () => {
                  const ok = await p.ask({
                    title: t(lang, 'leaveAccountTitle'),
                    message: t(lang, 'leaveAccountConfirm'),
                    confirmLabel: t(lang, 'leaveAccount'),
                    danger: true,
                  });
                  if (ok === null) return;
                  api
                    .removeAccountMember(account.id, p.user.id)
                    .then(p.onLeftAccount)
                    .catch(() => p.toast(t(lang, 'lastOwner')));
                }}
              >
                {t(lang, 'leaveAccount')}
              </button>
              {lastOwner && <span className="muted small">{t(lang, 'lastOwnerLeave')}</span>}
            </div>
          </>
        )}
      </section>

      {account && (
        <section className="home-card" id="settings-storage">
          <h2>{t(lang, 'storage')}</h2>
          {storage ? (
            <>
              <p className="storage-total">
                <strong>{formatBytes(storage.bytes, lang)}</strong> {t(lang, 'storageUsed')} · {storage.files}{' '}
                {t(lang, storage.files === 1 ? 'file' : 'files')}
              </p>
              {storage.trees.length > 1 && (
                <ul className="storage-trees">
                  {storage.trees.map((tr) => (
                    <li key={tr.id}>
                      <span>{tr.name}</span>
                      <span className="muted">
                        {formatBytes(tr.bytes, lang)} · {tr.files} {t(lang, tr.files === 1 ? 'file' : 'files')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small">{t(lang, 'storageHint')}</p>
            </>
          ) : (
            <p className="muted small">…</p>
          )}
        </section>
      )}

      <section className="home-card" id="settings-deletion">
        <h2>{t(lang, 'deleteMyAccount')}</h2>
        <p className="muted small">{t(lang, 'deleteMyAccountHint')}</p>
        {p.user.deletionRequestedAt ? (
          <div className="row">
            <span className="grow">
              {t(lang, 'deletionPending')} {new Date(p.user.deletionRequestedAt).toLocaleDateString(localeOf(lang))}
            </span>
            <button
              className="btn"
              onClick={() =>
                api
                  .cancelDeletion()
                  .then(() => {
                    p.toast(t(lang, 'deletionCancelled'));
                    p.onDeletionChanged();
                  })
                  .catch(() => p.toast(t(lang, 'syncError')))
              }
            >
              {t(lang, 'cancelDeletion')}
            </button>
          </div>
        ) : (
          <button
            className="btn subtle danger-text"
            onClick={() =>
              void p
                .ask({
                  title: t(lang, 'deleteMyAccount'),
                  message: t(lang, 'deleteMyAccountHint'),
                  input: { label: t(lang, 'deletionNote'), optional: true },
                  confirmLabel: t(lang, 'requestDeletion'),
                  danger: true,
                })
                .then((note) => {
                  if (note === null) return;
                  return api.requestDeletion(note.trim()).then(() => {
                    p.toast(t(lang, 'deletionRequested'));
                    p.onDeletionChanged();
                  });
                })
                .catch(() => p.toast(t(lang, 'syncError')))
            }
          >
            {t(lang, 'requestDeletion')}
          </button>
        )}
      </section>

      <section className="home-card" id="settings-profile">
        <h2>{t(lang, 'profile')}</h2>
        <p className="muted small">{p.user.email}</p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            api.rename(profileName.trim()).then((r) => p.onProfileRenamed(r.user.name ?? ''));
          }}
        >
          <label className="field grow">
            {t(lang, 'displayName')}
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder={t(lang, 'displayNameHint')} />
          </label>
          <button className="btn" disabled={(profileName.trim() || '') === (p.user.name ?? '')}>
            {t(lang, 'save')}
          </button>
        </form>
        <h3>{t(lang, 'signOutEverywhere')}</h3>
        <p className="muted small">{t(lang, 'signOutEverywhereHint')}</p>
        <button
          className="btn"
          onClick={() =>
            void p
              .ask({
                title: t(lang, 'signOutEverywhere'),
                message: t(lang, 'signOutEverywhereMessage'),
                confirmLabel: t(lang, 'signOutEverywhere'),
              })
              .then(async (answer) => {
                if (answer === null) return;
                try {
                  await api.logoutAll();
                } catch {
                  /* the sessions may already be gone; the app forgets the person either way */
                }
                p.onSignedOutEverywhere();
              })
          }
        >
          {t(lang, 'signOutEverywhere')}
        </button>
      </section>

      <section className="home-card" id="settings-preferences">
        <h2>{t(lang, 'preferences')}</h2>
        <div className="prefs">
          <label className="field">
            {t(lang, 'language')}
            <select value={lang} onChange={(e) => p.onLang(e.target.value as Lang)}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            {t(lang, 'theme')}
            <select value={p.theme} onChange={(e) => p.onTheme(e.target.value as ThemeChoice)}>
              <option value="auto">{t(lang, 'themeAuto')}</option>
              <option value="light">{t(lang, 'themeLight')}</option>
              <option value="dark">{t(lang, 'themeDark')}</option>
            </select>
          </label>
          <label className="field">
            {t(lang, 'defaultView')}
            <select value={p.defaultView} onChange={(e) => p.onDefaultView(e.target.value as DefaultView)}>
              <option value="hourglass">{t(lang, 'viewHourglass')}</option>
              <option value="all">{t(lang, 'viewAll')}</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
