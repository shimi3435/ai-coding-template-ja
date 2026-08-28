import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import { createFakeGithubAdapter } from "../github/fake-adapter.ts";
import { decodeJournalCommentBodyV2, managedPrTitle } from "../model/index.ts";
import { FakeSmokeHost } from "./fake-host.ts";
import {
  buildFreshSmokeRecoveryPreviewV2,
  buildFreshSmokePreviewV2,
  executeFreshSmokeRecoveryPreviewV2,
  executeFreshSmokePreviewV2,
  runFreshSmokeV2,
  type FreshSmokeInputV2,
} from "./fresh-v2.ts";
import { runFreshSmokeCli } from "./fresh-cli.ts";

const sha = (digit: string): string => digit.repeat(40);
const input: FreshSmokeInputV2 = {
  repositoryId: "123",
  repository: "owner/fresh-smoke",
  creatorUserId: "456",
  run: { workflowRunId: "789", workflowRunAttempt: 1 },
  defaultBranchRef: "refs/heads/main",
  defaultBranchSha: sha("0"),
  sourceParentCommit: sha("1"),
  sourceCommit: sha("2"),
  createdAt: "2026-08-27T00:00:00.000Z",
  sourceRelation: "ahead",
};

function freshAdapter() {
  return createFakeGithubAdapter({ branches: [{ ref: input.defaultBranchRef, sha: input.defaultBranchSha }] });
}

type LiveProjection = "before" | "after" | "missing";

