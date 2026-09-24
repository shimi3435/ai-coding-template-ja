import { utf8Compare } from "../canonical.ts";
import { decodeSourcesJson, decodeLockJson } from "../schema.ts";
import type { SourcesDocument, LockDocument } from "../types.ts";

// 本文の検証を呼出側で完了したv1 metadataを、一度だけv2へ変換する。
export function convertV1Metadata(
  sources: import("./types-v1.ts").SourcesDocument,
  lock: import("./types-v1.ts").LockDocument,
): Readonly<{ sources: SourcesDocument; lock: LockDocument }> {
  if (sources.skills.length !== lock.skills.length) throw new Error("v1 source / lock件数不一致");
  const newSources: unknown[]=[]; const newLocks: unknown[]=[];
  const sortedLegal=(items: readonly unknown[])=>JSON.stringify([...items].sort((a,b)=>utf8Compare(JSON.stringify(a),JSON.stringify(b))));
  for (const s of sources.skills) {
    const l=lock.skills.find(l=>l.name===s.name);
    if (!l || s.ownership!==l.ownership || s.license!==l.license || s.redistribution!==l.redistribution) throw new Error("v1 policy / ownership不一致");
    if (s.ownership==="plugin" && l.ownership==="plugin") {
      if (s.manager!==l.manager) throw new Error("v1 plugin manager不一致");
      newSources.push(s); continue;
    }
    if (s.ownership==="plugin" || l.ownership==="plugin" || s.target!==l.target) throw new Error("v1 target不一致");
    if (s.ownership==="local" && l.ownership==="local") {
      const legal=s.legalMappings.map(m=>({sourcePath:m.sourcePath,sha256:m.expectedSha256}));
      if (sortedLegal(legal)!==sortedLegal(l.legalFiles)) throw new Error("v1 local legal不一致");
      newSources.push({...s,legalMappings:s.legalMappings.map(m=>({path:m.sourcePath,expectedSha256:m.expectedSha256}))}); continue;
    }
    if (s.ownership!=="remote" || l.ownership!=="remote") throw new Error("v1 ownership不一致");
    if (s.repository!==l.repository || JSON.stringify(s.ref)!==JSON.stringify(l.ref)) throw new Error("v1 provenance不一致");
    const legal=s.legalMappings.map(m=>({sourcePath:m.sourcePath,targetPath:m.targetPath,sha256:m.expectedSha256}));
    if (sortedLegal(legal)!==sortedLegal(l.legalFiles)) throw new Error("v1 remote legal不一致");
    const history="semver" in s.ref ? {legacyRef:{semver:s.ref.semver,selectedTag:l.selectedTag,selectedVersion:l.selectedVersion}} : {};
    const newRef="semver" in s.ref ? {commit:l.resolvedCommit}:s.ref;
    newSources.push({...s,ref:newRef,...history});
    const {selectedTag: _tag,selectedVersion: _version,...remaining}=l;
    newLocks.push({...remaining,ref:newRef,subtree:s.subtree,...history});
  }
  const resultSources=decodeSourcesJson(JSON.stringify({schemaVersion:2,skills:newSources}));
  return {sources:resultSources,lock:decodeLockJson(JSON.stringify({schemaVersion:2,skills:newLocks}),resultSources)};
}
