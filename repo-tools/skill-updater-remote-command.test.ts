import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync, readFileSync, symlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";
import { repositoryDigest } from "./skill-updater-test-fixture.ts";
import { runSkillCommand } from "./skill-updater/commands.ts";
import { canonicalizeTree } from "./skill-updater/canonical.ts";
import { serializeSources, serializeLock } from "./skill-updater/schema.ts";
import { source as fixtureSource, transcript, skill, license, commit } from "./skill-updater-github-test-fixture.ts";
function git(root:string,...args:string[]):string {const r=spawnSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.invalid",...args],{cwd:root,encoding:"utf8"});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function fixture() {
  const parent=createSkillUpdaterTestRoot("remote-command-");const source=join(parent,"source");const candidate=join(parent,"candidate");mkdirSync(join(source,".agents/skills/demo"),{recursive:true});
  writeFileSync(join(source,".agents/skills/demo/SKILL.md"),skill);writeFileSync(join(source,".agents/skills/demo/LICENSE"),license);
  const declaration=fixtureSource();const sources={schemaVersion:2 as const,skills:[declaration]};const {legalMappings,...identity}=declaration;
  const tree=canonicalizeTree([{path:"SKILL.md",executable:false,content:skill},{path:"LICENSE",executable:false,content:license}]);
  const lock={schemaVersion:2 as const,skills:[{...identity,resolvedCommit:"a".repeat(40),verification:"verified" as const,treeHash:tree.treeHash,fileCount:tree.fileCount,byteCount:tree.byteCount,legalFiles:legalMappings.map(m=>({sourcePath:m.sourcePath,targetPath:m.targetPath,sha256:m.expectedSha256}))}]};
  writeFileSync(join(source,".agents/skills/skills.sources.json"),serializeSources(sources));writeFileSync(join(source,".agents/skills/skills.lock.json"),serializeLock(lock));
  for(const dir of [".claude/skills",".codex/skills"]){mkdirSync(join(source,dir),{recursive:true});symlinkSync("../../.agents/skills/demo",join(source,dir,"demo"));}
  git(source,"init","-q");git(source,"add",".");git(source,"commit","-qm","remote fixture");const base=git(source,"rev-parse","HEAD");git(parent,"clone","--no-local","-q",source,candidate);
  return {parent,source,candidate,base,args:["--source",source,"--base",base,"--candidate",candidate],fake:transcript({[`repos/owner/repo/compare/${"a".repeat(40)}...${commit}`]:{status:"ahead"}})};
}
test("remote update previews with no writes, applies only to independent clone, and check exit 3 is opt-in",async()=>{
  const f=fixture();const context={repositoryRoot:f.source,ghRunner:f.fake.runner};const before=repositoryDigest(f.source);const candidateBefore=repositoryDigest(f.candidate);
  const preview=await runSkillCommand("skills:update",[...f.args,"--json"],context);assert.equal(preview.exitCode,0,preview.stderr);assert.equal(preview.report.status,"planned");assert.equal(repositoryDigest(f.candidate),candidateBefore);
  const checkArgs=["--source",f.source,"--base",f.base,"--json"];
  assert.equal((await runSkillCommand("skills:check",checkArgs,context)).exitCode,0);
  assert.equal((await runSkillCommand("skills:check",[...checkArgs,"--fail-on-update"],context)).exitCode,3);
  const applied=await runSkillCommand("skills:update",[...f.args,"--apply"],context);assert.equal(applied.exitCode,0,applied.stderr);assert.equal(applied.report.status,"applied");
  assert.equal(JSON.parse(readFileSync(join(f.candidate,".agents/skills/skills.lock.json"),"utf8")).skills[0].resolvedCommit,commit);
  assert.equal(repositoryDigest(f.source),before);
});
test("remote commands use the committed snapshot and reject source as candidate",async()=>{
  const f=fixture();writeFileSync(join(f.source,".agents/skills/demo/SKILL.md"),"dirty source");const before=repositoryDigest(f.source);
  const result=await runSkillCommand("skills:update",[...f.args,"--apply"],{repositoryRoot:f.source,ghRunner:f.fake.runner});assert.equal(result.exitCode,0,result.stderr);assert.equal(repositoryDigest(f.source),before);
  const failed=await runSkillCommand("skills:update",["--source",f.source,"--base",f.base,"--candidate",f.source,"--apply"],{repositoryRoot:f.source});assert.equal(failed.exitCode,1);assert.equal(repositoryDigest(f.source),before);
});
test("repin applies same-commit license change and reports before/after policy",async()=>{
  const f=fixture();const path=join(f.source,".agents/skills/skills.sources.json");const source=JSON.parse(readFileSync(path,"utf8"));source.skills[0].license="Apache-2.0";writeFileSync(path,JSON.stringify(source));
  const lockPath=join(f.source,".agents/skills/skills.lock.json");const lock=JSON.parse(readFileSync(lockPath,"utf8"));lock.skills[0].resolvedCommit=commit;writeFileSync(lockPath,JSON.stringify(lock));git(f.source,"add",".");git(f.source,"commit","-qm","repin approval");const base=git(f.source,"rev-parse","HEAD");const candidate=join(f.parent,"repin");git(f.parent,"clone","--no-local","-q",f.source,candidate);
  const result=await runSkillCommand("skills:repin",["--source",f.source,"--base",base,"--candidate",candidate,"--name","demo","--commit",commit,"--apply","--json"],{repositoryRoot:f.source,ghRunner:f.fake.runner});
  assert.equal(result.exitCode,0,result.stderr);assert.equal(result.report.status,"applied");assert.equal(result.report.changes[0]?.beforeLicense,"MIT");assert.equal(result.report.changes[0]?.afterLicense,"Apache-2.0");
});
test("adopt-local dispatch preserves committed edited body and performs no network calls",async()=>{
  const f=fixture();appendFileSync(join(f.source,".agents/skills/demo/SKILL.md"),"edit\n");git(f.source,"add",".");git(f.source,"commit","-qm","user edit");const base=git(f.source,"rev-parse","HEAD");const candidate=join(f.parent,"local");git(f.parent,"clone","--no-local","-q",f.source,candidate);
  const result=await runSkillCommand("skills:adopt-local",["--source",f.source,"--base",base,"--candidate",candidate,"--name","demo","--apply"],{repositoryRoot:f.source,ghRunner:async()=>{throw new Error("network called");}});
  assert.equal(result.exitCode,0,result.stderr);assert.match(readFileSync(join(candidate,".agents/skills/demo/SKILL.md"),"utf8"),/edit/);assert.deepEqual(JSON.parse(readFileSync(join(candidate,".agents/skills/skills.lock.json"),"utf8")).skills,[]);
});

