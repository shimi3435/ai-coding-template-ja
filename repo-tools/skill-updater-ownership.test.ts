import assert from "node:assert/strict";
import test from "node:test";
import { adoptLocal } from "./skill-updater/ownership.ts";
import { canonicalizeTree } from "./skill-updater/canonical.ts";
import { sha256 } from "./skill-updater/legal.ts";
import type { SourcesDocument, LockDocument } from "./skill-updater/types.ts";

const license=Buffer.from("MIT\n");
const original=canonicalizeTree([{path:"SKILL.md",executable:false,content:Buffer.from("---\nname: demo\ndescription: Demo\n---\noriginal\n")},{path:"LICENSE",executable:false,content:license},{path:"run.sh",executable:true,content:Buffer.from("#!/bin/sh\n")}]);
const sources:SourcesDocument={schemaVersion:2,skills:[{name:"demo",ownership:"remote",license:"MIT",redistribution:"allowed",target:".agents/skills/demo",repository:"owner/repo",ref:{tag:"release"},subtree:{root:true},legalMappings:[{sourcePath:"LICENSE",targetPath:"LICENSE",expectedSha256:sha256(license)}]}]};
const lock:LockDocument={schemaVersion:2,skills:[{name:"demo",ownership:"remote",license:"MIT",redistribution:"allowed",target:".agents/skills/demo",repository:"owner/repo",ref:{tag:"release"},subtree:{root:true},resolvedCommit:"a".repeat(40),tagObjectSha:"b".repeat(40),verification:"unknown",treeHash:original.treeHash,fileCount:original.fileCount,byteCount:original.byteCount,legalFiles:[{sourcePath:"LICENSE",targetPath:"LICENSE",sha256:sha256(license)}]}]};
test("adopt-local preserves modified body and modes, provenance and legal approval without any body write",()=>{
  const modified=canonicalizeTree(original.files.map(f=>f.path==="SKILL.md"?{...f,content:Buffer.concat([f.content,Buffer.from("edited")])}:f));
  const result=adoptLocal({sources,lock,installedTrees:new Map([["demo",modified]])},"demo");
  assert.equal(result.trees.size,0); assert.deepEqual(result.lock.skills,[]);
  const local=result.sources.skills[0]; assert.equal(local?.ownership,"local");
  if(local?.ownership!=="local")throw new Error("expected local");
  assert.equal(local.origin?.resolvedCommit,"a".repeat(40)); assert.equal(local.origin?.tagObjectSha,"b".repeat(40));
  assert.deepEqual(local.legalMappings,[{path:".agents/skills/demo/LICENSE",expectedSha256:sha256(license)}]);
  assert.deepEqual(adoptLocal({...result,installedTrees:new Map([["demo",modified]])},"demo").changes,[]);
});

test("adopt-local rejects legal drift, invalid structure, metadata mismatch and fabricated first-party origin",()=>{
  for(const changed of [original.files.map(f=>f.path==="LICENSE"?{...f,content:Buffer.from("other")}:f),original.files.map(f=>f.path==="SKILL.md"?{...f,content:Buffer.from("invalid")}:f)]) assert.throws(()=>adoptLocal({sources,lock,installedTrees:new Map([["demo",canonicalizeTree(changed)]])},"demo"));
  assert.throws(()=>adoptLocal({sources,lock:{...lock,skills:lock.skills.map(l=>({...l,license:"other"}))},installedTrees:new Map([["demo",original]])},"demo"));
  const converted=adoptLocal({sources,lock,installedTrees:new Map([["demo",original]])},"demo");
  const local=converted.sources.skills[0]; if(local?.ownership!=="local")throw new Error("expected local");
  const {origin:_,...firstParty}=local;
  assert.throws(()=>adoptLocal({...converted,sources:{schemaVersion:2,skills:[firstParty]},installedTrees:new Map([["demo",original]])},"demo"));
});
