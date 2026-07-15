# Phase 3 Acceptance Evidence

- Source commit: `5a1f78b81f546c900745328fad24f9adb073e768`
- Proposal path: `openspec/changes/automate-openspec-gsd-handoff/proposal.md`
- Design path: `openspec/changes/automate-openspec-gsd-handoff/design.md`
- Spec path: `openspec/changes/automate-openspec-gsd-handoff/specs/openspec-gsd-handoff-automation/spec.md`
- Tasks path: `openspec/changes/automate-openspec-gsd-handoff/tasks.md`

The coordinate labels below are document-local positions derived from the pinned requirement, scenario, and design table order. They are not stable requirement identifiers and do not replace OpenSpec.

## Requirements

| Coordinate | Kind | Locator | Reason |
| --- | --- | --- | --- |
| R1 | production-test | src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py; tests/test_handoff_discovery.py::test_pinned_openspec_contract_routes_each_named_case | discovery and reader behavior are exercised through the public discovery seam |
| R2 | property-test | src/ai_coding_template_ja/openspec_gsd_handoff/progress.py; tests/test_handoff_core.py::test_progress_parse_is_deterministic_and_idempotent | normalized progress invariants are checked over generated valid task lists |
| R3 | production-test | src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py; tests/test_handoff_manifest.py::test_repository_persists_prepared_then_transitions_only_to_started | deterministic persistence and the only MVP state transition are exercised |
| R4 | fixture-test | .agents/skills/execute-openspec-change/SKILL.md; tests/test_execute_openspec_change_skill.py::test_started_transition_is_reachable_only_after_conservative_acceptance | approval and dispatch remain gated by fixed preflight and acceptance contracts |
| R5 | real-smoke | Taskfile.yml; tests/test_handoff_smoke.py::test_supported_smoke_reports_only_bounded_redacted_evidence | normal fixtures and the recorded opt-in run establish the optional-tool boundary |

## Scenarios

