# テンプレ自身のメタ文書を `docs/template/` に隔離し下流を汚さない

このテンプレは自分の設計判断を ADR（0001-0006）として持ち、`grill.md` / `docs/grill/` に構築記録を持つ。これらは**テンプレの作り方**の記録であり、「Use this template」で作成した下流の研究リポジトリには無関係なノイズになる。研究者は自分の研究判断（モデル選択・実験設計の理由）を ADR として積みたいのに、テンプレ ADR が `docs/adr/` を占有すると混ざる。

そこでメタ文書と下流用スキャフォルドの**名前空間を分離**する。

- テンプレ自身のメタ文書（ADR 0001-0006・`grill.md`・`docs/grill/`）は `docs/template/` 配下へ隔離する（`docs/template/adr/` / `docs/template/grill/`）。
- 下流の研究 ADR 用に `docs/adr/` は**空出荷**（`0000-template.md` の道標 1 枚のみ）。研究者は自分の判断をここに積む。
- `grill.md` は PR2 で `docs/template/grill/` 配下へ移動し root から消す。`task prune-template-docs` は `docs/template/` を一括削除する（移動後は `grill.md` もこの配下にあるため対象に含まれる）。
- `task doctor` は「テンプレ ADR/grill が残存（任意 prune 可）」を **INFO** 表示する（green を壊さない）。
- AGENTS.md / doctor はテンプレ ADR に**機能依存しない**（参照は説明用のみ）。prune しても壊れない。
- ADR-0005 の `TEMPLATE_VERSION` は prune 後も残す（由来追跡のため）。

> 注: 物理的な移動（現 `docs/adr/0001-0006` → `docs/template/adr/`）は実装フェーズ（PR2）で行う。本 planning workspace では `grill.md` 内の参照を壊さないため現位置に置いたまま記録する。

## Considered Options

- **現状維持（テンプレ ADR を `docs/adr/` に恒久残置・下流と混在）**: 追跡は楽だが、下流が研究 ADR と区別できずノイズ化。`task rename` はパッケージ名しか触らないため残置が常態化。却下。
- **テンプレ ADR をリリース時に削除（同梱しない）**: 下流は綺麗だが、テンプレの判断根拠を下流から辿れず、ADR-0005 の手動更新時に文脈が失われる。却下。

## Consequences

- `docs/` のディレクトリ規約が「`docs/adr/` = 下流用・`docs/template/` = テンプレ用」と二分される。README / AGENTS に明記する。
- `task prune-template-docs` の削除対象を `docs/template/` に固定（PR2 で `grill.md` を `docs/template/grill/` へ移動済のため root の追加列挙は不要。`TEMPLATE_VERSION` は対象外）。
- 新規にテンプレ判断を足すときは `docs/template/adr/` に書く（`docs/adr/` には書かない）。ただし本 planning workspace（テンプレ実装前）では既存 ADR 0001-0006 は `docs/adr/` に置いたままとし、物理移動は PR2 で行う。
