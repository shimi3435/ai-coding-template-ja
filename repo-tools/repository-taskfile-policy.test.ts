import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { cli, writeValidRepository } from "./repository-contracts-test-fixture.ts";

type Mapping = Record<string, unknown>;
function checkOptions(scope: string, options: Mapping) {
  const repository = writeValidRepository();
  const path = join(repository, "Taskfile.yml");
  const data = parse(readFileSync(path, "utf8"));
  const extra: Mapping = { cmds: ["echo safe"] };
  data.tasks.extra = extra;
  const target = scope === "root" ? data : scope === "check" ? data.tasks.check : extra;
  if (scope === "command" || scope === "call") {
    extra.cmds = [{ [scope === "command" ? "cmd" : "task"]: "echo safe", ...options }];
  } else Object.assign(target, options);
  writeFileSync(path, JSON.stringify(data));
  return spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
}

for (const [scope, options] of [
  ["check", { if: "exit 1" }], ["check", { status: ["true"] }],
  ["command", { if: "npx fetched-tool" }], ["extra", { if: "npx fetched-tool" }],
  ["extra", { status: ["npx fetched-tool"] }],
  ["extra", { preconditions: [{ sh: "npx fetched-tool" }] }],
  ["extra", { vars: { TOOL: { sh: "npx fetched-tool" } } }],
  ["call", { vars: { TOOL: { sh: "npx fetched-tool" } } }],
  ["root", { vars: { TOOL: { sh: "npx fetched-tool" } } }],
] satisfies [string, Mapping][]) {
  test(`check-contracts rejects executable auxiliary: ${scope} ${JSON.stringify(options)}`, () => {
    const result = checkOptions(scope, options);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml/);
  });
}

for (const scope of ["root", "check", "extra", "command", "call"]) {
  for (const value of [false, null, [], ""]) {
    test(`check-contracts rejects unknown keys even when inactive: ${scope} ${JSON.stringify(value)}`, () => {
      const result = checkOptions(scope, { unknown: value });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /unknown/);
    });
  }
}
for (const field of ["sources", "generates", "platforms", "run", "method", "deps", "ignore_error", "internal", "silent", "vars"]) {
  test(`check-contracts rejects check option ${field}`, () => {
    const result = checkOptions("check", { [field]: null });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(field));
  });
}
for (const [scope, options] of [
  ["root", { includes: {} }], ["root", { env: {} }],
  ["check", { desc: null }], ["extra", { desc: 42 }],
  ["extra", { silent: "true" }], ["command", { silent: 1 }], ["call", { silent: null }],
  ["command", { vars: {} }], ["extra", { vars: null }], ["extra", { vars: [] }],
  ["extra", { vars: { " ": "value" } }], ["extra", { vars: { VALUE: 1 } }],
  ["extra", { vars: { VALUE: false } }], ["call", { vars: { VALUE: null } }],
  ["call", { vars: { VALUE: [] } }], ["call", { vars: { VALUE: { ref: ".OTHER" } } }],
] satisfies [string, Mapping][]) {
  test(`check-contracts rejects unsupported options: ${scope} ${JSON.stringify(options)}`, () => {
    const result = checkOptions(scope, options);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml/);
  });
}
for (const [scope, options] of [
  ["check", { desc: "" }], ["extra", { desc: "説明", silent: false, vars: {} }],
  ["extra", { vars: { EMPTY: "", TEXT: "npx data", TEMPLATE: "{{.OTHER}}" } }],
  ["command", { silent: true }], ["call", { silent: false, vars: { TEXT: "npx data" } }],
] satisfies [string, Mapping][]) {
  test(`check-contracts accepts static options: ${scope} ${JSON.stringify(options)}`, () => {
    const result = checkOptions(scope, options);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /forbidden Node runners in static command text: none/);
  });
}
