import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { FinalizeGithubAdapter } from "../finalize/finalize.ts";
import type { GithubBranch } from "../github/adapter.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import type { GithubIssue } from "../github/issue-discovery.ts";
import { syncManagedIssueEntriesV2 } from "../finalize/issue-journal.ts";
import { cleanupMergedBranches } from "../finalize/recovery.ts";
import {
  appendJournalEntryDigest,
  classifyIssueRootV2,
  classifyPrRootV2,
  issueStateSnapshotV2,
  journalCommentBody,
  managedIssueTitle,
  managedPrTitle,
  parseDecimalId,
  parseRepositoryFullName,
  parseRunRef,
  parseSha,
  parseUtcTimestamp,
  prStateSnapshotV2,
  reduceJournalCommentsV2,
  renderManagedIssueRootV2,
  renderManagedPrRootV2,
  selectFailureScope,
  validateIssueJournalV2,
  validatePrJournalV2,
  type IssueEntryObservation,
  type FullSnapshotV2,
  type PrStateV2,
  type RunRef,
} from "../model/index.ts";
import { reduceIssueEntries } from "../github/issue-reducer.ts";
import {
  appendCommittedPrState,
  loadPrJournal,
  recoverExactPreparedTransition,
  rootOperationId,
  runPreparedTransition,
} from "../publish/pr-journal.ts";
import { appendInitialJournalEntry } from "../publish/initial-journal.ts";

const freshSmokeGeneration = 900_001;
const freshSmokeBranchRef = "refs/heads/automation/skill-updates/g900001";

function digest(parts: readonly string[]): string {
  return `sha256:${createHash("sha256").update(parts.join("\0"), "utf8").digest("hex")}`;
}

export type FreshSmokeInputV2 = Readonly<{
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  run: RunRef;
  defaultBranchRef: string;
  defaultBranchSha: string;
  sourceParentCommit: string;
  sourceCommit: string;
  createdAt: string;
  sourceRelation: "ahead" | "merged";
}>;

export type FreshSmokePreviewV2 = Readonly<{
  schemaVersion: 2;
  kind: "fresh-real-host-smoke-preview";
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  run: RunRef;
  defaultBranchRef: string;
  defaultBranchSha: string;
  sourceParentCommit: string;
  sourceCommit: string;
  createdAt: string;
  sourceRelation: "ahead" | "merged";
  freshPrecondition: Readonly<{
    managedPullRequests: 0;
    managedIssues: 0;
    branchState: "absent";
  }>;
  plan: Readonly<{
    branchRef: string;
    prRootBody: string;
    prInitialState: PrStateV2;
    prAfterAppendState: PrStateV2;
    prFailedState: PrStateV2;
    prReadyState: PrStateV2;
    firstIssueRootBody: string;
    secondIssueRootBody: string;
    commentTemplates: readonly Readonly<{
      resourceKey: "smoke-pr" | "smoke-issue-1" | "smoke-issue-2";
      resourceNumber: "created:smoke-pr" | "created:smoke-issue-1" | "created:smoke-issue-2";
      phase: "prepared" | "committed";
      operation: "root" | "branch-append" | "validation" | "pr-ready";
      snapshot: FullSnapshotV2;
    }>[];
    operations: readonly string[];
  }>;
}>;

type RecoveryResourceV2 = Readonly<{
  number: number;
  state: "open" | "closed";
  bodyDigest: string;
  latestJournalDigest: string | null;
}>;

export type FreshSmokeRecoveryPreviewV2 = Readonly<{
  schemaVersion: 2;
  kind: "fresh-real-host-smoke-recovery-preview";
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  run: RunRef;
  defaultBranchRef: string;
  defaultBranchSha: string;
  sourceParentCommit: string;
  sourceCommit: string;
  createdAt: string;
  sourceRelation: "ahead" | "merged";
  residual: Readonly<{
    branch: Readonly<{ state: "absent" }> | Readonly<{ state: "present"; sha: string }>;
    pullRequests: readonly RecoveryResourceV2[];
    issues: readonly RecoveryResourceV2[];
  }>;
  operations: readonly string[];
}>;

export type FreshSmokeAnyPreviewV2 = FreshSmokePreviewV2 | FreshSmokeRecoveryPreviewV2;

class FreshSmokeResidualError extends Error {
  constructor() {
    super("fresh smoke v1 or managed resource residual makes the normal preview stale; recovery preview required");
  }
}

