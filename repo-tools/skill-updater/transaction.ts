import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { readInstalledTree } from "./repository.ts";
import type { RemoteCohortObservation } from "./github.ts";
import type { CanonicalTree } from "./canonical.ts";
import type { LocalLockPlan, RemotePlanStep, RemoteUpdatePlan } from "./planner.ts";
import { remoteObservationFingerprint } from "./observation-fingerprint.ts";

export type TransactionStatus = "applied" | "unchanged" | "no-content-change" | "rolled-back" | "failed" | "unknown" | "not-attempted";
export type TransactionStepStatus = TransactionStatus | "up-to-date" | "update-available";
export type TransactionHooks = Readonly<{ transition?: (point: string) => void }>;
export type TransactionResult = Readonly<{
  status: TransactionStatus;
  steps: readonly Readonly<{ key: string; status: TransactionStepStatus }>[];
  errors: readonly string[];
  warnings?: readonly string[];
}>;

export class RemoteRefreshFailure extends Error {
  readonly steps: TransactionResult["steps"];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];

  constructor(input: Readonly<{
    steps: TransactionResult["steps"];
    errors: readonly string[];
    warnings: readonly string[];
  }>) {
    super(input.errors.join("; ") || "remote refresh failed");
    this.name = "RemoteRefreshFailure";
    this.steps = input.steps;
    this.errors = input.errors;
    this.warnings = input.warnings;
  }
}

type RemoteApplyContext = Readonly<{
  repositoryRoot: string;
  refreshAll: () => Promise<RemoteUpdatePlan>;
  refreshStep: (step: RemotePlanStep) => Promise<RemoteCohortObservation>;
  hooks?: TransactionHooks;
}>;

type LocalApplyContext = Readonly<{
  repositoryRoot: string;
  refresh: () => Promise<LocalLockPlan>;
  hooks?: TransactionHooks;
}>;

function transactionRoot(repositoryRoot: string): string {
  return join(repositoryRoot, ".agents", "skills", ".skill-updater-txn");
}

function lockPath(repositoryRoot: string): string {
  return join(repositoryRoot, ".agents", "skills", "skills.lock.json");
}

function sourcesPath(repositoryRoot: string): string {
  return join(repositoryRoot, ".agents", "skills", "skills.sources.json");
}

function targetPath(repositoryRoot: string, name: string): string {
  return join(repositoryRoot, ".agents", "skills", name);
}

