import { classifyPrBody, managedPrTitle } from "../model/index.ts";
import { reduceManagedPrHistory, type ManagedPrDecision, type ManagedPrObservation } from "./reducer.ts";

export type GithubPullRequest = Readonly<{
  prNumber: number;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  headRepositoryId: string | null;
  headRef: string;
  headSha: string;
  baseRepositoryId: string | null;
  baseRef: string;
  title: string;
  body: string | null;
}>;

export type GithubDiscoveryInput = Readonly<{
  repositoryId: string;
  repository: string;
  defaultBaseRef: string;
  resumeClosed: boolean;
  paginationComplete: boolean;
  pullRequests: readonly GithubPullRequest[];
}>;

export type GithubStopDecision =
  | Readonly<{
      kind: "pr-identity-conflict";
      writePolicy: "none";
      summaryOnly: true;
      prNumber: number;
    }>
  | Readonly<{
      kind: "intervention-required";
      writePolicy: "issue-only";
      prNumber: number;
      scope: Readonly<{ kind: "pr"; mode: "single"; generation: number; prNumber: number }>;
    }>
  | Readonly<{
      kind: "recovery-required";
      writePolicy: "none";
      reason: "pr-discovery-incomplete";
    }>;

export type GithubDiscoveryResult = Readonly<{
  decision: ManagedPrDecision | GithubStopDecision;
  warnings: readonly string[];
}>;

function managedBranch(ref: string): boolean {
  return /^refs\/heads\/automation\/skill-updates\/g[0-9]{6}$/.test(ref);
}

function identityMatches(pullRequest: GithubPullRequest): boolean {
  return managedBranch(pullRequest.headRef) || pullRequest.title === managedPrTitle ||
    (pullRequest.body ?? "").includes("<!-- skill-update-pr-automation:pr:v1:");
}

export function discoverManagedPullRequests(input: GithubDiscoveryInput): GithubDiscoveryResult {
  const warnings: string[] = [];
  if (!input.paginationComplete) {
    return {
      decision: { kind: "recovery-required", writePolicy: "none", reason: "pr-discovery-incomplete" },
      warnings,
    };
  }
  const managed: ManagedPrObservation[] = [];
  const humanHeadMismatches = new Map<number, number>();
  for (const pullRequest of [...input.pullRequests].sort((left, right) => left.prNumber - right.prNumber)) {
    if (!identityMatches(pullRequest)) continue;
    if (
      pullRequest.headRepositoryId !== input.repositoryId ||
      pullRequest.baseRepositoryId !== input.repositoryId
    ) {
      warnings.push(`cross-repository automation mimic: #${pullRequest.prNumber}`);
      continue;
    }
    const classification = classifyPrBody(pullRequest.body, pullRequest.draft);
    if (
      classification.kind !== "strict" || pullRequest.title !== managedPrTitle ||
      !managedBranch(pullRequest.headRef) || pullRequest.baseRef !== input.defaultBaseRef
    ) {
      return {
        decision: {
          kind: "pr-identity-conflict",
          writePolicy: "none",
          summaryOnly: true,
          prNumber: pullRequest.prNumber,
        },
        warnings,
      };
    }
    const envelope = classification.envelope;
    if (
      envelope.repositoryId !== input.repositoryId || envelope.repository !== input.repository ||
      envelope.headRef !== pullRequest.headRef || envelope.baseRef !== pullRequest.baseRef
    ) {
      return {
        decision: {
          kind: "pr-identity-conflict",
          writePolicy: "none",
          summaryOnly: true,
          prNumber: pullRequest.prNumber,
        },
        warnings,
      };
    }
    if (envelope.expectedHeadSha !== pullRequest.headSha) {
      humanHeadMismatches.set(pullRequest.prNumber, envelope.generation);
    }
    managed.push({
      generation: envelope.generation,
      prNumber: pullRequest.prNumber,
      state: pullRequest.state,
      merged: pullRequest.merged,
    });
  }
  const decision = reduceManagedPrHistory(managed, input.resumeClosed);
  if (decision.kind === "open") {
    const generation = humanHeadMismatches.get(decision.member.prNumber);
    if (generation !== undefined) {
      return {
        decision: {
          kind: "intervention-required",
          writePolicy: "issue-only",
          prNumber: decision.member.prNumber,
          scope: {
            kind: "pr",
            mode: "single",
            generation,
            prNumber: decision.member.prNumber,
          },
        },
        warnings,
      };
    }
  }
  return { decision, warnings };
}
