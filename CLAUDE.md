# PoC Compass — プロジェクトのルール（AI エージェント・人 共通）

PoC／企画／業務改善の「目的・仮説・成功条件・タスク」を一元管理し、目的からのズレを AI が検知する社内ツール。
**ぶれないための仕組み（ハーネス）は [docs/HARNESS.md](docs/HARNESS.md)。着手前に必ず読む。**

## 正本（迷ったらここ）

| 何の正本か | ファイル |
|---|---|
| 仕様・数値・閾値・API の振る舞い | [docs/SPEC.md](docs/SPEC.md)（**仕様変更は先にここを直す**） |
| 機能一覧と受け入れ条件・状態 | [docs/FEATURES.md](docs/FEATURES.md) |
| API の型（フロント） | `PocCompassFunc/openapi.json` → `PocCompassFront/lib/api/schema.d.ts`（**生成物。手で書かない**） |
| モードの既定値 | `PocCompassFunc/app/modes/defaults.py` |
| インフラ | `infra/main.bicep` / `infra/modules/resources.bicep` |
| 実装計画・経緯 | `実装計画_PoCCompass_20261008.md` |

## 完了の定義

`scripts/check.sh` が **ALL CHECKS PASSED**（デプロイ前・UI 変更時は `--full`）。
失敗したまま「できました」と言わない。Stop フックが自動で走らせ、失敗なら作業を続けさせる。

## 変えてはいけない設計（不変条件）

1. **モードでデータ構造を分岐しない。** 汎用スロット（goal/assumption/criterion/task/evidence）共通。モード差は `ModeDefinition`（ラベル・プレースホルダ・重み・プロンプト指針）だけ。`if mode == ...` を書かない。
2. **健全度・件数は AI に計算させない。** `services/metrics.py` の決定的計算のみ。AI はタスク照合・レポート文・抽出・チャット提案だけ。
3. **AI は直接データを書き換えない。** チャットは提案 → 人が適用。判断（続行/撤退）は人が記録。
4. **層を越えない。** `function_app.py`（トリガーのみ）→ `controllers`（HTTP）→ `services`（業務）→ `repositories`（I/O。Cosmos を知るのはここだけ）。
5. **数値は `app/constants/limits.py`、区分値は `app/constants/enums.py`。** マジックナンバー・マジックストリング禁止。`tests/test_spec_sync.py` が SPEC との一致を検査する。
6. **画面の文言でモード依存の語（仮説・前提・原因仮説…）を直書きしない。** `useApp().modeOf(mode).labels` / `useProject().mode.labels` から取る。
7. **画面から `fetch` しない。** `lib/api/client.ts` 経由（ESLint で禁止済み）。`alert()` 禁止（`useToast`）。
8. **キーレス。** Cosmos・Foundry は Entra ID 認証のみ（`disableLocalAuth`）。API キーを足さない。`AZURE_OPENAI_API_KEY` は PC に別用途で入っていることがあるので読まない。

## よく使うコマンド（Git Bash）

```bash
./scripts/check.sh            # 完了判定（約 1 分）
./scripts/check.sh --full     # + next build + bicep build
./scripts/gen-api.sh          # バックエンドのモデル/ルート変更後に必ず
./scripts/dev-func.sh         # API をローカル起動（:7072、.venv の Python を強制）
cd PocCompassFront && npm run dev   # 画面（:3200）
./scripts/deploy.sh           # Azure へデプロイ（docs/DEPLOY.md）
```

- Python は `PocCompassFunc/.venv/Scripts/python.exe`。`python` 直呼び禁止。
- pip は社内 SSL 検査のため `--use-feature=truststore` を付ける。
- ポート: API 7072 / 画面 3200（他プロジェクトの 7071/3000/3001 と衝突させない）。

## 変更の手順

1. 仕様が変わるなら `docs/SPEC.md` → `docs/FEATURES.md` を先に更新
2. テストを書く／直す（`PocCompassFunc/tests`。AI は `FakeLlm` で置き換える）
3. 実装（上の不変条件を守る）
4. API 形が変わったら `./scripts/gen-api.sh`
5. `./scripts/check.sh` が通るまで直す。画面を触ったらブラウザで実際に確認する
6. 報告は「やったこと／検証（コマンド出力）／未検証・未対応」の三分割

## シークレット

`local.settings.json` / `.env.local` は gitignore 済み。コミットしない（pre-commit フックが止める: `git config core.hooksPath scripts/hooks`）。
