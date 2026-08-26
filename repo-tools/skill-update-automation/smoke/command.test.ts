import assert from "node:assert/strict";
import test from "node:test";

import { buildSmokePreview, executeSmokePlan, SmokeExecutionError } from "./command.ts";
import { FakeSmokeHost } from "./fake-host.ts";
import { createPresentResourceState, encodeSmokePreview } from "../model/index.ts";
import type { SmokeHost } from "./host.ts";

const sourceCommit = "a".repeat(40);

type V3Preview = Readonly<{
  schemaVersion: number;
  mode: string;
  steps: readonly Readonly<{
    operation: string;
    primaryKey: string;
    before: readonly Readonly<{ resource: Readonly<{ key: string }>; state: unknown }>[];
    after: readonly Readonly<{ resource: Readonly<{ key: string }>; state: unknown }>[];
  }>[];
  checkpoints: readonly Readonly<{ kind: string; stepIndex: number; resourceKeys: readonly string[] }>[];
}>;

test("read-only preview binds the repository and workflow run to the source commit", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });

  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);

  assert.equal(preview.repositoryId, "123");
  assert.deepEqual(preview.run, { workflowRunId: "456", workflowRunAttempt: 2 });
  assert.equal(preview.sourceCommit, sourceCommit);
  assert.ok(preview.steps.length > 0);
  assert.deepEqual(host.writeTranscript, []);
});

test("preview v3 normal mode binds an open PR append as one multi-resource step", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host) as unknown as V3Preview;

  assert.equal(preview.schemaVersion, 3);
  assert.equal(preview.mode, "normal");
  const append = preview.steps.find((step) => step.operation === "update" && step.primaryKey === "smoke-branch");
  assert.deepEqual(append?.before.map((item) => item.resource.key), ["smoke-branch", "smoke-pr"]);
  assert.deepEqual(append?.after.map((item) => item.resource.key), ["smoke-branch", "smoke-pr"]);
  assert.deepEqual(preview.checkpoints.find((checkpoint) => checkpoint.kind === "append")?.resourceKeys,
    ["smoke-branch", "smoke-pr"]);
  assert.deepEqual(preview.checkpoints.find((checkpoint) => checkpoint.kind === "human-intervention")?.resourceKeys,
    ["smoke-branch", "smoke-pr"]);
});

test("preview rejects missing or mixed repository, run, attempt, and head SHA", async () => {
  const validRun = { id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit };
  const cases = [
    [],
    [{ ...validRun, id: "999" }],
    [{ ...validRun, attempt: 3 }],
    [{ ...validRun, repositoryId: "999" }],
    [{ ...validRun, repository: "other/repo" }],
    [{ ...validRun, headSha: "b".repeat(40) }],
  ] as const;
  for (const workflowRuns of cases) {
    const host = new FakeSmokeHost({
      repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
      workflowRuns,
    });
    await assert.rejects(() => buildSmokePreview({
      repository: "owner/repo",
      run: { workflowRunId: "456", workflowRunAttempt: 2 },
      sourceCommit,
      createdAt: "2026-08-20T01:02:03.004Z",
    }, host), /workflow run|repository/);
    assert.deepEqual(host.writeTranscript, []);
  }
});

test("preview fixes planned PR and issue lifecycles with terminal cleanup", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });

  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);

  const latestStates = new Map<string, unknown>();
  for (const step of preview.steps) {
    for (const item of step.before) {
      const previous = latestStates.get(item.resource.key);
      if (previous !== undefined) assert.deepEqual(item.state, previous);
    }
    for (const item of step.after) latestStates.set(item.resource.key, item.state);
  }

  assert.deepEqual(preview.steps.map((step) => `${step.primaryKey}:${step.operation}`), [
    "smoke-branch:create",
    "smoke-pr:create",
    "smoke-pr:update",
    "smoke-branch:update",
    "smoke-pr:update",
    "smoke-pr:ready",
    "smoke-pr:draft",
    "smoke-pr:close",
    "smoke-pr:reopen",
    "smoke-pr:close",
    "smoke-issue:create",
    "smoke-issue:update",
    "smoke-issue:close",
    "smoke-branch:delete",
  ]);
});

