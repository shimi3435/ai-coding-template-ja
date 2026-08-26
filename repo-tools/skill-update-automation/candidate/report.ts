import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  computeIssueEntryKey,
  parseObject,
  requireExactKeys,
  type Scope,
} from "../model/index.ts";
import type {
  CandidateCommandReport,
  CandidateCommandStatus,
  CandidateFailure,
  CandidateStopState,
} from "./report-model.ts";

const statuses: readonly CandidateCommandStatus[] = [
  "candidate-update", "existing-head-validation", "no-op",
  "updater-rejected", "candidate-invalid", "recovery-required",
];
const stopStates: readonly CandidateStopState[] = [
  "updater-rejected", "candidate-invalid", "validation-failed", "permission-denied", "recovery-required",
  "cleanup-failed", "intervention-required", "generation-conflict", "open-pr-conflict", "paused-closed",
  "pr-identity-conflict", "trigger-usage-failure",
];

function parseFailure(value: unknown): CandidateFailure {
  const object = parseObject(value, "candidate failure");
  requireExactKeys(object, ["state", "scope", "summaryOnly"], "candidate failure");
  if (typeof object.state !== "string" || !stopStates.includes(object.state as CandidateStopState)) {
    throw new Error("candidate failure stateが不正です");
  }
  if (typeof object.summaryOnly !== "boolean") throw new Error("candidate summaryOnlyが不正です");
  computeIssueEntryKey("recovery-required", object.scope);
  return {
    state: object.state as CandidateStopState,
    scope: structuredClone(object.scope) as Scope,
    summaryOnly: object.summaryOnly,
  };
}

export function decodeCandidateCommandReport(bytes: Uint8Array): CandidateCommandReport {
  const text = Buffer.from(bytes).toString("utf8");
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n")) throw new Error("candidate reportは単一JSON行が必要です");
  const object = parseObject(JSON.parse(text), "candidate report");
  const allowed = ["schemaVersion", "command", "status", "artifactDirectory", "updaterReport", "failure", "errors"];
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`candidate reportにunknown fieldがあります: ${unknown.join(", ")}`);
  for (const key of ["schemaVersion", "command", "status", "errors"] as const) {
    if (!(key in object)) throw new Error(`candidate report fieldがありません: ${key}`);
  }
  if (object.schemaVersion !== 1 || object.command !== "skills:automation:candidate" ||
    typeof object.status !== "string" || !statuses.includes(object.status as CandidateCommandStatus)) {
    throw new Error("candidate report identityが不正です");
  }
  if (!Array.isArray(object.errors) || object.errors.some((error) => typeof error !== "string")) {
    throw new Error("candidate report errorsが不正です");
  }
  const failure = object.failure === undefined ? undefined : parseFailure(object.failure);
  if (["updater-rejected", "candidate-invalid", "recovery-required"].includes(object.status) && failure === undefined) {
    throw new Error("failed candidate reportにfailureが必要です");
  }
  if ((object.status === "candidate-update" || object.status === "existing-head-validation") && failure !== undefined) {
    throw new Error("publish candidate reportにfailureは許可されません");
  }
  if (object.artifactDirectory !== undefined && typeof object.artifactDirectory !== "string") {
    throw new Error("candidate artifactDirectoryが不正です");
  }
  return {
    schemaVersion: 1,
    command: "skills:automation:candidate",
    status: object.status as CandidateCommandStatus,
    ...(object.artifactDirectory === undefined ? {} : { artifactDirectory: object.artifactDirectory }),
    ...(object.updaterReport === undefined ? {} : { updaterReport: structuredClone(object.updaterReport) as CandidateCommandReport["updaterReport"] }),
    ...(failure === undefined ? {} : { failure }),
    errors: [...object.errors] as string[],
  };
}

export function renderCandidateReportOutputs(bytes: Uint8Array): string {
  const report = decodeCandidateCommandReport(bytes);
  return [
    `candidate-status=${report.status}`,
    `failure-state=${report.failure?.state ?? ""}`,
    `summary-only=${report.failure?.summaryOnly === true ? "true" : "false"}`,
    "",
  ].join("\n");
}

export function renderCandidateReportSummary(bytes: Uint8Array): string {
  const report = decodeCandidateCommandReport(bytes);
  if (report.failure?.summaryOnly !== true) throw new Error("candidate report is not summary-only");
  return `### Skill update automation detection\n\n- stop: ${report.failure.state}\n- external writes: none\n`;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bytes = readFileSync(process.env.CANDIDATE_REPORT_FILE ?? "");
  process.stdout.write(process.argv[2] === "--summary" ? renderCandidateReportSummary(bytes) : renderCandidateReportOutputs(bytes));
}
