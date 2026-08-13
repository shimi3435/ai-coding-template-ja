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
  assert.equal(fake.calls.filter((call) => call.includes("git/ref/heads/main")).length, 1);
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
