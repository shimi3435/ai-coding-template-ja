import {
  createPresentResourceState,
  decodeSmokePreview,
  encodeSmokePreview,
  parseDecimalId,
  parseRepositoryFullName,
  parseRunRef,
  parseSha,
  parseUtcTimestamp,
  type ResourceState,
  type RunRef,
  type SmokeCheckpoint,
  type SmokeObservation,
  type SmokePreview,
  type SmokeResource,
  type SmokeStep,
} from "../model/index.ts";
import {
  smokeBodyDigest,
  smokeBranchRef,
  smokeIssueBody,
  smokeIssueTitle,
  smokePullRequestBody,
  type SmokePullRequestBodyContext,
} from "./body.ts";
import type { SmokeHost, SmokeRepository, SmokeWorkflowRun } from "./host.ts";

export type BuildSmokePreviewInput = Readonly<{
  repository: string;
  run: RunRef;
  sourceCommit: string;
  createdAt: string;
}>;

export function verifyRepositoryAndRun(
  input: Readonly<{ repository: string; run: RunRef; sourceCommit: string }>,
  repository: SmokeRepository,
  workflowRun: SmokeWorkflowRun | null,
): void {
  if (workflowRun === null) throw new Error("workflow runが見つかりません");
  if (
    repository.fullName !== input.repository || workflowRun.repository !== input.repository ||
    workflowRun.repositoryId !== repository.id || workflowRun.id !== input.run.workflowRunId ||
    workflowRun.attempt !== input.run.workflowRunAttempt || workflowRun.headSha !== input.sourceCommit
  ) throw new Error("repository / workflow run / source commitが一致しません");
}

function observation(resource: SmokeResource, state: ResourceState): SmokeObservation {
  return { resource, state };
}

function step(
  operation: SmokeStep["operation"],
  primaryKey: string,
  before: readonly SmokeObservation[],
  after: readonly SmokeObservation[],
): SmokeStep {
  return { operation, primaryKey, before, after };
}