test("normal preview rejects a source parent that is not ahead of the default base", async () => {
  const fake = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const host = {
    readRepository: () => fake.readRepository(),
    readWorkflowRun: (runId: string) => fake.readWorkflowRun(runId),
    readCommitParent: (sha: string) => fake.readCommitParent(sha),
    readCommitComparison: async () => ({ status: "behind", aheadBy: 0, behindBy: 1 }),
    readResource: (resource: Parameters<SmokeHost["readResource"]>[0], bindings: ReadonlyMap<string, number>) =>
      fake.readResource(resource, bindings),
    applyTarget: (target: Parameters<SmokeHost["applyTarget"]>[0], bindings: ReadonlyMap<string, number>,
      preview: Parameters<SmokeHost["applyTarget"]>[2]) => fake.applyTarget(target, bindings, preview),
  } as SmokeHost;

  await assert.rejects(() => buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host), /source parent.*ahead|PR.*作成/);
  assert.deepEqual(fake.writeTranscript, []);
});

test("recovery decoder rejects normal create operations and checkpoints", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const normal = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);

  assert.throws(() => encodeSmokePreview({
    ...normal,
    mode: "recovery",
    checkpoints: [normal.checkpoints.find((item) => item.kind === "cleanup")],
  }), /recovery|cleanup/);
});

test("recovery decoder rejects a branch delete without a correlated PR or issue", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const normal = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);
  const normalCleanup = normal.steps.at(-1)!;
  const branchOnlyCleanup = {
    ...normalCleanup,
    before: normalCleanup.before.filter((item) => item.resource.kind === "branch"),
    after: normalCleanup.after.filter((item) => item.resource.kind === "branch"),
  };

  assert.throws(() => encodeSmokePreview({
    ...normal,
    mode: "recovery",
    steps: [branchOnlyCleanup],
    checkpoints: [{ kind: "cleanup", stepIndex: 0, resourceKeys: [branchOnlyCleanup.primaryKey] }],
  }), /branch.*correlation|recovery/);
});

test("recovery decoder rejects a branch delete correlated only with an unrelated issue body", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const normal = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);
  const normalCleanup = normal.steps.at(-1)!;
  const branchBefore = normalCleanup.before.find((item) => item.resource.kind === "branch")!;
  const branchAfter = normalCleanup.after.find((item) => item.resource.kind === "branch")!;
  const unrelatedIssueResource = {
    kind: "issue", key: "smoke-issue", locator: { mode: "existing", number: 99 },
  } as const;
  const unrelatedIssueState = createPresentResourceState({
    schemaVersion: 1,
    kind: "issue-state",
    state: "closed",
    title: "Skill update automation requires attention",
    bodyDigest: `sha256:${"f".repeat(64)}`,
  });

  assert.throws(() => encodeSmokePreview({
    ...normal,
    mode: "recovery",
    steps: [{
      operation: "delete",
      primaryKey: branchBefore.resource.key,
      before: [branchBefore, { resource: unrelatedIssueResource, state: unrelatedIssueState }],
      after: [branchAfter, { resource: unrelatedIssueResource, state: unrelatedIssueState }],
    }],
    checkpoints: [{
      kind: "cleanup", stepIndex: 0, resourceKeys: [branchBefore.resource.key, unrelatedIssueResource.key],
    }],
  }), /strict.*correlation|run.*source/);
});

test("recovery decoder rejects an unrelated issue-only close plan", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const normal = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);
  const issueResource = { kind: "issue", key: "smoke-issue", locator: { mode: "existing", number: 99 } } as const;
  const open = createPresentResourceState({
    schemaVersion: 1, kind: "issue-state", state: "open",
    title: "Skill update automation requires attention", bodyDigest: `sha256:${"f".repeat(64)}`,
  });
  const closed = createPresentResourceState({ ...open.value, state: "closed" });

  assert.throws(() => encodeSmokePreview({
    ...normal,
    mode: "recovery",
    steps: [{
      operation: "close", primaryKey: issueResource.key,
      before: [{ resource: issueResource, state: open }],
      after: [{ resource: issueResource, state: closed }],
    }],
    checkpoints: [{ kind: "cleanup", stepIndex: 0, resourceKeys: [issueResource.key] }],
  }), /strict.*correlation|run.*source/);
});

