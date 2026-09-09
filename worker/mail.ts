/** Outgoing mail through Resend; in development without a key, nothing is sent and the caller echoes instead. */

import type { Env } from './env';
import { HttpError } from './util';

/** True when mail is not configured and links/codes may be echoed to the caller (local development only). */
export function echoMode(env: Env, requestUrl: string): boolean {
  const host = new URL(requestUrl).hostname;
  return !env.RESEND_API_KEY && env.DEV_ECHO_LINKS === '1' && (host === 'localhost' || host === '127.0.0.1');
}

export async function sendMail(env: Env, requestUrl: string, to: string, subject: string, text: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (echoMode(env, requestUrl)) return;
    throw new HttpError(500, 'mail not configured');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) throw new HttpError(502, 'mail delivery failed');
}
