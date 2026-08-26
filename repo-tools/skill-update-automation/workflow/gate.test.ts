import assert from "node:assert/strict";
import test from "node:test";

import { evaluateWorkflowGate, renderWorkflowGateOutputs } from "./gate.ts";

test("schedule proceeds only for the exact ASCII true opt-in", () => {
  assert.deepEqual(evaluateWorkflowGate({
    eventName: "schedule",
    autoUpdateVariable: "true",
    inputsJson: "{}",
  }), { shouldRun: true, resumeClosed: false });

  for (const value of [undefined, "", "TRUE", " true", "true ", "ｔｒｕｅ"]) {
    assert.deepEqual(evaluateWorkflowGate({
      eventName: "schedule",
      autoUpdateVariable: value,
      inputsJson: "{}",
    }), { shouldRun: false, resumeClosed: false });
  }
});

test("manual dispatch accepts only the declared boolean resume input", () => {
  assert.deepEqual(evaluateWorkflowGate({
    eventName: "workflow_dispatch",
    autoUpdateVariable: undefined,
    inputsJson: '{"resume_closed":true}',
  }), { shouldRun: true, resumeClosed: true });

  for (const inputsJson of [
    "{}",
    '{"resume_closed":"true"}',
    '{"resume_closed":false,"unknown":false}',
    "[]",
    "not-json",
  ]) {
    assert.throws(() => evaluateWorkflowGate({
      eventName: "workflow_dispatch",
      autoUpdateVariable: undefined,
      inputsJson,
    }));
  }
});

test("gate outputs are exact GitHub output records", () => {
  assert.equal(renderWorkflowGateOutputs({ shouldRun: true, resumeClosed: false }),
    "should-run=true\nresume-closed=false\n");
});