test("normal execution rechecks the approved base-to-parent relation before write", async () => {
  const fake = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, fake);
  const staleHost = {
    readRepository: () => fake.readRepository(),
    readWorkflowRun: (runId: string) => fake.readWorkflowRun(runId),
    readCommitParent: (sha: string) => fake.readCommitParent(sha),
    readCommitComparison: async () => ({ status: "behind", aheadBy: 0, behindBy: 1 }),
    readResource: (resource: Parameters<SmokeHost["readResource"]>[0], bindings: ReadonlyMap<string, number>) =>
      fake.readResource(resource, bindings),
    applyTarget: (target: Parameters<SmokeHost["applyTarget"]>[0], bindings: ReadonlyMap<string, number>,
      approvedPreview: Parameters<SmokeHost["applyTarget"]>[2]) => fake.applyTarget(target, bindings, approvedPreview),
  } as SmokeHost;

  await assert.rejects(() => executeSmokePlan(preview, staleHost), /source parent.*ahead|PR.*作成/);
  assert.deepEqual(fake.writeTranscript, []);
});

test("preview rejects a residual branch at an unexpected SHA before any write", async () => {
  const ref = "refs/heads/automation/skill-updates/g999999";
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
    resources: [{
      resource: { kind: "branch", key: "smoke-branch", ref },
      state: createPresentResourceState({ schemaVersion: 1, kind: "branch-state", ref, sha: "c".repeat(40) }),
    }],
  });

  await assert.rejects(() => buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host), /residual|initial before state/);
  assert.deepEqual(host.writeTranscript, []);
});

test("branch-only residual is rejected without a strict same-run resource correlation", async () => {
  const ref = "refs/heads/automation/skill-updates/g999999";
  const parent = "b".repeat(40);
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
    commitParents: { [sourceCommit]: parent },
    commitComparisons: {
      [`${"c".repeat(40)}...${parent}`]: { status: "behind", aheadBy: 0, behindBy: 1 },
    },
    resources: [{
      resource: { kind: "branch", key: "smoke-branch", ref },
      state: createPresentResourceState({ schemaVersion: 1, kind: "branch-state", ref, sha: parent }),
    }],
  });

  await assert.rejects(() => buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host), /branch-only|ownership|correlation/);
  assert.deepEqual(host.writeTranscript, []);
  assert.equal((await host.readResource({ kind: "branch", key: "smoke-branch", ref }, new Map())).state.state, "present");
});

test("recovery terminalizes ready PR and open issue before deleting the residual branch", async () => {
  const normalHost = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const normal = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, normalHost);
  const stateAt = (stepIndex: number, key: string) => normal.steps[stepIndex]!.after.find((item) => item.resource.key === key)!;
  const branch = stateAt(3, "smoke-branch");
  const pr = stateAt(5, "smoke-pr");
  const issue = stateAt(10, "smoke-issue");
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
    resources: [
      { resource: branch.resource, state: branch.state },
      { resource: pr.resource, state: pr.state, number: 7 },
      { resource: issue.resource, state: issue.state, number: 8 },
    ],
  });

  const recovery = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:03:03.004Z",
  }, host);

  assert.equal((recovery as unknown as { mode: string }).mode, "recovery");
  assert.deepEqual(recovery.steps.map((item) => `${item.primaryKey}:${item.operation}`), [
    "smoke-pr:draft", "smoke-pr:close", "smoke-issue:close", "smoke-branch:delete",
  ]);
  assert.deepEqual(recovery.checkpoints, [{
    kind: "cleanup", stepIndex: 3, resourceKeys: ["smoke-branch", "smoke-issue", "smoke-pr"],
  }]);
  const evidence = await executeSmokePlan(recovery, host);
  assert.deepEqual(evidence.steps.map((item) => `${item.primaryKey}:${item.operation}`), [
    "smoke-pr:draft", "smoke-pr:close", "smoke-issue:close", "smoke-branch:delete",
  ]);
  assert.deepEqual(evidence.bindings, {});
});

test("recovery rejects a residual issue bound to a different run and source commit", async () => {
  const oldHost = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const oldPreview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, oldHost);
  const oldIssue = oldPreview.steps[10]!.after.find((item) => item.resource.key === "smoke-issue")!;
  const newSourceCommit = "d".repeat(40);
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "789", attempt: 1, repositoryId: "123", repository: "owner/repo", headSha: newSourceCommit }],
    commitParents: { [newSourceCommit]: "e".repeat(40) },
    resources: [{ resource: oldIssue.resource, state: oldIssue.state, number: 8 }],
  });

  await assert.rejects(() => buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "789", workflowRunAttempt: 1 },
    sourceCommit: newSourceCommit,
    createdAt: "2026-08-20T01:03:03.004Z",
  }, host), /residual state/);
  assert.deepEqual(host.writeTranscript, []);
});

