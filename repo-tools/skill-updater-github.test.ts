import assert from "node:assert/strict";
import test from "node:test";
import {
  observeRemoteCohort,
  redactCredentialText,
  sha256,
  type GhRunner,
  type RemoteLock,
} from "./skill-updater/index.ts";
import {
  commit,
  fixtureBlobSha,
  license,
  licenseBlobSha,
  opaqueSha,
  skill,
  skillBlobSha,
  source,
  transcript,
} from "./skill-updater-github-test-fixture.ts";

test("GitHub observation resolves one immutable public cohort without executing fetched files", async () => {
  const fake = transcript();
  const observation = await observeRemoteCohort([source()], [], fake.runner);

  assert.equal(observation.repository, "owner/repo");
  assert.equal(observation.resolvedCommit, commit);
  assert.equal(observation.verification, "verified");
  assert.equal(observation.entries[0]?.name, "demo");
  assert.equal(observation.entries[0]?.tree.fileCount, 2);
  assert.deepEqual(observation.entries[0]?.metadata, { name: "demo", description: "Demo skill" });
  assert.equal(fake.calls.filter((call) => call.includes("git/ref/heads/main")).length, 2);
});

test("GitHub observation supports a repository-root skill", async () => {
  const rootSkill = Buffer.from("---\nname: demo\ndescription: Root skill\n---\nbody\n");
  const rootSkillSha = "66bd37a64e48dff68a8cd30acce492bb3a152494";
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "SKILL.md", mode: "100644", type: "blob", sha: rootSkillSha, size: rootSkill.length },
      ],
    },
    [`repos/owner/repo/git/blobs/${rootSkillSha}`]: {
      sha: rootSkillSha,
      encoding: "base64",
      content: rootSkill.toString("base64"),
      size: rootSkill.length,
    },
  });

  const observation = await observeRemoteCohort([{ ...source(), subtree: { root: true } }], [], fake.runner);

  assert.equal(observation.entries[0]?.tree.files.some((file) => file.path === "SKILL.md"), true);
  assert.deepEqual(observation.entries[0]?.metadata, { name: "demo", description: "Root skill" });
});

test("[H3] GitHub observation rejects source API errors before content reads", async () => {
  const fake = transcript({ "repos/owner/repo": { visibility: "private", private: true } });

  await assert.rejects(observeRemoteCohort([source()], [], fake.runner), /public/);
  assert.deepEqual(fake.calls, ["repos/owner/repo"]);
});

test("[H9] GitHub observation rejects truncated trees and special files", async () => {
  const truncated = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: { truncated: true, tree: [] },
  });
  await assert.rejects(observeRemoteCohort([source()], [], truncated.runner), /truncated|complete/);

  const special = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [{ path: "skills/demo/link", mode: "120000", type: "blob", sha: opaqueSha("link"), size: 4 }],
    },
  });
  await assert.rejects(observeRemoteCohort([source()], [], special.runner), /special|regular/);
});

test("remote observation rejects declared skill limits before fetching blobs", async () => {
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: Array.from({ length: 201 }, (_, index) => ({
        path: index === 0 ? "skills/demo/SKILL.md" : `skills/demo/file-${index}.txt`,
        mode: "100644",
        type: "blob",
        sha: opaqueSha(`blob-${index}`),
        size: 1,
      })),
    },
  });

  await assert.rejects(observeRemoteCohort([source()], [], fake.runner), /200|file数|上限/);
  assert.equal(fake.calls.some((endpoint) => endpoint.includes("/git/blobs/")), false);
});

test("remote observation rejects 501 cohort-unique files before fetching blobs", async () => {
  const sources = ["one", "two", "three"].map((name) => ({
    ...source(),
    name,
    target: `.agents/skills/${name}`,
    subtree: { path: `skills/${name}` },
  }));
  const tree = [
    { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
    ...sources.flatMap((entry) => Array.from({ length: 199 }, (_, index) => ({
      path: `${entry.subtree.path}/${index === 0 ? "SKILL.md" : `file-${index}.txt`}`,
      mode: "100644",
      type: "blob",
      sha: opaqueSha(`${entry.name}-${index}`),
      size: 1,
    }))),
  ];
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: { truncated: false, tree },
  });

  await assert.rejects(observeRemoteCohort(sources, [], fake.runner), /500|cohort unique files/);
  assert.equal(fake.calls.some((endpoint) => endpoint.includes("/git/blobs/")), false);
});

