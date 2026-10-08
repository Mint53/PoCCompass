#!/usr/bin/env bash
# PoC Compass — the single "definition of done" check (docs/HARNESS.md).
#   scripts/check.sh          quick: lint + tests + API contract + typecheck   (~1 min)
#   scripts/check.sh --full   quick + next build + bicep build                 (~3 min)
# Exit code != 0 means NOT done. Do not report completion while this fails.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNC="$ROOT/PocCompassFunc"
FRONT="$ROOT/PocCompassFront"
PY="$FUNC/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$FUNC/.venv/bin/python"
FULL=0; [ "${1:-}" = "--full" ] && FULL=1
FAILED=()

step() { printf '\n=== %s ===\n' "$1"; }
run() { # name, command...
  local name="$1"; shift
  step "$name"
  if "$@"; then echo "OK: $name"; else echo "NG: $name"; FAILED+=("$name"); fi
}

run "backend lint (ruff)" bash -c "cd '$FUNC' && '$PY' -m ruff check ."
run "backend tests (pytest)" bash -c "cd '$FUNC' && '$PY' -m pytest -q -p no:cacheprovider"

# API contract: openapi.json and schema.d.ts must be regenerated whenever backend models change.
contract() {
  # temp dir inside the repo + relative paths: Windows Python and Git Bash disagree on what /tmp means
  local tmp="$ROOT/.harness/contract"
  mkdir -p "$tmp"
  (cd "$FUNC" && "$PY" -c "
import json, sys
sys.path.insert(0, '.')
from app.api import app
open('../.harness/contract/openapi.json', 'w', encoding='utf-8').write(json.dumps(app.openapi(), ensure_ascii=False, indent=1, sort_keys=True) + '\n')
") || return 1
  if ! diff -q "$tmp/openapi.json" "$FUNC/openapi.json" >/dev/null; then
    echo "openapi.json is stale -> run scripts/gen-api.sh"; return 1
  fi
  (cd "$FRONT" && npx --no-install openapi-typescript ../.harness/contract/openapi.json -o ../.harness/contract/schema.d.ts --default-non-nullable false >/dev/null 2>&1) || return 1
  if ! diff -q <(tail -n +6 "$tmp/schema.d.ts") <(tail -n +6 "$FRONT/lib/api/schema.d.ts") >/dev/null; then
    echo "lib/api/schema.d.ts is stale -> run scripts/gen-api.sh"; return 1
  fi
}
run "API contract (openapi.json / schema.d.ts up to date)" contract

run "frontend typecheck (tsc)" bash -c "cd '$FRONT' && npx --no-install tsc --noEmit"
run "frontend lint (next lint)" bash -c "cd '$FRONT' && npm run -s lint"

# Secrets must never be tracked.
secrets() {
  cd "$ROOT" || return 1
  [ -d .git ] || return 0
  local hits
  hits="$(git ls-files | grep -E '(^|/)(local\.settings\.json|\.env(\.local)?|envsetting\.json|secrets\.json)$' || true)"
  if [ -n "$hits" ]; then echo "tracked secret files:"; echo "$hits"; return 1; fi
}
run "no tracked secret files" secrets

if [ $FULL -eq 1 ]; then
  run "frontend build (next build)" bash -c "cd '$FRONT' && npm run -s build"
  if command -v az >/dev/null 2>&1; then
    run "infra build (az bicep build)" bash -c "cd '$ROOT' && az bicep build --file infra/main.bicep --stdout >/dev/null"
  fi
fi

echo
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "ALL CHECKS PASSED$([ $FULL -eq 1 ] && echo ' (full)')"
  mkdir -p "$ROOT/.harness" && date +%s > "$ROOT/.harness/last-check-ok"
  exit 0
fi
echo "FAILED: ${FAILED[*]}"
exit 1
