import assert from "node:assert/strict";
import test from "node:test";

import { decodeCanonicalJson, encodeCanonicalJson } from "./canonical-json.ts";

test("canonical JSON preserves schema order and escapes HTML-sensitive characters", () => {
  const schema = {
    parse(value: unknown) {
      assert.deepEqual(value, { second: "<&>", first: 1 });
      return { first: 1, second: "<&>" } as const;
    },
  };

  const encoded = encodeCanonicalJson(schema, { second: "<&>", first: 1 });

  assert.equal(encoded.toString("utf8"), '{"first":1,"second":"\\u003c\\u0026\\u003e"}');
  assert.deepEqual(decodeCanonicalJson(schema, encoded), { first: 1, second: "<&>" });
});

test("canonical JSON rejects malformed and noncanonical bytes", () => {
  const schema = { parse: (value: unknown) => value };
  for (const bytes of [
    Buffer.from([0xff]),
    Buffer.from("\ufeff{}", "utf8"),
    Buffer.from('{"value":1,"value":1}', "utf8"),
    Buffer.from('{ "value":1}', "utf8"),
    Buffer.from('{"value":"<"}', "utf8"),
  ]) {
    assert.throws(() => decodeCanonicalJson(schema, bytes));
  }
});
