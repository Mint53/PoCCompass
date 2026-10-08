#!/usr/bin/env bash
# Recreate the PoC Compass Web App and Function App on the shared Linux App Service Plan.
# Default: preflight + Bicep what-if only. Pass --apply to perform the destructive migration.
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB="9ddf8e17-37ce-4e3d-9a24-6518dabec332"
RG="poc-compass-rg"
SHARED_PLAN_RG="icc-gain-shared-rg"
SHARED_PLAN_NAME="icc-gain-app-service-plan-linux-02"
OLD_PLAN_NAME="poc-compass-plan"
FUNC="poc-compass-func-5etqg"
WEB="poc-compass-web-5etqg"
ROLE_KV_SECRETS_USER="4633458b-17de-408a-b874-0445c86b69e6"
ROLE_OPENAI_USER="5e0bd9bd-7b93-4f28-af87-19fc36ad61bd"
ROLE_COSMOS_DATA_CONTRIBUTOR="00000000-0000-0000-0000-000000000002"
APPLY=0

if [ "${1:-}" = "--apply" ]; then
  APPLY=1
elif [ -n "${1:-}" ]; then
  echo "usage: $0 [--apply]" >&2
  exit 2
fi

require_equal() {
  local actual="$1" expected="$2" label="$3"
  if [ "${actual,,}" != "${expected,,}" ]; then
    echo "停止: ${label} が想定と異なります。actual=${actual} expected=${expected}" >&2
    exit 1
  fi
}

require_true() {
  if [ "$1" != "true" ]; then
    echo "停止: $2" >&2
    exit 1
  fi
}

delete_role_assignment() {
  local scope="$1" principal_id="$2" role_id="$3"
  local role_definition_id="/subscriptions/${SUB}/providers/Microsoft.Authorization/roleDefinitions/${role_id}"
  local assignment_ids
  assignment_ids="$(az role assignment list --scope "$scope" --assignee-object-id "$principal_id" \
    --query "[?roleDefinitionId=='${role_definition_id}'].id" -o tsv)"
  if [ -n "$assignment_ids" ]; then
    while IFS= read -r assignment_id; do
      az role assignment delete --ids "$assignment_id"
    done <<< "$assignment_ids"
  fi
}

az account set -s "$SUB"

func_plan_id="$(az functionapp show -g "$RG" -n "$FUNC" --query serverFarmId -o tsv)"
web_plan_id="$(az webapp show -g "$RG" -n "$WEB" --query serverFarmId -o tsv)"
expected_old_plan_id="/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Web/serverfarms/${OLD_PLAN_NAME}"
require_equal "$func_plan_id" "$expected_old_plan_id" "Function App の現在の App Service Plan"
require_equal "$web_plan_id" "$expected_old_plan_id" "Web App の現在の App Service Plan"

target_plan_id="$(az appservice plan show -g "$SHARED_PLAN_RG" -n "$SHARED_PLAN_NAME" --query id -o tsv)"
target_location="$(az appservice plan show -g "$SHARED_PLAN_RG" -n "$SHARED_PLAN_NAME" --query location -o tsv)"
target_kind="$(az appservice plan show -g "$SHARED_PLAN_RG" -n "$SHARED_PLAN_NAME" --query kind -o tsv)"
func_location="$(az functionapp show -g "$RG" -n "$FUNC" --query location -o tsv)"
web_location="$(az webapp show -g "$RG" -n "$WEB" --query location -o tsv)"
require_equal "$target_location" "$func_location" "共有 Plan と Function App のリージョン"
require_equal "$target_location" "$web_location" "共有 Plan と Web App のリージョン"
require_equal "$target_kind" "linux" "共有 Plan の kind"

old_plan_sites="$({
  az webapp list -g "$RG" --query "[?serverFarmId=='${func_plan_id}'].name" -o tsv
  az functionapp list -g "$RG" --query "[?serverFarmId=='${func_plan_id}'].name" -o tsv
} | sed '/^$/d' | sort)"
expected_old_plan_sites="$(printf '%s\n%s\n' "$FUNC" "$WEB" | sort)"
require_equal "$old_plan_sites" "$expected_old_plan_sites" "旧 Plan を使用するサイト"

echo "事前確認 OK"
echo "  移行元: ${func_plan_id}"
echo "  移行先: ${target_plan_id} (${target_location}, ${target_kind})"
echo "  再作成: ${FUNC}, ${WEB}"

me="$(az ad signed-in-user show --query id -o tsv)"
upn="$(az ad signed-in-user show --query userPrincipalName -o tsv)"
infra_args=(--location japaneast --name poc-compass-infra --template-file "$ROOT/infra/main.bicep"
  --parameters "$ROOT/infra/parameters/prod.bicepparam" --parameters adminEmails="$upn" deployerPrincipalId="$me")

