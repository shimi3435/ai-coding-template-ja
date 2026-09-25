import assert from "node:assert/strict";
import test from "node:test";
import { decodeSourcesJson, decodeLockJson, serializeSources, serializeLock } from "./skill-updater/schema.ts";

const plugin = { name: "catalog", ownership: "plugin", license: "Proprietary", redistribution: "blocked", manager: "external" };
const local = { name: "local", ownership: "local", license: "MIT", redistribution: "allowed", target: ".agents/skills/local", legalMappings: [{ path: "LICENSE", expectedSha256: "a".repeat(64) }] };

test("v2 keeps local and plugin declarations with an empty remote lock", () => {
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 2, skills: [local, plugin] }));
  const lock = decodeLockJson('{"schemaVersion":2,"skills":[]}', sources);
  assert.deepEqual(lock.skills, []);
  assert.deepEqual(decodeSourcesJson(serializeSources(sources)).skills.map(s => s.ownership), ["plugin", "local"]);
  assert.equal(serializeLock(lock), '{\n  "schemaVersion": 2,\n  "skills": []\n}\n');
  assert.throws(() => decodeLockJson(JSON.stringify({ schemaVersion: 2, skills: [local] })));
});

const remote = { name: "zeta", ownership: "remote", license: "MIT", redistribution: "allowed", target: ".agents/skills/zeta", repository: "Owner/Repo", ref: { branch: "main" }, subtree: { path: "skills/zeta" }, legalMappings: [{ sourcePath: "LICENSE", targetPath: "LICENSE", expectedSha256: "a".repeat(64) }] };
const locked = { name: "zeta", ownership: "remote", license: "MIT", redistribution: "allowed", target: ".agents/skills/zeta", repository: "owner/repo", ref: { branch: "main" }, subtree: { path: "skills/zeta" }, resolvedCommit: "b".repeat(40), verification: "unknown", treeHash: "c".repeat(64), fileCount: 2, byteCount: 100, legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: "a".repeat(64) }] };
const sourceText = (skills: unknown[]) => JSON.stringify({ schemaVersion: 2, skills });

test("v2 remote roundtrip preserves branch, commit, tag double pin and legacy provenance", () => {
  for (const ref of [{ branch: "main" }, { commit: "b".repeat(40) }, { tag: "v1.0" }]) {
    const sources = decodeSourcesJson(sourceText([{ ...remote, ref }]));
    const lock = decodeLockJson(sourceText([{ ...locked, ref, ...("tag" in ref ? { tagObjectSha: "d".repeat(40) } : {}) }]), sources);
    assert.deepEqual(decodeLockJson(serializeLock(lock), sources), lock);
    assert.equal(sources.skills[0]?.ownership === "remote" && sources.skills[0].repository, "owner/repo");
  }
  const legacyRef = { semver: "^1.0.0", selectedTag: "v1.2.0", selectedVersion: "1.2.0" };
  const doc = decodeSourcesJson(sourceText([{ ...remote, ref: { commit: "b".repeat(40) }, legacyRef }]));
  assert.deepEqual(decodeSourcesJson(serializeSources(doc)), doc);
});

test("v2 rejects source/lock drift including subtree and legal policy in completed state", () => {
  const sources = decodeSourcesJson(sourceText([remote]));
  for (const patch of [{ name: "other", target: ".agents/skills/other" }, { license: "Apache-2.0" }, { ref: { branch: "next" } }, { subtree: { root: true } }, { legalFiles: [{ sourcePath: "NOTICE", targetPath: "NOTICE", sha256: "a".repeat(64) }] }, { redistribution: "blocked" }]) {
    assert.throws(() => decodeLockJson(sourceText([{ ...locked, ...patch }]), sources));
  }
  assert.throws(() => decodeLockJson(sourceText([]), sources));
  assert.throws(() => decodeLockJson(sourceText([locked]), decodeSourcesJson(sourceText([plugin]))));
});

