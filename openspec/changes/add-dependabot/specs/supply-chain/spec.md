# supply-chain（供給網対策）仕様差分

本 change による capability `supply-chain` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: GitHub Actions の更新自動化
テンプレートは SHA ピンした action の更新 PR を dependabot で自動化しなければならない（SHALL）。
設定は `.github/dependabot.yml`（github-actions ecosystem・weekly）に置き、
SHA ピン＋タグ併記コメントの既存規律を維持する。

#### Scenario: 新版 action の検出
- **WHEN** ピン先 action に新しいリリースが出た
- **THEN** dependabot が SHA とタグ併記コメントを更新する PR を自動で作成する

#### Scenario: 既存ピン規律の維持
- **WHEN** dependabot PR がマージされた
- **THEN** workflow の action 参照は SHA ピン＋タグ併記コメント形式のまま保たれる
