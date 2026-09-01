import { parseObject, requireExactKeys } from "./validation.ts";
import {
  assertResourceStateIdentity,
  canonicalSmokeIdentity,
  parseResourceKey,
  parseResourceState,
  parseSmokeResource,
  type PullRequestState,
  type ResourceState,
  type ResourceValue,
  type SmokeResource,
} from "./smoke-resource.ts";

export type SmokeOperation = "create" | "update" | "draft" | "ready" | "close" | "reopen" | "delete";
export type SmokeObservation = Readonly<{
  resource: SmokeResource;
  state: ResourceState;
}>;
export type SmokeStep = Readonly<{
  operation: SmokeOperation;
  primaryKey: string;
  before: readonly SmokeObservation[];
  after: readonly SmokeObservation[];
}>;
export type SmokeCheckpointKind =
  | "draft"
  | "validation-failure"
  | "append"
  | "human-intervention"
  | "ready"
  | "pause"
  | "resume"
  | "issue-dedupe"
  | "cleanup";
export type SmokeCheckpoint = Readonly<{
  kind: SmokeCheckpointKind;
  stepIndex: number;
  resourceKeys: readonly string[];
}>;
export type SmokeTarget = Readonly<{
  operation: SmokeOperation;
  resource: SmokeResource;
  before: ResourceState;
  after: ResourceState;
}>;

function sameResourceValueExcept(
  before: ResourceValue,
  after: ResourceValue,
  allowedKey: "draft" | "state",
): boolean {
  if (before.kind !== after.kind) return false;
  const normalizedBefore = { ...before, [allowedKey]: undefined };
  const normalizedAfter = { ...after, [allowedKey]: undefined };
  return canonicalSmokeIdentity(normalizedBefore) === canonicalSmokeIdentity(normalizedAfter);
}

function validatePullRequestTransition(operation: SmokeOperation, before: ResourceState, after: ResourceState): void {
  if (operation === "create") {
    if (before.state !== "absent" || after.state !== "present" || after.value.kind !== "pull-request-state" ||
      after.value.state !== "open" || !after.value.draft || after.value.merged) throw new Error("PR create transitionが不正です");
    return;
  }
  if (before.state !== "present" || after.state !== "present" ||
    before.value.kind !== "pull-request-state" || after.value.kind !== "pull-request-state") {
    throw new Error("PR transitionはpresent stateが必要です");
  }
  if (operation === "update") {
    if (before.value.state !== after.value.state || before.value.draft !== after.value.draft || before.value.merged !== after.value.merged) {
      throw new Error("PR updateはlifecycleを変更できません");
    }
    return;
  }
  if (operation === "draft") {
    if (before.value.state !== "open" || before.value.draft || after.value.state !== "open" || !after.value.draft ||
      !sameResourceValueExcept(before.value, after.value, "draft")) throw new Error("PR draft transitionが不正です");
    return;
  }
  if (operation === "ready") {
    if (before.value.state !== "open" || !before.value.draft || after.value.state !== "open" || after.value.draft ||
      !sameResourceValueExcept(before.value, after.value, "draft")) throw new Error("PR ready transitionが不正です");
    return;
  }
  if (operation === "close") {
    if (before.value.state !== "open" || before.value.merged || after.value.state !== "closed" || after.value.merged ||
      !sameResourceValueExcept(before.value, after.value, "state")) throw new Error("PR close transitionが不正です");
    return;
  }
  if (operation === "reopen") {
    if (before.value.state !== "closed" || before.value.merged || after.value.state !== "open" || after.value.merged ||
      !sameResourceValueExcept(before.value, after.value, "state")) throw new Error("PR reopen transitionが不正です");
    return;
  }
  throw new Error("PR operationが不正です");
}

