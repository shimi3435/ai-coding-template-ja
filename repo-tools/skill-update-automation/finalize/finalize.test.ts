import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  appendJournalEntryDigest,
  classifyIssueRootV2,
  classifyPrRootV2,
  computePrHistoryDigest,
  decodeIssueStateSnapshotV2,
  decodeJournalCommentBodyV2,
  decodePrStateSnapshotV2,
  issueStateSnapshotV2,
  journalCommentBody,
  managedIssueTitle,
  managedPrTitle,
  prStateSnapshotV2,
  reduceJournalCommentsV2,
  renderManagedIssueRootV2,
  renderManagedPrRootV2,
  validateIssueJournalV2,
  type CandidateUpdateManifest,
  type DraftReceipt,
  type ExistingHeadValidationManifest,
  type IssueEntry,
  type ValidationState,
} from "../model/index.ts";
import { createFakeGithubAdapter, GithubAdapterError } from "../github/fake-adapter.ts";
import type { GithubAdapter } from "../github/adapter.ts";
import type { GithubIssue } from "../github/issue-discovery.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import { finalizeManagedPullRequest, syncManagedIssueEntries, type FinalizeGithubAdapter } from "./finalize.ts";

const sha = (digit: string): string => digit.repeat(40);
const digest = (value: string): string => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const run = { workflowRunId: "456", workflowRunAttempt: 1 } as const;
const context = {
  repositoryId: "123",
  repository: "owner/repository",
  defaultBranchSha: sha("0"),
  defaultBranchRef: "refs/heads/main",
  creatorUserId: "456",
  now: () => new Date("2026-08-20T02:00:00.000Z"),
};

function pendingPull(): GithubPullRequest {
  const candidateDigest = `sha256:${"1".repeat(64)}`;
  const state = {
    schemaVersion: 2 as const,
    kind: "managed-pr-state" as const,
    repositoryId: context.repositoryId,
    repository: context.repository,
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: context.defaultBranchRef,
    expectedHeadSha: sha("4"),
    validationBaseSha: sha("0"),
    candidateDigest,
    reportDigest: `sha256:${"2".repeat(64)}`,
    draft: true,
    validation: { status: "pending" as const, run },
  };
  const snapshot = prStateSnapshotV2(state);
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: context.repositoryId,
    repository: context.repository,
    creatorUserId: context.creatorUserId,
    generation: 1,
    headRef: state.headRef,
    baseRef: context.defaultBranchRef,
    candidateDigest,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: context.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot,
  });
  return {
    prNumber: 1,
    state: "open",
    merged: false,
    draft: true,
    headRepositoryId: context.repositoryId,
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: sha("4"),
    baseRepositoryId: context.repositoryId,
    baseRef: context.defaultBranchRef,
    title: managedPrTitle,
    authorUserId: context.creatorUserId,
    lastEditedAt: null,
    body: renderManagedPrRootV2(root, "Pending exact candidate validation."),
    journalComments: [{
      id: "1",
      authorUserId: context.creatorUserId,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body: journalCommentBody(entry),
    }],
  };
}

function latestPrEntry(pull: GithubPullRequest) {
  const entry = decodeJournalCommentBodyV2(pull.journalComments?.at(-1)?.body ?? "");
  if (entry === null) throw new Error("fixture PR journal missing");
  return entry;
}

function withPreparedReady(pull: GithubPullRequest): GithubPullRequest {
  const current = latestPrEntry(pull);
  const before = decodePrStateSnapshotV2(current.snapshot);
  const after = { ...before, draft: false as const, validation: { status: "passed" as const, run } };
  const snapshot = prStateSnapshotV2(after);
  const operationId = digest([
    "transition-v2",
    String(pull.prNumber),
    "pr-ready",
    prStateSnapshotV2(before).stateDigest,
    snapshot.stateDigest,
  ].join("\0"));
  const prepared = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: pull.prNumber,
    creatorUserId: context.creatorUserId,
    sequence: current.sequence + 1,
    previousDigest: current.digest,
    phase: "prepared",
    operation: "pr-ready",
    operationId,
    snapshot,
  });
  return {
    ...pull,
    journalComments: [...(pull.journalComments ?? []), {
      id: "2",
      authorUserId: context.creatorUserId,
      createdAt: "2026-08-27T00:00:01Z",
      updatedAt: "2026-08-27T00:00:01Z",
      body: journalCommentBody(prepared),
    }],
  };
}

