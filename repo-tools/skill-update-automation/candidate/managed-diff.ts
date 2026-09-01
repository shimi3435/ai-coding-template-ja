import { execFileSync } from "node:child_process";

import { validateCanonicalPath, type SkillCommandResult } from "../../skill-updater/index.ts";

function changedPaths(repositoryRoot: string): readonly string[] {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"],
    { cwd: repositoryRoot },
  );
  if (output.length === 0) return [];
  return output.toString("utf8").split("\0").filter((entry) => entry.length > 0).map((entry) => entry.slice(3));
}

export function managedPathsFromReports(...reports: readonly SkillCommandResult[]): readonly string[] {
  const names = new Set<string>();
  for (const report of reports) {
    for (const cohort of report.report.cohorts) {
      for (const name of cohort.names) {
        validateCanonicalPath(name);
        if (name.includes("/")) throw new Error(`updater skill nameが単一path segmentではありません: ${name}`);
        names.add(name);
      }
    }
  }
  return [".agents/skills/skills.lock.json", ...[...names].sort().map((name) => `.agents/skills/${name}`)];
}

function isWithin(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}

export function assertOnlyManagedChanges(repositoryRoot: string, managedPaths: readonly string[]): readonly string[] {
  const changed = changedPaths(repositoryRoot);
  const unmanaged = changed.filter((path) => !managedPaths.some((managed) => isWithin(path, managed)));
  if (unmanaged.length > 0) throw new Error(`managed path外に差分があります: ${unmanaged.join(", ")}`);
  return changed;
}
