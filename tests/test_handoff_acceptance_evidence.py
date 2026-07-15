"""Source-pinned acceptance-evidence validator contract tests."""

from __future__ import annotations

import importlib.util
import subprocess
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "validate-handoff-acceptance-evidence.py"
SOURCE_COMMIT = "5a1f78b81f546c900745328fad24f9adb073e768"
PROPOSAL_PATH = "openspec/changes/automate-openspec-gsd-handoff/proposal.md"
DESIGN_PATH = "openspec/changes/automate-openspec-gsd-handoff/design.md"
SPEC_PATH = (
    "openspec/changes/automate-openspec-gsd-handoff/specs/"
    "openspec-gsd-handoff-automation/spec.md"
)
TASKS_PATH = "openspec/changes/automate-openspec-gsd-handoff/tasks.md"


def _load_validator() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "handoff_acceptance_validator", SCRIPT
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _git_blob(path: str) -> bytes:
    result = subprocess.run(
        ["git", "show", f"{SOURCE_COMMIT}:{path}"],
        cwd=REPO_ROOT,
        capture_output=True,
        check=True,
    )
    return result.stdout


PINNED_BLOBS = {
    PROPOSAL_PATH: _git_blob(PROPOSAL_PATH),
    DESIGN_PATH: _git_blob(DESIGN_PATH),
    SPEC_PATH: _git_blob(SPEC_PATH),
}


@dataclass
class FakeRunner:
    blobs: dict[str, bytes]
    returncode: int = 0
    stderr: bytes = b""

    def __post_init__(self) -> None:
        self.calls: list[tuple[list[str], dict[str, Any]]] = []

    def __call__(
        self, argv: list[str], **kwargs: Any
    ) -> subprocess.CompletedProcess[bytes]:
        self.calls.append((argv, kwargs))
        path = argv[-1].split(":", 1)[1]
        stdout = self.blobs.get(path, b"")
        return subprocess.CompletedProcess(argv, self.returncode, stdout, self.stderr)


def _coordinates() -> tuple[list[str], list[str], list[str]]:
    requirements = [f"R{number}" for number in range(1, 6)]
    scenario_counts = [6, 4, 6, 6, 4]
    scenarios = [
        f"R{requirement}-S{scenario:02d}"
        for requirement, count in enumerate(scenario_counts, start=1)
        for scenario in range(1, count + 1)
    ]
    holes = [
        f"R{requirement}-H{hole:02d}"
        for requirement in range(1, 6)
        for hole in range(1, 13)
    ]
    return requirements, scenarios, holes


def _table(title: str, coordinates: list[str], kind: str) -> str:
    lines = [
        f"## {title}",
        "| Coordinate | Kind | Locator | Reason |",
        "| --- | --- | --- | --- |",
    ]
    lines.extend(
        "| "
        f"{coordinate} | {kind} | tests/test_named.py::test_"
        f"{coordinate.lower().replace('-', '_')} | verified by named test |"
        for coordinate in coordinates
    )
    return "\n".join(lines)


def valid_evidence() -> bytes:
    requirements, scenarios, holes = _coordinates()
    hosts = [
        (
            "HOST-UNVERIFIED-1",
            "actual host prompt",
            "no-safe-dry-run: prompting would enter the mutable approval workflow",
        ),
        (
            "HOST-UNVERIFIED-2",
            "generic-agent spawn",
            "no-safe-dry-run: spawning is a host side effect "
            "without an inspection seam",
        ),
        (
            "HOST-UNVERIFIED-3",
            "real GSD mutation",
            "no-safe-dry-run: both supported GSD entrypoints mutate planning state",
        ),
        (
            "HOST-UNVERIFIED-4",
            "route-specific postconditions",
            "no-safe-dry-run: json and markdown-fallback postconditions "
            "follow dispatch",
        ),
    ]
    host_lines = [
        "## Host unverified",
        "| Coordinate | Kind | Locator | Reason |",
        "| --- | --- | --- | --- |",
        *[
            f"| {coordinate} | reasoned-unverified | {locator} | {reason} |"
            for coordinate, locator, reason in hosts
        ],
    ]
    text = "\n\n".join(
        [
            "# Phase 3 Acceptance Evidence",
            "\n".join(
                [
                    f"- Source commit: `{SOURCE_COMMIT}`",
                    f"- Proposal path: `{PROPOSAL_PATH}`",
                    f"- Design path: `{DESIGN_PATH}`",
                    f"- Spec path: `{SPEC_PATH}`",
                    f"- Tasks path: `{TASKS_PATH}`",
                ]
            ),
            _table("Requirements", requirements, "production-test"),
            _table("Scenarios", scenarios, "fixture-test"),
            _table("Spec holes", holes, "property-test"),
            "\n".join(host_lines),
            "GSD Phase 3 completion is not OpenSpec final completion; "
            "tasks 5.1 and 5.2 remain at the main boundary.",
        ]
    )
    return (text + "\n").encode()


