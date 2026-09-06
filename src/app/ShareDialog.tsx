/** Members, roles and invite links for a cloud tree. */

import { useEffect, useState } from 'react';
import { t, type Lang } from '../i18n';
import { api, type Member, type Role } from '../sync/api';

interface Props {
  lang: Lang;
  treeId: string;
  treeName: string;
  role: Role;
  meId: string;
  onClose(): void;
  onLeft(): void;
  toast(msg: string): void;
}

export function ShareDialog({ lang, treeId, treeName, role, meId, onClose, onLeft, toast }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Array<{ id: string; role: Role; expiresAt: number; revoked: boolean }>>([]);
  const [link, setLink] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [refresh, setRefresh] = useState(0);
  const owner = role === 'owner';

  useEffect(() => {
    let alive = true;
    api.members(treeId).then((r) => alive && setMembers(r.members));
    if (owner) api.listInvites(treeId).then((r) => alive && setInvites(r.invites.filter((i) => !i.revoked && i.expiresAt > Date.now())));
    return () => {
      alive = false;
    };
  }, [treeId, owner, refresh]);

  const createLink = async () => {
    const r = await api.createInvite(treeId, inviteRole);
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

  const roleLabel = (r: Role) => t(lang, r === 'owner' ? 'roleOwner' : r === 'editor' ? 'roleEditor' : 'roleViewer');

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(lang, 'share')}>
        <div className="report-head">
          <strong>
            {t(lang, 'share')} · {treeName}
          </strong>
          <span className="muted" />
          <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>
            ×
          </button>
        </div>

        <h3>{t(lang, 'members')}</h3>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              <span className="member-name">
                {m.name || m.email}
                {m.id === meId && <span className="muted"> ({t(lang, 'you')})</span>}
              </span>
              {owner && m.role !== 'owner' ? (
                <select
                  value={m.role}
                  onChange={(e) => api.setRole(treeId, m.id, e.target.value as 'editor' | 'viewer').then(() => setRefresh((n) => n + 1))}
                >
                  <option value="editor">{t(lang, 'roleEditor')}</option>
                  <option value="viewer">{t(lang, 'roleViewer')}</option>
                </select>
              ) : (
                <span className="tag">{roleLabel(m.role)}</span>
              )}
              {owner && m.role !== 'owner' && (
                <button
                  className="icon-btn small"
                  title={t(lang, 'removeMember')}
                  aria-label={t(lang, 'removeMember')}
                  onClick={() => api.removeMember(treeId, m.id).then(() => setRefresh((n) => n + 1))}
                >
                  ⨯
                </button>
              )}
            </li>
          ))}
        </ul>

        {owner ? (
          <>
            <h3>{t(lang, 'inviteLink')}</h3>
            <p className="muted small">{t(lang, 'inviteHint')}</p>
            <div className="row">
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}>
                <option value="editor">{t(lang, 'roleEditor')}</option>
                <option value="viewer">{t(lang, 'roleViewer')}</option>
              </select>
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
                      {t(lang, 'activeLink')} · {roleLabel(i.role)} · {t(lang, 'until')}{' '}
                      {new Date(i.expiresAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                    </span>
                    <button className="btn small" onClick={() => api.revokeInvite(treeId, i.id).then(() => setRefresh((n) => n + 1))}>
                      {t(lang, 'revoke')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn subtle danger-text"
              onClick={() => {
                if (window.confirm(t(lang, 'leaveConfirm'))) api.removeMember(treeId, meId).then(onLeft);
              }}
            >
              {t(lang, 'leaveTree')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
