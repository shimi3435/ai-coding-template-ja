import { createHash } from "node:crypto";

import { decodeCanonicalJson, encodeCanonicalJson, type ExactSchema } from "./canonical-json.ts";
import { parseSmokeCheckpoint, parseSmokeStep, validateStepChains, type SmokeCheckpoint, type SmokeStep } from "./smoke-step.ts";
import {
  parseDecimalId,
  parseObject,
  parseRepositoryFullName,
  parseRunRef,
  parseSha,
  parseUtcTimestamp,
  requireExactKeys,
  type RunRef,
} from "./validation.ts";
import {
  smokeBodyDigest,
  smokeBranchRef,
  smokeIssueBody,
  smokeIssueTitle,
  smokePullRequestBody,
} from "../smoke/body.ts";

export { createPresentResourceState } from "./smoke-resource.ts";
export type {
  AbsentResourceState,
  BranchResource,
  BranchState,
  IssueResource,
  IssueState,
  PresentResourceState,
  PullRequestResource,
  PullRequestState,
  ResourceState,
  ResourceValue,
  SmokeResource,
} from "./smoke-resource.ts";
export type {
  SmokeCheckpoint,
  SmokeCheckpointKind,
  SmokeObservation,
  SmokeOperation,
  SmokeStep,
  SmokeTarget,
} from "./smoke-step.ts";

export type SmokePreview = Readonly<{
  schemaVersion: 3;
  kind: "real-host-smoke-preview";
  mode: "normal" | "recovery";
  repositoryId: string;
  repository: string;
  run: RunRef;
  baseCommit: string;
  sourceParentCommit: string;
  sourceCommit: string;
  createdAt: string;
  steps: readonly SmokeStep[];
  checkpoints: readonly SmokeCheckpoint[];
}>;

function validateRecoveryCorrelation(input: Readonly<{
  mode: "normal" | "recovery";
  repositoryId: string;
  repository: string;
  run: RunRef;
  sourceParentCommit: string;
  sourceCommit: string;
  steps: readonly SmokeStep[];
}>): void {
  if (input.mode !== "recovery") return;
  const observations = input.steps.flatMap((step) => [...step.before, ...step.after]);
  const branchObservations = observations.filter((item) => item.resource.kind === "branch");
  if (branchObservations.some((item) => item.resource.kind !== "branch" || item.resource.ref !== smokeBranchRef ||
    (item.state.state === "present" && (item.state.value.kind !== "branch-state" ||
      (item.state.value.sha !== input.sourceParentCommit && item.state.value.sha !== input.sourceCommit))))) {
    throw new Error("recovery branch identityがstrict smoke targetと一致しません");
  }
  const byKey = new Map<string, typeof observations>();
  for (const item of observations) {
    if (item.resource.kind === "branch") continue;
    byKey.set(item.resource.key, [...(byKey.get(item.resource.key) ?? []), item]);
  }
  const strictResourceResults = [...byKey.values()].map((items) => items.length > 0 && items.every((item) => {
    if (item.state.state !== "present" || item.resource.kind === "branch" || item.resource.locator.mode !== "existing") {
      return false;
    }
    if (item.resource.kind === "issue") {
      return item.state.value.kind === "issue-state" && item.state.value.title === smokeIssueTitle &&
        (["initial", "updated"] as const).some((phase) => item.state.state === "present" && item.state.value.kind === "issue-state" &&
          item.state.value.bodyDigest === smokeBodyDigest(smokeIssueBody({
            repositoryId: input.repositoryId,
            repository: input.repository,
            run: input.run,
            sourceCommit: input.sourceCommit,
          }, phase)));
    }
    if (item.state.value.kind !== "pull-request-state" || item.state.value.headRepositoryId !== input.repositoryId ||
      item.state.value.baseRepositoryId !== input.repositoryId || item.state.value.headRef !== smokeBranchRef ||
      item.state.value.merged) return false;
    const bodyContext = {
      repositoryId: input.repositoryId,
      repository: input.repository,
      run: input.run,
      headRef: item.state.value.headRef,
      baseRef: item.state.value.baseRef,
      validationBaseSha: input.sourceParentCommit,
      sourceCommit: input.sourceCommit,
    };
    const initialDigest = smokeBodyDigest(smokePullRequestBody(bodyContext, "initial"));
    const failedDigest = smokeBodyDigest(smokePullRequestBody(bodyContext, "validation-failed"));
    const passedDigest = smokeBodyDigest(smokePullRequestBody(bodyContext, "passed"));
    return (item.state.value.bodyDigest === initialDigest && item.state.value.headSha === input.sourceParentCommit) ||
      (item.state.value.bodyDigest === failedDigest &&
        (item.state.value.headSha === input.sourceParentCommit || item.state.value.headSha === input.sourceCommit)) ||
      (item.state.value.bodyDigest === passedDigest && item.state.value.headSha === input.sourceCommit);
  }));
  if (strictResourceResults.some((result) => !result) ||
    (branchObservations.length > 0 && strictResourceResults.length === 0)) {
    throw new Error("recovery resourceにはsame run / source strict correlationが必要です");
  }
}

