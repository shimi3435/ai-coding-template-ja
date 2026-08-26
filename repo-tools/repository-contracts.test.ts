import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";

const cli = new URL("./cli.ts", import.meta.url);
const temporaryRepositories = new Set<string>();

function temporaryRepository(prefix: string): string {
  const repository = mkdtempSync(join(tmpdir(), prefix));
  temporaryRepositories.add(repository);
  return repository;
}

afterEach(() => {
  for (const repository of temporaryRepositories) rmSync(repository, { recursive: true, force: true });
  temporaryRepositories.clear();
});

function writeValidRepository(): string {
  const repository = temporaryRepository("repo-contracts-");
  mkdirSync(join(repository, ".github", "workflows"), { recursive: true });
  mkdirSync(join(repository, "scripts"));
  mkdirSync(join(repository, "repo-tools"));
  mkdirSync(join(repository, "repo-tools", "skill-update-automation", "smoke"), { recursive: true });
  mkdirSync(join(repository, "docs", "template"), { recursive: true });
  mkdirSync(join(repository, "docs", "agents"), { recursive: true });
  writeFileSync(
    join(repository, "package.json"),
    JSON.stringify({
      private: true,
      scripts: { check: "node repo-tools/cli.ts check-contracts" },
      devDependencies: { typescript: "7.0.2" },
    }),
    "utf8",
  );
  writeFileSync(join(repository, "package-lock.json"), '{"lockfileVersion":3}', "utf8");
  writeFileSync(join(repository, "TEMPLATE_VERSION"), "1.0.0\n", "utf8");
  writeFileSync(join(repository, ".gitignore"), "/node_modules/\n", "utf8");
  writeFileSync(
    join(repository, "Taskfile.yml"),
    [
      'version: "3"',
      "tasks:",
      "  setup:node:",
      "    cmds:",
      "      - npm ci --ignore-scripts",
      "  audit:node:",
      "    cmds:",
      "      - npm audit --audit-level=high",
      "  skills:links:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:links",
      "  skills:verify:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:verify",
      "  skills:check:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:check",
      "  skills:update:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:update",
      "  skills:lock-local:",
      "    cmds:",
      "      - node repo-tools/entrypoint.mjs skills:lock-local",
      "  check:",
      "    cmds:",
      "      - node --test repo-tools/skill-update-automation/**/*.test.ts",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(repository, ".github", "workflows", "ci.yml"), "name: CI\n", "utf8");
  writeFileSync(
    join(repository, ".github", "workflows", "skill-update-prs.yml"),
    [
      "name: Skill update PR automation",
      "on:",
      "  schedule:",
      "    - cron: '17 3 * * 1'",
      "  workflow_dispatch:",
      "    inputs:",
      "      resume_closed:",
      "        required: true",
      "        default: false",
      "        type: boolean",
      "permissions: {}",
      "jobs:",
      "  detect:",
      "    permissions:",
      "      contents: read",
      "      pull-requests: read",
      "      issues: read",
      "  publish-draft:",
      "    permissions:",
      "      contents: write",
      "      pull-requests: write",
      "  validate:",
      "    permissions:",
      "      contents: read",
      "  publish-finalize:",
      "    permissions:",
      "      contents: read",
      "      pull-requests: write",
      "      issues: write",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(repository, "scripts", "bootstrap.sh"), "#!/bin/sh\n", "utf8");
  writeFileSync(
    join(repository, "repo-tools", "cli.ts"),
    "skills:automation:smoke / runSmokeCommand / ProductionSmokeHost / process.stdin / process.stdout / process.stderr\n",
    "utf8",
  );
  writeFileSync(
    join(repository, "repo-tools", "skill-update-automation", "smoke", "production-host.ts"),
    "const command = 'gh api';\n",
    "utf8",
  );
  writeFileSync(
    join(repository, "docs", "template", "release.md"),
    "prepare-v2-release: Node.js 24 / Python >=3.14 / TEMPLATE_VERSION=2.0.0\n",
    "utf8",
  );
  writeFileSync(
    join(repository, "README.md"),
    "SKILLS_AUTO_UPDATE / resume_closed / skill-update-prs.yml / task check\n",
    "utf8",
  );
  writeFileSync(
    join(repository, "docs", "guide.md"),
    "validation-failed / recovery-required / cleanup-failed / fresh approval / exact digest / " +
      "SmokePreview` v3 / recovery mode / ahead_by >= 1\n",
    "utf8",
  );
  writeFileSync(
    join(repository, "docs", "agents", "safety.md"),
    "publish-draft / publish-finalize / existing operator gh auth / real GitHub write\n",
    "utf8",
  );
  return repository;
}

test("check-contracts accepts the tracked exact dependency and release ownership contract", () => {
  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /exact npm dependencies/);
  assert.match(result.stdout, /package-lock v3/);
  assert.match(result.stdout, /TEMPLATE_VERSION 1\.0\.0/);
  assert.match(result.stdout, /forbidden Node runners/);
  assert.match(result.stdout, /skill updater routes/);
  assert.match(result.stdout, /legacy skill checker: absent/);
  assert.match(result.stdout, /skill update automation workflow/);
  assert.match(result.stdout, /skill update automation runbook/);
});

test("check-contracts requires automation tests in the offline task check", () => {
  const repository = writeValidRepository();
  const taskfile = join(repository, "Taskfile.yml");
  writeFileSync(
    taskfile,
    readFileSync(taskfile, "utf8").replace("node --test repo-tools/skill-update-automation/**/*.test.ts", "node --test repo-tools/*.test.ts"),
    "utf8",
  );
  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /skill-update-automation.*task check/);
});

