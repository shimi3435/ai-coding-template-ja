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

test("workflow fixes opt-in triggers, concurrency, and read-only detection permissions", () => {
  const value = workflow();
  assert.deepEqual(value.on.schedule, [{ cron: "17 3 * * 1" }]);
  assert.deepEqual(Object.keys(value.on.workflow_dispatch.inputs), ["resume_closed"]);
  assert.deepEqual(value.on.workflow_dispatch.inputs.resume_closed, {
    description: "Resume after the latest managed PR was closed without merge",
    required: true,
    default: false,
    type: "boolean",
  });
  assert.deepEqual(value.permissions, {});
  assert.deepEqual(value.concurrency, {
    group: "skill-update-pr-automation-${{ github.repository_id }}",
    "cancel-in-progress": false,
  });
  assert.equal(value.jobs.detect.if,
    "github.event_name == 'workflow_dispatch' || (github.event_name == 'schedule' && vars.SKILLS_AUTO_UPDATE == 'true')");
  assert.deepEqual(value.jobs.detect.permissions, {
    contents: "read",
    "pull-requests": "read",
    issues: "read",
  });
  assert.equal(value.jobs.detect["timeout-minutes"], 20);
});

test("opt-in detection validates input before candidate network and uploads thirty-day exact artifact", () => {
  const steps = workflow().jobs.detect.steps as Array<Record<string, any>>;
  const gate = steps.findIndex((step) => step.id === "gate");
  const candidate = steps.findIndex((step) => step.id === "candidate");
  const upload = steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/upload-artifact@"));
  const cleanup = steps.findIndex((step) => step.name === "Cleanup candidate artifact");
  assert.ok(gate >= 0 && gate < candidate);
  assert.ok(candidate < cleanup);
  assert.match(upload?.uses ?? "", /^actions\/upload-artifact@[0-9a-f]{40}$/);
  assert.deepEqual(upload?.with, {
    name: "skill-update-candidate-${{ github.run_id }}-${{ github.run_attempt }}",
    path: "${{ runner.temp }}/skill-update-candidate-${{ github.run_id }}-${{ github.run_attempt }}",
    "if-no-files-found": "error",
    "retention-days": 30,
  });
  assert.equal(steps[cleanup]?.if, "always()");
  assert.doesNotMatch(JSON.stringify(workflow().jobs.detect), /contents\":\"write|pull-requests\":\"write|issues\":\"write/);
});

test("candidate command passes context through env instead of expression interpolation", () => {
  const steps = workflow().jobs.detect.steps as Array<Record<string, any>>;
  const candidate = steps.find((step) => step.id === "candidate");
  assert.doesNotMatch(candidate?.run ?? "", /\$\{\{/);
  assert.deepEqual(candidate?.env, {
    GH_TOKEN: "${{ github.token }}",
    RESUME_CLOSED: "${{ steps.gate.outputs.resume-closed }}",
    REPOSITORY_ID: "${{ github.repository_id }}",
    REPOSITORY: "${{ github.repository }}",
    WORKFLOW_RUN_ID: "${{ github.run_id }}",
    WORKFLOW_RUN_ATTEMPT: "${{ github.run_attempt }}",
    TRIGGER_SHA: "${{ github.sha }}",
    DEFAULT_BRANCH_SHA: "${{ steps.default-branch.outputs.sha }}",
    DEFAULT_BRANCH_REF: "${{ steps.default-branch.outputs.ref }}",
  });
  for (const option of [
    "--repository-id", "--repository", "--run-id", "--run-attempt", "--trigger-sha",
    "--default-branch-sha", "--default-branch-ref",
  ]) assert.match(candidate?.run ?? "", new RegExp(option));
});

test("candidate failures become immutable report outputs without failing the detect job", () => {
  const detect = workflow().jobs.detect;
  const steps = detect.steps as Array<Record<string, any>>;
  const candidate = steps.find((step) => step.id === "candidate");
  const report = steps.find((step) => step.id === "candidate-report");
  const uploads = steps.filter((step) => typeof step.uses === "string" && step.uses.startsWith("actions/upload-artifact@"));
  assert.equal(candidate?.["continue-on-error"], true);
  assert.match(candidate?.run ?? "", /tee "\$CANDIDATE_REPORT_FILE"/);
  assert.match(report?.if ?? "", /always\(\)/);
  assert.match(report?.run ?? "", /candidate\/report\.ts/);
  assert.equal(detect.outputs["candidate-status"], "${{ steps.candidate-report.outputs.candidate-status }}");
  assert.equal(detect.outputs["failure-state"], "${{ steps.candidate-report.outputs.failure-state }}");
  assert.equal(detect.outputs["summary-only"], "${{ steps.candidate-report.outputs.summary-only }}");
  assert.match(steps.find((step) => step.name === "Summarize read-only detection stop")?.run ?? "", /GITHUB_STEP_SUMMARY/);
  assert.ok(uploads.some((step) => String(step.with?.name).includes("candidate-report")));
});