| Coordinate | Kind | Locator | Reason |
| --- | --- | --- | --- |
| R1-S01 | fixture-test | tests/test_handoff_discovery.py::test_positive_json_and_fallback_share_values_but_keep_distinct_routes | supported JSON discovers disk Markdown and retains only the route distinction |
| R1-S02 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_openspec_case_has_the_expected_classified_route | absent, nonzero, version, JSON, schema, and parity failures use the fixed fixture matrix |
| R1-S03 | fixture-test | tests/test_handoff_cli.py::test_prepare_stops_on_present_empty_missing_artifacts_before_preflight_or_write | blocked or missing artifacts stop before preflight and persistence |
| R1-S04 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_openspec_case_has_the_expected_classified_route | the all-done fixture routes to the final boundary instead of GSD |
| R1-S05 | fixture-test | tests/test_handoff_cli.py::test_inspect_fails_closed_for_canonical_artifact_symlink | unsafe or ambiguous canonical paths return no discovery value |
| R1-S06 | production-test | tests/test_handoff_core.py::test_reader_enforces_exact_file_and_aggregate_boundaries | canonical file, aggregate, count, task, and change identifier bounds fail without truncation |
| R2-S01 | production-test | tests/test_handoff_core.py::test_progress_preserves_order_unicode_and_number_text | well-formed checkboxes produce sequential identifiers and normalized counts |
| R2-S02 | fixture-test | tests/test_handoff_discovery.py::test_positive_json_and_fallback_share_values_but_keep_distinct_routes | JSON metadata and Markdown progress match exactly |
| R2-S03 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_openspec_case_has_the_expected_classified_route | progress mismatch rejects the candidate JSON route |
| R2-S04 | property-test | tests/test_handoff_core.py::test_progress_parse_is_deterministic_and_idempotent | invalid forms fail closed and valid forms remain deterministic |
| R3-S01 | fixture-test | tests/test_handoff_manifest.py::test_expected_fixture_round_trips_to_deterministic_bytes | the minimal prepared manifest matches fixed canonical serialization |
| R3-S02 | production-test | tests/test_handoff_cli.py::test_mark_started_requires_gsd_acceptance_and_only_transitions_manifest | started requires explicit accepted evidence and changes no other state |
| R3-S03 | fixture-test | tests/test_execute_openspec_change_skill.py::test_manifest_report_requires_distinct_later_commit_without_automation | operator reporting separates source and later tracking commits |
| R3-S04 | production-test | tests/test_handoff_preflight.py::test_source_policy_and_host_fail_closed_without_write_authorization | ignored or untracked planning state never receives write authorization |
| R3-S05 | fixture-test | tests/test_handoff_manifest.py::test_parser_rejects_malformed_or_non_minimal_manifest | malformed, unsupported, unsafe, and partial state is rejected |
| R3-S06 | canonical-non-applicable | docs/optional/gsd.md section final completion | MVP intentionally provides manual close guidance and no automated finalize or cleanup operation |
| R4-S01 | production-test | tests/test_handoff_preflight.py::test_valid_source_policy_and_host_are_separate_authorization_evidence | policy, exact tools, Git source, and host evidence are all required |
| R4-S02 | fixture-test | tests/test_execute_openspec_change_skill.py::test_payload_fixture_is_exactly_equal_for_both_routes | fresh approval gates one parity payload for either GSD entrypoint |
| R4-S03 | fixture-test | tests/test_execute_openspec_change_skill.py::test_generic_preflight_completes_before_preview_approval_or_prepare | generic hosts require a complete role preamble and isolation-compatible workflow |
| R4-S04 | production-test | tests/test_handoff_preflight.py::test_source_policy_and_host_fail_closed_without_write_authorization | every missing policy, tool, source, or host item stops before writes |
| R4-S05 | fixture-test | tests/test_execute_openspec_change_skill.py::test_non_accepted_report_preserves_manual_continuation_and_scope | partial dispatch keeps prepared state and reports manual continuation without retry |
| R4-S06 | canonical-non-applicable | .agents/skills/execute-openspec-change/SKILL.md section evidence limits | lifecycle automation is intentionally outside this MVP and delegated to manual policy or a later change |
| R5-S01 | real-smoke | task check:without-gsd; exit 0 with 248 tests | isolated empty homes and curated PATH proved normal CI without Node, OpenSpec, or GSD |
| R5-S02 | fixture-test | tests/test_handoff_discovery.py::test_positive_json_and_fallback_share_values_but_keep_distinct_routes | sorted identities, hashes, canonical bytes, and normalized progress match |
| R5-S03 | fixture-test | tests/test_handoff_manifest.py::test_faults_never_advance_target_and_report_cleanup_evidence | malformed inputs and partial writes retain deterministic fail-closed state |
| R5-S04 | real-smoke | task openspec:gsd-handoff:smoke with redacted GSD_HOME; exit 0 | OpenSpec 1.3.1 and GSD 1.5.0 produced route json, initialized gsd-phase signal, and no repository write |

## Spec holes

