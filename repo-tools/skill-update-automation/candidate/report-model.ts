import type { CommandReport } from "../../skill-updater/index.ts";
import type { FailureState, Scope } from "../model/index.ts";

export type CandidateCommandStatus =
  | "candidate-update" | "existing-head-validation" | "no-op"
  | "updater-rejected" | "candidate-invalid" | "recovery-required";
export type CandidateStopState = FailureState | "pr-identity-conflict" | "trigger-usage-failure";
export type CandidateFailure = Readonly<{ state: CandidateStopState; scope: Scope; summaryOnly: boolean }>;
export type CandidateCommandReport = Readonly<{
  schemaVersion: 1;
  command: "skills:automation:candidate";
  status: CandidateCommandStatus;
  artifactDirectory?: string;
  updaterReport?: CommandReport;
  failure?: CandidateFailure;
  errors: readonly string[];
}>;
export type CandidateCommandResult = Readonly<{
  exitCode: 0 | 1;
  stdout: string;
  stderr: string;
  report: CandidateCommandReport;
}>;

export function candidateResult(report: CandidateCommandReport): CandidateCommandResult {
  const failure = report.failure ?? (report.status === "updater-rejected"
    ? { state: "updater-rejected", scope: { kind: "global", operation: "detect" }, summaryOnly: false } as const
    : report.status === "candidate-invalid"
      ? { state: "candidate-invalid", scope: { kind: "global", operation: "detect" }, summaryOnly: false } as const
      : report.status === "recovery-required"
        ? { state: "recovery-required", scope: { kind: "global", operation: "detect" }, summaryOnly: false } as const
        : undefined);
  const normalized = failure === undefined ? report : { ...report, failure };
  const exitCode = ["candidate-update", "existing-head-validation", "no-op"].includes(report.status) ? 0 : 1;
  return { exitCode, stdout: `${JSON.stringify(normalized)}\n`, stderr: "", report: normalized };
}

export function updaterFailure(report: CommandReport): CandidateFailure {
  const failed = report.cohorts.filter((cohort) => cohort.status === "failed");
  return {
    state: "updater-rejected",
    scope: failed.length === 1 ? { kind: "cohort", cohortKey: failed[0]!.key } : { kind: "global", operation: "detect" },
    summaryOnly: false,
  };
}
