import { isDeepStrictEqual } from "node:util";

import { redactCredentialText, type GhRunner } from "../../skill-updater/index.ts";
import type { GithubAdapter } from "../github/adapter.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import { discoverManagedPullRequests } from "../github/discovery.ts";
import {
  classifyPrBody,
  parseDecimalId,
  parseObject,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  type RunRef,
  type ValidationState,
} from "../model/index.ts";

export type WorkflowRunObservation = Readonly<{
  status: "requested" | "waiting" | "pending" | "queued" | "in_progress" | "completed";
  run: RunRef;
}>;

export async function readWorkflowRunObservation(
  repository: string,
  run: RunRef,
  runner: GhRunner,
): Promise<WorkflowRunObservation> {
  const result = await runner([
    "api", "--method", "GET",
    `repos/${parseRepositoryFullName(repository)}/actions/runs/${run.workflowRunId}/attempts/${run.workflowRunAttempt}`,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`workflow run取得失敗: ${redactCredentialText(result.stderr.trim() || result.stdout.trim())}`);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error("workflow run JSONが不正です");
  }
  const object = parseObject(decoded, "workflow run");
  const workflowRunId = parseDecimalId(String(parsePositiveSafeInteger(object.id)));
  const workflowRunAttempt = parsePositiveSafeInteger(object.run_attempt);
  const statuses = ["requested", "waiting", "pending", "queued", "in_progress", "completed"] as const;
  if (typeof object.status !== "string" || !statuses.includes(object.status as (typeof statuses)[number])) {
    throw new Error("workflow run statusが不正です");
  }
  if (workflowRunId !== run.workflowRunId || workflowRunAttempt !== run.workflowRunAttempt) {
    throw new Error("workflow run identityが一致しません");
  }
  return { status: object.status as (typeof statuses)[number], run: { workflowRunId, workflowRunAttempt } };
}

export function classifyPendingValidation(
  validation: ValidationState,
  workflowRun: WorkflowRunObservation,
): "active" | "recovery-required" | "closed" {
  if (validation.status !== "pending") return "closed";
  if (!isDeepStrictEqual(validation.run, workflowRun.run)) throw new Error("pending validation runがworkflow runと一致しません");
  return workflowRun.status === "completed" ? "recovery-required" : "active";
}

export async function cleanupMergedBranch(input: Readonly<{
  adapter: Pick<GithubAdapter, "readBranch" | "deleteBranch">;
  pullRequest: GithubPullRequest;
}>): Promise<"deleted" | "already-clean" | "not-eligible" | "intervention-required" | "cleanup-failed"> {
  if (input.pullRequest.state !== "closed" || !input.pullRequest.merged) return "not-eligible";
  const classification = classifyPrBody(input.pullRequest.body, input.pullRequest.draft);
  if (classification.kind !== "strict" || classification.envelope.expectedHeadSha !== input.pullRequest.headSha ||
    classification.envelope.headRef !== input.pullRequest.headRef) {
    return "intervention-required";
  }
  const branch = await input.adapter.readBranch(input.pullRequest.headRef);
  if (branch === null) return "already-clean";
  if (branch.sha !== classification.envelope.expectedHeadSha) return "intervention-required";
  try {
    await input.adapter.deleteBranch({ ref: branch.ref, expectedSha: branch.sha });
  } catch {
    return "cleanup-failed";
  }
  return await input.adapter.readBranch(branch.ref) === null ? "deleted" : "cleanup-failed";
}

export async function cleanupMergedBranches(input: Readonly<{
  adapter: Pick<GithubAdapter, "listPullRequests" | "readBranch" | "deleteBranch">;
  repositoryId: string;
  repository: string;
  defaultBranchRef: string;
}>): Promise<Readonly<{ kind: "complete" | "stopped"; failedRefs: readonly string[] }>> {
  const page = await input.adapter.listPullRequests();
  const discovery = discoverManagedPullRequests({
    repositoryId: input.repositoryId,
    repository: input.repository,
    defaultBaseRef: input.defaultBranchRef,
    resumeClosed: false,
    paginationComplete: page.complete,
    pullRequests: page.items,
  });
  if (
    discovery.decision.kind === "pr-identity-conflict" || discovery.decision.kind === "recovery-required" ||
    discovery.decision.kind === "generation-conflict" || discovery.decision.kind === "open-pr-conflict" ||
    discovery.decision.kind === "intervention-required"
  ) {
    return { kind: "stopped", failedRefs: [] };
  }
  const failedRefs: string[] = [];
  for (const pullRequest of page.items) {
    if (
      pullRequest.state !== "closed" || !pullRequest.merged ||
      pullRequest.headRepositoryId !== input.repositoryId || pullRequest.baseRepositoryId !== input.repositoryId ||
      pullRequest.baseRef !== input.defaultBranchRef
    ) continue;
    if (page.items.some((candidate) => candidate.state === "open" && candidate.headRef === pullRequest.headRef)) {
      return { kind: "stopped", failedRefs: [] };
    }
    const result = await cleanupMergedBranch({ adapter: input.adapter, pullRequest });
    if (result === "cleanup-failed") failedRefs.push(pullRequest.headRef);
  }
  return { kind: "complete", failedRefs: failedRefs.sort() };
}