function normalizeInput(input: FreshSmokeInputV2): FreshSmokeInputV2 {
  const defaultBranchRef = input.defaultBranchRef;
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(defaultBranchRef) || defaultBranchRef.includes("..") ||
    defaultBranchRef.includes("//")) throw new Error("fresh smoke default branch refが不正です");
  const sourceParentCommit = parseSha(input.sourceParentCommit);
  const sourceCommit = parseSha(input.sourceCommit);
  if (sourceParentCommit === sourceCommit) throw new Error("fresh smoke source commitにdistinct parentが必要です");
  return {
    repositoryId: parseDecimalId(input.repositoryId),
    repository: parseRepositoryFullName(input.repository),
    creatorUserId: parseDecimalId(input.creatorUserId),
    run: parseRunRef(input.run),
    defaultBranchRef,
    defaultBranchSha: parseSha(input.defaultBranchSha),
    sourceParentCommit,
    sourceCommit,
    createdAt: parseUtcTimestamp(input.createdAt),
    sourceRelation: input.sourceRelation === "ahead" || input.sourceRelation === "merged"
      ? input.sourceRelation
      : (() => { throw new Error("fresh smoke source relationが不正です"); })(),
  };
}

function managedPrEvidence(title: string, body: string | null, headRef: string): boolean {
  const text = body ?? "";
  return title === managedPrTitle || /^refs\/heads\/automation\/skill-updates\/g[0-9]{6}$/.test(headRef) ||
    text.includes("<!-- skill-update-pr-automation:pr:v1:") ||
    text.includes("<!-- skill-update-pr-automation:pr-root:v2:") ||
    text.includes("<!-- skill-update-automation-smoke:v1");
}

function managedIssueEvidence(title: string, body: string | null): boolean {
  const text = body ?? "";
  return title === managedIssueTitle || text.includes("<!-- skill-update-pr-automation:issue:v1:") ||
    text.includes("<!-- skill-update-pr-automation:issue-root:v2:") ||
    text.includes("<!-- skill-update-automation-smoke:v1");
}

function failureObservation(input: FreshSmokeInputV2, at: string, detail: string): IssueEntryObservation {
  return {
    state: "recovery-required",
    scope: selectFailureScope({ operation: "real-host-smoke" }),
    seen: { run: input.run, at },
    detailDigest: digest(["fresh-smoke-failure", detail]),
    summary: `Fresh schema v2 smoke failure generation ${detail}.`,
  };
}

function smokeObservationAt(input: FreshSmokeInputV2, offsetSeconds: number): string {
  const tenYearsInSeconds = 10n * 365n * 24n * 60n * 60n;
  const sourceOffset = Number(BigInt(`0x${input.sourceCommit.slice(0, 12)}`) % tenYearsInSeconds);
  return new Date(Date.UTC(2020, 0, 1) + (sourceOffset + offsetSeconds) * 1_000).toISOString();
}

function issueRootPlan(input: FreshSmokeInputV2, observation: IssueEntryObservation) {
  const entries = reduceIssueEntries({ currentEntries: [], observations: [observation], resolvedKeys: [] });
  const snapshot = issueStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-issue-state",
    repositoryId: input.repositoryId,
    repository: input.repository,
    entries,
  });
  const rootOperationId = digest([
    "issue-root-v2", input.repositoryId, input.creatorUserId, snapshot.stateDigest,
  ]);
  const body = renderManagedIssueRootV2({
    schemaVersion: 2,
    kind: "managed-issue-root",
    repositoryId: input.repositoryId,
    repository: input.repository,
    creatorUserId: input.creatorUserId,
    rootOperationId,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  }, "Managed automation failures require attention.");
  return { body, snapshot };
}

