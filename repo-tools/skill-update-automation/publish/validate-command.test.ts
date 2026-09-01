import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { encodeArtifactManifest } from "../model/index.ts";
import { runIntegrationValidation } from "./validate-command.ts";

const digest = (bytes: Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fixture(): Readonly<{ root: string; artifact: string; sha: string }> {
  const root = mkdtempSync(join(tmpdir(), "validate-command-test-"));
  git(root, "init", "--initial-branch=main");
  writeFileSync(join(root, "fixture.txt"), "candidate\n");
  git(root, "add", "fixture.txt");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "candidate");
  const sha = git(root, "rev-parse", "HEAD");
  const tree = git(root, "rev-parse", "HEAD^{tree}");
  const artifact = join(root, "artifact");
  mkdirSync(artifact);
  const preview = Buffer.from("{\"status\":\"existing-head-validation\"}");
  writeFileSync(join(artifact, "preview-report.json"), preview);
  writeFileSync(join(artifact, "manifest.json"), encodeArtifactManifest({
    schemaVersion: 1,
    kind: "existing-head-validation",
    repositoryId: "123",
    repository: "owner/repository",
    run: { workflowRunId: "456", workflowRunAttempt: 1 },
    triggerSha: sha,
    baseHeadSha: sha,
    candidateSha: sha,
    candidateTreeSha: tree,
    target: {
      mode: "validate",
      generation: 1,
      prNumber: 1,
      headRef: "refs/heads/automation/skill-updates/g000001",
      expectedBranch: { state: "present", sha },
      markerDigest: `sha256:${"1".repeat(64)}`,
      historyDigest: `sha256:${"2".repeat(64)}`,
    },
    candidateDigest: `sha256:${"3".repeat(64)}`,
    createdAt: "2026-08-20T00:00:00.000Z",
    files: [{ name: "preview-report.json", byteLength: preview.length, digest: digest(preview) }],
  }));
  return { root, artifact, sha };
}

test("exact existing head runs merge, task check, and focused tests in order", () => {
  const value = fixture();
  const transcript: string[] = [];
  try {
    const output = runIntegrationValidation({
      artifactDirectory: value.artifact,
      receiptFile: "",
      repositoryRoot: value.root,
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
      triggerSha: value.sha,
      candidateSha: value.sha,
      focusedTestFiles: ["fixture.test.ts"],
      runner: (command, args) => {
        transcript.push(`${command} ${args.join(" ")}`);
        return 0;
      },
    });
    assert.equal(output.result.status, "passed");
    assert.deepEqual(transcript.map((entry) => entry.split(" ")[0]), ["git", "uv", "node"]);
    assert.equal(output.outputs, "validation-status=passed\n");
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("task check failure closes as command failure and candidate mismatch runs no command", () => {
  const value = fixture();
  let calls = 0;
  try {
    const output = runIntegrationValidation({
      artifactDirectory: value.artifact,
      receiptFile: "",
      repositoryRoot: value.root,
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
      triggerSha: value.sha,
      candidateSha: value.sha,
      focusedTestFiles: ["fixture.test.ts"],
      runner: () => {
        calls += 1;
        return calls === 2 ? 1 : 0;
      },
    });
    assert.deepEqual(output.result, {
      status: "failed",
      run: { workflowRunId: "456", workflowRunAttempt: 1 },
      failureKind: "command",
      command: "uv run --no-sync task check",
    });
    assert.equal(calls, 2);
    assert.throws(() => runIntegrationValidation({
      artifactDirectory: value.artifact,
      receiptFile: "",
      repositoryRoot: value.root,
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
      triggerSha: value.sha,
      candidateSha: "9".repeat(40),
      focusedTestFiles: ["fixture.test.ts"],
      runner: () => {
        throw new Error("must not run");
      },
    }), /context/);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