function validateIssueTransition(operation: SmokeOperation, before: ResourceState, after: ResourceState): void {
  if (operation === "create") {
    if (before.state !== "absent" || after.state !== "present" ||
      after.value.kind !== "issue-state" || after.value.state !== "open") throw new Error("issue create transitionが不正です");
    return;
  }
  if (before.state !== "present" || after.state !== "present" ||
    before.value.kind !== "issue-state" || after.value.kind !== "issue-state") {
    throw new Error("issue transitionはpresent stateが必要です");
  }
  if (operation === "update") {
    if (before.value.state !== after.value.state) throw new Error("issue updateはlifecycleを変更できません");
    return;
  }
  if (operation === "close") {
    if (before.value.state !== "open" || after.value.state !== "closed" ||
      !sameResourceValueExcept(before.value, after.value, "state")) throw new Error("issue close transitionが不正です");
    return;
  }
  if (operation === "reopen") {
    if (before.value.state !== "closed" || after.value.state !== "open" ||
      !sameResourceValueExcept(before.value, after.value, "state")) throw new Error("issue reopen transitionが不正です");
    return;
  }
  throw new Error("issue operationが不正です");
}

function parseSmokeTarget(value: unknown): SmokeTarget {
  const object = parseObject(value, "SmokeTarget");
  requireExactKeys(object, ["operation", "resource", "before", "after"], "SmokeTarget");
  const operations: readonly SmokeOperation[] = ["create", "update", "draft", "ready", "close", "reopen", "delete"];
  if (typeof object.operation !== "string" || !operations.includes(object.operation as SmokeOperation)) {
    throw new Error("smoke operationが不正です");
  }
  const operation = object.operation as SmokeOperation;
  const resource = parseSmokeResource(object.resource);
  const before = parseResourceState(object.before);
  const after = parseResourceState(object.after);
  assertResourceStateIdentity(resource, before);
  assertResourceStateIdentity(resource, after);
  if (resource.kind === "branch") {
    if (operation === "create" && before.state === "absent" && after.state === "present") return { operation, resource, before, after };
    if (operation === "update" && before.state === "present" && after.state === "present") return { operation, resource, before, after };
    if (operation === "delete" && before.state === "present" && after.state === "absent") return { operation, resource, before, after };
    throw new Error("branch transitionが不正です");
  }
  if (resource.kind === "pull-request") validatePullRequestTransition(operation, before, after);
  else validateIssueTransition(operation, before, after);
  return { operation, resource, before, after };
}

function parseSmokeObservation(value: unknown): SmokeObservation {
  const object = parseObject(value, "SmokeObservation");
  requireExactKeys(object, ["resource", "state"], "SmokeObservation");
  const resource = parseSmokeResource(object.resource);
  const state = parseResourceState(object.state);
  assertResourceStateIdentity(resource, state);
  return { resource, state };
}

function observationKeys(observations: readonly SmokeObservation[], label: string): readonly string[] {
  if (observations.length === 0) throw new Error(`${label}はnon-emptyが必要です`);
  const keys = observations.map((observation) => observation.resource.key);
  if (new Set(keys).size !== keys.length || canonicalSmokeIdentity([...keys].sort()) !== canonicalSmokeIdentity(keys)) {
    throw new Error(`${label} resource keyはsorted uniqueが必要です`);
  }
  return keys;
}

function samePullRequestExceptHeadSha(before: PullRequestState, after: PullRequestState): boolean {
  return canonicalSmokeIdentity({ ...before, headSha: undefined }) === canonicalSmokeIdentity({ ...after, headSha: undefined });
}

function validateCoupledObservation(
  primary: Readonly<{ resource: SmokeResource; before: ResourceState; after: ResourceState }>,
  secondary: Readonly<{ resource: SmokeResource; before: ResourceState; after: ResourceState }>,
  operation: SmokeOperation,
): void {
  if (canonicalSmokeIdentity(secondary.before) === canonicalSmokeIdentity(secondary.after)) return;
  if (operation !== "update" || primary.resource.kind !== "branch" || secondary.resource.kind !== "pull-request" ||
    primary.before.state !== "present" || primary.after.state !== "present" ||
    primary.before.value.kind !== "branch-state" || primary.after.value.kind !== "branch-state" ||
    secondary.before.state !== "present" || secondary.after.state !== "present" ||
    secondary.before.value.kind !== "pull-request-state" || secondary.after.value.kind !== "pull-request-state" ||
    secondary.before.value.state !== "open" || secondary.after.value.state !== "open" ||
    secondary.before.value.headRef !== primary.resource.ref || secondary.after.value.headRef !== primary.resource.ref ||
    secondary.before.value.headSha !== primary.before.value.sha || secondary.after.value.headSha !== primary.after.value.sha ||
    !samePullRequestExceptHeadSha(secondary.before.value, secondary.after.value)) {
    throw new Error("step secondary resource transitionが不正です");
  }
}

