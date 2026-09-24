import { sha256 } from "./legal.ts";
import { utf8Compare, type CanonicalTree } from "./canonical.ts";
import { observeRemoteCohort, type GhRunner, type RepinApproval } from "./github.ts";
import { decodeSourcesJson as decodeV2Sources, decodeLockJson as decodeV2Lock, serializeSources as serializeV2Sources, serializeLock as serializeV2Lock, sourceFromLock } from "./schema.ts";
import { validateSkillTree } from "./metadata.ts";
import type { SourcesDocument as V2Sources, LockDocument as V2Lock, RemoteSource as V2RemoteSource, RemoteLock as V2RemoteLock } from "./types.ts";
export type MaintenanceChange = Readonly<{
  name:string; beforeCommit:string|null; afterCommit:string|null; beforeOwnership:string|null; afterOwnership:string|null;
  beforeRef?:unknown; afterRef?:unknown; beforeTagObjectSha?:string|null; afterTagObjectSha?:string|null;
  beforeLicense?:string|null; afterLicense?:string|null; beforeLegalMappings?:unknown; afterLegalMappings?:unknown;
}>;
export type MaintenancePlan = Readonly<{
  sources:V2Sources; lock:V2Lock; trees:ReadonlyMap<string,CanonicalTree>;
  changes:readonly MaintenanceChange[]; warnings:readonly string[]; metadataChanged?: boolean;
}>;
export function remoteChange(before:V2RemoteLock|undefined,after:V2RemoteLock):MaintenanceChange {
  const old=before ? sourceFromLock(before):undefined; const next=sourceFromLock(after);
  return {name:after.name,beforeCommit:before?.resolvedCommit??null,afterCommit:after.resolvedCommit,beforeOwnership:before?.ownership??null,afterOwnership:after.ownership,
    ...(JSON.stringify(before?.ref)!==JSON.stringify(after.ref)?{beforeRef:before?.ref??null,afterRef:after.ref}:{}),
    ...(before?.tagObjectSha!==after.tagObjectSha?{beforeTagObjectSha:before?.tagObjectSha??null,afterTagObjectSha:after.tagObjectSha??null}:{}),
    ...(before?.license!==after.license?{beforeLicense:before?.license??null,afterLicense:after.license}:{}),
    ...(JSON.stringify(old?.legalMappings)!==JSON.stringify(next.legalMappings)?{beforeLegalMappings:old?.legalMappings??null,afterLegalMappings:next.legalMappings}:{}),
  };
}
export function verifyRemoteBefore(source:V2RemoteSource,lock:V2RemoteLock,tree:CanonicalTree,allowBodyChange=false):void {
  const actual=validateSkillTree(tree.files,source.name);
  if(!allowBodyChange && (actual.treeHash!==lock.treeHash || actual.fileCount!==lock.fileCount || actual.byteCount!==lock.byteCount)) throw new Error(`旧本文 / lock不一致: ${source.name}`);
  for(const legal of lock.legalFiles) {
    const file=actual.files.find(f=>f.path===legal.targetPath);
    if(!file || sha256(file.content)!==legal.sha256) throw new Error(`旧legal / lock不一致: ${source.name}`);
  }
}
export async function planRemoteMaintenance(input:Readonly<{
  sources:V2Sources;lock:V2Lock;installedTrees:ReadonlyMap<string,CanonicalTree>;
}>,runner:GhRunner,repin?:RepinApproval & Readonly<{name:string}>):Promise<MaintenancePlan> {
  const sources=decodeV2Sources(serializeV2Sources(input.sources));
  const lock=decodeV2Lock(serializeV2Lock(input.lock));
  const selected=sources.skills.filter(s=>s.ownership==="remote");
  if(repin && !selected.some(s=>s.name===repin.name)) throw new Error("repin対象remoteがありません");
  const byName=new Map(lock.skills.map(l=>[l.name,l]));
  for(const l of lock.skills) if(!selected.some(s=>s.name===l.name)) throw new Error("orphan / ownership不一致");
  for(const s of selected) {
    const previous=byName.get(s.name); const tree=input.installedTrees.get(s.name);
    if(!previous) {
      if(repin || tree) throw new Error("lock欠落 / 未管理path衝突");
      continue;
    }
    if(previous.target!==s.target || previous.redistribution!==s.redistribution) throw new Error("identity / policy不一致");
    const old=sourceFromLock(previous);
    if(repin?.name!==s.name) {
      const normalize=(entry:V2RemoteSource)=>({...entry,legalMappings:entry.legalMappings.map(({expectedSha256,...mapping})=>repin ? {...mapping,expectedSha256}:mapping)});
      if(JSON.stringify(normalize(old))!==JSON.stringify(normalize(s))) throw new Error(`通常update / 対象外のprovenance・policy・mapping変更: ${s.name}`);
    }
    if(!tree) throw new Error("旧本文欠落");
    verifyRemoteBefore(s,previous,tree);
  }
  const groups=new Map<string,V2RemoteSource[]>();
  for(const s of selected.filter(s=>!repin || s.name===repin.name)) {
    const key=`${s.repository}|${JSON.stringify(s.ref)}`; groups.set(key,[...(groups.get(key)??[]),s]);
  }
  const trees=new Map<string,CanonicalTree>(); const changes:MaintenanceChange[]=[]; const warnings:string[]=[];
  for(const key of [...groups.keys()].sort(utf8Compare)) {
    const cohort=groups.get(key)!;
    const observation=await observeRemoteCohort(cohort,cohort.flatMap(s=>byName.has(s.name)?[byName.get(s.name)!]:[]),runner,repin);
    warnings.push(...observation.warnings);
    for(const s of cohort) {
      const observed=observation.entries.find(e=>e.name===s.name)!;
      const {legalMappings:_,...identity}=s;
      const after:V2RemoteLock={...identity,resolvedCommit:observation.resolvedCommit,verification:observation.verification,
        ...(observation.tagObjectSha?{tagObjectSha:observation.tagObjectSha}:{}),treeHash:observed.tree.treeHash,fileCount:observed.tree.fileCount,byteCount:observed.tree.byteCount,legalFiles:observed.legalFiles};
      const before=byName.get(s.name);
      if(JSON.stringify(before)!==JSON.stringify(decodeV2Lock(serializeV2Lock({schemaVersion:2,skills:[after]})).skills[0])) {
        changes.push(remoteChange(before,after)); byName.set(s.name,after);
        if(before?.treeHash!==after.treeHash) trees.set(s.name,observed.tree);
      }
    }
  }
  const afterLock=decodeV2Lock(serializeV2Lock({schemaVersion:2,skills:[...byName.values()]}),sources);
  return {sources,lock:afterLock,trees,changes:changes.sort((a,b)=>utf8Compare(a.name,b.name)),warnings};
}
