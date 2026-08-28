import { setTimeout as delay } from "node:timers/promises";

import { discoverManagedPullRequests } from "../github/discovery.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import {
  classifyPrBody,
  decodeSmokePreview,
  encodeSmokePreview,
  parsePositiveSafeInteger,
  type ResourceState,
  type SmokeCheckpoint,
  type SmokeObservation,
  type SmokePreview,
  type SmokeResource,
  type SmokeStep,
  type SmokeTarget,
} from "../model/index.ts";
import { smokeBodyDigest, smokePullRequestBody, smokePullRequestTitle, type SmokePullRequestBodyContext } from "./body.ts";
import type { SmokeHost, SmokeResourceObservation } from "./host.ts";
import { verifyRepositoryAndRun } from "./preview.ts";

export type SmokeStepEvidence = Readonly<{
  index: number;
  primaryKey: string;
  operation: string;
  before: readonly SmokeObservation[];
  after: readonly SmokeObservation[];
  postWriteReadAttempts: number;
  number?: number;
}>;

export type SmokePostWriteReadPolicy = Readonly<{
  maxAttempts: number;
  wait: () => Promise<void>;
}>;

export type SmokeExecutionOptions = Readonly<{
  postWriteRead?: SmokePostWriteReadPolicy;
}>;

const defaultPostWriteReadPolicy: SmokePostWriteReadPolicy = {
  maxAttempts: 10,
  wait: async () => { await delay(500); },
};

export type SmokeCheckpointEvidence = SmokeCheckpoint & Readonly<{
  result: "passed";
  decision?: "intervention-required";
  reducer?: Readonly<{
    input: Readonly<{
      repositoryId: string;
      repository: string;
      defaultBaseRef: string;
      resumeClosed: false;
      paginationComplete: true;
      pullRequests: readonly GithubPullRequest[];
    }>;
    decision: "intervention-required";
  }>;
}>;

export type SmokeExecutionEvidence = Readonly<{
  bindings: Readonly<Record<string, number>>;
  steps: readonly SmokeStepEvidence[];
  checkpoints: readonly SmokeCheckpointEvidence[];
}>;

export type SmokeResidualResource = Readonly<{
  key: string;
  resource: SmokeResource;
  state?: ResourceState;
  number?: number;
  readError?: string;
}>;

export class SmokeExecutionError extends Error {
  readonly bindings: Readonly<Record<string, number>>;
  readonly steps: readonly SmokeStepEvidence[];
  readonly residualResources: readonly SmokeResidualResource[];

  constructor(message: string, input: Readonly<{
    bindings: Readonly<Record<string, number>>;
    steps: readonly SmokeStepEvidence[];
    residualResources: readonly SmokeResidualResource[];
    cause: unknown;
  }>) {
    super(message, { cause: input.cause });
    this.name = "SmokeExecutionError";
    this.bindings = input.bindings;
    this.steps = input.steps;
    this.residualResources = input.residualResources;
  }
}

