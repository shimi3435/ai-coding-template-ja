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
  parseSha,
  parseUtcTimestamp,
  requireExactKeys,
  type RunRef,
} from "./validation.ts";

export type ArtifactFile = Readonly<{ name: string; byteLength: number; digest: string }>;

export type CreatePublishTarget = Readonly<{
  mode: "create";
  generation: number;
  headRef: string;
  expectedBranch: Readonly<{ state: "absent" }>;
  historyDigest: string;
}>;

export type UpdatePublishTarget = Readonly<{
  mode: "update";
  generation: number;
  prNumber: number;
  headRef: string;
  expectedBranch: Readonly<{ state: "present"; sha: string }>;
  markerDigest: string;
  historyDigest: string;
}>;

export type ValidatePublishTarget = Readonly<{
  mode: "validate";
  generation: number;
  prNumber: number;
  headRef: string;
  expectedBranch: Readonly<{ state: "present"; sha: string }>;
  markerDigest: string;
  historyDigest: string;
}>;

export type CandidateUpdateManifest = Readonly<{
  schemaVersion: 1;
  kind: "candidate-update";
  repositoryId: string;
  repository: string;
  run: RunRef;
  triggerSha: string;
  baseHeadSha: string;
  candidateSha: string;
  candidateTreeSha: string;
  target: CreatePublishTarget | UpdatePublishTarget;
  candidateDigest: string;
  createdAt: string;
  files: readonly [ArtifactFile, ArtifactFile, ArtifactFile];
}>;

export type ExistingHeadValidationManifest = Readonly<{
  schemaVersion: 1;
  kind: "existing-head-validation";
  repositoryId: string;
  repository: string;
  run: RunRef;
  triggerSha: string;
  baseHeadSha: string;
  candidateSha: string;
  candidateTreeSha: string;
  target: ValidatePublishTarget;
  candidateDigest: string;
  createdAt: string;
  files: readonly [ArtifactFile];
}>;

export type NoOpManifest = Readonly<{
  schemaVersion: 1;
  kind: "no-op";
  repositoryId: string;
  repository: string;
  run: RunRef;
  triggerSha: string;
  baseHeadSha: string;
  target: Readonly<{ mode: "none"; historyDigest: string }>;
  createdAt: string;
  files: readonly [ArtifactFile];
}>;

export const recoveryModes = [
  "commentless-root",
  "prepared-branch-append",
  "prepared-pr-draft",
  "prepared-pr-ready",
  "stale-validation",
] as const;

export type RecoveryMode = (typeof recoveryModes)[number];

export type RecoveryTarget = Readonly<{
  mode: RecoveryMode;
  generation: number;
  prNumber: number;
  creatorUserId: string;
  headRef: string;
  beforeHeadSha: string;
  afterHeadSha: string;
  rootDigest: string;
  journalDigest: string;
  operationId: string;
  beforeSnapshotDigest: string;
  afterSnapshotDigest: string;
  candidateDigest: string;
  reportDigest: string;
  originRun: RunRef;
}>;

export type RecoveryManifest = Readonly<{
  schemaVersion: 1;
  kind: "recovery";
  repositoryId: string;
  repository: string;
  run: RunRef;
  triggerSha: string;
  baseHeadSha: string;
  target: RecoveryTarget;
  createdAt: string;
  files: readonly [];
}>;

export type ArtifactManifest = CandidateUpdateManifest | ExistingHeadValidationManifest | NoOpManifest | RecoveryManifest;

export type DraftReceipt = Readonly<{
  schemaVersion: 1;
  kind: "published-draft";
  repositoryId: string;
  repository: string;
  run: RunRef;
  manifestDigest: string;
  candidateDigest: string;
  generation: number;
  prNumber: number;
  headRef: string;
  headSha: string;
  markerDigest: string;
  historyDigest: string;
  createdAt: string;
}>;

