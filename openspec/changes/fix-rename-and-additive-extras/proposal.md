# 改名対象漏れと extras の非加算動作を修正する

## Why

- `task rename -- <module> --apply` 後も `CONTEXT.md` のプロジェクト名がテンプレート既定名のまま残る。
- 個別の `task setup:<extra>` は exact sync のため、後から別 extra を導入すると先に導入した extra 固有パッケージを削除し得る。また、2 回目以降の `task setup` でも導入済み extras が削除され得る。

## What Changes

- rename のホワイトリストへ `CONTEXT.md` を追加し、公開 CLI 経由の回帰テストを追加する。
- ローカル用の `task setup` と個別 extra setup を inexact sync にし、導入済み extras を保持する。
- inexact sync が余剰パッケージ全般を保持することと、コアだけへ戻す exact sync の手順を文書化する。
- CI の locked/exact sync と `task setup:all` の挙動は変更しない。

## spec-holes フェーズ1

### 要件1: rename が下流向け文脈名も更新する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | `CONTEXT.md` が空または不在の場合 | 1: 空は no-op、不在は既存ホワイトリスト規約どおり skip |
| 2 | 境界値 | 非該当 | 序数的な入力ではない | — |
| 3 | 重複・衝突 | 該当 | 旧名が複数回ある場合 | 1: 他の対象ファイルと同じく全出現を置換 |
| 4 | 順序 | 非該当 | ファイル処理順は観測結果に影響しない | — |
| 5 | 型・形式不正 | 該当 | 非 UTF-8 の `CONTEXT.md` | 2: 既存 rename 全体の UTF-8 前提を維持し、本 change では扱わない |
| 6 | エラー経路 | 該当 | 適用後の `uv sync` 失敗 | 2: 既存の警告・非ゼロ終了を維持し、本 change では変更しない |
| 7 | 冪等性・再実行 | 該当 | 同じ rename の再実行 | 1: 旧名がなければ no-op の既存規約を維持 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 該当 | Unicode の新 module 名 | 1: Python 識別子として有効なら既存検証規約を維持 |
| 10 | 数値 | 非該当 | 数値計算を扱わない | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | 巨大な文脈ファイル | 2: 小規模 Markdown を前提とし、本 change ではストリーミング化しない |
| 12 | 状態遷移の未定義パス | 該当 | 既に改名済み、または `CONTEXT.md` だけ旧名が残る状態 | 1: 旧名が存在する対象だけ置換し、既存の部分回復動作を維持 |

### 要件2: ローカル setup が導入済み extras を保持する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 非該当 | 各 task は固定 extra 名を持つ | — |
| 2 | 境界値 | 該当 | extra 0 件、1 件、複数件の状態 | 1: 初回 setup は従来同様、導入済み extra があれば以後保持 |
| 3 | 重複・衝突 | 該当 | 同じ extra task の再実行 | 1: 冪等に同期する |
| 4 | 順序 | 該当 | research→notebook と notebook→research | 1: どちらの順序でも両方を保持 |
| 5 | 型・形式不正 | 非該当 | 公開 task は宣言済み extra 名だけを使う | — |
| 6 | エラー経路 | 該当 | `uv sync` が失敗する場合 | 1: Task が非ゼロ終了を伝播する既存動作を維持 |
| 7 | 冪等性・再実行 | 該当 | setup の反復 | 1: 導入済み extras を落とさず再同期する |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 非該当 | extra 名は固定 ASCII | — |
| 10 | 数値 | 非該当 | 数値計算を扱わない | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | all extras の大きな環境 | 2: 既存の `setup:all` の責務であり、本 change では依存量を変えない |
| 12 | 状態遷移の未定義パス | 該当 | extra 導入後の通常 setup、extra の削除 | 1: 通常 setup は保持。削除は exact な `uv sync` を明示操作として文書化 |

## spec-holes フェーズ2対応表

| 穴 | 検証形態 | テスト（予定） | 備考 |
| --- | --- | --- | --- |
| `CONTEXT.md` 不在・空 | 例示テスト | 既存 dry-run/no-op テスト＋新規 CLI fixture | 不在 skip はホワイトリストの既存挙動 |
| 旧名の複数出現・部分回復 | 例示テスト | rename CLI fixture | 公開 CLI で確認 |
| rename 再実行 | 既存テスト/CI | rename-smoke | 既存保証を維持 |
| 個別 extras の順序・反復 | 設定契約テスト＋実動作 | Taskfile 回帰テスト、verify-change の一時環境 | 外部 CLI 境界のため Hypothesis 不使用 |
| setup 後の extra 保持 | 設定契約テスト＋実動作 | Taskfile 回帰テスト、verify-change の一時環境 | `--inexact` の実挙動を確認 |
| extra の削除 | 文書＋実動作 | exact `uv sync` の一時環境確認 | 公開のリセット手順 |
