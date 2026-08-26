import { createHash } from "node:crypto";

import { decodeCanonicalJson, encodeCanonicalJson, type ExactSchema } from "./canonical-json.ts";
import {
  parseDecimalId,
  parseDigest,
  parseGeneration,
  parseObject,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseRunRef,
  parseUtcTimestamp,
  requireExactKeys,
  type RunRef,
} from "./validation.ts";

export const managedIssueTitle = "Skill update automation requires attention";
export const issueMarkerStart = "<!-- skill-update-pr-automation:issue:v1:start -->";
export const issueMarkerEnd = "<!-- skill-update-pr-automation:issue:v1:end -->";
export const issueRootV2MarkerStart = "<!-- skill-update-pr-automation:issue-root:v2:start -->";
export const issueRootV2MarkerEnd = "<!-- skill-update-pr-automation:issue-root:v2:end -->";

export type IssueRootV2 = Readonly<{
  schemaVersion: 2;
  kind: "managed-issue-root";
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  rootOperationId: string;
  initialSnapshotDigest: string;
}>;

const issueRootV2Schema: ExactSchema<IssueRootV2> = {
  parse(value: unknown): IssueRootV2 {
    const object = parseObject(value, "IssueRootV2");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "creatorUserId", "rootOperationId", "initialSnapshotDigest",
    ], "IssueRootV2");
    if (object.schemaVersion !== 2 || object.kind !== "managed-issue-root") {
      throw new Error("IssueRootV2 discriminatorが不正です");
    }
    return {
      schemaVersion: 2,
      kind: "managed-issue-root",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      creatorUserId: parseDecimalId(object.creatorUserId),
      rootOperationId: parseDigest(object.rootOperationId),
      initialSnapshotDigest: parseDigest(object.initialSnapshotDigest),
    };
  },
};

export type IssueRootV2Classification =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "version-conflict" }>
  | Readonly<{ kind: "partial" }>
  | Readonly<{ kind: "strict"; root: IssueRootV2; summary: string }>;

export function renderManagedIssueRootV2(value: unknown, summary: string): string {
  if (summary.length === 0 || summary.includes("<!-- skill-update-pr-automation:")) throw new Error("issue root summaryが不正です");
  const canonical = encodeCanonicalJson(issueRootV2Schema, value).toString("utf8");
  const body = `${issueRootV2MarkerStart}\n${canonical}\n\n${summary}\n${issueRootV2MarkerEnd}`;
  if (Buffer.byteLength(body, "utf8") > 48 * 1024) throw new Error("issue root bodyが48 KiBを超えています");
  return body;
}

export function classifyIssueRootV2(title: string, body: string | null): IssueRootV2Classification {
  const text = body ?? "";
  const hasV2 = text.includes(issueRootV2MarkerStart) || text.includes(issueRootV2MarkerEnd);
  if (!hasV2) {
    if (text.includes(issueMarkerStart) || text.includes(issueMarkerEnd)) return { kind: "version-conflict" };
    return title === managedIssueTitle ? { kind: "partial" } : { kind: "none" };
  }
  if (title !== managedIssueTitle) return { kind: "partial" };
  const prefix = `${issueRootV2MarkerStart}\n`;
  const suffix = `\n${issueRootV2MarkerEnd}`;
  if (!text.startsWith(prefix) || !text.endsWith(suffix) || countOccurrences(text, issueRootV2MarkerStart) !== 1 ||
    countOccurrences(text, issueRootV2MarkerEnd) !== 1) return { kind: "partial" };
  const content = text.slice(prefix.length, -suffix.length);
  const separator = content.indexOf("\n\n");
  if (separator <= 0 || content.indexOf("\n\n", separator + 2) >= 0) return { kind: "partial" };
  const canonical = content.slice(0, separator);
  const summary = content.slice(separator + 2);
  if (canonical.includes("\n") || summary.length === 0) return { kind: "partial" };
  try {
    return { kind: "strict", root: decodeCanonicalJson(issueRootV2Schema, Buffer.from(canonical, "utf8")), summary };
  } catch {
    return { kind: "partial" };
  }
}

export type FailureState =
  | "updater-rejected"
  | "candidate-invalid"
  | "validation-failed"
  | "permission-denied"
  | "recovery-required"
  | "cleanup-failed"
  | "intervention-required"
  | "generation-conflict"
  | "open-pr-conflict"
  | "paused-closed";

