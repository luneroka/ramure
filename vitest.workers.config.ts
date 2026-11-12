import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { configDefaults, defineConfig } from 'vitest/config';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Worker tests run inside workerd against a real D1 and R2, with the Worker
 * configured from wrangler.toml; migrations are applied in setup. The plugin
 * gives each test file its own runner, so a file never sees another's rows.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  // wrangler.toml points at the built assets; the tests never serve them, but the folder must exist.
  mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  return {
    plugins: [
      cloudflareTest({
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
      }),
    ],
    test: {
      include: ['worker/**/*.test.ts'],
      // Agents' git worktrees live under .claude; their copies of the tests are never this checkout's.
      exclude: [...configDefaults.exclude, '.claude/**'],
      setupFiles: ['./worker/test/setup.ts'],
    },
  };
});
