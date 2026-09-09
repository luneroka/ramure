/**
 * A new version is ready. When nothing is waiting to reach the server it takes over at once, so nobody keeps
 * running old code without noticing; when an edit is still on its way, the person chooses the moment.
 */

import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../../i18n';
import { pendingEdits } from '../../sync/pendingEdits';
import { useUi } from './UiContext';

const CHECK_EVERY = 60 * 60 * 1000;

export function UpdateBanner() {
  const { lang } = useUi();
  const {
    needRefresh: [need, setNeed],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), CHECK_EVERY);
    },
  });
  useEffect(() => {
    if (need && pendingEdits() === 0) void updateServiceWorker(true);
  }, [need, updateServiceWorker]);
  if (!need || pendingEdits() === 0) return null;
  return (
    <div className="update-banner" role="status">
      <span>{t(lang, 'updateAvailable')}</span>
      <button className="btn small primary" onClick={() => void updateServiceWorker(true)}>
        {t(lang, 'updateNow')}
      </button>
      <button className="icon-btn" onClick={() => setNeed(false)} aria-label={t(lang, 'later')}>
        ×
      </button>
    </div>
  );
}