test("remote observation rejects cohort bytes above 50 MiB before fetching blobs", async () => {
  const sources = ["one", "two", "three"].map((name) => ({
    ...source(),
    name,
    target: `.agents/skills/${name}`,
    subtree: { path: `skills/${name}` },
  }));
  const declaredSize = 9 * 1_048_576;
  const tree = [
    { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
    ...sources.flatMap((entry) => ["SKILL.md", "payload.bin"].map((name, index) => ({
      path: `${entry.subtree.path}/${name}`,
      mode: "100644",
      type: "blob",
      sha: opaqueSha(`${entry.name}-${index}`),
      size: declaredSize,
    }))),
  ];
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: { truncated: false, tree },
  });

  await assert.rejects(observeRemoteCohort(sources, [], fake.runner), /50|cohort bytes/);
  assert.equal(fake.calls.some((endpoint) => endpoint.includes("/git/blobs/")), false);
});

test("remote observation rechecks declared tree size against fetched bytes", async () => {
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: skillBlobSha, size: skill.length - 1 },
      ],
    },
  });

  await assert.rejects(observeRemoteCohort([source()], [], fake.runner), /tree \/ blob size/);
});

test("[H4] branch observation rejects history rewrite", async () => {
  const previous = "a".repeat(40);
  const fake = transcript({
    [`repos/owner/repo/compare/${previous}...${commit}`]: { status: "diverged" },
  });
  const lock: RemoteLock = {
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref: { branch: "main" },
    resolvedCommit: previous, verification: "verified", treeHash: "d".repeat(64),
    subtree: { path: "skills/demo" }, fileCount: 1, byteCount: 1,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  };

  await assert.rejects(observeRemoteCohort([source()], [lock], fake.runner), /history rewrite|fast-forward/);
});

test("unverified commits remain observable with a warning", async () => {
  const fake = transcript({
    [`repos/owner/repo/commits/${commit}`]: {
      sha: commit,
      commit: { verification: { verified: false, reason: "unsigned" } },
    },
  });

  const observation = await observeRemoteCohort([source()], [], fake.runner);
  assert.equal(observation.verification, "unverified");
  assert.deepEqual(observation.warnings, ["commit verification: unverified"]);
});

test("GitHub boundary redacts credential-shaped output", async () => {
  const fake = transcript({
    "repos/owner/repo": { exitCode: 1, stdout: "", stderr: "Authorization: Bearer ghp_supersecret" },
  });
  await assert.rejects(
    observeRemoteCohort([source()], [], fake.runner),
    (error: unknown) => error instanceof Error && !error.message.includes("ghp_supersecret") && error.message.includes("[REDACTED]"),
  );
  assert.equal(redactCredentialText("token github_pat_1234567890abcdef"), "token [REDACTED]");
});

test("GitHub boundary surfaces malformed JSON and timeout without fallback", async () => {
  const malformed: GhRunner = async () => ({ exitCode: 0, stdout: "{broken", stderr: "" });
  await assert.rejects(observeRemoteCohort([source()], [], malformed), /JSON/);

  const timeout: GhRunner = async () => { throw new Error("timeout"); };
  await assert.rejects(observeRemoteCohort([source()], [], timeout), /timeout/);
});

