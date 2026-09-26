import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { cli, writeValidRepository } from "./repository-contracts-test-fixture.ts";

function checkTaskfile(transform: (source: string) => string) {
  const repository = writeValidRepository();
  const path = join(repository, "Taskfile.yml");
  writeFileSync(path, transform(readFileSync(path, "utf8")));
  return spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
}

test("check-contracts rejects duplicate YAML keys even outside inspected tasks", () => {
  const result = checkTaskfile(source => source + "vars:\n  nested:\n    value: first\n    value: second\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Taskfile\.yml.*(?:unique|duplicate)/is);
});

const verifyCommand = "node repo-tools/entrypoint.mjs skills:verify";
const testCommand = "node --test repo-tools/*.test.ts";

function replaceCheck(source: string, body: string): string {
  return source.slice(0, source.indexOf("  check:\n")) + `  check:\n${body}`;
}

test("check-contracts ignores required command names in task descriptions", () => {
  const result = checkTaskfile(source => replaceCheck(source,
    `    desc: ${JSON.stringify(`${verifyCommand} ${testCommand}`)}\n    cmds: [echo omitted]\n`));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /task check/);
});

for (const [name, transform] of Object.entries<(source: string) => string>({
  "quoted keys and extra indentation": source => source.replace(/^  /gm, "    ").replace(/^      /gm, "        ").replace("    check:", '    "check":'),
  "flow collections": source => JSON.stringify(parse(source)),
  "CRLF and BOM": source => "\uFEFF" + source.replaceAll("\n", "\r\n"),
  "YAML 1.2 directive": source => "%YAML 1.2\n---\n" + source,
  "standard core tags": source => source.replace('version: "3"', 'version: !!str "3"'),
  "single command block scalars": source => replaceCheck(source, `    cmds:\n      - |\n        ${verifyCommand}\n      - >-\n        ${testCommand}\n`),
  "outer command whitespace": source => replaceCheck(source, `    cmds:\n      - "  ${verifyCommand}  "\n      - "  ${testCommand}  "\n`),
  "shell punctuation and Unicode descriptions": source => source + '  extra:\n    desc: "日本語・説明"\n    cmds:\n      - "echo &anchor *alias << marker"\n',
  "empty optional tasks": source => source + "  empty: {}\n  empty-list:\n    cmds: []\n",
  "reordered tasks and commands": source => {
    const data = parse(source);
    data.tasks = Object.fromEntries(Object.entries(data.tasks).reverse());
    data.tasks.check.cmds.reverse();
    return JSON.stringify(data);
  },
  "command objects and task calls": source => source + '  extra:\n    cmds:\n      - cmd: echo safe\n        silent: true\n      - task: skills:verify\n        vars: { MESSAGE: "npx in data" }\n',
  "npm command objects": source => source.replace("- npm ci --ignore-scripts", "- cmd: npm ci --ignore-scripts").replace("- npm audit --audit-level=high", "- cmd: npm audit --audit-level=high"),
  "forbidden words only in YAML comments and descriptions": source => source + '  extra:\n    desc: "npx only in prose"\n    cmds:\n      # npx only in a comment\n      - echo safe # npx only in a comment\n',
})) {
  test(`check-contracts accepts equivalent YAML or supported task form: ${name}`, () => {
    const result = checkTaskfile(transform);
    assert.equal(result.status, 0, result.stderr);
  });
}

