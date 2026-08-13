import { utf8Compare, validateCanonicalPath } from "./canonical.ts";
import { validateSemverRange } from "./semver-policy.ts";
import type {
  LocalLegalFile,
  LocalLegalMapping,
  LocalLock,
  LocalSource,
  LockDocument,
  PluginLock,
  PluginSource,
  Redistribution,
  RemoteLegalFile,
  RemoteLegalMapping,
  RemoteLock,
  RemoteSource,
  SkillLock,
  SkillSource,
  SourceRef,
  SourcesDocument,
  SubtreeSelector,
  Verification,
} from "./types.ts";

const metadataBytesLimit = 10 * 1_048_576;
const sha256Pattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} はobjectが必要です`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  label = "object",
): void {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !(key in value));
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`${label} fields不正: missing=${missing.join(",")} unknown=${unknown.join(",")}`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} は空でないstringが必要です`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  const hash = string(value, label);
  if (!sha256Pattern.test(hash)) {
    throw new Error(`${label} はlowercase SHA-256が必要です`);
  }
  return hash;
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} は非負safe integerが必要です`);
  }
  return value;
}

function redistribution(value: unknown): Redistribution {
  if (value !== "allowed" && value !== "blocked") {
    throw new Error("redistribution は allowed または blocked が必要です");
  }
  return value;
}

function verification(value: unknown): Verification {
  if (value !== "verified" && value !== "unverified" && value !== "unknown") {
    throw new Error("verification が不正です");
  }
  return value;
}

function name(value: unknown): string {
  const result = string(value, "name");
  validateCanonicalPath(result);
  if (result.includes("/")) {
    throw new Error("name は単一path segmentが必要です");
  }
  return result;
}

function target(value: unknown, skillName: string): string {
  const result = validateCanonicalPath(string(value, "target"));
  if (result !== `.agents/skills/${skillName}`) {
    throw new Error(`target は .agents/skills/${skillName} が必要です`);
  }
  return result;
}

function repository(value: unknown): string {
  const result = string(value, "repository");
  if (!repositoryPattern.test(result)) {
    throw new Error("repository は owner/name 形式が必要です");
  }
  return result.toLowerCase();
}

function subtree(value: unknown): SubtreeSelector {
  const parsed = object(value, "subtree");
  if ("root" in parsed) {
    exactKeys(parsed, ["root"], [], "subtree");
    if (parsed.root !== true) throw new Error("subtree.root は true が必要です");
    return { root: true };
  }
  exactKeys(parsed, ["path"], [], "subtree");
  return { path: validateCanonicalPath(string(parsed.path, "subtree.path")) };
}

function ref(value: unknown): SourceRef {
  const parsed = object(value, "ref");
  const keys = Object.keys(parsed);
  if (keys.length !== 1) {
    throw new Error("ref は branch / commit / semver のいずれか一つが必要です");
  }
  if ("branch" in parsed) {
    exactKeys(parsed, ["branch"], [], "branch ref");
    return { branch: string(parsed.branch, "branch") };
  }
  if ("commit" in parsed) {
    exactKeys(parsed, ["commit"], [], "commit ref");
    const commit = string(parsed.commit, "commit");
    if (!commitPattern.test(commit)) {
      throw new Error("commit ref はlowercase 40-hexが必要です");
    }
    return { commit };
  }
  if ("semver" in parsed) {
    exactKeys(parsed, ["semver"], [], "semver ref");
    return { semver: validateSemverRange(string(parsed.semver, "semver")) };
  }
  throw new Error("ref variantが不正です");
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} はarrayが必要です`);
  }
  return value;
}

function remoteMappings(value: unknown, label: string): readonly RemoteLegalMapping[] {
  const mappings = array(value, label).map((item, index) => {
    const parsed = object(item, `${label}[${index}]`);
    exactKeys(parsed, ["sourcePath", "targetPath", "expectedSha256"], [], `${label}[${index}]`);
    return {
      sourcePath: validateCanonicalPath(string(parsed.sourcePath, "sourcePath")),
      targetPath: validateCanonicalPath(string(parsed.targetPath, "targetPath")),
      expectedSha256: sha256(parsed.expectedSha256, "expectedSha256"),
    };
  });
  if (mappings.length === 0) {
    throw new Error(`${label} は1件以上必要です`);
  }
  const targets = new Set<string>();
  for (const mapping of mappings) {
    if (targets.has(mapping.targetPath)) {
      throw new Error(`remote legal target重複: ${mapping.targetPath}`);
    }
    targets.add(mapping.targetPath);
  }
  return mappings;
}

