import { mkdirSync, writeFileSync, chmodSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeTree } from "../../skill-updater/canonical.ts";
import { sha256 } from "../../skill-updater/legal.ts";

export function legacyRepository(root:string):string {
  mkdirSync(join(root,".agents/skills"),{recursive:true}); writeFileSync(join(root,"LICENSE"),"MIT\n");
  const skills:unknown[]=[]; const locks:unknown[]=[];
  for(const name of ["branch","commit","semver","local"]) {
    const dir=join(root,".agents/skills",name);mkdirSync(dir,{recursive:true});
    const files=[{path:"SKILL.md",executable:false,content:Buffer.from(`---\nname: ${name}\ndescription: Fixture\n---\nbody\n`)},{path:"run.sh",executable:true,content:Buffer.from("#!/bin/sh\n")}];
    if(name!=="local")files.push({path:"LICENSE",executable:false,content:Buffer.from("MIT\n")});
    for(const file of files){writeFileSync(join(dir,file.path),file.content);chmodSync(join(dir,file.path),file.executable?0o755:0o644);}
    const tree=canonicalizeTree(files);const digest=sha256(Buffer.from("MIT\n"));
    const common={name,ownership:name==="local"?"local":"remote",license:"MIT",redistribution:"allowed",target:`.agents/skills/${name}`};
    const ref=name==="semver"?{semver:"^1.0.0"}:name==="commit"?{commit:"a".repeat(40)}:{branch:"main"};
    const remote={repository:"owner/repo",ref};
    skills.push({...common,...(name==="local"?{}:{...remote,subtree:{path:`skills/${name}`}}),legalMappings:[{sourcePath:"LICENSE",...(name==="local"?{}:{targetPath:"LICENSE"}),expectedSha256:digest}]});
    locks.push({...common,...(name==="local"?{}:{...remote,resolvedCommit:"a".repeat(40),verification:"unknown",...(name==="semver"?{selectedTag:"v1.2.3",selectedVersion:"1.2.3"}:{})}),treeHash:tree.treeHash,fileCount:tree.fileCount,byteCount:tree.byteCount,legalFiles:[{sourcePath:"LICENSE",...(name==="local"?{}:{targetPath:"LICENSE"}),sha256:digest}]});
    for(const base of [".claude/skills",".codex/skills"]){mkdirSync(join(root,base),{recursive:true});symlinkSync(`../../.agents/skills/${name}`,join(root,base,name));}
  }
  const plugin={name:"plugin",ownership:"plugin",license:"Proprietary",redistribution:"blocked",manager:"external"};skills.push(plugin);locks.push(plugin);
  writeFileSync(join(root,".agents/skills/skills.sources.json"),JSON.stringify({schemaVersion:1,skills}));writeFileSync(join(root,".agents/skills/skills.lock.json"),JSON.stringify({schemaVersion:1,skills:locks}));
  for(const args of [["init","-q"],["add","."],["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","legacy fixture"]]){const r=spawnSync("git",args,{cwd:root});if(r.status!==0)throw new Error(r.stderr.toString());}
  return spawnSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).stdout.trim();
}
