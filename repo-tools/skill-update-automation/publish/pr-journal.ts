import { createHash } from "node:crypto";

import type { GithubBranch } from "../github/adapter.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import {
  appendJournalEntryDigest,
  classifyPrRootV2,
  decodePrStateSnapshotV2,
  journalCommentBody,
  managedPrTitle,
  prStateSnapshotV2,
  reduceJournalCommentsV2,
  validatePrJournalV2,
  type CandidateUpdateManifest,
  type JournalEntryV2,
  type PrRootV2,
  type PrStateV2,
  type ReducedJournalV2,
} from "../model/index.ts";
import type { PublishDraftContext, PublishDraftGithubAdapter } from "./draft.ts";

export type LoadedPrJournal = Readonly<{
  root: PrRootV2;
  immutableBody: string;
  journal: ReducedJournalV2;
  currentEntry: JournalEntryV2;
  currentState: PrStateV2;
}>;

export type PrTransitionOperation = "branch-append" | "pr-draft" | "pr-ready";

function digest(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function reportDigest(manifest: CandidateUpdateManifest): string {
  const report = manifest.files.find((file) => file.name === "apply-report.json");
  if (report === undefined) throw new Error("candidate apply reportがありません");
  return report.digest;
}

export function pendingPrState(
  manifest: CandidateUpdateManifest,
  context: PublishDraftContext,
  headSha: string,
): PrStateV2 {
  return {
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: context.repositoryId,
    repository: context.repository,
    generation: manifest.target.generation,
    headRef: manifest.target.headRef,
    baseRef: context.defaultBranchRef,
    expectedHeadSha: headSha,
    validationBaseSha: manifest.triggerSha,
    candidateDigest: manifest.candidateDigest,
    reportDigest: reportDigest(manifest),
    draft: true,
    validation: {
      status: "pending",
      run: { workflowRunId: context.workflowRunId, workflowRunAttempt: context.workflowRunAttempt },
    },
  };
}

export function rootOperationId(
  repositoryId: string,
  resourceNumber: number,
  initialSnapshotDigest: string,
): string {
  return digest(Buffer.from(["root", repositoryId, String(resourceNumber), initialSnapshotDigest].join("\0"), "utf8"));
}

function stopReason(kind: string): Error {
  return new Error(`publish-draft stopped: ${kind}`);
}

function sameLiveState(
  state: PrStateV2,
  pullRequest: GithubPullRequest,
  branch: GithubBranch | null,
  immutableBody: string,
): boolean {
  return pullRequest.state === "open" && pullRequest.headSha === state.expectedHeadSha &&
    branch?.sha === state.expectedHeadSha && pullRequest.draft === state.draft && pullRequest.body === immutableBody &&
    pullRequest.title === managedPrTitle && pullRequest.headRepositoryId === state.repositoryId &&
    pullRequest.baseRepositoryId === state.repositoryId && pullRequest.headRef === state.headRef &&
    pullRequest.baseRef === state.baseRef;
}

const maxProjectionObservations = 6;

function compatibleLiveProjection(
  before: PrStateV2,
  after: PrStateV2,
  pullRequest: GithubPullRequest,
  branch: GithubBranch | null,
  immutableBody: string,
): boolean {
  return pullRequest.state === "open" && !pullRequest.merged && branch !== null &&
    pullRequest.body === immutableBody && pullRequest.title === managedPrTitle &&
    pullRequest.headRepositoryId === before.repositoryId && pullRequest.baseRepositoryId === before.repositoryId &&
    pullRequest.headRef === before.headRef && pullRequest.baseRef === before.baseRef &&
    before.repositoryId === after.repositoryId && before.headRef === after.headRef && before.baseRef === after.baseRef &&
    [before.expectedHeadSha, after.expectedHeadSha].includes(pullRequest.headSha) &&
    [before.expectedHeadSha, after.expectedHeadSha].includes(branch.sha) &&
    [before.draft, after.draft].includes(pullRequest.draft);
}

function observesAfterMutation(
  before: PrStateV2,
  after: PrStateV2,
  pullRequest: GithubPullRequest,
  branch: GithubBranch | null,
): boolean {
  return (before.expectedHeadSha !== after.expectedHeadSha &&
      (pullRequest.headSha === after.expectedHeadSha || branch?.sha === after.expectedHeadSha)) ||
    (before.draft !== after.draft && pullRequest.draft === after.draft);
}

async function stabilizeLiveProjection(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  pullRequest: GithubPullRequest;
  branch: GithubBranch | null;
  before: PrStateV2;
  after: PrStateV2;
  immutableBody: string;
  mutationAlreadyObserved: boolean;
  afterBranchAlreadyObserved?: boolean;
}>): Promise<Readonly<{
  kind: "before" | "after";
  pullRequest: GithubPullRequest;
  branch: GithubBranch | null;
  afterBranchObserved: boolean;
}> | null> {
  let pullRequest: GithubPullRequest | null = input.pullRequest;
  let branch = input.branch;
  let mutationObserved = input.mutationAlreadyObserved;
  const branchChanges = input.before.expectedHeadSha !== input.after.expectedHeadSha;
  let afterBranchObserved = input.afterBranchAlreadyObserved === true ||
    (branchChanges && branch?.sha === input.after.expectedHeadSha);
  for (let observation = 0; observation < maxProjectionObservations; observation += 1) {
    if (pullRequest === null) return null;
    if (afterBranchObserved && branch?.sha !== input.after.expectedHeadSha) return null;
    afterBranchObserved ||= branchChanges && branch?.sha === input.after.expectedHeadSha;
    mutationObserved ||= observesAfterMutation(input.before, input.after, pullRequest, branch);
    if (sameLiveState(input.after, pullRequest, branch, input.immutableBody)) {
      return { kind: "after", pullRequest, branch, afterBranchObserved };
    }
    if (!mutationObserved && sameLiveState(input.before, pullRequest, branch, input.immutableBody)) {
      return { kind: "before", pullRequest, branch, afterBranchObserved };
    }
    if (!compatibleLiveProjection(input.before, input.after, pullRequest, branch, input.immutableBody)) return null;
    if (observation + 1 === maxProjectionObservations) return null;
    [pullRequest, branch] = await Promise.all([
      input.adapter.readPullRequest(input.pullRequest.prNumber),
      input.adapter.readBranch(input.pullRequest.headRef),
    ]);
  }
  return null;
}

