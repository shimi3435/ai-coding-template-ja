# Pitfalls Research

**Domain:** OpenSpec から GSD への handoff 準備自動化（既存 Python テンプレートへの MVP 統合）
**Researched:** 2026-07-15
**Confidence:** HIGH（project 固有の判断は source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical artifacts と fixtures に基づく）

本書は実装上の落とし穴だけを扱う。仕様、requirement、scenario、受け入れ基準は
`openspec/changes/automate-openspec-gsd-handoff/` が唯一の正本であり、ここでは再定義しない。
`harden-openspec-gsd-handoff-lifecycle`、push / PR / merge、finalize、retry / resume / rollback は対象外である。

## Critical Pitfalls

### 1. JSON fallback に検証済みでない値を混ぜる

**What goes wrong:** OpenSpec JSON の path や progress の一部を保持したまま Markdown fallback を実行し、
異なる入力経路の値で manifest を作る。`blocked` / `missingArtifacts` を fallback で隠したり、`all_done` を
新規 handoff として扱ったりする派生も同じ失敗である。

**Why it happens:** JSON を canonical 本文と誤認する、または「使える field だけ使う」寛容な parser を作るため。

**How to avoid:** JSON 経路は OpenSpec `1.3.1` exact と全 schema / path / progress invariant を一単位で判定する。
非対応なら JSON 由来の値を破棄して固定 directory discovery から再開する。valid な `blocked` と
`all_done` は fallback 条件ではなく、それぞれ停止と最終境界への案内として分岐する。

**Warning signs:** discovery route と progress route が別々に記録される、fallback test が JSON fixture の
path を再利用する、`state != ready` を一括して fallback に送る。

**Phase to address:** bridge の discovery / reader 統合時。JSON と Markdown の parity test、および
`blocked` / `all_done` の「永続 write なし」test を先に固定する。

---

### 2. lexical path 検査だけで symlink 越境を許す

**What goes wrong:** `..` を含まない path や change directory から始まる文字列を安全とみなし、symlink 解決後に
repository または対象 change の外を読む。検査後に path を開き直す構成では、検査と read の間の差し替えも起こり得る。

**Why it happens:** `Path.is_relative_to()` や prefix 比較を未解決 path にだけ適用し、repo root、change root、各 file の
real path を同じ基準で比較しないため。

**How to avoid:** repo / change / artifact を real path へ解決し、対象 change 内の期待 kind・Markdown file であることを
read 前に一括検証する。重複や kind 衝突は deduplicate せず停止する。hash は実際に検証した bytes から算出し、
上限確認と read / hash の責務を共通 reader に閉じ込める。

**Warning signs:** `str(path).startswith(...)`、symlink fixture 不在、JSON discovery と fallback が別 reader を持つ、
hash 計算時に同じ file を再度 path から読む。

**Phase to address:** bridge の path safety と reader。repo 外、change 外、symlink、重複 kind の各 negative test が必要。

---

### 3. source commit と実際に hash した Markdown が一致しない

**What goes wrong:** manifest の `source_commit` は承認済み commit を指すが、paths / hashes / progress は未commitの
working tree や別 commit から採取され、復帰索引として再現不能になる。

**Why it happens:** `git rev-parse HEAD` の存在確認だけで source pinning を満たしたと考える、あるいは preflight 後の
canonical file drift を検出しないため。

**How to avoid:** source commit の存在、現在 branch との関係、canonical paths の blob と読取対象 bytes の一致を
manifest write 直前まで一貫して確認する。dirty tree を自動 stash / commit / reset してはならない。仕様変更を検出したら
GSD 内で補完せず OpenSpec の更新・再検証・再承認へ戻す。

**Warning signs:** `source_commit=HEAD` を無条件設定する、Git test が detached / dirty canonical artifacts を含まない、
manifest test が固定 SHA 文字列だけで実 file hash を検証しない。

**Phase to address:** Git preflight と manifest integration。source commit 固定後の canonical drift を明示的に失敗させる。

---

### 4. atomic file replace だけで追跡可能な状態遷移を実現したと思う

**What goes wrong:** temporary file から `os.replace` できても、manifest が ignore / policy 上非追跡、既存 manifest が
不整合、または GSD entrypoint が未受理なのに `prepared` / `started` へ進む。別 filesystem の temp file では replace
自体が atomic でない場合もある。