echo
echo "=== Bicep what-if（App Service の削除・再作成は次の --apply で行う） ==="
env -u MSYS_NO_PATHCONV az deployment sub what-if "${infra_args[@]}" --result-format ResourceIdOnly

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "プレビューのみ実行しました。内容を確認後、実行する場合は: ./scripts/recreate-app-services.sh --apply"
  exit 0
fi

answer="${RECREATE_CONFIRMATION:-}"
if [ -z "$answer" ]; then
  read -r -p "${FUNC} と ${WEB} を削除・再作成し、${OLD_PLAN_NAME} を削除します。続行するには RECREATE と入力: " answer
fi
if [ "$answer" != "RECREATE" ]; then
  echo "中止しました"
  exit 1
fi

func_principal_id="$(az functionapp show -g "$RG" -n "$FUNC" --query identity.principalId -o tsv)"
web_principal_id="$(az webapp show -g "$RG" -n "$WEB" --query identity.principalId -o tsv)"
key_vault_id="$(az keyvault show -g "$RG" -n pcc-kv-5etqg --query id -o tsv)"
foundry_id="$(az cognitiveservices account show -g "$RG" -n poc-compass-foundry-5etqg --query id -o tsv)"
cosmos_name="$(az cosmosdb list -g "$RG" --query "[?name=='poc-compass-cosmos-5etqg'].name | [0]" -o tsv)"
if [ -z "$cosmos_name" ]; then
  echo "停止: Cosmos DB poc-compass-cosmos-5etqg が見つかりません" >&2
  exit 1
fi

# A recreated system-assigned identity gets a new principal ID. These exact stale assignments
# have deterministic names in Bicep and must be removed before Bicep can create replacements.
delete_role_assignment "$key_vault_id" "$func_principal_id" "$ROLE_KV_SECRETS_USER"
delete_role_assignment "$key_vault_id" "$web_principal_id" "$ROLE_KV_SECRETS_USER"
delete_role_assignment "$foundry_id" "$func_principal_id" "$ROLE_OPENAI_USER"
cosmos_assignment_ids="$(az cosmosdb sql role assignment list -g "$RG" -a "$cosmos_name" \
  --query "[?principalId=='${func_principal_id}' && contains(roleDefinitionId, '${ROLE_COSMOS_DATA_CONTRIBUTOR}')].id" -o tsv)"
if [ -n "$cosmos_assignment_ids" ]; then
  while IFS= read -r assignment_id; do
    az cosmosdb sql role assignment delete -g "$RG" -a "$cosmos_name" -i "$assignment_id" --yes
  done <<< "$cosmos_assignment_ids"
fi

func_resource_id="${func_plan_id%/serverfarms/${OLD_PLAN_NAME}}/sites/${FUNC}"
web_resource_id="${web_plan_id%/serverfarms/${OLD_PLAN_NAME}}/sites/${WEB}"
az rest --method delete --url "https://management.azure.com${func_resource_id}?api-version=2023-12-01" --only-show-errors
az resource wait --ids "$func_resource_id" --deleted --interval 10 --timeout 600
az rest --method delete --url "https://management.azure.com${web_resource_id}?api-version=2023-12-01" --only-show-errors
az resource wait --ids "$web_resource_id" --deleted --interval 10 --timeout 600

env -u MSYS_NO_PATHCONV az deployment sub create "${infra_args[@]}" --query properties.provisioningState -o tsv
# The corporate SSL inspection proxy presents an untrusted certificate to SCM.
# Limit the workaround to these two package uploads; ordinary Azure CLI calls remain verified.
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 "$ROOT/scripts/deploy.sh" api
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 "$ROOT/scripts/deploy.sh" web

new_func_plan_id="$(az functionapp show -g "$RG" -n "$FUNC" --query serverFarmId -o tsv)"
new_web_plan_id="$(az webapp show -g "$RG" -n "$WEB" --query serverFarmId -o tsv)"
require_equal "$new_func_plan_id" "$target_plan_id" "再作成後の Function App の App Service Plan"
require_equal "$new_web_plan_id" "$target_plan_id" "再作成後の Web App の App Service Plan"
require_true "$(az functionapp function list -g "$RG" -n "$FUNC" --query 'length(@) >= `2`' -o tsv)" "Function の再デプロイを確認できません"
require_equal "$(az webapp show -g "$RG" -n "$WEB" --query state -o tsv)" "Running" "再作成後の Web App の状態"

remaining_old_plan_sites="$({
  az webapp list -g "$RG" --query "[?serverFarmId=='${func_plan_id}'].name" -o tsv
  az functionapp list -g "$RG" --query "[?serverFarmId=='${func_plan_id}'].name" -o tsv
} | sed '/^$/d')"
if [ -n "$remaining_old_plan_sites" ]; then
  echo "停止: 旧 Plan にまだサイトがあります: ${remaining_old_plan_sites}" >&2
  exit 1
fi
az appservice plan delete -g "$RG" -n "$OLD_PLAN_NAME" --yes

echo "完了: ${FUNC} と ${WEB} を ${SHARED_PLAN_NAME} に再作成し、${OLD_PLAN_NAME} を削除しました。"
