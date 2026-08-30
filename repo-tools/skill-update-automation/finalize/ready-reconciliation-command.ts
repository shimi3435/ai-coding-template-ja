import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCandidateArtifact } from "../candidate/index.ts";
import { parseDecimalId, parsePositiveSafeInteger } from "../model/index.ts";
import { ProductionPublishAdapter } from "../publish/production-adapter.ts";
import { reconcileReadyTrackingFailures } from "./ready-reconciliation.ts";

function normalizedAbsolute(value: string, name: string): string {
  const normalized = resolve(value);
  if (!isAbsolute(value) || normalized !== value) throw new Error(`${name} must be an absolute normalized path`);
  return normalized;
}

export async function runReadyReconciliationCommand(input: Readonly<{
  artifactDirectory: string;
  repositoryRoot: string;
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  defaultBranchSha: string;
  defaultBranchRef: string;
  tokenPresent: boolean;
  cleanupStatus?: "passed" | "failed";
  cleanupFailedRefs?: readonly string[];
}>): Promise<string> {
  if (!input.tokenPresent) throw new Error("GH_TOKEN is required");
  if (input.cleanupStatus !== "failed" && (input.cleanupFailedRefs?.length ?? 0) > 0) {
    throw new Error("cleanup statusとfailed refsが一致しません");
  }
  const artifactDirectory = normalizedAbsolute(input.artifactDirectory, "ARTIFACT_DIR");
  const manifest = validateCandidateArtifact(artifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt,
  });
  if (manifest.kind !== "no-op" && manifest.kind !== "recovery") {
    throw new Error("ready reconciliationにはno-opまたはrecovery artifactが必要です");
  }
  const result = await reconcileReadyTrackingFailures({
    adapter: new ProductionPublishAdapter({ repository: input.repository, repositoryRoot: input.repositoryRoot }),
    context: {
      repositoryId: parseDecimalId(input.repositoryId),
      repository: input.repository,
      defaultBranchSha: input.defaultBranchSha,
      defaultBranchRef: input.defaultBranchRef,
      creatorUserId: parseDecimalId(input.creatorUserId),
      now: () => new Date(),
    },
    manifest,
    cleanupStatus: input.cleanupStatus,
    cleanupFailedRefs: input.cleanupFailedRefs,
  });
  return `ready-reconciliation-status=${result}\n`;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function attempt(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("WORKFLOW_RUN_ATTEMPT must be canonical positive decimal");
  return parsePositiveSafeInteger(Number(value));
}

export function parseReadyCleanupStatus(
  status: string | undefined,
  outcome: string | undefined,
): "passed" | "failed" | undefined {
  if (status === "passed" || status === "failed") return status;
  if ((status ?? "") !== "") throw new Error("CLEANUP_STATUS is invalid");
  if (outcome === "failure" || outcome === "cancelled") return "failed";
  if (outcome === "success") throw new Error("CLEANUP_STATUS is invalid");
  if (outcome === undefined || outcome === "" || outcome === "skipped") return undefined;
  throw new Error("CLEANUP_OUTCOME is invalid");
}

export function parseReadyCleanupFailedRefs(value: string | undefined): readonly string[] {
  const parsed: unknown = JSON.parse(value === undefined || value === "" ? "[]" : value);
  if (!Array.isArray(parsed) || parsed.some((ref) => typeof ref !== "string") ||
    parsed.some((ref) => !/^refs\/heads\/automation\/skill-updates\/g[0-9]{6}$/.test(ref)) ||
    new Set(parsed).size !== parsed.length || !parsed.every((ref, index) => index === 0 || parsed[index - 1]! < ref)) {
    throw new Error("CLEANUP_FAILED_REFS is invalid");
  }
  return parsed;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(await runReadyReconciliationCommand({
    artifactDirectory: requiredEnvironment("ARTIFACT_DIR"),
    repositoryRoot: process.cwd(),
    repositoryId: requiredEnvironment("REPOSITORY_ID"),
    repository: requiredEnvironment("REPOSITORY"),
    creatorUserId: requiredEnvironment("CREATOR_USER_ID"),
    workflowRunId: requiredEnvironment("WORKFLOW_RUN_ID"),
    workflowRunAttempt: attempt(requiredEnvironment("WORKFLOW_RUN_ATTEMPT")),
    defaultBranchSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    defaultBranchRef: `refs/heads/${requiredEnvironment("DEFAULT_BRANCH")}`,
    tokenPresent: requiredEnvironment("GH_TOKEN").length > 0,
    cleanupStatus: parseReadyCleanupStatus(process.env.CLEANUP_STATUS, process.env.CLEANUP_OUTCOME),
    cleanupFailedRefs: parseReadyCleanupFailedRefs(process.env.CLEANUP_FAILED_REFS),
  }));
}
