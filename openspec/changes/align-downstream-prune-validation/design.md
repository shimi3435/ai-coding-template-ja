# 設計: 下流とテンプレート保守の検証境界

文書種別: 設計リファレンス。承認済みの挙動を固定し、内部関数の命名や分割を過剰に規定しない。

## 1. 検証入口と責務

- `./scripts/check.sh`: 下流の正式 gate。Task 起動前の `check-contracts` と、
  成功後の `task check` を維持する。保守文書の内容検証を自動選択しない。
- `task check`: runtime、npm / Python dependency、Taskfile の安全契約、
  remote / legal / links の offline 検証、通常の型・lint・テストを維持する。
- `task check:template`: 保守専用の履歴・release・出荷契約と、使い捨て repository の
  prune 統合検証を実行する。内部で通常 gate を無条件再帰実行しない。
  同梱構成が不完全なら失敗し、資産不在を skip 成功に置き換えない。
- テンプレート保守者のローカル完了確認は `./scripts/check.sh` 成功後に
  `task check:template` を実行する。専用 CI は `task check:template` を使い、
  通常 CI の正式 gate と合わせて両方の成功を必要とする。専用 CI で同一 checkout の
  共通 gate を重複実行せず、二つの workflow の完了順には依存しない。
- repository 名、remote URL、GitHub owner、環境変数によって検証責務を推測しない。

共通 gate は prune 構成の整合を検査するが、同梱状態でも保守文書の記述内容・特定 release 版を
検査しない。通常の lint / format が存在する保守コードを走査することは許す。
保守専用の意味検証・統合テストを通常の pytest / Node test の自動収集へ混入させない。

`TEMPLATE_VERSION` は既存の単一行 SemVer 形式検証を維持し、特定値との一致だけを共通 gate
から外す。本 change ではファイル自体の値を変更しない。出荷版の判断は #70 が所有する。

## 2. 恒久資産の配置と移設

### 下流に残す文書

以下は保守履歴ではなく現在の下流 interface の説明である。実装時に内容を移設し、
prune 実行時に移動や内容推測を行わない。

| 現在 | 移設先 |
| --- | --- |
| `docs/template/repository-contracts.md` | `docs/reference/repository-contracts.md` |
| `docs/template/skill-maintenance.md` | `docs/reference/skill-maintenance.md` |
| `docs/template/skill-metadata-v2.md` | `docs/reference/skill-metadata-v2.md` |

相互リンク、README、guide、workflow の live links を移設先へ揃える。
`docs/reference/prune-template-assets.md` に対象、interface、状態、復旧手順を置く。
README の変更は入口・リンク・削除範囲の説明に限定する。

### 保守側へ移す検証

- `repo-tools/repository-contracts.ts` と対応 tests / fixtures の release handoff と版固定。
- `tests/test_runtime_foundation_contract.py` の release handoff。
- `tests/test_openspec_direct_workflow_contract.py` の過去 ADR の supersede 関係。
- `tests/test_review_convergence_contract.py` の過去 ADR 参照部分。
- `tests/test_tool_neutral_documentation_contract.py` の履歴・出荷 residual allowlist・
  historical release notes・retrospective 内容検証。
- `tests/test_project_gate_contract.py` の保守専用文書に対する検査。

混在するファイルはテスト単位で分ける。現行 policy、公開入口、安全性、下流文書リンク、
撤去済み公開操作の拒否等の回帰テストは通常側に残す。
保守検証の実体は `template-maintenance/` に置き、専用 task が明示選択する。
保守テストは通常側の fixture を利用できるが、逆向きの import は禁止する。

`docs/agents/workflow.md` 内のテンプレート限定の retrospective 手順は保守文書へ移す。
archive / close の既定動作や executor 手順は変更しない。#66 が所有する設計を先行実装しない。
既存 historical records の本文や過去の判断を現行方針で上書きしない。

## 3. prune の対象と保持境界

公開入口は既存の `task prune-template-docs` と `-- --apply` を維持する。
`scripts/prune-template-docs.py` は直接呼出も含め同じ契約を提供する。

