#!/usr/bin/env node
import { detectAndValidateRuntimes } from "./runtime.ts";
import { validateRepositoryContracts } from "./repository-contracts.ts";
import type { SkillCommandName } from "./skill-updater/index.ts";

function usage(): never {
  console.error("usage: node repo-tools/entrypoint.mjs <runtime-preflight|check-contracts|skills:links|skills:verify|skills:check|skills:update|skills:lock-local>");
  process.exit(2);
}

const command = process.argv[2];

try {
  if (command === "runtime-preflight") {
    const versions = detectAndValidateRuntimes();
    console.log(`[OK] Node.js ${versions.node}`);
    console.log(`[OK] npm ${versions.npm}`);
    console.log(`[OK] Python ${versions.python}`);
  } else if (command === "check-contracts") {
    for (const contract of validateRepositoryContracts()) {
      console.log(`[OK] ${contract}`);
    }
  } else if (
    command === "skills:links" ||
    command === "skills:verify" ||
    command === "skills:check" ||
    command === "skills:update" ||
    command === "skills:lock-local"
  ) {
    const { runSkillCommand } = await import("./skill-updater/index.ts");
    const result = await runSkillCommand(command as SkillCommandName, process.argv.slice(3), {
      repositoryRoot: process.cwd(),
    });
    if (result.stdout.length > 0) process.stdout.write(result.stdout);
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  } else {
    usage();
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}
