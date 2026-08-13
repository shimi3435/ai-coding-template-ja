import assert from "node:assert/strict";
import test from "node:test";
import {
  addRemoteLegalFiles,
  canonicalizeTree,
  decodeLockJson,
  decodeSourcesJson,
  parseSkillMetadata,
  selectHighestSemverTag,
  serializeLock,
  serializeSources,
  sha256,
  validateLocalLegalFiles,
  validateSemverRange,
  validateSkillLimits,
  validateCanonicalPath,
} from "./skill-updater/index.ts";

test("canonical tree hash uses the versioned u64-BE frame", () => {
  const tree = canonicalizeTree([
    { path: "SKILL.md", executable: false, content: Buffer.from("hello\n") },
  ]);

  assert.deepEqual(tree, {
    treeHash: "2249753da97bb374ff499d8e4bf4a7d00db5b3558d4e24584426dcc7d0e7003b",
    fileCount: 1,
    byteCount: 6,
    files: [
      { path: "SKILL.md", executable: false, content: Buffer.from("hello\n") },
    ],
  });
});

test("canonical tree ordering is input-order independent", () => {
  const first = { path: "a.txt", executable: false, content: Buffer.from("a") };
  const second = { path: "b.txt", executable: true, content: Buffer.from("b") };

  assert.equal(
    canonicalizeTree([second, first]).treeHash,
    canonicalizeTree([first, second]).treeHash,
  );
});

for (const path of ["", "/root", "a//b", "a/./b", "a/../b", "a\\b", "e\u0301.txt"] ) {
  test(`canonical path rejects ${JSON.stringify(path)}`, () => {
    assert.throws(() => validateCanonicalPath(path));
  });
}

test("canonical tree rejects ASCII case-fold path collisions", () => {
  assert.throws(() =>
    canonicalizeTree([
      { path: "A.txt", executable: false, content: Buffer.from("a") },
      { path: "a.txt", executable: false, content: Buffer.from("a") },
    ]),
  );
});

test("canonical tree rejects an empty installed tree", () => {
  assert.throws(() => canonicalizeTree([]));
});

test("tree hash remains deterministic across a fixed permutation matrix", () => {
  const files = [
    { path: "SKILL.md", executable: false, content: Buffer.from("skill") },
    { path: "scripts/run.sh", executable: true, content: Buffer.from("#!/bin/sh\n") },
    { path: "資料/説明.txt", executable: false, content: Buffer.from("説明") },
  ];
  const expected = canonicalizeTree(files).treeHash;
  for (const permutation of [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ]) {
    assert.equal(canonicalizeTree(permutation.map((index) => files[index]!)).treeHash, expected);
  }
});

const remoteSource = {
  name: "zeta",
  ownership: "remote" as const,
  license: "MIT",
  redistribution: "allowed" as const,
  target: ".agents/skills/zeta",
  repository: "Owner/Repository",
  ref: { branch: "main" },
  subtree: { path: "skills/zeta" },
  legalMappings: [
    {
      sourcePath: "LICENSE",
      targetPath: "LICENSE",
      expectedSha256: "a".repeat(64),
    },
  ],
};

test("sources decoder normalizes repository identity and preserves reviewed policy", () => {
  const decoded = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [remoteSource] }));

  assert.equal(decoded.skills[0]?.ownership, "remote");
  assert.equal(decoded.skills[0]?.repository, "owner/repository");
  assert.equal(decoded.skills[0]?.license, "MIT");
  assert.equal(decoded.skills[0]?.redistribution, "allowed");
});

test("[H2] source declaration rejects invalid repository and unknown fields", () => {
  assert.throws(() => decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{ ...remoteSource, repository: "https://github.com/owner/repository", unexpected: true }],
  })), /fields|repository/);
});

test("sources decoder accepts strict root and path subtree selectors", () => {
  const root = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{ ...remoteSource, subtree: { root: true } }],
  }));
  const path = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [remoteSource] }));

  assert.deepEqual(root.skills[0]?.ownership === "remote" ? root.skills[0].subtree : undefined, { root: true });
  assert.deepEqual(path.skills[0]?.ownership === "remote" ? path.skills[0].subtree : undefined, { path: "skills/zeta" });
});

