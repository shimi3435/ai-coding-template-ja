import assert from "node:assert/strict";
import test from "node:test";

import { issueStateSnapshotV2, managedIssueTitle, renderManagedIssueRootV2 } from "../model/index.ts";
import { GithubHostPermissionError, ProductionPublishAdapter, type HostCommandRunner } from "./production-adapter.ts";

const sha = (digit: string): string => digit.repeat(40);

test("branch append uses an authenticated explicit lease with the exact expected head", async () => {
  const transcript: Array<Readonly<{ command: string; args: readonly string[] }>> = [];
  const branchRef = "refs/heads/automation/skill-updates/g000001";
  const runner: HostCommandRunner = (command, args) => {
    transcript.push({ command, args });
    if (args.includes("ls-remote")) return { exitCode: 0, stdout: `${sha("1")}\t${branchRef}\n`, stderr: "" };
    if (args.includes("push")) return { exitCode: 0, stdout: "", stderr: "" };
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  const adapter = new ProductionPublishAdapter({ repository: "owner/repository", repositoryRoot: "/tmp", runner });
  await adapter.appendBranch({ ref: branchRef, expectedSha: sha("1"), candidateSha: sha("2") });
  assert.equal(transcript.length, 2);
  assert.deepEqual(transcript[1], {
    command: "git",
    args: [
      "-c",
      "credential.helper=!gh auth git-credential",
      "push",
      `--force-with-lease=${branchRef}:${sha("1")}`,
      "https://github.com/owner/repository.git",
      `${sha("2")}:${branchRef}`,
    ],
  });
  assert.equal(transcript[1]!.args.filter((arg) => arg.startsWith("--force-with-lease=")).length, 1);
});

test("branch create and delete use explicit absence and exact-SHA leases", async () => {
  const pushes: readonly string[][] = [];
  const mutablePushes = pushes as string[][];
  const branchRef = "refs/heads/automation/skill-updates/g000001";
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args) => {
      if (args.includes("ls-remote")) return { exitCode: 0, stdout: `${sha("1")}\t${branchRef}\n`, stderr: "" };
      if (args.includes("push")) mutablePushes.push([...args]);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  await adapter.createBranch({ ref: branchRef, sha: sha("1") });
  await adapter.deleteBranch({ ref: branchRef, expectedSha: sha("1") });
  assert.ok(pushes[0]!.includes(`--force-with-lease=${branchRef}:`));
  assert.ok(pushes[1]!.includes(`--force-with-lease=${branchRef}:${sha("1")}`));
  assert.equal(pushes.some((args) => args.includes("--force-with-lease")), false);
});

test("lease rejection rereads state but never retries with a refreshed expectation", async () => {
  const branchRef = "refs/heads/automation/skill-updates/g000001";
  let reads = 0;
  let pushes = 0;
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args) => {
      if (args.includes("ls-remote")) {
        reads += 1;
        return { exitCode: 0, stdout: `${sha("1")}\t${branchRef}\n`, stderr: "" };
      }
      pushes += 1;
      assert.ok(args.includes(`--force-with-lease=${branchRef}:${sha("1")}`));
      return { exitCode: 1, stdout: "", stderr: "rejected (stale info)" };
    },
  });
  await assert.rejects(adapter.appendBranch({ ref: branchRef, expectedSha: sha("1"), candidateSha: sha("2") }), /stale info/);
  assert.equal(reads, 2);
  assert.equal(pushes, 1);
});

test("journal comments are fully paginated with numeric author identity and appended without update", async () => {
  const calls: Array<Readonly<{ args: readonly string[]; input?: string }>> = [];
  const apiComment = (id: number, body: string) => ({
    id,
    body,
    user: { id: 456 },
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
  });
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args, options) => {
      calls.push({ args, input: options?.input });
      if (args.includes("--paginate")) return { exitCode: 0, stdout: JSON.stringify([[apiComment(1, "first")], [apiComment(2, "second")]]), stderr: "" };
      return { exitCode: 0, stdout: JSON.stringify(apiComment(3, JSON.parse(options?.input ?? "{}").body)), stderr: "" };
    },
  });
  assert.deepEqual(await adapter.listJournalComments(7), {
    complete: true,
    items: [
      { id: "1", authorUserId: "456", createdAt: "2026-08-27T00:00:00Z", updatedAt: "2026-08-27T00:00:00Z", body: "first" },
      { id: "2", authorUserId: "456", createdAt: "2026-08-27T00:00:00Z", updatedAt: "2026-08-27T00:00:00Z", body: "second" },
    ],
  });
  assert.equal((await adapter.appendJournalComment(7, "third")).body, "third");
  assert.equal(calls.some((call) => call.args.includes("PATCH")), false);
});

