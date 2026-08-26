import { createHash } from "node:crypto";

import { encodeCanonicalJson, type ExactSchema } from "./canonical-json.ts";
import {
  parseDecimalId,
  parseDigest,
  parseObject,
  parsePositiveSafeInteger,
  parseSha,
  requireExactKeys,
} from "./validation.ts";

export type BranchState = Readonly<{
  schemaVersion: 1;
  kind: "branch-state";
  ref: string;
  sha: string;
}>;
export type PullRequestState = Readonly<{
  schemaVersion: 1;
  kind: "pull-request-state";
  headRepositoryId: string;
  headRef: string;
  headSha: string;
  baseRepositoryId: string;
  baseRef: string;
  draft: boolean;
  state: "open" | "closed";
  merged: boolean;
  bodyDigest: string;
}>;
export type IssueState = Readonly<{
  schemaVersion: 1;
  kind: "issue-state";
  state: "open" | "closed";
  title: string;
  bodyDigest: string;
}>;
export type ResourceValue = BranchState | PullRequestState | IssueState;
export type AbsentResourceState = Readonly<{ state: "absent" }>;
export type PresentResourceState = Readonly<{
  state: "present";
  value: ResourceValue;
  digest: string;
}>;
export type ResourceState = AbsentResourceState | PresentResourceState;
export type BranchResource = Readonly<{ kind: "branch"; key: string; ref: string }>;
export type PullRequestResource = Readonly<{
  kind: "pull-request";
  key: string;
  locator:
    | Readonly<{ mode: "existing"; number: number }>
    | Readonly<{ mode: "planned"; headRef: string; baseRef: string }>;
}>;
export type IssueResource = Readonly<{
  kind: "issue";
  key: string;
  locator:
    | Readonly<{ mode: "existing"; number: number }>
    | Readonly<{
      mode: "planned";
      title: "Skill update automation requires attention";
      markerVersion: 1;
    }>;
}>;
export type SmokeResource = BranchResource | PullRequestResource | IssueResource;

function parseGitRef(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new Error(`${label}が不正です`);
  }
  return value;
}

const resourceValueSchema: ExactSchema<ResourceValue> = {
  parse(value: unknown): ResourceValue {
    const object = parseObject(value, "resource value");
    if (object.kind === "branch-state") {
      requireExactKeys(object, ["schemaVersion", "kind", "ref", "sha"], "BranchState");
      if (object.schemaVersion !== 1) throw new Error("BranchState schemaVersionが不正です");
      return {
        schemaVersion: 1,
        kind: "branch-state",
        ref: parseGitRef(object.ref, "branch ref"),
        sha: parseSha(object.sha),
      };
    }
    if (object.kind === "pull-request-state") {
      requireExactKeys(object, [
        "schemaVersion", "kind", "headRepositoryId", "headRef", "headSha", "baseRepositoryId", "baseRef",
        "draft", "state", "merged", "bodyDigest",
      ], "PullRequestState");
      if (object.schemaVersion !== 1) throw new Error("PullRequestState schemaVersionが不正です");
      if (typeof object.draft !== "boolean" || typeof object.merged !== "boolean") throw new Error("PR boolean fieldが不正です");
      if (object.state !== "open" && object.state !== "closed") throw new Error("PR stateが不正です");
      if (object.state === "open" && object.merged) throw new Error("open PRはmergedにできません");
      return {
        schemaVersion: 1,
        kind: "pull-request-state",
        headRepositoryId: parseDecimalId(object.headRepositoryId),
        headRef: parseGitRef(object.headRef, "PR headRef"),
        headSha: parseSha(object.headSha),
        baseRepositoryId: parseDecimalId(object.baseRepositoryId),
        baseRef: parseGitRef(object.baseRef, "PR baseRef"),
        draft: object.draft,
        state: object.state,
        merged: object.merged,
        bodyDigest: parseDigest(object.bodyDigest),
      };
    }
    if (object.kind === "issue-state") {
      requireExactKeys(object, ["schemaVersion", "kind", "state", "title", "bodyDigest"], "IssueState");
      if (object.schemaVersion !== 1) throw new Error("IssueState schemaVersionが不正です");
      if (object.state !== "open" && object.state !== "closed") throw new Error("issue stateが不正です");
      if (typeof object.title !== "string" || object.title.length === 0) throw new Error("issue titleが必要です");
      return {
        schemaVersion: 1,
        kind: "issue-state",
        state: object.state,
        title: object.title,
        bodyDigest: parseDigest(object.bodyDigest),
      };
    }
    throw new Error("resource value kindが不正です");
  },
};

