import assert from "node:assert/strict";
import test from "node:test";

import { finalizeStopMessage, parseCleanupFailedRefs } from "./command.ts";

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