function sameState(left: ResourceState, right: ResourceState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortedObservations(observations: readonly SmokeObservation[]): readonly SmokeObservation[] {
  return [...observations].sort((left, right) => left.resource.key.localeCompare(right.resource.key));
}

export async function buildSmokePreview(input: BuildSmokePreviewInput, host: SmokeHost): Promise<SmokePreview> {
  const repository = await host.readRepository();
  const repositoryName = parseRepositoryFullName(input.repository);
  const run = parseRunRef(input.run);
  const sourceCommit = parseSha(input.sourceCommit);
  verifyRepositoryAndRun(
    { repository: repositoryName, run, sourceCommit }, repository, await host.readWorkflowRun(run.workflowRunId),
  );
  const repositoryId = parseDecimalId(repository.id);
  const parentCommit = await host.readCommitParent(sourceCommit);
  if (parentCommit === null || parentCommit === sourceCommit) throw new Error("source commitにdistinct first parentが必要です");
  const baseResource = { kind: "branch", key: "smoke-base", ref: repository.defaultBranchRef } as const;
  const baseObservation = await host.readResource(baseResource, new Map());
  if (baseObservation.state.state !== "present" || baseObservation.state.value.kind !== "branch-state") {
    throw new Error("default branch tipを取得できません");
  }
  const baseCommit = baseObservation.state.value.sha;
  const headRef = smokeBranchRef;
  const branchResource = { kind: "branch", key: "smoke-branch", ref: headRef } as const;
  const prResource = {
    kind: "pull-request",
    key: "smoke-pr",
    locator: { mode: "planned", headRef, baseRef: repository.defaultBranchRef },
  } as const;
  const issueResource = {
    kind: "issue",
    key: "smoke-issue",
    locator: { mode: "planned", title: smokeIssueTitle, markerVersion: 1 },
  } as const;
  const bindings = new Map<string, number>();
  const initialResources = await Promise.all([branchResource, prResource, issueResource].map(async (resource) => ({
    resource,
    observed: await host.readResource(resource, bindings),
  })));
  const bodyContext: SmokePullRequestBodyContext = {
    repositoryId,
    repository: repositoryName,
    run,
    headRef,
    baseRef: repository.defaultBranchRef,
    validationBaseSha: parentCommit,
    sourceCommit,
  };
  const absent = { state: "absent" } as const;
  const branchInitial = createPresentResourceState({ schemaVersion: 1, kind: "branch-state", ref: headRef, sha: parentCommit });
  const branchAppended = createPresentResourceState({ schemaVersion: 1, kind: "branch-state", ref: headRef, sha: sourceCommit });
  const prInitial = createPresentResourceState({
    schemaVersion: 1,
    kind: "pull-request-state",
    headRepositoryId: repositoryId,
    headRef,
    headSha: parentCommit,
    baseRepositoryId: repositoryId,
    baseRef: repository.defaultBranchRef,
    draft: true,
    state: "open",
    merged: false,
    bodyDigest: smokeBodyDigest(smokePullRequestBody(bodyContext, "initial")),
  });
  const prValidationFailed = createPresentResourceState({
    ...prInitial.value,
    bodyDigest: smokeBodyDigest(smokePullRequestBody(bodyContext, "validation-failed")),
  });
  const prInterventionObserved = createPresentResourceState({ ...prValidationFailed.value, headSha: sourceCommit });
  const prPassed = createPresentResourceState({
    ...prInterventionObserved.value,
    bodyDigest: smokeBodyDigest(smokePullRequestBody(bodyContext, "passed")),
  });
  const prReady = createPresentResourceState({ ...prPassed.value, draft: false });
  const prDraftAgain = createPresentResourceState({ ...prReady.value, draft: true });
  const prClosed = createPresentResourceState({ ...prDraftAgain.value, state: "closed" });
  const issueOpen = createPresentResourceState({
    schemaVersion: 1,
    kind: "issue-state",
    state: "open",
    title: smokeIssueTitle,
    bodyDigest: smokeBodyDigest(smokeIssueBody(bodyContext, "initial")),
  });
  const issueUpdated = createPresentResourceState({
    ...issueOpen.value,
    bodyDigest: smokeBodyDigest(smokeIssueBody(bodyContext, "updated")),
  });
  const issueClosed = createPresentResourceState({ ...issueUpdated.value, state: "closed" });
  if (initialResources.some((item) => item.observed.state.state !== "absent")) {
    const allowedStates = new Map<string, readonly ResourceState[]>([
      [branchResource.key, [branchInitial, branchAppended]],
      [prResource.key, [prInitial, prValidationFailed, prInterventionObserved, prPassed, prReady, prDraftAgain, prClosed]],
      [issueResource.key, [issueOpen, issueUpdated, issueClosed]],
    ]);
    const residual: Array<Readonly<{ resource: SmokeResource; state: ResourceState }>> = [];
    for (const { resource, observed } of initialResources) {
      if (observed.state.state === "absent") continue;
      if (!(allowedStates.get(resource.key) ?? []).some((state) => sameState(state, observed.state))) {
        throw new Error(`${resource.key}: residual stateが承認済みlifecycleと一致しません`);
      }
      if (resource.kind === "branch") residual.push({ resource, state: observed.state });
      else {
        if (observed.number === undefined) throw new Error(`${resource.key}: residual resource numberがありません`);
        residual.push({
          resource: { kind: resource.kind, key: resource.key, locator: { mode: "existing", number: observed.number } },
          state: observed.state,
        });
      }
    }
    const current = new Map(residual.map((item) => [item.resource.key, item.state]));
    const recoveryBranch = residual.find((item) => item.resource.kind === "branch");
    const hasStrictRunCorrelation = residual.some((item) =>
      item.resource.kind === "pull-request" || item.resource.kind === "issue");
    if (recoveryBranch !== undefined && !hasStrictRunCorrelation) {
      throw new Error("branch-only residualはrun ownership correlationを証明できません");
    }
    const recoverySteps: SmokeStep[] = [];
    const addRecoveryStep = (operation: SmokeStep["operation"], resource: SmokeResource, after: ResourceState): void => {
      const before = current.get(resource.key);
      if (before === undefined) throw new Error("recovery before stateがありません");
      recoverySteps.push(step(operation, resource.key, [observation(resource, before)], [observation(resource, after)]));
      current.set(resource.key, after);
    };
    const recoveryPr = residual.find((item) => item.resource.kind === "pull-request");
    if (recoveryPr?.state.state === "present" && recoveryPr.state.value.kind === "pull-request-state") {
      if (recoveryPr.state.value.merged) throw new Error("merged PRはrecovery cleanupできません");
      if (recoveryPr.state.value.state === "open" && !recoveryPr.state.value.draft) {
        addRecoveryStep("draft", recoveryPr.resource,
          createPresentResourceState({ ...recoveryPr.state.value, draft: true }));
      }
      const state = current.get(recoveryPr.resource.key);
      if (state?.state === "present" && state.value.kind === "pull-request-state" && state.value.state === "open") {
        addRecoveryStep("close", recoveryPr.resource, createPresentResourceState({ ...state.value, state: "closed" }));
      }
    }
    const recoveryIssue = residual.find((item) => item.resource.kind === "issue");
    if (recoveryIssue?.state.state === "present" && recoveryIssue.state.value.kind === "issue-state" &&
      recoveryIssue.state.value.state === "open") {
      addRecoveryStep("close", recoveryIssue.resource,
        createPresentResourceState({ ...recoveryIssue.state.value, state: "closed" }));
    }
    if (recoveryBranch !== undefined) addRecoveryStep("delete", recoveryBranch.resource, absent);
    if (recoverySteps.length === 0) throw new Error("recovery write targetがありません");
    const lastIndex = recoverySteps.length - 1;
    const last = recoverySteps[lastIndex]!;
    const beforeByKey = new Map(last.before.map((item) => [item.resource.key, item]));
    const afterByKey = new Map(last.after.map((item) => [item.resource.key, item]));
    for (const item of residual) {
      if (beforeByKey.has(item.resource.key)) continue;
      const state = current.get(item.resource.key)!;
      beforeByKey.set(item.resource.key, observation(item.resource, state));
      afterByKey.set(item.resource.key, observation(item.resource, state));
    }
    recoverySteps[lastIndex] = step(last.operation, last.primaryKey,
      sortedObservations([...beforeByKey.values()]), sortedObservations([...afterByKey.values()]));
    const cleanupKeys = residual.map((item) => item.resource.key).sort();
    return decodeSmokePreview(encodeSmokePreview({
      schemaVersion: 3,
      kind: "real-host-smoke-preview",
      mode: "recovery",
      repositoryId,
      repository: repositoryName,
      run,
      baseCommit,
      sourceParentCommit: parentCommit,
      sourceCommit,
      createdAt: parseUtcTimestamp(input.createdAt),
      steps: recoverySteps,
      checkpoints: [{ kind: "cleanup", stepIndex: lastIndex, resourceKeys: cleanupKeys }],
    }));
  }
  const comparison = await host.readCommitComparison(baseCommit, parentCommit);
  if (comparison.status !== "ahead" || comparison.aheadBy < 1 || comparison.behindBy !== 0) {
    throw new Error("source parentがdefault baseよりaheadでないためPRを作成できません");
  }
  const steps = [
    step("create", branchResource.key, [observation(branchResource, absent)], [observation(branchResource, branchInitial)]),
    step("create", prResource.key, [observation(prResource, absent)], [observation(prResource, prInitial)]),
    step("update", prResource.key, [observation(prResource, prInitial)], [observation(prResource, prValidationFailed)]),
    step("update", branchResource.key,
      [observation(branchResource, branchInitial), observation(prResource, prValidationFailed)],
      [observation(branchResource, branchAppended), observation(prResource, prInterventionObserved)]),
    step("update", prResource.key, [observation(prResource, prInterventionObserved)], [observation(prResource, prPassed)]),
    step("ready", prResource.key, [observation(prResource, prPassed)], [observation(prResource, prReady)]),
    step("draft", prResource.key, [observation(prResource, prReady)], [observation(prResource, prDraftAgain)]),
    step("close", prResource.key, [observation(prResource, prDraftAgain)], [observation(prResource, prClosed)]),
    step("reopen", prResource.key, [observation(prResource, prClosed)], [observation(prResource, prDraftAgain)]),
    step("close", prResource.key, [observation(prResource, prDraftAgain)], [observation(prResource, prClosed)]),
    step("create", issueResource.key, [observation(issueResource, absent)], [observation(issueResource, issueOpen)]),
    step("update", issueResource.key, [observation(issueResource, issueOpen)], [observation(issueResource, issueUpdated)]),
    step("close", issueResource.key, [observation(issueResource, issueUpdated)], [observation(issueResource, issueClosed)]),
    step("delete", branchResource.key,
      [observation(branchResource, branchAppended), observation(issueResource, issueClosed), observation(prResource, prClosed)],
      [observation(branchResource, absent), observation(issueResource, issueClosed), observation(prResource, prClosed)]),
  ] as const;
  const checkpoints: readonly SmokeCheckpoint[] = [
    { kind: "draft", stepIndex: 1, resourceKeys: [prResource.key] },
    { kind: "validation-failure", stepIndex: 2, resourceKeys: [prResource.key] },
    { kind: "append", stepIndex: 3, resourceKeys: [branchResource.key, prResource.key] },
    { kind: "human-intervention", stepIndex: 3, resourceKeys: [branchResource.key, prResource.key] },
    { kind: "ready", stepIndex: 5, resourceKeys: [prResource.key] },
    { kind: "pause", stepIndex: 7, resourceKeys: [prResource.key] },
    { kind: "resume", stepIndex: 8, resourceKeys: [prResource.key] },
    { kind: "issue-dedupe", stepIndex: 11, resourceKeys: [issueResource.key] },
    { kind: "cleanup", stepIndex: 13, resourceKeys: [branchResource.key, issueResource.key, prResource.key] },
  ];
  return decodeSmokePreview(encodeSmokePreview({
    schemaVersion: 3,
    kind: "real-host-smoke-preview",
    mode: "normal",
    repositoryId,
    repository: repositoryName,
    run,
    baseCommit,
    sourceParentCommit: parentCommit,
    sourceCommit,
    createdAt: parseUtcTimestamp(input.createdAt),
    steps,
    checkpoints,
  }));
}
