import assert from "node:assert/strict";
import test from "node:test";

import { managedIssueTitle, renderManagedIssueSection } from "../model/index.ts";
import { discoverManagedIssue } from "./issue-discovery.ts";

function managedBody(): string {
  return renderManagedIssueSection({
    schemaVersion: 1,
    kind: "managed-issue",
    repositoryId: "123",
    repository: "owner/repository",
    entries: [],
  }, "現在の未解決項目なし");
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    issueNumber: 10,
    state: "open" as const,
    title: managedIssueTitle,
    body: managedBody(),
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

test("latest closed strict issue is reopened instead of creating a duplicate", () => {
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

  assert.equal(result.kind, "reopen");
  if (result.kind === "reopen") assert.equal(result.issueNumber, 14);
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
