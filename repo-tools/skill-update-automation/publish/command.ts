import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCandidateArtifact } from "../candidate/index.ts";
import type { GithubPermissionEvidence } from "../github/adapter.ts";
import { decodeArtifactManifest, parsePositiveSafeInteger } from "../model/index.ts";
import { verifyCandidateBundle } from "./bundle.ts";
import { publishDraft, type PublishDraftContext } from "./draft.ts";
import { ProductionPublishAdapter } from "./production-adapter.ts";
import { GithubHostPermissionError } from "./production-adapter.ts";

export function permissionFailureOutput(error: unknown): string | null {
  if (!(error instanceof GithubHostPermissionError)) return null;
  const evidence: GithubPermissionEvidence = error;
  return [
    "failure-state=permission-denied",
    `permission-operation=${evidence.operation}`,
    `permission-post-state=${evidence.postState}`,
    "",
  ].join("\n");
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
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

function booleanInput(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("RESUME_CLOSED must be an exact boolean output");
}

export async function runPublishDraftCommand(input: Readonly<{
  artifactDirectory: string;
  receiptFile: string;
  context: PublishDraftContext;
  repositoryRoot: string;
  tokenPresent: boolean;
}>): Promise<string> {
  const artifactDirectory = resolve(input.artifactDirectory);
  const receiptFile = resolve(input.receiptFile);
  if (!isAbsolute(input.artifactDirectory) || artifactDirectory !== input.artifactDirectory) {
    throw new Error("ARTIFACT_DIR must be an absolute normalized path");
  }
  if (receiptFile !== join(dirname(artifactDirectory), "draft-receipt.json")) {
    throw new Error("RECEIPT_FILE must be the exact publish-stage receipt path");
  }
  if (!input.tokenPresent) throw new Error("GH_TOKEN is required");
  const initial = validateCandidateArtifact(artifactDirectory, {
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    workflowRunId: input.context.workflowRunId,
    workflowRunAttempt: input.context.workflowRunAttempt,
  });
  if (initial.kind !== "candidate-update") throw new Error("publish-draft requires candidate-update");
  verifyCandidateBundle({
    repositoryRoot: input.repositoryRoot,
    bundlePath: join(artifactDirectory, "candidate.bundle"),
    workflowRunId: input.context.workflowRunId,
    workflowRunAttempt: input.context.workflowRunAttempt,
    baseHeadSha: initial.baseHeadSha,
    candidateSha: initial.candidateSha,
    candidateTreeSha: initial.candidateTreeSha,
  });
  const result = await publishDraft({
    adapter: new ProductionPublishAdapter({ repository: input.context.repository, repositoryRoot: input.repositoryRoot }),
    artifactDirectory,
    context: input.context,
  });
  if (result.kind !== "published") throw new Error("candidate-update did not publish a draft");
  writeFileSync(receiptFile, result.receipt, { mode: 0o600, flag: "wx" });
  return `candidate-sha=${result.headSha}\npr-number=${result.prNumber}\n`;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const artifactDirectory = requiredEnvironment("ARTIFACT_DIR");
  const manifest = decodeArtifactManifest(readFileSync(join(artifactDirectory, "manifest.json")));
  const context: PublishDraftContext = {
    repositoryId: requiredEnvironment("REPOSITORY_ID"),
    repository: requiredEnvironment("REPOSITORY"),
    workflowRunId: requiredEnvironment("WORKFLOW_RUN_ID"),
    workflowRunAttempt: canonicalAttempt(requiredEnvironment("WORKFLOW_RUN_ATTEMPT")),
    triggerSha: requiredEnvironment("TRIGGER_SHA"),
    defaultBranchSha: manifest.baseHeadSha,
    defaultBranchRef: defaultBranchRef(requiredEnvironment("DEFAULT_BRANCH")),
    resumeClosed: booleanInput(requiredEnvironment("RESUME_CLOSED")),
  };
  try {
    const output = await runPublishDraftCommand({
      artifactDirectory,
      receiptFile: requiredEnvironment("RECEIPT_FILE"),
      context,
      repositoryRoot: process.cwd(),
      tokenPresent: requiredEnvironment("GH_TOKEN").length > 0,
    });
    process.stdout.write(output);
  } catch (error: unknown) {
    const output = permissionFailureOutput(error);
    if (output === null) throw error;
    process.stdout.write(output);
    process.exitCode = 1;
  }
}
