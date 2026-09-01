import { execFileSync } from "node:child_process";

import { parseDecimalId, parsePositiveSafeInteger, parseSha } from "../model/index.ts";

function git(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

export function verifyCandidateBundle(input: Readonly<{
  repositoryRoot: string;
  bundlePath: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  baseHeadSha: string;
  candidateSha: string;
  candidateTreeSha: string;
}>): void {
  const workflowRunId = parseDecimalId(input.workflowRunId);
  const workflowRunAttempt = parsePositiveSafeInteger(input.workflowRunAttempt);
  const baseHeadSha = parseSha(input.baseHeadSha);
  const candidateSha = parseSha(input.candidateSha);
  const candidateTreeSha = parseSha(input.candidateTreeSha);
  const sourceRef = `refs/skill-update-automation/run-${workflowRunId}-${workflowRunAttempt}`;
  const temporaryRef = `refs/skill-update-automation/publish/${workflowRunId}-${workflowRunAttempt}`;
  const advertised = git(input.repositoryRoot, ["bundle", "list-heads", input.bundlePath]).split("\n");
  if (advertised.length !== 1 || advertised[0] !== `${candidateSha} ${sourceRef}`) {
    throw new Error("candidate bundle advertised refがmanifestと一致しません");
  }
  git(input.repositoryRoot, ["bundle", "verify", input.bundlePath]);
  try {
    git(input.repositoryRoot, ["fetch", "--no-tags", input.bundlePath, `${sourceRef}:${temporaryRef}`]);
    const commit = git(input.repositoryRoot, ["rev-list", "--parents", "-n", "1", temporaryRef]).split(" ");
    if (commit.length !== 2 || commit[0] !== candidateSha || commit[1] !== baseHeadSha) {
      throw new Error("candidate commit parentがmanifestと一致しません");
    }
    if (git(input.repositoryRoot, ["rev-parse", `${temporaryRef}^{tree}`]) !== candidateTreeSha) {
      throw new Error("candidate commit treeがmanifestと一致しません");
    }
  } finally {
    try {
      git(input.repositoryRoot, ["update-ref", "-d", temporaryRef]);
    } catch {
      // The ref may not exist when fetch itself failed.
    }
  }
}
