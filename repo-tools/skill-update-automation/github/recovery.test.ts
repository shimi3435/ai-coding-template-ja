import assert from "node:assert/strict";
import test from "node:test";

import { executeRecoverableWrite } from "./recovery.ts";

test("failed write is accepted when reread proves the candidate state", async () => {
  let writes = 0;
  const result = await executeRecoverableWrite({
    expectedBefore: "before",
    candidateAfter: "after",
    write: async () => {
      writes += 1;
      throw new Error("response lost");
    },
    read: async () => "after",
  });

  assert.deepEqual(result, { kind: "applied", attempts: 1, recovered: true });
  assert.equal(writes, 1);
});

test("failed write retries once only when reread proves expected-before", async () => {
  let writes = 0;
  let current = "before";
  const result = await executeRecoverableWrite({
    expectedBefore: "before",
    candidateAfter: "after",
    write: async () => {
      writes += 1;
      if (writes === 1) throw new Error("temporary failure");
      current = "after";
    },
    read: async () => current,
  });

  assert.deepEqual(result, { kind: "applied", attempts: 2, recovered: false });
  assert.equal(writes, 2);
});

test("unknown post-state stops without retry", async () => {
  let writes = 0;
  const result = await executeRecoverableWrite({
    expectedBefore: "before",
    candidateAfter: "after",
    write: async () => {
      writes += 1;
      throw new Error("write failed");
    },
    read: async () => "human-state",
  });

  assert.deepEqual(result, { kind: "recovery-required", attempts: 1 });
  assert.equal(writes, 1);
});

test("successful response still requires the candidate post-state", async () => {
  const result = await executeRecoverableWrite({
    expectedBefore: { sha: "before" },
    candidateAfter: { sha: "after" },
    write: async () => undefined,
    read: async () => ({ sha: "human-state" }),
  });

  assert.deepEqual(result, { kind: "recovery-required", attempts: 1 });
});

test("normalized object states compare structurally by default", async () => {
  const result = await executeRecoverableWrite({
    expectedBefore: { sha: "before" },
    candidateAfter: { sha: "after" },
    write: async () => {
      throw new Error("response lost");
    },
    read: async () => ({ sha: "after" }),
  });

  assert.deepEqual(result, { kind: "applied", attempts: 1, recovered: true });
});
