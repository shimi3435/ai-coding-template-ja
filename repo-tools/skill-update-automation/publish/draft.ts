import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { discoverCandidateHistory, validateCandidateArtifact } from "../candidate/index.ts";
import type { GithubAdapter, JournalGithubAdapter } from "../github/adapter.ts";
import { hasManagedPrEvidence } from "../github/discovery.ts";
import {
  appendJournalEntryDigest,
  classifyPrRootV2,
  decodeJournalCommentBodyV2,
  decodePrStateSnapshotV2,
  decodeArtifactManifest,
  encodeDraftReceipt,
  managedPrTitle,
  prStateSnapshotV2,
  reduceJournalCommentsV2,
  renderManagedPrRootV2,
  type CandidateUpdateManifest,
  type DraftReceipt,
  type PrStateV2,
} from "../model/index.ts";
import {
  loadPrJournal,
  pendingPrState,
  recoverPreparedTransition,
  rootOperationId,
  runPreparedTransition,
  samePrSnapshot,
} from "./pr-journal.ts";
import { appendInitialJournalEntry } from "./initial-journal.ts";

export type PublishDraftContext = Readonly<{
  repositoryId: string;
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  triggerSha: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  resumeClosed: boolean;
  creatorUserId: string;
}>;

export type PublishDraftResult =
  | Readonly<{ kind: "not-required" }>
  | Readonly<{ kind: "published"; receipt: Buffer; prNumber: number; headSha: string }>;

export type PublishDraftGithubAdapter = Pick<GithubAdapter,
  | "listPullRequests"
  | "readBranch"
  | "readPullRequest"
  | "createBranch"
  | "appendBranch"
  | "createDraftPullRequest"
  | "updatePullRequest"
> & JournalGithubAdapter;

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function stopReason(kind: string): Error {
  return new Error(`publish-draft stopped: ${kind}`);
}

async function recoverCommentlessPrRoot(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  artifactDirectory: string;
  context: PublishDraftContext;
  decoded: CandidateUpdateManifest;
  page: Awaited<ReturnType<PublishDraftGithubAdapter["listPullRequests"]>>;
}>): Promise<Readonly<{ manifest: CandidateUpdateManifest; prNumber: number }> | null> {
  if (input.decoded.target.mode !== "create" || !input.page.complete) return null;
  const managed = input.page.items.filter(hasManagedPrEvidence);
  const candidates = managed.filter((pullRequest) => {
    const classification = classifyPrRootV2(pullRequest.body);
    if (classification.kind !== "strict") return false;
    try {
      return reduceJournalCommentsV2(
        pullRequest.journalComments ?? [],
        classification.root.creatorUserId,
      ).entries.length === 0;
    } catch {
      return false;
    }
  });
  if (candidates.length === 0) return null;
  if (managed.length !== 1 || candidates.length !== 1) throw stopReason("publish-target-changed");
  const pullRequest = candidates[0]!;
  const classification = classifyPrRootV2(pullRequest.body);
  if (classification.kind !== "strict") throw stopReason("publish-target-changed");
  const root = classification.root;
  const manifest = validateCandidateArtifact(input.artifactDirectory, {
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    workflowRunId: input.context.workflowRunId,
    workflowRunAttempt: input.context.workflowRunAttempt,
    historyDigest: input.decoded.target.historyDigest,
    target: input.decoded.target,
  });
  if (manifest.kind !== "candidate-update") throw stopReason("publish-target-changed");
  const expectedState = pendingPrState(manifest, input.context, manifest.candidateSha);
  const initialState = decodePrStateSnapshotV2(root.initialSnapshot);
  const branch = await input.adapter.readBranch(input.decoded.target.headRef);
  const comments = await input.adapter.listJournalComments(pullRequest.prNumber);
  if (root.repositoryId !== input.context.repositoryId || root.repository !== input.context.repository ||
    root.creatorUserId !== input.context.creatorUserId || root.generation !== input.decoded.target.generation ||
    root.headRef !== input.decoded.target.headRef || root.baseRef !== input.context.defaultBranchRef ||
    root.candidateDigest !== manifest.candidateDigest || !samePrSnapshot(initialState, expectedState) ||
    pullRequest.state !== "open" || pullRequest.merged || !pullRequest.draft ||
    pullRequest.authorUserId !== root.creatorUserId || pullRequest.lastEditedAt !== null ||
    pullRequest.title !== managedPrTitle || pullRequest.headRepositoryId !== input.context.repositoryId ||
    pullRequest.baseRepositoryId !== input.context.repositoryId || pullRequest.headRef !== root.headRef ||
    pullRequest.baseRef !== root.baseRef || pullRequest.headSha !== expectedState.expectedHeadSha ||
    branch?.sha !== expectedState.expectedHeadSha || !comments.complete ||
    reduceJournalCommentsV2(comments.items, root.creatorUserId).entries.length !== 0) {
    throw stopReason("publish-target-changed");
  }
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: pullRequest.prNumber,
    creatorUserId: root.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: rootOperationId(root.repositoryId, pullRequest.prNumber, root.initialSnapshotDigest),
    snapshot: root.initialSnapshot,
  });
  await appendInitialJournalEntry(input.adapter, entry);
  return { manifest, prNumber: pullRequest.prNumber };
}