**Why it happens:** filesystem atomicity、manifest schema validation、Git trackability、handoff acceptance を一つの
「write 成功」に畳み込むため。

**How to avoid:** staging file は最終 path と同じ directory に作り、完全 serialize・再parse・schema/invariant 検証後に
置換する。write 前に `git check-ignore` と repository policy を確認する。既存 manifest は自動修復・上書きせず照合し、
`started` は契約済み GSD entrypoint が受理した後だけにする。MVP に完了 / finalize / cleanup state を足さない。

**Warning signs:** temp directory に staging する、ignore 検査が write 後、entrypoint 呼出し前に `started`、
既存 JSON parse failure を新規生成で上書きする。

**Phase to address:** manifest / Git preflight。fault injection で最終 file が部分 JSON にならないことを確認する。

---

### 5. GSD capability と host dispatch capability を同一視する

**What goes wrong:** `VERSION` や skill file の存在だけで GSD を起動する、部分初期化を initialized / uninitialized の
どちらかへ丸める、または CLI probe から `spawn_agent.agent_type` の有無まで推測する。結果として誤った entrypoint や
role なし generic agent が書込を始める。

**Why it happens:** filesystem probe、`init progress --raw`、host tool schema が別 trust boundary であることを
preflight model に表さないため。

**How to avoid:** GSD `1.5.0` exact、required files、read-only probe の exit / JSON / project root / agents、三つの
初期化 flag を複合 signal とする。host schema は skill 層で別に検査し、generic schema では対応 `.toml` role-preamble と
`generic-agent workaround` 表示を必須にする。typed dispatch または worktree isolation が正しさに必須なら停止する。

**Warning signs:** bridge が host schema を決める、`any(project_exists, ...)` で初期化済みにする、probe failure 後に
entrypoint を試す、`gsd-new-project` / `gsd-phase` に dry-run があると仮定する。

**Phase to address:** capability preflight と skill orchestration の境界。bridge unit test と host-level skill test を分離する。

---

### 6. Skill 本体だけ追加して repository の配布契約を壊す

**What goes wrong:** `.agents/skills/execute-openspec-change/SKILL.md` は存在するが、`skills.lock.json` の entry / SHA、
`.claude/skills` と `.codex/skills` の相対 symlink、collision-safe setup のいずれかが欠け、`task check` の
`tests/test_skills_lock.py` で失敗する、または片方の agent からだけ利用できる。

**Why it happens:** 新 skill を単一 file の追加と捉え、既存 repo が `.agents` を実体の正、lock と二系統 symlink を
配布・整合性契約にしていることを見落とすため。

**How to avoid:** first-party local skill として既存 lock schemaに合わせ、最終 `SKILL.md` bytes の SHA-256 を登録する。
既存 `scripts/setup-skills.sh` を使い、非-symlink collision を破壊的に置換しない。lock / symlink tests を個別実行する。

**Warning signs:** `.agents/skills` だけが diff に現れる、lock SHA 更新後に SKILL.md を編集する、絶対 symlink、
`setup-skills.sh` を通さず既存 directory を削除する。

**Phase to address:** skill phase。skill 内容確定後に lock と symlink を同期し、個別 gate を通す。

## Moderate Pitfalls

### Checkbox parser を便利にしすぎる

番号の解釈、leading whitespace の許容、`*` bullet、大文字 `X`、空 description を正規化すると、固定 contract と異なる
progress を生成する。行頭の `- [ ] ` / `- [x] ` だけを task としつつ、「checkbox 風だが不正」な行を単なる本文として
黙って無視させない。ID は出現順、番号表現は description の一部、Unicode と順序は保持する。

### limit を読み終えた後に検査する

1 MiB / 4 MiB / 64 files / 4096 tasks の上限を parse 後に確認すると、上限の resource 保護目的を失う。byte limit は
character 数ではなく UTF-8 bytes で測り、切り捨てず対象と上限を報告する。recursive glob も change root 内で bounded にする。

### subprocess を shell 文字列で組み立てる

change ID や GSD home を shell command に埋め込むと injection と quoting failure が起こる。ASCII lower-kebab ID を先に
検証し、`subprocess.run([...])` の argv、timeout、capture、明示 cwd を使う。stderr 混入を JSON stdout として parse しない。

