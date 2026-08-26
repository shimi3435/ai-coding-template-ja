import { createHash } from "node:crypto";

import { decodeCanonicalJson, encodeCanonicalJson, type ExactSchema } from "./canonical-json.ts";
import {
  parseDecimalId,
  parseDigest,
  parseGeneration,
  parseObject,
  parseRepositoryFullName,
  parseRunRef,
  parseSha,
  requireExactKeys,
  type RunRef,
} from "./validation.ts";

export type PendingValidation = Readonly<{ status: "pending"; run: RunRef }>;
export type PassedValidation = Readonly<{ status: "passed"; run: RunRef }>;
export type CommandFailureValidation = Readonly<{
  status: "failed";
  run: RunRef;
  failureKind: "command";
  command: string;
}>;
export type InfrastructureFailureValidation = Readonly<{
  status: "failed";
  run: RunRef;
  failureKind: "infrastructure";
  stage: "checkout" | "artifact" | "runner" | "timeout" | "cancelled" | "unknown";
}>;
export type ValidationState = PendingValidation | PassedValidation | CommandFailureValidation | InfrastructureFailureValidation;

export type PrEnvelope = Readonly<{
  schemaVersion: 1;
  kind: "managed-pr";
  repositoryId: string;
  repository: string;
  generation: number;
  headRef: string;
  baseRef: string;
  expectedHeadSha: string;
  validationBaseSha: string;
  candidateDigest: string;
  reportDigest: string;
  validation: ValidationState;
}>;

export const managedPrTitle = "chore(skills): update vendored skills";
export const prMarkerStart = "<!-- skill-update-pr-automation:pr:v1:start -->";
export const prMarkerEnd = "<!-- skill-update-pr-automation:pr:v1:end -->";
export const prRootV2MarkerStart = "<!-- skill-update-pr-automation:pr-root:v2:start -->";
export const prRootV2MarkerEnd = "<!-- skill-update-pr-automation:pr-root:v2:end -->";

export type PrRootV2 = Readonly<{
  schemaVersion: 2;
  kind: "managed-pr-root";
  repositoryId: string;
  repository: string;
  creatorUserId: string;
  generation: number;
  headRef: string;
  baseRef: string;
  candidateDigest: string;
  initialSnapshotDigest: string;
}>;

const prRootV2Schema: ExactSchema<PrRootV2> = {
  parse(value: unknown): PrRootV2 {
    const object = parseObject(value, "PrRootV2");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "creatorUserId", "generation", "headRef", "baseRef",
      "candidateDigest", "initialSnapshotDigest",
    ], "PrRootV2");
    if (object.schemaVersion !== 2 || object.kind !== "managed-pr-root") throw new Error("PrRootV2 discriminatorが不正です");
    const generation = parseGeneration(object.generation);
    const headRef = `refs/heads/automation/skill-updates/g${String(generation).padStart(6, "0")}`;
    if (object.headRef !== headRef) throw new Error("PrRootV2 headRefとgenerationが一致しません");
    return {
      schemaVersion: 2,
      kind: "managed-pr-root",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      creatorUserId: parseDecimalId(object.creatorUserId),
      generation,
      headRef,
      baseRef: parseBaseRef(object.baseRef),
      candidateDigest: parseDigest(object.candidateDigest),
      initialSnapshotDigest: parseDigest(object.initialSnapshotDigest),
    };
  },
};

export function encodePrRootV2(value: unknown): Buffer {
  return encodeCanonicalJson(prRootV2Schema, value);
}

export function decodePrRootV2(bytes: Uint8Array): PrRootV2 {
  return decodeCanonicalJson(prRootV2Schema, bytes);
}

export type PrRootV2Classification =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "version-conflict" }>
  | Readonly<{ kind: "partial" }>
  | Readonly<{ kind: "strict"; root: PrRootV2; summary: string }>;

export function renderManagedPrRootV2(value: unknown, summary: string): string {
  if (summary.length === 0 || summary.includes("<!-- skill-update-pr-automation:")) throw new Error("PR root summaryが不正です");
  const canonical = encodePrRootV2(value).toString("utf8");
  const body = `${prRootV2MarkerStart}\n${canonical}\n\n${summary}\n${prRootV2MarkerEnd}`;
  if (Buffer.byteLength(body, "utf8") > 48 * 1024) throw new Error("PR root bodyが48 KiBを超えています");
  return body;
}

export function classifyPrRootV2(body: string | null): PrRootV2Classification {
  const text = body ?? "";
  const hasV2 = text.includes(prRootV2MarkerStart) || text.includes(prRootV2MarkerEnd);
  if (!hasV2) {
    return text.includes(prMarkerStart) || text.includes(prMarkerEnd) ? { kind: "version-conflict" } : { kind: "none" };
  }
  const prefix = `${prRootV2MarkerStart}\n`;
  const suffix = `\n${prRootV2MarkerEnd}`;
  if (!text.startsWith(prefix) || !text.endsWith(suffix) || countOccurrences(text, prRootV2MarkerStart) !== 1 ||
    countOccurrences(text, prRootV2MarkerEnd) !== 1) return { kind: "partial" };
  const content = text.slice(prefix.length, -suffix.length);
  const separator = content.indexOf("\n\n");
  if (separator <= 0 || content.indexOf("\n\n", separator + 2) >= 0) return { kind: "partial" };
  const canonical = content.slice(0, separator);
  const summary = content.slice(separator + 2);
  if (canonical.includes("\n") || summary.length === 0) return { kind: "partial" };
  try {
    return { kind: "strict", root: decodePrRootV2(Buffer.from(canonical, "utf8")), summary };
  } catch {
    return { kind: "partial" };
  }
}

