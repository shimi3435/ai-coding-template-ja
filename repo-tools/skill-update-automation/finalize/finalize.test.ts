import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  classifyPrBody,
  computePrHistoryDigest,
  managedIssueTitle,
  managedPrTitle,
  renderManagedIssueSection,
  renderManagedPrSection,
  type CandidateUpdateManifest,
  type DraftReceipt,
  type ExistingHeadValidationManifest,
  type IssueEnvelope,
  type ValidationState,
} from "../model/index.ts";
import { createFakeGithubAdapter, GithubAdapterError } from "../github/fake-adapter.ts";
import type { GithubAdapter } from "../github/adapter.ts";
import type { GithubIssue } from "../github/issue-discovery.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import { finalizeManagedPullRequest } from "./finalize.ts";

const sha = (digit: string): string => digit.repeat(40);
const digest = (value: string): string => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const run = { workflowRunId: "456", workflowRunAttempt: 1 } as const;
const context = {
  repositoryId: "123",
  repository: "owner/repository",
  defaultBranchSha: sha("0"),
  defaultBranchRef: "refs/heads/main",
  now: () => new Date("2026-08-20T02:00:00.000Z"),
};

function pendingPull(): GithubPullRequest {
  return {
    prNumber: 1,
    state: "open",
    merged: false,
    draft: true,
    headRepositoryId: context.repositoryId,
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: sha("4"),
    baseRepositoryId: context.repositoryId,
    baseRef: context.defaultBranchRef,
    title: managedPrTitle,
    body: renderManagedPrSection({
      schemaVersion: 1,
      kind: "managed-pr",
      repositoryId: context.repositoryId,
      repository: context.repository,
      generation: 1,
      headRef: "refs/heads/automation/skill-updates/g000001",
      baseRef: context.defaultBranchRef,
      expectedHeadSha: sha("4"),
      validationBaseSha: sha("0"),
      candidateDigest: `sha256:${"1".repeat(64)}`,
      reportDigest: `sha256:${"2".repeat(64)}`,
      validation: { status: "pending", run },
    }, "Pending exact candidate validation."),
  };
}

function historyDigest(pulls: readonly GithubPullRequest[]): string {
  return computePrHistoryDigest(context.repositoryId, pulls.map((pull) => ({
    prNumber: pull.prNumber,
    state: pull.state,
    merged: pull.merged,
    headRepositoryId: pull.headRepositoryId,
    headRef: pull.headRef,
    headSha: pull.headSha,
    baseRepositoryId: pull.baseRepositoryId,
    baseRef: pull.baseRef,
    titleDigest: digest(pull.title),
    bodyDigest: digest(pull.body ?? ""),
  })));
}

function inputs(pull: GithubPullRequest, validation: ValidationState) {
  const classified = classifyPrBody(pull.body, pull.draft);
  assert.equal(classified.kind, "strict");
  if (classified.kind !== "strict") throw new Error("fixture must be strict");
  const manifest: CandidateUpdateManifest = {
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: context.repositoryId,
    repository: context.repository,
    run,
    triggerSha: sha("0"),
    baseHeadSha: sha("3"),
    candidateSha: sha("4"),
    candidateTreeSha: sha("5"),
    target: {
      mode: "update",
      generation: 1,
      prNumber: 1,
      headRef: pull.headRef,
      expectedBranch: { state: "present", sha: sha("3") },
      markerDigest: `sha256:${"9".repeat(64)}`,
      historyDigest: `sha256:${"8".repeat(64)}`,
    },
    candidateDigest: classified.envelope.candidateDigest,
    createdAt: "2026-08-20T00:00:00.000Z",
    files: [
      { name: "apply-report.json", byteLength: 1, digest: classified.envelope.reportDigest },
      { name: "candidate.bundle", byteLength: 1, digest: `sha256:${"3".repeat(64)}` },
      { name: "preview-report.json", byteLength: 1, digest: `sha256:${"4".repeat(64)}` },
    ],
  };
  const receipt: DraftReceipt = {
    schemaVersion: 1,
    kind: "published-draft",
    repositoryId: context.repositoryId,
    repository: context.repository,
    run,
    manifestDigest: `sha256:${"6".repeat(64)}`,
    candidateDigest: manifest.candidateDigest,
    generation: 1,
    prNumber: 1,
    headRef: pull.headRef,
    headSha: pull.headSha,
    markerDigest: classified.markerDigest,
    historyDigest: historyDigest([pull]),
    createdAt: "2026-08-20T01:00:00.000Z",
  };
  return { manifest, receipt, validation };
}