test("v2 preserves external-local origin without a content lock", () => {
  const origin = { repository: "owner/repo", subtree: { root: true }, ref: { tag: "release" }, resolvedCommit: "b".repeat(40), tagObjectSha: "d".repeat(40), legalMappings: remote.legalMappings };
  const declaration = { ...local, origin, legalMappings: [{ path: ".agents/skills/local/LICENSE", expectedSha256: "a".repeat(64) }] };
  const doc = decodeSourcesJson(sourceText([declaration]));
  assert.deepEqual(decodeSourcesJson(serializeSources(doc)), doc);
  assert.throws(() => decodeSourcesJson(sourceText([{ ...declaration, legalMappings: local.legalMappings }])));
  assert.throws(() => decodeSourcesJson(sourceText([{ ...declaration, origin: { ...origin, tagObjectSha: undefined } }])));
  assert.throws(() => decodeSourcesJson(sourceText([{ ...declaration, treeHash: "c".repeat(64) }])));
});

test("v2 rejects duplicate JSON keys including escaped keys at all depths", () => {
  for (const text of ['{"schemaVersion":2,"schemaVersion":2,"skills":[]}', '{"schemaVersion":2,"skills":[],"sk\\u0069lls":[]}', sourceText([remote]).replace('"branch":"main"', '"branch":"main","branch":"next"')]) {
    assert.throws(() => decodeSourcesJson(text), /重複key/);
    assert.throws(() => decodeLockJson(text), /重複key/);
  }
});

test("v2 accepts exact metadata byte and entry limits, rejects overflow and invalid UTF-8", () => {
  const text = sourceText([]); const limit = 10 * 1_048_576;
  assert.equal(decodeSourcesJson(text.padEnd(limit)).skills.length, 0);
  assert.equal(decodeLockJson(text.padEnd(limit)).skills.length, 0);
  for (const decode of [decodeSourcesJson, decodeLockJson]) {
    assert.throws(() => decode(text.padEnd(limit+1)));
    assert.throws(() => decode(""));
    assert.throws(() => decode(Buffer.from([0xff])));
  }
  const entries = Array.from({ length:500 },(_,i)=>({ ...plugin, name: `plugin-${i}` }));
  assert.equal(decodeSourcesJson(sourceText(entries)).skills.length,500);
  assert.throws(()=>decodeSourcesJson(sourceText([...entries,{ ...plugin,name:"overflow" }])));
});

for (const value of [null, {}, { schemaVersion:1, skills:[] }, { schemaVersion:2, skills:[], extra:true }, { schemaVersion:2, skills:null }]) {
  test(`v2 rejects malformed root ${JSON.stringify(value)}`,()=>assert.throws(()=>decodeSourcesJson(JSON.stringify(value))));
}

test("v2 rejects malformed declarations, names, references and legal collisions", () => {
  for (const patch of [{ extra:true }, { name:"" }, { name:"a/b" }, { name:"e\u0301" }, { name:"\ud800" }, { target:"elsewhere" }, { ref:{ semver:"^1.0.0" } }, { ref:{ branch:"main",tag:"v1" } }, { ref:{ branch:"refs/heads/main" } }, { ref:{ branch:"feature/../main" } }, { ref:{ branch:" main" } }, { ref:{ commit:"b".repeat(39) } }, { legalMappings:[] }, { legalMappings:[...remote.legalMappings,...remote.legalMappings] }]) {
    assert.throws(()=>decodeSourcesJson(sourceText([{...remote,...patch}])));
  }
  assert.throws(()=>decodeSourcesJson(sourceText([plugin,{...plugin,name:"CATALOG"}])));
  assert.throws(()=>decodeSourcesJson(sourceText([local,{...local,name:"LOCAL",target:".agents/skills/LOCAL"}])));
  assert.throws(()=>decodeSourcesJson(sourceText([{...local,legalMappings:[...local.legalMappings,...local.legalMappings]}])));
  for (const patch of [{ fileCount:-1 }, { fileCount:1.5 }, { byteCount:Number.MAX_SAFE_INTEGER+1 }, { ref:{ commit:"e".repeat(40) } }, { tagObjectSha:"d".repeat(40) }, { ref:{tag:"v1"} }]) assert.throws(()=>decodeLockJson(sourceText([{...locked,...patch}])));
});

test("v2 deterministic serialization ignores declaration, key and legal array order", () => {
  const mappings=[...remote.legalMappings,{sourcePath:"NOTICE",targetPath:"NOTICE",expectedSha256:"d".repeat(64)}];
  const a=decodeSourcesJson(sourceText([plugin,local,{...remote,legalMappings:mappings}]));
  const b=decodeSourcesJson(sourceText([{...remote,legalMappings:[...mappings].reverse()},local,plugin].map(v=>Object.fromEntries(Object.entries(v).reverse()))));
  assert.equal(serializeSources(a),serializeSources(b));
});

