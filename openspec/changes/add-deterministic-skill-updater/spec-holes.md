# Spec Holes Audit

`spec-holes` フェーズ1。確定scopeのSKUP-1〜SKUP-12へ固定12分類を順番に再適用した。該当する穴はspec / designへの明記または明示的なスコープ外で解決済み。未解決判断はない。

## SKUP-1 source declaration と generated lock を分離する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | remote entry 0件、空file、空license、null fieldの扱い | 1: remote 0件はno-op、空 / null / field欠落と空licenseはschema errorとspecに明記 |
| 2 | 境界値 | 該当 | schema version、10 MiB、500 entries の境界 | 1: 対応 version 1、上限値は受理、超過は拒否と design / spec に明記 |
| 3 | 重複・衝突 | 該当 | name、target、lock key、remote legal target の衝突 | 1: mutation 前 schema error、last-wins 禁止と spec に明記。local legal source共有は受理 |
| 4 | 順序 | 該当 | JSON key / entry order が hash や diff を変える | 1: schema 定義順、UTF-8 byte order、canonical JSON を design に固定 |
| 5 | 型・形式不正 | 該当 | unknown field、ownership / ref / subtree variant不整合、非整数count、invalid redistribution | 1: unknown / inconsistent field、unsafe number、非対応redistributionを拒否するとdesign / specに明記。subtreeはroot/path tagged unionだけを受理 |
| 6 | エラー経路 | 該当 | sources は valid だが lock parseまたはstructural bijectionが失敗する部分状態 | 1: 全commandのrepository-state境界でname / ownership / target / manager invariantをnetwork / mutation前に検証し、fileを変更せずexit 1とspecに明記 |
| 7 | 冪等性・再実行 | 該当 | 同じmodelの再serializeでbytesが変わる、legal policyがdriftする | 1: canonical serializationとlicense / redistribution exact-copyをdesign / specに固定 |
| 8 | 時刻・タイムゾーン | 非該当 | schema に時刻 field を持たない | 2: v1 metadata に timestamp を入れず canonical state から除外 |
| 9 | 文字列 | 該当 | Unicode name / target、空白のみ ref | 1: canonical path / NFC と non-empty explicit ref validation を design / spec に明記 |
| 10 | 数値 | 該当 | 負数、fraction、overflow、NaN / inf | 1: JSON safe integer と非負 count / bytes だけを許可、NaN / inf は parse不能として拒否 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 巨大 metadata / entry 配列 | 1: file 10 MiB、skills 500 entries の上限を design / spec に明記 |
| 12 | 状態遷移の未定義パス | 該当 | human-owned sourcesをupdaterが暗黙修正する、review済みdriftと構造破損の区別 | 1: sourcesは人だけが編集し、構造driftは拒否、remote / local planだけが許可されたreview値をlockへexact copyすると明記 |

## SKUP-2 ownership variant を守る

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | ownership / plugin manager / legal mapping欠落、plugin targetなし、local targetPathなし | 1: required field欠落はschema error、plugin targetなしとlocal legal targetPathなしはvalid variantとspecに明記 |
| 2 | 境界値 | 非該当 | ownership は有限 enum | — |
| 3 | 重複・衝突 | 該当 | 同一 skill を複数 ownership が宣言 | 1: ownership conflict を global schema error と SKUP-1 / SKUP-2 に明記 |
| 4 | 順序 | 非該当 | ownership semantics は entry order 非依存 | 1: canonical order は SKUP-1 が所有 |
| 5 | 型・形式不正 | 該当 | unknown ownership、plugin target / hash、local legal targetPath、remote / local blocked | 1: variant外fieldsを拒否し、blocked remote / localをinstallせずexit 1とspecに明記 |
| 6 | エラー経路 | 該当 | 一 entry 不正時に他 entry を更新するか | 1: global preflight で全 apply 前停止と design に明記 |
| 7 | 冪等性・再実行 | 該当 | plugin / local entryをremote updateが再書換え | 1: pluginはtarget / hashなし、localはremote対象外という許可operationをspecに固定 |
| 8 | 時刻・タイムゾーン | 非該当 | ownership に時刻なし | — |
| 9 | 文字列 | 該当 | manager 名が空白だけ | 1: non-empty string decoder の対象と design に明記 |
| 10 | 数値 | 非該当 | ownership variant に数値なし | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | entry 総数上限は SKUP-1 が所有 | — |
| 12 | 状態遷移の未定義パス | 該当 | remote→local / plugin、blocked→pluginの自動移行 | 1: variant間とredistribution policyの推測変換禁止、review済みsources変更だけを受理とspecに明記 |

