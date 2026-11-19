import assert from "node:assert/strict";
import { test } from "node:test";
import { observeRemoteCohort } from "./skill-updater/github.ts";
import { source, transcript, commit, license, licenseBlobSha, skillBlobSha } from "./skill-updater-github-test-fixture.ts";
import type { RemoteSource } from "./skill-updater/types.ts";
const treeEndpoint=`repos/owner/repo/git/trees/${commit}?recursive=1`;
const releaseEndpoint="repos/owner/repo/releases/tags/v1";
function bundle(tag="v1"): RemoteSource {
  return {...source({tag}), name:"runtime",target:".agents/vendor/runtime",subtree:{root:true},bundle:{files:[{path:"LICENSE",executable:false}],limits:{files:100,singleFileBytes:1048576,totalBytes:2097152}}};
}
function responses(tag="v1") {return {[`repos/owner/repo/git/ref/tags/${tag}`]:{object:{type:"commit",sha:commit}},[`repos/owner/repo/releases/tags/${tag}`]:{tag_name:tag,draft:false,prerelease:false}};}
for(const tag of ["v1","v1.0.0-rc.1"]) test(`bundle stable attributes accept ${tag}, only selected blob fetched`,async()=>{
  const f=transcript(responses(tag));const o=await observeRemoteCohort([bundle(tag)],[],f.runner);
  assert.equal(o.entries[0].tree.fileCount,1);assert.equal(o.entries[0].tree.files[0].path,"LICENSE");
  assert.equal(f.calls.filter(p=>p.includes("/releases/")).length,2);
  assert.deepEqual(f.calls.filter(p=>p.includes("/blobs/")),[`repos/owner/repo/git/blobs/${licenseBlobSha}`]);
});
for(const release of [{draft:true,prerelease:false,tag_name:"v1"},{draft:false,prerelease:true,tag_name:"v1"},{draft:false,prerelease:false,tag_name:"other"},{draft:"false",prerelease:false,tag_name:"v1"},{prerelease:false,tag_name:"v1"},{exitCode:1,stdout:"",stderr:"404"}]) test(`bundle release rejects ${JSON.stringify(release)}`,async()=>{
 const f=transcript({...responses(),[releaseEndpoint]:release});await assert.rejects(observeRemoteCohort([bundle()],[],f.runner));assert.equal(f.calls.filter(p=>p.includes("/blobs/")).length,0);
});
const entry={path:"LICENSE",mode:"100644",type:"blob",sha:licenseBlobSha,size:license.length};
for(const patch of [{mode:"100755"},{mode:"120000"},{mode:"160000",type:"commit"},{size:1048577},{size:-1},{size:1.5},{size:undefined},{path:"missing"}]) test(`bundle metadata preflight ${JSON.stringify(patch)}`,async()=>{
 const f=transcript({...responses(),[treeEndpoint]:{truncated:false,tree:[{...entry,...patch}]}});await assert.rejects(observeRemoteCohort([bundle()],[],f.runner));assert.equal(f.calls.filter(p=>p.includes("/blobs/")).length,0);
});
test("bundle executable true requires upstream 100755 before any cohort blob",async()=>{
 const b=bundle();const changed={...b,bundle:{...b.bundle!,files:[...b.bundle!.files,{path:"run",executable:true}]}};
 const f=transcript({...responses(),[treeEndpoint]:{truncated:false,tree:[entry,{...entry,path:"run"}]}});
 await assert.rejects(observeRemoteCohort([changed],[],f.runner));assert.equal(f.calls.filter(p=>p.includes("/blobs/")).length,0);
});
test("bundle ancestors require exact spelling, tree mode and existence",async()=>{
 for(const ancestor of [[],[{path:"lib",mode:"040000",type:"tree",sha:commit}],[{path:"Lib",mode:"120000",type:"blob",sha:commit}],[{path:"Lib",mode:"040000",type:"tree",sha:commit},{path:"lib",mode:"040000",type:"tree",sha:commit}]]){
  const b=bundle();const changed={...b,bundle:{...b.bundle!,files:[...b.bundle!.files,{path:"Lib/a",executable:false}]}};
  const f=transcript({...responses(),[treeEndpoint]:{truncated:false,tree:[entry,...ancestor,{...entry,path:"Lib/a"}]}});
  await assert.rejects(observeRemoteCohort([changed],[],f.runner));assert.equal(f.calls.filter(p=>p.includes("/blobs/")).length,0);
 }
});
test("later bundle in same cohort fails before ordinary skill or bundle blobs",async()=>{
 const b=bundle();const invalid={...b,name:"second",target:".agents/vendor/second",bundle:{...b.bundle!,files:[{path:"missing",executable:false}]}};
 const f=transcript(responses());await assert.rejects(observeRemoteCohort([source({tag:"v1"}),b,invalid],[],f.runner));assert.equal(f.calls.filter(p=>p.includes("/blobs/")).length,0);
});
test("release rechecked after bodies, unstable release stops operation",async()=>{
 const f=transcript(responses());let n=0;
 await assert.rejects(observeRemoteCohort([bundle()],[],async args=>{if(args.at(-1)===releaseEndpoint && ++n===2)return {exitCode:0,stdout:JSON.stringify({draft:true,prerelease:false,tag_name:"v1"}),stderr:""};return f.runner(args);}));
 assert.ok(f.calls.some(p=>p.includes("/blobs/")));
});
test("bundle blob SHA and metadata size mismatch fail",async()=>{
 for(const overrides of [{[treeEndpoint]:{truncated:false,tree:[{...entry,size:entry.size+1}]}},{[`repos/owner/repo/git/blobs/${licenseBlobSha}`]:{sha:skillBlobSha,encoding:"base64",content:license.toString("base64"),size:license.length}}]){
  const f=transcript({...responses(),...overrides});await assert.rejects(observeRemoteCohort([bundle()],[],f.runner));
 }
});
test("bundle metadata rejects truncated, duplicate, depth, entries and total overflow before blobs",async()=>{
 const cases: Array<{s:RemoteSource;tree:unknown}> = [
  {s:bundle(),tree:{truncated:true,tree:[entry]}},
  {s:bundle(),tree:{truncated:false,tree:[entry,entry]}},
  {s:{...bundle(),bundle:{...bundle().bundle!,limits:{files:100,singleFileBytes:1048576,totalBytes:1}}},tree:{truncated:false,tree:[entry]}},
 ];
 for(const paths of [["a/".repeat(33)+"file"],Array.from({length:99},(_,i)=>`d${i}/a/b/c/d/f`)]){
  const s=bundle();const fs=[...s.bundle!.files,...paths.map(path=>({path,executable:false}))];
  cases.push({s:{...s,bundle:{...s.bundle!,files:fs}},tree:{truncated:false,tree:[entry]}});
 }
 for(const c of cases){const f=transcript({...responses(),[treeEndpoint]:c.tree});await assert.rejects(observeRemoteCohort([c.s],[],f.runner));assert.equal(f.calls.filter(p=>p.includes("/blobs/")).length,0);}
});
test("bundle and ordinary skill share cohort and deduplicate legal blob requests",async()=>{
 const f=transcript(responses());const result=await observeRemoteCohort([source({tag:"v1"}),bundle()],[],f.runner);
 assert.equal(result.entries.length,2);assert.equal(f.calls.filter(p=>p.includes("/blobs/")).length,2);
});
