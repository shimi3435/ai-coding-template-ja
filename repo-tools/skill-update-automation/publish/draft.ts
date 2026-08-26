import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { discoverCandidateHistory, validateCandidateArtifact } from "../candidate/index.ts";
import { discoverManagedPullRequests } from "../github/discovery.ts";
import type { GithubAdapter } from "../github/adapter.ts";
import {
  classifyPrBody,
  decodeArtifactManifest,
  encodeDraftReceipt,
  managedPrTitle,
  renderManagedPrSection,
  type CandidateUpdateManifest,
  type DraftReceipt,
  type PrEnvelope,
} from "../model/index.ts";

export type PublishDraftContext = Readonly<{
  repositoryId: string;
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  triggerSha: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  resumeClosed: boolean;
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
>;

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function reportDigest(manifest: CandidateUpdateManifest): string {
  const report = manifest.files.find((file) => file.name === "apply-report.json");
  if (report === undefined) throw new Error("candidate apply reportがありません");
  return report.digest;
}

function pendingEnvelope(
  manifest: CandidateUpdateManifest,
  context: PublishDraftContext,
  expectedHeadSha: string,
): PrEnvelope {
  return {
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: context.repositoryId,
    repository: context.repository,
    generation: manifest.target.generation,
    headRef: manifest.target.headRef,
    baseRef: context.defaultBranchRef,
    expectedHeadSha,
    validationBaseSha: manifest.triggerSha,
    candidateDigest: manifest.candidateDigest,
    reportDigest: reportDigest(manifest),
    validation: {
      status: "pending",
      run: { workflowRunId: context.workflowRunId, workflowRunAttempt: context.workflowRunAttempt },
    },
  };
}

function managedSection(manifest: CandidateUpdateManifest, context: PublishDraftContext, headSha: string): string {
  return renderManagedPrSection(pendingEnvelope(manifest, context, headSha), "Automated vendored skill update pending validation.");
}

function stopReason(kind: string): Error {
  return new Error(`publish-draft stopped: ${kind}`);
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
  const state = discoverManagedPullRequests({
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    defaultBaseRef: input.context.defaultBranchRef,
    resumeClosed: input.context.resumeClosed,
    paginationComplete: page.complete,
    pullRequests: page.items,
  });
  if (state.decision.writePolicy !== "publish") throw stopReason(state.decision.kind);

  const discovery = discoverCandidateHistory({ complete: page.complete, pages: [page.items] }, {
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    defaultBranchSha: input.context.defaultBranchSha,
    defaultBranchRef: input.context.defaultBranchRef,
    resumeClosed: input.context.resumeClosed,
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
    if (open === undefined) throw stopReason("publish-target-changed");
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
    const pullRequest = await input.adapter.createDraftPullRequest({
      headRepositoryId: input.context.repositoryId,
      headRef: manifest.target.headRef,
      headSha: manifest.candidateSha,
      baseRepositoryId: input.context.repositoryId,
      baseRef: input.context.defaultBranchRef,
      title: managedPrTitle,
      body: managedSection(manifest, input.context, manifest.candidateSha),
    });
    prNumber = pullRequest.prNumber;
  } else {
    const pullRequest = await input.adapter.readPullRequest(manifest.target.prNumber);
    const branch = await input.adapter.readBranch(manifest.target.headRef);
    if (pullRequest === null || branch?.sha !== manifest.target.expectedBranch.sha) throw stopReason("publish-target-changed");
    const classification = classifyPrBody(pullRequest.body, pullRequest.draft);
    if (classification.kind !== "strict" || classification.markerDigest !== manifest.target.markerDigest) {
      throw stopReason("publish-target-changed");
    }
    if (!pullRequest.draft) {
      await input.adapter.updatePullRequest({
        prNumber: pullRequest.prNumber,
        draft: true,
        managedSection: managedSection(manifest, input.context, manifest.target.expectedBranch.sha),
      });
    }
    await input.adapter.appendBranch({
      ref: manifest.target.headRef,
      expectedSha: manifest.target.expectedBranch.sha,
      candidateSha: manifest.candidateSha,
    });
    await input.adapter.updatePullRequest({
      prNumber: pullRequest.prNumber,
      managedSection: managedSection(manifest, input.context, manifest.candidateSha),
    });
    prNumber = pullRequest.prNumber;
  }

  const postPullRequest = await input.adapter.readPullRequest(prNumber);
  const postBranch = await input.adapter.readBranch(manifest.target.headRef);
  if (postPullRequest === null || postBranch?.sha !== manifest.candidateSha || !postPullRequest.draft) {
    throw stopReason("post-publish-state-unknown");
  }
  const postClassification = classifyPrBody(postPullRequest.body, true);
  if (postClassification.kind !== "strict" || postClassification.envelope.expectedHeadSha !== manifest.candidateSha) {
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
  const receipt: DraftReceipt = {
    schemaVersion: 1,
    kind: "published-draft",
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    run: { workflowRunId: input.context.workflowRunId, workflowRunAttempt: input.context.workflowRunAttempt },
    manifestDigest: digest(manifestBytes),
    candidateDigest: manifest.candidateDigest,
    generation: manifest.target.generation,
    prNumber,
    headRef: manifest.target.headRef,
    headSha: manifest.candidateSha,
    markerDigest: postClassification.markerDigest,
    historyDigest: postDiscovery.historyDigest,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
  return { kind: "published", receipt: encodeDraftReceipt(receipt), prNumber, headSha: manifest.candidateSha };
}
