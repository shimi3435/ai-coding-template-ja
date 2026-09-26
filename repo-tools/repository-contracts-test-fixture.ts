import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "node:test";

export const cli = new URL("./cli.ts", import.meta.url);
const temporaryRepositories = new Set<string>();

export function temporaryRepository(prefix: string): string {
  const repository = mkdtempSync(join(tmpdir(), prefix));
  temporaryRepositories.add(repository);
  return repository;
}
afterEach(() => {
  for (const repository of temporaryRepositories) rmSync(repository, { recursive: true, force: true });
  temporaryRepositories.clear();
});

export function writeValidRepository(): string {
  const repository = temporaryRepository("repo-contracts-");
  mkdirSync(join(repository, ".github", "workflows"), { recursive: true });
  mkdirSync(join(repository, "scripts"));
  mkdirSync(join(repository, "repo-tools"));
  mkdirSync(join(repository, "docs", "template"), { recursive: true });
  writeFileSync(
    join(repository, "package.json"),
    JSON.stringify({
      private: true,
      scripts: { check: "node repo-tools/cli.ts check-contracts" },
      devDependencies: { typescript: "7.0.2" },
    }),
    "utf8",
  );
  writeFileSync(join(repository, "package-lock.json"), '{"lockfileVersion":3}', "utf8");
  writeFileSync(join(repository, "TEMPLATE_VERSION"), "1.0.0\n", "utf8");
  writeFileSync(join(repository, ".gitignore"), "/node_modules/\n", "utf8");
  writeFileSync(
    join(repository, "Taskfile.yml"),
    [
      'version: "3"',
      "tasks:",
      "  setup:node:",
      "    cmds:",
      "      - npm ci --ignore-scripts",
      "  audit:node:",
      "    cmds:",
      "      - npm audit --audit-level=high",
      "  skills:links:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:links",
      "  skills:verify:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:verify",
      "  skills:check:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:check",
      "  skills:update:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:update",
      "  skills:repin:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:repin",
      "  skills:adopt-local:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:adopt-local",
      "  skills:migrate:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:migrate",
      "  check:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:verify",
      "      - node --test repo-tools/*.test.ts",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(repository, ".github", "workflows", "ci.yml"), "name: CI\n", "utf8");
  writeFileSync(join(repository, "scripts", "bootstrap.sh"), "#!/bin/sh\n", "utf8");
  writeFileSync(join(repository, "repo-tools", "cli.ts"), "// fixture\n", "utf8");
  writeFileSync(
    join(repository, "docs", "template", "release.md"),
    "prepare-v2-release: Node.js 24 / Python >=3.14 / TEMPLATE_VERSION=2.0.0\n",
    "utf8",
  );
  return repository;
}
