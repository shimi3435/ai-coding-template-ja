import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cli = new URL("./cli.ts", import.meta.url);

function writeValidRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), "repo-contracts-"));
  mkdirSync(join(repository, ".github", "workflows"), { recursive: true });
  mkdirSync(join(repository, "scripts"));
  mkdirSync(join(repository, "repo-tools"));
  mkdirSync(join(repository, "docs", "template"), { recursive: true });
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
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(repository, ".github", "workflows", "ci.yml"), "name: CI\n", "utf8");
  writeFileSync(join(repository, "scripts", "bootstrap.sh"), "#!/bin/sh\n", "utf8");
  writeFileSync(join(repository, "repo-tools", "cli.ts"), "console.log('ok');\n", "utf8");
  writeFileSync(
    join(repository, "docs", "template", "release.md"),
    "prepare-v2-release: Node.js 24 / Python >=3.14 / TEMPLATE_VERSION=2.0.0\n",
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
});

test("check-contracts identifies malformed package metadata", () => {
  const repository = mkdtempSync(join(tmpdir(), "repo-contracts-"));
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
  const repository = mkdtempSync(join(tmpdir(), "npm-ci-lock-mismatch-"));
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
