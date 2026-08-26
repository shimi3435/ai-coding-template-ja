import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  createGhRunner,
  runSkillCommand,
  type SkillCommandResult,
} from "../../skill-updater/index.ts";
import {
  computeCandidateDigest,
  selectFailureScope,
  type Scope,
} from "../model/index.ts";
import { discoverManagedPullRequests } from "../github/discovery.ts";
import {
  classifyPendingValidation,
  type WorkflowRunObservation,
} from "../finalize/recovery.ts";
import {
  writeCandidateArtifact,
  writeExistingValidationArtifact,
  writeNoOpArtifact,
} from "./artifact.ts";
import {
  discoverCandidateHistory,
  readCandidateHistory,
  type CandidateHistory,
} from "./history.ts";
import { assertOnlyManagedChanges, managedPathsFromReports } from "./managed-diff.ts";
import { parseCandidateOptions, type CandidateOptions } from "./options.ts";
import {
  candidateResult as result,
  updaterFailure,
  type CandidateCommandResult,
} from "./report-model.ts";
import { UpdaterRejected, validateUpdaterResult } from "./updater-contract.ts";
import { cleanupTemporaryWorktree, git } from "./worktree.ts";

export type {
  CandidateCommandReport,
  CandidateCommandResult,
  CandidateCommandStatus,
  CandidateFailure,
  CandidateStopState,
} from "./report-model.ts";

export type CandidateUpdaterRunner = (
  command: "skills:update",
  args: readonly string[],
  context: Readonly<{ repositoryRoot: string }>,
) => Promise<SkillCommandResult>;

export type CandidateCommandContext = Readonly<{
  repositoryRoot: string;
  updater?: CandidateUpdaterRunner;
  history?: () => Promise<CandidateHistory>;
  workflowRun?: (run: WorkflowRunObservation["run"]) => Promise<WorkflowRunObservation>;
  now?: () => Date;
  temporaryRoot?: string;
}>;