test("GitHub observation binds blob response SHA and bytes to the reviewed tree", async () => {
  const missingSha = transcript({
    [`repos/owner/repo/git/blobs/${skillBlobSha}`]: {
      encoding: "base64", content: skill.toString("base64"), size: skill.length,
    },
  });
  await assert.rejects(observeRemoteCohort([source()], [], missingSha.runner), /blob.*sha|SHA/);

  const malformedSha = transcript({
    [`repos/owner/repo/git/blobs/${skillBlobSha}`]: {
      sha: "ABC", encoding: "base64", content: skill.toString("base64"), size: skill.length,
    },
  });
  await assert.rejects(observeRemoteCohort([source()], [], malformedSha.runner), /lowercase 40-hex/);

  const malformedBase64 = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391", size: 0 },
      ],
    },
    "repos/owner/repo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391": {
      sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391", encoding: "base64", content: "a", size: 0,
    },
  });
  await assert.rejects(observeRemoteCohort([source()], [], malformedBase64.runner), /base64/);

  const mismatchedResponseSha = transcript({
    [`repos/owner/repo/git/blobs/${skillBlobSha}`]: {
      sha: licenseBlobSha, encoding: "base64", content: skill.toString("base64"), size: skill.length,
    },
  });
  await assert.rejects(observeRemoteCohort([source()], [], mismatchedResponseSha.runner), /response SHA/);

  const different = Buffer.from(skill);
  different[different.length - 2] = different[different.length - 2]! === 120 ? 121 : 120;
  const forged = transcript({
    [`repos/owner/repo/git/blobs/${skillBlobSha}`]: {
      sha: skillBlobSha, encoding: "base64", content: different.toString("base64"), size: different.length,
    },
  });
  await assert.rejects(observeRemoteCohort([source()], [], forged.runner), /Git blob|object SHA|bytes/);

  const malformedTreeSha = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [{ path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: "not-a-sha", size: skill.length }],
    },
  });
  await assert.rejects(observeRemoteCohort([source()], [], malformedTreeSha.runner), /lowercase 40-hex/);
});

test("GitHub observation accepts a zero-byte regular blob", async () => {
  const emptyBlobSha = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: skillBlobSha, size: skill.length },
        { path: "skills/demo/empty.txt", mode: "100644", type: "blob", sha: emptyBlobSha, size: 0 },
      ],
    },
    [`repos/owner/repo/git/blobs/${emptyBlobSha}`]: {
      sha: emptyBlobSha, encoding: "base64", content: "", size: 0,
    },
  });

  const observation = await observeRemoteCohort([source()], [], fake.runner);

  assert.equal(observation.entries[0]?.tree.files.find((file) => file.path === "empty.txt")?.content.length, 0);
});

test("remote legal larger than 1 MiB uses Git Blob API without Contents API", async () => {
  const largeLicense = Buffer.alloc(1_048_577, 0x61);
  const largeSha = fixtureBlobSha(largeLicense);
  const largeSource = {
    ...source(),
    legalMappings: [{
      sourcePath: "LICENSE",
      targetPath: "LICENSE",
      expectedSha256: sha256(largeLicense),
    }],
  };
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: largeSha, size: largeLicense.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: skillBlobSha, size: skill.length },
      ],
    },
    [`repos/owner/repo/git/blobs/${largeSha}`]: {
      sha: largeSha, encoding: "base64", content: largeLicense.toString("base64"), size: largeLicense.length,
    },
  });

  const observation = await observeRemoteCohort([largeSource], [], fake.runner);

  assert.equal(observation.entries[0]?.tree.byteCount, skill.length + largeLicense.length);
  assert.equal(fake.calls.some((endpoint) => endpoint.includes("/contents/")), false);
});

test("[H8] GitHub observation rejects a missing gh prerequisite", async () => {
  const missing: GhRunner = async () => { throw new Error("spawn gh ENOENT"); };
  await assert.rejects(observeRemoteCohort([source()], [], missing), /ENOENT/);
});

test("[H8] GitHub observation rejects an unauthenticated gh prerequisite", async () => {
  const unauthenticated: GhRunner = async () => ({ exitCode: 1, stdout: "", stderr: "authentication required" });
  await assert.rejects(observeRemoteCohort([source()], [], unauthenticated), /authentication required/);
});

test("supplemental offline compare failure is a hard source error", async () => {
  const previous = "a".repeat(40);
  const fake = transcript({
    [`repos/owner/repo/compare/${previous}...${commit}`]: {
      exitCode: 1, stdout: "", stderr: "offline",
    },
  });
  const lock: RemoteLock = {
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref: { branch: "main" },
    subtree: { path: "skills/demo" }, resolvedCommit: previous, verification: "unknown", treeHash: "d".repeat(64), fileCount: 1, byteCount: 1,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  };

  await assert.rejects(observeRemoteCohort([source()], [lock], fake.runner), /offline/);
});

