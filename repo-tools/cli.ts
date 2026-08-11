#!/usr/bin/env node
import { detectAndValidateRuntimes } from "./runtime.ts";
import { validateRepositoryContracts } from "./repository-contracts.ts";

function usage(): never {
  console.error("usage: node repo-tools/entrypoint.mjs <runtime-preflight|check-contracts>");
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
  } else {
    usage();
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}