### fixture CI から実 GSD を暗黙起動する

GSD は optional で Node 非コア依存である。通常 `task check` は fixture と fake subprocess だけで完結させ、実 OpenSpec / GSD
は明示 opt-in smoke に隔離する。環境に tool が偶然存在するかで通常 test の結果を変えない。

### 現行 upstream docs を pinned contract に逆輸入する

Context7 の OpenSpec 情報は v1.5.0、GSD 情報は current / `next` を含む。一部の概念は cross-check できるが、本 MVP の
受理 schema と entrypoint は fixtures の OpenSpec 1.3.1 / GSD 1.5.0 exact が正である。追加 field を version 互換の証拠にしない。

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| discovery、reader、progress、manifest、preflight を一つの script に置く | 初期実装が速い | fallback の部分採用と副作用境界が test 不能になる | never（責務別 module が canonical design） |
| JSON schema を truthy check だけで受理する | fixture positive が通る | bool を int と誤認する等、negative contract を破る | never |
| manifest に timestamp、phase ID、mapping、ownership を足す | 追跡が豊富に見える | 非決定性と後続 hardening の先取り | never in this MVP |
| 既存 manifest を上書きして再実行を簡単にする | demo が通りやすい | 衝突・部分失敗の証拠を失う | never in this MVP |
| 実 tool smoke を通常 pytest に混ぜる | local confidence が上がる | GSD 未導入 CI を壊し、network / version 依存になる | never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| OpenSpec 1.3.1 | apply JSON を artifact 本文として扱う | paths / progress metadata として全体検証し、本文は Markdown bytes から読む |
| Git | HEAD SHA を source commit として記録するだけ | 承認済み source commit と canonical blobs / working bytes の一致、branch、dirty stateを検査 |
| GSD 1.5.0 | VERSION または file 在席だけで起動する | required files + exact version + read-only `init progress --raw` の複合 signal |
| Codex host | CLI probe から typed dispatch 可と推測する | visible `spawn_agent` schema を skill 層で別検査する |
| skill distribution | skill directory の追加だけで完了する | lock SHA と Claude / Codex symlink を既存契約に従って同期する |
| `.planning/` | directory が存在すれば永続化可能とみなす | ignore と repository tracking policy を write / state transition 前に確認する |

## Performance and Security Traps

| Trap | Impact | Prevention |
|---|---|---|
| unbounded `read_text()` 後にサイズ確認 | 巨大入力でメモリを消費してから停止する | stat は補助に留め、bounded byte read と累積上限を reader 内で管理する |
| lexical containment / symlink follow | repo 外の file 読取・hash 化 | resolved repo/change/file の包含と expected kind を検査する |
| shell command interpolation | command injection、space を含む path の誤動作 | validated ID、argv 呼出し、固定 executable、明示 cwd / timeout |
| manifest mode / temp leak の無視 | partial state や内容が残る | same-directory staging、例外時 cleanup、schema 再検証、atomic replace |
| concurrent duplicate invocation | stale preflight 後に二重 handoff | 既存 manifest state を write 直前にも照合し、衝突なら停止する。multi-manifest ownership は実装しない |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| fallback を黙って行う | どの tool contract が壊れたか分からない | route、拒否理由、canonical paths、source commit を承認前に表示する |
| fail-closed を stack trace だけで終える | 手動 handoff の判断材料がない | 不足 signal、永続 write 有無、既知 state、先行 policy の手動導線を表示する |
| `all_done` を成功終了だけで返す | 新規 handoff 済みと誤解する | OpenSpec 最終境界 gate へ明示的に案内する |
| GSD phase green を change 完了と表示する | OpenSpec acceptance を飛ばす | final authority が OpenSpec にあることを常に明示する |

## "Looks Done But Isn't" Checklist

- [ ] **JSON discovery:** positive fixture が通るだけでなく、version / malformed / schema / path / cardinality /
  progress mismatch が JSON 値を一切混ぜず fallback する。
