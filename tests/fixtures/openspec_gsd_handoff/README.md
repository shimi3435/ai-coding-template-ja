# OpenSpec / GSD handoff contract fixtures

このディレクトリは handoff MVP が対応する tool contract を固定する。`${FIXTURE_REPO}` は fixture
実行時に作る repository の real path、`${GSD_HOME}` は GSD の設定 root へ置換する。個人の home や
実 repository の絶対パスは fixture に保存しない。

## OpenSpec 1.3.1

`openspec/contract.json` は `openspec --version` と
`openspec instructions apply --change <id> --json` を別 probe として扱う。MVP が JSON discovery を
使えるのは version が `1.3.1` と完全一致し、exit 0 の JSON が positive fixture の schema、path
cardinality、progress invariants をすべて満たす場合だけである。JSON 自体には version field がない。

negative case（non-zero、malformed JSON、version / schema mismatch、unsafe path、cardinality / progress
mismatch）は JSON 経路全体を拒否する。JSON の一部と directory discovery を混ぜず、固定 OpenSpec
directory から Markdown fallback を最初からやり直す。ただしshapeがvalidでも`state=blocked`または
`missingArtifacts`ありは準備不足として停止し、fallbackで隠さない。`state=all_done`は新規handoffを
開始せず最終境界ゲートへ案内する。`state=ready`だけがhandoff準備を継続できる。
task IDはMarkdown内の番号を解釈せず、行頭`- [ ]` / `- [x]`の出現順で1から付ける。番号表現は
descriptionの一部であり、大文字`X`、`*` bullet、indentはMVPの対応外としてfail-closedする。

## GSD 1.5.0

`gsd/contract.json` は `VERSION`、runtime / skill / agent files、read-only の
`node ${GSD_HOME}/gsd-core/bin/gsd-tools.cjs init progress --raw` を複合 signal とする。version/file の
存在だけでは capability 成立としない。entrypoint 自体に dry-run はないため、書き込みを伴う
`$gsd-new-project --auto` または `$gsd-phase` は明示承認後にだけ起動する。
project / roadmap / state の存在が全falseまたは全trueでない部分初期化状態では、どちらも起動しない。

CLI probeはhostの`spawn_agent` tool schemaを証明しない。execute skillはruntime preflightでschemaを
検査する。generic schema（`agent_type`なし）では対応agentの`.toml`をrole-preambleとして注入し、
generic-agent workaroundと明示する。typed dispatchまたはworktree isolationが正しさに必須の操作は
generic schemaでfail-closedする。`$gsd-new-project --auto`には`gsd/handoff-brief.md`相当のidea documentを
`@`参照で渡し、仕様本文を複製せずcanonical pathsとsource commitを参照させる。

## Minimal manifest

`manifest/expected-prepared.json` は schema version 1 の最小出力例である。artifact は `kind`、`path` の
順に並べ、hash は canonical Markdown bytes の SHA-256 とする。`source_commit` は Markdown artifacts を
固定した commit で、manifest を追跡する後続 commit とは異なる。volatile timestamp、requirement /
phase mapping、ownership、finalize state は MVP に含めない。
