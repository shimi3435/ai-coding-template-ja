import { resolve } from "node:path";
import { createGhRunner, redactCredentialText, type GhRunner } from "./github.ts";
import { preflightIsolation } from "./isolation.ts";
import { applyCandidate } from "./apply.ts";
import { readCommittedSnapshot, verifyRepository } from "./repository.ts";
import { readSnapshotTrees, adoptLocal, verifySnapshotLinks } from "./ownership.ts";
import { decodeSourcesJson, decodeLockJson, validateRefName } from "./schema.ts";
import { planRemoteMaintenance, type MaintenanceChange, type MaintenancePlan } from "./planner.ts";
import { repairLinks } from "./links.ts";
export type SkillCommandName = "skills:verify"|"skills:links"|"skills:check"|"skills:update"|"skills:repin"|"skills:adopt-local"|"skills:migrate"|"skills:lock-local";
export type CommandReport = Readonly<{schemaVersion:2;command:string;status:"unchanged"|"planned"|"applied"|"failed";changes:readonly MaintenanceChange[];warnings:readonly string[];errors:readonly string[]}>;
export type SkillCommandContext = Readonly<{repositoryRoot:string;ghRunner?:GhRunner}>;
export type SkillCommandResult = Readonly<{exitCode:number;stdout:string;stderr:string;report:CommandReport}>;
function options(command:SkillCommandName,args:readonly string[]):Map<string,string[]> {
  const common=["--json"];
  const flags=new Set(["--json","--apply","--fail-on-update","--pin-commit"]);
  const isolated=["skills:update","skills:repin","skills:adopt-local","skills:migrate"].includes(command);
  const allowed=new Set([...common,...(command==="skills:verify"?["--root"]:[]),...(command==="skills:check"?["--source","--base","--fail-on-update"]:[]),...(isolated?["--source","--base","--candidate","--apply"]:[]),...(command==="skills:repin"?["--name","--commit","--branch","--tag","--pin-commit","--tag-object"]:[]),...(command==="skills:adopt-local"?["--name"]:[]),...(command==="skills:migrate"?["--localize"]:[])]);
  const result=new Map<string,string[]>();
  for(let i=0;i<args.length;i++) {
    const key=args[i]!;
    if(!allowed.has(key) || (result.has(key) && key!=="--localize"))throw new Error(`unknown or conflicting options: ${key}`);
    const value=flags.has(key)?"true":args[++i];
    if(!value || value.startsWith("--"))throw new Error(`引数値欠落: ${key}`);
    result.set(key,[...(result.get(key)??[]),value]);
  }
  const required=[...(isolated?["--source","--base","--candidate"]:command==="skills:check"?["--source","--base"]:[]),...(command==="skills:repin"?["--name","--commit"]:command==="skills:adopt-local"?["--name"]:[])];
  if(required.some(key=>!result.has(key)))throw new Error(`必須引数: ${required.join(" ")}`);
  if(["--branch","--tag","--pin-commit"].filter(key=>result.has(key)).length>1)throw new Error("ref切替引数は相互排他です");
  for(const key of ["--base","--commit","--tag-object"])if(result.has(key) && !/^[0-9a-f]{40}$/.test(result.get(key)![0]!))throw new Error(`${key}は完全SHAが必要です`);
  return result;
}
export async function runSkillCommand(command:SkillCommandName,args:readonly string[],context:SkillCommandContext):Promise<SkillCommandResult> {
  let report:CommandReport={schemaVersion:2,command,status:"unchanged",changes:[],warnings:[],errors:[]};let exitCode=0;let approvalPreview="";
  try {
    if(command==="skills:lock-local")throw new Error("skills:lock-localは撤去済みです。local本文はGitとレビューで管理し、skills:verifyを実行してください");
    const parsed=options(command,args);const get=(key:string)=>parsed.get(key)?.[0];const root=resolve(context.repositoryRoot);
    if(command==="skills:verify") {
      const errors=verifyRepository(get("--root")?resolve(root,get("--root")!):root);if(errors.length)throw new Error(errors.join("; "));
    } else if(command==="skills:links") {
      const changed=repairLinks(root);
      report={...report,status:changed.length?"applied":"unchanged",changes:changed.map(name=>({name,beforeCommit:null,afterCommit:null,beforeOwnership:null,afterOwnership:null}))};
    } else {
      const source=resolve(root,get("--source")!);const base=get("--base")!;
      const isolated=command==="skills:check"?undefined:preflightIsolation({source,base,candidate:resolve(root,get("--candidate")!)});
      const snapshot=readCommittedSnapshot(source,base);let plan:MaintenancePlan;
      if(command==="skills:migrate") {
        const {planMigration}=await import("./migration/index.ts");plan=planMigration(snapshot,parsed.get("--localize")??[]);
      } else {
        let sources=decodeSourcesJson(snapshot.readFile(".agents/skills/skills.sources.json"));const lock=decodeLockJson(snapshot.readFile(".agents/skills/skills.lock.json"));
        const trees=readSnapshotTrees(snapshot,sources);
        if(command==="skills:adopt-local") {
          verifySnapshotLinks(snapshot,sources);plan=adoptLocal({sources,lock,installedTrees:trees},get("--name")!);
        } else {
          let approval;
          if(command==="skills:repin") {
            const selected=sources.skills.find(s=>s.name===get("--name"));
            if(!selected || selected.ownership!=="remote")throw new Error("repin対象remote不明");
            const ref=get("--branch")?{branch:validateRefName(get("--branch"))}:get("--tag")?{tag:validateRefName(get("--tag"))}:get("--pin-commit")?{commit:get("--commit")!}:selected.ref;
            if(("tag" in ref)!==parsed.has("--tag-object"))throw new Error("tagObjectShaはtagだけに必須です");
            sources={...sources,skills:sources.skills.map(s=>s.name===selected.name?{...selected,ref}:s)};
            approval={name:selected.name,commit:get("--commit")!,...(get("--tag-object")?{tagObjectSha:get("--tag-object")!}:{})};
          }
          plan=await planRemoteMaintenance({sources,lock,installedTrees:trees},context.ghRunner??createGhRunner(),approval);
        }
      }
      const changed = plan.changes.length > 0 || plan.metadataChanged === true;
      if (command === "skills:repin") {
        const observed = plan.lock.skills.find(s => s.name === get("--name"))!;
        approvalPreview = `approved commit: ${get("--commit")}\nobserved commit: ${observed.resolvedCommit}\n`;
        if (observed.tagObjectSha) approvalPreview += `approved tag object: ${get("--tag-object")}\nobserved tag object: ${observed.tagObjectSha}\n`;
      }
      report={...report,status:changed?"planned":"unchanged",changes:plan.changes,warnings:plan.warnings};
      if(parsed.has("--apply")) {
        if(changed)applyCandidate(isolated!,plan);
        else {const errors=verifyRepository(isolated!.candidate);if(errors.length)throw new Error(errors.join("; "));}
        report={...report,status:changed?"applied":"unchanged"};
      }
      if(command==="skills:check" && parsed.has("--fail-on-update") && plan.changes.length)exitCode=3;
    }
  } catch(error) {
    report={...report,status:"failed",changes:[],errors:[redactCredentialText(error instanceof Error?error.message:String(error))]};exitCode=1;
  }
  const json=args.includes("--json");
  const stdout=json?`${JSON.stringify(report,null,2)}\n`:`[${report.status}] ${command}\n${report.status === "failed" ? "" : approvalPreview}${report.changes.map(change=>JSON.stringify(change)).join("\n")}${report.changes.length?"\n":""}`;
  const stderr=[...report.warnings,...report.errors].map(text=>`${text}\n`).join("");
  return {report,exitCode,stdout,stderr};
}