| Coordinate | Kind | Locator | Reason |
| --- | --- | --- | --- |
| R1-H01 | fixture-test | tests/test_handoff_core.py::test_reader_rejects_unsafe_or_ambiguous_artifacts | empty or ambiguous artifact claims fail closed |
| R1-H02 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_openspec_case_has_the_expected_classified_route | zero, singleton, and multiple path cardinalities follow the fixed schema |
| R1-H03 | fixture-test | tests/test_handoff_core.py::test_reader_rejects_unsafe_or_ambiguous_artifacts | duplicate kinds or paths are rejected rather than deduplicated |
| R1-H04 | fixture-test | tests/test_handoff_discovery.py::test_multi_spec_json_order_has_exact_fallback_parity | multiple specs normalize to deterministic route parity |
| R1-H05 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_openspec_case_has_the_expected_classified_route | malformed schema and Markdown candidates do not become partial JSON input |
| R1-H06 | fixture-test | tests/test_handoff_discovery.py::test_fallback_path_failure_returns_no_partial_discovery | partial read failure returns no discovery value |
| R1-H07 | fixture-test | tests/test_handoff_discovery.py::test_positive_json_and_fallback_share_values_but_keep_distinct_routes | both routes converge on one reader and exact artifact values |
| R1-H08 | canonical-non-applicable | canonical design R1 row 08 | mtime is deliberately excluded from canonical authority |
| R1-H09 | production-test | tests/test_handoff_core.py::test_reader_rejects_unsafe_or_ambiguous_artifacts | Unicode and traversal path cases pass validation or fail closed |
| R1-H10 | canonical-non-applicable | canonical design R1 row 10 | canonical Markdown is not subject to numeric computation |
| R1-H11 | production-test | tests/test_handoff_core.py::test_reader_enforces_exact_file_and_aggregate_boundaries | file count and byte limits fail without truncation |
| R1-H12 | fixture-test | tests/test_handoff_discovery.py::test_missing_artifacts_field_never_starts_markdown_fallback | fallback restart, terminal blocked, and final-boundary states remain distinct |
| R2-H01 | production-test | tests/test_handoff_core.py::test_progress_fails_closed_without_partial_value | empty tasks returns no partial progress |
| R2-H02 | production-test | tests/test_handoff_core.py::test_progress_preserves_order_unicode_and_number_text | single and mixed completion boundaries produce consistent counts |
| R2-H03 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_openspec_case_has_the_expected_classified_route | duplicate identifiers and candidate metadata mismatch are rejected |
| R2-H04 | property-test | tests/test_handoff_core.py::test_progress_parse_is_deterministic_and_idempotent | aggregate counts are invariant while task display order remains source order |
| R2-H05 | production-test | tests/test_handoff_core.py::test_progress_fails_closed_without_partial_value | broken checkbox forms and invalid numeric metadata fail closed |
| R2-H06 | production-test | tests/test_handoff_core.py::test_progress_fails_closed_without_partial_value | parse errors never return partial task counts |
| R2-H07 | property-test | tests/test_handoff_core.py::test_progress_parse_is_deterministic_and_idempotent | repeated parsing returns the same normalized value |
| R2-H08 | canonical-non-applicable | canonical design R2 row 08 | time and timezone do not contribute to task progress |
| R2-H09 | production-test | tests/test_handoff_core.py::test_progress_preserves_order_unicode_and_number_text | Unicode descriptions and checkbox-like text are retained safely |
| R2-H10 | production-test | tests/test_handoff_core.py::test_candidate_progress_rejects_boolean_counts_without_partial_value | negative, boolean, and inconsistent numeric counts are rejected |
| R2-H11 | production-test | tests/test_handoff_core.py::test_progress_rejects_more_than_pinned_task_limit | the 4096 task limit is enforced without partial output |
| R2-H12 | property-test | tests/test_handoff_core.py::test_progress_parse_is_deterministic_and_idempotent | current Markdown is recomputed as authority on every invocation |
| R3-H01 | fixture-test | tests/test_handoff_manifest.py::test_parser_rejects_malformed_or_non_minimal_manifest | missing mandatory fields fail strict parsing |
| R3-H02 | fixture-test | tests/test_handoff_manifest.py::test_expected_fixture_round_trips_to_deterministic_bytes | minimal artifact and progress cardinalities are fixed by the valid fixture |
| R3-H03 | production-test | tests/test_handoff_manifest.py::test_started_transition_rejects_kind_path_mismatched_existing_manifest | existing identity conflicts stop state transition |
| R3-H04 | fixture-test | tests/test_handoff_manifest.py::test_expected_fixture_round_trips_to_deterministic_bytes | serialization sorts canonical paths deterministically |
| R3-H05 | fixture-test | tests/test_handoff_manifest.py::test_parser_rejects_malformed_or_non_minimal_manifest | invalid JSON, SHA, schema, and state values are rejected |
| R3-H06 | production-test | tests/test_handoff_manifest.py::test_faults_never_advance_target_and_report_cleanup_evidence | failed staging or replace never advances the target |
| R3-H07 | fixture-test | tests/test_handoff_manifest.py::test_expected_fixture_round_trips_to_deterministic_bytes | identical inputs serialize to identical bytes without volatile fields |
| R3-H08 | canonical-non-applicable | canonical design R3 row 08 | timestamps do not define source or handoff state |
| R3-H09 | production-test | tests/test_handoff_manifest.py::test_parser_and_transition_reject_lexical_path_aliases | traversal, aliases, symlinks, and unsafe paths are rejected |
| R3-H10 | fixture-test | tests/test_handoff_manifest.py::test_parser_rejects_malformed_or_non_minimal_manifest | schema version and progress ranges are strict |
| R3-H11 | production-test | tests/test_handoff_manifest.py::test_manifest_parser_enforces_exact_derived_byte_boundary | derived manifest size is bounded without truncation |
| R3-H12 | production-test | tests/test_handoff_preflight.py::test_source_policy_and_host_fail_closed_without_write_authorization | ignored or untracked destinations never enter prepared state |
| R4-H01 | production-test | tests/test_handoff_preflight.py::test_source_policy_and_host_fail_closed_without_write_authorization | missing policy, signal, or source evidence blocks authorization |
| R4-H02 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_gsd_case_has_the_expected_entrypoint | a single missing required GSD signal fails the capability contract |
| R4-H03 | fixture-test | tests/test_execute_openspec_change_skill.py::test_acceptance_matrix_retains_prepared_for_checkpoint_and_ambiguous_rows | ambiguous or duplicate dispatch remains prepared |
| R4-H04 | fixture-test | tests/test_execute_openspec_change_skill.py::test_preview_contract_orders_complete_read_only_evidence | policy, probe, preview, fresh approval, write, and invoke order is fixed |
| R4-H05 | fixture-test | tests/test_execute_openspec_change_skill.py::test_generic_isolation_or_unknown_evidence_fails_closed | malformed signals or host schemas never become compatible by inference |
| R4-H06 | fixture-test | tests/test_execute_openspec_change_skill.py::test_non_accepted_report_preserves_manual_continuation_and_scope | partial bridge or GSD failure reports known state without recovery claims |
| R4-H07 | fixture-test | tests/test_execute_openspec_change_skill.py::test_acceptance_matrix_retains_prepared_for_checkpoint_and_ambiguous_rows | re-execution does not trigger automatic retry or route switch |
| R4-H08 | canonical-non-applicable | canonical design R4 row 08 | capability does not depend on timestamps or cache age |
| R4-H09 | fixture-test | tests/test_execute_openspec_change_skill.py::test_generic_route_resolves_exact_local_workflows_and_spawn_names | localized prose is not substituted for structured signals |
| R4-H10 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_gsd_case_has_the_expected_entrypoint | exact version and bounded probe constraints are fixture-pinned |
| R4-H11 | reasoned-unverified | manual host execution | no-safe-dry-run: context quota and live host limits cannot be exercised without entering mutable dispatch |
| R4-H12 | fixture-test | tests/test_execute_openspec_change_skill.py::test_started_transition_is_reachable_only_after_conservative_acceptance | mixed initialization or failed acceptance cannot transition to started |
| R5-H01 | real-smoke | task check:without-gsd; exit 0 with 248 tests | normal CI succeeds with optional tools absent |
| R5-H02 | production-test | tests/test_handoff_core.py::test_reader_enforces_exact_file_and_aggregate_boundaries | zero, singleton, and maximum path or task boundaries are exercised |
| R5-H03 | fixture-test | tests/test_handoff_manifest.py::test_parser_rejects_malformed_or_non_minimal_manifest | duplicate paths and manifest fields fail closed |
| R5-H04 | property-test | tests/test_handoff_core.py::test_progress_parse_is_deterministic_and_idempotent | valid progress is deterministic across generated source order cases |
| R5-H05 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_openspec_case_has_the_expected_classified_route | malformed JSON, Markdown, and manifest classes have stable failures |
| R5-H06 | production-test | tests/test_handoff_manifest.py::test_faults_never_advance_target_and_report_cleanup_evidence | fault injection retains the prior target |
| R5-H07 | property-test | tests/test_handoff_core.py::test_progress_parse_is_deterministic_and_idempotent | pure parsing is repeatable without hidden state |
| R5-H08 | canonical-non-applicable | canonical design R5 row 08 | MVP output and fixture assertions intentionally exclude time |
| R5-H09 | fixture-test | tests/test_handoff_smoke.py::test_cli_rejects_non_lower_kebab_change_id | Unicode, whitespace, and traversal identifiers are rejected |
| R5-H10 | fixture-test | tests/test_handoff_preflight.py::test_every_pinned_gsd_case_has_the_expected_entrypoint | progress and exact version numeric boundaries are fixed |
| R5-H11 | production-test | tests/test_handoff_smoke.py::test_snapshot_resource_bounds_have_stable_codes | large repository inventory and timeout conditions have bounded failures |
| R5-H12 | fixture-test | tests/test_taskfile.py::test_handoff_smoke_is_explicit_and_isolated_from_normal_check | real tools are unreachable from normal check and require explicit opt-in |

