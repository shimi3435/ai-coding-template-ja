import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeArtifactManifest } from "../model/index.ts";

export function readArtifactKind(directory: string): "candidate-update" | "existing-head-validation" | "no-op" {
  return decodeArtifactManifest(readFileSync(join(directory, "manifest.json"))).kind;
}

export function renderArtifactOutputs(directory: string): string {
  const manifest = decodeArtifactManifest(readFileSync(join(directory, "manifest.json")));
  const candidateSha = manifest.kind === "no-op" ? "" : manifest.candidateSha;
  return `artifact-kind=${manifest.kind}\ncandidate-sha=${candidateSha}\n`;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(renderArtifactOutputs(process.env.CANDIDATE_DIR ?? ""));
}
