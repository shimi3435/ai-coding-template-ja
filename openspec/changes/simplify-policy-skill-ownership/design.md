# 設計と比較根拠

## 用語集の由来

CONTEXT.md は上流ファイルのコピーではない。commit d342826c1ccee510d2946c622b33953e65f1678e / PR #1 が、grill-with-docs の Q1–Q9 で決めた中核語をこのファイルへ記録したと明記している。初版はコア層、オプション層、単一の正、Skill 実体の4語である。その後の変更もこの repository の運用に関するものだった。

`## Language`、太字の見出し、`_Avoid_` は同梱 domain-modeling/CONTEXT-FORMAT.md の形式と一致する。移行するのは自分たちの用語集の保存名であり、上流の用語集による内容の置換ではない。

## 外部 Skill の採用

2026-10-28 に確認した mattpocock/skills main は 59db609eb1e18aaf59b63284d0e52255aff0c63c。既存の code-review、diagnosing-bugs、domain-modeling、grill-me、grill-with-docs、grilling、tdd と、追加の setup-matt-pocock-skills、codebase-design を同commitへ揃える。remote ownership と出典・MIT license を維持する。

grilling は質問の共通手順、grill-me は文書を残さない明示入口、grill-with-docs は用語集とADRを残す明示入口であり、短いwrapperでも用途差がある。診断の再現ループ、TDDのテスト品質、domain-modelingの用語合意も異なる失敗を扱う。

最新版の diagnosing-bugs は improve-codebase-architecture への誘導を持たない。setup内の利用例や「未導入なら省略」と明記された triage は、必要な呼出依存とみなさない。setupの同梱と実行は別であり、同梱を理由にラベル作成や外部writeを実行しない。

新しい domain-modeling は GLOSSARY.md を読み書きするため、旧名を並行して維持しない。prune、package rename、contract tests、live policy の参照を同時に移す。歴史記録にある旧名は当時の記録として保持する。

## 責務の正本

- AGENTS.md: repository invariant、独立レビュー必須条件、参照先。
- docs/agents/workflow.md: task形式、実行・レビュー・修正・検証・停止・完了の共通手順。
- execute-openspec-change: 開始前確認、既存差分の保護、所有権記録、中断・復帰。
- self-review: 自分の差分の検査と指摘。修正は呼出元の実行担当が所有する。
- spec-holes: 要件ごとに12分類で穴を発見する。非該当を追跡可能な形で集約し、テスト候補を提示する。
- verify-change: focused validation、該当する実動作、project gatesと、検証済み・非該当・未検証の区別。

## Reference 比較

