import { constants, openSync, closeSync, writeFileSync, fchmodSync, mkdirSync, rmSync, lstatSync, readlinkSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { recheckIsolation, assertSafeParents, type IsolatedCandidate } from "./isolation.ts";
import { serializeSources, serializeLock, decodeLockJson } from "./schema.ts";
import { verifyRepository } from "./repository.ts";
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
    validateSkillTree(tree.files,name);
  }
  recheckIsolation(candidate);
  // 全link衝突は本文の適用より前に拒否する。
  for (const source of plan.sources.skills) if (source.ownership!=="plugin") for (const base of [".claude/skills",".codex/skills"]) {
    const path=join(candidate.candidate,base,source.name); assertSafeParents(candidate.candidate,path);
    const stat=lstatSync(path,{throwIfNoEntry:false}); if (stat && !stat.isSymbolicLink()) throw new Error("linkの非symlink衝突");
  }
  const write=(path:string,content:Buffer|string,executable=false):void=>{
    const absolute=join(candidate.candidate,path); assertSafeParents(candidate.candidate,absolute);
    mkdirSync(dirname(absolute),{recursive:true});
    const fd=openSync(absolute,constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW,executable?0o755:0o644);
    try { writeFileSync(fd,content); fchmodSync(fd,executable?0o755:0o644); } finally { closeSync(fd); }
    afterWrite?.(path);
  };
  for (const [name,tree] of plan.trees) {
    const target=plan.sources.skills.find(s=>s.name===name)!;
    if (target.ownership!=="remote") throw new Error("remote対象ではありません");
    rmSync(join(candidate.candidate,target.target),{recursive:true,force:true});
    for (const file of tree.files) write(`${target.target}/${file.path}`,file.content,file.executable);
  }
  write(".agents/skills/skills.sources.json",sourcesBytes);
  write(".agents/skills/skills.lock.json",lockBytes);
  for (const source of plan.sources.skills) if (source.ownership!=="plugin") for (const base of [".claude/skills",".codex/skills"]) {
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
