#!/usr/bin/env bash
# Production cutover: secret → seed → deploy hosting+functions.
# Requires Firebase CLI access to project capgeminidemo2.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${FIREBASE_PROJECT:-capgeminidemo2}"
ENV_FILE="$ROOT/functions/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing functions/.env (need GEMINI_API_KEY)"
  exit 1
fi

# shellcheck disable=SC1090
set -a
# Export only KEY=VALUE lines (no comments)
eval "$(grep -E '^[A-Z0-9_]+=' "$ENV_FILE" | sed 's/^/export /')"
set +a

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY is empty in functions/.env"
  exit 1
fi

echo "==> Project: $PROJECT"
firebase use "$PROJECT"

echo "==> Setting GEMINI_API_KEY secret"
printf '%s' "$GEMINI_API_KEY" | firebase functions:secrets:set GEMINI_API_KEY --project "$PROJECT" --data-file=-

echo "==> Seeding cloud Firestore"
npm run seed

echo "==> Deploying hosting + functions"
npm run deploy

echo "==> Smoke: /api/health"
curl -sS "https://${PROJECT}.web.app/api/health" || curl -sS "https://us-central1-${PROJECT}.cloudfunctions.net/api/api/health" || true
echo
echo "Done. Smoke the site: https://${PROJECT}.web.app"
