/** Wires the settings page to the accounts, the identity and the UI preferences. */

import { t } from '../../i18n';
import { Settings, type DefaultView } from '../Settings';
import type { useAccounts } from '../hooks/useAccounts';
import type { Route } from '../router';
import { useUi } from '../ui/UiContext';
import type { Auth } from '../useAuth';

interface Props {
  auth: Auth;
  accounts: ReturnType<typeof useAccounts>;
  section?: 'account';
  defaultView: DefaultView;
  onDefaultView(v: DefaultView): void;
  navigate(r: Route): void;
}

export function SettingsHost({ auth, accounts, section, defaultView, onDefaultView, navigate }: Props) {
  const ui = useUi();
  const { lang, toast, ask } = ui;
  const account = accounts.account;
  if (!auth.user) return null;
  return (
    <Settings
      lang={lang}
      user={auth.user}
      account={account}
      accounts={accounts.accounts ?? []}
      theme={ui.theme}
      defaultView={defaultView}
      section={section}
      onSelectAccount={accounts.select}
      onAccountRenamed={(name) => {
        if (account) accounts.setAccount({ ...account, name });
        void accounts.load(account?.id);
        toast(t(lang, 'saved'));
      }}
      onLeftAccount={() => {
        void accounts.load();
        navigate({ name: 'home' });
      }}
      onProfileRenamed={() => {
        void auth.refresh();
        toast(t(lang, 'saved'));
      }}
      onDeletionChanged={() => void auth.refresh()}
      onLang={ui.setLang}
      onTheme={ui.setTheme}
      onDefaultView={onDefaultView}
      onBack={() => navigate({ name: 'home' })}
      toast={toast}
      ask={ask}
    />
  );
}
