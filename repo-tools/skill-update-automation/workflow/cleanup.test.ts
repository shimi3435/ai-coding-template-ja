import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cleanupCandidateDirectory } from "./cleanup.ts";

test("cleanup removes only the exact run-attempt candidate directory", () => {
  const runnerTemp = mkdtempSync(join(tmpdir(), "workflow-cleanup-"));
  const target = join(runnerTemp, "skill-update-candidate-10-2");
  const sibling = join(runnerTemp, "keep");
  try {
    mkdirSync(target);
    mkdirSync(sibling);
    writeFileSync(join(target, "manifest.json"), "fixture");
    cleanupCandidateDirectory({ runnerTemp, workflowRunId: "10", workflowRunAttempt: "2" });
    assert.equal(existsSync(target), false);
    assert.equal(existsSync(sibling), true);
  } finally {
    rmSync(runnerTemp, { recursive: true, force: true });
  }
});

test("cleanup rejects noncanonical identity before filesystem mutation", () => {
  assert.throws(() => cleanupCandidateDirectory({
    runnerTemp: "/tmp/fixture",
    workflowRunId: "../escape",
    workflowRunAttempt: "1",
  }));
  assert.throws(() => cleanupCandidateDirectory({
    runnerTemp: "/tmp/fixture",
    workflowRunId: "10",
    workflowRunAttempt: "01",
  }));
});
