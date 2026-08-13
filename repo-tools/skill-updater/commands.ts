import { spawnSync } from "node:child_process";
import { buildLocalLockPlan, buildRemoteUpdatePlan, classifyRemoteCohort, cohortKey, type RemotePlanStep, type RemoteUpdatePlan } from "./planner.ts";
import { createGhRunner, observeRemoteCohort, type GhRunner, type RemoteCohortObservation } from "./github.ts";
import { applyLocalLockPlan, applyRemoteUpdatePlan, RemoteRefreshFailure } from "./transaction.ts";
import {
  readInstalledTree,
  readLocalObservations,
  readRepositorySkillState,
  readVendoredSkillNames,
  verifyInstalledState,
  type RepositorySkillState,
} from "./repository.ts";
import { sameSourceRefVariant } from "./types.ts";
import { utf8Compare } from "./canonical.ts";
import type { RemoteLock, RemoteSource } from "./types.ts";

export type SkillCommandName = "skills:links" | "skills:verify" | "skills:check" | "skills:update" | "skills:lock-local";
export type MachineStatus =
  | "up-to-date" | "update-available" | "no-content-change" | "applied" | "unchanged"
  | "rolled-back" | "failed" | "unknown" | "not-attempted";

export type CohortReport = Readonly<{
  key: string;
  status: MachineStatus;
  names: readonly string[];
  resolvedCommit?: string;
  diff?: readonly Readonly<{ name: string; beforeTreeHash: string | null; afterTreeHash: string }>[];
  expectedBeforeLockDigest?: string;
  candidateAfterLockDigest?: string;
  candidateAfterLock?: unknown;
}>;

export type CommandReport = Readonly<{
  schemaVersion: 1;
  command: SkillCommandName;
  status: MachineStatus;
  cohorts: readonly CohortReport[];
  warnings: readonly string[];
  errors: readonly string[];
  exitCode: 0 | 1 | 3;
}>;

export type SkillCommandResult = Readonly<{
  exitCode: 0 | 1 | 3;
  stdout: string;
  stderr: string;
  report: CommandReport;
}>;

export type SkillCommandContext = Readonly<{
  repositoryRoot: string;
  ghRunner?: GhRunner;
}>;

function report(
  command: SkillCommandName,
  status: MachineStatus,
  cohorts: CommandReport["cohorts"],
  warnings: readonly string[],
  errors: readonly string[],
  exitCode: 0 | 1 | 3,
): CommandReport {
  return {
    schemaVersion: 1,
    command,
    status,
    cohorts: [...cohorts]
      .map((cohort) => ({ ...cohort, names: [...cohort.names].sort(utf8Compare) }))
      .sort((left, right) => utf8Compare(left.key, right.key)),
    warnings: [...warnings].sort(utf8Compare),
    errors: [...errors].sort(utf8Compare),
    exitCode,
  };
}

function render(result: CommandReport, json: boolean): SkillCommandResult {
  if (json) return { exitCode: result.exitCode, stdout: `${JSON.stringify(result)}\n`, stderr: "", report: result };
  const lines = [
    `[${result.status}] ${result.command}`,
    ...result.cohorts.flatMap((cohort) => [
      `[${cohort.status}] ${cohort.key}: ${cohort.names.join(", ")}`,
      ...(cohort.resolvedCommit === undefined ? [] : [`  commit: ${cohort.resolvedCommit}`]),
      ...(cohort.diff === undefined ? [] : cohort.diff.map((item) =>
        `  diff: ${item.name} ${item.beforeTreeHash ?? "absent"} -> ${item.afterTreeHash}`)),
      ...(cohort.expectedBeforeLockDigest === undefined ? [] : [`  expected-before-lock: ${cohort.expectedBeforeLockDigest}`]),
      ...(cohort.candidateAfterLockDigest === undefined ? [] : [`  candidate-after-lock: ${cohort.candidateAfterLockDigest}`]),
      ...(cohort.candidateAfterLock === undefined ? [] : [`  planned-lock: ${JSON.stringify(cohort.candidateAfterLock)}`]),
    ]),
    ...result.warnings.map((warning) => `[WARN] ${warning}`),
  ];
  const stderr = result.errors.map((error) => `[FAIL] ${error}`).join("\n");
  return {
    exitCode: result.exitCode,
    stdout: `${lines.join("\n")}\n`,
    stderr: stderr.length === 0 ? "" : `${stderr}\n`,
    report: result,
  };
}

