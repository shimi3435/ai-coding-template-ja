import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundleRepository, bundleRunner, bundleCommit, bundleFiles, commitFixture, git, runtimeSource } from "./skill-updater-bundle-test-fixture.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";
import { repositoryDigest } from "./skill-updater-test-fixture.ts";
import { runSkillCommand } from "./skill-updater/commands.ts";
import { readRepositorySkillState, verifyRepository } from "./skill-updater/repository.ts";
import { serializeSources } from "./skill-updater/schema.ts";
function candidate(root:string){const c=createSkillUpdaterTestRoot("bundle-apply-");git(c,"clone","--no-local",root,".");return c;}
const args=(root:string,base:string,c:string)=>["--source",root,"--base",base,"--candidate",c];
const approval=["--name","runtime","--tag","v1","--commit",bundleCommit,"--tag-object",bundleCommit];
test("bundle addition previews, isolated apply verifies, source unchanged and no bundle links",async()=>{
 const r=bundleRepository(false);const base=commitFixture(r);const c=candidate(r);const f=bundleRunner();const context={repositoryRoot:r,ghRunner:f.runner};const before=repositoryDigest(r);const prior=repositoryDigest(c);
 const p=await runSkillCommand("skills:update",args(r,base,c),context);assert.equal(p.exitCode,0,p.stderr);assert.equal(p.report.status,"planned");assert.equal(repositoryDigest(c),prior);
 const applied=await runSkillCommand("skills:update",[...args(r,base,c),"--apply"],context);assert.equal(applied.exitCode,0,applied.stderr);assert.equal(applied.report.status,"applied");assert.deepEqual(verifyRepository(c),[]);assert.equal(repositoryDigest(r),before);assert.ok(!existsSync(join(c,".codex/skills/runtime")));
 assert.equal(readlinkSync(join(c,".codex/skills/local-skill")),"../../.agents/skills/local-skill");
});
for(const policy of ["limits","files"] as const)test(`bundle repin old policy versus new ${policy}, then unchanged`,async()=>{
 const r=bundleRepository();const state=readRepositorySkillState(r);const old=runtimeSource();const next={...old,bundle:policy==="limits"?{...old.bundle!,limits:{...old.bundle!.limits,files:2}}:{files:[old.bundle!.files[0]],limits:{files:1,singleFileBytes:100,totalBytes:100}}};
 writeFileSync(join(r,".agents/skills/skills.sources.json"),serializeSources({...state.sources,skills:state.sources.skills.map(s=>s.name==="runtime"?next:s)}));const base=commitFixture(r);const c=candidate(r);const context={repositoryRoot:r,ghRunner:bundleRunner().runner};
 const update=await runSkillCommand("skills:update",args(r,base,c),context);assert.equal(update.exitCode,1);
 const result=await runSkillCommand("skills:repin",[...args(r,base,c),...approval,"--apply"],context);assert.equal(result.exitCode,0,result.stderr);assert.equal(result.report.status,"applied");
 const change=result.report.changes[0];assert.deepEqual(change.beforeBundle,old.bundle);assert.deepEqual(change.afterBundle,next.bundle);
 assert.equal(change.bundleFileChanges?.length,policy==="limits"?0:1);assert.deepEqual(verifyRepository(c),[]);
 const newBase=commitFixture(c);const nextCandidate=candidate(c);const again=await runSkillCommand("skills:repin",[...args(c,newBase,nextCandidate),...approval,"--apply"],{...context,repositoryRoot:c});assert.equal(again.exitCode,0,again.stderr);assert.equal(again.report.status,"unchanged");
});
test("bundle repin mode change records executable delta; branch and pin-commit rejected",async()=>{
 const r=bundleRepository();const state=readRepositorySkillState(r);const s=runtimeSource();const files=bundleFiles.map(f=>({...f,executable:false}));const next={...s,bundle:{...s.bundle!,files:files.map(({path,executable})=>({path,executable}))}};
 writeFileSync(join(r,".agents/skills/skills.sources.json"),serializeSources({...state.sources,skills:state.sources.skills.map(s=>s.name==="runtime"?next:s)}));const base=commitFixture(r);const c=candidate(r);const sha="c".repeat(40);const context={repositoryRoot:r,ghRunner:bundleRunner(next,files,sha).runner};
 for(const ref of [["--branch","main"],["--pin-commit"]]){const result=await runSkillCommand("skills:repin",[...args(r,base,c),"--name","runtime","--commit",sha,...ref,"--apply"],context);assert.equal(result.exitCode,1);assert.equal(git(c,"status","--porcelain"),"");}
 const result=await runSkillCommand("skills:repin",[...args(r,base,c),"--name","runtime","--tag","v1","--commit",sha,"--tag-object",sha,"--apply"],context);assert.equal(result.exitCode,0,result.stderr);
 assert.equal(result.report.changes[0].bundleFileChanges?.[0].before?.executable,true);assert.equal(result.report.changes[0].bundleFileChanges?.[0].after?.executable,false);assert.deepEqual(verifyRepository(c),[]);
});
import { spawnSync } from "node:child_process";
function maskedCommand(root:string,base:string,c:string,mask:number,installed=false,ordinary=false){
 const script=`import {runSkillCommand} from ${JSON.stringify(new URL("./skill-updater/commands.ts",import.meta.url).href)};
 import {bundleRunner,bundleFiles,bundleCommit} from ${JSON.stringify(new URL("./skill-updater-bundle-test-fixture.ts",import.meta.url).href)};
 const [root,base,c,mask,installed,ordinary]=process.argv.slice(1);process.umask(Number(mask));
 let files=installed==="true"?bundleFiles.map(f=>f.path==="Lib/run.sh"?{...f,content:Buffer.concat([f.content,Buffer.from("new")])}:f):bundleFiles;
 if(ordinary==="true")files=[...files,{path:"skills/demo/SKILL.md",executable:false,content:Buffer.from("---\\nname: demo\\ndescription: fixture\\n---\\n")},{path:"skills/demo/run",executable:true,content:Buffer.from("fixture")}];
 const commit=installed==="true"?"c".repeat(40):bundleCommit;
 const args=["--source",root,"--base",base,"--candidate",c,"--apply",...(installed==="true"?["--name","runtime","--tag","v1","--commit",commit,"--tag-object",commit]:[])];
 const r=await runSkillCommand(installed==="true"?"skills:repin":"skills:update",args,{repositoryRoot:root,ghRunner:bundleRunner(undefined,files,commit).runner});
 console.log(JSON.stringify(r));`;
 const result=spawnSync(process.execPath,["--input-type=module","-e",script,root,base,c,String(mask),String(installed),String(ordinary)],{encoding:"utf8",timeout:30000});assert.equal(result.status,0,result.stderr);
 return JSON.parse(result.stdout.split("\n").find(line=>line.startsWith("{"))!) as Awaited<ReturnType<typeof runSkillCommand>>;
}
for(const mask of [0o022,0o077])for(const installed of [false,true])test(`umask ${mask.toString(8)} bundle ${installed?"replacement":"addition"} and reused directory modes`,()=>{
 const r=bundleRepository(installed);const base=commitFixture(r);const c=candidate(r);
 if(installed)chmodSync(join(c,".agents/vendor"),0o700);
 const oldMode=installed?lstatSync(join(c,".agents/vendor")).mode:undefined;const before=repositoryDigest(r);
 const result=maskedCommand(r,base,c,mask,installed);assert.equal(result.exitCode,0,result.stderr);
 for(const [p,executable] of [["LICENSE",false],["Lib/run.sh",true],["Lib",true],["",true]] as const)assert.equal(lstatSync(join(c,".agents/vendor/runtime",p)).mode&0o777,(executable?0o755:0o644)&~mask);
 if(installed)assert.equal(lstatSync(join(c,".agents/vendor")).mode,oldMode);
 assert.equal(lstatSync(join(c,".agents/skills/skills.lock.json")).mode&0o777,0o644);assert.deepEqual(verifyRepository(c),[]);assert.equal(repositoryDigest(r),before);
});
for(const mask of [0o400,0o100])test(`umask ${mask.toString(8)} missing required bits rejects all writes`,()=>{
 const r=bundleRepository(false);const base=commitFixture(r);const c=candidate(r);const before=repositoryDigest(c);
 const result=maskedCommand(r,base,c,mask);assert.equal(result.exitCode,1);assert.deepEqual(result.report.changes,[]);assert.equal(repositoryDigest(c),before);assert.ok(!existsSync(join(c,".agents/vendor")));
});
test("umask owner-write loss preserves partially written candidate, original repository, then fresh retry",()=>{
 const r=bundleRepository(false);const base=commitFixture(r);const c=candidate(r);const before=repositoryDigest(r);const index=readFileSync(join(r,".git/index"));const config=readFileSync(join(r,".git/config"));const refs=git(r,"show-ref");
 const result=maskedCommand(r,base,c,0o222);assert.equal(result.exitCode,1);assert.match(result.stderr,/EACCES/);assert.deepEqual(result.report.changes,[]);
 assert.equal(lstatSync(join(c,".agents/vendor")).mode&0o777,0o555);assert.ok(!existsSync(join(c,".agents/vendor/runtime")));assert.equal(repositoryDigest(r),before);assert.deepEqual(readFileSync(join(r,".git/index")),index);assert.deepEqual(readFileSync(join(r,".git/config")),config);assert.equal(git(r,"show-ref"),refs);
 const fresh=candidate(r);const retry=maskedCommand(r,base,fresh,0o077);assert.equal(retry.exitCode,0,retry.stderr);assert.deepEqual(verifyRepository(fresh),[]);
 // 診断済みの自作fixtureだけ、test cleanupのため権限を戻す。
 chmodSync(join(c,".agents/vendor"),0o755);
});
for(const link of ["correct","wrong","user","missing"] as const)test(`bundle apply host leaf ${link} follows existing contract`,async()=>{
 const r=bundleRepository(false);const p=join(r,".codex/skills/local-skill");
 if(link==="wrong"||link==="missing")rmSync(p);
 if(link==="wrong")symlinkSync("../../nonexistent",p);
 if(link==="user")symlinkSync("../../user-target",join(r,".codex/skills/runtime"));
 const base=commitFixture(r);const c=candidate(r);const result=await runSkillCommand("skills:update",[...args(r,base,c),"--apply"],{repositoryRoot:r,ghRunner:bundleRunner().runner});assert.equal(result.exitCode,0,result.stderr);assert.equal(readlinkSync(join(c,".codex/skills/local-skill")),"../../.agents/skills/local-skill");
 if(link==="user")assert.equal(readlinkSync(join(c,".codex/skills/runtime")),"../../user-target");
});
for(const kind of ["untracked","ignored","vendor-link","host-deep","host-file","dirty-link-deletion","parent-link","root-link","hardlink"] as const)test(`bundle candidate ${kind} rejects before writes`,async()=>{
 const r=bundleRepository();
 if(kind==="ignored")writeFileSync(join(r,".gitignore"),".agents/vendor/runtime/ignored\n");
 if(kind==="host-deep"){mkdirSync(join(r,".codex/skills/deep"));symlinkSync("../../../outside",join(r,".codex/skills/deep/link"));}
 if(kind==="host-file"){rmSync(join(r,".codex/skills/local-skill"));writeFileSync(join(r,".codex/skills/local-skill"),"collision");}
 const base=commitFixture(r);const c=candidate(r);
 if(kind==="untracked"||kind==="ignored")writeFileSync(join(c,".agents/vendor/runtime",kind),"collision");
 if(kind==="vendor-link"){rmSync(join(c,".agents/vendor/runtime/LICENSE"));symlinkSync("../../../LICENSE",join(c,".agents/vendor/runtime/LICENSE"));}
 if(kind==="dirty-link-deletion")rmSync(join(c,".codex/skills/local-skill"));
 if(kind==="parent-link"){rmSync(join(c,".codex"),{recursive:true});symlinkSync(join(r,".codex"),join(c,".codex"));}
 if(kind==="root-link"){rmSync(join(c,".agents/vendor"),{recursive:true});symlinkSync(join(r,".agents/vendor"),join(c,".agents/vendor"));}
 if(kind==="hardlink"){rmSync(join(c,".agents/vendor/runtime/LICENSE"));linkSync(join(r,".agents/vendor/runtime/LICENSE"),join(c,".agents/vendor/runtime/LICENSE"));}
 const before=repositoryDigest(c);const sourceBefore=repositoryDigest(r);const sha="c".repeat(40);const files=bundleFiles.map(f=>f.path==="Lib/run.sh"?{...f,content:Buffer.from("updated")}:f);
 const result=await runSkillCommand("skills:repin",[...args(r,base,c),"--name","runtime","--tag","v1","--commit",sha,"--tag-object",sha,"--apply"],{repositoryRoot:r,ghRunner:bundleRunner(undefined,files,sha).runner});assert.equal(result.exitCode,1);assert.equal(repositoryDigest(c),before);assert.equal(repositoryDigest(r),sourceBefore);
});
import { linkSync } from "node:fs";
test("unchanged bundle update and ordinary adopt-local keep rejecting wrong declared links",async()=>{
 const r=bundleRepository();rmSync(join(r,".codex/skills/local-skill"));symlinkSync("wrong",join(r,".codex/skills/local-skill"));const base=commitFixture(r);const c=candidate(r);const before=repositoryDigest(c);
 const result=await runSkillCommand("skills:update",[...args(r,base,c),"--apply"],{repositoryRoot:r,ghRunner:bundleRunner().runner});assert.equal(result.exitCode,1);assert.match(result.stderr,/link/);assert.equal(repositoryDigest(c),before);
 const a=await runSkillCommand("skills:adopt-local",[...args(r,base,c),"--name","local-skill","--apply"],{repositoryRoot:r});assert.equal(a.exitCode,1);assert.match(a.stderr,/link/);assert.equal(repositoryDigest(c),before);
 const repair=await runSkillCommand("skills:links",[],{repositoryRoot:c});assert.equal(repair.exitCode,0,repair.stderr);assert.deepEqual(verifyRepository(c),[]);
});
test("later bundle cohort fails metadata preflight after earlier blobs, entire operation stays unapplied",async()=>{
 const r=bundleRepository(false);const state=readRepositorySkillState(r);const second={...runtimeSource("second"),repository:"zexample/runtime"};writeFileSync(join(r,".agents/skills/skills.sources.json"),serializeSources({...state.sources,skills:[...state.sources.skills,second]}));const base=commitFixture(r);const c=candidate(r);const before=repositoryDigest(c);
 const first=bundleRunner();const later=bundleRunner(second,[bundleFiles[0]]);const result=await runSkillCommand("skills:update",[...args(r,base,c),"--apply"],{repositoryRoot:r,ghRunner:async a=>a.at(-1)!.startsWith("repos/zexample/")?later.runner(a):first.runner(a)});
 assert.equal(result.exitCode,1);assert.equal(result.report.status,"failed");assert.deepEqual(result.report.changes,[]);assert.equal(repositoryDigest(c),before);assert.ok(first.calls.some(p=>p.includes("/blobs/")));assert.ok(!later.calls.some(p=>p.includes("/blobs/")));
});
test("independent 26 MiB cohorts are not rejected by a cumulative 50 MiB budget",async()=>{
 const r=bundleRepository(false);const state=readRepositorySkillState(r);const content=Buffer.alloc(1048576,65);const files=[bundleFiles[0],...Array.from({length:26},(_,i)=>({path:`data/${i}`,executable:false,content}))];
 const sources=["a/runtime","b/runtime"].flatMap((repository,g)=>files.slice(1).map((f,i)=>({...runtimeSource(`runtime-${g}-${i}`,[files[0],f]),repository})));
 writeFileSync(join(r,".agents/skills/skills.sources.json"),serializeSources({...state.sources,skills:[state.sources.skills[0],...sources]}));const base=commitFixture(r);
 const first=bundleRunner(sources[0],files);const second=bundleRunner(sources[26],files);
 const result=await runSkillCommand("skills:check",["--source",r,"--base",base],{repositoryRoot:r,ghRunner:async a=>a.at(-1)!.startsWith("repos/a/")?first.runner(a):second.runner(a)});
 assert.equal(result.exitCode,0,result.stderr);assert.equal(result.report.changes.length,52);
});
import { applyCandidate } from "./skill-updater/apply.ts";
import { preflightIsolation } from "./skill-updater/isolation.ts";
import { planRemoteMaintenance } from "./skill-updater/planner.ts";
import { readCommittedSnapshot } from "./skill-updater/repository.ts";
import { readSnapshotTrees } from "./skill-updater/ownership.ts";
test("bundle partial file write failure retains candidate and succeeds only in a new clone",async()=>{
 const r=bundleRepository(false);const base=commitFixture(r);const c=candidate(r);const state=readRepositorySkillState(r);const trees=readSnapshotTrees(readCommittedSnapshot(r,base),state.sources);const plan=await planRemoteMaintenance({...state,installedTrees:trees},bundleRunner().runner);const before=repositoryDigest(r);let writes=0;
 assert.throws(()=>applyCandidate(preflightIsolation({source:r,base,candidate:c}),plan,()=>{writes++;throw new Error("injected EIO");}),/EIO/);
 assert.equal(writes,1);assert.ok(existsSync(join(c,".agents/vendor/runtime/LICENSE")));assert.ok(!existsSync(join(c,".agents/vendor/runtime/Lib/run.sh")));assert.equal(repositoryDigest(r),before);assert.throws(()=>preflightIsolation({source:r,base,candidate:c}));
 const fresh=candidate(r);applyCandidate(preflightIsolation({source:r,base,candidate:fresh}),plan);assert.deepEqual(verifyRepository(fresh),[]);assert.equal(repositoryDigest(r),before);
});
test("bundle candidate permissions changing during observation are rejected before apply",async()=>{
 const r=bundleRepository(false);const base=commitFixture(r);const c=candidate(r);const f=bundleRunner();const before=repositoryDigest(c);let mutated=false;
 const result=await runSkillCommand("skills:update",[...args(r,base,c),"--apply"],{repositoryRoot:r,ghRunner:async a=>{if(!mutated){chmodSync(join(c,".agents/skills"),0o700);mutated=true;}return f.runner(a);}});
 assert.equal(result.exitCode,1);assert.match(result.stderr,/変化/);assert.equal(repositoryDigest(c),before);assert.ok(!existsSync(join(c,".agents/vendor")));
});
for(const reason of ["draft","deleted","tag"] as const)test(`bundle apply reobserves ${reason} after successful preview`,async()=>{
 const r=bundleRepository(false);const base=commitFixture(r);const c=candidate(r);const f=bundleRunner();const preview=await runSkillCommand("skills:update",args(r,base,c),{repositoryRoot:r,ghRunner:f.runner});assert.equal(preview.exitCode,0,preview.stderr);const before=repositoryDigest(c);
 const result=await runSkillCommand("skills:update",[...args(r,base,c),"--apply"],{repositoryRoot:r,ghRunner:async a=>{
  const endpoint=a.at(-1)!;
  if(reason==="deleted"&&endpoint.includes("/releases/"))return {exitCode:1,stdout:"",stderr:"404"};
  const response=await f.runner(a);const data=JSON.parse(response.stdout);
  if(reason==="draft"&&endpoint.includes("/releases/"))data.draft=true;
  if(reason==="tag"&&endpoint.includes("/git/ref/"))data.object.sha="c".repeat(40);
  return {...response,stdout:JSON.stringify(data)};
 }});assert.equal(result.exitCode,1);assert.deepEqual(result.report.changes,[]);assert.equal(repositoryDigest(c),before);
});
test("bundle content-only repin displays file delta without bundle policy fields or body",async()=>{
 const r=bundleRepository();const base=commitFixture(r);const c=candidate(r);const files=bundleFiles.map(f=>f.path==="Lib/run.sh"?{...f,content:Buffer.from("PRIVATE_FIXTURE_CONTENT")}:f);const commit="c".repeat(40);
 const result=await runSkillCommand("skills:repin",[...args(r,base,c),"--name","runtime","--tag","v1","--commit",commit,"--tag-object",commit],{repositoryRoot:r,ghRunner:bundleRunner(undefined,files,commit).runner});assert.equal(result.exitCode,0,result.stderr);assert.ok(!Object.hasOwn(result.report.changes[0],"beforeBundle"));assert.equal(result.report.changes[0].bundleFileChanges?.length,1);assert.match(result.stdout,/Lib\/run.sh/);assert.ok(!result.stdout.includes("PRIVATE_FIXTURE_CONTENT"));
});
import { serializeLock } from "./skill-updater/schema.ts";
test("retirement commit check never refetches removed bundle, preserves surviving bundles and Skills",async()=>{
 for(const survivor of [false,true]){
  const r=bundleRepository();const state=readRepositorySkillState(r);const extra=runtimeSource("remaining");
  const sources=state.sources.skills.filter(s=>s.name!=="runtime");if(survivor)sources.push(extra);
  writeFileSync(join(r,".agents/skills/skills.sources.json"),serializeSources({schemaVersion:2,skills:sources}));
  writeFileSync(join(r,".agents/skills/skills.lock.json"),serializeLock({schemaVersion:2,skills:survivor?[runtimeLock(extra)]:[]}));
  if(survivor)renameSync(join(r,".agents/vendor/runtime"),join(r,".agents/vendor/remaining"));else rmSync(join(r,".agents/vendor"),{recursive:true});
  assert.deepEqual(verifyRepository(r),[]);const base=commitFixture(r);const fake=bundleRunner(extra);
  const result=await runSkillCommand("skills:check",["--source",r,"--base",base],{repositoryRoot:r,ghRunner:fake.runner});assert.equal(result.exitCode,0,result.stderr);assert.equal(result.report.status,"unchanged");assert.deepEqual(result.report.changes,[]);assert.ok(!existsSync(join(r,".agents/vendor/runtime")));assert.equal(fake.calls.length===0,!survivor);
 }
});
import { runtimeLock } from "./skill-updater-bundle-test-fixture.ts";
import { renameSync } from "node:fs";

test("umask 077 preserves ordinary Skill write modes in mixed bundle apply",()=>{
 const r=bundleRepository(false);const state=readRepositorySkillState(r);const {bundle:_,...remote}=runtimeSource("demo");
 const demo={...remote,target:".agents/skills/demo",subtree:{path:"skills/demo"}};
 writeFileSync(join(r,".agents/skills/skills.sources.json"),serializeSources({...state.sources,skills:[...state.sources.skills,demo]}));
 const base=commitFixture(r);const c=candidate(r);const result=maskedCommand(r,base,c,0o077,false,true);assert.equal(result.exitCode,0,result.stderr);
 assert.equal(lstatSync(join(c,".agents/skills/demo/SKILL.md")).mode&0o777,0o644);
 assert.equal(lstatSync(join(c,".agents/skills/demo/run")).mode&0o777,0o755);
 assert.equal(lstatSync(join(c,".agents/vendor/runtime/LICENSE")).mode&0o777,0o600);
 assert.equal(lstatSync(join(c,".agents/vendor/runtime/Lib/run.sh")).mode&0o777,0o700);
 assert.deepEqual(verifyRepository(c),[]);
});
