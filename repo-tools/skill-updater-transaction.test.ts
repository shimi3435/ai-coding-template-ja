import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  applyLocalLockPlan,
  applyRemoteUpdatePlan,
  buildLocalLockPlan,
  buildRemoteUpdatePlan,
  canonicalizeTree,
  decodeLockJson,
  decodeSourcesJson,
  readInstalledTree,
  readLocalObservations,
  serializeLock,
  serializeSources,
  sha256,
  type RemoteCohortObservation,
  type SourceRef,
  type TransactionHooks,
} from "./skill-updater/index.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";

const oldCommit = "a".repeat(40);
const newCommit = "b".repeat(40);
const legal = Buffer.from("license\n");
const legalHash = sha256(legal);

function skill(name: string, body: string): Buffer {
  return Buffer.from(`---\nname: ${name}\ndescription: ${name} skill\n---\n${body}\n`);
}

function writeTree(root: string, name: string, body: string): ReturnType<typeof canonicalizeTree> {
  const target = join(root, ".agents", "skills", name);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), skill(name, body));
  writeFileSync(join(target, "LICENSE"), legal);
  return readInstalledTree(root, `.agents/skills/${name}`, name);
}

function remoteFixture(
  ref: SourceRef = { branch: "main" },
  remoteBody = "new",
  resolvedCommit = newCommit,
): {
  root: string;
  plan: ReturnType<typeof buildRemoteUpdatePlan>;
  observation: RemoteCohortObservation;
} {
  const root = createSkillUpdaterTestRoot("remote-transaction-");
  const oldTree = writeTree(root, "demo", "old");
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref,
    subtree: { path: "skills/demo" },
    legalMappings: [{ sourcePath: "LICENSE", targetPath: "LICENSE", expectedSha256: legalHash }],
  }] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref,
    resolvedCommit: oldCommit, verification: "verified", treeHash: oldTree.treeHash,
    ...("semver" in ref ? { selectedTag: "v1.0.0", selectedVersion: "1.0.0" } : {}),
    fileCount: oldTree.fileCount, byteCount: oldTree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: legalHash }],
  }] }), sources);
  const sourcesBytes = serializeSources(sources);
  const lockBytes = serializeLock(lock);
  mkdirSync(join(root, ".agents", "skills"), { recursive: true });
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), sourcesBytes);
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), lockBytes);
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["add", ".agents/skills"], { cwd: root });
  spawnSync("git", ["-c", "user.name=Skill Updater Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const newTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: skill("demo", remoteBody) },
    { path: "LICENSE", executable: false, content: legal },
  ]);
  const observation: RemoteCohortObservation = {
    repository: "owner/repo", ref, resolvedCommit,
    verification: "verified", warnings: [], entries: [{
      name: "demo", metadata: { name: "demo", description: "demo skill" }, tree: newTree,
      legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: legalHash }],
    }],
    ...("semver" in ref ? { selectedTag: "v1.1.0", selectedVersion: "1.1.0" } : {}),
  };
  const plan = buildRemoteUpdatePlan({
    sources, sourcesBytes, lock, initialLockBytes: lockBytes,
    installedTrees: new Map([["demo", oldTree]]), observations: [observation],
  });
  return { root, plan, observation };
}

test("remote transaction replaces target first and lock last", async () => {
  const fixture = remoteFixture();
  const transitions: string[] = [];
  const hooks: TransactionHooks = { transition: (point) => { transitions.push(point); } };

  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
    hooks,
  });

  assert.equal(result.status, "applied");
  assert.ok(transitions.indexOf("after-target-replace:demo") < transitions.indexOf("after-lock-replace"));
  assert.equal(readFileSync(join(fixture.root, ".agents", "skills", "skills.lock.json"), "utf8"), fixture.plan.candidateLockBytes);
  assert.equal(readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash, fixture.observation.entries[0]?.tree.treeHash);
  assert.equal(existsSync(join(fixture.root, ".agents", "skills", ".skill-updater-txn")), false);
});

test("remote no-op apply preserves plan statuses and reports no-content-change", async () => {
  const fixture = remoteFixture({ branch: "main" }, "old", oldCommit);

  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
  });

  assert.equal(fixture.plan.steps[0]?.status, "up-to-date");
  assert.equal(result.status, "no-content-change");
  assert.deepEqual(result.steps, [{ key: fixture.plan.steps[0]!.key, status: "up-to-date" }]);
});

