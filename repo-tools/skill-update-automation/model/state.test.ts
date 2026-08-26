import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTrigger, selectPrHistoryState } from "./state.ts";

test("trigger model gates schedule by exact variable and allowlists manual boolean input", () => {
  assert.deepEqual(evaluateTrigger({ event: "schedule", autoUpdateVariable: "true" }), {
    decision: "run",
    resumeClosed: false,
  });
  for (const value of [undefined, "TRUE", " true", "true "]) {
    assert.deepEqual(evaluateTrigger({ event: "schedule", autoUpdateVariable: value }), {
      decision: "opt-out",
      resumeClosed: false,
    });
  }
  assert.deepEqual(evaluateTrigger({ event: "workflow_dispatch", inputs: { resume_closed: true } }), {
    decision: "run",
    resumeClosed: true,
  });
  assert.throws(() => evaluateTrigger({
    event: "workflow_dispatch",
    inputs: { resume_closed: false, unknown: true },
  }));
  assert.throws(() => evaluateTrigger({ event: "workflow_dispatch", inputs: { resume_closed: "false" } }));
});

test("PR history reducer prioritizes duplicate generation, then multiple open, then latest state", () => {
  assert.deepEqual(selectPrHistoryState([], false), { kind: "create", generation: 1 });
  assert.deepEqual(selectPrHistoryState([
    { generation: 2, prNumber: 20, state: "open", merged: false },
    { generation: 1, prNumber: 30, state: "open", merged: false },
    { generation: 2, prNumber: 10, state: "closed", merged: false },
  ], false), {
    kind: "generation-conflict",
    members: [{ generation: 2, prNumber: 10 }, { generation: 2, prNumber: 20 }],
  });
  assert.deepEqual(selectPrHistoryState([
    { generation: 2, prNumber: 20, state: "open", merged: false },
    { generation: 1, prNumber: 10, state: "open", merged: false },
  ], false), {
    kind: "open-pr-conflict",
    members: [{ generation: 1, prNumber: 10 }, { generation: 2, prNumber: 20 }],
  });
  assert.deepEqual(selectPrHistoryState([
    { generation: 2, prNumber: 20, state: "closed", merged: false },
  ], false), {
    kind: "paused-closed",
    member: { generation: 2, prNumber: 20 },
  });
  assert.deepEqual(selectPrHistoryState([
    { generation: 2, prNumber: 20, state: "closed", merged: false },
  ], true), { kind: "create", generation: 3 });
  assert.deepEqual(selectPrHistoryState([
    { generation: 2, prNumber: 20, state: "closed", merged: true },
  ], false), {
    kind: "merged",
    member: { generation: 2, prNumber: 20 },
    nextGeneration: 3,
  });
});
