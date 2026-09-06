# Deploying Ramure on Cloudflare

One Worker serves both the built app and the API. It needs a D1 database, an R2 bucket, and a Resend key for sign-in emails. Everything below runs from the project folder with the Wrangler CLI already installed by `npm install`.

## 1. Sign in to Cloudflare once

```bash
npx wrangler login
```

## 2. Create the database and the bucket

```bash
npx wrangler d1 create ramure
```

Copy the `database_id` it prints into `wrangler.toml` (replace the zeros). Then:

```bash
npx wrangler r2 bucket create ramure-media
```

Pick a European location when asked (or set `location_hint = "weur"` on the bucket in the dashboard). D1 follows the account's region; choose Western Europe under Workers & Pages → D1 → Settings if offered.

## 3. Apply the schema

```bash
npm run db:migrate
```

## 4. Email for sign-in links

Create a free account at resend.com, verify a sending domain (or use their test domain to start), and create an API key. Then:

```bash
npx wrangler secret put RESEND_API_KEY
```

In `wrangler.toml`, set `MAIL_FROM` to an address on the verified domain, and **remove the `DEV_ECHO_LINKS` line**: it makes the API return sign-in links instead of emailing them, which is only acceptable on a laptop.

## 5. Origin

Set `APP_ORIGIN` in `wrangler.toml` to the public URL, for example `https://ramure.example.com` or the `*.workers.dev` URL Wrangler prints on the first deploy. Sign-in redirects and invite links use it, and the API refuses cross-site writes from anywhere else.

## 6. Deploy

```bash
npm run deploy
```

This builds the app and publishes the Worker with the static assets. Repeat after each change, or connect the GitHub repository under Workers & Pages → Create → Workers → Import a repository for automatic deploys on push.

## Costs

Everything above fits the free plans: 100,000 requests a day, 5 GB of D1, 10 GB of R2, 3,000 emails a month on Resend. Nothing pauses when idle.

## Backups

D1 keeps 30 days of point-in-time history (Time Travel) on every plan:

```bash
npx wrangler d1 time-travel restore ramure --timestamp=2026-09-01T12:00:00Z
```

Ramure also keeps a snapshot of each tree every 100 edits in the database, and members can export a tree as GEDCOM at any time.