function planCohort(step: RemotePlanStep, status: MachineStatus = step.status): CohortReport {
  return {
    key: step.key,
    status,
    names: step.names,
    resolvedCommit: step.resolvedCommit,
    diff: [...step.candidateTrees]
      .map(([name, tree]) => ({
        name,
        beforeTreeHash: step.expectedTargetDigests.get(name) ?? null,
        afterTreeHash: tree.treeHash,
      }))
      .sort((left, right) => utf8Compare(left.name, right.name)),
    expectedBeforeLockDigest: step.expectedBeforeLockDigest,
    candidateAfterLockDigest: step.candidateAfterLockDigest,
    candidateAfterLock: JSON.parse(step.candidateAfterLockBytes) as unknown,
  };
}

function parseOptions(command: SkillCommandName, args: readonly string[]): {
  json: boolean;
  apply: boolean;
  failOnUpdate: boolean;
} {
  const allowed = new Set(["--json"]);
  if (command === "skills:check") allowed.add("--fail-on-update");
  if (command === "skills:update" || command === "skills:lock-local") allowed.add("--apply");
  const unknown = args.filter((argument) => !allowed.has(argument));
  if (unknown.length > 0 || new Set(args).size !== args.length) {
    throw new Error(`unknown or conflicting options: ${unknown.join(", ") || args.join(", ")}`);
  }
  return { json: args.includes("--json"), apply: args.includes("--apply"), failOnUpdate: args.includes("--fail-on-update") };
}

