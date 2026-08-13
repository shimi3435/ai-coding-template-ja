import { sameLegalFiles, sha256 } from "./legal.ts";
import { serializeLock, serializeSources } from "./schema.ts";
import { sameSourceRef } from "./types.ts";
import { utf8Compare, type CanonicalTree } from "./canonical.ts";
import type { RemoteCohortObservation } from "./github.ts";
import { remoteObservationFingerprint } from "./observation-fingerprint.ts";
import type {
  LocalLegalFile,
  LocalLock,
  LockDocument,
  RemoteLock,
  RemoteSource,
  SkillLock,
  SourceRef,
  SourcesDocument,
} from "./types.ts";

export type PlanStatus = "up-to-date" | "update-available" | "no-content-change" | "unchanged";

export type RemotePlanStep = Readonly<{
  key: string;
  names: readonly string[];
  status: PlanStatus;
  resolvedCommit: string;
  observationFingerprint: string;
  warnings: readonly string[];
  expectedBeforeLockBytes: string;
  expectedBeforeLockDigest: string;
  candidateAfterLockBytes: string;
  candidateAfterLockDigest: string;
  expectedTargetDigests: ReadonlyMap<string, string | null>;
  candidateTrees: ReadonlyMap<string, CanonicalTree>;
}>;

export type RemoteUpdatePlan = Readonly<{
  sourcesBytes: string;
  sourcesDigest: string;
  initialLockBytes: string;
  initialLockDigest: string;
  candidateLockBytes: string;
  candidateLockDigest: string;
  steps: readonly RemotePlanStep[];
  warnings: readonly string[];
}>;

export type LocalObservation = Readonly<{
  name: string;
  tree: CanonicalTree;
  legalFiles: readonly LocalLegalFile[];
}>;

export type LocalLockPlan = Readonly<{
  sourcesBytes: string;
  sourcesDigest: string;
  status: "unchanged" | "update-available";
  initialLockBytes: string;
  initialLockDigest: string;
  candidateLockBytes: string;
  candidateLockDigest: string;
  observations: readonly LocalObservation[];
}>;

function digest(text: string): string {
  return sha256(Buffer.from(text, "utf8"));
}

export function refKey(ref: SourceRef): string {
  if ("branch" in ref) return `branch:${ref.branch}`;
  if ("commit" in ref) return `commit:${ref.commit}`;
  return `semver:${ref.semver}`;
}

export function cohortKey(repository: string, ref: SourceRef): string {
  return `${repository}|${refKey(ref)}`;
}

function replaceLocks(
  current: LockDocument,
  replacements: ReadonlyMap<string, SkillLock>,
): LockDocument {
  const seen = new Set<string>();
  const skills = current.skills.map((entry) => {
    const replacement = replacements.get(entry.name);
    if (replacement === undefined) return entry;
    seen.add(entry.name);
    return replacement;
  });
  for (const [name, replacement] of replacements) {
    if (!seen.has(name)) skills.push(replacement);
  }
  return { schemaVersion: 1, skills };
}

function assertInstalledMatchesLock(name: string, tree: CanonicalTree, lock: RemoteLock): void {
  if (
    tree.treeHash !== lock.treeHash ||
    tree.fileCount !== lock.fileCount ||
    tree.byteCount !== lock.byteCount
  ) {
    throw new Error(`installed treeがlockと一致しません: ${name}`);
  }
}

export type RemoteCohortClassification = Readonly<{
  status: Exclude<PlanStatus, "unchanged">;
  replacements: ReadonlyMap<string, SkillLock>;
  expectedTargetDigests: ReadonlyMap<string, string | null>;
  candidateTrees: ReadonlyMap<string, CanonicalTree>;
}>;

