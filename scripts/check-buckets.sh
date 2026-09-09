#!/usr/bin/env sh
# Assert that the R2 buckets are not reachable from the open internet.
#
# The September 2026 audit decided *against* encrypting the nightly GEDCOM
# copies (docs/SECURITY_AUDIT_2026-09.md § S6). The short of it: they sit in the
# same bucket, the same account and behind the same credentials as the D1 column
# holding the identical plaintext, R2 already encrypts at rest, and the key would
# have to live in a Worker secret beside the lock — while encrypting would cost
# the property the whole design is built on, that a backup is readable in any
# genealogy program with or without Ramure.
#
# What that decision leaves is one real difference: R2 has an exposure mode D1
# does not. A bucket can be made public with a single toggle or a custom domain.
# Nothing about that is likely, and it would not be noticed either — so it is
# checked here rather than remembered. Read-only; it changes nothing.
set -e

# "Did not run" must never look like "found nothing", the same rule scan-secrets.sh follows.
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "wrangler is not signed in — the bucket check did NOT run."
  echo "  npx wrangler login"
  echo "It needs an account-level login, not a deploy-scoped token."
  exit 127
fi

fail=0

check() {
  bucket="$1"
  echo "  $bucket"

  if npx wrangler r2 bucket dev-url get "$bucket" 2>&1 | grep -q 'disabled'; then
    echo "    ok    r2.dev public access is disabled"
  else
    echo "    FAIL  r2.dev public access is NOT disabled — every backup is world-readable by key"
    fail=1
  fi

  if npx wrangler r2 bucket domain list "$bucket" 2>&1 | grep -q 'no custom domains'; then
    echo "    ok    no custom domain is attached"
  else
    echo "    FAIL  a custom domain is attached — check what it serves"
    fail=1
  fi
}

echo "Checking that the R2 buckets are private…"
check ramure-media
check ramure-media-staging

if [ "$fail" -ne 0 ]; then
  echo
  echo "A bucket is reachable from the internet. Turn it off in the Cloudflare dashboard"
  echo "(R2 → the bucket → Settings → Public access) before doing anything else."
  exit 1
fi

echo "Both buckets are private."