function withLiveProjectionsAfterAppend(
  adapter: ReturnType<typeof freshAdapter>,
  projections: Readonly<{
    pullRequests: readonly LiveProjection[];
    branches?: readonly LiveProjection[];
  }>,
) {
  let stalePullRequest: Awaited<ReturnType<typeof adapter.readPullRequest>> = null;
  let branchRef: string | null = null;
  let beforeBranchSha: string | null = null;
  let pullRequestRead = 0;
  let branchRead = 0;
  return new Proxy(adapter, {
    get(target, property) {
      if (property === "appendBranch") {
        return async (append: Parameters<typeof target.appendBranch>[0]) => {
          const pulls = await target.listPullRequests();
          stalePullRequest = pulls.items.find((pullRequest) => pullRequest.headRef === append.ref) ?? null;
          await target.appendBranch(append);
          branchRef = append.ref;
          beforeBranchSha = append.expectedSha;
          pullRequestRead = 0;
          branchRead = 0;
        };
      }
      if (property === "readPullRequest") {
        return async (prNumber: number) => {
          if (stalePullRequest?.prNumber === prNumber && pullRequestRead < projections.pullRequests.length) {
            const projection = projections.pullRequests[pullRequestRead++];
            if (projection === "missing") return null;
            if (projection === "before") return structuredClone(stalePullRequest);
          }
          return await target.readPullRequest(prNumber);
        };
      }
      if (property === "readBranch") {
        return async (ref: string) => {
          const branches = projections.branches ?? [];
          if (ref === branchRef && branchRead < branches.length) {
            const projection = branches[branchRead++];
            if (projection === "missing") return null;
            if (projection === "before") return { ref, sha: beforeBranchSha! };
          }
          return await target.readBranch(ref);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function withPersistentHumanCommentAfterPrCreate(adapter: ReturnType<typeof freshAdapter>) {
  let createdPrNumber: number | null = null;
  return new Proxy(adapter, {
    get(target, property) {
      if (property === "createDraftPullRequest") {
        return async (...args: Parameters<typeof target.createDraftPullRequest>) => {
          const pullRequest = await target.createDraftPullRequest(...args);
          createdPrNumber = pullRequest.prNumber;
          return pullRequest;
        };
      }
      if (property === "listJournalComments") {
        return async (resourceNumber: number) => {
          const comments = await target.listJournalComments(resourceNumber);
          if (resourceNumber !== createdPrNumber) return comments;
          return {
            ...comments,
            items: [{
              id: "99",
              authorUserId: "999",
              createdAt: "2026-08-28T00:00:00Z",
              updatedAt: "2026-08-28T00:00:00Z",
              body: "human comment",
            }, ...comments.items],
          };
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function sink() {
  const chunks: Buffer[] = [];
  return {
    stream: new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }),
    text: () => Buffer.concat(chunks).toString("utf8"),
  };
}

function cliArgs(): string[] {
  return [
    "--repository", input.repository,
    "--repository-id", input.repositoryId,
    "--creator-user-id", input.creatorUserId,
    "--run-id", input.run.workflowRunId,
    "--run-attempt", String(input.run.workflowRunAttempt),
    "--default-branch-ref", input.defaultBranchRef,
    "--default-branch-sha", input.defaultBranchSha,
    "--source-parent-commit", input.sourceParentCommit,
    "--source-commit", input.sourceCommit,
  ];
}

function identityHost(commitComparisons?: Readonly<Record<string, {
  status: "ahead" | "behind" | "identical" | "diverged";
  aheadBy: number;
  behindBy: number;
}>>) {
  return new FakeSmokeHost({
    repository: { id: input.repositoryId, fullName: input.repository, defaultBranchRef: input.defaultBranchRef },
    workflowRuns: [{
      id: input.run.workflowRunId,
      attempt: input.run.workflowRunAttempt,
      repositoryId: input.repositoryId,
      repository: input.repository,
      headSha: input.sourceCommit,
    }],
    commitParents: { [input.sourceCommit]: input.sourceParentCommit },
    commitComparisons,
  });
}

test("fresh smoke preview and mismatched approval perform zero writes", async () => {
  for (const approval of [null, `sha256:${"9".repeat(64)}`]) {
    const adapter = freshAdapter();
    const result = await runFreshSmokeV2(input, adapter, async () => approval);
    assert.deepEqual(result, { kind: "not-approved" });
    assert.deepEqual(adapter.transcript, []);
  }
});

test("fresh smoke CLI prints read-only preview before EOF approval", async () => {
  const adapter = freshAdapter();
  const stdout = sink();
  const stderr = sink();
  const result = await runFreshSmokeCli(cliArgs(), {
    createAdapter: () => adapter,
    createIdentityHost: () => identityHost(),
    readCreatorUserId: async () => input.creatorUserId,
    input: Readable.from([]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    now: () => new Date(input.createdAt),
  });
  assert.equal(result.exitCode, 2);
  assert.match(stdout.text(), /fresh-real-host-smoke-preview/);
  assert.match(stdout.text(), /sha256:[0-9a-f]{64}/);
  assert.match(stderr.text(), /writeは実行していません/);
  assert.deepEqual(adapter.transcript, []);
});

test("fresh smoke CLI accepts behind source relation only for residual recovery preview", async () => {
  const adapter = freshAdapter();
  await adapter.createBranch({ ref: "refs/heads/automation/skill-updates/g900001", sha: input.sourceCommit });
  adapter.transcript.length = 0;
  const stdout = sink();
  const stderr = sink();
  const result = await runFreshSmokeCli(cliArgs(), {
    createAdapter: () => adapter,
    createIdentityHost: () => identityHost({
      [`${input.defaultBranchSha}...${input.sourceCommit}`]: { status: "behind", aheadBy: 0, behindBy: 1 },
    }),
    readCreatorUserId: async () => input.creatorUserId,
    input: Readable.from([]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    now: () => new Date(input.createdAt),
  });
  assert.equal(result.exitCode, 2);
  assert.match(stdout.text(), /fresh-real-host-smoke-recovery-preview/);
  assert.match(stdout.text(), /"sourceRelation":"merged"/);
  assert.deepEqual(adapter.transcript, []);
});

test("fresh smoke rejects v1 managed resources before write", async () => {
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: input.defaultBranchRef, sha: input.defaultBranchSha }],
    pullRequests: [{
      prNumber: 1,
      state: "open",
      merged: false,
      draft: true,
      headRepositoryId: input.repositoryId,
      headRef: "refs/heads/human/topic",
      headSha: sha("3"),
      baseRepositoryId: input.repositoryId,
      baseRef: input.defaultBranchRef,
      title: managedPrTitle,
      body: "<!-- skill-update-pr-automation:pr:v1:start -->",
      authorUserId: input.creatorUserId,
      lastEditedAt: null,
    }],
  });
  await assert.rejects(buildFreshSmokePreviewV2(input, adapter), /v1|managed resource/);
  assert.deepEqual(adapter.transcript, []);
});

test("fresh smoke rejects stale preview before a second write", async () => {
  const adapter = freshAdapter();
  const preview = await buildFreshSmokePreviewV2(input, adapter);
  await adapter.createBranch({ ref: preview.plan.branchRef, sha: input.sourceParentCommit });
  await assert.rejects(executeFreshSmokePreviewV2(preview, adapter), /既に存在|stale/);
  assert.equal(adapter.transcript.length, 1);
});

test("approved fresh smoke exercises v2 chains, terminal issues, and exact branch cleanup", async () => {
  const adapter = freshAdapter();
  const result = await runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber, checkpointDigest) => {
      await adapter.mergePullRequestForTest(prNumber);
      return checkpointDigest;
    },
  );
  assert.equal(result.kind, "executed");
  if (result.kind !== "executed") throw new Error("fresh smoke must execute");
  assert.equal(await adapter.readBranch("refs/heads/automation/skill-updates/g900001"), null);
  const pullRequest = await adapter.readPullRequest(result.prNumber);
  assert.equal(pullRequest?.state, "closed");
  assert.equal(pullRequest?.draft, false);
  const prComments = await adapter.listJournalComments(result.prNumber);
  assert.deepEqual(prComments.items.map((comment) => {
    const entry = decodeJournalCommentBodyV2(comment.body);
    return entry === null ? null : [entry.operation, entry.phase];
  }), [
    ["root", "committed"],
    ["branch-append", "prepared"],
    ["branch-append", "committed"],
    ["validation", "committed"],
    ["pr-ready", "prepared"],
    ["pr-ready", "committed"],
  ]);
  assert.equal(result.issueNumbers.length, 2);
  for (const issueNumber of result.issueNumbers) {
    assert.equal((await adapter.readIssue(issueNumber))?.state, "closed");
    assert.equal((await adapter.listJournalComments(issueNumber)).items.length, 1);
  }
  assert.equal(adapter.transcript.some((entry) => String(entry.operation) === "reopen-issue"), false);
  assert.equal(adapter.transcript.some((entry) => String(entry.operation) === "update-issue"), false);
});

test("approved fresh smoke ignores a persistent marker-free human comment at the PR root checkpoint", async () => {
  const source = freshAdapter();
  const adapter = withPersistentHumanCommentAfterPrCreate(source);
  const result = await runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber, checkpointDigest) => {
      await adapter.mergePullRequestForTest(prNumber);
      return checkpointDigest;
    },
  );

  assert.equal(result.kind, "executed");
  if (result.kind !== "executed") throw new Error("fresh smoke must execute");
  const comments = await adapter.listJournalComments(result.prNumber);
  assert.equal(comments.items.filter((comment) => decodeJournalCommentBodyV2(comment.body) === null).length, 1);
  assert.equal(comments.items.filter((comment) => decodeJournalCommentBodyV2(comment.body)?.operation === "root").length, 1);
});

test("approved fresh smoke waits for a delayed pull request head projection without repeating branch append", async () => {
  const source = freshAdapter();
  const adapter = withLiveProjectionsAfterAppend(source, { pullRequests: ["before", "before", "before"] });
  const result = await runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber, checkpointDigest) => {
      await adapter.mergePullRequestForTest(prNumber);
      return checkpointDigest;
    },
  );
  assert.equal(result.kind, "executed");
  assert.equal(source.transcript.filter((entry) => entry.operation === "append-branch").length, 1);
  if (result.kind !== "executed") throw new Error("fresh smoke must execute");
  const comments = await source.listJournalComments(result.prNumber);
  assert.equal(comments.items.map((comment) => decodeJournalCommentBodyV2(comment.body)).filter((entry) =>
    entry?.operation === "branch-append" && entry.phase === "committed").length, 1);
});

test("approved fresh smoke fails closed when the pull request head projection does not converge", async () => {
  const source = freshAdapter();
  const adapter = withLiveProjectionsAfterAppend(source, {
    pullRequests: Array.from<LiveProjection>({ length: 20 }).fill("before"),
  });
  await assert.rejects(runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
  ), /recovery-required/);
  assert.equal(source.transcript.filter((entry) => entry.operation === "append-branch").length, 1);
  const pulls = await source.listPullRequests();
  assert.equal(pulls.items.length, 1);
  const comments = await source.listJournalComments(pulls.items[0]!.prNumber);
  assert.deepEqual(comments.items.map((comment) => {
    const entry = decodeJournalCommentBodyV2(comment.body);
    return entry === null ? null : [entry.operation, entry.phase];
  }), [
    ["root", "committed"],
    ["branch-append", "prepared"],
  ]);
});

test("approved fresh smoke fails closed when a pull request projection disappears before converging", async () => {
  const source = freshAdapter();
  const adapter = withLiveProjectionsAfterAppend(source, { pullRequests: ["before", "missing"] });
  await assert.rejects(runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber, checkpointDigest) => {
      await adapter.mergePullRequestForTest(prNumber);
      return checkpointDigest;
    },
  ), /recovery-required/);
  assert.equal(source.transcript.filter((entry) => entry.operation === "append-branch").length, 1);
  const pulls = await source.listPullRequests();
  const comments = await source.listJournalComments(pulls.items[0]!.prNumber);
  assert.equal(comments.items.some((comment) => {
    const entry = decodeJournalCommentBodyV2(comment.body);
    return entry?.operation === "branch-append" && entry.phase === "committed";
  }), false);
});