固定削除対象:

- `docs/template/`: 下流向け3文書を移設した後の保守文書と履歴。
- `template-maintenance/`: 分離した保守専用コード・テスト・fixtures。
- `.github/workflows/template-maintenance.yml`: 新設する保守専用 workflow。

固定編集対象:

- `Taskfile.yml`: `check:template` task の除去。
- `README.md`: 保守専用のローカル実行案内・リンクを囲む専用区画の除去。
- `docs/agents/workflow.md`: 保守手順への専用リンク区画の除去。

新しい保守 CI は独立 workflow に置き、既存 `.github/workflows/ci.yml` の共通 job を
prune 時に書き換える必要をなくす。同ファイルの既存 job を prune で消さない。
共通文書に残る「prune で何を除去するか」の説明中の path は実行依存や live link と区別する。
通常テストの負例 fixture 内の文字列も実行依存と見なさない。

prune 実装・状態検査・固定対象定義は下流に残す。下流の3リファレンス、`docs/adr/`、
`TEMPLATE_VERSION`、Skill 本体・source / lock・legal・links、通常 CI、通常テストは削除しない。
既存の保守履歴へ除去可能な区画 marker を後付けしない。

区画 marker は `template-maintenance:start` / `template-maintenance:end` とし、
Markdown では HTML comment を使う。重複、片側欠落、入れ子、順序逆転は拒否する。
区画外に専用実行参照が残る場合も拒否する。共有ファイル全体を再生成しない。
Taskfile は task key と対応する source 範囲を特定して編集し、重複 key や曖昧な範囲は拒否する。
対象外部分の bytes、改行、コメント、順序を保持する。

## 4. 状態判定

判定は固定の必須 path 集合、file type、共有ファイルの専用項目、live references の整合で行う。
実装の固定対象定義は path / 種別 / 区画を列挙するだけとし、利用者が profile を選ぶ設定、
本文 hash、実行 receipt、Git の過去 commit への参照は持たない。
必須集合には残す保守文書を file 単位で列挙し、一部文書の欠落も検出する。
新しい保守必須ファイルを追加する変更では、定義と対応 tests を同時に更新する。

- **同梱**: 全必須保守資産と専用 task / workflow / 区画が揃い、型と参照が整合する。
  文書内容の正しさは保守 gate が検査する。
- **完全除去**: 固定削除対象が存在せず、専用項目と live references が残っていない。
  下流必須資産は保持されている。
- **不整合**: 上記のどちらでもない。欠落、空の必須文書、壊れた link、誤った file type、
  空ディレクトリだけの残存、共有設定の片側変更等を含む。

一般の下流破損は共通 gate の該当検査が拒否する。完全除去によって共通検証を skip しない。
操作記録がないため、手動で同じ最終構成にした状態も完全除去として受理する。
旧 prune の文書だけ欠落した状態は不整合であり、自動移行・自動補完しない。

完全除去での再実行は、変更を一切しない構成検査を先に行い no-op 成功する。
直前の prune 差分が未コミットであるだけでは拒否しない。
ただし shared file の構文破損、残存参照、再出現した対象資産は成功扱いしない。
この read-only no-op は、実際の変更に必要な「削除対象が追跡済み」という条件の例外である。
prune コマンドとしての Git / HEAD / repository root の確認は no-op でも行う。
共通 gate の構成分類そのものに、新たな Git 履歴照会や prune の差分なし条件は追加しない。

## 5. preview と適用前検査

引数なしは preview、`--apply` は適用、`--help` は説明のみとする。
任意 path、force、profile、修復、復元の引数は追加しない。未知引数と `--apply` の重複は非ゼロで拒否する。
対象 repository は script の配置場所から決定し、呼出 cwd に依存させない。