function parseArtifactFile(value: unknown): ArtifactFile {
  const object = parseObject(value, "artifact file");
  requireExactKeys(object, ["name", "byteLength", "digest"], "artifact file");
  if (typeof object.name !== "string" || object.name.length === 0) throw new Error("artifact file nameが不正です");
  return {
    name: object.name,
    byteLength: parsePositiveSafeInteger(object.byteLength),
    digest: parseDigest(object.digest),
  };
}

function parseCreateTarget(value: unknown): CreatePublishTarget {
  const object = parseObject(value, "create target");
  requireExactKeys(object, ["mode", "generation", "headRef", "expectedBranch", "historyDigest"], "create target");
  if (object.mode !== "create") throw new Error("create target modeが不正です");
  const generation = parseGeneration(object.generation);
  const headRef = `refs/heads/automation/skill-updates/g${String(generation).padStart(6, "0")}`;
  if (object.headRef !== headRef) throw new Error("create target headRefとgenerationが一致しません");
  const expectedBranch = parseObject(object.expectedBranch, "expected branch");
  requireExactKeys(expectedBranch, ["state"], "expected branch");
  if (expectedBranch.state !== "absent") throw new Error("create targetはabsent branchが必要です");
  return {
    mode: "create",
    generation,
    headRef,
    expectedBranch: { state: "absent" },
    historyDigest: parseDigest(object.historyDigest),
  };
}

function expectedManagedHeadRef(generation: number): string {
  return `refs/heads/automation/skill-updates/g${String(generation).padStart(6, "0")}`;
}

function parseUpdateTarget(value: unknown, baseHeadSha: string): UpdatePublishTarget {
  const object = parseObject(value, "update target");
  requireExactKeys(object, [
    "mode", "generation", "prNumber", "headRef", "expectedBranch", "markerDigest", "historyDigest",
  ], "update target");
  if (object.mode !== "update") throw new Error("update target modeが不正です");
  const generation = parseGeneration(object.generation);
  const headRef = expectedManagedHeadRef(generation);
  if (object.headRef !== headRef) throw new Error("update target headRefとgenerationが一致しません");
  const expectedBranch = parseObject(object.expectedBranch, "expected branch");
  requireExactKeys(expectedBranch, ["state", "sha"], "expected branch");
  if (expectedBranch.state !== "present") throw new Error("update targetはpresent branchが必要です");
  const expectedSha = parseSha(expectedBranch.sha);
  if (expectedSha !== baseHeadSha) throw new Error("update target branch SHAとbaseHeadShaが一致しません");
  return {
    mode: "update",
    generation,
    prNumber: parsePositiveSafeInteger(object.prNumber),
    headRef,
    expectedBranch: { state: "present", sha: expectedSha },
    markerDigest: parseDigest(object.markerDigest),
    historyDigest: parseDigest(object.historyDigest),
  };
}

function parseCandidateTarget(value: unknown, baseHeadSha: string): CreatePublishTarget | UpdatePublishTarget {
  const object = parseObject(value, "publish target");
  if (object.mode === "create") return parseCreateTarget(value);
  if (object.mode === "update") return parseUpdateTarget(value, baseHeadSha);
  throw new Error("candidate-update target modeが不正です");
}

function parseValidateTarget(value: unknown, exactHeadSha: string): ValidatePublishTarget {
  const object = parseObject(value, "validate target");
  requireExactKeys(object, [
    "mode", "generation", "prNumber", "headRef", "expectedBranch", "markerDigest", "historyDigest",
  ], "validate target");
  if (object.mode !== "validate") throw new Error("validate target modeが不正です");
  const generation = parseGeneration(object.generation);
  const headRef = expectedManagedHeadRef(generation);
  if (object.headRef !== headRef) throw new Error("validate target headRefとgenerationが一致しません");
  const expectedBranch = parseObject(object.expectedBranch, "expected branch");
  requireExactKeys(expectedBranch, ["state", "sha"], "expected branch");
  if (expectedBranch.state !== "present") throw new Error("validate targetはpresent branchが必要です");
  const expectedSha = parseSha(expectedBranch.sha);
  if (expectedSha !== exactHeadSha) throw new Error("validate target branch SHAがexact headと一致しません");
  return {
    mode: "validate",
    generation,
    prNumber: parsePositiveSafeInteger(object.prNumber),
    headRef,
    expectedBranch: { state: "present", sha: expectedSha },
    markerDigest: parseDigest(object.markerDigest),
    historyDigest: parseDigest(object.historyDigest),
  };
}

