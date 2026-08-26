import assert from "node:assert/strict";
import test from "node:test";

import { managedPrTitle, renderManagedPrSection } from "../model/index.ts";
import { createFakeGithubAdapter } from "../github/fake-adapter.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import {
  classifyPendingValidation,
  cleanupMergedBranch,
  cleanupMergedBranches,
  readWorkflowRunObservation,
} from "./recovery.ts";

const sha = (digit: string): string => digit.repeat(40);
const run = { workflowRunId: "456", workflowRunAttempt: 1 } as const;

function pull(overrides: Partial<GithubPullRequest> = {}): GithubPullRequest {
  const merged = overrides.merged ?? true;
  return {
    prNumber: 1,
    state: "closed",
    merged,
    draft: false,
    headRepositoryId: "123",
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: sha("4"),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: managedPrTitle,
    body: renderManagedPrSection({
      schemaVersion: 1,
      kind: "managed-pr",
      repositoryId: "123",
      repository: "owner/repository",
      generation: 1,
      headRef: "refs/heads/automation/skill-updates/g000001",
      baseRef: "refs/heads/main",
      expectedHeadSha: sha("4"),
      validationBaseSha: sha("0"),
      candidateDigest: `sha256:${"1".repeat(64)}`,
      reportDigest: `sha256:${"2".repeat(64)}`,
      validation: { status: "passed", run },
    }, "fixture"),
    ...overrides,
  };
}

test("active pending stays pending while completed pending requires recovery", () => {
  assert.equal(classifyPendingValidation({ status: "pending", run }, { status: "requested", run }), "active");
  assert.equal(classifyPendingValidation({ status: "pending", run }, { status: "waiting", run }), "active");
  assert.equal(classifyPendingValidation({ status: "pending", run }, { status: "pending", run }), "active");
  assert.equal(classifyPendingValidation({ status: "pending", run }, { status: "in_progress", run }), "active");
  assert.equal(classifyPendingValidation({ status: "pending", run }, { status: "queued", run }), "active");
  assert.equal(classifyPendingValidation({ status: "pending", run }, { status: "completed", run }), "recovery-required");
  assert.equal(classifyPendingValidation({ status: "passed", run }, { status: "completed", run }), "closed");
  assert.throws(() => classifyPendingValidation(
    { status: "pending", run },
    { status: "completed", run: { workflowRunId: "999", workflowRunAttempt: 1 } },
  ), /run/);
});

test("workflow run adapter binds repository, run ID, attempt, and closed status", async () => {
  const calls: string[][] = [];
  const observation = await readWorkflowRunObservation("owner/repository", run, async (args) => {
    calls.push([...args]);
    return {
      exitCode: 0,
      stdout: JSON.stringify({ id: 456, run_attempt: 1, status: "completed" }),
      stderr: "",
    };
  });
  assert.deepEqual(calls, [[
    "api", "--method", "GET", "repos/owner/repository/actions/runs/456/attempts/1",
  ]]);
  assert.deepEqual(observation, { status: "completed", run });
  await assert.rejects(() => readWorkflowRunObservation("owner/repository", run, async () => ({
    exitCode: 0,
    stdout: JSON.stringify({ id: 456, run_attempt: 2, status: "completed" }),
    stderr: "",
  })), /identity/);
});

test("guarded cleanup deletes only exact merged branch and is idempotent", async () => {
  const merged = pull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: merged.headRef, sha: merged.headSha }], pullRequests: [merged] });
  assert.equal(await cleanupMergedBranch({ adapter, pullRequest: merged }), "deleted");
  assert.equal(await cleanupMergedBranch({ adapter, pullRequest: merged }), "already-clean");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["delete-branch"]);
});

test("closed-unmerged, human head, and permission denial never count as cleanup success", async () => {
  const unmerged = pull({ merged: false });
  const human = pull({ headSha: sha("9") });
  const exact = pull();
  const unmergedAdapter = createFakeGithubAdapter({ branches: [{ ref: unmerged.headRef, sha: unmerged.headSha }], pullRequests: [unmerged] });
  assert.equal(await cleanupMergedBranch({ adapter: unmergedAdapter, pullRequest: unmerged }), "not-eligible");
  const humanAdapter = createFakeGithubAdapter({ branches: [{ ref: human.headRef, sha: human.headSha }], pullRequests: [human] });
  assert.equal(await cleanupMergedBranch({ adapter: humanAdapter, pullRequest: human }), "intervention-required");
  const denied = createFakeGithubAdapter({
    branches: [{ ref: exact.headRef, sha: exact.headSha }],
    pullRequests: [exact],
    faults: [{ operation: "delete-branch", kind: "permission-denied" }],
  });
  assert.equal(await cleanupMergedBranch({ adapter: denied, pullRequest: exact }), "cleanup-failed");
  assert.equal((await denied.readBranch(exact.headRef))?.sha, exact.headSha);
});

test("failed guarded cleanup can be retried idempotently", async () => {
  const merged = pull();
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: merged.headRef, sha: merged.headSha }],
    pullRequests: [merged],
    faults: [{ operation: "delete-branch", kind: "permission-denied" }],
  });
  assert.deepEqual(await cleanupMergedBranches({
    adapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
  }), { kind: "complete", failedRefs: [merged.headRef] });
  assert.deepEqual(await cleanupMergedBranches({
    adapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
  }), { kind: "complete", failedRefs: [] });
  assert.equal(await adapter.readBranch(merged.headRef), null);
});

test("guarded cleanup stops on PR conflicts and open references", async () => {
  const merged = pull();
  const duplicateGeneration = pull({ prNumber: 2, headRef: "refs/heads/automation/skill-updates/g000002" });
  const conflictAdapter = createFakeGithubAdapter({
    branches: [{ ref: merged.headRef, sha: merged.headSha }],
    pullRequests: [merged, duplicateGeneration],
  });
  assert.deepEqual(await cleanupMergedBranches({
    adapter: conflictAdapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
  }), { kind: "stopped", failedRefs: [] });
  assert.equal((await conflictAdapter.readBranch(merged.headRef))?.sha, merged.headSha);

  const openReference = pull({ prNumber: 3, state: "open", merged: false });
  const referenceAdapter = createFakeGithubAdapter({
    branches: [{ ref: merged.headRef, sha: merged.headSha }],
    pullRequests: [merged, openReference],
  });
  assert.deepEqual(await cleanupMergedBranches({
    adapter: referenceAdapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
  }), { kind: "stopped", failedRefs: [] });
  assert.equal((await referenceAdapter.readBranch(merged.headRef))?.sha, merged.headSha);
});
