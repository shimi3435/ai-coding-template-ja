import assert from "node:assert/strict";
import test from "node:test";

import { computePrHistoryDigest } from "./history.ts";

const sha = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

test("PR history digest is canonical, PR-number ordered, and rejects contradictory members", () => {
  assert.equal(
    computePrHistoryDigest("123", []),
    "sha256:bef1253a7afb320f0f9f94dec088e3dccf6d16f3c044608e8a606f16a71987b2",
  );
  const first = {
    prNumber: 2,
    state: "closed",
    merged: true,
    headRepositoryId: "123",
    headRef: "refs/heads/automation/skill-updates/g000001",
    headSha: sha("a"),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    titleDigest: digest("b"),
    bodyDigest: digest("c"),
  } as const;
  const second = { ...first, prNumber: 1, merged: false } as const;
  assert.equal(
    computePrHistoryDigest("123", [first, second]),
    computePrHistoryDigest("123", [second, first]),
  );
  assert.throws(() => computePrHistoryDigest("123", [{ ...first, state: "open", merged: true }]));
});
