import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeTree } from "./skill-updater/canonical.ts";
import { sha256 } from "./skill-updater/legal.ts";
import { planRemoteMaintenance } from "./skill-updater/planner.ts";
import { observeRemoteCohort } from "./skill-updater/github.ts";
import { source as remoteFixtureSource, transcript as remoteTranscript, commit as observedCommit } from "./skill-updater-github-test-fixture.ts";
import type { RemoteSource as V2RemoteSource, RemoteLock as V2RemoteLock } from "./skill-updater/types.ts";

async function v2Fixture() {
  const source:V2RemoteSource={...remoteFixtureSource(),redistribution:"allowed",ref:{branch:"main"}};
  const observation=await observeRemoteCohort([source],[],remoteTranscript().runner);
  const tree=observation.entries[0]!.tree;
  const {legalMappings:_,...identity}=source;
  const lock:V2RemoteLock={...identity,resolvedCommit:"a".repeat(40),verification:"verified",treeHash:tree.treeHash,fileCount:tree.fileCount,byteCount:tree.byteCount,legalFiles:observation.entries[0]!.legalFiles};
  return {source,lock,tree};
}
test("v2 updates the pinned commit even when content is identical",async()=>{
  const f=await v2Fixture();
  const fake=remoteTranscript({[`repos/owner/repo/compare/${f.lock.resolvedCommit}...${observedCommit}`]:{status:"ahead"}});
  const result=await planRemoteMaintenance({sources:{schemaVersion:2,skills:[f.source]},lock:{schemaVersion:2,skills:[f.lock]},installedTrees:new Map([[f.source.name,f.tree]])},fake.runner);
  assert.equal(result.lock.skills[0]?.resolvedCommit,observedCommit);
  assert.equal(result.lock.skills[0]?.treeHash,f.tree.treeHash);
  assert.equal(result.changes.length,1);
});

import { skill as fixtureSkill, skillBlobSha as fixtureSkillSha, license as fixtureLicense, licenseBlobSha as fixtureLicenseSha } from "./skill-updater-github-test-fixture.ts";
for(const kind of ["license","sourcePath","targetPath","notice-add","notice-remove"]) test(`named repin applies same-commit ${kind} changes and normal update refuses them`,async()=>{
  const f=await v2Fixture();
  let oldSource=f.source; let oldLock={...f.lock,resolvedCommit:observedCommit}; let oldTree=f.tree;
  if(kind==="notice-remove") {
    oldSource={...oldSource,legalMappings:[...oldSource.legalMappings,{...oldSource.legalMappings[0]!,sourcePath:"NOTICE",targetPath:"NOTICE"}]};
    oldTree=canonicalizeTree([...oldTree.files,{path:"NOTICE",executable:false,content:fixtureLicense}]);
    oldLock={...oldLock,treeHash:oldTree.treeHash,fileCount:oldTree.fileCount,byteCount:oldTree.byteCount,legalFiles:[...oldLock.legalFiles,{sourcePath:"NOTICE",targetPath:"NOTICE",sha256:sha256(fixtureLicense)}]};
  }
  const next={...oldSource,
    ...(kind==="license"?{license:"Apache-2.0"}:{}),
    legalMappings:kind==="notice-add" ? [...oldSource.legalMappings,{...oldSource.legalMappings[0]!,sourcePath:"NOTICE",targetPath:"NOTICE"}]:kind==="notice-remove" ? oldSource.legalMappings.filter(m=>m.targetPath!=="NOTICE"):oldSource.legalMappings.map(m=>({...m,...(kind==="sourcePath"?{sourcePath:"legal/LICENSE"}:{}),...(kind==="targetPath"?{targetPath:"legal/LICENSE"}:{})})),
  };
  const input={sources:{schemaVersion:2 as const,skills:[next]},lock:{schemaVersion:2 as const,skills:[oldLock]},installedTrees:new Map([[f.source.name,oldTree]])};
  const fake=remoteTranscript({[`repos/owner/repo/git/trees/${observedCommit}?recursive=1`]:{truncated:false,tree:[
    {path:"skills/demo/SKILL.md",mode:"100644",type:"blob",sha:fixtureSkillSha,size:fixtureSkill.length},
    ...next.legalMappings.map(m=>({path:m.sourcePath,mode:"100644",type:"blob",sha:fixtureLicenseSha,size:fixtureLicense.length})),
  ]}});
  await assert.rejects(planRemoteMaintenance(input,fake.runner),/policy|mapping/); assert.equal(fake.calls.length,0);
  const planned=await planRemoteMaintenance(input,fake.runner,{name:"demo",commit:observedCommit});
  assert.equal(planned.changes.length,1);
  assert.equal(planned.lock.skills[0]?.license,next.license);
  assert.deepEqual(planned.lock.skills[0]?.legalFiles.map(f=>f.targetPath),next.legalMappings.map(m=>m.targetPath).sort());
  if(kind==="targetPath") { assert.equal(planned.trees.get("demo")?.files.some(f=>f.path==="LICENSE"),false); assert.equal(planned.changes[0]?.beforeLegalMappings!==undefined,true); }
  if(kind==="notice-remove") assert.equal(planned.trees.get("demo")?.files.some(f=>f.path==="NOTICE"),false);
  if(kind==="license") assert.equal(planned.changes[0]?.beforeLicense,"MIT");
});

