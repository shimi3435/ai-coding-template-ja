import { parseRunRef, type RunRef, type ValidationState } from "../model/index.ts";

export type WorkflowValidationOutput =
  | Readonly<{ status: "passed" }>
  | Readonly<{ status: "failed"; failureKind: "command"; command: string }>
  | Readonly<{
      status: "failed";
      failureKind: "infrastructure";
      stage: "checkout" | "artifact" | "runner" | "timeout" | "cancelled" | "unknown";
    }>;

export type WorkflowValidationObservation = Readonly<{
  run: RunRef;
  jobResult: "success" | "failure" | "cancelled" | "skipped";
  checkoutOutcome?: "success" | "failure" | "skipped";
  artifactOutcome?: "success" | "failure" | "skipped";
  stepOutcome?: "success" | "failure" | "skipped";
  timedOut?: boolean;
  output?: WorkflowValidationOutput;
}>;

export function classifyWorkflowValidation(input: WorkflowValidationObservation): Exclude<ValidationState, { status: "pending" }> {
  const run = parseRunRef(input.run);
  if (input.output !== undefined) {
    if (input.output.status === "passed") return { status: "passed", run };
    if (input.output.failureKind === "command") {
      if (input.output.command.length === 0) throw new Error("failed commandが必要です");
      return { status: "failed", run, failureKind: "command", command: input.output.command };
    }
    return { status: "failed", run, failureKind: "infrastructure", stage: input.output.stage };
  }
  let stage: "checkout" | "artifact" | "runner" | "timeout" | "cancelled" | "unknown" = "unknown";
  if (input.jobResult === "cancelled") stage = input.timedOut === true ? "timeout" : "cancelled";
  else if (input.checkoutOutcome === "failure") stage = "checkout";
  else if (input.artifactOutcome === "failure") stage = "artifact";
  else if (input.stepOutcome === "failure") stage = "runner";
  return { status: "failed", run, failureKind: "infrastructure", stage };
}
