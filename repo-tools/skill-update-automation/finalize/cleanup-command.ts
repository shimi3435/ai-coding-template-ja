import { fileURLToPath } from "node:url";

import { ProductionPublishAdapter } from "../publish/production-adapter.ts";
import { cleanupMergedBranches } from "./recovery.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function defaultBranchRef(value: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new Error("DEFAULT_BRANCH is invalid");
  }
  return `refs/heads/${value}`;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  requiredEnvironment("GH_TOKEN");
  const repository = requiredEnvironment("REPOSITORY");
  const result = await cleanupMergedBranches({
    adapter: new ProductionPublishAdapter({ repository, repositoryRoot: process.cwd() }),
    repositoryId: requiredEnvironment("REPOSITORY_ID"),
    repository,
    defaultBranchRef: defaultBranchRef(requiredEnvironment("DEFAULT_BRANCH")),
  });
  process.stdout.write(`cleanup-status=${result.kind === "complete" && result.failedRefs.length === 0 ? "passed" : "failed"}\n`);
  process.stdout.write(`cleanup-failed-refs=${JSON.stringify(result.failedRefs)}\n`);
}
