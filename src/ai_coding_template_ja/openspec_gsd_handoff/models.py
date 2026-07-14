"""Immutable values shared by the OpenSpec–GSD handoff bridge."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class ArtifactKind(StrEnum):
    """Canonical OpenSpec Markdown artifact kinds."""

    PROPOSAL = "proposal"
    DESIGN = "design"
    SPEC = "spec"
    TASKS = "tasks"


class InputRoute(StrEnum):
    """The route that supplied artifact path and progress metadata."""

    JSON = "json"
    MARKDOWN_FALLBACK = "markdown-fallback"


class HandoffState(StrEnum):
    """The only persistent states supported by the MVP."""

    PREPARED = "prepared"
    STARTED = "started"


class KnownState(StrEnum):
    """Caller-visible knowledge about persistent handoff state."""

    MANIFEST_ABSENT = "manifest-absent"
    PREPARED = "prepared"
    STARTED = "started"
    UNKNOWN = "unknown"


class IssueCategory(StrEnum):
    """Stable failure categories; display prose belongs to callers."""

    INPUT = "input"
    PROGRESS = "progress"
    ARTIFACT = "artifact"
    DISCOVERY = "discovery"
    PREFLIGHT = "preflight"
    PERSISTENCE = "persistence"


class HostSpawnSchema(StrEnum):
    """Visible host spawn schema supplied by the runtime caller."""

    TYPED = "typed"
    GENERIC = "generic"


class HostDispatch(StrEnum):
    """Validated dispatch mode selected by the runtime caller."""

    TYPED = "typed"
    GENERIC_AGENT_WORKAROUND = "generic-agent-workaround"


@dataclass(frozen=True)
class HostCapabilityInput:
    """Explicit host evidence; the bridge never infers this from GSD."""

    inspected: bool
    spawn_agent_schema: HostSpawnSchema
    dispatch: HostDispatch
    agent_role_source: str | None


@dataclass(frozen=True)
class ArtifactClaim:
    """One caller-supplied canonical artifact path claim."""

    kind: ArtifactKind
    path: Path


@dataclass(frozen=True)
class Artifact:
    """One bounded canonical artifact derived from a single byte buffer."""

    kind: ArtifactKind
    path: str
    sha256: str
    content: str
    content_bytes: bytes


@dataclass(frozen=True)
class NormalizedTask:
    """A canonical task with a sequential, one-based string ID."""

    id: str
    description: str
    done: bool


@dataclass(frozen=True)
class Progress:
    """Deterministic progress derived from canonical tasks.md."""

    total: int
    complete: int
    remaining: int
    tasks: tuple[NormalizedTask, ...]


@dataclass(frozen=True)
class ClassifiedIssue:
    """Machine-oriented failure data, intentionally free of display prose."""

    category: IssueCategory
    code: str
    known_state: KnownState


@dataclass(frozen=True)
class Success[T]:
    """A complete operation value; route remains separate from capability."""

    value: T
    route: InputRoute | None = None


@dataclass(frozen=True)
class Failure:
    """A classified whole-operation failure with no partial value."""

    issue: ClassifiedIssue
    route: InputRoute | None = None


type Result[T] = Success[T] | Failure


@dataclass(frozen=True)
class Discovery:
    """Complete discovery output shared by JSON and Markdown routes."""

    artifacts: tuple[Artifact, ...]
    progress: Progress
