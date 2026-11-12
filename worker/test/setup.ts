import { applyD1Migrations, env } from 'cloudflare:test';

const done = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`).first();
if (!done) await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
