import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeArtifactManifest } from "../model/index.ts";

export function readArtifactKind(directory: string): "candidate-update" | "existing-head-validation" | "no-op" | "recovery" {
  return decodeArtifactManifest(readFileSync(join(directory, "manifest.json"))).kind;
}

export function renderArtifactOutputs(directory: string): string {
  const manifest = decodeArtifactManifest(readFileSync(join(directory, "manifest.json")));
  const candidateSha = manifest.kind === "candidate-update" || manifest.kind === "existing-head-validation"
    ? manifest.candidateSha
    : manifest.kind === "recovery"
      ? manifest.target.afterHeadSha
      : "";
  const originRunId = manifest.kind === "recovery" ? manifest.target.originRun.workflowRunId : "";
  const originRunAttempt = manifest.kind === "recovery" ? String(manifest.target.originRun.workflowRunAttempt) : "";
  return [
    `artifact-kind=${manifest.kind}`,
    `candidate-sha=${candidateSha}`,
    `origin-run-id=${originRunId}`,
    `origin-run-attempt=${originRunAttempt}`,
    "",
  ].join("\n");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(renderArtifactOutputs(process.env.CANDIDATE_DIR ?? ""));
}
