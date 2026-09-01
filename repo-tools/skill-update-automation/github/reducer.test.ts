import assert from "node:assert/strict";
import test from "node:test";

import { reduceManagedPrHistory } from "./reducer.ts";

test("generation conflict wins over multiple open PRs and keeps a sorted set scope", () => {
  const decision = reduceManagedPrHistory([
    { generation: 2, prNumber: 40, state: "open", merged: false },
    { generation: 1, prNumber: 30, state: "open", merged: false },
    { generation: 2, prNumber: 20, state: "closed", merged: false },
  ], false);

  assert.deepEqual(decision, {
    kind: "generation-conflict",
    state: "generation-conflict",
    writePolicy: "issue-only",
    scope: {
      kind: "pr",
      mode: "set",
      members: [
        { generation: 2, prNumber: 20 },
        { generation: 2, prNumber: 40 },
      ],
    },
  });
});

test("fresh history moves from resolved generation conflict to open conflict", () => {
  const decision = reduceManagedPrHistory([
    { generation: 1, prNumber: 30, state: "open", merged: false },
    { generation: 2, prNumber: 40, state: "open", merged: false },
  ], false);
  assert.deepEqual(decision, {
    kind: "open-pr-conflict",
    state: "open-pr-conflict",
    writePolicy: "issue-only",
    scope: {
      kind: "pr",
      mode: "set",
      members: [
        { generation: 1, prNumber: 30 },
        { generation: 2, prNumber: 40 },
      ],
    },
  });
});

test("closed-unmerged pauses by default and explicit resume advances generation", () => {
  const history = [{ generation: 9, prNumber: 90, state: "closed" as const, merged: false }];
  assert.equal(reduceManagedPrHistory(history, false).kind, "paused-closed");
  assert.deepEqual(reduceManagedPrHistory(history, true), {
    kind: "create",
    generation: 10,
    writePolicy: "publish",
  });
});

test("open and merged latest generations keep distinct lifecycle decisions", () => {
  assert.deepEqual(reduceManagedPrHistory([
    { generation: 3, prNumber: 30, state: "open", merged: false },
  ], false), {
    kind: "open",
    member: { generation: 3, prNumber: 30 },
    writePolicy: "publish",
  });
  assert.deepEqual(reduceManagedPrHistory([
    { generation: 3, prNumber: 30, state: "closed", merged: true },
  ], false), {
    kind: "merged",
    member: { generation: 3, prNumber: 30 },
    nextGeneration: 4,
    writePolicy: "publish",
  });
});
