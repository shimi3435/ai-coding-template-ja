import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  decodeLockJson,
  decodeSourcesJson,
  readInstalledTree,
  serializeLock,
  serializeSources,
  sha256,
} from "./skill-updater/index.ts";
import {
  installLinksScript,
  repositoryDigest,
  writeSkillRepository,
} from "./skill-updater-test-fixture.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";

const entrypoint = new URL("./entrypoint.mjs", import.meta.url);

test("[H1] skills:verify handles a declaration with no remote entries", () => {
  const repository = writeSkillRepository();
  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    command: "skills:verify",
    status: "up-to-date",
    cohorts: [],
    warnings: [],
    errors: [],
    exitCode: 0,
  });

  const remoteCheck = spawnSync(process.execPath, [entrypoint.pathname, "skills:check", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(remoteCheck.status, 0, remoteCheck.stderr);
  assert.equal(JSON.parse(remoteCheck.stdout).status, "up-to-date");
});

test("skills:lock-local dry-run reports candidate without filesystem writes", () => {
  const repository = writeSkillRepository(true);
  const before = repositoryDigest(repository);
  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:lock-local", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });
  const after = repositoryDigest(repository);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "update-available");
  assert.equal(after, before);
});

test("skill command rejects unknown options with exit 1 and no write", () => {
  const repository = writeSkillRepository();
  const before = repositoryDigest(repository);
  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--unknown"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown or conflicting options/);
  assert.equal(repositoryDigest(repository), before);
});

test("[H8] skill command rejects missing metadata prerequisite with no write", () => {
  const repository = createSkillUpdaterTestRoot("skill-missing-metadata-");
  const before = repositoryDigest(repository);
  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /ENOENT|skills\.sources\.json/);
  assert.equal(repositoryDigest(repository), before);
});

test("[H8] skill command rejects missing lock prerequisite with no write", () => {
  const repository = writeSkillRepository();
  const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
  const renamedLock = `${lockPath}.missing`;
  renameSync(lockPath, renamedLock);
  const before = repositoryDigest(repository);
  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /ENOENT|skills\.lock\.json/);
  assert.equal(repositoryDigest(repository), before);
});

test("[H8] skill command rejects unparseable lock prerequisite with no write", () => {
  const repository = writeSkillRepository();
  const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
  writeFileSync(lockPath, "{broken");
  const before = repositoryDigest(repository);
  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /JSON/);
  assert.equal(repositoryDigest(repository), before);
});

test("skills:verify rejects remote reviewed legal hash drift", () => {
  const repository = writeSkillRepository();
  writeFileSync(join(repository, ".agents", "skills", "local-skill", "LICENSE"), "MIT license\n");
  const tree = readInstalledTree(repository, ".agents/skills/local-skill", "local-skill");
  const actualLegalHash = sha256(Buffer.from("MIT license\n"));
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "local-skill", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/local-skill", repository: "owner/repo", ref: { branch: "main" },
    subtree: { path: "skills/local-skill" },
    legalMappings: [{ sourcePath: "LICENSE", targetPath: "LICENSE", expectedSha256: "f".repeat(64) }],
  }] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "local-skill", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/local-skill", repository: "owner/repo", ref: { branch: "main" },
    resolvedCommit: "a".repeat(40), verification: "unknown",
    treeHash: tree.treeHash, fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: actualLegalHash }],
  }] }), sources);
  writeFileSync(join(repository, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(repository, ".agents", "skills", "skills.lock.json"), serializeLock(lock));

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /reviewed legal|legal.*不一致/);
});

test("skills:verify rejects an orphan generated lock entry", () => {
  const repository = writeSkillRepository();
  const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { skills: unknown[] };
  lock.skills.push({
    name: "orphan", ownership: "plugin", license: "Proprietary",
    redistribution: "blocked", manager: "plugin-manager",
  });
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /lockだけ|orphan/);
});

test("skills:lock-local rejects an orphan generated lock before planning", () => {
  const repository = writeSkillRepository();
  const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { skills: unknown[] };
  lock.skills.push({
    name: "orphan", ownership: "plugin", license: "Proprietary",
    redistribution: "blocked", manager: "plugin-manager",
  });
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const before = repositoryDigest(repository);

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:lock-local", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /lockだけ|orphan/);
  assert.equal(repositoryDigest(repository), before);
});

test("skills:update rejects an orphan generated lock before remote planning", () => {
  const repository = writeSkillRepository();
  const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { skills: unknown[] };
  lock.skills.push({
    name: "orphan", ownership: "plugin", license: "Proprietary",
    redistribution: "blocked", manager: "plugin-manager",
  });
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const before = repositoryDigest(repository);

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:update", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /lockだけ|orphan/);
  assert.equal(repositoryDigest(repository), before);
});

