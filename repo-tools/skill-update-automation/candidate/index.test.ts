import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendJournalEntryDigest,
  decodeArtifactManifest,
  journalCommentBody,
  managedPrTitle,
  prStateSnapshotV2,
  renderManagedPrRootV2,
  type ValidationState,
} from "../model/index.ts";
import {
  discoverCandidateHistory,
  runCandidateCommand,
  readCandidateHistory,
  validateArtifactByteTotal,
  validateCandidateArtifact,
  type CandidateUpdaterRunner,
} from "./index.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function createRepository(): Readonly<{ root: string; sha: string }> {
  const root = mkdtempSync(join(tmpdir(), "candidate-command-test-"));
  git(root, "init", "--initial-branch=main");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  return { root, sha: git(root, "rev-parse", "HEAD") };
}

function updaterResult(
  status: "up-to-date" | "update-available" | "applied" | "no-content-change" = "up-to-date",
  cohorts: readonly Readonly<{ key: string; status: "update-available" | "applied"; names: readonly string[] }>[] = [],
) {
  const report = {
    schemaVersion: 1 as const,
    command: "skills:update" as const,
    status,
    cohorts,
    warnings: [],
    errors: [],
    exitCode: 0 as const,
  };
  return { exitCode: 0 as const, stdout: `${JSON.stringify(report)}\n`, stderr: "", report };
}

function failedUpdaterResult(exitCode: 0 | 1 | 3 = 1) {
  const report = {
    schemaVersion: 1 as const,
    command: "skills:update" as const,
    status: "failed" as const,
    cohorts: [{ key: "one", status: "failed" as const, names: ["alpha"] }],
    warnings: [],
    errors: ["opaque updater failure"],
    exitCode,
  };
  return { exitCode, stdout: `${JSON.stringify(report)}\n`, stderr: "", report };
}

function candidateArgs(repositorySha: string, output: string): readonly string[] {
  return [
    "--output", output,
    "--repository-id", "123",
    "--repository", "owner/repository",
    "--run-id", "456",
    "--run-attempt", "1",
    "--trigger-sha", repositorySha,
    "--default-branch-sha", repositorySha,
    "--default-branch-ref", "refs/heads/main",
  ];
}

function managedV2Fields(input: Readonly<{
  prNumber: number;
  generation: number;
  headSha: string;
  validationBaseSha: string;
  candidateDigest: string;
  reportDigest: string;
  validation: ValidationState;
}>): Readonly<{ body: string; journalComments: readonly Readonly<{
  id: string; authorUserId: string; createdAt: string; updatedAt: string; body: string;
}>[] }> {
  const headRef = `refs/heads/automation/skill-updates/g${String(input.generation).padStart(6, "0")}`;
  const snapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repository",
    generation: input.generation,
    headRef,
    baseRef: "refs/heads/main",
    expectedHeadSha: input.headSha,
    validationBaseSha: input.validationBaseSha,
    candidateDigest: input.candidateDigest,
    reportDigest: input.reportDigest,
    draft: input.validation.status !== "passed",
    validation: input.validation,
  });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    generation: input.generation,
    headRef,
    baseRef: "refs/heads/main",
    candidateDigest: input.candidateDigest,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: input.prNumber,
    creatorUserId: root.creatorUserId,
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot,
  });
  return {
    body: renderManagedPrRootV2(root, "fixture summary"),
    journalComments: [{
      id: "1",
      authorUserId: root.creatorUserId,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body: journalCommentBody(entry),
    }],
  };
}

