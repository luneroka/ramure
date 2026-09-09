#!/usr/bin/env sh
# Scan the whole history for committed secrets.
#
# This runs in both places: here as the first gate, and in CI as the slower
# second opinion (.github/workflows/secret-scan.yml, on every push to main and
# every pull request).
#
# It was local-only for a few hours on 9 September 2026, while the repository was
# private and the account's Actions minutes were spent — a workflow that cannot
# start is worse than none, because a permanently red check teaches you to ignore
# red checks. Making the repository public removed that constraint: public
# repositories do not consume the quota. The reasoning is kept because the
# failure mode it names is worth remembering, not because it still applies.
#
# Installed with: brew install gitleaks
set -e

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks is not installed — the secret scan did NOT run."
  echo "  brew install gitleaks"
  echo "Install it before merging anything that touches configuration."
  exit 127
fi

echo "Scanning history for secrets…"
gitleaks git --no-banner