async function completePublishedDraft(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  manifest: CandidateUpdateManifest;
  manifestBytes: Buffer;
  context: PublishDraftContext;
  prNumber: number;
  now?: () => Date;
}>): Promise<PublishDraftResult> {
  const postPullRequest = await input.adapter.readPullRequest(input.prNumber);
  const postBranch = await input.adapter.readBranch(input.manifest.target.headRef);
  if (postPullRequest === null || postBranch?.sha !== input.manifest.candidateSha || !postPullRequest.draft) {
    throw stopReason("post-publish-state-unknown");
  }
  const postRoot = classifyPrRootV2(postPullRequest.body);
  const postComments = await input.adapter.listJournalComments(input.prNumber);
  if (postRoot.kind !== "strict" || !postComments.complete ||
    postRoot.root.creatorUserId !== input.context.creatorUserId) throw stopReason("post-publish-state-unknown");
  const postJournal = reduceJournalCommentsV2(postComments.items, postRoot.root.creatorUserId);
  const firstJournalEntry = postJournal.entries[0];
  const postState = postJournal.snapshot === null ? null : decodePrStateSnapshotV2(postJournal.snapshot);
  if (firstJournalEntry === undefined || firstJournalEntry.snapshot.stateDigest !== postRoot.root.initialSnapshotDigest ||
    postJournal.pending !== null || postState === null ||
    !samePrSnapshot(postState, pendingPrState(input.manifest, input.context, input.manifest.candidateSha))) {
    throw stopReason("post-publish-state-unknown");
  }
  const postPage = await input.adapter.listPullRequests();
  const postDiscovery = discoverCandidateHistory({ complete: postPage.complete, pages: [postPage.items] }, {
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    defaultBranchSha: input.context.defaultBranchSha,
    defaultBranchRef: input.context.defaultBranchRef,
    resumeClosed: false,
  });
  const latestJournalDigest = postJournal.entries.at(-1)?.digest;
  if (latestJournalDigest === undefined) throw stopReason("post-publish-state-unknown");
  const receipt: DraftReceipt = {
    schemaVersion: 1,
    kind: "published-draft",
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    run: { workflowRunId: input.context.workflowRunId, workflowRunAttempt: input.context.workflowRunAttempt },
    manifestDigest: digest(input.manifestBytes),
    candidateDigest: input.manifest.candidateDigest,
    generation: input.manifest.target.generation,
    prNumber: input.prNumber,
    headRef: input.manifest.target.headRef,
    headSha: input.manifest.candidateSha,
    markerDigest: latestJournalDigest,
    historyDigest: postDiscovery.historyDigest,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
  return { kind: "published", receipt: encodeDraftReceipt(receipt), prNumber: input.prNumber, headSha: input.manifest.candidateSha };
}

export async function publishDraft(input: Readonly<{
  adapter: PublishDraftGithubAdapter;
  artifactDirectory: string;
  context: PublishDraftContext;
  now?: () => Date;
}>): Promise<PublishDraftResult> {
  const manifestBytes = readFileSync(join(input.artifactDirectory, "manifest.json"));
  const decoded = decodeArtifactManifest(manifestBytes);
  if (decoded.kind !== "candidate-update") return { kind: "not-required" };
  if (decoded.triggerSha !== input.context.triggerSha) throw new Error("artifact trigger SHAがcurrent contextと一致しません");

  const page = await input.adapter.listPullRequests();
  const recovered = await recoverCommentlessPrRoot({
    adapter: input.adapter,
    artifactDirectory: input.artifactDirectory,
    context: input.context,
    decoded,
    page,
  });
  if (recovered !== null) {
    return await completePublishedDraft({
      adapter: input.adapter,
      manifest: recovered.manifest,
      manifestBytes,
      context: input.context,
      prNumber: recovered.prNumber,
      now: input.now,
    });
  }
  const discovery = discoverCandidateHistory({ complete: page.complete, pages: [page.items] }, {
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    defaultBranchSha: input.context.defaultBranchSha,
    defaultBranchRef: input.context.defaultBranchRef,
    resumeClosed: input.context.resumeClosed,
    allowPendingRecovery: true,
  });
  let freshTarget: CandidateUpdateManifest["target"];
  if (decoded.target.mode === "create") {
    if (discovery.createGeneration === undefined || discovery.open !== undefined) throw stopReason("publish-target-changed");
    freshTarget = {
      mode: "create",
      generation: discovery.createGeneration,
      headRef: `refs/heads/automation/skill-updates/g${String(discovery.createGeneration).padStart(6, "0")}`,
      expectedBranch: { state: "absent" },
      historyDigest: discovery.historyDigest,
    };
  } else {
    const open = discovery.open;
    if (open === undefined || open.creatorUserId !== input.context.creatorUserId) throw stopReason("publish-target-changed");
    freshTarget = {
      mode: "update",
      generation: open.generation,
      prNumber: open.prNumber,
      headRef: open.headRef,
      expectedBranch: { state: "present", sha: open.headSha },
      markerDigest: open.markerDigest,
      historyDigest: discovery.historyDigest,
    };
  }
  const manifest = validateCandidateArtifact(input.artifactDirectory, {
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    workflowRunId: input.context.workflowRunId,
    workflowRunAttempt: input.context.workflowRunAttempt,
    historyDigest: discovery.historyDigest,
    target: freshTarget,
  });
  if (manifest.kind !== "candidate-update") throw new Error("publish-draftにはcandidate-updateが必要です");

  let prNumber: number;
  if (manifest.target.mode === "create") {
    if (await input.adapter.readBranch(manifest.target.headRef) !== null) throw stopReason("branch-present");
    await input.adapter.createBranch({ ref: manifest.target.headRef, sha: manifest.candidateSha });
    const initialSnapshot = prStateSnapshotV2(pendingPrState(manifest, input.context, manifest.candidateSha));
    const immutableBody = renderManagedPrRootV2({
      schemaVersion: 2,
      kind: "managed-pr-root",
      repositoryId: input.context.repositoryId,
      repository: input.context.repository,
      creatorUserId: input.context.creatorUserId,
      generation: manifest.target.generation,
      headRef: manifest.target.headRef,
      baseRef: input.context.defaultBranchRef,
      candidateDigest: manifest.candidateDigest,
      initialSnapshot,
      initialSnapshotDigest: initialSnapshot.stateDigest,
    }, "Automated vendored skill update pending validation.");
    const pullRequest = await input.adapter.createDraftPullRequest({
      headRepositoryId: input.context.repositoryId,
      headRef: manifest.target.headRef,
      headSha: manifest.candidateSha,
      baseRepositoryId: input.context.repositoryId,
      baseRef: input.context.defaultBranchRef,
      title: managedPrTitle,
      body: immutableBody,
    });
    prNumber = pullRequest.prNumber;
    const rootEntry = appendJournalEntryDigest({
      schemaVersion: 2,
      resourceKind: "pull-request",
      resourceNumber: prNumber,
      creatorUserId: input.context.creatorUserId,
      sequence: 1,
      previousDigest: null,
      phase: "committed",
      operation: "root",
      operationId: rootOperationId(input.context.repositoryId, prNumber, initialSnapshot.stateDigest),
      snapshot: initialSnapshot,
    });
    const [freshPullRequest, freshBranch, freshComments] = await Promise.all([
      input.adapter.readPullRequest(prNumber),
      input.adapter.readBranch(manifest.target.headRef),
      input.adapter.listJournalComments(prNumber),
    ]);
    const freshRoot = classifyPrRootV2(freshPullRequest?.body ?? null);
    if (freshPullRequest === null || freshPullRequest.state !== "open" || !freshPullRequest.draft ||
      freshPullRequest.title !== managedPrTitle || freshPullRequest.body !== immutableBody ||
      freshPullRequest.headRepositoryId !== input.context.repositoryId ||
      freshPullRequest.baseRepositoryId !== input.context.repositoryId ||
      freshPullRequest.headRef !== manifest.target.headRef || freshPullRequest.baseRef !== input.context.defaultBranchRef ||
      freshPullRequest.headSha !== manifest.candidateSha || freshBranch?.sha !== manifest.candidateSha ||
      freshRoot.kind !== "strict" || freshRoot.root.creatorUserId !== input.context.creatorUserId ||
      freshPullRequest.authorUserId !== input.context.creatorUserId || freshPullRequest.lastEditedAt !== null ||
      !freshComments.complete || freshComments.items.some((comment) => decodeJournalCommentBodyV2(comment.body) !== null)) {
      throw stopReason("post-publish-state-unknown");
    }
    await appendInitialJournalEntry(input.adapter, rootEntry);
  } else {
    let pullRequest = await input.adapter.readPullRequest(manifest.target.prNumber);
    let branch = await input.adapter.readBranch(manifest.target.headRef);
    if (pullRequest === null) throw stopReason("publish-target-changed");
    let loaded = await loadPrJournal(input.adapter, pullRequest);
    if (loaded.currentEntry.digest !== manifest.target.markerDigest ||
      loaded.root.creatorUserId !== input.context.creatorUserId) throw stopReason("publish-target-changed");
    await recoverPreparedTransition({ adapter: input.adapter, manifest, context: input.context, pullRequest, branch, loaded });
    pullRequest = await input.adapter.readPullRequest(manifest.target.prNumber);
    branch = await input.adapter.readBranch(manifest.target.headRef);
    if (pullRequest === null) throw stopReason("publish-target-changed");
    loaded = await loadPrJournal(input.adapter, pullRequest);
    if (loaded.root.creatorUserId !== input.context.creatorUserId) throw stopReason("publish-target-changed");

    if (!pullRequest.draft) {
      const afterDraft: PrStateV2 = {
        ...loaded.currentState,
        validationBaseSha: manifest.triggerSha,
        draft: true,
        validation: {
          status: "pending",
          run: { workflowRunId: input.context.workflowRunId, workflowRunAttempt: input.context.workflowRunAttempt },
        },
      };
      await runPreparedTransition({
        adapter: input.adapter,
        pullRequest,
        branch,
        loaded,
        operation: "pr-draft",
        after: afterDraft,
        mutate: () => input.adapter.updatePullRequest({ prNumber: pullRequest!.prNumber, draft: true }),
      });
      pullRequest = await input.adapter.readPullRequest(manifest.target.prNumber);
      branch = await input.adapter.readBranch(manifest.target.headRef);
      if (pullRequest === null) throw stopReason("post-publish-state-unknown");
      loaded = await loadPrJournal(input.adapter, pullRequest);
    }
    const afterAppend = pendingPrState(manifest, input.context, manifest.candidateSha);
    if (!samePrSnapshot(loaded.currentState, afterAppend)) {
      await runPreparedTransition({
        adapter: input.adapter,
        pullRequest,
        branch,
        loaded,
        operation: "branch-append",
        after: afterAppend,
        mutate: () => input.adapter.appendBranch({
          ref: manifest.target.headRef,
          expectedSha: loaded.currentState.expectedHeadSha,
          candidateSha: manifest.candidateSha,
        }),
      });
    }
    prNumber = pullRequest.prNumber;
  }

  return await completePublishedDraft({
    adapter: input.adapter,
    manifest,
    manifestBytes,
    context: input.context,
    prNumber,
    now: input.now,
  });
}