const smokePreviewSchema: ExactSchema<SmokePreview> = {
  parse(value: unknown): SmokePreview {
    const object = parseObject(value, "SmokePreview");
    requireExactKeys(object, [
      "schemaVersion", "kind", "mode", "repositoryId", "repository", "run", "baseCommit", "sourceParentCommit",
      "sourceCommit", "createdAt", "steps", "checkpoints",
    ], "SmokePreview");
    if (object.schemaVersion !== 3 || object.kind !== "real-host-smoke-preview" ||
      (object.mode !== "normal" && object.mode !== "recovery")) throw new Error("SmokePreview discriminatorが不正です");
    if (!Array.isArray(object.steps) || object.steps.length === 0 || !Array.isArray(object.checkpoints) || object.checkpoints.length === 0) {
      throw new Error("SmokePreview steps / checkpointsはnon-emptyが必要です");
    }
    const repositoryId = parseDecimalId(object.repositoryId);
    const repository = parseRepositoryFullName(object.repository);
    const run = parseRunRef(object.run);
    const baseCommit = parseSha(object.baseCommit);
    const sourceParentCommit = parseSha(object.sourceParentCommit);
    const sourceCommit = parseSha(object.sourceCommit);
    const steps = object.steps.map(parseSmokeStep);
    const checkpoints = object.checkpoints.map(parseSmokeCheckpoint);
    validateStepChains(steps, checkpoints, repositoryId, object.mode);
    validateRecoveryCorrelation({
      mode: object.mode,
      repositoryId,
      repository,
      run,
      sourceParentCommit,
      sourceCommit,
      steps,
    });
    return {
      schemaVersion: 3,
      kind: "real-host-smoke-preview",
      mode: object.mode,
      repositoryId,
      repository,
      run,
      baseCommit,
      sourceParentCommit,
      sourceCommit,
      createdAt: parseUtcTimestamp(object.createdAt),
      steps,
      checkpoints,
    };
  },
};

const smokePreviewByteLimit = 48 * 1024;

export function encodeSmokePreview(value: unknown): Buffer {
  const bytes = encodeCanonicalJson(smokePreviewSchema, value);
  if (bytes.length === 0 || bytes.length > smokePreviewByteLimit) throw new Error("SmokePreview sizeが不正です");
  return bytes;
}

export function decodeSmokePreview(bytes: Uint8Array): SmokePreview {
  if (bytes.byteLength === 0 || bytes.byteLength > smokePreviewByteLimit) throw new Error("SmokePreview sizeが不正です");
  return decodeCanonicalJson(smokePreviewSchema, bytes);
}

export function computeSmokePreviewDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(encodeSmokePreview(value)).digest("hex")}`;
}
