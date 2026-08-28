import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDocument } from "yaml";

import { cleanupCandidateDirectory } from "./cleanup.ts";

const workflowPath = new URL("../../../.github/workflows/skill-update-prs.yml", import.meta.url);

function workflow(): Record<string, any> {
  const document = parseDocument(readFileSync(workflowPath, "utf8"), { uniqueKeys: true });
  assert.equal(document.errors.length, 0, document.errors.map((error) => error.message).join("\n"));
  return document.toJS() as Record<string, any>;
}

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

test("merged branch cleanup is an independent eligible-run job with least privilege", () => {
  const jobs = workflow().jobs;
  const cleanup = jobs["cleanup-merged"];
  assert.deepEqual(cleanup.needs, ["detect", "publish-draft"]);
  assert.match(cleanup.if, /^always\(\)/);
  for (const kind of ["candidate-update", "existing-head-validation", "no-op"]) {
    assert.match(cleanup.if, new RegExp(`artifact-kind == '${kind}'`));
  }
  assert.deepEqual(cleanup.permissions, { contents: "write", "pull-requests": "read" });
  const cleanupSteps = cleanup.steps as Array<Record<string, any>>;
  const creator = cleanupSteps.find((step) => step.id === "cleanup-journal-creator");
  const mutation = cleanupSteps.find((step) => step.id === "cleanup-merged");
  assert.match(creator?.run ?? "", /users\/github-actions%5Bbot%5D/);
  assert.equal(mutation?.env.CREATOR_USER_ID, "${{ steps.cleanup-journal-creator.outputs.id }}");
  assert.equal((jobs["publish-draft"].steps as Array<Record<string, any>>)
    .some((step) => step.id === "cleanup-merged"), false);
});

test("final issue writer receives cleanup evidence and creator identity from independent jobs", () => {
  const jobs = workflow().jobs;
  const finalize = jobs["publish-finalize"];
  assert.deepEqual(finalize.needs, ["detect", "publish-draft", "validate", "cleanup-merged"]);
  const steps = finalize.steps as Array<Record<string, any>>;
  const creator = steps.find((step) => step.id === "journal-creator");
  const detection = steps.find((step) => step.id === "publish-detection-outcome");
  const publish = steps.find((step) => step.id === "publish-finalize");
  assert.match(creator?.run ?? "", /users\/github-actions%5Bbot%5D/);
  assert.equal(detection?.env.CREATOR_USER_ID, "${{ steps.journal-creator.outputs.id }}");
  assert.equal(publish?.env.CREATOR_USER_ID, "${{ steps.journal-creator.outputs.id }}");
  assert.equal(detection?.env.CLEANUP_STATUS, "${{ needs.cleanup-merged.outputs.cleanup-status }}");
  assert.equal(detection?.env.CLEANUP_FAILED_REFS, "${{ needs.cleanup-merged.outputs.cleanup-failed-refs }}");
  assert.equal(publish?.env.CLEANUP_STATUS, undefined);
});
