import assert from "node:assert/strict";
import test from "node:test";

import { decodeCandidateCommandReport, renderCandidateReportOutputs, renderCandidateReportSummary } from "./report.ts";

const report = (failure: unknown): Buffer => Buffer.from(`${JSON.stringify({
  schemaVersion: 1,
  command: "skills:automation:candidate",
  status: "updater-rejected",
  failure,
  errors: ["opaque"],
})}\n`);

test("candidate report exposes only fixed routing outputs", () => {
  const bytes = report({
    state: "updater-rejected",
    scope: { kind: "global", operation: "detect" },
    summaryOnly: false,
  });
  assert.equal(renderCandidateReportOutputs(bytes),
    "candidate-status=updater-rejected\nfailure-state=updater-rejected\nsummary-only=false\n");
  assert.equal(decodeCandidateCommandReport(bytes).failure?.state, "updater-rejected");
});

test("candidate report rejects malformed framing, scope, and publish failure metadata", () => {
  assert.throws(() => decodeCandidateCommandReport(Buffer.from("{}")), /単一JSON行/);
  assert.throws(() => decodeCandidateCommandReport(report({
    state: "updater-rejected",
    scope: { kind: "global", operation: "unknown" },
    summaryOnly: false,
  })), /global operation/);
  const publish = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    command: "skills:automation:candidate",
    status: "candidate-update",
    failure: { state: "candidate-invalid", scope: { kind: "global", operation: "detect" }, summaryOnly: false },
    errors: [],
  })}\n`);
  assert.throws(() => decodeCandidateCommandReport(publish), /not permitted|許可/);
});

test("summary-only stop renders read-only workflow evidence", () => {
  const bytes = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    command: "skills:automation:candidate",
    status: "candidate-invalid",
    failure: {
      state: "pr-identity-conflict",
      scope: { kind: "global", operation: "detect" },
      summaryOnly: true,
    },
    errors: ["partial"],
  })}\n`);
  assert.match(renderCandidateReportSummary(bytes), /pr-identity-conflict/);
  assert.match(renderCandidateReportSummary(bytes), /external writes: none/);
  assert.throws(() => renderCandidateReportSummary(report({
    state: "updater-rejected",
    scope: { kind: "global", operation: "detect" },
    summaryOnly: false,
  })), /summary-only/);
});
