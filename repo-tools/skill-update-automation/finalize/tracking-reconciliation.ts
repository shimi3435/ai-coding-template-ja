import {
  computeIssueEntryKey,
  type FailureState,
  type IssueEntry,
  type IssueEntryObservation,
} from "../model/index.ts";

const detectionStates: readonly FailureState[] = [
  "updater-rejected", "candidate-invalid", "permission-denied", "recovery-required", "intervention-required",
  "generation-conflict", "open-pr-conflict", "paused-closed",
];

export function isDetectionEntry(entry: IssueEntry): boolean {
  if (!detectionStates.includes(entry.state)) return false;
  if (entry.state === "updater-rejected" || entry.state === "candidate-invalid") return true;
  if (entry.scope.kind === "global") return entry.scope.operation === "detect" || entry.scope.operation === "publish-draft";
  return entry.state === "intervention-required" || entry.state === "generation-conflict" ||
    entry.state === "open-pr-conflict" || entry.state === "paused-closed";
}

export function planTrackingReconciliation(input: Readonly<{
  observations: readonly IssueEntryObservation[];
  resolvedKeys?: readonly string[];
  reconcileDetection: boolean;
  reconcileCleanup: boolean;
}>): Readonly<{
  observations: readonly IssueEntryObservation[];
  resolveCurrent: (entries: readonly IssueEntry[]) => readonly string[];
}> {
  const observedKeys = new Set(input.observations.map((observation) =>
    computeIssueEntryKey(observation.state, observation.scope)));
  const resolvedKeys = new Set(input.resolvedKeys ?? []);
  return {
    observations: input.observations,
    resolveCurrent: (entries) => entries
      .filter((entry) => resolvedKeys.has(entry.key) ||
        (input.reconcileDetection && isDetectionEntry(entry) && !observedKeys.has(entry.key)) ||
        (input.reconcileCleanup && entry.state === "cleanup-failed" && !observedKeys.has(entry.key)))
      .map((entry) => entry.key),
  };
}
