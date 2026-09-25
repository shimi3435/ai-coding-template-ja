import { validateCanonicalPath } from "./canonical.ts";
import { resourceLimits } from "./legal.ts";

export function validateInstalledTraversalPath(relative: string): void {
  validateCanonicalPath(relative);
  if (Buffer.byteLength(relative, "utf8") > resourceLimits.pathBytes) {
    throw new Error(`installed tree pathが${resourceLimits.pathBytes} bytesを超えています: ${relative}`);
  }
  for (const segment of relative.split("/")) {
    if (Buffer.byteLength(segment, "utf8") > resourceLimits.pathSegmentBytes) {
      throw new Error(`installed tree path segmentが${resourceLimits.pathSegmentBytes} bytesを超えています: ${relative}`);
    }
  }
}

/** Count final files and their parent directories before reading or writing content. */
export function validateInstalledFilePaths(paths: readonly string[], existingEntries: readonly string[] = []): void {
  const entries = new Set(existingEntries);
  const files = new Set<string>();
  for (const path of paths) {
    validateInstalledTraversalPath(path);
    const parts = path.split("/");
    if (parts.length - 1 > resourceLimits.directoryDepth) throw new Error("directory depth上限超過");
    for (let length = 1; length <= parts.length; length++) entries.add(parts.slice(0, length).join("/"));
    const folded = path.replace(/[A-Z]/g, c => c.toLowerCase());
    if (files.has(folded)) throw new Error(`path collision: ${path}`);
    files.add(folded);
  }
  if (entries.size > resourceLimits.filesystemEntries) throw new Error("filesystem entry上限超過");
  for (const path of files) {
    const parts = path.split("/");
    for (let length = 1; length < parts.length; length++) {
      if (files.has(parts.slice(0, length).join("/"))) throw new Error(`path collision: ${path}`);
    }
  }
}