function historyDigest(pulls: readonly GithubPullRequest[]): string {
  return computePrHistoryDigest(context.repositoryId, pulls.map((pull) => ({
    prNumber: pull.prNumber,
    state: pull.state,
    merged: pull.merged,
    headRepositoryId: pull.headRepositoryId,
    headRef: pull.headRef,
    headSha: pull.headSha,
    baseRepositoryId: pull.baseRepositoryId,
    baseRef: pull.baseRef,
    titleDigest: digest(pull.title),
    bodyDigest: digest(pull.body ?? ""),
  })));
}

function inputs(pull: GithubPullRequest, validation: ValidationState) {
  const state = decodePrStateSnapshotV2(latestPrEntry(pull).snapshot);
  const manifest: CandidateUpdateManifest = {
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: context.repositoryId,
    repository: context.repository,
    run,
    triggerSha: sha("0"),
    baseHeadSha: sha("3"),
    candidateSha: sha("4"),
    candidateTreeSha: sha("5"),
    target: {
      mode: "update",
      generation: 1,
      prNumber: 1,
      headRef: pull.headRef,
      expectedBranch: { state: "present", sha: sha("3") },
      markerDigest: `sha256:${"9".repeat(64)}`,
      historyDigest: `sha256:${"8".repeat(64)}`,
    },
    candidateDigest: state.candidateDigest,
    createdAt: "2026-08-20T00:00:00.000Z",
    files: [
      { name: "apply-report.json", byteLength: 1, digest: state.reportDigest },
      { name: "candidate.bundle", byteLength: 1, digest: `sha256:${"3".repeat(64)}` },
      { name: "preview-report.json", byteLength: 1, digest: `sha256:${"4".repeat(64)}` },
    ],
  };
  const receipt: DraftReceipt = {
    schemaVersion: 1,
    kind: "published-draft",
    repositoryId: context.repositoryId,
    repository: context.repository,
    run,
    manifestDigest: `sha256:${"6".repeat(64)}`,
    candidateDigest: manifest.candidateDigest,
    generation: 1,
    prNumber: 1,
    headRef: pull.headRef,
    headSha: pull.headSha,
    markerDigest: latestPrEntry(pull).digest,
    historyDigest: historyDigest([pull]),
    createdAt: "2026-08-20T01:00:00.000Z",
  };
  return { manifest, receipt, validation };
}

function issue(number: number, entries: readonly IssueEntry[] = [], creatorUserId = context.creatorUserId): GithubIssue {
  const snapshot = issueStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-issue-state",
    repositoryId: context.repositoryId,
    repository: context.repository,
    entries,
  });
  const rootOperationId = `sha256:${"b".repeat(64)}`;
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-issue-root" as const,
    repositoryId: context.repositoryId,
    repository: context.repository,
    creatorUserId,
    rootOperationId,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "issue",
    resourceNumber: number,
    creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: rootOperationId,
    snapshot,
  });
  return {
    issueNumber: number,
    state: "open",
    title: managedIssueTitle,
    body: renderManagedIssueRootV2(root, "Managed automation failures."),
    isPullRequest: false,
    authorUserId: creatorUserId,
    lastEditedAt: null,
    journalComments: [{
      id: "1",
      authorUserId: creatorUserId,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body: journalCommentBody(entry),
    }],
  };
}

async function issueEntries(adapter: FinalizeGithubAdapter, issueNumber: number): Promise<readonly IssueEntry[]> {
  const current = await adapter.readIssue(issueNumber);
  if (current === null) throw new Error("fixture issue missing");
  const root = classifyIssueRootV2(current.title, current.body);
  if (root.kind !== "strict") throw new Error("fixture issue root invalid");
  const comments = await adapter.listJournalComments(issueNumber);
  const journal = reduceJournalCommentsV2(comments.items, root.root.creatorUserId);
  return validateIssueJournalV2(root.root, journal).at(-1)?.entries ?? [];
}