export function classifyRemoteCohort(input: Readonly<{
  sources: readonly RemoteSource[];
  lock: LockDocument;
  installedTrees: ReadonlyMap<string, CanonicalTree>;
  observation: RemoteCohortObservation;
}>): RemoteCohortClassification {
  const key = cohortKey(input.observation.repository, input.observation.ref);
  const observedByName = new Map(input.observation.entries.map((entry) => [entry.name, entry]));
  if (observedByName.size !== input.sources.length) throw new Error(`cohort entry数不一致: ${key}`);
  const lockByName = new Map(input.lock.skills.map((entry) => [entry.name, entry]));
  const replacements = new Map<string, SkillLock>();
  const expectedTargetDigests = new Map<string, string | null>();
  const candidateTrees = new Map<string, CanonicalTree>();
  let contentChanged = false;
  let commitChangedOnly = false;
  for (const source of input.sources) {
    const observed = observedByName.get(source.name);
    if (observed === undefined) throw new Error(`cohort observation entry欠落: ${source.name}`);
    const previous = lockByName.get(source.name);
    if (previous !== undefined && previous.ownership !== "remote") {
      throw new Error(`ownership conflict: ${source.name}`);
    }
    const installed = input.installedTrees.get(source.name);
    expectedTargetDigests.set(source.name, null);
    if (previous !== undefined) {
      if (installed === undefined) throw new Error(`installed tree欠落: ${source.name}`);
      assertInstalledMatchesLock(source.name, installed, previous);
      expectedTargetDigests.set(source.name, previous.treeHash);
    }
    candidateTrees.set(source.name, observed.tree);
    const sameContent = previous !== undefined &&
      previous.repository === source.repository &&
      sameSourceRef(previous.ref, source.ref) &&
      previous.license === source.license &&
      previous.redistribution === source.redistribution &&
      previous.treeHash === observed.tree.treeHash &&
      previous.fileCount === observed.tree.fileCount &&
      previous.byteCount === observed.tree.byteCount &&
      sameLegalFiles(previous.legalFiles, observed.legalFiles);
    if (sameContent) {
      if (previous.resolvedCommit !== input.observation.resolvedCommit) commitChangedOnly = true;
      continue;
    }
    contentChanged = true;
    replacements.set(source.name, {
      name: source.name,
      ownership: "remote",
      license: source.license,
      redistribution: source.redistribution,
      target: source.target,
      repository: source.repository,
      ref: source.ref,
      resolvedCommit: input.observation.resolvedCommit,
      verification: input.observation.verification,
      ...("semver" in source.ref ? {
        selectedTag: input.observation.selectedTag!,
        selectedVersion: input.observation.selectedVersion!,
      } : {}),
      treeHash: observed.tree.treeHash,
      fileCount: observed.tree.fileCount,
      byteCount: observed.tree.byteCount,
      legalFiles: observed.legalFiles,
    } satisfies RemoteLock);
  }
  return Object.freeze({
    status: contentChanged ? "update-available" : commitChangedOnly ? "no-content-change" : "up-to-date",
    replacements,
    expectedTargetDigests,
    candidateTrees,
  });
}

