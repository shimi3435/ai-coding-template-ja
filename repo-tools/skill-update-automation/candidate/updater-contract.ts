import type { SkillCommandResult } from "../../skill-updater/index.ts";
import { parseObject, requireExactKeys } from "../model/index.ts";

export class UpdaterRejected extends Error {
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[] = []) {
    super(message);
    this.name = "UpdaterRejected";
    this.details = details.length === 0 ? [message] : details;
  }
}

export function validateUpdaterResult(value: SkillCommandResult): SkillCommandResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value.stdout) as unknown;
  } catch {
    throw new UpdaterRejected("updater JSONが不正です");
  }
  const report = parseObject(decoded, "updater report");
  requireExactKeys(report, ["schemaVersion", "command", "status", "cohorts", "warnings", "errors", "exitCode"], "updater report");
  const statuses = new Set([
    "up-to-date", "update-available", "no-content-change", "applied", "unchanged",
    "rolled-back", "failed", "unknown", "not-attempted",
  ]);
  if (typeof report.status !== "string" || !statuses.has(report.status)) throw new UpdaterRejected("updater machine statusが不正です");
  if (!Array.isArray(report.cohorts) || !Array.isArray(report.warnings) || !Array.isArray(report.errors)) {
    throw new UpdaterRejected("updater report arrayが不正です");
  }
  if (report.warnings.some((item) => typeof item !== "string") || report.errors.some((item) => typeof item !== "string")) {
    throw new UpdaterRejected("updater warning/errorが不正です");
  }
  for (const rawCohort of report.cohorts) {
    const cohort = parseObject(rawCohort, "updater cohort");
    const allowed = new Set([
      "key", "status", "names", "resolvedCommit", "diff", "expectedBeforeLockDigest",
      "candidateAfterLockDigest", "candidateAfterLock",
    ]);
    if (Object.keys(cohort).some((key) => !allowed.has(key)) || typeof cohort.key !== "string" || cohort.key.length === 0 ||
      typeof cohort.status !== "string" || !statuses.has(cohort.status) || !Array.isArray(cohort.names) ||
      cohort.names.some((name) => typeof name !== "string" || name.length === 0)) {
      throw new UpdaterRejected("updater cohortが不正です");
    }
  }
  if (report.schemaVersion !== 1 || report.command !== "skills:update" || report.exitCode !== value.exitCode ||
    value.report.command !== "skills:update" || value.report.exitCode !== value.exitCode || value.stderr !== "" ||
    value.stdout !== `${JSON.stringify(value.report)}\n` || value.stdout !== `${JSON.stringify(decoded)}\n`) {
    throw new UpdaterRejected("updater JSON contractが不正です");
  }
  if (value.exitCode !== 0 && value.exitCode !== 1) {
    throw new UpdaterRejected(`skills:update exitが不正です: ${value.exitCode}`);
  }
  return value;
}
