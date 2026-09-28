import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { cli, writeValidRepository } from "./repository-contracts-test-fixture.ts";

function check(name: string, command: unknown, options = {}) {
  const cwd = writeValidRepository();
  const path = join(cwd, "Taskfile.yml");
  const data = parse(readFileSync(path, "utf8"));
  data.tasks[name] = { cmds: [command], ...options };
  writeFileSync(path, JSON.stringify(data));
  return spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd, encoding: "utf8" });
}
const exceptions = [
  ["doctor", "uv run --no-sync python scripts/doctor.py"],
  ["rename", "uv run python scripts/rename-package.py"],
  ...["links", "verify", "check", "update", "repin", "adopt-local", "migrate"].map(name =>
    [`skills:${name}`, `node repo-tools/entrypoint.mjs skills:${name}`]),
  ["prune-template-docs", "uv run --no-sync python scripts/prune-template-docs.py"],
];
for (const [name, prefix] of exceptions) {
  for (const object of [false, true]) {
    test(`CLI_ARGS exception accepts exact task/command pair: ${name} object=${object}`, () => {
      const text = `  ${prefix} {{.CLI_ARGS}}  `;
      const result = check(name, object ? { cmd: text } : text);
      assert.equal(result.status, 0, result.stderr);
    });
  }
  test(`CLI_ARGS exception cannot move to another task: ${name}`, () => {
    assert.notEqual(check("extra", `${prefix} {{.CLI_ARGS}}`).status, 0);
  });
}
for (const command of [
  "{{.TOOL}} fetched-tool", "{{printf \"%s%s\" \"np\" \"x\"}} fetched-tool",
  "{{.CLI_ARGS}}", "echo {{.CLI_ARGS}}", "echo {{ .CLI_ARGS }}", "echo {{- .CLI_ARGS -}}",
  "echo {{", "echo '{{.TOOL}}'", { cmd: "{{.TOOL}} fetched-tool" },
  { task: "{{.TOOL}}" }, { task: "{{.CLI_ARGS}}" },
]) {
  test(`rejects arbitrary templates without evaluating: ${JSON.stringify(command)}`, () => {
    const result = check("extra", command);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml/);
  });
}
for (const command of [
  "uv run --no-sync python scripts/doctor.py {{.CLI_ARGS}} {{.CLI_ARGS}}",
  "uv run --no-sync python scripts/doctor.py {{.CLI_ARGS}}; echo extra",
  "uv run --no-sync python scripts/doctor.py\n{{.CLI_ARGS}}",
  "uv run --no-sync python scripts/doctor.py '{{.CLI_ARGS}}'",
]) {
  test(`rejects altered CLI_ARGS exception: ${JSON.stringify(command)}`, () => {
    assert.notEqual(check("doctor", command).status, 0);
  });
}
test("rejects static vars that synthesize a forbidden runner", () => {
  const result = check("extra", "{{.TOOL}} fetched-tool", { vars: { TOOL: "npx" } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /vars/);
});
test("template-like prose remains non-executable", () => {
  assert.equal(check("extra", "echo safe", { desc: "{{.TOOL}}" }).status, 0);
});
