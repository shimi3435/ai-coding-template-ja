import { createHash } from "node:crypto";

import { decodeCanonicalJson, encodeCanonicalJson, type ExactSchema } from "./canonical-json.ts";
import {
  parseDecimalId,
  parseDigest,
  parseObject,
  parsePositiveSafeInteger,
  requireExactKeys,
} from "./validation.ts";

export const journalMarkerStart = "<!-- skill-update-pr-automation:journal:v2:start -->";
export const journalMarkerEnd = "<!-- skill-update-pr-automation:journal:v2:end -->";

export type JournalResourceKind = "pull-request" | "issue";
export type JournalPhase = "prepared" | "committed";
export type JournalOperation =
  | "root"
  | "branch-append"
  | "pr-draft"
  | "pr-ready"
  | "validation"
  | "failure"
  | "cleanup";

export type FullSnapshotV2 = Readonly<{
  kind: "full-snapshot";
  state: string;
  stateDigest: string;
}>;

export type JournalEntryV2Input = Readonly<{
  schemaVersion: 2;
  resourceKind: JournalResourceKind;
  resourceNumber: number;
  creatorUserId: string;
  sequence: number;
  previousDigest: string | null;
  phase: JournalPhase;
  operation: JournalOperation;
  operationId: string;
  snapshot: FullSnapshotV2;
}>;

export type JournalEntryV2 = JournalEntryV2Input & Readonly<{ digest: string }>;

export type JournalCommentV2 = Readonly<{
  id: string;
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
  body: string;
}>;

export type ReducedJournalV2 = Readonly<{
  entries: readonly JournalEntryV2[];
  pending: JournalEntryV2 | null;
  snapshot: FullSnapshotV2 | null;
}>;

const resourceKinds: readonly JournalResourceKind[] = ["pull-request", "issue"];
const phases: readonly JournalPhase[] = ["prepared", "committed"];
const operations: readonly JournalOperation[] = [
  "root", "branch-append", "pr-draft", "pr-ready", "validation", "failure", "cleanup",
];
const preparedOperations: readonly JournalOperation[] = ["branch-append", "pr-draft", "pr-ready"];