test("passed exact head becomes ready without issue write", async () => {
  const pull = pendingPull();
  const immutableBody = pull.body;
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(result.kind, "finalized");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), [
    "append-journal-comment", "update-pull-request", "append-journal-comment",
  ]);
  const updated = await adapter.readPullRequest(1);
  assert.equal(updated?.draft, false);
  assert.equal(updated?.body, immutableBody);
  assert.equal(decodePrStateSnapshotV2(latestPrEntry((await adapter.listPullRequests()).items[0]!).snapshot).validation.status, "passed");
});

test("existing-head validation finalizes from manifest identity without a receipt", async () => {
  const pull = pendingPull();
  const updateInput = inputs(pull, { status: "passed", run });
  const manifest: ExistingHeadValidationManifest = {
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: updateInput.manifest.repositoryId,
    repository: updateInput.manifest.repository,
    run,
    triggerSha: updateInput.manifest.triggerSha,
    baseHeadSha: pull.headSha,
    candidateSha: pull.headSha,
    candidateTreeSha: updateInput.manifest.candidateTreeSha,
    target: {
      mode: "validate",
      generation: 1,
      prNumber: 1,
      headRef: pull.headRef,
      expectedBranch: { state: "present", sha: pull.headSha },
      markerDigest: updateInput.receipt.markerDigest,
      historyDigest: updateInput.receipt.historyDigest,
    },
    candidateDigest: updateInput.manifest.candidateDigest,
    createdAt: updateInput.manifest.createdAt,
    files: [{ name: "preview-report.json", byteLength: 1, digest: `sha256:${"4".repeat(64)}` }],
  };
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    manifest,
    validation: { status: "passed", run },
  });
  assert.deepEqual({ kind: result.kind, pr: result.pr }, { kind: "finalized", pr: "ready" });
  assert.equal((await adapter.readPullRequest(1))?.draft, false);
});

