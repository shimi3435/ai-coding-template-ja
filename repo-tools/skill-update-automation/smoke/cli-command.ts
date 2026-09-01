import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import {
  encodeSmokePreview,
  decodeSmokePreview,
  computeSmokePreviewDigest,
  parseDecimalId,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseSha,
  type RunRef,
} from "../model/index.ts";
import { SmokeApprovalSession } from "./approval.ts";
import { buildSmokePreview, executeSmokePlan, SmokeExecutionError, type SmokeExecutionEvidence } from "./command.ts";
import type { SmokeHost } from "./host.ts";

type SmokeCommandOptions = Readonly<{
  repository: string;
  run: RunRef;
  sourceCommit: string;
}>;

export type SmokeCommandResult = Readonly<{
  exitCode: 0 | 1 | 2;
  evidence?: SmokeExecutionEvidence;
}>;

export type SmokeCommandDependencies = Readonly<{
  createHost: (repository: string) => SmokeHost;
  input: Readable;
  stdout: Writable;
  stderr: Writable;
  now: () => Date;
}>;

function parseArguments(args: readonly string[]): SmokeCommandOptions {
  const expected = new Set(["--repository", "--run-id", "--run-attempt", "--source-commit"]);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (option === undefined || value === undefined || !expected.has(option) || values.has(option)) {
      throw new Error("smoke command argumentsが不正です");
    }
    values.set(option, value);
  }
  if (values.size !== expected.size) throw new Error("smoke command argumentsが不足しています");
  const runAttemptText = values.get("--run-attempt");
  if (typeof runAttemptText !== "string" || !/^[1-9][0-9]*$/.test(runAttemptText)) {
    throw new Error("run attemptが不正です");
  }
  return {
    repository: parseRepositoryFullName(values.get("--repository")),
    run: {
      workflowRunId: parseDecimalId(values.get("--run-id")),
      workflowRunAttempt: parsePositiveSafeInteger(Number(runAttemptText)),
    },
    sourceCommit: parseSha(values.get("--source-commit")),
  };
}

async function readOneLine(input: Readable): Promise<string | null> {
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of lines) return line;
    return null;
  } finally {
    lines.close();
  }
}

export async function runSmokeCommand(
  args: readonly string[],
  dependencies: SmokeCommandDependencies,
): Promise<SmokeCommandResult> {
  let options: SmokeCommandOptions;
  try {
    options = parseArguments(args);
  } catch (error: unknown) {
    dependencies.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 2 };
  }
  try {
    const host = dependencies.createHost(options.repository);
    const preview = await buildSmokePreview({ ...options, createdAt: dependencies.now().toISOString() }, host);
    const previewBytes = encodeSmokePreview(preview);
    const approval = new SmokeApprovalSession(previewBytes);
    dependencies.stdout.write(previewBytes);
    dependencies.stdout.write(`\nDigest: ${approval.digest}\nEnter exact digest: `);
    const input = await readOneLine(dependencies.input);
    if (input === null) {
      dependencies.stderr.write("approval inputがありません。writeは実行していません。\n");
      return { exitCode: 2 };
    }
    if (!approval.consume(input)) {
      dependencies.stderr.write("approval digestが一致しません。writeは実行していません。\n");
      return { exitCode: 2 };
    }
    const approvedPreview = decodeSmokePreview(previewBytes);
    if (computeSmokePreviewDigest(approvedPreview) !== approval.digest) {
      throw new Error("displayed preview bytesとapproval digestが一致しません");
    }
    const evidence = await executeSmokePlan(approvedPreview, host);
    dependencies.stdout.write(`\n${JSON.stringify(evidence)}\n`);
    return { exitCode: 0, evidence };
  } catch (error: unknown) {
    dependencies.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    if (error instanceof SmokeExecutionError) {
      dependencies.stderr.write(`recovery-preview-required ${JSON.stringify({
        bindings: error.bindings,
        steps: error.steps,
        residualResources: error.residualResources,
      })}\n`);
    }
    return { exitCode: 1 };
  }
}