function assertManagedTargetsClean(repositoryRoot: string, names: readonly string[]): void {
  if (names.length === 0) return;
  const paths = names.map((name) => `.agents/skills/${name}`);
  const status = spawnSync("git", [
    "--literal-pathspecs",
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--ignored=matching",
    "--",
    ...paths,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  if (status.status !== 0) {
    throw new Error(`managed target dirty check失敗: ${status.stderr.trim() || `git exit ${String(status.status)}`}`);
  }
  if (status.stdout.length > 0) {
    throw new Error(`managed targetにdirty pathがあります: ${paths.join(", ")}`);
  }
}

function transition(hooks: TransactionHooks | undefined, point: string): void {
  hooks?.transition?.(point);
}

function writeManifest(root: string, value: unknown): void {
  writeFileSync(join(root, "manifest.json"), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function writeRemoteStepManifest(
  root: string,
  stepRoot: string,
  step: RemotePlanStep,
  transitionState: string,
  completedTargets: readonly string[],
  error?: string,
): void {
  writeManifest(root, {
    schemaVersion: 1,
    kind: "remote-cohort",
    status: error === undefined ? "active" : "unknown",
    stepKey: step.key,
    transition: transitionState,
    expectedBeforeLockDigest: step.expectedBeforeLockDigest,
    candidateAfterLockDigest: step.candidateAfterLockDigest,
    targets: [...step.candidateTrees].map(([name, tree]) => ({
      name,
      path: `.agents/skills/${name}`,
      beforeDigest: step.expectedTargetDigests.get(name) ?? null,
      candidateDigest: tree.treeHash,
      beforeImage: `${stepRoot.slice(root.length + 1)}/before/${name}`,
      completed: completedTargets.includes(name),
    })),
    lock: {
      path: ".agents/skills/skills.lock.json",
      beforeDigest: step.expectedBeforeLockDigest,
      candidateDigest: step.candidateAfterLockDigest,
      beforeImage: `${stepRoot.slice(root.length + 1)}/before/skills.lock.json`,
    },
    manualRecovery: "manifestのpath、beforeImage、before/candidate digestを照合し、originalまたはapplied状態を証明する",
    ...(error === undefined ? {} : { error }),
  });
}

function writeRemoteTransactionManifest(
  root: string,
  plan: RemoteUpdatePlan,
  completed: readonly Readonly<{ key: string; status: TransactionStepStatus }>[],
): void {
  const completedKeys = new Set(completed.map((step) => step.key));
  const currentLockDigest = completed.length === 0
    ? plan.initialLockDigest
    : plan.steps.find((step) => step.key === completed.at(-1)?.key)?.candidateAfterLockDigest ?? plan.initialLockDigest;
  writeManifest(root, {
    schemaVersion: 1,
    kind: "remote-transaction",
    status: "active",
    transition: completed.length === 0 ? "preflight-complete" : "step-complete",
    initialLockDigest: plan.initialLockDigest,
    candidateLockDigest: plan.candidateLockDigest,
    currentLockDigest,
    completed,
    remaining: plan.steps.filter((step) => !completedKeys.has(step.key)).map((step) => ({
      key: step.key,
      expectedBeforeLockDigest: step.expectedBeforeLockDigest,
      candidateAfterLockDigest: step.candidateAfterLockDigest,
      targets: [...step.candidateTrees].map(([name, tree]) => ({
        name,
        path: `.agents/skills/${name}`,
        beforeDigest: step.expectedTargetDigests.get(name) ?? null,
        candidateDigest: tree.treeHash,
      })),
    })),
    manualRecovery: "current lock/targetをmanifestのcurrent、before、candidate digestと照合し、完了stepを保持して未完了stepを再previewする",
  });
}

function writeLocalManifest(root: string, plan: LocalLockPlan, transitionState: string, error?: string): void {
  writeManifest(root, {
    schemaVersion: 1,
    kind: "local-lock",
    status: error === undefined ? "active" : "unknown",
    transition: transitionState,
    sourcesDigest: plan.sourcesDigest,
    expectedBeforeLockDigest: plan.initialLockDigest,
    candidateAfterLockDigest: plan.candidateLockDigest,
    lock: {
      path: ".agents/skills/skills.lock.json",
      beforeDigest: plan.initialLockDigest,
      candidateDigest: plan.candidateLockDigest,
      beforeImage: "before.lock.json",
    },
    manualRecovery: "before.lock.jsonとcurrent lockのbefore/candidate digestを照合し、originalまたはapplied状態を証明する",
    ...(error === undefined ? {} : { error }),
  });
}

function writeTree(root: string, tree: CanonicalTree): void {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const file of tree.files) {
    const path = join(root, ...file.path.split("/"));
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, file.content, { mode: file.executable ? 0o755 : 0o644 });
    chmodSync(path, file.executable ? 0o755 : 0o644);
  }
}

function planFingerprint(plan: RemoteUpdatePlan): string {
  return JSON.stringify({
    sourcesDigest: plan.sourcesDigest,
    initialLockDigest: plan.initialLockDigest,
    candidateLockDigest: plan.candidateLockDigest,
    steps: plan.steps.map((step) => ({
      key: step.key,
      status: step.status,
      resolvedCommit: step.resolvedCommit,
      observationFingerprint: step.observationFingerprint,
      expectedBeforeLockDigest: step.expectedBeforeLockDigest,
      candidateAfterLockDigest: step.candidateAfterLockDigest,
      targets: [...step.candidateTrees].map(([name, tree]) => [name, tree.treeHash]).sort(),
    })),
  });
}

function localPlanFingerprint(plan: LocalLockPlan): string {
  return JSON.stringify({
    sourcesDigest: plan.sourcesDigest,
    initialLockDigest: plan.initialLockDigest,
    candidateLockDigest: plan.candidateLockDigest,
    observations: plan.observations.map((item) => [item.name, item.tree.treeHash]).sort(),
  });
}

function observationMatchesStep(observation: RemoteCohortObservation, step: RemotePlanStep): boolean {
  return remoteObservationFingerprint(observation) === step.observationFingerprint;
}

function assertRemoteFresh(repositoryRoot: string, plan: RemoteUpdatePlan): void {
  if (readFileSync(sourcesPath(repositoryRoot), "utf8") !== plan.sourcesBytes) {
    throw new Error("sources changed; new preview required");
  }
  if (readFileSync(lockPath(repositoryRoot), "utf8") !== plan.initialLockBytes) {
    throw new Error("lock changed; new preview required");
  }
  assertManagedTargetsClean(repositoryRoot, plan.steps.flatMap((step) => [...step.expectedTargetDigests.keys()]));
  for (const step of plan.steps) {
    for (const [name, expected] of step.expectedTargetDigests) {
      const path = targetPath(repositoryRoot, name);
      if (expected === null) {
        if (existsSync(path)) throw new Error(`new targetが既に存在します: ${name}`);
      } else if (!existsSync(path) || readInstalledTree(repositoryRoot, `.agents/skills/${name}`, name).treeHash !== expected) {
        throw new Error(`managed target changed; new preview required: ${name}`);
      }
    }
  }
}

function rollbackRemoteStep(
  repositoryRoot: string,
  root: string,
  step: RemotePlanStep,
  movedTargets: readonly Readonly<{ name: string; backup: string; hadBefore: boolean }>[],
  lockBackup: string,
  hooks: TransactionHooks | undefined,
): boolean {
  try {
    transition(hooks, "before-lock-rollback");
    if (existsSync(lockBackup)) {
      if (existsSync(lockPath(repositoryRoot))) rmSync(lockPath(repositoryRoot), { force: true });
      renameSync(lockBackup, lockPath(repositoryRoot));
    }
    for (const moved of [...movedTargets].reverse()) {
      transition(hooks, `before-target-rollback:${moved.name}`);
      const target = targetPath(repositoryRoot, moved.name);
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      if (moved.hadBefore) renameSync(moved.backup, target);
    }
    if (readFileSync(lockPath(repositoryRoot), "utf8") !== step.expectedBeforeLockBytes) return false;
    for (const [name, expected] of step.expectedTargetDigests) {
      const path = targetPath(repositoryRoot, name);
      if (expected === null) {
        if (existsSync(path)) return false;
      } else if (!existsSync(path) || readInstalledTree(repositoryRoot, `.agents/skills/${name}`, name).treeHash !== expected) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function applyRemoteUpdatePlan(
  plan: RemoteUpdatePlan,
  context: RemoteApplyContext,
): Promise<TransactionResult> {
  const root = transactionRoot(context.repositoryRoot);
  const applicable = plan.steps.filter((step) => step.status === "update-available");
  if (applicable.length === 0) {
    return {
      status: "no-content-change",
      steps: plan.steps.map((step) => ({ key: step.key, status: step.status })),
      errors: [],
    };
  }
  try {
    if (existsSync(root)) throw new Error("transaction manifestが残存しています。manifestのbefore imageとdigestでmanual recoveryが必要です");
    assertRemoteFresh(context.repositoryRoot, plan);
    const refreshed = await context.refreshAll();
    if (planFingerprint(refreshed) !== planFingerprint(plan)) throw new Error("remote observation changed; new preview required");
  } catch (error: unknown) {
    if (error instanceof RemoteRefreshFailure) {
      return { status: "failed", steps: error.steps, errors: error.errors, warnings: error.warnings };
    }
    return { status: "failed", steps: plan.steps.map((step) => ({ key: step.key, status: "not-attempted" })), errors: [error instanceof Error ? error.message : String(error)] };
  }

  mkdirSync(root, { recursive: false, mode: 0o700 });
  const results: { key: string; status: TransactionStepStatus }[] = [];
  writeRemoteTransactionManifest(root, plan, results);
  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index]!;
    if (step.status !== "update-available") {
      results.push({ key: step.key, status: step.status });
      continue;
    }
    const stepRoot = join(root, `step-${index}`);
    const staging = join(stepRoot, "staging");
    const backups = join(stepRoot, "before");
    try {
      if (readFileSync(sourcesPath(context.repositoryRoot), "utf8") !== plan.sourcesBytes) {
        throw new Error("per-step sources freshness failure");
      }
      if (readFileSync(lockPath(context.repositoryRoot), "utf8") !== step.expectedBeforeLockBytes) {
        throw new Error("per-step lock freshness failure");
      }
      assertManagedTargetsClean(context.repositoryRoot, [...step.expectedTargetDigests.keys()]);
      for (const [name, expected] of step.expectedTargetDigests) {
        const path = targetPath(context.repositoryRoot, name);
        if (expected === null ? existsSync(path) : !existsSync(path) || readInstalledTree(context.repositoryRoot, `.agents/skills/${name}`, name).treeHash !== expected) {
          throw new Error(`per-step target freshness failure: ${name}`);
        }
      }
      const refreshed = await context.refreshStep(step);
      if (!observationMatchesStep(refreshed, step)) throw new Error("per-step remote freshness failure");
      if (readFileSync(sourcesPath(context.repositoryRoot), "utf8") !== plan.sourcesBytes) {
        throw new Error("per-step sources freshness failure");
      }
    } catch (error: unknown) {
      results.push({ key: step.key, status: "failed" });
      for (const remaining of plan.steps.slice(index + 1)) results.push({ key: remaining.key, status: "not-attempted" });
      rmSync(root, { recursive: true, force: true });
      return { status: "failed", steps: results, errors: [error instanceof Error ? error.message : String(error)] };
    }

    mkdirSync(staging, { recursive: true, mode: 0o700 });
    mkdirSync(backups, { recursive: true, mode: 0o700 });
    const movedTargets: { name: string; backup: string; hadBefore: boolean }[] = [];
    const lockBackup = join(backups, "skills.lock.json");
    const completedTargets: string[] = [];
    try {
      for (const [name, tree] of step.candidateTrees) {
        const stagedTarget = join(staging, name);
        writeTree(stagedTarget, tree);
        if (readInstalledTree(staging, name, name).treeHash !== tree.treeHash) throw new Error(`staging reread failure: ${name}`);
      }
      const stagedLock = join(staging, "skills.lock.json");
      writeFileSync(stagedLock, step.candidateAfterLockBytes, { mode: 0o600 });
      if (readFileSync(stagedLock, "utf8") !== step.candidateAfterLockBytes) throw new Error("staged lock reread failure");
      writeRemoteStepManifest(root, stepRoot, step, "staged", completedTargets);
      for (const [name, tree] of step.candidateTrees) {
        const target = targetPath(context.repositoryRoot, name);
        const backup = join(backups, name);
        const hadBefore = existsSync(target);
        writeRemoteStepManifest(root, stepRoot, step, `before-target-replace:${name}`, completedTargets);
        if (hadBefore) renameSync(target, backup);
        movedTargets.push({ name, backup, hadBefore });
        renameSync(join(staging, name), target);
        if (readInstalledTree(context.repositoryRoot, `.agents/skills/${name}`, name).treeHash !== tree.treeHash) {
          throw new Error(`target digest failure: ${name}`);
        }
        completedTargets.push(name);
        writeRemoteStepManifest(root, stepRoot, step, `target-replaced:${name}`, completedTargets);
        transition(context.hooks, `after-target-replace:${name}`);
      }
      writeRemoteStepManifest(root, stepRoot, step, "before-lock-replace", completedTargets);
      renameSync(lockPath(context.repositoryRoot), lockBackup);
      renameSync(stagedLock, lockPath(context.repositoryRoot));
      if (readFileSync(lockPath(context.repositoryRoot), "utf8") !== step.candidateAfterLockBytes) throw new Error("lock digest failure");
      writeRemoteStepManifest(root, stepRoot, step, "lock-replaced", completedTargets);
      transition(context.hooks, "after-lock-replace");
      results.push({ key: step.key, status: "applied" });
      rmSync(stepRoot, { recursive: true, force: true });
      writeRemoteTransactionManifest(root, plan, results);
      transition(context.hooks, `after-step-complete:${step.key}`);
    } catch (error: unknown) {
      const rolledBack = rollbackRemoteStep(context.repositoryRoot, root, step, movedTargets, lockBackup, context.hooks);
      const status: TransactionStatus = rolledBack ? "rolled-back" : "unknown";
      results.push({ key: step.key, status });
      for (const remaining of plan.steps.slice(index + 1)) results.push({ key: remaining.key, status: "not-attempted" });
      const message = error instanceof Error ? error.message : String(error);
      if (rolledBack) rmSync(root, { recursive: true, force: true });
      else writeRemoteStepManifest(root, stepRoot, step, "recovery-required", completedTargets, message);
      return { status, steps: results, errors: [message] };
    }
  }
  rmSync(root, { recursive: true, force: true });
  return { status: "applied", steps: results, errors: [] };
}

export async function applyLocalLockPlan(
  plan: LocalLockPlan,
  context: LocalApplyContext,
): Promise<TransactionResult> {
  if (plan.status === "unchanged") return { status: "unchanged", steps: [], errors: [] };
  const root = transactionRoot(context.repositoryRoot);
  try {
    if (existsSync(root)) throw new Error("transaction manifestが残存しています。manifestのbefore imageとdigestでmanual recoveryが必要です");
    if (readFileSync(sourcesPath(context.repositoryRoot), "utf8") !== plan.sourcesBytes) throw new Error("sources changed; new preview required");
    if (readFileSync(lockPath(context.repositoryRoot), "utf8") !== plan.initialLockBytes) throw new Error("lock changed; new preview required");
    const refreshed = await context.refresh();
    if (localPlanFingerprint(refreshed) !== localPlanFingerprint(plan)) throw new Error("local inputs changed; new preview required");
  } catch (error: unknown) {
    return { status: "failed", steps: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
  mkdirSync(root, { recursive: false, mode: 0o700 });
  const staged = join(root, "candidate.lock.json");
  const backup = join(root, "before.lock.json");
  writeLocalManifest(root, plan, "staged");
  try {
    writeFileSync(staged, plan.candidateLockBytes, { mode: 0o600 });
    if (readFileSync(staged, "utf8") !== plan.candidateLockBytes) throw new Error("staged lock reread failure");
    writeLocalManifest(root, plan, "before-lock-replace");
    renameSync(lockPath(context.repositoryRoot), backup);
    renameSync(staged, lockPath(context.repositoryRoot));
    if (readFileSync(lockPath(context.repositoryRoot), "utf8") !== plan.candidateLockBytes) throw new Error("lock digest failure");
    writeLocalManifest(root, plan, "lock-replaced");
    transition(context.hooks, "after-lock-replace");
    rmSync(root, { recursive: true, force: true });
    return { status: "applied", steps: [], errors: [] };
  } catch (error: unknown) {
    let rolledBack = false;
    try {
      transition(context.hooks, "before-lock-rollback");
      if (existsSync(backup)) {
        if (existsSync(lockPath(context.repositoryRoot))) rmSync(lockPath(context.repositoryRoot), { force: true });
        renameSync(backup, lockPath(context.repositoryRoot));
      }
      rolledBack = readFileSync(lockPath(context.repositoryRoot), "utf8") === plan.initialLockBytes;
    } catch {
      rolledBack = false;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (rolledBack) rmSync(root, { recursive: true, force: true });
    else writeLocalManifest(root, plan, "recovery-required", message);
    return { status: rolledBack ? "rolled-back" : "unknown", steps: [], errors: [message] };
  }
}
