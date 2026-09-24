import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeSkillRepository, repositoryDigest } from "./skill-updater-test-fixture.ts";
import { repairLinks } from "./skill-updater/links.ts";
const entrypoint=new URL("./entrypoint.mjs",import.meta.url).pathname;
function run(root:string,command:string,...args:string[]) {return spawnSync(process.execPath,[entrypoint,command,...args,"--json"],{cwd:root,encoding:"utf8"});}
test("skills:verify accepts local body edits with an empty remote lock and returns the exact v2 JSON contract",()=>{
  const root=writeSkillRepository();
  writeFileSync(join(root,".agents/skills/local-skill/SKILL.md"),"---\nname: local-skill\ndescription: Edited\n---\nuser edits\n");
  const result=run(root,"skills:verify");assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{schemaVersion:2,command:"skills:verify",status:"unchanged",changes:[],warnings:[],errors:[]});
});
for(const [command,args] of [
  ["skills:verify",["--unknown"]],["skills:verify",["--root",".","--root","."]],["skills:links",["--apply"]],["skills:links",["--candidate","."]],["skills:check",[]],["skills:update",[]],["skills:repin",[]],["skills:adopt-local",[]],["skills:lock-local",[]],["skills:unknown",[]],
] as const) test(`${command} rejects ${args.join(" ") || "missing inputs / legacy command"} without writes`,()=>{
  const root=writeSkillRepository();const before=repositoryDigest(root);assert.equal(run(root,command,...args).status,command === "skills:unknown" ? 2 : 1);assert.equal(repositoryDigest(root),before);
});
for(const failure of ["missing-source","missing-lock","malformed","old-version","local-lock","structure","legal"] as const) test(`skills:verify rejects ${failure}`,()=>{
  const root=writeSkillRepository();const sources=join(root,".agents/skills/skills.sources.json");const lock=join(root,".agents/skills/skills.lock.json");
  if(failure==="missing-source")renameSync(sources,`${sources}.missing`);
  if(failure==="missing-lock")renameSync(lock,`${lock}.missing`);
  if(failure==="malformed")writeFileSync(lock,"{broken");
  if(failure==="old-version")writeFileSync(lock,'{"schemaVersion":1,"skills":[]}');
  if(failure==="local-lock")writeFileSync(lock,readFileSync(sources));
  if(failure==="structure")writeFileSync(join(root,".agents/skills/local-skill/SKILL.md"),"invalid");
  if(failure==="legal")writeFileSync(join(root,"LICENSE"),"other");
  const before=repositoryDigest(root);const result=run(root,"skills:verify");assert.equal(result.status,1);assert.equal(repositoryDigest(root),before);
});
test("links repairs missing, broken and wrong links in the current checkout and is idempotent without approving invalid body",()=>{
  const root=writeSkillRepository();const left=join(root,".claude/skills/local-skill");const right=join(root,".codex/skills/local-skill");
  unlinkSync(left);unlinkSync(right);symlinkSync("missing",right);
  const body=join(root,".agents/skills/local-skill/SKILL.md");writeFileSync(body,"invalid but retained");
  writeFileSync(join(root,"user-file"),"user");spawnSync("git",["add","user-file"],{cwd:root});
  const staged=readFileSync(join(root,".git/index"));const metadata=readFileSync(join(root,".agents/skills/skills.sources.json"));
  assert.equal(run(root,"skills:links").status,0);assert.equal(readlinkSync(left),"../../.agents/skills/local-skill");
  const after=repositoryDigest(root);const second=run(root,"skills:links");assert.equal(JSON.parse(second.stdout).status,"unchanged");assert.equal(repositoryDigest(root),after);
  assert.deepEqual(readFileSync(join(root,".git/index")),staged);assert.deepEqual(readFileSync(join(root,".agents/skills/skills.sources.json")),metadata);
  assert.equal(readFileSync(body,"utf8"),"invalid but retained");assert.equal(run(root,"skills:verify").status,1);
});
for(const type of ["file","directory","parent-symlink"]) test(`links preflights late ${type} before repairing any earlier link`,()=>{
  const root=writeSkillRepository();const first=join(root,".claude/skills/local-skill");const second=join(root,".codex/skills/local-skill");unlinkSync(first);unlinkSync(second);
  if(type==="file")writeFileSync(second,"user");
  if(type==="directory")mkdirSync(second);
  if(type==="parent-symlink"){renameSync(join(root,".codex/skills"),join(root,"link-parent"));symlinkSync("../link-parent",join(root,".codex/skills"));}
  const before=repositoryDigest(root);assert.equal(run(root,"skills:links").status,1);assert.equal(repositoryDigest(root),before);
});
test("links I/O interruption can be retried in the same checkout",()=>{
  const root=writeSkillRepository();for(const base of [".claude/skills",".codex/skills"])unlinkSync(join(root,base,"local-skill"));
  assert.throws(()=>repairLinks(root,()=>{throw new Error("EIO");}),/EIO/);
  assert.equal(run(root,"skills:links").status,0);assert.equal(run(root,"skills:verify").status,0);
});
