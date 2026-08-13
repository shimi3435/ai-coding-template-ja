import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  canonicalizeTree,
  decodeLockJson,
  decodeSourcesJson,
  runSkillCommand,
  serializeLock,
  serializeSources,
  sha256,
  type GhRunner,
  type RemoteSource,
} from "./skill-updater/index.ts";
import {
  commit,
  fixtureBlobSha,
  license,
  licenseBlobSha,
  skill,
  source,
  transcript,
} from "./skill-updater-github-test-fixture.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";

test("[H7] remote update preview reports commit, diff, lock digests, and planned lock without writes", async () => {
  const root = createSkillUpdaterTestRoot("skill-preview-");
  const target = join(root, ".agents", "skills", "demo");
  mkdirSync(target, { recursive: true });
  const oldSkill = Buffer.from("---\nname: demo\ndescription: Demo skill\n---\nold\n");
  writeFileSync(join(target, "SKILL.md"), oldSkill);
  writeFileSync(join(target, "LICENSE"), license);
  const oldTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: oldSkill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [source()] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref: { branch: "main" },
    resolvedCommit: commit, verification: "verified", treeHash: oldTree.treeHash,
    fileCount: oldTree.fileCount, byteCount: oldTree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  }] }), sources);
  const lockPath = join(root, ".agents", "skills", "skills.lock.json");
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(lockPath, serializeLock(lock));
  const beforeLock = readFileSync(lockPath, "utf8");
  const fake = transcript({
    [`repos/owner/repo/commits/${commit}`]: {
      sha: commit,
      commit: { verification: { verified: false, reason: "unsigned" } },
    },
  });

  const result = await runSkillCommand("skills:update", ["--json"], { repositoryRoot: root, ghRunner: fake.runner });
  const cohort = result.report.cohorts[0];

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.warnings, ["commit verification: unverified"]);
  assert.equal(cohort?.resolvedCommit, commit);
  assert.deepEqual(cohort?.diff?.map((item) => item.name), ["demo"]);
  assert.match(cohort?.expectedBeforeLockDigest ?? "", /^[0-9a-f]{64}$/);
  assert.match(cohort?.candidateAfterLockDigest ?? "", /^[0-9a-f]{64}$/);
  assert.equal(typeof cohort?.candidateAfterLock, "object");
  assert.equal(readFileSync(lockPath, "utf8"), beforeLock);
});

test("remote no-op apply reports no-content-change and preserves cohort status", async () => {
  const root = createSkillUpdaterTestRoot("skill-no-op-apply-");
  const target = join(root, ".agents", "skills", "demo");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), skill);
  writeFileSync(join(target, "LICENSE"), license);
  const tree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: skill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [source()] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref: { branch: "main" },
    resolvedCommit: commit, verification: "verified", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  }] }), sources);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), serializeLock(lock));

  const result = await runSkillCommand("skills:update", ["--apply", "--json"], {
    repositoryRoot: root,
    ghRunner: transcript().runner,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.report.status, "no-content-change");
  assert.deepEqual(result.report.cohorts.map(({ key, status }) => ({ key, status })), [
    { key: "owner/repo|branch:main", status: "up-to-date" },
  ]);
});

test("remote update preview carries a reviewed source policy change into generated lock", async () => {
  const root = createSkillUpdaterTestRoot("skill-policy-preview-");
  const target = join(root, ".agents", "skills", "demo");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), skill);
  writeFileSync(join(target, "LICENSE"), license);
  const tree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: skill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const sources = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{ ...source(), license: "MIT reviewed" }],
  }));
  const oldSources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [source()] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref: { branch: "main" },
    resolvedCommit: commit, verification: "verified", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  }] }), oldSources);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  const fake = transcript();

  const result = await runSkillCommand("skills:update", ["--json"], { repositoryRoot: root, ghRunner: fake.runner });
  const planned = result.report.cohorts[0]?.candidateAfterLock as { skills?: Array<{ license?: string }> };

  assert.equal(result.report.status, "update-available");
  assert.equal(planned.skills?.[0]?.license, "MIT reviewed");
});

