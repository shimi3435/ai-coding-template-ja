import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyPrBody,
  computeCandidateDigest,
  computePrHistoryDigest,
  decodeDraftReceipt,
  encodeArtifactManifest,
  managedPrTitle,
  renderManagedPrSection,
  type CandidateUpdateManifest,
} from "../model/index.ts";
import { createFakeGithubAdapter } from "../github/fake-adapter.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import { publishDraft } from "./draft.ts";

const sha = (digit: string): string => digit.repeat(40);
const digest = (bytes: Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const context = {
  repositoryId: "123",
  repository: "owner/repository",
  workflowRunId: "456",
  workflowRunAttempt: 1,
  triggerSha: sha("0"),
  defaultBranchSha: sha("0"),
  defaultBranchRef: "refs/heads/main",
  resumeClosed: false,
};

function prBody(headSha: string, status: "pending" | "passed" = "pending"): string {
  return renderManagedPrSection({
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: context.repositoryId,
    repository: context.repository,
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: context.defaultBranchRef,
    expectedHeadSha: headSha,
    validationBaseSha: context.triggerSha,
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    validation: { status, run: { workflowRunId: context.workflowRunId, workflowRunAttempt: 1 } },
  }, "fixture summary");
}

function pull(overrides: Partial<GithubPullRequest> = {}): GithubPullRequest {
  const headSha = overrides.headSha ?? sha("3");
  const draft = overrides.draft ?? true;
  return {
    prNumber: 1,
    state: "open",
    merged: false,
    draft,
    headRepositoryId: context.repositoryId,
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha,
    baseRepositoryId: context.repositoryId,
    baseRef: context.defaultBranchRef,
    title: managedPrTitle,
    body: prBody(headSha, draft ? "pending" : "passed"),
    ...overrides,
  };
}

function historyDigest(pullRequests: readonly GithubPullRequest[]): string {
  return computePrHistoryDigest(context.repositoryId, pullRequests.map((item) => ({
    prNumber: item.prNumber,
    state: item.state,
    merged: item.merged,
    headRepositoryId: item.headRepositoryId,
    headRef: item.headRef,
    headSha: item.headSha,
    baseRepositoryId: item.baseRepositoryId,
    baseRef: item.baseRef,
    titleDigest: digest(Buffer.from(item.title)),
    bodyDigest: digest(Buffer.from(item.body ?? "")),
  })));
}

function artifact(pullRequests: readonly GithubPullRequest[], target: CandidateUpdateManifest["target"]): string {
  const root = mkdtempSync(join(tmpdir(), "publish-draft-test-"));
  mkdirSync(root, { recursive: true });
  const apply = Buffer.from("{\"status\":\"applied\"}");
  const bundle = Buffer.from("fixture bundle");
  const preview = Buffer.from("{\"status\":\"update-available\"}");
  const files = [
    { name: "apply-report.json", byteLength: apply.length, digest: digest(apply) },
    { name: "candidate.bundle", byteLength: bundle.length, digest: digest(bundle) },
    { name: "preview-report.json", byteLength: preview.length, digest: digest(preview) },
  ] as const;
  const manifest: CandidateUpdateManifest = {
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: context.repositoryId,
    repository: context.repository,
    run: { workflowRunId: context.workflowRunId, workflowRunAttempt: context.workflowRunAttempt },
    triggerSha: context.triggerSha,
    baseHeadSha: target.mode === "create" ? context.defaultBranchSha : target.expectedBranch.sha,
    candidateSha: sha("4"),
    candidateTreeSha: sha("5"),
    target,
    candidateDigest: computeCandidateDigest({
      baseHeadSha: target.mode === "create" ? context.defaultBranchSha : target.expectedBranch.sha,
      candidateTreeSha: sha("5"),
      applyReportDigest: files[0].digest,
    }),
    createdAt: "2026-08-20T00:00:00.000Z",
    files,
  };
  assert.equal(manifest.target.historyDigest, historyDigest(pullRequests));
  writeFileSync(join(root, "apply-report.json"), apply);
  writeFileSync(join(root, "candidate.bundle"), bundle);
  writeFileSync(join(root, "preview-report.json"), preview);
  writeFileSync(join(root, "manifest.json"), encodeArtifactManifest(manifest));
  return root;
}

test("create publishes a normal branch before one draft PR and emits an exact receipt", async () => {
  const target = {
    mode: "create" as const,
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    expectedBranch: { state: "absent" as const },
    historyDigest: historyDigest([]),
  };
  const directory = artifact([], target);
  const adapter = createFakeGithubAdapter();
  try {
    const result = await publishDraft({ adapter, artifactDirectory: directory, context, now: () => new Date("2026-08-20T01:00:00.000Z") });
    assert.equal(result.kind, "published");
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["create-branch", "create-draft-pull-request"]);
    const receipt = decodeDraftReceipt(result.receipt);
    assert.equal(receipt.prNumber, 1);
    assert.equal(receipt.headSha, sha("4"));
    assert.equal(receipt.manifestDigest, digest(readFileSync(join(directory, "manifest.json"))));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ready update becomes draft before normal fast-forward append", async () => {
  const existing = pull({ draft: false });
  const classified = classifyPrBody(existing.body, existing.draft);
  assert.equal(classified.kind, "strict");
  if (classified.kind !== "strict") return;
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: classified.markerDigest,
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const adapter = createFakeGithubAdapter({ branches: [{ ref: existing.headRef, sha: existing.headSha }], pullRequests: [existing] });
  try {
    await publishDraft({ adapter, artifactDirectory: directory, context, now: () => new Date("2026-08-20T01:00:00.000Z") });
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), [
      "update-pull-request",
      "append-branch",
      "update-pull-request",
    ]);
    assert.equal((await adapter.readBranch(existing.headRef))?.sha, sha("4"));
    const updated = await adapter.readPullRequest(1);
    assert.equal(updated?.draft, true);
    const body = classifyPrBody(updated?.body ?? null, true);
    assert.equal(body.kind, "strict");
    if (body.kind === "strict") {
      assert.equal(body.envelope.expectedHeadSha, sha("4"));
      assert.equal(body.envelope.validation.status, "pending");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("human head mismatch stops before every write", async () => {
  const expected = pull();
  const classified = classifyPrBody(expected.body, expected.draft);
  assert.equal(classified.kind, "strict");
  if (classified.kind !== "strict") return;
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: expected.headRef,
    expectedBranch: { state: "present" as const, sha: expected.headSha },
    markerDigest: classified.markerDigest,
    historyDigest: historyDigest([expected]),
  };
  const directory = artifact([expected], target);
  const changed = { ...expected, headSha: sha("9") };
  const adapter = createFakeGithubAdapter({ branches: [{ ref: expected.headRef, sha: sha("9") }], pullRequests: [changed] });
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /intervention-required/);
    assert.deepEqual(adapter.transcript, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("multiple strict open PRs stop before every write", async () => {
  const first = pull();
  const second = pull({
    prNumber: 2,
    headRef: "refs/heads/automation/skill-updates/g000002",
    body: renderManagedPrSection({
      schemaVersion: 1,
      kind: "managed-pr",
      repositoryId: context.repositoryId,
      repository: context.repository,
      generation: 2,
      headRef: "refs/heads/automation/skill-updates/g000002",
      baseRef: context.defaultBranchRef,
      expectedHeadSha: sha("6"),
      validationBaseSha: context.triggerSha,
      candidateDigest: `sha256:${"1".repeat(64)}`,
      reportDigest: `sha256:${"2".repeat(64)}`,
      validation: { status: "pending", run: { workflowRunId: "100", workflowRunAttempt: 1 } },
    }, "second fixture"),
    headSha: sha("6"),
  });
  const directory = artifact([first], {
    mode: "update",
    generation: 1,
    prNumber: 1,
    headRef: first.headRef,
    expectedBranch: { state: "present", sha: first.headSha },
    markerDigest: (classifyPrBody(first.body, first.draft) as Extract<ReturnType<typeof classifyPrBody>, { kind: "strict" }>).markerDigest,
    historyDigest: historyDigest([first]),
  });
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: first.headRef, sha: first.headSha }, { ref: second.headRef, sha: second.headSha }],
    pullRequests: [first, second],
  });
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /open-pr-conflict/);
    assert.deepEqual(adapter.transcript, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validated manual resume creates the next generation after closed-unmerged", async () => {
  const closed = pull({ state: "closed", draft: true });
  const target = {
    mode: "create" as const,
    generation: 2,
    headRef: "refs/heads/automation/skill-updates/g000002",
    expectedBranch: { state: "absent" as const },
    historyDigest: historyDigest([closed]),
  };
  const directory = artifact([closed], target);
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: closed.headRef, sha: closed.headSha }],
    pullRequests: [closed],
  });
  try {
    const result = await publishDraft({
      adapter,
      artifactDirectory: directory,
      context: { ...context, resumeClosed: true },
    });
    assert.equal(result.kind, "published");
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["create-branch", "create-draft-pull-request"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
