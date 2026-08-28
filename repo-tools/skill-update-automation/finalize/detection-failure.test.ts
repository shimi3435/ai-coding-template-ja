import assert from "node:assert/strict";
import test from "node:test";

import { createFakeGithubAdapter } from "../github/fake-adapter.ts";
import type { CandidateCommandReport } from "../candidate/index.ts";
import {
  classifyIssueRootV2,
  reduceJournalCommentsV2,
  validateIssueJournalV2,
  type IssueEntry,
} from "../model/index.ts";
import { publishDetectionOutcome } from "./detection-failure.ts";

const base = {
  repositoryId: "123",
  repository: "owner/repository",
  defaultBranchRef: "refs/heads/main",
  creatorUserId: "456",
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

async function currentEntries(adapter: ReturnType<typeof createFakeGithubAdapter>): Promise<readonly IssueEntry[]> {
  const issue = (await adapter.listIssues()).items[0];
  if (issue === undefined) throw new Error("fixture issue missing");
  const classified = classifyIssueRootV2(issue.title, issue.body);
  if (classified.kind !== "strict") throw new Error("fixture issue root invalid");
  const comments = await adapter.listJournalComments(issue.issueNumber);
  const journal = reduceJournalCommentsV2(comments.items, classified.root.creatorUserId);
  return validateIssueJournalV2(classified.root, journal).at(-1)?.entries ?? [];
}

test("detection failure creates one deduplicated managed issue and later resolves it", async () => {
  const adapter = createFakeGithubAdapter();
  const failed = { ...base, adapter, report: report(), publishDraftResult: "skipped" as const };
  assert.equal((await publishDetectionOutcome(failed)).issue, "created");
  assert.equal((await publishDetectionOutcome(failed)).issue, "unchanged");
  assert.equal((await adapter.listIssues()).items.length, 1);
  assert.match((await currentEntries(adapter))[0]?.summary ?? "", /opaque/);

  const green = report({ status: "no-op", failure: undefined, errors: [] });
  assert.equal((await publishDetectionOutcome({ ...base, adapter, report: green, publishDraftResult: "skipped" })).issue, "updated");
  assert.deepEqual(await currentEntries(adapter), []);
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
  assert.equal((await currentEntries(adapter))[0]?.state, "recovery-required");
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
  assert.match((await currentEntries(adapter))[0]?.summary ?? "", /update-pull-request.*unchanged/);
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
    authorUserId: "456",
    lastEditedAt: null,
  }] });
  const candidate = report({ status: "candidate-update", failure: undefined, errors: [] });
  const result = await publishDetectionOutcome({ ...base, adapter, report: candidate, publishDraftResult: "failure" });
  assert.equal(result.kind, "summary-only");
  assert.equal((await adapter.listIssues()).items.length, 0);
});

test("no-op run journals independent cleanup failure and later no-op resolves it", async () => {
  const adapter = createFakeGithubAdapter();
  const green = report({ status: "no-op", failure: undefined, errors: [] });
  const failed = await publishDetectionOutcome({
    ...base,
    adapter,
    report: green,
    publishDraftResult: "skipped",
    cleanup: {
      status: "failed",
      failedRefs: ["refs/heads/automation/skill-updates/g000001"],
    },
  });
  assert.equal(failed.issue, "created");
  assert.equal((await currentEntries(adapter))[0]?.state, "cleanup-failed");
  const resolved = await publishDetectionOutcome({
    ...base,
    adapter,
    report: green,
    publishDraftResult: "skipped",
    cleanup: { status: "passed", failedRefs: [] },
  });
  assert.equal(resolved.issue, "updated");
  assert.deepEqual(await currentEntries(adapter), []);
});