for (const [name, transform] of Object.entries<(source: string) => string>({
  "empty document": () => "",
  "null root": () => "null\n",
  "sequence root": () => "[]\n",
  "multiple documents": source => source + "---\nother: document\n",
  "syntax error": source => source + "vars: [\n",
  "duplicate root": source => source + "tasks: {}\n",
  "duplicate quoted task": source => source + '  "check": {}\n',
  "anchor": source => source + "vars: { example: &name value }\n",
  "alias": source => source + "vars: { example: *missing }\n",
  "merge key": source => source + 'vars: { "<<": { example: value } }\n',
  "custom tag": source => source + "vars: { example: !custom value }\n",
  "non-core standard tag": source => source + "vars: { example: !!timestamp 2026-01-01 }\n",
  "custom tag directive": source => "%TAG !e! tag:example.invalid,2026:\n---\n" + source,
  "YAML 1.1 directive": source => "%YAML 1.1\n---\n" + source,
  "YAML 1.3 directive": source => "%YAML 1.3\n---\n" + source,
  "unknown directive": source => "%UNSUPPORTED value\n---\n" + source,
  "numeric mapping key": source => source + "vars: { 1: value }\n",
  "collection mapping key": source => source + "vars: { [key]: value }\n",
  "missing tasks": () => 'version: "3"\n',
  "tasks sequence": () => 'version: "3"\ntasks: []\n',
  "task string shorthand": source => source + "  extra: echo safe\n",
  "task array shorthand": source => source + "  extra: [echo safe]\n",
  "task cmd shorthand": source => source + "  extra:\n    cmd: echo safe\n",
  "task cmd alongside cmds": source => source + "  extra:\n    cmd: echo unsafe\n    cmds: [echo safe]\n",
  "null task": source => source + "  extra: null\n",
  "nonsequence cmds": source => source + "  extra:\n    cmds: echo safe\n",
  "null cmds": source => source + "  extra:\n    cmds: null\n",
  "empty check cmds": source => replaceCheck(source, "    cmds: []\n"),
  "missing check cmds": source => replaceCheck(source, "    desc: no commands\n"),
  "empty task name": source => source + '  "": {}\n',
})) {
  test(`check-contracts rejects YAML or task structure: ${name}`, () => {
    const result = checkTaskfile(transform);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml/);
  });
}

for (const entry of [
  "null", "true", "42", '""', '"   "', "[]", "{}",
  "{ cmd: 42 }", "{ task: 42 }", '{ cmd: " " }', '{ task: " " }',
  "{ cmd: echo safe, task: other }", "{ defer: echo safe }", "{ unknown: echo safe }",
  "{ cmd: echo safe, defer: echo other }", "{ task: other, defer: echo other }",
]) {
  test(`check-contracts rejects unsupported command entry: ${entry}`, () => {
    const result = checkTaskfile(source => source + `  extra:\n    cmds:\n      - ${entry}\n`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Taskfile\.yml.*cmds/is);
  });
}

for (const command of [verifyCommand, testCommand]) {
  for (const representation of [
    `# ${command}\n      - echo omitted`,
    `echo ${JSON.stringify(command)}`,
    `|\n        echo before\n        ${command}`,
    `cmd: ${command}`,
    "task: replacement",
  ]) {
    test(`check-contracts requires a direct exact check command: ${JSON.stringify(representation)}`, () => {
      const result = checkTaskfile(source => {
        const start = source.indexOf("  check:\n");
        const replacement = representation.startsWith("#") ? representation : `- ${representation}`;
        return source.slice(0, start) + source.slice(start).replace(`- ${command}`, replacement);
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /task check/);
    });
  }
}

for (const command of ["npm ci --ignore-scripts", "npm audit --audit-level=high"]) {
  for (const replacement of [`echo ${JSON.stringify(command)}`, `|\n        echo before\n        ${command}`, `echo omitted # ${command}`]) {
    test(`check-contracts requires exact npm commands: ${JSON.stringify(replacement)}`, () => {
      const result = checkTaskfile(source => source.replace(`- ${command}`, `- ${replacement}`));
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /npm 公開入口/);
    });
  }
}

test("check-contracts requires skill task keys rather than description markers", () => {
  const result = checkTaskfile(source => source.replace("  skills:verify:", '  renamed:\n    desc: "skills:verify:"'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /skill updater routes/);
});

for (const entry of ["npx fetched-tool", "cmd: npx fetched-tool", '"npx fetched-tool"', "|\n        echo before\n        npx fetched-tool"]) {
  test(`check-contracts scans command bodies for forbidden runners: ${JSON.stringify(entry)}`, () => {
    const result = checkTaskfile(source => source + `  extra:\n    cmds:\n      - ${entry}\n`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden Node runner/);
  });
}

test("check-contracts repeated read-only validation preserves valid and invalid inputs", () => {
  const repository = writeValidRepository();
  const taskfile = join(repository, "Taskfile.yml");
  const manifest = join(repository, "package.json");
  const original = readFileSync(taskfile, "utf8");
  for (const source of [original, original + "vars: { duplicate: one, duplicate: two }\n"]) {
    writeFileSync(taskfile, source);
    const before = [readFileSync(taskfile), readFileSync(manifest)];
    const first = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
    const second = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
    assert.equal(first.status, source === original ? 0 : 1, first.stderr);
    assert.deepEqual([second.status, second.stdout, second.stderr], [first.status, first.stdout, first.stderr]);
    assert.deepEqual([readFileSync(taskfile), readFileSync(manifest)], before);
  }
});
