import { applyD1Migrations, env } from 'cloudflare:test';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    MEDIA: R2Bucket;
    ASSETS: Fetcher;
    TEST_MIGRATIONS: D1Migration[];
    APP_ORIGIN: string;
    MAIL_FROM: string;
    ADMIN_EMAIL: string;
    DEV_ECHO_LINKS: string;
  }
}

const done = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`).first();
if (!done) await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
