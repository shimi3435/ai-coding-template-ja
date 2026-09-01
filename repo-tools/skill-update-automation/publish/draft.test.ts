import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendJournalEntryDigest,
  classifyPrRootV2,
  computeCandidateDigest,
  computePrHistoryDigest,
  decodeArtifactManifest,
  decodeJournalCommentBodyV2,
  decodePrStateSnapshotV2,
  decodeDraftReceipt,
  encodeArtifactManifest,
  journalCommentBody,
  managedPrTitle,
  prStateSnapshotV2,
  reduceJournalCommentsV2,
  renderManagedPrRootV2,
  type CandidateUpdateManifest,
  type JournalOperation,
  type PrStateV2,
} from "../model/index.ts";
import { createFakeGithubAdapter } from "../github/fake-adapter.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import { publishDraft } from "./draft.ts";

const sha = (digit: string): string => digit.repeat(40);
const digest = (bytes: Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const context = {
  repositoryId: "123",
  repository: "owner/repository",
  workflowRunId: "456",
  workflowRunAttempt: 1,
  triggerSha: sha("0"),
  defaultBranchSha: sha("0"),
  defaultBranchRef: "refs/heads/main",
  resumeClosed: false,
  creatorUserId: "789",
};

function withDelayedPullRequestHeadAfterAppend(
  adapter: ReturnType<typeof createFakeGithubAdapter>,
  staleReads: number,
) {
  let stalePullRequest: Awaited<ReturnType<typeof adapter.readPullRequest>> = null;
  let remainingStaleReads = 0;
  return new Proxy(adapter, {
    get(target, property) {
      if (property === "appendBranch") {
        return async (append: Parameters<typeof target.appendBranch>[0]) => {
          const pulls = await target.listPullRequests();
          stalePullRequest = pulls.items.find((pullRequest) => pullRequest.headRef === append.ref) ?? null;
          await target.appendBranch(append);
          remainingStaleReads = staleReads;
        };
      }
      if (property === "readPullRequest") {
        return async (prNumber: number) => {
          if (remainingStaleReads > 0 && stalePullRequest?.prNumber === prNumber) {
            remainingStaleReads -= 1;
            return structuredClone(stalePullRequest);
          }
          return await target.readPullRequest(prNumber);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function withCrossPhaseBranchRegression(
  adapter: ReturnType<typeof createFakeGithubAdapter>,
  beforePullRequest: GithubPullRequest,
) {
  let journalReads = 0;
  let projectedPullRequest = false;
  let projectedBranch = false;
  return new Proxy(adapter, {
    get(target, property) {
      if (property === "listJournalComments") {
        return async (resourceNumber: number) => {
          journalReads += 1;
          return await target.listJournalComments(resourceNumber);
        };
      }
      if (property === "readPullRequest") {
        return async (prNumber: number) => {
          if (journalReads >= 2 && !projectedPullRequest && prNumber === beforePullRequest.prNumber) {
            projectedPullRequest = true;
            return structuredClone(beforePullRequest);
          }
          return await target.readPullRequest(prNumber);
        };
      }
      if (property === "readBranch") {
        return async (ref: string) => {
          if (journalReads >= 2 && !projectedBranch && ref === beforePullRequest.headRef) {
            projectedBranch = true;
            return { ref, sha: beforePullRequest.headSha };
          }
          return await target.readBranch(ref);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function managedFields(input: Readonly<{
  headSha: string;
  draft: boolean;
  prNumber: number;
  generation: number;
  creatorUserId?: string;
}>): Pick<GithubPullRequest, "body" | "journalComments"> {
  const creatorUserId = input.creatorUserId ?? context.creatorUserId;
  const headRef = `refs/heads/automation/skill-updates/g${String(input.generation).padStart(6, "0")}`;
  const snapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: context.repositoryId,
    repository: context.repository,
    generation: input.generation,
    headRef,
    baseRef: context.defaultBranchRef,
    expectedHeadSha: input.headSha,
    validationBaseSha: context.triggerSha,
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    draft: input.draft,
    validation: input.draft
      ? { status: "pending", run: { workflowRunId: context.workflowRunId, workflowRunAttempt: 1 } }
      : { status: "passed", run: { workflowRunId: context.workflowRunId, workflowRunAttempt: 1 } },
  });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: context.repositoryId,
    repository: context.repository,
    creatorUserId,
    generation: input.generation,
    headRef,
    baseRef: context.defaultBranchRef,
    candidateDigest: `sha256:${"1".repeat(64)}`,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: input.prNumber,
    creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot,
  });
  return {
    body: renderManagedPrRootV2(root, "fixture summary"),
    journalComments: [{
      id: "1",
      authorUserId: creatorUserId,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body: journalCommentBody(entry),
    }],
  };
}

function pull(overrides: Partial<GithubPullRequest> = {}): GithubPullRequest {
  const headSha = overrides.headSha ?? sha("3");
  const draft = overrides.draft ?? true;
  const prNumber = overrides.prNumber ?? 1;
  const generationMatch = (overrides.headRef ?? "refs/heads/automation/skill-updates/g000001").match(/g([0-9]{6})$/);
  const generation = generationMatch === null ? 1 : Number(generationMatch[1]);
  return {
    prNumber,
    state: "open",
    merged: false,
    draft,
    headRepositoryId: context.repositoryId,
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha,
    baseRepositoryId: context.repositoryId,
    baseRef: context.defaultBranchRef,
    title: managedPrTitle,
    authorUserId: context.creatorUserId,
    lastEditedAt: null,
    ...managedFields({ headSha, draft, prNumber, generation }),
    ...overrides,
  };
}

function latestDigest(pullRequest: GithubPullRequest): string {
  const body = pullRequest.journalComments?.at(-1)?.body;
  const entry = body === undefined ? null : decodeJournalCommentBodyV2(body);
  if (entry === null) throw new Error("fixture journal missing");
  return entry.digest;
}

function desiredState(directory: string): PrStateV2 {
  const manifest = decodeArtifactManifest(readFileSync(join(directory, "manifest.json")));
  if (manifest.kind !== "candidate-update") throw new Error("candidate fixture required");
  return {
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: context.repositoryId,
    repository: context.repository,
    generation: manifest.target.generation,
    headRef: manifest.target.headRef,
    baseRef: context.defaultBranchRef,
    expectedHeadSha: manifest.candidateSha,
    validationBaseSha: manifest.triggerSha,
    candidateDigest: manifest.candidateDigest,
    reportDigest: manifest.files[0].digest,
    draft: true,
    validation: { status: "pending", run: { workflowRunId: context.workflowRunId, workflowRunAttempt: 1 } },
  };
}

function withPrepared(
  pullRequest: GithubPullRequest,
  operation: Extract<JournalOperation, "branch-append" | "pr-draft">,
  after: PrStateV2,
): GithubPullRequest {
  const comments = pullRequest.journalComments ?? [];
  const current = decodeJournalCommentBodyV2(comments.at(-1)?.body ?? "");
  if (current === null) throw new Error("fixture journal missing");
  const before = decodePrStateSnapshotV2(current.snapshot);
  const afterSnapshot = prStateSnapshotV2(after);
  const transitionDigest = digest(Buffer.from([
    "transition-v2", String(pullRequest.prNumber), operation,
    prStateSnapshotV2(before).stateDigest, afterSnapshot.stateDigest,
  ].join("\0"), "utf8"));
  const prepared = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: pullRequest.prNumber,
    creatorUserId: context.creatorUserId,
    sequence: current.sequence + 1,
    previousDigest: current.digest,
    phase: "prepared",
    operation,
    operationId: transitionDigest,
    snapshot: afterSnapshot,
  });
  return {
    ...pullRequest,
    journalComments: [...comments, {
      id: "2",
      authorUserId: context.creatorUserId,
      createdAt: "2026-08-27T00:00:01Z",
      updatedAt: "2026-08-27T00:00:01Z",
      body: journalCommentBody(prepared),
    }],
  };
}

function historyDigest(pullRequests: readonly GithubPullRequest[]): string {
  return computePrHistoryDigest(context.repositoryId, pullRequests.map((item) => ({
    prNumber: item.prNumber,
    state: item.state,
    merged: item.merged,
    headRepositoryId: item.headRepositoryId,
    headRef: item.headRef,
    headSha: item.headSha,
    baseRepositoryId: item.baseRepositoryId,
    baseRef: item.baseRef,
    titleDigest: digest(Buffer.from(item.title)),
    bodyDigest: digest(Buffer.from(item.body ?? "")),
  })));
}

function artifact(pullRequests: readonly GithubPullRequest[], target: CandidateUpdateManifest["target"]): string {
  const root = mkdtempSync(join(tmpdir(), "publish-draft-test-"));
  mkdirSync(root, { recursive: true });
  const apply = Buffer.from("{\"status\":\"applied\"}");
  const bundle = Buffer.from("fixture bundle");
  const preview = Buffer.from("{\"status\":\"update-available\"}");
  const files = [
    { name: "apply-report.json", byteLength: apply.length, digest: digest(apply) },
    { name: "candidate.bundle", byteLength: bundle.length, digest: digest(bundle) },
    { name: "preview-report.json", byteLength: preview.length, digest: digest(preview) },
  ] as const;
  const manifest: CandidateUpdateManifest = {
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: context.repositoryId,
    repository: context.repository,
    run: { workflowRunId: context.workflowRunId, workflowRunAttempt: context.workflowRunAttempt },
    triggerSha: context.triggerSha,
    baseHeadSha: target.mode === "create" ? context.defaultBranchSha : target.expectedBranch.sha,
    candidateSha: sha("4"),
    candidateTreeSha: sha("5"),
    target,
    candidateDigest: computeCandidateDigest({
      baseHeadSha: target.mode === "create" ? context.defaultBranchSha : target.expectedBranch.sha,
      candidateTreeSha: sha("5"),
      applyReportDigest: files[0].digest,
    }),
    createdAt: "2026-08-20T00:00:00.000Z",
    files,
  };
  assert.equal(manifest.target.historyDigest, historyDigest(pullRequests));
  writeFileSync(join(root, "apply-report.json"), apply);
  writeFileSync(join(root, "candidate.bundle"), bundle);
  writeFileSync(join(root, "preview-report.json"), preview);
  writeFileSync(join(root, "manifest.json"), encodeArtifactManifest(manifest));
  return root;
}

async function commentlessCreateFixture() {
  const target = {
    mode: "create" as const,
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    expectedBranch: { state: "absent" as const },
    historyDigest: historyDigest([]),
  };
  const directory = artifact([], target);
  const source = createFakeGithubAdapter();
  const interrupted = new Proxy(source, {
    get(adapter, property) {
      if (property === "appendJournalComment") {
        return async () => {
          throw new Error("simulated initial journal interruption");
        };
      }
      const value = Reflect.get(adapter, property, adapter) as unknown;
      return typeof value === "function" ? value.bind(adapter) : value;
    },
  });
  await assert.rejects(publishDraft({ adapter: interrupted, artifactDirectory: directory, context }), /interruption/);
  const created = (await source.listPullRequests()).items[0]!;
  assert.equal((await source.listJournalComments(created.prNumber)).items.length, 0);
  const branch = await source.readBranch(created.headRef);
  if (branch === null) throw new Error("fixture branch expected");
  const recoverySource = createFakeGithubAdapter({
    branches: [branch],
    pullRequests: [{
      ...created,
      journalComments: [{
        id: "99",
        authorUserId: "999",
        createdAt: "2026-08-28T00:00:00Z",
        updatedAt: "2026-08-28T00:00:00Z",
        body: "human comment",
      }],
    }],
  });
  return { directory, source: recoverySource, created, target };
}

test("create publishes an immutable v2 root and one committed root journal entry", async () => {
  const target = {
    mode: "create" as const,
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    expectedBranch: { state: "absent" as const },
    historyDigest: historyDigest([]),
  };
  const directory = artifact([], target);
  const adapter = createFakeGithubAdapter();
  try {
    const result = await publishDraft({ adapter, artifactDirectory: directory, context, now: () => new Date("2026-08-20T01:00:00.000Z") });
    assert.equal(result.kind, "published");
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), [
      "create-branch",
      "create-draft-pull-request",
      "append-journal-comment",
    ]);
    const created = await adapter.readPullRequest(1);
    const root = classifyPrRootV2(created?.body ?? null);
    assert.equal(root.kind, "strict");
    if (root.kind === "strict") assert.equal(root.root.creatorUserId, context.creatorUserId);
    const comments = await adapter.listJournalComments(1);
    assert.equal(comments.items.length, 1);
    const receipt = decodeDraftReceipt(result.receipt);
    assert.equal(receipt.prNumber, 1);
    assert.equal(receipt.headSha, sha("4"));
    assert.equal(receipt.manifestDigest, digest(readFileSync(join(directory, "manifest.json"))));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("publish-draft recovers an exact unedited commentless PR root", async () => {
  const fixture = await commentlessCreateFixture();
  try {
    fixture.source.transcript.length = 0;
    const result = await publishDraft({ adapter: fixture.source, artifactDirectory: fixture.directory, context });
    assert.equal(result.kind, "published");
    assert.deepEqual(fixture.source.transcript.map((entry) => entry.operation), ["append-journal-comment"]);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("commentless PR recovery rechecks every write-boundary predicate after discovery", async () => {
  const cases: readonly Readonly<{
    name: string;
    pullRequest?: Partial<GithubPullRequest>;
    branchSha?: string | null;
    journal?: "incomplete" | "managed" | "foreign-marker" | "malformed-marker";
  }>[] = [
    { name: "ready", pullRequest: { draft: false } },
    { name: "closed", pullRequest: { state: "closed" } },
    { name: "merged", pullRequest: { state: "closed", merged: true, draft: false } },
    { name: "title", pullRequest: { title: "changed" } },
    { name: "head repository", pullRequest: { headRepositoryId: "999" } },
    { name: "base repository", pullRequest: { baseRepositoryId: "999" } },
    { name: "head ref", pullRequest: { headRef: "refs/heads/changed" } },
    { name: "base ref", pullRequest: { baseRef: "refs/heads/changed" } },
    { name: "PR head", pullRequest: { headSha: sha("9") } },
    { name: "branch head", branchSha: sha("9") },
    { name: "author", pullRequest: { authorUserId: "999" } },
    { name: "edited body", pullRequest: { lastEditedAt: "2026-08-30T00:00:00Z" } },
    { name: "immutable body", pullRequest: { body: "changed" } },
    { name: "incomplete journal", journal: "incomplete" },
    { name: "managed journal", journal: "managed" },
    { name: "foreign marker", journal: "foreign-marker" },
    { name: "malformed marker", journal: "malformed-marker" },
  ];
  for (const race of cases) {
    const fixture = await commentlessCreateFixture();
    const root = classifyPrRootV2(fixture.created.body);
    assert.equal(root.kind, "strict");
    if (root.kind !== "strict") throw new Error("fixture root missing");
    const initial = appendJournalEntryDigest({
      schemaVersion: 2,
      resourceKind: "pull-request",
      resourceNumber: fixture.created.prNumber,
      creatorUserId: root.root.creatorUserId,
      sequence: 1,
      previousDigest: null,
      phase: "committed",
      operation: "root",
      operationId: digest(Buffer.from([
        "root", root.root.repositoryId, String(fixture.created.prNumber), root.root.initialSnapshotDigest,
      ].join("\0"), "utf8")),
      snapshot: root.root.initialSnapshot,
    });
    const adapter = new Proxy(fixture.source, {
      get(source, property) {
        if (property === "readPullRequest") {
          return async () => ({ ...fixture.created, ...(race.pullRequest ?? {}) });
        }
        if (property === "readBranch" && race.branchSha !== undefined) {
          return async () => race.branchSha === null ? null : { ref: fixture.target.headRef, sha: race.branchSha };
        }
        if (property === "listJournalComments" && race.journal !== undefined) {
          return async () => {
            const observed = await source.listJournalComments(fixture.created.prNumber);
            if (race.journal === "incomplete") return { ...observed, complete: false };
            const marker = race.journal === "managed"
              ? journalCommentBody(initial)
              : race.journal === "foreign-marker"
                ? journalCommentBody({ ...initial, creatorUserId: "999" })
                : "<!-- skill-update-pr-automation:journal:v2:start -->";
            return {
              complete: true,
              items: [...observed.items, {
                id: "100",
                authorUserId: race.journal === "foreign-marker" ? "999" : context.creatorUserId,
                createdAt: "2026-08-30T00:00:00Z",
                updatedAt: "2026-08-30T00:00:00Z",
                body: marker,
              }],
            };
          };
        }
        const value = Reflect.get(source, property, source) as unknown;
        return typeof value === "function" ? value.bind(source) : value;
      },
    });
    try {
      await assert.rejects(
        publishDraft({ adapter, artifactDirectory: fixture.directory, context }),
        /publish-target-changed|post-publish-state-unknown/,
        race.name,
      );
      assert.equal(
        fixture.source.transcript.filter((entry) => entry.operation === "append-journal-comment").length,
        0,
        race.name,
      );
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  }
});

test("commentless PR root recovery rejects foreign author, edited body evidence, and live mismatch", async () => {
  for (const override of [
    { authorUserId: "999" },
    { lastEditedAt: "2026-08-28T00:00:00Z" },
    { draft: false },
  ] satisfies readonly Partial<GithubPullRequest>[]) {
    const fixture = await commentlessCreateFixture();
    try {
      const adapter = createFakeGithubAdapter({
        branches: [{ ref: fixture.target.headRef, sha: sha("4") }],
        pullRequests: [{ ...fixture.created, ...override }],
      });
      await assert.rejects(
        publishDraft({ adapter, artifactDirectory: fixture.directory, context }),
        /publish-target-changed/,
      );
      assert.deepEqual(adapter.transcript, []);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  }
});

test("commentless PR initial append response loss is accepted only by fresh exact reread", async () => {
  const fixture = await commentlessCreateFixture();
  let appendCalls = 0;
  const responseLoss = new Proxy(fixture.source, {
    get(adapter, property) {
      if (property === "appendJournalComment") {
        return async (...args: Parameters<typeof adapter.appendJournalComment>) => {
          appendCalls += 1;
          await adapter.appendJournalComment(...args);
          throw new Error("simulated append response loss");
        };
      }
      const value = Reflect.get(adapter, property, adapter) as unknown;
      return typeof value === "function" ? value.bind(adapter) : value;
    },
  });
  try {
    const result = await publishDraft({ adapter: responseLoss, artifactDirectory: fixture.directory, context });
    assert.equal(result.kind, "published");
    assert.equal(appendCalls, 1);
    const comments = await fixture.source.listJournalComments(fixture.created.prNumber);
    assert.equal(comments.items.length, 2);
    assert.equal(reduceJournalCommentsV2(comments.items, context.creatorUserId).entries.length, 1);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("ready update becomes draft before normal fast-forward append", async () => {
  const existing = pull({ draft: false });
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const adapter = createFakeGithubAdapter({ branches: [{ ref: existing.headRef, sha: existing.headSha }], pullRequests: [existing] });
  try {
    await publishDraft({ adapter, artifactDirectory: directory, context, now: () => new Date("2026-08-20T01:00:00.000Z") });
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), [
      "append-journal-comment",
      "update-pull-request",
      "append-journal-comment",
      "append-journal-comment",
      "append-branch",
      "append-journal-comment",
    ]);
    assert.equal((await adapter.readBranch(existing.headRef))?.sha, sha("4"));
    const updated = await adapter.readPullRequest(1);
    assert.equal(updated?.draft, true);
    assert.equal(updated?.body, existing.body);
    const comments = await adapter.listJournalComments(1);
    const journal = reduceJournalCommentsV2(comments.items, context.creatorUserId);
    assert.deepEqual(journal.entries.map((entry) => [entry.operation, entry.phase]), [
      ["root", "committed"],
      ["pr-draft", "prepared"],
      ["pr-draft", "committed"],
      ["branch-append", "prepared"],
      ["branch-append", "committed"],
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("draft update waits for a delayed pull request head projection after branch append", async () => {
  const existing = pull({ draft: true });
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const source = createFakeGithubAdapter({
    branches: [{ ref: existing.headRef, sha: existing.headSha }], pullRequests: [existing],
  });
  const adapter = withDelayedPullRequestHeadAfterAppend(source, 3);
  try {
    await publishDraft({ adapter, artifactDirectory: directory, context });
    assert.equal(source.transcript.filter((entry) => entry.operation === "append-branch").length, 1);
    const comments = await source.listJournalComments(existing.prNumber);
    assert.equal(comments.items.map((comment) => decodeJournalCommentBodyV2(comment.body)).filter((entry) =>
      entry?.operation === "branch-append" && entry.phase === "committed").length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("human head mismatch stops before every write", async () => {
  const expected = pull();
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: expected.headRef,
    expectedBranch: { state: "present" as const, sha: expected.headSha },
    markerDigest: latestDigest(expected),
    historyDigest: historyDigest([expected]),
  };
  const directory = artifact([expected], target);
  const changed = { ...expected, headSha: sha("9") };
  const adapter = createFakeGithubAdapter({ branches: [{ ref: expected.headRef, sha: sha("9") }], pullRequests: [changed] });
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /identity/);
    assert.deepEqual(adapter.transcript, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("self-consistent journal from another creator stops before every write", async () => {
  const existing = pull({ ...managedFields({
    headSha: sha("3"), draft: true, prNumber: 1, generation: 1, creatorUserId: "999",
  }) });
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: existing.headRef, sha: existing.headSha }], pullRequests: [existing],
  });
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /publish-target-changed/);
    assert.deepEqual(adapter.transcript, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("multiple strict open PRs stop before every write", async () => {
  const first = pull();
  const second = pull({
    prNumber: 2,
    headRef: "refs/heads/automation/skill-updates/g000002",
    headSha: sha("6"),
  });
  const directory = artifact([first], {
    mode: "update",
    generation: 1,
    prNumber: 1,
    headRef: first.headRef,
    expectedBranch: { state: "present", sha: first.headSha },
    markerDigest: latestDigest(first),
    historyDigest: historyDigest([first]),
  });
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: first.headRef, sha: first.headSha }, { ref: second.headRef, sha: second.headSha }],
    pullRequests: [first, second],
  });
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /open-pr-conflict/);
    assert.deepEqual(adapter.transcript, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validated manual resume creates the next generation after closed-unmerged", async () => {
  const closed = pull({ state: "closed", draft: true });
  const target = {
    mode: "create" as const,
    generation: 2,
    headRef: "refs/heads/automation/skill-updates/g000002",
    expectedBranch: { state: "absent" as const },
    historyDigest: historyDigest([closed]),
  };
  const directory = artifact([closed], target);
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: closed.headRef, sha: closed.headSha }],
    pullRequests: [closed],
  });
  try {
    const result = await publishDraft({
      adapter,
      artifactDirectory: directory,
      context: { ...context, resumeClosed: true },
    });
    assert.equal(result.kind, "published");
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), [
      "create-branch", "create-draft-pull-request", "append-journal-comment",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("terminal branch-append prepared recovers from before and commits the same operation", async () => {
  const existing = pull();
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const prepared = withPrepared(existing, "branch-append", desiredState(directory));
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: existing.headRef, sha: existing.headSha }],
    pullRequests: [prepared],
  });
  try {
    await publishDraft({ adapter, artifactDirectory: directory, context });
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["append-branch", "append-journal-comment"]);
    const journal = reduceJournalCommentsV2((await adapter.listJournalComments(1)).items, context.creatorUserId);
    assert.equal(journal.pending, null);
    assert.equal(journal.entries.at(-1)?.operationId, decodeJournalCommentBodyV2(prepared.journalComments!.at(-1)!.body)?.operationId);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("terminal branch-append prepared recovers from after without repeating the branch mutation", async () => {
  const existing = pull();
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const prepared = withPrepared(existing, "branch-append", desiredState(directory));
  const liveAfter = { ...prepared, headSha: sha("4") };
  const adapter = createFakeGithubAdapter({ branches: [{ ref: existing.headRef, sha: sha("4") }], pullRequests: [liveAfter] });
  try {
    await publishDraft({ adapter, artifactDirectory: directory, context });
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["append-journal-comment"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("terminal branch-append recovery rejects an after-before-after branch regression across stabilization phases", async () => {
  const existing = pull();
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const prepared = withPrepared(existing, "branch-append", desiredState(directory));
  const liveAfter = { ...prepared, headSha: sha("4") };
  const source = createFakeGithubAdapter({
    branches: [{ ref: existing.headRef, sha: sha("4") }],
    pullRequests: [liveAfter],
  });
  const adapter = withCrossPhaseBranchRegression(source, prepared);
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /recovery-required/);
    assert.equal(source.transcript.filter((entry) => entry.operation === "append-branch").length, 0);
    const journal = reduceJournalCommentsV2((await source.listJournalComments(1)).items, context.creatorUserId);
    assert.notEqual(journal.pending, null);
    assert.equal(journal.entries.some((entry) => entry.operation === "branch-append" && entry.phase === "committed"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("terminal prepared with divergent live state fails closed", async () => {
  const existing = pull();
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const prepared = withPrepared(existing, "branch-append", desiredState(directory));
  const divergent = { ...prepared, headSha: sha("9") };
  const adapter = createFakeGithubAdapter({ branches: [{ ref: existing.headRef, sha: sha("9") }], pullRequests: [divergent] });
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /identity|recovery-required/);
    assert.deepEqual(adapter.transcript, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("branch mutation rejection leaves exactly one terminal prepared entry", async () => {
  const existing = pull();
  const target = {
    mode: "update" as const,
    generation: 1,
    prNumber: 1,
    headRef: existing.headRef,
    expectedBranch: { state: "present" as const, sha: existing.headSha },
    markerDigest: latestDigest(existing),
    historyDigest: historyDigest([existing]),
  };
  const directory = artifact([existing], target);
  const adapter = createFakeGithubAdapter({
    branches: [{ ref: existing.headRef, sha: existing.headSha }],
    pullRequests: [existing],
    faults: [{ operation: "append-branch", kind: "permission-denied" }],
  });
  try {
    await assert.rejects(publishDraft({ adapter, artifactDirectory: directory, context }), /permission denied/);
    assert.deepEqual(adapter.transcript.map((entry) => entry.operation), ["append-journal-comment", "append-branch"]);
    assert.notEqual(reduceJournalCommentsV2((await adapter.listJournalComments(1)).items, context.creatorUserId).pending, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
