import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeSourcesJson, decodeLockJson, serializeSources, serializeLock, sourceFromLock } from "./skill-updater/schema.ts";
import { canonicalizeTree } from "./skill-updater/canonical.ts";
import { sha256 } from "./skill-updater/legal.ts";

const legal = Buffer.from("license\n");
const files = [{ path: "LICENSE", executable: false }, { path: "Lib/a.txt", executable: true }];
export function bundleSource() {
  return { name: "runtime", ownership: "remote" as const, license: "MIT", redistribution: "allowed" as const,
    target: ".agents/vendor/runtime", repository: "example/runtime", ref: { tag: "v1" }, subtree: { root: true as const },
    legalMappings: [{ sourcePath: "LICENSE", targetPath: "LICENSE", expectedSha256: sha256(legal) }],
    bundle: { files: structuredClone(files), limits: { files: 100, singleFileBytes: 1048576, totalBytes: 2097152 } } };
}
const decode = (s: unknown) => decodeSourcesJson(JSON.stringify({ schemaVersion: 2, skills: [s] }));
const lockDecode = (s: unknown) => decodeLockJson(JSON.stringify({ schemaVersion: 2, skills: [s] }));
function bundleLock() {
  const s=bundleSource(); const { legalMappings, ...rest }=s;
  const tree=canonicalizeTree(files.map(f=>({...f,content:f.path==="LICENSE"?legal:Buffer.alloc(0)})));
  return {...rest,resolvedCommit:"a".repeat(40),tagObjectSha:"a".repeat(40),verification:"verified",treeHash:tree.treeHash,fileCount:2,byteCount:legal.length,
    legalFiles:legalMappings.map(m=>({sourcePath:m.sourcePath,targetPath:m.targetPath,sha256:m.expectedSha256})),
    fileDigests:tree.files.map(f=>({path:f.path,sha256:sha256(f.content),byteCount:f.content.length,executable:f.executable}))};
}
test("bundle source/lock canonical roundtrip and zero byte inventory",()=>{
  const s=decode(bundleSource()); const l=lockDecode(bundleLock());
  assert.deepEqual(sourceFromLock(l.skills[0]!),s.skills[0]);
  assert.equal(serializeSources(decodeSourcesJson(serializeSources(s))),serializeSources(s));
  assert.equal(serializeLock(decodeLockJson(serializeLock(l),s)),serializeLock(l));
  const reversed=bundleSource(); reversed.bundle.files.reverse();
  assert.equal(serializeSources(decode(reversed)),serializeSources(s));
});
const bad: Record<string,(s:any)=>void> = {
  null:s=>s.bundle=null, unknown:s=>s.bundle.extra=true, empty:s=>s.bundle.files=[],
  legacy:s=>s.legacyRef=null, branch:s=>s.ref={branch:"main"}, commit:s=>s.ref={commit:"a".repeat(40)},
  subtree:s=>s.subtree={path:"lib"}, target:s=>s.target=".agents/skills/runtime", local:s=>s.ownership="local",
  executable:s=>s.bundle.files[0].executable="false", legalMode:s=>s.bundle.files[0].executable=true,
  legalRename:s=>s.legalMappings[0].targetPath="COPYING", missingLegal:s=>s.bundle.files.shift(),
  limit0:s=>s.bundle.limits.files=0, limit101:s=>s.bundle.limits.files=101, fractional:s=>s.bundle.limits.files=1.5,
  string:s=>s.bundle.limits.files="100", huge:s=>s.bundle.limits.totalBytes=Number.MAX_SAFE_INTEGER+1,
  single:s=>s.bundle.limits.singleFileBytes=1048577, total:s=>s.bundle.limits.totalBytes=2097153,
  count:s=>s.bundle.limits.files=1, duplicate:s=>s.bundle.files.push({...s.bundle.files[0]}),
  ancestor:s=>s.bundle.files.push({path:"lib/b.txt",executable:false}),
  prefix:s=>s.bundle.files.push({path:"lib",executable:false}),
  deep:s=>s.bundle.files.push({path:"a/".repeat(33)+"f",executable:false}),
  nfc:s=>s.bundle.files.push({path:"e\u0301",executable:false}),
};
for(const [label,mutate] of Object.entries(bad)) test(`bundle rejects ${label}`,()=>{ const s=bundleSource();mutate(s);assert.throws(()=>decode(s)); });
test("bundle rejects duplicate JSON keys and lock-only fields on ordinary entries",()=>{
  assert.throws(()=>decodeSourcesJson(JSON.stringify({schemaVersion:2,skills:[bundleSource()]}).replace('"executable":false','"executable":false,"executable":false')));
  const l:any=bundleLock(); delete l.bundle; l.target=".agents/skills/runtime"; assert.throws(()=>lockDecode(l));
});
test("bundle lock rejects mismatched inventory, legal, count, limit and legacy fields",()=>{
  const mutations:((l:any)=>void)[]=[l=>l.legacyRef=null,l=>delete l.fileDigests,l=>l.fileDigests.pop(),l=>l.fileDigests.push(l.fileDigests[0]),l=>l.fileDigests[0].sha256="b".repeat(64),l=>l.fileDigests[0].executable=true,l=>l.fileDigests[0].byteCount=-1,l=>l.fileCount++,l=>l.byteCount++,l=>l.fileDigests[0].extra=1];
  for(const mutate of mutations){const l=bundleLock();mutate(l);assert.throws(()=>lockDecode(l));}
});
test("all ancestors use exact spelling and type, independent of order",()=>{
  for(const pair of [["Lib/a","Lib/b"],["Lib/a","lib/b"],["Lib/A/a","lib/a/b"],["Lib/a","lib/a"],["Lib","lib/a"]]){
    for(const paths of [pair,[...pair].reverse()]){
      const s=bundleSource();s.bundle.files=[files[0]!,...paths.map(path=>({path,executable:false}))];
      if(pair[1]==="Lib/b") assert.doesNotThrow(()=>decode(s));else assert.throws(()=>decode(s));
    }
  }
});
test("bundle exact count, byte, path and entry boundaries",()=>{
  const s=bundleSource();s.bundle.files=[files[0]!,...Array.from({length:99},(_,i)=>({path:`f${i}`,executable:false}))];
  assert.doesNotThrow(()=>decode(s));s.bundle.files.push({path:"overflow",executable:false});assert.throws(()=>decode(s));
  s.bundle.files=[files[0]!,{path:"a".repeat(255),executable:false}];assert.doesNotThrow(()=>decode(s));
  s.bundle.files[1].path+="a";assert.throws(()=>decode(s));
  s.bundle.files=[files[0]!,...Array.from({length:99},(_,i)=>({path:`d${i}/a/b/c/f`,executable:false}))];
  assert.doesNotThrow(()=>decode(s));s.bundle.files[1].path="d0/a/b/c/d/e/f/g/h/i/f";assert.throws(()=>decode(s));
  const l=bundleLock();l.fileDigests[1].byteCount=1048576;l.byteCount=1048576+legal.length;assert.doesNotThrow(()=>lockDecode(l));
  l.fileDigests[1].byteCount++;l.byteCount++;assert.throws(()=>lockDecode(l));
});
