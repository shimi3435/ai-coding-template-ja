import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDecimalId,
  parseDigest,
  parseGeneration,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseSha,
  parseUtcTimestamp,
  parseRunRef,
} from "./validation.ts";

test("RunRef accepts exact safe identity and rejects unknown fields", () => {
  assert.deepEqual(parseRunRef({ workflowRunId: "42", workflowRunAttempt: 2 }), {
    workflowRunId: "42",
    workflowRunAttempt: 2,
  });
  assert.throws(() => parseRunRef({ workflowRunId: "42", workflowRunAttempt: 2, extra: true }));
});

test("automation primitives enforce exact formats and numeric boundaries", () => {
  assert.equal(parseSha("a".repeat(40)), "a".repeat(40));
  assert.equal(parseDigest(`sha256:${"b".repeat(64)}`), `sha256:${"b".repeat(64)}`);
  assert.equal(parseDecimalId("18446744073709551615"), "18446744073709551615");
  assert.equal(parsePositiveSafeInteger(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.equal(parseGeneration(999999), 999999);
  assert.equal(parseRepositoryFullName("owner/repo"), "owner/repo");
  assert.equal(parseUtcTimestamp("2026-08-20T01:02:03.004Z"), "2026-08-20T01:02:03.004Z");

  for (const invalid of ["A".repeat(40), "a".repeat(39)]) assert.throws(() => parseSha(invalid));
  for (const invalid of [0, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parsePositiveSafeInteger(invalid));
  for (const invalid of [0, 1_000_000]) assert.throws(() => parseGeneration(invalid));
  for (const invalid of ["owner", "/repo", "owner/repo/name"]) assert.throws(() => parseRepositoryFullName(invalid));
  assert.throws(() => parseUtcTimestamp("2026-08-20T01:02:03Z"));
});
