import { validateBundleTree } from "./bundle.ts";
import { decodeSourcesJson, decodeLockJson, serializeSources, serializeLock } from "./schema.ts";
import { verifyRemoteBefore, type MaintenancePlan } from "./planner.ts";
import { validateSkillTree } from "./metadata.ts";
import { sha256 } from "./legal.ts";
import type { CanonicalTree } from "./canonical.ts";
import type { SourcesDocument, LockDocument, LocalSource, RemoteSource, RemoteLock } from "./types.ts";
import type { CommittedSnapshot } from "./repository.ts";

export function localFromRemote(source:RemoteSource,lock:RemoteLock):LocalSource {
  if(source.bundle)throw new Error("bundleのadopt-localは非対応です");
  return {name:source.name,ownership:"local",license:source.license,redistribution:"allowed",target:source.target,
    legalMappings:source.legalMappings.map(m=>({path:`${source.target}/${m.targetPath}`,expectedSha256:m.expectedSha256})),
    origin:{repository:source.repository,subtree:source.subtree,ref:source.ref,resolvedCommit:lock.resolvedCommit,legalMappings:source.legalMappings,
      ...(lock.tagObjectSha?{tagObjectSha:lock.tagObjectSha}:{}),...(source.legacyRef?{legacyRef:source.legacyRef}:{})}};
}
export function readSnapshotTrees(snapshot:CommittedSnapshot,sources:SourcesDocument,lock?:LockDocument):ReadonlyMap<string,CanonicalTree> {
  const trees=new Map<string,CanonicalTree>();
  const declared=new Set(sources.skills.filter(s=>s.ownership!=="plugin" && !(s.ownership==="remote" && s.bundle)).map(s=>s.name));
  for(const [path, entry] of snapshot.entries) if(path.startsWith(".agents/skills/") && (path.split("/").length>3 || ["120000", "160000"].includes(entry.mode)) && !declared.has(path.split("/")[2]!)) throw new Error(`未宣言Skill: ${path}`);
  const bundles=new Set(sources.skills.filter(s=>s.ownership==="remote" && s.bundle).map(s=>s.name));
  for(const [path] of snapshot.entries) if(path===".agents/vendor" || path.startsWith(".agents/vendor/")) {
    if(path.split("/").length<4 || !bundles.has(path.split("/")[2]!))throw new Error(`未宣言bundle / vendor種別不正: ${path}`);
  }
  for(const source of sources.skills) {
    if(source.ownership==="plugin")continue;
    if(source.ownership==="remote" && ![...snapshot.entries.keys()].some(p=>p===source.target || p.startsWith(`${source.target}/`)))continue;
    trees.set(source.name,snapshot.readTree(source.target,source.name,source.ownership==="remote" ? (lock?.skills.find(l=>l.name===source.name)?.bundle ?? source.bundle) : undefined));
    if(source.ownership==="local") for(const mapping of source.legalMappings) if(sha256(snapshot.readFile(mapping.path))!==mapping.expectedSha256) throw new Error(`local legal不一致: ${source.name}`);
  }
  return trees;
}
export function adoptLocal(input:Readonly<{sources:SourcesDocument;lock:LockDocument;installedTrees:ReadonlyMap<string,CanonicalTree>}>,name:string):MaintenancePlan {
  const sources=decodeSourcesJson(serializeSources(input.sources)); const lock=decodeLockJson(serializeLock(input.lock),sources);
  const selected=sources.skills.find(s=>s.name===name);
  if(!selected || selected.ownership==="plugin" || (selected.ownership==="local" && !selected.origin)) throw new Error("外部由来Skillだけlocal化できます");
  if(selected.ownership==="remote" && selected.bundle)throw new Error("bundleのadopt-localは非対応です");
  for(const source of sources.skills) {
    if(source.ownership==="plugin")continue;
    const tree=input.installedTrees.get(source.name); if(!tree)throw new Error("Skill本文欠落");
    if(source.ownership==="remote" && source.bundle)validateBundleTree(tree.files,source.bundle);else validateSkillTree(tree.files,source.name);
    if(source.ownership==="remote") verifyRemoteBefore(source,lock.skills.find(l=>l.name===source.name)!,tree,source.name===name);
    else if(source.origin) for(const mapping of source.origin.legalMappings) {
      const file=tree.files.find(f=>f.path===mapping.targetPath);
      if(!file || sha256(file.content)!==mapping.expectedSha256)throw new Error("外部由来local legal不一致");
    }
  }
  if(selected.ownership==="local")return {sources,lock,trees:new Map(),changes:[],warnings:[]};
  const previous=lock.skills.find(l=>l.name===name)!;
  const converted=localFromRemote(selected,previous);
  const next=decodeSourcesJson(serializeSources({schemaVersion:2,skills:sources.skills.map(s=>s.name===name?converted:s)}));
  const nextLock=decodeLockJson(serializeLock({schemaVersion:2,skills:lock.skills.filter(l=>l.name!==name)}),next);
  return {sources:next,lock:nextLock,trees:new Map(),changes:[{name,beforeCommit:previous.resolvedCommit,afterCommit:null,beforeOwnership:"remote",afterOwnership:"local"}],warnings:[]};
}

import { readonlyGit } from "./isolation.ts";
export function verifySnapshotLinks(snapshot:CommittedSnapshot,sources:SourcesDocument):void {
  for(const s of sources.skills) if(s.ownership!=="plugin" && !(s.ownership==="remote" && s.bundle)) for(const root of [".claude/skills",".codex/skills"]) {
    const entry=snapshot.entries.get(`${root}/${s.name}`);
    if(!entry || entry.mode!=="120000" || readonlyGit(snapshot.root,["cat-file","blob",entry.sha]).toString("utf8")!==`../../.agents/skills/${s.name}`) throw new Error(`snapshot link不一致: ${s.name}`);
  }
}