for (const command of ["skills:check", "skills:links"] as const) {
  test(`${command} rejects an orphan generated lock at the common structural boundary`, () => {
    const repository = writeSkillRepository();
    const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { skills: unknown[] };
    lock.skills.push({
      name: "orphan", ownership: "plugin", license: "Proprietary",
      redistribution: "blocked", manager: "plugin-manager",
    });
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const before = repositoryDigest(repository);

    const result = spawnSync(process.execPath, [entrypoint.pathname, command, "--json"], {
      cwd: repository,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /lockだけ|orphan/);
    assert.equal(repositoryDigest(repository), before);
  });
}

for (const mismatch of ["ownership", "target"] as const) {
  test(`skills:verify rejects a structural ${mismatch} mismatch without writes`, () => {
    const repository = writeSkillRepository();
    const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { skills: Array<Record<string, unknown>> };
    if (mismatch === "ownership") {
      lock.skills[0] = {
        name: "local-skill", ownership: "plugin", license: "MIT",
        redistribution: "allowed", manager: "plugin-manager",
      };
    } else {
      lock.skills[0]!.target = ".agents/skills/different";
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const before = repositoryDigest(repository);

    const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
      cwd: repository,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, new RegExp(mismatch));
    assert.equal(repositoryDigest(repository), before);
  });
}

test("skills:verify rejects a plugin manager mismatch without writes", () => {
  const repository = createSkillUpdaterTestRoot("skill-plugin-manager-");
  mkdirSync(join(repository, ".agents", "skills"), { recursive: true });
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "managed-skill", ownership: "plugin", license: "Proprietary",
    redistribution: "blocked", manager: "reviewed-manager",
  }] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "managed-skill", ownership: "plugin", license: "Proprietary",
    redistribution: "blocked", manager: "different-manager",
  }] }));
  writeFileSync(join(repository, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(repository, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  const before = repositoryDigest(repository);

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /manager/);
  assert.equal(repositoryDigest(repository), before);
});

test("skills:links validates metadata before changing symlinks", () => {
  const repository = writeSkillRepository();
  installLinksScript(repository);
  const link = join(repository, ".claude", "skills", "local-skill");
  unlinkSync(link);
  symlinkSync("missing-target", link);
  const lockPath = join(repository, ".agents", "skills", "skills.lock.json");
  const invalidLock = JSON.parse(readFileSync(lockPath, "utf8")) as Record<string, unknown>;
  invalidLock.unexpected = true;
  writeFileSync(lockPath, `${JSON.stringify(invalidLock, null, 2)}\n`);
  const before = repositoryDigest(repository);

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:links", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /unknown/);
  assert.equal(readlinkSync(link), "missing-target");
  assert.equal(repositoryDigest(repository), before);
});

test("skills:links rejects an undeclared vendored directory without writes", () => {
  const repository = writeSkillRepository();
  installLinksScript(repository);
  const undeclared = join(repository, ".agents", "skills", "undeclared");
  mkdirSync(undeclared);
  writeFileSync(join(undeclared, "SKILL.md"), "---\nname: undeclared\ndescription: Undeclared\n---\n");
  const before = repositoryDigest(repository);

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:links", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /undeclared|未宣言|暗黙source/);
  assert.equal(repositoryDigest(repository), before);
  assert.equal(readlinkSync(join(repository, ".claude", "skills", "local-skill")), "../../.agents/skills/local-skill");
});

test("skills:links treats a valid plugin-only declaration as an unchanged no-op", () => {
  const repository = createSkillUpdaterTestRoot("skill-plugin-links-");
  mkdirSync(join(repository, ".agents", "skills"), { recursive: true });
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "managed-skill", ownership: "plugin", license: "Proprietary",
    redistribution: "blocked", manager: "plugin-manager",
  }] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "managed-skill", ownership: "plugin", license: "Proprietary",
    redistribution: "blocked", manager: "plugin-manager",
  }] }), sources);
  writeFileSync(join(repository, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(repository, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  const before = repositoryDigest(repository);

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:links", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "unchanged");
  assert.equal(repositoryDigest(repository), before);
});

test("skills:verify rejects remote provenance drift before update planning", () => {
  const repository = writeSkillRepository();
  writeFileSync(join(repository, ".agents", "skills", "local-skill", "LICENSE"), "MIT license\n");
  const tree = readInstalledTree(repository, ".agents/skills/local-skill", "local-skill");
  const legalHash = sha256(Buffer.from("MIT license\n"));
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "local-skill", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/local-skill", repository: "owner/new", ref: { branch: "main" },
    subtree: { path: "skills/local-skill" },
    legalMappings: [{ sourcePath: "LICENSE", targetPath: "LICENSE", expectedSha256: legalHash }],
  }] }));
  const lock = decodeLockJson(JSON.stringify({ schemaVersion: 1, skills: [{
    name: "local-skill", ownership: "remote", license: "MIT", redistribution: "allowed",
    target: ".agents/skills/local-skill", repository: "owner/old", ref: { branch: "main" },
    resolvedCommit: "a".repeat(40), verification: "unknown", treeHash: tree.treeHash,
    fileCount: tree.fileCount, byteCount: tree.byteCount,
    legalFiles: [{ sourcePath: "LICENSE", targetPath: "LICENSE", sha256: legalHash }],
  }] }));
  writeFileSync(join(repository, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(repository, ".agents", "skills", "skills.lock.json"), serializeLock(lock));

  const result = spawnSync(process.execPath, [entrypoint.pathname, "skills:verify", "--json"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /provenance.*不一致/);
});