## SKUP-3 public GitHub subtree だけを取得する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 空 API body、欠落 tree / blob | 1: incomplete response は partial success にせず拒否と spec に明記 |
| 2 | 境界値 | 該当 | pagination 0 / 1 / 最終 page | 1: 全 page 完了証明を要求、件数上限は SKUP-7 に明記 |
| 3 | 重複・衝突 | 該当 | API が同一 path を重複返却 | 1: canonical path collision として SKUP-6 で拒否 |
| 4 | 順序 | 該当 | page / tree 列挙順が変化 | 1: immutable observation 後に canonical UTF-8 order へ整列 |
| 5 | 型・形式不正 | 該当 | malformed JSON、object type不一致、tree / blob SHA欠落・非40-hex・不一致、同size別bytes | 1: tree / requested / response lowercase 40-hex SHAと取得bytesから再計算したGit blob SHA-1の一致を要求し、source error、fallbackなしとspecに明記 |
| 6 | エラー経路 | 該当 | private、403、404、rate limit、timeout | 1: source / operation error、exit 1、別経路 fallback禁止と spec に明記 |
| 7 | 冪等性・再実行 | 該当 | retry 中に ref が移動 | 1: observation を commit に固定し、apply 前 freshness recheck を SKUP-9 に明記 |
| 8 | 時刻・タイムゾーン | 非該当 | commit timestamp を判断に使わない | 2: ref / ancestry / content だけを判断入力とする |
| 9 | 文字列 | 該当 | owner / repo / ref の Unicode・空白・escape | 1: explicit validated fields と subprocess argument array を design に明記 |
| 10 | 数値 | 該当 | API size / page count の負数・overflow | 1: validated safe integer と local recount を要求 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 巨大 tree、blob、pagination | 1: SKUP-7 limits、timeout は operation error、切り捨て禁止 |
| 12 | 状態遷移の未定義パス | 該当 | auth が途中失効、visibility が変化 | 1: observation failure とし mutation 前停止、apply freshness recheck を要求 |

## SKUP-4 ref 移動を fail-closed で検証する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | previous commit 不在、ref 空、rangeを満たすtag 0件 | 1: 初回 install は ancestry のみ非該当、空 ref は schema error、候補0件はsource errorと spec に明記 |
| 2 | 境界値 | 該当 | identical commit、1 commit fast-forward | 1: ancestor-or-equal は受理、content 不変は no-content-change と spec に明記 |
| 3 | 重複・衝突 | 該当 | 同一 SemVer version の tags が別 commit | 1: ambiguity を拒否、同 commit なら UTF-8先頭 tag と design / spec に明記 |
| 4 | 順序 | 該当 | tag API order が選択結果へ影響 | 1: SemVer highest selection後、tieだけ UTF-8 byte order |
| 5 | 型・形式不正 | 該当 | invalid range、非40-hex commit | 1: parser / decoder error、exit 1 と design / spec に明記 |
| 6 | エラー経路 | 該当 | ancestry API failure、branch / tag history rewrite、downgrade | 1: mutationなしexit 1、fallback / v1 overrideなしとspecに明記 |
| 7 | 冪等性・再実行 | 該当 | 同ref再解決でcommit移動、locked tag移動 / 削除 | 1: locked selectedTag→resolvedCommit不変を候補選択前に検証し、違反は拒否 |
| 8 | 時刻・タイムゾーン | 非該当 | tag / commit timestamp で優先しない | 2: SemVer と ancestry だけを使用 |
| 9 | 文字列 | 該当 | `v1.0.0` 等 tag prefix / prerelease | 1: npm SemVer parser と explicit prerelease range に固定 |
| 10 | 数値 | 該当 | SemVer major / minor / patch overflow | 1: `semver@7.8.5` の valid range / version validationへ委譲 |
| 11 | 巨大入力・リソース枯渇 | 該当 | tag 数が非常に多い | 1: tag candidates 500件、complete pagination、timeout failureを要求 |
| 12 | 状態遷移の未定義パス | 該当 | non-fast-forward / tag改変 / range downgrade後の上書き手順 | 1: 利用者承認によりv1常時拒否、override / downgradeは別changeとproposal / specに明記 |