function issue(number: number, entries: IssueEnvelope["entries"] = []): GithubIssue {
  return {
    issueNumber: number,
    state: "open",
    title: managedIssueTitle,
    body: renderManagedIssueSection({
      schemaVersion: 1,
      kind: "managed-issue",
      repositoryId: context.repositoryId,
      repository: context.repository,
      entries,
    }, "Managed automation failures."),
    isPullRequest: false,
  };
}

test("passed exact head becomes ready without issue write", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(result.kind, "finalized");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["update-pull-request"]);
  const updated = await adapter.readPullRequest(1);
  assert.equal(updated?.draft, false);
  assert.equal(classifyPrBody(updated?.body ?? null, false).kind, "strict");
});

test("existing-head validation finalizes from manifest identity without a receipt", async () => {
  const pull = pendingPull();
  const updateInput = inputs(pull, { status: "passed", run });
  const manifest: ExistingHeadValidationManifest = {
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: updateInput.manifest.repositoryId,
    repository: updateInput.manifest.repository,
    run,
    triggerSha: updateInput.manifest.triggerSha,
    baseHeadSha: pull.headSha,
    candidateSha: pull.headSha,
    candidateTreeSha: updateInput.manifest.candidateTreeSha,
    target: {
      mode: "validate",
      generation: 1,
      prNumber: 1,
      headRef: pull.headRef,
      expectedBranch: { state: "present", sha: pull.headSha },
      markerDigest: updateInput.receipt.markerDigest,
      historyDigest: updateInput.receipt.historyDigest,
    },
    candidateDigest: updateInput.manifest.candidateDigest,
    createdAt: updateInput.manifest.createdAt,
    files: [{ name: "preview-report.json", byteLength: 1, digest: `sha256:${"4".repeat(64)}` }],
  };
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    manifest,
    validation: { status: "passed", run },
  });
  assert.deepEqual({ kind: result.kind, pr: result.pr }, { kind: "finalized", pr: "ready" });
  assert.equal((await adapter.readPullRequest(1))?.draft, false);
});

test("command failure remains draft and creates one deduplicated tracking issue", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const input = inputs(pull, { status: "failed", run, failureKind: "command", command: "uv run --no-sync task check" });
  const first = await finalizeManagedPullRequest({ adapter, context, ...input });
  assert.equal(first.kind, "finalized");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["update-pull-request", "create-issue"]);
  const created = (await adapter.listIssues()).items[0]!;
  const before = created.body;
  await finalizeManagedPullRequest({ adapter, context, ...input });
  const after = (await adapter.listIssues()).items[0]!;
  assert.equal((await adapter.listIssues()).items.length, 1);
  assert.equal(after.body, before);
  const updated = await adapter.readPullRequest(1);
  assert.equal(updated?.draft, true);
  const classified = classifyPrBody(updated?.body ?? null, true);
  assert.equal(classified.kind, "strict");
  if (classified.kind === "strict") assert.equal(classified.envelope.validation.status, "failed");
});

test("issue identity conflict skips only issue write while safe PR finalize continues", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    issues: [issue(10), issue(11)],
  });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(result.kind, "finalized");
  assert.equal(result.issue, "issue-cardinality-conflict");
  assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["update-pull-request"]);
});

