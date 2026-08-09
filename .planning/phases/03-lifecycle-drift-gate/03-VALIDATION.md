---
phase: 03
slug: lifecycle-drift-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-09
updated: 2026-08-09
---

# Phase 03 — Gate E Validation Strategy

> 03-30〜03-50のproduction-first convergence、単一FINAL repin、fresh report chain、HND/OpenSpec分離、post-metadata proofを管理する実行契約。

**Current execution position:** historical 03-01〜03-29は完了済み。Gate E gap closureは03-30（Wave 24）が次で、03-30〜03-50は未実行。03-43だけがfresh exact-hash human approvalを要求する。03-47のactual isolated wheel smokeとactual OpenSpec/GSD host smoke、03-50のpost-metadata proofはoptional/manualではなくGate E exit必須証拠。

## Test Infrastructure

| Property | Value |
| --- | --- |
| Framework | pytest / Hypothesis（既存設定は`pyproject.toml`） |
| Pre-repin literal authority | pinned Gate E ledger/oracle at `77a8c028076dab695a089279aadfbcb070cc5ac6`; `tests/gate_e_semantic_operation_authority.py` |
| FINAL literal authority | fresh approval後の03-44だけがpublishする`tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json` |
| Fast feedback | 各PLANのtask-local `<verify><automated>` command |
| Aggregate Gate E | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py tests/test_handoff_gate_e_*.py -q` |
| Phase1→2 regression | pinned/current Git inventoryとexact一致する14 filesを03-42 parserで一件ずつ実行し、03-47でも14 filesを明示実行 |
| Artifact/runtime | resolved built-wheel pathによるisolated smoke + actual `task openspec:gsd-handoff:smoke CHANGE_ID=harden-openspec-gsd-handoff-lifecycle GSD_HOME=/home/shimi3435/.codex` |
| Report chain | `scripts/verify_gate_e_report_chain.py` generation 1/2/3 + dedicated `tests/test_verify_gate_e_report_chain.py` Git fault matrix |
| Closeout | `scripts/verify_gate_e_closeout.py` pre-hnd→openspec→pre-post-metadata→post-metadata-proof; official `phase.complete` only after proof PASS |

## Wave Sampling and Exit Gates

| Wave | Plans | Required exit evidence |
| --- | --- | --- |
| 24 | 03-30 | test-code semantic/oracle authority、GE-FRZ H01〜H12、bounded freeze GREEN、tracked JSON authority absent |
| 25 | 03-31, 03-32, 03-33, 03-35, 03-36, 03-37 | GE-NFC/GE-TOT各H01〜H12、authority-derived semantic slices、各public consumers GREEN |
| 26 | 03-34, 03-38 | source/mapping totality、9-call/exact 21 nominal outcomes/fault-secondary-fresh-state matrix GREEN |
| 27 | 03-39 | replace/no-op fresh canonical proof full matrix GREEN |
| 28 | 03-40 | change-wide publication/readiness separation + isolated wheel GREEN |
| 29 | 03-41 | complete authority graph/race matrix GREEN |
| 30 | 03-42 | Gate E aggregate、exact 14-file regression、production-failure isolation、wheel GREEN、transaction fault matrix後にだけpreview生成 |
| 31 | 03-43 | preview/protected hashes unchanged後、fresh exact `preview_sha256` human approval |
| 32 | 03-44 | approved eight-target prepare→apply→post-apply-verify。partial replace faultはcompletion absent/recovery required |
| 33 | 03-45 | report parser fault matrix、fresh reviewer generation 1、separate repin/implementation/generation heads、zero findings |
| 34 | 03-46 | fresh security generation 2、stage-specific generation parent、high/ASVS zero |
| 35 | 03-47 | 全H rows trace、全14 regression、OpenSpec/project/static gates、isolated wheel、actual host smoke、fresh verifier generation 3 |
| 36 | 03-48 | strict parser GREEN、pre-HND state、HND-03は標準requirements metadata hookだけでComplete |
| 37 | 03-49 | committed 03-48 HND metadataを親証拠にOpenSpec3.1だけclose、PROJECT同期、Phase4 Blocked |
| 38 | 03-50 | committed 03-49 SUMMARY metadata HEADとproof direct-parentを検証。PASS後だけ公式phase completion |

## Per-Task Verification Map

`Command`は各PLANのcanonical automated command。各task commit直前にそのまま実行し、RED taskは期待した契約failureを観測した後、同planのGREEN taskで全列挙nodeをGREENにする。

| Task ID | Wave | Evidence | Command |
| --- | --- | --- | --- |
| 03-30-01 | 24 | test-code authority + GE-FRZ contract RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_boundary.py -q` |
| 03-30-02 | 24 | freeze boundary/identity GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_boundary.py tests/test_handoff_identity.py -q && uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/gate_e_boundary.py src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_boundary.py && uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/gate_e_boundary.py src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_boundary.py && git diff --check` |
| 03-31-01 | 25 | GE-NFC H01〜H12 RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_identity.py -q -k 'GE_NFC or GE_P_NFC_PATH or GE_E_NFC_REUSE'` |
| 03-31-02 | 25 | NFC public boundary GREEN | `uv run pytest tests/test_handoff_identity.py -q && uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_identity.py && uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_identity.py && git diff --check` |
| 03-32-01 | 25 | manifest authority slice/totality RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py -q` |
| 03-32-02 | 25 | manifest/versioned totality GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py tests/test_handoff_manifest.py tests/test_handoff_manifest_v2.py -q && uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py tests/test_handoff_manifest_totality.py && uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py tests/test_handoff_manifest_totality.py && git diff --check` |
| 03-33-01 | 25 | reader/policy/progress totality RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_reader_policy_progress_totality.py -q` |
| 03-33-02 | 25 | reader/policy/progress GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_reader_policy_progress_totality.py tests/test_handoff_core.py tests/test_handoff_policy_reference.py -q` |
| 03-34-01 | 26 | source/mapping totality RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_source_mapping_totality.py -q` |
| 03-34-02 | 26 | source/mapping GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_source_mapping_totality.py tests/test_handoff_identity.py tests/test_handoff_execution_mapping.py -q` |
| 03-35-01 | 25 | lifecycle operations/modes RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_lifecycle_totality.py -q` |
| 03-35-02 | 25 | observation/ownership/resume/finalize GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_lifecycle_totality.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` |
| 03-36-01 | 25 | entrypoint totality RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_entrypoint_totality.py -q` |
| 03-36-02 | 25 | CLI/discovery/preflight/smoke GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_entrypoint_totality.py tests/test_handoff_cli.py tests/test_handoff_discovery.py tests/test_handoff_preflight.py tests/test_handoff_smoke.py -q` |
| 03-37-01 | 25 | migration/refresh totality RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_migration_refresh_totality.py -q` |
| 03-37-02 | 25 | migration/refresh public boundary GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_migration_refresh_totality.py tests/test_handoff_migration.py tests/test_handoff_manifest_refresh.py -q` |
| 03-38-01 | 26 | exact 21 persistence outcomes/fault matrix RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_persistence_adapter.py -q` |
| 03-38-02 | 26 | migration/refresh persistence GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_persistence_adapter.py tests/test_handoff_migration.py tests/test_handoff_manifest_refresh.py -q` |
| 03-39-01 | 27 | fresh proof race/fault RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_fresh_canonical_proof.py -q` |
| 03-39-02 | 27 | Success-before-proof impossible GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_fresh_canonical_proof.py tests/test_handoff_migration.py tests/test_handoff_manifest_refresh.py -q` |
| 03-40-01 | 28 | publication contract RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_publication.py -q` |
| 03-40-02 | 28 | publication + resolved wheel GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_publication.py tests/test_handoff_manifest_refresh.py -q && gate_e_wheel_dir=$(mktemp -d) && uv build --wheel --out-dir "$gate_e_wheel_dir/dist" && gate_e_wheel_path=$(find "$gate_e_wheel_dir/dist" -maxdepth 1 -type f -name '*.whl' -print -quit) && test -n "$gate_e_wheel_path" && uv run --isolated --no-project --with "$gate_e_wheel_path" python scripts/smoke_installed_handoff_wheel.py` |
| 03-41-01 | 29 | authority graph/race RED | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_authority_binding.py -q` |
| 03-41-02 | 29 | authority evidence consumers GREEN | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_gate_e_authority_binding.py tests/test_handoff_migration.py tests/test_handoff_manifest_refresh.py -q` |
| 03-42-01 | 30 | aggregate + exact 14-file regression evidence | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py tests/test_handoff_gate_e_*.py tests/test_verify_gate_e_pre_repin.py -q && uv run python scripts/verify_gate_e_pre_repin.py --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --authority-module tests/gate_e_semantic_operation_authority.py --output .planning/phases/03-lifecycle-drift-gate/03-GATE-E-PRE-REPIN-REGRESSION.json --require-complete-inventory && uv run ruff check . && uv run basedpyright && git diff --check && gate_e_wheel_dir=$(mktemp -d) && uv build --wheel --out-dir "$gate_e_wheel_dir/dist" && gate_e_wheel_path=$(find "$gate_e_wheel_dir/dist" -maxdepth 1 -type f -name '*.whl' -print -quit) && test -n "$gate_e_wheel_path" && uv run --isolated --no-project --with "$gate_e_wheel_path" python scripts/smoke_installed_handoff_wheel.py` |
| 03-42-02 | 30 | driver/fault/protected preparation | `uv run pytest tests/test_repin_gate_e_authority.py -q && uv run python scripts/repin_gate_e_authority.py --help >/dev/null && uv run python -m json.tool .planning/phases/03-lifecycle-drift-gate/03-GATE-E-PROTECTED-HASHES.json >/dev/null && git diff --check` |
| 03-42-03 | 30 | zero-mutation preview | `uv run python -m json.tool .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-PREVIEW.json >/dev/null && git diff --check` |
| 03-43-01 | 31 | immutable approval subject | `uv run python -m json.tool .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-PREVIEW.json >/dev/null && git diff --check` |
| 03-43-02 | 31 | fresh exact-hash approval | `uv run python -m json.tool .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-PREVIEW.json >/dev/null && git diff --check` plus human `approved: {exact preview_sha256 shown by Task 1}` |
| 03-44-01 | 32 | approved eight-target transaction | `uv run python scripts/repin_gate_e_authority.py prepare --preview .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-PREVIEW.json --protected-manifest .planning/phases/03-lifecycle-drift-gate/03-GATE-E-PROTECTED-HASHES.json --transaction-dir .planning/phases/03-lifecycle-drift-gate/.gate-e-repin-transaction && uv run python scripts/repin_gate_e_authority.py apply --preview .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-PREVIEW.json --protected-manifest .planning/phases/03-lifecycle-drift-gate/03-GATE-E-PROTECTED-HASHES.json --transaction-dir .planning/phases/03-lifecycle-drift-gate/.gate-e-repin-transaction && uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py tests/test_handoff_gate_e_*.py tests/test_handoff_manifest_refresh.py tests/test_handoff_lifecycle_gate.py tests/test_repin_gate_e_authority.py -q && cmp tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json .planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json && git diff --check` |
| 03-44-02 | 32 | post-apply hashes/residue/completion | `uv run python scripts/repin_gate_e_authority.py post-apply-verify --preview .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-PREVIEW.json --protected-manifest .planning/phases/03-lifecycle-drift-gate/03-GATE-E-PROTECTED-HASHES.json --transaction-dir .planning/phases/03-lifecycle-drift-gate/.gate-e-repin-transaction --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json && uv run python -m json.tool .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json >/dev/null && uv run pytest tests/test_repin_gate_e_authority.py -q && task openspec:validate && task check && uv run ruff check . && uv run basedpyright && git diff --check` |
| 03-45-01 | 33 | parser fault matrix + fresh review generation | `uv run pytest tests/test_verify_gate_e_report_chain.py tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py tests/test_handoff_gate_e_*.py tests/test_repin_gate_e_authority.py -q && uv run python scripts/verify_gate_e_report_chain.py review --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --report .planning/phases/03-lifecycle-drift-gate/03-REVIEW.md && uv run ruff check scripts/verify_gate_e_report_chain.py tests/test_verify_gate_e_report_chain.py && uv run basedpyright scripts/verify_gate_e_report_chain.py tests/test_verify_gate_e_report_chain.py && git diff --check` |
| 03-45-02 | 33 | committed review direct-parent + zero findings | `uv run python scripts/verify_gate_e_report_chain.py review --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --report .planning/phases/03-lifecycle-drift-gate/03-REVIEW.md --require-pass --require-committed-generation` |
| 03-46-01 | 34 | fresh security report + three-head chain | `uv run pytest tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py tests/test_handoff_gate_e_*.py -q && uv run python scripts/verify_gate_e_report_chain.py security --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --predecessor-sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --report .planning/phases/03-lifecycle-drift-gate/03-SECURITY.md && git diff --check` |
| 03-46-02 | 34 | committed security direct-parent + high/ASVS zero | `uv run python scripts/verify_gate_e_report_chain.py security --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --predecessor-sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --report .planning/phases/03-lifecycle-drift-gate/03-SECURITY.md --require-pass --require-committed-generation` |
| 03-47-01 | 35 | all H rows + exact 14 regressions + static/wheel/host evidence | `uv run pytest tests/test_verify_gate_e_report_chain.py tests/test_handoff_gate_e_oracle_authority.py tests/test_handoff_manifest_totality.py tests/test_handoff_gate_e_*.py -q && uv run pytest tests/test_handoff_cli.py tests/test_handoff_core.py tests/test_handoff_discovery.py tests/test_handoff_execution_mapping.py tests/test_handoff_identity.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_manifest.py tests/test_handoff_manifest_refresh.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py tests/test_handoff_policy_reference.py tests/test_handoff_preflight.py tests/test_handoff_smoke.py -q && task openspec:validate && task check && uv run ruff check . && uv run basedpyright && git diff --check && gate_e_wheel_dir=$(mktemp -d) && uv build --wheel --out-dir "$gate_e_wheel_dir/dist" && gate_e_wheel_path=$(find "$gate_e_wheel_dir/dist" -maxdepth 1 -type f -name '*.whl' -print -quit) && test -n "$gate_e_wheel_path" && uv run --isolated --no-project --with "$gate_e_wheel_path" python scripts/smoke_installed_handoff_wheel.py && task openspec:gsd-handoff:smoke CHANGE_ID=harden-openspec-gsd-handoff-lifecycle GSD_HOME=/home/shimi3435/.codex` |
| 03-47-02 | 35 | committed generation-3 exact row/report chain PASS | `uv run python scripts/verify_gate_e_report_chain.py verification --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --predecessor-sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --sidecar .planning/phases/03-lifecycle-drift-gate/03-VERIFICATION-GATE.json --report .planning/phases/03-lifecycle-drift-gate/03-VERIFICATION.md --require-pass --require-committed-generation` |
| 03-48-01 | 36 | closeout/report/metadata fault matrix | `uv run pytest tests/test_verify_gate_e_closeout.py tests/test_verify_gate_e_report_chain.py -q && uv run ruff check scripts/verify_gate_e_closeout.py tests/test_verify_gate_e_closeout.py && uv run basedpyright scripts/verify_gate_e_closeout.py tests/test_verify_gate_e_closeout.py && git diff --check` |
| 03-48-02 | 36 | pre-HND exact state; standard hook owns transition | `uv run python scripts/verify_gate_e_closeout.py pre-hnd --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --review-sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --security-sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --verification-sidecar .planning/phases/03-lifecycle-drift-gate/03-VERIFICATION-GATE.json --manifest .planning/phases/03-lifecycle-drift-gate/03-HND-03-CLOSEOUT.json --require-exact-state && git diff --check` |
| 03-49-01 | 37 | committed HND metadata parent + only OpenSpec 3.1 transition | `uv run python scripts/verify_gate_e_closeout.py openspec --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --review-sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --security-sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --verification-sidecar .planning/phases/03-lifecycle-drift-gate/03-VERIFICATION-GATE.json --manifest .planning/phases/03-lifecycle-drift-gate/03-HND-03-CLOSEOUT.json --require-hnd-metadata-commit --require-exact-state && task openspec:validate && git diff --check` |
| 03-49-02 | 37 | PROJECT source sync + pre-post-metadata blocked state | `task openspec:validate && task check && uv run python scripts/verify_gate_e_closeout.py pre-post-metadata --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --review-sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --security-sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --verification-sidecar .planning/phases/03-lifecycle-drift-gate/03-VERIFICATION-GATE.json --manifest .planning/phases/03-lifecycle-drift-gate/03-HND-03-CLOSEOUT.json --require-exact-state && git diff --check` |
| 03-50-01 | 38 | committed 03-49 metadata HEAD proof generation | `uv run python scripts/verify_gate_e_closeout.py post-metadata --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --review-sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --security-sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --verification-sidecar .planning/phases/03-lifecycle-drift-gate/03-VERIFICATION-GATE.json --manifest .planning/phases/03-lifecycle-drift-gate/03-HND-03-CLOSEOUT.json --proof .planning/phases/03-lifecycle-drift-gate/03-GATE-E-POST-METADATA.json --emit-proof --require-exact-state && uv run python -m json.tool .planning/phases/03-lifecycle-drift-gate/03-GATE-E-POST-METADATA.json >/dev/null && git diff --check` |
| 03-50-02 | 38 | committed proof artifact/direct-parent PASS | `uv run python scripts/verify_gate_e_closeout.py post-metadata-proof --source-commit 77a8c028076dab695a089279aadfbcb070cc5ac6 --completion .planning/phases/03-lifecycle-drift-gate/03-GATE-E-REPIN-COMPLETION.json --authority tests/fixtures/openspec_gsd_handoff/gate_e/semantic-operation-authority.json --review-sidecar .planning/phases/03-lifecycle-drift-gate/03-REVIEW-GATE.json --security-sidecar .planning/phases/03-lifecycle-drift-gate/03-SECURITY-GATE.json --verification-sidecar .planning/phases/03-lifecycle-drift-gate/03-VERIFICATION-GATE.json --manifest .planning/phases/03-lifecycle-drift-gate/03-HND-03-CLOSEOUT.json --proof .planning/phases/03-lifecycle-drift-gate/03-GATE-E-POST-METADATA.json --require-committed-generation --require-exact-state && git diff --check` |

## Phase1→2 Exact Regression Inventory

03-42はpinned treeとcurrent treeからinventoryを機械導出してexact-setを要求し、次の14 filesを各別processで実行する: `test_handoff_cli.py`, `test_handoff_core.py`, `test_handoff_discovery.py`, `test_handoff_execution_mapping.py`, `test_handoff_identity.py`, `test_handoff_lifecycle_drift.py`, `test_handoff_lifecycle_gate.py`, `test_handoff_manifest.py`, `test_handoff_manifest_refresh.py`, `test_handoff_manifest_v2.py`, `test_handoff_migration.py`, `test_handoff_policy_reference.py`, `test_handoff_preflight.py`, `test_handoff_smoke.py`。source-pinned期待値だけのREDを隔離するclassifierはcurrent production behavior oracleが全GREENの場合だけ許可し、production/mixed failureをstale fixtureへ分類できないfault testsを必須とする。

## Failure Policy

- fixture-first、count hardcode、fixed-change/phase/default-path production dependencyは即BLOCKER。専用FINAL repin前にtracked JSON authority/fixture/golden/canonical sourceを更新しない。
- H01〜H12は各familyでexact-set。N/Aもliteral test ID、pinned理由、scope assertion、result `b`が一致しなければBLOCKER。
- REDはproduction failure、source-pinned-only expectation failure、test infrastructure failureを機械的に区別する。分類不能/mixed/skip/xfailedはGREENにしない。
- 03-44 partial publication後はcompletion artifactを作らずrollback/recoveryを完了する。
- report sidecarは`repin_completion_commit`、`implementation_target_head`、stage `generation_parent_head`を別々にGitから導出する。同一commit、self-reported hash、ancestor-only targetは受理しない。
- 03-48 task actionはHNDを書かず、標準requirements metadata commitがsole writer。03-49はそのcommitted parent後だけOpenSpec3.1をcloseする。
- 03-50 proofは03-49 SUMMARY metadata headとproof artifact direct parentを検証する。proof前はPhase3 In Progress/Phase4 Blocked。公式phase.completeだけが後でPhase3 Complete/Phase4 Readyを書く。
- actual wheelまたはactual host smokeを実行不能/unsupported/skipとした場合、Gate Eは未完了のまま停止する。

## Manual-Only Verification

03-43 Task 2のfresh exact preview-hash approvalだけがmanual。actual wheel smoke、actual OpenSpec/GSD host smoke、review/security/verifier parsers、HND/OpenSpec transitions、post-metadata proofはすべてautomated mandatory exit evidenceでありmanual代替不可。

## Sign-Off

- [ ] 03-30〜03-41の全family H01〜H12とproduction behaviorがGREEN、pre-repin authorityはtest-codeのみ
- [ ] 03-42 exact 14-file regression、transaction fault matrix、protected manifestがproduction-first GREEN
- [ ] 03-43 fresh exact-hash approval後、03-44だけがFINAL JSON authorityを含むeight-target repinを行いpost-apply verifyがGREEN
- [ ] 03-45/46/47のfresh distinct roles、separate three-head model、Git-derived report chainがPASS
- [ ] 03-47 aggregate、全14 regression、OpenSpec/project/static、isolated wheel、actual host smokeが全GREEN
- [ ] 03-48標準metadata commitだけがHND-03をcloseし、03-49はそのGit証拠後だけOpenSpec3.1をclose
- [ ] 03-50 post-metadata proof/direct-parentがPASSするまでPhase3 In Progress/Phase4 Blocked
- [ ] proof PASS後の公式phase.complete commitだけがPhase3 Complete/Phase4 Readyを記録
- [ ] OpenSpec spec/design、03-01〜03-29、SUMMARY、historical Gate D evidenceが不変

**Approval:** pending
