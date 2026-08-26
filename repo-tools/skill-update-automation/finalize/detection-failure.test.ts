import assert from "node:assert/strict";
import test from "node:test";

import { createFakeGithubAdapter } from "../github/fake-adapter.ts";
import type { CandidateCommandReport } from "../candidate/index.ts";
import { publishDetectionOutcome } from "./detection-failure.ts";

const base = {
  repositoryId: "123",
  repository: "owner/repository",
  defaultBranchRef: "refs/heads/main",
  run: { workflowRunId: "456", workflowRunAttempt: 1 },
  at: "2026-08-20T00:00:00.000Z",
} as const;

function report(overrides: Partial<CandidateCommandReport> = {}): CandidateCommandReport {
  return {
    schemaVersion: 1,
    command: "skills:automation:candidate",
    status: "updater-rejected",
    updaterReport: {
      schemaVersion: 1,
      command: "skills:update",
      status: "failed",
      cohorts: [{ key: "one", status: "failed", names: ["alpha"] }],
      warnings: [],
      errors: ["opaque"],
      exitCode: 1,
    },
    failure: { state: "updater-rejected", scope: { kind: "global", operation: "detect" }, summaryOnly: false },
    errors: ["opaque"],
    ...overrides,
  };
}

test("detection failure creates one deduplicated managed issue and later resolves it", async () => {
  const adapter = createFakeGithubAdapter();
  const failed = { ...base, adapter, report: report(), publishDraftResult: "skipped" as const };
  assert.equal((await publishDetectionOutcome(failed)).issue, "created");
  assert.equal((await publishDetectionOutcome(failed)).issue, "unchanged");
  assert.equal((await adapter.listIssues()).items.length, 1);
  assert.match((await adapter.listIssues()).items[0]?.body ?? "", /opaque/);

  const green = report({ status: "no-op", failure: undefined, errors: [] });
  assert.equal((await publishDetectionOutcome({ ...base, adapter, report: green, publishDraftResult: "skipped" })).issue, "updated");
  assert.match((await adapter.listIssues()).items[0]?.body ?? "", /All managed automation failures are resolved/);
});

test("PR identity and trigger usage conflicts remain summary-only", async () => {
  for (const state of ["pr-identity-conflict", "trigger-usage-failure"] as const) {
    const adapter = createFakeGithubAdapter();
    const result = await publishDetectionOutcome({
      ...base,
      adapter,
      report: report({
        status: "candidate-invalid",
        failure: { state, scope: { kind: "global", operation: "detect" }, summaryOnly: true },
      }),
      publishDraftResult: "skipped",
    });
    assert.equal(result.kind, "summary-only");
    assert.deepEqual(adapter.transcript, []);
  }
});

test("draft publish failure becomes recovery-required without a receipt", async () => {
  const adapter = createFakeGithubAdapter();
  const candidate = report({ status: "candidate-update", failure: undefined, errors: [] });
  const result = await publishDetectionOutcome({ ...base, adapter, report: candidate, publishDraftResult: "failure" });
  assert.equal(result.issue, "created");
  assert.match((await adapter.listIssues()).items[0]?.body ?? "", /recovery-required/);
});

test("draft permission denial records exact operation and post-state", async () => {
  const adapter = createFakeGithubAdapter();
  const candidate = report({ status: "candidate-update", failure: undefined, errors: [] });
  const result = await publishDetectionOutcome({
    ...base,
    adapter,
    report: candidate,
    publishDraftResult: "failure",
    publishDraftPermission: { operation: "update-pull-request", postState: "unchanged" },
  });
  assert.match(result.summary, /update-pull-request.*unchanged/);
  assert.match((await adapter.listIssues()).items[0]?.body ?? "", /update-pull-request.*unchanged/);
});

test("unknown draft permission post-state stops before issue write", async () => {
  const adapter = createFakeGithubAdapter();
  const candidate = report({ status: "candidate-update", failure: undefined, errors: [] });
  const result = await publishDetectionOutcome({
    ...base,
    adapter,
    report: candidate,
    publishDraftResult: "failure",
    publishDraftPermission: { operation: "update-pull-request", postState: "unknown" },
  });
  assert.equal(result.kind, "summary-only");
  assert.match(result.summary, /update-pull-request.*unknown/);
  assert.deepEqual(adapter.transcript, []);
});

test("draft failure with partial PR identity stops issue write", async () => {
  const adapter = createFakeGithubAdapter({ pullRequests: [{
    prNumber: 9,
    state: "open",
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: "a".repeat(40),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: "Skill dependency updates",
    body: "partial",
  }] });
  const candidate = report({ status: "candidate-update", failure: undefined, errors: [] });
  const result = await publishDetectionOutcome({ ...base, adapter, report: candidate, publishDraftResult: "failure" });
  assert.equal(result.kind, "summary-only");
  assert.equal((await adapter.listIssues()).items.length, 0);
});
