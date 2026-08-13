import { createHash } from "node:crypto";

export type TreeFile = Readonly<{
  path: string;
  executable: boolean;
  content: Buffer;
}>;

export type CanonicalTree = Readonly<{
  treeHash: string;
  fileCount: number;
  byteCount: number;
  files: readonly TreeFile[];
}>;

const domain = Buffer.from("skill-tree-v1\0", "ascii");

function u64(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`u64 に変換できない値です: ${String(value)}`);
  }
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
}

export function validateCanonicalPath(path: string): string {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path !== path.normalize("NFC")
  ) {
    throw new Error(`canonical path ではありません: ${JSON.stringify(path)}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`canonical path ではありません: ${JSON.stringify(path)}`);
  }
  return path;
}

export function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function asciiCaseFold(path: string): string {
  return path.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export function canonicalizeTree(inputFiles: readonly TreeFile[]): CanonicalTree {
  if (inputFiles.length === 0) {
    throw new Error("installed tree は1 file以上必要です");
  }
  const files = inputFiles
    .map((file) => ({
      path: validateCanonicalPath(file.path),
      executable: file.executable,
      content: Buffer.from(file.content),
    }))
    .sort((left, right) => utf8Compare(left.path, right.path));

  const seen = new Map<string, string>();
  for (const file of files) {
    const folded = asciiCaseFold(file.path);
    const previous = seen.get(folded);
    if (previous !== undefined) {
      throw new Error(`path collision: ${previous} / ${file.path}`);
    }
    seen.set(folded, file.path);
  }

  const hash = createHash("sha256");
  hash.update(domain);
  hash.update(u64(files.length));
  let byteCount = 0;
  for (const file of files) {
    const pathBytes = Buffer.from(file.path, "utf8");
    hash.update(u64(pathBytes.length));
    hash.update(pathBytes);
    hash.update(Buffer.from([file.executable ? 1 : 0]));
    hash.update(u64(file.content.length));
    hash.update(file.content);
    byteCount += file.content.length;
  }

  return { treeHash: hash.digest("hex"), fileCount: files.length, byteCount, files };
}