def _validate(
    evidence: bytes, runner: FakeRunner | None = None
) -> tuple[Any, FakeRunner]:
    validator = _load_validator()
    selected = runner or FakeRunner(dict(PINNED_BLOBS))
    verdict = validator.validate_evidence(evidence, REPO_ROOT, runner=selected)
    return verdict, selected


def _replace(evidence: bytes, old: str, new: str, count: int = 1) -> bytes:
    return evidence.decode().replace(old, new, count).encode()


def test_valid_matrix_derives_exact_pinned_coordinates_and_fixed_git_calls() -> None:
    verdict, runner = _validate(valid_evidence())

    assert verdict.ok is True
    assert verdict.code == "ok"
    assert verdict.requirements == 5
    assert verdict.scenarios == 26
    assert verdict.spec_holes == 60
    assert verdict.host_unverified == 4
    assert [call[0] for call in runner.calls] == [
        ["git", "show", f"{SOURCE_COMMIT}:{path}"]
        for path in (PROPOSAL_PATH, DESIGN_PATH, SPEC_PATH)
    ]
    for _, kwargs in runner.calls:
        assert kwargs["cwd"] == REPO_ROOT
        assert kwargs["shell"] is False
        assert kwargs["capture_output"] is True
        assert kwargs["timeout"] > 0


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("A" * 40, "source-commit-invalid"),
        ("-" + "a" * 39, "source-commit-invalid"),
        ("a" * 40 + " extra", "source-commit-invalid"),
        ("a" * 39, "source-commit-invalid"),
        ("0" * 40, "source-pin-mismatch"),
    ],
)
def test_invalid_or_unpinned_source_never_reaches_git(
    source: str, expected: str
) -> None:
    evidence = _replace(valid_evidence(), SOURCE_COMMIT, source)
    verdict, runner = _validate(evidence)

    assert verdict.code == expected
    assert runner.calls == []


def test_noncanonical_evidence_path_never_reaches_git() -> None:
    evidence = _replace(valid_evidence(), SPEC_PATH, "openspec/changes/other/spec.md")
    verdict, runner = _validate(evidence)

    assert verdict.code == "canonical-paths-mismatch"
    assert runner.calls == []


@pytest.mark.parametrize(
    ("runner", "expected"),
    [
        (
            FakeRunner({}, returncode=128, stderr=b"unknown"),
            "pinned-blob-command-failed",
        ),
        (
            FakeRunner({**PINNED_BLOBS, DESIGN_PATH: b"x" * (1024 * 1024 + 1)}),
            "pinned-blob-output-limit",
        ),
        (
            FakeRunner({**PINNED_BLOBS, SPEC_PATH: b"\xffinvalid"}),
            "pinned-blob-utf8-invalid",
        ),
        (
            FakeRunner({**PINNED_BLOBS, SPEC_PATH: b"# malformed\n"}),
            "canonical-source-invalid",
        ),
        (
            FakeRunner({**PINNED_BLOBS, DESIGN_PATH: b"# malformed\n"}),
            "canonical-source-invalid",
        ),
    ],
)
def test_pinned_blob_failures_are_closed(runner: FakeRunner, expected: str) -> None:
    verdict, _ = _validate(valid_evidence(), runner)
    assert verdict.code == expected


