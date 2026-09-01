import assert from "node:assert/strict";
import test from "node:test";

import {
  appendJournalEntryDigest,
  journalCommentBody,
  managedPrTitle,
  prStateSnapshotV2,
  renderManagedPrRootV2,
} from "../model/index.ts";
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
const creatorUserId = "456";

function pull(overrides: Partial<GithubPullRequest> = {}, rootCreatorUserId = creatorUserId): GithubPullRequest {
  const merged = overrides.merged ?? true;
  const prNumber = overrides.prNumber ?? 1;
  const headRef = overrides.headRef ?? "refs/heads/automation/skill-updates/g000001";
  const generation = Number(headRef.slice(-6));
  const headSha = overrides.headSha ?? sha("4");
  const snapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repository",
    generation,
    headRef,
    baseRef: "refs/heads/main",
    expectedHeadSha: headSha,
    validationBaseSha: sha("0"),
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    draft: false,
    validation: { status: "passed", run },
  });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: rootCreatorUserId,
    generation,
    headRef,
    baseRef: "refs/heads/main",
    candidateDigest: `sha256:${"1".repeat(64)}`,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: prNumber,
    creatorUserId: root.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot,
  });
  return {
    prNumber,
    state: "closed",
    merged,
    draft: false,
    headRepositoryId: "123",
    headRef,
    headSha,
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: managedPrTitle,
    authorUserId: root.creatorUserId,
    lastEditedAt: null,
    body: renderManagedPrRootV2(root, "fixture"),
    journalComments: [{
      id: "1",
      authorUserId: root.creatorUserId,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body: journalCommentBody(entry),
    }],
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
  assert.equal(await cleanupMergedBranch({ adapter, pullRequest: merged, creatorUserId }), "deleted");
  assert.equal(await cleanupMergedBranch({ adapter, pullRequest: merged, creatorUserId }), "already-clean");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["delete-branch"]);
});

test("guarded cleanup rejects a self-consistent journal from another creator", async () => {
  const merged = pull({}, "999");
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: merged.headRef, sha: merged.headSha }], pullRequests: [merged],
  });
  assert.equal(await cleanupMergedBranch({ adapter, pullRequest: merged, creatorUserId }), "intervention-required");
  assert.equal((await adapter.readBranch(merged.headRef))?.sha, merged.headSha);
  assert.deepEqual(adapter.transcript, []);
});

test("aggregate cleanup stops when a merged journal belongs to another creator", async () => {
  const merged = pull({}, "999");
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: merged.headRef, sha: merged.headSha }], pullRequests: [merged],
  });
  assert.deepEqual(await cleanupMergedBranches({
    adapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
    creatorUserId,
  }), { kind: "stopped", failedRefs: [] });
  assert.equal((await adapter.readBranch(merged.headRef))?.sha, merged.headSha);
  assert.deepEqual(adapter.transcript, []);
});

test("aggregate cleanup ignores an unmanaged human merged PR", async () => {
  const human: GithubPullRequest = {
    prNumber: 99,
    state: "closed",
    merged: true,
    draft: false,
    headRepositoryId: "123",
    headRef: "refs/heads/human/topic",
    headSha: sha("8"),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: "Human change",
    body: "No automation markers.",
    authorUserId: "999",
    lastEditedAt: null,
  };
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: human.headRef, sha: human.headSha }], pullRequests: [human],
  });
  assert.deepEqual(await cleanupMergedBranches({
    adapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
    creatorUserId,
  }), { kind: "complete", failedRefs: [] });
  assert.equal((await adapter.readBranch(human.headRef))?.sha, human.headSha);
  assert.deepEqual(adapter.transcript, []);
});

test("closed-unmerged, human head, and permission denial never count as cleanup success", async () => {
  const unmerged = pull({ merged: false });
  const exactHuman = pull();
  const human = { ...exactHuman, headSha: sha("9") };
  const exact = pull();
  const unmergedAdapter = createFakeGithubAdapter({ branches: [{ ref: unmerged.headRef, sha: unmerged.headSha }], pullRequests: [unmerged] });
  assert.equal(await cleanupMergedBranch({ adapter: unmergedAdapter, pullRequest: unmerged, creatorUserId }), "not-eligible");
  const humanAdapter = createFakeGithubAdapter({ branches: [{ ref: human.headRef, sha: human.headSha }], pullRequests: [human] });
  assert.equal(await cleanupMergedBranch({ adapter: humanAdapter, pullRequest: human, creatorUserId }), "intervention-required");
  const denied = createFakeGithubAdapter({
    branches: [{ ref: exact.headRef, sha: exact.headSha }],
    pullRequests: [exact],
    faults: [{ operation: "delete-branch", kind: "permission-denied" }],
  });
  assert.equal(await cleanupMergedBranch({ adapter: denied, pullRequest: exact, creatorUserId }), "cleanup-failed");
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
    creatorUserId,
  }), { kind: "complete", failedRefs: [merged.headRef] });
  assert.deepEqual(await cleanupMergedBranches({
    adapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
    creatorUserId,
  }), { kind: "complete", failedRefs: [] });
  assert.equal(await adapter.readBranch(merged.headRef), null);
});

test("guarded cleanup stops on PR conflicts and open references", async () => {
  const merged = pull();
  const duplicateGeneration = pull({ prNumber: 2 });
  const conflictAdapter = createFakeGithubAdapter({
    branches: [{ ref: merged.headRef, sha: merged.headSha }],
    pullRequests: [merged, duplicateGeneration],
  });
  assert.deepEqual(await cleanupMergedBranches({
    adapter: conflictAdapter,
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchRef: "refs/heads/main",
    creatorUserId,
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
    creatorUserId,
  }), { kind: "stopped", failedRefs: [] });
  assert.equal((await referenceAdapter.readBranch(merged.headRef))?.sha, merged.headSha);
});