test("remote transaction manifest records transition and recovery digests before cleanup", async () => {
  const fixture = remoteFixture();
  let manifest: Record<string, unknown> | undefined;
  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
    hooks: {
      transition: (point) => {
        if (point === "after-target-replace:demo") {
          manifest = JSON.parse(readFileSync(join(
            fixture.root, ".agents", "skills", ".skill-updater-txn", "manifest.json",
          ), "utf8")) as Record<string, unknown>;
        }
      },
    },
  });

  assert.equal(result.status, "applied");
  assert.equal(manifest?.transition, "target-replaced:demo");
  assert.equal(manifest?.expectedBeforeLockDigest, fixture.plan.steps[0]?.expectedBeforeLockDigest);
  assert.equal(manifest?.candidateAfterLockDigest, fixture.plan.steps[0]?.candidateAfterLockDigest);
  assert.match(JSON.stringify(manifest), /beforeImage|manualRecovery/);
});

test("remote transaction keeps recovery digests after a completed step until transaction cleanup", async () => {
  const fixture = remoteFixture();
  let manifest: Record<string, unknown> | undefined;
  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
    hooks: {
      transition: (point) => {
        if (point.startsWith("after-step-complete:")) {
          manifest = JSON.parse(readFileSync(join(
            fixture.root, ".agents", "skills", ".skill-updater-txn", "manifest.json",
          ), "utf8")) as Record<string, unknown>;
        }
      },
    },
  });

  assert.equal(result.status, "applied");
  assert.equal(manifest?.transition, "step-complete");
  assert.equal(manifest?.currentLockDigest, fixture.plan.candidateLockDigest);
  assert.match(JSON.stringify(manifest), /manualRecovery|candidateLockDigest/);
});

test("remote transaction rolls back a failed target transition and stops later work", async () => {
  const fixture = remoteFixture();
  const beforeLock = readFileSync(join(fixture.root, ".agents", "skills", "skills.lock.json"), "utf8");
  const beforeTree = readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash;
  const hooks: TransactionHooks = {
    transition: (point) => { if (point === "after-target-replace:demo") throw new Error("injected target failure"); },
  };

  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
    hooks,
  });

  assert.equal(result.status, "rolled-back");
  assert.equal(readFileSync(join(fixture.root, ".agents", "skills", "skills.lock.json"), "utf8"), beforeLock);
  assert.equal(readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash, beforeTree);
});

test("rollback proof failure returns unknown and retains the manifest", async () => {
  const fixture = remoteFixture();
  const hooks: TransactionHooks = {
    transition: (point) => {
      if (point === "after-target-replace:demo") throw new Error("runtime failure");
      if (point === "before-target-rollback:demo") throw new Error("rollback failure");
    },
  };
  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
    hooks,
  });

  assert.equal(result.status, "unknown");
  assert.equal(existsSync(join(fixture.root, ".agents", "skills", ".skill-updater-txn", "manifest.json")), true);
});

test("remote transaction rejects stale source bytes before mutation", async () => {
  const fixture = remoteFixture();
  const beforeTree = readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash;
  writeFileSync(join(fixture.root, ".agents", "skills", "skills.sources.json"), `${fixture.plan.sourcesBytes} `);

  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
  });

  assert.equal(result.status, "failed");
  assert.equal(readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash, beforeTree);
});

test("remote transaction rejects staged managed changes even when worktree bytes match lock", async () => {
  const fixture = remoteFixture();
  const skillPath = join(fixture.root, ".agents", "skills", "demo", "SKILL.md");
  writeFileSync(skillPath, skill("demo", "staged"));
  spawnSync("git", ["add", ".agents/skills/demo/SKILL.md"], { cwd: fixture.root });
  writeFileSync(skillPath, skill("demo", "old"));

  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => fixture.observation,
  });

  assert.equal(result.status, "failed");
  assert.match(result.errors.join("\n"), /dirty|managed target/);
  assert.equal(readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash, fixture.plan.steps[0]?.expectedTargetDigests.get("demo"));
});

test("remote transaction rechecks sources before every cohort step", async () => {
  const fixture = remoteFixture();
  let refreshCount = 0;
  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => {
      refreshCount += 1;
      writeFileSync(join(fixture.root, ".agents", "skills", "skills.sources.json"), `${fixture.plan.sourcesBytes} `);
      return fixture.observation;
    },
  });

  assert.equal(refreshCount, 1);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.steps, [{ key: fixture.plan.steps[0]!.key, status: "failed" }]);
  assert.match(result.errors.join("\n"), /sources freshness/);
});

