"""Pinned OpenSpec 1.3.1 discovery-route contract tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import ai_coding_template_ja.openspec_gsd_handoff.discovery as discovery_module
from ai_coding_template_ja.openspec_gsd_handoff.discovery import (
    OpenSpecProbe,
    discover_openspec_artifacts,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import (
    Failure,
    InputRoute,
    Success,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "openspec_gsd_handoff" / "openspec"
CONTRACT = json.loads((FIXTURES / "contract.json").read_text(encoding="utf-8"))


def _load_apply(name: str, repository: Path) -> str:
    return (
        (FIXTURES / name)
        .read_text(encoding="utf-8")
        .replace("${FIXTURE_REPO}", str(repository.resolve()))
    )


def _tasks_from_apply(apply_output: str) -> list[dict[str, Any]]:
    try:
        parsed = json.loads(apply_output)
    except json.JSONDecodeError:
        parsed = json.loads(_load_apply("apply-positive.json", Path("/tmp/unused")))
    tasks = parsed.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        positive = json.loads(_load_apply("apply-positive.json", Path("/tmp/unused")))
        return positive["tasks"]
    return tasks


def _make_change(repository: Path, apply_output: str) -> None:
    change = repository / "openspec" / "changes" / "fixture-change"
    spec = change / "specs" / "fixture-capability" / "spec.md"
    spec.parent.mkdir(parents=True)
    (change / "proposal.md").write_text("# proposal\n", encoding="utf-8")
    (change / "design.md").write_text("# design\n", encoding="utf-8")
    spec.write_text("# spec\n", encoding="utf-8")
    tasks = _tasks_from_apply(apply_output)
    (change / "tasks.md").write_text(
        "".join(
            f"- [{'x' if task['done'] else ' '}] {task['description']}\n"
            for task in tasks
        ),
        encoding="utf-8",
    )


def _probe_for_case(case: dict[str, Any], repository: Path) -> OpenSpecProbe:
    apply_output = _load_apply(case["apply_stdout_fixture"], repository)
    _make_change(repository, apply_output)
    return OpenSpecProbe(
        version_exit_code=case["version_exit_code"],
        version_stdout=case["version_stdout"],
        apply_exit_code=case["apply_exit_code"],
        apply_stdout=apply_output,
    )


@pytest.mark.parametrize(
    "case",
    CONTRACT["negative"],
    ids=[case["name"] for case in CONTRACT["negative"]],
)
def test_pinned_openspec_contract_routes_each_named_case(
    tmp_path: Path, case: dict[str, Any]
) -> None:
    repository = tmp_path / "repository"
    probe = _probe_for_case(case, repository)

    result = discover_openspec_artifacts(repository, "fixture-change", probe)

    expected = case["expected_route"]
    if expected == "markdown-fallback":
        assert isinstance(result, Success)
        assert result.route is InputRoute.MARKDOWN_FALLBACK
    elif expected == "stop-unprepared":
        assert isinstance(result, Failure)
        assert result.issue.code == "openspec-unprepared"
        assert result.route is InputRoute.JSON
    else:
        assert expected == "final-boundary"
        assert isinstance(result, Failure)
        assert result.issue.code == "openspec-all-done"
        assert result.route is InputRoute.JSON


def test_positive_json_and_fallback_share_values_but_keep_distinct_routes(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    positive_case = CONTRACT["positive"]
    json_probe = _probe_for_case(positive_case, repository)
    fallback_probe = OpenSpecProbe(
        version_exit_code=0,
        version_stdout="unsupported\n",
        apply_exit_code=json_probe.apply_exit_code,
        apply_stdout=json_probe.apply_stdout,
    )

    json_result = discover_openspec_artifacts(repository, "fixture-change", json_probe)
    fallback_result = discover_openspec_artifacts(
        repository, "fixture-change", fallback_probe
    )

    assert isinstance(json_result, Success)
    assert isinstance(fallback_result, Success)
    assert json_result.value == fallback_result.value
    assert json_result.route is InputRoute.JSON
    assert fallback_result.route is InputRoute.MARKDOWN_FALLBACK


def test_multi_spec_json_order_has_exact_fallback_parity(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    positive_case = CONTRACT["positive"]
    apply_output = _load_apply(positive_case["apply_stdout_fixture"], repository)
    _make_change(repository, apply_output)
    change = repository / "openspec" / "changes" / "fixture-change"
    first_spec = change / "specs" / "another-capability" / "spec.md"
    first_spec.parent.mkdir(parents=True)
    first_spec.write_text("# another spec\n", encoding="utf-8")
    raw = json.loads(apply_output)
    existing_spec = Path(raw["contextFiles"]["specs"][0])
    raw["contextFiles"]["specs"] = [str(existing_spec), str(first_spec.resolve())]
    json_probe = OpenSpecProbe(0, "1.3.1\n", 0, json.dumps(raw))
    fallback_probe = OpenSpecProbe(0, "unsupported\n", 0, json.dumps(raw))

    json_result = discover_openspec_artifacts(repository, "fixture-change", json_probe)
    fallback_result = discover_openspec_artifacts(
        repository, "fixture-change", fallback_probe
    )

    assert isinstance(json_result, Success)
    assert isinstance(fallback_result, Success)
    assert json_result.value == fallback_result.value


def test_invalid_candidate_values_do_not_poison_fresh_fallback(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    unsafe = next(
        case for case in CONTRACT["negative"] if case["name"] == "unsafe-path"
    )
    probe = _probe_for_case(unsafe, repository)

    result = discover_openspec_artifacts(repository, "fixture-change", probe)

    assert isinstance(result, Success)
    assert result.route is InputRoute.MARKDOWN_FALLBACK
    assert all("outside" not in artifact.path for artifact in result.value.artifacts)
    assert all(
        artifact.path.startswith("openspec/changes/fixture-change/")
        for artifact in result.value.artifacts
    )


@pytest.mark.parametrize("state", ["ready", "blocked"])
def test_missing_artifacts_field_is_terminal_even_when_empty(
    tmp_path: Path, state: str
) -> None:
    repository = tmp_path / "repository"
    apply_output = _load_apply("apply-positive.json", repository)
    _make_change(repository, apply_output)
    raw = json.loads(apply_output)
    raw["state"] = state
    raw["missingArtifacts"] = []
    probe = OpenSpecProbe(0, "1.3.1\n", 0, json.dumps(raw))

    result = discover_openspec_artifacts(repository, "fixture-change", probe)

    assert isinstance(result, Failure)
    assert result.issue.code == "openspec-unprepared"
    assert result.route is InputRoute.JSON


@pytest.mark.parametrize("state", ["ready", "blocked"])
def test_missing_artifacts_field_never_starts_markdown_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    state: str,
) -> None:
    repository = tmp_path / "repository"
    apply_output = _load_apply("apply-positive.json", repository)
    _make_change(repository, apply_output)
    raw = json.loads(apply_output)
    raw["state"] = state
    raw["missingArtifacts"] = []
    probe = OpenSpecProbe(0, "1.3.1\n", 0, json.dumps(raw))
    fallback_calls = 0

    def fallback_spy(_repository: Path, _change_id: str) -> Success:
        nonlocal fallback_calls
        fallback_calls += 1
        raise AssertionError("field-present candidate must not start fallback")

    monkeypatch.setattr(discovery_module, "_fallback", fallback_spy)

    result = discover_openspec_artifacts(repository, "fixture-change", probe)

    assert isinstance(result, Failure)
    assert result.issue.code == "openspec-unprepared"
    assert result.route is InputRoute.JSON
    assert fallback_calls == 0


def test_fallback_path_failure_returns_no_partial_discovery(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    apply_output = _load_apply("apply-positive.json", repository)
    _make_change(repository, apply_output)
    (repository / "openspec" / "changes" / "fixture-change" / "design.md").unlink()
    probe = OpenSpecProbe(1, "", 1, "")

    result = discover_openspec_artifacts(repository, "fixture-change", probe)

    assert isinstance(result, Failure)
    assert result.route is InputRoute.MARKDOWN_FALLBACK


@pytest.mark.parametrize("symlink_case", ["singleton-file", "spec-parent"])
def test_inspection_rejects_symlink_inside_canonical_artifact_path(
    tmp_path: Path, symlink_case: str
) -> None:
    repository = tmp_path / "repository"
    positive_case = CONTRACT["positive"]
    probe = _probe_for_case(positive_case, repository)
    change = repository / "openspec" / "changes" / "fixture-change"
    if symlink_case == "singleton-file":
        proposal = change / "proposal.md"
        other = change / "other.md"
        other.write_text("# noncanonical proposal\n", encoding="utf-8")
        proposal.unlink()
        proposal.symlink_to(other)
    else:
        capability = change / "specs" / "fixture-capability"
        other = change / "specs" / "other-capability"
        other.mkdir()
        (other / "spec.md").write_text("# noncanonical spec\n", encoding="utf-8")
        (capability / "spec.md").unlink()
        capability.rmdir()
        capability.symlink_to(other, target_is_directory=True)

    result = discover_openspec_artifacts(repository, "fixture-change", probe)

    assert isinstance(result, Failure)
    assert result.issue.code == "artifact-path-symlink"
    assert result.route is InputRoute.MARKDOWN_FALLBACK
