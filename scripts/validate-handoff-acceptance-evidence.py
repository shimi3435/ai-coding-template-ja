#!/usr/bin/env python3
"""Validate source-pinned OpenSpec handoff acceptance evidence."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import threading
from collections.abc import Sequence
from pathlib import Path
from typing import NamedTuple, Protocol

SOURCE_COMMIT = "5a1f78b81f546c900745328fad24f9adb073e768"
PROPOSAL_PATH = "openspec/changes/automate-openspec-gsd-handoff/proposal.md"
DESIGN_PATH = "openspec/changes/automate-openspec-gsd-handoff/design.md"
SPEC_PATH = (
    "openspec/changes/automate-openspec-gsd-handoff/specs/"
    "openspec-gsd-handoff-automation/spec.md"
)
TASKS_PATH = "openspec/changes/automate-openspec-gsd-handoff/tasks.md"
CANONICAL_PATHS = (PROPOSAL_PATH, DESIGN_PATH, SPEC_PATH, TASKS_PATH)
GIT_BLOB_PATHS = (PROPOSAL_PATH, DESIGN_PATH, SPEC_PATH)
MAX_BLOB_BYTES = 1024 * 1024
MAX_AGGREGATE_BYTES = 4 * 1024 * 1024
MAX_EVIDENCE_BYTES = 1024 * 1024
GIT_TIMEOUT_SECONDS = 10.0
MAX_STDERR_BYTES = 16 * 1024

ALLOWED_KINDS = frozenset(
    {
        "production-test",
        "fixture-test",
        "property-test",
        "real-smoke",
        "reasoned-unverified",
        "canonical-non-applicable",
    }
)
HOST_COORDINATES = tuple(f"HOST-UNVERIFIED-{number}" for number in range(1, 5))
HOST_LOCATORS = (
    "actual host prompt",
    "generic-agent spawn",
    "real GSD mutation",
    "route-specific postconditions",
)
REQUIRED_SECTIONS = ("Requirements", "Scenarios", "Spec holes", "Host unverified")


class Verdict(NamedTuple):
    ok: bool
    code: str
    requirements: int = 0
    scenarios: int = 0
    spec_holes: int = 0
    host_unverified: int = 0


class Runner(Protocol):
    def __call__(
        self,
        argv: list[str],
        *,
        cwd: Path,
        shell: bool,
        capture_output: bool,
        timeout: float,
        check: bool,
    ) -> subprocess.CompletedProcess[bytes]: ...


class EvidenceRow(NamedTuple):
    coordinate: str
    kind: str
    locator: str
    reason: str


def _bounded_subprocess_run(
    argv: list[str],
    *,
    cwd: Path,
    shell: bool,
    capture_output: bool,
    timeout: float,
    check: bool,
) -> subprocess.CompletedProcess[bytes]:
    """Run fixed argv while retaining at most one limit-detection byte."""
    if shell or not capture_output or check:
        raise ValueError("bounded runner requires safe fixed settings")
    process = subprocess.Popen(
        argv,
        cwd=cwd,
        shell=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stdout_pipe = process.stdout
    stderr_pipe = process.stderr
    assert stdout_pipe is not None
    assert stderr_pipe is not None
    stdout = bytearray()
    stderr = bytearray()
    output_limit_hit = threading.Event()

    def drain_stdout() -> None:
        while chunk := stdout_pipe.read(64 * 1024):
            remaining = MAX_BLOB_BYTES + 1 - len(stdout)
            if remaining > 0:
                stdout.extend(chunk[:remaining])
            if len(stdout) > MAX_BLOB_BYTES:
                output_limit_hit.set()
                process.kill()
                return

    def drain_stderr() -> None:
        while chunk := stderr_pipe.read(4096):
            remaining = MAX_STDERR_BYTES - len(stderr)
            if remaining > 0:
                stderr.extend(chunk[:remaining])

    threads = [
        threading.Thread(target=drain_stdout, daemon=True),
        threading.Thread(target=drain_stderr, daemon=True),
    ]
    for thread in threads:
        thread.start()
    try:
        returncode = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        for thread in threads:
            thread.join(timeout=1)
        raise
    for thread in threads:
        thread.join(timeout=1)
    if output_limit_hit.is_set():
        returncode = returncode or -9
    return subprocess.CompletedProcess(argv, returncode, bytes(stdout), bytes(stderr))


def _failure(code: str) -> Verdict:
    return Verdict(False, code)


def _metadata(text: str) -> tuple[dict[str, str], str | None]:
    labels = {
        "Source commit": "source",
        "Proposal path": "proposal",
        "Design path": "design",
        "Spec path": "spec",
        "Tasks path": "tasks",
    }
    found: dict[str, str] = {}
    for line in text.splitlines():
        match = re.fullmatch(r"- ([A-Za-z ]+): `([^`]+)`", line)
        if match and match.group(1) in labels:
            key = labels[match.group(1)]
            if key in found:
                duplicate_code = (
                    "source-commit-invalid"
                    if key == "source"
                    else "canonical-paths-mismatch"
                )
                return found, duplicate_code
            found[key] = match.group(2)
    return found, None


def _validate_section_structure(text: str) -> str | None:
    headings = [
        line.removeprefix("## ")
        for line in text.splitlines()
        if line.startswith("## ") and not line.startswith("### ")
    ]
    if any(headings.count(required) != 1 for required in REQUIRED_SECTIONS):
        return "evidence-section-invalid"
    if any(
        re.match(r"host(?:\s|$)", heading, re.IGNORECASE)
        and heading != "Host unverified"
        for heading in headings
    ):
        return "evidence-section-invalid"
    return None


def _read_pinned_blobs(
    repository: Path, runner: Runner
) -> tuple[dict[str, str] | None, str | None]:
    blobs: dict[str, str] = {}
    aggregate = 0
    for path in GIT_BLOB_PATHS:
        argv = ["git", "show", f"{SOURCE_COMMIT}:{path}"]
        try:
            result = runner(
                argv,
                cwd=repository,
                shell=False,
                capture_output=True,
                timeout=GIT_TIMEOUT_SECONDS,
                check=False,
            )
        except (OSError, subprocess.SubprocessError, ValueError):
            return None, "pinned-blob-command-failed"
        if result.returncode != 0:
            if len(result.stdout) > MAX_BLOB_BYTES:
                return None, "pinned-blob-output-limit"
            return None, "pinned-blob-command-failed"
        if len(result.stdout) > MAX_BLOB_BYTES:
            return None, "pinned-blob-output-limit"
        aggregate += len(result.stdout)
        if aggregate > MAX_AGGREGATE_BYTES:
            return None, "pinned-blob-output-limit"
        try:
            blobs[path] = result.stdout.decode("utf-8")
        except UnicodeDecodeError:
            return None, "pinned-blob-utf8-invalid"
    return blobs, None


def _derive_spec_coordinates(spec_text: str) -> tuple[list[str], list[str]] | None:
    requirements: list[str] = []
    scenarios: list[str] = []
    current_requirement = 0
    per_requirement: dict[int, int] = {}
    for line in spec_text.splitlines():
        if line.startswith("### Requirement:"):
            current_requirement += 1
            coordinate = f"R{current_requirement}"
            requirements.append(coordinate)
            per_requirement[current_requirement] = 0
        elif line.startswith("#### Scenario:"):
            if current_requirement == 0:
                return None
            per_requirement[current_requirement] += 1
            scenarios.append(
                f"R{current_requirement}-S{per_requirement[current_requirement]:02d}"
            )
    if len(requirements) != 5 or len(scenarios) != 26:
        return None
    if [per_requirement[number] for number in range(1, 6)] != [6, 4, 6, 6, 4]:
        return None
    return requirements, scenarios


def _derive_hole_coordinates(design_text: str) -> list[str] | None:
    holes: list[str] = []
    current_requirement: int | None = None
    seen_requirements: list[int] = []
    rows_by_requirement: dict[int, list[int]] = {}
    for line in design_text.splitlines():
        heading = re.fullmatch(r"### R([1-5]): .+", line)
        if heading:
            current_requirement = int(heading.group(1))
            seen_requirements.append(current_requirement)
            rows_by_requirement[current_requirement] = []
            continue
        if line.startswith("### "):
            current_requirement = None
            continue
        row = re.match(r"^\| (\d+) \|", line)
        if row and current_requirement is not None:
            number = int(row.group(1))
            rows_by_requirement[current_requirement].append(number)
            holes.append(f"R{current_requirement}-H{number:02d}")
    if seen_requirements != [1, 2, 3, 4, 5]:
        return None
    if any(rows_by_requirement[number] != list(range(1, 13)) for number in range(1, 6)):
        return None
    return holes


def _canonical_body_lines(blobs: dict[str, str]) -> frozenset[str]:
    body: set[str] = set()
    for text in blobs.values():
        for raw_line in text.splitlines():
            line = " ".join(raw_line.strip().replace("`", "").split())
            if line and not line.startswith("#") and len(line) >= 32:
                body.add(line.casefold())
    return frozenset(body)


def _section_rows(text: str, heading: str) -> list[EvidenceRow] | None:
    lines = text.splitlines()
    try:
        start = lines.index(f"## {heading}") + 1
    except ValueError:
        return None
    rows: list[EvidenceRow] = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells == ["Coordinate", "Kind", "Locator", "Reason"]:
            continue
        if cells == ["---", "---", "---", "---"]:
            continue
        if len(cells) != 4:
            return None
        rows.append(EvidenceRow(*cells))
    return rows


def _coordinate_code(actual: Sequence[str], expected: Sequence[str]) -> str | None:
    if len(actual) != len(set(actual)):
        return "coordinate-duplicate"
    expected_set = set(expected)
    if any(coordinate not in expected_set for coordinate in actual):
        return "coordinate-unknown"
    if set(actual) != expected_set:
        return "coordinate-missing"
    if list(actual) != list(expected):
        return "coordinate-order"
    return None


def _validate_rows(
    rows: Sequence[EvidenceRow],
    expected: Sequence[str],
) -> str | None:
    coordinate_error = _coordinate_code(
        [row.coordinate for row in rows],
        expected,
    )
    if coordinate_error:
        return coordinate_error
    for row in rows:
        if row.kind not in ALLOWED_KINDS:
            return "evidence-kind-invalid"
        if not row.locator or not row.reason:
            return "evidence-empty"
    return None


def _validate_host_rows(rows: Sequence[EvidenceRow]) -> str | None:
    if [row.coordinate for row in rows] != list(HOST_COORDINATES):
        return "host-unverified-invalid"
    for row, locator in zip(rows, HOST_LOCATORS, strict=True):
        if row.kind != "reasoned-unverified":
            return "host-unverified-invalid"
        if row.locator != locator or not row.reason.startswith("no-safe-dry-run:"):
            return "host-unverified-invalid"
        if not row.reason.removeprefix("no-safe-dry-run:").strip():
            return "host-unverified-invalid"
    return None


def _validate_evidence_content(
    text: str,
    rows: Sequence[EvidenceRow],
    canonical_body: frozenset[str],
) -> str | None:
    if re.search(r"(?:^|/)home/|(?:^|/)Users/|[A-Za-z]:\\Users\\", text):
        return "absolute-path-leak"
    if "```" in text:
        return "raw-output-forbidden"
    if re.search(r"\bcovered\b", text, re.IGNORECASE):
        return "bare-covered"
    metadata_prefixes = (
        "- Source commit:",
        "- Proposal path:",
        "- Design path:",
        "- Spec path:",
        "- Tasks path:",
    )
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if (
            not stripped
            or stripped.startswith("#")
            or stripped.startswith(metadata_prefixes)
        ):
            continue
        normalized_line = " ".join(stripped.replace("`", "").split()).casefold()
        if normalized_line in canonical_body:
            return "canonical-body-leak"
    for row in rows:
        for cell in (row.locator, row.reason):
            normalized = " ".join(cell.replace("`", "").split()).casefold()
            if normalized in canonical_body:
                return "canonical-body-leak"
    return None


def validate_evidence(
    evidence: bytes,
    repository: Path,
    *,
    runner: Runner = _bounded_subprocess_run,
) -> Verdict:
    """Validate evidence bytes against canonical blobs at the fixed source pin."""
    if len(evidence) > MAX_EVIDENCE_BYTES:
        return _failure("evidence-empty")
    try:
        text = evidence.decode("utf-8")
    except UnicodeDecodeError:
        return _failure("evidence-empty")
    section_error = _validate_section_structure(text)
    if section_error:
        return _failure(section_error)
    metadata, metadata_error = _metadata(text)
    if metadata_error:
        return _failure(metadata_error)
    source = metadata.get("source", "")
    if re.fullmatch(r"[0-9a-f]{40}", source) is None:
        return _failure("source-commit-invalid")
    if source != SOURCE_COMMIT:
        return _failure("source-pin-mismatch")
    paths = tuple(
        metadata.get(name, "") for name in ("proposal", "design", "spec", "tasks")
    )
    if paths != CANONICAL_PATHS:
        return _failure("canonical-paths-mismatch")

    blobs, blob_error = _read_pinned_blobs(repository, runner)
    if blob_error:
        return _failure(blob_error)
    assert blobs is not None
    if not blobs[PROPOSAL_PATH].startswith("# Change:"):
        return _failure("canonical-source-invalid")
    spec_coordinates = _derive_spec_coordinates(blobs[SPEC_PATH])
    hole_coordinates = _derive_hole_coordinates(blobs[DESIGN_PATH])
    if spec_coordinates is None or hole_coordinates is None:
        return _failure("canonical-source-invalid")
    requirement_coordinates, scenario_coordinates = spec_coordinates

    requirement_rows = _section_rows(text, "Requirements")
    scenario_rows = _section_rows(text, "Scenarios")
    hole_rows = _section_rows(text, "Spec holes")
    host_rows = _section_rows(text, "Host unverified")
    if any(rows is None for rows in (requirement_rows, scenario_rows, hole_rows)):
        return _failure("coordinate-missing")
    if host_rows is None:
        return _failure("host-unverified-invalid")
    assert requirement_rows is not None
    assert scenario_rows is not None
    assert hole_rows is not None
    row_groups = (
        (requirement_rows, requirement_coordinates),
        (scenario_rows, scenario_coordinates),
        (hole_rows, hole_coordinates),
    )
    for rows, expected in row_groups:
        if error := _validate_rows(rows, expected):
            return _failure(error)
    if error := _validate_host_rows(host_rows):
        return _failure(error)
    all_rows = [*requirement_rows, *scenario_rows, *hole_rows, *host_rows]
    if error := _validate_evidence_content(
        text,
        all_rows,
        _canonical_body_lines(blobs),
    ):
        return _failure(error)
    return Verdict(
        True,
        "ok",
        requirements=len(requirement_rows),
        scenarios=len(scenario_rows),
        spec_holes=len(hole_rows),
        host_unverified=len(host_rows),
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        evidence = args.evidence.read_bytes()
    except OSError:
        verdict = _failure("evidence-empty")
    else:
        verdict = validate_evidence(evidence, args.repository.resolve())
    print(json.dumps(verdict._asdict(), ensure_ascii=True, sort_keys=True))
    return 0 if verdict.ok else 1


if __name__ == "__main__":
    sys.exit(main())