for (const subtree of [
  "skills/zeta",
  {},
  { root: false },
  { root: true, path: "skills/zeta" },
  { root: true, extra: true },
  { path: "" },
  { path: "." },
]) {
  test(`sources decoder rejects invalid subtree selector ${JSON.stringify(subtree)}`, () => {
    assert.throws(() => decodeSourcesJson(JSON.stringify({
      schemaVersion: 1,
      skills: [{ ...remoteSource, subtree }],
    })));
  });
}

for (const mutate of [
  (entry: Record<string, unknown>) => Object.assign(entry, { extra: true }),
  (entry: Record<string, unknown>) => Object.assign(entry, { redistribution: "blocked" }),
  (entry: Record<string, unknown>) => Object.assign(entry, { ref: {} }),
]) {
  test("sources decoder rejects unknown or inconsistent remote fields", () => {
    const entry = structuredClone(remoteSource) as unknown as Record<string, unknown>;
    mutate(entry);
    assert.throws(() => decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [entry] })));
  });
}

test("sources decoder accepts local and targetless plugin ownership variants", () => {
  const decoded = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [
      {
        name: "local-skill",
        ownership: "local",
        license: "MIT",
        redistribution: "allowed",
        target: ".agents/skills/local-skill",
        legalMappings: [{ sourcePath: "LICENSE", expectedSha256: "b".repeat(64) }],
      },
      {
        name: "plugin-skill",
        ownership: "plugin",
        license: "Proprietary",
        redistribution: "blocked",
        manager: "plugin-manager",
      },
    ],
  }));

  assert.deepEqual(decoded.skills.map((entry) => entry.ownership), ["local", "plugin"]);
});

test("sources serializer constructs schema-order canonical JSON and UTF-8 entry order", () => {
  const decoded = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [
      remoteSource,
      {
        name: "alpha",
        ownership: "plugin",
        license: "Proprietary",
        redistribution: "blocked",
        manager: "catalog",
      },
    ],
  }));

  assert.equal(serializeSources(decoded), `${JSON.stringify({
    schemaVersion: 1,
    skills: [
      {
        name: "alpha",
        ownership: "plugin",
        license: "Proprietary",
        redistribution: "blocked",
        manager: "catalog",
      },
      {
        name: "zeta",
        ownership: "remote",
        license: "MIT",
        redistribution: "allowed",
        target: ".agents/skills/zeta",
        repository: "owner/repository",
        ref: { branch: "main" },
        subtree: { path: "skills/zeta" },
        legalMappings: [{
          sourcePath: "LICENSE",
          targetPath: "LICENSE",
          expectedSha256: "a".repeat(64),
        }],
      },
    ],
  }, null, 2)}\n`);
});

test("remote legal entries serialize by targetPath before sourcePath", () => {
  const mappings = [
    { sourcePath: "z-source", targetPath: "a-target", expectedSha256: "a".repeat(64) },
    { sourcePath: "a-source", targetPath: "z-target", expectedSha256: "b".repeat(64) },
  ];
  const sources = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{ ...remoteSource, legalMappings: mappings }],
  }));
  const lock = decodeLockJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{
      name: "zeta", ownership: "remote", license: "MIT", redistribution: "allowed",
      target: ".agents/skills/zeta", repository: "owner/repository", ref: { branch: "main" },
      resolvedCommit: "c".repeat(40), verification: "verified",
      treeHash: "d".repeat(64), fileCount: 2, byteCount: 2,
      legalFiles: mappings.map(({ sourcePath, targetPath }, index) => ({
        sourcePath,
        targetPath,
        sha256: index === 0 ? "a".repeat(64) : "b".repeat(64),
      })),
    }],
  }));

  const serializedSources = JSON.parse(serializeSources(sources)) as { skills: [{ legalMappings: typeof mappings }] };
  const serializedLock = JSON.parse(serializeLock(lock)) as { skills: [{ legalFiles: typeof mappings }] };
  assert.deepEqual(serializedSources.skills[0].legalMappings.map((item) => item.targetPath), ["a-target", "z-target"]);
  assert.deepEqual(serializedLock.skills[0].legalFiles.map((item) => item.targetPath), ["a-target", "z-target"]);
});

