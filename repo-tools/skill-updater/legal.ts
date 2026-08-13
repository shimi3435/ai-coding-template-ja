import { createHash } from "node:crypto";
import { canonicalizeTree, utf8Compare, validateCanonicalPath, type CanonicalTree, type TreeFile } from "./canonical.ts";
import type { LocalLegalFile, RemoteLegalFile } from "./types.ts";

const mebibyte = 1_048_576;
export const resourceLimits = Object.freeze({
  skillFiles: 200,
  skillBytes: 20 * mebibyte,
  singleFileBytes: 10 * mebibyte,
  cohortFiles: 500,
  cohortBytes: 50 * mebibyte,
  tagCandidates: 500,
  metadataBytes: 10 * mebibyte,
  filesystemEntries: 500,
  directoryDepth: 32,
  pathBytes: 4096,
  pathSegmentBytes: 255,
});

export function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function validateSkillLimits(files: readonly TreeFile[]): void {
  if (files.length > resourceLimits.skillFiles) {
    throw new Error(`skill file数が${resourceLimits.skillFiles}件を超えています`);
  }
  let bytes = 0;
  for (const file of files) {
    if (file.content.length > resourceLimits.singleFileBytes) {
      throw new Error(`単一fileが${resourceLimits.singleFileBytes} bytesを超えています: ${file.path}`);
    }
    bytes += file.content.length;
    if (!Number.isSafeInteger(bytes)) throw new Error("skill byte数がsafe integerを超えています");
  }
  if (bytes > resourceLimits.skillBytes) {
    throw new Error(`skill bytesが${resourceLimits.skillBytes}を超えています`);
  }
}

export type RemoteLegalBlob = Readonly<{
  sourcePath: string;
  targetPath: string;
  expectedSha256: string;
  content: Buffer;
}>;

export type LocalLegalBlob = Readonly<{
  sourcePath: string;
  expectedSha256: string;
  content: Buffer;
  tracked: boolean;
  regular: boolean;
}>;

export function validateLocalLegalFiles(
  legalBlobs: readonly LocalLegalBlob[],
): readonly LocalLegalFile[] {
  if (legalBlobs.length === 0) {
    throw new Error("local legal mappingは1件以上必要です");
  }
  const seen = new Set<string>();
  const files = legalBlobs.map((blob) => {
    validateCanonicalPath(blob.sourcePath);
    if (seen.has(blob.sourcePath)) throw new Error(`local legal source重複: ${blob.sourcePath}`);
    seen.add(blob.sourcePath);
    if (!blob.tracked || !blob.regular) {
      throw new Error(`local legal sourceはtracked regular fileが必要です: ${blob.sourcePath}`);
    }
    if (blob.content.length > resourceLimits.singleFileBytes) {
      throw new Error(`local legal sourceが単一file上限を超えています: ${blob.sourcePath}`);
    }
    const actual = sha256(blob.content);
    if (actual !== blob.expectedSha256) throw new Error(`local legal hash不一致: ${blob.sourcePath}`);
    return { sourcePath: blob.sourcePath, sha256: actual };
  });
  return files.sort((left, right) => utf8Compare(left.sourcePath, right.sourcePath));
}

export function addRemoteLegalFiles(
  subtreeFiles: readonly TreeFile[],
  legalBlobs: readonly RemoteLegalBlob[],
): Readonly<{ tree: CanonicalTree; legalFiles: readonly RemoteLegalFile[] }> {
  const files = new Map<string, TreeFile>();
  for (const file of subtreeFiles) {
    validateCanonicalPath(file.path);
    if (files.has(file.path)) throw new Error(`subtree path重複: ${file.path}`);
    files.set(file.path, { ...file, content: Buffer.from(file.content) });
  }
  const legalTargets = new Set<string>();
  const legalFiles: RemoteLegalFile[] = [];
  for (const blob of legalBlobs) {
    validateCanonicalPath(blob.sourcePath);
    validateCanonicalPath(blob.targetPath);
    if (legalTargets.has(blob.targetPath)) throw new Error(`legal target重複: ${blob.targetPath}`);
    legalTargets.add(blob.targetPath);
    const actual = sha256(blob.content);
    if (actual !== blob.expectedSha256) {
      throw new Error(`legal hash不一致: ${blob.sourcePath}`);
    }
    const existing = files.get(blob.targetPath);
    if (existing !== undefined && !existing.content.equals(blob.content)) {
      throw new Error(`legal target collision: ${blob.targetPath}`);
    }
    if (existing === undefined) {
      files.set(blob.targetPath, { path: blob.targetPath, executable: false, content: Buffer.from(blob.content) });
    }
    legalFiles.push({ sourcePath: blob.sourcePath, targetPath: blob.targetPath, sha256: actual });
  }
  const values = [...files.values()];
  validateSkillLimits(values);
  return {
    tree: canonicalizeTree(values),
    legalFiles: legalFiles.sort((left, right) =>
      utf8Compare(left.targetPath, right.targetPath) || utf8Compare(left.sourcePath, right.sourcePath),
    ),
  };
}

type LegalIdentity = Readonly<{ sourcePath: string; sha256: string; targetPath?: string }>;

export function sameLegalFiles(left: readonly LegalIdentity[], right: readonly LegalIdentity[]): boolean {
  const normalize = (items: readonly LegalIdentity[]) => [...items]
    .sort((first, second) =>
      utf8Compare(first.targetPath ?? "", second.targetPath ?? "") ||
      utf8Compare(first.sourcePath, second.sourcePath) ||
      utf8Compare(first.sha256, second.sha256))
    .map((item) => `${item.targetPath ?? ""}\0${item.sourcePath}\0${item.sha256}`);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
