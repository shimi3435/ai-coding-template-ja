import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { assertSafeParents } from "./isolation.ts";
import { readRepositorySkillState, readVendoredSkillNames } from "./repository.ts";
import { utf8Compare } from "./canonical.ts";
import { validateLockStructure } from "./schema.ts";

export function repairLinks(root:string,afterWrite?:(path:string)=>void):readonly string[] {
  const state=readRepositorySkillState(root);validateLockStructure(state.lock,state.sources);
  const names=state.sources.skills.filter(s=>s.ownership!=="plugin").map(s=>s.name);
  for(const name of readVendoredSkillNames(root))if(!names.includes(name))throw new Error(`未宣言Skill: ${name}`);
  const planned:Array<{path:string;expected:string;name:string}>=[];
  for(const name of names) {
    const target=join(root,".agents/skills",name);assertSafeParents(root,join(target,"SKILL.md"));
    if(!lstatSync(target).isDirectory())throw new Error("Skill directory欠落");
    for(const base of [".claude/skills",".codex/skills"]) {
      const path=join(root,base,name);assertSafeParents(root,path);
      const stat=lstatSync(path,{throwIfNoEntry:false});const expected=`../../.agents/skills/${name}`;
      if(stat && !stat.isSymbolicLink())throw new Error(`link非symlink衝突: ${base}/${name}`);
      if(!stat || readlinkSync(path)!==expected)planned.push({path,expected,name});
    }
  }
  for(const {path,expected} of planned) {
    if(lstatSync(path,{throwIfNoEntry:false}))unlinkSync(path);
    mkdirSync(dirname(path),{recursive:true});symlinkSync(expected,path);afterWrite?.(path);
  }
  for(const name of names)for(const base of [".claude/skills",".codex/skills"]) {
    const path=join(root,base,name);assertSafeParents(root,path);
    if(!lstatSync(path).isSymbolicLink() || readlinkSync(path)!==`../../.agents/skills/${name}`)throw new Error("修復後link検証失敗");
  }
  return [...new Set(planned.map(p=>p.name))].sort(utf8Compare);
}
