/** A new version is waiting: say so, and let the person choose the moment. */

import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../../i18n';
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
  if (!need) return null;
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
