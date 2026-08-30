import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { discoverCandidateHistory } from "../candidate/index.ts";
import type { GithubAdapter, GithubPermissionEvidence, JournalGithubAdapter } from "../github/adapter.ts";
import {
  appendJournalEntryDigest,
  classifyPrRootV2,
  computeIssueEntryKey,
  decodePrStateSnapshotV2,
  reduceJournalCommentsV2,
  selectFailureScope,
  type ArtifactManifest,
  type DraftReceipt,
  type FailureState,
  type IssueEntry,
  type IssueEntryObservation,
  type PrStateV2,
  type ValidationState,
} from "../model/index.ts";
import { syncManagedIssueEntriesV2, type IssueJournalAdapter } from "./issue-journal.ts";
import {
  appendCommittedPrState,
  loadPrJournal,
  recoverExactPreparedTransition,
  runPreparedTransition,
  samePrSnapshot,
  rootOperationId,
} from "../publish/pr-journal.ts";
import { appendInitialJournalEntry } from "../publish/initial-journal.ts";

export type FinalizeContext = Readonly<{
  repositoryId: string;
  repository: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  creatorUserId: string;
  now: () => Date;
}>;

export type FinalizeResult = Readonly<{
  kind: "finalized" | "pr-identity-conflict" | "intervention-required" | "recovery-required" | "permission-denied";
  pr?: "ready" | "draft";
  issue?: string;
  permission?: GithubPermissionEvidence;
}>;

export type FinalizeGithubAdapter = GithubAdapter & JournalGithubAdapter;

function detailDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function permissionEvidence(error: unknown): GithubPermissionEvidence | null {
  if (!(error instanceof Error) || !("kind" in error) || error.kind !== "permission-denied" ||
    !("operation" in error) || typeof error.operation !== "string" || !("postState" in error) ||
    (error.postState !== "unchanged" && error.postState !== "applied" && error.postState !== "unknown")) return null;
  return { operation: error.operation as GithubPermissionEvidence["operation"], postState: error.postState };
}

function isPermissionDenied(error: unknown): boolean {
  return permissionEvidence(error) !== null;
}

async function recoverIssueWrite(operation: () => Promise<string>): Promise<string> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (isPermissionDenied(error)) throw error;
    try {
      return await operation();
    } catch (retryError: unknown) {
      if (isPermissionDenied(retryError)) throw retryError;
      return "recovery-required";
    }
  }
}

function closedValidation(value: ValidationState): Exclude<ValidationState, { status: "pending" }> {
  if (value.status === "pending") throw new Error("finalizeにはclosed validation resultが必要です");
  return value;
}

function validationFailureState(validation: Exclude<ValidationState, { status: "pending" }>): FailureState | null {
  if (validation.status === "passed") return null;
  return validation.failureKind === "command" ? "validation-failed" : "recovery-required";
}

function issueObservation(
  state: FailureState,
  candidateDigest: string,
  validation: Exclude<ValidationState, { status: "pending" }>,
  now: Date,
): IssueEntryObservation {
  const summary = state === "validation-failed"
    ? `Candidate validation command failed: ${validation.status === "failed" && validation.failureKind === "command" ? validation.command : "unknown"}`
    : "Candidate validation infrastructure failed; recovery is required.";
  return {
    state,
    scope: selectFailureScope({ candidateDigest, operation: "publish-finalize" }),
    seen: { run: validation.run, at: now.toISOString() },
    detailDigest: detailDigest(validation),
    summary,
  };
}

export async function syncManagedIssueEntries(input: Readonly<{
  adapter: IssueJournalAdapter;
  context: Pick<FinalizeContext, "repositoryId" | "repository" | "creatorUserId">;
  observations: readonly IssueEntryObservation[];
  resolvedKeys?: readonly string[];
  resolveCurrent?: (entries: readonly IssueEntry[]) => readonly string[];
}>): Promise<string> {
  return await syncManagedIssueEntriesV2(input);
}

