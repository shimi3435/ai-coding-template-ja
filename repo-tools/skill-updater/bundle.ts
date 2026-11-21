import { canonicalizeTree, utf8Compare, type CanonicalTree, type TreeFile } from "./canonical.ts";
import { validateInstalledFilePaths } from "./installed-path.ts";
import { sha256 } from "./legal.ts";
import type { BundleDescriptor, BundleFileDigest, RemoteSource } from "./types.ts";

/** 通常Skillの受理条件には触れず、全祖先の表記と種別を検査する。 */
export function bundleInventory(paths: readonly string[]): ReadonlyMap<string, "file" | "directory"> {
  validateInstalledFilePaths(paths);
  const folded = new Map<string, { path: string; kind: "file" | "directory" }>();
  const inventory = new Map<string, "file" | "directory">();
  for (const path of paths) {
    const parts = path.split("/");
    for (let n = 1; n <= parts.length; n++) {
      const p = parts.slice(0, n).join("/");
      const kind = n === parts.length ? "file" : "directory";
      const key = p.replace(/[A-Z]/g, c => c.toLowerCase());
      const old = folded.get(key);
      if (old && (old.path !== p || old.kind !== kind || kind === "file")) throw new Error(`bundle path collision: ${old.path} / ${p}`);
      folded.set(key, { path: p, kind }); inventory.set(p, kind);
    }
  }
  return inventory;
}
function record(v: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("bundle objectが必要です");
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== fields.length || fields.some(k => !Object.hasOwn(o, k))) throw new Error("bundle fields不正");
  return o;
}
function number(v: unknown, max: number, min = 0): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) throw new Error("bundle integer / limits不正");
  return v;
}
function boolean(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("bundle executableはbooleanが必要です");
  return v;
}
function path(v: unknown): string {
  if (typeof v !== "string" || !v.trim() || !v.isWellFormed()) throw new Error("bundle path不正");
  return v;
}
export function decodeBundle(v: unknown): BundleDescriptor {
  const o = record(v, ["files", "limits"]); const l = record(o.limits, ["files", "singleFileBytes", "totalBytes"]);
  const limits = { files: number(l.files, 100, 1), singleFileBytes: number(l.singleFileBytes, 1048576, 1), totalBytes: number(l.totalBytes, 2097152, 1) };
  if (!Array.isArray(o.files) || !o.files.length || o.files.length > limits.files) throw new Error("bundle file数上限不正");
  const files = o.files.map(v => { const f = record(v, ["path", "executable"]); return { path: path(f.path), executable: boolean(f.executable) }; }).sort((a,b) => utf8Compare(a.path,b.path));
  bundleInventory(files.map(f => f.path));
  return { files, limits };
}
export function validateBundleSource(s: RemoteSource): void {
  if (!s.bundle) return;
  if (!("root" in s.subtree) || !("tag" in s.ref) || Object.hasOwn(s,"legacyRef")) throw new Error("bundleはroot / tag専用、legacyRef禁止です");
  for (const m of s.legalMappings) {
    if (m.sourcePath !== m.targetPath || !s.bundle.files.some(f => f.path === m.sourcePath && !f.executable)) throw new Error("bundle legalは一覧内の同名非実行fileが必要です");
  }
}
export function validateBundleSizes(bundle: BundleDescriptor, files: readonly { path: string; byteCount: number; executable: boolean }[]): void {
  if (files.length !== bundle.files.length || files.length > bundle.limits.files) throw new Error("bundle file集合不一致");
  bundleInventory(files.map(f => f.path));
  let total = 0;
  for (const f of files) {
    if (!bundle.files.some(d => d.path === f.path && d.executable === f.executable)) throw new Error(`bundle file / executable不一致: ${f.path}`);
    total += number(f.byteCount, bundle.limits.singleFileBytes);
  }
  number(total, bundle.limits.totalBytes);
}
export function bundleFileDigests(tree: CanonicalTree): readonly BundleFileDigest[] {
  return tree.files.map(f => ({ path: f.path, sha256: sha256(f.content), byteCount: f.content.length, executable: f.executable }));
}
export function decodeBundleDigests(v: unknown, bundle: BundleDescriptor): readonly BundleFileDigest[] {
  if (!Array.isArray(v)) throw new Error("bundle fileDigests必須");
  const files = v.map(v => {
    const f = record(v, ["path", "sha256", "byteCount", "executable"]);
    if (typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256)) throw new Error("bundle sha256不正");
    return { path: path(f.path), sha256: f.sha256, byteCount: number(f.byteCount, bundle.limits.singleFileBytes), executable: boolean(f.executable) };
  }).sort((a,b) => utf8Compare(a.path,b.path));
  validateBundleSizes(bundle, files); return files;
}
export function validateBundleTree(files: readonly TreeFile[], bundle: BundleDescriptor): CanonicalTree {
  validateBundleSizes(bundle, files.map(f => ({ path: f.path, executable: f.executable, byteCount: f.content.length })));
  return canonicalizeTree(files);
}