test("publish-finalize recovers an unedited commentless PR root and accepts initial append response loss", async () => {
  const original = pendingPull();
  const root = classifyPrRootV2(original.body);
  if (root.kind !== "strict") throw new Error("fixture root expected");
  const commentless = {
    ...original,
    journalComments: [{
      id: "99",
      authorUserId: "999",
      createdAt: "2026-08-28T00:00:00Z",
      updatedAt: "2026-08-28T00:00:00Z",
      body: "human comment",
    }],
  };
  const updateInput = inputs(original, { status: "passed", run });
  const manifest: ExistingHeadValidationManifest = {
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: updateInput.manifest.repositoryId,
    repository: updateInput.manifest.repository,
    run,
    triggerSha: updateInput.manifest.triggerSha,
    baseHeadSha: original.headSha,
    candidateSha: original.headSha,
    candidateTreeSha: updateInput.manifest.candidateTreeSha,
    target: {
      mode: "validate",
      generation: 1,
      prNumber: 1,
      headRef: original.headRef,
      expectedBranch: { state: "present", sha: original.headSha },
      markerDigest: root.root.initialSnapshotDigest,
      historyDigest: historyDigest([commentless]),
    },
    candidateDigest: updateInput.manifest.candidateDigest,
    createdAt: updateInput.manifest.createdAt,
    files: [{ name: "preview-report.json", byteLength: 1, digest: `sha256:${"4".repeat(64)}` }],
  };
  const source = createFakeGithubAdapter({
    branches: [{ ref: original.headRef, sha: original.headSha }],
    pullRequests: [commentless],
  });
  let rootAppendCalls = 0;
  const responseLost = new Proxy(source, {
    get(target, property, receiver) {
      if (property === "appendJournalComment") {
        return async (...args: Parameters<typeof target.appendJournalComment>) => {
          const comment = await target.appendJournalComment(...args);
          if (rootAppendCalls === 0) {
            rootAppendCalls += 1;
            throw new Error("response lost after PR root append");
          }
          return comment;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FinalizeGithubAdapter;

  const result = await finalizeManagedPullRequest({
    adapter: responseLost,
    context,
    manifest,
    validation: { status: "passed", run },
  });
  assert.equal(result.kind, "finalized");
  assert.equal((await source.readPullRequest(1))?.draft, false);
  const comments = await source.listJournalComments(1);
  assert.equal(comments.items.filter((comment) => decodeJournalCommentBodyV2(comment.body)?.operation === "root").length, 1);
});

test("terminal pr-ready prepared recovers from before and after but rejects divergence", async () => {
  const original = pendingPull();
  const finalizeInput = inputs(original, { status: "passed", run });

  const before = withPreparedReady(original);
  const beforeAdapter = createFakeGithubAdapter({
    branches: [{ ref: before.headRef, sha: before.headSha }],
    pullRequests: [before],
  });
  assert.equal((await finalizeManagedPullRequest({ adapter: beforeAdapter, context, ...finalizeInput })).kind, "finalized");
  assert.deepEqual(beforeAdapter.transcript.map((entry) => entry.operation), [
    "update-pull-request", "append-journal-comment",
  ]);

  const after = { ...withPreparedReady(original), draft: false };
  const afterAdapter = createFakeGithubAdapter({
    branches: [{ ref: after.headRef, sha: after.headSha }],
    pullRequests: [after],
  });
  assert.equal((await finalizeManagedPullRequest({ adapter: afterAdapter, context, ...finalizeInput })).kind, "finalized");
  assert.deepEqual(afterAdapter.transcript.map((entry) => entry.operation), ["append-journal-comment"]);

  const divergent = { ...withPreparedReady(original), headSha: sha("9") };
  const divergentAdapter = createFakeGithubAdapter({
    branches: [{ ref: divergent.headRef, sha: divergent.headSha }],
    pullRequests: [divergent],
  });
  assert.match((await finalizeManagedPullRequest({ adapter: divergentAdapter, context, ...finalizeInput })).kind, /conflict|recovery/);
  assert.deepEqual(divergentAdapter.transcript, []);
});

test("foreign-author PR journal marker fails closed before finalize writes", async () => {
  const original = pendingPull();
  const tampered = {
    ...original,
    journalComments: original.journalComments?.map((comment) => ({ ...comment, authorUserId: "999" })),
  };
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: original.headRef, sha: original.headSha }],
    pullRequests: [tampered],
  });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(original, { status: "passed", run }),
  });
  assert.equal(result.kind, "pr-identity-conflict");
  assert.deepEqual(adapter.transcript, []);
});

test("PR body race after prepared entry stops before ready mutation", async () => {
  const pull = pendingPull();
  const baseAdapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull],
  });
  const adapter = new Proxy(baseAdapter, {
    get(target, property, receiver) {
      if (property === "readPullRequest") {
        return async (number: number) => {
          const current = await target.readPullRequest(number);
          return baseAdapter.transcript.some((entry) => entry.operation === "append-journal-comment") && current !== null
            ? { ...current, body: `${current.body}\nexternal edit` }
            : current;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FinalizeGithubAdapter;
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(result.kind, "recovery-required");
  assert.deepEqual(baseAdapter.transcript.map((entry) => entry.operation), ["append-journal-comment"]);
  assert.equal((await baseAdapter.readPullRequest(1))?.draft, true);
});

test("command failure remains draft and creates one deduplicated tracking issue", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const input = inputs(pull, { status: "failed", run, failureKind: "command", command: "uv run --no-sync task check" });
  const first = await finalizeManagedPullRequest({ adapter, context, ...input });
  assert.equal(first.kind, "finalized");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), [
    "append-journal-comment", "create-issue", "append-journal-comment",
  ]);
  const created = (await adapter.listIssues()).items[0]!;
  const before = created.body;
  const retry = await finalizeManagedPullRequest({ adapter, context, ...input });
  assert.equal(retry.kind, "finalized");
  const after = (await adapter.listIssues()).items[0]!;
  assert.equal((await adapter.listIssues()).items.length, 1);
  assert.equal(after.body, before);
  const updated = await adapter.readPullRequest(1);
  assert.equal(updated?.draft, true);
  const current = (await adapter.listPullRequests()).items[0]!;
  assert.equal(decodePrStateSnapshotV2(latestPrEntry(current).snapshot).validation.status, "failed");
  assert.equal((await issueEntries(adapter, created.issueNumber)).length, 1);
});