async function syncIssue(input: Readonly<{
  adapter: FinalizeGithubAdapter;
  context: FinalizeContext;
  candidateDigest: string;
  validation: Exclude<ValidationState, { status: "pending" }>;
}>): Promise<string> {
  const scope = selectFailureScope({ candidateDigest: input.candidateDigest, operation: "publish-finalize" });
  const resolvedKeys = [
    computeIssueEntryKey("validation-failed", scope),
    computeIssueEntryKey("recovery-required", scope),
  ];
  const failureState = validationFailureState(input.validation);
  const observations = failureState === null
    ? []
    : [issueObservation(failureState, input.candidateDigest, input.validation, input.context.now())];
  return await syncManagedIssueEntries({
    adapter: input.adapter,
    context: input.context,
    observations,
    resolvedKeys: failureState === null ? resolvedKeys : [],
  });
}

async function syncCleanupIssue(input: Readonly<{
  adapter: FinalizeGithubAdapter;
  context: FinalizeContext;
  run: Exclude<ValidationState, { status: "pending" }>["run"];
  status: "passed" | "failed";
  failedRefs: readonly string[];
}>): Promise<string> {
  const scopes = input.status === "failed"
    ? input.failedRefs.length === 0
      ? [selectFailureScope({ operation: "cleanup" })]
      : input.failedRefs.map((identity) => selectFailureScope({
        resource: { resourceKind: "branch", identity },
        operation: "cleanup",
      }))
    : [];
  const observations: IssueEntryObservation[] = scopes.map((scope) => ({
    state: "cleanup-failed",
    scope,
    seen: { run: input.run, at: input.context.now().toISOString() },
    detailDigest: detailDigest({ status: input.status, scope }),
    summary: scope.kind === "resource"
      ? `Guarded cleanup failed for ${scope.identity}.`
      : "One or more guarded merged-branch cleanup operations failed.",
  }));
  const observedKeys = new Set(observations.map((observation) => computeIssueEntryKey(observation.state, observation.scope)));
  return await syncManagedIssueEntries({
    adapter: input.adapter,
    context: input.context,
    observations,
    resolveCurrent: (currentEntries) => currentEntries
      .filter((entry) => entry.state === "cleanup-failed" && !observedKeys.has(entry.key))
      .map((entry) => entry.key),
  });
}

type FinalizeManifest = Extract<ArtifactManifest, { kind: "candidate-update" | "existing-head-validation" }>;

function targetIdentity(
  manifest: FinalizeManifest,
  receipt: DraftReceipt | undefined,
): Readonly<{
  generation: number;
  prNumber: number;
  headRef: string;
  headSha: string;
  markerDigest: string;
  historyDigest: string;
}> {
  if (manifest.kind === "candidate-update") {
    if (receipt === undefined) throw new Error("candidate-update finalizeにはDraftReceiptが必要です");
    if (
      receipt.repositoryId !== manifest.repositoryId || receipt.repository !== manifest.repository ||
      !isDeepStrictEqual(receipt.run, manifest.run) || receipt.candidateDigest !== manifest.candidateDigest ||
      receipt.generation !== manifest.target.generation || receipt.headRef !== manifest.target.headRef ||
      receipt.headSha !== manifest.candidateSha ||
      (manifest.target.mode === "update" && receipt.prNumber !== manifest.target.prNumber)
    ) throw new Error("DraftReceiptがcandidate manifestと一致しません");
    return receipt;
  }
  if (receipt !== undefined) throw new Error("existing-head-validationはDraftReceiptを受け取りません");
  return {
    generation: manifest.target.generation,
    prNumber: manifest.target.prNumber,
    headRef: manifest.target.headRef,
    headSha: manifest.candidateSha,
    markerDigest: manifest.target.markerDigest,
    historyDigest: manifest.target.historyDigest,
  };
}

