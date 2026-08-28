import assert from "node:assert/strict";
import test from "node:test";

import {
  appendJournalEntryDigest,
  issueStateSnapshotV2,
  journalCommentBody,
  managedIssueTitle,
  renderManagedIssueRootV2,
} from "../model/index.ts";
import { discoverManagedIssue } from "./issue-discovery.ts";

function managedFields(issueNumber: number) {
  const snapshot = issueStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-issue-state",
    repositoryId: "123",
    repository: "owner/repository",
    entries: [],
  });
  const rootOperationId = `sha256:${"a".repeat(64)}`;
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-issue-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    rootOperationId,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "issue",
    resourceNumber: issueNumber,
    creatorUserId: root.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: rootOperationId,
    snapshot,
  });
  return {
    body: renderManagedIssueRootV2(root, "現在の未解決項目なし"),
    journalComments: [{
      id: "1",
      authorUserId: root.creatorUserId,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body: journalCommentBody(entry),
    }],
  };
}

function issue(overrides: Record<string, unknown> = {}) {
  const issueNumber = Number(overrides.issueNumber ?? 10);
  return {
    issueNumber,
    state: "open" as const,
    title: managedIssueTitle,
    authorUserId: "456",
    lastEditedAt: null,
    ...managedFields(issueNumber),
    isPullRequest: false,
    ...overrides,
  };
}

test("partial issue identity stops issue writes only", () => {
  const result = discoverManagedIssue({
    repositoryId: "123",
    repository: "owner/repository",
    paginationComplete: true,
    issues: [issue({ body: null })],
  });

  assert.deepEqual(result, {
    kind: "issue-identity-conflict",
    issueWritePolicy: "none",
    prWritePolicy: "continue",
    summaryOnly: true,
    issueNumbers: [10],
  });
});

test("multiple open strict issues stop issue writes and report sorted members", () => {
  const result = discoverManagedIssue({
    repositoryId: "123",
    repository: "owner/repository",
    paginationComplete: true,
    issues: [issue({ issueNumber: 20 }), issue({ issueNumber: 3 })],
  });

  assert.deepEqual(result, {
    kind: "issue-cardinality-conflict",
    issueWritePolicy: "none",
    prWritePolicy: "continue",
    summaryOnly: true,
    issueNumbers: [3, 20],
  });
});

test("closed strict issues are terminal and a later failure targets a new root", () => {
  const result = discoverManagedIssue({
    repositoryId: "123",
    repository: "owner/repository",
    paginationComplete: true,
    issues: [
      issue({ issueNumber: 8, state: "closed" }),
      issue({ issueNumber: 14, state: "closed" }),
      issue({ issueNumber: 99, isPullRequest: true }),
    ],
  });

  assert.equal(result.kind, "create");
  assert.equal(result.issueWritePolicy, "create");
});

test("incomplete pagination stops issue writes without blocking safe PR lifecycle", () => {
  const result = discoverManagedIssue({
    repositoryId: "123",
    repository: "owner/repository",
    paginationComplete: false,
    issues: [],
  });

  assert.deepEqual(result, {
    kind: "issue-discovery-incomplete",
    issueWritePolicy: "none",
    prWritePolicy: "continue",
    summaryOnly: true,
    issueNumbers: [],
  });
});

test("edited or foreign-author issue journal marker fails closed", () => {
  const original = issue();
  for (const journalComments of [
    original.journalComments?.map((comment) => ({ ...comment, updatedAt: "2026-08-27T00:00:01Z" })),
    original.journalComments?.map((comment) => ({ ...comment, authorUserId: "999" })),
  ]) {
    const result = discoverManagedIssue({
      repositoryId: "123",
      repository: "owner/repository",
      paginationComplete: true,
      issues: [{ ...original, journalComments }],
    });
    assert.equal(result.kind, "issue-identity-conflict");
    assert.equal(result.issueWritePolicy, "none");
  }
});

test("commentless root recovery requires the immutable issue author and unedited body evidence", () => {
  const original = issue();
  for (const override of [
    { authorUserId: "999" },
    { lastEditedAt: "2026-08-28T00:00:00Z" },
  ]) {
    const result = discoverManagedIssue({
      repositoryId: "123",
      repository: "owner/repository",
      paginationComplete: true,
      issues: [{ ...original, ...override, journalComments: [] }],
    });
    assert.equal(result.kind, "issue-identity-conflict");
    assert.equal(result.issueWritePolicy, "none");
  }
});