function previewPlan(input: FreshSmokeInputV2): FreshSmokePreviewV2["plan"] {
  const candidateDigest = digest(["fresh-smoke-candidate", input.sourceCommit]);
  const reportDigest = digest(["fresh-smoke-report", input.sourceCommit]);
  const prInitialState: PrStateV2 = {
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: input.repositoryId,
    repository: input.repository,
    generation: freshSmokeGeneration,
    headRef: freshSmokeBranchRef,
    baseRef: input.defaultBranchRef,
    expectedHeadSha: input.sourceParentCommit,
    validationBaseSha: input.sourceParentCommit,
    candidateDigest,
    reportDigest,
    draft: true,
    validation: { status: "pending", run: input.run },
  };
  const prAfterAppendState: PrStateV2 = { ...prInitialState, expectedHeadSha: input.sourceCommit };
  const prFailedState: PrStateV2 = {
    ...prAfterAppendState,
    validation: { status: "failed", run: input.run, failureKind: "command", command: "fresh-smoke-validation" },
  };
  const prReadyState: PrStateV2 = {
    ...prAfterAppendState,
    draft: false,
    validation: { status: "passed", run: input.run },
  };
  const initialSnapshot = prStateSnapshotV2(prInitialState);
  const prRootBody = renderManagedPrRootV2({
    schemaVersion: 2,
    kind: "managed-pr-root",
    repositoryId: input.repositoryId,
    repository: input.repository,
    creatorUserId: input.creatorUserId,
    generation: freshSmokeGeneration,
    headRef: freshSmokeBranchRef,
    baseRef: input.defaultBranchRef,
    candidateDigest,
    initialSnapshot,
    initialSnapshotDigest: initialSnapshot.stateDigest,
  }, "Fresh schema v2 smoke pull request.");
  const firstAt = smokeObservationAt(input, 0);
  const secondAt = smokeObservationAt(input, 1);
  const firstIssue = issueRootPlan(input, failureObservation(input, firstAt, "one"));
  const secondIssue = issueRootPlan(input, failureObservation(input, secondAt, "two"));
  return {
    branchRef: freshSmokeBranchRef,
    prRootBody,
    prInitialState,
    prAfterAppendState,
    prFailedState,
    prReadyState,
    firstIssueRootBody: firstIssue.body,
    secondIssueRootBody: secondIssue.body,
    commentTemplates: [
      { resourceKey: "smoke-pr", resourceNumber: "created:smoke-pr", phase: "committed", operation: "root",
        snapshot: initialSnapshot },
      { resourceKey: "smoke-pr", resourceNumber: "created:smoke-pr", phase: "prepared", operation: "branch-append",
        snapshot: prStateSnapshotV2(prAfterAppendState) },
      { resourceKey: "smoke-pr", resourceNumber: "created:smoke-pr", phase: "committed", operation: "branch-append",
        snapshot: prStateSnapshotV2(prAfterAppendState) },
      { resourceKey: "smoke-pr", resourceNumber: "created:smoke-pr", phase: "committed", operation: "validation",
        snapshot: prStateSnapshotV2(prFailedState) },
      { resourceKey: "smoke-issue-1", resourceNumber: "created:smoke-issue-1", phase: "committed", operation: "root",
        snapshot: firstIssue.snapshot },
      { resourceKey: "smoke-issue-2", resourceNumber: "created:smoke-issue-2", phase: "committed", operation: "root",
        snapshot: secondIssue.snapshot },
      { resourceKey: "smoke-pr", resourceNumber: "created:smoke-pr", phase: "prepared", operation: "pr-ready",
        snapshot: prStateSnapshotV2(prReadyState) },
      { resourceKey: "smoke-pr", resourceNumber: "created:smoke-pr", phase: "committed", operation: "pr-ready",
        snapshot: prStateSnapshotV2(prReadyState) },
    ],
    operations: [
      "branch-create-absence-cas",
      "pr-create-immutable-root",
      "pr-root-comment",
      "branch-append-prepared",
      "branch-append-exact-lease",
      "branch-append-response-loss-recovery",
      "branch-append-committed",
      "validation-failure-comment",
      "issue-create-immutable-root-and-comment",
      "issue-close-terminal",
      "issue-create-next-generation-root-and-comment",
      "issue-close-terminal",
      "pr-ready-prepared",
      "pr-ready-mutation",
      "pr-ready-committed",
      "operator-merge-checkpoint",
      "independent-cleanup-merged-exact-lease",
    ],
  };
}

export function encodeFreshSmokePreviewV2(preview: FreshSmokeAnyPreviewV2): Buffer {
  return Buffer.from(JSON.stringify(preview), "utf8");
}

export function computeFreshSmokePreviewDigestV2(preview: FreshSmokeAnyPreviewV2): string {
  return `sha256:${createHash("sha256").update(encodeFreshSmokePreviewV2(preview)).digest("hex")}`;
}

export async function buildFreshSmokePreviewV2(
  rawInput: FreshSmokeInputV2,
  adapter: FinalizeGithubAdapter,
): Promise<FreshSmokePreviewV2> {
  const input = normalizeInput(rawInput);
  const [pullRequests, issues, branch, defaultBranch] = await Promise.all([
    adapter.listPullRequests(),
    adapter.listIssues(),
    adapter.readBranch(freshSmokeBranchRef),
    adapter.readBranch(input.defaultBranchRef),
  ]);
  if (!pullRequests.complete || !issues.complete) throw new Error("fresh smoke discovery paginationがincompleteです");
  if (defaultBranch?.sha !== input.defaultBranchSha) throw new Error("fresh smoke default branch SHAが一致しません");
  if (pullRequests.items.some((item) => managedPrEvidence(item.title, item.body, item.headRef)) ||
    issues.items.some((item) => !item.isPullRequest && managedIssueEvidence(item.title, item.body)) || branch !== null) {
    throw new FreshSmokeResidualError();
  }
  if (input.sourceRelation !== "ahead") throw new Error("fresh smoke merged sourceにresidual resourceがありません");
  return {
    schemaVersion: 2,
    kind: "fresh-real-host-smoke-preview",
    ...input,
    freshPrecondition: { managedPullRequests: 0, managedIssues: 0, branchState: "absent" },
    plan: previewPlan(input),
  };
}

