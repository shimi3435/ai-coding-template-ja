import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCandidateDigest,
  decodeArtifactManifest,
  decodeDraftReceipt,
  encodeArtifactManifest,
  encodeDraftReceipt,
} from "./artifact.ts";

const sha = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

test("candidate-update manifest roundtrips as exact schema-order canonical bytes", () => {
  const manifest = {
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    triggerSha: sha("a"),
    baseHeadSha: sha("b"),
    candidateSha: sha("c"),
    candidateTreeSha: sha("d"),
    target: {
      mode: "create",
      generation: 1,
      headRef: "refs/heads/automation/skill-updates/g000001",
      expectedBranch: { state: "absent" },
      historyDigest: digest("e"),
    },
    candidateDigest: "sha256:51bccf74bee5458bd5edfb402754853a97bb856465be735f338287573a99d3ec",
    createdAt: "2026-08-20T01:02:03.004Z",
    files: [
      { name: "apply-report.json", byteLength: 10, digest: digest("1") },
      { name: "candidate.bundle", byteLength: 20, digest: digest("2") },
      { name: "preview-report.json", byteLength: 30, digest: digest("3") },
    ],
  } as const;

  const bytes = encodeArtifactManifest(manifest);

  assert.deepEqual(decodeArtifactManifest(bytes), manifest);
  assert.match(bytes.toString("utf8"), /^\{"schemaVersion":1,"kind":"candidate-update","repositoryId":"123"/);
});

test("candidate-update accepts an exact update target bound to the expected branch", () => {
  const baseHeadSha = sha("b");
  const candidateTreeSha = sha("d");
  const applyReportDigest = digest("1");
  const manifest = {
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    triggerSha: sha("a"),
    baseHeadSha,
    candidateSha: sha("c"),
    candidateTreeSha,
    target: {
      mode: "update",
      generation: 9,
      prNumber: 77,
      headRef: "refs/heads/automation/skill-updates/g000009",
      expectedBranch: { state: "present", sha: baseHeadSha },
      markerDigest: digest("4"),
      historyDigest: digest("5"),
    },
    candidateDigest: computeCandidateDigest({ baseHeadSha, candidateTreeSha, applyReportDigest }),
    createdAt: "2026-08-20T01:02:03.004Z",
    files: [
      { name: "apply-report.json", byteLength: 10, digest: applyReportDigest },
      { name: "candidate.bundle", byteLength: 20, digest: digest("2") },
      { name: "preview-report.json", byteLength: 30, digest: digest("3") },
    ],
  } as const;

  assert.deepEqual(decodeArtifactManifest(encodeArtifactManifest(manifest)), manifest);
});

test("existing-head-validation binds validate target to one exact head", () => {
  const candidateSha = sha("c");
  const manifest = {
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    triggerSha: sha("a"),
    baseHeadSha: candidateSha,
    candidateSha,
    candidateTreeSha: sha("d"),
    target: {
      mode: "validate",
      generation: 9,
      prNumber: 77,
      headRef: "refs/heads/automation/skill-updates/g000009",
      expectedBranch: { state: "present", sha: candidateSha },
      markerDigest: digest("4"),
      historyDigest: digest("5"),
    },
    candidateDigest: digest("6"),
    createdAt: "2026-08-20T01:02:03.004Z",
    files: [{ name: "preview-report.json", byteLength: 30, digest: digest("3") }],
  } as const;

  assert.deepEqual(decodeArtifactManifest(encodeArtifactManifest(manifest)), manifest);
});

test("no-op manifest has no candidate fields and only a none target", () => {
  const manifest = {
    schemaVersion: 1,
    kind: "no-op",
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    triggerSha: sha("a"),
    baseHeadSha: sha("b"),
    target: { mode: "none", historyDigest: digest("5") },
    createdAt: "2026-08-20T01:02:03.004Z",
    files: [{ name: "preview-report.json", byteLength: 30, digest: digest("3") }],
  } as const;

  assert.deepEqual(decodeArtifactManifest(encodeArtifactManifest(manifest)), manifest);
  assert.throws(() => encodeArtifactManifest({ ...manifest, candidateSha: sha("c") }));
});

test("recovery manifest roundtrips five strict modes and binds origin run", () => {
  const common = {
    schemaVersion: 1 as const,
    kind: "recovery" as const,
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "999", workflowRunAttempt: 2 },
    triggerSha: sha("a"),
    baseHeadSha: sha("b"),
    createdAt: "2026-08-30T01:02:03.004Z",
    files: [] as const,
  };
  const target = {
    mode: "prepared-branch-append" as const,
    generation: 9,
    prNumber: 77,
    creatorUserId: "456",
    headRef: "refs/heads/automation/skill-updates/g000009",
    beforeHeadSha: sha("b"),
    afterHeadSha: sha("c"),
    rootDigest: digest("1"),
    journalDigest: digest("2"),
    operationId: digest("3"),
    beforeSnapshotDigest: digest("4"),
    afterSnapshotDigest: digest("5"),
    candidateDigest: digest("6"),
    reportDigest: digest("7"),
    originRun: { workflowRunId: "456", workflowRunAttempt: 1 },
  };
  const manifest = { ...common, target };

  assert.deepEqual(decodeArtifactManifest(encodeArtifactManifest(manifest)), manifest);
  assert.throws(() => encodeArtifactManifest({ ...manifest, target: { ...target, unexpected: true } }));
  assert.throws(() => encodeArtifactManifest({ ...manifest, target: { ...target, mode: "unsupported" } }));
});

test("DraftReceipt roundtrips with exact generation and managed head binding", () => {
  const receipt = {
    schemaVersion: 1,
    kind: "published-draft",
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    manifestDigest: digest("1"),
    candidateDigest: digest("2"),
    generation: 9,
    prNumber: 77,
    headRef: "refs/heads/automation/skill-updates/g000009",
    headSha: sha("a"),
    markerDigest: digest("3"),
    historyDigest: digest("4"),
    createdAt: "2026-08-20T01:02:03.004Z",
  } as const;

  assert.deepEqual(decodeDraftReceipt(encodeDraftReceipt(receipt)), receipt);
  assert.throws(() => encodeDraftReceipt({ ...receipt, headRef: "refs/heads/automation/skill-updates/g000010" }));
});
