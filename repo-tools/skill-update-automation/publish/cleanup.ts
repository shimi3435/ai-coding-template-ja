import { existsSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDecimalId, parsePositiveSafeInteger } from "../model/index.ts";

export function cleanupPublishStage(input: Readonly<{
  runnerTemp: string;
  workflowRunId: string;
  workflowRunAttempt: string;
  stage: "publish" | "validation" | "recovery";
}>): void {
  if (!isAbsolute(input.runnerTemp) || resolve(input.runnerTemp) !== input.runnerTemp) {
    throw new Error("runner tempはabsolute normalized pathが必要です");
  }
  if (input.stage !== "publish" && input.stage !== "validation" && input.stage !== "recovery") {
    throw new Error("cleanup stageが不正です");
  }
  const workflowRunId = parseDecimalId(input.workflowRunId);
  if (!/^[1-9][0-9]*$/.test(input.workflowRunAttempt)) {
    throw new Error("workflow run attemptがcanonical positive decimalではありません");
  }
  const workflowRunAttempt = parsePositiveSafeInteger(Number(input.workflowRunAttempt));
  const target = join(input.runnerTemp, `skill-update-${input.stage}-${workflowRunId}-${workflowRunAttempt}`);
  if (!resolve(target).startsWith(`${input.runnerTemp}/`)) throw new Error("cleanup targetがrunner temp外です");
  rmSync(target, { recursive: true, force: true });
  if (existsSync(target)) throw new Error("publish stage artifact remains");
}

function parseStage(value: string | undefined): "publish" | "validation" | "recovery" {
  if (value === "publish" || value === "validation" || value === "recovery") return value;
  throw new Error("cleanup stageが不正です");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  cleanupPublishStage({
    runnerTemp: process.env.RUNNER_TEMP ?? "",
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? "",
    workflowRunAttempt: process.env.WORKFLOW_RUN_ATTEMPT ?? "",
    stage: parseStage(process.env.STAGE),
  });
}
