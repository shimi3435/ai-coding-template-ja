import assert from "node:assert/strict";
import test from "node:test";

import { finalizeStopMessage, parseCleanupFailedRefs } from "./command.ts";
import { parseReadyCleanupFailedRefs, parseReadyCleanupStatus } from "./ready-reconciliation-command.ts";

test("cleanup failed refs accept blank skipped-job output and exact sorted managed refs", () => {
  assert.deepEqual(parseCleanupFailedRefs(undefined), []);
  assert.deepEqual(parseCleanupFailedRefs(""), []);
  assert.deepEqual(parseCleanupFailedRefs(
    '["refs/heads/automation/skill-updates/g000001","refs/heads/automation/skill-updates/g000002"]',
  ), [
    "refs/heads/automation/skill-updates/g000001",
    "refs/heads/automation/skill-updates/g000002",
  ]);
  assert.throws(() => parseCleanupFailedRefs('["refs/heads/human"]'), /invalid/);
  assert.throws(() => parseCleanupFailedRefs(
    '["refs/heads/automation/skill-updates/g000002","refs/heads/automation/skill-updates/g000001"]',
  ), /invalid/);
});

test("finalize command retains permission operation and post-state", () => {
  assert.equal(finalizeStopMessage({
    kind: "permission-denied",
    permission: { operation: "update-pull-request", postState: "unknown" },
  }), "publish-finalize stopped: permission-denied operation=update-pull-request post-state=unknown");
});

test("ready reconciliation cleanup inputs accept exact workflow outputs", () => {
  assert.equal(parseReadyCleanupStatus(undefined, undefined), undefined);
  assert.equal(parseReadyCleanupStatus("", "skipped"), undefined);
  assert.equal(parseReadyCleanupStatus("passed", "failure"), "passed");
  assert.equal(parseReadyCleanupStatus("failed", "success"), "failed");
  assert.equal(parseReadyCleanupStatus("", "failure"), "failed");
  assert.equal(parseReadyCleanupStatus("", "cancelled"), "failed");
  assert.throws(() => parseReadyCleanupStatus("", "success"), /invalid/);
  assert.throws(() => parseReadyCleanupStatus("unknown", "success"), /invalid/);

  assert.deepEqual(parseReadyCleanupFailedRefs(undefined), []);
  assert.deepEqual(parseReadyCleanupFailedRefs(""), []);
  assert.deepEqual(parseReadyCleanupFailedRefs(
    '["refs/heads/automation/skill-updates/g000001","refs/heads/automation/skill-updates/g000002"]',
  ), [
    "refs/heads/automation/skill-updates/g000001",
    "refs/heads/automation/skill-updates/g000002",
  ]);
  assert.throws(() => parseReadyCleanupFailedRefs('["refs/heads/human"]'), /invalid/);
  assert.throws(() => parseReadyCleanupFailedRefs(
    '["refs/heads/automation/skill-updates/g000002","refs/heads/automation/skill-updates/g000001"]',
  ), /invalid/);
});
