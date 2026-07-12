# release-checklist（リリース前チェックリスト）仕様差分

本 change による capability `release-checklist` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: リリース前のバージョン結合記述の陳腐化点検
`docs/template/release.md` のリリース前提チェックは、バージョン結合記述の陳腐化点検 1 項目を含まなければならない（MUST）。点検対象: (1) CI の openspec CLI exact pin（ci.yml の `@fission-ai/openspec@X.Y.Z`）が現在検証済みの版と一致しているか、(2) Codex plugin 等の実機挙動を根拠とする docs 記述が現バージョンでも成立するか、(3) `task skills:upstream` を実行して上流乖離を確認したか。点検の実施は毎リリース必須だが、検出された乖離への対応（更新か据え置きか）は人判断であり、据え置きのままのリリースを妨げない。`task skills:upstream` が実行できない場合（ネットワーク不通等）は、未実施であることを認識した上で人が判断する。

#### Scenario: リリース準備でチェックリストを辿る
- **WHEN** 保守者がリリース前提チェックを実施する
- **THEN** 陳腐化点検（exact pin・実機挙動記述・skills:upstream）の項目が存在する

#### Scenario: 上流乖離が検出された
- **WHEN** `task skills:upstream` が WARN を報告する
- **THEN** 対応（更新か据え置きか）は人判断であり、据え置きのままリリースしてよいことが読み取れる
