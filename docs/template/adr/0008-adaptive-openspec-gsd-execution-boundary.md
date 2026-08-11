# OpenSpec / GSD の適応型実行境界を採用する

> Status: Superseded by [ADR-0010](0010-openspec-direct-execution.md). 本文は当時の判断を示す履歴として保持する。
> Supersedes: [ADR-0003](0003-openspec-gsd-boundary.md).

OpenSpec は、change の proposal、design、spec delta、受け入れ基準、`spec-holes`、最終完了判定を
全実行経路の正本として所有する。実装計画と進捗の所有者は change の規模に応じて選ぶ。

経路の選択前に、独立してレビュー・出荷できる成果が複数ないか確認する。独立成果があれば実行
engine でまとめず、依存関係を持つ別 OpenSpec changes に分割する。一体の成果は次のように扱う。

- 単一セッションかつ単一コンテキストで安全に実装・検証でき、依存 phases や有益な隔離並列単位を
  持たない小規模 change は直接実行する。OpenSpec `tasks.md` が詳細タスクと checkbox 進捗を持ち、
  実行主体は `openspec instructions apply --change <id>` の指示、または同じ Markdown artifacts を
  読んで実装する。CLI は実装や checkbox 更新を行わないため、検証済みのタスクを実行主体が
  `- [x]` に更新する。
- 複数セッション、依存順序を持つ複数 phases、有益な隔離並列単位、または単一コンテキストで安全に
  完了・検証できない条件のいずれかを持つ大規模 change は、理由を記録して opt-in の GSD へ
  handoff する。GSD が詳細 plan、phase 実行、phase 進捗を所有し、OpenSpec `tasks.md` は handoff、
  全 phases 完了、OpenSpec 原本検証、project checks、close の境界ゲートだけを持つ。

GSD は OpenSpec の仕様や受け入れ基準を複製・再定義しない。各 phase は一つの OpenSpec change と
担当範囲を参照し、一つの phase に複数 changes を混在させない。GSD 実行中に仕様へ影響する判断が
必要になった場合は OpenSpec を先に更新・validate し、影響 phases を再計画する。

手動 handoff では、change ID、canonical artifact paths、`spec-holes` と validate の状態、経路理由、
完了済み境界ゲート、専用 branch の source commit、未解決事項を確認して GSD に渡す。既存の dirty
changes を自動 stash / commit しない。GSD が利用不能または安全に継続できない場合は自動で直接経路へ
戻さず、既存 commits、完了済み phases、未完了範囲、詳細 `tasks.md` の再構成案を提示して承認を得る。

全 GSD phases が完了しても、それだけでは OpenSpec change を完了としない。OpenSpec 原本の全
requirements / scenarios / `spec-holes` と実装・テスト・理由付き未検証を対応付け、project checks を
含む全境界ゲートが成功した後にだけ完了とする。

## Considered Options

- **ADR-0003 の境界を維持する**: 小規模 change では単純だが、大規模な単一 change で GSD の計画・
  復帰・検証を使えず、または OpenSpec と GSD に詳細計画を二重化する。却下。
- **全 change を GSD で実行する**: 小規模 change に不要な計画・同期コストを課し、GSD が利用できない
  環境を不必要に停止させる。却下。
- **GSD を仕様の正本にする**: OpenSpec と仕様・受け入れ基準が競合し、最終完了判定が二重化する。
  却下。

## Consequences

- 小規模 change は OpenSpec CLI または Markdown fallback だけで完結できる。`--json` を使う場合も、
  JSON は context paths と progress の discovery に限定し、canonical 内容は Markdown から読む。
- 大規模 change は GSD の詳細計画と復帰を利用できる一方、手動 handoff と OpenSpec 原本による最終
  検証が必要になる。bridge、manifest、drift / ownership の機械化は別 change で扱う。
- 実行中に大規模条件を満たした場合は、完了済み checkbox を保持し、未完了範囲を境界ゲートへ
  再構成して承認後にだけ GSD へ昇格する。
- テンプレート自身では一つの PR に一つの active change だけを置く。依存 changes は専用 branches で
  順に実装し、各 change を pre-merge close してから次を base にする。main や backlog に blocked
  proposal を複製せず、main の `openspec/changes/` を空に保つ。