test("a later cohort failure fails the whole operation without writing the earlier successful cohort",async()=>{
  const f=fixture();const path=join(f.source,".agents/skills/skills.sources.json");const doc=JSON.parse(readFileSync(path,"utf8"));doc.skills.push({...doc.skills[0],name:"other",target:".agents/skills/other",repository:"zowner/fail"});writeFileSync(path,JSON.stringify(doc));git(f.source,"add",".");git(f.source,"commit","-qm","second cohort");const base=git(f.source,"rev-parse","HEAD");const candidate=join(f.parent,"multi");git(f.parent,"clone","--no-local","-q",f.source,candidate);const before=repositoryDigest(candidate);
  const result=await runSkillCommand("skills:update",["--source",f.source,"--base",base,"--candidate",candidate,"--apply"],{repositoryRoot:f.source,ghRunner:async args=>args.includes("repos/zowner/fail")?{exitCode:1,stdout:"",stderr:"API unavailable"}:f.fake.runner(args)});
  assert.equal(result.exitCode,1);assert.equal(result.report.status,"failed");assert.deepEqual(result.report.changes,[]);assert.equal(repositoryDigest(candidate),before);assert.ok(f.fake.calls.some(c=>c.includes("/git/blobs/")));
});

import { legacyRepository } from "./fixtures/skill-updater/legacy-repository.ts";
test("skills:migrate dispatches the isolated offline conversion and rejects repeated localize names",async()=>{
  const parent=createSkillUpdaterTestRoot("migrate-command-");const source=join(parent,"source");mkdirSync(source);const base=legacyRepository(source);const candidate=join(parent,"candidate");git(parent,"clone","--no-local","-q",source,candidate);
  const args=["--source",source,"--base",base,"--candidate",candidate];const context={repositoryRoot:source,ghRunner:async()=>{throw new Error("network called");}};
  assert.equal((await runSkillCommand("skills:migrate",[...args,"--localize","branch","--localize","branch"],context)).exitCode,1);
  const before=repositoryDigest(candidate);const preview=await runSkillCommand("skills:migrate",args,context);assert.equal(preview.exitCode,0,preview.stderr);assert.equal(repositoryDigest(candidate),before);
  const applied=await runSkillCommand("skills:migrate",[...args,"--apply"],context);assert.equal(applied.exitCode,0,applied.stderr);assert.equal(applied.report.status,"applied");assert.equal(JSON.parse(readFileSync(join(candidate,".agents/skills/skills.lock.json"),"utf8")).skills.length,3);
});

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
test("failed operation short-circuits verification and PR stage even when the candidate verifies", () => {
  const f = fixture();
  const entrypoint = fileURLToPath(new URL("./entrypoint.mjs", import.meta.url));
  const marker = join(f.parent, "pr-stage");
  const verified = spawnSync(process.execPath, [entrypoint, "skills:verify", "--root", f.candidate]);
  assert.equal(verified.status, 0, verified.stderr.toString());
  const result = spawnSync("bash", ["-c", `set -eu
"$1" "$2" skills:update --source "$3" --base "$4" --candidate "$3" --apply
"$1" "$2" skills:verify --root "$5"
printf reached > "$6"
`, "handoff", process.execPath, entrypoint, f.source, f.base, f.candidate, marker]);
  assert.equal(result.status, 1);
  assert.equal(existsSync(marker), false);
});