test("approved fresh smoke fails closed when an observed after branch projection regresses to before", async () => {
  const source = freshAdapter();
  const adapter = withLiveProjectionsAfterAppend(source, {
    pullRequests: ["before", "before", "after"],
    branches: ["after", "before", "after"],
  });
  await assert.rejects(runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber, checkpointDigest) => {
      await adapter.mergePullRequestForTest(prNumber);
      return checkpointDigest;
    },
  ), /recovery-required/);
  assert.equal(source.transcript.filter((entry) => entry.operation === "append-branch").length, 1);
  const pulls = await source.listPullRequests();
  const comments = await source.listJournalComments(pulls.items[0]!.prNumber);
  assert.equal(comments.items.some((comment) => {
    const entry = decodeJournalCommentBodyV2(comment.body);
    return entry?.operation === "branch-append" && entry.phase === "committed";
  }), false);
});

test("approved fresh smoke ignores unrelated open issues when locating created generations", async () => {
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: input.defaultBranchRef, sha: input.defaultBranchSha }],
    issues: [{
      issueNumber: 1,
      state: "open",
      title: "Human issue",
      body: "Unrelated and unchanged.",
      isPullRequest: false,
      authorUserId: "999",
      lastEditedAt: null,
    }],
  });

  const result = await runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber, checkpointDigest) => {
      await adapter.mergePullRequestForTest(prNumber);
      return checkpointDigest;
    },
  );
  assert.equal(result.kind, "executed");
  assert.deepEqual(await adapter.readIssue(1), {
    issueNumber: 1,
    state: "open",
    title: "Human issue",
    body: "Unrelated and unchanged.",
    isPullRequest: false,
    authorUserId: "999",
    lastEditedAt: null,
  });
});

