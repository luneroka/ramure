import { describe, expect, it, beforeEach } from 'vitest';
import { configProblems, isProduction, requireCodePepper, resetConfigLog } from './config';
import type { Env } from './env';

/** Only the settings matter here; the bindings are never touched. */
const env = (over: Partial<Env>): Env => ({ APP_ORIGIN: 'http://localhost:5175', MAIL_FROM: 'Ramure <a@b.c>', ...over }) as Env;

const production = (over: Partial<Env> = {}): Env =>
  env({
    APP_ORIGIN: 'https://ramure.example',
    CODE_PEPPER: 'pepper',
    RESEND_API_KEY: 'key',
    ADMIN_EMAIL: 'admin@example.org',
    ...over,
  });

beforeEach(resetConfigLog);

describe('isProduction', () => {
  it('is the https deployments and nothing else', () => {
    expect(isProduction(env({ APP_ORIGIN: 'https://ramure.example' }))).toBe(true);
    expect(isProduction(env({ APP_ORIGIN: 'http://localhost:5175' }))).toBe(false);
    expect(isProduction(env({ APP_ORIGIN: '' }))).toBe(false);
  });
});

describe('configProblems', () => {
  it('says nothing about a development deployment missing every secret', () => {
    // Development is meant to run without a pepper, a mail key or an administrator.
    expect(configProblems(env({}))).toEqual([]);
  });

  it('says nothing about a complete production deployment', () => {
    expect(configProblems(production())).toEqual([]);
  });

  it('calls a missing pepper fatal, because nothing else would reveal it', () => {
    const problems = configProblems(production({ CODE_PEPPER: undefined }));
    expect(problems).toHaveLength(1);
    expect(problems[0]!.setting).toBe('CODE_PEPPER');
    expect(problems[0]!.severity).toBe('fatal');
  });

  it('calls a missing mail key a warning: signed-in people are unaffected', () => {
    const problems = configProblems(production({ RESEND_API_KEY: undefined }));
    expect(problems.map((p) => p.severity)).toEqual(['warning']);
  });

  it('notices an administrator address and a sender that were never set', () => {
    const problems = configProblems(production({ ADMIN_EMAIL: undefined, MAIL_FROM: '' }));
    expect(problems.map((p) => p.setting).sort()).toEqual(['ADMIN_EMAIL', 'MAIL_FROM']);
  });

  it('flags the development echo flag left on in production', () => {
    const problems = configProblems(production({ DEV_ECHO_LINKS: '1' }));
    expect(problems.map((p) => p.setting)).toEqual(['DEV_ECHO_LINKS']);
  });

  it('reports a missing origin on its own, since every other check depends on it', () => {
    const problems = configProblems(env({ APP_ORIGIN: '' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]!.setting).toBe('APP_ORIGIN');
  });

  it('never carries a value, only a name and a reason', () => {
    // Distinctive sentinels: a value must not appear even when the setting it belongs to is reported.
    const secrets = { CODE_PEPPER: 's3cr3t-pepper-value', RESEND_API_KEY: 're_liveKeyValue', ADMIN_EMAIL: undefined };
    const serialised = JSON.stringify(configProblems(production({ ...secrets, MAIL_FROM: '' })));
    expect(serialised).not.toContain('s3cr3t-pepper-value');
    expect(serialised).not.toContain('re_liveKeyValue');
    expect(serialised).toContain('ADMIN_EMAIL');
  });
});

describe('requireCodePepper', () => {
  it('lets development hash without a pepper', () => {
    expect(() => requireCodePepper(env({}))).not.toThrow();
  });

  it('lets production hash when the pepper is set', () => {
    expect(() => requireCodePepper(production())).not.toThrow();
  });

  it('refuses in production rather than hashing a code unpeppered', () => {
    expect(() => requireCodePepper(production({ CODE_PEPPER: undefined }))).toThrow(/CODE_PEPPER/);
  });
});
