import { validateBundleTree, validateBundleMode, readLiveBundle } from "./bundle.ts";
import { verifyRemoteBefore } from "./planner.ts";
import { constants, openSync, closeSync, writeFileSync, fchmodSync, chmodSync, mkdirSync, rmSync, lstatSync, readlinkSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { recheckIsolation, assertSafeParents, type IsolatedCandidate } from "./isolation.ts";
import { serializeSources, serializeLock, decodeLockJson, sourceFromLock } from "./schema.ts";
import { verifyRepository, readRepositorySkillState } from "./repository.ts";
import { validateSkillTree } from "./metadata.ts";
import type { CanonicalTree } from "./canonical.ts";
import type { SourcesDocument, LockDocument } from "./types.ts";
export type CandidatePlan = Readonly<{ sources:SourcesDocument; lock:LockDocument; trees:ReadonlyMap<string,CanonicalTree> }>;
export function applyCandidate(candidate:IsolatedCandidate, plan:CandidatePlan, afterWrite?:(path:string)=>void):void {
  const sourcesBytes=serializeSources(plan.sources); const lockBytes=serializeLock(plan.lock);
  decodeLockJson(lockBytes,plan.sources);
  for (const [name,tree] of plan.trees) {
    const source=plan.sources.skills.find(s=>s.name===name);
    if (!source || source.ownership!=="remote") throw new Error("remote対象以外の本文書込みを拒否しました");
    if(source.bundle)validateBundleTree(tree.files,source.bundle);else validateSkillTree(tree.files,name);
  }
  const umask=process.umask();
  const directoryMode=0o755 & (~umask & 0o777);
  const bundleMode=(executable:boolean)=>(executable?0o755:0o644) & (~umask & 0o777);
  for(const [name,tree] of plan.trees) {
    const source=plan.sources.skills.find(s=>s.name===name)!;
    if(source.ownership!=="remote" || !source.bundle)continue;
    validateBundleMode(directoryMode,true,true);
    for(const file of tree.files)validateBundleMode(bundleMode(file.executable),file.executable);
  }
  recheckIsolation(candidate);
  if(plan.sources.skills.some(s=>s.ownership==="remote" && s.bundle)) {
    const previous=readRepositorySkillState(candidate.candidate);
    for(const lock of previous.lock.skills) if(lock.bundle) {
      const old=sourceFromLock(lock);verifyRemoteBefore(old,lock,readLiveBundle(candidate.candidate,old));
    }
  }
  // 全link衝突は本文の適用より前に拒否する。
  for (const source of plan.sources.skills) if (source.ownership!=="plugin" && !(source.ownership==="remote" && source.bundle)) for (const base of [".claude/skills",".codex/skills"]) {
    const path=join(candidate.candidate,base,source.name); assertSafeParents(candidate.candidate,path);
    const stat=lstatSync(path,{throwIfNoEntry:false}); if (stat && !stat.isSymbolicLink()) throw new Error("linkの非symlink衝突");
  }
  const bundleParents=(path:string):void=>{
    let current=candidate.candidate;
    for(const part of path.split("/").slice(0,-1)) {
      current=join(current,part);
      if(lstatSync(current,{throwIfNoEntry:false}))continue;
      mkdirSync(current,{mode:directoryMode});chmodSync(current,directoryMode);
      if((lstatSync(current).mode&0o7777)!==directoryMode)throw new Error("bundle directory生成mode不一致");
    }
  };
  const write=(path:string,content:Buffer|string,executable=false,bundle=false):void=>{
    const absolute=join(candidate.candidate,path); assertSafeParents(candidate.candidate,absolute);
    if(bundle)bundleParents(path);else mkdirSync(dirname(absolute),{recursive:true});
    const mode=bundle?bundleMode(executable):(executable?0o755:0o644);
    const fd=openSync(absolute,constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW,mode);
    try { writeFileSync(fd,content); fchmodSync(fd,mode);
      if(bundle && (lstatSync(absolute).mode&0o7777)!==mode)throw new Error("bundle file生成mode不一致"); } finally { closeSync(fd); }
    afterWrite?.(path);
  };
  for (const [name,tree] of plan.trees) {
    const target=plan.sources.skills.find(s=>s.name===name)!;
    if (target.ownership!=="remote") throw new Error("remote対象ではありません");
    rmSync(join(candidate.candidate,target.target),{recursive:true,force:true});
    for (const file of tree.files) write(`${target.target}/${file.path}`,file.content,file.executable,Boolean(target.bundle));
  }
  write(".agents/skills/skills.sources.json",sourcesBytes);
  write(".agents/skills/skills.lock.json",lockBytes);
  for (const source of plan.sources.skills) if (source.ownership!=="plugin" && !(source.ownership==="remote" && source.bundle)) for (const base of [".claude/skills",".codex/skills"]) {
    const path=join(candidate.candidate,base,source.name); const expected=`../../.agents/skills/${source.name}`;
    if (lstatSync(path,{throwIfNoEntry:false})?.isSymbolicLink()) {
      if (readlinkSync(path)===expected) continue;
      rmSync(path);
    }
    mkdirSync(dirname(path),{recursive:true}); symlinkSync(expected,path); afterWrite?.(`${base}/${source.name}`);
  }
  const errors=verifyRepository(candidate.candidate);
  if (errors.length) throw new Error(`最終offline verify失敗: ${errors.join("; ")}`);
}
