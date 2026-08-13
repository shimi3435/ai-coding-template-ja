import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decodeLockJson,
  decodeSourcesJson,
  readInstalledTree,
  serializeLock,
  serializeSources,
  sha256,
} from "./skill-updater/index.ts";

const repositoryRoot = new URL("..", import.meta.url).pathname;
const metadataRoot = new URL("../.agents/skills/", import.meta.url);

const expectedNames = [
  "caveman",
  "code-review",
  "diagnosing-bugs",
  "domain-modeling",
  "execute-openspec-change",
  "grill-me",
  "grill-with-docs",
  "grilling",
  "self-review",
  "spec-holes",
  "tdd",
  "verify-change",
];

test("migration preserves a bijection between declarations, locks, and installed skills", () => {
  const sourcesBytes = readFileSync(new URL("skills.sources.json", metadataRoot), "utf8");
  const lockBytes = readFileSync(new URL("skills.lock.json", metadataRoot), "utf8");
  const sources = decodeSourcesJson(sourcesBytes);
  const lock = decodeLockJson(lockBytes, sources);

  assert.deepEqual(sources.skills.map((entry) => entry.name).sort(), expectedNames);
  assert.deepEqual(lock.skills.map((entry) => entry.name).sort(), expectedNames);
  assert.equal(serializeSources(sources), sourcesBytes);
  assert.equal(serializeLock(lock), lockBytes);
  for (const entry of lock.skills) {
    assert.notEqual(entry.ownership, "plugin");
    if (entry.ownership !== "plugin") {
      const tree = readInstalledTree(repositoryRoot, entry.target, entry.name);
      assert.deepEqual(
        { treeHash: entry.treeHash, fileCount: entry.fileCount, byteCount: entry.byteCount },
        { treeHash: tree.treeHash, fileCount: tree.fileCount, byteCount: tree.byteCount },
      );
    }
  }
});

test("migration pins reviewed remote paths and legal hashes", () => {
  const sources = decodeSourcesJson(readFileSync(new URL("skills.sources.json", metadataRoot), "utf8"));
  const remote = new Map(sources.skills
    .filter((entry) => entry.ownership === "remote")
    .map((entry) => [entry.name, entry]));

  assert.deepEqual(remote.get("caveman")?.subtree, { path: "skills/caveman" });
  assert.deepEqual(remote.get("code-review")?.subtree, { path: "skills/engineering/code-review" });
  assert.deepEqual(remote.get("grill-me")?.subtree, { path: "skills/productivity/grill-me" });
  for (const source of remote.values()) {
    assert.deepEqual(source.ref, { branch: "main" });
    assert.deepEqual(source.legalMappings, [{
      sourcePath: "LICENSE",
      targetPath: "LICENSE",
      expectedSha256: source.name === "caveman"
        ? "5eb826cd03151bcc7cce3f80d40e87733237fedfc6c36d6908aca5fd650a0bdb"
        : "0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5",
    }]);
  }
});

test("migration keeps first-party legal files repository-level and shared", () => {
  const sources = decodeSourcesJson(readFileSync(new URL("skills.sources.json", metadataRoot), "utf8"));
  const rootLicenseHash = sha256(readFileSync(new URL("../LICENSE", import.meta.url)));
  const local = sources.skills.filter((entry) => entry.ownership === "local");

  assert.deepEqual(local.map((entry) => entry.name).sort(), [
    "execute-openspec-change", "self-review", "spec-holes", "verify-change",
  ]);
  for (const source of local) {
    assert.deepEqual(source.legalMappings, [{ sourcePath: "LICENSE", expectedSha256: rootLicenseHash }]);
  }
});

const parityCases = new Map<string, readonly string[]>([
  ["H1", ["skills:verify handles a declaration with no remote entries"]],
  ["H2", ["source declaration rejects invalid repository and unknown fields"]],
  ["H3", ["GitHub observation rejects source API errors before content reads"]],
  ["H4", ["branch observation rejects history rewrite"]],
  ["H5", ["same repository and ref entries form one cohort step"]],
  ["H6", ["remote plan chains independent cohort lock bytes in deterministic order"]],
  ["H7", ["remote update preview reports commit, diff, lock digests, and planned lock without writes"]],
  ["H8", [
    "GitHub observation rejects a missing gh prerequisite",
    "GitHub observation rejects an unauthenticated gh prerequisite",
    "skill command rejects missing lock prerequisite with no write",
    "skill command rejects unparseable lock prerequisite with no write",
  ]],
  ["H9", ["GitHub observation rejects truncated trees and special files"]],
  ["H10", ["GitHub observation matches only the selected path and keeps renamed target paths"]],
  ["H11", ["remote plan preserves lock bytes when only the resolved commit moves"]],
]);

test("migration tracks every H1-H11 parity case", () => {
  assert.equal(parityCases.size, 11);
  assert.deepEqual([...parityCases.keys()],
    ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11"]);
  const behavioralTests = [
    "skill-updater-foundation.test.ts",
    "skill-updater-github.test.ts",
    "skill-updater-planner.test.ts",
    "skill-updater-cli.test.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  for (const [caseId, testNames] of parityCases) {
    for (const testName of testNames) {
      assert.match(behavioralTests, new RegExp(`\\[${caseId}\\].*${testName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  }
});
