import assert from "node:assert/strict";
import test from "node:test";

import {
  appendJournalEntryDigest,
  journalCommentBody,
  managedPrTitle,
  prStateSnapshotV2,
  renderManagedPrRootV2,
} from "../model/index.ts";
import { discoverManagedPullRequests } from "./discovery.ts";

const sha = (digit: string): string => digit.repeat(40);

function managedFields(
  expectedHeadSha: string,
  status: "pending" | "passed" = "pending",
  prNumber = 1,
): Readonly<{ body: string; journalComments: readonly ReturnType<typeof comment>[] }> {
  const snapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha,
    validationBaseSha: sha("0"),
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    draft: status !== "passed",
    validation: { status, run: { workflowRunId: "10", workflowRunAttempt: 1 } },
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
    candidateDigest: `sha256:${"1".repeat(64)}`,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: prNumber,
    creatorUserId: root.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot,
  });
  return { body: renderManagedPrRootV2(root, "fixture"), journalComments: [comment(entry)] };
}

function comment(entry: ReturnType<typeof appendJournalEntryDigest>) {
  return {
    id: "1",
    authorUserId: "456",
    createdAt: "2026-08-27T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
    body: journalCommentBody(entry),
  };
}

function pull(overrides: Record<string, unknown> = {}) {
  const headSha = typeof overrides.headSha === "string" ? overrides.headSha : sha("3");
  const draft = typeof overrides.draft === "boolean" ? overrides.draft : true;
  return {
    prNumber: 1,
    state: "open" as const,
    merged: false,
    draft,
    headRepositoryId: "123",
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha,
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: managedPrTitle,
    authorUserId: "456",
    lastEditedAt: null,
    ...managedFields(headSha, draft ? "pending" : "passed", Number(overrides.prNumber ?? 1)),
    ...overrides,
  };
}

test("cross-repository mimic is excluded with warning while exact managed PR remains selectable", () => {
  const result = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    pullRequests: [pull({ prNumber: 99, headRepositoryId: "999" }), pull()],
  });
  assert.equal(result.decision.kind, "open");
  assert.deepEqual(result.warnings, ["cross-repository automation mimic: #99"]);
});

test("same-repository partial identity is summary-only and blocks every external write", () => {
  const result = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    pullRequests: [pull({ body: null })],
  });
  assert.deepEqual(result.decision, {
    kind: "pr-identity-conflict",
    writePolicy: "none",
    summaryOnly: true,
    prNumber: 1,
  });
});

test("incomplete PR pagination blocks every external write", () => {
  const result = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: false,
    pullRequests: [pull()],
  });
  assert.deepEqual(result.decision, {
    kind: "recovery-required",
    writePolicy: "none",
    reason: "pr-discovery-incomplete",
  });
});

test("strict managed human head mismatch permits issue write only", () => {
  const result = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    pullRequests: [pull({ headSha: sha("4"), ...managedFields(sha("3")) })],
  });
  assert.deepEqual(result.decision, {
    kind: "intervention-required",
    writePolicy: "issue-only",
    prNumber: 1,
    scope: { kind: "pr", mode: "single", generation: 1, prNumber: 1 },
  });
});

test("ready managed PR remains a strict open lifecycle state", () => {
  const result = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    pullRequests: [pull({ draft: false, ...managedFields(sha("3"), "passed") })],
  });
  assert.equal(result.decision.kind, "open");
});

test("commentless PR root is recoverable only with matching author, unedited body, and exact initial live state", () => {
  const exact = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    pullRequests: [pull({ journalComments: [] })],
  });
  assert.equal(exact.decision.kind, "open");

  for (const override of [
    { authorUserId: "999" },
    { lastEditedAt: "2026-08-28T00:00:00Z" },
    { headSha: sha("9") },
  ]) {
    const rejected = discoverManagedPullRequests({
      repositoryId: "123",
      repository: "owner/repository",
      defaultBaseRef: "refs/heads/main",
      resumeClosed: false,
      paginationComplete: true,
      pullRequests: [{ ...pull({ journalComments: [] }), ...override }],
    });
    assert.equal(rejected.decision.kind, "pr-identity-conflict");
  }
});

test("generation conflict takes precedence over one member human-head mismatch", () => {
  const result = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    pullRequests: [
      pull({ prNumber: 8, headSha: sha("4"), ...managedFields(sha("3"), "pending", 8) }),
      pull({ prNumber: 3 }),
    ],
  });
  assert.deepEqual(result.decision, {
    kind: "generation-conflict",
    state: "generation-conflict",
    writePolicy: "issue-only",
    scope: {
      kind: "pr",
      mode: "set",
      members: [
        { generation: 1, prNumber: 3 },
        { generation: 1, prNumber: 8 },
      ],
    },
  });
});
