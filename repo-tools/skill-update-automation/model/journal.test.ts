import assert from "node:assert/strict";
import test from "node:test";

import {
  appendJournalEntryDigest,
  decodeJournalEntryV2,
  encodeJournalEntryV2,
  journalCommentBody,
  reduceJournalCommentsV2,
  type JournalCommentV2,
  type JournalEntryV2Input,
} from "./journal.ts";

const digest = (character: string): string => `sha256:${character.repeat(64)}`;

function input(overrides: Partial<JournalEntryV2Input> = {}): JournalEntryV2Input {
  return {
    schemaVersion: 2,
    resourceKind: "pull-request",
    resourceNumber: 7,
    creatorUserId: "123",
    sequence: 1,
    previousDigest: null,
    phase: "committed",
    operation: "root",
    operationId: digest("a"),
    snapshot: {
      kind: "full-snapshot",
      state: '{"draft":true,"headSha":"1111111111111111111111111111111111111111"}',
      stateDigest: "",
    },
    ...overrides,
  };
}

function comment(id: string, authorUserId: string, entry: ReturnType<typeof appendJournalEntryDigest>): JournalCommentV2 {
  return {
    id,
    authorUserId,
    createdAt: "2026-08-27T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
    body: journalCommentBody(entry),
  };
}

test("journal v2 entry roundtrips with canonical full snapshot and digest", () => {
  const entry = appendJournalEntryDigest(input());
  assert.equal(entry.snapshot.stateDigest, "sha256:48632c86cda64db96b0b60782ab64f3f7015d5a1b53ebe2e0256027ce8f3a0f9");
  assert.deepEqual(decodeJournalEntryV2(encodeJournalEntryV2(entry)), entry);
  assert.throws(() => encodeJournalEntryV2({ ...entry, digest: digest("f") }), /digest/);
});

test("journal reducer rejects edited, missing, forked, and foreign-author markers", () => {
  const first = appendJournalEntryDigest(input());
  const second = appendJournalEntryDigest(input({
    sequence: 2,
    previousDigest: first.digest,
    operation: "validation",
    operationId: digest("b"),
  }));
  assert.deepEqual(reduceJournalCommentsV2([comment("10", "123", first), comment("11", "123", second)], "123"), {
    entries: [first, second],
    pending: null,
    snapshot: second.snapshot,
  });

  assert.throws(() => reduceJournalCommentsV2([{ ...comment("10", "123", first), updatedAt: "2026-08-27T00:00:01Z" }], "123"), /edited/);
  assert.throws(() => reduceJournalCommentsV2([comment("11", "123", second)], "123"), /sequence/);
  const fork = appendJournalEntryDigest(input({
    sequence: 1,
    previousDigest: first.digest,
    operation: "validation",
    operationId: digest("c"),
  }));
  assert.throws(() => reduceJournalCommentsV2([comment("10", "123", first), comment("12", "123", fork)], "123"), /sequence/);
  assert.throws(() => reduceJournalCommentsV2([comment("10", "999", first)], "123"), /author/);
});

test("prepared transition permits exactly one matching committed entry or terminal recovery", () => {
  const root = appendJournalEntryDigest(input());
  const prepared = appendJournalEntryDigest(input({
    sequence: 2,
    previousDigest: root.digest,
    phase: "prepared",
    operation: "branch-append",
    operationId: digest("b"),
  }));
  const pending = reduceJournalCommentsV2([comment("10", "123", root), comment("11", "123", prepared)], "123");
  assert.equal(pending.pending?.operationId, prepared.operationId);

  const committed = appendJournalEntryDigest(input({
    sequence: 3,
    previousDigest: prepared.digest,
    phase: "committed",
    operation: "branch-append",
    operationId: prepared.operationId,
  }));
  assert.equal(reduceJournalCommentsV2([
    comment("10", "123", root), comment("11", "123", prepared), comment("12", "123", committed),
  ], "123").pending, null);

  const wrongSnapshot = appendJournalEntryDigest(input({
    sequence: 3,
    previousDigest: prepared.digest,
    phase: "committed",
    operation: "branch-append",
    operationId: prepared.operationId,
    snapshot: { ...prepared.snapshot, state: '{"draft":true,"headSha":"2222222222222222222222222222222222222222"}', stateDigest: "" },
  }));
  assert.throws(() => reduceJournalCommentsV2([
    comment("10", "123", root), comment("11", "123", prepared), comment("12", "123", wrongSnapshot),
  ], "123"), /snapshot/);

  const wrong = appendJournalEntryDigest(input({
    sequence: 3,
    previousDigest: prepared.digest,
    phase: "committed",
    operation: "pr-ready",
    operationId: prepared.operationId,
  }));
  assert.throws(() => reduceJournalCommentsV2([
    comment("10", "123", root), comment("11", "123", prepared), comment("12", "123", wrong),
  ], "123"), /prepared/);
});

test("human comments are ignored but partial or foreign v2 markers fail closed", () => {
  const root = appendJournalEntryDigest(input());
  assert.equal(reduceJournalCommentsV2([
    { ...comment("9", "999", root), body: "human note" },
    comment("10", "123", root),
  ], "123").entries.length, 1);
  assert.throws(() => reduceJournalCommentsV2([
    comment("10", "123", root),
    { ...comment("11", "999", root), body: "<!-- skill-update-pr-automation:journal:v2:start -->" },
  ], "123"), /marker/);
});