export function validateBundleMode(mode: number, executable: boolean, directory = false): void {
  const permissions = mode & 0o7777;
  const required = executable || directory ? 0o500 : 0o400;
  if ((permissions & 0o7022) !== 0 || (permissions & required) !== required || (!executable && !directory && (permissions & 0o111) !== 0)) throw new Error("bundle POSIX権限不正");
}

import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync, type Stats } from "node:fs";
import { join } from "node:path";
import { assertSafeParents } from "./isolation.ts";

export function validateBundleDirectory(absolute: string): void {
  const s = lstatSync(absolute);
  if (!s.isDirectory() || s.isSymbolicLink()) throw new Error("bundle directory種別不正");
  validateBundleMode(s.mode, true, true);
}
/** 新規追加では未作成rootを許可し、既存rootは全書込み前に検査する。 */
export function validateExistingVendorRoot(root: string, bundleNames: readonly string[]): void {
  const target = join(root,".agents/vendor");
  assertSafeParents(root,target);
  if (!lstatSync(target,{throwIfNoEntry:false})) return;
  validateBundleDirectory(target);
  const dir = opendirSync(target);
  try {
    for (let entry = dir.readSync(); entry !== null; entry = dir.readSync()) {
      if (!bundleNames.includes(entry.name)) throw new Error(`未宣言bundle directory: ${entry.name}`);
      const stat = lstatSync(join(target,entry.name));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("bundle directory種別不正");
    }
  } finally { dir.closeSync(); }
}
function sameFile(before: Stats, after: Stats): boolean {
  return after.isFile() && after.nlink === 1 && before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mode === after.mode && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}
export function readLiveBundle(root: string, source: RemoteSource): CanonicalTree {
  const bundle = source.bundle!;
  const target = join(root, source.target);
  assertSafeParents(root, join(target,"placeholder"));
  validateBundleDirectory(join(root,".agents/vendor"));
  validateBundleDirectory(target);
  const inventory = bundleInventory(bundle.files.map(f=>f.path));
  const observed = new Set<string>();
  const pending = [""];
  const stats = new Map<string,Stats>();
  while (pending.length) {
    const parent = pending.pop()!;
    const dir = opendirSync(join(target,parent));
    try {
      for (let e = dir.readSync(); e !== null; e = dir.readSync()) {
        const path = parent ? `${parent}/${e.name}` : e.name;
        const kind = inventory.get(path);
        if (!kind || observed.has(path)) throw new Error(`bundle余剰path: ${path}`);
        observed.add(path);
        const absolute = join(target,path); const s = lstatSync(absolute);
        if (kind === "directory") { validateBundleDirectory(absolute); pending.push(path); }
        else {
          if (!s.isFile() || s.nlink !== 1) throw new Error(`bundle special file / hardlink: ${path}`);
          const declared = bundle.files.find(f=>f.path===path)!;
          validateBundleMode(s.mode,declared.executable);
          stats.set(path,s);
        }
      }
    } finally { dir.closeSync(); }
  }
  if (observed.size !== inventory.size) throw new Error("bundle required path欠落");
  validateBundleSizes(bundle,[...stats].map(([path,s])=>({path,executable:(s.mode&0o100)!==0,byteCount:s.size})));
  const files: TreeFile[] = [];
  for (const [path, before] of stats) {
    const absolute = join(target,path); assertSafeParents(root,absolute);
    const fd = openSync(absolute,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try {
      if (!sameFile(before,fstatSync(fd))) throw new Error("bundle読込前identity変化");
      const content = Buffer.alloc(before.size); let offset=0;
      while(offset<content.length) { const n=readSync(fd,content,offset,content.length-offset,offset); if(!n)break; offset+=n; }
      if (offset!==content.length || !sameFile(before,fstatSync(fd)) || !sameFile(before,lstatSync(absolute))) throw new Error("bundle読込中identity / size変化");
      files.push({path,executable:(before.mode&0o100)!==0,content});
    } finally { closeSync(fd); }
  }
  return validateBundleTree(files,bundle);
}
