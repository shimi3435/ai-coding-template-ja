import assert from "node:assert/strict";
import test from "node:test";

import {
  GithubAdapterError,
  createFakeGithubAdapter,
  type FakeGithubPullRequest,
} from "./fake-adapter.ts";
import { githubAdapterOperations } from "./adapter.ts";
import {
  managedPrTitle,
  renderManagedPrSection,
} from "../model/index.ts";

const sha = (digit: string): string => digit.repeat(40);

function prSection(): string {
  return renderManagedPrSection({
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha: sha("2"),
    validationBaseSha: sha("0"),
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    validation: { status: "pending", run: { workflowRunId: "10", workflowRunAttempt: 1 } },
  }, "pending");
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
    authorUserId: "456",
    lastEditedAt: null,
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

test("PR lifecycle changes draft state without updating the immutable body", async () => {
  const adapter = createFakeGithubAdapter({ pullRequests: [pullRequest()] });
  const immutableBody = pullRequest().body;

  await adapter.updatePullRequest({ prNumber: 1, draft: false });
  await adapter.closePullRequest(1);
  assert.deepEqual(await adapter.readPullRequest(1), pullRequest({ state: "closed", draft: false, body: immutableBody }));
});

test("adapter surface excludes body update and closed issue reopen operations", () => {
  const adapter = createFakeGithubAdapter({
    pullRequests: [pullRequest()],
  });

  assert.equal("updateIssue" in adapter, false);
  assert.equal("reopenIssue" in adapter, false);
  assert.equal(githubAdapterOperations.includes("update-issue" as never), false);
  assert.equal(githubAdapterOperations.includes("reopen-issue" as never), false);
});

test("permission denial leaves state unchanged and never falls back", async () => {
  const adapter = createFakeGithubAdapter({
    pullRequests: [pullRequest()],
    faults: [{ operation: "update-pull-request", kind: "permission-denied" }],
  });

  await assert.rejects(
    adapter.updatePullRequest({ prNumber: 1, draft: false }),
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
