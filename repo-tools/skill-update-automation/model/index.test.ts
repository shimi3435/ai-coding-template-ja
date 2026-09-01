import assert from "node:assert/strict";
import test from "node:test";

import * as model from "./index.ts";

test("automation model exposes codecs and pure reducers through one public module", () => {
  for (const name of [
    "decodeArtifactManifest",
    "decodeDraftReceipt",
    "decodeIssueEnvelope",
    "decodePrEnvelope",
    "decodeSmokePreview",
    "evaluateTrigger",
    "selectPrHistoryState",
  ]) {
    assert.equal(typeof model[name as keyof typeof model], "function", name);
  }
});