test("remote repository drift starts new history instead of comparing the old repository commit", async () => {
  const root = createSkillUpdaterTestRoot("skill-repository-drift-");
  const target = join(root, ".agents", "skills", "demo");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), skill);
  writeFileSync(join(target, "LICENSE"), license);
  const tree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: skill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const newSource = { ...source(), repository: "owner/new" };
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [newSource] }));
  const oldSources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [source()] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref: { branch: "main" },
    resolvedCommit: "a".repeat(40), verification: "verified", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  }] }), oldSources);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  const fake = transcript();
  const calls: string[] = [];
  const runner: GhRunner = async (args) => {
    const endpoint = args.find((argument) => argument.startsWith("repos/"));
    if (endpoint !== undefined) calls.push(endpoint);
    return fake.runner(args.map((argument) => argument.replace("owner/new", "owner/repo")));
  };

  const result = await runSkillCommand("skills:update", ["--json"], { repositoryRoot: root, ghRunner: runner });

  assert.equal(result.exitCode, 0);
  assert.equal(result.report.status, "update-available");
  assert.equal(calls.some((endpoint) => endpoint.includes("/compare/")), false);

  const combinedDrift = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{ ...newSource, ref: { semver: "^1.0.0" } }],
  }));
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(combinedDrift));
  const callCount = calls.length;
  const rejected = await runSkillCommand("skills:update", ["--json"], { repositoryRoot: root, ghRunner: runner });
  assert.equal(rejected.exitCode, 1);
  assert.match(rejected.report.errors.join("\n"), /ref variant/);
  assert.equal(calls.length, callCount);
});