function groupRemoteSources(sources: readonly RemoteSource[]): Map<string, RemoteSource[]> {
  const groups = new Map<string, RemoteSource[]>();
  for (const source of sources) {
    const key = cohortKey(source.repository, source.ref);
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return groups;
}

function historyLocksForGroup(group: readonly RemoteSource[], locks: readonly RemoteLock[]): readonly RemoteLock[] {
  const byName = new Map(locks.map((lock) => [lock.name, lock]));
  return group.flatMap((source) => {
    const lock = byName.get(source.name);
    if (lock === undefined) return [];
    if (!sameSourceRefVariant(lock.ref, source.ref)) {
      throw new Error(`ref variant変更はv1で自動移行できません: ${source.name}`);
    }
    if (lock.repository !== source.repository) return [];
    return [lock];
  });
}

type RemoteObservationCollection = Readonly<{
  state: RepositorySkillState;
  sources: readonly RemoteSource[];
  locks: readonly RemoteLock[];
  groups: ReadonlyMap<string, readonly RemoteSource[]>;
  observations: readonly RemoteCohortObservation[];
  errorByKey: ReadonlyMap<string, string>;
}>;

async function collectRemoteObservations(context: SkillCommandContext): Promise<RemoteObservationCollection> {
  const state = readRepositorySkillState(context.repositoryRoot);
  const sources = state.sources.skills.filter((entry) => entry.ownership === "remote");
  const locks = state.lock.skills.filter((entry): entry is RemoteLock => entry.ownership === "remote");
  const groups = groupRemoteSources(sources);
  const runner = context.ghRunner ?? createGhRunner();
  const observations: RemoteCohortObservation[] = [];
  const errorByKey = new Map<string, string>();
  for (const key of [...groups.keys()].sort(utf8Compare)) {
    const group = groups.get(key)!;
    try {
      observations.push(await observeRemoteCohort(
        group,
        historyLocksForGroup(group, locks),
        runner,
      ));
    } catch (error: unknown) {
      errorByKey.set(key, error instanceof Error ? error.message : String(error));
    }
  }
  return Object.freeze({ state, sources, locks, groups, observations, errorByKey });
}

function remoteObservationFailureReport(
  command: "skills:check" | "skills:update",
  context: SkillCommandContext,
  collection: RemoteObservationCollection,
): CommandReport | undefined {
  if (collection.errorByKey.size === 0) return undefined;
  const observationByKey = new Map(collection.observations.map((observation) => [
    cohortKey(observation.repository, observation.ref),
    observation,
  ]));
  const cohorts: CohortReport[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const key of [...collection.groups.keys()].sort(utf8Compare)) {
    const group = collection.groups.get(key)!;
    const observed = observationByKey.get(key);
    const observationError = collection.errorByKey.get(key);
    if (observationError !== undefined || observed === undefined) {
      cohorts.push({ key, status: "failed", names: group.map((source) => source.name).sort(utf8Compare) });
      errors.push(`${key}: ${observationError ?? "cohort observation欠落"}`);
      continue;
    }
    try {
      const installedTrees = new Map<string, ReturnType<typeof readInstalledTree>>();
      for (const source of group) {
        const lock = collection.locks.find((entry) => entry.name === source.name);
        if (lock !== undefined) installedTrees.set(source.name, readInstalledTree(context.repositoryRoot, lock.target, lock.name));
      }
      const classification = classifyRemoteCohort({
        sources: group,
        lock: collection.state.lock,
        installedTrees,
        observation: observed,
      });
      cohorts.push({
        key,
        status: classification.status,
        names: group.map((source) => source.name).sort(utf8Compare),
        resolvedCommit: observed.resolvedCommit,
      });
      warnings.push(...observed.warnings);
    } catch (error: unknown) {
      cohorts.push({ key, status: "failed", names: group.map((source) => source.name).sort(utf8Compare) });
      errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return report(command, "failed", cohorts, warnings, errors, 1);
}

function buildPlanFromRemoteObservations(
  context: SkillCommandContext,
  collection: RemoteObservationCollection,
): RemoteUpdatePlan {
  const installedTrees = new Map<string, ReturnType<typeof readInstalledTree>>();
  for (const lock of collection.locks) {
    installedTrees.set(lock.name, readInstalledTree(context.repositoryRoot, lock.target, lock.name));
  }
  return buildRemoteUpdatePlan({
    sources: collection.state.sources,
    sourcesBytes: collection.state.sourcesBytes,
    lock: collection.state.lock,
    initialLockBytes: collection.state.lockBytes,
    installedTrees,
    observations: collection.observations,
  });
}

async function inspectRemote(
  command: "skills:check" | "skills:update",
  context: SkillCommandContext,
  failOnUpdate: boolean,
): Promise<CommandReport> {
  const collection = await collectRemoteObservations(context);
  const failure = remoteObservationFailureReport(command, context, collection);
  if (failure !== undefined) return failure;
  const plan = buildPlanFromRemoteObservations(context, collection);
  const cohorts = plan.steps.map((step) => planCohort(step));
  const hasUpdate = plan.steps.some((step) => step.status === "update-available");
  const hasNoContent = plan.steps.some((step) => step.status === "no-content-change");
  const status = hasUpdate ? "update-available" : hasNoContent ? "no-content-change" : "up-to-date";
  return report(command, status, cohorts, plan.warnings, [], failOnUpdate && hasUpdate ? 3 : 0);
}

type RemotePlanPreparation = Readonly<{ plan?: RemoteUpdatePlan; failure?: CommandReport }>;

async function createRemotePlan(context: SkillCommandContext): Promise<RemotePlanPreparation> {
  const collection = await collectRemoteObservations(context);
  const failure = remoteObservationFailureReport("skills:update", context, collection);
  if (failure !== undefined) return { failure };
  return { plan: buildPlanFromRemoteObservations(context, collection) };
}

export async function runSkillCommand(
  command: SkillCommandName,
  args: readonly string[],
  context: SkillCommandContext,
): Promise<SkillCommandResult> {
  let options: ReturnType<typeof parseOptions>;
  try {
    options = parseOptions(command, args);
  } catch (error: unknown) {
    const failure = report(command, "failed", [], [], [error instanceof Error ? error.message : String(error)], 1);
    return render(failure, args.includes("--json"));
  }
  try {
    if (command === "skills:links") {
      const state = readRepositorySkillState(context.repositoryRoot);
      const declared = state.sources.skills
        .filter((entry) => entry.ownership !== "plugin")
        .map((entry) => entry.name)
        .sort(utf8Compare);
      const installed = readVendoredSkillNames(context.repositoryRoot);
      const declaredSet = new Set(declared);
      const installedSet = new Set(installed);
      const undeclared = installed.filter((name) => !declaredSet.has(name));
      const missing = declared.filter((name) => !installedSet.has(name));
      if (undeclared.length > 0 || missing.length > 0) {
        throw new Error(`vendored skill declaration不一致: undeclared=${undeclared.join(",")} missing=${missing.join(",")}`);
      }
      if (declared.length === 0) {
        return render(report(command, "unchanged", [], [], [], 0), options.json);
      }
      const executed = spawnSync("bash", ["scripts/setup-skills.sh", ...declared.flatMap((name) => ["--skill", name])], {
        cwd: context.repositoryRoot,
        encoding: "utf8",
      });
      if (executed.status !== 0) {
        return render(report(command, "failed", [], [], [executed.stderr.trim() || `links exit ${String(executed.status)}`], 1), options.json);
      }
      const changed = !executed.stdout.includes("変更なし");
      const cohorts = state.sources.skills.filter((source) => source.ownership !== "plugin").map((source) => ({
        key: `${source.name}|${source.ownership}`,
        status: (changed ? "applied" : "unchanged") as MachineStatus,
        names: [source.target],
      }));
      return render(report(command, changed ? "applied" : "unchanged", cohorts, [], [], 0), options.json);
    }
    if (command === "skills:verify") {
      const state = readRepositorySkillState(context.repositoryRoot);
      const errors = verifyInstalledState(context.repositoryRoot, state);
      return render(report(command, errors.length === 0 ? "up-to-date" : "failed", [], [], errors, errors.length === 0 ? 0 : 1), options.json);
    }
    if (command === "skills:lock-local") {
      const state = readRepositorySkillState(context.repositoryRoot);
      const plan = buildLocalLockPlan({
        sources: state.sources,
        sourcesBytes: state.sourcesBytes,
        lock: state.lock,
        initialLockBytes: state.lockBytes,
        observations: readLocalObservations(context.repositoryRoot, state.sources),
      });
      if (options.apply) {
        const result = await applyLocalLockPlan(plan, {
          repositoryRoot: context.repositoryRoot,
          refresh: async () => {
            const fresh = readRepositorySkillState(context.repositoryRoot);
            return buildLocalLockPlan({
              sources: fresh.sources,
              sourcesBytes: fresh.sourcesBytes,
              lock: fresh.lock,
              initialLockBytes: fresh.lockBytes,
              observations: readLocalObservations(context.repositoryRoot, fresh.sources),
            });
          },
        });
        return render(report(command, result.status, [], [], result.errors, result.status === "applied" || result.status === "unchanged" ? 0 : 1), options.json);
      }
      return render(report(command, plan.status, [], [], [], 0), options.json);
    }
    if (command === "skills:update" && options.apply) {
      const runner = context.ghRunner ?? createGhRunner();
      const preparation = await createRemotePlan({ ...context, ghRunner: runner });
      if (preparation.failure !== undefined) return render(preparation.failure, options.json);
      const plan = preparation.plan!;
      const result = await applyRemoteUpdatePlan(plan, {
        repositoryRoot: context.repositoryRoot,
        refreshAll: async () => {
          const refreshed = await createRemotePlan({ ...context, ghRunner: runner });
          if (refreshed.failure !== undefined) {
            throw new RemoteRefreshFailure({
              steps: refreshed.failure.cohorts.map((cohort) => ({ key: cohort.key, status: cohort.status })),
              errors: refreshed.failure.errors,
              warnings: refreshed.failure.warnings,
            });
          }
          return refreshed.plan!;
        },
        refreshStep: async (step) => {
          const state = readRepositorySkillState(context.repositoryRoot);
          const group = state.sources.skills.filter(
            (entry): entry is RemoteSource => entry.ownership === "remote" && cohortKey(entry.repository, entry.ref) === step.key,
          );
          const locks = state.lock.skills.filter(
            (entry): entry is RemoteLock => entry.ownership === "remote" && group.some((source) => source.name === entry.name),
          );
          return observeRemoteCohort(group, historyLocksForGroup(group, locks), runner);
        },
      });
      const resultByKey = new Map(result.steps.map((step) => [step.key, step.status]));
      const cohorts = plan.steps.map((step) => planCohort(step, resultByKey.get(step.key) ?? "not-attempted"));
      return render(report(command, result.status, cohorts, result.warnings ?? plan.warnings, result.errors, result.status === "applied" || result.status === "unchanged" ? 0 : 1), options.json);
    }
    return render(await inspectRemote(command, context, options.failOnUpdate), options.json);
  } catch (error: unknown) {
    return render(report(command, "failed", [], [], [error instanceof Error ? error.message : String(error)], 1), options.json);
  }
}
