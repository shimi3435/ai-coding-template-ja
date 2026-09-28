import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { writeValidRepository } from "../repository-contracts-test-fixture.ts";

const entrypoint = new URL("../entrypoint.mjs", import.meta.url).pathname;
function fixture(options: Record<string, unknown> = {}) {
  const cwd = writeValidRepository();
  const path = join(cwd, "Taskfile.yml");
  const data = parse(readFileSync(path, "utf8"));
  Object.assign(data.tasks.check, options);
  writeFileSync(path, JSON.stringify(data));
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  const marker = join(cwd, "executed");
  writeFileSync(join(bin, "node"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GATE_MARKER"\nexit "${GATE_NODE_EXIT:-0}"\n', { mode: 0o755 });
  // 禁止 runner の probe で実パッケージを取得しない。
  writeFileSync(join(bin, "npx"), '#!/bin/sh\nprintf "npx\\n" >> "$GATE_MARKER"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GATE_MARKER: marker, CHECK_NODE: process.execPath, CHECK_ENTRYPOINT: entrypoint };
  return { cwd, path, data, marker, env };
}
function gate(input: ReturnType<typeof fixture>) {
  return spawnSync("sh", ["-c", '"$CHECK_NODE" "$CHECK_ENTRYPOINT" check-contracts && task check'], {
    cwd: input.cwd, env: input.env, encoding: "utf8",
  });
}

test("gate integration uses the CI-pinned real Task version", () => {
  const result = spawnSync("task", ["--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^(?:Task version: v?)?3\.51\.1\s*$/);
});
for (const options of [{ if: "exit 1" }, { status: ["true"] }]) {
  test(`independent gate rejects a successful Task skip: ${JSON.stringify(options)}`, () => {
    const input = fixture(options);
    const skipped = spawnSync("task", ["check"], { cwd: input.cwd, env: input.env, encoding: "utf8" });
    assert.equal(skipped.status, 0, skipped.stderr);
    assert.equal(existsSync(input.marker), false);
    const result = gate(input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml/);
    assert.equal(existsSync(input.marker), false);
  });
}
for (const [name, extra] of Object.entries({
  "command if": { cmds: [{ cmd: "echo safe", if: "npx fetched-tool" }] },
  "task if": { cmds: ["echo safe"], if: "npx fetched-tool" },
  status: { cmds: ["echo safe"], status: ["npx fetched-tool"] },
  preconditions: { cmds: ["echo safe"], preconditions: [{ sh: "npx fetched-tool" }] },
  "static variable": { vars: { TOOL: "npx" }, cmds: ["{{.TOOL}} fetched-tool"] },
  "dynamic variable": { vars: { TOOL: { sh: "npx fetched-tool" } }, cmds: ["echo {{.TOOL}}"] },
})) {
  test(`independent gate stops before auxiliary execution: ${name}`, () => {
    const input = fixture();
    input.data.tasks.extra = extra;
    input.data.tasks.check.cmds.unshift({ task: "extra" });
    writeFileSync(input.path, JSON.stringify(input.data));
    const result = gate(input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml/);
    assert.equal(existsSync(input.marker), false);
    const unguarded = spawnSync("task", ["extra"], { cwd: input.cwd, env: input.env, encoding: "utf8" });
    assert.equal(unguarded.status, 0, unguarded.stderr);
    assert.equal(readFileSync(input.marker, "utf8"), "npx\n");
  });
}

test("allowed Taskfile reaches real Task and runs both required commands", () => {
  const input = fixture();
  const result = gate(input);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(input.marker, "utf8").trim().split("\n"), [
    "repo-tools/entrypoint.mjs skills:verify", "--test repo-tools/*.test.ts",
  ]);
});

test("independent gate propagates a real Task command failure", () => {
  const input = fixture();
  Object.assign(input.env, { GATE_NODE_EXIT: "7" });
  const result = gate(input);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exit status 7/);
  assert.equal(readFileSync(input.marker, "utf8"), "repo-tools/entrypoint.mjs skills:verify\n");
});