export function computeCandidateDigest(input: Readonly<{
  baseHeadSha: string;
  candidateTreeSha: string;
  applyReportDigest: string;
}>): string {
  const canonical = JSON.stringify({
    schemaVersion: 1,
    baseHeadSha: parseSha(input.baseHeadSha),
    candidateTreeSha: parseSha(input.candidateTreeSha),
    applyReportDigest: parseDigest(input.applyReportDigest),
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

const candidateUpdateManifestSchema: ExactSchema<CandidateUpdateManifest> = {
  parse(value: unknown): CandidateUpdateManifest {
    const object = parseObject(value, "candidate-update manifest");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "run", "triggerSha", "baseHeadSha",
      "candidateSha", "candidateTreeSha", "target", "candidateDigest", "createdAt", "files",
    ], "candidate-update manifest");
    if (object.schemaVersion !== 1 || object.kind !== "candidate-update") {
      throw new Error("candidate-update manifest discriminatorが不正です");
    }
    if (!Array.isArray(object.files) || object.files.length !== 3) throw new Error("candidate-update filesは3件必要です");
    const files = object.files.map(parseArtifactFile);
    const expectedNames = ["apply-report.json", "candidate.bundle", "preview-report.json"];
    if (files.some((file, index) => file.name !== expectedNames[index])) {
      throw new Error("candidate-update filesの集合または順序が不正です");
    }
    const baseHeadSha = parseSha(object.baseHeadSha);
    const candidateTreeSha = parseSha(object.candidateTreeSha);
    const candidateDigest = parseDigest(object.candidateDigest);
    const expectedCandidateDigest = computeCandidateDigest({
      baseHeadSha,
      candidateTreeSha,
      applyReportDigest: files[0]!.digest,
    });
    if (candidateDigest !== expectedCandidateDigest) throw new Error("candidateDigestが不正です");
    return {
      schemaVersion: 1,
      kind: "candidate-update",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      run: parseRunRef(object.run),
      triggerSha: parseSha(object.triggerSha),
      baseHeadSha,
      candidateSha: parseSha(object.candidateSha),
      candidateTreeSha,
      target: parseCandidateTarget(object.target, baseHeadSha),
      candidateDigest,
      createdAt: parseUtcTimestamp(object.createdAt),
      files: [files[0]!, files[1]!, files[2]!],
    };
  },
};

const existingHeadValidationManifestSchema: ExactSchema<ExistingHeadValidationManifest> = {
  parse(value: unknown): ExistingHeadValidationManifest {
    const object = parseObject(value, "existing-head-validation manifest");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "run", "triggerSha", "baseHeadSha",
      "candidateSha", "candidateTreeSha", "target", "candidateDigest", "createdAt", "files",
    ], "existing-head-validation manifest");
    if (object.schemaVersion !== 1 || object.kind !== "existing-head-validation") {
      throw new Error("existing-head-validation manifest discriminatorが不正です");
    }
    if (!Array.isArray(object.files) || object.files.length !== 1) {
      throw new Error("existing-head-validation filesは1件必要です");
    }
    const preview = parseArtifactFile(object.files[0]);
    if (preview.name !== "preview-report.json") throw new Error("preview-report.jsonだけが必要です");
    const baseHeadSha = parseSha(object.baseHeadSha);
    const candidateSha = parseSha(object.candidateSha);
    if (baseHeadSha !== candidateSha) throw new Error("existing headのbaseHeadShaとcandidateShaが一致しません");
    return {
      schemaVersion: 1,
      kind: "existing-head-validation",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      run: parseRunRef(object.run),
      triggerSha: parseSha(object.triggerSha),
      baseHeadSha,
      candidateSha,
      candidateTreeSha: parseSha(object.candidateTreeSha),
      target: parseValidateTarget(object.target, candidateSha),
      candidateDigest: parseDigest(object.candidateDigest),
      createdAt: parseUtcTimestamp(object.createdAt),
      files: [preview],
    };
  },
};

