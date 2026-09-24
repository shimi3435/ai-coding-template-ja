import { utf8Compare } from "../canonical.ts";
import { decodeSourcesJson as decodeV1Sources, decodeLockJson as decodeV1Lock } from "./schema-v1.ts";
import { convertV1Metadata } from "./convert.ts";
import { parseMetadataJson, decodeSourcesJson, decodeLockJson, serializeSources, serializeLock } from "../schema.ts";
import { readSnapshotTrees, localFromRemote, verifySnapshotLinks } from "../ownership.ts";
import { verifyRemoteBefore, type MaintenancePlan } from "../planner.ts";
import type { CommittedSnapshot } from "../repository.ts";

export function planMigration(snapshot:CommittedSnapshot,localize:readonly string[]):MaintenancePlan {
  if(new Set(localize).size!==localize.length)throw new Error("localize名重複");
  const sourcesBytes=snapshot.readFile(".agents/skills/skills.sources.json"); const lockBytes=snapshot.readFile(".agents/skills/skills.lock.json");
  const sourceValue=parseMetadataJson(sourcesBytes) as {schemaVersion?:unknown}|null;
  const lockValue=parseMetadataJson(lockBytes) as {schemaVersion?:unknown}|null;
  if(sourceValue?.schemaVersion!==lockValue?.schemaVersion)throw new Error("source / lock version混在");
  if(sourceValue?.schemaVersion===2) {
    if(localize.length)throw new Error("v2 localizeはadopt-localを使用してください");
    const sources=decodeSourcesJson(sourcesBytes);const lock=decodeLockJson(lockBytes,sources);
    verifySnapshotLinks(snapshot,sources);
    const trees=readSnapshotTrees(snapshot,sources);
    for(const s of sources.skills) if(s.ownership==="remote") {
      const tree=trees.get(s.name);if(!tree)throw new Error("remote本文欠落");verifyRemoteBefore(s,lock.skills.find(l=>l.name===s.name)!,tree);
    }
    return {sources,lock,trees:new Map(),changes:[],warnings:[]};
  }
  if(sourceValue?.schemaVersion!==1)throw new Error("移行はv1または完成済みv2が必要です");
  const oldSources=decodeV1Sources(sourcesBytes); const oldLock=decodeV1Lock(lockBytes,oldSources);
  const converted=convertV1Metadata(oldSources,oldLock);
  for(const name of localize) if(!converted.sources.skills.some(s=>s.name===name && s.ownership==="remote"))throw new Error("localize対象remote不明");
  verifySnapshotLinks(snapshot,converted.sources);
  const trees=readSnapshotTrees(snapshot,converted.sources);
  for(const s of converted.sources.skills) if(s.ownership==="remote") {
    const tree=trees.get(s.name);if(!tree)throw new Error("remote本文欠落");verifyRemoteBefore(s,converted.lock.skills.find(l=>l.name===s.name)!,tree,localize.includes(s.name));
  }
  const sources=decodeSourcesJson(serializeSources({schemaVersion:2,skills:converted.sources.skills.map(s=>s.ownership==="remote" && localize.includes(s.name)?localFromRemote(s,converted.lock.skills.find(l=>l.name===s.name)!):s)}));
  const lock=decodeLockJson(serializeLock({schemaVersion:2,skills:converted.lock.skills.filter(l=>!localize.includes(l.name))}),sources);
  return {sources,lock,trees:new Map(),metadataChanged:true,changes:[...sources.skills].sort((a,b)=>utf8Compare(a.name,b.name)).map(s=>({name:s.name,beforeCommit:converted.lock.skills.find(l=>l.name===s.name)?.resolvedCommit??null,afterCommit:lock.skills.find(l=>l.name===s.name)?.resolvedCommit??null,beforeOwnership:oldSources.skills.find(old=>old.name===s.name)!.ownership,afterOwnership:s.ownership})),warnings:[]};
}
