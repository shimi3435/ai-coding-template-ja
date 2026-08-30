import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { parseDocument } from "yaml";

const workflowPath = new URL("../../../.github/workflows/skill-update-prs.yml", import.meta.url);

function workflow(): Record<string, any> {
  const document = parseDocument(readFileSync(workflowPath, "utf8"), { uniqueKeys: true });
  assert.equal(document.errors.length, 0, document.errors.map((error) => error.message).join("\n"));
  return document.toJS() as Record<string, any>;
}

test("publish-draft and exact recovery are isolated first-stage writers while validate is read-only", () => {
  const jobs = workflow().jobs;
  assert.equal(jobs["publish-draft"].needs, "detect");
  assert.deepEqual(jobs["publish-draft"].permissions, {
    contents: "write",
    "pull-requests": "write",
  });
  assert.equal(jobs["publish-draft"]["timeout-minutes"], 20);
  assert.deepEqual(jobs.validate.needs, ["detect", "publish-draft", "recover"]);
  assert.deepEqual(jobs.validate.permissions, { contents: "read" });
  assert.equal(jobs.validate["timeout-minutes"], 45);
  assert.equal(jobs["publish-draft"].if,
    "needs.detect.outputs.should-run == 'true' && needs.detect.outputs.artifact-kind == 'candidate-update'");
});

test("recovery downloads one immutable origin artifact with exact permissions and excludes cleanup", () => {
  const jobs = workflow().jobs;
  const job = jobs.recover;
  assert.equal(job.needs, "detect");
  assert.deepEqual(job.permissions, {
    actions: "read",
    contents: "write",
    "pull-requests": "write",
  });
  assert.equal(job.permissions.issues, undefined);
  assert.match(job.if, /artifact-kind == 'recovery'/);
  const steps = job.steps as Array<Record<string, any>>;
  const origin = steps.find((step) => step.name === "Download immutable origin candidate artifact");
  const creator = steps.find((step) => step.id === "recovery-journal-creator");
  const recover = steps.find((step) => step.id === "recover");
  const cleanup = steps.find((step) => step.name === "Cleanup recovery stage");
  assert.equal(origin?.with["github-token"], "${{ github.token }}");
  assert.equal(origin?.with["run-id"], "${{ needs.detect.outputs.origin-run-id }}");
  assert.match(creator?.run ?? "", /users\/github-actions%5Bbot%5D/);
  assert.equal(recover?.env.CREATOR_USER_ID, "${{ steps.recovery-journal-creator.outputs.id }}");
  assert.match(recover?.run ?? "", /recovery\/command\.ts/);
  assert.equal(cleanup?.env.STAGE, "recovery");
  assert.match(cleanup?.run ?? "", /publish\/cleanup\.ts/);
  assert.doesNotMatch(jobs["cleanup-merged"].if, /recovery/);
});

test("candidate artifacts remain available for thirty-day cross-run recovery", () => {
  const steps = workflow().jobs.detect.steps as Array<Record<string, any>>;
  const upload = steps.find((step) => step.name === "Upload candidate artifact");
  assert.equal(upload?.with["retention-days"], 30);
  assert.match(upload?.if ?? "", /artifact-kind != 'recovery'/);
});

test("publish-draft downloads the exact run artifact and uploads a one-day receipt", () => {
  const job = workflow().jobs["publish-draft"];
  const steps = job.steps as Array<Record<string, any>>;
  const download = steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/download-artifact@"));
  const creator = steps.find((step) => step.id === "journal-creator");
  const publish = steps.find((step) => step.id === "publish-draft");
  const upload = steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/upload-artifact@"));
  assert.match(download?.uses ?? "", /^actions\/download-artifact@[0-9a-f]{40}$/);
  assert.deepEqual(download?.with, {
    name: "skill-update-candidate-${{ github.run_id }}-${{ github.run_attempt }}",
    path: "${{ runner.temp }}/skill-update-publish-${{ github.run_id }}-${{ github.run_attempt }}/candidate",
  });
  assert.doesNotMatch(publish?.run ?? "", /\$\{\{/);
  assert.equal(publish?.env.GH_TOKEN, "${{ github.token }}");
  assert.equal(publish?.env.RESUME_CLOSED, "${{ needs.detect.outputs.resume-closed }}");
  assert.match(creator?.run ?? "", /users\/github-actions%5Bbot%5D/);
  assert.match(creator?.run ?? "", /GITHUB_OUTPUT/);
  assert.equal(publish?.env.CREATOR_USER_ID, "${{ steps.journal-creator.outputs.id }}");
  assert.match(publish?.run ?? "", /publish\/command\.ts/);
  assert.equal(job.outputs["permission-operation"], "${{ steps.publish-draft.outputs.permission-operation }}");
  assert.equal(job.outputs["permission-post-state"], "${{ steps.publish-draft.outputs.permission-post-state }}");
  assert.deepEqual(upload?.with, {
    name: "skill-update-draft-receipt-${{ github.run_id }}-${{ github.run_attempt }}",
    path: "${{ runner.temp }}/skill-update-publish-${{ github.run_id }}-${{ github.run_attempt }}/draft-receipt.json",
    "if-no-files-found": "error",
    "retention-days": 1,
  });
});

test("validate checks out the exact candidate and runs integration checks without a write token", () => {
  const job = workflow().jobs.validate;
  const steps = job.steps as Array<Record<string, any>>;
  const checkout = steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/checkout@"));
  const validate = steps.find((step) => step.id === "validate-candidate");
  assert.deepEqual(checkout?.with, {
    ref: "${{ needs.recover.outputs.candidate-sha || needs.detect.outputs.candidate-sha }}",
    "fetch-depth": 0,
    "persist-credentials": false,
  });
  assert.equal(validate?.env.GH_TOKEN, undefined);
  assert.equal(validate?.env.CANDIDATE_SHA,
    "${{ needs.recover.outputs.candidate-sha || needs.detect.outputs.candidate-sha }}");
  assert.doesNotMatch(validate?.run ?? "", /\$\{\{/);
  assert.match(validate?.run ?? "", /publish\/validate-command\.ts/);
  assert.match(validate?.run ?? "", /uv run --no-sync task check/);
  assert.match(validate?.run ?? "", /repo-tools\/skill-update-automation\/.*\.test\.ts/);
});

test("workflow permits only explicit force-with-lease CAS and forbids history rewrites", () => {
  const sources = [
    readFileSync(workflowPath, "utf8"),
    ...globSync("repo-tools/skill-update-automation/publish/*.ts", { cwd: new URL("../../../", import.meta.url) })
      .filter((path) => !path.endsWith(".test.ts"))
      .map((path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")),
  ];
  for (const forbidden of [
    /pull_request_target/,
    /--force(?!-with-lease=)/,
    /--force-with-lease(?:["'\s]|$)/,
    /\+refs\/heads/,
    /\bgit\s+rebase\b/,
    /--auto(?:-merge)?/,
    /gh\s+pr\s+merge/,
  ]) for (const source of sources) assert.doesNotMatch(source, forbidden);
  assert.match(sources.join("\n"), /--force-with-lease=\$\{input\.ref\}:/);
});
