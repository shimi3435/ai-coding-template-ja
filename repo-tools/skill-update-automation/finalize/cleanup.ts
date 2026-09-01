import { existsSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDecimalId, parsePositiveSafeInteger } from "../model/index.ts";

export function cleanupFinalizeStage(input: Readonly<{
  runnerTemp: string;
  workflowRunId: string;
  workflowRunAttempt: string;
}>): void {
  if (!isAbsolute(input.runnerTemp) || resolve(input.runnerTemp) !== input.runnerTemp) {
    throw new Error("runner tempはabsolute normalized pathが必要です");
  }
  const workflowRunId = parseDecimalId(input.workflowRunId);
  if (!/^[1-9][0-9]*$/.test(input.workflowRunAttempt)) {
    throw new Error("workflow run attemptがcanonical positive decimalではありません");
  }
  const attempt = parsePositiveSafeInteger(Number(input.workflowRunAttempt));
  const target = join(input.runnerTemp, `skill-update-finalize-${workflowRunId}-${attempt}`);
  if (!resolve(target).startsWith(`${input.runnerTemp}/`)) throw new Error("finalize cleanup targetがrunner temp外です");
  rmSync(target, { recursive: true, force: true });
  if (existsSync(target)) throw new Error("finalize stage artifact remains");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  cleanupFinalizeStage({
    runnerTemp: process.env.RUNNER_TEMP ?? "",
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? "",
    workflowRunAttempt: process.env.WORKFLOW_RUN_ATTEMPT ?? "",
  });
}
