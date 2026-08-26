import assert from "node:assert/strict";
import test from "node:test";

import { managedPrTitle, renderManagedPrSection } from "../model/index.ts";
import { discoverManagedPullRequests } from "./discovery.ts";

const sha = (digit: string): string => digit.repeat(40);

function managedBody(expectedHeadSha: string, status: "pending" | "passed" = "pending"): string {
  return renderManagedPrSection({
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha,
    validationBaseSha: sha("0"),
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    validation: { status, run: { workflowRunId: "10", workflowRunAttempt: 1 } },
  }, "fixture");
}

function pull(overrides: Record<string, unknown> = {}) {
  return {
    prNumber: 1,
    state: "open" as const,
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: sha("3"),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: managedPrTitle,
    body: managedBody(sha("3")),
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
    pullRequests: [pull({ headSha: sha("4") })],
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
    pullRequests: [pull({ draft: false, body: managedBody(sha("3"), "passed") })],
  });
  assert.equal(result.decision.kind, "open");
});

test("generation conflict takes precedence over one member human-head mismatch", () => {
  const result = discoverManagedPullRequests({
    repositoryId: "123",
    repository: "owner/repository",
    defaultBaseRef: "refs/heads/main",
    resumeClosed: false,
    paginationComplete: true,
    pullRequests: [
      pull({ prNumber: 8, headSha: sha("4") }),
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