## SKUP-5 同じ repository / ref を cohort として観測する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | cohort 0件 / entry 0件 | 1: remote 0件 no-op は SKUP-1、空 cohort は生成しない |
| 2 | 境界値 | 該当 | cohort 1件、500 files / 50 MiB | 1: 単一 entry も同規則、resource boundary は SKUP-7 |
| 3 | 重複・衝突 | 該当 | target / lock / legal target の cross-cohort collision | 1: global preflight で全 apply 拒否と spec に明記 |
| 4 | 順序 | 該当 | cohort順でlock freshnessとpartial successが変化 | 1: canonical cohort orderとexpected-before / candidate-after lock chainをdesign / specに固定 |
| 5 | 型・形式不正 | 該当 | normalized repository / ref を作れない | 1: source schema error、cohort を作らない |
| 6 | エラー経路 | 該当 | 一entry invalid、後続cohort runtime failure | 1: global preflight、失敗cohort rollback、後続not-attempted、即停止、exit 1とspecに明記 |
| 7 | 冪等性・再実行 | 該当 | commit のみ進む、content 不変 | 1: lock-only change を作らず no-content-change と spec に明記 |
| 8 | 時刻・タイムゾーン | 非該当 | cohort order に時刻を使わない | — |
| 9 | 文字列 | 該当 | repository 大文字小文字 / URL variant | 1: normalized owner/repository と canonical ref を cohort key に固定 |
| 10 | 数値 | 該当 | aggregated count / bytes overflow | 1: safe integer で unique resource を集計し SKUP-7 limit を適用 |
| 11 | 巨大入力・リソース枯渇 | 該当 | cohort 数 / entries が巨大 | 1: metadata 500 entries、per-cohort limits、bounded cacheを適用 |
| 12 | 状態遷移の未定義パス | 該当 | 先行cohort applied後に後続failure | 1: 先行state / lock維持、失敗stepだけexpected-beforeへrollback、残りnot-attemptedとspecに明記 |

## SKUP-6 canonical path と tree hash を固定する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | empty selected tree、empty file、empty path、repository root表現 | 1: empty fileはvalid、empty selected tree / pathは拒否、repository rootは`{ "root": true }`だけで表し、selected rootのSKILL.md必須とspecに明記 |
| 2 | 境界値 | 該当 | file count 0 / 1、length 0、u64 boundary | 1: u64-BE framing、resource limits、empty content受理を design / spec に明記 |
| 3 | 重複・衝突 | 該当 | exact NFC / ASCII case-fold alias path、remote legal targetとsubtree fileの重複 | 1: aliasは補正せず拒否。legal overlapは同bytesなら既存modeで1 file、異bytesなら拒否とspecに明記 |
| 4 | 順序 | 該当 | input enumeration order | 1: UTF-8 byte order と property scenarioを spec に明記 |
| 5 | 型・形式不正 | 該当 | non-NFC、backslash、special file、subtree string / empty object / `root: false` / root-path併記 / unknown field | 1: canonical path / regular-file-only validationとroot/path tagged unionのstrict validationをspecに明記 |
| 6 | エラー経路 | 該当 | hash read途中失敗 | 1: partial hashを返さず cohort error、mutationなし |
| 7 | 冪等性・再実行 | 該当 | 同じ tree が別 order で異なる hash | 1: fixed domain / u64-BE frame と canonical sort を design に固定 |
| 8 | 時刻・タイムゾーン | 非該当 | mtime / ctime を hash に含めない | 2: remoteはlegal配置後の最終tree、localはtarget配下についてpath、content、executable bitだけをhash対象に固定 |
| 9 | 文字列 | 該当 | combining characters、emoji、invalid UTF-8 path | 1: UTF-8 NFCだけを許可し byte orderで比較 |
| 10 | 数値 | 該当 | length prefix overflow、negative size | 1: non-negative u64-compatible safe integer、実bytes再計数 |
| 11 | 巨大入力・リソース枯渇 | 該当 | giant file/treeを一括buffer | 1: SKUP-7 limitをhash前に適用し bounded streaming実装を許可 |
| 12 | 状態遷移の未定義パス | 該当 | legal copyをtree hashへ含める時点、local外部legalの扱い | 1: remoteは最終installed treeへ包含、local repository-level legalはtree外で独立hashとdesign / specに固定 |