export type GlobalScope = Readonly<{
  kind: "global";
  operation: "detect" | "publish-draft" | "validate" | "publish-finalize" | "cleanup" | "real-host-smoke";
}>;
export type CohortScope = Readonly<{ kind: "cohort"; cohortKey: string }>;
export type PrMember = Readonly<{ generation: number; prNumber: number }>;
export type PrScope =
  | Readonly<{ kind: "pr"; mode: "single"; generation: number; prNumber: number }>
  | Readonly<{ kind: "pr"; mode: "set"; members: readonly PrMember[] }>;
export type ResourceScope = Readonly<{
  kind: "resource";
  resourceKind: "branch" | "tracking-issue";
  identity: string;
}>;
export type CandidateScope = Readonly<{ kind: "candidate"; digest: string }>;
export type Scope = GlobalScope | CohortScope | PrScope | ResourceScope | CandidateScope;
export type Seen = Readonly<{ run: RunRef; at: string }>;
export type IssueEntry = Readonly<{
  key: string;
  state: FailureState;
  scope: Scope;
  firstSeen: Seen;
  lastSeen: Seen;
  detailDigest: string;
  summary: string;
}>;
export type IssueEnvelope = Readonly<{
  schemaVersion: 1;
  kind: "managed-issue";
  repositoryId: string;
  repository: string;
  entries: readonly IssueEntry[];
}>;

const failureStates: readonly FailureState[] = [
  "updater-rejected", "candidate-invalid", "validation-failed", "permission-denied", "recovery-required",
  "cleanup-failed", "intervention-required", "generation-conflict", "open-pr-conflict", "paused-closed",
];
const globalOperations: readonly GlobalScope["operation"][] = [
  "detect", "publish-draft", "validate", "publish-finalize", "cleanup", "real-host-smoke",
];

function parseFailureState(value: unknown): FailureState {
  if (typeof value !== "string" || !failureStates.includes(value as FailureState)) throw new Error("FailureStateが不正です");
  return value as FailureState;
}

function parseScope(value: unknown): Scope {
  const object = parseObject(value, "scope");
  if (object.kind === "global") {
    requireExactKeys(object, ["kind", "operation"], "global scope");
    if (typeof object.operation !== "string" || !globalOperations.includes(object.operation as GlobalScope["operation"])) {
      throw new Error("global operationが不正です");
    }
    return { kind: "global", operation: object.operation as GlobalScope["operation"] };
  }
  if (object.kind === "cohort") {
    requireExactKeys(object, ["kind", "cohortKey"], "cohort scope");
    if (typeof object.cohortKey !== "string" || object.cohortKey.length === 0) throw new Error("cohortKeyが必要です");
    return { kind: "cohort", cohortKey: object.cohortKey };
  }
  if (object.kind === "pr") {
    if (object.mode === "single") {
      requireExactKeys(object, ["kind", "mode", "generation", "prNumber"], "single PR scope");
      return {
        kind: "pr",
        mode: "single",
        generation: parseGeneration(object.generation),
        prNumber: parsePositiveSafeInteger(object.prNumber),
      };
    }
    if (object.mode === "set") {
      requireExactKeys(object, ["kind", "mode", "members"], "set PR scope");
      if (!Array.isArray(object.members) || object.members.length < 2) throw new Error("PR setは2件以上必要です");
      const members = object.members.map((member) => {
        const parsed = parseObject(member, "PR member");
        requireExactKeys(parsed, ["generation", "prNumber"], "PR member");
        return { generation: parseGeneration(parsed.generation), prNumber: parsePositiveSafeInteger(parsed.prNumber) };
      });
      for (let index = 1; index < members.length; index += 1) {
        const previous = members[index - 1]!;
        const current = members[index]!;
        if (previous.generation > current.generation ||
          (previous.generation === current.generation && previous.prNumber >= current.prNumber)) {
          throw new Error("PR set membersはunique generation・PR number昇順が必要です");
        }
      }
      return { kind: "pr", mode: "set", members };
    }
    throw new Error("PR scope modeが不正です");
  }
  if (object.kind === "resource") {
    requireExactKeys(object, ["kind", "resourceKind", "identity"], "resource scope");
    if (object.resourceKind === "branch") {
      if (typeof object.identity !== "string" || !/^refs\/heads\/automation\/skill-updates\/g[0-9]{6}$/.test(object.identity)) {
        throw new Error("branch resource identityが不正です");
      }
      parseGeneration(Number(object.identity.slice(-6)));
      return { kind: "resource", resourceKind: "branch", identity: object.identity };
    }
    if (object.resourceKind === "tracking-issue") {
      if (typeof object.identity !== "string" || !/^issues\/[1-9][0-9]{0,15}$/.test(object.identity)) {
        throw new Error("tracking issue identityが不正です");
      }
      const number = Number(object.identity.slice("issues/".length));
      parsePositiveSafeInteger(number);
      return { kind: "resource", resourceKind: "tracking-issue", identity: object.identity };
    }
    throw new Error("resourceKindが不正です");
  }
  if (object.kind === "candidate") {
    requireExactKeys(object, ["kind", "digest"], "candidate scope");
    return { kind: "candidate", digest: parseDigest(object.digest) };
  }
  throw new Error("scope kindが不正です");
}

