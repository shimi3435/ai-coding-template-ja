import { validRange } from "semver";

export function validateSemverRange(range: string): string {
  if (!range.trim() || validRange(range) === null) throw new Error("v1 SemVer rangeが不正です");
  return range;
}
