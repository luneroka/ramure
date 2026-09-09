// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';
import { t } from '@/i18n';

/**
 * The personal-data section, in both languages.
 *
 * A tree records living people who never signed up for it, so what is held and
 * for how long is stated in the app rather than only in docs/PRIVACY.md. It is
 * plain text with no behaviour, which is exactly why it is worth a test: nothing
 * else would notice if a key stopped resolving and « privacyWhat » appeared on
 * the screen instead of a sentence.
 */
const noop = () => {};

function renderSettings(lang: 'fr' | 'en') {
  return render(
    <Settings
      lang={lang}
      user={{ id: 'U1', email: 'moi@example.org', name: null, isAdmin: false, deletionRequestedAt: null }}
      account={{ id: 'A1', name: 'Vernay', role: 'owner', members: 1, trees: 1 }}
      accounts={[{ id: 'A1', name: 'Vernay', role: 'owner', members: 1, trees: 1 }]}
      theme="auto"
      defaultView="hourglass"
      onSelectAccount={noop}
      onAccountRenamed={noop}
      onLeftAccount={noop}
      onProfileRenamed={noop}
      onDeletionChanged={noop}
      onSignedOutEverywhere={noop}
      onLang={noop}
      onTheme={noop}
      onDefaultView={noop}
      onBack={noop}
      toast={noop}
      ask={async () => null}
    />,
  );
}

describe('Settings: personal data', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(['fr', 'en'] as const)('says what is held, where, for how long and who sees it (%s)', (lang) => {
    renderSettings(lang);
    expect(screen.getByRole('heading', { name: t(lang, 'privacy') })).toBeInTheDocument();
    for (const key of ['privacyWhatTitle', 'privacyWhereTitle', 'privacyKeptTitle', 'privacyWhoTitle', 'privacyRightsTitle'] as const)
      expect(screen.getByText(t(lang, key))).toBeInTheDocument();
    // The bodies resolve to sentences, not to their keys.
    for (const key of ['privacyIntro', 'privacyWhat', 'privacyWhere', 'privacyKept', 'privacyWho', 'privacyRights'] as const) {
      const text = t(lang, key);
      expect(text).not.toBe(key);
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it('names the operator’s access rather than leaving a relative to assume otherwise', () => {
    renderSettings('en');
    expect(screen.getByText(t('en', 'privacyWho'))).toHaveTextContent('The person running this server can see everything');
  });
});
