import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  computeCandidateDigest,
  decodeArtifactManifest,
  encodeArtifactManifest,
  parseDecimalId,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  type ArtifactManifest,
  type CandidateUpdateManifest,
  type CreatePublishTarget,
  type UpdatePublishTarget,
  type ValidatePublishTarget,
} from "../model/index.ts";
import type { StrictManagedPullRequest } from "./history.ts";

export type CandidateArtifactOptions = Readonly<{
  repositoryId: string;
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  triggerSha: string;
}>;

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function git(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function artifactFile(stage: string, name: string): Readonly<{ name: string; byteLength: number; digest: string }> {
  const bytes = readFileSync(join(stage, name));
  return { name, byteLength: bytes.length, digest: digest(bytes) };
}

const maximumArtifactBytes = 100 * 1024 * 1024;

export function validateArtifactByteTotal(sizes: readonly number[]): number {
  let total = 0;
  for (const size of sizes) {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("artifact file sizeが不正です");
    total += size;
    if (!Number.isSafeInteger(total) || total > maximumArtifactBytes) {
      throw new Error("candidate artifactが100 MiBを超えています");
    }
  }
  return total;
}

export type CandidateArtifactIdentity = Readonly<{
  repositoryId: string;
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  historyDigest?: string;
  target?: CreatePublishTarget | UpdatePublishTarget | ValidatePublishTarget |
    Readonly<{ mode: "none"; historyDigest: string }>;
}>;

export function validateCandidateArtifact(directory: string, expected: CandidateArtifactIdentity): ArtifactManifest {
  const entries = readdirSync(directory, { withFileTypes: true });
  const sizes = entries.map((entry) => {
    const stat = lstatSync(join(directory, entry.name));
    if (!entry.isFile() || entry.isSymbolicLink() || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("artifactはregular fileだけが必要です");
    }
    return stat.size;
  });
  validateArtifactByteTotal(sizes);
  const manifestBytes = readFileSync(join(directory, "manifest.json"));
  const manifest = decodeArtifactManifest(manifestBytes);
  if (
    manifest.repositoryId !== parseDecimalId(expected.repositoryId) ||
    manifest.repository !== parseRepositoryFullName(expected.repository) ||
    manifest.run.workflowRunId !== parseDecimalId(expected.workflowRunId) ||
    manifest.run.workflowRunAttempt !== parsePositiveSafeInteger(expected.workflowRunAttempt)
  ) {
    throw new Error("artifact identityがcurrent contextと一致しません");
  }
  if (expected.historyDigest !== undefined && manifest.target.historyDigest !== expected.historyDigest) {
    throw new Error("artifact history digestがfresh stateと一致しません");
  }
  if (expected.target !== undefined && !isDeepStrictEqual(manifest.target, expected.target)) {
    throw new Error("artifact publish targetがfresh stateと一致しません");
  }
  const expectedNames = ["manifest.json", ...manifest.files.map((file) => file.name)].sort();
  const actualNames = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("artifact file集合がmanifestと一致しません");
  }
  for (const file of manifest.files) {
    const bytes = readFileSync(join(directory, file.name));
    if (bytes.length !== file.byteLength || digest(bytes) !== file.digest) {
      throw new Error(`artifact file digestが一致しません: ${file.name}`);
    }
  }
  return manifest;
}

function assertArtifactSize(stage: string, manifestBytes: Buffer, names: readonly string[]): void {
  validateArtifactByteTotal([manifestBytes.length, ...names.map((name) => statSync(join(stage, name)).size)]);
}