test("check-contracts rejects an automation test route outside task check", () => {
  const repository = writeValidRepository();
  const taskfile = join(repository, "Taskfile.yml");
  writeFileSync(
    taskfile,
    readFileSync(taskfile, "utf8").replace("  check:\n", "  automation-only:\n"),
    "utf8",
  );
  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /task check/);
});

test("check-contracts rejects weakened automation permission topology", () => {
  const repository = writeValidRepository();
  const workflow = join(repository, ".github", "workflows", "skill-update-prs.yml");
  writeFileSync(
    workflow,
    readFileSync(workflow, "utf8").replace("      contents: read\n      pull-requests: read", "      contents: write\n      pull-requests: read"),
    "utf8",
  );
  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /detect permissions/);
});

test("check-contracts requires the human smoke CLI without a stored credential route", () => {
  const repository = writeValidRepository();
  const smokeHost = join(repository, "repo-tools", "skill-update-automation", "smoke", "production-host.ts");
  writeFileSync(smokeHost, "const token = process.env.GH_TOKEN;\n", "utf8");
  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /smoke.*credential/i);
});

test("check-contracts rejects a smoke command label without the approval command route", () => {
  const repository = writeValidRepository();
  const cliPath = join(repository, "repo-tools", "cli.ts");
  writeFileSync(cliPath, readFileSync(cliPath, "utf8").replace("runSmokeCommand", "missingRunner"), "utf8");
  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /human smoke CLI route/);
});

test("check-contracts requires the operator runbook markers", () => {
  const repository = writeValidRepository();
  writeFileSync(join(repository, "docs", "guide.md"), "generic guide\n", "utf8");
  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /docs\/guide\.md.*recovery-required/);
});

test("check-contracts identifies malformed package metadata", () => {
  const repository = temporaryRepository("repo-contracts-");
  writeFileSync(join(repository, "package.json"), "{not-json", "utf8");

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /package\.json/);
  assert.match(result.stderr, /JSON/);
});

