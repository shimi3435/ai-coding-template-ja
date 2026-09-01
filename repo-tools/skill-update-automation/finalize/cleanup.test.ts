import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cleanupFinalizeStage } from "./cleanup.ts";

test("cleanup removes only the exact finalize run-attempt directory", () => {
  const runnerTemp = mkdtempSync(join(tmpdir(), "finalize-cleanup-test-"));
  const exact = join(runnerTemp, "skill-update-finalize-456-1");
  const neighbor = join(runnerTemp, "skill-update-finalize-456-10");
  mkdirSync(exact);
  mkdirSync(neighbor);
  try {
    cleanupFinalizeStage({ runnerTemp, workflowRunId: "456", workflowRunAttempt: "1" });
    assert.equal(existsSync(exact), false);
    assert.equal(existsSync(neighbor), true);
  } finally {
    rmSync(runnerTemp, { recursive: true, force: true });
  }
});

test("cleanup rejects noncanonical identity before mutation", () => {
  assert.throws(() => cleanupFinalizeStage({
    runnerTemp: "/tmp",
    workflowRunId: "456",
    workflowRunAttempt: "01",
  }), /canonical/);
  assert.throws(() => cleanupFinalizeStage({
    runnerTemp: "relative",
    workflowRunId: "456",
    workflowRunAttempt: "1",
  }), /absolute/);
});