test("[H10] GitHub observation matches only the selected path and keeps renamed target paths", async () => {
  const renamed = Buffer.from("renamed\n");
  const renamedSha = "b297ab5f7f1169a202469a6f398c6f2d6f38e013";
  const fake = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "archived/skills/demo/SKILL.md", mode: "100644", type: "blob", sha: opaqueSha("wrong"), size: skill.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: skillBlobSha, size: skill.length },
        { path: "skills/demo/new-name.txt", mode: "100644", type: "blob", sha: renamedSha, size: renamed.length },
      ],
    },
    [`repos/owner/repo/git/blobs/${renamedSha}`]: {
      sha: renamedSha, encoding: "base64", content: renamed.toString("base64"), size: renamed.length,
    },
  });

  const observation = await observeRemoteCohort([source()], [], fake.runner);
  assert.deepEqual(observation.entries[0]?.tree.files.map((file) => file.path), ["LICENSE", "SKILL.md", "new-name.txt"]);
  assert.equal(fake.calls.includes(`repos/owner/repo/git/blobs/${opaqueSha("wrong")}`), false);
});

import type { RemoteSource as V2RemoteSource } from "./skill-updater/types.ts";
const v2Source = (ref: V2RemoteSource["ref"] = {branch:"main"}):V2RemoteSource => ({...source(),redistribution:"allowed",ref});
test("v2 tag pins direct annotated object and peeled commit and rechecks the ref",async()=>{
  const tag="d".repeat(40);
  const fake=transcript({"repos/owner/repo/git/ref/tags/v1":{object:{type:"tag",sha:tag}},[`repos/owner/repo/git/tags/${tag}`]:{sha:tag,object:{type:"commit",sha:commit}}});
  const result=await observeRemoteCohort([v2Source({tag:"v1"})],[],fake.runner,{commit,tagObjectSha:tag});
  assert.equal(result.resolvedCommit,commit); assert.equal(result.tagObjectSha,tag);
  assert.equal(fake.calls.filter(c=>c.includes("/git/ref/tags/")).length,2);
});

for (const patch of [
  {path:"skills/demo/link",mode:"120000",type:"blob",size:4},
  {path:"skills/demo/submodule",mode:"160000",type:"commit"},
  {path:"skills/demo/oversize",mode:"100644",type:"blob",size:10*1_048_576+1},
  {path:"skills/demo/missing-size",mode:"100644",type:"blob"},
  {path:"skills/demo/negative",mode:"100644",type:"blob",size:-1},
  {path:"skills/demo/fraction",mode:"100644",type:"blob",size:1.5},
  {path:"skills/demo/unsafe",mode:"100644",type:"blob",size:Number.MAX_SAFE_INTEGER+1},
  {path:"skills/demo/skill.md",mode:"100644",type:"blob",size:skill.length},
  {path:"skills/demo/SKILL.md/child",mode:"100644",type:"blob",size:1},
  {path:"skills/demo/../outside",mode:"100644",type:"blob",size:1},
]) test(`v2 metadata rejects ${patch.path} before any blob request`,async()=>{
  const fake=transcript({[`repos/owner/repo/git/trees/${commit}?recursive=1`]:{truncated:false,tree:[
    {path:"LICENSE",mode:"100644",type:"blob",sha:licenseBlobSha,size:license.length},
    {path:"skills/demo/SKILL.md",mode:"100644",type:"blob",sha:skillBlobSha,size:skill.length},
    {sha:opaqueSha(patch.path),...patch},
  ]}});
  await assert.rejects(observeRemoteCohort([v2Source()],[],fake.runner));
  assert.equal(fake.calls.filter(c=>c.includes("/git/blobs/")).length,0);
});

test("v2 legal collision with different SHA and same size is rejected before blob reads",async()=>{
  const fake=transcript({[`repos/owner/repo/git/trees/${commit}?recursive=1`]:{truncated:false,tree:[
    {path:"LICENSE",mode:"100644",type:"blob",sha:licenseBlobSha,size:license.length},
    {path:"skills/demo/LICENSE",mode:"100644",type:"blob",sha:opaqueSha("other-license"),size:license.length},
    {path:"skills/demo/SKILL.md",mode:"100644",type:"blob",sha:skillBlobSha,size:skill.length},
  ]}});
  await assert.rejects(observeRemoteCohort([v2Source()],[],fake.runner),/collision/);
  assert.equal(fake.calls.filter(c=>c.includes("/git/blobs/")).length,0);
});

