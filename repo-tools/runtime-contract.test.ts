import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

type RuntimeCase = {
  id: string;
  runtime: "node" | "npm" | "python3";
  stdout: string;
  stderr: string;
  status: number;
  accepted: boolean;
};

const fixture = JSON.parse(await readFile(
  new URL("../tests/fixtures/runtime_versions.json", import.meta.url), "utf8",
)) as { cases: RuntimeCase[] };
const entrypoint = new URL("./entrypoint.mjs", import.meta.url);

// POSIX printf octal escapes preserve all bytes, including NUL and trailing newlines.
function printfBytes(text: string): string {
  return [...Buffer.from(text)].map((byte) => `\\${byte.toString(8).padStart(3, "0")}`).join("");
}

for (const item of fixture.cases) {
  test(`shared runtime contract: ${item.id}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "runtime-contract-"));
    try {
      for (const [command, version] of Object.entries({
        node: "v24.1.0\n", npm: "11.6.2\n", python3: "Python 3.14.0\n",
      })) {
        const result = command === item.runtime ? item : { stdout: version, stderr: "", status: 0 };
        const path = join(directory, command);
        await writeFile(path, `#!/bin/sh\nprintf '${printfBytes(result.stdout)}'\nprintf '${printfBytes(result.stderr)}' >&2\nexit ${result.status}\n`);
        await chmod(path, 0o755);
      }
      const result = spawnSync(process.execPath, [entrypoint.pathname, "runtime-preflight"], {
        encoding: "utf8", env: { ...process.env, PATH: directory },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status === 0, item.accepted, `${item.id}: ${result.stdout}${result.stderr}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
