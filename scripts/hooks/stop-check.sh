#!/usr/bin/env bash
# Claude Code Stop hook. If source files changed after the last green scripts/check.sh,
# run the quick check; when it fails, exit 2 so Claude keeps working instead of declaring "done".
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAMP="$ROOT/.harness/last-check-ok"
INPUT="$(cat)"
# Avoid infinite loops: when Claude is already continuing because of this hook, let it stop.
case "$INPUT" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac

if [ -f "$STAMP" ]; then
  changed="$(find "$ROOT/PocCompassFunc/app" "$ROOT/PocCompassFunc/tests" "$ROOT/PocCompassFunc/function_app.py" \
    "$ROOT/PocCompassFront/app" "$ROOT/PocCompassFront/lib" "$ROOT/docs/SPEC.md" "$ROOT/infra" \
    -type f \( -name '*.py' -o -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.bicep' \) \
    -newer "$STAMP" 2>/dev/null | head -1)"
  [ -z "$changed" ] && exit 0
fi

if OUT="$("$ROOT/scripts/check.sh" 2>&1)"; then
  exit 0
fi
echo "scripts/check.sh failed after your changes. Fix these before finishing:" >&2
echo "$OUT" | grep -E '^(NG:|FAILED|E[0-9]|.*[Ee]rror)' | head -40 >&2
exit 2