test("remote check reports actual successful cohort status beside a failed cohort", async () => {
  const root = createSkillUpdaterTestRoot("skill-partial-check-");
  const brokenSkill = Buffer.from("---\nname: broken\ndescription: Broken skill\n---\nbody\n");
  for (const [name, content] of [["demo", skill], ["broken", brokenSkill]] as const) {
    const target = join(root, ".agents", "skills", name);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "SKILL.md"), content);
    writeFileSync(join(target, "LICENSE"), license);
  }
  const demoSource = source();
  const brokenSource: RemoteSource = {
    ...source(),
    name: "broken",
    target: ".agents/skills/broken",
    repository: "broken/repo",
    subtree: { path: "skills/broken" },
  };
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [demoSource, brokenSource] }));
  const demoTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: skill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const brokenTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: brokenSkill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const lockEntry = (name: string, repository: string, tree: typeof demoTree) => ({
    name, ownership: "remote", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`, repository, ref: { branch: "main" },
    resolvedCommit: commit, verification: "verified", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  });
  const lock = decodeLockJson(JSON.stringify({
    schemaVersion: 1,
    skills: [lockEntry("demo", "owner/repo", demoTree), lockEntry("broken", "broken/repo", brokenTree)],
  }), sources);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  const good = transcript();
  const runner: GhRunner = async (args) => args.some((argument) => argument.startsWith("repos/broken/repo"))
    ? { exitCode: 1, stdout: "", stderr: "offline" }
    : good.runner(args);

  const result = await runSkillCommand("skills:check", ["--json"], { repositoryRoot: root, ghRunner: runner });

  assert.equal(result.exitCode, 1);
  assert.equal(result.report.status, "failed");
  assert.deepEqual(result.report.cohorts.map(({ key, status }) => ({ key, status })), [
    { key: "broken/repo|branch:main", status: "failed" },
    { key: "owner/repo|branch:main", status: "up-to-date" },
  ]);

  const beforeLock = readFileSync(join(root, ".agents", "skills", "skills.lock.json"), "utf8");
  const apply = await runSkillCommand("skills:update", ["--apply", "--json"], { repositoryRoot: root, ghRunner: runner });
  assert.equal(apply.exitCode, 1);
  assert.equal(apply.report.status, "failed");
  assert.deepEqual(apply.report.cohorts.map(({ key, status }) => ({ key, status })), [
    { key: "broken/repo|branch:main", status: "failed" },
    { key: "owner/repo|branch:main", status: "up-to-date" },
  ]);
  assert.equal(readFileSync(join(root, ".agents", "skills", "skills.lock.json"), "utf8"), beforeLock);
});

test("remote check preserves every cohort when installed classification fails after successful observations", async () => {
  const root = createSkillUpdaterTestRoot("skill-classification-failure-");
  const oldDemoSkill = Buffer.from("---\nname: demo\ndescription: Demo skill\n---\nold\n");
  const brokenSkill = Buffer.from("---\nname: broken\ndescription: Broken skill\n---\nbody\n");
  const lockedBrokenSkill = Buffer.from("---\nname: broken\ndescription: Broken skill\n---\nlocked\n");
  for (const [name, content] of [["demo", oldDemoSkill], ["broken", brokenSkill]] as const) {
    const target = join(root, ".agents", "skills", name);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "SKILL.md"), content);
    writeFileSync(join(target, "LICENSE"), license);
  }
  const demoSource = source();
  const brokenSource: RemoteSource = {
    ...source(), name: "broken", target: ".agents/skills/broken",
    repository: "broken/repo", subtree: { path: "skills/broken" },
  };
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [demoSource, brokenSource] }));
  const oldDemoTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: oldDemoSkill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const lockedBrokenTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: lockedBrokenSkill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const lockEntry = (name: string, repository: string, tree: typeof oldDemoTree) => ({
    name, ownership: "remote", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`, repository, ref: { branch: "main" },
    resolvedCommit: commit, verification: "verified", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  });
  const lock = decodeLockJson(JSON.stringify({
    schemaVersion: 1,
    skills: [lockEntry("demo", "owner/repo", oldDemoTree), lockEntry("broken", "broken/repo", lockedBrokenTree)],
  }), sources);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  const demoRemote = transcript();
  const brokenBlobSha = fixtureBlobSha(brokenSkill);
  const brokenRemote = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/broken/SKILL.md", mode: "100644", type: "blob", sha: brokenBlobSha, size: brokenSkill.length },
      ],
    },
    [`repos/owner/repo/git/blobs/${brokenBlobSha}`]: {
      sha: brokenBlobSha, encoding: "base64", content: brokenSkill.toString("base64"), size: brokenSkill.length,
    },
  });
  const runner: GhRunner = async (args) => args.some((argument) => argument.startsWith("repos/broken/repo"))
    ? brokenRemote.runner(args.map((argument) => argument.replace("repos/broken/repo", "repos/owner/repo")))
    : demoRemote.runner(args);

  const result = await runSkillCommand("skills:check", ["--json"], { repositoryRoot: root, ghRunner: runner });

  assert.equal(result.exitCode, 1);
  assert.equal(result.report.status, "failed");
  assert.deepEqual(result.report.cohorts.map(({ key, status }) => ({ key, status })), [
    { key: "broken/repo|branch:main", status: "failed" },
    { key: "owner/repo|branch:main", status: "update-available" },
  ]);
  assert.equal(result.report.cohorts[1]?.resolvedCommit, commit);
  assert.equal(result.report.cohorts[1]?.diff, undefined);
  assert.equal(result.report.cohorts[1]?.candidateAfterLock, undefined);
});

