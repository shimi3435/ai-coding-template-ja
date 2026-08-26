import assert from "node:assert/strict";
import test from "node:test";

import { classifyValidationOutcome } from "./validation.ts";

const run = { workflowRunId: "456", workflowRunAttempt: 1 } as const;

test("merge and repository check failures retain the exact failed command", () => {
  assert.deepEqual(classifyValidationOutcome({
    run,
    commands: [
      { command: "git merge --no-commit refs/remotes/origin/main", exitCode: 1 },
      { command: "uv run --no-sync task check", exitCode: null },
    ],
  }), {
    status: "failed",
    run,
    failureKind: "command",
    command: "git merge --no-commit refs/remotes/origin/main",
  });
  assert.deepEqual(classifyValidationOutcome({
    run,
    commands: [
      { command: "git merge --no-commit refs/remotes/origin/main", exitCode: 0 },
      { command: "uv run --no-sync task check", exitCode: 1 },
    ],
  }), {
    status: "failed",
    run,
    failureKind: "command",
    command: "uv run --no-sync task check",
  });
});

test("all required command results close validation as passed", () => {
  assert.deepEqual(classifyValidationOutcome({
    run,
    commands: [
      { command: "git merge --no-commit refs/remotes/origin/main", exitCode: 0 },
      { command: "uv run --no-sync task check", exitCode: 0 },
      { command: "node --test repo-tools/skill-update-automation/**/*.test.ts", exitCode: 0 },
    ],
  }), { status: "passed", run });
});

test("closed infrastructure stages never invent a command", () => {
  for (const stage of ["checkout", "artifact", "runner", "timeout", "cancelled"] as const) {
    assert.deepEqual(classifyValidationOutcome({ run, infrastructureStage: stage }), {
      status: "failed",
      run,
      failureKind: "infrastructure",
      stage,
    });
  }
});

test("missing command result is runner infrastructure failure", () => {
  assert.deepEqual(classifyValidationOutcome({
    run,
    commands: [{ command: "uv run --no-sync task check", exitCode: null }],
  }), {
    status: "failed",
    run,
    failureKind: "infrastructure",
    stage: "runner",
  });
});

test("invalid or mixed observations fail closed", () => {
  assert.throws(() => classifyValidationOutcome({ run, commands: [] }), /required command/);
  assert.throws(() => classifyValidationOutcome({
    run,
    infrastructureStage: "artifact",
    commands: [{ command: "task check", exitCode: 1 }],
  }), /混在/);
  assert.throws(() => classifyValidationOutcome({
    run,
    commands: [{ command: "", exitCode: 0 }],
  }), /command/);
});
