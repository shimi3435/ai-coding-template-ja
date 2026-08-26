import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { decodeCandidateCommandReport } from "../candidate/index.ts";
import { parseGithubPermissionEvidence } from "../github/adapter.ts";
import {
  parseDecimalId,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseUtcTimestamp,
} from "../model/index.ts";
import { ProductionPublishAdapter } from "../publish/production-adapter.ts";
import { publishDetectionOutcome, type PublishDraftResult } from "./detection-failure.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function canonicalAttempt(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("WORKFLOW_RUN_ATTEMPT must be canonical positive decimal");
  return parsePositiveSafeInteger(Number(value));
}

function publishDraftResult(value: string): PublishDraftResult {
  if (value === "success" || value === "failure" || value === "cancelled" || value === "skipped") return value;
  throw new Error("PUBLISH_DRAFT_RESULT is invalid");
}

function defaultBranchRef(value: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new Error("DEFAULT_BRANCH is invalid");
  }
  return `refs/heads/${value}`;
}

export async function runDetectionFailureCommand(input: Readonly<{
  reportFile: string;
  repositoryId: string;
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  defaultBranchRef: string;
  at: string;
  publishDraftResult: PublishDraftResult;
  publishDraftPermission?: ReturnType<typeof parseGithubPermissionEvidence>;
  tokenPresent: boolean;
}>): Promise<string> {
  if (!input.tokenPresent) throw new Error("GH_TOKEN is required");
  const report = decodeCandidateCommandReport(readFileSync(input.reportFile));
  const result = await publishDetectionOutcome({
    adapter: new ProductionPublishAdapter({ repository: input.repository, repositoryRoot: process.cwd() }),
    repositoryId: parseDecimalId(input.repositoryId),
    repository: parseRepositoryFullName(input.repository),
    defaultBranchRef: input.defaultBranchRef,
    run: {
      workflowRunId: parseDecimalId(input.workflowRunId),
      workflowRunAttempt: parsePositiveSafeInteger(input.workflowRunAttempt),
    },
    at: parseUtcTimestamp(input.at),
    report,
    publishDraftResult: input.publishDraftResult,
    publishDraftPermission: input.publishDraftPermission,
  });
  return [
    "### Skill update automation detection",
    "",
    `- outcome: ${result.kind}`,
    `- issue: ${result.issue ?? "none"}`,
    `- summary: ${result.summary}`,
    "",
  ].join("\n");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(await runDetectionFailureCommand({
    reportFile: requiredEnvironment("CANDIDATE_REPORT_FILE"),
    repositoryId: requiredEnvironment("REPOSITORY_ID"),
    repository: requiredEnvironment("REPOSITORY"),
    workflowRunId: requiredEnvironment("WORKFLOW_RUN_ID"),
    workflowRunAttempt: canonicalAttempt(requiredEnvironment("WORKFLOW_RUN_ATTEMPT")),
    defaultBranchRef: defaultBranchRef(requiredEnvironment("DEFAULT_BRANCH")),
    at: new Date().toISOString(),
    publishDraftResult: publishDraftResult(requiredEnvironment("PUBLISH_DRAFT_RESULT")),
    publishDraftPermission: parseGithubPermissionEvidence(
      process.env.PUBLISH_DRAFT_PERMISSION_OPERATION,
      process.env.PUBLISH_DRAFT_PERMISSION_POST_STATE,
    ),
    tokenPresent: requiredEnvironment("GH_TOKEN").length > 0,
  }));
}