export async function runCandidateCommand(
  args: readonly string[],
  context: CandidateCommandContext,
): Promise<CandidateCommandResult> {
  let options: CandidateOptions;
  try {
    options = parseCandidateOptions(args);
  } catch (error: unknown) {
    return result({
      schemaVersion: 1,
      command: "skills:automation:candidate",
      status: "candidate-invalid",
      errors: [error instanceof Error ? error.message : String(error)],
    });
  }
  if (existsSync(options.output)) {
    return result({
      schemaVersion: 1,
      command: "skills:automation:candidate",
      status: "candidate-invalid",
      errors: [`artifact outputが既に存在します: ${options.output}`],
    });
  }

  let temporary: string;
  try {
    temporary = mkdtempSync(join(context.temporaryRoot ?? tmpdir(), "skill-update-candidate-"));
  } catch (error: unknown) {
    return result({
      schemaVersion: 1,
      command: "skills:automation:candidate",
      status: "candidate-invalid",
      errors: [`temporary root作成失敗: ${error instanceof Error ? error.message : String(error)}`],
    });
  }
  const worktree = join(temporary, "worktree");
  const stage = join(temporary, "artifact");
  let worktreeAdded = false;
  let outputCreated = false;
  let candidateFailureScope: Scope | undefined;
  try {
    const ghRunner = createGhRunner();
    const history = await (context.history ?? (() => readCandidateHistory(options.repository, ghRunner)))();
    let lifecycle;
    try {
      lifecycle = discoverManagedPullRequests({
        repositoryId: options.repositoryId,
        repository: options.repository,
        defaultBaseRef: options.defaultBranchRef,
        resumeClosed: options.resumeClosed,
        paginationComplete: history.complete,
        pullRequests: history.pages.flat(),
      }).decision;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("closed-unmergedではないためresumeできません")) {
        return result({
          schemaVersion: 1,
          command: "skills:automation:candidate",
          status: "candidate-invalid",
          failure: {
            state: "trigger-usage-failure",
            scope: { kind: "global", operation: "detect" },
            summaryOnly: true,
          },
          errors: [error.message],
        });
      }
      throw error;
    }
    if (lifecycle.kind === "pr-identity-conflict" || lifecycle.kind === "recovery-required") {
      return result({
        schemaVersion: 1,
        command: "skills:automation:candidate",
        status: "candidate-invalid",
        failure: {
          state: lifecycle.kind,
          scope: { kind: "global", operation: "detect" },
          summaryOnly: true,
        },
        errors: [lifecycle.kind],
      });
    }
    if (
      lifecycle.kind === "generation-conflict" || lifecycle.kind === "open-pr-conflict" ||
      lifecycle.kind === "intervention-required" || lifecycle.kind === "paused-closed"
    ) {
      return result({
        schemaVersion: 1,
        command: "skills:automation:candidate",
        status: "no-op",
        failure: {
          state: lifecycle.kind,
          scope: "scope" in lifecycle ? lifecycle.scope : { kind: "global", operation: "detect" },
          summaryOnly: false,
        },
        errors: [lifecycle.kind],
      });
    }
    const discovery = discoverCandidateHistory(history, options);
    let activePending = false;
    const pending = discovery.open?.envelope.validation;
    if (pending?.status === "pending") {
      const observation = context.workflowRun === undefined
        ? {
            status: pending.run.workflowRunId === options.workflowRunId &&
              pending.run.workflowRunAttempt === options.workflowRunAttempt ? "in_progress" as const : "completed" as const,
            run: pending.run,
          }
        : await context.workflowRun(pending.run);
      const pendingState = classifyPendingValidation(pending, observation);
      if (pendingState === "recovery-required") {
        return result({
          schemaVersion: 1,
          command: "skills:automation:candidate",
          status: "recovery-required",
          errors: ["managed PR validationがpendingのままworkflow run完了済みです"],
        });
      }
      activePending = pendingState === "active";
    }
    git(context.repositoryRoot, ["worktree", "add", "--detach", worktree, discovery.baseHeadSha]);
    worktreeAdded = true;
    mkdirSync(stage, { mode: 0o700 });
    const updater = context.updater ?? runSkillCommand;
    const preview = validateUpdaterResult(await updater("skills:update", ["--json"], { repositoryRoot: worktree }));
    if (preview.exitCode !== 0 || preview.report.status === "failed") {
      return result({
        schemaVersion: 1,
        command: "skills:automation:candidate",
        status: "updater-rejected",
        updaterReport: preview.report,
        failure: updaterFailure(preview.report),
        errors: [...preview.report.errors],
      });
    }
    const previewBytes = Buffer.from(preview.stdout, "utf8");
    let status: "candidate-update" | "existing-head-validation" | "no-op";
    if (activePending) {
      writeNoOpArtifact(
        stage, options, previewBytes, discovery.historyDigest, discovery.baseHeadSha,
        context.now?.() ?? new Date(),
      );
      status = "no-op";
    } else if (preview.report.status === "update-available" && !discovery.paused) {
      const apply = validateUpdaterResult(await updater("skills:update", ["--apply", "--json"], { repositoryRoot: worktree }));
      if (apply.exitCode !== 0 || apply.report.status === "failed") {
        return result({
          schemaVersion: 1,
          command: "skills:automation:candidate",
          status: "updater-rejected",
          updaterReport: apply.report,
          failure: updaterFailure(apply.report),
          errors: [...apply.report.errors],
        });
      }
      const applyBytes = Buffer.from(apply.stdout, "utf8");
      git(worktree, ["add", "--all"]);
      git(worktree, ["reset", "--", ".agents/skills/.skill-updater-txn"]);
      candidateFailureScope = selectFailureScope({
        candidateDigest: computeCandidateDigest({
          baseHeadSha: discovery.baseHeadSha,
          candidateTreeSha: git(worktree, ["write-tree"]),
          applyReportDigest: `sha256:${createHash("sha256").update(applyBytes).digest("hex")}`,
        }),
        operation: "detect",
      });
      if (existsSync(join(worktree, ".agents", "skills", ".skill-updater-txn"))) {
        throw new Error("updater transaction artifactが残存しています");
      }
      const managedPaths = managedPathsFromReports(preview, apply);
      const changed = assertOnlyManagedChanges(worktree, managedPaths);
      if ((apply.report.status === "unchanged" || apply.report.status === "no-content-change") && changed.length === 0) {
        const refreshedBytes = Buffer.from(apply.stdout, "utf8");
        if (discovery.open?.draft === true) {
          writeExistingValidationArtifact(
            stage, options, refreshedBytes, discovery.historyDigest, discovery.open,
            git(worktree, ["rev-parse", "HEAD^{tree}"]), context.now?.() ?? new Date(),
          );
          status = "existing-head-validation";
        } else {
          writeNoOpArtifact(
            stage, options, refreshedBytes, discovery.historyDigest, discovery.baseHeadSha,
            context.now?.() ?? new Date(),
          );
          status = "no-op";
        }
      } else {
        if (apply.report.status !== "applied" || changed.length === 0) {
          throw new Error("updater apply成功後のcandidate差分が不正です");
        }
        git(worktree, ["add", "--all", "--", ...managedPaths]);
        const timestamp = (context.now?.() ?? new Date()).toISOString();
        execFileSync("git", [
          "-c", "user.name=skill-update-automation",
          "-c", "user.email=skill-update-automation@example.invalid",
          "commit", "--no-gpg-sign", "-m", "chore(skills): update vendored skills",
        ], {
          cwd: worktree,
          env: { ...process.env, GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp },
          stdio: ["ignore", "pipe", "pipe"],
        });
        writeCandidateArtifact({
          stage,
          worktree,
          options,
          previewBytes,
          applyBytes,
          historyDigest: discovery.historyDigest,
          now: new Date(timestamp),
          baseHeadSha: discovery.baseHeadSha,
          target: discovery.open === undefined
            ? {
                mode: "create",
                generation: discovery.createGeneration!,
                headRef: `refs/heads/automation/skill-updates/g${String(discovery.createGeneration!).padStart(6, "0")}`,
                expectedBranch: { state: "absent" },
                historyDigest: discovery.historyDigest,
              }
            : {
                mode: "update",
                generation: discovery.open.generation,
                prNumber: discovery.open.prNumber,
                headRef: discovery.open.headRef,
                expectedBranch: { state: "present", sha: discovery.open.headSha },
                markerDigest: discovery.open.markerDigest,
                historyDigest: discovery.historyDigest,
              },
        });
        status = "candidate-update";
      }
    } else if (preview.report.status === "up-to-date" || preview.report.status === "no-content-change") {
      if (discovery.open?.draft === true) {
        writeExistingValidationArtifact(
          stage,
          options,
          previewBytes,
          discovery.historyDigest,
          discovery.open,
          git(worktree, ["rev-parse", "HEAD^{tree}"]),
          context.now?.() ?? new Date(),
        );
        status = "existing-head-validation";
      } else {
        writeNoOpArtifact(
          stage,
          options,
          previewBytes,
          discovery.historyDigest,
          discovery.baseHeadSha,
          context.now?.() ?? new Date(),
        );
        status = "no-op";
      }
    } else if (preview.report.status === "update-available" && discovery.paused) {
      writeNoOpArtifact(
        stage,
        options,
        previewBytes,
        discovery.historyDigest,
        discovery.baseHeadSha,
        context.now?.() ?? new Date(),
      );
      status = "no-op";
    } else {
      throw new Error(`preview statusが不正です: ${preview.report.status}`);
    }
    mkdirSync(dirname(options.output), { recursive: true });
    renameSync(stage, options.output);
    outputCreated = true;
    return result({
      schemaVersion: 1,
      command: "skills:automation:candidate",
      status,
      artifactDirectory: options.output,
      errors: [],
    });
  } catch (error: unknown) {
    if (error instanceof UpdaterRejected) {
      return result({
        schemaVersion: 1,
        command: "skills:automation:candidate",
        status: "updater-rejected",
        errors: error.details,
      });
    }
    return result({
      schemaVersion: 1,
      command: "skills:automation:candidate",
      status: "candidate-invalid",
      ...(candidateFailureScope === undefined ? {} : {
        failure: { state: "candidate-invalid", scope: candidateFailureScope, summaryOnly: false } as const,
      }),
      errors: [error instanceof Error ? error.message : String(error)],
    });
  } finally {
    const cleanupError = cleanupTemporaryWorktree(context.repositoryRoot, temporary, worktree, worktreeAdded);
    if (cleanupError !== undefined) {
      if (outputCreated) rmSync(options.output, { recursive: true, force: true });
      return result({
        schemaVersion: 1,
        command: "skills:automation:candidate",
        status: "candidate-invalid",
        errors: [cleanupError],
      });
    }
  }
}