function parseSeen(value: unknown, label: string): Seen {
  const object = parseObject(value, label);
  requireExactKeys(object, ["run", "at"], label);
  return { run: parseRunRef(object.run), at: parseUtcTimestamp(object.at) };
}

export function computeIssueEntryKey(stateValue: unknown, scopeValue: unknown): string {
  const state = parseFailureState(stateValue);
  const scope = parseScope(scopeValue);
  const canonical = JSON.stringify({ schemaVersion: 1, state, scope })
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function parseIssueEntry(value: unknown): IssueEntry {
  const object = parseObject(value, "IssueEntry");
  requireExactKeys(object, [
    "key", "state", "scope", "firstSeen", "lastSeen", "detailDigest", "summary",
  ], "IssueEntry");
  const state = parseFailureState(object.state);
  const scope = parseScope(object.scope);
  const key = parseDigest(object.key);
  if (key !== computeIssueEntryKey(state, scope)) throw new Error("IssueEntry keyが不正です");
  if (typeof object.summary !== "string" || object.summary.length === 0) throw new Error("IssueEntry summaryが必要です");
  return {
    key,
    state,
    scope,
    firstSeen: parseSeen(object.firstSeen, "firstSeen"),
    lastSeen: parseSeen(object.lastSeen, "lastSeen"),
    detailDigest: parseDigest(object.detailDigest),
    summary: object.summary,
  };
}

const issueEnvelopeSchema: ExactSchema<IssueEnvelope> = {
  parse(value: unknown): IssueEnvelope {
    const object = parseObject(value, "IssueEnvelope");
    requireExactKeys(object, ["schemaVersion", "kind", "repositoryId", "repository", "entries"], "IssueEnvelope");
    if (object.schemaVersion !== 1 || object.kind !== "managed-issue") throw new Error("IssueEnvelope discriminatorが不正です");
    if (!Array.isArray(object.entries)) throw new Error("IssueEnvelope entriesはarrayが必要です");
    const entries = object.entries.map(parseIssueEntry);
    for (let index = 1; index < entries.length; index += 1) {
      if (Buffer.compare(Buffer.from(entries[index - 1]!.key), Buffer.from(entries[index]!.key)) >= 0) {
        throw new Error("IssueEnvelope entriesはunique key昇順が必要です");
      }
    }
    return {
      schemaVersion: 1,
      kind: "managed-issue",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      entries,
    };
  },
};

export function encodeIssueEnvelope(value: unknown): Buffer {
  return encodeCanonicalJson(issueEnvelopeSchema, value);
}

export function decodeIssueEnvelope(bytes: Uint8Array): IssueEnvelope {
  return decodeCanonicalJson(issueEnvelopeSchema, bytes);
}

export type IssueBodyClassification =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "partial" }>
  | Readonly<{ kind: "strict"; envelope: IssueEnvelope; summary: string; markerDigest: string }>;

function countOccurrences(value: string, token: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(token, offset)) !== -1) {
    count += 1;
    offset += token.length;
  }
  return count;
}