export function parseSmokeStep(value: unknown): SmokeStep {
  const object = parseObject(value, "SmokeStep");
  requireExactKeys(object, ["operation", "primaryKey", "before", "after"], "SmokeStep");
  const operations: readonly SmokeOperation[] = ["create", "update", "draft", "ready", "close", "reopen", "delete"];
  if (typeof object.operation !== "string" || !operations.includes(object.operation as SmokeOperation)) {
    throw new Error("smoke operationが不正です");
  }
  if (!Array.isArray(object.before) || !Array.isArray(object.after)) throw new Error("SmokeStep observationがarrayではありません");
  const operation = object.operation as SmokeOperation;
  const primaryKey = parseResourceKey(object.primaryKey);
  const before = object.before.map(parseSmokeObservation);
  const after = object.after.map(parseSmokeObservation);
  const beforeKeys = observationKeys(before, "SmokeStep before");
  const afterKeys = observationKeys(after, "SmokeStep after");
  if (canonicalSmokeIdentity(beforeKeys) !== canonicalSmokeIdentity(afterKeys) || !beforeKeys.includes(primaryKey)) {
    throw new Error("SmokeStep before / after key集合またはprimaryKeyが不正です");
  }
  for (let index = 0; index < before.length; index += 1) {
    if (canonicalSmokeIdentity(before[index]!.resource) !== canonicalSmokeIdentity(after[index]!.resource)) {
      throw new Error("SmokeStep resource descriptorが変化しています");
    }
  }
  const primaryIndex = beforeKeys.indexOf(primaryKey);
  const primary = {
    resource: before[primaryIndex]!.resource,
    before: before[primaryIndex]!.state,
    after: after[primaryIndex]!.state,
  };
  parseSmokeTarget({ operation, resource: primary.resource, before: primary.before, after: primary.after });
  for (let index = 0; index < before.length; index += 1) {
    if (index === primaryIndex) continue;
    validateCoupledObservation(primary, {
      resource: before[index]!.resource,
      before: before[index]!.state,
      after: after[index]!.state,
    }, operation);
  }
  return { operation, primaryKey, before, after };
}

const checkpointKinds: readonly SmokeCheckpointKind[] = [
  "draft", "validation-failure", "append", "human-intervention", "ready",
  "pause", "resume", "issue-dedupe", "cleanup",
];

export function parseSmokeCheckpoint(value: unknown): SmokeCheckpoint {
  const object = parseObject(value, "SmokeCheckpoint");
  requireExactKeys(object, ["kind", "stepIndex", "resourceKeys"], "SmokeCheckpoint");
  if (typeof object.kind !== "string" || !checkpointKinds.includes(object.kind as SmokeCheckpointKind)) {
    throw new Error("SmokeCheckpoint kindが不正です");
  }
  if (!Number.isSafeInteger(object.stepIndex) || typeof object.stepIndex !== "number" || object.stepIndex < 0) {
    throw new Error("SmokeCheckpoint stepIndexが不正です");
  }
  if (!Array.isArray(object.resourceKeys) || object.resourceKeys.length === 0) {
    throw new Error("SmokeCheckpoint resourceKeysはnon-emptyが必要です");
  }
  const resourceKeys = object.resourceKeys.map(parseResourceKey);
  if (new Set(resourceKeys).size !== resourceKeys.length ||
    canonicalSmokeIdentity([...resourceKeys].sort()) !== canonicalSmokeIdentity(resourceKeys)) {
    throw new Error("SmokeCheckpoint resourceKeysはsorted uniqueが必要です");
  }
  return { kind: object.kind as SmokeCheckpointKind, stepIndex: object.stepIndex, resourceKeys };
}

function stepObservation(step: SmokeStep, key: string, phase: "before" | "after"): SmokeObservation {
  const observation = step[phase].find((item) => item.resource.key === key);
  if (observation === undefined) throw new Error("SmokeCheckpoint resourceがstepにありません");
  return observation;
}