function sameState(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

class ObservationMismatchError extends Error {}

async function verifyExecutionIdentity(preview: SmokePreview, host: SmokeHost): Promise<void> {
  const repository = await host.readRepository();
  verifyRepositoryAndRun(
    { repository: preview.repository, run: preview.run, sourceCommit: preview.sourceCommit },
    repository,
    await host.readWorkflowRun(preview.run.workflowRunId),
  );
  if (repository.id !== preview.repositoryId) throw new Error("preview repository IDが一致しません");
  const parent = await host.readCommitParent(preview.sourceCommit);
  if (parent !== preview.sourceParentCommit) throw new Error("preview source parentが一致しません");
  const base = await host.readResource({ kind: "branch", key: "smoke-base", ref: repository.defaultBranchRef }, new Map());
  if (base.state.state !== "present" || base.state.value.kind !== "branch-state" ||
    base.state.value.sha !== preview.baseCommit) throw new Error("preview base commitが一致しません");
  if (preview.mode === "normal") {
    const comparison = await host.readCommitComparison(preview.baseCommit, preview.sourceParentCommit);
    if (comparison.status !== "ahead" || comparison.aheadBy < 1 || comparison.behindBy !== 0) {
      throw new Error("source parentがdefault baseよりaheadでないためPRを作成できません");
    }
  }
}

function primaryTarget(step: SmokeStep): SmokeTarget {
  const before = step.before.find((item) => item.resource.key === step.primaryKey)!;
  const after = step.after.find((item) => item.resource.key === step.primaryKey)!;
  return { operation: step.operation, resource: before.resource, before: before.state, after: after.state };
}

function bindCreatedNumber(
  resource: SmokeResource,
  observedNumber: number | undefined,
  bindings: Map<string, number>,
): number | undefined {
  if (resource.kind === "branch") {
    if (observedNumber !== undefined) throw new Error("branch create responseにnumberは許可されません");
    return undefined;
  }
  if (resource.locator.mode !== "planned") throw new Error("existing resource createは許可されません");
  if (bindings.has(resource.key)) throw new Error("planned resource keyを再束縛できません");
  const number = parsePositiveSafeInteger(observedNumber);
  bindings.set(resource.key, number);
  return number;
}

async function readObservations(
  expected: readonly SmokeObservation[],
  host: SmokeHost,
  bindings: ReadonlyMap<string, number>,
  label: string,
): Promise<readonly SmokeObservation[]> {
  const actual: SmokeObservation[] = [];
  for (const item of expected) {
    const observed = await host.readResource(item.resource, bindings);
    const mismatch = observationMismatch(item, observed, bindings, label);
    if (mismatch !== null) throw mismatch;
    actual.push({ resource: item.resource, state: observed.state });
  }
  return actual;
}

function observationMismatch(
  expected: SmokeObservation,
  observed: SmokeResourceObservation,
  bindings: ReadonlyMap<string, number>,
  label: string,
): ObservationMismatchError | null {
  if (!sameState(observed.state, expected.state)) {
    return new ObservationMismatchError(`${expected.resource.key}: ${label} stateが一致しません`);
  }
  const expectedNumber = expected.resource.kind === "branch"
    ? undefined
    : expected.resource.locator.mode === "existing"
      ? expected.resource.locator.number
      : bindings.get(expected.resource.key);
  if (expectedNumber !== undefined && observed.number !== expectedNumber) {
    return new ObservationMismatchError(`${expected.resource.key}: ${label} numberが一致しません`);
  }
  return null;
}

async function readPostWriteAttempt(
  expected: readonly SmokeObservation[],
  host: SmokeHost,
  bindings: ReadonlyMap<string, number>,
): Promise<readonly SmokeObservation[]> {
  const actual: SmokeObservation[] = [];
  let firstMismatch: ObservationMismatchError | null = null;
  for (const item of expected) {
    const observed = await host.readResource(item.resource, bindings);
    firstMismatch ??= observationMismatch(item, observed, bindings, "step after");
    actual.push({ resource: item.resource, state: observed.state });
  }
  if (firstMismatch !== null) throw firstMismatch;
  return actual;
}

async function readPostWriteObservations(
  expected: readonly SmokeObservation[],
  host: SmokeHost,
  bindings: ReadonlyMap<string, number>,
  policy: SmokePostWriteReadPolicy,
): Promise<Readonly<{ observations: readonly SmokeObservation[]; attempts: number }>> {
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return { observations: await readPostWriteAttempt(expected, host, bindings), attempts: attempt };
    } catch (error: unknown) {
      if (!(error instanceof ObservationMismatchError) || attempt === policy.maxAttempts) throw error;
      await policy.wait();
    }
  }
  throw new Error("post-write observation retryが不正です");
}

