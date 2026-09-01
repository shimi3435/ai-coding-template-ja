import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import { SmokeApprovalSession } from "./approval.ts";
import { runSmokeCommand } from "./cli-command.ts";
import { FakeSmokeHost } from "./fake-host.ts";

const sourceCommit = "a".repeat(40);

function sink(): Readonly<{ stream: Writable; text: () => string }> {
  const chunks: Buffer[] = [];
  return {
    stream: new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }),
    text: () => Buffer.concat(chunks).toString("utf8"),
  };
}

test("approval digest is exact, process-local, and one-shot", () => {
  const session = new SmokeApprovalSession(Buffer.from("canonical-preview", "utf8"));
  assert.equal(session.consume(""), false);
  assert.equal(session.consume("sha256:" + "0".repeat(64)), false);
  assert.equal(session.consume(session.digest), true);
  assert.equal(session.consume(session.digest), false);
});

test("EOF prints the exact preview but never calls the write seam", async () => {
  const host = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const stdout = sink();
  const stderr = sink();

  const result = await runSmokeCommand([
    "--repository", "owner/repo",
    "--run-id", "456",
    "--run-attempt", "2",
    "--source-commit", sourceCommit,
  ], {
    createHost: () => host,
    input: Readable.from([]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    now: () => new Date("2026-08-20T01:02:03.004Z"),
  });

  assert.equal(result.exitCode, 2);
  assert.match(stdout.text(), /"kind":"real-host-smoke-preview"/);
  assert.match(stdout.text(), /sha256:[0-9a-f]{64}/);
  assert.match(stderr.text(), /approval inputがありません/);
  assert.deepEqual(host.writeTranscript, []);
});

test("empty or mismatched digest never calls the write seam", async () => {
  for (const input of ["\n", `sha256:${"0".repeat(64)}\n`]) {
    const host = new FakeSmokeHost({
      repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
      workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
    });
    const stdout = sink();
    const stderr = sink();
    const result = await runSmokeCommand([
      "--repository", "owner/repo", "--run-id", "456", "--run-attempt", "2", "--source-commit", sourceCommit,
    ], {
      createHost: () => host,
      input: Readable.from([input]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      now: () => new Date("2026-08-20T01:02:03.004Z"),
    });
    assert.equal(result.exitCode, 2);
    assert.match(stderr.text(), /digestが一致しません/);
    assert.deepEqual(host.writeTranscript, []);
  }
});

test("CLI rejects non-canonical run attempt strings before host access", async () => {
  for (const attempt of ["0", "02", "2.0", "0x2", "9007199254740992"]) {
    let hostCreations = 0;
    const stdout = sink();
    const stderr = sink();
    const result = await runSmokeCommand([
      "--repository", "owner/repo", "--run-id", "456", "--run-attempt", attempt, "--source-commit", sourceCommit,
    ], {
      createHost: () => {
        hostCreations += 1;
        throw new Error("host must not be created");
      },
      input: Readable.from([]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      now: () => new Date("2026-08-20T01:02:03.004Z"),
    });
    assert.equal(result.exitCode, 2);
    assert.equal(hostCreations, 0);
  }
});
