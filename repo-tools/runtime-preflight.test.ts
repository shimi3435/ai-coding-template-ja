import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { detectAndValidateRuntimes } from "./runtime.ts";

const cli = new URL("./cli.ts", import.meta.url);

async function writeCommand(
  directory: string,
  name: string,
  output: string,
  exitCode = 0,
): Promise<void> {
  const command = join(directory, name);
  await writeFile(
    command,
    `#!/bin/sh\nprintf '%s\\n' '${output}'\nexit ${exitCode}\n`,
    "utf8",
  );
  await chmod(command, 0o755);
}

async function runtimePath(versions: {
  node: string;
  npm?: string;
  python: string;
}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "repo-tools-runtime-"));
  await writeCommand(directory, "node", versions.node);
  if (versions.npm !== undefined) {
    await writeCommand(directory, "npm", versions.npm);
  } else {
    await writeCommand(directory, "npm", "npm unavailable", 127);
  }
  await writeCommand(directory, "python3", versions.python);
  return `${directory}:${process.env.PATH ?? ""}`;
}

test("runtime-preflight accepts Node 24 and Python 3.14 and reports complete versions", async () => {
  const path = await runtimePath({ node: "v24.11.1", npm: "11.6.2", python: "3.14.2" });
  const result = spawnSync(process.execPath, [cli.pathname, "runtime-preflight"], {
    encoding: "utf8",
    env: { ...process.env, PATH: path },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Node\.js v24\.11\.1/);
  assert.match(result.stdout, /npm 11\.6\.2/);
  assert.match(result.stdout, /Python 3\.14\.2/);
});

test("runtime-preflight runs before Node dependencies are installed", async () => {
  const root = await mkdtemp(join(tmpdir(), "repo-tools-dependency-free-"));
  try {
    const loader = join(root, "reject-node-packages.mjs");
    await writeFile(loader, `
import { isBuiltin } from "node:module";
export async function resolve(specifier, context, nextResolve) {
  const relativeOrAbsolute = specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("file:");
  if (!relativeOrAbsolute && !isBuiltin(specifier)) throw new Error(\`Node package import blocked: \${specifier}\`);
  return nextResolve(specifier, context);
}
`, "utf8");
    await Promise.all([
      writeCommand(root, "node", "v24.14.1"),
      writeCommand(root, "npm", "11.11.0"),
      writeCommand(root, "python3", "Python 3.14.6"),
    ]);

    const result = spawnSync(process.execPath, ["--experimental-loader", loader, new URL("./entrypoint.mjs", import.meta.url).pathname, "runtime-preflight"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ""}` },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Node\.js v24\.14\.1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const versions of [
  { node: "v24.0.0", npm: "11.0.0", python: "3.14.0" },
  { node: "v24.99.99", npm: "11.99.99", python: "3.15.0" },
] as const) {
  test(`runtime-preflight accepts supported version lines: ${JSON.stringify(versions)}`, async () => {
    const path = await runtimePath(versions);
    const result = spawnSync(process.execPath, [cli.pathname, "runtime-preflight"], {
      encoding: "utf8",
      env: { ...process.env, PATH: path },
    });

    assert.equal(result.status, 0, result.stderr);
  });
}

for (const fixture of [
  { versions: { node: "v23.9.0", npm: "11.0.0", python: "3.14.0" }, error: /Node\.js 24.*v23\.9\.0/ },
  { versions: { node: "v24.1.0", npm: "11.0.0", python: "3.13.9" }, error: /Python >=3\.14.*3\.13\.9/ },
  { versions: { node: "not-a-version", npm: "11.0.0", python: "3.14.0" }, error: /Node\.js version.*not-a-version/ },
  { versions: { node: "prefix-v24.1.0-suffix", npm: "11.0.0", python: "3.14.0" }, error: /Node\.js version/ },
  { versions: { node: "v24.1.0", npm: "not-a-version", python: "3.14.0" }, error: /npm version.*not-a-version/ },
] as const) {
  test(`runtime-preflight rejects unsupported or malformed versions: ${JSON.stringify(fixture.versions)}`, async () => {
    const path = await runtimePath(fixture.versions);
    const result = spawnSync(process.execPath, [cli.pathname, "runtime-preflight"], {
      encoding: "utf8",
      env: { ...process.env, PATH: path },
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, fixture.error);
  });
}

test("repo-tools rejects an unknown command and lists available commands", () => {
  const result = spawnSync(process.execPath, [cli.pathname, "unknown"], { encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /runtime-preflight/);
  assert.match(result.stderr, /check-contracts/);
});

test("repo-tools rejects an omitted command instead of selecting a default", () => {
  const result = spawnSync(process.execPath, [cli.pathname], { encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage:/);
});

test("runtime-preflight identifies a failed npm version command", async () => {
  const path = await runtimePath({ node: "v24.1.0", python: "3.14.0" });
  const result = spawnSync(process.execPath, [cli.pathname, "runtime-preflight"], {
    encoding: "utf8",
    env: { ...process.env, PATH: path },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm version command.*exit: 127/);
});

test("property: every representative Node 24 minor/patch and Python >=3.14 version is accepted", () => {
  const nodeMinors = [0, 1, 14, 99];
  const nodePatches = [0, 1, 42, 99];
  const supportedPythonLines = [
    [3, 14],
    [3, 15],
    [3, 99],
    [4, 0],
  ] as const;
  const pythonPatches = [0, 1, 99];

  for (const nodeMinor of nodeMinors) {
    for (const nodePatch of nodePatches) {
      for (const [pythonMajor, pythonMinor] of supportedPythonLines) {
        for (const pythonPatch of pythonPatches) {
          const outputs: Record<string, string> = {
            node: `v24.${nodeMinor}.${nodePatch}`,
            npm: "11.0.0",
            python3: `Python ${pythonMajor}.${pythonMinor}.${pythonPatch}`,
          };
          const result = detectAndValidateRuntimes((command) => {
            const output = outputs[command];
            if (output === undefined) {
              throw new Error(`unexpected command: ${command}`);
            }
            return output;
          });

          assert.equal(result.node, outputs.node);
          assert.equal(result.python, `${pythonMajor}.${pythonMinor}.${pythonPatch}`);
        }
      }
    }
  }
});

test("property: every representative Python version below 3.14 is rejected", () => {
  const unsupportedPythonLines = [
    [2, 99],
    [3, 0],
    [3, 1],
    [3, 13],
  ] as const;
  const patches = [0, 1, 99];

  for (const [pythonMajor, pythonMinor] of unsupportedPythonLines) {
    for (const pythonPatch of patches) {
      const outputs: Record<string, string> = {
        node: "v24.0.0",
        npm: "11.0.0",
        python3: `Python ${pythonMajor}.${pythonMinor}.${pythonPatch}`,
      };

      assert.throws(
        () =>
          detectAndValidateRuntimes((command) => {
            const output = outputs[command];
            if (output === undefined) {
              throw new Error(`unexpected command: ${command}`);
            }
            return output;
          }),
        /Python >=3\.14/,
      );
    }
  }
});
