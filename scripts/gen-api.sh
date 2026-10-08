#!/usr/bin/env bash
# Regenerate the API contract after changing backend models/routes:
#   PocCompassFunc/openapi.json  ->  PocCompassFront/lib/api/schema.d.ts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/PocCompassFunc/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$ROOT/PocCompassFunc/.venv/bin/python"
(cd "$ROOT/PocCompassFunc" && "$PY" scripts/export_openapi.py)
(cd "$ROOT/PocCompassFront" && npm run -s gen:api)
echo "API types regenerated. Fix any type errors with: (cd PocCompassFront && npx tsc --noEmit)"
