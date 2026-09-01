import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FakeGithubAdapter } from "../github/fake-adapter.ts";
import { discoverManagedPullRequests } from "../github/discovery.ts";
import { loadPrJournal } from "../publish/pr-journal.ts";
import { reconcileReadyTrackingFailures } from "../finalize/ready-reconciliation.ts";
import {
  appendJournalEntryDigest,
  classifyIssueRootV2,
  computeCandidateDigest,
  computeIssueEntryKey,
  decodeArtifactManifest,
  encodeArtifactManifest,
  issueStateSnapshotV2,
  journalCommentBody,
  managedIssueTitle,
  managedPrTitle,
  prStateSnapshotV2,
  reduceJournalCommentsV2,
  renderManagedIssueRootV2,
  renderManagedPrRootV2,
  validateIssueJournalV2,
} from "../model/index.ts";
import { recoverCrossRunTransition } from "./lifecycle.ts";

const sha = (character: string): string => character.repeat(40);
const digest = (bytes: Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function runPreparedBranchRecovery(live: "before" | "after") {
  const rootDirectory = mkdtempSync(join(tmpdir(), "prepared-cross-run-recovery-test-"));
  const recoveryDirectory = join(rootDirectory, "recovery");
  const originDirectory = join(rootDirectory, "origin");
  const outputDirectory = join(rootDirectory, "current");
  mkdirSync(recoveryDirectory);
  mkdirSync(originDirectory);
  const originRun = { workflowRunId: "20", workflowRunAttempt: 1 } as const;
  const currentRun = { workflowRunId: "21", workflowRunAttempt: 2 } as const;
  const beforeHeadSha = sha("2");
  const afterHeadSha = sha("3");
  const candidateTreeSha = sha("4");
  const apply = Buffer.from("apply", "utf8");
  const bundle = Buffer.from("bundle", "utf8");
  const preview = Buffer.from("preview", "utf8");
  const applyDigest = digest(apply);
  const candidateDigest = computeCandidateDigest({ baseHeadSha: beforeHeadSha, candidateTreeSha, applyReportDigest: applyDigest });
  const common = {
    schemaVersion: 2 as const,
    kind: "managed-pr-state" as const,
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    validationBaseSha: sha("0"),
    reportDigest: applyDigest,
    draft: true,
    validation: { status: "pending" as const, run: originRun },
  };
  const before = prStateSnapshotV2({ ...common, expectedHeadSha: beforeHeadSha, candidateDigest: `sha256:${"1".repeat(64)}` });
  const after = prStateSnapshotV2({ ...common, expectedHeadSha: afterHeadSha, candidateDigest });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    generation: 1,
    headRef: common.headRef,
    baseRef: common.baseRef,
    candidateDigest: `sha256:${"1".repeat(64)}`,
    initialSnapshot: before,
    initialSnapshotDigest: before.stateDigest,
  };
  const rootEntry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: "456",
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot: before,
  });
  const transitionOperationId = digest(Buffer.from([
    "transition-v2", "1", "branch-append", before.stateDigest, after.stateDigest,
  ].join("\0"), "utf8"));
  const prepared = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: "456",
    sequence: 2,
    previousDigest: rootEntry.digest,
    phase: "prepared",
    operation: "branch-append",
    operationId: transitionOperationId,
    snapshot: after,
  });
  const comments = [rootEntry, prepared].map((entry, index) => ({
    id: String(index + 1),
    authorUserId: "456",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
    body: journalCommentBody(entry),
  }));
  const liveHeadSha = live === "before" ? beforeHeadSha : afterHeadSha;
  const pullRequest = {
    prNumber: 1,
    state: "open" as const,
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: common.headRef,
    headSha: liveHeadSha,
    baseRepositoryId: "123",
    baseRef: common.baseRef,
    title: managedPrTitle,
    body: renderManagedPrRootV2(root, "fixture"),
    authorUserId: "456",
    lastEditedAt: null,
    journalComments: comments,
  };
  const decision = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: common.baseRef,
    resumeClosed: false,
    paginationComplete: true,
    currentRun,
    pullRequests: [pullRequest],
  }).decision;
  assert.equal(decision.kind, "recoverable-transition");
  if (decision.kind !== "recoverable-transition") throw new Error("fixture recovery decision missing");
  writeFileSync(join(recoveryDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "recovery",
    repositoryId: "123",
    repository: "owner/repository",
    run: currentRun,
    triggerSha: sha("0"),
    baseHeadSha: beforeHeadSha,
    target: decision.target,
    createdAt: "2026-08-30T01:00:00.000Z",
    files: [],
  }));
  for (const [name, bytes] of [["apply-report.json", apply], ["candidate.bundle", bundle], ["preview-report.json", preview]] as const) {
    writeFileSync(join(originDirectory, name), bytes);
  }
  writeFileSync(join(originDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: "123",
    repository: "owner/repository",
    run: originRun,
    triggerSha: sha("0"),
    baseHeadSha: beforeHeadSha,
    candidateSha: afterHeadSha,
    candidateTreeSha,
    target: {
      mode: "update",
      generation: 1,
      prNumber: 1,
      headRef: common.headRef,
      expectedBranch: { state: "present", sha: beforeHeadSha },
      markerDigest: rootEntry.digest,
      historyDigest: `sha256:${"5".repeat(64)}`,
    },
    candidateDigest,
    createdAt: "2026-08-29T01:00:00.000Z",
    files: [
      { name: "apply-report.json", byteLength: apply.length, digest: applyDigest },
      { name: "candidate.bundle", byteLength: bundle.length, digest: digest(bundle) },
      { name: "preview-report.json", byteLength: preview.length, digest: digest(preview) },
    ],
  }));
  const adapter = new FakeGithubAdapter({
    branches: [{ ref: common.headRef, sha: liveHeadSha }],
    pullRequests: [pullRequest],
  });
  return {
    rootDirectory,
    adapter,
    input: {
      adapter,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: outputDirectory,
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: common.baseRef,
      triggerSha: sha("0"),
      currentRun,
      now: () => new Date("2026-08-30T01:01:00Z"),
    },
  } as const;
}

