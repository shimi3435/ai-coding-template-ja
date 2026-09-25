import { closeSync, constants, fstatSync, lstatSync, opendirSync, openSync, readFileSync, readlinkSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeTree, utf8Compare, validateCanonicalPath, type CanonicalTree, type TreeFile } from "./canonical.ts";
import { validateInstalledTraversalPath, validateInstalledFilePaths } from "./installed-path.ts";
import { resourceLimits, sha256, validateSkillLimits } from "./legal.ts";
import { parseSkillMetadata } from "./metadata.ts";

export function readVendoredSkillNames(repositoryRoot: string): readonly string[] {
  return readdirSync(join(repositoryRoot, ".agents", "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
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
  try {
    const tracked = readonlyGit(repositoryRoot, ["--literal-pathspecs", "ls-files", "--error-unmatch", "-z", "--", path]);
    return tracked.equals(Buffer.from(`${path}\0`));
  } catch {
    return false;
  }
}

// 隔離操作は固定commitを読み、通常検証は現在checkoutを読む。
import { readonlyGit, assertSafeParents } from "./isolation.ts";
import { decodeSourcesJson as decodeV2Sources, decodeLockJson as decodeV2Lock } from "./schema.ts";
import { validateSkillTree } from "./metadata.ts";
import type { SourcesDocument as V2Sources, LockDocument as V2Lock } from "./types.ts";

export type CommittedEntry = Readonly<{ path: string; mode: string; sha: string }>;
export type CommittedSnapshot = Readonly<{
  root: string; base: string; entries: ReadonlyMap<string, CommittedEntry>;
  readFile: (path: string) => Buffer;
  readTree: (target: string, name: string) => CanonicalTree;
}>;
export function readCommittedSnapshot(root: string, base: string): CommittedSnapshot {
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error("完全な開始commit SHAが必要です");
  if (readonlyGit(root,["rev-parse",`${base}^{commit}`]).toString().trim()!==base) throw new Error("開始commitが一致しません");
  const raw=readonlyGit(root,["ls-tree","-rz","--full-tree",base]);
  const text=new TextDecoder("utf-8",{fatal:true}).decode(raw);
  const entries=new Map<string,CommittedEntry>();
  for (const record of text.split("\0").filter(Boolean)) {
    const match=/^(\d{6}) (?:blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error("Git tree entry不正");
    entries.set(match[3]!,{path:match[3]!,mode:match[1]!,sha:match[2]!});
  }
  const readFile=(path:string):Buffer=>{
    validateCanonicalPath(path); const entry=entries.get(path);
    if (!entry || !["100644","100755"].includes(entry.mode)) throw new Error(`tracked regular fileが必要です: ${path}`);
    const size=Number(readonlyGit(root,["cat-file","-s",entry.sha]).toString().trim());
    if (!Number.isSafeInteger(size) || size<0 || size>resourceLimits.singleFileBytes) throw new Error("snapshot file上限超過");
    return readonlyGit(root,["cat-file","blob",entry.sha]);
  };
  const readTree=(target:string,name:string):CanonicalTree=>{
    validateCanonicalPath(target); const files:TreeFile[]=[];
    validateInstalledFilePaths([...entries.keys()].filter(p=>p.startsWith(`${target}/`)).map(p=>p.slice(target.length+1)));
    for (const entry of entries.values()) if (entry.path.startsWith(`${target}/`)) {
      const path=entry.path.slice(target.length+1); validateInstalledTraversalPath(path);
      files.push({path,executable:entry.mode==="100755",content:readFile(entry.path)});
      validateSkillLimits(files);
    }
    return validateSkillTree(files,name);
  };
  return {root,base,entries,readFile,readTree};
}
export function readRepositorySkillState(root: string): Readonly<{ sources:V2Sources; lock:V2Lock }> {
  const read=(name:string):Buffer=>{
    const absolute=join(root,".agents/skills",name); assertSafeParents(root,absolute);
    return readBoundedRegularFile(absolute,name).content;
  };
  return {sources:decodeV2Sources(read("skills.sources.json")),lock:decodeV2Lock(read("skills.lock.json"))};
}
export function verifyRepository(root: string): readonly string[] {
  const errors:string[]=[];
  try {
    const state=readRepositorySkillState(root);
    decodeV2Lock(JSON.stringify(state.lock),state.sources);
    const declared=new Set(state.sources.skills.filter(s=>s.ownership!=="plugin").map(s=>s.name));
    for (const name of readVendoredSkillNames(root)) if (!declared.has(name)) throw new Error(`未宣言Skill: ${name}`);
    for (const source of state.sources.skills) {
      if (source.ownership==="plugin") continue;
      assertSafeParents(root,join(root,source.target,"SKILL.md"));
      const tree=readInstalledTree(root,source.target,source.name);
      if (source.ownership==="remote") {
        const lock=state.lock.skills.find(l=>l.name===source.name)!;
        if (tree.treeHash!==lock.treeHash || tree.fileCount!==lock.fileCount || tree.byteCount!==lock.byteCount) throw new Error(`remote tree / lock不一致: ${source.name}`);
        for (const legal of source.legalMappings) {
          const file=tree.files.find(f=>f.path===legal.targetPath);
          if (!file || sha256(file.content)!==legal.expectedSha256) throw new Error(`remote legal不一致: ${source.name}`);
        }
      } else for (const legal of source.legalMappings) {
        const absolute=join(root,legal.path); assertSafeParents(root,absolute);
        if (!isTrackedPath(root,legal.path) || readBoundedRegularFile(absolute,legal.path).sha256!==legal.expectedSha256) throw new Error(`local legal不一致: ${source.name}`);
      }
      for (const linkRoot of [".claude/skills",".codex/skills"]) {
        const path=join(root,linkRoot,source.name); assertSafeParents(root,path);
        if (!lstatSync(path).isSymbolicLink() || readlinkSync(path)!==`../../.agents/skills/${source.name}`) throw new Error(`link不一致: ${source.name}`);
      }
    }
  } catch(error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return errors;
}
