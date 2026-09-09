#!/usr/bin/env sh
# Scan the whole history for committed secrets.
#
# This runs locally rather than in CI on purpose: the repository is private, so
# GitHub Actions minutes are metered, and the account's are spent. A workflow
# that cannot run is worse than none — a permanently red check teaches you to
# ignore red checks.
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
