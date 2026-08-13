import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  sha256,
  type GhRunner,
  type RemoteSource,
} from "./skill-updater/index.ts";

export const commit = "c".repeat(40);
export const skill = Buffer.from("---\nname: demo\ndescription: Demo skill\n---\nbody\n");
export const license = Buffer.from("MIT license\n");
export const skillBlobSha = "7053d4638f465fcadc0fb02c4925df29504d747c";
export const licenseBlobSha = "95192c45537a8d6334b2efb0b443266fa1f1337a";

export function fixtureBlobSha(content: Buffer): string {
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

export function opaqueSha(label: string): string {
  return createHash("sha1").update(label).digest("hex");
}

export function source(ref: RemoteSource["ref"] = { branch: "main" }): RemoteSource {
  return {
    name: "demo",
    ownership: "remote",
    license: "MIT",
    redistribution: "allowed",
    target: ".agents/skills/demo",
    repository: "owner/repo",
    ref,
    subtree: { path: "skills/demo" },
    legalMappings: [{
      sourcePath: "LICENSE",
      targetPath: "LICENSE",
      expectedSha256: sha256(license),
    }],
  };
}

function json(value: unknown): { exitCode: number; stdout: string; stderr: string } {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: "" };
}

export function transcript(overrides: Record<string, unknown> = {}): {
  runner: GhRunner;
  calls: string[];
} {
  const responses: Record<string, unknown> = {
    "repos/owner/repo": { visibility: "public", private: false },
    "repos/owner/repo/git/ref/heads/main": { object: { type: "commit", sha: commit } },
    [`repos/owner/repo/commits/${commit}`]: {
      sha: commit,
      commit: { verification: { verified: true, reason: "valid" } },
    },
    [`repos/owner/repo/git/trees/${commit}?recursive=1`]: {
      truncated: false,
      tree: [
        { path: "LICENSE", mode: "100644", type: "blob", sha: licenseBlobSha, size: license.length },
        { path: "skills/demo/SKILL.md", mode: "100644", type: "blob", sha: skillBlobSha, size: skill.length },
      ],
    },
    [`repos/owner/repo/git/blobs/${skillBlobSha}`]: {
      sha: skillBlobSha,
      encoding: "base64",
      content: skill.toString("base64"),
      size: skill.length,
    },
    [`repos/owner/repo/git/blobs/${licenseBlobSha}`]: {
      sha: licenseBlobSha,
      encoding: "base64",
      content: license.toString("base64"),
      size: license.length,
    },
    ...overrides,
  };
  const calls: string[] = [];
  const runner: GhRunner = async (args) => {
    const endpoint = args.find((argument) => argument.startsWith("repos/"));
    assert.ok(endpoint, `endpoint missing: ${args.join(" ")}`);
    calls.push(endpoint);
    const response = responses[endpoint];
    if (response === undefined) throw new Error(`unexpected endpoint: ${endpoint}`);
    if (typeof response === "object" && response !== null && "exitCode" in response) {
      return response as { exitCode: number; stdout: string; stderr: string };
    }
    return json(response);
  };
  return { runner, calls };
}