const noOpManifestSchema: ExactSchema<NoOpManifest> = {
  parse(value: unknown): NoOpManifest {
    const object = parseObject(value, "no-op manifest");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "run", "triggerSha", "baseHeadSha",
      "target", "createdAt", "files",
    ], "no-op manifest");
    if (object.schemaVersion !== 1 || object.kind !== "no-op") throw new Error("no-op manifest discriminatorが不正です");
    const target = parseObject(object.target, "none target");
    requireExactKeys(target, ["mode", "historyDigest"], "none target");
    if (target.mode !== "none") throw new Error("no-op targetはnoneが必要です");
    if (!Array.isArray(object.files) || object.files.length !== 1) throw new Error("no-op filesは1件必要です");
    const preview = parseArtifactFile(object.files[0]);
    if (preview.name !== "preview-report.json") throw new Error("preview-report.jsonだけが必要です");
    return {
      schemaVersion: 1,
      kind: "no-op",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      run: parseRunRef(object.run),
      triggerSha: parseSha(object.triggerSha),
      baseHeadSha: parseSha(object.baseHeadSha),
      target: { mode: "none", historyDigest: parseDigest(target.historyDigest) },
      createdAt: parseUtcTimestamp(object.createdAt),
      files: [preview],
    };
  },
};

function parseRecoveryTarget(value: unknown, baseHeadSha: string): RecoveryTarget {
  const object = parseObject(value, "recovery target");
  requireExactKeys(object, [
    "mode", "generation", "prNumber", "creatorUserId", "headRef", "beforeHeadSha", "afterHeadSha",
    "rootDigest", "journalDigest", "operationId", "beforeSnapshotDigest", "afterSnapshotDigest",
    "candidateDigest", "reportDigest", "originRun",
  ], "recovery target");
  if (typeof object.mode !== "string" || !recoveryModes.includes(object.mode as RecoveryMode)) {
    throw new Error("recovery target modeが不正です");
  }
  const generation = parseGeneration(object.generation);
  const headRef = expectedManagedHeadRef(generation);
  if (object.headRef !== headRef) throw new Error("recovery target headRefとgenerationが一致しません");
  const beforeHeadSha = parseSha(object.beforeHeadSha);
  if (beforeHeadSha !== baseHeadSha) throw new Error("recovery target before SHAとbaseHeadShaが一致しません");
  return {
    mode: object.mode as RecoveryMode,
    generation,
    prNumber: parsePositiveSafeInteger(object.prNumber),
    creatorUserId: parseDecimalId(object.creatorUserId),
    headRef,
    beforeHeadSha,
    afterHeadSha: parseSha(object.afterHeadSha),
    rootDigest: parseDigest(object.rootDigest),
    journalDigest: parseDigest(object.journalDigest),
    operationId: parseDigest(object.operationId),
    beforeSnapshotDigest: parseDigest(object.beforeSnapshotDigest),
    afterSnapshotDigest: parseDigest(object.afterSnapshotDigest),
    candidateDigest: parseDigest(object.candidateDigest),
    reportDigest: parseDigest(object.reportDigest),
    originRun: parseRunRef(object.originRun),
  };
}

