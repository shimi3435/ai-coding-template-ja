# Tasks: change close 時の軽量ふりかえり規約を追加する

- [x] 1. `docs/agents/workflow.md` に「change close 時の軽量ふりかえり」節を新設する
       （記録先＝docs/template/retrospectives.md・固定 1 行形式・「逃した欠陥」の定義・
       発見経路 4 分類・更新規則（マージ後発見分の遡及追記・1 change = 1 行維持）・
       適用範囲＝テンプレート自身のみ・下流は任意採用）。
- [x] 2. `docs/template/retrospectives.md` をヘッダのみで新規作成する（形式の owner は
       workflow.md に委譲し二重化しない）。
- [x] 3. `openspec/project.md` の「テンプレート自身の change 運用」に close 時ふりかえりの
       1 行参照を追記する。
- [x] 4. `task check` と `task openspec:validate` が green であることを確認する。
- [x] 5. self-review で spec-holes の穴リスト（proposal 記載 H1〜H13）と本文の突き合わせを行う
       （H10 の「破棄 change は対象外」が本文未記載だった不一致を検出・修正済み）。
- [ ] 6. close: マージ前の最終コミットで本 change ディレクトリを削除し、本 change 自身の
       ふりかえり行を retrospectives.md に記録する（dogfood・初エントリ）。
