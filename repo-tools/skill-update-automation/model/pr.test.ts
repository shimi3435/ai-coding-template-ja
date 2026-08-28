import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPrBody,
  classifyPrRootV2,
  decodePrEnvelope,
  encodePrEnvelope,
  encodePrRootV2,
  renderManagedPrSection,
  renderManagedPrRootV2,
  prStateSnapshotV2,
  validatePrJournalV2,
} from "./pr.ts";
import { appendJournalEntryDigest } from "./journal.ts";

const sha = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

test("PrEnvelope pending variant roundtrips with exact managed identity", () => {
  const envelope = {
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: "123",
    repository: "owner/repo",
    generation: 9,
    headRef: "refs/heads/automation/skill-updates/g000009",
    baseRef: "refs/heads/main",
    expectedHeadSha: sha("a"),
    validationBaseSha: sha("b"),
    candidateDigest: digest("c"),
    reportDigest: digest("d"),
    validation: { status: "pending", run: { workflowRunId: "456", workflowRunAttempt: 2 } },
  } as const;

  assert.deepEqual(decodePrEnvelope(encodePrEnvelope(envelope)), envelope);
  assert.throws(() => encodePrEnvelope({
    ...envelope,
    validation: { ...envelope.validation, command: "task check" },
  }));
});

test("PrEnvelope validates passed, command failure, and infrastructure failure variants", () => {
  const base = {
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: "123",
    repository: "owner/repo",
    generation: 9,
    headRef: "refs/heads/automation/skill-updates/g000009",
    baseRef: "refs/heads/main",
    expectedHeadSha: sha("a"),
    validationBaseSha: sha("b"),
    candidateDigest: digest("c"),
    reportDigest: digest("d"),
  } as const;
  const run = { workflowRunId: "456", workflowRunAttempt: 2 } as const;
  const variants = [
    { status: "passed", run },
    { status: "failed", run, failureKind: "command", command: "task check" },
    { status: "failed", run, failureKind: "infrastructure", stage: "artifact" },
  ] as const;

  for (const validation of variants) {
    const envelope = { ...base, validation };
    assert.deepEqual(decodePrEnvelope(encodePrEnvelope(envelope)), envelope);
  }
  assert.throws(() => encodePrEnvelope({
    ...base,
    validation: { status: "failed", run, failureKind: "infrastructure", stage: "network" },
  }));
});

test("PR marker codec distinguishes exact, partial, and absent identity", () => {
  const envelope = {
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: "123",
    repository: "owner/repo",
    generation: 9,
    headRef: "refs/heads/automation/skill-updates/g000009",
    baseRef: "refs/heads/main",
    expectedHeadSha: sha("a"),
    validationBaseSha: sha("b"),
    candidateDigest: digest("c"),
    reportDigest: digest("d"),
    validation: { status: "pending", run: { workflowRunId: "456", workflowRunAttempt: 2 } },
  } as const;
  const section = renderManagedPrSection(envelope, "2 cohorts pending");

  const exact = classifyPrBody(`human prefix\n${section}\nhuman suffix`, true);
  assert.equal(exact.kind, "strict");
  if (exact.kind === "strict") assert.deepEqual(exact.envelope, envelope);
  assert.equal(classifyPrBody(`${section}\n${section}`, true).kind, "partial");
  assert.equal(classifyPrBody("human only", true).kind, "none");
  assert.equal(classifyPrBody(section, false).kind, "partial");
  assert.equal(classifyPrBody(renderManagedPrSection(envelope, "first paragraph\n\nsecond paragraph"), true).kind, "strict");
});

test("immutable PR root v2 binds creator numeric ID and initial snapshot", () => {
  const initialSnapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repo",
    generation: 9,
    headRef: "refs/heads/automation/skill-updates/g000009",
    baseRef: "refs/heads/main",
    expectedHeadSha: sha("a"),
    validationBaseSha: sha("b"),
    candidateDigest: digest("c"),
    reportDigest: digest("d"),
    draft: true,
    validation: { status: "pending", run: { workflowRunId: "456", workflowRunAttempt: 2 } },
  });
  const root = {
    schemaVersion: 2,
    kind: "managed-pr-root",
    repositoryId: "123",
    repository: "owner/repo",
    creatorUserId: "456",
    generation: 9,
    headRef: "refs/heads/automation/skill-updates/g000009",
    baseRef: "refs/heads/main",
    candidateDigest: digest("c"),
    initialSnapshot,
    initialSnapshotDigest: initialSnapshot.stateDigest,
  } as const;
  assert.deepEqual(classifyPrRootV2(renderManagedPrRootV2(root, "immutable root")), {
    kind: "strict",
    root,
    summary: "immutable root",
  });
  assert.deepEqual(encodePrRootV2(root), encodePrRootV2(root));
  assert.throws(() => renderManagedPrRootV2({
    ...root,
    initialSnapshotDigest: digest("f"),
  }, "digest mismatch"), /snapshot|digest/);
  assert.equal(classifyPrRootV2(renderManagedPrSection({
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: "123",
    repository: "owner/repo",
    generation: 9,
    headRef: "refs/heads/automation/skill-updates/g000009",
    baseRef: "refs/heads/main",
    expectedHeadSha: sha("a"),
    validationBaseSha: sha("b"),
    candidateDigest: digest("c"),
    reportDigest: digest("d"),
    validation: { status: "pending", run: { workflowRunId: "456", workflowRunAttempt: 2 } },
  }, "v1")).kind, "version-conflict");
});

test("PR journal semantic validation rejects stable identity changes in any snapshot", () => {
  const state = {
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repo",
    generation: 9,
    headRef: "refs/heads/automation/skill-updates/g000009",
    baseRef: "refs/heads/main",
    expectedHeadSha: sha("a"),
    validationBaseSha: sha("b"),
    candidateDigest: digest("c"),
    reportDigest: digest("d"),
    draft: true,
    validation: { status: "pending", run: { workflowRunId: "456", workflowRunAttempt: 2 } },
  } as const;
  const snapshot = prStateSnapshotV2(state);
  const root = {
    schemaVersion: 2,
    kind: "managed-pr-root",
    repositoryId: "123",
    repository: "owner/repo",
    creatorUserId: "456",
    generation: 9,
    headRef: state.headRef,
    baseRef: state.baseRef,
    candidateDigest: state.candidateDigest,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  } as const;
  const first = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 7,
    creatorUserId: root.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: digest("e"),
    snapshot,
  });
  const changed = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 7,
    creatorUserId: root.creatorUserId,
    sequence: 2,
    previousDigest: first.digest,
    phase: "committed",
    operation: "validation",
    operationId: digest("f"),
    snapshot: prStateSnapshotV2({ ...state, repository: "other/repo" }),
  });
  assert.throws(() => validatePrJournalV2(root, {
    entries: [first, changed],
    pending: null,
    snapshot: changed.snapshot,
  }), /identity/);
});