test("candidate history reconstructs v2 state from the creator-bound journal", () => {
  const headSha = "3".repeat(40);
  const snapshot = prStateSnapshotV2({
    schemaVersion: 2,
    kind: "managed-pr-state",
    repositoryId: "123",
    repository: "owner/repository",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    expectedHeadSha: headSha,
    validationBaseSha: "0".repeat(40),
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    draft: true,
    validation: { status: "pending", run: { workflowRunId: "10", workflowRunAttempt: 1 } },
  });
  const root = {
    schemaVersion: 2 as const,
    kind: "managed-pr-root" as const,
    repositoryId: "123",
    repository: "owner/repository",
    creatorUserId: "456",
    generation: 1,
    headRef: "refs/heads/automation/skill-updates/g000001",
    baseRef: "refs/heads/main",
    candidateDigest: `sha256:${"1".repeat(64)}`,
    initialSnapshot: snapshot,
    initialSnapshotDigest: snapshot.stateDigest,
  };
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 7,
    creatorUserId: "456",
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: `sha256:${"a".repeat(64)}`,
    snapshot,
  });
  const discovery = discoverCandidateHistory({ complete: true, pages: [[{
    prNumber: 7,
    state: "open",
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef: root.headRef,
    headSha,
    baseRepositoryId: "123",
    baseRef: root.baseRef,
    title: managedPrTitle,
    body: renderManagedPrRootV2(root, "fixture"),
    journalComments: [{
      id: "1",
      authorUserId: "456",
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body: journalCommentBody(entry),
    }],
  }]] }, {
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchSha: "0".repeat(40),
    defaultBranchRef: "refs/heads/main",
    resumeClosed: false,
  });
  assert.equal(discovery.open?.markerDigest, entry.digest);
  assert.equal(discovery.open?.envelope.expectedHeadSha, headSha);
});

