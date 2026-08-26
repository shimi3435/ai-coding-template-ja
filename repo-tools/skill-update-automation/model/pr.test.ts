import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPrBody,
  decodePrEnvelope,
  encodePrEnvelope,
  renderManagedPrSection,
} from "./pr.ts";

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
