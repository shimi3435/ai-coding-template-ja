import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { encodeArtifactManifest } from "../model/index.ts";
import { renderArtifactOutputs } from "./artifact-kind.ts";

const sha = (character: string): string => character.repeat(40);
const hash = (character: string): string => `sha256:${character.repeat(64)}`;

test("recovery artifact exports exact origin identity for cross-run download", () => {
  const directory = mkdtempSync(join(tmpdir(), "recovery-artifact-kind-test-"));
  try {
    mkdirSync(join(directory, "artifact"));
    writeFileSync(join(directory, "artifact", "manifest.json"), encodeArtifactManifest({
      schemaVersion: 1,
      kind: "recovery",
      repositoryId: "123",
      repository: "owner/repository",
      run: { workflowRunId: "21", workflowRunAttempt: 2 },
      triggerSha: sha("0"),
      baseHeadSha: sha("2"),
      target: {
        mode: "prepared-branch-append",
        generation: 1,
        prNumber: 4,
        creatorUserId: "456",
        headRef: "refs/heads/automation/skill-updates/g000001",
        beforeHeadSha: sha("2"),
        afterHeadSha: sha("3"),
        rootDigest: hash("1"),
        journalDigest: hash("2"),
        operationId: hash("3"),
        beforeSnapshotDigest: hash("4"),
        afterSnapshotDigest: hash("5"),
        candidateDigest: hash("6"),
        reportDigest: hash("7"),
        originRun: { workflowRunId: "20", workflowRunAttempt: 1 },
      },
      createdAt: "2026-08-30T00:00:00.000Z",
      files: [],
    }));
    assert.equal(renderArtifactOutputs(join(directory, "artifact")), [
      "artifact-kind=recovery",
      `candidate-sha=${sha("3")}`,
      "origin-run-id=20",
      "origin-run-attempt=1",
      "",
    ].join("\n"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