test("PR and Issue reads include numeric author identity and GraphQL body edit evidence", async () => {
  const apiPull = {
    number: 7,
    state: "open",
    merged_at: null,
    draft: true,
    title: "chore(skills): update vendored skills",
    body: "immutable",
    user: { id: 456 },
    head: { sha: sha("2"), ref: "automation/skill-updates/g000001", repo: { id: 123 } },
    base: { ref: "main", repo: { id: 123 } },
  };
  const apiIssue = {
    number: 8,
    state: "open",
    title: "Skill update automation requires attention",
    body: "immutable",
    user: { id: 456 },
  };
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args) => {
      if (args.at(-1) === "repos/owner/repository/pulls/7") {
        return { exitCode: 0, stdout: JSON.stringify(apiPull), stderr: "" };
      }
      if (args.at(-1) === "repos/owner/repository/issues/8") {
        return { exitCode: 0, stdout: JSON.stringify(apiIssue), stderr: "" };
      }
      if (args.includes("graphql")) {
        const field = args.some((arg) => arg === "number=7") ? "pullRequest" : "issue";
        return {
          exitCode: 0,
          stdout: JSON.stringify({ data: { repository: { [field]: { lastEditedAt: null } } } }),
          stderr: "",
        };
      }
      throw new Error(`unexpected args: ${args.join(" ")}`);
    },
  });

  assert.equal((await adapter.readPullRequest(7))?.authorUserId, "456");
  assert.equal((await adapter.readPullRequest(7))?.lastEditedAt, null);
  assert.equal((await adapter.readIssue(8))?.authorUserId, "456");
  assert.equal((await adapter.readIssue(8))?.lastEditedAt, null);
});

test("issue listing skips pull request GraphQL and hydrates only a strict commentless v2 issue root", async () => {
  const snapshot = issueStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-issue-state",
    repositoryId: "123",
    repository: "owner/repository",
    entries: [],
  });
  const managedBody = renderManagedIssueRootV2({
    schemaVersion: 2,
    kind: "managed-issue-root",
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    rootOperationId: `sha256:${"1".repeat(64)}`,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  }, "fixture");
  const calls: string[][] = [];
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args) => {
      calls.push([...args]);
      if (args.some((argument) => argument.includes("/comments"))) {
        return {
          exitCode: 0,
          stdout: JSON.stringify([[
            {
              id: 99,
              body: "human comment",
              user: { id: 999 },
              created_at: "2026-08-28T00:00:00Z",
              updated_at: "2026-08-28T00:00:00Z",
            },
          ]]),
          stderr: "",
        };
      }
      if (args.includes("graphql")) {
        assert.ok(args.includes("number=8"));
        return {
          exitCode: 0,
          stdout: JSON.stringify({ data: { repository: { issue: { lastEditedAt: null } } } }),
          stderr: "",
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify([[
          {
            number: 7,
            state: "open",
            title: "unmanaged pull request",
            body: null,
            user: { id: 100 },
            pull_request: { url: "https://api.github.test/pulls/7" },
          },
          { number: 8, state: "open", title: managedIssueTitle, body: managedBody, user: { id: 456 } },
          { number: 9, state: "open", title: "human issue", body: null, user: { id: 200 } },
        ]]),
        stderr: "",
      };
    },
  });

  const issues = await adapter.listIssues();
  assert.equal(issues.items.length, 3);
  assert.equal(issues.items[0]!.isPullRequest, true);
  assert.equal(issues.items[1]!.lastEditedAt, null);
  assert.equal(issues.items[1]!.journalComments?.length, 1);
  assert.equal(calls.filter((args) => args.includes("graphql")).length, 1);
});

test("head mismatch refuses push", async () => {
  let writes = 0;
  const branchRef = "refs/heads/automation/skill-updates/g000001";
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args) => {
      if (args.includes("push")) writes += 1;
      return { exitCode: 0, stdout: `${sha("9")}\t${branchRef}\n`, stderr: "" };
    },
  });
  await assert.rejects(adapter.appendBranch({ ref: branchRef, expectedSha: sha("1"), candidateSha: sha("2") }), /expected head/);
  assert.equal(writes, 0);
});

test("production permission denial is closed and never falls back to another credential", async () => {
  const calls: string[][] = [];
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args) => {
      calls.push([...args]);
      return { exitCode: 1, stdout: "", stderr: "gh: Resource not accessible by integration (HTTP 403)" };
    },
  });
  await assert.rejects(adapter.closePullRequest(1), (error: unknown) =>
    error instanceof GithubHostPermissionError && error.kind === "permission-denied" &&
      error.operation === "close-pull-request" && error.postState === "unchanged");
  assert.equal(calls.length, 1);
  assert.equal(calls.some((args) => args.includes("--hostname") || args.includes("--with-token")), false);
});

test("draft update rereads a denied write and reports unchanged post-state", async () => {
  const oldBody = "immutable root";
  const current = (draft: boolean) => JSON.stringify({
    number: 1,
    state: "open",
    merged_at: null,
    draft,
    title: "chore(skills): update vendored skills",
    body: oldBody,
    user: { id: 456 },
    head: { sha: sha("2"), ref: "automation/skill-updates/g000001", repo: { id: 123 } },
    base: { ref: "main", repo: { id: 123 } },
  });
  let call = 0;
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: (_command, args) => {
      call += 1;
      if (args.includes("graphql")) {
        return { exitCode: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: { lastEditedAt: null } } } }), stderr: "" };
      }
      if (args.includes("ready")) return { exitCode: 1, stdout: "", stderr: "HTTP 403" };
      if (args.some((arg) => arg === "repos/owner/repository/pulls/1")) {
        return { exitCode: 0, stdout: current(false), stderr: "" };
      }
      throw new Error("unexpected command");
    },
  });

  await assert.rejects(
    adapter.updatePullRequest({
      prNumber: 1,
      draft: true,
    }),
    (error: unknown) => error instanceof GithubHostPermissionError &&
      error.operation === "update-pull-request" && error.postState === "unchanged",
  );
  assert.equal(call, 5);
});
