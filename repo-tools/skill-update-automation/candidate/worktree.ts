import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

export function git(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

export function cleanupTemporaryWorktree(
  repositoryRoot: string,
  temporary: string,
  worktree: string,
  worktreeAdded: boolean,
): string | undefined {
  if (worktreeAdded) {
    try {
      git(repositoryRoot, ["worktree", "remove", "--force", worktree]);
    } catch {
      // The owned temporary directory is removed below, then stale metadata is pruned and checked.
    }
  }
  try {
    rmSync(temporary, { recursive: true, force: true });
  } catch (error: unknown) {
    return `temporary artifact cleanup失敗: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!worktreeAdded) return undefined;
  try {
    git(repositoryRoot, ["worktree", "prune"]);
    const remaining = git(repositoryRoot, ["worktree", "list", "--porcelain"]);
    if (remaining.split("\n").includes(`worktree ${worktree}`)) return `temporary worktreeが残存しています: ${worktree}`;
  } catch (error: unknown) {
    return `temporary worktree cleanup検証失敗: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
}