test("v2 lightweight tags and tag chains enforce double pin, object integrity and bounded resolution",async()=>{
  for(const depth of [0,1,3,31,32]) {
    const objects=Array.from({length:depth},(_,i)=>opaqueSha(`tag-${i}`));
    const overrides:Record<string,unknown>={"repos/owner/repo/git/ref/tags/release":{object:{type:depth?"tag":"commit",sha:objects[0]??commit}}};
    for(let i=0;i<depth;i++) overrides[`repos/owner/repo/git/tags/${objects[i]}`]={sha:objects[i],object:{type:i===depth-1?"commit":"tag",sha:objects[i+1]??commit}};
    const fake=transcript(overrides);
    const run=observeRemoteCohort([v2Source({tag:"release"})],[],fake.runner,{commit,tagObjectSha:objects[0]??commit});
    if(depth<32) assert.equal((await run).tagObjectSha,objects[0]??commit);
    else {await assert.rejects(run,/32/);assert.equal(fake.calls.some(c=>c.includes("/git/blobs/")),false);}
  }
  for(const terminal of [{type:"tag",sha:"d".repeat(40)},{type:"tree",sha:commit}]) {
    const fake=transcript({"repos/owner/repo/git/ref/tags/v1":{object:{type:"tag",sha:"d".repeat(40)}},[`repos/owner/repo/git/tags/${"d".repeat(40)}`]:{sha:"d".repeat(40),object:terminal}});
    await assert.rejects(observeRemoteCohort([v2Source({tag:"v1"})],[],fake.runner),/循環|type/);
  }
});

test("v2 refuses moved tags even when commit stays the same, wrong approval SHAs and ref changes during fetch",async()=>{
  const tag="d".repeat(40);
  const initial=transcript({"repos/owner/repo/git/ref/tags/v1":{object:{type:"tag",sha:tag}},[`repos/owner/repo/git/tags/${tag}`]:{sha:tag,object:{type:"commit",sha:commit}}});
  const source=v2Source({tag:"v1"}); const observation=await observeRemoteCohort([source],[],initial.runner);
  const {legalMappings:_,...identity}=source; const tree=observation.entries[0]!.tree;
  const lock={...identity,resolvedCommit:commit,tagObjectSha:"e".repeat(40),verification:"verified" as const,treeHash:tree.treeHash,fileCount:tree.fileCount,byteCount:tree.byteCount,legalFiles:observation.entries[0]!.legalFiles};
  await assert.rejects(observeRemoteCohort([source],[lock],initial.runner),/moved/);
  await assert.rejects(observeRemoteCohort([source],[],initial.runner,{commit,tagObjectSha:"f".repeat(40)}),/承認SHA/);
  await assert.rejects(observeRemoteCohort([source],[],initial.runner,{commit:"f".repeat(40),tagObjectSha:tag}),/承認SHA/);
  const deleted=transcript({"repos/owner/repo/git/ref/tags/v1":{exitCode:1,stdout:"",stderr:"404"}});
  await assert.rejects(observeRemoteCohort([source],[],deleted.runner),/404/);
  let refCalls=0; const fake=transcript();
  await assert.rejects(observeRemoteCohort([v2Source()],[],async args=>{
    if(args.some(a=>a.includes("/git/ref/heads/")) && ++refCalls===2) return {exitCode:0,stderr:"",stdout:JSON.stringify({object:{type:"commit",sha:"f".repeat(40)}})};
    return fake.runner(args);
  }),/取得中/);
});

for(const status of ["behind","diverged","unknown"]) test(`v2 branch refuses ${status} before blobs`,async()=>{
  const old="a".repeat(40); const s=v2Source();
  const {legalMappings:_,...identity}=s;
  const lock={...identity,resolvedCommit:old,verification:"unknown" as const,treeHash:"d".repeat(64),fileCount:2,byteCount:100,legalFiles:[]};
  const fake=transcript({[`repos/owner/repo/compare/${old}...${commit}`]:{status}});
  await assert.rejects(observeRemoteCohort([s],[lock],fake.runner),/fast-forward/);
  assert.equal(fake.calls.some(c=>c.includes("/git/blobs/")),false);
});

