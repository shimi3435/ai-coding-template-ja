import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validateCandidateArtifact, writeExistingValidationArtifact } from "../candidate/index.ts";
import { discoverCandidateHistory } from "../candidate/history.ts";
import type { PublishDraftGithubAdapter } from "../publish/draft.ts";
import { appendInitialJournalEntry } from "../publish/initial-journal.ts";
import {
  loadPrJournal,
  pendingPrState,
  recoverExactPreparedTransition,
  rootOperationId,
  runPreparedTransition,
} from "../publish/pr-journal.ts";
import { discoverManagedPullRequests } from "../github/discovery.ts";
import {
  appendJournalEntryDigest,
  classifyPrRootV2,
  decodePrStateSnapshotV2,
  prStateSnapshotV2,
  type ExistingHeadValidationManifest,
  type RecoveryManifest,
  type RunRef,
} from "../model/index.ts";

export type CrossRunRecoveryResult =
  | Readonly<{ kind: "validation-required"; manifest: ExistingHeadValidationManifest }>
  | Readonly<{ kind: "ready-recovered" }>;

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function recoverCrossRunTransition(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  recoveryArtifactDirectory: string;
  originArtifactDirectory: string;
  outputArtifactDirectory: string;
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  triggerSha: string;
  currentRun: RunRef;
  now?: () => Date;
}>): Promise<CrossRunRecoveryResult> {
  const decodedRecovery = validateCandidateArtifact(input.recoveryArtifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: input.currentRun.workflowRunId,
    workflowRunAttempt: input.currentRun.workflowRunAttempt,
  });
  if (decodedRecovery.kind !== "recovery") throw new Error("recovery artifactが必要です");
  const recovery: RecoveryManifest = decodedRecovery;
  if (recovery.triggerSha !== input.triggerSha) throw new Error("recovery trigger SHAがcurrent runと一致しません");
  if (recovery.target.creatorUserId !== input.creatorUserId) {
    throw new Error("recovery creatorがexpected automation identityと一致しません");
  }

  const origin = validateCandidateArtifact(input.originArtifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: recovery.target.originRun.workflowRunId,
    workflowRunAttempt: recovery.target.originRun.workflowRunAttempt,
  });
  if (origin.kind !== "candidate-update" && origin.kind !== "existing-head-validation") {
    throw new Error("origin candidate artifactが必要です");
  }
  const resumesCandidatePublish = recovery.target.mode === "prepared-pr-draft";
  if (!resumesCandidatePublish && (origin.candidateSha !== recovery.target.afterHeadSha ||
    origin.candidateDigest !== recovery.target.candidateDigest)) {
    throw new Error("origin candidate identityがrecovery targetと一致しません");
  }
  if (!resumesCandidatePublish && origin.kind === "candidate-update" &&
    origin.files[0].digest !== recovery.target.reportDigest) {
    throw new Error("origin apply reportがrecovery targetと一致しません");
  }

  const page = await input.adapter.listPullRequests();
  const fresh = discoverManagedPullRequests({
    repositoryId: input.repositoryId,
    repository: input.repository,
    defaultBaseRef: input.defaultBranchRef,
    resumeClosed: false,
    paginationComplete: page.complete,
    currentRun: input.currentRun,
    pullRequests: page.items,
  }).decision;
  if (fresh.kind !== "recoverable-transition" || !isDeepStrictEqual(fresh.target, recovery.target)) {
    throw new Error("recovery descriptorがfresh stateと一致しません");
  }

  const target = recovery.target;
  if (target.mode === "commentless-root") {
    const pullRequest = await input.adapter.readPullRequest(target.prNumber);
    const branch = await input.adapter.readBranch(target.headRef);
    const classification = classifyPrRootV2(pullRequest?.body ?? null);
    if (pullRequest === null || branch?.sha !== target.afterHeadSha || classification.kind !== "strict" ||
      pullRequest.authorUserId !== target.creatorUserId || pullRequest.lastEditedAt !== null ||
      digest(Buffer.from(pullRequest.body ?? "", "utf8")) !== target.rootDigest) {
      throw new Error("commentless recovery stateが不正です");
    }
    const root = classification.root;
    const entry = appendJournalEntryDigest({
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
    if (entry.operationId !== target.operationId || entry.snapshot.stateDigest !== target.afterSnapshotDigest) {
      throw new Error("commentless recovery descriptorがinitial journal entryと一致しません");
    }
    await appendInitialJournalEntry(input.adapter, entry);
  } else if (target.mode !== "stale-validation") {
    const pullRequest = await input.adapter.readPullRequest(target.prNumber);
    const branch = await input.adapter.readBranch(target.headRef);
    if (pullRequest === null) throw new Error("prepared recovery PRがありません");
    const loaded = await loadPrJournal(input.adapter, pullRequest);
    const prepared = loaded.journal.pending;
    if (prepared === null) throw new Error("terminal prepared entryがありません");
    const after = decodePrStateSnapshotV2(prepared.snapshot);
    if (digest(Buffer.from(loaded.immutableBody, "utf8")) !== target.rootDigest ||
      loaded.root.creatorUserId !== target.creatorUserId || prepared.digest !== target.journalDigest ||
      prepared.operationId !== target.operationId ||
      prStateSnapshotV2(loaded.currentState).stateDigest !== target.beforeSnapshotDigest ||
      prStateSnapshotV2(after).stateDigest !== target.afterSnapshotDigest) {
      throw new Error("prepared recovery descriptorがfresh journalと一致しません");
    }
    const operation = target.mode === "prepared-branch-append"
      ? "branch-append"
      : target.mode === "prepared-pr-draft"
        ? "pr-draft"
        : "pr-ready";
    if (operation === "pr-draft" && (origin.kind !== "candidate-update" || origin.target.mode !== "update" ||
      origin.target.prNumber !== target.prNumber || origin.target.headRef !== target.headRef ||
      origin.target.markerDigest !== loaded.currentEntry.digest || origin.target.expectedBranch.sha !== target.beforeHeadSha)) {
      throw new Error("origin pr-draft candidate targetがprepared before stateと一致しません");
    }
    await recoverExactPreparedTransition({
      adapter: input.adapter,
      pullRequest,
      branch,
      loaded,
      operation,
      after,
      mutate: operation === "branch-append"
        ? () => input.adapter.appendBranch({
            ref: target.headRef,
            expectedSha: target.beforeHeadSha,
            candidateSha: target.afterHeadSha,
          })
        : () => input.adapter.updatePullRequest({ prNumber: target.prNumber, draft: operation === "pr-draft" }),
    });
    if (operation === "pr-draft") {
      if (origin.kind !== "candidate-update") throw new Error("pr-draft recoveryにはcandidate-update artifactが必要です");
      const currentPullRequest = await input.adapter.readPullRequest(target.prNumber);
      const currentBranch = await input.adapter.readBranch(target.headRef);
      if (currentPullRequest === null) throw new Error("recovered pr-draft PRがありません");
      const currentLoaded = await loadPrJournal(input.adapter, currentPullRequest);
      const reboundManifest = {
        ...origin,
        target: {
          ...origin.target,
          markerDigest: currentLoaded.currentEntry.digest,
        },
      };
      const afterAppend = pendingPrState(reboundManifest, {
        repositoryId: input.repositoryId,
        repository: input.repository,
        workflowRunId: origin.run.workflowRunId,
        workflowRunAttempt: origin.run.workflowRunAttempt,
        triggerSha: input.triggerSha,
        defaultBranchSha: input.defaultBranchSha,
        defaultBranchRef: input.defaultBranchRef,
        resumeClosed: false,
        creatorUserId: target.creatorUserId,
      }, origin.candidateSha);
      await runPreparedTransition({
        adapter: input.adapter,
        pullRequest: currentPullRequest,
        branch: currentBranch,
        loaded: currentLoaded,
        operation: "branch-append",
        after: afterAppend,
        mutate: () => input.adapter.appendBranch({
          ref: target.headRef,
          expectedSha: currentLoaded.currentState.expectedHeadSha,
          candidateSha: origin.candidateSha,
        }),
      });
    }
  }

  if (target.mode === "prepared-pr-ready") return { kind: "ready-recovered" };

  const postPage = await input.adapter.listPullRequests();
  const discovery = discoverCandidateHistory({ complete: postPage.complete, pages: [postPage.items] }, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    defaultBranchSha: input.defaultBranchSha,
    defaultBranchRef: input.defaultBranchRef,
    resumeClosed: false,
  });
  const open = discovery.open;
  const expectedHeadSha = resumesCandidatePublish ? origin.candidateSha : target.afterHeadSha;
  const expectedCandidateDigest = resumesCandidatePublish ? origin.candidateDigest : target.candidateDigest;
  const postBranch = await input.adapter.readBranch(target.headRef);
  if (open === undefined || open.prNumber !== target.prNumber || open.headSha !== expectedHeadSha ||
    postBranch?.sha !== expectedHeadSha || open.creatorUserId !== target.creatorUserId ||
    open.envelope.candidateDigest !== expectedCandidateDigest) {
    throw new Error("recovered PRがvalidation targetと一致しません");
  }
  mkdirSync(input.outputArtifactDirectory, { mode: 0o700 });
  writeExistingValidationArtifact(
    input.outputArtifactDirectory,
    {
      repositoryId: input.repositoryId,
      repository: input.repository,
      workflowRunId: input.currentRun.workflowRunId,
      workflowRunAttempt: input.currentRun.workflowRunAttempt,
      triggerSha: input.triggerSha,
    },
    readFileSync(join(input.originArtifactDirectory, "preview-report.json")),
    discovery.historyDigest,
    open,
    origin.candidateTreeSha,
    input.now?.() ?? new Date(),
  );
  const current = validateCandidateArtifact(input.outputArtifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: input.currentRun.workflowRunId,
    workflowRunAttempt: input.currentRun.workflowRunAttempt,
  });
  if (current.kind !== "existing-head-validation") throw new Error("current validation artifact生成失敗");
  return { kind: "validation-required", manifest: current };
}