test("run N+1 retries an exact prepared branch append from before state", async () => {
  const fixture = await runPreparedBranchRecovery("before");
  try {
    assert.equal((await recoverCrossRunTransition(fixture.input)).kind, "validation-required");
    assert.equal(fixture.adapter.transcript.filter((entry) => entry.operation === "append-branch").length, 1);
    assert.equal(fixture.adapter.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 1);
  } finally {
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("run N+1 appends committed only when prepared branch mutation already succeeded", async () => {
  const fixture = await runPreparedBranchRecovery("after");
  try {
    assert.equal((await recoverCrossRunTransition(fixture.input)).kind, "validation-required");
    assert.equal(fixture.adapter.transcript.filter((entry) => entry.operation === "append-branch").length, 0);
    assert.equal(fixture.adapter.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 1);
  } finally {
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("recovery rejects a modified origin artifact before any GitHub write", async () => {
  const fixture = await runPreparedBranchRecovery("before");
  try {
    writeFileSync(join(fixture.input.originArtifactDirectory, "preview-report.json"), "modified");
    await assert.rejects(
      recoverCrossRunTransition(fixture.input),
      /digest.*一致しません/,
    );
    assert.deepEqual(fixture.adapter.transcript, []);
  } finally {
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("recovery rejects a missing origin artifact before any GitHub write", async () => {
  const fixture = await runPreparedBranchRecovery("before");
  try {
    rmSync(join(fixture.input.originArtifactDirectory, "manifest.json"));
    await assert.rejects(recoverCrossRunTransition(fixture.input), /ENOENT/);
    assert.deepEqual(fixture.adapter.transcript, []);
  } finally {
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("recovery rejects a divergent live branch before any GitHub write", async () => {
  const fixture = await runPreparedBranchRecovery("before");
  try {
    fixture.adapter.setBranchForTest("refs/heads/automation/skill-updates/g000001", sha("9"));
    await assert.rejects(
      recoverCrossRunTransition(fixture.input),
      /recovery-required/,
    );
    assert.deepEqual(fixture.adapter.transcript, []);
  } finally {
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("recovery rejects a foreign creator before any GitHub write", async () => {
  const fixture = await runPreparedBranchRecovery("before");
  try {
    await assert.rejects(
      recoverCrossRunTransition({ ...fixture.input, creatorUserId: "999" }),
      /creator.*一致しません/,
    );
    assert.deepEqual(fixture.adapter.transcript, []);
  } finally {
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("run N+1 restores an exact commentless root then enters current validation", async () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "commentless-cross-run-recovery-test-"));
  const recoveryDirectory = join(rootDirectory, "recovery");
  const originDirectory = join(rootDirectory, "origin");
  const outputDirectory = join(rootDirectory, "current");
  mkdirSync(recoveryDirectory);
  mkdirSync(originDirectory);
  const originRun = { workflowRunId: "30", workflowRunAttempt: 1 } as const;
  const currentRun = { workflowRunId: "31", workflowRunAttempt: 2 } as const;
  const headSha = sha("3");
  const treeSha = sha("4");
  const apply = Buffer.from("apply", "utf8");
  const bundle = Buffer.from("bundle", "utf8");
  const preview = Buffer.from("preview", "utf8");
  const applyDigest = digest(apply);
  const candidateDigest = computeCandidateDigest({ baseHeadSha: sha("0"), candidateTreeSha: treeSha, applyReportDigest: applyDigest });
  const snapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha: headSha,
    validationBaseSha: sha("0"),
    candidateDigest,
    reportDigest: applyDigest,
    draft: true,
    validation: { status: "pending", run: originRun },
  });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    candidateDigest,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const pullRequest = {
    prNumber: 1,
    state: "open" as const,
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: root.headRef,
    headSha,
    baseRepositoryId: "123",
    baseRef: root.baseRef,
    title: managedPrTitle,
    body: renderManagedPrRootV2(root, "fixture"),
    authorUserId: "456",
    lastEditedAt: null,
    journalComments: [],
  };
  const decision = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: root.baseRef,
    resumeClosed: false,
    paginationComplete: true,
    currentRun,
    pullRequests: [pullRequest],
  }).decision;
  assert.equal(decision.kind, "recoverable-transition");
  if (decision.kind !== "recoverable-transition") return;
  writeFileSync(join(recoveryDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "recovery",
    repositoryId: "123",
    repository: "owner/repository",
    run: currentRun,
    triggerSha: sha("0"),
    baseHeadSha: headSha,
    target: decision.target,
    createdAt: "2026-08-30T01:00:00.000Z",
    files: [],
  }));
  for (const [name, bytes] of [["apply-report.json", apply], ["candidate.bundle", bundle], ["preview-report.json", preview]] as const) {
    writeFileSync(join(originDirectory, name), bytes);
  }
  writeFileSync(join(originDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: "123",
    repository: "owner/repository",
    run: originRun,
    triggerSha: sha("0"),
    baseHeadSha: sha("0"),
    candidateSha: headSha,
    candidateTreeSha: treeSha,
    target: {
      mode: "create",
      generation: 1,
      headRef: root.headRef,
      expectedBranch: { state: "absent" },
      historyDigest: `sha256:${"5".repeat(64)}`,
    },
    candidateDigest,
    createdAt: "2026-08-29T01:00:00.000Z",
    files: [
      { name: "apply-report.json", byteLength: apply.length, digest: applyDigest },
      { name: "candidate.bundle", byteLength: bundle.length, digest: digest(bundle) },
      { name: "preview-report.json", byteLength: preview.length, digest: digest(preview) },
    ],
  }));
  const adapter = new FakeGithubAdapter({ branches: [{ ref: root.headRef, sha: headSha }], pullRequests: [pullRequest] });
  try {
    const readyAfterDiscovery = new Proxy(adapter, {
      get(source, property) {
        if (property === "readPullRequest") return async () => ({ ...pullRequest, draft: false });
        const value = Reflect.get(source, property, source) as unknown;
        return typeof value === "function" ? value.bind(source) : value;
      },
    });
    await assert.rejects(recoverCrossRunTransition({
      adapter: readyAfterDiscovery,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: outputDirectory,
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: root.baseRef,
      triggerSha: sha("0"),
      currentRun,
    }), /fresh exact state/);
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 0);

    const initialEntry = appendJournalEntryDigest({
      schemaVersion: 2,
      resourceKind: "pull-request",
      resourceNumber: 1,
      creatorUserId: root.creatorUserId,
      sequence: 1,
      previousDigest: null,
      phase: "committed",
      operation: "root",
      operationId: decision.target.operationId,
      snapshot,
    });
    const journalAfterDiscovery = new Proxy(adapter, {
      get(source, property) {
        if (property === "listJournalComments") {
          return async () => ({
            complete: true,
            items: [{
              id: "1",
              authorUserId: root.creatorUserId,
              createdAt: "2026-08-30T00:00:00Z",
              updatedAt: "2026-08-30T00:00:00Z",
              body: journalCommentBody(initialEntry),
            }],
          });
        }
        const value = Reflect.get(source, property, source) as unknown;
        return typeof value === "function" ? value.bind(source) : value;
      },
    });
    await assert.rejects(recoverCrossRunTransition({
      adapter: journalAfterDiscovery,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: outputDirectory,
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: root.baseRef,
      triggerSha: sha("0"),
      currentRun,
    }), /fresh exact state/);
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 0);

    assert.equal((await recoverCrossRunTransition({
      adapter,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: outputDirectory,
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: root.baseRef,
      triggerSha: sha("0"),
      currentRun,
    })).kind, "validation-required");
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 1);
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "append-branch").length, 0);
  } finally {
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("run N+1 completes prepared pr-ready without repeating validation or PR mutation", async () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "pr-ready-cross-run-recovery-test-"));
  const recoveryDirectory = join(rootDirectory, "recovery");
  const originDirectory = join(rootDirectory, "origin");
  const outputDirectory = join(rootDirectory, "current");
  mkdirSync(recoveryDirectory);
  mkdirSync(originDirectory);
  const originRun = { workflowRunId: "40", workflowRunAttempt: 1 } as const;
  const currentRun = { workflowRunId: "41", workflowRunAttempt: 2 } as const;
  const headSha = sha("3");
  const candidateDigest = `sha256:${"6".repeat(64)}`;
  const reportDigest = `sha256:${"7".repeat(64)}`;
  const state = {
    schemaVersion: 2 as const,
    kind: "managed-pr-state" as const,
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha: headSha,
    validationBaseSha: sha("0"),
    candidateDigest,
    reportDigest,
  };
  const before = prStateSnapshotV2({ ...state, draft: true, validation: { status: "pending", run: originRun } });
  const after = prStateSnapshotV2({ ...state, draft: false, validation: { status: "passed", run: originRun } });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    generation: 1,
    headRef: state.headRef,
    baseRef: state.baseRef,
    candidateDigest,
    initialSnapshot: before,
    initialSnapshotDigest: before.stateDigest,
  };
  const rootEntry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: "456",
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot: before,
  });
  const operationId = digest(Buffer.from(["transition-v2", "1", "pr-ready", before.stateDigest, after.stateDigest].join("\0"), "utf8"));
  const prepared = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: "456",
    sequence: 2,
    previousDigest: rootEntry.digest,
    phase: "prepared",
    operation: "pr-ready",
    operationId,
    snapshot: after,
  });
  const comments = [rootEntry, prepared].map((entry, index) => ({
    id: String(index + 1),
    authorUserId: "456",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
    body: journalCommentBody(entry),
  }));
  const pullRequest = {
    prNumber: 1,
    state: "open" as const,
    merged: false,
    draft: false,
    headRepositoryId: "123",
    headRef: state.headRef,
    headSha,
    baseRepositoryId: "123",
    baseRef: state.baseRef,
    title: managedPrTitle,
    body: renderManagedPrRootV2(root, "fixture"),
    authorUserId: "456",
    lastEditedAt: null,
    journalComments: comments,
  };
  const decision = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: state.baseRef,
    resumeClosed: false,
    paginationComplete: true,
    currentRun,
    pullRequests: [pullRequest],
  }).decision;
  assert.equal(decision.kind, "recoverable-transition");
  if (decision.kind !== "recoverable-transition") return;
  assert.equal(decision.target.mode, "prepared-pr-ready");
  writeFileSync(join(recoveryDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "recovery",
    repositoryId: "123",
    repository: "owner/repository",
    run: currentRun,
    triggerSha: sha("0"),
    baseHeadSha: headSha,
    target: decision.target,
    createdAt: "2026-08-30T01:00:00.000Z",
    files: [],
  }));
  const preview = Buffer.from("preview", "utf8");
  writeFileSync(join(originDirectory, "preview-report.json"), preview);
  writeFileSync(join(originDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: "123",
    repository: "owner/repository",
    run: originRun,
    triggerSha: sha("0"),
    baseHeadSha: headSha,
    candidateSha: headSha,
    candidateTreeSha: sha("4"),
    target: {
      mode: "validate",
      generation: 1,
      prNumber: 1,
      headRef: state.headRef,
      expectedBranch: { state: "present", sha: headSha },
      markerDigest: rootEntry.digest,
      historyDigest: `sha256:${"5".repeat(64)}`,
    },
    candidateDigest,
    createdAt: "2026-08-29T01:00:00.000Z",
    files: [{ name: "preview-report.json", byteLength: preview.length, digest: digest(preview) }],
  }));
  const failureScope = { kind: "candidate" as const, digest: candidateDigest };
  const failureEntry = {
    key: computeIssueEntryKey("validation-failed", failureScope),
    state: "validation-failed" as const,
    scope: failureScope,
    firstSeen: { run: originRun, at: "2026-08-29T00:00:00.000Z" },
    lastSeen: { run: originRun, at: "2026-08-29T00:00:00.000Z" },
    detailDigest: `sha256:${"8".repeat(64)}`,
    summary: "validation failed",
  };
  const issueSnapshot = issueStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-issue-state",
    repositoryId: "123",
    repository: "owner/repository",
    entries: [failureEntry],
  });
  const issueRoot = {
    schemaVersion: 2 as const,
    kind: "managed-issue-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    rootOperationId: `sha256:${"9".repeat(64)}`,
    initialSnapshot: issueSnapshot,
    initialSnapshotDigest: issueSnapshot.stateDigest,
  };
  const issueRootEntry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "issue",
    resourceNumber: 10,
    creatorUserId: "456",
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: issueRoot.rootOperationId,
    snapshot: issueSnapshot,
  });
  const trackingIssue = {
    issueNumber: 10,
    state: "open" as const,
    title: managedIssueTitle,
    body: renderManagedIssueRootV2(issueRoot, "Managed automation failures."),
    isPullRequest: false,
    authorUserId: "456",
    lastEditedAt: null,
    journalComments: [{
      id: "10",
      authorUserId: "456",
      createdAt: "2026-08-29T00:00:00Z",
      updatedAt: "2026-08-29T00:00:00Z",
      body: journalCommentBody(issueRootEntry),
    }],
  };
  const adapter = new FakeGithubAdapter({
    branches: [{ ref: state.headRef, sha: headSha }],
    pullRequests: [pullRequest],
    issues: [trackingIssue],
  });
  try {
    const result = await recoverCrossRunTransition({
      adapter,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: outputDirectory,
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: state.baseRef,
      triggerSha: sha("0"),
      currentRun,
    });
    assert.equal(result.kind, "ready-recovered");
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "update-pull-request").length, 0);
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 1);
    const recoveryManifest = decodeArtifactManifest(readFileSync(join(recoveryDirectory, "manifest.json")));
    if (recoveryManifest.kind !== "recovery") throw new Error("fixture recovery manifest missing");
    assert.equal(await reconcileReadyTrackingFailures({
      adapter,
      context: {
        repositoryId: "123",
        repository: "owner/repository",
        creatorUserId: "456",
        defaultBranchSha: sha("0"),
        defaultBranchRef: state.baseRef,
        now: () => new Date("2026-08-30T01:02:00Z"),
      },
      manifest: recoveryManifest,
    }), "updated");
    const currentIssue = await adapter.readIssue(10);
    if (currentIssue === null) throw new Error("tracking issue missing");
    const currentIssueRoot = classifyIssueRootV2(currentIssue.title, currentIssue.body);
    if (currentIssueRoot.kind !== "strict") throw new Error("tracking issue root invalid");
    const currentComments = await adapter.listJournalComments(10);
    const currentJournal = reduceJournalCommentsV2(currentComments.items, currentIssueRoot.root.creatorUserId);
    assert.deepEqual(validateIssueJournalV2(currentIssueRoot.root, currentJournal).at(-1)?.entries, []);
  } finally {
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("run N+1 completes prepared pr-draft then resumes the exact candidate append", async () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "pr-draft-cross-run-recovery-test-"));
  const recoveryDirectory = join(rootDirectory, "recovery");
  const originDirectory = join(rootDirectory, "origin");
  const outputDirectory = join(rootDirectory, "current");
  mkdirSync(recoveryDirectory);
  mkdirSync(originDirectory);
  const originRun = { workflowRunId: "50", workflowRunAttempt: 1 } as const;
  const currentRun = { workflowRunId: "51", workflowRunAttempt: 2 } as const;
  const oldHeadSha = sha("2");
  const candidateSha = sha("3");
  const candidateTreeSha = sha("4");
  const oldCandidateDigest = `sha256:${"1".repeat(64)}`;
  const oldReportDigest = `sha256:${"2".repeat(64)}`;
  const apply = Buffer.from("apply", "utf8");
  const bundle = Buffer.from("bundle", "utf8");
  const preview = Buffer.from("preview", "utf8");
  const applyDigest = digest(apply);
  const newCandidateDigest = computeCandidateDigest({ baseHeadSha: oldHeadSha, candidateTreeSha, applyReportDigest: applyDigest });
  const common = {
    schemaVersion: 2 as const,
    kind: "managed-pr-state" as const,
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha: oldHeadSha,
    validationBaseSha: sha("0"),
    candidateDigest: oldCandidateDigest,
    reportDigest: oldReportDigest,
  };
  const before = prStateSnapshotV2({
    ...common,
    draft: false,
    validation: { status: "passed", run: { workflowRunId: "49", workflowRunAttempt: 1 } },
  });
  const afterDraft = prStateSnapshotV2({
    ...common,
    draft: true,
    validation: { status: "pending", run: originRun },
  });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    generation: 1,
    headRef: common.headRef,
    baseRef: common.baseRef,
    candidateDigest: oldCandidateDigest,
    initialSnapshot: before,
    initialSnapshotDigest: before.stateDigest,
  };
  const rootEntry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: "456",
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot: before,
  });
  const operationId = digest(Buffer.from(["transition-v2", "1", "pr-draft", before.stateDigest, afterDraft.stateDigest].join("\0"), "utf8"));
  const prepared = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: "456",
    sequence: 2,
    previousDigest: rootEntry.digest,
    phase: "prepared",
    operation: "pr-draft",
    operationId,
    snapshot: afterDraft,
  });
  const comments = [rootEntry, prepared].map((entry, index) => ({
    id: String(index + 1),
    authorUserId: "456",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
    body: journalCommentBody(entry),
  }));
  const pullRequest = {
    prNumber: 1,
    state: "open" as const,
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: common.headRef,
    headSha: oldHeadSha,
    baseRepositoryId: "123",
    baseRef: common.baseRef,
    title: managedPrTitle,
    body: renderManagedPrRootV2(root, "fixture"),
    authorUserId: "456",
    lastEditedAt: null,
    journalComments: comments,
  };
  const decision = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: common.baseRef,
    resumeClosed: false,
    paginationComplete: true,
    currentRun,
    pullRequests: [pullRequest],
  }).decision;
  assert.equal(decision.kind, "recoverable-transition");
  if (decision.kind !== "recoverable-transition") return;
  assert.equal(decision.target.mode, "prepared-pr-draft");
  writeFileSync(join(recoveryDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "recovery",
    repositoryId: "123",
    repository: "owner/repository",
    run: currentRun,
    triggerSha: sha("0"),
    baseHeadSha: oldHeadSha,
    target: decision.target,
    createdAt: "2026-08-30T01:00:00.000Z",
    files: [],
  }));
  for (const [name, bytes] of [["apply-report.json", apply], ["candidate.bundle", bundle], ["preview-report.json", preview]] as const) {
    writeFileSync(join(originDirectory, name), bytes);
  }
  writeFileSync(join(originDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: "123",
    repository: "owner/repository",
    run: originRun,
    triggerSha: sha("0"),
    baseHeadSha: oldHeadSha,
    candidateSha,
    candidateTreeSha,
    target: {
      mode: "update",
      generation: 1,
      prNumber: 1,
      headRef: common.headRef,
      expectedBranch: { state: "present", sha: oldHeadSha },
      markerDigest: rootEntry.digest,
      historyDigest: `sha256:${"5".repeat(64)}`,
    },
    candidateDigest: newCandidateDigest,
    createdAt: "2026-08-29T01:00:00.000Z",
    files: [
      { name: "apply-report.json", byteLength: apply.length, digest: applyDigest },
      { name: "candidate.bundle", byteLength: bundle.length, digest: digest(bundle) },
      { name: "preview-report.json", byteLength: preview.length, digest: digest(preview) },
    ],
  }));
  const adapter = new FakeGithubAdapter({ branches: [{ ref: common.headRef, sha: oldHeadSha }], pullRequests: [pullRequest] });
  try {
    const result = await recoverCrossRunTransition({
      adapter,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: outputDirectory,
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: common.baseRef,
      triggerSha: sha("0"),
      currentRun,
    });
    assert.equal(result.kind, "validation-required");
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "update-pull-request").length, 0);
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "append-branch").length, 1);
    assert.equal(adapter.transcript.filter((entry) => entry.operation === "append-journal-comment").length, 3);
    const recoveredPullRequest = await adapter.readPullRequest(1);
    assert.notEqual(recoveredPullRequest, null);
    if (recoveredPullRequest !== null) {
      const recovered = await loadPrJournal(adapter, recoveredPullRequest);
      assert.deepEqual(recovered.currentState.validation.run, originRun);
    }
  } finally {
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("run N+1 resumes stale validation without mutation and emits a current-run validation artifact", async () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "cross-run-recovery-test-"));
  const recoveryDirectory = join(rootDirectory, "recovery");
  const originDirectory = join(rootDirectory, "origin");
  const outputDirectory = join(rootDirectory, "current");
  mkdirSync(recoveryDirectory);
  mkdirSync(originDirectory);
  const originRun = { workflowRunId: "10", workflowRunAttempt: 1 } as const;
  const currentRun = { workflowRunId: "11", workflowRunAttempt: 2 } as const;
  const headSha = sha("3");
  const candidateDigest = `sha256:${"6".repeat(64)}`;
  const reportDigest = digest(Buffer.from("apply", "utf8"));
  const snapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha: headSha,
    validationBaseSha: sha("0"),
    candidateDigest,
    reportDigest,
    draft: true,
    validation: { status: "pending", run: originRun },
  });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    candidateDigest,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 1,
    creatorUserId: "456",
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot,
  });
  const pullRequest = {
    prNumber: 1,
    state: "open" as const,
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: root.headRef,
    headSha,
    baseRepositoryId: "123",
    baseRef: root.baseRef,
    title: managedPrTitle,
    body: renderManagedPrRootV2(root, "fixture"),
    authorUserId: "456",
    lastEditedAt: null,
    journalComments: [{
      id: "1",
      authorUserId: "456",
      createdAt: "2026-08-30T00:00:00Z",
      updatedAt: "2026-08-30T00:00:00Z",
      body: journalCommentBody(entry),
    }],
  };
  const decision = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    currentRun,
    pullRequests: [pullRequest],
  }).decision;
  assert.equal(decision.kind, "recoverable-transition");
  if (decision.kind !== "recoverable-transition") return;
  writeFileSync(join(recoveryDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "recovery",
    repositoryId: "123",
    repository: "owner/repository",
    run: currentRun,
    triggerSha: sha("0"),
    baseHeadSha: decision.target.beforeHeadSha,
    target: decision.target,
    createdAt: "2026-08-30T01:00:00.000Z",
    files: [],
  }));
  const preview = Buffer.from("preview", "utf8");
  writeFileSync(join(originDirectory, "preview-report.json"), preview);
  writeFileSync(join(originDirectory, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: "123",
    repository: "owner/repository",
    run: originRun,
    triggerSha: sha("0"),
    baseHeadSha: headSha,
    candidateSha: headSha,
    candidateTreeSha: sha("4"),
    target: {
      mode: "validate",
      generation: 1,
      prNumber: 1,
      headRef: root.headRef,
      expectedBranch: { state: "present", sha: headSha },
      markerDigest: entry.digest,
      historyDigest: `sha256:${"5".repeat(64)}`,
    },
    candidateDigest,
    createdAt: "2026-08-29T01:00:00.000Z",
    files: [{ name: "preview-report.json", byteLength: preview.length, digest: digest(preview) }],
  }));
  const adapter = new FakeGithubAdapter({
    branches: [{ ref: root.headRef, sha: headSha }],
    pullRequests: [pullRequest],
  });

  try {
    const result = await recoverCrossRunTransition({
      adapter,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: outputDirectory,
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: "refs/heads/main",
      triggerSha: sha("0"),
      currentRun,
      now: () => new Date("2026-08-30T01:01:00Z"),
    });
    assert.equal(result.kind, "validation-required");
    assert.deepEqual(adapter.transcript, []);
    const current = decodeArtifactManifest(readFileSync(join(outputDirectory, "manifest.json")));
    assert.equal(current.kind, "existing-head-validation");
    assert.deepEqual(current.run, currentRun);
    if (current.kind === "existing-head-validation") assert.equal(current.target.markerDigest, entry.digest);

    const divergentAdapter = new FakeGithubAdapter({
      branches: [{ ref: root.headRef, sha: sha("9") }],
      pullRequests: [pullRequest],
    });
    await assert.rejects(recoverCrossRunTransition({
      adapter: divergentAdapter,
      recoveryArtifactDirectory: recoveryDirectory,
      originArtifactDirectory: originDirectory,
      outputArtifactDirectory: join(rootDirectory, "divergent-current"),
      repositoryId: "123",
      repository: "owner/repository",
      creatorUserId: "456",
      defaultBranchSha: sha("0"),
      defaultBranchRef: "refs/heads/main",
      triggerSha: sha("0"),
      currentRun,
    }), /validation target/);
    assert.deepEqual(divergentAdapter.transcript, []);
  } finally {
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});
