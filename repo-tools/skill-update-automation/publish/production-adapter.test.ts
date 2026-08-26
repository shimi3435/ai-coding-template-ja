import assert from "node:assert/strict";
import test from "node:test";

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

test("lease rejection after pre-read is closed and never retries with a refreshed expectation", async () => {
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
  assert.equal(reads, 1);
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

test("composite PR update rereads a denied partial write and reports unknown post-state", async () => {
  const markerStart = "<!-- skill-update-pr-automation:pr:v1:start -->";
  const markerEnd = "<!-- skill-update-pr-automation:pr:v1:end -->";
  const oldBody = `human\n${markerStart}\nold\n${markerEnd}`;
  const current = (draft: boolean) => JSON.stringify({
    number: 1,
    state: "open",
    merged_at: null,
    draft,
    title: "chore(skills): update vendored skills",
    body: oldBody,
    head: { sha: sha("2"), ref: "automation/skill-updates/g000001", repo: { id: 123 } },
    base: { ref: "main", repo: { id: 123 } },
  });
  let call = 0;
  const adapter = new ProductionPublishAdapter({
    repository: "owner/repository",
    repositoryRoot: "/tmp",
    runner: () => {
      call += 1;
      if (call === 1) return { exitCode: 0, stdout: current(false), stderr: "" };
      if (call === 2) return { exitCode: 0, stdout: "", stderr: "" };
      if (call === 3) return { exitCode: 1, stdout: "", stderr: "HTTP 403" };
      if (call === 4) return { exitCode: 0, stdout: current(true), stderr: "" };
      throw new Error("unexpected command");
    },
  });

  await assert.rejects(
    adapter.updatePullRequest({
      prNumber: 1,
      draft: true,
      managedSection: `${markerStart}\nnew\n${markerEnd}`,
    }),
    (error: unknown) => error instanceof GithubHostPermissionError &&
      error.operation === "update-pull-request" && error.postState === "unknown",
  );
  assert.equal(call, 4);
});
