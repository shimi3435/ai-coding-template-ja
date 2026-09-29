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
  return execFileSync(command, args, { encoding: "utf8", stdio: "pipe" }).replace(/\r?\n$/, "");
}

function versionTuple(version: string, label: string, prefix: string): [string, string, string] {
  const body = version.startsWith(prefix) ? version.slice(prefix.length) : "";
  const match = body.match(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/);
  if (match === null || match[0] !== body) {
    throw new Error(`${label} version を解析できません: ${version}`);
  }
  return [match[1], match[2], match[3]];
}

// Canonical decimal strings compare without integer overflow or precision loss.
function decimalLessThan(left: string, right: string): boolean {
  return left.length < right.length || (left.length === right.length && left < right);
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
  const [nodeMajor] = versionTuple(node, "Node.js", "v");
  if (nodeMajor !== "24") {
    throw new Error(`Node.js 24 が必要です（検出: ${node}）`);
  }

  try {
    npm = run("npm", ["--version"]);
  } catch (error: unknown) {
    throw runtimeCommandError("npm", error);
  }
  versionTuple(npm, "npm", "");

  try {
    pythonOutput = run("python3", ["--version"]);
  } catch (error: unknown) {
    throw runtimeCommandError("Python", error);
  }
  const [pythonMajor, pythonMinor] = versionTuple(pythonOutput, "Python", "Python ");
  const python = pythonOutput.slice("Python ".length);
  if (decimalLessThan(pythonMajor, "3") || (pythonMajor === "3" && decimalLessThan(pythonMinor, "14"))) {
    throw new Error(`Python >=3.14 が必要です（検出: ${python}）`);
  }

  return { node, npm, python };
}