function validateCheckpoint(checkpoint: SmokeCheckpoint, steps: readonly SmokeStep[], mode: "normal" | "recovery"): void {
  const step = steps[checkpoint.stepIndex];
  if (step === undefined) throw new Error("SmokeCheckpoint stepIndexが存在しません");
  for (const key of checkpoint.resourceKeys) stepObservation(step, key, "before");
  const primaryBefore = stepObservation(step, step.primaryKey, "before");
  const primary = stepObservation(step, step.primaryKey, "after");
  if (checkpoint.kind === "append" || checkpoint.kind === "human-intervention") {
    if (step.operation !== "update" || primary.resource.kind !== "branch" || checkpoint.resourceKeys.length !== 2) {
      throw new Error("append / human-intervention checkpointが不正です");
    }
    const secondaryKey = checkpoint.resourceKeys.find((key) => key !== step.primaryKey);
    if (secondaryKey === undefined || stepObservation(step, secondaryKey, "after").resource.kind !== "pull-request") {
      throw new Error("append / human-intervention checkpoint resourceが不正です");
    }
    const secondaryBefore = stepObservation(step, secondaryKey, "before");
    const secondaryAfter = stepObservation(step, secondaryKey, "after");
    if (canonicalSmokeIdentity(secondaryBefore.state) === canonicalSmokeIdentity(secondaryAfter.state)) {
      throw new Error("append / human-intervention checkpointはcoupled PR transitionが必要です");
    }
    validateCoupledObservation(
      { resource: primary.resource, before: primaryBefore.state, after: primary.state },
      { resource: secondaryBefore.resource, before: secondaryBefore.state, after: secondaryAfter.state },
      step.operation,
    );
    return;
  }
  if (checkpoint.kind === "cleanup") {
    const cleanupKeys = mode === "normal"
      ? [...new Set(steps.flatMap((item) => item.before.map((observation) => observation.resource))
        .filter((resource) => resource.kind === "branch" || resource.locator.mode === "planned")
        .map((resource) => resource.key))].sort()
      : [...new Set(steps.flatMap((item) => item.before.map((observation) => observation.resource.key)))].sort();
    const terminal = (key: string): boolean => {
      const state = stepObservation(step, key, "after");
      return state.resource.kind === "branch"
        ? state.state.state === "absent"
        : state.state.state === "present" && state.state.value.kind !== "branch-state" && state.state.value.state === "closed" &&
            (state.state.value.kind !== "pull-request-state" || !state.state.value.merged);
    };
    if (checkpoint.stepIndex !== steps.length - 1 ||
      canonicalSmokeIdentity(checkpoint.resourceKeys) !== canonicalSmokeIdentity(cleanupKeys) ||
      cleanupKeys.some((key) => !step.after.some((observation) => observation.resource.key === key) || !terminal(key))) {
      throw new Error("cleanup checkpointは全対象resourceのterminal stateが必要です");
    }
    return;
  }
  const expected: Readonly<Record<Exclude<SmokeCheckpointKind, "append" | "human-intervention" | "cleanup">,
    Readonly<{ operation: SmokeOperation; kind: SmokeResource["kind"] }>>> = {
    draft: { operation: "create", kind: "pull-request" },
    "validation-failure": { operation: "update", kind: "pull-request" },
    ready: { operation: "ready", kind: "pull-request" },
    pause: { operation: "close", kind: "pull-request" },
    resume: { operation: "reopen", kind: "pull-request" },
    "issue-dedupe": { operation: "update", kind: "issue" },
  };
  const contract = expected[checkpoint.kind];
  if (step.operation !== contract.operation || primary.resource.kind !== contract.kind ||
    canonicalSmokeIdentity(checkpoint.resourceKeys) !== canonicalSmokeIdentity([step.primaryKey])) {
    throw new Error(`${checkpoint.kind} checkpointが不正です`);
  }
}