function recoveryResource(number: number, state: "open" | "closed", body: string, latest: string | null): RecoveryResourceV2 {
  return { number, state, bodyDigest: digest(["resource-body", body]), latestJournalDigest: latest };
}

function prLiveMatchesState(
  pullRequest: GithubPullRequest,
  branch: GithubBranch | null,
  state: PrStateV2,
): boolean {
  return pullRequest.headSha === state.expectedHeadSha && pullRequest.draft === state.draft &&
    pullRequest.headRepositoryId === state.repositoryId && pullRequest.baseRepositoryId === state.repositoryId &&
    pullRequest.headRef === state.headRef && pullRequest.baseRef === state.baseRef &&
    (branch === null || branch.sha === state.expectedHeadSha);
}

function validateRecoveryPull(
  input: FreshSmokeInputV2,
  pullRequest: GithubPullRequest,
  branch: GithubBranch | null,
): RecoveryResourceV2 {
  const plan = previewPlan(input);
  const root = classifyPrRootV2(pullRequest.body);
  if (root.kind !== "strict" || pullRequest.title !== managedPrTitle || pullRequest.body !== plan.prRootBody ||
    root.root.creatorUserId !== input.creatorUserId || pullRequest.headRepositoryId !== input.repositoryId ||
    pullRequest.baseRepositoryId !== input.repositoryId || pullRequest.headRef !== freshSmokeBranchRef ||
    pullRequest.baseRef !== input.defaultBranchRef ||
    (pullRequest.headSha !== input.sourceParentCommit && pullRequest.headSha !== input.sourceCommit) ||
    (branch !== null && branch.sha !== pullRequest.headSha)) {
    throw new Error("fresh smoke recovery PR identityが不正です");
  }
  const journal = reduceJournalCommentsV2(pullRequest.journalComments ?? [], input.creatorUserId);
  if (journal.entries.length === 0) {
    if (pullRequest.authorUserId !== input.creatorUserId || pullRequest.lastEditedAt !== null ||
      !isDeepStrictEqual(root.root.initialSnapshot, prStateSnapshotV2(plan.prInitialState)) ||
      !prLiveMatchesState(pullRequest, branch, plan.prInitialState)) {
      throw new Error("fresh smoke recovery commentless PR stateが不正です");
    }
  } else {
    const expectedEntries = plan.commentTemplates.filter((item) => item.resourceKey === "smoke-pr");
    if (journal.entries.length > expectedEntries.length || journal.entries.some((entry, index) => {
      const expected = expectedEntries[index];
      return expected === undefined || entry.resourceKind !== "pull-request" ||
        entry.resourceNumber !== pullRequest.prNumber || entry.operation !== expected.operation ||
        entry.phase !== expected.phase || entry.snapshot.stateDigest !== expected.snapshot.stateDigest;
    })) throw new Error("fresh smoke recovery PR journalがplanned prefixと一致しません");
    const states = validatePrJournalV2(root.root, journal);
    const acceptableStates = journal.pending === null ? states.slice(-1) : states.slice(-2);
    if (!acceptableStates.some((state) => prLiveMatchesState(pullRequest, branch, state))) {
      throw new Error("fresh smoke recovery PR journalとlive stateが一致しません");
    }
  }
  return recoveryResource(
    pullRequest.prNumber,
    pullRequest.state,
    pullRequest.body!,
    journal.entries.at(-1)?.digest ?? null,
  );
}

function validateRecoveryIssue(input: FreshSmokeInputV2, issue: GithubIssue): RecoveryResourceV2 {
  const plan = previewPlan(input);
  const root = classifyIssueRootV2(issue.title, issue.body);
  if (root.kind !== "strict" || issue.isPullRequest || issue.title !== managedIssueTitle ||
    (issue.body !== plan.firstIssueRootBody && issue.body !== plan.secondIssueRootBody) ||
    root.root.creatorUserId !== input.creatorUserId || root.root.repositoryId !== input.repositoryId ||
    root.root.repository !== input.repository) {
    throw new Error("fresh smoke recovery Issue identityが不正です");
  }
  const journal = reduceJournalCommentsV2(issue.journalComments ?? [], input.creatorUserId);
  if (journal.entries.length === 0) {
    if (issue.authorUserId !== input.creatorUserId || issue.lastEditedAt !== null) {
      throw new Error("fresh smoke recovery commentless Issue authorまたはbody edit証拠が不正です");
    }
  } else {
    if (journal.entries.length !== 1 || journal.entries[0]!.resourceKind !== "issue" ||
      journal.entries[0]!.resourceNumber !== issue.issueNumber || journal.entries[0]!.operation !== "root" ||
      journal.entries[0]!.phase !== "committed") {
      throw new Error("fresh smoke recovery Issue journalが不正です");
    }
    const states = validateIssueJournalV2(root.root, journal);
    if (states.some((state) => state.entries.length !== 1 || state.entries.some((entry) =>
      entry.scope.kind !== "global" || entry.scope.operation !== "real-host-smoke" ||
      !isDeepStrictEqual(entry.lastSeen.run, input.run)))) {
      throw new Error("fresh smoke recovery Issue stateがrunと一致しません");
    }
  }
  return recoveryResource(issue.issueNumber, issue.state, issue.body!, journal.entries.at(-1)?.digest ?? null);
}