function pullRequestState(observations: readonly SmokeObservation[], key: string) {
  const state = observations.find((item) => item.resource.key === key)?.state;
  if (state?.state !== "present" || state.value.kind !== "pull-request-state") throw new Error("checkpoint PR stateが不正です");
  return state.value;
}

function branchState(observations: readonly SmokeObservation[], key: string) {
  const state = observations.find((item) => item.resource.key === key)?.state;
  if (state?.state !== "present" || state.value.kind !== "branch-state") throw new Error("checkpoint branch stateが不正です");
  return state.value;
}

function bodyContext(preview: SmokePreview, step: SmokeStep): SmokePullRequestBodyContext {
  const pr = step.after.find((item) => item.resource.kind === "pull-request")?.resource;
  const initialBranch = preview.steps.flatMap((item) => item.after)
    .find((item) => item.resource.kind === "branch" && item.state.state === "present");
  if (pr?.kind !== "pull-request" || pr.locator.mode !== "planned" || initialBranch?.state.state !== "present" ||
    initialBranch.state.value.kind !== "branch-state") throw new Error("smoke PR body contextが不正です");
  return {
    repositoryId: preview.repositoryId,
    repository: preview.repository,
    run: preview.run,
    headRef: pr.locator.headRef,
    baseRef: pr.locator.baseRef,
    validationBaseSha: initialBranch.state.value.sha,
    sourceCommit: preview.sourceCommit,
  };
}

function verifyCheckpoint(
  checkpoint: SmokeCheckpoint,
  preview: SmokePreview,
  after: readonly SmokeObservation[],
  bindings: ReadonlyMap<string, number>,
): SmokeCheckpointEvidence {
  const step = preview.steps[checkpoint.stepIndex]!;
  if (checkpoint.kind === "human-intervention") {
    const prKey = checkpoint.resourceKeys.find((key) => key !== step.primaryKey)!;
    const state = pullRequestState(after, prKey);
    const body = smokePullRequestBody(bodyContext(preview, step), "validation-failed");
    if (smokeBodyDigest(body) !== state.bodyDigest) throw new Error("human-intervention live bodyが一致しません");
    const reducerInput = {
      repositoryId: preview.repositoryId,
      repository: preview.repository,
      defaultBaseRef: state.baseRef,
      resumeClosed: false as const,
      paginationComplete: true as const,
      pullRequests: [{
        prNumber: parsePositiveSafeInteger(bindings.get(prKey)),
        state: state.state,
        merged: state.merged,
        draft: state.draft,
        headRepositoryId: state.headRepositoryId,
        headRef: state.headRef,
        headSha: state.headSha,
        baseRepositoryId: state.baseRepositoryId,
        baseRef: state.baseRef,
        title: smokePullRequestTitle,
        body,
        authorUserId: "1",
        lastEditedAt: null,
      }],
    };
    const decision = discoverManagedPullRequests(reducerInput).decision;
    if (decision.kind !== "intervention-required" && decision.kind !== "pr-identity-conflict") {
      throw new Error("production reducerがlegacy smoke resourceを安全に停止しません");
    }
    return {
      ...checkpoint,
      result: "passed",
      decision: "intervention-required",
      reducer: { input: reducerInput, decision: "intervention-required" },
    };
  }
  if (checkpoint.kind === "validation-failure") {
    const state = pullRequestState(after, checkpoint.resourceKeys[0]!);
    const body = smokePullRequestBody(bodyContext(preview, step), "validation-failed");
    const classification = classifyPrBody(body, state.draft);
    if (smokeBodyDigest(body) !== state.bodyDigest || classification.kind !== "strict" ||
      classification.envelope.validation.status !== "failed" ||
      classification.envelope.validation.failureKind !== "command") {
      throw new Error("live validation failure checkpointが不正です");
    }
  } else if (checkpoint.kind === "append") {
    const branch = branchState(after, step.primaryKey);
    const prKey = checkpoint.resourceKeys.find((key) => key !== step.primaryKey)!;
    if (pullRequestState(after, prKey).headSha !== branch.sha) throw new Error("append coupled post-stateが不正です");
  } else if (checkpoint.kind === "issue-dedupe") {
    if (bindings.get(checkpoint.resourceKeys[0]!) === undefined) throw new Error("issue dedupe bindingがありません");
  } else if (checkpoint.kind === "cleanup") {
    for (const item of after) {
      if (item.resource.kind === "branch" ? item.state.state !== "absent" :
        item.state.state !== "present" || item.state.value.kind === "branch-state" || item.state.value.state !== "closed") {
        throw new Error("cleanup terminal stateが不正です");
      }
    }
  }
  return { ...checkpoint, result: "passed" };
}