test("issue identity conflict skips only issue write while safe PR finalize continues", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    issues: [issue(10), issue(11)],
  });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(result.kind, "finalized");
  assert.equal(result.issue, "issue-cardinality-conflict");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), [
    "append-journal-comment", "update-pull-request", "append-journal-comment",
  ]);
});

test("PR partial identity and incomplete PR page stop every write", async () => {
  const pull = pendingPull();
  const partial = { ...pull, body: null };
  for (const adapter of [
    createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [partial] }),
    createFakeGithubAdapter({
      branches: [{ ref: pull.headRef, sha: pull.headSha }],
      pullRequests: [pull],
      faults: [{ operation: "list-pull-requests", kind: "partial-response" }],
    }),
  ]) {
    const result = await finalizeManagedPullRequest({
      adapter,
      context,
      ...inputs(pull, { status: "passed", run }),
    });
    assert.match(result.kind, /conflict|recovery-required/);
    assert.deepEqual(adapter.transcript, []);
  }
});

test("infrastructure failure remains draft and records recovery-required", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "failed", run, failureKind: "infrastructure", stage: "artifact" }),
  });
  assert.deepEqual({ kind: result.kind, pr: result.pr, issue: result.issue }, {
    kind: "finalized",
    pr: "draft",
    issue: "created",
  });
  const created = (await adapter.listIssues()).items[0]!;
  assert.equal((await issueEntries(adapter, created.issueNumber))[0]?.state, "recovery-required");
});

test("partial issue identity and issue human text do not block safe PR lifecycle", async () => {
  const pull = pendingPull();
  const partialAdapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    issues: [{
      issueNumber: 10,
      state: "open",
      title: managedIssueTitle,
      body: null,
      isPullRequest: false,
      authorUserId: context.creatorUserId,
      lastEditedAt: null,
    }],
  });
  const partialResult = await finalizeManagedPullRequest({
    adapter: partialAdapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(partialResult.issue, "issue-identity-conflict");
  assert.equal((await partialAdapter.readPullRequest(1))?.draft, false);

  const secondPull = pendingPull();
  const existing = issue(10);
  const externalBody = `human prefix\n${existing.body}\nhuman suffix`;
  const updateAdapter = createFakeGithubAdapter({
    branches: [{ ref: secondPull.headRef, sha: secondPull.headSha }],
    pullRequests: [secondPull],
    issues: [{ ...existing, body: externalBody }],
  });
  await finalizeManagedPullRequest({
    adapter: updateAdapter,
    context,
    ...inputs(secondPull, { status: "failed", run, failureKind: "command", command: "uv run --no-sync task check" }),
  });
  const updated = await updateAdapter.readIssue(10);
  assert.match(updated?.body ?? "", /^human prefix\n/);
  assert.match(updated?.body ?? "", /\nhuman suffix$/);
});

