#!/usr/bin/env bash
# Deploy PoC Compass to Azure (docs/DEPLOY.md). Run from Git Bash after `az login`.
#   ./scripts/deploy.sh            infra(what-if → confirm) + api + web
#   ./scripts/deploy.sh api        Functions only
#   ./scripts/deploy.sh web        Web App only
#   ./scripts/deploy.sh infra      Bicep only
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB="9ddf8e17-37ce-4e3d-9a24-6518dabec332"   # ICC GAIN検証用
RG="poc-compass-rg"
TARGET="${1:-all}"

az account set -s "$SUB"
out() { az deployment sub show --name poc-compass-infra --query "properties.outputs.$1.value" -o tsv; }

deploy_infra() {
  local me upn
  me="$(az ad signed-in-user show --query id -o tsv)"
  upn="$(az ad signed-in-user show --query userPrincipalName -o tsv)"
  local args=(--location japaneast --name poc-compass-infra --template-file "$ROOT/infra/main.bicep"
              --parameters "$ROOT/infra/parameters/prod.bicepparam" --parameters adminEmails="$upn" deployerPrincipalId="$me")
  az deployment sub what-if "${args[@]}" --result-format ResourceIdOnly
  read -r -p "上の差分で deploy しますか？ (yes/no) " ans
  [ "$ans" = "yes" ] || { echo "中止しました"; exit 1; }
  az deployment sub create "${args[@]}" --query properties.provisioningState -o tsv
}

deploy_api() {
  "$ROOT/scripts/check.sh"
  local func; func="$(out functionAppName)"
  # `func azure functionapp publish` fails behind the corporate SSL inspection proxy; az CLI works.
  local pkg="$ROOT/.harness/api.zip"
  mkdir -p "$ROOT/.harness"; rm -f "$pkg"
  (cd "$ROOT/PocCompassFunc" && "$ROOT/PocCompassFunc/.venv/Scripts/python.exe" -c "
import os, zipfile
include = ['function_app.py', 'host.json', 'requirements.txt']
with zipfile.ZipFile(r'../.harness/api.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in include:
        z.write(f, f)
    for base, dirs, files in os.walk('app'):
        dirs[:] = [d for d in dirs if d != '__pycache__']
        for f in files:
            if not f.endswith('.pyc'):
                p = os.path.join(base, f)
                z.write(p, p.replace(os.sep, '/'))
")
  env -u MSYS_NO_PATHCONV az functionapp deployment source config-zip -g "$RG" -n "$func" --src "$pkg" --build-remote true --timeout 900 -o none
  # Host key used by the Next.js proxy. Rotated on every API deploy and stored only in Key Vault.
  local kv key; kv="$(out keyVaultName)"
  key="$(openssl rand -hex 32)"
  az functionapp keys set -g "$RG" -n "$func" --key-type functionKeys --key-name frontend --key-value "$key" -o none
  az keyvault secret set --vault-name "$kv" --name backend-function-key --value "$key" -o none
  unset key
  # Web App reads the key through a Key Vault reference; restart to pick up the new version.
  az webapp restart -g "$RG" -n "$(out webAppName)"
  echo "API deployed: $(out functionApiUrl)"
}

deploy_web() {
  local web pkg; web="$(out webAppName)"
  # npm ci would wipe node_modules under a running `next dev` (EBUSY on Windows); install only when missing.
  (cd "$ROOT/PocCompassFront" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npm run build)
  pkg="$ROOT/.harness/web.zip"
  mkdir -p "$ROOT/.harness"
  rm -rf "$ROOT/.harness/web" "$pkg"
  cp -r "$ROOT/PocCompassFront/.next/standalone" "$ROOT/.harness/web"
  mkdir -p "$ROOT/.harness/web/.next"
  cp -r "$ROOT/PocCompassFront/.next/static" "$ROOT/.harness/web/.next/static"
  [ -d "$ROOT/PocCompassFront/public" ] && cp -r "$ROOT/PocCompassFront/public" "$ROOT/.harness/web/public"
  rm -f "$ROOT/.harness/web/.env.local"   # never ship local dev identity
  (cd "$ROOT/.harness/web" && "$ROOT/PocCompassFunc/.venv/Scripts/python.exe" -c "
import os, zipfile
with zipfile.ZipFile(r'../web.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk('.'):
        for f in files:
            p = os.path.join(base, f)
            z.write(p, os.path.relpath(p, '.'))
")
  env -u MSYS_NO_PATHCONV az webapp deploy -g "$RG" -n "$web" --src-path "$pkg" --type zip --async false
  echo "Web deployed: $(out webAppUrl)"
}

case "$TARGET" in
  infra) deploy_infra ;;
  api) deploy_api ;;
  web) deploy_web ;;
  all) deploy_infra; deploy_api; deploy_web ;;
  *) echo "usage: $0 [all|infra|api|web]"; exit 1 ;;
esac
