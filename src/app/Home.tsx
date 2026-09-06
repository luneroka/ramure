/**
 * Accueil: the account's trees. Import and "new tree" live here and only
 * here, since both create a tree. A person without an account creates one.
 */

import { useEffect, useState } from 'react';
import { t, type Lang } from '../i18n';
import { api, type Account, type TreeSummary } from '../sync/api';

interface Props {
  lang: Lang;
  accounts: Account[] | null;
  account: Account | null;
  onSelectAccount(a: Account): void;
  onCreateAccount(name: string): Promise<void>;
  onOpenTree(tree: TreeSummary): void;
  onImport(): void;
  onNewTree(): void;
  onDeleteTree(tree: TreeSummary): void;
  refreshKey: number;
  busy: boolean;
  /** Lets the parent reuse the list (tree switcher). */
  onTrees?(trees: TreeSummary[]): void;
}

export function Home(p: Props) {
  const { lang, accounts, account } = p;
  const [name, setName] = useState('');
  const [treesFor, setTreesFor] = useState<{ accountId: string; trees: TreeSummary[] } | null>(null);
  const trees = account && treesFor?.accountId === account.id ? treesFor.trees : null;

  useEffect(() => {
    if (!account) return;
    let alive = true;
    api
      .listTrees(account.id)
      .then((r) => {
        if (!alive) return;
        setTreesFor({ accountId: account.id, trees: r.trees });
        p.onTrees?.(r.trees);
      })
      .catch(() => alive && setTreesFor({ accountId: account.id, trees: [] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, p.refreshKey]);

  if (accounts === null) return <div className="home">…</div>;

  if (accounts.length === 0 || !account) {
    return (
      <div className="home">
        <div className="home-card create-account">
          <h2>{t(lang, 'createAccountTitle')}</h2>
          <p className="muted">{t(lang, 'createAccountHint')}</p>
          <form
            className="signin"
            onSubmit={(e) => {
              e.preventDefault();
              void p.onCreateAccount(name.trim() || t(lang, 'defaultAccountName'));
            }}
          >
            <label>
              {t(lang, 'accountName')}
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t(lang, 'defaultAccountName')} />
            </label>
            <button className="btn primary" disabled={p.busy}>
              {t(lang, 'createAccount')}
            </button>
          </form>
          <p className="muted small">{t(lang, 'orInvite')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      <div className="home-head">
        {accounts.length > 1 ? (
          <select
            className="account-select"
            value={account.id}
            onChange={(e) => p.onSelectAccount(accounts.find((a) => a.id === e.target.value)!)}
            aria-label={t(lang, 'account')}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : (
          <h1 className="account-name">{account.name}</h1>
        )}
        <div className="row">
          <button className="btn" onClick={p.onImport} disabled={p.busy}>
            {t(lang, 'openFile')}
          </button>
          <button className="btn primary" onClick={p.onNewTree} disabled={p.busy}>
            {t(lang, 'newTree')}
          </button>
        </div>
      </div>

      {trees === null ? (
        <p className="muted">…</p>
      ) : trees.length === 0 ? (
        <div className="home-card">
          <p className="muted">{t(lang, 'noTreesYet')}</p>
          <p className="muted small">{t(lang, 'dropHintCloud')}</p>
        </div>
      ) : (
        <ul className="tree-cards">
          {trees.map((tr) => (
            <li key={tr.id} className="tree-card">
              <button className="tree-card-main" onClick={() => p.onOpenTree(tr)}>
                <span className="tree-card-name">{tr.name}</span>
                <span className="tree-card-meta">
                  {tr.people} {t(lang, 'people')} · {new Date(tr.updated_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                </span>
                <span className="tree-card-open">{t(lang, 'openTree')} →</span>
              </button>
              {account.role === 'owner' && (
                <button
                  className="icon-btn small tree-card-delete"
                  title={t(lang, 'deleteTree')}
                  aria-label={t(lang, 'deleteTree')}
                  onClick={() => p.onDeleteTree(tr)}
                >
                  ⨯
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