import { validateSkillTree } from "./skill-updater/metadata.ts";
import { canonicalizeTree } from "./skill-updater/canonical.ts";

const skillFile = (text: string | Buffer, path = "SKILL.md") => ({ path, executable:false, content:Buffer.from(text) });
test("remote and local share root SKILL.md structure and identity validation", () => {
  const valid = "---\nname: zeta\ndescription: useful\nextra: accepted\n---\nbody\n";
  for (const text of [valid, "\ufeff"+valid.replaceAll("\n","\r\n")]) {
    const tree=validateSkillTree([skillFile(text),skillFile("nested body","nested/SKILL.md")],"zeta");
    assert.equal(tree.fileCount,2);
  }
  for (const text of ["body", "---\n- list\n---\n", "---\nname: [\n---\n", "---\nname: zeta\nname: other\ndescription: x\n---\n", "---\nname: zeta\ndescription: &x word\nextra: *x\n---\n", "---\nname: other\ndescription: x\n---\n", "---\nname: zeta\n---\n", "---\nname: zeta\ndescription: ''\n---\n", "---\nname: zeta\ndescription: '   '\n---\n", Buffer.from([0xff])]) assert.throws(()=>validateSkillTree([skillFile(text)],"zeta"));
  assert.throws(()=>validateSkillTree([skillFile(valid,"nested/SKILL.md")],"zeta"));
  assert.throws(()=>validateSkillTree([skillFile(valid),skillFile(valid)],"zeta"));
  assert.equal(canonicalizeTree([skillFile("hello\n")]).treeHash,"2249753da97bb374ff499d8e4bf4a7d00db5b3558d4e24584426dcc7d0e7003b");
});

import { convertV1Metadata } from "./skill-updater/migration/convert.ts";
import { decodeSourcesJson as decodeV1Sources, decodeLockJson as decodeV1Lock } from "./skill-updater/migration/schema-v1.ts";
test("pure v1 conversion retains remote commits and legacy selection and drops only local/plugin locks", () => {
  for (const ref of [{ branch:"main" },{ commit:"b".repeat(40) },{ semver:"^1.0.0" }]) {
    const oldSource=decodeV1Sources(JSON.stringify({schemaVersion:1,skills:[{...remote,ref},{...local,legalMappings:[{sourcePath:"LICENSE",expectedSha256:"a".repeat(64)}]},plugin]}));
    const {subtree: _subtree,...oldRemote}=locked;
    const oldLock=decodeV1Lock(JSON.stringify({schemaVersion:1,skills:[{...oldRemote,ref,...("semver" in ref ? {selectedTag:"v1.2.0",selectedVersion:"1.2.0"}: {})},{name:"local",ownership:"local",license:"MIT",redistribution:"allowed",target:local.target,treeHash:"f".repeat(64),fileCount:2,byteCount:123,legalFiles:[{sourcePath:"LICENSE",sha256:"a".repeat(64)}]},plugin]}),oldSource);
    const migrated=convertV1Metadata(oldSource,oldLock);
    assert.equal(migrated.lock.skills.length,1);
    assert.equal(migrated.lock.skills[0]?.resolvedCommit,"b".repeat(40));
    assert.equal(migrated.lock.skills[0]?.treeHash,locked.treeHash);
    assert.deepEqual(migrated.sources.skills.find(s=>s.ownership==="local"),local);
    assert.deepEqual(migrated.sources.skills.find(s=>s.ownership==="plugin"),plugin);
    assert.deepEqual(migrated.lock.skills[0]?.ref,"semver" in ref ? {commit:"b".repeat(40)}:ref);
    if ("semver" in ref) assert.deepEqual(migrated.lock.skills[0]?.legacyRef,{semver:"^1.0.0",selectedTag:"v1.2.0",selectedVersion:"1.2.0"});
    assert.throws(()=>convertV1Metadata(oldSource,{...oldLock,skills:oldLock.skills.slice(1)}));
  }
});

test("verification is a string enum, never a coercible array", () => {
  assert.throws(() => decodeLockJson(sourceText([{...locked, verification:["verified"]}])));
});
