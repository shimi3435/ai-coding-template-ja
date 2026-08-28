#!/usr/bin/env node
import { execFileSync } from "node:child_process";

import { detectAndValidateRuntimes } from "./runtime.ts";
import { validateRepositoryContracts } from "./repository-contracts.ts";
import type { SkillCommandName } from "./skill-updater/index.ts";

function usage(): never {
  console.error("usage: node repo-tools/entrypoint.mjs <runtime-preflight|check-contracts|skills:links|skills:verify|skills:check|skills:update|skills:lock-local|skills:automation:candidate|skills:automation:smoke>");
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
  } else if (command === "skills:automation:candidate") {
    const { runCandidateCommand } = await import("./skill-update-automation/candidate/index.ts");
    const result = await runCandidateCommand(process.argv.slice(3), { repositoryRoot: process.cwd() });
    if (result.stdout.length > 0) process.stdout.write(result.stdout);
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  } else if (command === "skills:automation:smoke") {
    for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) {
      if ((process.env[name] ?? "") !== "") throw new Error(`${name} must be unset for human-operated smoke`);
    }
    const { runFreshSmokeCli } = await import("./skill-update-automation/smoke/fresh-cli.ts");
    const { ProductionPublishAdapter } = await import("./skill-update-automation/publish/production-adapter.ts");
    const { ProductionSmokeHost } = await import("./skill-update-automation/smoke/production-host.ts");
    const result = await runFreshSmokeCli(process.argv.slice(3), {
      createAdapter: (repository) => new ProductionPublishAdapter({ repository, repositoryRoot: process.cwd() }),
      createIdentityHost: (repository) => new ProductionSmokeHost({ repository }),
      readCreatorUserId: async () => execFileSync("gh", [
        "api", "/user", "--jq", ".id",
      ], { encoding: "utf8" }).trim(),
      input: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      now: () => new Date(),
    });
    process.exitCode = result.exitCode;
  } else {
    usage();
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}