function parsePendingValidation(value: unknown): PendingValidation {
  const object = parseObject(value, "pending validation");
  requireExactKeys(object, ["status", "run"], "pending validation");
  if (object.status !== "pending") throw new Error("validation statusが不正です");
  return { status: "pending", run: parseRunRef(object.run) };
}

function parseValidation(value: unknown): ValidationState {
  const object = parseObject(value, "validation");
  if (object.status === "pending") return parsePendingValidation(value);
  if (object.status === "passed") {
    requireExactKeys(object, ["status", "run"], "passed validation");
    return { status: "passed", run: parseRunRef(object.run) };
  }
  if (object.status !== "failed") throw new Error("validation statusが不正です");
  if (object.failureKind === "command") {
    requireExactKeys(object, ["status", "run", "failureKind", "command"], "command failure validation");
    if (typeof object.command !== "string" || object.command.length === 0) throw new Error("failed commandが必要です");
    return { status: "failed", run: parseRunRef(object.run), failureKind: "command", command: object.command };
  }
  if (object.failureKind === "infrastructure") {
    requireExactKeys(object, ["status", "run", "failureKind", "stage"], "infrastructure failure validation");
    const stages = ["checkout", "artifact", "runner", "timeout", "cancelled", "unknown"] as const;
    if (typeof object.stage !== "string" || !stages.includes(object.stage as (typeof stages)[number])) {
      throw new Error("infrastructure stageが不正です");
    }
    return {
      status: "failed",
      run: parseRunRef(object.run),
      failureKind: "infrastructure",
      stage: object.stage as (typeof stages)[number],
    };
  }
  throw new Error("validation failureKindが不正です");
}

function parseBaseRef(value: unknown): string {
  if (typeof value !== "string" || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new Error("baseRefが不正です");
  }
  return value;
}

const prEnvelopeSchema: ExactSchema<PrEnvelope> = {
  parse(value: unknown): PrEnvelope {
    const object = parseObject(value, "PrEnvelope");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "generation", "headRef", "baseRef",
      "expectedHeadSha", "validationBaseSha", "candidateDigest", "reportDigest", "validation",
    ], "PrEnvelope");
    if (object.schemaVersion !== 1 || object.kind !== "managed-pr") throw new Error("PrEnvelope discriminatorが不正です");
    const generation = parseGeneration(object.generation);
    const headRef = `refs/heads/automation/skill-updates/g${String(generation).padStart(6, "0")}`;
    if (object.headRef !== headRef) throw new Error("PrEnvelope headRefとgenerationが一致しません");
    return {
      schemaVersion: 1,
      kind: "managed-pr",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      generation,
      headRef,
      baseRef: parseBaseRef(object.baseRef),
      expectedHeadSha: parseSha(object.expectedHeadSha),
      validationBaseSha: parseSha(object.validationBaseSha),
      candidateDigest: parseDigest(object.candidateDigest),
      reportDigest: parseDigest(object.reportDigest),
      validation: parseValidation(object.validation),
    };
  },
};

export function encodePrEnvelope(value: unknown): Buffer {
  return encodeCanonicalJson(prEnvelopeSchema, value);
}

export function decodePrEnvelope(bytes: Uint8Array): PrEnvelope {
  return decodeCanonicalJson(prEnvelopeSchema, bytes);
}

export type PrBodyClassification =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "partial" }>
  | Readonly<{ kind: "strict"; envelope: PrEnvelope; summary: string; markerDigest: string }>;

function countOccurrences(value: string, token: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(token, offset)) !== -1) {
    count += 1;
    offset += token.length;
  }
  return count;
}

function digestBytes(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function renderManagedPrSection(envelope: unknown, summary: string): string {
  if (summary.length === 0 || summary.includes(prMarkerStart) || summary.includes(prMarkerEnd)) {
    throw new Error("PR summaryが不正です");
  }
  const canonical = encodePrEnvelope(envelope).toString("utf8");
  const section = `${prMarkerStart}\n${canonical}\n\n${summary}\n${prMarkerEnd}`;
  if (Buffer.byteLength(section, "utf8") > 48 * 1024) throw new Error("PR managed sectionが48 KiBを超えています");
  return section;
}

export function classifyPrBody(body: string | null, draft: boolean): PrBodyClassification {
  const text = body ?? "";
  const startCount = countOccurrences(text, prMarkerStart);
  const endCount = countOccurrences(text, prMarkerEnd);
  if (startCount === 0 && endCount === 0) return { kind: "none" };
  if (startCount !== 1 || endCount !== 1) return { kind: "partial" };
  const start = text.indexOf(prMarkerStart);
  const end = text.indexOf(prMarkerEnd);
  if (start > end) return { kind: "partial" };
  const section = text.slice(start, end + prMarkerEnd.length);
  if (Buffer.byteLength(section, "utf8") > 48 * 1024) return { kind: "partial" };
  const framed = text.slice(start + prMarkerStart.length, end);
  if (!framed.startsWith("\n") || !framed.endsWith("\n")) return { kind: "partial" };
  const content = framed.slice(1, -1);
  const separator = content.indexOf("\n\n");
  if (separator <= 0) return { kind: "partial" };
  const canonical = content.slice(0, separator);
  const summary = content.slice(separator + 2);
  if (canonical.includes("\n") || summary.length === 0) return { kind: "partial" };
  try {
    const envelope = decodePrEnvelope(Buffer.from(canonical, "utf8"));
    const status = envelope.validation.status;
    if ((draft && status === "passed") || (!draft && status !== "passed")) return { kind: "partial" };
    return { kind: "strict", envelope, summary, markerDigest: digestBytes(Buffer.from(section, "utf8")) };
  } catch {
    return { kind: "partial" };
  }
}
