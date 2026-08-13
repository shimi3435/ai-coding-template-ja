import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  canonicalizeTree,
  decodeLockJson,
  decodeSourcesJson,
  observeRemoteCohort,
  redactCredentialText,
  runSkillCommand,
  serializeLock,
  serializeSources,
  sha256,
  type GhRunner,
  type RemoteLock,
  type RemoteSource,
} from "./skill-updater/index.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";

const commit = "c".repeat(40);
const skill = Buffer.from("---\nname: demo\ndescription: Demo skill\n---\nbody\n");
const license = Buffer.from("MIT license\n");
const skillBlobSha = "7053d4638f465fcadc0fb02c4925df29504d747c";
const licenseBlobSha = "95192c45537a8d6334b2efb0b443266fa1f1337a";

function fixtureBlobSha(content: Buffer): string {
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

function opaqueSha(label: string): string {
  return createHash("sha1").update(label).digest("hex");
}

function source(ref: RemoteSource["ref"] = { branch: "main" }): RemoteSource {
  return {
    name: "demo",
    ownership: "remote",
    license: "MIT",
    redistribution: "allowed",
    target: ".agents/skills/demo",
    repository: "owner/repo",
    ref,
    subtree: { path: "skills/demo" },
    legalMappings: [{
      sourcePath: "LICENSE",
      targetPath: "LICENSE",
      expectedSha256: sha256(license),
    }],
  };
}

function json(value: unknown): { exitCode: number; stdout: string; stderr: string } {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: "" };
}

function transcript(overrides: Record<string, unknown> = {}): {
  runner: GhRunner;
  calls: string[];
} {
  const responses: Record<string, unknown> = {
    "repos/owner/repo": { visibility: "public", private: false },
    "repos/owner/repo/git/ref/heads/main": { object: { type: "commit", sha: commit } },
    [`repos/owner/repo/commits/${commit}`]: {
      sha: commit,
      commit: { verification: { verified: true, reason: "valid" } },
    },
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: skillBlobSha, size: skill.length },
      ],
    },
    [`repos/owner/repo/git/blobs/${skillBlobSha}`]: {
      sha: skillBlobSha,
      encoding: "base64",
      content: skill.toString("base64"),
      size: skill.length,
    },
    [`repos/owner/repo/git/blobs/${licenseBlobSha}`]: {
      sha: licenseBlobSha,
      encoding: "base64",
      content: license.toString("base64"),
      size: license.length,
    },
    ...overrides,
  };
  const calls: string[] = [];
  const runner: GhRunner = async (args) => {
    const endpoint = args.find((argument) => argument.startsWith("repos/"));
    assert.ok(endpoint, `endpoint missing: ${args.join(" ")}`);
    calls.push(endpoint);
    const response = responses[endpoint];
    if (response === undefined) throw new Error(`unexpected endpoint: ${endpoint}`);
    if (typeof response === "object" && response !== null && "exitCode" in response) {
      return response as { exitCode: number; stdout: string; stderr: string };
    }
    return json(response);
  };
  return { runner, calls };
}

test("GitHub observation resolves one immutable public cohort without executing fetched files", async () => {
  const fake = transcript();
  const observation = await observeRemoteCohort([source()], [], fake.runner);

  assert.equal(observation.repository, "owner/repo");
  assert.equal(observation.resolvedCommit, commit);
  assert.equal(observation.verification, "verified");
  assert.equal(observation.entries[0]?.name, "demo");
  assert.equal(observation.entries[0]?.tree.fileCount, 2);
  assert.deepEqual(observation.entries[0]?.metadata, { name: "demo", description: "Demo skill" });
  assert.equal(fake.calls.filter((call) => call.includes("git/ref/heads/main")).length, 1);
});

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
  const runner: GhRunner = async (args) => {
    if (!args.some((argument) => argument.startsWith("repos/broken/repo"))) return good.runner(args);
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
  assert.equal(readFileSync(join(root, ".agents", "skills", "skills.lock.json"), "utf8"), beforeLock);
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
    fileCount: 1, byteCount: 1,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  };

  await assert.rejects(observeRemoteCohort([source()], [lock], fake.runner), /history rewrite|fast-forward/);
});

test("SemVer observation requires complete pagination and rejects a moved locked tag", async () => {
  const moved = "d".repeat(40);
  const tagsEndpoint = "repos/owner/repo/tags?per_page=100";
  const fake = transcript({
    [tagsEndpoint]: [[{ name: "v1.2.0", commit: { sha: moved } }]],
  });
  const semverSource = source({ semver: "^1.0.0" });
  const lock: RemoteLock = {
    name: "demo", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/demo", repository: "owner/repo", ref: { semver: "^1.0.0" },
    resolvedCommit: commit, verification: "verified", selectedTag: "v1.2.0", selectedVersion: "1.2.0",
    treeHash: "d".repeat(64), fileCount: 1, byteCount: 1,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: sha256(license) }],
  };

  await assert.rejects(observeRemoteCohort([semverSource], [lock], fake.runner), /moved|移動|rewrite/);

  const partial = transcript({
    [tagsEndpoint]: { exitCode: 1, stdout: "[]", stderr: "rate limit after page 1" },
  });
  await assert.rejects(observeRemoteCohort([semverSource], [], partial.runner), /rate limit/);
});

test("SemVer observation exposes the deterministic selected tag and version", async () => {
  const tagsEndpoint = "repos/owner/repo/tags?per_page=100";
  const fake = transcript({
    [tagsEndpoint]: [[
      { name: "v1.1.0", commit: { sha: "a".repeat(40) } },
      { name: "v1.2.0", commit: { sha: commit } },
      { name: "v1.3.0-beta.1", commit: { sha: "b".repeat(40) } },
    ]],
  });

  const observation = await observeRemoteCohort([source({ semver: "^1.0.0" })], [], fake.runner);
  assert.equal(observation.selectedTag, "v1.2.0");
  assert.equal(observation.selectedVersion, "1.2.0");
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
    resolvedCommit: previous, verification: "unknown", treeHash: "d".repeat(64), fileCount: 1, byteCount: 1,
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