export function samePrSnapshot(left: PrStateV2, right: PrStateV2): boolean {
  return prStateSnapshotV2(left).stateDigest === prStateSnapshotV2(right).stateDigest;
}

function assertStableState(root: PrRootV2, state: PrStateV2, pullRequest: GithubPullRequest): void {
  if (root.repositoryId !== state.repositoryId || root.repository !== state.repository ||
    root.generation !== state.generation || root.headRef !== state.headRef || root.baseRef !== state.baseRef ||
    state.headRef !== pullRequest.headRef || state.baseRef !== pullRequest.baseRef) {
    throw stopReason("publish-target-changed");
  }
}

export async function loadPrJournal(
  adapter: PublishDraftGithubAdapter,
  pullRequest: GithubPullRequest,
): Promise<LoadedPrJournal> {
  const classification = classifyPrRootV2(pullRequest.body);
  if (classification.kind !== "strict") throw stopReason("publish-target-changed");
  const comments = await adapter.listJournalComments(pullRequest.prNumber);
  if (!comments.complete) throw stopReason("journal-pagination-incomplete");
  const journal = reduceJournalCommentsV2(comments.items, classification.root.creatorUserId);
  const first = journal.entries[0];
  const currentEntry = journal.pending === null ? journal.entries.at(-1) : journal.entries.at(-2);
  if (first === undefined || currentEntry === undefined || first.resourceKind !== "pull-request" ||
    first.resourceNumber !== pullRequest.prNumber || first.snapshot.stateDigest !== classification.root.initialSnapshotDigest) {
    throw stopReason("publish-target-changed");
  }
  const states = validatePrJournalV2(classification.root, journal);
  const currentState = states[journal.pending === null ? states.length - 1 : states.length - 2]!;
  assertStableState(classification.root, currentState, pullRequest);
  return { root: classification.root, immutableBody: pullRequest.body!, journal, currentEntry, currentState };
}

function transitionId(
  resourceNumber: number,
  operation: PrTransitionOperation,
  before: PrStateV2,
  after: PrStateV2,
): string {
  return digest(Buffer.from([
    "transition-v2", String(resourceNumber), operation,
    prStateSnapshotV2(before).stateDigest, prStateSnapshotV2(after).stateDigest,
  ].join("\0"), "utf8"));
}

async function appendCommittedTransition(
  adapter: PublishDraftGithubAdapter,
  resourceNumber: number,
  creatorUserId: string,
  prepared: JournalEntryV2,
): Promise<void> {
  const committed = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber,
    creatorUserId,
    sequence: prepared.sequence + 1,
    previousDigest: prepared.digest,
    phase: "committed",
    operation: prepared.operation,
    operationId: prepared.operationId,
    snapshot: prepared.snapshot,
  });
  await adapter.appendJournalComment(resourceNumber, journalCommentBody(committed));
}

