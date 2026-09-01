import {
  upsertIssueEntry,
  type IssueEntry,
  type IssueEntryObservation,
} from "../model/index.ts";

export type IssueReducerInput = Readonly<{
  currentEntries: readonly IssueEntry[];
  observations: readonly IssueEntryObservation[];
  resolvedKeys: readonly string[];
}>;

export function reduceIssueEntries(input: IssueReducerInput): readonly IssueEntry[] {
  const resolved = new Set(input.resolvedKeys);
  let entries = input.currentEntries.filter((entry) => !resolved.has(entry.key));
  for (const observation of input.observations) {
    entries = [...upsertIssueEntry(entries, observation)];
  }
  return entries;
}
