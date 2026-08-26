import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyIssueBody,
  classifyIssueRootV2,
  computeIssueEntryKey,
  decodeIssueEnvelope,
  encodeIssueEnvelope,
  managedIssueTitle,
  renderManagedIssueSection,
  renderManagedIssueRootV2,
  selectFailureScope,
  upsertIssueEntry,
  type Scope,
} from "./issue.ts";

const digest = (character: string): string => `sha256:${character.repeat(64)}`;

test("IssueEnvelope validates a stable global-scope entry key", () => {
  const seen = {
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    at: "2026-08-20T01:02:03.004Z",
  } as const;
  const envelope = {
    schemaVersion: 1,
    kind: "managed-issue",
    repositoryId: "123",
    repository: "owner/repo",
    entries: [{
      key: "sha256:ab4d9a002ec002dd7bbcd6a52f74d4479225a11b108bd7a5332073df9c0e44c3",
      state: "updater-rejected",
      scope: { kind: "global", operation: "detect" },
      firstSeen: seen,
      lastSeen: seen,
      detailDigest: digest("d"),
      summary: "updater rejected one cohort",
    }],
  } as const;

  assert.deepEqual(decodeIssueEnvelope(encodeIssueEnvelope(envelope)), envelope);
  assert.throws(() => encodeIssueEnvelope({
    ...envelope,
    entries: [{ ...envelope.entries[0], state: "pr-identity-conflict" }],
  }));
});

test("IssueEntry accepts only exact cohort, PR, resource, and candidate scope variants", () => {
  const seen = {
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    at: "2026-08-20T01:02:03.004Z",
  } as const;
  const scopes: readonly Scope[] = [
    { kind: "cohort", cohortKey: "供給元/a" },
    { kind: "pr", mode: "single", generation: 2, prNumber: 12 },
    { kind: "pr", mode: "set", members: [{ generation: 2, prNumber: 12 }, { generation: 3, prNumber: 7 }] },
    { kind: "resource", resourceKind: "branch", identity: "refs/heads/automation/skill-updates/g000002" },
    { kind: "resource", resourceKind: "tracking-issue", identity: "issues/12" },
    { kind: "candidate", digest: digest("a") },
  ];
  const entries = scopes.map((scope) => ({
    key: computeIssueEntryKey("cleanup-failed", scope),
    state: "cleanup-failed" as const,
    scope,
    firstSeen: seen,
    lastSeen: seen,
    detailDigest: digest("d"),
    summary: "cleanup failed",
  })).sort((left, right) => Buffer.compare(Buffer.from(left.key), Buffer.from(right.key)));
  const envelope = {
    schemaVersion: 1,
    kind: "managed-issue",
    repositoryId: "123",
    repository: "owner/repo",
    entries,
  } as const;

  assert.deepEqual(decodeIssueEnvelope(encodeIssueEnvelope(envelope)), envelope);
  const badScope = { kind: "pr", mode: "set", members: [{ generation: 3, prNumber: 7 }, { generation: 2, prNumber: 12 }] } as const;
  assert.throws(() => computeIssueEntryKey("cleanup-failed", badScope));
  assert.throws(() => computeIssueEntryKey("cleanup-failed", {
    kind: "resource",
    resourceKind: "branch",
    identity: "refs/heads/automation/skill-updates/g000000",
  }));
});

test("issue marker codec treats title or marker partial identity as conflict", () => {
  const envelope = {
    schemaVersion: 1,
    kind: "managed-issue",
    repositoryId: "123",
    repository: "owner/repo",
    entries: [],
  } as const;
  const section = renderManagedIssueSection(envelope, "現在の未解決項目なし");
  const exact = classifyIssueBody(managedIssueTitle, `human prefix\n${section}\nhuman suffix`);

  assert.equal(exact.kind, "strict");
  if (exact.kind === "strict") assert.deepEqual(exact.envelope, envelope);
  assert.equal(classifyIssueBody(managedIssueTitle, "human only").kind, "partial");
  assert.equal(classifyIssueBody("different", section).kind, "partial");
  assert.equal(classifyIssueBody("different", "human only").kind, "none");
});

test("tracking entry reducer selects one most-specific scope and preserves firstSeen", () => {
  const firstSeen = {
    run: { workflowRunId: "1", workflowRunAttempt: 1 },
    at: "2026-08-20T01:02:03.004Z",
  } as const;
  const lastSeen = {
    run: { workflowRunId: "2", workflowRunAttempt: 1 },
    at: "2026-08-21T01:02:03.004Z",
  } as const;
  const scope = selectFailureScope({
    candidateDigest: digest("a"),
    resource: { resourceKind: "branch", identity: "refs/heads/automation/skill-updates/g000002" },
    pr: { mode: "single", generation: 2, prNumber: 12 },
    cohortKey: "upstream/repo",
    operation: "publish-finalize",
  });
  assert.deepEqual(scope, { kind: "candidate", digest: digest("a") });

  const first = upsertIssueEntry([], {
    state: "candidate-invalid",
    scope,
    seen: firstSeen,
    detailDigest: digest("b"),
    summary: "first",
  });
  const second = upsertIssueEntry(first, {
    state: "candidate-invalid",
    scope,
    seen: lastSeen,
    detailDigest: digest("c"),
    summary: "last",
  });

  assert.equal(second.length, 1);
  assert.deepEqual(second[0]?.firstSeen, firstSeen);
  assert.deepEqual(second[0]?.lastSeen, lastSeen);
  assert.equal(second[0]?.summary, "last");
});

test("stable issue key uses canonical HTML-sensitive escaping", () => {
  assert.equal(
    computeIssueEntryKey("updater-rejected", { kind: "cohort", cohortKey: "<&>" }),
    "sha256:1eee570981e4282c216c520f4f96b3795c158776623b45ec433234b303d113f0",
  );
});

test("immutable issue root v2 binds creator and treats v1 as a version conflict", () => {
  const root = {
    schemaVersion: 2,
    kind: "managed-issue-root",
    repositoryId: "123",
    repository: "owner/repo",
    creatorUserId: "456",
    rootOperationId: digest("a"),
    initialSnapshotDigest: digest("b"),
  } as const;
  assert.deepEqual(classifyIssueRootV2(managedIssueTitle, renderManagedIssueRootV2(root, "immutable root")), {
    kind: "strict",
    root,
    summary: "immutable root",
  });
  const v1 = renderManagedIssueSection({
    schemaVersion: 1,
    kind: "managed-issue",
    repositoryId: "123",
    repository: "owner/repo",
    entries: [],
  }, "v1");
  assert.equal(classifyIssueRootV2(managedIssueTitle, v1).kind, "version-conflict");
});