## SKUP-7 resource limit を切り捨てず適用する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 0 byte file / 0件SemVer tag candidate | 1: 0 byte regular fileは受理、候補0件はsource error、SKILL.md requirementは別途適用 |
| 2 | 境界値 | 該当 | limit exact / +1 | 1: exact受理、超過拒否の scenariosを spec に明記 |
| 3 | 重複・衝突 | 該当 | shared remote legal blob / final target file / local root LICENSEの二重計数 | 1: remote source blobとfinal fileを各unique keyで集計し、local shared sourceは独立hashを再利用するとdesign / specに明記 |
| 4 | 順序 | 非該当 | resource total は列挙順非依存 | 1: canonical unique keyで集計 |
| 5 | 型・形式不正 | 該当 | API size field不正 | 1: metadataを信用せず取得bytesを再計数、不正値は拒否 |
| 6 | エラー経路 | 該当 | pagination incomplete、stream途中failure | 1: partial受理せずcohort errorと spec に明記 |
| 7 | 冪等性・再実行 | 該当 | cache hit / miss で計数が変化 | 1: unique commit/path modelから再現可能に集計 |
| 8 | 時刻・タイムゾーン | 非該当 | limitに時刻なし | — |
| 9 | 文字列 | 非該当 | path byte lengthはtree hash、resource byte countはcontent bytes | — |
| 10 | 数値 | 該当 | MiB定義、overflow、negative | 1: 1 MiB=1,048,576 bytes、safe non-negative integerを design に明記 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 本requirementの主対象、installed / local treeを検査前に全読込する、大量empty directory / 深いtree / 長いpath | 1: skill / file / cohort / tag / metadata limitsに加えentries 500、depth 32、path 4096 bytes、segment 255 bytesとiterative streaming traversalをdesign / specに固定 |
| 12 | 状態遷移の未定義パス | 該当 | limit到達後に既取得partial dataをapply | 1: candidate破棄、mutation前拒否と spec に明記 |

