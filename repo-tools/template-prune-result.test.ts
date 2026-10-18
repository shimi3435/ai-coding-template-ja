import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseResult, successful } from "./template-prune-result.ts";

const good = () => ({ state: "pruned", coverage: "evaluated", references: [], errors: [], analysis_errors: [], unevaluated: [], edits: {} });
const error = { surface: "R04", source: "scripts/probe.sh", line: 1, kind: "syntax", reason: "invalid shell" };

test("bundled/pruned require all error channels to be empty", () => {
  for (const state of ["bundled", "pruned"]) {
    assert.equal(successful(parseResult(JSON.stringify({ ...good(), state }))), true);
    assert.equal(successful(parseResult(JSON.stringify({ ...good(), state, coverage: "partial", analysis_errors: [error] }))), false);
    assert.equal(successful(parseResult(JSON.stringify({ ...good(), state, references: [{ ...error, target: "check:template" }] }))), false);
    assert.equal(successful(parseResult(JSON.stringify({ ...good(), state, errors: [error] }))), false);
  }
});
test("partial without analysis failure remains successful", () => {
  const value = { ...good(), coverage: "partial", unevaluated: [{ ...error, kind: "placeholder" }] };
  assert.equal(successful(parseResult(JSON.stringify(value))), true);
});
for (const field of ["state", "coverage", "references", "errors", "analysis_errors", "unevaluated", "edits"]) {
  test(`missing ${field} never defaults to success`, () => {
    const value: Record<string, unknown> = good();
    delete value[field];
    assert.throws(() => parseResult(JSON.stringify(value)), /protocol/);
  });
}
for (const value of [
  { ...good(), state: "unknown" },
  { ...good(), coverage: "not-run" },
  { ...good(), analysis_errors: [error] },
  { ...good(), coverage: "partial", analysis_errors: [{ ...error, kind: "unsupported" }] },
  { ...good(), coverage: "partial", analysis_errors: [{ ...error, line: 0 }] },
  { ...good(), coverage: "partial", analysis_errors: [{ ...error, field_path: ["steps", -1] }] },
  { ...good(), coverage: "partial", analysis_errors: [{ ...error, shell_range: { line: 2, line_end: 1 } }] },
]) {
  test(`invalid scanner protocol: ${JSON.stringify(value)}`, () => assert.throws(() => parseResult(JSON.stringify(value)), /protocol/));
}

const corpus = JSON.parse(readFileSync(new URL("../tests/fixtures/template_prune/protocol.json", import.meta.url), "utf8"));
for (const entry of corpus) {
  test(`shared protocol corpus: ${entry.name}`, () => {
    const parse = () => parseResult(JSON.stringify(entry.result));
    if (entry.valid) assert.doesNotThrow(parse);
    else assert.throws(parse, /protocol/);
  });
}
