import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { bundleRepository, commitFixture, git, runtimeSource, runtimeLock } from "./skill-updater-bundle-test-fixture.ts";
import { verifyRepository, readCommittedSnapshot, readRepositorySkillState } from "./skill-updater/repository.ts";
import { readSnapshotTrees } from "./skill-updater/ownership.ts";
import { runSkillCommand } from "./skill-updater/commands.ts";
import { readLiveBundle } from "./skill-updater/bundle.ts";
import { planMigration } from "./skill-updater/migration/index.ts";
import { serializeLock, serializeSources } from "./skill-updater/schema.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";

const target=".agents/vendor/runtime";
test("bundle public offline verify, snapshot, links and migrate preserve ordinary Skill and user link",async()=>{
 const root=bundleRepository();symlinkSync("missing",join(root,".codex/skills/runtime"));const base=commitFixture(root);
 assert.deepEqual(verifyRepository(root),[]);
 const state=readRepositorySkillState(root);const snap=readCommittedSnapshot(root,base);
 assert.equal(readSnapshotTrees(snap,state.sources).get("runtime")!.treeHash,runtimeLock().treeHash);
 for(const command of ["skills:verify","skills:links"] as const){const r=await runSkillCommand(command,[],{repositoryRoot:root});assert.equal(r.exitCode,0,r.stderr);}
 assert.equal(readlinkSync(join(root,".codex/skills/runtime")),"missing");assert.ok(!existsSync(join(root,".claude/skills/runtime")));
 const candidate=createSkillUpdaterTestRoot("bundle-migrate-");git(candidate,"clone","--no-local",root,".");
 const r=await runSkillCommand("skills:migrate",["--source",root,"--base",base,"--candidate",candidate,"--apply"],{repositoryRoot:root});assert.equal(r.exitCode,0,r.stderr);assert.equal(r.report.status,"unchanged");
 const a=await runSkillCommand("skills:adopt-local",["--source",root,"--base",base,"--candidate",candidate,"--name","runtime","--apply"],{repositoryRoot:root});assert.equal(a.exitCode,1);assert.match(a.stderr,/bundle/);assert.equal(git(candidate,"status","--porcelain"),"");
});
const mutations:Record<string,(root:string)=>void>={
 missing:r=>rmSync(join(r,target,"LICENSE")),extra:r=>writeFileSync(join(r,target,"extra"),"x"),emptyDirectory:r=>mkdirSync(join(r,target,"empty")),
 tamper:r=>writeFileSync(join(r,target,"LICENSE"),"changed"),hardlink:r=>linkSync(join(r,target,"LICENSE"),join(r,"copy")),
 symlink:r=>{rmSync(join(r,target,"LICENSE"));symlinkSync(join(r,"LICENSE"),join(r,target,"LICENSE"));},
 ancestor:r=>{renameSync(join(r,target,"Lib"),join(r,target,"lib"));},
 vendorFile:r=>{rmSync(join(r,".agents/vendor"),{recursive:true});writeFileSync(join(r,".agents/vendor"),"x");},
 vendorLink:r=>{renameSync(join(r,".agents/vendor"),join(r,"vendor"));symlinkSync("../vendor",join(r,".agents/vendor"));},
 rootFile:r=>writeFileSync(join(r,".agents/vendor/extra"),"x"),rootLink:r=>symlinkSync("runtime",join(r,".agents/vendor/extra")),
 undeclared:r=>mkdirSync(join(r,".agents/vendor/extra")),wrongRoot:r=>mkdirSync(join(r,".agents/skills/runtime")),
 fifo:r=>{assert.equal(spawnSync("mkfifo",[join(r,".agents/vendor/fifo")]).status,0);},
};
for(const [label,change] of Object.entries(mutations))test(`bundle verify rejects ${label}`,()=>{const root=bundleRepository();change(root);assert.notDeepEqual(verifyRepository(root),[]);});
for(const [path,good,bad] of [
 ["LICENSE",[0o600,0o644,0o444],[0o700,0o200,0o664,0o646,0o4644,0o2644,0o1644]],
 ["Lib/run.sh",[0o700,0o755,0o555],[0o600,0o641,0o300,0o775,0o757,0o4755,0o2755,0o1755]],
 ["Lib",[0o700,0o755,0o555],[0o600,0o100,0o775,0o757,0o4755,0o2755,0o1755]],
] as const)test(`bundle POSIX permissions ${path}, verify never chmods`,()=>{
 const root=bundleRepository();const p=join(root,target,path);
 for(const mode of [...good,...bad]){chmodSync(p,mode);const before=lstatSync(p).mode;const errors=verifyRepository(root);assert.equal(errors.length===0,(good as readonly number[]).includes(mode),`${mode.toString(8)}: ${errors}`);assert.equal(lstatSync(p).mode,before);}
 chmodSync(p,path==="LICENSE"?0o644:0o755);
});
test("source / lock / vendor all eight retirement states",()=>{
 for(let mask=0;mask<8;mask++){
  const r=bundleRepository();const state=readRepositorySkillState(r);
  if(!(mask&1))writeFileSync(join(r,".agents/skills/skills.sources.json"),serializeSources({...state.sources,skills:state.sources.skills.filter(s=>s.name!=="runtime")}));
  if(!(mask&2))writeFileSync(join(r,".agents/skills/skills.lock.json"),serializeLock({schemaVersion:2,skills:[]}));
  if(!(mask&4))rmSync(join(r,".agents/vendor"),{recursive:true});
  assert.equal(verifyRepository(r).length===0,mask===0||mask===7,`state ${mask}`);
  const base=commitFixture(r);const snapshot=readCommittedSnapshot(r,base);
  if(mask===0||mask===7)assert.doesNotThrow(()=>planMigration(snapshot,[]));else assert.throws(()=>planMigration(snapshot,[]));
 }
});
test("committed bundle ancestor collisions and undeclared paths fail",()=>{
 for(const p of [".agents/vendor/extra/file",".agents/vendor/runtime/lib/extra",".agents/vendor/loose"]){const r=bundleRepository();mkdirSync(join(r,p,".."),{recursive:true});writeFileSync(join(r,p),"x");const base=commitFixture(r);const state=readRepositorySkillState(r);assert.throws(()=>readSnapshotTrees(readCommittedSnapshot(r,base),state.sources));}
});
test("umask 022 and 077 fresh clones verify with identical logical hash",()=>{
 const r=bundleRepository();commitFixture(r);
 for(const mask of ["022","077"]){const c=createSkillUpdaterTestRoot("bundle-clone-");const result=spawnSync("bash",["-c",'umask "$1"; git clone --no-local "$2" "$3"',"fixture",mask,r,c],{encoding:"utf8"});assert.equal(result.status,0,result.stderr);
  const before=lstatSync(join(c,target,"LICENSE")).mode;assert.equal(before&0o777,mask==="022"?0o644:0o600);assert.deepEqual(verifyRepository(c),[]);assert.equal(readLiveBundle(c,runtimeSource()).treeHash,runtimeLock().treeHash);assert.equal(lstatSync(join(c,target,"LICENSE")).mode,before);
 }
});
import { adoptLocal } from "./skill-updater/ownership.ts";
import { canonicalizeTree } from "./skill-updater/canonical.ts";
import { bundleFiles } from "./skill-updater-bundle-test-fixture.ts";
test("ordinary remote adopt-local validates and preserves coexisting bundle",()=>{
 const bundle=runtimeSource();const remote={...bundle,name:"demo",target:".agents/skills/demo",bundle:undefined};
 const {bundle:_,...s}=remote;const files=[...bundleFiles,{path:"SKILL.md",executable:false,content:Buffer.from("---\nname: demo\ndescription: fixture\n---\n")}];
 const tree=canonicalizeTree(files);const {bundle:_b,fileDigests:_d,...l}=runtimeLock(s,files);
 const sources={schemaVersion:2 as const,skills:[s,bundle]};const lock={schemaVersion:2 as const,skills:[l,runtimeLock()]};
 const input={sources,lock,installedTrees:new Map([["demo",tree],["runtime",canonicalizeTree(bundleFiles)]])};
 const plan=adoptLocal(input,"demo");assert.deepEqual(plan.lock.skills,[runtimeLock()]);assert.equal(plan.trees.size,0);
 const corrupt=canonicalizeTree(bundleFiles.map(f=>({...f,content:Buffer.from("corrupt")})));
 assert.throws(()=>adoptLocal({...input,installedTrees:new Map([["demo",tree],["runtime",corrupt]])},"demo"));
});
for(const mutation of ["size","identity"])test(`bundle read rejects in-flight ${mutation} change`,()=>{
 const root=bundleRepository();
 const script=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import assert from 'node:assert/strict';
 import {readLiveBundle} from ${JSON.stringify(new URL("./skill-updater/bundle.ts",import.meta.url).href)};
 import {runtimeSource} from ${JSON.stringify(new URL("./skill-updater-bundle-test-fixture.ts",import.meta.url).href)};
 const [root,mutation]=process.argv.slice(1);const path=root+'/.agents/vendor/runtime/LICENSE';const original=fs.readSync;let injected=false;
 fs.readSync=(...args)=>{if(!injected){injected=true;if(mutation==='size')fs.appendFileSync(path,'changed');else {const body=fs.readFileSync(path);fs.renameSync(path,path+'.old');fs.writeFileSync(path,body);}}return original(...args);};syncBuiltinESMExports();
 assert.throws(()=>readLiveBundle(root,runtimeSource()),/identity|size/);assert.ok(injected);`;
 const result=spawnSync(process.execPath,["--input-type=module","-e",script,root,mutation],{encoding:"utf8",timeout:10000});assert.equal(result.status,0,result.stderr);
});