const recoveryManifestSchema: ExactSchema<RecoveryManifest> = {
  parse(value: unknown): RecoveryManifest {
    const object = parseObject(value, "recovery manifest");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "run", "triggerSha", "baseHeadSha",
      "target", "createdAt", "files",
    ], "recovery manifest");
    if (object.schemaVersion !== 1 || object.kind !== "recovery") {
      throw new Error("recovery manifest discriminatorが不正です");
    }
    if (!Array.isArray(object.files) || object.files.length !== 0) throw new Error("recovery manifest filesは空が必要です");
    const baseHeadSha = parseSha(object.baseHeadSha);
    return {
      schemaVersion: 1,
      kind: "recovery",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      run: parseRunRef(object.run),
      triggerSha: parseSha(object.triggerSha),
      baseHeadSha,
      target: parseRecoveryTarget(object.target, baseHeadSha),
      createdAt: parseUtcTimestamp(object.createdAt),
      files: [],
    };
  },
};

const artifactManifestSchema: ExactSchema<ArtifactManifest> = {
  parse(value: unknown): ArtifactManifest {
    const object = parseObject(value, "artifact manifest");
    if (object.kind === "candidate-update") return candidateUpdateManifestSchema.parse(value);
    if (object.kind === "existing-head-validation") return existingHeadValidationManifestSchema.parse(value);
    if (object.kind === "no-op") return noOpManifestSchema.parse(value);
    if (object.kind === "recovery") return recoveryManifestSchema.parse(value);
    throw new Error("artifact manifest kindが不正です");
  },
};

const draftReceiptSchema: ExactSchema<DraftReceipt> = {
  parse(value: unknown): DraftReceipt {
    const object = parseObject(value, "DraftReceipt");
    requireExactKeys(object, [
      "schemaVersion", "kind", "repositoryId", "repository", "run", "manifestDigest", "candidateDigest",
      "generation", "prNumber", "headRef", "headSha", "markerDigest", "historyDigest", "createdAt",
    ], "DraftReceipt");
    if (object.schemaVersion !== 1 || object.kind !== "published-draft") throw new Error("DraftReceipt discriminatorが不正です");
    const generation = parseGeneration(object.generation);
    const headRef = expectedManagedHeadRef(generation);
    if (object.headRef !== headRef) throw new Error("DraftReceipt headRefとgenerationが一致しません");
    return {
      schemaVersion: 1,
      kind: "published-draft",
      repositoryId: parseDecimalId(object.repositoryId),
      repository: parseRepositoryFullName(object.repository),
      run: parseRunRef(object.run),
      manifestDigest: parseDigest(object.manifestDigest),
      candidateDigest: parseDigest(object.candidateDigest),
      generation,
      prNumber: parsePositiveSafeInteger(object.prNumber),
      headRef,
      headSha: parseSha(object.headSha),
      markerDigest: parseDigest(object.markerDigest),
      historyDigest: parseDigest(object.historyDigest),
      createdAt: parseUtcTimestamp(object.createdAt),
    };
  },
};

export function encodeArtifactManifest(value: unknown): Buffer {
  return encodeCanonicalJson(artifactManifestSchema, value);
}

export function decodeArtifactManifest(bytes: Uint8Array): ArtifactManifest {
  return decodeCanonicalJson(artifactManifestSchema, bytes);
}

const draftReceiptByteLimit = 48 * 1024;

export function encodeDraftReceipt(value: unknown): Buffer {
  const bytes = encodeCanonicalJson(draftReceiptSchema, value);
  if (bytes.length > draftReceiptByteLimit) throw new Error("DraftReceiptが48 KiBを超えています");
  return bytes;
}

export function decodeDraftReceipt(bytes: Uint8Array): DraftReceipt {
  if (bytes.byteLength > draftReceiptByteLimit) throw new Error("DraftReceiptが48 KiBを超えています");
  return decodeCanonicalJson(draftReceiptSchema, bytes);
}
