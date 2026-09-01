import assert from "node:assert/strict";
import test from "node:test";

import { computeIssueEntryKey, type IssueEntryObservation } from "../model/index.ts";
import { reduceIssueEntries } from "./issue-reducer.ts";

const scope = { kind: "global" as const, operation: "detect" as const };
const digest = (digit: string): string => `sha256:${digit.repeat(64)}`;

function observation(at: string, detailDigit: string): IssueEntryObservation {
  return {
    state: "updater-rejected",
    scope,
    seen: { run: { workflowRunId: "10", workflowRunAttempt: 1 }, at },
    detailDigest: digest(detailDigit),
    summary: `failure-${detailDigit}`,
  };
}

test("same issue state and scope deduplicate while preserving firstSeen", () => {
  const entries = reduceIssueEntries({
    currentEntries: [],
    observations: [
      observation("2026-08-20T00:00:00.000Z", "1"),
      observation("2026-08-20T01:00:00.000Z", "2"),
    ],
    resolvedKeys: [],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.firstSeen.at, "2026-08-20T00:00:00.000Z");
  assert.equal(entries[0]?.lastSeen.at, "2026-08-20T01:00:00.000Z");
  assert.equal(entries[0]?.detailDigest, digest("2"));
});

test("freshly resolved entry is removed without inventing another issue state", () => {
  const existing = reduceIssueEntries({
    currentEntries: [],
    observations: [observation("2026-08-20T00:00:00.000Z", "1")],
    resolvedKeys: [],
  });
  const key = computeIssueEntryKey("updater-rejected", scope);

  assert.deepEqual(reduceIssueEntries({
    currentEntries: existing,
    observations: [],
    resolvedKeys: [key],
  }), []);
});
