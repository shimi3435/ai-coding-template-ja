import { utf8Compare } from "./canonical.ts";
import type { RemoteCohortObservation } from "./github.ts";
import { sha256 } from "./legal.ts";

function canonicalRef(observation: RemoteCohortObservation): Readonly<Record<string, string>> {
  if ("branch" in observation.ref) return { branch: observation.ref.branch };
  if ("commit" in observation.ref) return { commit: observation.ref.commit };
  return { semver: observation.ref.semver };
}

export function remoteObservationFingerprint(observation: RemoteCohortObservation): string {
  const entries = [...observation.entries]
    .sort((left, right) => utf8Compare(left.name, right.name))
    .map((entry) => ({
      name: entry.name,
      treeHash: entry.tree.treeHash,
      fileCount: entry.tree.fileCount,
      byteCount: entry.tree.byteCount,
      legalFiles: [...entry.legalFiles]
        .sort((left, right) =>
          utf8Compare(left.targetPath, right.targetPath) ||
          utf8Compare(left.sourcePath, right.sourcePath) ||
          utf8Compare(left.sha256, right.sha256))
        .map((file) => ({
          sourcePath: file.sourcePath,
          targetPath: file.targetPath,
          sha256: file.sha256,
        })),
    }));
  const canonical = JSON.stringify({
    repository: observation.repository,
    ref: canonicalRef(observation),
    resolvedCommit: observation.resolvedCommit,
    verification: observation.verification,
    selectedTag: observation.selectedTag ?? null,
    selectedVersion: observation.selectedVersion ?? null,
    entries,
  });
  return sha256(Buffer.from(canonical, "utf8"));
}
