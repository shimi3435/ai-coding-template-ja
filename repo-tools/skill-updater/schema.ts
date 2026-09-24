import { utf8Compare, validateCanonicalPath } from "./canonical.ts";
import type { SourcesDocument, LockDocument, SkillSource, RemoteSource, RemoteLock, SourceRef, SubtreeSelector, RemoteLegalMapping, LocalLegalMapping, LegacyRef, Origin } from "./types.ts";

export const metadataBytesLimit = 10 * 1_048_576;
const fold = (s: string): string => s.replace(/[A-Z]/g, c => c.toLowerCase());
function object(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("metadata objectが必要です");
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => !required.includes(k) && !optional.includes(k))) throw new Error("metadata fields不正");
}
function string(v: unknown): string {
  if (typeof v !== "string" || !v.trim() || !v.isWellFormed()) throw new Error("空でないvalid stringが必要です");
  return v;
}
function path(v: unknown): string { return validateCanonicalPath(string(v)); }
function hash(v: unknown, length: number): string {
  const s = string(v);
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(s)) throw new Error(`lowercase ${length}-hexが必要です`);
  return s;
}
function count(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("非負safe integerが必要です");
  return v;
}
function array(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error("arrayが必要です");
  return v;
}
function unique(paths: readonly string[]): void {
  const seen = new Set<string>();
  for (const p of paths) {
    const f = fold(p);
    if (seen.has(f)) throw new Error(`重複 / case-fold衝突: ${p}`);
    seen.add(f);
  }
}
function repository(v: unknown): string {
  const s = string(v);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) || s.split("/").some(p => p === "." || p === "..")) throw new Error("repositoryはowner/nameが必要です");
  return s.toLowerCase();
}
export function validateRefName(v: unknown): string {
  const s = string(v);
  if (s === "@" || s.startsWith("-") || s.startsWith("refs/") || /^[0-9a-fA-F]{4,40}$/.test(s) || /[\x00-\x20\x7f~^:?*\[\\]/.test(s) || s.includes("..") || s.includes("@{") || s.endsWith(".") || s.split("/").some(p => !p || p.startsWith(".") || p.endsWith(".lock"))) throw new Error("Git ref短縮名が不正です");
  return s;
}
function ref(v: unknown): SourceRef {
  const o = object(v); const ks = Object.keys(o);
  if (ks.length !== 1) throw new Error("refは厳密な一択です");
  if (ks[0] === "branch") return { branch: validateRefName(o.branch) };
  if (ks[0] === "tag") return { tag: validateRefName(o.tag) };
  if (ks[0] === "commit") return { commit: hash(o.commit, 40) };
  throw new Error("ref variant不正");
}
function subtree(v: unknown): SubtreeSelector {
  const o = object(v);
  if (Object.hasOwn(o, "root")) { keys(o, ["root"]); if (o.root !== true) throw new Error("rootはtrueが必要です"); return { root: true }; }
  keys(o, ["path"]); return { path: path(o.path) };
}
function legacy(v: unknown): LegacyRef {
  const o = object(v); keys(o, ["semver", "selectedTag", "selectedVersion"]);
  return { semver: string(o.semver), selectedTag: string(o.selectedTag), selectedVersion: string(o.selectedVersion) };
}
function remoteMappings(v: unknown): RemoteLegalMapping[] {
  const result = array(v).map(item => {
    const o = object(item); keys(o, ["sourcePath", "targetPath", "expectedSha256"]);
    return { sourcePath: path(o.sourcePath), targetPath: path(o.targetPath), expectedSha256: hash(o.expectedSha256, 64) };
  });
  if (!result.length) throw new Error("legalMappingsは1件以上必要です");
  unique(result.map(m => m.targetPath));
  return result.sort((a,b) => utf8Compare(a.targetPath,b.targetPath) || utf8Compare(a.sourcePath,b.sourcePath));
}
function localMappings(v: unknown): LocalLegalMapping[] {
  const result = array(v).map(item => {
    const o = object(item); keys(o, ["path", "expectedSha256"]);
    return { path: path(o.path), expectedSha256: hash(o.expectedSha256,64) };
  });
  if (!result.length) throw new Error("legalMappingsは1件以上必要です");
  unique(result.map(m => m.path));
  return result.sort((a,b) => utf8Compare(a.path,b.path));
}
function origin(v: unknown): Origin {
  const o = object(v); keys(o, ["repository", "subtree", "ref", "resolvedCommit", "legalMappings"], ["tagObjectSha", "legacyRef"]);
  const r = ref(o.ref); const commit = hash(o.resolvedCommit,40);
  validatePinnedRef(r,commit,o.tagObjectSha);
  return { repository: repository(o.repository), subtree: subtree(o.subtree), ref: r, resolvedCommit: commit, legalMappings: remoteMappings(o.legalMappings),
    ...("tag" in r ? { tagObjectSha: hash(o.tagObjectSha,40) } : {}), ...(o.legacyRef === undefined ? {} : { legacyRef: legacy(o.legacyRef) }) };
}
function validatePinnedRef(r: SourceRef, commit: string, tag: unknown): void {
  if (("tag" in r) !== (tag !== undefined)) throw new Error("tagObjectShaはtagだけに必須です");
  if ("tag" in r) hash(tag,40);
  if ("commit" in r && r.commit !== commit) throw new Error("commit ref / resolvedCommit不一致");
}
const commonKeys = ["name", "ownership", "license", "redistribution"];
function source(v: unknown): SkillSource {
  const o = object(v); const name = path(o.name);
  if (name.includes("/")) throw new Error("nameは単一segmentが必要です");
  const common = { name, ownership: o.ownership, license: string(o.license), redistribution: o.redistribution };
  if (o.ownership === "plugin") {
    keys(o,[...commonKeys,"manager"]);
    if (o.redistribution !== "allowed" && o.redistribution !== "blocked") throw new Error("redistribution不正");
    return { ...common, ownership: "plugin", redistribution: o.redistribution, manager: string(o.manager) };
  }
  if (o.redistribution !== "allowed") throw new Error("redistributionはallowedが必要です");
  const target = path(o.target);
  if (target !== `.agents/skills/${name}`) throw new Error("target不一致");
  if (o.ownership === "remote") {
    keys(o,[...commonKeys,"target","repository","ref","subtree","legalMappings"],["legacyRef"]);
    return { ...common, ownership: "remote", redistribution: "allowed", target, repository: repository(o.repository), ref: ref(o.ref), subtree: subtree(o.subtree), legalMappings: remoteMappings(o.legalMappings), ...(o.legacyRef === undefined ? {} : { legacyRef: legacy(o.legacyRef) }) };
  }
  if (o.ownership === "local") {
    keys(o,[...commonKeys,"target","legalMappings"],["origin"]);
    const mappings = localMappings(o.legalMappings); const provenance = o.origin === undefined ? undefined : origin(o.origin);
    if (provenance && JSON.stringify(mappings) !== JSON.stringify(localMappings(provenance.legalMappings.map(m => ({ path: `${target}/${m.targetPath}`, expectedSha256: m.expectedSha256 }))))) throw new Error("origin / local legalMappings不一致");
    return { ...common, ownership: "local", redistribution: "allowed", target, legalMappings: mappings, ...(provenance ? { origin: provenance } : {}) };
  }
  throw new Error("ownership不正");
}

// JSON.parseで構文を検査した後、文字列をtokenとして扱い重複keyを検出する。
// escape済みkeyもdecodeして比較し、後勝ちで承認情報を解釈しない。
export function parseMetadataJson(input: string | Buffer): unknown {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!bytes.length || bytes.length > metadataBytesLimit) throw new Error("metadataは1 byte以上10 MiB以下が必要です");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  const stack: Array<{ keys?: Set<string>; expectingKey: boolean }> = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]/g)) {
    const token = match[0]; const top = stack.at(-1);
    if (token === "{") stack.push({ keys: new Set(), expectingKey: true });
    else if (token === "[") stack.push({ expectingKey: false });
    else if (token === "}" || token === "]") stack.pop();
    else if (token === "," && top?.keys) top.expectingKey = true;
    else if (token.startsWith('"') && top?.keys && top.expectingKey) {
      const key = JSON.parse(token) as string;
      if (top.keys.has(key)) throw new Error(`JSON重複key: ${key}`);
      top.keys.add(key); top.expectingKey = false;
    }
  }
  return value;
}
function document(input: string | Buffer): unknown[] {
  const o = object(parseMetadataJson(input)); keys(o,["schemaVersion","skills"]);
  if (o.schemaVersion !== 2) throw new Error("schemaVersionは2が必要です");
  const entries = array(o.skills);
  if (entries.length > 500) throw new Error("skillsは500件以下が必要です");
  return entries;
}
export function decodeSourcesJson(input: string | Buffer): SourcesDocument {
  const skills = document(input).map(source); unique(skills.map(s => s.name));
  return { schemaVersion: 2, skills };
}
function lockEntry(v: unknown): RemoteLock {
  const o = object(v);
  keys(o,[...commonKeys,"target","repository","ref","subtree","resolvedCommit","verification","treeHash","fileCount","byteCount","legalFiles"],["tagObjectSha","legacyRef"]);
  if (o.ownership !== "remote") throw new Error("lockはremote専用です");
  const mappings = array(o.legalFiles).map(v => { const f=object(v); keys(f,["sourcePath","targetPath","sha256"]); return { sourcePath: f.sourcePath, targetPath: f.targetPath, expectedSha256: f.sha256 }; });
  const s = source(Object.fromEntries([...commonKeys,"target","repository","ref","subtree",...(o.legacyRef === undefined ? [] : ["legacyRef"])].map(k=>[k,o[k]]).concat([["legalMappings",mappings]]))) as RemoteSource;
  const commit = hash(o.resolvedCommit,40); validatePinnedRef(s.ref,commit,o.tagObjectSha);
  if (typeof o.verification !== "string" || !["verified","unverified","unknown"].includes(o.verification)) throw new Error("verification不正");
  const { legalMappings, ...rest } = s;
  return { ...rest, resolvedCommit: commit, verification: o.verification as RemoteLock["verification"],
    ...("tag" in s.ref ? { tagObjectSha: hash(o.tagObjectSha,40) } : {}), treeHash: hash(o.treeHash,64), fileCount: count(o.fileCount), byteCount: count(o.byteCount),
    legalFiles: legalMappings.map(m=>({ sourcePath: m.sourcePath, targetPath: m.targetPath, sha256: m.expectedSha256 })) };
}
export function sourceFromLock(lock: RemoteLock): RemoteSource {
  return source({ name: lock.name, ownership: lock.ownership, license: lock.license, redistribution: lock.redistribution, target: lock.target, repository: lock.repository, ref: lock.ref, subtree: lock.subtree,
    legalMappings: lock.legalFiles.map(f=>({ sourcePath:f.sourcePath,targetPath:f.targetPath,expectedSha256:f.sha256 })), ...(lock.legacyRef ? { legacyRef: lock.legacyRef } : {}) }) as RemoteSource;
}
export function validateLockStructure(lock: LockDocument, sources: SourcesDocument): void {
  const remote = sources.skills.filter(s=>s.ownership === "remote");
  if (remote.length !== lock.skills.length) throw new Error("remote source / lock件数不一致");
  for (const l of lock.skills) {
    const s = remote.find(s=>s.name===l.name);
    if (!s || JSON.stringify(source(s)) !== JSON.stringify(sourceFromLock(l))) throw new Error(`source / lock不一致: ${l.name}`);
  }
}
export function decodeLockJson(input: string | Buffer, sources?: SourcesDocument): LockDocument {
  const skills=document(input).map(lockEntry); unique(skills.map(s=>s.name));
  const lock={ schemaVersion: 2 as const, skills };
  if (sources) validateLockStructure(lock,sources);
  return lock;
}
export function serializeSources(doc: SourcesDocument): string {
  return `${JSON.stringify({ schemaVersion: 2, skills: [...doc.skills].sort((a,b)=>utf8Compare(a.name,b.name)).map(source) },null,2)}\n`;
}
export function serializeLock(doc: LockDocument): string {
  return `${JSON.stringify({ schemaVersion: 2, skills: [...doc.skills].sort((a,b)=>utf8Compare(a.name,b.name)).map(lockEntry) },null,2)}\n`;
}