export function renderManagedIssueSection(envelope: unknown, summary: string): string {
  if (summary.length === 0 || summary.includes(issueMarkerStart) || summary.includes(issueMarkerEnd)) {
    throw new Error("issue summaryが不正です");
  }
  const canonical = encodeIssueEnvelope(envelope).toString("utf8");
  const section = `${issueMarkerStart}\n${canonical}\n\n${summary}\n${issueMarkerEnd}`;
  if (Buffer.byteLength(section, "utf8") > 48 * 1024) throw new Error("issue managed sectionが48 KiBを超えています");
  return section;
}

export function classifyIssueBody(title: string, body: string | null): IssueBodyClassification {
  const text = body ?? "";
  const titleMatches = title === managedIssueTitle;
  const startCount = countOccurrences(text, issueMarkerStart);
  const endCount = countOccurrences(text, issueMarkerEnd);
  if (!titleMatches && startCount === 0 && endCount === 0) return { kind: "none" };
  if (!titleMatches || startCount !== 1 || endCount !== 1) return { kind: "partial" };
  const start = text.indexOf(issueMarkerStart);
  const end = text.indexOf(issueMarkerEnd);
  if (start > end) return { kind: "partial" };
  const section = text.slice(start, end + issueMarkerEnd.length);
  if (Buffer.byteLength(section, "utf8") > 48 * 1024) return { kind: "partial" };
  const framed = text.slice(start + issueMarkerStart.length, end);
  if (!framed.startsWith("\n") || !framed.endsWith("\n")) return { kind: "partial" };
  const content = framed.slice(1, -1);
  const separator = content.indexOf("\n\n");
  if (separator <= 0) return { kind: "partial" };
  const canonical = content.slice(0, separator);
  const summary = content.slice(separator + 2);
  if (canonical.includes("\n") || summary.length === 0) return { kind: "partial" };
  try {
    const envelope = decodeIssueEnvelope(Buffer.from(canonical, "utf8"));
    const markerDigest = `sha256:${createHash("sha256").update(section, "utf8").digest("hex")}`;
    return { kind: "strict", envelope, summary, markerDigest };
  } catch {
    return { kind: "partial" };
  }
}

export type FailureScopeCandidates = Readonly<{
  candidateDigest?: string;
  resource?: Readonly<{ resourceKind: "branch" | "tracking-issue"; identity: string }>;
  pr?: Readonly<
    | { mode: "single"; generation: number; prNumber: number }
    | { mode: "set"; members: readonly PrMember[] }
  >;
  cohortKey?: string;
  operation: GlobalScope["operation"];
}>;

export function selectFailureScope(candidates: FailureScopeCandidates): Scope {
  if (candidates.candidateDigest !== undefined) {
    return parseScope({ kind: "candidate", digest: candidates.candidateDigest });
  }
  if (candidates.resource !== undefined) {
    return parseScope({ kind: "resource", ...candidates.resource });
  }
  if (candidates.pr !== undefined) {
    return parseScope({ kind: "pr", ...candidates.pr });
  }
  if (candidates.cohortKey !== undefined) {
    return parseScope({ kind: "cohort", cohortKey: candidates.cohortKey });
  }
  return parseScope({ kind: "global", operation: candidates.operation });
}

export type IssueEntryObservation = Readonly<{
  state: FailureState;
  scope: Scope;
  seen: Seen;
  detailDigest: string;
  summary: string;
}>;

export function upsertIssueEntry(
  currentEntries: readonly IssueEntry[],
  observation: IssueEntryObservation,
): readonly IssueEntry[] {
  const state = parseFailureState(observation.state);
  const scope = parseScope(observation.scope);
  const seen = parseSeen(observation.seen, "seen");
  const detailDigest = parseDigest(observation.detailDigest);
  if (typeof observation.summary !== "string" || observation.summary.length === 0) throw new Error("summaryが必要です");
  const key = computeIssueEntryKey(state, scope);
  const existing = currentEntries.map(parseIssueEntry).find((entry) => entry.key === key);
  const replacement: IssueEntry = {
    key,
    state,
    scope,
    firstSeen: existing?.firstSeen ?? seen,
    lastSeen: seen,
    detailDigest,
    summary: observation.summary,
  };
  return [...currentEntries.filter((entry) => entry.key !== key), replacement]
    .map(parseIssueEntry)
    .sort((left, right) => Buffer.compare(Buffer.from(left.key), Buffer.from(right.key)));
}
