"""v2 runtime foundation の tracked repository 契約を検証する。"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"
EXTRAS_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "extras-smoke.yml"


def _ci_job_body(job_name: str) -> str:
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    match = re.search(
        rf"^  {re.escape(job_name)}:\n(?P<body>.*?)(?=^  [a-z][a-z0-9-]*:\n|\Z)",
        workflow,
        flags=re.MULTILINE | re.DOTALL,
    )
    assert match is not None, f"CI job {job_name!r} が存在しません"
    return match.group("body")


def test_runtime_metadata_declares_node_24_and_python_314() -> None:
    pyproject = tomllib.loads(
        (REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    )
    uv_lock = tomllib.loads((REPO_ROOT / "uv.lock").read_text(encoding="utf-8"))

    assert (REPO_ROOT / ".node-version").read_text(encoding="utf-8").strip() == "24"
    assert (REPO_ROOT / ".python-version").read_text(encoding="utf-8").strip() == "3.14"
    assert pyproject["project"]["requires-python"] == ">=3.14"
    assert pyproject["tool"]["basedpyright"]["pythonVersion"] == "3.14"
    assert uv_lock["requires-python"] == ">=3.14"


def test_ci_uses_node_24_and_python_314_for_the_offline_check() -> None:
    workflow = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((REPO_ROOT / ".github" / "workflows").glob("*.yml"))
    )
    check = _ci_job_body("check")
    rename_smoke = _ci_job_body("rename-smoke")

    assert 'python-version: "3.12"' not in workflow
    assert 'python-version: "3.13"' not in workflow
    assert 'python-version: "3.14"' in check
    for job in (check, rename_smoke):
        assert "actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903" in job
        assert 'node-version: "24"' in job
        assert "activate-environment: true" in job
        assert "npm ci --ignore-scripts" in job
        for command in (
            "node repo-tools/entrypoint.mjs runtime-preflight",
            "node repo-tools/entrypoint.mjs check-contracts",
            "node_modules/.bin/tsc --noEmit",
            "node --test repo-tools/*.test.ts",
            "uv run --no-sync ruff format --check .",
            "uv run --no-sync ruff check .",
            "uv run --no-sync basedpyright",
            "uv run --no-sync pytest",
        ):
            assert command in job

    extras_smoke = EXTRAS_WORKFLOW.read_text(encoding="utf-8")
    assert 'python-version: "3.14"' in extras_smoke
    assert "activate-environment: true" in extras_smoke
    assert "actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903" in extras_smoke
    assert 'node-version: "24"' in extras_smoke
    assert "node repo-tools/entrypoint.mjs runtime-preflight" in extras_smoke
    assert "npm ci --ignore-scripts" in extras_smoke


def test_existing_audit_job_runs_the_explicit_online_node_audit() -> None:
    audit = _ci_job_body("audit")

    assert 'python-version: "3.14"' in audit
    assert "npm ci --ignore-scripts" in audit
    assert "task audit:node" not in audit
    assert "npm audit --audit-level=high" in audit


def test_v2_runtime_breaking_change_is_handed_off_without_bumping_version() -> None:
    release_guide = (REPO_ROOT / "docs" / "template" / "release.md").read_text(
        encoding="utf-8"
    )

    assert (REPO_ROOT / "TEMPLATE_VERSION").read_text(encoding="utf-8") == "1.0.0\n"
    for contract in (
        "establish-v2-runtime-foundation",
        "Node.js 24",
        "Python >=3.14",
        "破壊的変更",
        "prepare-v2-release",
        "全 4 changes",
        "TEMPLATE_VERSION=2.0.0",
        "移行ガイド最終化",
        "release-ready 判定",
    ):
        assert contract in release_guide
