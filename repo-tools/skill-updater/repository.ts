import { closeSync, constants, fstatSync, lstatSync, opendirSync, openSync, readFileSync, readlinkSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeTree, utf8Compare, validateCanonicalPath, type CanonicalTree, type TreeFile } from "./canonical.ts";
import { validateInstalledTraversalPath } from "./installed-path.ts";
import { resourceLimits, sameLegalFiles, sha256, validateSkillLimits } from "./legal.ts";
import { parseSkillMetadata } from "./metadata.ts";
import { decodeLockJson, decodeSourcesJson, validateLockStructure } from "./schema.ts";
import { sameSourceRef } from "./types.ts";
import type { LocalObservation } from "./planner.ts";
import type { LockDocument, SourcesDocument } from "./types.ts";

export type RepositorySkillState = Readonly<{
  sourcesBytes: string;
  lockBytes: string;
  sources: SourcesDocument;
  lock: LockDocument;
}>;

export function readRepositorySkillState(repositoryRoot: string): RepositorySkillState {
  const sourcesBytes = readFileSync(join(repositoryRoot, ".agents", "skills", "skills.sources.json"), "utf8");
  const lockBytes = readFileSync(join(repositoryRoot, ".agents", "skills", "skills.lock.json"), "utf8");
  const sources = decodeSourcesJson(sourcesBytes);
  const lock = decodeLockJson(lockBytes);
  validateLockStructure(lock, sources);
  return { sourcesBytes, lockBytes, sources, lock };
}

export function readVendoredSkillNames(repositoryRoot: string): readonly string[] {
  return readdirSync(join(repositoryRoot, ".agents", "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort(utf8Compare);
}

type BoundedFileSnapshot = Readonly<{ content: Buffer; sha256: string; size: number; identity: string }>;

function readBoundedRegularFile(absolute: string, relative: string): BoundedFileSnapshot {
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error(`installed treeにregular file以外があります: ${relative}`);
    if (before.size > resourceLimits.singleFileBytes) {
      throw new Error(`単一fileが${resourceLimits.singleFileBytes} bytesを超えています: ${relative}`);
    }
    const content = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < content.length) {
      const count = readSync(descriptor, content, offset, content.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(descriptor);
    const current = lstatSync(absolute);
    if (
      offset !== content.length || after.size !== before.size ||
      after.dev !== before.dev || after.ino !== before.ino ||
      current.isSymbolicLink() || !current.isFile() ||
      current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size
    ) {
      throw new Error(`file読込中にsizeが変化しました: ${relative}`);
    }
    return Object.freeze({
      content,
      sha256: sha256(content),
      size: before.size,
      identity: `${before.dev}:${before.ino}`,
    });
  } finally {
    closeSync(descriptor);
  }
}

function walkTree(root: string): TreeFile[] {
  const pending: Array<{ relative: string; depth: number }> = [{ relative: "", depth: 0 }];
  let entriesRead = 0;
  let fileCount = 0;
  let byteCount = 0;
  const files: TreeFile[] = [];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const directory = current.relative.length === 0 ? root : join(root, ...current.relative.split("/"));
    const handle = opendirSync(directory);
    const children = [];
    try {
      for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
        entriesRead += 1;
        if (entriesRead > resourceLimits.filesystemEntries) {
          throw new Error(`installed tree filesystem entry数が${resourceLimits.filesystemEntries}件を超えています`);
        }
        children.push(entry.name);
      }
    } finally {
      handle.closeSync();
    }
    children.sort(utf8Compare);
    const directories: Array<{ relative: string; depth: number }> = [];
    for (const name of children) {
      const childRelative = current.relative.length === 0 ? name : `${current.relative}/${name}`;
      validateInstalledTraversalPath(childRelative);
      const absolute = join(root, ...childRelative.split("/"));
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(`installed treeにspecial fileがあります: ${childRelative}`);
      }
      if (stat.isDirectory()) {
        const depth = current.depth + 1;
        if (depth > resourceLimits.directoryDepth) {
          throw new Error(`installed tree directory depthが${resourceLimits.directoryDepth}を超えています: ${childRelative}`);
        }
        directories.push({ relative: childRelative, depth });
        continue;
      }
      fileCount += 1;
      if (fileCount > resourceLimits.skillFiles) throw new Error(`skill file数が${resourceLimits.skillFiles}件を超えています`);
      if (stat.size > resourceLimits.singleFileBytes) throw new Error(`単一fileが${resourceLimits.singleFileBytes} bytesを超えています: ${childRelative}`);
      byteCount += stat.size;
      if (byteCount > resourceLimits.skillBytes) throw new Error(`skill bytesが${resourceLimits.skillBytes}を超えています`);
      const snapshot = readBoundedRegularFile(absolute, childRelative);
      files.push({ path: childRelative, executable: (stat.mode & 0o111) !== 0, content: snapshot.content });
    }
    for (let index = directories.length - 1; index >= 0; index -= 1) pending.push(directories[index]!);
  }
  return files;
}

