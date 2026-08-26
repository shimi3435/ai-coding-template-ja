import { resolve } from "node:path";

import {
  parseDecimalId,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseSha,
} from "../model/index.ts";

export type CandidateOptions = Readonly<{
  output: string;
  repositoryId: string;
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  triggerSha: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  resumeClosed: boolean;
}>;

export function parseCandidateOptions(args: readonly string[]): CandidateOptions {
  const values = new Map<string, string>();
  let resumeClosed = false;
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]!;
    if (key === "--resume-closed") {
      if (resumeClosed) throw new Error("--resume-closedが重複しています");
      resumeClosed = true;
      continue;
    }
    if (!key.startsWith("--") || index + 1 >= args.length || args[index + 1]!.startsWith("--")) {
      throw new Error(`candidate optionが不正です: ${key}`);
    }
    if (values.has(key)) throw new Error(`candidate optionが重複しています: ${key}`);
    values.set(key, args[index + 1]!);
    index += 1;
  }
  const required = [
    "--output", "--repository-id", "--repository", "--run-id", "--run-attempt",
    "--trigger-sha", "--default-branch-sha", "--default-branch-ref",
  ] as const;
  const unknown = [...values.keys()].filter((key) => !required.includes(key as (typeof required)[number]));
  if (unknown.length > 0) throw new Error(`unknown candidate option: ${unknown.join(", ")}`);
  const missing = required.find((key) => !values.has(key));
  if (missing !== undefined) throw new Error(`candidate optionが必要です: ${missing}`);
  const value = (key: (typeof required)[number]): string => {
    const found = values.get(key);
    if (found === undefined) throw new Error(`candidate optionが必要です: ${key}`);
    return found;
  };
  const defaultBranchRef = value("--default-branch-ref");
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(defaultBranchRef) || defaultBranchRef.includes("..") || defaultBranchRef.includes("//")) {
    throw new Error("default branch refが不正です");
  }
  const runAttempt = value("--run-attempt");
  if (!/^[1-9][0-9]*$/.test(runAttempt)) throw new Error("run attemptがcanonical positive decimalではありません");
  return {
    output: resolve(value("--output")),
    repositoryId: parseDecimalId(value("--repository-id")),
    repository: parseRepositoryFullName(value("--repository")),
    workflowRunId: parseDecimalId(value("--run-id")),
    workflowRunAttempt: parsePositiveSafeInteger(Number(runAttempt)),
    triggerSha: parseSha(value("--trigger-sha")),
    defaultBranchSha: parseSha(value("--default-branch-sha")),
    defaultBranchRef,
    resumeClosed,
  };
}