## SKUP-8 SKILL metadata と legal approval を静的検証する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | SKILL.md 0件、空description / license、legal mapping 0件、local source欠落 | 1: exactly one、trim後非空、remote / localは1件以上mapping、local sourceはtracked regular fileを要求 |
| 2 | 境界値 | 該当 | SKILL.md exactly 1、frontmatter delimiter境界 | 1: single UTF-8 YAML document / mapping rootとして parser contractを固定 |
| 3 | 重複・衝突 | 該当 | duplicate YAML key、duplicate remote legal target、shared local legal source | 1: YAML / remote target collisionは拒否、複数local entryの同source参照はtracked / regular / bytes / identity / size / hashを一度だけ取得して再利用するとspecに明記 |
| 4 | 順序 | 該当 | variant別legal mapping orderがlock bytesを変える | 1: remoteはtarget/source、localはsourceのUTF-8 orderでserialize |
| 5 | 型・形式不正 | 該当 | YAML parse error、mapping以外、name / license非string、redistribution不正 | 1: metadata / policy validation errorとspecに明記 |
| 6 | エラー経路 | 該当 | remote legal fetch失敗、local legalがuntracked / non-regular、hash mismatch | 1: remote cohort / local plan全体をpolicy error、no-write、exit 1とspecに明記 |
| 7 | 冪等性・再実行 | 該当 | 同じlegal / policy changeを再承認 | 1: sources expected hash一致時だけcandidate化し、license / redistributionをlockへexact copy |
| 8 | 時刻・タイムゾーン | 非該当 | license approvalにtimestampを使わない | 2: review済みsource diffだけを承認記録にする |
| 9 | 文字列 | 該当 | description空白、Unicode name、invalid UTF-8 | 1: trim後非空、declaration exact match、UTF-8 parseを spec に明記 |
| 10 | 数値 | 非該当 | metadata意味値に数値なし | — |
| 11 | 巨大入力・リソース枯渇 | 該当 |巨大 frontmatter / remote・local legal blob、Contents APIの1 MiB境界 | 1: single-file / cohort / metadata limitsを SKUP-7で適用し、remote legalはtree SHA由来Git Blob API、共有sourceは重複読込なしとする |
| 12 | 状態遷移の未定義パス | 該当 | legal text / license / redistribution変更をどう承認するか | 1: 利用者確認済み推奨案どおりsources明示更新だけを承認経路にし、remote / local blockedは拒否 |

## SKUP-9 preview と apply を同じ immutable plan へ束縛する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | change 0件、plan 0 cohort | 1: no-op / up-to-date、exit 0、writeなしと spec に明記 |
| 2 | 境界値 | 該当 |1 cohort、1 changed file、全unchanged | 1: 同じplan modelで扱い status vocabularyへ写像 |
| 3 | 重複・衝突 | 該当 | plan内target collision | 1: global preflightでplan生成失敗、mutationなし |
| 4 | 順序 | 該当 | diff / warning / cohort orderとlock更新順 | 1: canonical orderと連鎖するexpected-before / candidate-after lock bytesを固定 |
| 5 | 型・形式不正 | 該当 | unknown / conflicting options | 1: usage error、exit 1、mutation前停止と SKUP-11 に明記 |
| 6 | エラー経路 | 該当 | global / per-step freshness failure、verification / selected tagだけ変化、current lock mismatch、local target / legal変化、apply global observationの一部失敗 | 1: lock影響意味値のcanonical observation fingerprintをglobal / per-stepで比較し、不一致なら対象failed / 後続not-attemptedでnew preview要求、dry-run / apply共通cohort resultを返してmutationしないとspecに明記 |
| 7 | 冪等性・再実行 | 該当 | same apply再実行 | 1: no-content-change、target/lock bytes非書換え scenarioを spec に明記 |
| 8 | 時刻・タイムゾーン | 非該当 | plan freshnessをwall-clock TTLで判定しない | 2: sources / lock / target digestとremote observation fingerprint一致だけを使用 |
| 9 | 文字列 | 該当 | human output locale差、JSON Unicode | 1: machine schemaはcanonical values、human文面はsemantic判定に使わない |
| 10 | 数値 | 該当 | counts / exit code | 1: validated counts、exit 0 / 3 / 1へ限定 |
| 11 | 巨大入力・リソース枯渇 | 該当 |巨大 diff / cohortごとのplanned lock bytes | 1: sources / lock各10 MiB、skills / cohort各500件上限内でexpected-before / candidate-after bytesとdigestを保持 |
| 12 | 状態遷移の未定義パス | 該当 | 先行lock更新後の次cohort freshness、local entriesの更新単位 | 1: remoteはlock chain、localは全entries単一expected-before / candidate-after planと固定 |

