import assert from "node:assert/strict";
import test from "node:test";

import { createPresentResourceState, encodeSmokePreview, type SmokePreview } from "../model/index.ts";
import { buildSmokePreview } from "./command.ts";
import { FakeSmokeHost } from "./fake-host.ts";

const sourceCommit = "a".repeat(40);

async function validPreview(): Promise<SmokePreview> {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  return buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);
}

type MutableObservation = { resource: Record<string, unknown>; state: Record<string, unknown> };
type MutableStep = { before: MutableObservation[]; after: MutableObservation[] };
type MutablePreview = Record<string, unknown> & {
  steps: MutableStep[];
  checkpoints: Array<{ kind: string; resourceKeys: string[] }>;
};

function mutable(preview: SmokePreview): MutablePreview {
  return structuredClone(preview) as unknown as MutablePreview;
}

test("planned create postconditions reject closed, ready, merged, or wrong-kind states", async () => {
  const preview = await validPreview();
  const draft = preview.steps[1]!.after[0]!.state;
  const issueOpen = preview.steps[10]!.after[0]!.state;
  assert.equal(draft.state, "present");
  assert.equal(issueOpen.state, "present");
  if (draft.state !== "present" || draft.value.kind !== "pull-request-state" ||
    issueOpen.state !== "present" || issueOpen.value.kind !== "issue-state") return;

  const invalidStates = [
    createPresentResourceState({ ...draft.value, state: "closed" }),
    createPresentResourceState({ ...draft.value, draft: false }),
    { ...draft, value: { ...draft.value, merged: true } },
  ];
  for (const after of invalidStates) {
    const invalid = mutable(preview);
    invalid.steps[1]!.after[0]!.state = after as unknown as Record<string, unknown>;
    assert.throws(() => encodeSmokePreview(invalid));
  }
  const invalidIssue = mutable(preview);
  invalidIssue.steps[10]!.after[0]!.state = createPresentResourceState({
    ...issueOpen.value,
    state: "closed",
  }) as unknown as Record<string, unknown>;
  assert.throws(() => encodeSmokePreview(invalidIssue));
});

test("PR close and reopen reject merged or unrelated field changes", async () => {
  const preview = await validPreview();
  const close = preview.steps[7]!.after[0]!.state;
  assert.equal(close.state, "present");
  if (close.state !== "present" || close.value.kind !== "pull-request-state") return;

  const mergedClose = mutable(preview);
  mergedClose.steps[7]!.after[0]!.state = createPresentResourceState({
    ...close.value,
    merged: true,
  }) as unknown as Record<string, unknown>;
  assert.throws(() => encodeSmokePreview(mergedClose));

  const changedClose = mutable(preview);
  changedClose.steps[7]!.after[0]!.state = createPresentResourceState({
    ...close.value,
    bodyDigest: `sha256:${"c".repeat(64)}`,
  }) as unknown as Record<string, unknown>;
  assert.throws(() => encodeSmokePreview(changedClose));

  const mergedReopen = mutable(preview);
  const reopenBefore = mergedReopen.steps[8]!.before[0]!.state;
  const reopenAfter = mergedReopen.steps[8]!.after[0]!.state;
  reopenBefore.value = { ...(reopenBefore.value as Record<string, unknown>), merged: true };
  reopenAfter.value = { ...(reopenAfter.value as Record<string, unknown>), merged: true };
  assert.throws(() => encodeSmokePreview(mergedReopen));
});

test("descriptor mismatch, broken state chain, coupled effect, and missing cleanup fail before write", async () => {
  const preview = await validPreview();

  const descriptorMismatch = mutable(preview);
  const locator = descriptorMismatch.steps[1]!.before[0]!.resource.locator as Record<string, unknown>;
  locator.headRef = "refs/heads/other";
  assert.throws(() => encodeSmokePreview(descriptorMismatch));

  const brokenChain = mutable(preview);
  brokenChain.steps[2]!.before[0]!.state = { state: "absent" };
  assert.throws(() => encodeSmokePreview(brokenChain));

  const brokenCoupling = mutable(preview);
  const appendedPr = brokenCoupling.steps[3]!.after[1]!.state;
  const value = appendedPr.value as Record<string, unknown>;
  value.headSha = "e".repeat(40);
  assert.throws(() => encodeSmokePreview(brokenCoupling));

  const missingCoupling = mutable(preview);
  missingCoupling.steps[3]!.after[1]!.state = structuredClone(missingCoupling.steps[3]!.before[1]!.state);
  missingCoupling.steps[4]!.before[0]!.state = structuredClone(missingCoupling.steps[3]!.before[1]!.state);
  assert.throws(() => encodeSmokePreview(missingCoupling));

  assert.throws(() => encodeSmokePreview({ ...preview, steps: preview.steps.slice(0, -1) }));

  const partialCleanup = mutable(preview);
  partialCleanup.checkpoints.find((checkpoint) => checkpoint.kind === "cleanup")!.resourceKeys = ["smoke-branch"];
  assert.throws(() => encodeSmokePreview(partialCleanup));
});