export async function buildFreshSmokeRecoveryPreviewV2(
  rawInput: FreshSmokeInputV2,
  adapter: FinalizeGithubAdapter,
): Promise<FreshSmokeRecoveryPreviewV2> {
  const input = normalizeInput(rawInput);
  const [pullRequests, issues, branch, defaultBranch] = await Promise.all([
    adapter.listPullRequests(), adapter.listIssues(), adapter.readBranch(freshSmokeBranchRef),
    adapter.readBranch(input.defaultBranchRef),
  ]);
  if (!pullRequests.complete || !issues.complete) throw new Error("fresh smoke recovery paginationがincompleteです");
  if (defaultBranch?.sha !== input.defaultBranchSha) throw new Error("fresh smoke recovery default branch SHAが一致しません");
  if (branch !== null && branch.sha !== input.sourceParentCommit && branch.sha !== input.sourceCommit) {
    throw new Error("fresh smoke recovery branch SHAがplanned sourceと一致しません");
  }
  const managedPulls = pullRequests.items.filter((item) => managedPrEvidence(item.title, item.body, item.headRef));
  if (managedPulls.length > 1) throw new Error("fresh smoke recovery PRが一意ではありません");
  const recoveryPulls = managedPulls.map((pullRequest) => validateRecoveryPull(input, pullRequest, branch));
  const managedIssues = issues.items.filter((item) => !item.isPullRequest && managedIssueEvidence(item.title, item.body));
  const recoveryIssues = managedIssues.map((issue) => validateRecoveryIssue(input, issue))
    .sort((left, right) => left.number - right.number);
  if (branch === null && recoveryPulls.length === 0 && recoveryIssues.length === 0) {
    throw new Error("fresh smoke recovery residual resourceがありません");
  }
  return {
    schemaVersion: 2,
    kind: "fresh-real-host-smoke-recovery-preview",
    ...input,
    residual: {
      branch: branch === null ? { state: "absent" } : { state: "present", sha: branch.sha },
      pullRequests: recoveryPulls,
      issues: recoveryIssues,
    },
    operations: [
      ...recoveryIssues.filter((item) => item.state === "open").map((item) => `issue-close:${item.number}`),
      ...recoveryPulls.filter((item) => item.state === "open").map((item) => `pr-close:${item.number}`),
      ...(branch === null ? [] : [`branch-delete-exact-lease:${branch.sha}`]),
    ],
  };
}

function samePreview(left: FreshSmokeAnyPreviewV2, right: FreshSmokeAnyPreviewV2): boolean {
  return computeFreshSmokePreviewDigestV2(left) === computeFreshSmokePreviewDigestV2(right);
}

function sameRecoveryResource(left: RecoveryResourceV2, right: RecoveryResourceV2): boolean {
  return left.number === right.number && left.state === right.state && left.bodyDigest === right.bodyDigest &&
    left.latestJournalDigest === right.latestJournalDigest;
}

async function readRecoveryPull(
  input: FreshSmokeInputV2,
  adapter: FinalizeGithubAdapter,
  number: number,
): Promise<RecoveryResourceV2> {
  const [pullRequest, comments, branch] = await Promise.all([
    adapter.readPullRequest(number),
    adapter.listJournalComments(number),
    adapter.readBranch(freshSmokeBranchRef),
  ]);
  if (pullRequest === null || !comments.complete) throw new Error("fresh smoke recovery PR readがincompleteです");
  return validateRecoveryPull(input, { ...pullRequest, journalComments: comments.items }, branch);
}

async function readRecoveryIssue(
  input: FreshSmokeInputV2,
  adapter: FinalizeGithubAdapter,
  number: number,
): Promise<RecoveryResourceV2> {
  const [issue, comments] = await Promise.all([
    adapter.readIssue(number),
    adapter.listJournalComments(number),
  ]);
  if (issue === null || !comments.complete) throw new Error("fresh smoke recovery Issue readがincompleteです");
  return validateRecoveryIssue(input, { ...issue, journalComments: comments.items });
}