test("residual branch requires a new recovery preview approval before exact delete", async () => {
  const adapter = freshAdapter();
  await adapter.createBranch({ ref: "refs/heads/automation/skill-updates/g900001", sha: input.sourceParentCommit });
  adapter.transcript.length = 0;
  let previewKind = "";
  const unapproved = await runFreshSmokeV2(input, adapter, async (preview) => {
    previewKind = preview.kind;
    return null;
  });
  assert.deepEqual(unapproved, { kind: "not-approved" });
  assert.equal(previewKind, "fresh-real-host-smoke-recovery-preview");
  assert.deepEqual(adapter.transcript, []);
  const recovered = await runFreshSmokeV2(input, adapter, async (_preview, digest) => digest);
  assert.equal(recovered.kind, "recovered");
  assert.equal(await adapter.readBranch("refs/heads/automation/skill-updates/g900001"), null);
});

test("unfinished merge checkpoint recovers only after a new terminal preview approval", async () => {
  const adapter = freshAdapter();
  await assert.rejects(
    runFreshSmokeV2(input, adapter, async (_preview, digest) => digest, async () => null),
    /merge checkpoint未完了/,
  );
  const branch = await adapter.readBranch("refs/heads/automation/skill-updates/g900001");
  assert.equal(branch?.sha, input.sourceCommit);
  const recovered = await runFreshSmokeV2(input, adapter, async (preview, digest) => {
    assert.equal(preview.kind, "fresh-real-host-smoke-recovery-preview");
    return digest;
  });
  assert.equal(recovered.kind, "recovered");
  assert.equal(await adapter.readBranch("refs/heads/automation/skill-updates/g900001"), null);
  if (recovered.kind !== "recovered") throw new Error("recovery expected");
  for (const number of recovered.pullRequestNumbers) assert.equal((await adapter.readPullRequest(number))?.state, "closed");
  for (const number of recovered.issueNumbers) assert.equal((await adapter.readIssue(number))?.state, "closed");
});

