/** Settings page: the family account, your profile, and preferences. */

import { useEffect, useState } from 'react';
import { t, type Lang, type ThemeChoice } from '../i18n';
import { api, type Account, type AccountMember, type Me } from '../sync/api';

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
  onLang(lang: Lang): void;
  onTheme(theme: ThemeChoice): void;
  onDefaultView(v: DefaultView): void;
  onBack(): void;
  toast(msg: string): void;
}

export function Settings(p: Props) {
  const { lang, account } = p;
  const [name, setName] = useState(account?.name ?? '');
  const [profileName, setProfileName] = useState(p.user.name ?? '');
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [invites, setInvites] = useState<Array<{ id: string; expiresAt: number }>>([]);
  const [link, setLink] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const owner = account?.role === 'owner';

  useEffect(() => {
    if (!account) return;
    let alive = true;
    api.accountMembers(account.id).then((r) => alive && setMembers(r.members));
    if (owner) api.listAccountInvites(account.id).then((r) => alive && setInvites(r.invites));
    return () => {
      alive = false;
    };
  }, [account, owner, refresh]);

  useEffect(() => {
    if (p.section) document.getElementById(`settings-${p.section}`)?.scrollIntoView({ block: 'start' });
  }, [p.section]);

  const roleLabel = (r: 'owner' | 'member') => t(lang, r === 'owner' ? 'roleOwner' : 'roleMember');
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      p.toast(t(lang, 'copied'));
    } catch {
      /* visible to copy by hand */
    }
  };

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
                          .setAccountRole(account.id, m.id, e.target.value as 'owner' | 'member')
                          .then(() => setRefresh((n) => n + 1))
                          .catch(() => p.toast(t(lang, 'lastOwner')))
                      }
                    >
                      <option value="owner">{t(lang, 'roleOwner')}</option>
                      <option value="member">{t(lang, 'roleMember')}</option>
                    </select>
                  ) : (
                    <span className="tag">{roleLabel(m.role)}</span>
                  )}
                  {owner && m.id !== p.user.id && (
                    <button
                      className="icon-btn small"
                      title={t(lang, 'removeMember')}
                      aria-label={t(lang, 'removeMember')}
                      onClick={() => api.removeAccountMember(account.id, m.id).then(() => setRefresh((n) => n + 1))}
                    >
                      ⨯
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {owner && (
              <>
                <h3>{t(lang, 'inviteLink')}</h3>
                <p className="muted small">{t(lang, 'accountInviteHint')}</p>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={() =>
                      api.createAccountInvite(account.id).then((r) => {
                        setLink(r.link);
                        setRefresh((n) => n + 1);
                      })
                    }
                  >
                    {t(lang, 'createLink')}
                  </button>
                </div>
                {link && (
                  <div className="invite-link">
                    <input readOnly value={link} onFocus={(e) => e.target.select()} />
                    <button className="btn" onClick={() => void copy()}>
                      {t(lang, 'copy')}
                    </button>
                  </div>
                )}
                {invites.length > 0 && (
                  <ul className="member-list">
                    {invites.map((i) => (
                      <li key={i.id}>
                        <span className="member-name">
                          {t(lang, 'activeLink')} · {t(lang, 'until')}{' '}
                          {new Date(i.expiresAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
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
                onClick={() => {
                  if (window.confirm(t(lang, 'leaveAccountConfirm')))
                    api
                      .removeAccountMember(account.id, p.user.id)
                      .then(p.onLeftAccount)
                      .catch(() => p.toast(t(lang, 'lastOwner')));
                }}
              >
                {t(lang, 'leaveAccount')}
              </button>
            </div>
          </>
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
