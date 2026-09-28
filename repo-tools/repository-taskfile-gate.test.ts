import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { writeValidRepository } from "./repository-contracts-test-fixture.ts";

function fixture(options: Record<string, unknown> = {}) {
  const cwd = writeValidRepository();
  const path = join(cwd, "Taskfile.yml");
  const data = parse(readFileSync(path, "utf8"));
  Object.assign(data.tasks.check, options);
  writeFileSync(path, JSON.stringify(data));
  mkdirSync(join(cwd, "scripts with spaces"));
  const script = join(cwd, "scripts with spaces", "check.sh");
  copyFileSync(new URL("../scripts/check.sh", import.meta.url), script);
  chmodSync(script, 0o755);
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  const nested = join(cwd, "directory with spaces");
  mkdirSync(nested);
  const marker = join(cwd, "executed");
  const task = spawnSync("sh", ["-c", "command -v task"], { encoding: "utf8" });
  assert.equal(task.status, 0, "Task must be installed");
  writeFileSync(join(bin, "node"), `#!/bin/sh
if [ "$2" = check-contracts ]; then
  printf 'checker\\n' >> "$GATE_MARKER"
  exec "$REAL_NODE" "$REAL_ENTRYPOINT" check-contracts
fi
printf '%s\\n' "$*" >> "$GATE_MARKER"
exit "\${GATE_NODE_EXIT:-0}"
`, { mode: 0o755 });
  writeFileSync(join(bin, "task"), '#!/bin/sh\nprintf "task\\n" >> "$GATE_MARKER"\nexec "$REAL_TASK" "$@"\n', { mode: 0o755 });
  // 回帰時にも実パッケージを取得しない。
  writeFileSync(join(bin, "npx"), '#!/bin/sh\nexit 97\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GATE_MARKER: marker,
    REAL_NODE: process.execPath, REAL_ENTRYPOINT: new URL("./entrypoint.mjs", import.meta.url).pathname,
    REAL_TASK: task.stdout.trim() };
  return { cwd, nested, path, data, script, marker, env };
}
function gate(input: ReturnType<typeof fixture>, args: string[] = [], cwd = input.nested) {
  return spawnSync(input.script, args, { cwd, env: input.env, encoding: "utf8" });
}
for (const options of [{ if: "exit 1" }, { status: ["true"] }]) {
  test(`canonical gate rejects skip before starting Task: ${JSON.stringify(options)}`, () => {
    const input = fixture(options);
    const result = gate(input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml/);
    assert.equal(readFileSync(input.marker, "utf8"), "checker\n");
  });
}
test("canonical gate rejects static runner synthesis before starting Task", () => {
  const input = fixture();
  input.data.tasks.extra = { vars: { TOOL: "npx" }, cmds: ["{{.TOOL}} fetched-tool"] };
  writeFileSync(input.path, JSON.stringify(input.data));
  assert.notEqual(gate(input).status, 0);
  assert.equal(readFileSync(input.marker, "utf8"), "checker\n");
});
test("canonical gate uses its own repository from an unrelated cwd", () => {
  const input = fixture();
  const result = gate(input, [], "/tmp");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(input.marker, "utf8"),
    "checker\ntask\nrepo-tools/entrypoint.mjs skills:verify\n--test repo-tools/*.test.ts\n");
});
test("canonical gate propagates real Task failure from a subdirectory", () => {
  const input = fixture();
  Object.assign(input.env, { GATE_NODE_EXIT: "7" });
  const result = gate(input);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exit status 7/);
  assert.equal(readFileSync(input.marker, "utf8"), "checker\ntask\nrepo-tools/entrypoint.mjs skills:verify\n");
  const direct = spawnSync(input.env.REAL_TASK, ["check"], { cwd: input.cwd, env: input.env });
  assert.equal(result.status, direct.status);
});
for (const arg of ["--help", "", "check"]) {
  test(`canonical gate rejects arguments before execution: ${JSON.stringify(arg)}`, () => {
    const input = fixture();
    const result = gate(input, [arg]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /usage:/);
    assert.equal(existsSync(input.marker), false);
  });
}