export function readInstalledTree(repositoryRoot: string, target: string, expectedName: string): CanonicalTree {
  const absolute = join(repositoryRoot, ...target.split("/"));
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`skill targetはdirectoryが必要です: ${target}`);
  const files = walkTree(absolute);
  const skill = files.filter((file) => file.path === "SKILL.md");
  if (skill.length !== 1) throw new Error(`root SKILL.mdはexactly one必要です: ${expectedName}`);
  parseSkillMetadata(skill[0]!.content, expectedName);
  validateSkillLimits(files);
  return canonicalizeTree(files);
}

function isTrackedPath(repositoryRoot: string, path: string): boolean {
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", path], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  return tracked.status === 0;
}

export function readLocalObservations(
  repositoryRoot: string,
  sources: SourcesDocument,
): readonly LocalObservation[] {
  const legalCache = new Map<string, Readonly<{
    content: Buffer;
    tracked: boolean;
    regular: boolean;
    sha256?: string;
    identity?: string;
    size?: number;
  }>>();
  return sources.skills
    .filter((entry) => entry.ownership === "local")
    .map((source) => {
      const tree = readInstalledTree(repositoryRoot, source.target, source.name);
      const seen = new Set<string>();
      const legalFiles = source.legalMappings.map((mapping) => {
        validateCanonicalPath(mapping.sourcePath);
        if (seen.has(mapping.sourcePath)) throw new Error(`local legal source重複: ${mapping.sourcePath}`);
        seen.add(mapping.sourcePath);
        let legal = legalCache.get(mapping.sourcePath);
        if (legal === undefined) {
          const absolute = join(repositoryRoot, ...mapping.sourcePath.split("/"));
          let regular = false;
          let content: Buffer<ArrayBufferLike> = Buffer.alloc(0);
          try {
            const stat = lstatSync(absolute);
            regular = stat.isFile() && !stat.isSymbolicLink();
            if (regular) {
              const snapshot = readBoundedRegularFile(absolute, mapping.sourcePath);
              content = snapshot.content;
              legal = Object.freeze({
                content,
                tracked: isTrackedPath(repositoryRoot, mapping.sourcePath),
                regular,
                sha256: snapshot.sha256,
                identity: snapshot.identity,
                size: snapshot.size,
              });
            }
          } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          legal ??= Object.freeze({ content, tracked: isTrackedPath(repositoryRoot, mapping.sourcePath), regular });
          legalCache.set(mapping.sourcePath, legal);
        }
        if (!legal.tracked || !legal.regular || legal.sha256 === undefined) {
          throw new Error(`local legal sourceはtracked regular fileが必要です: ${mapping.sourcePath}`);
        }
        if (legal.sha256 !== mapping.expectedSha256) throw new Error(`local legal hash不一致: ${mapping.sourcePath}`);
        return { sourcePath: mapping.sourcePath, sha256: legal.sha256 };
      }).sort((left, right) => utf8Compare(left.sourcePath, right.sourcePath));
      return { name: source.name, tree, legalFiles };
    });
}

