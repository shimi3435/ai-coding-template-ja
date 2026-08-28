import assert from "node:assert/strict";
import test from "node:test";

import { parseCleanupEvidence } from "./detection-command.ts";

test("cleanup job evidence is exact and fail-closed", () => {
  assert.deepEqual(parseCleanupEvidence("passed", "success", "[]"), { status: "passed", failedRefs: [] });
  assert.deepEqual(parseCleanupEvidence("", "failure", ""), { status: "failed", failedRefs: [] });
  assert.deepEqual(parseCleanupEvidence(undefined, "cancelled", undefined), { status: "failed", failedRefs: [] });
  assert.equal(parseCleanupEvidence("", "skipped", ""), undefined);
  assert.throws(() => parseCleanupEvidence("", "success", ""), /status/);
  assert.throws(() => parseCleanupEvidence("passed", "success", JSON.stringify([
    "refs/heads/automation/skill-updates/g000001",
  ])), /inconsistent/);
});
