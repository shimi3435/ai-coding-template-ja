import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCandidateArtifact } from "../candidate/index.ts";
import {
  decodeDraftReceipt,
  parsePositiveSafeInteger,
  type DraftReceipt,
} from "../model/index.ts";
import { ProductionPublishAdapter } from "../publish/production-adapter.ts";
import { discoverManagedIssue } from "../github/issue-discovery.ts";
import { finalizeManagedPullRequest } from "./finalize.ts";
import type { FinalizeResult } from "./finalize.ts";
import {
  classifyWorkflowValidation,
  type WorkflowValidationObservation,
  type WorkflowValidationOutput,
} from "./validation-outcome.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function optionalOutcome(name: string): "success" | "failure" | "skipped" | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") return undefined;
  if (value === "success" || value === "failure" || value === "skipped") return value;
  throw new Error(`${name} is invalid`);
}

function cleanupStatus(): "passed" | "failed" | undefined {
  const status = process.env.CLEANUP_STATUS ?? "";
  if (status === "passed" || status === "failed") return status;
  if (status !== "") throw new Error("CLEANUP_STATUS is invalid");
  const outcome = optionalOutcome("CLEANUP_OUTCOME");
  return outcome === "failure" ? "failed" : undefined;
}

export function parseCleanupFailedRefs(value: string | undefined): readonly string[] {
  value = value === undefined || value === "" ? "[]" : value;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((ref) => typeof ref !== "string") ||
    parsed.some((ref) => !/^refs\/heads\/automation\/skill-updates\/g[0-9]{6}$/.test(ref)) ||
    new Set(parsed).size !== parsed.length || !parsed.every((ref, index) => index === 0 || parsed[index - 1]! < ref)) {
    throw new Error("CLEANUP_FAILED_REFS is invalid");
  }
  return parsed;
}

function jobResult(value: string): WorkflowValidationObservation["jobResult"] {
  if (value === "success" || value === "failure" || value === "cancelled" || value === "skipped") return value;
  throw new Error("VALIDATION_JOB_RESULT is invalid");
}

function validationOutput(): WorkflowValidationOutput | undefined {
  const status = process.env.VALIDATION_STATUS ?? "";
  if (status === "") return undefined;
  if (status === "passed") return { status: "passed" };
  if (status !== "failed") throw new Error("VALIDATION_STATUS is invalid");
  const failureKind = requiredEnvironment("VALIDATION_FAILURE_KIND");
  if (failureKind === "command") return { status: "failed", failureKind, command: requiredEnvironment("VALIDATION_COMMAND") };
  if (failureKind !== "infrastructure") throw new Error("VALIDATION_FAILURE_KIND is invalid");
  const stage = requiredEnvironment("VALIDATION_STAGE");
  const stages = ["checkout", "artifact", "runner", "timeout", "cancelled", "unknown"] as const;
  if (!stages.includes(stage as (typeof stages)[number])) throw new Error("VALIDATION_STAGE is invalid");
  return { status: "failed", failureKind, stage: stage as (typeof stages)[number] };
}

function canonicalAttempt(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("WORKFLOW_RUN_ATTEMPT must be canonical positive decimal");
  return parsePositiveSafeInteger(Number(value));
}

function defaultBranchRef(value: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new Error("DEFAULT_BRANCH is invalid");
  }
  return `refs/heads/${value}`;
}

function manifestDigest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function validateReceipt(
  receipt: DraftReceipt,
  manifestBytes: Buffer,
  manifest: Exclude<ReturnType<typeof validateCandidateArtifact>, { kind: "no-op" }>,
  now: Date,
): void {
  if (
    receipt.repositoryId !== manifest.repositoryId || receipt.repository !== manifest.repository ||
    receipt.run.workflowRunId !== manifest.run.workflowRunId ||
    receipt.run.workflowRunAttempt !== manifest.run.workflowRunAttempt ||
    receipt.manifestDigest !== manifestDigest(manifestBytes) || receipt.candidateDigest !== manifest.candidateDigest ||
    receipt.generation !== manifest.target.generation || receipt.headRef !== manifest.target.headRef ||
    receipt.headSha !== manifest.candidateSha
  ) throw new Error("DraftReceiptがmanifestと一致しません");
  const age = now.getTime() - new Date(receipt.createdAt).getTime();
  if (age < 0 || age > 24 * 60 * 60 * 1000) throw new Error("DraftReceipt retentionが終了しています");
}

export function finalizeStopMessage(result: FinalizeResult): string {
  const evidence = result.permission === undefined
    ? ""
    : ` operation=${result.permission.operation} post-state=${result.permission.postState}`;
  return `publish-finalize stopped: ${result.kind}${evidence}`;
}