test("remote transaction fails before mutation when per-step verification changes", async () => {
  const fixture = remoteFixture();
  const beforeLock = readFileSync(join(fixture.root, ".agents", "skills", "skills.lock.json"), "utf8");
  const beforeTree = readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash;
  const later = { ...fixture.plan.steps[0]!, key: "owner/repo|branch:later" };
  const plan = { ...fixture.plan, steps: Object.freeze([fixture.plan.steps[0]!, later]) };

  const result = await applyRemoteUpdatePlan(plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => plan,
    refreshStep: async () => ({ ...fixture.observation, verification: "unverified" }),
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.steps, [
    { key: fixture.plan.steps[0]!.key, status: "failed" },
    { key: later.key, status: "not-attempted" },
  ]);
  assert.equal(readFileSync(join(fixture.root, ".agents", "skills", "skills.lock.json"), "utf8"), beforeLock);
  assert.equal(readInstalledTree(fixture.root, ".agents/skills/demo", "demo").treeHash, beforeTree);
  assert.equal(existsSync(join(fixture.root, ".agents", "skills", ".skill-updater-txn")), false);
});

test("remote partial failure preserves a preceding up-to-date cohort status", async () => {
  const fixture = remoteFixture();
  const noOpFixture = remoteFixture({ branch: "main" }, "old", oldCommit);
  const first = { ...noOpFixture.plan.steps[0]!, key: "owner/repo|branch:first" };
  const second = fixture.plan.steps[0]!;
  const plan = { ...fixture.plan, steps: Object.freeze([first, second]) };

  const result = await applyRemoteUpdatePlan(plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => plan,
    refreshStep: async () => ({ ...fixture.observation, verification: "unverified" }),
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.steps, [
    { key: first.key, status: "up-to-date" },
    { key: second.key, status: "failed" },
  ]);
});

test("remote transaction rejects a changed SemVer tag at per-step freshness", async () => {
  const fixture = remoteFixture({ semver: "^1.0.0" });
  const beforeLock = readFileSync(join(fixture.root, ".agents", "skills", "skills.lock.json"), "utf8");

  const result = await applyRemoteUpdatePlan(fixture.plan, {
    repositoryRoot: fixture.root,
    refreshAll: async () => fixture.plan,
    refreshStep: async () => ({
      ...fixture.observation,
      selectedTag: "v1.1.0-retagged",
      selectedVersion: "1.1.1",
    }),
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.steps, [{ key: fixture.plan.steps[0]!.key, status: "failed" }]);
  assert.equal(readFileSync(join(fixture.root, ".agents", "skills", "skills.lock.json"), "utf8"), beforeLock);
});

test("local lock-only transaction rolls back a post-replacement failure", async () => {
  const root = createSkillUpdaterTestRoot("local-transaction-");
  const tree = writeTree(root, "demo", "current");
  writeFileSync(join(root, "LICENSE"), legal);
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "local", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", legalMappings: [{ sourcePath: "LICENSE", expectedSha256: legalHash }],
  }] }));
  const oldTree = canonicalizeTree([{ path: "SKILL.md", executable: false, content: skill("demo", "old") }]);
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "local", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", treeHash: oldTree.treeHash,
    fileCount: oldTree.fileCount, byteCount: oldTree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", sha256: legalHash }],
  }] }), sources);
  const sourcesBytes = serializeSources(sources);
  const lockBytes = serializeLock(lock);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), sourcesBytes);
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), lockBytes);
  // local legal tracked判定はtransaction seam外。既知observationからplan生成。
  const plan = buildLocalLockPlan({
    sources, sourcesBytes, lock, initialLockBytes: lockBytes,
    observations: [{ name: "demo", tree, legalFiles: [{ sourcePath: "LICENSE", sha256: legalHash }] }],
  });
  const result = await applyLocalLockPlan(plan, {
    repositoryRoot: root,
    refresh: async () => plan,
    hooks: { transition: (point) => { if (point === "after-lock-replace") throw new Error("injected lock failure"); } },
  });

  assert.equal(result.status, "rolled-back");
  assert.equal(readFileSync(join(root, ".agents", "skills", "skills.lock.json"), "utf8"), lockBytes);
});
