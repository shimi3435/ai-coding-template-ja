import { parseRunRef, type RunRef, type ValidationState } from "../model/index.ts";

export type ValidationInfrastructureStage =
  | "checkout"
  | "artifact"
  | "runner"
  | "timeout"
  | "cancelled"
  | "unknown";

export type ValidationCommandObservation = Readonly<{
  command: string;
  exitCode: number | null;
}>;

export type ValidationOutcomeInput = Readonly<{
  run: RunRef;
  commands?: readonly ValidationCommandObservation[];
  infrastructureStage?: ValidationInfrastructureStage;
}>;

export function classifyValidationOutcome(input: ValidationOutcomeInput): ValidationState {
  const run = parseRunRef(input.run);
  if (input.commands !== undefined && input.infrastructureStage !== undefined) {
    throw new Error("command resultとinfrastructure failureは混在できません");
  }
  if (input.infrastructureStage !== undefined) {
    return {
      status: "failed",
      run,
      failureKind: "infrastructure",
      stage: input.infrastructureStage,
    };
  }
  if (input.commands === undefined || input.commands.length === 0) {
    throw new Error("required command resultがありません");
  }
  for (const observation of input.commands) {
    if (observation.command.length === 0) throw new Error("validation commandが空です");
    if (observation.exitCode === null) {
      return { status: "failed", run, failureKind: "infrastructure", stage: "runner" };
    }
    if (!Number.isSafeInteger(observation.exitCode) || observation.exitCode < 0) {
      throw new Error("validation command exit codeが不正です");
    }
    if (observation.exitCode !== 0) {
      return { status: "failed", run, failureKind: "command", command: observation.command };
    }
  }
  return { status: "passed", run };
}
