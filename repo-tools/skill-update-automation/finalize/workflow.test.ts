import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDocument } from "yaml";

const workflowPath = new URL("../../../.github/workflows/skill-update-prs.yml", import.meta.url);

function workflow(): Record<string, any> {
  const document = parseDocument(readFileSync(workflowPath, "utf8"), { uniqueKeys: true });
  assert.equal(document.errors.length, 0, document.errors.map((error) => error.message).join("\n"));
  return document.toJS() as Record<string, any>;
}

test("publish-finalize runs after validation with only exact final permissions", () => {
  const job = workflow().jobs["publish-finalize"];
  assert.deepEqual(job.needs, ["detect", "publish-draft", "validate", "cleanup-merged"]);
  assert.deepEqual(job.permissions, {
    contents: "read",
    "pull-requests": "write",
    issues: "write",
  });
  assert.equal(job["timeout-minutes"], 20);
  assert.match(job.if, /^always\(\)/);
  assert.match(job.if, /needs\.detect\.outputs\.should-run/);
});

test("validation exports observable step outcomes without adding write permission", () => {
  const job = workflow().jobs.validate;
  assert.deepEqual(job.outputs, {
    "checkout-outcome": "${{ steps.checkout.outcome }}",
    "artifact-outcome": "${{ steps.candidate-artifact.outcome }}",
    "validation-outcome": "${{ steps.validate-candidate.outcome }}",
    "validation-status": "${{ steps.validate-candidate.outputs.validation-status }}",
    "failure-kind": "${{ steps.validate-candidate.outputs.failure-kind }}",
    command: "${{ steps.validate-candidate.outputs.command }}",
    stage: "${{ steps.validate-candidate.outputs.stage }}",
  });
  assert.deepEqual(job.permissions, { contents: "read" });
});

test("finalize downloads exact same-run inputs, uses scoped token, and always cleans", () => {
  const steps = workflow().jobs["publish-finalize"].steps as Array<Record<string, any>>;
  const finalize = steps.find((step) => step.id === "publish-finalize");
  const cleanup = steps.find((step) => step.name === "Cleanup finalize stage");
  const downloads = steps.filter((step) => typeof step.uses === "string" && step.uses.startsWith("actions/download-artifact@"));
  assert.ok(downloads.length >= 1);
  for (const step of downloads) assert.match(step.uses, /^actions\/download-artifact@[0-9a-f]{40}$/);
  assert.equal(finalize?.env.GH_TOKEN, "${{ github.token }}");
  assert.doesNotMatch(finalize?.run ?? "", /\$\{\{/);
  assert.match(finalize?.run ?? "", /finalize\/command\.ts/);
  assert.equal(cleanup?.if, "always()");
});

test("guarded cleanup failure remains observable to the finalizer", () => {
  const jobs = workflow().jobs;
  const cleanupJob = jobs["cleanup-merged"];
  const cleanup = (cleanupJob.steps as Array<Record<string, any>>).find((step) => step.id === "cleanup-merged");
  const finalizeSteps = jobs["publish-finalize"].steps as Array<Record<string, any>>;
  const detection = finalizeSteps.find((step) => step.id === "publish-detection-outcome");
  const finalize = finalizeSteps.find((step) => step.id === "publish-finalize");
  assert.equal(cleanup?.["continue-on-error"], undefined);
  assert.equal(cleanupJob.outputs["cleanup-status"], "${{ steps.cleanup-merged.outputs.cleanup-status }}");
  assert.equal(cleanupJob.outputs["cleanup-failed-refs"], "${{ steps.cleanup-merged.outputs.cleanup-failed-refs }}");
  assert.equal(detection?.env.CLEANUP_STATUS, "${{ needs.cleanup-merged.outputs.cleanup-status }}");
  assert.equal(detection?.env.CLEANUP_OUTCOME, "${{ needs.cleanup-merged.result }}");
  assert.equal(detection?.env.CLEANUP_FAILED_REFS, "${{ needs.cleanup-merged.outputs.cleanup-failed-refs }}");
  assert.equal(finalize?.env.CLEANUP_STATUS, undefined);
});

test("finalize always routes detection and draft failures before candidate-specific finalize", () => {
  const job = workflow().jobs["publish-finalize"];
  const steps = job.steps as Array<Record<string, any>>;
  const reportDownload = steps.find((step) => step.name === "Download exact candidate report");
  const detection = steps.find((step) => step.id === "publish-detection-outcome");
  const finalize = steps.find((step) => step.id === "publish-finalize");
  assert.match(job.if, /needs\.detect\.outputs\.candidate-status != ''/);
  assert.match(job.if, /needs\.detect\.outputs\.summary-only != 'true'/);
  assert.match(reportDownload?.uses ?? "", /^actions\/download-artifact@[0-9a-f]{40}$/);
  assert.equal(detection?.if, "always()");
  assert.match(detection?.run ?? "", /detection-command\.ts.*GITHUB_STEP_SUMMARY/s);
  assert.equal(detection?.env.PUBLISH_DRAFT_RESULT, "${{ needs.publish-draft.result }}");
  assert.equal(detection?.env.PUBLISH_DRAFT_PERMISSION_OPERATION,
    "${{ needs.publish-draft.outputs.permission-operation }}");
  assert.equal(detection?.env.PUBLISH_DRAFT_PERMISSION_POST_STATE,
    "${{ needs.publish-draft.outputs.permission-post-state }}");
  assert.match(finalize?.if ?? "", /needs\.publish-draft\.result == 'success'/);
  assert.match(finalize?.if ?? "", /needs\.validate\.result != 'skipped'/);
});
