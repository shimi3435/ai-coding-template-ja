import assert from "node:assert/strict";
import test from "node:test";

import { classifyWorkflowValidation } from "./validation-outcome.ts";

const run = { workflowRunId: "456", workflowRunAttempt: 1 } as const;

test("explicit closed validation output wins", () => {
  assert.deepEqual(classifyWorkflowValidation({
    run,
    jobResult: "success",
    checkoutOutcome: "success",
    artifactOutcome: "success",
    stepOutcome: "failure",
    output: { status: "failed", failureKind: "command", command: "uv run --no-sync task check" },
  }), { status: "failed", run, failureKind: "command", command: "uv run --no-sync task check" });
});

test("checkout, artifact, runner, timeout, and cancellation are closed infrastructure stages", () => {
  const cases = [
    [{ jobResult: "failure", checkoutOutcome: "failure" }, "checkout"],
    [{ jobResult: "failure", checkoutOutcome: "success", artifactOutcome: "failure" }, "artifact"],
    [{ jobResult: "failure", checkoutOutcome: "success", artifactOutcome: "success", stepOutcome: "failure" }, "runner"],
    [{ jobResult: "cancelled", timedOut: true }, "timeout"],
    [{ jobResult: "cancelled", timedOut: false }, "cancelled"],
  ] as const;
  for (const [observation, stage] of cases) {
    assert.deepEqual(classifyWorkflowValidation({ run, ...observation }), {
      status: "failed",
      run,
      failureKind: "infrastructure",
      stage,
    });
  }
});

test("contradictory or unavailable workflow evidence uses unknown rather than inventing a command", () => {
  assert.deepEqual(classifyWorkflowValidation({ run, jobResult: "failure" }), {
    status: "failed",
    run,
    failureKind: "infrastructure",
    stage: "unknown",
  });
  assert.throws(() => classifyWorkflowValidation({
    run,
    jobResult: "success",
    output: { status: "failed", failureKind: "command", command: "" },
  }), /command/);
});