test("repin cannot bypass old body, legal, policy or unrelated declarations",async()=>{
  const f=await v2Fixture(); const fake=remoteTranscript();
  const input={sources:{schemaVersion:2 as const,skills:[f.source]},lock:{schemaVersion:2 as const,skills:[f.lock]},installedTrees:new Map([["demo",canonicalizeTree(f.tree.files.map(file=>file.path==="LICENSE"?{...file,content:Buffer.from("edited")}:file))]])};
  await assert.rejects(planRemoteMaintenance(input,fake.runner,{name:"demo",commit:observedCommit}),/旧本文|旧legal/);
  assert.equal(fake.calls.length,0);
  const other={...f.source,name:"other",target:".agents/skills/other"};
  await assert.rejects(planRemoteMaintenance({...input,sources:{schemaVersion:2,skills:[f.source,other]},installedTrees:new Map([["demo",f.tree]])},fake.runner,{name:"demo",commit:observedCommit}),/lock欠落/);
  await assert.rejects(planRemoteMaintenance({...input,sources:JSON.parse(JSON.stringify({schemaVersion:2,skills:[{...f.source,redistribution:"blocked"}]}))},fake.runner,{name:"demo",commit:observedCommit}),/allowed/);
});

test("v2 legal hash reapproval verifies old bytes against the old lock and fetched bytes against the new source",async()=>{
  const f=await v2Fixture(); const next={...f.source,legalMappings:f.source.legalMappings.map(m=>({...m,expectedSha256:"f".repeat(64)}))};
  const fake=remoteTranscript();
  await assert.rejects(planRemoteMaintenance({sources:{schemaVersion:2,skills:[next]},lock:{schemaVersion:2,skills:[{...f.lock,resolvedCommit:observedCommit}]},installedTrees:new Map([["demo",f.tree]])},fake.runner),/legal hash/);
  assert.ok(fake.calls.some(c=>c.includes("/git/blobs/")));
});

test("v2 valid unchanged state yields no changes while new remote produces a lock",async()=>{
  const f=await v2Fixture();
  const existing=await planRemoteMaintenance({sources:{schemaVersion:2,skills:[f.source]},lock:{schemaVersion:2,skills:[{...f.lock,resolvedCommit:observedCommit}]},installedTrees:new Map([["demo",f.tree]])},remoteTranscript().runner);
  assert.deepEqual(existing.changes,[]);
  const fresh=await planRemoteMaintenance({sources:{schemaVersion:2,skills:[f.source]},lock:{schemaVersion:2,skills:[]},installedTrees:new Map()},remoteTranscript().runner);
  assert.equal(fresh.lock.skills.length,1);assert.equal(fresh.changes[0]?.beforeCommit,null);
});