test("check-contracts follows JSON last-key semantics for duplicate dependency keys", () => {
  const lastValidRepository = writeValidRepository();
  writeFileSync(
    join(lastValidRepository, "package.json"),
    '{"private":true,"dependencies":{"sample":"^1.2.3","sample":"1.2.3"}}',
    "utf8",
  );
  const lastValid = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: lastValidRepository,
    encoding: "utf8",
  });
  assert.equal(lastValid.status, 0, lastValid.stderr);

  const lastInvalidRepository = writeValidRepository();
  writeFileSync(
    join(lastInvalidRepository, "package.json"),
    '{"private":true,"dependencies":{"sample":"1.2.3","sample":"^1.2.3"}}',
    "utf8",
  );
  const lastInvalid = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: lastInvalidRepository,
    encoding: "utf8",
  });
  assert.notEqual(lastInvalid.status, 0);
  assert.match(lastInvalid.stderr, /sample@\^1\.2\.3/);
});

for (const lockContents of ['{"lockfileVersion":2}', "{not-json"]) {
  test(`check-contracts identifies invalid lock metadata: ${lockContents}`, () => {
    const repository = writeValidRepository();
    writeFileSync(join(repository, "package-lock.json"), lockContents, "utf8");

    const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
      cwd: repository,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /package-lock\.json|package-lock v3/);
  });
}

test("check-contracts reports every non-exact dependency", () => {
  const repository = writeValidRepository();
  writeFileSync(
    join(repository, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { alpha: "^1.0.0", beta: "latest" },
      devDependencies: { gamma: "7.0.2" },
    }),
    "utf8",
  );

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /alpha@\^1\.0\.0/);
  assert.match(result.stderr, /beta@latest/);
  assert.doesNotMatch(result.stderr, /gamma/);
});

test("check-contracts rejects non-object dependency metadata", () => {
  const repository = writeValidRepository();
  writeFileSync(
    join(repository, "package.json"),
    JSON.stringify({ private: true, dependencies: [] }),
    "utf8",
  );

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dependencies.*object/);
});

test("check-contracts accepts exact prerelease and build metadata versions", () => {
  const repository = writeValidRepository();
  writeFileSync(
    join(repository, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { alpha: "1.2.3-beta.1+build.7" },
    }),
    "utf8",
  );

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
});

test("check-contracts rejects forbidden runners in repo-tools source", () => {
  const repository = writeValidRepository();
  mkdirSync(join(repository, "repo-tools", "nested"));
  writeFileSync(
    join(repository, "repo-tools", "nested", "tool.ts"),
    'console.log("npx tool");\n',
    "utf8",
  );

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbidden Node runner/);
});

test("check-contracts rejects forbidden runners in every workflow", () => {
  const repository = writeValidRepository();
  writeFileSync(
    join(repository, ".github", "workflows", "extras-smoke.yml"),
    "steps:\n  - run: npx fetched-tool\n",
    "utf8",
  );

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbidden Node runner/);
});

for (const source of [
  'fetch("https://example.invalid");\n',
  'new WebSocket("wss://example.invalid");\n',
  'import http from "node:http";\n',
  'import https from "node:https";\n',
  'import http from "http";\n',
  'import https from "https";\n',
  'import http2 from "node:http2";\n',
  'import net from "node:net";\n',
  'import tls from "node:tls";\n',
  'import dns from "node:dns";\n',
  'import dgram from "node:dgram";\n',
  'import { fetch } from "undici";\n',
]) {
  test(`check-contracts rejects native network access in repo-tools source: ${source.trim()}`, () => {
    const repository = writeValidRepository();
    writeFileSync(join(repository, "repo-tools", "network.mjs"), source, "utf8");

    const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
      cwd: repository,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /network access/);
  });
}

test("check-contracts requires the prepare-v2-release dependency handoff", () => {
  const repository = writeValidRepository();
  writeFileSync(
    join(repository, "docs", "template", "release.md"),
    "TEMPLATE_VERSION release process\n",
    "utf8",
  );

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /prepare-v2-release/);
  assert.match(result.stderr, /docs\/template\/release\.md/);
});

test("check-contracts requires generated node_modules to stay untracked", () => {
  const repository = writeValidRepository();
  writeFileSync(join(repository, ".gitignore"), "__pycache__/\n", "utf8");

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\.gitignore/);
  assert.match(result.stderr, /node_modules/);
});

