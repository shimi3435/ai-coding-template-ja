import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import type { FinalizeGithubAdapter } from "../finalize/finalize.ts";
import {
  parseDecimalId,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseSha,
} from "../model/index.ts";
import { encodeFreshSmokePreviewV2, runFreshSmokeV2 } from "./fresh-v2.ts";
import type { SmokeHost } from "./host.ts";

export type FreshSmokeCliDependencies = Readonly<{
  createAdapter: (repository: string) => FinalizeGithubAdapter;
  createIdentityHost: (repository: string) => Pick<
    SmokeHost,
    "readRepository" | "readWorkflowRun" | "readCommitParent" | "readCommitComparison"
  >;
  readCreatorUserId: () => Promise<string>;
  input: Readable;
  stdout: Writable;
  stderr: Writable;
  now: () => Date;
}>;

function parseArguments(args: readonly string[]) {
  const names = [
    "--repository", "--repository-id", "--creator-user-id", "--run-id", "--run-attempt",
    "--default-branch-ref", "--default-branch-sha", "--source-parent-commit", "--source-commit",
  ] as const;
  const expected = new Set<string>(names);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || !expected.has(name) || values.has(name)) {
      throw new Error("fresh smoke argumentsが不正です");
    }
    values.set(name, value);
  }
  if (values.size !== names.length) throw new Error("fresh smoke argumentsが不足しています");
  const attempt = values.get("--run-attempt")!;
  if (!/^[1-9][0-9]*$/.test(attempt)) throw new Error("fresh smoke run attemptが不正です");
  return {
    repository: parseRepositoryFullName(values.get("--repository")),
    repositoryId: parseDecimalId(values.get("--repository-id")),
    creatorUserId: parseDecimalId(values.get("--creator-user-id")),
    run: {
      workflowRunId: parseDecimalId(values.get("--run-id")),
      workflowRunAttempt: parsePositiveSafeInteger(Number(attempt)),
    },
    defaultBranchRef: values.get("--default-branch-ref")!,
    defaultBranchSha: parseSha(values.get("--default-branch-sha")),
    sourceParentCommit: parseSha(values.get("--source-parent-commit")),
    sourceCommit: parseSha(values.get("--source-commit")),
  };
}

export async function runFreshSmokeCli(
  args: readonly string[],
  dependencies: FreshSmokeCliDependencies,
): Promise<Readonly<{ exitCode: 0 | 1 | 2 }>> {
  let options: ReturnType<typeof parseArguments>;
  try {
    options = parseArguments(args);
  } catch (error: unknown) {
    dependencies.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 2 };
  }
  const lines = createInterface({ input: dependencies.input, crlfDelay: Number.POSITIVE_INFINITY });
  const iterator = lines[Symbol.asyncIterator]();
  const readLine = async (): Promise<string | null> => {
    const next = await iterator.next();
    return next.done ? null : next.value;
  };
  try {
    const identityHost = dependencies.createIdentityHost(options.repository);
    const [repository, workflowRun, sourceParent, comparison, creatorUserId] = await Promise.all([
      identityHost.readRepository(),
      identityHost.readWorkflowRun(options.run.workflowRunId),
      identityHost.readCommitParent(options.sourceCommit),
      identityHost.readCommitComparison(options.defaultBranchSha, options.sourceCommit),
      dependencies.readCreatorUserId(),
    ]);
    const sourceRelation = comparison.status === "ahead" && comparison.aheadBy >= 1 && comparison.behindBy === 0
      ? "ahead" as const
      : comparison.status === "behind" && comparison.aheadBy === 0 && comparison.behindBy >= 1
        ? "merged" as const
        : null;
    if (repository.id !== options.repositoryId || repository.fullName !== options.repository ||
      repository.defaultBranchRef !== options.defaultBranchRef || workflowRun === null ||
      workflowRun.id !== options.run.workflowRunId || workflowRun.attempt !== options.run.workflowRunAttempt ||
      workflowRun.repositoryId !== options.repositoryId || workflowRun.repository !== options.repository ||
      workflowRun.headSha !== options.sourceCommit || sourceParent !== options.sourceParentCommit || sourceRelation === null ||
      parseDecimalId(creatorUserId) !== options.creatorUserId) {
      throw new Error("fresh smoke repository / run / source / creator identityが一致しません");
    }
    const adapter = dependencies.createAdapter(options.repository);
    const result = await runFreshSmokeV2({
      ...options,
      createdAt: dependencies.now().toISOString(),
      sourceRelation,
    }, adapter, async (preview, digest) => {
      dependencies.stdout.write(encodeFreshSmokePreviewV2(preview));
      dependencies.stdout.write(`\nDigest: ${digest}\nEnter exact digest: `);
      return await readLine();
    }, async (prNumber, checkpointDigest) => {
      dependencies.stdout.write(
        `\nMerge smoke PR #${prNumber} manually, then enter checkpoint digest: ${checkpointDigest}\nCheckpoint: `,
      );
      return await readLine();
    });
    if (result.kind === "not-approved") {
      dependencies.stderr.write("approval digestが一致しません。writeは実行していません。\n");
      return { exitCode: 2 };
    }
    dependencies.stdout.write(`\n${JSON.stringify(result)}\n`);
    return { exitCode: 0 };
  } catch (error: unknown) {
    dependencies.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  } finally {
    lines.close();
  }
}
