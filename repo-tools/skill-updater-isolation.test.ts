import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, lstatSync, readdirSync, readlinkSync, symlinkSync, linkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";
import { preflightIsolation } from "./skill-updater/isolation.ts";
import { applyCandidate } from "./skill-updater/apply.ts";
import { readCommittedSnapshot, verifyRepository } from "./skill-updater/repository.ts";
import { serializeSources, serializeLock } from "./skill-updater/schema.ts";
import { sha256 } from "./skill-updater/legal.ts";
import type { SourcesDocument } from "./skill-updater/types.ts";

function git(root:string,...args:string[]):string {
  const result=spawnSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.invalid",...args],{cwd:root,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr); return result.stdout.trim();
}
function snapshot(root:string):string {
  const hash=createHash("sha256");
  const walk=(path:string):void=>{
    const stat=lstatSync(path); hash.update(`${path.slice(root.length)}:${stat.mode}:`);
    if (stat.isSymbolicLink()) hash.update(readlinkSync(path));
    else if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path,name));
    else hash.update(readFileSync(path));
  };
  walk(root); return hash.digest("hex");
}
function fixture() {
  const parent=createSkillUpdaterTestRoot("skill-isolation-"); const source=join(parent,"source"); const candidate=join(parent,"candidate");
  mkdirSync(join(source,".agents/skills/local"),{recursive:true});
  writeFileSync(join(source,"LICENSE"),"MIT\n");
  writeFileSync(join(source,".agents/skills/local/SKILL.md"),"---\nname: local\ndescription: Local skill\n---\nbase\n");
  const sources:SourcesDocument={schemaVersion:2,skills:[{name:"local",ownership:"local",license:"MIT",redistribution:"allowed",target:".agents/skills/local",legalMappings:[{path:"LICENSE",expectedSha256:sha256(Buffer.from("MIT\n"))}]}]};
  writeFileSync(join(source,".agents/skills/skills.sources.json"),serializeSources(sources));
  writeFileSync(join(source,".agents/skills/skills.lock.json"),serializeLock({schemaVersion:2,skills:[]}));
  for (const base of [".claude/skills",".codex/skills"]) { mkdirSync(join(source,base),{recursive:true}); symlinkSync("../../.agents/skills/local",join(source,base,"local")); }
  writeFileSync(join(source,".gitignore"),"node_modules/\n.venv/\n.agents/skills/**/ignored\n");
  git(source,"init","-q"); git(source,"add","."); git(source,"commit","-qm","fixture");
  const base=git(source,"rev-parse","HEAD"); git(parent,"clone","--no-local","-q",source,candidate);
  return {parent,source,candidate,base,sources};
}

test("independent clone applies committed input without changing source working tree, index, refs or config",()=>{
  const f=fixture();
  writeFileSync(join(f.source,"staged"),"staged\n"); git(f.source,"add","staged");
  writeFileSync(join(f.source,"untracked"),"untracked\n");
  writeFileSync(join(f.source,".agents/skills/local/SKILL.md"),"uncommitted invalid text\n");
  const before=snapshot(f.source);
  const committed=readCommittedSnapshot(f.source,f.base);
  assert.match(committed.readFile(".agents/skills/local/SKILL.md").toString(),/base/);
  mkdirSync(join(f.candidate,"node_modules")); writeFileSync(join(f.candidate,"node_modules/installed"),"dependency");
  const isolated=preflightIsolation(f);
  applyCandidate(isolated,{sources:f.sources,lock:{schemaVersion:2,skills:[]},trees:new Map()});
  assert.deepEqual(verifyRepository(f.candidate),[]);
  assert.equal(snapshot(f.source),before);
});

for (const kind of ["same-root","contained","linked-worktree","shared-clone","hardlink-file","hardlink-git","symlink-parent","symlink-tree","head","dirty","staged","untracked","ignored"] as const) {
  test(`isolation rejects ${kind} before writes and leaves the source snapshot unchanged`,()=>{
    const f=fixture(); let candidate=f.candidate;
    if (kind==="same-root") candidate=f.source;
    if (kind==="contained") { candidate=join(f.source,"nested"); git(f.parent,"clone","--no-local","-q",f.source,candidate); }
    if (kind==="linked-worktree") { candidate=join(f.parent,"worktree"); git(f.source,"worktree","add","--detach",candidate,f.base); }
    if (kind==="shared-clone") { candidate=join(f.parent,"shared"); git(f.parent,"clone","--shared","-q",f.source,candidate); }
    if (kind==="hardlink-file") { const name=".agents/skills/local/SKILL.md"; rmSync(join(candidate,name)); linkSync(join(f.source,name),join(candidate,name)); }
    if (kind==="hardlink-git") { rmSync(join(candidate,".git/config")); linkSync(join(f.source,".git/config"),join(candidate,".git/config")); }
    if (kind==="symlink-parent") { rmSync(join(candidate,".codex"),{recursive:true}); symlinkSync(join(f.source,".codex"),join(candidate,".codex")); }
    if (kind==="symlink-tree") { rmSync(join(candidate,".agents/skills/local"),{recursive:true}); symlinkSync(join(f.source,".agents/skills/local"),join(candidate,".agents/skills/local")); }
    if (kind==="head") git(candidate,"commit","--allow-empty","-qm","different");
    if (kind==="dirty" || kind==="staged") { writeFileSync(join(candidate,"LICENSE"),"changed\n"); if(kind==="staged")git(candidate,"add","LICENSE"); }
    if (kind==="untracked" || kind==="ignored") writeFileSync(join(candidate,`.agents/skills/local/${kind}`),kind);
    const before=snapshot(f.source);
    assert.throws(()=>preflightIsolation({...f,candidate}));
    assert.equal(snapshot(f.source),before);
  });
}

