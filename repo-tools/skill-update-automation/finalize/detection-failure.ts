import { createHash } from "node:crypto";

import type { CandidateCommandReport, CandidateStopState } from "../candidate/index.ts";
import type { GithubAdapter, GithubPermissionEvidence, JournalGithubAdapter } from "../github/adapter.ts";
import { discoverManagedPullRequests } from "../github/discovery.ts";
import { discoverManagedIssue } from "../github/issue-discovery.ts";
import {
  selectFailureScope,
  type FailureState,
  type IssueEntryObservation,
  type RunRef,
  type Scope,
} from "../model/index.ts";
import { syncManagedIssueEntries } from "./finalize.ts";
import { planTrackingReconciliation } from "./tracking-reconciliation.ts";

const summaryOnlyStates: readonly CandidateStopState[] = ["pr-identity-conflict", "trigger-usage-failure"];

function detailDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function summary(state: CandidateStopState): string {
  const summaries: Record<CandidateStopState, string> = {
    "updater-rejected": "The existing skill updater rejected detection.",
    "candidate-invalid": "Candidate postconditions failed before external write.",
    "validation-failed": "Candidate validation failed.",
    "permission-denied": "The default workflow token was denied.",
    "recovery-required": "Automation recovery is required.",
    "cleanup-failed": "Guarded cleanup failed.",
    "intervention-required": "A managed branch head changed outside automation.",
    "generation-conflict": "Managed pull requests have duplicate generations.",
    "open-pr-conflict": "Multiple managed pull requests are open.",
    "paused-closed": "Automation is paused after an unmerged pull request was closed.",
    "pr-identity-conflict": "Managed pull request identity is partial or inconsistent; no external write was attempted.",
    "trigger-usage-failure": "resume_closed is valid only for the latest closed-unmerged managed pull request.",
  };
  return summaries[state];
}

function issueSummary(
  state: FailureState,
  report: CandidateCommandReport,
  permission: GithubPermissionEvidence | undefined,
): string {
  if (state === "updater-rejected" && report.updaterReport !== undefined) {
    return `Opaque updater rejection: ${JSON.stringify({
      errors: report.updaterReport.errors,
      cohorts: report.updaterReport.cohorts.map((cohort) => ({ key: cohort.key, status: cohort.status })),
    })}`;
  }
  if (state === "candidate-invalid") return `Candidate postcondition errors: ${JSON.stringify(report.errors)}`;
  if (state === "permission-denied" && permission !== undefined) {
    return `The default workflow token was denied: operation=${permission.operation}, post-state=${permission.postState}.`;
  }
  return summary(state);
}

function trackedState(state: CandidateStopState): state is FailureState {
  return !summaryOnlyStates.includes(state);
}

export type PublishDraftResult = "success" | "failure" | "cancelled" | "skipped";

