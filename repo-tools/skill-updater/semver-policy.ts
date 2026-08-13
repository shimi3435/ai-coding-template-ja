import { compare, satisfies, valid, validRange } from "semver";
import { utf8Compare } from "./canonical.ts";

export type SemverTag = Readonly<{ tag: string; commit: string }>;
export type SelectedSemverTag = Readonly<{ tag: string; version: string; commit: string }>;

const commitPattern = /^[0-9a-f]{40}$/;

export function validateSemverRange(range: string): string {
  if (range.trim().length === 0 || validRange(range) === null) {
    throw new Error(`SemVer range が不正です: ${JSON.stringify(range)}`);
  }
  return range;
}

export function selectHighestSemverTag(
  range: string,
  tags: readonly SemverTag[],
): SelectedSemverTag {
  validateSemverRange(range);
  const byVersion = new Map<string, SemverTag[]>();
  let validCandidates = 0;
  for (const tag of tags) {
    if (!commitPattern.test(tag.commit)) {
      throw new Error(`tag commit が lowercase 40-hex ではありません: ${tag.tag}`);
    }
    const version = valid(tag.tag);
    if (version === null) {
      continue;
    }
    validCandidates += 1;
    if (validCandidates > 500) {
      throw new Error("valid SemVer tag candidates が500件を超えています");
    }
    const candidates = byVersion.get(version) ?? [];
    candidates.push(tag);
    byVersion.set(version, candidates);
  }

  const satisfying = [...byVersion.entries()].filter(([version]) => satisfies(version, range));
  if (satisfying.length === 0) {
    throw new Error(`SemVer range を満たすtagがありません: ${range}`);
  }
  satisfying.sort(([left], [right]) => compare(left, right));
  const [version, candidates] = satisfying.at(-1)!;
  const commits = new Set(candidates.map((candidate) => candidate.commit));
  if (commits.size !== 1) {
    throw new Error(`同一canonical versionのtagが異なるcommitを指します: ${version}`);
  }
  const selected = [...candidates].sort((left, right) => utf8Compare(left.tag, right.tag))[0]!;
  return { tag: selected.tag, version, commit: selected.commit };
}