test("repin human preview shows approved and observed commit even for unchanged content", async () => {
  const f = fixture();
  const result = await runSkillCommand("skills:repin", [...f.args, "--name", "demo", "--commit", commit], {repositoryRoot:f.source, ghRunner:f.fake.runner});
  assert.equal(result.exitCode, 0, result.stderr);
  assert.ok(result.stdout.includes(`approved commit: ${commit}`));
  assert.ok(result.stdout.includes(`observed commit: ${commit}`));
});

test("empty v1 metadata migration still applies a schema transition", async () => {
  const f = fixture();
  git(f.source, "rm", "-qr", ".agents/skills/demo", ".claude", ".codex");
  for (const name of ["sources", "lock"]) writeFileSync(join(f.source, `.agents/skills/skills.${name}.json`), '{"schemaVersion":1,"skills":[]}');
  git(f.source, "add", ".");git(f.source, "commit", "-qm", "empty v1");
  const base = git(f.source, "rev-parse", "HEAD");
  const candidate = join(f.parent, "empty");git(f.parent, "clone", "--no-local", "-q", f.source, candidate);
  const args = ["--source", f.source, "--base", base, "--candidate", candidate];
  const preview = await runSkillCommand("skills:migrate", args, {repositoryRoot:f.source});
  assert.equal(preview.report.status, "planned", preview.stderr);
  const result = await runSkillCommand("skills:migrate", [...args,"--apply"], {repositoryRoot:f.source});
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.report.status, "applied");
  assert.deepEqual(JSON.parse(readFileSync(join(candidate,".agents/skills/skills.lock.json"),"utf8")), {schemaVersion:2,skills:[]});
});

test("committed undeclared Skill symlink is rejected before remote observation", async () => {
  const f = fixture();
  symlinkSync("demo", join(f.source, ".agents/skills/undeclared"));
  git(f.source, "add", ".");git(f.source, "commit", "-qm", "undeclared symlink");
  const base = git(f.source, "rev-parse", "HEAD");
  const result = await runSkillCommand("skills:check", ["--source", f.source, "--base", base], {repositoryRoot:f.source, ghRunner:f.fake.runner});
  assert.equal(result.exitCode, 1);
  assert.equal(f.fake.calls.length, 0);
});
