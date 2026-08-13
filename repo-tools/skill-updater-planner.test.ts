import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalLockPlan,
  buildRemoteUpdatePlan,
  canonicalizeTree,
  decodeLockJson,
  decodeSourcesJson,
  serializeLock,
  sha256,
  type LocalObservation,
  type RemoteCohortObservation,
} from "./skill-updater/index.ts";

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);
const licenseHash = sha256(Buffer.from("license"));

function remoteSource(name: string, repository: string): Record<string, unknown> {
  return {
    name, ownership: "remote", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`, repository, ref: { branch: "main" },
    subtree: { path: `skills/${name}` },
    legalMappings: [{ sourcePath: "LICENSE", targetPath: "LICENSE", expectedSha256: licenseHash }],
  };
}

function remoteLock(name: string, repository: string, tree: ReturnType<typeof observedTree>): Record<string, unknown> {
  return {
    name, ownership: "remote", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`, repository, ref: { branch: "main" },
    resolvedCommit: commitA, verification: "verified", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: licenseHash }],
  };
}

function observedTree(name: string, content: string) {
  return canonicalizeTree([
    { path: "SKILL.md", executable: false, content: Buffer.from(content) },
    { path: "LICENSE", executable: false, content: Buffer.from("license") },
  ]);
}

function observation(repository: string, name: string, tree: ReturnType<typeof observedTree>): RemoteCohortObservation {
  return {
    repository, ref: { branch: "main" }, resolvedCommit: commitB, verification: "verified", warnings: [],
    entries: [{
      name,
      metadata: { name, description: `${name} skill` },
      tree,
      legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: licenseHash }],
    }],
  };
}

test("[H6] remote plan chains independent cohort lock bytes in deterministic order", () => {
  const oldAlpha = observedTree("alpha", "old-a");
  const oldZulu = observedTree("zulu", "old-z");
  const newAlpha = observedTree("alpha", "new-a");
  const newZulu = observedTree("zulu", "new-z");
  const sources = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [remoteSource("zulu", "z/repo"), remoteSource("alpha", "a/repo")],
  }));
  const lock = decodeLockJson(JSON.stringify({
    schemaVersion: 1,
    skills: [remoteLock("zulu", "z/repo", oldZulu), remoteLock("alpha", "a/repo", oldAlpha)],
  }), sources);
  const initialLockBytes = serializeLock(lock);

  const plan = buildRemoteUpdatePlan({
    sources,
    lock,
    initialLockBytes,
    installedTrees: new Map([["alpha", oldAlpha], ["zulu", oldZulu]]),
    observations: [observation("z/repo", "zulu", newZulu), observation("a/repo", "alpha", newAlpha)],
  });

  assert.deepEqual(plan.steps.map((step) => step.key), ["a/repo|branch:main", "z/repo|branch:main"]);
  assert.equal(plan.steps[0]?.expectedBeforeLockBytes, initialLockBytes);
  assert.equal(plan.steps[0]?.candidateAfterLockBytes, plan.steps[1]?.expectedBeforeLockBytes);
  assert.equal(plan.steps[1]?.candidateAfterLockBytes, plan.candidateLockBytes);
  assert.deepEqual(plan.steps.map((step) => step.status), ["update-available", "update-available"]);
});

test("[H11] remote plan preserves lock bytes when only the resolved commit moves", () => {
  const tree = observedTree("alpha", "same");
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [remoteSource("alpha", "a/repo")] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [remoteLock("alpha", "a/repo", tree)] }), sources);
  const initialLockBytes = serializeLock(lock);
  const plan = buildRemoteUpdatePlan({
    sources, lock, initialLockBytes,
    installedTrees: new Map([["alpha", tree]]),
    observations: [observation("a/repo", "alpha", tree)],
  });

  assert.equal(plan.steps[0]?.status, "no-content-change");
  assert.equal(plan.candidateLockBytes, initialLockBytes);
});

