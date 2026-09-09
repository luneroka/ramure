/** Tell the server when the app breaks: message, stack, page and version. Never more than a few per session, never with personal data. */

import { api } from '@/sync/api';

let sent = 0;
const MAX_PER_SESSION = 5;

export function reportError(kind: 'render' | 'rejection' | 'error', err: unknown): void {
  if (sent >= MAX_PER_SESSION) return;
  sent++;
  const e = err instanceof Error ? err : new Error(String(err));
  void api
    .reportError({
      kind,
      message: e.message,
      stack: e.stack?.slice(0, 4000),
      url: location.href.replace(/#.*$/, '#…'),
      version: __APP_VERSION__,
    })
    .catch(() => {
      /* the report is best effort */
    });
}