export function buildRemoteUpdatePlan(input: Readonly<{
  sources: SourcesDocument;
  sourcesBytes?: string;
  lock: LockDocument;
  initialLockBytes: string;
  installedTrees: ReadonlyMap<string, CanonicalTree>;
  observations: readonly RemoteCohortObservation[];
}>): RemoteUpdatePlan {
  const sourcesBytes = input.sourcesBytes ?? serializeSources(input.sources);
  const remoteSources = input.sources.skills.filter((entry) => entry.ownership === "remote");
  const sourceGroups = new Map<string, typeof remoteSources>();
  for (const source of remoteSources) {
    const key = cohortKey(source.repository, source.ref);
    sourceGroups.set(key, [...(sourceGroups.get(key) ?? []), source]);
  }
  const observationByKey = new Map<string, RemoteCohortObservation>();
  for (const observation of input.observations) {
    const key = cohortKey(observation.repository, observation.ref);
    if (observationByKey.has(key)) throw new Error(`cohort observation重複: ${key}`);
    observationByKey.set(key, observation);
  }
  if (observationByKey.size !== sourceGroups.size) throw new Error("cohort observation数がsourcesと一致しません");

  let currentLock = input.lock;
  let currentBytes = input.initialLockBytes;
  const steps: RemotePlanStep[] = [];
  const warnings: string[] = [];
  for (const key of [...sourceGroups.keys()].sort(utf8Compare)) {
    const sources = sourceGroups.get(key)!;
    const observation = observationByKey.get(key);
    if (observation === undefined) throw new Error(`cohort observation欠落: ${key}`);
    const classification = classifyRemoteCohort({
      sources,
      lock: currentLock,
      installedTrees: input.installedTrees,
      observation,
    });
    const expectedBefore = currentBytes;
    if (classification.status === "update-available") {
      currentLock = replaceLocks(currentLock, classification.replacements);
      currentBytes = serializeLock(currentLock);
    }
    warnings.push(...observation.warnings);
    steps.push(Object.freeze({
      key,
      names: Object.freeze(sources.map((source) => source.name).sort(utf8Compare)),
      status: classification.status,
      resolvedCommit: observation.resolvedCommit,
      observationFingerprint: remoteObservationFingerprint(observation),
      warnings: Object.freeze([...observation.warnings]),
      expectedBeforeLockBytes: expectedBefore,
      expectedBeforeLockDigest: digest(expectedBefore),
      candidateAfterLockBytes: currentBytes,
      candidateAfterLockDigest: digest(currentBytes),
      expectedTargetDigests: classification.expectedTargetDigests,
      candidateTrees: classification.candidateTrees,
    }));
  }
  return Object.freeze({
    sourcesBytes,
    sourcesDigest: digest(sourcesBytes),
    initialLockBytes: input.initialLockBytes,
    initialLockDigest: digest(input.initialLockBytes),
    candidateLockBytes: currentBytes,
    candidateLockDigest: digest(currentBytes),
    steps: Object.freeze(steps),
    warnings: Object.freeze(warnings),
  });
}

export function buildLocalLockPlan(input: Readonly<{
  sources: SourcesDocument;
  sourcesBytes?: string;
  lock: LockDocument;
  initialLockBytes: string;
  observations: readonly LocalObservation[];
}>): LocalLockPlan {
  const sourcesBytes = input.sourcesBytes ?? serializeSources(input.sources);
  const localSources = input.sources.skills.filter((entry) => entry.ownership === "local");
  const byName = new Map(input.observations.map((observation) => [observation.name, observation]));
  if (byName.size !== localSources.length) throw new Error("local observation数がsourcesと一致しません");
  const replacements = new Map<string, SkillLock>();
  const currentByName = new Map(input.lock.skills.map((entry) => [entry.name, entry]));
  for (const source of localSources) {
    const observation = byName.get(source.name);
    if (observation === undefined) throw new Error(`local observation欠落: ${source.name}`);
    const current = currentByName.get(source.name);
    if (current !== undefined && current.ownership !== "local") throw new Error(`ownership conflict: ${source.name}`);
    const unchanged = current !== undefined &&
      current.license === source.license &&
      current.redistribution === source.redistribution &&
      current.treeHash === observation.tree.treeHash &&
      current.fileCount === observation.tree.fileCount &&
      current.byteCount === observation.tree.byteCount &&
      sameLegalFiles(current.legalFiles, observation.legalFiles);
    if (!unchanged) {
      const replacement: LocalLock = {
        name: source.name,
        ownership: "local",
        license: source.license,
        redistribution: source.redistribution,
        target: source.target,
        treeHash: observation.tree.treeHash,
        fileCount: observation.tree.fileCount,
        byteCount: observation.tree.byteCount,
        legalFiles: observation.legalFiles,
      };
      replacements.set(source.name, replacement);
    }
  }
  const candidate = replacements.size === 0 ? input.lock : replaceLocks(input.lock, replacements);
  const candidateBytes = replacements.size === 0 ? input.initialLockBytes : serializeLock(candidate);
  return Object.freeze({
    sourcesBytes,
    sourcesDigest: digest(sourcesBytes),
    status: replacements.size === 0 ? "unchanged" : "update-available",
    initialLockBytes: input.initialLockBytes,
    initialLockDigest: digest(input.initialLockBytes),
    candidateLockBytes: candidateBytes,
    candidateLockDigest: digest(candidateBytes),
    observations: Object.freeze([...input.observations]),
  });
}