test("PR partial identity and incomplete PR page stop every write", async () => {
  const pull = pendingPull();
  const partial = { ...pull, body: null };
  for (const adapter of [
    createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [partial] }),
    createFakeGithubAdapter({
      branches: [{ ref: pull.headRef, sha: pull.headSha }],
      pullRequests: [pull],
      faults: [{ operation: "list-pull-requests", kind: "partial-response" }],
    }),
  ]) {
    const result = await finalizeManagedPullRequest({
      adapter,
      context,
      ...inputs(pull, { status: "passed", run }),
    });
    assert.match(result.kind, /conflict|recovery-required/);
    assert.deepEqual(adapter.transcript, []);
  }
});

test("infrastructure failure remains draft and records recovery-required", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "failed", run, failureKind: "infrastructure", stage: "artifact" }),
  });
  assert.deepEqual({ kind: result.kind, pr: result.pr, issue: result.issue }, {
    kind: "finalized",
    pr: "draft",
    issue: "created",
  });
  const created = (await adapter.listIssues()).items[0]!;
  assert.match(created.body ?? "", /recovery-required/);
});

test("partial issue identity and issue human text do not block safe PR lifecycle", async () => {
  const pull = pendingPull();
  const partialAdapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    issues: [{ issueNumber: 10, state: "open", title: managedIssueTitle, body: null, isPullRequest: false }],
  });
  const partialResult = await finalizeManagedPullRequest({
    adapter: partialAdapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(partialResult.issue, "issue-identity-conflict");
  assert.equal((await partialAdapter.readPullRequest(1))?.draft, false);

  const secondPull = pendingPull();
  const existing = issue(10);
  const externalBody = `human prefix\n${existing.body}\nhuman suffix`;
  const updateAdapter = createFakeGithubAdapter({
    branches: [{ ref: secondPull.headRef, sha: secondPull.headSha }],
    pullRequests: [secondPull],
    issues: [{ ...existing, body: externalBody }],
  });
  await finalizeManagedPullRequest({
    adapter: updateAdapter,
    context,
    ...inputs(secondPull, { status: "failed", run, failureKind: "command", command: "uv run --no-sync task check" }),
  });
  const updated = await updateAdapter.readIssue(10);
  assert.match(updated?.body ?? "", /^human prefix\n/);
  assert.match(updated?.body ?? "", /\nhuman suffix$/);
});