test("lock decoder rejects sources/lock legal policy drift", () => {
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [remoteSource] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "zeta",
    ownership: "remote",
    license: "Apache-2.0",
    redistribution: "allowed",
    target: ".agents/skills/zeta",
    repository: "owner/repository",
    ref: { branch: "main" },
    resolvedCommit: "c".repeat(40),
    verification: "verified",
    treeHash: "d".repeat(64),
    fileCount: 1,
    byteCount: 1,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: "a".repeat(64) }],
  }] }));

  assert.throws(() => decodeLockJson(JSON.stringify(lock), sources));
});

test("SKILL metadata parser accepts one mapping document and rejects duplicates", () => {
  assert.deepEqual(
    parseSkillMetadata("---\nname: zeta\ndescription: A useful skill\nextra: kept-local\n---\nbody\n", "zeta"),
    { name: "zeta", description: "A useful skill" },
  );
  assert.throws(() =>
    parseSkillMetadata("---\nname: zeta\nname: other\ndescription: x\n---\n", "zeta"),
  );
});

test("[H2] SKILL metadata parser rejects invalid UTF-8 without replacement", () => {
  const markdown = Buffer.concat([
    Buffer.from("---\nname: zeta\ndescription: "),
    Buffer.from([0xc3, 0x28]),
    Buffer.from("\n---\n"),
  ]);

  assert.throws(() => parseSkillMetadata(markdown, "zeta"), /UTF-8/);
});

test("remote legal mapping validates hash and deduplicates identical target bytes", () => {
  const content = Buffer.from("license\n");
  const result = addRemoteLegalFiles(
    [{ path: "LICENSE", executable: true, content }],
    [{ sourcePath: "LEGAL", targetPath: "LICENSE", expectedSha256: sha256(content), content }],
  );

  assert.equal(result.tree.fileCount, 1);
  assert.equal(result.tree.files[0]?.executable, true);
  assert.deepEqual(result.legalFiles, [{ sourcePath: "LEGAL", targetPath: "LICENSE", sha256: sha256(content) }]);

  assert.throws(() => addRemoteLegalFiles(
    [{ path: "LICENSE", executable: false, content: Buffer.from("different") }],
    [{ sourcePath: "LEGAL", targetPath: "LICENSE", expectedSha256: sha256(content), content }],
  ));
});

test("local legal mapping validates tracked regular repository files without copying them", () => {
  const content = Buffer.from("root license\n");
  assert.deepEqual(validateLocalLegalFiles([
    {
      sourcePath: "LICENSE",
      expectedSha256: sha256(content),
      content,
      tracked: true,
      regular: true,
    },
  ]), [{ sourcePath: "LICENSE", sha256: sha256(content) }]);

  assert.throws(() => validateLocalLegalFiles([
    {
      sourcePath: "LICENSE",
      expectedSha256: sha256(content),
      content,
      tracked: false,
      regular: true,
    },
  ]));
});

test("resource limits accept exact boundary and reject one byte over", () => {
  validateSkillLimits([{ path: "large", executable: false, content: Buffer.alloc(10 * 1_048_576) }]);
  assert.throws(() =>
    validateSkillLimits([{ path: "large", executable: false, content: Buffer.alloc(10 * 1_048_576 + 1) }]),
  );
});

test("SemVer adapter uses npm range and prerelease behavior", () => {
  assert.equal(validateSemverRange("^1.0.0"), "^1.0.0");
  assert.throws(() => validateSemverRange("not a range"));
  assert.deepEqual(
    selectHighestSemverTag("^1.0.0", [
      { tag: "v1.3.0-beta.1", commit: "a".repeat(40) },
      { tag: "v1.2.0", commit: "b".repeat(40) },
    ]),
    { tag: "v1.2.0", version: "1.2.0", commit: "b".repeat(40) },
  );
  assert.deepEqual(
    selectHighestSemverTag("^1.0.0", [
      ...Array.from({ length: 500 }, (_, index) => ({ tag: `invalid-${index}`, commit: "a".repeat(40) })),
      { tag: "v1.2.0", commit: "b".repeat(40) },
    ]),
    { tag: "v1.2.0", version: "1.2.0", commit: "b".repeat(40) },
  );
});
