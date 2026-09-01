import { fileURLToPath } from "node:url";

import { evaluateTrigger } from "../model/index.ts";

export type WorkflowGateInput = Readonly<{
  eventName: string;
  autoUpdateVariable: string | undefined;
  inputsJson: string;
}>;

export type WorkflowGateDecision = Readonly<{
  shouldRun: boolean;
  resumeClosed: boolean;
}>;

export function evaluateWorkflowGate(input: WorkflowGateInput): WorkflowGateDecision {
  if (input.eventName === "schedule") {
    const decision = evaluateTrigger({
      event: "schedule",
      autoUpdateVariable: input.autoUpdateVariable ?? "",
    });
    return { shouldRun: decision.decision === "run", resumeClosed: false };
  }
  if (input.eventName !== "workflow_dispatch") throw new Error("workflow eventが不正です");
  let inputs: unknown;
  try {
    inputs = JSON.parse(input.inputsJson) as unknown;
  } catch {
    throw new Error("workflow inputs JSONが不正です");
  }
  const decision = evaluateTrigger({ event: "workflow_dispatch", inputs });
  return { shouldRun: true, resumeClosed: decision.resumeClosed };
}

export function renderWorkflowGateOutputs(decision: WorkflowGateDecision): string {
  return `should-run=${String(decision.shouldRun)}\nresume-closed=${String(decision.resumeClosed)}\n`;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const decision = evaluateWorkflowGate({
    eventName: process.env.GITHUB_EVENT_NAME ?? "",
    autoUpdateVariable: process.env.SKILLS_AUTO_UPDATE,
    inputsJson: process.env.AUTOMATION_INPUTS_JSON ?? "{}",
  });
  process.stdout.write(renderWorkflowGateOutputs(decision));
}
