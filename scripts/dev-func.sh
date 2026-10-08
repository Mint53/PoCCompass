#!/usr/bin/env bash
# Start the Functions host locally on 7072 (7071 is used by other projects on this PC).
# The worker must run on PocCompassFunc/.venv — without the explicit path, func picks the global Python
# (which lacks azure-identity etc. and fails only at request time).
set -euo pipefail
cd "$(dirname "$0")/../PocCompassFunc"
VENV_PY="$(cygpath -w "$(pwd)/.venv/Scripts/python.exe" 2>/dev/null || echo "$(pwd)/.venv/bin/python")"
export languageWorkers__python__defaultExecutablePath="$VENV_PY"
export VIRTUAL_ENV="$(cygpath -w "$(pwd)/.venv" 2>/dev/null || echo "$(pwd)/.venv")"
export PATH="$(pwd)/.venv/Scripts:$(pwd)/.venv/bin:$PATH"
exec func start --port 7072
