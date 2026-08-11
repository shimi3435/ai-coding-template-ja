import { execFileSync } from "node:child_process";

export type RuntimeVersions = {
  node: string;
  npm: string;
  python: string;
};

type CommandRunner = (command: string, args: readonly string[]) => string;

type CommandError = Error & {
  code?: string;
  status?: number | null;
};

function systemCommandRunner(command: string, args: readonly string[]): string {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function versionTuple(version: string, label: string): [number, number, number] {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (match === null) {
    throw new Error(`${label} version を解析できません: ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function runtimeCommandError(label: string, error: unknown): Error {
  const commandError = error as CommandError;
  if (commandError.code === "ENOENT") {
    return new Error(`${label} executable が見つかりません`);
  }
  const status = commandError.status === undefined ? "unknown" : String(commandError.status);
  return new Error(`${label} version command が失敗しました（exit: ${status}）`);
}

export function detectAndValidateRuntimes(
  run: CommandRunner = systemCommandRunner,
): RuntimeVersions {
  let node: string;
  let npm: string;
  let pythonOutput: string;
  try {
    node = run("node", ["--version"]);
  } catch (error: unknown) {
    throw runtimeCommandError("Node.js", error);
  }
  const [nodeMajor] = versionTuple(node, "Node.js");
  if (nodeMajor !== 24) {
    throw new Error(`Node.js 24 が必要です（検出: ${node}）`);
  }

  try {
    npm = run("npm", ["--version"]);
  } catch (error: unknown) {
    throw runtimeCommandError("npm", error);
  }
  versionTuple(npm, "npm");

  try {
    pythonOutput = run("python3", ["--version"]);
  } catch (error: unknown) {
    throw runtimeCommandError("Python", error);
  }
  const python = pythonOutput.replace(/^Python\s+/, "");
  const [pythonMajor, pythonMinor] = versionTuple(python, "Python");
  if (pythonMajor < 3 || (pythonMajor === 3 && pythonMinor < 14)) {
    throw new Error(`Python >=3.14 が必要です（検出: ${python}）`);
  }

  return { node, npm, python };
}
