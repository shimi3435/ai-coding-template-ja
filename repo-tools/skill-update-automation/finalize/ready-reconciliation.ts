import { createHash } from "node:crypto";

import { discoverCandidateHistory } from "../candidate/index.ts";
import {
  computeIssueEntryKey,
  managedPrTitle,
  selectFailureScope,
  type ArtifactManifest,
  type IssueEntryObservation,
} from "../model/index.ts";
import { loadPrJournal, samePrSnapshot } from "../publish/pr-journal.ts";
import {
  syncManagedIssueEntries,
  type FinalizeContext,
  type FinalizeGithubAdapter,
} from "./finalize.ts";

type ReadyReconciliationManifest = Extract<ArtifactManifest, { kind: "no-op" | "recovery" }>;

function textDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export async function reconcileReadyTrackingFailures(input: Readonly<{
  adapter: FinalizeGithubAdapter;
  context: FinalizeContext;
  manifest: ReadyReconciliationManifest;
  cleanupStatus?: "passed" | "failed";
  cleanupFailedRefs?: readonly string[];
}>): Promise<"not-applicable" | "none" | "unchanged" | "created" | "recovered" | "updated"> {
  if (input.cleanupStatus !== "failed" && (input.cleanupFailedRefs?.length ?? 0) > 0) {
    throw new Error("cleanup statusとfailed refsが一致しません");
  }
  if (input.manifest.kind === "recovery" && input.manifest.target.mode !== "prepared-pr-ready") {
    throw new Error("ready reconciliationにはprepared-pr-ready recoveryが必要です");
  }
  const page = await input.adapter.listPullRequests();
  const discovery = discoverCandidateHistory({ complete: page.complete, pages: [page.items] }, {
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    defaultBranchSha: input.context.defaultBranchSha,
    defaultBranchRef: input.context.defaultBranchRef,
    resumeClosed: false,
  });
  if (input.manifest.kind === "no-op" && discovery.historyDigest !== input.manifest.target.historyDigest) {
    throw new Error("ready reconciliation historyがno-op artifactと一致しません");
  }
  const open = discovery.open;
  if (input.manifest.kind === "no-op" && open === undefined) return "not-applicable";
  if (input.manifest.kind === "no-op" && open !== undefined &&
    (open.draft || open.envelope.draft || open.envelope.validation.status !== "passed")) return "not-applicable";
  const expectedPrNumber = input.manifest.kind === "recovery" ? input.manifest.target.prNumber : open?.prNumber;
  if (open === undefined || expectedPrNumber === undefined || open.prNumber !== expectedPrNumber) {
    throw new Error("ready reconciliation targetが一意ではありません");
  }
  const observed = page.items.find((pullRequest) => pullRequest.prNumber === open.prNumber);
  const pullRequest = await input.adapter.readPullRequest(open.prNumber);
  const branch = await input.adapter.readBranch(open.headRef);
  if (observed === undefined || pullRequest === null || branch === null) {
    throw new Error("ready reconciliation fresh targetがありません");
  }
  const loaded = await loadPrJournal(input.adapter, pullRequest);
  if (pullRequest.state !== "open" || pullRequest.merged || pullRequest.draft ||
    pullRequest.title !== managedPrTitle || pullRequest.body !== observed.body ||
    pullRequest.authorUserId !== input.context.creatorUserId || pullRequest.lastEditedAt !== null ||
    pullRequest.headRepositoryId !== input.context.repositoryId ||
    pullRequest.baseRepositoryId !== input.context.repositoryId ||
    pullRequest.headRef !== open.headRef || pullRequest.baseRef !== input.context.defaultBranchRef ||
    pullRequest.headSha !== open.headSha || branch.sha !== open.headSha ||
    loaded.root.creatorUserId !== input.context.creatorUserId || loaded.journal.pending !== null ||
    loaded.currentEntry.digest !== open.markerDigest || !samePrSnapshot(loaded.currentState, open.envelope) ||
    loaded.currentState.draft || loaded.currentState.validation.status !== "passed" ||
    loaded.currentState.candidateDigest !== open.envelope.candidateDigest) {
    throw new Error("ready reconciliation fresh stateがexact ready/passedではありません");
  }
  if (input.manifest.kind === "recovery") {
    const target = input.manifest.target;
    if (open.generation !== target.generation || open.creatorUserId !== target.creatorUserId ||
      open.headRef !== target.headRef || open.headSha !== target.afterHeadSha ||
      textDigest(loaded.immutableBody) !== target.rootDigest ||
      loaded.currentEntry.operation !== "pr-ready" || loaded.currentEntry.phase !== "committed" ||
      loaded.currentEntry.operationId !== target.operationId ||
      loaded.currentEntry.snapshot.stateDigest !== target.afterSnapshotDigest ||
      loaded.currentState.candidateDigest !== target.candidateDigest ||
      loaded.currentState.reportDigest !== target.reportDigest) {
      throw new Error("ready reconciliation stateがrecovery descriptorと一致しません");
    }
  }
  const scope = selectFailureScope({
    candidateDigest: loaded.currentState.candidateDigest,
    operation: "publish-finalize",
  });
  const cleanupScopes = input.cleanupStatus !== "failed"
    ? []
    : (input.cleanupFailedRefs ?? []).length === 0
      ? [selectFailureScope({ operation: "cleanup" })]
      : (input.cleanupFailedRefs ?? []).map((identity) => selectFailureScope({
          resource: { resourceKind: "branch", identity },
          operation: "cleanup",
        }));
  const cleanupObservations: IssueEntryObservation[] = cleanupScopes.map((cleanupScope) => ({
    state: "cleanup-failed",
    scope: cleanupScope,
    seen: { run: input.manifest.run, at: input.context.now().toISOString() },
    detailDigest: `sha256:${createHash("sha256").update(JSON.stringify({
      status: "failed",
      scope: cleanupScope,
    })).digest("hex")}`,
    summary: cleanupScope.kind === "resource"
      ? `Guarded cleanup failed for ${cleanupScope.identity}.`
      : "One or more guarded merged-branch cleanup operations failed.",
  }));
  const result = await syncManagedIssueEntries({
    adapter: input.adapter,
    context: input.context,
    observations: cleanupObservations,
    resolvedKeys: [
      computeIssueEntryKey("validation-failed", scope),
      computeIssueEntryKey("recovery-required", scope),
    ],
  });
  if (result !== "none" && result !== "unchanged" && result !== "created" && result !== "recovered" &&
    result !== "updated") {
    throw new Error(`ready reconciliation issue stateが不正です: ${result}`);
  }
  return result;
}