async function findCreatedIssue(
  adapter: FinalizeGithubAdapter,
  expectedBody: string,
  excludedNumber?: number,
) {
  const page = await adapter.listIssues();
  if (!page.complete) throw new Error("fresh smoke issue paginationがincompleteです");
  const matches = page.items.filter((item) => !item.isPullRequest && item.state === "open" &&
    item.issueNumber !== excludedNumber && item.title === managedIssueTitle && item.body === expectedBody);
  if (matches.length !== 1) throw new Error("fresh smoke created issue rootが一意ではありません");
  return matches[0]!;
}

export async function executeFreshSmokePreviewV2(
  preview: FreshSmokePreviewV2,
  adapter: FinalizeGithubAdapter,
  awaitOperatorMerge?: (prNumber: number, checkpointDigest: string) => Promise<string | null>,
): Promise<Readonly<{ prNumber: number; issueNumbers: readonly number[] }>> {
  const fresh = await buildFreshSmokePreviewV2(preview, adapter);
  if (!samePreview(preview, fresh)) throw new Error("fresh smoke previewがstaleです");
  const immutablePrBody = preview.plan.prRootBody;
  await adapter.createBranch({ ref: preview.plan.branchRef, sha: preview.sourceParentCommit });
  const pullRequest = await adapter.createDraftPullRequest({
    headRepositoryId: preview.repositoryId,
    headRef: preview.plan.branchRef,
    headSha: preview.sourceParentCommit,
    baseRepositoryId: preview.repositoryId,
    baseRef: preview.defaultBranchRef,
    title: managedPrTitle,
    body: immutablePrBody,
  });
  const initialSnapshot = prStateSnapshotV2(preview.plan.prInitialState);
  const rootEntry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: pullRequest.prNumber,
    creatorUserId: preview.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: rootOperationId(preview.repositoryId, pullRequest.prNumber, initialSnapshot.stateDigest),
    snapshot: initialSnapshot,
  });
  const [createdPull, createdBranch, createdComments] = await Promise.all([
    adapter.readPullRequest(pullRequest.prNumber),
    adapter.readBranch(preview.plan.branchRef),
    adapter.listJournalComments(pullRequest.prNumber),
  ]);
  const createdJournal = createdComments.complete
    ? reduceJournalCommentsV2(createdComments.items, preview.creatorUserId)
    : null;
  if (createdPull === null || createdPull.state !== "open" || createdPull.merged || !createdPull.draft ||
    createdPull.title !== managedPrTitle || createdPull.body !== immutablePrBody ||
    createdPull.headRepositoryId !== preview.repositoryId || createdPull.baseRepositoryId !== preview.repositoryId ||
    createdPull.headRef !== preview.plan.branchRef || createdPull.baseRef !== preview.defaultBranchRef ||
    createdPull.headSha !== preview.sourceParentCommit || createdBranch?.sha !== preview.sourceParentCommit ||
    createdPull.authorUserId !== preview.creatorUserId || createdPull.lastEditedAt !== null ||
    createdJournal === null || createdJournal.entries.length !== 0) {
    throw new Error("fresh smoke created PR root pre-stateが不正です");
  }
  await appendInitialJournalEntry(adapter, rootEntry);

  let current = await adapter.readPullRequest(pullRequest.prNumber);
  let branch = await adapter.readBranch(preview.plan.branchRef);
  if (current === null || branch === null) throw new Error("fresh smoke PR root post-stateがありません");
  let loaded = await loadPrJournal(adapter, current);
  const responseLoss = new Error("fresh-smoke-synthetic-response-loss");
  try {
    await runPreparedTransition({
      adapter,
      pullRequest: current,
      branch,
      loaded,
      operation: "branch-append",
      after: preview.plan.prAfterAppendState,
      mutate: async () => {
        await adapter.appendBranch({
          ref: preview.plan.branchRef,
          expectedSha: preview.sourceParentCommit,
          candidateSha: preview.sourceCommit,
        });
        throw responseLoss;
      },
    });
    throw new Error("fresh smoke response-loss probeが発火しませんでした");
  } catch (error: unknown) {
    if (error !== responseLoss) throw error;
  }
  current = await adapter.readPullRequest(pullRequest.prNumber);
  branch = await adapter.readBranch(preview.plan.branchRef);
  if (current === null || branch === null) throw new Error("fresh smoke recovery live stateがありません");
  loaded = await loadPrJournal(adapter, current);
  await recoverExactPreparedTransition({
    adapter,
    pullRequest: current,
    branch,
    loaded,
    operation: "branch-append",
    after: preview.plan.prAfterAppendState,
    mutate: () => adapter.appendBranch({
      ref: preview.plan.branchRef,
      expectedSha: preview.sourceParentCommit,
      candidateSha: preview.sourceCommit,
    }),
  });

  current = await adapter.readPullRequest(pullRequest.prNumber);
  branch = await adapter.readBranch(preview.plan.branchRef);
  if (current === null || branch === null) throw new Error("fresh smoke append post-stateがありません");
  loaded = await loadPrJournal(adapter, current);
  await appendCommittedPrState({
    adapter,
    pullRequest: current,
    branch,
    loaded,
    operation: "validation",
    after: preview.plan.prFailedState,
  });

  const firstObservation = failureObservation(preview, smokeObservationAt(preview, 0), "one");
  const firstIssueResult = await syncManagedIssueEntriesV2({
    adapter,
    context: preview,
    observations: [firstObservation],
  });
  if (firstIssueResult !== "created") throw new Error("fresh smoke first issue creationが失敗しました");
  const firstOpen = await findCreatedIssue(adapter, preview.plan.firstIssueRootBody);
  const firstResource = await readRecoveryIssue(preview, adapter, firstOpen.issueNumber);
  if (firstResource.state !== "open") throw new Error("fresh smoke first Issue close pre-stateが不正です");
  const firstComments = await adapter.listJournalComments(firstOpen.issueNumber);
  await adapter.closeIssue(firstOpen.issueNumber);

  const secondIssueResult = await syncManagedIssueEntriesV2({
    adapter,
    context: preview,
    observations: [failureObservation(preview, smokeObservationAt(preview, 1), "two")],
  });
  if (secondIssueResult !== "created") throw new Error("fresh smoke second issue creationが失敗しました");
  const secondOpen = await findCreatedIssue(adapter, preview.plan.secondIssueRootBody, firstOpen.issueNumber);
  const firstPost = await adapter.readIssue(firstOpen.issueNumber);
  const firstPostComments = await adapter.listJournalComments(firstOpen.issueNumber);
  if (firstPost?.state !== "closed" || firstPost.body !== firstOpen.body ||
    JSON.stringify(firstPostComments.items) !== JSON.stringify(firstComments.items)) {
    throw new Error("fresh smoke closed issueが変更されました");
  }
  const secondResource = await readRecoveryIssue(preview, adapter, secondOpen.issueNumber);
  if (secondResource.state !== "open") throw new Error("fresh smoke second Issue close pre-stateが不正です");
  await adapter.closeIssue(secondOpen.issueNumber);

  current = await adapter.readPullRequest(pullRequest.prNumber);
  branch = await adapter.readBranch(preview.plan.branchRef);
  if (current === null || branch === null) throw new Error("fresh smoke ready pre-stateがありません");
  loaded = await loadPrJournal(adapter, current);
  await runPreparedTransition({
    adapter,
    pullRequest: current,
    branch,
    loaded,
    operation: "pr-ready",
    after: preview.plan.prReadyState,
    mutate: () => adapter.updatePullRequest({ prNumber: pullRequest.prNumber, draft: false }),
  });
  const ready = await adapter.readPullRequest(pullRequest.prNumber);
  if (ready?.body !== immutablePrBody || ready.draft) throw new Error("fresh smoke PR ready post-stateが不正です");
  const checkpointDigest = digest([
    "fresh-smoke-operator-merge", computeFreshSmokePreviewDigestV2(preview), String(pullRequest.prNumber), preview.sourceCommit,
  ]);
  if (awaitOperatorMerge === undefined || await awaitOperatorMerge(pullRequest.prNumber, checkpointDigest) !== checkpointDigest) {
    throw new Error(`fresh smoke operator merge checkpoint未完了: ${checkpointDigest}`);
  }
  const merged = await adapter.readPullRequest(pullRequest.prNumber);
  if (merged === null || merged.state !== "closed" || !merged.merged || merged.draft ||
    merged.body !== immutablePrBody || merged.headSha !== preview.sourceCommit) {
    throw new Error("fresh smoke operator merge post-stateが不正です");
  }
  const mergedBranch = await adapter.readBranch(preview.plan.branchRef);
  if (mergedBranch?.sha !== preview.sourceCommit) {
    throw new Error("fresh smoke branchがmerge前に削除されました。fresh repositoryのauto-deleteを無効化してください");
  }
  const guardedCleanup = await cleanupMergedBranches({
    adapter,
    repositoryId: preview.repositoryId,
    repository: preview.repository,
    defaultBranchRef: preview.defaultBranchRef,
    creatorUserId: preview.creatorUserId,
  });
  if (guardedCleanup.kind !== "complete" || guardedCleanup.failedRefs.length !== 0) {
    throw new Error("fresh smoke independent cleanupが失敗しました");
  }
  if (await adapter.readBranch(preview.plan.branchRef) !== null) throw new Error("fresh smoke branch cleanupが未完了です");
  return { prNumber: pullRequest.prNumber, issueNumbers: [firstOpen.issueNumber, secondOpen.issueNumber] };
}