function localMappings(value: unknown, label: string): readonly LocalLegalMapping[] {
  const mappings = array(value, label).map((item, index) => {
    const parsed = object(item, `${label}[${index}]`);
    exactKeys(parsed, ["sourcePath", "expectedSha256"], [], `${label}[${index}]`);
    return {
      sourcePath: validateCanonicalPath(string(parsed.sourcePath, "sourcePath")),
      expectedSha256: sha256(parsed.expectedSha256, "expectedSha256"),
    };
  });
  if (mappings.length === 0) {
    throw new Error(`${label} は1件以上必要です`);
  }
  const sources = new Set<string>();
  for (const mapping of mappings) {
    if (sources.has(mapping.sourcePath)) {
      throw new Error(`local legal source重複: ${mapping.sourcePath}`);
    }
    sources.add(mapping.sourcePath);
  }
  return mappings;
}

function commonSource(value: Record<string, unknown>): {
  name: string;
  license: string;
  redistribution: Redistribution;
} {
  return {
    name: name(value.name),
    license: string(value.license, "license"),
    redistribution: redistribution(value.redistribution),
  };
}

function sourceEntry(value: unknown, index: number): SkillSource {
  const parsed = object(value, `skills[${index}]`);
  const ownership = parsed.ownership;
  if (ownership === "remote") {
    exactKeys(parsed, ["name", "ownership", "license", "redistribution", "target", "repository", "ref", "subtree", "legalMappings"], [], `skills[${index}]`);
    const common = commonSource(parsed);
    if (common.redistribution !== "allowed") {
      throw new Error("remote redistribution は allowed が必要です");
    }
    return {
      ...common,
      ownership,
      target: target(parsed.target, common.name),
      repository: repository(parsed.repository),
      ref: ref(parsed.ref),
      subtree: subtree(parsed.subtree),
      legalMappings: remoteMappings(parsed.legalMappings, "legalMappings"),
    } satisfies RemoteSource;
  }
  if (ownership === "local") {
    exactKeys(parsed, ["name", "ownership", "license", "redistribution", "target", "legalMappings"], [], `skills[${index}]`);
    const common = commonSource(parsed);
    if (common.redistribution !== "allowed") {
      throw new Error("local redistribution は allowed が必要です");
    }
    return {
      ...common,
      ownership,
      target: target(parsed.target, common.name),
      legalMappings: localMappings(parsed.legalMappings, "legalMappings"),
    } satisfies LocalSource;
  }
  if (ownership === "plugin") {
    exactKeys(parsed, ["name", "ownership", "license", "redistribution", "manager"], [], `skills[${index}]`);
    return { ...commonSource(parsed), ownership, manager: string(parsed.manager, "manager") } satisfies PluginSource;
  }
  throw new Error(`ownershipが不正です: ${String(ownership)}`);
}