## SKUP-10 cohort apply を回復可能 transaction にする

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | no-op plan、before image欠落 | 1: no-opはtransaction開始なし、必要before image欠落はmutation前error |
| 2 | 境界値 | 該当 | remote failureが最初/最後transition、local lock置換前/後で発生 | 1: 各transition後digest、remote lock-last、local single lock replacementとrollbackをdesign / specに明記 |
| 3 | 重複・衝突 | 該当 |同時apply、staging root既存 | 1: exclusive transaction root取得失敗をmutation前exit 1と spec に明記 |
| 4 | 順序 | 該当 | target / lock replacement、rollback、failure後継続、local entry順 | 1: remote targets→lock / rollback逆順、localは全entry一括candidate lockでpartial update禁止とdesignに固定 |
| 5 | 型・形式不正 | 該当 | corrupt manifest / before image | 1: unknown、automatic retry禁止、manual recovery案内 |
| 6 | エラー経路 | 該当 | staging、reread、replace、rollback、post-read failure、local lock-only failure | 1: remote / localのapplied / rolled-back / unknown / not-attempted state machineとexit 1をspecに明記 |
| 7 | 冪等性・再実行 | 該当 | crash後の自動再実行 | 1: unresolved manifest中はnew mutationとauto retryを拒否 |
| 8 | 時刻・タイムゾーン | 非該当 | manifest freshnessをwall-clockで決めない | 2: digest / stateだけを使用 |
| 9 | 文字列 | 該当 | temp path injection | 1:固定 transaction rootとcanonical managed pathsだけを使用 |
| 10 | 数値 | 該当 | transition index / digest count overflow | 1: bounded cohort/file limitsとvalidated integerを利用 |
| 11 | 巨大入力・リソース枯渇 | 該当 | staging + before imageでdisk不足 | 1: mutation前に全candidate作成・reread、failure時no mutationまたはrollback |
| 12 | 状態遷移の未定義パス | 該当 | multi-path atomicity、rollback後の残りcohort、local partial update、unknown後の扱い | 1: remote recoverable cohort transaction、local全entry単一lock transaction、unknown soft stopを明記 |

## SKUP-11 command と machine output を安定させる

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |対象0件、warnings/errors空配列 | 1: schema fieldsは常に出力し no-op exit 0と spec に明記 |
| 2 | 境界値 | 該当 | exit 0 / 3 / 1 priority | 1: error=1、fail-on-update=3、それ以外=0の優先規則を spec に明記 |
| 3 | 重複・衝突 | 該当 | update availableとerror併存 | 1:両方列挙し exit 1優先と spec に明記 |
| 4 | 順序 | 該当 | cohorts / warnings / errors order | 1: canonical orderと stable schema fieldsを design / spec に明記 |
| 5 | 型・形式不正 | 該当 | unknown command / option / conflicting modes | 1: usage error、exit 1、mutation前停止と spec に明記 |
| 6 | エラー経路 | 該当 | renderer failure、stdout partial | 1: operation error扱い。machine semanticはconstructed result modelを正本にする |
| 7 | 冪等性・再実行 | 該当 | links / verify / dry-run / lock-local dry-run、未宣言directoryの暗黙link、plugin-only declaration | 1: dry-run/read-onlyはwriteなし、linksは宣言済みremote / localだけを冪等処理し未宣言directoryをmutation前拒否、対象0件はshell未起動no-op、lock-localは全local同一plan再実行でno-content-change |
| 8 | 時刻・タイムゾーン | 非該当 | outputにtimestampを要求しない | 2: deterministic outputから時刻を除外 |
| 9 | 文字列 | 該当 | Unicode path / error、credential-shaped text | 1: UTF-8 JSON、validated values、credential redaction boundaryを SKUP-3で要求 |
| 10 | 数値 | 該当 | schemaVersion / exitCode / counts | 1: fixed schemaVersion 1、exitCode enum、safe integer counts |
| 11 | 巨大入力・リソース枯渇 | 該当 | output size | 1: upstream limitsとcanonical summary。full file bytesをmachine outputへ含めない |
| 12 | 状態遷移の未定義パス | 該当 |旧 skills:update / skills:upstream の扱い、一部cohort失敗時の成功cohort状態 | 1: compatibility aliasなし、legacy残存test failure、全cohortをpure classifierまたはfailedで一度ずつ列挙するとspecに明記 |

