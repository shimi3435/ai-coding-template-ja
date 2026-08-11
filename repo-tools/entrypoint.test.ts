import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNode24 } from "./entrypoint.mjs";

test("entrypoint accepts only Node 24 before importing TypeScript", () => {
  assert.equal(validateNode24("24.14.1"), null);

  for (const version of ["18.20.8", "23.11.1", "25.8.0", "26.1.0"]) {
    assert.equal(validateNode24(version), `Node.js 24 が必要です（検出: v${version}）`);
  }
});

test("entrypoint parses before the guard on legacy ESM runtimes", () => {
  const source = readFileSync(new URL("./entrypoint.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(source, /^\s*await\s+main\(\);/m);
});