- [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/): 小さい入口から正本文書へ進む構成を採用する。常時コンテキストへの手順集約は採用しない。
- [OpenSpec apply](https://github.com/Fission-AI/OpenSpec/blob/6d04a1b58dedc95729d34e4f223d9d483aae210a/skills/openspec-apply-change/SKILL.md): tasks実行・checkbox更新・停止を提供する。CLI必須のため、CLI任意、差分所有権、実装と検証の別完了というproject差分は残す。
- [OpenSpec verify](https://github.com/Fission-AI/OpenSpec/blob/6d04a1b58dedc95729d34e4f223d9d483aae210a/skills/openspec-verify-change/SKILL.md): artifactsとの整合検査は参考にするが、必須project gateや実動作確認の代用にしない。
- [Superpowers writing-skills](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/writing-skills/SKILL.md): 行動を変えるfirst-party Skillについて、隔離した実エージェントでSkill有無を比較する。全referenceへの一律の重い評価や通常CIへの評価基盤追加は採用しない。
- [Spec Kit analyze](https://github.com/github/spec-kit/blob/222a973f8b8794366680c043fb935a31f71902af/templates/commands/analyze.md): 要件・設計・tasks間の不足と矛盾を確認する考え方を採用する。別の仕様体系やrouterは導入しない。
- [GitHub customization](https://docs.github.com/en/copilot/reference/customization-cheat-sheet)、[Claude Code extensions](https://code.claude.com/docs/en/features-overview): 常時指示、再利用手順、決定的な検査、外部情報、隔離した委譲を区別する。vendor固有の起動方法を共通policyへ持ち込まない。

## Spec holes

各要件に12分類を評価した。以下の番号は現行spec-holesの分類に対応する。

- R1 上流整合: 1 欠落依存は補完、2 同梱範囲は選定9件、3 source/lockの重複は既存validatorで拒否、4 取得・検証後に統合、5 metadata形式は既存validator、6 取得失敗は統合しない、7 同じcommitで冪等検証、8 時刻は非該当（commit固定）、9 UTF-8と上流bytesを保持、10 数値は既存validatorの範囲、11 取得制限は既存機構、12 未検証候補を配布可能としない。
- R2 用語集: 1 新ファイルの欠落は失敗、2 全用語を保持、3 旧名を並行維持しない、4 Skill更新と参照移行を一体で検証、5 Markdown本文を保持、6 部分移行は完了にしない、7 再実行で二重生成しない、8 時刻は非該当、9 日本語・改行・内容を保持、10 数値は非該当、11 サイズ境界は非該当（固定文書）、12 過去記録は変更対象外。
- R3 責務集約: 1 正本・参照先の欠落は失敗、2 全必須条件を維持、3 条件の重複ownerを除去、4 共通workflow順序を維持、5 参照解決を検証、6 検証失敗を完了扱いしない、7 同じ根拠で重複レビューを義務化しない、8 時刻は非該当、9 表記変更と意味の変更を区別、10 回数上限を維持、11 文量自体を品質指標にしない、12 未検証・非該当を区別する。

R1は既存offline検証、上流とのbytes比較、呼出依存の読取り監査へ対応する。R2は内容一致、rename公開CLI、pruneテストへ対応する。R3は正本のcontract testsと、変更したfirst-party Skillの手動behavior比較へ対応する。未実行の検証はtasks.mdに残す。

## 承認済みの追加判断: 上流の質問テンプレートとR06

最新のgrillingは、言語指定のないfence内に `<question title>` や `<question body, might be multiple paragraphs, including multiple choices>` を置く。現行R06は単語形式のplaceholderだけを認め、それ以外をBash ASTへ渡すため、最新入力のproject checkが失敗する。現行の「任意のproseを推測して除外しない」という契約どおりの失敗であり、上流本文の改変や検査対象からの除外では解消しない。

2026-10-29に利用者が推奨案を承認した。追加仕様は、文書用の弱い入力区分（inline、言語指定なしfence、console）に限り、複数語の説明placeholderを明示的に追加すること。文法はASCII英字またはunderscoreで始まり、ASCII英数字、underscore、hyphen、space、comma、period、parenthesesだけを含み、末尾にspaceを置かない山括弧内の語句とする。引用・escape済みの文字列はliteralのまま扱う。shell演算子、展開、改行を含むものは追加文法に含めない。

追加placeholderは既存のplaceholder同様にpartialとし、同じ入力に残る既知コマンドと参照を検査し続ける。`< input >` のredirection扱い、明示的なsh / bash / shell fenceと実行用shellの既存解釈は維持する。対照検証は上流テンプレート全体、単語形式、複数語形式、引用・escape、shell演算子の混入、後続コマンドの検出、明示shell区分を含める。

R06の公開仕様、spec delta、spec-holes、Task 1の対象・検証を更新し、新しいcycleで実装・独立review・project check・独立verificationを行う。inlineの改行正規化前に改行を含む語句は追加文法の対象外とする。


### R4 spec-holes と検証対応

- 1 空・欠損: 該当。空の山括弧は追加対象外。拒否対照テストで確認する。
- 2 境界: 該当。先頭はASCII英字またはunderscore、末尾space不可。最短・境界の対照テストで確認する。
- 3 衝突: 該当。仮tokenは原文と衝突せず、異なる語句を区別する。重複・引用復元テストで確認する。
- 4 順序: 該当。同じ入力内の後続コマンド検査を継続する。公開inspectで確認する。
- 5 形式: 該当。許可文字以外、引用・escape、明示shellを追加対象外とする。区分別の対照テストで確認する。
- 6 エラー: 該当。未対応構文は従来どおり解析失敗。proseへのfallbackは禁止する。対照テストで確認する。
- 7 再実行: 該当。入力を変更せず同じ解析結果を返す。実parserの反復テストで確認する。
- 8 時刻: 非該当。時刻・TZを参照しない純粋な入力分類である。
- 9 文字列: 該当。語句はASCII限定、原文の改行を跨がない。前後の日本語・絵文字とLF / CRLFの元位置を保持する。位置・改行テストで確認する。
- 10 数値: 非該当。数字は文字として扱い、数値演算を行わない。
- 11 巨大入力: 非該当。新しいサイズ上限や実行基盤は追加せず、既存parserのresource制約を維持する。
- 12 状態遷移: 該当。placeholderはpartial、既知の保守依存はinconsistentとして検出する。bundled / pruned両構成の公開inspectで確認する。


## Task 2–4の実装境界（2026-10-30）

利用者の継続依頼を受け、既存の責務分担を実装する。独立レビュー条件の意味は変えず、AGENTS.mdの見出しを「独立レビュー必須条件」へ改名する。共通workflowはtask形式・選択・進捗・blocker記録、review順序・上限・証跡再利用・完了を所有する。executorは同workflowを読んでpreflight、dirty保護、所有権snapshot、再開を担う。空task、曖昧path、依存重複、snapshot欠落を許可する変更は行わない。

self-reviewはstandalone / convergenceの両方でreport-onlyとし、修正・検証実行・checkbox更新は実行担当が担う。spec-holesは各要件を12分類すべて評価するが、共通理由の非該当項目は分類番号と理由をまとめられる。穴の処理先と検証候補までを出力し、実装・検証・進捗は所有しない。verify-changeは共通workflowの証跡規則に従ってfocused validation・実動作・project gateを検証し、verified / N/A / unverifiedと理由を報告する。review起動やtask進捗更新は所有しない。

GLOSSARY.mdの既存語義を保持し、手順・規則列挙はownerへの参照へ置き換える。openspec/project.mdはartifact配置とテンプレート固有close規約に集中する。code-reviewは利用者の明示入口であり、scope・仕様・独立性が一致する既存結果を独立reviewとして利用できるが、必須工程へ追加しない。remote-owned Skillとlegal / source / lock / linksはTask 1から変更しない。

検証は恒久contract testsを「各ファイルに同じ文章がある」確認から「正本に契約があり、利用側から到達できる」確認へ変更する。12分類・停止条件・境界fixtureは保持する。変更した4 Skillについて、使い捨てworkspaceで同じ入力をSkillなし / ありの独立agentへ与える手動比較を行い、内容の違い・file変更・状態判定を確認する。通常CIへ実agent評価器や新parserは追加しない。これは実装の委譲ではなく、承認済みの手動behavior検証である。

R3の12分類auditは上記のとおり維持する。欠落・形式・順序・重複はowner/navigationと既存preflight fixtures、エラー・再実行・状態遷移はreport-only、dirty/resume、unverifiedの対照scenarioへ対応させる。表記・数値は旧規則名除去とreview上限保持のcontractで検証する。時刻は非該当（実行順序で決まり時刻を参照しない）、巨大入力は固定size capを導入せず読めないrequired evidenceを未検証とする既存規則で扱う。