test("check-contracts requires deterministic install and explicit online audit routes", () => {
  const repository = writeValidRepository();
  writeFileSync(join(repository, "Taskfile.yml"), 'version: "3"\ntasks: {}\n', "utf8");

  const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
    cwd: repository,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm ci --ignore-scripts/);
  assert.match(result.stderr, /npm audit --audit-level=high/);
});

test("property: exact semver forms pass and range forms fail in every dependency field", () => {
  const dependencyFields = ["dependencies", "devDependencies"] as const;
  const exactVersions = [
    "0.0.0",
    "1.2.3",
    "999.999.999",
    "1.2.3-alpha",
    "1.2.3-alpha.1",
    "1.2.3+build.7",
    "1.2.3-alpha.1+build.7",
  ];
  const rejectedVersions = [
    "^1.2.3",
    "~1.2.3",
    ">=1.2.3",
    "1.2.x",
    "*",
    "latest",
    "workspace:*",
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-01",
    "1.2.3-..",
    "1.2.3-alpha..1",
    "1.2.3-",
    "1.2.3+..",
    "1.2.3+",
  ];

  for (const field of dependencyFields) {
    for (const version of exactVersions) {
      const repository = writeValidRepository();
      writeFileSync(
        join(repository, "package.json"),
        JSON.stringify({ private: true, [field]: { sample: version } }),
        "utf8",
      );
      const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
        cwd: repository,
        encoding: "utf8",
      });

      assert.equal(result.status, 0, `${field} sample@${version}: ${result.stderr}`);
    }

    for (const version of rejectedVersions) {
      const repository = writeValidRepository();
      writeFileSync(
        join(repository, "package.json"),
        JSON.stringify({ private: true, [field]: { sample: version } }),
        "utf8",
      );
      const result = spawnSync(process.execPath, [cli.pathname, "check-contracts"], {
        cwd: repository,
        encoding: "utf8",
      });

      assert.notEqual(result.status, 0, `${field} sample@${version}`);
      assert.match(result.stderr, new RegExp(`sample@${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  }
});

test("npm ci --ignore-scripts --offline rejects a tracked package and lock mismatch", () => {
  const repository = temporaryRepository("npm-ci-lock-mismatch-");
  const firstDependency = join(repository, "vendor", "first");
  const secondDependency = join(repository, "vendor", "second");
  mkdirSync(firstDependency, { recursive: true });
  mkdirSync(secondDependency, { recursive: true });
  writeFileSync(
    join(firstDependency, "package.json"),
    JSON.stringify({ name: "fixture-dependency", version: "1.0.0" }),
    "utf8",
  );
  writeFileSync(
    join(secondDependency, "package.json"),
    JSON.stringify({ name: "fixture-dependency", version: "2.0.0" }),
    "utf8",
  );
  const manifestPath = join(repository, "package.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ private: true, dependencies: { "fixture-dependency": "file:vendor/first" } }),
    "utf8",
  );
  const isolatedHome = join(repository, "home");
  const isolatedCache = join(repository, "npm-cache");
  mkdirSync(isolatedHome);
  mkdirSync(isolatedCache);
  const env = {
      ...process.env,
      HOME: isolatedHome,
      npm_config_audit: "false",
      npm_config_cache: isolatedCache,
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
  };
  const lock = spawnSync(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts", "--offline"],
    { cwd: repository, encoding: "utf8", env },
  );
  assert.equal(lock.status, 0, `${lock.stdout}\n${lock.stderr}`);

  writeFileSync(
    manifestPath,
    JSON.stringify({ private: true, dependencies: { "fixture-dependency": "file:vendor/second" } }),
    "utf8",
  );
  const result = spawnSync("npm", ["ci", "--ignore-scripts", "--offline"], {
    cwd: repository,
    encoding: "utf8",
    env,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /package-lock\.json.*package\.json|in sync/is);
  assert.match(`${result.stdout}\n${result.stderr}`, /fixture-dependency/);
});
