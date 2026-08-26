import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { discoverCandidateHistory } from "../candidate/index.ts";
import type { GithubAdapter, GithubPermissionEvidence } from "../github/adapter.ts";
import { discoverManagedIssue } from "../github/issue-discovery.ts";
import { reduceIssueEntries } from "../github/issue-reducer.ts";
import { discoverManagedPullRequests } from "../github/discovery.ts";
import {
  classifyPrBody,
  computeIssueEntryKey,
  managedIssueTitle,
  renderManagedIssueSection,
  renderManagedPrSection,
  selectFailureScope,
  type ArtifactManifest,
  type DraftReceipt,
  type FailureState,
  type IssueEntry,
  type IssueEntryObservation,
  type ValidationState,
} from "../model/index.ts";

export type FinalizeContext = Readonly<{
  repositoryId: string;
  repository: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  now: () => Date;
}>;

export type FinalizeResult = Readonly<{
  kind: "finalized" | "pr-identity-conflict" | "intervention-required" | "recovery-required" | "permission-denied";
  pr?: "ready" | "draft";
  issue?: string;
  permission?: GithubPermissionEvidence;
}>;

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

function issueSection(repositoryId: string, repository: string, entries: readonly unknown[]): string {
  return renderManagedIssueSection({
    schemaVersion: 1,
    kind: "managed-issue",
    repositoryId,
    repository,
    entries,
  }, entries.length === 0 ? "All managed automation failures are resolved." : "Managed automation failures require attention.");
}

export async function syncManagedIssueEntries(input: Readonly<{
  adapter: GithubAdapter;
  context: Pick<FinalizeContext, "repositoryId" | "repository">;
  observations: readonly IssueEntryObservation[];
  resolvedKeys?: readonly string[];
  resolveCurrent?: (entries: readonly IssueEntry[]) => readonly string[];
}>): Promise<string> {
  const page = await input.adapter.listIssues();
  const decision = discoverManagedIssue({
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    paginationComplete: page.complete,
    issues: page.items,
  });
  if (decision.issueWritePolicy === "none") return decision.kind;
  const currentEntries = decision.kind === "update" || decision.kind === "reopen" ? decision.envelope.entries : [];
  const entries = reduceIssueEntries({
    currentEntries,
    observations: input.observations,
    resolvedKeys: input.resolveCurrent?.(currentEntries) ?? input.resolvedKeys ?? [],
  });
  if (entries.length === 0 && decision.kind === "create") return "none";
  const section = issueSection(input.context.repositoryId, input.context.repository, entries);
  if (decision.kind === "create") {
    await input.adapter.createIssue({ title: managedIssueTitle, body: section });
    return "created";
  }
  if (isDeepStrictEqual(entries, decision.envelope.entries)) return "unchanged";
  if (decision.kind === "reopen") await input.adapter.reopenIssue(decision.issueNumber);
  await input.adapter.updateIssue({ issueNumber: decision.issueNumber, managedSection: section });
  return decision.kind === "reopen" ? "reopened" : "updated";
}

async function syncIssue(input: Readonly<{
  adapter: GithubAdapter;
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
  adapter: GithubAdapter;
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

function targetIdentity(
  manifest: Exclude<ArtifactManifest, { kind: "no-op" }>,
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
  adapter: GithubAdapter;
  context: FinalizeContext;
  manifest: Exclude<ArtifactManifest, { kind: "no-op" }>;
  receipt?: DraftReceipt;
  validation: ValidationState;
  cleanupStatus?: "passed" | "failed";
  cleanupFailedRefs?: readonly string[];
}>): Promise<FinalizeResult> {
  const validation = closedValidation(input.validation);
  if (!isDeepStrictEqual(validation.run, input.manifest.run)) throw new Error("validation runがmanifestと一致しません");
  const target = targetIdentity(input.manifest, input.receipt);
  const page = await input.adapter.listPullRequests();
  const state = discoverManagedPullRequests({
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    defaultBaseRef: input.context.defaultBranchRef,
    resumeClosed: false,
    paginationComplete: page.complete,
    pullRequests: page.items,
  });
  if (state.decision.kind === "pr-identity-conflict") return { kind: "pr-identity-conflict" };
  if (state.decision.kind === "recovery-required") return { kind: "recovery-required" };
  if (state.decision.kind === "intervention-required") return { kind: "intervention-required" };
  if (state.decision.kind !== "open" || state.decision.member.prNumber !== target.prNumber) {
    return { kind: "recovery-required" };
  }
  const current = await input.adapter.readPullRequest(target.prNumber);
  const branch = await input.adapter.readBranch(target.headRef);
  if (current === null || branch?.sha !== target.headSha || current.headSha !== target.headSha) {
    return { kind: "recovery-required" };
  }
  const classification = classifyPrBody(current.body, current.draft);
  if (classification.kind !== "strict") return { kind: "pr-identity-conflict" };
  const desiredDraft = validation.status !== "passed";
  const alreadyFinalized = classification.envelope.candidateDigest === input.manifest.candidateDigest &&
    classification.envelope.expectedHeadSha === target.headSha && current.draft === desiredDraft &&
    isDeepStrictEqual(classification.envelope.validation, validation);
  if (!alreadyFinalized) {
    const discovery = discoverCandidateHistory({ complete: page.complete, pages: [page.items] }, {
      repositoryId: input.context.repositoryId,
      repository: input.context.repository,
      defaultBranchSha: input.context.defaultBranchSha,
      defaultBranchRef: input.context.defaultBranchRef,
      resumeClosed: false,
    });
    if (discovery.historyDigest !== target.historyDigest || classification.markerDigest !== target.markerDigest) {
      return { kind: "recovery-required" };
    }
    const section = renderManagedPrSection({
      ...classification.envelope,
      validation,
    }, validation.status === "passed"
      ? "Candidate validation passed; ready for human review."
      : validation.failureKind === "command"
        ? `Candidate remains draft after failed command: ${validation.command}`
        : `Candidate remains draft after infrastructure failure: ${validation.stage}`);
    try {
      await input.adapter.updatePullRequest({ prNumber: target.prNumber, draft: desiredDraft, managedSection: section });
    } catch (error: unknown) {
      const permission = permissionEvidence(error);
      if (permission !== null) {
        if (permission.postState === "unknown") return { kind: "recovery-required", permission };
        let issue: string;
        try {
          issue = await recoverIssueWrite(() => syncIssue({
            adapter: input.adapter,
            context: input.context,
            candidateDigest: input.manifest.candidateDigest,
            validation: {
              status: "failed",
              run: validation.run,
              failureKind: "infrastructure",
              stage: "unknown",
            },
          }));
        } catch (issueError: unknown) {
          issue = isPermissionDenied(issueError) ? "permission-denied" : "recovery-required";
        }
        return { kind: "permission-denied", issue, permission };
      }
    }
    const post = await input.adapter.readPullRequest(target.prNumber);
    const postClassification = classifyPrBody(post?.body ?? null, post?.draft ?? desiredDraft);
    if (post === null || post.draft !== desiredDraft || postClassification.kind !== "strict" ||
      !isDeepStrictEqual(postClassification.envelope.validation, validation)) {
      return { kind: "recovery-required" };
    }
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