test("permission denial records issue without retry and response-loss post-state is accepted", async () => {
  const pull = pendingPull();
  const denied = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    faults: [{ operation: "update-pull-request", kind: "permission-denied" }],
  });
  const deniedResult = await finalizeManagedPullRequest({
    adapter: denied,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(deniedResult.kind, "permission-denied");
  assert.deepEqual(deniedResult.permission, {
    operation: "update-pull-request",
    postState: "unchanged",
  });
  assert.deepEqual(denied.transcript.map((entry) => entry.operation), [
    "append-journal-comment", "update-pull-request", "create-issue", "append-journal-comment",
  ]);

  const responseLostBase = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  let lost = false;
  const responseLost = new Proxy(responseLostBase, {
    get(target, property, receiver) {
      if (property === "updatePullRequest") {
        return async (...args: Parameters<GithubAdapter["updatePullRequest"]>) => {
          await target.updatePullRequest(...args);
          if (!lost) {
            lost = true;
            throw new Error("response lost after apply");
          }
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FinalizeGithubAdapter;
  const interrupted = await finalizeManagedPullRequest({
    adapter: responseLost,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(interrupted.kind, "recovery-required");
  const recovered = await finalizeManagedPullRequest({
    adapter: responseLost,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(recovered.kind, "finalized");
  assert.equal((await responseLostBase.readPullRequest(1))?.draft, false);
});

test("unknown permission post-state becomes recovery-required without a later write", async () => {
  const pull = pendingPull();
  const baseAdapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
  });
  const adapter = new Proxy(baseAdapter, {
    get(target, property, receiver) {
      if (property === "updatePullRequest") {
        return async () => {
          throw new GithubAdapterError("permission-denied", "unknown post-state", {
            operation: "update-pull-request",
            postState: "unknown",
          });
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FinalizeGithubAdapter;
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.deepEqual(result, {
    kind: "recovery-required",
    permission: { operation: "update-pull-request", postState: "unknown" },
  });
  assert.deepEqual(baseAdapter.transcript.map((entry) => entry.operation), ["append-journal-comment"]);
});

test("issue permission denial is not retried and lost create response is recovered", async () => {
  const pull = pendingPull();
  const validation = { status: "failed", run, failureKind: "command", command: "uv run --no-sync task check" } as const;
  const denied = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    faults: [{ operation: "create-issue", kind: "permission-denied" }],
  });
  const deniedResult = await finalizeManagedPullRequest({ adapter: denied, context, ...inputs(pull, validation) });
  assert.deepEqual({ kind: deniedResult.kind, issue: deniedResult.issue }, {
    kind: "permission-denied",
    issue: "permission-denied",
  });
  assert.deepEqual(deniedResult.permission, {
    operation: "create-issue",
    postState: "unchanged",
  });
  assert.equal(denied.transcript.filter((entry) => entry.operation === "create-issue").length, 1);

  const responseLostBase = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
  });
  let lost = false;
  let appendLost = false;
  const responseLost = new Proxy(responseLostBase, {
    get(target, property, receiver) {
      if (property === "createIssue") {
        return async (...args: Parameters<GithubAdapter["createIssue"]>) => {
          const created = await target.createIssue(...args);
          if (!lost) {
            lost = true;
            throw new Error("response lost after issue create");
          }
          return created;
        };
      }
      if (property === "appendJournalComment") {
        return async (...args: Parameters<typeof target.appendJournalComment>) => {
          const comment = await target.appendJournalComment(...args);
          if (args[0] !== pull.prNumber && !appendLost) {
            appendLost = true;
            throw new Error("response lost after initial journal append");
          }
          return comment;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FinalizeGithubAdapter;
  const recovered = await finalizeManagedPullRequest({ adapter: responseLost, context, ...inputs(pull, validation) });
  assert.equal(recovered.kind, "finalized");
  assert.equal(recovered.issue, "recovered");
  assert.equal((await responseLostBase.listIssues()).items.length, 1);
  assert.equal(responseLostBase.transcript.filter((entry) => entry.operation === "create-issue").length, 1);
  assert.equal(responseLostBase.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 2);
  assert.equal((await responseLostBase.listJournalComments(2)).items.length, 1);
});

test("cleanup failure is tracked without rolling back a ready PR", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
    cleanupStatus: "failed",
    cleanupFailedRefs: ["refs/heads/automation/skill-updates/g000002"],
  });
  assert.deepEqual({ kind: result.kind, pr: result.pr, issue: result.issue }, {
    kind: "finalized",
    pr: "ready",
    issue: "created",
  });
  assert.equal((await adapter.readPullRequest(1))?.draft, false);
  const created = (await adapter.listIssues()).items[0]!;
  const entries = await issueEntries(adapter, created.issueNumber);
  assert.equal(entries[0]?.state, "cleanup-failed");
  assert.deepEqual(entries[0]?.scope, {
    kind: "resource",
    resourceKind: "branch",
    identity: "refs/heads/automation/skill-updates/g000002",
  });
});

test("closed tracking issue remains immutable and later failure creates a new root", async () => {
  const pull = pendingPull();
  const closed = { ...issue(10), state: "closed" as const };
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    issues: [closed],
  });
  const closedBody = closed.body;
  const closedComments = closed.journalComments;
  const failure = inputs(pull, {
    status: "failed",
    run,
    failureKind: "command",
    command: "uv run --no-sync task check",
  });
  const failed = await finalizeManagedPullRequest({ adapter, context, ...failure });
  assert.equal(failed.issue, "created");
  assert.deepEqual(await adapter.readIssue(10), closed);
  assert.equal((await adapter.readIssue(10))?.body, closedBody);
  assert.deepEqual((await adapter.listJournalComments(10)).items, closedComments);
  const issues = (await adapter.listIssues()).items;
  assert.equal(issues.length, 2);
  assert.equal(issues.find((item) => item.issueNumber !== 10)?.state, "open");
  assert.equal(adapter.transcript.some((entry) => String(entry.operation) === "reopen-issue"), false);
  assert.equal(adapter.transcript.some((entry) => String(entry.operation) === "update-issue"), false);
});

test("issue closed at final read boundary receives no append and triggers one new root", async () => {
  const current = issue(10);
  const baseAdapter = createFakeGithubAdapter({ issues: [current] });
  let reads = 0;
  const adapter = new Proxy(baseAdapter, {
    get(target, property, receiver) {
      if (property === "readIssue") {
        return async (number: number) => {
          reads += 1;
          if (number === current.issueNumber && reads === 3) await target.closeIssue(number);
          return await target.readIssue(number);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FinalizeGithubAdapter;
  const result = await syncManagedIssueEntries({
    adapter,
    context,
    observations: [{
      state: "validation-failed",
      scope: { kind: "candidate", digest: `sha256:${"1".repeat(64)}` },
      seen: { run, at: "2026-08-27T00:00:00.000Z" },
      detailDigest: `sha256:${"2".repeat(64)}`,
      summary: "failure",
    }],
  });
  assert.equal(result, "created");
  assert.equal((await baseAdapter.readIssue(10))?.state, "closed");
  assert.equal((await baseAdapter.listJournalComments(10)).items.length, 1);
  const next = (await baseAdapter.listIssues()).items.find((item) => item.issueNumber !== 10);
  assert.equal(next?.state, "open");
  assert.equal((await baseAdapter.listJournalComments(next!.issueNumber)).items.length, 1);
});

test("issue root body race stops before journal append", async () => {
  const current = issue(10);
  const baseAdapter = createFakeGithubAdapter({ issues: [current] });
  const adapter = new Proxy(baseAdapter, {
    get(target, property, receiver) {
      if (property === "readIssue") {
        return async () => ({ ...current, body: `${current.body}\nexternal edit` });
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FinalizeGithubAdapter;
  const result = await syncManagedIssueEntries({
    adapter,
    context,
    observations: [{
      state: "validation-failed",
      scope: { kind: "candidate", digest: `sha256:${"1".repeat(64)}` },
      seen: { run, at: "2026-08-27T00:00:00.000Z" },
      detailDigest: `sha256:${"2".repeat(64)}`,
      summary: "failure",
    }],
  });
  assert.equal(result, "issue-identity-conflict");
  assert.deepEqual(baseAdapter.transcript, []);
});

test("self-consistent issue journal from another creator stops before append", async () => {
  const current = issue(10, [], "999");
  const adapter = createFakeGithubAdapter({ issues: [current] });
  const result = await syncManagedIssueEntries({
    adapter,
    context,
    observations: [{
      state: "validation-failed",
      scope: { kind: "candidate", digest: `sha256:${"1".repeat(64)}` },
      seen: { run, at: "2026-08-27T00:00:00.000Z" },
      detailDigest: `sha256:${"2".repeat(64)}`,
      summary: "failure",
    }],
  });
  assert.equal(result, "issue-identity-conflict");
  assert.deepEqual(adapter.transcript, []);
});