export async function publishDetectionOutcome(input: Readonly<{
  adapter: GithubAdapter & JournalGithubAdapter;
  creatorUserId: string;
  repositoryId: string;
  repository: string;
  defaultBranchRef: string;
  run: RunRef;
  at: string;
  report: CandidateCommandReport;
  publishDraftResult: PublishDraftResult;
  publishDraftPermission?: GithubPermissionEvidence;
  cleanup?: Readonly<{ status: "passed" | "failed"; failedRefs: readonly string[] }>;
}>): Promise<Readonly<{ kind: "published" | "summary-only"; issue?: string; summary: string }>> {
  const failure = input.report.failure ?? (
    input.report.status === "candidate-update" && input.publishDraftResult !== "success"
      ? {
          state: input.publishDraftPermission === undefined ? "recovery-required" as const : "permission-denied" as const,
          scope: { kind: "global", operation: "publish-draft" } as const,
          summaryOnly: false,
        }
      : undefined
  );
  if (input.publishDraftPermission?.postState === "unknown") {
    return {
      kind: "summary-only",
      summary: `Automation recovery is required. operation=${input.publishDraftPermission.operation}, post-state=unknown.`,
    };
  }
  if (input.report.failure === undefined && input.report.status === "candidate-update" && input.publishDraftResult !== "success") {
    const page = await input.adapter.listPullRequests();
    const decision = discoverManagedPullRequests({
      repositoryId: input.repositoryId,
      repository: input.repository,
      defaultBaseRef: input.defaultBranchRef,
      resumeClosed: false,
      paginationComplete: page.complete,
      pullRequests: page.items,
    }).decision;
    if (decision.kind === "pr-identity-conflict" || decision.kind === "recovery-required") {
      return {
        kind: "summary-only",
        summary: "Draft publication failed and the pull request post-state is not safe for issue write.",
      };
    }
  }
  if (failure?.summaryOnly === true || (failure !== undefined && !trackedState(failure.state))) {
    return { kind: "summary-only", summary: summary(failure.state) };
  }
  let observations: readonly IssueEntryObservation[] = [];
  if (failure !== undefined) {
    if (!trackedState(failure.state)) throw new Error("summary-only failure state cannot be tracked");
    const scopes: readonly Scope[] = failure.state === "updater-rejected" && input.report.updaterReport !== undefined
      ? input.report.updaterReport.cohorts
        .filter((cohort) => cohort.status === "failed")
        .map((cohort) => ({ kind: "cohort", cohortKey: cohort.key }) as const)
      : [failure.scope];
    const exactScopes = scopes.length === 0 ? [failure.scope] : scopes;
    observations = exactScopes.map((scope) => ({
      state: failure.state as FailureState,
      scope,
      seen: { run: input.run, at: input.at },
      detailDigest: detailDigest({
        report: input.report,
        publishDraftResult: input.publishDraftResult,
        permission: input.publishDraftPermission,
      }),
      summary: issueSummary(failure.state as FailureState, input.report, input.publishDraftPermission),
    }));
  }
  if (input.cleanup?.status === "failed") {
    const scopes = input.cleanup.failedRefs.length === 0
      ? [selectFailureScope({ operation: "cleanup" })]
      : input.cleanup.failedRefs.map((identity) => selectFailureScope({
          resource: { resourceKind: "branch", identity },
          operation: "cleanup",
        }));
    observations = [...observations, ...scopes.map((scope): IssueEntryObservation => ({
      state: "cleanup-failed",
      scope,
      seen: { run: input.run, at: input.at },
      detailDigest: detailDigest({ status: input.cleanup?.status, scope }),
      summary: scope.kind === "resource"
        ? `Guarded cleanup failed for ${scope.identity}.`
        : "One or more guarded merged-branch cleanup operations failed.",
    }))];
  }
  const reconciliation = planTrackingReconciliation({
    observations,
    reconcileDetection: true,
    reconcileCleanup: input.cleanup !== undefined,
  });
  const issue = await syncManagedIssueEntries({
    adapter: input.adapter,
    context: { repositoryId: input.repositoryId, repository: input.repository, creatorUserId: input.creatorUserId },
    ...reconciliation,
  });
  let issueConflict = "";
  if (issue === "issue-identity-conflict" || issue === "issue-cardinality-conflict" || issue === "issue-discovery-incomplete") {
    const page = await input.adapter.listIssues();
    const decision = discoverManagedIssue({
      repositoryId: input.repositoryId,
      repository: input.repository,
      paginationComplete: page.complete,
      issues: page.items,
    });
    if (decision.issueWritePolicy === "none") issueConflict = ` Issue numbers: ${decision.issueNumbers.join(", ") || "none"}.`;
  }
  return {
    kind: "published",
    issue,
    summary: `${failure === undefined ? "Detection and draft publication have no managed failure." :
      input.publishDraftPermission === undefined ? summary(failure.state) :
        `${summary(failure.state)} operation=${input.publishDraftPermission.operation}, post-state=${input.publishDraftPermission.postState}.`}${issueConflict}`,
  };
}
