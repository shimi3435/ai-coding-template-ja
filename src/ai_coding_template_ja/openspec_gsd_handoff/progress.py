"""Strict, deterministic normalization of canonical OpenSpec tasks.md."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from .models import (
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    NormalizedTask,
    Progress,
    Result,
    Success,
)

MAX_TASKS = 4096
_OPEN_MARKER = "- [ ] "
_DONE_MARKER = "- [x] "


def _failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.PROGRESS,
            code=code,
            known_state=KnownState.MANIFEST_ABSENT,
        )
    )


def parse_task_progress(
    markdown: str, *, max_tasks: int = MAX_TASKS
) -> Result[Progress]:
    """Parse exact line-start task markers without returning partial progress."""

    tasks: list[NormalizedTask] = []
    for line in markdown.splitlines():
        done: bool
        if line.startswith(_OPEN_MARKER):
            done = False
            description = line[len(_OPEN_MARKER) :]
        elif line.startswith(_DONE_MARKER):
            done = True
            description = line[len(_DONE_MARKER) :]
        elif line.lstrip().startswith(("- [", "* [")):
            return _failure("task-checkbox-malformed")
        else:
            continue

        if not description.strip():
            return _failure("task-description-empty")
        if len(tasks) == max_tasks:
            return _failure("tasks-limit-exceeded")
        tasks.append(
            NormalizedTask(
                id=str(len(tasks) + 1),
                description=description,
                done=done,
            )
        )

    if not tasks:
        return _failure("tasks-empty")

    complete = sum(task.done for task in tasks)
    return Success(
        Progress(
            total=len(tasks),
            complete=complete,
            remaining=len(tasks) - complete,
            tasks=tuple(tasks),
        )
    )


def validate_candidate_progress(
    raw_progress: object,
    raw_tasks: object,
    canonical: Progress,
) -> Result[Progress]:
    """Validate exact JSON metadata parity with canonical Markdown progress."""

    if not isinstance(raw_progress, Mapping):
        return _failure("candidate-progress-invalid")
    total = raw_progress.get("total")
    complete = raw_progress.get("complete")
    remaining = raw_progress.get("remaining")
    if (
        type(total) is not int
        or type(complete) is not int
        or type(remaining) is not int
        or total < 0
        or complete < 0
        or remaining < 0
    ):
        return _failure("candidate-progress-invalid")
    counts = (total, complete, remaining)
    if total != complete + remaining:
        return _failure("candidate-progress-invalid")
    if counts != (canonical.total, canonical.complete, canonical.remaining):
        return _failure("candidate-progress-mismatch")

    if not isinstance(raw_tasks, Sequence) or isinstance(raw_tasks, (str, bytes)):
        return _failure("candidate-tasks-invalid")
    normalized: list[NormalizedTask] = []
    for raw_task in raw_tasks:
        if not isinstance(raw_task, Mapping):
            return _failure("candidate-tasks-invalid")
        task_id = raw_task.get("id")
        description = raw_task.get("description")
        done = raw_task.get("done")
        if (
            type(task_id) is not str
            or type(description) is not str
            or type(done) is not bool
        ):
            return _failure("candidate-tasks-invalid")
        normalized.append(NormalizedTask(task_id, description, done))

    if tuple(normalized) != canonical.tasks:
        return _failure("candidate-tasks-mismatch")
    return Success(canonical)