test("closed terminal-prepared recovery deletes only the preview-bound residual branch", async () => {
  const source = freshAdapter();
  const lagging = withLiveProjectionsAfterAppend(source, {
    pullRequests: Array.from<LiveProjection>({ length: 20 }).fill("before"),
  });
  await assert.rejects(runFreshSmokeV2(
    input,
    lagging,
    async (_preview, digest) => digest,
  ), /recovery-required/);
  source.transcript.length = 0;

  const recovered = await runFreshSmokeV2(input, source, async (preview, digest) => {
    assert.equal(preview.kind, "fresh-real-host-smoke-recovery-preview");
    return digest;
  });

  assert.equal(recovered.kind, "recovered");
  assert.equal(await source.readBranch("refs/heads/automation/skill-updates/g900001"), null);
  assert.deepEqual(source.transcript.map((entry) => entry.operation), ["close-pull-request", "delete-branch"]);
});

test("post-merge interruption uses merged source identity for terminal recovery", async () => {
  const adapter = freshAdapter();
  const mergedDefaultSha = sha("8");
  await assert.rejects(runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber) => {
      await adapter.mergePullRequestForTest(prNumber);
      adapter.setBranchForTest(input.defaultBranchRef, mergedDefaultSha);
      return null;
    },
  ), /merge checkpoint未完了/);
  const recovered = await runFreshSmokeV2(
    {
      ...input,
      defaultBranchSha: mergedDefaultSha,
      createdAt: "2026-08-27T00:05:00.000Z",
      sourceRelation: "merged",
    },
    adapter,
    async (preview, digest) => {
      assert.equal(preview.kind, "fresh-real-host-smoke-recovery-preview");
      assert.equal(preview.sourceRelation, "merged");
      return digest;
    },
  );
  assert.equal(recovered.kind, "recovered");
  assert.equal(await adapter.readBranch("refs/heads/automation/skill-updates/g900001"), null);
});

test("recovery rejects PR journal and live-state mismatch before write", async () => {
  const source = freshAdapter();
  await assert.rejects(
    runFreshSmokeV2(input, source, async (_preview, digest) => digest, async () => null),
    /merge checkpoint未完了/,
  );
  const pulls = await source.listPullRequests();
  const issues = await source.listIssues();
  const branch = await source.readBranch("refs/heads/automation/skill-updates/g900001");
  const mismatched = createFakeGithubAdapter({
    branches: [
      { ref: input.defaultBranchRef, sha: input.defaultBranchSha },
      ...(branch === null ? [] : [branch]),
    ],
    pullRequests: pulls.items.map((pullRequest) => ({ ...pullRequest, draft: true })),
    issues: issues.items,
  });
  await assert.rejects(buildFreshSmokeRecoveryPreviewV2(input, mismatched), /journalとlive state/);
  assert.deepEqual(mismatched.transcript, []);
});

test("recovery revalidates latest journal digest before terminal writes", async () => {
  const source = freshAdapter();
  await assert.rejects(
    runFreshSmokeV2(input, source, async (_preview, digest) => digest, async () => null),
    /merge checkpoint未完了/,
  );
  const preview = await buildFreshSmokeRecoveryPreviewV2(input, source);
  const pulls = await source.listPullRequests();
  const issues = await source.listIssues();
  const branch = await source.readBranch("refs/heads/automation/skill-updates/g900001");
  const changed = createFakeGithubAdapter({
    branches: [
      { ref: input.defaultBranchRef, sha: input.defaultBranchSha },
      ...(branch === null ? [] : [branch]),
    ],
    pullRequests: pulls.items.map((pullRequest) => ({
      ...pullRequest,
      journalComments: pullRequest.journalComments?.map((comment, index, all) =>
        index === all.length - 1 ? { ...comment, updatedAt: "2026-08-27T00:00:01Z" } : comment),
    })),
    issues: issues.items,
  });
  await assert.rejects(executeFreshSmokeRecoveryPreviewV2(preview, changed), /edited|timestamp/);
  assert.deepEqual(changed.transcript, []);
});

test("normal smoke fails closed when repository auto-deletes merged branches", async () => {
  const adapter = freshAdapter();
  await assert.rejects(runFreshSmokeV2(
    input,
    adapter,
    async (_preview, digest) => digest,
    async (prNumber, checkpointDigest) => {
      await adapter.mergePullRequestForTest(prNumber);
      adapter.setBranchForTest("refs/heads/automation/skill-updates/g900001", null);
      return checkpointDigest;
    },
  ), /auto-deleteを無効化/);
});
