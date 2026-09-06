/** Members and invite links of a family account. */

import { useEffect, useState } from 'react';
import { t, type Lang } from '../i18n';
import { api, type Account, type AccountMember } from '../sync/api';

interface Props {
  lang: Lang;
  account: Account;
  meId: string;
  onClose(): void;
  onLeft(): void;
  onRenamed(name: string): void;
  toast(msg: string): void;
}

export function AccountDialog({ lang, account, meId, onClose, onLeft, onRenamed, toast }: Props) {
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [invites, setInvites] = useState<Array<{ id: string; expiresAt: number }>>([]);
  const [link, setLink] = useState<string | null>(null);
  const [name, setName] = useState(account.name);
  const [refresh, setRefresh] = useState(0);
  const owner = account.role === 'owner';

  useEffect(() => {
    let alive = true;
    api.accountMembers(account.id).then((r) => alive && setMembers(r.members));
    if (owner) api.listAccountInvites(account.id).then((r) => alive && setInvites(r.invites));
    return () => {
      alive = false;
    };
  }, [account.id, owner, refresh]);

  const createLink = async () => {
    const r = await api.createAccountInvite(account.id);
    setLink(r.link);
    setRefresh((n) => n + 1);
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast(t(lang, 'copied'));
    } catch {
      /* clipboard blocked: the link is visible to copy by hand */
    }
  };

  const roleLabel = (r: 'owner' | 'member') => t(lang, r === 'owner' ? 'roleOwner' : 'roleMember');

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(lang, 'accountMembers')}>
        <div className="report-head">
          <strong>{account.name}</strong>
          <span className="muted" />
          <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>
            ×
          </button>
        </div>

        {owner && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n || n === account.name) return;
              api.renameAccount(account.id, n).then(() => onRenamed(n));
            }}
          >
            <input className="grow" value={name} onChange={(e) => setName(e.target.value)} aria-label={t(lang, 'accountName')} />
            <button className="btn small" disabled={!name.trim() || name.trim() === account.name}>
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
                {m.id === meId && <span className="muted"> ({t(lang, 'you')})</span>}
              </span>
              {owner ? (
                <select
                  value={m.role}
                  onChange={(e) =>
                    api
                      .setAccountRole(account.id, m.id, e.target.value as 'owner' | 'member')
                      .then(() => setRefresh((n) => n + 1))
                      .catch(() => toast(t(lang, 'lastOwner')))
                  }
                >
                  <option value="owner">{t(lang, 'roleOwner')}</option>
                  <option value="member">{t(lang, 'roleMember')}</option>
                </select>
              ) : (
                <span className="tag">{roleLabel(m.role)}</span>
              )}
              {owner && m.id !== meId && (
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
              <button className="btn primary" onClick={() => void createLink()}>
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

        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn subtle danger-text"
            onClick={() => {
              if (window.confirm(t(lang, 'leaveAccountConfirm')))
                api
                  .removeAccountMember(account.id, meId)
                  .then(onLeft)
                  .catch(() => toast(t(lang, 'lastOwner')));
            }}
          >
            {t(lang, 'leaveAccount')}
          </button>
        </div>
      </div>
    </div>
  );
}