preview は削除 path、共有ファイルの編集差分、保持対象、判定状態、適用 blocker を表示する。
書込み・一時ファイル・Git index 更新・dependency install・外部接続は行わない。
成功 preview は exit 0、適用不能な構成・差分・Git 不在等を検出した preview は非ゼロとする。
Git 不在でも読み取れる削除予定は表示し、差分保護が未確認であることを明記する。

変更する apply は以下をすべて満たすまで一件も書き込まない。

1. runtime / dependency が利用可能で、構成が同梱状態である。
2. 対象 root は Git working tree の top-level と一致し、HEAD が存在する。
   bare repository や外側 repository に偶然含まれるだけの配置は拒否する。
   通常 clone と正規の linked worktree は許す。Skill updater の別の隔離制約を流用しない。
3. 削除・書換え対象の現存ファイルが HEAD / index で追跡済みで、
   staged / unstaged / conflict / rename / mode change がない。
   削除ディレクトリ内の追加ファイルは ignored を含め拒否する。
   共有ファイルの区画外だけの未コミット変更も、そのファイルを書き換える場合は拒否する。
   Git status の表示だけを根拠にせず、対象の実体・mode と HEAD / index の一致を確認する。
   assume-unchanged / skip-worktree 等で隠された変更も許可しない。
4. 対象 root より内側の祖先・対象・子孫に symlink、特殊 file、submodule、
   入れ子の Git 管理領域がない。dangling symlink も不在として扱わず拒否する。
   固定対象外・repository 外へ到達する path を拒否する。
5. すべての共有編集範囲を一意に決められ、編集後の構文と完全除去構成を検査できる。
6. 全体 plan 作成後、書込み直前に対象の状態を再確認する。変更検知時は停止する。
   協調しない他 process による任意の同時書換えに対する OS sandbox / 完全排他は保証しない。

コミット済みの対象内カスタマイズは preview に表示され、`--apply` の削除対象になる。
対象外差分は staged / unstaged / untracked / ignored を問わず変更・stash・commit しない。
Git の path は NUL 区切りで扱い、空白・改行・Unicode を shell 展開や trim で変形しない。

## 6. 適用・失敗・復旧

同一入力の表示順と適用順は repository 相対 path の安定順とし、共有編集後に固定削除を行う。
各共有ファイルは必要な部分だけ変更し、変更成功した対象を追跡する。
適用後は構成が完全除去であることを再検査してから exit 0 を返す。
ここで full setup / gate を暗黙に実行したり、install / network を開始したりしない。

I/O 失敗・検査失敗は非ゼロ終了する。通常の例外を捕捉できた場合は、変更済み・失敗箇所・
未処理対象、開始時 HEAD と対象限定の復旧方法を表示する。
複数ファイルの原子的 commit や自動ロールバックは提供しない。
共有編集用の一時ファイルが必要なら、自分で作った一時ファイルだけを通常終了時に cleanup する。

kill / host crash 時の最終診断や cleanup は保証しない。次回は残存構成を再判定し、
部分状態なら停止する。全変更が完了していた場合だけ完全除去として no-op 成功できる。
部分変更を推測で継続・巻き戻ししない。

復旧は利用者が現在の差分を確認し、失敗後に追加した作業を保護した上で、
表示された開始時 commit から対象だけを復元する手順とする。
全 repository の reset / clean は案内しない。旧 prune が既に commit 済みの場合は
対象資産が揃っていた commit を利用者が選ぶ。`TEMPLATE_VERSION` から復元 commit を推測しない。
GitHub の PR / Issue / branch、host の登録や設定は操作しない。

## 7. 検証・残る責務

[validation.md](validation.md) の実動作を優先し、[spec-holes.md](spec-holes.md) の全分類を対応付ける。
通常 CI とローカル gate、保守 CI と明示保守 gate の組をそれぞれ一致させる。
prune smoke は使い捨てコピーの通常 gate だけを呼び、保守 gate を再帰呼出しない。

#74 への引き渡しは「同梱中は offline 検証、完全除去後は専用検証を要求しない、
host 登録解除は別操作」という境界だけとする。今回の固定対象に任意 Skill を混ぜない。
