/**
 * The home screen: sign in, the trees you have access to, and the tree kept
 * on this device.
 */

import { useEffect, useState } from 'react';
import { t, type Lang } from '../i18n';
import { api, type TreeSummary } from '../sync/api';
import type { Auth } from './useAuth';

interface Props {
  lang: Lang;
  auth: Auth;
  /** Summary of the device tree, if one exists. */
  local: { fileName: string; people: number } | null;
  pendingInvite: { treeName: string; role: string } | null;
  onOpenLocal(): void;
  onOpenCloud(tree: TreeSummary): void;
  onImport(): void;
  onNewTree(): void;
  onSample(): void;
  onUploadLocal(): void;
  onDeleteCloud(tree: TreeSummary): void;
  toast(msg: string): void;
  /** Bumped by the parent to refresh the list. */
  refreshKey: number;
}

export function Library(p: Props) {
  const { lang, auth } = p;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ email: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Trees are remembered with the user they belong to, so a sign-out shows none without an effect.
  const [treesFor, setTreesFor] = useState<{ userId: string; trees: TreeSummary[] } | null>(null);
  const trees = auth.user && treesFor?.userId === auth.user.id ? treesFor.trees : null;

  useEffect(() => {
    const user = auth.user;
    if (!user) return;
    let alive = true;
    api
      .listTrees()
      .then((r) => alive && setTreesFor({ userId: user.id, trees: r.trees }))
      .catch(() => alive && setTreesFor({ userId: user.id, trees: [] }));
    return () => {
      alive = false;
    };
  }, [auth.user, p.refreshKey]);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const link = await auth.requestLink(email.trim());
      setSent({ email: email.trim(), link });
    } catch {
      p.toast(t(lang, 'signinFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library">
      <header className="library-head">
        <h1>{t(lang, 'appName')}</h1>
        <p className="tagline">{t(lang, 'tagline')}</p>
      </header>

      {p.pendingInvite && (
        <div className="callout">
          {t(lang, 'inviteFor')} <strong>{p.pendingInvite.treeName}</strong> (
          {t(lang, p.pendingInvite.role === 'viewer' ? 'roleViewer' : 'roleEditor')}).{' '}
          {auth.user ? t(lang, 'inviteJoining') : t(lang, 'inviteSignIn')}
        </div>
      )}

      <div className="library-grid">
        <section className="library-card">
          <h2>{t(lang, 'cloudTrees')}</h2>
          {auth.loading ? (
            <p className="muted">…</p>
          ) : auth.unavailable ? (
            <p className="muted">{t(lang, 'apiUnavailable')}</p>
          ) : !auth.user ? (
            sent ? (
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
                <p className="muted small">{t(lang, 'signinHint')}</p>
                <label>
                  {t(lang, 'email')}
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.fr"
                  />
                </label>
                <button className="btn primary" disabled={busy || !email.includes('@')}>
                  {t(lang, 'sendLink')}
                </button>
              </form>
            )
          ) : (
            <>
              <p className="muted small">
                {auth.user.email} ·{' '}
                <button className="link" onClick={() => void auth.logout()}>
                  {t(lang, 'signOut')}
                </button>
              </p>
              {trees === null ? (
                <p className="muted">…</p>
              ) : trees.length === 0 ? (
                <p className="muted">{t(lang, 'noCloudTrees')}</p>
              ) : (
                <ul className="tree-list">
                  {trees.map((tr) => (
                    <li key={tr.id}>
                      <button className="tree-row" onClick={() => p.onOpenCloud(tr)}>
                        <span className="tree-name">{tr.name}</span>
                        <span className="tree-meta">
                          {tr.people} {t(lang, 'people')} ·{' '}
                          {t(lang, tr.role === 'owner' ? 'roleOwner' : tr.role === 'editor' ? 'roleEditor' : 'roleViewer')} ·{' '}
                          {new Date(tr.updated_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                        </span>
                      </button>
                      {tr.role === 'owner' && (
                        <button
                          className="icon-btn small"
                          title={t(lang, 'deleteTree')}
                          aria-label={t(lang, 'deleteTree')}
                          onClick={() => p.onDeleteCloud(tr)}
                        >
                          ⨯
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="library-card">
          <h2>{t(lang, 'deviceTree')}</h2>
          {p.local ? (
            <>
              <button className="tree-row" onClick={p.onOpenLocal}>
                <span className="tree-name">{p.local.fileName}</span>
                <span className="tree-meta">
                  {p.local.people} {t(lang, 'people')} · {t(lang, 'onThisDevice')}
                </span>
              </button>
              {auth.user && (
                <button className="btn" onClick={p.onUploadLocal}>
                  {t(lang, 'uploadLocal')}
                </button>
              )}
            </>
          ) : (
            <p className="muted">{t(lang, 'noDeviceTree')}</p>
          )}
          <div className="row library-actions">
            <button className="btn" onClick={p.onImport}>
              {t(lang, 'openFile')}
            </button>
            <button className="btn" onClick={p.onNewTree}>
              {t(lang, 'newTree')}
            </button>
            <button className="btn subtle" onClick={p.onSample}>
              {t(lang, 'loadSample')}
            </button>
          </div>
          <p className="muted small">{t(lang, 'dropHint')}</p>
        </section>
      </div>
    </div>
  );
}
