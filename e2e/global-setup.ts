import { execSync } from 'node:child_process';

/** The local database must exist with an invitation for the journey's address. */
export default function globalSetup(): void {
  execSync('npx wrangler d1 migrations apply ramure --local', { stdio: 'ignore' });
  // A fresh address per run: an address only gets three sign-in mails per quarter hour.
  const email = `e2e-${Date.now().toString(36)}@example.org`;
  process.env.E2E_EMAIL = email;
  const sql = `INSERT OR REPLACE INTO app_invites (id, email, created_by, created_at, expires_at) VALUES ('V${Date.now().toString(36)}', '${email}', 'e2e', ${Date.now()}, ${Date.now() + 86400000})`;
  execSync(`npx wrangler d1 execute ramure --local --command "${sql.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
}