function parseMetadataJson(text: string | Buffer, label: string): unknown {
  const buffer = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8");
  if (buffer.length === 0 || buffer.length > metadataBytesLimit) {
    throw new Error(`${label} は1 byte以上10 MiB以下が必要です`);
  }
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error: unknown) {
    throw new Error(`${label} JSONが不正です: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateGlobalEntries(entries: readonly SkillSource[] | readonly SkillLock[]): void {
  const names = new Set<string>();
  const targets = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name)) {
      throw new Error(`skill name重複: ${entry.name}`);
    }
    names.add(entry.name);
    if (entry.ownership !== "plugin") {
      const folded = entry.target.replace(/[A-Z]/g, (character) => character.toLowerCase());
      if (targets.has(folded)) {
        throw new Error(`skill target衝突: ${entry.target}`);
      }
      targets.add(folded);
    }
  }
}

export function decodeSourcesJson(text: string | Buffer): SourcesDocument {
  const parsed = object(parseMetadataJson(text, "sources"), "sources");
  exactKeys(parsed, ["schemaVersion", "skills"], [], "sources");
  if (parsed.schemaVersion !== 1) {
    throw new Error(`sources schemaVersionは1が必要です: ${String(parsed.schemaVersion)}`);
  }
  const rawSkills = array(parsed.skills, "skills");
  if (rawSkills.length > 500) {
    throw new Error("skillsが500件を超えています");
  }
  const skills = rawSkills.map(sourceEntry);
  validateGlobalEntries(skills);
  return { schemaVersion: 1, skills };
}

function commonLock(value: Record<string, unknown>): {
  name: string;
  license: string;
  redistribution: Redistribution;
} {
  return commonSource(value);
}

function remoteLegalFiles(value: unknown): readonly RemoteLegalFile[] {
  const files = array(value, "legalFiles").map((item, index) => {
    const parsed = object(item, `legalFiles[${index}]`);
    exactKeys(parsed, ["sourcePath", "targetPath", "sha256"], [], `legalFiles[${index}]`);
    return {
      sourcePath: validateCanonicalPath(string(parsed.sourcePath, "sourcePath")),
      targetPath: validateCanonicalPath(string(parsed.targetPath, "targetPath")),
      sha256: sha256(parsed.sha256, "sha256"),
    };
  });
  if (files.length === 0) throw new Error("legalFilesは1件以上必要です");
  return files;
}

function localLegalFiles(value: unknown): readonly LocalLegalFile[] {
  const files = array(value, "legalFiles").map((item, index) => {
    const parsed = object(item, `legalFiles[${index}]`);
    exactKeys(parsed, ["sourcePath", "sha256"], [], `legalFiles[${index}]`);
    return {
      sourcePath: validateCanonicalPath(string(parsed.sourcePath, "sourcePath")),
      sha256: sha256(parsed.sha256, "sha256"),
    };
  });
  if (files.length === 0) throw new Error("legalFilesは1件以上必要です");
  return files;
}

function lockEntry(value: unknown, index: number): SkillLock {
  const parsed = object(value, `skills[${index}]`);
  if (parsed.ownership === "remote") {
    exactKeys(parsed, ["name", "ownership", "license", "redistribution", "target", "repository", "ref", "resolvedCommit", "verification", "treeHash", "fileCount", "byteCount", "legalFiles"], ["selectedTag", "selectedVersion"], `skills[${index}]`);
    const common = commonLock(parsed);
    if (common.redistribution !== "allowed") throw new Error("remote lock redistributionはallowedが必要です");
    const sourceRef = ref(parsed.ref);
    const hasSemver = "semver" in sourceRef;
    if (hasSemver !== (parsed.selectedTag !== undefined && parsed.selectedVersion !== undefined)) {
      throw new Error("SemVer lock はselectedTagとselectedVersionが必要です");
    }
    const resolvedCommit = string(parsed.resolvedCommit, "resolvedCommit");
    if (!commitPattern.test(resolvedCommit)) throw new Error("resolvedCommitはlowercase 40-hexが必要です");
    return {
      ...common,
      ownership: "remote",
      target: target(parsed.target, common.name),
      repository: repository(parsed.repository),
      ref: sourceRef,
      resolvedCommit,
      verification: verification(parsed.verification),
      ...(hasSemver ? {
        selectedTag: string(parsed.selectedTag, "selectedTag"),
        selectedVersion: string(parsed.selectedVersion, "selectedVersion"),
      } : {}),
      treeHash: sha256(parsed.treeHash, "treeHash"),
      fileCount: count(parsed.fileCount, "fileCount"),
      byteCount: count(parsed.byteCount, "byteCount"),
      legalFiles: remoteLegalFiles(parsed.legalFiles),
    } satisfies RemoteLock;
  }
  if (parsed.ownership === "local") {
    exactKeys(parsed, ["name", "ownership", "license", "redistribution", "target", "treeHash", "fileCount", "byteCount", "legalFiles"], [], `skills[${index}]`);
    const common = commonLock(parsed);
    if (common.redistribution !== "allowed") throw new Error("local lock redistributionはallowedが必要です");
    return {
      ...common,
      ownership: "local",
      target: target(parsed.target, common.name),
      treeHash: sha256(parsed.treeHash, "treeHash"),
      fileCount: count(parsed.fileCount, "fileCount"),
      byteCount: count(parsed.byteCount, "byteCount"),
      legalFiles: localLegalFiles(parsed.legalFiles),
    } satisfies LocalLock;
  }
  if (parsed.ownership === "plugin") {
    exactKeys(parsed, ["name", "ownership", "license", "redistribution", "manager"], [], `skills[${index}]`);
    return { ...commonLock(parsed), ownership: "plugin", manager: string(parsed.manager, "manager") } satisfies PluginLock;
  }
  throw new Error(`lock ownershipが不正です: ${String(parsed.ownership)}`);
}

export function validateLockStructure(lock: LockDocument, sources: SourcesDocument): void {
  const sourceByName = new Map(sources.skills.map((entry) => [entry.name, entry]));
  const lockByName = new Map(lock.skills.map((entry) => [entry.name, entry]));
  for (const source of sources.skills) {
    if (!lockByName.has(source.name)) throw new Error(`sourcesだけに存在するentry: ${source.name}`);
  }
  for (const entry of lock.skills) {
    const source = sourceByName.get(entry.name);
    if (source === undefined) throw new Error(`lockだけに存在するentry: ${entry.name}`);
    if (source.ownership !== entry.ownership) throw new Error(`sources / lock ownership不一致: ${entry.name}`);
    if (source.ownership !== "plugin" && entry.ownership !== "plugin" && source.target !== entry.target) {
      throw new Error(`sources / lock target不一致: ${entry.name}`);
    }
    if (source.ownership === "plugin" && entry.ownership === "plugin" && source.manager !== entry.manager) {
      throw new Error(`sources / lock manager不一致: ${entry.name}`);
    }
  }
}

function validateLockAgainstSources(lock: LockDocument, sources: SourcesDocument): void {
  validateLockStructure(lock, sources);
  const sourceByName = new Map(sources.skills.map((entry) => [entry.name, entry]));
  for (const entry of lock.skills) {
    const source = sourceByName.get(entry.name)!;
    if (source.license !== entry.license || source.redistribution !== entry.redistribution) {
      throw new Error(`sources / lock policy不一致: ${entry.name}`);
    }
  }
}

export function decodeLockJson(text: string | Buffer, sources?: SourcesDocument): LockDocument {
  const parsed = object(parseMetadataJson(text, "lock"), "lock");
  exactKeys(parsed, ["schemaVersion", "skills"], [], "lock");
  if (parsed.schemaVersion !== 1) throw new Error("lock schemaVersionは1が必要です");
  const rawSkills = array(parsed.skills, "skills");
  if (rawSkills.length > 500) throw new Error("lock skillsが500件を超えています");
  const skills = rawSkills.map(lockEntry);
  validateGlobalEntries(skills);
  const lock = { schemaVersion: 1 as const, skills };
  if (sources !== undefined) validateLockAgainstSources(lock, sources);
  return lock;
}

function orderedRef(sourceRef: SourceRef): Record<string, string> {
  if ("branch" in sourceRef) return { branch: sourceRef.branch };
  if ("commit" in sourceRef) return { commit: sourceRef.commit };
  return { semver: sourceRef.semver };
}

function orderedSubtree(selector: SubtreeSelector): Record<string, true | string> {
  return "root" in selector ? { root: true } : { path: selector.path };
}

function orderedSource(entry: SkillSource): Record<string, unknown> {
  const common = {
    name: entry.name,
    ownership: entry.ownership,
    license: entry.license,
    redistribution: entry.redistribution,
  };
  if (entry.ownership === "remote") {
    return {
      ...common,
      target: entry.target,
      repository: entry.repository,
      ref: orderedRef(entry.ref),
      subtree: orderedSubtree(entry.subtree),
      legalMappings: [...entry.legalMappings]
        .sort((left, right) => utf8Compare(left.targetPath, right.targetPath) || utf8Compare(left.sourcePath, right.sourcePath))
        .map((mapping) => ({ sourcePath: mapping.sourcePath, targetPath: mapping.targetPath, expectedSha256: mapping.expectedSha256 })),
    };
  }
  if (entry.ownership === "local") {
    return {
      ...common,
      target: entry.target,
      legalMappings: [...entry.legalMappings]
        .sort((left, right) => utf8Compare(left.sourcePath, right.sourcePath))
        .map((mapping) => ({ sourcePath: mapping.sourcePath, expectedSha256: mapping.expectedSha256 })),
    };
  }
  return { ...common, manager: entry.manager };
}

export function serializeSources(document: SourcesDocument): string {
  const value = {
    schemaVersion: 1,
    skills: [...document.skills]
      .sort((left, right) => utf8Compare(left.name, right.name))
      .map(orderedSource),
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

function orderedLock(entry: SkillLock): Record<string, unknown> {
  const common = { name: entry.name, ownership: entry.ownership, license: entry.license, redistribution: entry.redistribution };
  if (entry.ownership === "remote") {
    return {
      ...common,
      target: entry.target,
      repository: entry.repository,
      ref: orderedRef(entry.ref),
      resolvedCommit: entry.resolvedCommit,
      verification: entry.verification,
      ...("semver" in entry.ref ? { selectedTag: entry.selectedTag, selectedVersion: entry.selectedVersion } : {}),
      treeHash: entry.treeHash,
      fileCount: entry.fileCount,
      byteCount: entry.byteCount,
      legalFiles: [...entry.legalFiles]
        .sort((left, right) => utf8Compare(left.targetPath, right.targetPath) || utf8Compare(left.sourcePath, right.sourcePath))
        .map((file) => ({ sourcePath: file.sourcePath, targetPath: file.targetPath, sha256: file.sha256 })),
    };
  }
  if (entry.ownership === "local") {
    return {
      ...common,
      target: entry.target,
      treeHash: entry.treeHash,
      fileCount: entry.fileCount,
      byteCount: entry.byteCount,
      legalFiles: [...entry.legalFiles]
        .sort((left, right) => utf8Compare(left.sourcePath, right.sourcePath))
        .map((file) => ({ sourcePath: file.sourcePath, sha256: file.sha256 })),
    };
  }
  return { ...common, manager: entry.manager };
}

export function serializeLock(document: LockDocument): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    skills: [...document.skills].sort((left, right) => utf8Compare(left.name, right.name)).map(orderedLock),
  }, null, 2)}\n`;
}
