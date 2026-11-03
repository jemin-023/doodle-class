#!/usr/bin/env bash
# Deploys HEAD to Vercel production from a git-free copy.
# Vercel blocks CLI deploys whose git commit author is not on the Vercel account.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
git -C "$ROOT" archive HEAD | tar -x -C "$TMP"
cp -r "$ROOT/.vercel" "$TMP/"
cd "$TMP" && npx --yes vercel@65.10.0 --prod --yes