export async function executeFreshSmokeRecoveryPreviewV2(
  preview: FreshSmokeRecoveryPreviewV2,
  adapter: FinalizeGithubAdapter,
): Promise<Readonly<{ pullRequestNumbers: readonly number[]; issueNumbers: readonly number[] }>> {
  const fresh = await buildFreshSmokeRecoveryPreviewV2(preview, adapter);
  if (!samePreview(preview, fresh)) throw new Error("fresh smoke recovery previewがstaleです");
  for (const issue of preview.residual.issues) {
    if (issue.state !== "open") continue;
    const live = await readRecoveryIssue(preview, adapter, issue.number);
    if (!sameRecoveryResource(live, issue)) throw new Error("fresh smoke recovery Issueがstaleです");
    await adapter.closeIssue(issue.number);
  }
  for (const pullRequest of preview.residual.pullRequests) {
    if (pullRequest.state !== "open") continue;
    const live = await readRecoveryPull(preview, adapter, pullRequest.number);
    if (!sameRecoveryResource(live, pullRequest)) throw new Error("fresh smoke recovery PRがstaleです");
    await adapter.closePullRequest(pullRequest.number);
  }
  if (preview.residual.branch.state === "present") {
    const branchBeforeCleanup = await adapter.readBranch(freshSmokeBranchRef);
    if (branchBeforeCleanup?.sha !== preview.residual.branch.sha) {
      throw new Error("fresh smoke recovery branchがstaleです");
    }
    for (const pullRequest of preview.residual.pullRequests) {
      const live = await readRecoveryPull(preview, adapter, pullRequest.number);
      if (live.state !== "closed" || live.bodyDigest !== pullRequest.bodyDigest ||
        live.latestJournalDigest !== pullRequest.latestJournalDigest) {
        throw new Error("fresh smoke recovery PR journalがbranch delete前に変更されました");
      }
    }
    for (const issue of preview.residual.issues) {
      const live = await readRecoveryIssue(preview, adapter, issue.number);
      if (live.state !== "closed" || live.bodyDigest !== issue.bodyDigest ||
        live.latestJournalDigest !== issue.latestJournalDigest) {
        throw new Error("fresh smoke recovery Issue journalがbranch delete前に変更されました");
      }
    }
    const branch = await adapter.readBranch(freshSmokeBranchRef);
    if (branch?.sha !== preview.residual.branch.sha) throw new Error("fresh smoke recovery branchがstaleです");
    await adapter.deleteBranch({ ref: freshSmokeBranchRef, expectedSha: preview.residual.branch.sha });
  }
  if (await adapter.readBranch(freshSmokeBranchRef) !== null) throw new Error("fresh smoke recovery branch cleanupが未完了です");
  return {
    pullRequestNumbers: preview.residual.pullRequests.map((item) => item.number),
    issueNumbers: preview.residual.issues.map((item) => item.number),
  };
}

