/**
 * What the deployment must have set, and what it does when something is missing.
 *
 * The reference project (ccig-app) refuses to *start* on incomplete production
 * settings, which works because a container that will not boot leaves the
 * previous one serving. A Worker has no equivalent: throwing from a request
 * handler does not roll a deployment back, it takes live traffic down. So the
 * same intent is served three ways instead, from loudest to most surgical:
 *
 *   1. every problem is logged once per isolate, so it is visible in the
 *      dashboard without waiting for a user to complain;
 *   2. `/api/health` reports them, so a deploy can be checked from outside;
 *   3. an operation that would be *silently unsafe* refuses on its own —
 *      see `requireCodePepper` below.
 *
 * A missing setting therefore never degrades quietly, and never takes down a
 * working app for people already signed in.
 */

import type { Env } from './env';

export type Severity = 'fatal' | 'warning';

export interface ConfigProblem {
  setting: string;
  severity: Severity;
  message: string;
}

/** Production is any deployment the browser reaches over https. */
export const isProduction = (env: Env): boolean => env.APP_ORIGIN?.startsWith('https://') ?? false;

/**
 * Everything wrong with this deployment's configuration.
 *
 * `fatal` means an operation will refuse rather than run unsafely; `warning`
 * means something is degraded but the app still works. Names only — never a
 * value, so this is safe to return from an endpoint.
 */
export function configProblems(env: Env): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  if (!env.APP_ORIGIN) {
    problems.push({ setting: 'APP_ORIGIN', severity: 'fatal', message: 'not set: sign-in links have nowhere to point' });
    return problems;
  }
  if (!isProduction(env)) return problems;

  if (!env.CODE_PEPPER)
    problems.push({
      setting: 'CODE_PEPPER',
      severity: 'fatal',
      message: 'not set: sign-in codes would be hashed unpeppered and brute-forceable from a database copy; sign-in refuses',
    });
  if (!env.RESEND_API_KEY)
    problems.push({ setting: 'RESEND_API_KEY', severity: 'warning', message: 'not set: no mail can be sent, so nobody new can sign in' });
  if (!env.MAIL_FROM) problems.push({ setting: 'MAIL_FROM', severity: 'warning', message: 'not set: Resend will refuse every message' });
  if (!env.ADMIN_EMAIL)
    problems.push({
      setting: 'ADMIN_EMAIL',
      severity: 'warning',
      message: 'not set: nobody is administrator and access requests go nowhere',
    });
  if (env.DEV_ECHO_LINKS)
    problems.push({
      setting: 'DEV_ECHO_LINKS',
      severity: 'warning',
      message: 'set on a production deployment; it is inert off localhost, but it does not belong here',
    });
  return problems;
}

let logged = false;

/** Log this deployment's problems once per isolate. Called on the first request. */
export function logConfigProblems(env: Env): void {
  if (logged) return;
  logged = true;
  for (const p of configProblems(env)) console.error(`Ramure config: ${p.setting} — ${p.message} [${p.severity}]`);
}

/** Test seam: forget that this isolate has already logged. */
export function resetConfigLog(): void {
  logged = false;
}

/**
 * Refuse to hash a sign-in code without a pepper in production.
 *
 * This is the one setting whose absence is invisible: everything keeps working
 * and the codes are simply weaker. Sign-in fails loudly instead — a broken
 * sign-in is noticed and fixed, weak hashes are not.
 */
export function requireCodePepper(env: Env): void {
  if (isProduction(env) && !env.CODE_PEPPER) throw new Error('CODE_PEPPER is not set on this deployment');
}