for(const text of ["no frontmatter","---\nname: other\ndescription: x\n---\n","---\nname: demo\ndescription: ' '\n---\n","---\nname: demo\nname: demo\ndescription: x\n---\n",Buffer.from([0xff])]) test("v2 rejects fetched invalid SKILL.md before producing a candidate",async()=>{
  const content=Buffer.from(text); const sha=fixtureBlobSha(content);
  const fake=transcript({[`repos/owner/repo/git/trees/${commit}?recursive=1`]:{truncated:false,tree:[{path:"LICENSE",mode:"100644",type:"blob",sha:licenseBlobSha,size:license.length},{path:"skills/demo/SKILL.md",mode:"100644",type:"blob",sha,size:content.length}]},[`repos/owner/repo/git/blobs/${sha}`]:{sha,encoding:"base64",content:content.toString("base64"),size:content.length}});
  await assert.rejects(observeRemoteCohort([v2Source()],[],fake.runner),/SKILL/);
});

for(const limit of ["single-bytes","skill-bytes","cohort-bytes","skill-files","cohort-files"] as const) test(`v2 metadata accepts exact ${limit} limit and refuses N+1 before blobs`,async()=>{
  for(const overflow of [false,true]) {
    const multi=limit.startsWith("cohort"); const names=multi?["one","two","three"]:["demo"];
    const sources=names.map(name=>({...v2Source(),name,target:`.agents/skills/${name}`,subtree:{path:`skills/${name}`}}));
    const tree:Array<{path:string;mode:string;type:string;sha:string;size:number}>=[{path:"LICENSE",mode:"100644",type:"blob",sha:licenseBlobSha,size:0}];
    const extra=overflow?1:0; const mib=1_048_576;
    let counts=names.map(()=>1); let sizes:number[][];
    if(limit==="skill-files") counts=[199+extra];
    if(limit==="cohort-files") counts=[167,166,166+extra];
    if(limit==="single-bytes") sizes=[[10*mib+extra]];
    else if(limit==="skill-bytes") sizes=[[10*mib,10*mib,extra]];
    else if(limit==="cohort-bytes") sizes=[[10*mib,10*mib],[10*mib,10*mib],[10*mib,extra]];
    else sizes=counts.map(count=>Array.from({length:count},()=>0));
    for(const [i,name] of names.entries()) for(const [j,size] of sizes[i]!.entries()) tree.push({path:`skills/${name}/${j===0?"SKILL.md":`file-${j}`}`,mode:"100644",type:"blob",sha:opaqueSha(`${name}-${j}`),size});
    const fake=transcript({[`repos/owner/repo/git/trees/${commit}?recursive=1`]:{truncated:false,tree}});
    let blobs=0;
    await assert.rejects(observeRemoteCohort(sources,[],async args=>{
      if(args.some(a=>a.includes("/git/blobs/"))) {blobs++;throw new Error("boundary passed; stop before content");}
      return fake.runner(args);
    }),overflow?/上限|超え/:/boundary passed/);
    assert.equal(blobs,overflow?0:1);
  }
});

test("legal target depth is rejected before fetching any selected blob", async () => {
  const f = transcript();
  const declaration = source();
  const legalMappings = declaration.legalMappings.map(m => ({...m,targetPath:`${Array(33).fill("d").join("/")}/LICENSE`}));
  await assert.rejects(()=>observeRemoteCohort([{...declaration,legalMappings}],[],f.runner), /depth/);
  assert.equal(f.calls.filter(c=>c.includes("/git/blobs/")).length, 0);
});

for (const failure of ["subtree", "root SKILL.md"]) test(`later cohort member missing ${failure} is rejected before all blob requests`, async () => {
  const tree = [
    {path:"LICENSE",mode:"100644",type:"blob",sha:licenseBlobSha,size:license.length},
    {path:"skills/demo/SKILL.md",mode:"100644",type:"blob",sha:skillBlobSha,size:skill.length},
    ...(failure === "root SKILL.md" ? [{path:"skills/missing/LICENSE",mode:"100644",type:"blob",sha:licenseBlobSha,size:license.length}] : []),
  ];
  const f = transcript({[`repos/owner/repo/git/trees/${commit}?recursive=1`]:{truncated:false,tree}});
  const missing = {...source(),name:"missing",target:".agents/skills/missing",subtree:{path:"skills/missing"}};
  await assert.rejects(()=>observeRemoteCohort([source(),missing],[],f.runner), /empty subtree|root SKILL.md/);
  assert.equal(f.calls.filter(c=>c.includes("/git/blobs/")).length,0);
});