export async function executeSmokePlan(
  value: unknown,
  host: SmokeHost,
  options: SmokeExecutionOptions = {},
): Promise<SmokeExecutionEvidence> {
  const preview = decodeSmokePreview(encodeSmokePreview(value));
  const postWriteRead = options.postWriteRead ?? defaultPostWriteReadPolicy;
  if (!Number.isSafeInteger(postWriteRead.maxAttempts) || postWriteRead.maxAttempts < 1 ||
    postWriteRead.maxAttempts > defaultPostWriteReadPolicy.maxAttempts || typeof postWriteRead.wait !== "function") {
    throw new Error("post-write observation retry policyが不正です");
  }
  await verifyExecutionIdentity(preview, host);
  const bindings = new Map<string, number>();
  const firstResources = new Map<string, SmokeObservation>();
  for (const step of preview.steps) {
    for (const item of step.before) if (!firstResources.has(item.resource.key)) firstResources.set(item.resource.key, item);
  }
  const evidence: SmokeStepEvidence[] = [];
  const checkpoints: SmokeCheckpointEvidence[] = [];
  try {
    await readObservations([...firstResources.values()], host, bindings, "initial before");
    for (const [index, step] of preview.steps.entries()) {
      const before = await readObservations(step.before, host, bindings, "step before");
      const target = primaryTarget(step);
      const applied: SmokeResourceObservation = await host.applyTarget(target, bindings, preview);
      const number = step.operation === "create"
        ? bindCreatedNumber(target.resource, applied.number, bindings)
        : target.resource.kind === "branch"
          ? undefined
          : target.resource.locator.mode === "existing"
            ? target.resource.locator.number
            : bindings.get(target.resource.key);
      if (!sameState(applied.state, target.after) || (target.resource.kind !== "branch" && applied.number !== number)) {
        throw new Error(`${target.resource.key}: write responseが一致しません`);
      }
      const postWrite = await readPostWriteObservations(step.after, host, bindings, postWriteRead);
      const after = postWrite.observations;
      evidence.push({ index, primaryKey: step.primaryKey, operation: step.operation, before, after,
        postWriteReadAttempts: postWrite.attempts,
        ...(number === undefined ? {} : { number }) });
      for (const checkpoint of preview.checkpoints.filter((item) => item.stepIndex === index)) {
        checkpoints.push(verifyCheckpoint(checkpoint, preview, after, bindings));
      }
    }
    return { bindings: Object.fromEntries(bindings), steps: evidence, checkpoints };
  } catch (error: unknown) {
    const residualResources: SmokeResidualResource[] = [];
    for (const [key, item] of firstResources) {
      try {
        const observed = await host.readResource(item.resource, bindings);
        residualResources.push({ key, resource: item.resource, state: observed.state,
          ...(observed.number === undefined ? {} : { number: observed.number }) });
      } catch (readError: unknown) {
        residualResources.push({ key, resource: item.resource,
          readError: readError instanceof Error ? readError.message : String(readError) });
      }
    }
    throw new SmokeExecutionError(error instanceof Error ? error.message : String(error), {
      bindings: Object.fromEntries(bindings), steps: evidence, residualResources, cause: error,
    });
  }
}
