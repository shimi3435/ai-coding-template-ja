import {
  classifyPrRootV2,
  decodePrStateSnapshotV2,
  managedPrTitle,
  reduceJournalCommentsV2,
  validatePrJournalV2,
  type JournalCommentV2,
} from "../model/index.ts";
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
  authorUserId: string;
  lastEditedAt: string | null;
  journalComments?: readonly JournalCommentV2[];
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

export function hasManagedPrEvidence(pullRequest: GithubPullRequest): boolean {
  return managedBranch(pullRequest.headRef) || pullRequest.title === managedPrTitle ||
    (pullRequest.body ?? "").includes("<!-- skill-update-pr-automation:pr:v1:") ||
    (pullRequest.body ?? "").includes("<!-- skill-update-pr-automation:pr-root:v2:");
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
    if (!hasManagedPrEvidence(pullRequest)) continue;
    if (
      pullRequest.headRepositoryId !== input.repositoryId ||
      pullRequest.baseRepositoryId !== input.repositoryId
    ) {
      warnings.push(`cross-repository automation mimic: #${pullRequest.prNumber}`);
      continue;
    }
    const classification = classifyPrRootV2(pullRequest.body);
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
    const root = classification.root;
    let journal;
    try {
      journal = reduceJournalCommentsV2(pullRequest.journalComments ?? [], root.creatorUserId);
    } catch {
      return {
        decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
        warnings,
      };
    }
    const first = journal.entries[0];
    const latest = journal.entries.at(-1);
    if (first === undefined && latest === undefined && journal.entries.length === 0) {
      let initial;
      try {
        initial = decodePrStateSnapshotV2(root.initialSnapshot);
      } catch {
        return {
          decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
          warnings,
        };
      }
      if (pullRequest.authorUserId !== root.creatorUserId || pullRequest.lastEditedAt !== null ||
        pullRequest.state !== "open" || pullRequest.merged || !pullRequest.draft ||
        initial.expectedHeadSha !== pullRequest.headSha || initial.draft !== pullRequest.draft ||
        initial.repositoryId !== input.repositoryId || initial.repository !== input.repository ||
        initial.headRef !== pullRequest.headRef || initial.baseRef !== pullRequest.baseRef) {
        return {
          decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
          warnings,
        };
      }
      managed.push({
        generation: initial.generation,
        prNumber: pullRequest.prNumber,
        state: pullRequest.state,
        merged: pullRequest.merged,
      });
      continue;
    }
    if (first === undefined || latest === undefined || journal.pending !== null || first.resourceKind !== "pull-request" ||
      first.resourceNumber !== pullRequest.prNumber || first.snapshot.stateDigest !== root.initialSnapshotDigest) {
      return {
        decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
        warnings,
      };
    }
    let envelope;
    try {
      envelope = validatePrJournalV2(root, journal).at(-1)!;
    } catch {
      return {
        decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
        warnings,
      };
    }
    if (
      root.repositoryId !== input.repositoryId || root.repository !== input.repository ||
      root.generation !== envelope.generation || root.headRef !== envelope.headRef || root.baseRef !== envelope.baseRef ||
      envelope.repositoryId !== input.repositoryId || envelope.repository !== input.repository ||
      envelope.headRef !== pullRequest.headRef || envelope.baseRef !== pullRequest.baseRef || envelope.draft !== pullRequest.draft
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