export async function runFinalizeCommand(input: Readonly<{
  artifactDirectory: string;
  receiptFile: string;
  repositoryRoot: string;
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  defaultBranchRef: string;
  validationObservation: Omit<WorkflowValidationObservation, "run">;
  cleanupStatus?: "passed" | "failed";
  cleanupFailedRefs?: readonly string[];
  tokenPresent: boolean;
  now?: () => Date;
}>): Promise<string> {
  if (!input.tokenPresent) throw new Error("GH_TOKEN is required");
  if ((input.cleanupStatus === "passed" && (input.cleanupFailedRefs?.length ?? 0) > 0) ||
    (input.cleanupStatus === undefined && (input.cleanupFailedRefs?.length ?? 0) > 0)) {
    throw new Error("cleanup statusとfailed refsが一致しません");
  }
  const manifestBytes = readFileSync(join(input.artifactDirectory, "manifest.json"));
  const manifest = validateCandidateArtifact(input.artifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt,
  });
  if (manifest.kind === "no-op") throw new Error("no-op artifactはfinalize対象ではありません");
  const now = (input.now ?? (() => new Date()))();
  const receipt = manifest.kind === "candidate-update" ? decodeDraftReceipt(readFileSync(input.receiptFile)) : undefined;
  if (receipt !== undefined) validateReceipt(receipt, manifestBytes, manifest, now);
  const validation = classifyWorkflowValidation({
    ...input.validationObservation,
    run: { workflowRunId: input.workflowRunId, workflowRunAttempt: input.workflowRunAttempt },
  });
  const adapter = new ProductionPublishAdapter({ repository: input.repository, repositoryRoot: input.repositoryRoot });
  const result = await finalizeManagedPullRequest({
    adapter,
    context: {
      repositoryId: input.repositoryId,
      repository: input.repository,
      defaultBranchSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: input.repositoryRoot, encoding: "utf8" }).trim(),
      defaultBranchRef: input.defaultBranchRef,
      creatorUserId: input.creatorUserId,
      now: () => now,
    },
    manifest,
    receipt,
    validation,
    cleanupStatus: input.cleanupStatus,
    cleanupFailedRefs: input.cleanupFailedRefs,
  });
  if (result.kind !== "finalized") throw new Error(finalizeStopMessage(result));
  let issueNumbers = "none";
  if (result.issue === "issue-identity-conflict" || result.issue === "issue-cardinality-conflict" ||
    result.issue === "issue-discovery-incomplete") {
    const page = await adapter.listIssues();
    const decision = discoverManagedIssue({
      repositoryId: input.repositoryId,
      repository: input.repository,
      paginationComplete: page.complete,
      issues: page.items,
    });
    if (decision.issueWritePolicy === "none") issueNumbers = decision.issueNumbers.join(", ") || "none";
  }
  return [
    "### Skill update automation finalize",
    "",
    `- pull request: ${result.pr ?? "none"}`,
    `- issue: ${result.issue ?? "none"}`,
    `- issue numbers: ${issueNumbers}`,
    "",
  ].join("\n");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const attempt = canonicalAttempt(requiredEnvironment("WORKFLOW_RUN_ATTEMPT"));
  const output = await runFinalizeCommand({
    artifactDirectory: requiredEnvironment("ARTIFACT_DIR"),
    receiptFile: process.env.RECEIPT_FILE ?? "",
    repositoryRoot: process.cwd(),
    repositoryId: requiredEnvironment("REPOSITORY_ID"),
    repository: requiredEnvironment("REPOSITORY"),
    creatorUserId: requiredEnvironment("CREATOR_USER_ID"),
    workflowRunId: requiredEnvironment("WORKFLOW_RUN_ID"),
    workflowRunAttempt: attempt,
    defaultBranchRef: defaultBranchRef(requiredEnvironment("DEFAULT_BRANCH")),
    validationObservation: {
      jobResult: jobResult(requiredEnvironment("VALIDATION_JOB_RESULT")),
      checkoutOutcome: optionalOutcome("VALIDATION_CHECKOUT_OUTCOME"),
      artifactOutcome: optionalOutcome("VALIDATION_ARTIFACT_OUTCOME"),
      stepOutcome: optionalOutcome("VALIDATION_STEP_OUTCOME"),
      output: validationOutput(),
    },
    cleanupStatus: cleanupStatus(),
    cleanupFailedRefs: parseCleanupFailedRefs(process.env.CLEANUP_FAILED_REFS),
    tokenPresent: requiredEnvironment("GH_TOKEN").length > 0,
  });
  process.stdout.write(output);
}