test("isolation rechecks observable changes immediately before applying",()=>{
  const f=fixture(); const isolated=preflightIsolation(f); const before=snapshot(f.source);
  writeFileSync(join(f.candidate,".agents/skills/local/SKILL.md"),"changed\n");
  assert.throws(()=>applyCandidate(isolated,{sources:f.sources,lock:{schemaVersion:2,skills:[]},trees:new Map()}),/dirty|変化/);
  assert.equal(snapshot(f.source),before);
});

test("Git environment overrides cannot redirect metadata writes",()=>{
  const f=fixture(); const original=process.env.GIT_INDEX_FILE;
  try { process.env.GIT_INDEX_FILE=join(f.source,".git/index"); assert.throws(()=>preflightIsolation(f),/環境変数/); }
  finally { if(original===undefined) delete process.env.GIT_INDEX_FILE; else process.env.GIT_INDEX_FILE=original; }
});

for (const code of ["EIO","ENOSPC"]) {
  test(`partial ${code} preserves source and requires a fresh clone`,()=>{
    const f=fixture(); const before=snapshot(f.source);
    const plan={sources:{...f.sources,skills:f.sources.skills.map(s=>({...s,license:"Apache-2.0"}))},lock:{schemaVersion:2 as const,skills:[]},trees:new Map()};
    assert.throws(()=>applyCandidate(preflightIsolation(f),plan,()=>{throw Object.assign(new Error(code),{code});}),new RegExp(code));
    assert.equal(snapshot(f.source),before);
    assert.throws(()=>preflightIsolation(f),/dirty/);
    // 部分候補のoffline verifyだけでは操作成功の証拠にならない。
    assert.deepEqual(verifyRepository(f.candidate),[]);
    const candidate=join(f.parent,"retry"); git(f.parent,"clone","--no-local","-q",f.source,candidate);
    applyCandidate(preflightIsolation({...f,candidate}),plan);
    assert.deepEqual(verifyRepository(candidate),[]);
    assert.equal(snapshot(f.source),before);
  });
}

test("SIGKILL during candidate write preserves source and a new clone can retry",()=>{
  const f=fixture(); const before=snapshot(f.source);
  const isolationUrl=new URL("./skill-updater/isolation.ts",import.meta.url).href;
  const applyUrl=new URL("./skill-updater/apply.ts",import.meta.url).href;
  const sources={...f.sources,skills:f.sources.skills.map(s=>({...s,license:"Apache-2.0"}))};
  const script=`import {preflightIsolation} from ${JSON.stringify(isolationUrl)}; import {applyCandidate} from ${JSON.stringify(applyUrl)}; applyCandidate(preflightIsolation(${JSON.stringify(f)}), {sources:${JSON.stringify(sources)},lock:{schemaVersion:2,skills:[]},trees:new Map()},()=>process.kill(process.pid,"SIGKILL"));`;
  const killed=spawnSync(process.execPath,["--input-type=module","-e",script],{encoding:"utf8",timeout:10000});
  assert.equal(killed.signal,"SIGKILL",killed.stderr);
  assert.equal(snapshot(f.source),before);
  assert.throws(()=>preflightIsolation(f),/dirty/);
  const candidate=join(f.parent,"retry"); git(f.parent,"clone","--no-local","-q",f.source,candidate);
  applyCandidate(preflightIsolation({...f,candidate}),{sources,lock:{schemaVersion:2,skills:[]},trees:new Map()});
  assert.equal(snapshot(f.source),before);
});

test("final offline failure cannot be returned as successful apply",()=>{
  const f=fixture(); const before=snapshot(f.source);
  assert.throws(()=>applyCandidate(preflightIsolation(f),{sources:f.sources,lock:{schemaVersion:2,skills:[]},trees:new Map()},path=>{
    if(path.endsWith("skills.lock.json")) writeFileSync(join(f.candidate,".agents/skills/local/SKILL.md"),"invalid");
  }),/最終offline verify/);
  assert.equal(snapshot(f.source),before);
});