async function assertTerminalPrepared(
  adapter: PublishDraftGithubAdapter,
  root: PrRootV2,
  prepared: JournalEntryV2,
): Promise<void> {
  const comments = await adapter.listJournalComments(prepared.resourceNumber);
  if (!comments.complete) throw stopReason("journal-pagination-incomplete");
  const journal = reduceJournalCommentsV2(comments.items, root.creatorUserId);
  validatePrJournalV2(root, journal);
  if (journal.pending?.digest !== prepared.digest || journal.entries.at(-1)?.digest !== prepared.digest) {
    throw stopReason("journal-race");
  }
}

export async function recoverPreparedTransition(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  manifest: CandidateUpdateManifest;
  context: PublishDraftContext;
  pullRequest: GithubPullRequest;
  branch: GithubBranch | null;
  loaded: LoadedPrJournal;
}>): Promise<void> {
  const prepared = input.loaded.journal.pending;
  if (prepared === null) return;
  if (prepared.operation !== "pr-draft" && prepared.operation !== "branch-append") throw stopReason("recovery-required");
  const after = decodePrStateSnapshotV2(prepared.snapshot);
  const expectedAfter = prepared.operation === "pr-draft"
    ? {
        ...input.loaded.currentState,
        validationBaseSha: input.manifest.triggerSha,
        draft: true as const,
        validation: {
          status: "pending" as const,
          run: { workflowRunId: input.context.workflowRunId, workflowRunAttempt: input.context.workflowRunAttempt },
        },
      }
    : pendingPrState(input.manifest, input.context, input.manifest.candidateSha);
  await recoverExactPreparedTransition({
    adapter: input.adapter,
    pullRequest: input.pullRequest,
    branch: input.branch,
    loaded: input.loaded,
    operation: prepared.operation,
    after: expectedAfter,
    mutate: prepared.operation === "pr-draft"
      ? () => input.adapter.updatePullRequest({ prNumber: input.pullRequest.prNumber, draft: true })
      : () => input.adapter.appendBranch({
          ref: input.pullRequest.headRef,
          expectedSha: input.loaded.currentState.expectedHeadSha,
          candidateSha: after.expectedHeadSha,
        }),
  });
}

export async function recoverExactPreparedTransition(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  pullRequest: GithubPullRequest;
  branch: GithubBranch | null;
  loaded: LoadedPrJournal;
  operation: PrTransitionOperation;
  after: PrStateV2;
  mutate: () => Promise<void>;
}>): Promise<void> {
  const prepared = input.loaded.journal.pending;
  if (prepared === null || prepared.operation !== input.operation || !samePrSnapshot(
    decodePrStateSnapshotV2(prepared.snapshot), input.after,
  ) || prepared.operationId !== transitionId(
    input.pullRequest.prNumber, input.operation, input.loaded.currentState, input.after,
  )) throw stopReason("recovery-required");
  await assertTerminalPrepared(input.adapter, input.loaded.root, prepared);
  const stable = await stabilizeLiveProjection({
    adapter: input.adapter,
    pullRequest: input.pullRequest,
    branch: input.branch,
    before: input.loaded.currentState,
    after: input.after,
    immutableBody: input.loaded.immutableBody,
    mutationAlreadyObserved: false,
  });
  if (stable === null) throw stopReason("recovery-required");
  if (stable.kind === "before") {
    const freshPullRequest = await input.adapter.readPullRequest(input.pullRequest.prNumber);
    const freshBranch = await input.adapter.readBranch(input.pullRequest.headRef);
    if (freshPullRequest === null || !sameLiveState(
      input.loaded.currentState, freshPullRequest, freshBranch, input.loaded.immutableBody,
    )) {
      throw stopReason("recovery-required");
    }
    await assertTerminalPrepared(input.adapter, input.loaded.root, prepared);
    await input.mutate();
  }
  const postPullRequest = await input.adapter.readPullRequest(input.pullRequest.prNumber);
  const postBranch = await input.adapter.readBranch(input.pullRequest.headRef);
  const postStable = postPullRequest === null ? null : await stabilizeLiveProjection({
    adapter: input.adapter,
    pullRequest: postPullRequest,
    branch: postBranch,
    before: input.loaded.currentState,
    after: input.after,
    immutableBody: input.loaded.immutableBody,
    mutationAlreadyObserved: true,
    afterBranchAlreadyObserved: stable.afterBranchObserved,
  });
  if (postStable?.kind !== "after") throw stopReason("recovery-required");
  await assertTerminalPrepared(input.adapter, input.loaded.root, prepared);
  await appendCommittedTransition(input.adapter, input.pullRequest.prNumber, input.loaded.root.creatorUserId, prepared);
}