@pytest.mark.parametrize(
    ("mutation", "expected"),
    [
        (("| R1 |", "| R9 |"), "coordinate-unknown"),
        (("| R1-S01 |", "| R1-S02 |"), "coordinate-duplicate"),
        (("| R1-S01 |", "| REMOVED |"), "coordinate-unknown"),
        (("| R1-S01 |", "| R1-S99 |"), "coordinate-unknown"),
        (("| production-test |", "| magic-proof |"), "evidence-kind-invalid"),
        (
            (
                "| R1 | production-test | tests/test_named.py::test_r1 | "
                "verified by named test |",
                "| R1 | production-test | | verified by named test |",
            ),
            "evidence-empty",
        ),
        (("verified by named test", "covered"), "bare-covered"),
        (("tests/test_named.py", "/home/alice/project"), "absolute-path-leak"),
        (("verified by named test", "```json"), "raw-output-forbidden"),
    ],
)
def test_row_and_evidence_failures_are_closed(
    mutation: tuple[str, str], expected: str
) -> None:
    verdict, _ = _validate(_replace(valid_evidence(), *mutation))
    assert verdict.code == expected


def test_coordinate_order_and_missing_are_distinguished() -> None:
    evidence = valid_evidence().decode()
    first = next(
        line for line in evidence.splitlines() if line.startswith("| R1-S01 |")
    )
    second = next(
        line for line in evidence.splitlines() if line.startswith("| R1-S02 |")
    )
    reordered = (
        evidence.replace(first, "__FIRST__")
        .replace(second, first)
        .replace("__FIRST__", second)
    )
    verdict, _ = _validate(reordered.encode())
    assert verdict.code == "coordinate-order"

    missing = evidence.replace(first + "\n", "", 1)
    verdict, _ = _validate(missing.encode())
    assert verdict.code == "coordinate-missing"


def test_host_rows_require_exact_order_kind_and_no_safe_dry_run_reason() -> None:
    evidence = valid_evidence()
    verdict, _ = _validate(_replace(evidence, "HOST-UNVERIFIED-1", "HOST-UNVERIFIED-2"))
    assert verdict.code == "host-unverified-invalid"

    verdict, _ = _validate(_replace(evidence, "no-safe-dry-run:", "not run:"))
    assert verdict.code == "host-unverified-invalid"


@pytest.mark.parametrize("path", ["/Users/alice/project", r"C:\Users\alice\project"])
def test_cross_platform_user_profile_paths_are_rejected(path: str) -> None:
    verdict, _ = _validate(_replace(valid_evidence(), "tests/test_named.py", path))
    assert verdict.code == "absolute-path-leak"


def test_pinned_canonical_body_line_is_rejected_but_worktree_drift_is_not_authority(
    tmp_path: Path,
) -> None:
    canonical_line = next(
        line.decode().strip()
        for line in PINNED_BLOBS[SPEC_PATH].splitlines()
        if len(line.decode().strip()) >= 32 and not line.startswith(b"#")
    )
    leaked = _replace(valid_evidence(), "verified by named test", canonical_line)
    verdict, _ = _validate(leaked)
    assert verdict.code == "canonical-body-leak"

    drift_repo = tmp_path / "repo"
    drift_spec = drift_repo / SPEC_PATH
    drift_design = drift_repo / DESIGN_PATH
    drift_spec.parent.mkdir(parents=True)
    drift_design.parent.mkdir(parents=True, exist_ok=True)
    drift_spec.write_text(
        "### Requirement: drift\n#### Scenario: drift\n", encoding="utf-8"
    )
    drift_design.write_text("### R9: drift\n| 99 | drift |\n", encoding="utf-8")
    validator = _load_validator()
    runner = FakeRunner(dict(PINNED_BLOBS))
    verdict = validator.validate_evidence(valid_evidence(), drift_repo, runner=runner)
    assert verdict.ok is True


def test_cli_prints_one_sorted_bounded_json_verdict(tmp_path: Path) -> None:
    evidence = tmp_path / "evidence.md"
    evidence.write_bytes(_replace(valid_evidence(), "| R1 |", "| R9 |"))
    result = subprocess.run(
        [
            "uv",
            "run",
            "--no-sync",
            "python",
            str(SCRIPT),
            "--repository",
            str(REPO_ROOT),
            "--evidence",
            str(evidence),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode != 0
    assert len(result.stdout.splitlines()) == 1
    assert result.stdout.startswith('{"code":')
    assert len(result.stdout) < 1024
    assert result.stderr == ""
