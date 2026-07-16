"""Thin structured module entrypoint for the three mechanical operations."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from . import (
    HandoffInspection,
    inspect_handoff,
    mark_handoff_started,
    prepare_handoff,
)
from .manifest import (
    HandoffManifest,
    ManifestPersistenceFailure,
)
from .models import (
    ClassifiedIssue,
    Failure,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    IssueCategory,
    KnownState,
    Success,
)
from .preflight import RepositoryPolicyVerdict


class _RequestArgumentError(Exception):
    """An argv validation failure that belongs on the structured output seam."""


class _StructuredArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise _RequestArgumentError(message)


def _parser() -> argparse.ArgumentParser:
    parser = _StructuredArgumentParser(
        prog="python -m ai_coding_template_ja.openspec_gsd_handoff",
        description=(
            "Inspect or persist the mechanical OpenSpec-to-GSD handoff boundary."
        ),
    )
    subparsers = parser.add_subparsers(dest="operation", required=True)
    for name in ("inspect", "prepare"):
        command = subparsers.add_parser(name)
        command.add_argument("--repository", type=Path, required=True)
        command.add_argument("--change", required=True)
        command.add_argument("--source-commit", required=True)
        command.add_argument("--gsd-home", type=Path, required=True)
        command.add_argument(
            "--repository-policy", choices=tuple(RepositoryPolicyVerdict)
        )
        command.add_argument("--host-inspected", action="store_true")
        command.add_argument("--host-schema", choices=tuple(HostSpawnSchema))
        command.add_argument("--host-dispatch", choices=tuple(HostDispatch))
        command.add_argument("--agent-role-source")
        if name == "prepare":
            command.add_argument("--approved", action="store_true")
    started = subparsers.add_parser("mark-started")
    started.add_argument("--repository", type=Path, required=True)
    started.add_argument("--change", required=True)
    started.add_argument("--gsd-accepted", action="store_true")
    return parser


def _input_failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            IssueCategory.INPUT,
            code,
            KnownState.MANIFEST_ABSENT,
        )
    )


def _host(args: argparse.Namespace) -> HostCapabilityInput | Failure:
    try:
        schema = HostSpawnSchema(args.host_schema)
        dispatch = HostDispatch(args.host_dispatch)
    except (TypeError, ValueError):
        return _input_failure("host-capability-invalid")
    return HostCapabilityInput(
        inspected=args.host_inspected,
        spawn_agent_schema=schema,
        dispatch=dispatch,
        agent_role_source=args.agent_role_source,
    )


def _policy(args: argparse.Namespace) -> RepositoryPolicyVerdict | None:
    try:
        return RepositoryPolicyVerdict(args.repository_policy)
    except (TypeError, ValueError):
        return None


def _dispatch(args: argparse.Namespace):  # type: ignore[no-untyped-def]
    if args.operation == "mark-started":
        return mark_handoff_started(
            args.repository,
            args.change,
            gsd_accepted=args.gsd_accepted,
        )
    if args.operation == "prepare" and not args.approved:
        return _input_failure("approval-required")
    host = _host(args)
    if isinstance(host, Failure):
        return host
    common = {
        "repository": args.repository,
        "change_id": args.change,
        "source_commit": args.source_commit,
        "gsd_home": args.gsd_home,
        "repository_policy": _policy(args),
        "host_capability": host,
    }
    if args.operation == "prepare":
        return prepare_handoff(**common, approved=True)
    return inspect_handoff(**common)


def _host_payload(manifest: HandoffManifest) -> dict[str, object]:
    host = manifest.capabilities.host
    return {
        "inspected": host.inspected,
        "spawn_agent_schema": host.spawn_agent_schema.value,
        "dispatch": host.dispatch.value,
        "agent_role_source": host.agent_role_source,
    }


def _success_payload(operation: str, result: Success[object]) -> dict[str, object]:
    value = result.value
    manifest = value.manifest if isinstance(value, HandoffInspection) else value
    if not isinstance(manifest, HandoffManifest):
        raise TypeError("unexpected success value")
    return {
        "ok": True,
        "operation": operation,
        "route": result.route.value if result.route is not None else None,
        "known_state": manifest.handoff_state.value,
        "change_id": manifest.change_id,
        "source_commit": manifest.source_commit,
        "host": _host_payload(manifest),
    }


def _failure_payload(operation: str, result: object) -> dict[str, object]:
    if isinstance(result, ManifestPersistenceFailure):
        issue = result.issue
        return {
            "ok": False,
            "operation": operation,
            "category": "persistence",
            "code": issue.code,
            "known_state": issue.target_state.value,
            "failure_point": issue.failure_point.value,
            "staging_state": issue.staging_state.value,
            "cleanup_outcome": issue.cleanup_outcome.value,
        }
    if not isinstance(result, Failure):
        raise TypeError("unexpected failure value")
    return {
        "ok": False,
        "operation": operation,
        "category": result.issue.category.value,
        "code": result.issue.code,
        "known_state": result.issue.known_state.value,
    }


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    try:
        args = _parser().parse_args(arguments)
    except _RequestArgumentError:
        operation = (
            arguments[0]
            if arguments and arguments[0] in {"inspect", "prepare", "mark-started"}
            else "unknown"
        )
        print(
            json.dumps(
                _failure_payload(operation, _input_failure("request-invalid")),
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 2
    result = _dispatch(args)
    if isinstance(result, Success):
        payload = _success_payload(args.operation, result)
        exit_code = 0
    else:
        payload = _failure_payload(args.operation, result)
        category = payload["category"]
        exit_code = 2 if category == "input" else 4 if category == "persistence" else 3
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