## SKUP-12 parity gate 後に legacy checker を置換し offline integrity を通常 check に含める

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | existing lock 0件、migration mapping欠落 | 1: 0件はvalid inventory、1件以上なら全entry bijection必須。黙示脱落禁止 |
| 2 | 境界値 | 該当 | parity 10/11、全entry-1、active change count | 1:全11 cases / 全entries / exactly one active changeが揃うまでdeletion gate不成立 |
| 3 | 重複・衝突 | 該当 | 一旧entryが複数new entryへ重複移行、plugin target生成、local 4件のroot LICENSE共有 | 1: entry一対一、plugin targetなし、local shared repository-level legal source / target複製なしをtest |
| 4 | 順序 | 該当 | migration / test実行順 | 1: inventory→new implementation→parity→deletion→offline CIの依存順を tasks に固定 |
| 5 | 型・形式不正 | 該当 | legacy entry malformed、blocked remote / local | 1: 黙示修正やownership変換をせずmigration blocker、旧checkerを維持 |
| 6 | エラー経路 | 該当 |一 parity / integrity test failure | 1: deletion禁止、checkbox未完了、修正後fresh validationと spec / tasks に明記 |
| 7 | 冪等性・再実行 | 該当 | migration / cutover再実行、policy drift | 1: canonical sources / lock同bytes、license / redistribution exact-copy、legacy残存scanで検証 |
| 8 | 時刻・タイムゾーン | 非該当 | migration判断に日時なし | 2: tracked main stateとtest結果だけを入力にする |
| 9 | 文字列 | 該当 | legacy name / path / source URL variants | 1: explicit normalized mappingsとcanonical pathsへ移行しraw provenanceをtest照合 |
| 10 | 数値 | 該当 | H1〜H11 count、entry count | 1: exactly 11 case IDsとinventory totalをmachine testで比較 |
| 11 | 巨大入力・リソース枯渇 | 該当 | full suite / offline isolation cost | 1: focused parity tests後、最新入力のtask check。remote checkは通常CIから除外 |
| 12 | 状態遷移の未定義パス | 該当 | `.planning/`移行、gate前削除、close | 1: 最初のtaskでtracked `.planning` / branch diff 0を再検証。gate前削除禁止、OSWF-5後にclose |

## Phase 2 Test Mapping

実装時、各該当穴を以下の検証形態へ接続する。個別 test 名は task 実装時に確定し、対応 requirement / scenario ID を test 名または test table に残す。

| 穴 | 検証形態 | テスト予定 | 備考 |
| --- | --- | --- | --- |
| schema、variant、重複、unknown field | 例示 test + deterministic table | Node source / lock decoder tests | pure decoder |
| canonical JSON / path / hash / order / idempotence | deterministic property matrix + golden bytes | Node foundation tests | production helperでexpectedを再生成しない |
| remote final tree / legal overlap / local external legal | 例示test + golden tree / legal hashes | Node foundation / migration tests | 同bytes重複排除、異bytes拒否、root LICENSE非複製 |
| SemVer / YAML boundaries | 例示 test + parser matrix | Node parser adapter tests | exact pinned packages |
| GitHub errors / pagination / credential redaction | fake `gh` transcript integration tests | Node GitHub adapter tests | network不要 |
| cohort / chained lock plan / exit priority | deterministic service tests | Node planner / CLI tests | immutable observationを注入 |
| dirty / freshness / transaction transitions | temporary repository + failure injection | Node transaction tests | remote cohortと全local lock-only transactionのapplied / rolled-back / unknown / not-attemptedを検証 |
| H1〜H11 / migration inventory / legacy deletion | parity / repository contract tests | Node migration tests | deletion gate前に全green必須 |
| offline `task check` | isolated command smoke | `task check:isolated` と focused command | remote API不使用を検証 |
