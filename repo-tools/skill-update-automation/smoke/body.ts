import { createHash } from "node:crypto";

import {
  managedPrTitle,
  renderManagedPrSection,
  type ValidationState,
} from "../model/pr.ts";
import type { RunRef } from "../model/validation.ts";

export const smokePullRequestTitle = managedPrTitle;
export const smokeIssueTitle = "Skill update automation requires attention";
export const smokeBranchRef = "refs/heads/automation/skill-updates/g999999";
export type SmokePullRequestPhase = "initial" | "validation-failed" | "passed";

export type SmokePullRequestBodyContext = Readonly<{
  repositoryId: string;
  repository: string;
  run: RunRef;
  headRef: string;
  baseRef: string;
  validationBaseSha: string;
  sourceCommit: string;
}>;

export type SmokeIssueBodyContext = Readonly<{
  repositoryId: string;
  repository: string;
  run: RunRef;
  sourceCommit: string;
}>;

export function smokePullRequestBody(context: SmokePullRequestBodyContext, phase: SmokePullRequestPhase): string {
  const expectedHeadSha = phase === "passed" ? context.sourceCommit : context.validationBaseSha;
  const validation: ValidationState = phase === "initial"
    ? { status: "pending", run: context.run }
    : phase === "validation-failed"
      ? { status: "failed", run: context.run, failureKind: "command", command: "task check" }
      : { status: "passed", run: context.run };
  return renderManagedPrSection({
    schemaVersion: 1,
    kind: "managed-pr",
    repositoryId: context.repositoryId,
    repository: context.repository,
    generation: 999999,
    headRef: context.headRef,
    baseRef: context.baseRef,
    expectedHeadSha,
    validationBaseSha: context.validationBaseSha,
    candidateDigest: `sha256:${"c".repeat(64)}`,
    reportDigest: `sha256:${"d".repeat(64)}`,
    validation,
  }, phase === "initial"
    ? "Real-host smoke validation pending."
    : phase === "validation-failed"
      ? "Real-host smoke validation command failed."
      : "Real-host smoke validation passed.");
}

export function smokeIssueBody(context: SmokeIssueBodyContext, phase: "initial" | "updated"): string {
  return [
    "<!-- skill-update-automation-smoke:v1 key=smoke-issue -->",
    `Repository: ${context.repositoryId}:${context.repository}`,
    `Run: ${context.run.workflowRunId}:${context.run.workflowRunAttempt}`,
    `Source: ${context.sourceCommit}`,
    `Real-host smoke issue: ${phase}.`,
  ].join("\n");
}

export function smokeBodyDigest(body: string): string {
  return `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
}
