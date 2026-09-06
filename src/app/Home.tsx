/**
 * After sign-in: the family account and its trees. A person with no account
 * yet creates one here (or arrives through an invite link).
 */

import { useEffect, useState } from 'react';
import { t, type Lang } from '../i18n';
import { api, type Account, type TreeSummary } from '../sync/api';
import type { Auth } from './useAuth';

interface Props {
  lang: Lang;
  auth: Auth;
  accounts: Account[] | null;
  account: Account | null;
  onSelectAccount(a: Account): void;
  onCreateAccount(name: string): Promise<void>;
  onOpenTree(tree: TreeSummary): void;
  onImport(): void;
  onNewTree(): void;
  onDeleteTree(tree: TreeSummary): void;
  onManageAccount(): void;
  refreshKey: number;
  busy: boolean;
}

export function Home(p: Props) {
  const { lang, auth, accounts, account } = p;
  const [name, setName] = useState('');
  const [treesFor, setTreesFor] = useState<{ accountId: string; trees: TreeSummary[] } | null>(null);
  const trees = account && treesFor?.accountId === account.id ? treesFor.trees : null;

  useEffect(() => {
    if (!account) return;
    let alive = true;
    api
      .listTrees(account.id)
      .then((r) => alive && setTreesFor({ accountId: account.id, trees: r.trees }))
      .catch(() => alive && setTreesFor({ accountId: account.id, trees: [] }));
    return () => {
      alive = false;
    };
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
        <div>
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
            <h2 className="account-name">{account.name}</h2>
          )}
          <p className="muted small">
            {account.members} {t(lang, account.members > 1 ? 'membersCount' : 'memberCount')} · {auth.user?.email}
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={p.onManageAccount}>
            {t(lang, 'accountMembers')}
          </button>
        </div>
      </div>

      <div className="home-card">
        <div className="row home-card-head">
          <h3>{t(lang, 'trees')}</h3>
          <span className="spacer" />
          <button className="btn" onClick={p.onImport} disabled={p.busy}>
            {t(lang, 'openFile')}
          </button>
          <button className="btn primary" onClick={p.onNewTree} disabled={p.busy}>
            {t(lang, 'newTree')}
          </button>
        </div>
        {trees === null ? (
          <p className="muted">…</p>
        ) : trees.length === 0 ? (
          <p className="muted">{t(lang, 'noTreesYet')}</p>
        ) : (
          <ul className="tree-list">
            {trees.map((tr) => (
              <li key={tr.id}>
                <button className="tree-row" onClick={() => p.onOpenTree(tr)}>
                  <span className="tree-name">{tr.name}</span>
                  <span className="tree-meta">
                    {tr.people} {t(lang, 'people')} · {new Date(tr.updated_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                  </span>
                </button>
                {account.role === 'owner' && (
                  <button
                    className="icon-btn small"
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
        <p className="muted small">{t(lang, 'dropHintCloud')}</p>
      </div>
    </div>
  );
}