- [ ] **State routing:** valid `blocked` / `missingArtifacts` は write なしで停止し、`all_done` は handoff を起動しない。
- [ ] **Reader safety:** repo 外、change 外、symlink、重複 kind、非 Markdown、unreadable、各/合計 size 上限を fail-closed する。
- [ ] **Progress:** exact checkbox 文法、空 tasks、壊れた checkbox、Unicode、順序、4096/4097 境界を検証する。
- [ ] **Source pinning:** manifest の SHA が fixture placeholder だけでなく、承認 source commit に対応する実 bytes と一致する。
- [ ] **Atomicity:** staging write / validation / replace の各故障で、最終 path に部分 JSON や進んだ state が残らない。
- [ ] **Trackability:** ignored / policy 非追跡の `.planning` では `prepared` / `started` を生成しない。
- [ ] **GSD preflight:** wrong root、missing agent、malformed probe、partial initialization、version mismatch で entrypoint を呼ばない。
- [ ] **Host preflight:** generic schema では TOML role-preamble と workaround 表示があり、必要時は fail-closed する。
- [ ] **Skill delivery:** `.agents` 実体、lock SHA、`.claude` / `.codex` symlink がすべて整合する。
- [ ] **CI boundary:** GSD が無い環境で通常 `task check` が成功し、実 tool smoke は opt-in のみで動く。
- [ ] **Scope boundary:** hardening、push / PR / merge、finalize、retry / resume / rollback のコードや state が diff に混入していない。
- [ ] **Final authority:** phase 完了後も canonical requirements / scenarios / spec-holes、`task openspec:validate`、
  `task check` の OpenSpec acceptance が別 gate として残る。

## Recovery Strategies

本 MVP 自身は自動 retry / resume / rollback を実装しない。失敗時の回復は、既知 state と完了済み操作を報告して停止し、
先行 policy の手動 handoff または OpenSpec の再承認へ戻すことに限定する。

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| JSON / Markdown 入力混合を検出 | MEDIUM | 永続 artifact を作らず、実装を修正して両 route の parity test を再実行する |
| source commit と bytes の不一致 | MEDIUM | GSD を停止し、canonical OpenSpec の commit・validate・承認をやり直す |
| 壊れた / 不整合 manifest | MEDIUM | 自動上書きせず staging と既知 state を報告し、手動方針を確認する |
| GSD / host capability 不足 | LOW | artifact を書かず、手動 handoff または change 再構成案を提示する |

## Pitfall-to-Phase Mapping

| Phase topic | Primary pitfalls | Verification focus |
|---|---|---|
| Bridge core: discovery / reader / progress | JSON fallback poisoning、path 越境、寛容 parser、unbounded input | route parity、negative fixtures、境界 / property tests |
| Bridge state: manifest / Git / capabilities | source drift、非atomic state、ignore、GSD signal 誤判定 | fault injection、Git fixture、複合 probe matrix |
| Skill orchestration | host schema 混同、承認前 write、誤 entrypoint | fake bridge / runtime schema による順序と no-write 検証 |
| Repository integration / acceptance | skill 配布漏れ、optional dependency 混入、OpenSpec 最終 gate の省略 | lock / symlink tests、GSD 不在 `task check`、canonical 対応表 |

## Sources

- **HIGH — canonical project contract:** `openspec/changes/automate-openspec-gsd-handoff/{proposal.md,design.md,tasks.md}`、
  `specs/openspec-gsd-handoff-automation/spec.md` at source commit `5a1f78b81f546c900745328fad24f9adb073e768`。
- **HIGH — contract fixtures:** `tests/fixtures/openspec_gsd_handoff/`（OpenSpec 1.3.1、GSD 1.5.0、minimal manifest）。
- **HIGH — repository integration policy:** `AGENTS.md`、`docs/agents/workflow.md`、`docs/optional/gsd.md`、
  `scripts/setup-skills.sh`、`tests/test_skills_lock.py`、`Taskfile.yml`。
- **MEDIUM — Context7 official-source cross-check:** OpenSpec `/fission-ai/openspec/v1.5.0` の
  `docs/agent-contract.md` は `contextFiles`、progress、`blocked|all_done|ready` shape を確認できた。ただし MVP pin の
  1.3.1 とは version が異なるため受理 contract の根拠には使わない。
- **MEDIUM — Context7 official-source cross-check:** GSD `/open-gsd/gsd-core` の current docs は `.planning` artifacts、
  new-project / plan / execute の概念を確認できた。ただし current / `next` 情報を含むため GSD 1.5.0 fixtures を優先する。

---
*Pitfalls research for: OpenSpec–GSD Handoff Automation MVP*
*Researched: 2026-07-15*