test("fake host executes the immutable plan and binds planned numbers exactly once", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);

  const evidence = await executeSmokePlan(preview, host);

  assert.deepEqual(evidence.bindings, { "smoke-pr": 1, "smoke-issue": 2 });
  assert.equal(evidence.steps.length, preview.steps.length);
  assert.deepEqual(evidence.steps[0]!.before, preview.steps[0]!.before);
  assert.deepEqual(evidence.steps[0]!.after, preview.steps[0]!.after);
  assert.deepEqual(evidence.checkpoints.map((checkpoint) => checkpoint.kind), [
    "draft",
    "validation-failure",
    "append",
    "human-intervention",
    "ready",
    "pause",
    "resume",
    "issue-dedupe",
    "cleanup",
  ]);
  assert.equal(evidence.checkpoints.find((checkpoint) => checkpoint.kind === "human-intervention")?.decision,
    "intervention-required");
  const reducerEvidence = evidence.checkpoints.find((checkpoint) => checkpoint.kind === "human-intervention")?.reducer;
  assert.equal(reducerEvidence?.input.pullRequests[0]?.headSha, sourceCommit);
  assert.equal(reducerEvidence?.input.pullRequests[0]?.prNumber, 1);
  assert.equal(reducerEvidence?.decision, "intervention-required");
  assert.deepEqual(host.writeTranscript.map((target) => `${target.resource.key}:${target.operation}`),
    preview.steps.map((step) => `${step.primaryKey}:${step.operation}`));
});

test("post-write retry reads every after resource without retrying the write", async () => {
  const fake = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, fake);
  const staleBranch = preview.steps[3]!.before.find((item) => item.resource.key === "smoke-branch")!;
  let returnStaleBranch = false;
  let captureAppendAfter = false;
  let appendAfterAttempt = 0;
  let staleReads = 0;
  const appendPullRequestReadAttempts = new Set<number>();
  let retryWaits = 0;
  const eventualHost: SmokeHost = {
    readRepository: () => fake.readRepository(),
    readWorkflowRun: (runId) => fake.readWorkflowRun(runId),
    readCommitParent: (sha) => fake.readCommitParent(sha),
    readCommitComparison: (baseSha, headSha) => fake.readCommitComparison(baseSha, headSha),
    readResource: async (resource, bindings) => {
      if (returnStaleBranch && resource.key === "smoke-branch") {
        returnStaleBranch = false;
        staleReads += 1;
        return { state: structuredClone(staleBranch.state) };
      }
      if (captureAppendAfter && resource.key === "smoke-pr") {
        appendPullRequestReadAttempts.add(appendAfterAttempt);
      }
      return fake.readResource(resource, bindings);
    },
    applyTarget: async (target, bindings, approvedPreview) => {
      if (captureAppendAfter) captureAppendAfter = false;
      const result = await fake.applyTarget(target, bindings, approvedPreview);
      if (target.resource.key === "smoke-branch" && target.operation === "update") {
        returnStaleBranch = true;
        captureAppendAfter = true;
        appendAfterAttempt = 1;
      }
      return result;
    },
  };

  const evidence = await executeSmokePlan(preview, eventualHost, {
    postWriteRead: { maxAttempts: 2, wait: async () => {
      retryWaits += 1;
      appendAfterAttempt += 1;
    } },
  });

  assert.equal(staleReads, 1);
  assert.equal(appendPullRequestReadAttempts.size, 2);
  assert.equal(retryWaits, 1);
  assert.equal(evidence.steps[3]!.postWriteReadAttempts, 2);
  assert.equal(fake.writeTranscript.length, preview.steps.length);
});

