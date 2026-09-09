# Staging

A second Worker with its own database and bucket, so a migration, a schema
change or a risky release can be tried against real infrastructure without
touching the family's actual trees.

|              | Production                 | Staging                                    |
| ------------ | -------------------------- | ------------------------------------------ |
| Worker       | `ramure`                   | `ramure-staging`                           |
| URL          | ramure.ramure.workers.dev  | ramure-staging.ramure.workers.dev          |
| Database     | D1 `ramure`                | D1 `ramure-staging`                        |
| Files        | R2 `ramure-media`          | R2 `ramure-media-staging`                  |
| Deploys      | automatically, from `main` | **by hand only**, `npm run deploy:staging` |
| Nightly cron | yes (backup + reaper)      | no — run it by hand if you need to         |

Staging never moves on its own. That is deliberate: if it redeployed from
`main` too it would tell you nothing that production doesn't.

## Setting it up (once)

`wrangler.toml` and the npm scripts are already written. These are the steps
that need your Cloudflare account.

**1. Make sure wrangler is signed in.**

```bash
npx wrangler whoami
```

If it does not name your account, or says it lacks permissions, run
`npx wrangler login` and approve in the browser. (A token limited to Workers
deploys is not enough — creating D1 and R2 needs an account-level login.)

**2. Create the database.**

```bash
npx wrangler d1 create ramure-staging
```

It prints a `database_id`. **Copy it into `wrangler.toml`**, replacing
`PASTE_THE_ID_FROM_D1_CREATE` under `[[env.staging.d1_databases]]`.

**3. Create the bucket.**

```bash
npx wrangler r2 bucket create ramure-media-staging
```

**4. Build the schema.**

```bash
npm run db:migrate:staging
```

This applies every migration in order against an empty database — which is
also the only place that gets tested, since production has been migrated
incrementally. A migration that fails here would have failed a production
deploy.

**5. Set the three secrets.**

```bash
npx wrangler secret put CODE_PEPPER --env staging
npx wrangler secret put RESEND_API_KEY --env staging
npx wrangler secret put ADMIN_EMAIL --env staging
```

- `CODE_PEPPER` — generate a **different** value from production, so a staging
  database copy tells an attacker nothing about production codes. Any long
  random string: `openssl rand -base64 32`.

- `RESEND_API_KEY` — **a second key, not production's.** In Resend: API Keys →
  Create API Key → name it `ramure-staging`, permission _Sending access_ (it
  does not need full access). Same account and same verified domain, so mail
  still comes from the address in `MAIL_FROM`.

  Staging cannot run without a key at all: `sendMail` throws
  `mail_not_configured`, and the echo-links shortcut only works on `localhost`,
  so there would be no way to sign in — the codes are stored hashed, so one
  cannot be read back out of the database either.

  A separate key can be revoked without touching production, reports its usage
  separately, and survives staging being treated casually. The blast radius of
  sharing one is small — the rate limits cap sign-in mail at three per address
  per quarter hour — but a second key costs one click.

- `ADMIN_EMAIL` — your own address, so you are the administrator here too.

**6. Deploy.**

```bash
npm run deploy:staging
```

**7. Check it came up correctly.**

```bash
curl https://ramure-staging.ramure.workers.dev/api/health
```

Expect `{"ok":true,...,"config":"ok"}`. Anything but `ok` means a setting is
missing — the administration page names which one, and the reasoning is in
[HYGIENE_2026-09.md](HYGIENE_2026-09.md) under H1.

**8. Let yourself in.** Staging starts with no users and the door is closed, so
invite your own address from the sign-in page's access-request form, then
approve it — or insert the invitation directly:

```bash
npx wrangler d1 execute ramure-staging --remote --env staging --command \
  "INSERT INTO app_invites (id, email, created_by, created_at, expires_at) \
   VALUES ('Vseed', 'you@example.org', 'seed', $(date +%s000), $(( $(date +%s) * 1000 + 604800000 )))"
```

## Using it

```bash
npm run deploy:staging      # build and push the current working tree
npm run tail:staging        # live logs
npm run db:migrate:staging  # apply new migrations here first
```

**Test a migration here before production.** That is the main reason this
exists:

```bash
npm run db:migrate:staging   # then exercise the app at the staging URL
npm run db:migrate           # only once staging is happy
```

## Loading real-shaped data

Staging is empty. To exercise it with a real tree, export one from production
through the app (tree menu → « Exporter en GEDCOM ») and import it into a tree
on staging. Do not copy the production database wholesale: it holds other
people's addresses, and staging is a second place they could leak from.

## What staging deliberately does not have

- **No cron.** The nightly backup and the reaper belong to production. Trigger
  the handler by hand if you are testing them:

  ```bash
  curl "https://ramure-staging.ramure.workers.dev/cdn-cgi/handler/scheduled"
  ```

  This needs `[env.staging.triggers] crons = []` — an **empty** list, not an
  absent one. Unlike bindings and vars, triggers _are_ inherited from the top of
  `wrangler.toml`, so the first staging deploy silently picked up production's
  nightly schedule. Leaving the section out does not mean "no cron".

- **No custom domain.** The `workers.dev` URL is enough.
- **No separate Resend domain.** Mail comes from the same sender; if that ever
  becomes confusing, add a staging sender and change `MAIL_FROM` under
  `[env.staging.vars]`.

## Tearing it down

```bash
npx wrangler delete --env staging
npx wrangler d1 delete ramure-staging
npx wrangler r2 bucket delete ramure-media-staging
```