## Host unverified

| Coordinate | Kind | Locator | Reason |
| --- | --- | --- | --- |
| HOST-UNVERIFIED-1 | reasoned-unverified | actual host prompt | no-safe-dry-run: prompting would enter the mutable approval workflow |
| HOST-UNVERIFIED-2 | reasoned-unverified | generic-agent spawn | no-safe-dry-run: spawning is a host side effect without an inspection seam |
| HOST-UNVERIFIED-3 | reasoned-unverified | real GSD mutation | no-safe-dry-run: both supported GSD entrypoints mutate planning state |
| HOST-UNVERIFIED-4 | reasoned-unverified | route-specific postconditions | no-safe-dry-run: json and markdown-fallback postconditions follow dispatch |

## Real read-only observations

- Normal-gate isolation: `task check:without-gsd` exited 0; the nested normal check passed formatting, lint, type checking, and 248 tests with Node, OpenSpec, npm, npx, and GSD launchers absent from the curated PATH.
- Opt-in invocation template: `task openspec:gsd-handoff:smoke CHANGE_ID=automate-openspec-gsd-handoff GSD_HOME=<active-config-root>`; exit 0.
- Tool evidence: OpenSpec `1.3.1`; GSD `1.5.0`; OpenSpec input route `json`; GSD project initialized; selected entrypoint signal `gsd-phase`; entrypoint dry-run unavailable.
- Progress observed: total 12, complete 7, remaining 5.
- Artifact identities: proposal `d2537af91aac860ecfb7ee6246c2e45eb87c3525dca6e1f2eb82257c377c907f`; design `b03e6032515d4b6881847ebb631451170ad06f64eeb3897a26d695c7401b1d4a`; spec `4a10a1e9dd39134840ae90b546f4c48d66bf4aafb6a2eef5d46cb6a261f6d4d4`; tasks `c43b918db029327ec6023b8d1fd47504853d4f141a411dbdaf9e761a9ff7b07e`.
- Repository snapshot: 13964 entries, 1457213 metadata bytes, digest `0600e9ee60d9c3869685f782a67651f61236a643a3f3138a6b8014741f3ab36d`, write detected false.
- Output boundary observed: one machine-readable JSON object on stdout and one human summary line on stderr. Raw probe output and canonical Markdown bodies are intentionally omitted.

## Authority boundary

This evidence enables review of OpenSpec tasks 5.1 and 5.2 but does not perform or mark them. GSD Phase 3 completion is not OpenSpec final completion; the main/orchestrator retains final acceptance authority. Lifecycle hardening, retry, resume, rollback, finalize, cleanup, push, PR, and merge remain outside this evidence.
