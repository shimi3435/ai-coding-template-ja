import { createHash } from "node:crypto";

export class SmokeApprovalSession {
  readonly digest: string;
  #consumed = false;

  constructor(previewBytes: Uint8Array) {
    this.digest = `sha256:${createHash("sha256").update(previewBytes).digest("hex")}`;
  }

  consume(input: string): boolean {
    if (this.#consumed || input !== this.digest) return false;
    this.#consumed = true;
    return true;
  }
}
