import { defineConfig } from '@playwright/test';

/**
 * One journey through the built app served by the local Worker (wrangler dev on 8787,
 * local D1 and R2, sign-in codes echoed). `npm run build` must precede it.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:8787', locale: 'fr-FR', viewport: { width: 1280, height: 800 } },
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'npx wrangler dev --port 8787',
    url: 'http://localhost:8787/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