function valueDigest(value: ResourceValue): string {
  const bytes = encodeCanonicalJson(resourceValueSchema, value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function createPresentResourceState(value: unknown): PresentResourceState {
  const parsed = resourceValueSchema.parse(value);
  return { state: "present", value: parsed, digest: valueDigest(parsed) };
}

export function parseResourceState(value: unknown): ResourceState {
  const object = parseObject(value, "resource state");
  if (object.state === "absent") {
    requireExactKeys(object, ["state"], "absent resource state");
    return { state: "absent" };
  }
  if (object.state !== "present") throw new Error("resource state discriminatorが不正です");
  requireExactKeys(object, ["state", "value", "digest"], "present resource state");
  const present = createPresentResourceState(object.value);
  if (parseDigest(object.digest) !== present.digest) throw new Error("resource state digestが不正です");
  return present;
}

export function parseResourceKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new Error("resource keyが不正です");
  return value;
}

export function parseSmokeResource(value: unknown): SmokeResource {
  const object = parseObject(value, "smoke resource");
  const key = parseResourceKey(object.key);
  if (object.kind === "branch") {
    requireExactKeys(object, ["kind", "key", "ref"], "branch resource");
    return { kind: "branch", key, ref: parseGitRef(object.ref, "branch ref") };
  }
  if (object.kind === "pull-request") {
    requireExactKeys(object, ["kind", "key", "locator"], "PR resource");
    const locator = parseObject(object.locator, "PR locator");
    if (locator.mode === "existing") {
      requireExactKeys(locator, ["mode", "number"], "existing PR locator");
      return { kind: "pull-request", key, locator: { mode: "existing", number: parsePositiveSafeInteger(locator.number) } };
    }
    if (locator.mode === "planned") {
      requireExactKeys(locator, ["mode", "headRef", "baseRef"], "planned PR locator");
      return {
        kind: "pull-request",
        key,
        locator: {
          mode: "planned",
          headRef: parseGitRef(locator.headRef, "planned PR headRef"),
          baseRef: parseGitRef(locator.baseRef, "planned PR baseRef"),
        },
      };
    }
    throw new Error("PR locator modeが不正です");
  }
  if (object.kind === "issue") {
    requireExactKeys(object, ["kind", "key", "locator"], "issue resource");
    const locator = parseObject(object.locator, "issue locator");
    if (locator.mode === "existing") {
      requireExactKeys(locator, ["mode", "number"], "existing issue locator");
      return { kind: "issue", key, locator: { mode: "existing", number: parsePositiveSafeInteger(locator.number) } };
    }
    if (locator.mode === "planned") {
      requireExactKeys(locator, ["mode", "title", "markerVersion"], "planned issue locator");
      if (locator.title !== "Skill update automation requires attention" || locator.markerVersion !== 1) {
        throw new Error("planned issue identityが不正です");
      }
      return {
        kind: "issue",
        key,
        locator: { mode: "planned", title: locator.title, markerVersion: 1 },
      };
    }
    throw new Error("issue locator modeが不正です");
  }
  throw new Error("smoke resource kindが不正です");
}

export function assertResourceStateIdentity(resource: SmokeResource, state: ResourceState): void {
  if (state.state === "absent") return;
  if (resource.kind === "branch") {
    if (state.value.kind !== "branch-state" || state.value.ref !== resource.ref) {
      throw new Error("branch descriptorとnormalized stateが一致しません");
    }
    return;
  }
  if (resource.kind === "pull-request") {
    if (state.value.kind !== "pull-request-state") throw new Error("PR descriptorとnormalized state kindが一致しません");
    if (resource.locator.mode === "planned" &&
      (state.value.headRef !== resource.locator.headRef || state.value.baseRef !== resource.locator.baseRef)) {
      throw new Error("planned PR descriptorとnormalized stateが一致しません");
    }
    return;
  }
  if (state.value.kind !== "issue-state") throw new Error("issue descriptorとnormalized state kindが一致しません");
  if (resource.locator.mode === "planned" && state.value.title !== resource.locator.title) {
    throw new Error("planned issue descriptorとnormalized stateが一致しません");
  }
}

export function canonicalSmokeIdentity(value: unknown): string {
  return JSON.stringify(value);
}