export async function runFreshSmokeV2(
  input: FreshSmokeInputV2,
  adapter: FinalizeGithubAdapter,
  approve: (preview: FreshSmokeAnyPreviewV2, digest: string) => Promise<string | null>,
  awaitOperatorMerge?: (prNumber: number, checkpointDigest: string) => Promise<string | null>,
): Promise<Readonly<
  | { kind: "not-approved" }
  | { kind: "executed"; prNumber: number; issueNumbers: readonly number[] }
  | { kind: "recovered"; pullRequestNumbers: readonly number[]; issueNumbers: readonly number[] }
>> {
  let preview: FreshSmokeAnyPreviewV2;
  try {
    preview = await buildFreshSmokePreviewV2(input, adapter);
  } catch (error: unknown) {
    if (!(error instanceof FreshSmokeResidualError)) throw error;
    preview = await buildFreshSmokeRecoveryPreviewV2(input, adapter);
  }
  const previewDigest = computeFreshSmokePreviewDigestV2(preview);
  const approval = await approve(preview, previewDigest);
  if (approval !== previewDigest) return { kind: "not-approved" };
  if (preview.kind === "fresh-real-host-smoke-recovery-preview") {
    return { kind: "recovered", ...await executeFreshSmokeRecoveryPreviewV2(preview, adapter) };
  }
  return { kind: "executed", ...await executeFreshSmokePreviewV2(preview, adapter, awaitOperatorMerge) };
}
