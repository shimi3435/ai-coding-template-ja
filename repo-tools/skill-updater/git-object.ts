import { createHash } from "node:crypto";

const gitObjectShaPattern = /^[0-9a-f]{40}$/;

export function validateGitObjectSha(value: string, label: string): string {
  if (!gitObjectShaPattern.test(value)) {
    throw new Error(`${label}がlowercase 40-hexではありません`);
  }
  return value;
}

export function gitBlobSha1(content: Uint8Array): string {
  return createHash("sha1")
    .update(`blob ${content.byteLength}\0`, "ascii")
    .update(content)
    .digest("hex");
}
