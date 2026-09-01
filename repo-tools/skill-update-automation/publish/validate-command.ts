import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCandidateArtifact } from "../candidate/index.ts";
import {
  decodeDraftReceipt,
  parsePositiveSafeInteger,
  parseSha,
  type ArtifactManifest,
  type ValidationState,
} from "../model/index.ts";
import { classifyValidationOutcome, type ValidationCommandObservation } from "./validation.ts";

export type ValidationCommandRunner = (command: string, args: readonly string[]) => number | null;

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function git(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function assertReceipt(
  manifest: Extract<ArtifactManifest, { kind: "candidate-update" }>,
  manifestBytes: Buffer,
  receiptFile: string,
  now: Date,
): void {
  const receipt = decodeDraftReceipt(readFileSync(receiptFile));
  if (
    receipt.repositoryId !== manifest.repositoryId || receipt.repository !== manifest.repository ||
    receipt.run.workflowRunId !== manifest.run.workflowRunId ||
    receipt.run.workflowRunAttempt !== manifest.run.workflowRunAttempt ||
    receipt.manifestDigest !== digest(manifestBytes) || receipt.candidateDigest !== manifest.candidateDigest ||
    receipt.generation !== manifest.target.generation || receipt.headRef !== manifest.target.headRef ||
    receipt.headSha !== manifest.candidateSha ||
    (manifest.target.mode === "update" && receipt.prNumber !== manifest.target.prNumber)
  ) throw new Error("DraftReceiptがcandidate manifestと一致しません");
  const age = now.getTime() - new Date(receipt.createdAt).getTime();
  if (age < 0 || age > 24 * 60 * 60 * 1000) throw new Error("DraftReceipt retentionが終了しています");
}

type ValidationManifest = Extract<ArtifactManifest, { kind: "candidate-update" | "existing-head-validation" }>;

function assertLocalCandidate(repositoryRoot: string, manifest: ValidationManifest): void {
  const headSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
  if (headSha !== manifest.candidateSha) throw new Error("checked out candidate SHAがmanifestと一致しません");
  if (git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]) !== manifest.candidateTreeSha) {
    throw new Error("checked out candidate treeがmanifestと一致しません");
  }
  if (manifest.kind === "candidate-update") {
    const commit = git(repositoryRoot, ["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ");
    if (commit.length !== 2 || commit[1] !== manifest.baseHeadSha) {
      throw new Error("checked out candidate parentがmanifestと一致しません");
    }
  }
}

function mergeInProgress(repositoryRoot: string): boolean {
  try {
    git(repositoryRoot, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function renderOutputs(result: ValidationState): string {
  if (result.status === "passed") return "validation-status=passed\n";
  if (result.status === "pending") throw new Error("validation resultがclosedではありません");
  if (result.failureKind === "command") {
    return `validation-status=failed\nfailure-kind=command\ncommand=${result.command}\n`;
  }
  return `validation-status=failed\nfailure-kind=infrastructure\nstage=${result.stage}\n`;
}

export function runIntegrationValidation(input: Readonly<{
  artifactDirectory: string;
  receiptFile: string;
  repositoryRoot: string;
  repositoryId: string;
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  triggerSha: string;
  candidateSha: string;
  now?: () => Date;
  runner?: ValidationCommandRunner;
  focusedTestFiles?: readonly string[];
}>): Readonly<{ result: ValidationState; outputs: string }> {
  const manifestBytes = readFileSync(join(input.artifactDirectory, "manifest.json"));
  const manifest = validateCandidateArtifact(input.artifactDirectory, {
    repositoryId: input.repositoryId,
    repository: input.repository,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt,
  });
  if (manifest.kind !== "candidate-update" && manifest.kind !== "existing-head-validation") {
    throw new Error("artifactはvalidation対象ではありません");
  }
  if (manifest.triggerSha !== parseSha(input.triggerSha) || manifest.candidateSha !== parseSha(input.candidateSha)) {
    throw new Error("validation contextがcandidate manifestと一致しません");
  }
  assertLocalCandidate(input.repositoryRoot, manifest);
  if (manifest.kind === "candidate-update") {
    assertReceipt(manifest, manifestBytes, input.receiptFile, (input.now ?? (() => new Date()))());
  }

  const focusedFiles = [...(input.focusedTestFiles ??
    globSync("repo-tools/skill-update-automation/**/*.test.ts", { cwd: input.repositoryRoot }))].sort();
  if (focusedFiles.length === 0) throw new Error("automation focused testsがありません");
  const commands = [
    {
      label: `git merge --no-commit --no-ff ${manifest.triggerSha}`,
      command: "git",
      args: ["merge", "--no-commit", "--no-ff", manifest.triggerSha],
    },
    { label: "uv run --no-sync task check", command: "uv", args: ["run", "--no-sync", "task", "check"] },
    {
      label: "node --test repo-tools/skill-update-automation/**/*.test.ts",
      command: "node",
      args: ["--test", ...focusedFiles],
    },
  ] as const;
  const runner = input.runner ?? ((command, args) => spawnSync(command, args, {
    cwd: input.repositoryRoot,
    stdio: "inherit",
    env: process.env,
  }).status);
  const observations: ValidationCommandObservation[] = [];
  try {
    for (const command of commands) {
      const exitCode = runner(command.command, command.args);
      observations.push({ command: command.label, exitCode });
      if (exitCode !== 0) break;
    }
  } finally {
    if (mergeInProgress(input.repositoryRoot)) {
      try {
        git(input.repositoryRoot, ["merge", "--abort"]);
      } catch {
        // A failed cleanup is surfaced by the caller's temporary-resource residue check.
      }
    }
  }
  const result = classifyValidationOutcome({
    run: { workflowRunId: input.workflowRunId, workflowRunAttempt: input.workflowRunAttempt },
    commands: observations,
  });
  return { result, outputs: renderOutputs(result) };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function canonicalAttempt(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("WORKFLOW_RUN_ATTEMPT must be canonical positive decimal");
  return parsePositiveSafeInteger(Number(value));
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const expectedArgs = [
    "--merge-command", `git merge --no-commit --no-ff ${requiredEnvironment("TRIGGER_SHA")}`,
    "--check-command", "uv run --no-sync task check",
    "--focused-command", "node --test repo-tools/skill-update-automation/**/*.test.ts",
  ];
  if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expectedArgs)) throw new Error("validation command allowlistが不正です");
  const value = runIntegrationValidation({
    artifactDirectory: requiredEnvironment("ARTIFACT_DIR"),
    receiptFile: process.env.RECEIPT_FILE ?? "",
    repositoryRoot: process.cwd(),
    repositoryId: requiredEnvironment("REPOSITORY_ID"),
    repository: requiredEnvironment("REPOSITORY"),
    workflowRunId: requiredEnvironment("WORKFLOW_RUN_ID"),
    workflowRunAttempt: canonicalAttempt(requiredEnvironment("WORKFLOW_RUN_ATTEMPT")),
    triggerSha: requiredEnvironment("TRIGGER_SHA"),
    candidateSha: requiredEnvironment("CANDIDATE_SHA"),
  });
  appendFileSync(requiredEnvironment("GITHUB_OUTPUT"), value.outputs, "utf8");
  if (value.result.status === "failed") process.exitCode = 1;
}