export async function runPreparedTransition(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  pullRequest: GithubPullRequest;
  branch: GithubBranch | null;
  loaded: LoadedPrJournal;
  operation: PrTransitionOperation;
  after: PrStateV2;
  mutate: () => Promise<void>;
}>): Promise<void> {
  if (input.loaded.journal.pending !== null || !sameLiveState(
    input.loaded.currentState, input.pullRequest, input.branch, input.loaded.immutableBody,
  )) {
    throw stopReason("publish-target-changed");
  }
  const prepared = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: input.pullRequest.prNumber,
    creatorUserId: input.loaded.root.creatorUserId,
    sequence: input.loaded.currentEntry.sequence + 1,
    previousDigest: input.loaded.currentEntry.digest,
    phase: "prepared",
    operation: input.operation,
    operationId: transitionId(input.pullRequest.prNumber, input.operation, input.loaded.currentState, input.after),
    snapshot: prStateSnapshotV2(input.after),
  });
  await input.adapter.appendJournalComment(input.pullRequest.prNumber, journalCommentBody(prepared));
  await assertTerminalPrepared(input.adapter, input.loaded.root, prepared);
  const freshPullRequest = await input.adapter.readPullRequest(input.pullRequest.prNumber);
  const freshBranch = await input.adapter.readBranch(input.pullRequest.headRef);
  if (freshPullRequest === null || !sameLiveState(
    input.loaded.currentState, freshPullRequest, freshBranch, input.loaded.immutableBody,
  )) {
    throw stopReason("publish-target-changed");
  }
  await input.mutate();
  const postPullRequest = await input.adapter.readPullRequest(input.pullRequest.prNumber);
  const postBranch = await input.adapter.readBranch(input.pullRequest.headRef);
  const postStable = postPullRequest === null ? null : await stabilizeLiveProjection({
    adapter: input.adapter,
    pullRequest: postPullRequest,
    branch: postBranch,
    before: input.loaded.currentState,
    after: input.after,
    immutableBody: input.loaded.immutableBody,
    mutationAlreadyObserved: true,
  });
  if (postStable?.kind !== "after") {
    throw stopReason("post-publish-state-unknown");
  }
  await assertTerminalPrepared(input.adapter, input.loaded.root, prepared);
  await appendCommittedTransition(input.adapter, input.pullRequest.prNumber, input.loaded.root.creatorUserId, prepared);
}

export async function appendCommittedPrState(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  pullRequest: GithubPullRequest;
  branch: GithubBranch | null;
  loaded: LoadedPrJournal;
  operation: "validation" | "failure" | "cleanup";
  after: PrStateV2;
}>): Promise<void> {
  if (input.loaded.journal.pending !== null || !sameLiveState(
    input.loaded.currentState, input.pullRequest, input.branch, input.loaded.immutableBody,
  ) ||
    input.after.expectedHeadSha !== input.loaded.currentState.expectedHeadSha || input.after.draft !== input.loaded.currentState.draft) {
    throw stopReason("publish-target-changed");
  }
  const freshPullRequest = await input.adapter.readPullRequest(input.pullRequest.prNumber);
  const freshBranch = await input.adapter.readBranch(input.pullRequest.headRef);
  if (freshPullRequest === null || !sameLiveState(
    input.loaded.currentState, freshPullRequest, freshBranch, input.loaded.immutableBody,
  )) throw stopReason("publish-target-changed");
  const fresh = await loadPrJournal(input.adapter, freshPullRequest);
  if (fresh.currentEntry.digest !== input.loaded.currentEntry.digest || fresh.journal.pending !== null ||
    fresh.root.creatorUserId !== input.loaded.root.creatorUserId) {
    throw stopReason("journal-race");
  }
  const snapshot = prStateSnapshotV2(input.after);
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: input.pullRequest.prNumber,
    creatorUserId: input.loaded.root.creatorUserId,
    sequence: input.loaded.currentEntry.sequence + 1,
    previousDigest: input.loaded.currentEntry.digest,
    phase: "committed",
    operation: input.operation,
    operationId: digest(Buffer.from([
      "pr-state-v2", String(input.pullRequest.prNumber), input.operation,
      input.loaded.currentEntry.digest, snapshot.stateDigest,
    ].join("\0"), "utf8")),
    snapshot,
  });
  await input.adapter.appendJournalComment(input.pullRequest.prNumber, journalCommentBody(entry));
  const postPullRequest = await input.adapter.readPullRequest(input.pullRequest.prNumber);
  const postBranch = await input.adapter.readBranch(input.pullRequest.headRef);
  if (postPullRequest === null || !sameLiveState(input.after, postPullRequest, postBranch, input.loaded.immutableBody)) {
    throw stopReason("post-publish-state-unknown");
  }
  const post = await loadPrJournal(input.adapter, postPullRequest);
  if (post.currentEntry.digest !== entry.digest || post.journal.pending !== null) throw stopReason("journal-race");
}