test("[H5] same repository and ref entries form one cohort step", () => {
  const alpha = observedTree("alpha", "new-a");
  const beta = observedTree("beta", "new-b");
  const oldAlpha = observedTree("alpha", "old-a");
  const oldBeta = observedTree("beta", "old-b");
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [
    remoteSource("alpha", "shared/repo"), remoteSource("beta", "shared/repo"),
  ] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [
    remoteLock("alpha", "shared/repo", oldAlpha), remoteLock("beta", "shared/repo", oldBeta),
  ] }), sources);
  const plan = buildRemoteUpdatePlan({
    sources,
    lock,
    initialLockBytes: serializeLock(lock),
    installedTrees: new Map([["alpha", oldAlpha], ["beta", oldBeta]]),
    observations: [{
      repository: "shared/repo", ref: { branch: "main" }, resolvedCommit: commitB,
      verification: "verified", warnings: [], entries: [
        observation("shared/repo", "alpha", alpha).entries[0]!,
        observation("shared/repo", "beta", beta).entries[0]!,
      ],
    }],
  });

  assert.equal(plan.steps.length, 1);
  assert.deepEqual(plan.steps[0]?.names, ["alpha", "beta"]);
});

test("remote plan updates lock provenance when source declaration changes", () => {
  const tree = observedTree("alpha", "same");
  const source = remoteSource("alpha", "new/repo");
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [source] }));
  const legacySource = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [remoteSource("alpha", "old/repo")],
  }));
  const lock = decodeLockJson(JSON.stringify({
    schemaVersion: 1,
    skills: [remoteLock("alpha", "old/repo", tree)],
  }), legacySource);
  const initialLockBytes = serializeLock(lock);
  const plan = buildRemoteUpdatePlan({
    sources,
    lock,
    initialLockBytes,
    installedTrees: new Map([["alpha", tree]]),
    observations: [observation("new/repo", "alpha", tree)],
  });
  const candidate = decodeLockJson(plan.candidateLockBytes, sources);
  const candidateEntry = candidate.skills[0];

  assert.equal(plan.steps[0]?.status, "update-available");
  assert.equal(candidateEntry?.ownership === "remote" ? candidateEntry.repository : undefined, "new/repo");
});

test("local lock plan updates every local entry in one candidate lock", () => {
  const oldTree = observedTree("unused", "old");
  const alpha = observedTree("alpha", "alpha");
  const beta = observedTree("beta", "beta");
  const localSource = (name: string) => ({
    name, ownership: "local", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`,
    legalMappings: [{ sourcePath: "LICENSE", expectedSha256: licenseHash }],
  });
  const localLock = (name: string) => ({
    name, ownership: "local", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`, treeHash: oldTree.treeHash,
    fileCount: oldTree.fileCount, byteCount: oldTree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", sha256: licenseHash }],
  });
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [localSource("alpha"), localSource("beta")] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [localLock("alpha"), localLock("beta")] }), sources);
  const initialLockBytes = serializeLock(lock);
  const observations: LocalObservation[] = [
    { name: "alpha", tree: alpha, legalFiles: [{ sourcePath: "LICENSE", sha256: licenseHash }] },
    { name: "beta", tree: beta, legalFiles: [{ sourcePath: "LICENSE", sha256: licenseHash }] },
  ];

  const plan = buildLocalLockPlan({ sources, lock, initialLockBytes, observations });
  const candidate = decodeLockJson(plan.candidateLockBytes, sources);
  const alphaLock = candidate.skills.find((entry) => entry.name === "alpha");
  const betaLock = candidate.skills.find((entry) => entry.name === "beta");
  assert.equal(plan.status, "update-available");
  assert.equal(alphaLock?.ownership, "local");
  assert.equal(betaLock?.ownership, "local");
  assert.equal(alphaLock?.ownership === "local" ? alphaLock.treeHash : undefined, alpha.treeHash);
  assert.equal(betaLock?.ownership === "local" ? betaLock.treeHash : undefined, beta.treeHash);
});
