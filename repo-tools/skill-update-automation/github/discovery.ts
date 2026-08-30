import { createHash } from "node:crypto";

import {
  classifyPrRootV2,
  decodePrStateSnapshotV2,
  managedPrTitle,
  prStateSnapshotV2,
  reduceJournalCommentsV2,
  validatePrJournalV2,
  type JournalCommentV2,
  type RecoveryTarget,
  type RunRef,
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
  currentRun?: RunRef;
  allowPendingJournal?: boolean;
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

export type GithubRecoveryDecision = Readonly<{
  kind: "recoverable-transition";
  writePolicy: "recovery-only";
  prNumber: number;
  target: RecoveryTarget;
}>;

export type GithubDiscoveryResult = Readonly<{
  decision: ManagedPrDecision | GithubStopDecision | GithubRecoveryDecision;
  warnings: readonly string[];
}>;

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function rootOperationId(repositoryId: string, prNumber: number, initialSnapshotDigest: string): string {
  return digest(Buffer.from(["root", repositoryId, String(prNumber), initialSnapshotDigest].join("\0"), "utf8"));
}

function differentRun(left: RunRef, right: RunRef | undefined): boolean {
  return right !== undefined && (left.workflowRunId !== right.workflowRunId || left.workflowRunAttempt !== right.workflowRunAttempt);
}

function recoveryTarget(input: Readonly<{
  mode: RecoveryTarget["mode"];
  pullRequest: GithubPullRequest;
  creatorUserId: string;
  generation: number;
  immutableBody: string;
  journalDigest: string;
  operationId: string;
  before: ReturnType<typeof decodePrStateSnapshotV2>;
  after: ReturnType<typeof decodePrStateSnapshotV2>;
}>): RecoveryTarget {
  return {
    mode: input.mode,
    generation: input.generation,
    prNumber: input.pullRequest.prNumber,
    creatorUserId: input.creatorUserId,
    headRef: input.pullRequest.headRef,
    beforeHeadSha: input.before.expectedHeadSha,
    afterHeadSha: input.after.expectedHeadSha,
    rootDigest: digest(Buffer.from(input.immutableBody, "utf8")),
    journalDigest: input.journalDigest,
    operationId: input.operationId,
    beforeSnapshotDigest: prStateSnapshotV2(input.before).stateDigest,
    afterSnapshotDigest: prStateSnapshotV2(input.after).stateDigest,
    candidateDigest: input.after.candidateDigest,
    reportDigest: input.after.reportDigest,
    originRun: input.after.validation.run,
  };
}

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
  const recoverable: GithubRecoveryDecision[] = [];
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
      if (initial.validation.status === "pending" && differentRun(initial.validation.run, input.currentRun)) {
        recoverable.push({
          kind: "recoverable-transition",
          writePolicy: "recovery-only",
          prNumber: pullRequest.prNumber,
          target: recoveryTarget({
            mode: "commentless-root",
            pullRequest,
            creatorUserId: root.creatorUserId,
            generation: initial.generation,
            immutableBody: pullRequest.body!,
            journalDigest: root.initialSnapshotDigest,
            operationId: rootOperationId(root.repositoryId, pullRequest.prNumber, root.initialSnapshotDigest),
            before: initial,
            after: initial,
          }),
        });
      }
      continue;
    }
    if (first === undefined || latest === undefined || first.resourceKind !== "pull-request" ||
      first.resourceNumber !== pullRequest.prNumber || first.snapshot.stateDigest !== root.initialSnapshotDigest) {
      return {
        decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
        warnings,
      };
    }
    let states;
    try {
      states = validatePrJournalV2(root, journal);
    } catch {
      return {
        decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
        warnings,
      };
    }
    const envelope = states[journal.pending === null ? states.length - 1 : states.length - 2]!;
    const preparedAfter = journal.pending === null ? null : states.at(-1)!;
    if (
      root.repositoryId !== input.repositoryId || root.repository !== input.repository ||
      root.generation !== envelope.generation || root.headRef !== envelope.headRef || root.baseRef !== envelope.baseRef ||
      envelope.repositoryId !== input.repositoryId || envelope.repository !== input.repository ||
      envelope.headRef !== pullRequest.headRef || envelope.baseRef !== pullRequest.baseRef ||
      (envelope.draft !== pullRequest.draft && (preparedAfter === null || preparedAfter.draft !== pullRequest.draft))
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
    const openUnmerged = pullRequest.state === "open" && !pullRequest.merged;
    const pending = journal.pending;
    const oldPrepared = pending !== null && differentRun(preparedAfter!.validation.run, input.currentRun);
    if (pending !== null && !oldPrepared && input.allowPendingJournal !== true) {
      return {
        decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
        warnings,
      };
    }
    const oldStableValidation = pending === null && envelope.validation.status === "pending" &&
      differentRun(envelope.validation.run, input.currentRun);
    if ((oldPrepared || oldStableValidation) && !openUnmerged) {
      return {
        decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
        warnings,
      };
    }
    if (oldPrepared && pending !== null) {
      const mode = pending.operation === "branch-append"
        ? "prepared-branch-append"
        : pending.operation === "pr-draft"
          ? "prepared-pr-draft"
          : pending.operation === "pr-ready" && preparedAfter!.validation.status === "passed"
            ? "prepared-pr-ready"
            : null;
      if (mode === null) {
        return {
          decision: { kind: "pr-identity-conflict", writePolicy: "none", summaryOnly: true, prNumber: pullRequest.prNumber },
          warnings,
        };
      }
      recoverable.push({
        kind: "recoverable-transition",
        writePolicy: "recovery-only",
        prNumber: pullRequest.prNumber,
        target: recoveryTarget({
          mode,
          pullRequest,
          creatorUserId: root.creatorUserId,
          generation: envelope.generation,
          immutableBody: pullRequest.body!,
          journalDigest: pending.digest,
          operationId: pending.operationId,
          before: envelope,
          after: preparedAfter!,
        }),
      });
    } else if (oldStableValidation) {
      recoverable.push({
        kind: "recoverable-transition",
        writePolicy: "recovery-only",
        prNumber: pullRequest.prNumber,
        target: recoveryTarget({
          mode: "stale-validation",
          pullRequest,
          creatorUserId: root.creatorUserId,
          generation: envelope.generation,
          immutableBody: pullRequest.body!,
          journalDigest: latest.digest,
          operationId: latest.operationId,
          before: envelope,
          after: envelope,
        }),
      });
    }
  }
  if (recoverable.length > 0) {
    const recovery = recoverable[0]!;
    const lifecycle = reduceManagedPrHistory(managed, false);
    if (recoverable.length !== 1 || lifecycle.kind !== "open" ||
      lifecycle.member.prNumber !== recovery.prNumber || lifecycle.member.generation !== recovery.target.generation) {
      return {
        decision: {
          kind: "pr-identity-conflict",
          writePolicy: "none",
          summaryOnly: true,
          prNumber: recovery.prNumber,
        },
        warnings,
      };
    }
    return { decision: recovery, warnings };
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
