import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cleanupPublishStage } from "./cleanup.ts";

test("cleanup removes only the exact publish or validation run-attempt directory", () => {
  const runnerTemp = mkdtempSync(join(tmpdir(), "publish-cleanup-test-"));
  const exact = join(runnerTemp, "skill-update-publish-456-1");
  const neighbor = join(runnerTemp, "skill-update-publish-456-10");
  mkdirSync(exact);
  mkdirSync(neighbor);
  try {
    cleanupPublishStage({ runnerTemp, workflowRunId: "456", workflowRunAttempt: "1", stage: "publish" });
    assert.equal(existsSync(exact), false);
    assert.equal(existsSync(neighbor), true);
  } finally {
    rmSync(runnerTemp, { recursive: true, force: true });
  }
});

test("cleanup rejects unknown stage and noncanonical identity", () => {
  assert.throws(() => cleanupPublishStage({
    runnerTemp: "/tmp",
    workflowRunId: "456",
    workflowRunAttempt: "01",
    stage: "publish",
  }), /canonical/);
  assert.throws(() => cleanupPublishStage({
    runnerTemp: "/tmp",
    workflowRunId: "456",
    workflowRunAttempt: "1",
    stage: "other" as "publish",
  }), /stage/);
});
