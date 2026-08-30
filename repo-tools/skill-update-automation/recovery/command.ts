import { isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateCandidateArtifact } from "../candidate/index.ts";
import { parseDecimalId, parsePositiveSafeInteger, type RunRef } from "../model/index.ts";
import { verifyCandidateBundle } from "../publish/bundle.ts";
import { ProductionPublishAdapter } from "../publish/production-adapter.ts";
import { recoverCrossRunTransition } from "./lifecycle.ts";

function normalizedAbsolute(value: string, name: string): string {
  const normalized = resolve(value);
  if (!isAbsolute(value) || normalized !== value) throw new Error(`${name} must be an absolute normalized path`);
  return normalized;
}

export async function runRecoveryCommand(input: Readonly<{
  recoveryArtifactDirectory: string;
  originArtifactDirectory: string;
  outputArtifactDirectory: string;
  repositoryRoot: string;
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  triggerSha: string;
  currentRun: RunRef;
  tokenPresent: boolean;
}>): Promise<string> {
  if (!input.tokenPresent) throw new Error("GH_TOKEN is required");
  const recoveryArtifactDirectory = normalizedAbsolute(input.recoveryArtifactDirectory, "RECOVERY_ARTIFACT_DIR");
  const originArtifactDirectory = normalizedAbsolute(input.originArtifactDirectory, "ORIGIN_ARTIFACT_DIR");
  const outputArtifactDirectory = normalizedAbsolute(input.outputArtifactDirectory, "OUTPUT_ARTIFACT_DIR");
  const recovery = validateCandidateArtifact(recoveryArtifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: input.currentRun.workflowRunId,
    workflowRunAttempt: input.currentRun.workflowRunAttempt,
  });
  if (recovery.kind !== "recovery") throw new Error("recovery artifactが必要です");
  const origin = validateCandidateArtifact(originArtifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: recovery.target.originRun.workflowRunId,
    workflowRunAttempt: recovery.target.originRun.workflowRunAttempt,
  });
  if (origin.kind === "candidate-update") {
    verifyCandidateBundle({
      repositoryRoot: input.repositoryRoot,
      bundlePath: join(originArtifactDirectory, "candidate.bundle"),
      workflowRunId: origin.run.workflowRunId,
      workflowRunAttempt: origin.run.workflowRunAttempt,
      baseHeadSha: origin.baseHeadSha,
      candidateSha: origin.candidateSha,
      candidateTreeSha: origin.candidateTreeSha,
    });
  }
  const result = await recoverCrossRunTransition({
    adapter: new ProductionPublishAdapter({ repository: input.repository, repositoryRoot: input.repositoryRoot }),
    recoveryArtifactDirectory,
    originArtifactDirectory,
    outputArtifactDirectory,
    repositoryId: input.repositoryId,
    repository: input.repository,
    creatorUserId: parseDecimalId(input.creatorUserId),
    defaultBranchSha: input.defaultBranchSha,
    defaultBranchRef: input.defaultBranchRef,
    triggerSha: input.triggerSha,
    currentRun: input.currentRun,
  });
  const candidateSha = result.kind === "validation-required" ? result.manifest.candidateSha : "";
  return `recovery-status=${result.kind}\ncandidate-sha=${candidateSha}\n`;
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

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(await runRecoveryCommand({
    recoveryArtifactDirectory: requiredEnvironment("RECOVERY_ARTIFACT_DIR"),
    originArtifactDirectory: requiredEnvironment("ORIGIN_ARTIFACT_DIR"),
    outputArtifactDirectory: requiredEnvironment("OUTPUT_ARTIFACT_DIR"),
    repositoryRoot: process.cwd(),
    repositoryId: requiredEnvironment("REPOSITORY_ID"),
    repository: requiredEnvironment("REPOSITORY"),
    creatorUserId: requiredEnvironment("CREATOR_USER_ID"),
    defaultBranchSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    defaultBranchRef: `refs/heads/${requiredEnvironment("DEFAULT_BRANCH")}`,
    triggerSha: requiredEnvironment("TRIGGER_SHA"),
    currentRun: {
      workflowRunId: requiredEnvironment("WORKFLOW_RUN_ID"),
      workflowRunAttempt: attempt(requiredEnvironment("WORKFLOW_RUN_ATTEMPT")),
    },
    tokenPresent: requiredEnvironment("GH_TOKEN").length > 0,
  }));
}
