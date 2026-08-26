import assert from "node:assert/strict";
import test from "node:test";

import {
  GithubAdapterError,
  createFakeGithubAdapter,
  type FakeGithubPullRequest,
} from "./fake-adapter.ts";
import {
  managedIssueTitle,
  managedPrTitle,
  renderManagedIssueSection,
  renderManagedPrSection,
} from "../model/index.ts";

const sha = (digit: string): string => digit.repeat(40);

function prSection(status: "pending" | "passed" = "pending", expectedHeadSha = sha("2")): string {
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
  }, status);
}

function issueSection(repositoryId = "123"): string {
  return renderManagedIssueSection({
    schemaVersion: 1,
    kind: "managed-issue",
    repositoryId,
    repository: "owner/repository",
    entries: [],
  }, "現在の未解決項目なし");
}

function pullRequest(overrides: Partial<FakeGithubPullRequest> = {}): FakeGithubPullRequest {
  return {
    prNumber: 1,
    state: "open",
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: sha("2"),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: managedPrTitle,
    body: `human before\n${prSection()}\nhuman after`,
    ...overrides,
  };
}

test("branch update is exact-head append-only", async () => {
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: "refs/heads/automation/skill-updates/g000001", sha: sha("1") }],
  });

  await adapter.appendBranch({
    ref: "refs/heads/automation/skill-updates/g000001",
    expectedSha: sha("1"),
    candidateSha: sha("2"),
  });
  await assert.rejects(
    adapter.appendBranch({
      ref: "refs/heads/automation/skill-updates/g000001",
      expectedSha: sha("1"),
      candidateSha: sha("3"),
    }),
    /expected head/,
  );
  assert.equal((await adapter.readBranch("refs/heads/automation/skill-updates/g000001"))?.sha, sha("2"));
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["append-branch", "append-branch"]);
});

test("draft PR creation binds to the live branch head", async () => {
  const mismatched = createFakeGithubAdapter({
    branches: [{ ref: "refs/heads/automation/skill-updates/g000001", sha: sha("1") }],
  });
  const createInput = {
    headRepositoryId: "123",
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: sha("2"),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: managedPrTitle,
    body: prSection(),
  };
  await assert.rejects(mismatched.createDraftPullRequest(createInput), /branch head/);

  const adapter = createFakeGithubAdapter({
    branches: [{ ref: "refs/heads/automation/skill-updates/g000001", sha: sha("2") }],
  });
  const created = await adapter.createDraftPullRequest(createInput);
  assert.equal(created.state, "open");
  assert.equal(created.draft, true);
  assert.equal(created.merged, false);
});

test("PR lifecycle is draft-first and close remains unmerged", async () => {
  const adapter = createFakeGithubAdapter({ pullRequests: [pullRequest()] });

  await adapter.updatePullRequest({ prNumber: 1, draft: false, managedSection: prSection("passed") });
  await adapter.closePullRequest(1);
  assert.deepEqual(await adapter.readPullRequest(1), pullRequest({ state: "closed", draft: false, body: `human before\n${prSection("passed")}\nhuman after` }));
  await adapter.reopenPullRequest(1);
  assert.equal((await adapter.readPullRequest(1))?.state, "open");

  const merged = createFakeGithubAdapter({ pullRequests: [pullRequest({ state: "closed", merged: true })] });
  await assert.rejects(merged.reopenPullRequest(1), /merged PR/);
});

test("PR and issue managed updates preserve marker-external human text", async () => {
  const adapter = createFakeGithubAdapter({
    pullRequests: [pullRequest()],
    issues: [{
      issueNumber: 7,
      state: "open",
      title: managedIssueTitle,
      body: `human issue before\n${issueSection()}\nhuman issue after`,
      isPullRequest: false,
    }],
  });

  await adapter.updatePullRequest({ prNumber: 1, managedSection: prSection() });
  await adapter.updateIssue({ issueNumber: 7, managedSection: issueSection() });
  assert.match((await adapter.readPullRequest(1))?.body ?? "", /^human before[\s\S]*human after$/);
  assert.match((await adapter.readIssue(7))?.body ?? "", /^human issue before[\s\S]*human issue after$/);
});

test("managed updates reject marker identity that diverges from live resources", async () => {
  const adapter = createFakeGithubAdapter({
    pullRequests: [pullRequest()],
    issues: [{
      issueNumber: 7,
      state: "open",
      title: managedIssueTitle,
      body: issueSection(),
      isPullRequest: false,
    }],
  });

  await assert.rejects(
    adapter.updatePullRequest({ prNumber: 1, managedSection: prSection("pending", sha("3")) }),
    /expected head/,
  );
  await assert.rejects(
    adapter.updateIssue({ issueNumber: 7, managedSection: issueSection("999") }),
    /repository identity/,
  );
});

test("permission denial leaves state unchanged and never falls back", async () => {
  const adapter = createFakeGithubAdapter({
    pullRequests: [pullRequest()],
    faults: [{ operation: "update-pull-request", kind: "permission-denied" }],
  });

  await assert.rejects(
    adapter.updatePullRequest({ prNumber: 1, draft: false, managedSection: prSection("passed") }),
    (error: unknown) => error instanceof GithubAdapterError && error.kind === "permission-denied" &&
      error.operation === "update-pull-request" && error.postState === "unchanged",
  );
  assert.equal((await adapter.readPullRequest(1))?.draft, true);
  assert.deepEqual(adapter.transcript, [{
    operation: "update-pull-request",
    outcome: "permission-denied",
    postState: "unchanged",
  }]);
});

test("partial read response is explicit and cannot be mistaken for complete discovery", async () => {
  const adapter = createFakeGithubAdapter({
    pullRequests: [pullRequest()],
    faults: [{ operation: "list-pull-requests", kind: "partial-response" }],
  });

  const page = await adapter.listPullRequests();
  assert.equal(page.complete, false);
  assert.equal(page.items.length, 1);
});
