#!/usr/bin/env bash
# Claude Code PostToolUse hook (Write|Edit). Reads the hook JSON on stdin.
# - *.py in PocCompassFunc: ruff check that file; on failure exit 2 so Claude sees the error and fixes it now.
# - backend models/controllers changed: remind to regenerate the API contract.
# - docs/SPEC.md changed: remind that code + tests must follow the spec.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$ROOT/PocCompassFunc/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$ROOT/PocCompassFunc/.venv/bin/python"
FILE="$("$PY" -c "import json,sys; d=json.load(sys.stdin); print((d.get('tool_input') or {}).get('file_path') or (d.get('tool_response') or {}).get('filePath') or '')" 2>/dev/null)"
[ -z "$FILE" ] && exit 0
F="${FILE//\\//}"

case "$F" in
  */PocCompassFunc/*.py)
    OUT="$(cd "$ROOT/PocCompassFunc" && "$PY" -m ruff check --output-format concise "$FILE" 2>&1)"
    if [ $? -ne 0 ]; then
      echo "ruff found problems in $FILE (fix before continuing):" >&2
      echo "$OUT" >&2
      exit 2
    fi
    ;;
esac

case "$F" in
  */PocCompassFunc/app/models/*|*/PocCompassFunc/app/controllers/*|*/PocCompassFunc/app/api.py)
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Backend API shape may have changed: run scripts/gen-api.sh and fix frontend types before finishing (scripts/check.sh verifies this)."}}'
    ;;
  */docs/SPEC.md)
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"SPEC.md changed: update app/constants/limits.py, app/modes/defaults.py, code and tests to match; tests/test_spec_sync.py enforces the numbers."}}'
    ;;
esac
exit 0
