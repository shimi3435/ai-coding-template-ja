import assert from "node:assert/strict";
import test from "node:test";

import { createPresentResourceState, encodeSmokePreview } from "./smoke.ts";

const sha = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

test("normalized resource state includes schema-order value digest", () => {
  const state = createPresentResourceState({
    schemaVersion: 1,
    kind: "branch-state",
    ref: "refs/heads/test",
    sha: sha("a"),
  });

  assert.deepEqual(state, {
    state: "present",
    value: {
      schemaVersion: 1,
      kind: "branch-state",
      ref: "refs/heads/test",
      sha: sha("a"),
    },
    digest: "sha256:95430f2dab7635e6a2c063005067c08ca358cf3d90dd8f885ad0e1c4a350ba93",
  });
});

test("normalized PR and issue states enforce lifecycle fields", () => {
  const pr = {
    schemaVersion: 1,
    kind: "pull-request-state",
    headRepositoryId: "123",
    headRef: "refs/heads/topic",
    headSha: sha("a"),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    draft: true,
    state: "open",
    merged: false,
    bodyDigest: digest("b"),
  } as const;
  const issue = {
    schemaVersion: 1,
    kind: "issue-state",
    state: "closed",
    title: "Skill update automation requires attention",
    bodyDigest: digest("c"),
  } as const;

  assert.deepEqual(createPresentResourceState(pr).value, pr);
  assert.deepEqual(createPresentResourceState(issue).value, issue);
  assert.throws(() => createPresentResourceState({ ...pr, merged: true }));
});

test("SmokePreview v1 and v2 are rejected after the v3 recovery migration", () => {
  assert.throws(() => encodeSmokePreview({
    schemaVersion: 1,
    kind: "real-host-smoke-preview",
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit: sha("b"),
    createdAt: "2026-08-20T01:02:03.004Z",
    targets: [],
  }));
  assert.throws(() => encodeSmokePreview({
    schemaVersion: 2,
    kind: "real-host-smoke-preview",
    repositoryId: "123",
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit: sha("b"),
    createdAt: "2026-08-20T01:02:03.004Z",
    steps: [],
    checkpoints: [],
  }));
});
