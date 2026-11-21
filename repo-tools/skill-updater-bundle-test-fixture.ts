import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeSkillRepository } from "./skill-updater-test-fixture.ts";
import { readRepositorySkillState } from "./skill-updater/repository.ts";
import { serializeLock, serializeSources } from "./skill-updater/schema.ts";
import { canonicalizeTree, type TreeFile } from "./skill-updater/canonical.ts";
import { bundleFileDigests } from "./skill-updater/bundle.ts";
import { sha256 } from "./skill-updater/legal.ts";
import { gitBlobSha1 } from "./skill-updater/git-object.ts";
import type { RemoteSource, RemoteLock } from "./skill-updater/types.ts";
import type { GhRunner } from "./skill-updater/github.ts";
export const bundleCommit="b".repeat(40);
export const bundleFiles:readonly TreeFile[]=[{path:"LICENSE",executable:false,content:Buffer.from("MIT fixture\n")},{path:"Lib/run.sh",executable:true,content:Buffer.from("synthetic data, never executed\n")}];
export function runtimeSource(name="runtime",files=bundleFiles): RemoteSource {
 return {name,ownership:"remote",redistribution:"allowed",license:"MIT",target:`.agents/vendor/${name}`,repository:"example/runtime",ref:{tag:"v1"},subtree:{root:true},
  legalMappings:[{sourcePath:"LICENSE",targetPath:"LICENSE",expectedSha256:sha256(bundleFiles[0].content)}],
  bundle:{files:files.map(({path,executable})=>({path,executable})),limits:{files:100,singleFileBytes:1048576,totalBytes:2097152}}};
}
export function runtimeLock(s=runtimeSource(),files=bundleFiles,commit=bundleCommit): RemoteLock {
 const {legalMappings,...rest}=s;const tree=canonicalizeTree(files);
 return {...rest,resolvedCommit:commit,tagObjectSha:commit,verification:"verified",treeHash:tree.treeHash,fileCount:tree.fileCount,byteCount:tree.byteCount,
  legalFiles:legalMappings.map(m=>({sourcePath:m.sourcePath,targetPath:m.targetPath,sha256:m.expectedSha256})),fileDigests:bundleFileDigests(tree)};
}
export function bundleRepository(installed=true): string {
 const root=writeSkillRepository();const state=readRepositorySkillState(root);const s=runtimeSource();
 writeFileSync(join(root,".agents/skills/skills.sources.json"),serializeSources({...state.sources,skills:[...state.sources.skills,s]}));
 writeFileSync(join(root,".agents/skills/skills.lock.json"),serializeLock({schemaVersion:2,skills:installed?[runtimeLock()]:[]}));
 if(installed)for(const f of bundleFiles){const p=join(root,s.target,f.path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,f.content);chmodSync(p,f.executable?0o755:0o644);}
 return root;
}
export function git(root:string,...args:string[]):string {
 const r=spawnSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.invalid",...args],{cwd:root,encoding:"utf8"});assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
export function commitFixture(root:string):string {git(root,"add",".");git(root,"commit","-qm","fixture");return git(root,"rev-parse","HEAD");}
export function bundleRunner(s=runtimeSource(),files=bundleFiles,commit=bundleCommit): {runner:GhRunner;calls:string[]} {
 const calls:string[]=[];const prefix=`repos/${s.repository}`;const tag="tag" in s.ref?s.ref.tag:"v1";
 const entries=new Map<string,unknown>();for(const f of files){const parts=f.path.split("/");for(let n=1;n<parts.length;n++){const path=parts.slice(0,n).join("/");entries.set(path,{path,type:"tree",mode:"040000",sha:commit});}entries.set(f.path,{path:f.path,type:"blob",mode:f.executable?"100755":"100644",sha:gitBlobSha1(f.content),size:f.content.length});}
 const runner:GhRunner=async args=>{
  const endpoint=args.at(-1)!;calls.push(endpoint);let data:unknown;
  if(endpoint===prefix)data={private:false,visibility:"public"};
  else if(endpoint===`${prefix}/releases/tags/${tag}`)data={tag_name:tag,draft:false,prerelease:false};
  else if(endpoint===`${prefix}/git/ref/tags/${tag}`)data={object:{type:"commit",sha:commit}};
  else if(endpoint===`${prefix}/commits/${commit}`)data={sha:commit,commit:{verification:{verified:true}}};
  else if(endpoint===`${prefix}/git/trees/${commit}?recursive=1`)data={truncated:false,tree:[...entries.values()]};
  else {const f=files.find(f=>endpoint===`${prefix}/git/blobs/${gitBlobSha1(f.content)}`);if(f)data={sha:gitBlobSha1(f.content),size:f.content.length,encoding:"base64",content:f.content.toString("base64")};}
  if(data===undefined)throw new Error(`unexpected endpoint: ${endpoint}`);return {exitCode:0,stdout:JSON.stringify(data),stderr:""};
 };return {runner,calls};
}
