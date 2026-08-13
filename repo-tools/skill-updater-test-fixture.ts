import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  decodeLockJson,
  decodeSourcesJson,
  readInstalledTree,
  serializeLock,
  serializeSources,
  sha256,
} from "./skill-updater/index.ts";
import { createSkillUpdaterTestRoot } from "./skill-updater-test-temp.ts";

export function repositoryDigest(root: string): string {
  const hash = createHash("sha256");
  const walk = (directory: string, relative = ""): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (relative.length === 0 && entry.name === ".git") continue;
      const child = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), child);
      else {
        hash.update(child);
        hash.update(entry.isSymbolicLink()
          ? readlinkSync(join(directory, entry.name))
          : readFileSync(join(directory, entry.name)));
      }
    }
  };
  walk(root);
  return hash.digest("hex");
}

export function writeSkillRepository(staleLock = false): string {
  const root = createSkillUpdaterTestRoot("skill-command-");
  const target = join(root, ".agents", "skills", "local-skill");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), "---\nname: local-skill\ndescription: Local skill\n---\nbody\n");
  writeFileSync(join(root, "LICENSE"), "MIT license\n");
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["add", "LICENSE"], { cwd: root });
  const legalHash = sha256(Buffer.from("MIT license\n"));
  const sources = decodeSourcesJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{
      name: "local-skill", ownership: "local", license: "MIT", redistribution: "allowed",
      target: ".agents/skills/local-skill",
      legalMappings: [{ sourcePath: "LICENSE", expectedSha256: legalHash }],
    }],
  }));
  const tree = readInstalledTree(root, ".agents/skills/local-skill", "local-skill");
  const lock = decodeLockJson(JSON.stringify({
    schemaVersion: 1,
    skills: [{
      name: "local-skill", ownership: "local", license: "MIT", redistribution: "allowed",
      target: ".agents/skills/local-skill",
      treeHash: staleLock ? "f".repeat(64) : tree.treeHash,
      fileCount: tree.fileCount,
      byteCount: tree.byteCount,
      legalFiles: [{ sourcePath: "LICENSE", sha256: legalHash }],
    }],
  }), sources);
  writeFileSync(join(root, ".agents", "skills", "skills.sources.json"), serializeSources(sources));
  writeFileSync(join(root, ".agents", "skills", "skills.lock.json"), serializeLock(lock));
  for (const linkRoot of [".claude/skills", ".codex/skills"]) {
    mkdirSync(join(root, ...linkRoot.split("/")), { recursive: true });
    symlinkSync("../../.agents/skills/local-skill", join(root, ...linkRoot.split("/"), "local-skill"));
  }
  return root;
}

export function installLinksScript(repository: string): void {
  mkdirSync(join(repository, "scripts"), { recursive: true });
  copyFileSync(new URL("../scripts/setup-skills.sh", import.meta.url), join(repository, "scripts", "setup-skills.sh"));
}