test("public candidate command emits an exact no-op artifact and cleans its worktree", async () => {
  const repository = createRepository();
  const output = join(repository.root, "artifact");
  const transcript: string[] = [];
  const updater: CandidateUpdaterRunner = async (command, args) => {
    transcript.push(`${command} ${args.join(" ")}`);
    return updaterResult();
  };
  try {
    const result = await runCandidateCommand([
      "--output", output,
      "--repository-id", "123",
      "--repository", "owner/repository",
      "--run-id", "456",
      "--run-attempt", "1",
      "--trigger-sha", repository.sha,
      "--default-branch-sha", repository.sha,
      "--default-branch-ref", "refs/heads/main",
    ], {
      repositoryRoot: repository.root,
      updater,
      history: async () => ({ complete: true, pages: [[]] }),
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });

    assert.equal(result.exitCode, 0, result.report.errors.join("; "));
    assert.equal(result.report.status, "no-op");
    assert.deepEqual(transcript, ["skills:update --json"]);
    assert.deepEqual(readdirSync(output).sort(), ["manifest.json", "preview-report.json"]);
    const manifest = decodeArtifactManifest(readFileSync(join(output, "manifest.json")));
    assert.equal(manifest.kind, "no-op");
    assert.equal(manifest.repositoryId, "123");
    assert.deepEqual(manifest.run, { workflowRunId: "456", workflowRunAttempt: 1 });
    assert.equal(manifest.target.mode, "none");
    assert.equal(validateCandidateArtifact(output, {
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
    }).kind, "no-op");
    assert.throws(() => validateCandidateArtifact(output, {
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 2,
    }), /artifact identity/);
    assert.throws(() => validateCandidateArtifact(output, {
      repositoryId: "999",
      repository: "other/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
    }), /artifact identity/);
    writeFileSync(join(output, "extra.txt"), "unexpected\n");
    assert.throws(() => validateCandidateArtifact(output, {
      repositoryId: "123", repository: "owner/repository", workflowRunId: "456", workflowRunAttempt: 1,
    }), /file集合/);
    rmSync(join(output, "extra.txt"));
    appendFileSync(join(output, "preview-report.json"), "changed");
    assert.throws(() => validateCandidateArtifact(output, {
      repositoryId: "123", repository: "owner/repository", workflowRunId: "456", workflowRunAttempt: 1,
    }), /digest/);
    assert.equal(git(repository.root, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length, 1);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("public candidate command commits all updater cohorts and creates a verified thin bundle", async () => {
  const repository = createRepository();
  const output = join(repository.root, "artifact");
  const transcript: string[] = [];
  const previewCohorts = [
    { key: "one", status: "update-available" as const, names: ["alpha"] },
    { key: "two", status: "update-available" as const, names: ["beta_skill"] },
  ];
  const appliedCohorts = previewCohorts.map((cohort) => ({ ...cohort, status: "applied" as const }));
  const updater: CandidateUpdaterRunner = async (command, args, context) => {
    transcript.push(`${command} ${args.join(" ")}`);
    if (!args.includes("--apply")) return updaterResult("update-available", previewCohorts);
    for (const name of ["alpha", "beta_skill"]) {
      const directory = join(context.repositoryRoot, ".agents", "skills", name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: fixture\n---\n`);
    }
    const skills = join(context.repositoryRoot, ".agents", "skills");
    writeFileSync(join(skills, "skills.lock.json"), "{}\n");
    return updaterResult("applied", appliedCohorts);
  };
  try {
    const result = await runCandidateCommand([
      "--output", output,
      "--repository-id", "123",
      "--repository", "owner/repository",
      "--run-id", "456",
      "--run-attempt", "1",
      "--trigger-sha", repository.sha,
      "--default-branch-sha", repository.sha,
      "--default-branch-ref", "refs/heads/main",
    ], {
      repositoryRoot: repository.root,
      updater,
      history: async () => ({ complete: true, pages: [[]] }),
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.report.status, "candidate-update");
    assert.deepEqual(transcript, ["skills:update --json", "skills:update --apply --json"]);
    assert.deepEqual(readdirSync(output).sort(), [
      "apply-report.json", "candidate.bundle", "manifest.json", "preview-report.json",
    ]);
    const manifest = decodeArtifactManifest(readFileSync(join(output, "manifest.json")));
    assert.equal(manifest.kind, "candidate-update");
    if (manifest.kind !== "candidate-update") return;
    assert.equal(manifest.target.mode, "create");
    assert.equal(manifest.target.generation, 1);
    assert.equal(git(repository.root, "show", "-s", "--format=%P", manifest.candidateSha), repository.sha);
    assert.equal(git(repository.root, "rev-parse", `${manifest.candidateSha}^{tree}`), manifest.candidateTreeSha);
    git(repository.root, "bundle", "verify", join(output, "candidate.bundle"));
    assert.match(git(repository.root, "bundle", "list-heads", join(output, "candidate.bundle")), new RegExp(manifest.candidateSha));
    assert.equal(git(repository.root, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length, 1);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("public candidate command binds an update to the exact open managed PR head", async () => {
  const repository = createRepository();
  writeFileSync(join(repository.root, "managed-head.txt"), "existing candidate\n");
  git(repository.root, "add", "managed-head.txt");
  git(repository.root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "managed head");
  const managedHead = git(repository.root, "rev-parse", "HEAD");
  const candidateDigest = `sha256:${"1".repeat(64)}`;
  const reportDigest = `sha256:${"2".repeat(64)}`;
  const managed = managedV2Fields({
    prNumber: 42,
    generation: 7,
    headSha: managedHead,
    validationBaseSha: repository.sha,
    candidateDigest,
    reportDigest,
    validation: {
      status: "failed",
      run: { workflowRunId: "455", workflowRunAttempt: 1 },
      failureKind: "command",
      command: "uv run --no-sync task check",
    },
  });
  const updater: CandidateUpdaterRunner = async (_command, args, context) => {
    if (!args.includes("--apply")) {
      return updaterResult("update-available", [{ key: "one", status: "update-available", names: ["alpha"] }]);
    }
    const directory = join(context.repositoryRoot, ".agents", "skills", "alpha");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "SKILL.md"), "---\nname: alpha\ndescription: fixture\n---\n");
    writeFileSync(join(context.repositoryRoot, ".agents", "skills", "skills.lock.json"), "{}\n");
    return updaterResult("applied", [{ key: "one", status: "applied", names: ["alpha"] }]);
  };
  const output = join(repository.root, "artifact");
  try {
    const result = await runCandidateCommand([
      "--output", output,
      "--repository-id", "123",
      "--repository", "owner/repository",
      "--run-id", "456",
      "--run-attempt", "1",
      "--trigger-sha", repository.sha,
      "--default-branch-sha", repository.sha,
      "--default-branch-ref", "refs/heads/main",
    ], {
      repositoryRoot: repository.root,
      updater,
      history: async () => ({ complete: true, pages: [[{
        prNumber: 42,
        state: "open",
        merged: false,
        draft: true,
        headRepositoryId: "123",
        headRef: "refs/heads/automation/skill-updates/g000007",
        headSha: managedHead,
        baseRepositoryId: "123",
        baseRef: "refs/heads/main",
        title: managedPrTitle,
        ...managed,
      }]] }),
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });

    assert.equal(result.exitCode, 0, result.report.errors.join("; "));
    const manifest = decodeArtifactManifest(readFileSync(join(output, "manifest.json")));
    assert.equal(manifest.kind, "candidate-update");
    if (manifest.kind !== "candidate-update") return;
    assert.equal(manifest.baseHeadSha, managedHead);
    assert.equal(manifest.target.mode, "update");
    if (manifest.target.mode !== "update") return;
    assert.equal(manifest.target.generation, 7);
    assert.equal(manifest.target.prNumber, 42);
    assert.equal(manifest.target.expectedBranch.sha, managedHead);
    assert.equal(validateCandidateArtifact(output, {
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
      historyDigest: manifest.target.historyDigest,
      target: manifest.target,
    }).kind, "candidate-update");
    assert.throws(() => validateCandidateArtifact(output, {
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
      historyDigest: `sha256:${"f".repeat(64)}`,
      target: manifest.target,
    }), /history digest/);
    const staleTarget: typeof manifest.target = { ...manifest.target, prNumber: 43 };
    assert.throws(() => validateCandidateArtifact(output, {
      repositoryId: "123",
      repository: "owner/repository",
      workflowRunId: "456",
      workflowRunAttempt: 1,
      historyDigest: manifest.target.historyDigest,
      target: staleTarget,
    }), /publish target/);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("candidate detection preserves active pending and stops completed old pending", async () => {
  const repository = createRepository();
  const pendingRun = { workflowRunId: "455", workflowRunAttempt: 1 } as const;
  const headRef = "refs/heads/automation/skill-updates/g000007";
  const managed = managedV2Fields({
    prNumber: 42,
    generation: 7,
    headSha: repository.sha,
    validationBaseSha: repository.sha,
    candidateDigest: `sha256:${"1".repeat(64)}`,
    reportDigest: `sha256:${"2".repeat(64)}`,
    validation: { status: "pending", run: pendingRun },
  });
  const history = async () => ({ complete: true as const, pages: [[{
    prNumber: 42,
    state: "open" as const,
    merged: false,
    draft: true,
    headRepositoryId: "123",
    headRef,
    headSha: repository.sha,
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    title: managedPrTitle,
    ...managed,
  }]] });
  let updaterCalls = 0;
  try {
    const completedOutput = join(repository.root, "completed-artifact");
    const completed = await runCandidateCommand(candidateArgs(repository.sha, completedOutput), {
      repositoryRoot: repository.root,
      history,
      workflowRun: async () => ({ status: "completed", run: pendingRun }),
      updater: async () => {
        updaterCalls += 1;
        return updaterResult("update-available", [{ key: "one", status: "update-available", names: ["alpha"] }]);
      },
    });
    assert.equal(completed.report.status, "recovery-required");
    assert.equal(completed.exitCode, 1);
    assert.equal(existsSync(completedOutput), false);
    assert.equal(updaterCalls, 0);

    const activeOutput = join(repository.root, "active-artifact");
    const active = await runCandidateCommand(candidateArgs(repository.sha, activeOutput), {
      repositoryRoot: repository.root,
      history,
      workflowRun: async () => ({ status: "in_progress", run: pendingRun }),
      updater: async () => {
        updaterCalls += 1;
        return updaterResult("update-available", [{ key: "one", status: "update-available", names: ["alpha"] }]);
      },
    });
    assert.equal(active.report.status, "no-op");
    assert.equal(active.exitCode, 0);
    assert.equal(decodeArtifactManifest(readFileSync(join(activeOutput, "manifest.json"))).kind, "no-op");
    assert.equal(updaterCalls, 1);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("public candidate command rejects malformed updater JSON before emitting an artifact", async () => {
  const repository = createRepository();
  const output = join(repository.root, "artifact");
  const valid = updaterResult();
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, output), {
      repositoryRoot: repository.root,
      updater: async () => ({ ...valid, stdout: "{malformed}\n" }),
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "updater-rejected");
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("artifact byte limit accepts exact 100 MiB and rejects one extra byte", () => {
  assert.equal(validateArtifactByteTotal([100 * 1024 * 1024]), 100 * 1024 * 1024);
  assert.throws(() => validateArtifactByteTotal([100 * 1024 * 1024, 1]), /100 MiB/);
});

test("public candidate command never uses the exit-3 detection route", async () => {
  const repository = createRepository();
  const transcript: string[] = [];
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, join(repository.root, "artifact")), {
      repositoryRoot: repository.root,
      updater: async (command, args) => {
        transcript.push(`${command} ${args.join(" ")}`);
        const report = {
          schemaVersion: 1 as const,
          command: "skills:update" as const,
          status: "update-available" as const,
          cohorts: [], warnings: [], errors: [], exitCode: 3 as const,
        };
        return { exitCode: 3, stdout: `${JSON.stringify(report)}\n`, stderr: "", report };
      },
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "updater-rejected");
    assert.deepEqual(transcript, ["skills:update --json"]);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("updater failure wins over simultaneous transaction and unmanaged-path residue", async () => {
  const repository = createRepository();
  const output = join(repository.root, "artifact");
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, output), {
      repositoryRoot: repository.root,
      updater: async (_command, args, context) => {
        if (!args.includes("--apply")) {
          return updaterResult("update-available", [{ key: "one", status: "update-available", names: ["alpha"] }]);
        }
        writeFileSync(join(context.repositoryRoot, "README.md"), "unmanaged change\n");
        mkdirSync(join(context.repositoryRoot, ".agents", "skills", ".skill-updater-txn"), { recursive: true });
        return failedUpdaterResult();
      },
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "updater-rejected");
    assert.deepEqual(result.report.errors, ["opaque updater failure"]);
    assert.deepEqual(result.report.failure?.scope, { kind: "cohort", cohortKey: "one" });
    assert.equal(existsSync(output), false);
    assert.equal(git(repository.root, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length, 1);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("successful updater result with unmanaged changes is candidate-invalid", async () => {
  const repository = createRepository();
  const output = join(repository.root, "artifact");
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, output), {
      repositoryRoot: repository.root,
      updater: async (_command, args, context) => {
        if (!args.includes("--apply")) {
          return updaterResult("update-available", [{ key: "one", status: "update-available", names: ["alpha"] }]);
        }
        writeFileSync(join(context.repositoryRoot, "README.md"), "unmanaged change\n");
        const directory = join(context.repositoryRoot, ".agents", "skills", "alpha");
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, "SKILL.md"), "---\nname: alpha\ndescription: fixture\n---\n");
        writeFileSync(join(context.repositoryRoot, ".agents", "skills", "skills.lock.json"), "{}\n");
        return updaterResult("applied", [{ key: "one", status: "applied", names: ["alpha"] }]);
      },
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "candidate-invalid");
    assert.equal(result.report.failure?.scope.kind, "candidate");
    assert.match(result.report.errors.join("; "), /managed path外/);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("incomplete PR pagination stops before updater execution and cleans temporary state", async () => {
  const repository = createRepository();
  const temporaryRoot = join(repository.root, "temporary-root");
  mkdirSync(temporaryRoot);
  let updaterCalls = 0;
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, join(repository.root, "artifact")), {
      repositoryRoot: repository.root,
      updater: async () => {
        updaterCalls += 1;
        return updaterResult();
      },
      history: async () => ({ complete: false, pages: [[]] }),
      temporaryRoot,
    });
    assert.equal(result.report.status, "candidate-invalid");
    assert.equal(updaterCalls, 0);
    assert.equal(git(repository.root, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length, 1);
    assert.deepEqual(readdirSync(temporaryRoot), []);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("open managed draft with no new content emits exact existing-head validation", async () => {
  const repository = createRepository();
  writeFileSync(join(repository.root, "candidate.txt"), "candidate\n");
  git(repository.root, "add", "candidate.txt");
  git(repository.root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "candidate");
  const headSha = git(repository.root, "rev-parse", "HEAD");
  const candidateDigest = `sha256:${"3".repeat(64)}`;
  const managed = managedV2Fields({
    prNumber: 30,
    generation: 3,
    headSha,
    validationBaseSha: repository.sha,
    candidateDigest,
    reportDigest: `sha256:${"4".repeat(64)}`,
    validation: { status: "failed", run: { workflowRunId: "455", workflowRunAttempt: 1 }, failureKind: "command", command: "task check" },
  });
  const output = join(repository.root, "artifact");
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, output), {
      repositoryRoot: repository.root,
      updater: async () => updaterResult(),
      history: async () => ({ complete: true, pages: [[{
        prNumber: 30,
        state: "open",
        merged: false,
        draft: true,
        headRepositoryId: "123",
        headRef: "refs/heads/automation/skill-updates/g000003",
        headSha,
        baseRepositoryId: "123",
        baseRef: "refs/heads/main",
        title: managedPrTitle,
        ...managed,
      }]] }),
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });
    assert.equal(result.report.status, "existing-head-validation");
    assert.deepEqual(readdirSync(output).sort(), ["manifest.json", "preview-report.json"]);
    const manifest = decodeArtifactManifest(readFileSync(join(output, "manifest.json")));
    assert.equal(manifest.kind, "existing-head-validation");
    if (manifest.kind !== "existing-head-validation") return;
    assert.equal(manifest.candidateSha, headSha);
    assert.equal(manifest.candidateDigest, candidateDigest);
    assert.equal(manifest.target.mode, "validate");
    assert.equal(manifest.target.prNumber, 30);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("repository entrypoint exposes the candidate command as a public CLI seam", () => {
  const execution = spawnSync(process.execPath, [
    "repo-tools/entrypoint.mjs", "skills:automation:candidate",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(execution.status, 1);
  const report = JSON.parse(execution.stdout) as { command: string; status: string };
  assert.deepEqual(report, {
    schemaVersion: 1,
    command: "skills:automation:candidate",
    status: "candidate-invalid",
    errors: ["candidate optionが必要です: --output"],
    failure: {
      state: "candidate-invalid",
      scope: { kind: "global", operation: "detect" },
      summaryOnly: false,
    },
  });
  assert.equal(execution.stderr, "");
});

test("GitHub history adapter requests all pages and preserves page members", async () => {
  const calls: readonly string[][] = [];
  const mutableCalls = calls as string[][];
  const history = await readCandidateHistory("owner/repository", async (args) => {
    mutableCalls.push([...args]);
    const pull = (number: number, state: "open" | "closed") => ({
      number,
      state,
      merged_at: state === "closed" ? "2026-08-20T00:00:00Z" : null,
      draft: state === "open",
      head: { repo: { id: 123 }, ref: `automation/skill-updates/g${String(number).padStart(6, "0")}`, sha: "1".repeat(40) },
      base: { repo: { id: 123 }, ref: "main" },
      title: managedPrTitle,
      body: null,
    });
    const deletedFork = { ...pull(3, "closed"), head: { repo: null, ref: "fork", sha: "2".repeat(40) } };
    return { exitCode: 0, stdout: JSON.stringify([[pull(1, "open")], [pull(2, "closed"), deletedFork]]), stderr: "" };
  });
  assert.deepEqual(mutableCalls, [[
    "api", "--method", "GET", "--paginate", "--slurp", "repos/owner/repository/pulls?state=all&per_page=100",
  ]]);
  assert.equal(history.complete, true);
  assert.deepEqual(history.pages.map((page) => page.map((pull) => pull.prNumber)), [[1], [2, 3]]);
  assert.equal(history.pages[1]![0]!.merged, true);
  assert.equal(history.pages[1]![1]!.headRepositoryId, null);
});

test("GitHub history adapter hydrates immutable metadata for a commentless v2 root", async () => {
  const headSha = "1".repeat(40);
  const managed = managedV2Fields({
    prNumber: 1,
    generation: 1,
    headSha,
    validationBaseSha: "0".repeat(40),
    candidateDigest: `sha256:${"2".repeat(64)}`,
    reportDigest: `sha256:${"3".repeat(64)}`,
    validation: { status: "pending", run: { workflowRunId: "10", workflowRunAttempt: 1 } },
  });
  const calls: string[][] = [];
  const history = await readCandidateHistory("owner/repository", async (args) => {
    calls.push([...args]);
    if (args.includes("graphql")) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ data: { repository: { pullRequest: { lastEditedAt: null } } } }),
        stderr: "",
      };
    }
    if (args.some((argument) => argument.includes("/comments"))) {
      return {
        exitCode: 0,
        stdout: JSON.stringify([[
          {
            id: 99,
            body: "human comment",
            user: { id: 999 },
            created_at: "2026-08-28T00:00:00Z",
            updated_at: "2026-08-28T00:00:00Z",
          },
        ]]),
        stderr: "",
      };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify([[
        {
          number: 1,
          state: "open",
          merged_at: null,
          draft: true,
          user: { id: 456 },
          head: { repo: { id: 123 }, ref: "automation/skill-updates/g000001", sha: headSha },
          base: { repo: { id: 123 }, ref: "main" },
          title: managedPrTitle,
          body: managed.body,
        },
      ]]),
      stderr: "",
    };
  });

  assert.equal(history.pages[0]![0]!.authorUserId, "456");
  assert.equal(history.pages[0]![0]!.lastEditedAt, null);
  assert.equal(calls.length, 3);
  assert.ok(calls[2]!.includes("graphql"));
  assert.equal(discoverCandidateHistory(history, {
    repositoryId: "123",
    repository: "owner/repository",
    defaultBranchSha: "0".repeat(40),
    defaultBranchRef: "refs/heads/main",
    resumeClosed: false,
  }).open?.prNumber, 1);
});

test("apply refresh with no content change becomes no-op instead of candidate-invalid", async () => {
  const repository = createRepository();
  let calls = 0;
  const output = join(repository.root, "artifact");
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, output), {
      repositoryRoot: repository.root,
      updater: async () => {
        calls += 1;
        return calls === 1
          ? updaterResult("update-available", [{ key: "one", status: "update-available", names: ["alpha"] }])
          : updaterResult("no-content-change");
      },
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "no-op");
    assert.deepEqual(readdirSync(output).sort(), ["manifest.json", "preview-report.json"]);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("unknown updater machine status is updater-rejected", async () => {
  const repository = createRepository();
  const report = {
    schemaVersion: 1,
    command: "skills:update",
    status: "invented-status",
    cohorts: [], warnings: [], errors: [], exitCode: 0,
  };
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, join(repository.root, "artifact")), {
      repositoryRoot: repository.root,
      updater: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify(report)}\n`,
        stderr: "",
        report,
      }) as never,
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "updater-rejected");
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("run attempt CLI value requires canonical positive decimal", async () => {
  const repository = createRepository();
  const args = [...candidateArgs(repository.sha, join(repository.root, "artifact"))];
  args[args.indexOf("--run-attempt") + 1] = "1e0";
  let historyCalls = 0;
  try {
    const result = await runCandidateCommand(args, {
      repositoryRoot: repository.root,
      history: async () => {
        historyCalls += 1;
        return { complete: true, pages: [[]] };
      },
    });
    assert.equal(result.report.status, "candidate-invalid");
    assert.equal(historyCalls, 0);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("GitHub history failure redacts credential text", async () => {
  await assert.rejects(
    readCandidateHistory("owner/repository", async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "Authorization: Bearer secret-value",
    })),
    (error: unknown) => error instanceof Error && error.message.includes("[REDACTED]") && !error.message.includes("secret-value"),
  );
});

test("successful updater result with transaction residue is candidate-invalid", async () => {
  const repository = createRepository();
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, join(repository.root, "artifact")), {
      repositoryRoot: repository.root,
      updater: async (_command, args, context) => {
        if (!args.includes("--apply")) {
          return updaterResult("update-available", [{ key: "one", status: "update-available", names: ["alpha"] }]);
        }
        mkdirSync(join(context.repositoryRoot, ".agents", "skills", ".skill-updater-txn"), { recursive: true });
        return updaterResult("applied", [{ key: "one", status: "applied", names: ["alpha"] }]);
      },
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "candidate-invalid");
    assert.match(result.report.errors.join("; "), /transaction artifact/);
    assert.equal(result.report.failure?.scope.kind, "candidate");
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("partial updater failure preserves the opaque public report", async () => {
  const repository = createRepository();
  const failed = failedUpdaterResult(0);
  try {
    const result = await runCandidateCommand(candidateArgs(repository.sha, join(repository.root, "artifact")), {
      repositoryRoot: repository.root,
      updater: async () => failed,
      history: async () => ({ complete: true, pages: [[]] }),
    });
    assert.equal(result.report.status, "updater-rejected");
    assert.deepEqual(result.report.updaterReport, failed.report);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});
