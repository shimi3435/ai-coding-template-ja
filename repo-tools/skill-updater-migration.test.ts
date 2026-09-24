import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readInstalledTree } from "./skill-updater/repository.ts";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";
import { legacyRepository } from "./fixtures/skill-updater/legacy-repository.ts";
import { readCommittedSnapshot } from "./skill-updater/repository.ts";
import { planMigration } from "./skill-updater/migration/index.ts";

test("offline v1 migration preserves pinned commits, body modes, legal and plugin declarations",()=>{
  const root=createSkillUpdaterTestRoot("legacy-migration-"); const base=legacyRepository(root);
  const snapshot=readCommittedSnapshot(root,base);
  const result=planMigration(snapshot,[]);
  assert.equal(result.lock.skills.length,3); assert.equal(result.sources.skills.length,5);assert.equal(result.trees.size,0);
  for(const lock of result.lock.skills)assert.equal(lock.resolvedCommit,"a".repeat(40));
  assert.deepEqual(result.lock.skills.find(l=>l.name==="semver")?.ref,{commit:"a".repeat(40)});
  assert.deepEqual(result.lock.skills.find(l=>l.name==="semver")?.legacyRef,{semver:"^1.0.0",selectedTag:"v1.2.3",selectedVersion:"1.2.3"});
  assert.equal(result.sources.skills.find(s=>s.name==="plugin")?.ownership,"plugin");
});

import { preflightIsolation } from "./skill-updater/isolation.ts";
import { applyCandidate } from "./skill-updater/apply.ts";
import { verifyRepository } from "./skill-updater/repository.ts";
function commitFixture(root:string):string {
  for(const args of [["add","-A"],["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","fixture edit"]])assert.equal(spawnSync("git",args,{cwd:root}).status,0);
  return spawnSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).stdout.trim();
}
test("isolated migration preserves edited local and explicitly localized remote bytes and mode; v2 rerun is a no-op",()=>{
  const parent=createSkillUpdaterTestRoot("migration-apply-");const source=join(parent,"source");mkdirSync(source);legacyRepository(source);
  appendFileSync(join(source,".agents/skills/local/SKILL.md"),"edited local\n");appendFileSync(join(source,".agents/skills/branch/SKILL.md"),"edited remote\n");
  const base=commitFixture(source);const snap=readCommittedSnapshot(source,base);
  assert.throws(()=>planMigration(snap,[]),/旧本文/);
  const plan=planMigration(snap,["branch"]);
  const candidate=join(parent,"candidate");assert.equal(spawnSync("git",["clone","--no-local","-q",source,candidate]).status,0);
  applyCandidate(preflightIsolation({source,candidate,base}),plan);
  assert.deepEqual(verifyRepository(candidate),[]);
  for(const name of ["branch","commit","semver","local"]) {
    const before=snap.readTree(`.agents/skills/${name}`,name);const after=readInstalledTree(candidate,`.agents/skills/${name}`,name);
    assert.deepEqual(after,before);
  }
  const nextBase=commitFixture(candidate);
  const noOp=planMigration(readCommittedSnapshot(candidate,nextBase),[]);assert.deepEqual(noOp.changes,[]);
  assert.throws(()=>planMigration(readCommittedSnapshot(candidate,nextBase),["branch"]),/adopt-local/);
});

for(const failure of ["mixed","missing","version","duplicate-json","unknown-name","duplicate-name","local-name","plugin-policy","legal","structure-local","structure-localize"] as const) test(`migration rejects ${failure} without changing metadata`,()=>{
  const root=createSkillUpdaterTestRoot("migration-invalid-");legacyRepository(root);
  const sourcePath=join(root,".agents/skills/skills.sources.json");const lockPath=join(root,".agents/skills/skills.lock.json");
  let names:string[]=[];
  if(failure==="mixed" || failure==="version") {const doc=JSON.parse(readFileSync(sourcePath,"utf8"));doc.schemaVersion=failure==="mixed"?2:99;writeFileSync(sourcePath,JSON.stringify(doc));}
  if(failure==="missing") {const result=spawnSync("git",["rm",lockPath],{cwd:root});assert.equal(result.status,0);}
  if(failure==="duplicate-json")writeFileSync(sourcePath,readFileSync(sourcePath,"utf8").replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'));
  if(failure==="unknown-name")names=["missing"];
  if(failure==="duplicate-name")names=["branch","branch"];
  if(failure==="local-name")names=["local"];
  if(failure==="plugin-policy"){const doc=JSON.parse(readFileSync(lockPath,"utf8"));doc.skills.find((s:{name:string})=>s.name==="plugin").manager="other";writeFileSync(lockPath,JSON.stringify(doc));}
  if(failure==="legal") {appendFileSync(join(root,".agents/skills/branch/LICENSE"),"changed");names=["branch"];}
  if(failure==="structure-local")writeFileSync(join(root,".agents/skills/local/SKILL.md"),"invalid");
  if(failure==="structure-localize") {writeFileSync(join(root,".agents/skills/branch/SKILL.md"),"invalid");names=["branch"];}
  // 名前だけの負例でも新しいsnapshotを作る。
  writeFileSync(join(root,"marker"),failure);const base=commitFixture(root);
  const before=readFileSync(sourcePath);
  assert.throws(()=>planMigration(readCommittedSnapshot(root,base),names));assert.deepEqual(readFileSync(sourcePath),before);
});

import { fileURLToPath } from "node:url";
import { decodeSourcesJson, decodeLockJson, serializeSources, serializeLock } from "./skill-updater/schema.ts";
test("shipped v2 metadata has remote-only locks and verifies without migration history", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const sourceText = readFileSync(join(root, ".agents/skills/skills.sources.json"), "utf8");
  const lockText = readFileSync(join(root, ".agents/skills/skills.lock.json"), "utf8");
  const sources = decodeSourcesJson(sourceText);
  const lock = decodeLockJson(lockText);
  assert.equal(serializeSources(sources), sourceText);
  assert.equal(serializeLock(lock), lockText);
  assert.deepEqual(lock.skills.map(s => s.name), sources.skills.filter(s => s.ownership === "remote").map(s => s.name));
  assert.deepEqual(verifyRepository(root), []);
});