test("permission denial records issue without retry and response-loss post-state is accepted", async () => {
  const pull = pendingPull();
  const denied = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    faults: [{ operation: "update-pull-request", kind: "permission-denied" }],
  });
  const deniedResult = await finalizeManagedPullRequest({
    adapter: denied,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(deniedResult.kind, "permission-denied");
  assert.deepEqual(deniedResult.permission, {
    operation: "update-pull-request",
    postState: "unchanged",
  });
  assert.deepEqual(denied.transcript.map((entry) => entry.operation), ["update-pull-request", "create-issue"]);

  const responseLostBase = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  let lost = false;
  const responseLost = new Proxy(responseLostBase, {
    get(target, property, receiver) {
      if (property === "updatePullRequest") {
        return async (...args: Parameters<GithubAdapter["updatePullRequest"]>) => {
          await target.updatePullRequest(...args);
          if (!lost) {
            lost = true;
            throw new Error("response lost after apply");
          }
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as GithubAdapter;
  const recovered = await finalizeManagedPullRequest({
    adapter: responseLost,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.equal(recovered.kind, "finalized");
  assert.equal((await responseLostBase.readPullRequest(1))?.draft, false);
});

test("unknown permission post-state becomes recovery-required without a later write", async () => {
  const pull = pendingPull();
  const baseAdapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
  });
  const adapter = new Proxy(baseAdapter, {
    get(target, property, receiver) {
      if (property === "updatePullRequest") {
        return async () => {
          throw new GithubAdapterError("permission-denied", "unknown post-state", {
            operation: "update-pull-request",
            postState: "unknown",
          });
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as GithubAdapter;
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
  });
  assert.deepEqual(result, {
    kind: "recovery-required",
    permission: { operation: "update-pull-request", postState: "unknown" },
  });
  assert.deepEqual(baseAdapter.transcript, []);
});

test("issue permission denial is not retried and lost create response is recovered", async () => {
  const pull = pendingPull();
  const validation = { status: "failed", run, failureKind: "command", command: "uv run --no-sync task check" } as const;
  const denied = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    faults: [{ operation: "create-issue", kind: "permission-denied" }],
  });
  const deniedResult = await finalizeManagedPullRequest({ adapter: denied, context, ...inputs(pull, validation) });
  assert.deepEqual({ kind: deniedResult.kind, issue: deniedResult.issue }, {
    kind: "permission-denied",
    issue: "permission-denied",
  });
  assert.deepEqual(deniedResult.permission, {
    operation: "create-issue",
    postState: "unchanged",
  });
  assert.equal(denied.transcript.filter((entry) => entry.operation === "create-issue").length, 1);

  const responseLostBase = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
  });
  let lost = false;
  const responseLost = new Proxy(responseLostBase, {
    get(target, property, receiver) {
      if (property === "createIssue") {
        return async (...args: Parameters<GithubAdapter["createIssue"]>) => {
          const created = await target.createIssue(...args);
          if (!lost) {
            lost = true;
            throw new Error("response lost after issue create");
          }
          return created;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as GithubAdapter;
  const recovered = await finalizeManagedPullRequest({ adapter: responseLost, context, ...inputs(pull, validation) });
  assert.equal(recovered.kind, "finalized");
  assert.equal((await responseLostBase.listIssues()).items.length, 1);
  assert.equal(responseLostBase.transcript.filter((entry) => entry.operation === "create-issue").length, 1);
});

test("cleanup failure is tracked without rolling back a ready PR", async () => {
  const pull = pendingPull();
  const adapter = createFakeGithubAdapter({ branches: [{ ref: pull.headRef, sha: pull.headSha }], pullRequests: [pull] });
  const result = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(pull, { status: "passed", run }),
    cleanupStatus: "failed",
    cleanupFailedRefs: ["refs/heads/automation/skill-updates/g000002"],
  });
  assert.deepEqual({ kind: result.kind, pr: result.pr, issue: result.issue }, {
    kind: "finalized",
    pr: "ready",
    issue: "created",
  });
  assert.equal((await adapter.readPullRequest(1))?.draft, false);
  assert.match((await adapter.listIssues()).items[0]?.body ?? "", /cleanup-failed/);
  assert.match((await adapter.listIssues()).items[0]?.body ?? "", /g000002/);
});

test("closed tracking issue is reopened for failure and resolved entries remain open", async () => {
  const pull = pendingPull();
  const closed = { ...issue(10), state: "closed" as const };
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: pull.headRef, sha: pull.headSha }],
    pullRequests: [pull],
    issues: [closed],
  });
  const failure = inputs(pull, {
    status: "failed",
    run,
    failureKind: "command",
    command: "uv run --no-sync task check",
  });
  const failed = await finalizeManagedPullRequest({ adapter, context, ...failure });
  assert.equal(failed.issue, "reopened");
  assert.equal((await adapter.readIssue(10))?.state, "open");

  const currentPull = await adapter.readPullRequest(1);
  assert.ok(currentPull);
  const resolved = await finalizeManagedPullRequest({
    adapter,
    context,
    ...inputs(currentPull, { status: "passed", run }),
  });
  assert.equal(resolved.issue, "updated");
  assert.equal((await adapter.readIssue(10))?.state, "open");
  assert.doesNotMatch((await adapter.readIssue(10))?.body ?? "", /validation-failed/);
  assert.equal(adapter.transcript.some((entry) => entry.operation === "close-issue"), false);
});
