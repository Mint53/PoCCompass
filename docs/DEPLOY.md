# デプロイ手順（RUNBOOK）

対象: サブスクリプション「ICC GAIN検証用」（`9ddf8e17-37ce-4e3d-9a24-6518dabec332`）/ RG `poc-compass-rg`

## 前提

- Git Bash、Azure CLI（`az login` 済み、サブスクリプションの Owner）、Azure Functions Core Tools 4.x、Node.js 20、Python 3.11
- `PocCompassFunc/.venv` を作成済み（`py -3.11 -m venv .venv` → `./.venv/Scripts/python.exe -m pip install --use-feature=truststore -r requirements-dev.txt`）
- `PocCompassFront` で `npm ci` 済み

## 構成（2026-10-08 時点の実リソース）

| 役割 | リソース名 | リージョン |
|---|---|---|
| 画面（Next.js, Entra ID ログイン） | `poc-compass-web-5etqg`（App Service, Linux Node 20） | Japan West |
| API（Functions Python 3.11） | `poc-compass-func-5etqg` | Japan West |
| 共有 App Service Plan | `poc-compass-plan`（B1） | Japan West |
| DB | `poc-compass-cosmos-5etqg`（Cosmos DB サーバーレス, DB `poc-compass`, キー認証無効） | Japan East |
| AI | `poc-compass-foundry-5etqg`（AI Foundry, デプロイ `gpt-5.4` GlobalStandard 50K TPM, キー認証無効） | Japan East |
| シークレット | `pcc-kv-5etqg`（Key Vault, RBAC） | Japan East |
| 監視 | `poc-compass-appi` / `poc-compass-law` | Japan East |
| ログイン | Entra ID アプリ登録「PoC Compass」（clientId は `infra/parameters/prod.bicepparam`） | — |

- App Service は Japan East の VM クォータ（4/4）が上限のため Japan West に置いた。
- Functions → Cosmos / Foundry はマネージド ID（キーなし）。Web → Functions は Functions のホストキー `frontend`（Key Vault `backend-function-key`）を Next.js サーバー側で付与。

## 通常のデプロイ

```bash
./scripts/deploy.sh api
```

```bash
./scripts/deploy.sh web
```

インフラを変えたとき（what-if を表示し、`yes` 入力で実行）:

```bash
./scripts/deploy.sh infra
```

成功判定:

1. `api`: 最後に `API deployed:` が出る。`az functionapp function list -g poc-compass-rg -n poc-compass-func-5etqg -o table` に `http_app_func` と `daily_evaluation` がある
2. `web`: `https://poc-compass-web-5etqg.azurewebsites.net` を開くと Microsoft のサインイン画面 → サインイン後に「取り組み一覧」
3. 画面で取り組みを 1 件作り、「AI で評価」が完了する（初回は 1 分程度かかる。HARNESS.md §5）

## 失敗したとき

| 症状 | 確認 | 対処 |
|---|---|---|
| 画面で「サーバーに接続できませんでした」/ 401 | Web App の設定 `BACKEND_FUNCTION_KEY` の Key Vault 参照が解決しているか（ポータル → 構成 → 状態） | `./scripts/deploy.sh api` を再実行（キーを再発行して Web を再起動） |
| AI 評価が 503 / 502 | Functions のログ（Application Insights `poc-compass-appi`） | ロール付与直後は数分待つ。Foundry の `gpt-5.4` デプロイの状態を確認 |
| ログイン後にエラー | アプリ登録のリダイレクト URI が `https://poc-compass-web-5etqg.azurewebsites.net/.auth/login/aad/callback` か | `az ad app update --id <clientId> --web-redirect-uris <URI>` |
| クライアントシークレット期限切れ（発行日 2026-10-08、1 年） | — | `az ad app credential reset --id <clientId> --append` の値を Key Vault `auth-client-secret` に保存し Web App を再起動 |

## 利用者の追加

- サインインは同じテナントのユーザーなら誰でも可能。取り組みを見られるのは**その取り組みのメンバーだけ**（設定画面で作成者が追加）。
- 管理者（モード設定を編集できる人）は Functions のアプリ設定 `ADMIN_EMAILS`（カンマ区切り）。`./scripts/deploy.sh infra` はデプロイ実行者のみを設定するので、追加する場合は Bicep パラメータを変更する。