function digestBytes(value: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function escapeHtmlSensitiveCharacters(json: string): string {
  return json.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

function parseCanonicalState(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 48 * 1024) {
    throw new Error("journal full snapshot stateが不正です");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("journal full snapshot stateがJSONではありません");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ||
    escapeHtmlSensitiveCharacters(JSON.stringify(parsed)) !== value) {
    throw new Error("journal full snapshot stateがcanonical objectではありません");
  }
  return value;
}

function parseSnapshot(value: unknown, allowEmptyDigest = false): FullSnapshotV2 {
  const object = parseObject(value, "journal full snapshot");
  requireExactKeys(object, ["kind", "state", "stateDigest"], "journal full snapshot");
  if (object.kind !== "full-snapshot") throw new Error("journal snapshot kindが不正です");
  const state = parseCanonicalState(object.state);
  const expected = digestBytes(state);
  if (allowEmptyDigest && object.stateDigest === "") return { kind: "full-snapshot", state, stateDigest: expected };
  if (parseDigest(object.stateDigest) !== expected) throw new Error("journal snapshot digestが不正です");
  return { kind: "full-snapshot", state, stateDigest: expected };
}

function parseEntryInput(value: unknown, allowEmptySnapshotDigest = false): JournalEntryV2Input {
  const object = parseObject(value, "JournalEntryV2 input");
  requireExactKeys(object, [
    "schemaVersion", "resourceKind", "resourceNumber", "creatorUserId", "sequence", "previousDigest",
    "phase", "operation", "operationId", "snapshot",
  ], "JournalEntryV2 input");
  if (object.schemaVersion !== 2 || typeof object.resourceKind !== "string" ||
    !resourceKinds.includes(object.resourceKind as JournalResourceKind)) {
    throw new Error("JournalEntryV2 resource discriminatorが不正です");
  }
  if (typeof object.phase !== "string" || !phases.includes(object.phase as JournalPhase) ||
    typeof object.operation !== "string" || !operations.includes(object.operation as JournalOperation)) {
    throw new Error("JournalEntryV2 phase / operationが不正です");
  }
  const phase = object.phase as JournalPhase;
  const operation = object.operation as JournalOperation;
  if (phase === "prepared" && !preparedOperations.includes(operation)) {
    throw new Error("prepared operationが不正です");
  }
  return {
    schemaVersion: 2,
    resourceKind: object.resourceKind as JournalResourceKind,
    resourceNumber: parsePositiveSafeInteger(object.resourceNumber),
    creatorUserId: parseDecimalId(object.creatorUserId),
    sequence: parsePositiveSafeInteger(object.sequence),
    previousDigest: object.previousDigest === null ? null : parseDigest(object.previousDigest),
    phase,
    operation,
    operationId: parseDigest(object.operationId),
    snapshot: parseSnapshot(object.snapshot, allowEmptySnapshotDigest),
  };
}

const journalEntryInputSchema: ExactSchema<JournalEntryV2Input> = {
  parse: (value: unknown) => parseEntryInput(value),
};

const journalEntrySchema: ExactSchema<JournalEntryV2> = {
  parse(value: unknown): JournalEntryV2 {
    const object = parseObject(value, "JournalEntryV2");
    requireExactKeys(object, [
      "schemaVersion", "resourceKind", "resourceNumber", "creatorUserId", "sequence", "previousDigest",
      "phase", "operation", "operationId", "snapshot", "digest",
    ], "JournalEntryV2");
    const input = parseEntryInput({
      schemaVersion: object.schemaVersion,
      resourceKind: object.resourceKind,
      resourceNumber: object.resourceNumber,
      creatorUserId: object.creatorUserId,
      sequence: object.sequence,
      previousDigest: object.previousDigest,
      phase: object.phase,
      operation: object.operation,
      operationId: object.operationId,
      snapshot: object.snapshot,
    });
    const digest = parseDigest(object.digest);
    if (digest !== digestBytes(encodeCanonicalJson(journalEntryInputSchema, input))) {
      throw new Error("JournalEntryV2 digestが不正です");
    }
    return { ...input, digest };
  },
};

export function appendJournalEntryDigest(value: JournalEntryV2Input): JournalEntryV2 {
  const input = parseEntryInput(value, true);
  return { ...input, digest: digestBytes(encodeCanonicalJson(journalEntryInputSchema, input)) };
}

export function encodeJournalEntryV2(value: unknown): Buffer {
  return encodeCanonicalJson(journalEntrySchema, value);
}

export function decodeJournalEntryV2(bytes: Uint8Array): JournalEntryV2 {
  return decodeCanonicalJson(journalEntrySchema, bytes);
}

export function journalCommentBody(value: unknown): string {
  const canonical = encodeJournalEntryV2(value).toString("utf8");
  return `${journalMarkerStart}\n${canonical}\n${journalMarkerEnd}`;
}

function parseMarker(body: string): JournalEntryV2 | null {
  const hasStart = body.includes(journalMarkerStart);
  const hasEnd = body.includes(journalMarkerEnd);
  if (!hasStart && !hasEnd) return null;
  const prefix = `${journalMarkerStart}\n`;
  const suffix = `\n${journalMarkerEnd}`;
  if (!body.startsWith(prefix) || !body.endsWith(suffix) ||
    body.indexOf(journalMarkerStart, prefix.length) >= 0 ||
    body.indexOf(journalMarkerEnd) !== body.length - journalMarkerEnd.length) {
    throw new Error("journal markerが不正です");
  }
  try {
    return decodeJournalEntryV2(Buffer.from(body.slice(prefix.length, -suffix.length), "utf8"));
  } catch (error: unknown) {
    throw new Error(`journal markerが不正です: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validGithubTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function reduceJournalCommentsV2(comments: readonly JournalCommentV2[], creatorUserIdValue: string): ReducedJournalV2 {
  const creatorUserId = parseDecimalId(creatorUserIdValue);
  const sorted = [...comments].sort((left, right) => {
    const leftId = BigInt(parseDecimalId(left.id));
    const rightId = BigInt(parseDecimalId(right.id));
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  const entries: JournalEntryV2[] = [];
  const commentIds = new Set<string>();
  let pending: JournalEntryV2 | null = null;
  for (const comment of sorted) {
    const id = parseDecimalId(comment.id);
    if (commentIds.has(id)) throw new Error("journal comment IDが重複しています");
    commentIds.add(id);
    const entry = parseMarker(comment.body);
    if (entry === null) continue;
    if (parseDecimalId(comment.authorUserId) !== creatorUserId || entry.creatorUserId !== creatorUserId) {
      throw new Error("journal marker authorがroot creatorと一致しません");
    }
    if (!validGithubTimestamp(comment.createdAt) || !validGithubTimestamp(comment.updatedAt) ||
      comment.createdAt !== comment.updatedAt) {
      throw new Error("journal commentがeditedまたはtimestamp不正です");
    }
    const expectedSequence = entries.length + 1;
    const previous = entries.at(-1);
    if (entry.sequence !== expectedSequence || entry.previousDigest !== (previous?.digest ?? null)) {
      throw new Error("journal sequence / previous digestが不正です");
    }
    if (entries.length === 0 && (entry.phase !== "committed" || entry.operation !== "root")) {
      throw new Error("journal root entryが不正です");
    }
    if (pending !== null) {
      if (entry.phase !== "committed" || entry.operation !== pending.operation || entry.operationId !== pending.operationId) {
        throw new Error("journal prepared entryに対応するcommitted entryがありません");
      }
      pending = null;
    } else if (entry.phase === "prepared") {
      pending = entry;
    } else if (entry.operation !== "root" && preparedOperations.includes(entry.operation)) {
      throw new Error("journal transition committed entryにprepared entryがありません");
    }
    entries.push(entry);
  }
  return { entries, pending, snapshot: entries.at(-1)?.snapshot ?? null };
}
