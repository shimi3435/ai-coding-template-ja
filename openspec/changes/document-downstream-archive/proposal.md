# 下流向けOpenSpec archiveフロー

## Why

Issue #66: https://github.com/shimi3435/ai-coding-template-ja/issues/66

下流に残る文書がテンプレート保守用の削除型closeを案内しており、通常のspec同期・履歴保存と
混同する余地がある。#73反映済みのlive contractを基に、同一実装PRでのarchiveとexecutorの
引き渡し境界を明文化する。利用者はgrilling Q1〜Q10と最終合意を承認済み。

## What Changes

- 下流の正本をdocs/agents/workflow.mdとし、実装・verify・review・archive・再検証・mergeの順序を定める。
- openspec/project.mdは構成と参照を所有し、削除型closeの詳細をdocs/template/release.mdへ移す。
- executorはactive-onlyを維持し、implementation complete、archive-ready、archive completeを区別する。
- テンプレート保守の引き渡しはclose-readyと呼び、運用モードと次操作を明示する。判定条件・状態管理機構は増やさない。
- 手動fallback、部分失敗、衝突、並行変更、同期済み、archive後修正を手順化する。
- 最小限の恒久的な静的contract testsを追加する。CIやvalidatorの検査範囲は変更しない。
- 外部review後の合意に基づき、完了操作前の運用選択、実prune後の参照整合、shell引数の保全、
  CLI利用時の対象canonical specのstrict検証を追加する。CLI呼出と実pruneの回帰も検証する。

## Impact

公開運用interfaceと公開Skillの変更のため、共通workflowに従う独立reviewと別verifierを必須とする。
design.md、specs/downstream-archive/spec.md、spec-holes.mdを必須artifactsとする。
利用者の追加依頼により、再reviewのP3（保守側の引き渡し表現）を修正し、検証後にcommit・push・PR作成まで行う。
PR #96の追加review後の合意に基づき、canonical書き込み先のalias保護、最新HEADの承認確認、UTC保存先と日本時間の記録を追補する。
失敗CIの同HEADでの1回再実行、修正後の新HEADのCI確認とPR更新も行う。
merge、change削除は今回の依頼に含めず、明示操作へ委ねる。
テンプレート自身の空出荷規約、新しい設定・同期engine・archive Skill・外部orchestrator、bulk-archive実装は対象外。