test("remote apply preserves actual cohort states when the second global observation partially fails", async () => {
  const root = createSkillUpdaterTestRoot("skill-refresh-partial-");
  const oldDemoSkill = Buffer.from("---\nname: demo\ndescription: Demo skill\n---\nold\n");
  const brokenSkill = Buffer.from("---\nname: broken\ndescription: Broken skill\n---\nbody\n");
  for (const [name, content] of [["demo", oldDemoSkill], ["broken", brokenSkill]] as const) {
    const target = join(root, ".agents", "skills", name);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "SKILL.md"), content);
    writeFileSync(join(target, "LICENSE"), license);
  }
  const demoSource = source();
  const brokenSource: RemoteSource = {
    ...source(), name: "broken", target: ".agents/skills/broken",
    repository: "broken/repo", subtree: { path: "skills/broken" },
  };
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [demoSource, brokenSource] }));
  const oldDemoTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: oldDemoSkill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const brokenTree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: brokenSkill },
    { path: "LICENSE", executable: false, content: license },
  ]);
  const lockEntry = (name: string, repository: string, tree: typeof oldDemoTree) => ({
    name, ownership: "remote", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`, repository, ref: { branch: "main" },
    resolvedCommit: commit, verification: "verified", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  });
  const lock = decodeLockJson(JSON.stringify({
    schemaVersion: 1,
    skills: [lockEntry("demo", "owner/repo", oldDemoTree), lockEntry("broken", "broken/repo", brokenTree)],
  }), sources);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  const good = transcript();
  const freshCommit = "d".repeat(40);
  const fresh = transcript({
    "repos/owner/repo/git/ref/heads/main": { object: { type: "commit", sha: freshCommit } },
    [`repos/owner/repo/compare/${commit}...${freshCommit}`]: { status: "ahead" },
    [`repos/owner/repo/commits/${freshCommit}`]: {
      sha: freshCommit,
      commit: { verification: { verified: true, reason: "valid" } },
    },
    [`repos/owner/repo/git/trees/${freshCommit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: fixtureBlobSha(skill), size: skill.length },
      ],
    },
  });
  const brokenBlobSha = fixtureBlobSha(brokenSkill);
  const broken = transcript({
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/broken/SKILL.md", mode: "100644", type: "blob", sha: brokenBlobSha, size: brokenSkill.length },
      ],
    },
    [`repos/owner/repo/git/blobs/${brokenBlobSha}`]: {
      sha: brokenBlobSha, encoding: "base64", content: brokenSkill.toString("base64"), size: brokenSkill.length,
    },
  });
  let brokenGlobalObservations = 0;
  let demoGlobalObservations = 0;
  const runner: GhRunner = async (args) => {
    if (!args.some((argument) => argument.startsWith("repos/broken/repo"))) {
      if (args.some((argument) => argument === "repos/owner/repo")) demoGlobalObservations += 1;
      return (demoGlobalObservations >= 2 ? fresh : good).runner(args);
    }
    if (args.some((argument) => argument === "repos/broken/repo")) brokenGlobalObservations += 1;
    if (brokenGlobalObservations >= 2) return { exitCode: 1, stdout: "", stderr: "offline on refresh" };
    return broken.runner(args.map((argument) => argument.replace("repos/broken/repo", "repos/owner/repo")));
  };
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  const beforeLock = readFileSync(join(root, ".agents", "skills", "skills.lock.json"), "utf8");

  const result = await runSkillCommand("skills:update", ["--apply", "--json"], { repositoryRoot: root, ghRunner: runner });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report.cohorts.map(({ key, status }) => ({ key, status })), [
    { key: "broken/repo|branch:main", status: "failed" },
    { key: "owner/repo|branch:main", status: "update-available" },
  ]);
  const successful = result.report.cohorts[1];
  assert.equal(successful?.resolvedCommit, freshCommit);
  assert.equal(successful?.diff, undefined);
  assert.equal(successful?.expectedBeforeLockDigest, undefined);
  assert.equal(successful?.candidateAfterLockDigest, undefined);
  assert.equal(successful?.candidateAfterLock, undefined);
  assert.equal(readFileSync(join(root, ".agents", "skills", "skills.lock.json"), "utf8"), beforeLock);
});
