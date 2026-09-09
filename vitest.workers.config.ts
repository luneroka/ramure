/// <reference types="@cloudflare/vitest-pool-workers" />
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';

/** Worker tests run inside workerd with an isolated D1 and R2 per test file; migrations are applied in setup. */
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
      include: ['worker/**/*.test.ts'],
      setupFiles: ['./worker/test/setup.ts'],
      poolOptions: {
        workers: {
          // R2's isolated storage trips over its own SQLite files; tests use distinct ids instead.
          isolatedStorage: false,
          // One runtime, files in sequence: the shared storage is migrated once and never raced.
          singleWorker: true,
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              APP_ORIGIN: 'http://localhost',
              MAIL_FROM: 'Ramure <test@example.org>',
              ADMIN_EMAIL: 'admin@example.org',
              DEV_ECHO_LINKS: '1',
            },
          },
        },
      },
    },
  };
});
