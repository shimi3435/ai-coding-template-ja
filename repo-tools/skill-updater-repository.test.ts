import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  decodeSourcesJson,
  readInstalledTree,
  readLocalObservations,
  sha256,
} from "./skill-updater/index.ts";
import { writeSkillRepository } from "./skill-updater-test-fixture.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";
import { validateInstalledTraversalPath } from "./skill-updater/installed-path.ts";

test("installed path validator accepts exact byte limits and rejects limit plus one", () => {
  const exactSegment = "a".repeat(255);
  const longSegment = "a".repeat(256);
  const exactPath = Array.from({ length: 17 }, () => "a".repeat(240)).join("/");
  const longPath = `${exactPath}a`;

  assert.equal(Buffer.byteLength(exactPath, "utf8"), 4096);
  assert.equal(Buffer.byteLength(longPath, "utf8"), 4097);
  assert.doesNotThrow(() => validateInstalledTraversalPath(exactSegment));
  assert.throws(() => validateInstalledTraversalPath(longSegment), /255|segment/);
  assert.doesNotThrow(() => validateInstalledTraversalPath(exactPath));
  assert.throws(() => validateInstalledTraversalPath(longPath), /4096|path/);
});

test("readInstalledTree rejects more than 200 files", () => {
  const repository = writeSkillRepository();
  const target = join(repository, ".agents", "skills", "local-skill");
  for (let index = 0; index < 200; index += 1) {
    writeFileSync(join(target, `file-${String(index).padStart(3, "0")}.txt`), "x");
  }

  assert.throws(
    () => readInstalledTree(repository, ".agents/skills/local-skill", "local-skill"),
    /200|file数|上限/,
  );
});

test("readInstalledTree rejects a file larger than 10 MiB", () => {
  const repository = writeSkillRepository();
  const large = join(repository, ".agents", "skills", "local-skill", "large.bin");
  writeFileSync(large, "");
  truncateSync(large, 10 * 1_048_576 + 1);

  assert.throws(
    () => readInstalledTree(repository, ".agents/skills/local-skill", "local-skill"),
    /10485760|単一file|上限/,
  );
});

test("readInstalledTree rejects aggregate content larger than 20 MiB", () => {
  const repository = writeSkillRepository();
  const target = join(repository, ".agents", "skills", "local-skill");
  for (const [name, size] of [["a.bin", 10 * 1_048_576], ["b.bin", 10 * 1_048_576], ["c.bin", 1]] as const) {
    const file = join(target, name);
    writeFileSync(file, "");
    truncateSync(file, size);
  }

  assert.throws(
    () => readInstalledTree(repository, ".agents/skills/local-skill", "local-skill"),
    /20971520|skill bytes|上限/,
  );
});

test("readInstalledTree accepts 500 filesystem entries and rejects entry 501", () => {
  const repository = writeSkillRepository();
  const target = join(repository, ".agents", "skills", "local-skill");
  for (let index = 0; index < 499; index += 1) {
    mkdirSync(join(target, `empty-${String(index).padStart(3, "0")}`));
  }

  assert.equal(readInstalledTree(repository, ".agents/skills/local-skill", "local-skill").fileCount, 1);
  mkdirSync(join(target, "empty-499"));
  assert.throws(
    () => readInstalledTree(repository, ".agents/skills/local-skill", "local-skill"),
    /500|filesystem entry|上限/,
  );
});

test("readInstalledTree accepts directory depth 32 and rejects depth 33", () => {
  const repository = writeSkillRepository();
  const target = join(repository, ".agents", "skills", "local-skill");
  let current = target;
  for (let depth = 1; depth <= 32; depth += 1) {
    current = join(current, "d");
    mkdirSync(current);
  }

  assert.equal(readInstalledTree(repository, ".agents/skills/local-skill", "local-skill").fileCount, 1);
  mkdirSync(join(current, "d"));
  assert.throws(
    () => readInstalledTree(repository, ".agents/skills/local-skill", "local-skill"),
    /32|directory depth|上限/,
  );
});

test("local observations reuse one repository legal source across skills", () => {
  const repository = createSkillUpdaterTestRoot("skill-shared-legal-");
  const legal = Buffer.from("shared license\n");
  writeFileSync(join(repository, "LICENSE"), legal);
  for (const name of ["one", "two"]) {
    const target = join(repository, ".agents", "skills", name);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  }
  spawnSync("git", ["init", "-q"], { cwd: repository });
  spawnSync("git", ["add", "LICENSE"], { cwd: repository });
  const sources = decodeSourcesJson(JSON.stringify({ schemaVersion: 1, skills: ["one", "two"].map((name) => ({
    name, ownership: "local", license: "MIT", redistribution: "allowed",
    target: `.agents/skills/${name}`,
    legalMappings: [{ sourcePath: "LICENSE", expectedSha256: sha256(legal) }],
  })) }));

  const observations = readLocalObservations(repository, sources);

  assert.deepEqual(observations.map((entry) => entry.legalFiles), [
    [{ sourcePath: "LICENSE", sha256: sha256(legal) }],
    [{ sourcePath: "LICENSE", sha256: sha256(legal) }],
  ]);
});