import { validateSkillTree } from "./skill-updater/metadata.ts";
function remoteFixture() {
  const f=fixture();
  writeFileSync(join(f.source,".agents/skills/local/LICENSE"),"MIT\n");
  const source={name:"local",ownership:"remote" as const,license:"MIT",redistribution:"allowed" as const,target:".agents/skills/local",repository:"example/skills",ref:{branch:"main"},subtree:{root:true as const},legalMappings:[{sourcePath:"LICENSE",targetPath:"LICENSE",expectedSha256:sha256(Buffer.from("MIT\n"))}]};
  const previous=validateSkillTree([{path:"SKILL.md",executable:false,content:readFileSync(join(f.source,".agents/skills/local/SKILL.md"))},{path:"LICENSE",executable:false,content:Buffer.from("MIT\n")}],"local");
  const {legalMappings,...identity}=source;
  const lock={schemaVersion:2 as const,skills:[{...identity,resolvedCommit:"a".repeat(40),verification:"unknown" as const,treeHash:previous.treeHash,fileCount:previous.fileCount,byteCount:previous.byteCount,legalFiles:legalMappings.map(m=>({sourcePath:m.sourcePath,targetPath:m.targetPath,sha256:m.expectedSha256}))}]};
  const sources={schemaVersion:2 as const,skills:[source]};
  writeFileSync(join(f.source,".agents/skills/skills.sources.json"),serializeSources(sources));
  writeFileSync(join(f.source,".agents/skills/skills.lock.json"),serializeLock(lock));
  git(f.source,"add","."); git(f.source,"commit","-qm","remote fixture");
  const candidate=join(f.parent,"remote-candidate"); git(f.parent,"clone","--no-local","-q",f.source,candidate);
  const tree=validateSkillTree(previous.files.map(file=>file.path==="SKILL.md" ? {...file,content:Buffer.concat([file.content,Buffer.from("updated\n")])}:file),"local");
  const updated={schemaVersion:2 as const,skills:lock.skills.map(l=>({...l,resolvedCommit:"b".repeat(40),treeHash:tree.treeHash,fileCount:tree.fileCount,byteCount:tree.byteCount}))};
  return {...f,candidate,base:git(f.source,"rev-parse","HEAD"),plan:{sources,lock:updated,trees:new Map([["local",tree]])}};
}
for (const failure of ["EIO","ENOSPC","SIGKILL"]) test(`remote body write ${failure} cannot affect source and succeeds from a fresh clone`,()=>{
  const f=remoteFixture(); const before=snapshot(f.source);
  if(failure==="SIGKILL") {
    const script=`import {preflightIsolation} from ${JSON.stringify(new URL("./skill-updater/isolation.ts",import.meta.url).href)}; import {applyCandidate} from ${JSON.stringify(new URL("./skill-updater/apply.ts",import.meta.url).href)}; const plan=${JSON.stringify({...f.plan,trees:[...f.plan.trees]})}; plan.trees=new Map(plan.trees.map(([name,tree])=>[name,{...tree,files:tree.files.map(f=>({...f,content:Buffer.from(f.content.data)}))}])); applyCandidate(preflightIsolation(${JSON.stringify(f)}),plan,()=>process.kill(process.pid,"SIGKILL"));`;
    const result=spawnSync(process.execPath,["--input-type=module","-e",script],{encoding:"utf8",timeout:10000}); assert.equal(result.signal,"SIGKILL",result.stderr);
  } else assert.throws(()=>applyCandidate(preflightIsolation(f),f.plan,()=>{throw Object.assign(new Error(failure),{code:failure});}),new RegExp(failure));
  assert.equal(snapshot(f.source),before);
  assert.throws(()=>preflightIsolation(f),/dirty/);
  const candidate=join(f.parent,"fresh"); git(f.parent,"clone","--no-local","-q",f.source,candidate);
  applyCandidate(preflightIsolation({...f,candidate}),f.plan);
  assert.deepEqual(verifyRepository(candidate),[]);
  assert.match(readFileSync(join(candidate,".agents/skills/local/SKILL.md"),"utf8"),/updated/);
  assert.equal(snapshot(f.source),before);
});

for(const flag of ["--assume-unchanged","--skip-worktree"])test(`isolation rejects hidden edits behind ${flag}`,()=>{
  const f=fixture();const path=".agents/skills/local/SKILL.md";git(f.candidate,"update-index",flag,path);writeFileSync(join(f.candidate,path),"hidden edit");assert.throws(()=>preflightIsolation(f));
});