export function writeCandidateArtifact(input: Readonly<{
  stage: string;
  worktree: string;
  options: CandidateArtifactOptions;
  previewBytes: Buffer;
  applyBytes: Buffer;
  historyDigest: string;
  now: Date;
  baseHeadSha: string;
  target: CandidateUpdateManifest["target"];
}>): void {
  writeFileSync(join(input.stage, "preview-report.json"), input.previewBytes, { mode: 0o600 });
  writeFileSync(join(input.stage, "apply-report.json"), input.applyBytes, { mode: 0o600 });
  const candidateSha = git(input.worktree, ["rev-parse", "HEAD"]);
  const candidateTreeSha = git(input.worktree, ["rev-parse", "HEAD^{tree}"]);
  const bundleRef = `refs/skill-update-automation/run-${input.options.workflowRunId}-${input.options.workflowRunAttempt}`;
  git(input.worktree, ["update-ref", bundleRef, candidateSha, "0000000000000000000000000000000000000000"]);
  try {
    git(input.worktree, ["bundle", "create", join(input.stage, "candidate.bundle"), bundleRef, `^${input.baseHeadSha}`]);
  } finally {
    git(input.worktree, ["update-ref", "-d", bundleRef, candidateSha]);
  }
  git(input.worktree, ["bundle", "verify", join(input.stage, "candidate.bundle")]);
  validateArtifactByteTotal([
    statSync(join(input.stage, "apply-report.json")).size,
    statSync(join(input.stage, "candidate.bundle")).size,
    statSync(join(input.stage, "preview-report.json")).size,
  ]);
  const files = [
    artifactFile(input.stage, "apply-report.json"),
    artifactFile(input.stage, "candidate.bundle"),
    artifactFile(input.stage, "preview-report.json"),
  ] as const;
  const candidateDigest = computeCandidateDigest({
    baseHeadSha: input.baseHeadSha,
    candidateTreeSha,
    applyReportDigest: files[0].digest,
  });
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    kind: "candidate-update",
    repositoryId: input.options.repositoryId,
    repository: input.options.repository,
    run: { workflowRunId: input.options.workflowRunId, workflowRunAttempt: input.options.workflowRunAttempt },
    triggerSha: input.options.triggerSha,
    baseHeadSha: input.baseHeadSha,
    candidateSha,
    candidateTreeSha,
    target: input.target,
    candidateDigest,
    createdAt: input.now.toISOString(),
    files,
  };
  const manifestBytes = encodeArtifactManifest(manifest);
  assertArtifactSize(input.stage, manifestBytes, files.map((file) => file.name));
  writeFileSync(join(input.stage, "manifest.json"), manifestBytes, { mode: 0o600 });
}

export function writeNoOpArtifact(
  stage: string,
  options: CandidateArtifactOptions,
  previewBytes: Buffer,
  historyDigest: string,
  baseHeadSha: string,
  now: Date,
): void {
  const previewName = "preview-report.json";
  writeFileSync(join(stage, previewName), previewBytes, { mode: 0o600 });
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    kind: "no-op",
    repositoryId: options.repositoryId,
    repository: options.repository,
    run: { workflowRunId: options.workflowRunId, workflowRunAttempt: options.workflowRunAttempt },
    triggerSha: options.triggerSha,
    baseHeadSha,
    target: { mode: "none", historyDigest },
    createdAt: now.toISOString(),
    files: [{ name: previewName, byteLength: previewBytes.length, digest: digest(previewBytes) }],
  };
  const manifestBytes = encodeArtifactManifest(manifest);
  assertArtifactSize(stage, manifestBytes, [previewName]);
  writeFileSync(join(stage, "manifest.json"), manifestBytes, { mode: 0o600 });
}

export function writeExistingValidationArtifact(
  stage: string,
  options: CandidateArtifactOptions,
  previewBytes: Buffer,
  historyDigest: string,
  pullRequest: StrictManagedPullRequest,
  candidateTreeSha: string,
  now: Date,
): void {
  const previewName = "preview-report.json";
  writeFileSync(join(stage, previewName), previewBytes, { mode: 0o600 });
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: options.repositoryId,
    repository: options.repository,
    run: { workflowRunId: options.workflowRunId, workflowRunAttempt: options.workflowRunAttempt },
    triggerSha: options.triggerSha,
    baseHeadSha: pullRequest.headSha,
    candidateSha: pullRequest.headSha,
    candidateTreeSha,
    target: {
      mode: "validate",
      generation: pullRequest.generation,
      prNumber: pullRequest.prNumber,
      headRef: pullRequest.headRef,
      expectedBranch: { state: "present", sha: pullRequest.headSha },
      markerDigest: pullRequest.markerDigest,
      historyDigest,
    },
    candidateDigest: pullRequest.envelope.candidateDigest,
    createdAt: now.toISOString(),
    files: [{ name: previewName, byteLength: previewBytes.length, digest: digest(previewBytes) }],
  };
  const manifestBytes = encodeArtifactManifest(manifest);
  assertArtifactSize(stage, manifestBytes, [previewName]);
  writeFileSync(join(stage, "manifest.json"), manifestBytes, { mode: 0o600 });
}
