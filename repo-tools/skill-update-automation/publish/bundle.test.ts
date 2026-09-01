import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyCandidateBundle } from "./bundle.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fixture(): Readonly<{ root: string; bundle: string; baseSha: string; candidateSha: string; treeSha: string }> {
  const root = mkdtempSync(join(tmpdir(), "publish-bundle-test-"));
  git(root, "init", "--initial-branch=main");
  writeFileSync(join(root, "fixture.txt"), "base\n");
  git(root, "add", "fixture.txt");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "base");
  const baseSha = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "fixture.txt"), "candidate\n");
  git(root, "add", "fixture.txt");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "candidate");
  const candidateSha = git(root, "rev-parse", "HEAD");
  const treeSha = git(root, "rev-parse", "HEAD^{tree}");
  const sourceRef = "refs/skill-update-automation/run-456-1";
  git(root, "update-ref", sourceRef, candidateSha);
  const bundle = join(root, "candidate.bundle");
  git(root, "bundle", "create", bundle, sourceRef, `^${baseSha}`);
  git(root, "update-ref", "-d", sourceRef, candidateSha);
  git(root, "reset", "--hard", baseSha);
  return { root, bundle, baseSha, candidateSha, treeSha };
}

test("thin bundle binds the advertised ref, single parent, and candidate tree", () => {
  const value = fixture();
  try {
    verifyCandidateBundle({
      repositoryRoot: value.root,
      bundlePath: value.bundle,
      workflowRunId: "456",
      workflowRunAttempt: 1,
      baseHeadSha: value.baseSha,
      candidateSha: value.candidateSha,
      candidateTreeSha: value.treeSha,
    });
    assert.equal(git(value.root, "for-each-ref", "--format=%(refname)", "refs/skill-update-automation/publish/"), "");
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("tree or parent mismatch rejects and still removes the temporary ref", () => {
  const value = fixture();
  try {
    assert.throws(() => verifyCandidateBundle({
      repositoryRoot: value.root,
      bundlePath: value.bundle,
      workflowRunId: "456",
      workflowRunAttempt: 1,
      baseHeadSha: "9".repeat(40),
      candidateSha: value.candidateSha,
      candidateTreeSha: value.treeSha,
    }), /prerequisite|parent/);
    assert.throws(() => verifyCandidateBundle({
      repositoryRoot: value.root,
      bundlePath: value.bundle,
      workflowRunId: "456",
      workflowRunAttempt: 1,
      baseHeadSha: value.baseSha,
      candidateSha: value.candidateSha,
      candidateTreeSha: "8".repeat(40),
    }), /tree/);
    assert.equal(git(value.root, "for-each-ref", "--format=%(refname)", "refs/skill-update-automation/publish/"), "");
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