export async function finalizeManagedPullRequest(input: Readonly<{
  adapter: FinalizeGithubAdapter;
  context: FinalizeContext;
  manifest: FinalizeManifest;
  receipt?: DraftReceipt;
  validation: ValidationState;
  cleanupStatus?: "passed" | "failed";
  cleanupFailedRefs?: readonly string[];
}>): Promise<FinalizeResult> {
  const validation = closedValidation(input.validation);
  if (!isDeepStrictEqual(validation.run, input.manifest.run)) throw new Error("validation runがmanifestと一致しません");
  const target = targetIdentity(input.manifest, input.receipt);
  const page = await input.adapter.listPullRequests();
  let discovery;
  try {
    discovery = discoverCandidateHistory({ complete: page.complete, pages: [page.items] }, {
      repositoryId: input.context.repositoryId,
      repository: input.context.repository,
      defaultBranchSha: input.context.defaultBranchSha,
      defaultBranchRef: input.context.defaultBranchRef,
      resumeClosed: false,
      allowPendingRecovery: true,
    });
  } catch {
    return { kind: "pr-identity-conflict" };
  }
  if (discovery.open?.prNumber !== target.prNumber || discovery.historyDigest !== target.historyDigest) {
    return { kind: "recovery-required" };
  }
  let current = await input.adapter.readPullRequest(target.prNumber);
  let branch = await input.adapter.readBranch(target.headRef);
  if (current === null || branch === null) return { kind: "recovery-required" };
  const immutableBody = current.body;
  const rootClassification = classifyPrRootV2(current.body);
  const initialComments = await input.adapter.listJournalComments(target.prNumber);
  let semanticCommentless = false;
  if (rootClassification.kind === "strict" && initialComments.complete) {
    try {
      semanticCommentless = reduceJournalCommentsV2(
        initialComments.items,
        rootClassification.root.creatorUserId,
      ).entries.length === 0;
    } catch {
      return { kind: "pr-identity-conflict" };
    }
  }
  if (rootClassification.kind === "strict" && semanticCommentless) {
    const root = rootClassification.root;
    let initialState: PrStateV2;
    try {
      initialState = decodePrStateSnapshotV2(root.initialSnapshot);
    } catch {
      return { kind: "pr-identity-conflict" };
    }
    if (target.markerDigest !== root.initialSnapshotDigest || root.creatorUserId !== input.context.creatorUserId ||
      current.authorUserId !== root.creatorUserId || current.lastEditedAt !== null || current.state !== "open" ||
      current.merged || !current.draft || current.headSha !== initialState.expectedHeadSha ||
      branch.sha !== initialState.expectedHeadSha || current.headRef !== initialState.headRef ||
      current.baseRef !== initialState.baseRef || initialState.candidateDigest !== input.manifest.candidateDigest) {
      return { kind: "pr-identity-conflict" };
    }
    const rootEntry = appendJournalEntryDigest({
      schemaVersion: 2,
      resourceKind: "pull-request",
      resourceNumber: target.prNumber,
      creatorUserId: root.creatorUserId,
      sequence: 1,
      previousDigest: null,
      phase: "committed",
      operation: "root",
      operationId: rootOperationId(root.repositoryId, target.prNumber, root.initialSnapshotDigest),
      snapshot: root.initialSnapshot,
    });
    try {
      await appendInitialJournalEntry(input.adapter, rootEntry);
    } catch {
      return { kind: "recovery-required" };
    }
  }
  let loaded;
  try {
    loaded = await loadPrJournal(input.adapter, current);
  } catch {
    return { kind: "pr-identity-conflict" };
  }
  if (loaded.root.creatorUserId !== input.context.creatorUserId) return { kind: "pr-identity-conflict" };
  const targetEntry = loaded.journal.entries.find((entry) => entry.digest === target.markerDigest) ??
    (target.markerDigest === loaded.root.initialSnapshotDigest ? loaded.journal.entries[0] : undefined);
  if (targetEntry === undefined) return { kind: "recovery-required" };
  let targetState: PrStateV2;
  try {
    targetState = decodePrStateSnapshotV2(targetEntry.snapshot);
  } catch {
    return { kind: "recovery-required" };
  }
  if (targetState.expectedHeadSha !== target.headSha ||
    targetState.candidateDigest !== input.manifest.candidateDigest) return { kind: "recovery-required" };
  const desiredDraft = validation.status !== "passed";
  const desiredState: PrStateV2 = { ...targetState, draft: desiredDraft, validation };
  if (loaded.currentEntry.digest !== targetEntry.digest && !samePrSnapshot(loaded.currentState, desiredState)) {
    return { kind: "recovery-required" };
  }

  try {
    if (loaded.journal.pending !== null) {
      if (validation.status !== "passed") return { kind: "recovery-required" };
      await recoverExactPreparedTransition({
        adapter: input.adapter,
        pullRequest: current,
        branch,
        loaded,
        operation: "pr-ready",
        after: desiredState,
        mutate: () => input.adapter.updatePullRequest({ prNumber: target.prNumber, draft: false }),
      });
      current = await input.adapter.readPullRequest(target.prNumber);
      branch = await input.adapter.readBranch(target.headRef);
      if (current === null || branch === null) return { kind: "recovery-required" };
      loaded = await loadPrJournal(input.adapter, current);
    }
    if (!samePrSnapshot(loaded.currentState, desiredState)) {
      if (validation.status === "passed") {
        await runPreparedTransition({
          adapter: input.adapter,
          pullRequest: current,
          branch,
          loaded,
          operation: "pr-ready",
          after: desiredState,
          mutate: () => input.adapter.updatePullRequest({ prNumber: target.prNumber, draft: false }),
        });
      } else {
        await appendCommittedPrState({
          adapter: input.adapter,
          pullRequest: current,
          branch,
          loaded,
          operation: "validation",
          after: desiredState,
        });
      }
    }
  } catch (error: unknown) {
    const permission = permissionEvidence(error);
    if (permission === null) return { kind: "recovery-required" };
    if (permission.postState === "unknown") return { kind: "recovery-required", permission };
    let issue: string;
    try {
      issue = await syncIssue({
        adapter: input.adapter,
        context: input.context,
        candidateDigest: input.manifest.candidateDigest,
        validation: {
          status: "failed",
          run: validation.run,
          failureKind: "infrastructure",
          stage: "unknown",
        },
      });
    } catch {
      issue = "recovery-required";
    }
    return { kind: "permission-denied", issue, permission };
  }
  const post = await input.adapter.readPullRequest(target.prNumber);
  const postBranch = await input.adapter.readBranch(target.headRef);
  if (post === null || postBranch?.sha !== target.headSha || post.body !== immutableBody || post.draft !== desiredDraft) {
    return { kind: "recovery-required" };
  }
  let postLoaded;
  try {
    postLoaded = await loadPrJournal(input.adapter, post);
  } catch {
    return { kind: "recovery-required" };
  }
  if (postLoaded.journal.pending !== null || !samePrSnapshot(postLoaded.currentState, desiredState)) {
    return { kind: "recovery-required" };
  }
  let issue: string;
  try {
    issue = await recoverIssueWrite(() => syncIssue({
      adapter: input.adapter,
      context: input.context,
      candidateDigest: input.manifest.candidateDigest,
      validation,
    }));
  } catch (error: unknown) {
    const permission = permissionEvidence(error);
    if (permission !== null) {
      if (permission.postState === "unknown") return { kind: "recovery-required", permission };
      return { kind: "permission-denied", pr: desiredDraft ? "draft" : "ready", issue: "permission-denied", permission };
    }
    throw error;
  }
  if (input.cleanupStatus !== undefined) {
    let cleanupIssue: string;
    try {
      cleanupIssue = await recoverIssueWrite(() => syncCleanupIssue({
        adapter: input.adapter,
        context: input.context,
        run: validation.run,
        status: input.cleanupStatus!,
        failedRefs: input.cleanupFailedRefs ?? [],
      }));
    } catch (error: unknown) {
      const permission = permissionEvidence(error);
      if (permission !== null) {
        if (permission.postState === "unknown") return { kind: "recovery-required", permission };
        return { kind: "permission-denied", pr: desiredDraft ? "draft" : "ready", issue: "permission-denied", permission };
      }
      throw error;
    }
    if (cleanupIssue !== "none" && cleanupIssue !== "unchanged") issue = cleanupIssue;
  }
  return { kind: "finalized", pr: desiredDraft ? "draft" : "ready", issue };
}