export function validateStepChains(
  steps: readonly SmokeStep[],
  checkpoints: readonly SmokeCheckpoint[],
  repositoryId: string,
  mode: "normal" | "recovery",
): void {
  const descriptors = new Map<string, string>();
  const observations = new Map<string, Array<Readonly<{
    step: SmokeStep;
    before: ResourceState;
    after: ResourceState;
    primary: boolean;
  }>>>();
  for (const step of steps) {
    for (let index = 0; index < step.before.length; index += 1) {
      const before = step.before[index]!;
      const after = step.after[index]!;
      const descriptor = canonicalSmokeIdentity(before.resource);
      const previousDescriptor = descriptors.get(before.resource.key);
      if (previousDescriptor !== undefined && previousDescriptor !== descriptor) {
        throw new Error("resource keyのdescriptorが変化しています");
      }
      descriptors.set(before.resource.key, descriptor);
      observations.set(before.resource.key, [...(observations.get(before.resource.key) ?? []), {
        step,
        before: before.state,
        after: after.state,
        primary: step.primaryKey === before.resource.key,
      }]);
      if (before.resource.kind === "pull-request" && before.resource.locator.mode === "planned") {
        for (const state of [before.state, after.state]) {
          if (state.state === "present" && state.value.kind === "pull-request-state" &&
            (state.value.headRepositoryId !== repositoryId || state.value.baseRepositoryId !== repositoryId)) {
            throw new Error("planned PR repository IDがpreview repositoryと一致しません");
          }
        }
      }
    }
  }
  if (mode === "recovery") {
    const resources = steps.flatMap((step) => step.before.map((item) => item.resource));
    const hasBranch = resources.some((resource) => resource.kind === "branch");
    const hasRunCorrelation = resources.some((resource) =>
      resource.kind === "pull-request" || resource.kind === "issue");
    if (hasBranch && !hasRunCorrelation) {
      throw new Error("recovery branch deleteにはstrict resource correlationが必要です");
    }
  }
  for (const [key, sequence] of observations) {
    for (let index = 1; index < sequence.length; index += 1) {
      if (canonicalSmokeIdentity(sequence[index - 1]!.after) !== canonicalSmokeIdentity(sequence[index]!.before)) {
        throw new Error("resource state chainが不連続です");
      }
    }
    const resource = steps.flatMap((step) => step.before).find((item) => item.resource.key === key)!.resource;
    const primary = sequence.filter((item) => item.primary);
    if (mode === "recovery") {
      if (sequence[0]?.before.state !== "present" ||
        primary.some((item) => !["draft", "close", "delete"].includes(item.step.operation))) {
        throw new Error("recovery resource lifecycleが不正です");
      }
      const terminal = (primary.at(-1) ?? sequence.at(-1))!.after;
      if (resource.kind === "branch") {
        if (primary.at(-1)?.step.operation !== "delete" || terminal.state !== "absent") {
          throw new Error("recovery branch lifecycleが不正です");
        }
      } else if ((primary.length > 0 && primary.at(-1)?.step.operation !== "close") || terminal.state !== "present" ||
        terminal.value.kind === "branch-state" || terminal.value.state !== "closed" ||
        (terminal.value.kind === "pull-request-state" && terminal.value.merged)) {
        throw new Error("recovery resource terminal stateが不正です");
      }
    } else if (resource.kind === "branch") {
      if (primary[0]?.step.operation !== "create" || primary.filter((item) => item.step.operation === "create").length !== 1 ||
        primary.at(-1)?.step.operation !== "delete" || primary.at(-1)?.after.state !== "absent") {
        throw new Error("planned branch lifecycleが不正です");
      }
    } else if (resource.locator.mode === "planned") {
      if (primary[0]?.step.operation !== "create" || primary.filter((item) => item.step.operation === "create").length !== 1 ||
        primary.at(-1)?.step.operation !== "close" || primary.at(-1)?.after.state !== "present") {
        throw new Error("planned resource lifecycleが不正です");
      }
      const terminal = primary.at(-1)!.after;
      if (terminal.state !== "present") throw new Error("planned resource terminal stateが不正です");
      if (resource.kind === "pull-request" &&
        (terminal.value.kind !== "pull-request-state" || terminal.value.state !== "closed" || terminal.value.merged)) {
        throw new Error("planned PR terminal stateが不正です");
      }
    } else if (primary.some((item) => item.step.operation === "create")) {
      throw new Error("existing resourceはcreateできません");
    }
  }
  const requiredKinds: readonly SmokeCheckpointKind[] = mode === "normal" ? checkpointKinds : ["cleanup"];
  if (checkpoints.length !== requiredKinds.length || new Set(checkpoints.map((item) => item.kind)).size !== requiredKinds.length ||
    requiredKinds.some((kind) => !checkpoints.some((checkpoint) => checkpoint.kind === kind))) {
    throw new Error("SmokePreview required checkpointが不正です");
  }
  for (const checkpoint of checkpoints) validateCheckpoint(checkpoint, steps, mode);
}