export function verifyInstalledState(repositoryRoot: string, state: RepositorySkillState): readonly string[] {
  const errors: string[] = [];
  const lockByName = new Map(state.lock.skills.map((entry) => [entry.name, entry]));
  const sourceNames = new Set(state.sources.skills.map((entry) => entry.name));
  for (const lock of state.lock.skills) {
    if (!sourceNames.has(lock.name)) errors.push(`${lock.name}: lockだけに存在するorphan entry`);
  }
  for (const source of state.sources.skills) {
    const lock = lockByName.get(source.name);
    if (lock === undefined) {
      errors.push(`${source.name}: lock entry欠落`);
      continue;
    }
    if (
      source.ownership !== lock.ownership ||
      source.license !== lock.license ||
      source.redistribution !== lock.redistribution
    ) {
      errors.push(`${source.name}: sources / lock policy不一致`);
    }
    if (
      source.ownership === "remote" && lock.ownership === "remote" &&
      (source.repository !== lock.repository || !sameSourceRef(source.ref, lock.ref))
    ) {
      errors.push(`${source.name}: sources / lock provenance不一致`);
    }
    if (
      source.ownership === "plugin" && lock.ownership === "plugin" &&
      source.manager !== lock.manager
    ) {
      errors.push(`${source.name}: sources / lock manager不一致`);
    }
    if (source.ownership === "plugin") continue;
    if (lock.ownership === "plugin") {
      errors.push(`${source.name}: ownership不一致`);
      continue;
    }
    try {
      const tree = readInstalledTree(repositoryRoot, source.target, source.name);
      if (tree.treeHash !== lock.treeHash || tree.fileCount !== lock.fileCount || tree.byteCount !== lock.byteCount) {
        errors.push(`${source.name}: installed treeがlockと不一致`);
      }
      if (source.ownership === "remote" && lock.ownership === "remote") {
        const reviewedLegal = source.legalMappings.map((mapping) => ({
          sourcePath: mapping.sourcePath,
          targetPath: mapping.targetPath,
          sha256: mapping.expectedSha256,
        }));
        if (!sameLegalFiles(lock.legalFiles, reviewedLegal)) {
          errors.push(`${source.name}: reviewed legal mappingsがlockと不一致`);
        }
        const installedByPath = new Map(tree.files.map((file) => [file.path, file]));
        const actualLegal = lock.legalFiles.map((file) => {
          const installed = installedByPath.get(file.targetPath);
          if (installed === undefined) throw new Error(`legal targetがinstalled treeにありません: ${file.targetPath}`);
          return { ...file, sha256: sha256(installed.content) };
        });
        if (!sameLegalFiles(lock.legalFiles, actualLegal)) errors.push(`${source.name}: legal filesがlockと不一致`);
      }
    } catch (error: unknown) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    const local = readLocalObservations(repositoryRoot, state.sources);
    for (const observation of local) {
      const lock = lockByName.get(observation.name);
      if (lock?.ownership !== "local" || !sameLegalFiles(lock.legalFiles, observation.legalFiles)) {
        errors.push(`${observation.name}: repository-level legal filesがlockと不一致`);
      }
    }
  } catch (error: unknown) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  for (const source of state.sources.skills.filter((entry) => entry.ownership !== "plugin")) {
    const expected = `../../.agents/skills/${source.name}`;
    for (const root of [".claude/skills", ".codex/skills"]) {
      const path = join(repositoryRoot, ...root.split("/"), source.name);
      try {
        const stat = lstatSync(path);
        if (!stat.isSymbolicLink() || readlinkSync(path) !== expected) {
          errors.push(`${root}/${source.name}: symlink不一致`);
        }
      } catch {
        errors.push(`${root}/${source.name}: symlink欠落`);
      }
    }
  }
  return errors;
}
