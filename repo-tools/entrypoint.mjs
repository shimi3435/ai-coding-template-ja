import { pathToFileURL } from "url";

/**
 * @param {string} version
 * @returns {string | null}
 */
export function validateNode24(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null || Number(match[1]) !== 24) {
    return `Node.js 24 が必要です（検出: v${version}）`;
  }
  return null;
}

async function main() {
  const failure = validateNode24(process.versions.node);
  if (failure !== null) {
    console.error(failure);
    process.exitCode = 1;
    return;
  }
  await import("./cli.ts");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  });
}