test("post-write retry waits for the coupled PR head to converge after one branch write", async () => {
  const fake = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, fake);
  const stalePullRequest = preview.steps[3]!.before.find((item) => item.resource.key === "smoke-pr")!;
  let returnStalePullRequest = false;
  let stalePullRequestReads = 0;
  let retryWaits = 0;
  const eventualHost: SmokeHost = {
    readRepository: () => fake.readRepository(),
    readWorkflowRun: (runId) => fake.readWorkflowRun(runId),
    readCommitParent: (sha) => fake.readCommitParent(sha),
    readCommitComparison: (baseSha, headSha) => fake.readCommitComparison(baseSha, headSha),
    readResource: async (resource, bindings) => {
      if (returnStalePullRequest && resource.key === "smoke-pr") {
        returnStalePullRequest = false;
        stalePullRequestReads += 1;
        return { state: structuredClone(stalePullRequest.state), number: 1 };
      }
      return fake.readResource(resource, bindings);
    },
    applyTarget: async (target, bindings, approvedPreview) => {
      const result = await fake.applyTarget(target, bindings, approvedPreview);
      if (target.resource.key === "smoke-branch" && target.operation === "update") {
        returnStalePullRequest = true;
      }
      return result;
    },
  };

  const evidence = await executeSmokePlan(preview, eventualHost, {
    postWriteRead: { maxAttempts: 2, wait: async () => { retryWaits += 1; } },
  });

  assert.equal(stalePullRequestReads, 1);
  assert.equal(retryWaits, 1);
  assert.equal(evidence.steps[3]!.postWriteReadAttempts, 2);
  assert.equal(fake.writeTranscript.filter((target) =>
    target.resource.key === "smoke-branch" && target.operation === "update").length, 1);
});

test("post-write retry stops on a later resource API error without waiting or retrying the write", async () => {
  const fake = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, fake);
  const staleBranch = preview.steps[3]!.before.find((item) => item.resource.key === "smoke-branch")!;
  let appendApplied = false;
  let returnStaleBranch = false;
  let retryWaits = 0;
  const failingHost: SmokeHost = {
    readRepository: () => fake.readRepository(),
    readWorkflowRun: (runId) => fake.readWorkflowRun(runId),
    readCommitParent: (sha) => fake.readCommitParent(sha),
    readCommitComparison: (baseSha, headSha) => fake.readCommitComparison(baseSha, headSha),
    readResource: async (resource, bindings) => {
      if (returnStaleBranch && resource.key === "smoke-branch") {
        returnStaleBranch = false;
        return { state: structuredClone(staleBranch.state) };
      }
      if (appendApplied && resource.key === "smoke-pr") throw new Error("PR read unavailable");
      return fake.readResource(resource, bindings);
    },
    applyTarget: async (target, bindings, approvedPreview) => {
      const result = await fake.applyTarget(target, bindings, approvedPreview);
      if (target.resource.key === "smoke-branch" && target.operation === "update") {
        appendApplied = true;
        returnStaleBranch = true;
      }
      return result;
    },
  };

  await assert.rejects(() => executeSmokePlan(preview, failingHost, {
    postWriteRead: { maxAttempts: 2, wait: async () => { retryWaits += 1; } },
  }), /PR read unavailable/);
  assert.equal(retryWaits, 0);
  assert.equal(fake.writeTranscript.length, 4);
});

test("post-write observation rejects an excessive retry policy before any write", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);

  await assert.rejects(() => executeSmokePlan(preview, host, {
    postWriteRead: { maxAttempts: 11, wait: async () => {} },
  }), /retry policy/);
  assert.deepEqual(host.writeTranscript, []);
});

test("operation failure records residual resources and requires a new recovery preview", async () => {
  const fake = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, fake);
  const badCreateHost: SmokeHost = {
    readRepository: () => fake.readRepository(),
    readWorkflowRun: (runId) => fake.readWorkflowRun(runId),
    readCommitParent: (sha) => fake.readCommitParent(sha),
    readCommitComparison: (baseSha, headSha) => fake.readCommitComparison(baseSha, headSha),
    readResource: (resource, bindings) => fake.readResource(resource, bindings),
    applyTarget: async (target, bindings, approvedPreview) => {
      const result = await fake.applyTarget(target, bindings, approvedPreview);
      if (target.resource.key !== "smoke-pr" || target.operation !== "create" || result.state.state !== "present" ||
        result.state.value.kind !== "pull-request-state") return result;
      return { ...result, state: createPresentResourceState({ ...result.state.value, state: "closed" }) };
    },
  };

  let failure: unknown;
  try {
    await executeSmokePlan(preview, badCreateHost);
  } catch (error: unknown) {
    failure = error;
  }
  assert.ok(failure instanceof SmokeExecutionError);
  assert.equal(fake.writeTranscript.length, 2);
  assert.ok(failure.residualResources.some((resource) => resource.state !== undefined && resource.state.state === "present"));
  const recovery = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:03:03.004Z",
  }, fake);
  assert.equal((recovery as unknown as { mode: string }).mode, "recovery");
  assert.ok(recovery.steps.every((step) => !["create", "update", "ready", "reopen"].includes(step.operation)));
});
