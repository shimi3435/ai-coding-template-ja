import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseSemver } from "semver";
import { validateTemplateConfiguration } from "./template-prune-contract.ts";
import { validateRepositoryTaskfile } from "./repository-taskfile.ts";

type PackageManifest = {
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: unknown;
  devDependencies?: unknown;
};

type PackageLock = {
  lockfileVersion?: number;
};

const npxCommand = ["n", "px"].join("");
const npmExecCommand = ["npm", "exec"].join("\\s+");
const tsxCommand = ["t", "sx"].join("");
const jestCommand = ["je", "st"].join("");
const vitestCommand = ["vi", "test"].join("");
const distPath = ["di", "st"].join("");
const fetchFunction = ["fet", "ch"].join("");
const webSocketConstructor = ["Web", "Socket"].join("");
const eventSourceConstructor = ["Event", "Source"].join("");
const nativeNetworkSpecifiers = [
  ["ht", "tp"].join(""),
  ["ht", "tps"].join(""),
  ["ht", "tp2"].join(""),
  ["n", "et"].join(""),
  ["t", "ls"].join(""),
  ["d", "ns"].join(""),
  ["d", "gram"].join(""),
  ["q", "uic"].join(""),
  ["node:h", "ttp"].join(""),
  ["node:ht", "tps"].join(""),
  ["node:ht", "tp2"].join(""),
  ["node:n", "et"].join(""),
  ["node:t", "ls"].join(""),
  ["node:d", "ns"].join(""),
  ["node:d", "gram"].join(""),
  ["node:q", "uic"].join(""),
  ["un", "dici"].join(""),
];
const forbiddenRunner = new RegExp(
  `(?<!command -v )\\b${npxCommand}\\s+|\\b${npmExecCommand}\\b|\\b${tsxCommand}\\s+|\\b${jestCommand}\\s+|\\b${vitestCommand}\\s+|\\bnode\\s+(?:\\.\\/)?${distPath}\\/`,
);
const prohibitedNetwork = new RegExp(
  `\\b${fetchFunction}\\s*\\(|\\bnew\\s+(?:${webSocketConstructor}|${eventSourceConstructor})\\s*\\(|(?:\\bfrom\\s+|\\bimport\\s*(?:\\(\\s*)?|\\brequire\\s*\\(\\s*)["'](?:${nativeNetworkSpecifiers.join("|")})(?:\\/[^"']*)?["']`,
);

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: JSON metadata を読めません: ${reason}`);
  }
}

function isExactSemver(version: string): boolean {
  const parsed = parseSemver(version);
  if (parsed === null) return false;
  // semver.version は build metadata を含まず、prefix や空白も正規化する。
  const canonical = parsed.version + (parsed.build.length > 0 ? `+${parsed.build.join(".")}` : "");
  return canonical === version;
}

function readRepoToolsSources(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return readRepoToolsSources(path);
    }
    if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs")) &&
      !entry.name.endsWith(".test.ts")
    ) {
      return [readFileSync(path, "utf8")];
    }
    return [];
  });
}

function readWorkflowSources(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readFileSync(join(directory, entry.name), "utf8"));
}

function dependencyRecord(value: unknown, field: string): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`package.json ${field} は package name と exact version の object が必要です`);
  }
  const entries = Object.entries(value);
  const invalidValue = entries.find(([, version]) => typeof version !== "string");
  if (invalidValue !== undefined) {
    throw new Error(`package.json ${field}.${invalidValue[0]} は string version が必要です`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

export function validateRepositoryContracts(): readonly string[] {
  const repositoryRoot = process.cwd();
  const manifest = readJson<PackageManifest>(join(repositoryRoot, "package.json"));
  if (manifest.private !== true) {
    throw new Error("package.json は private: true が必要です");
  }

  const dependencySets = [
    dependencyRecord(manifest.dependencies, "dependencies"),
    dependencyRecord(manifest.devDependencies, "devDependencies"),
  ];
  const invalidDependencies = dependencySets.flatMap((dependencies) =>
    Object.entries(dependencies)
      .filter(([, version]) => !isExactSemver(version))
      .map(([name, version]) => `${name}@${version}`),
  );
  if (invalidDependencies.length > 0) {
    throw new Error(`exact でない npm dependency: ${invalidDependencies.join(", ")}`);
  }

  const lock = readJson<PackageLock>(join(repositoryRoot, "package-lock.json"));
  if (lock.lockfileVersion !== 3) {
    throw new Error(`package-lock v3 が必要です（検出: ${String(lock.lockfileVersion)}）`);
  }

  // Pythonのsplitlines / str.stripと同じ空行判定。値そのものはtrimしない。
  const versionLines = readFileSync(join(repositoryRoot, "TEMPLATE_VERSION"), "utf8")
    .split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u).filter(line => /[^\t\n\r\v\f \x1c-\x1f\x85\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u.test(line));
  if (versionLines.length !== 1 || !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u.test(versionLines[0]!)) {
    throw new Error("TEMPLATE_VERSION は単一行の X.Y.Z 形式が必要です");
  }
  const templateVersion = versionLines[0]!;

  const gitignorePath = join(repositoryRoot, ".gitignore");
  const gitignoreLines = readFileSync(gitignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim());
  if (!gitignoreLines.includes("/node_modules/")) {
    throw new Error(`${gitignorePath}: /node_modules/ を除外してください`);
  }

  const taskfilePath = join(repositoryRoot, "Taskfile.yml");
  const taskfileText = readFileSync(taskfilePath, "utf8");
  let taskCommands: readonly string[];
  try {
    taskCommands = validateRepositoryTaskfile(taskfileText);
  } catch (error: unknown) {
    throw new Error(`${taskfilePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const legacySkillPaths = [
    join(repositoryRoot, "scripts", "skills-upstream-check.py"),
    join(repositoryRoot, "tests", "test_skills_upstream_check.py"),
  ];
  const remainingLegacyPaths = legacySkillPaths.filter(existsSync);
  if (remainingLegacyPaths.length > 0) {
    throw new Error(`legacy skill checkerが残っています: ${remainingLegacyPaths.join(", ")}`);
  }

  const withoutComments = (text: string): string =>
    text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
  const repoToolsSources = readRepoToolsSources(join(repositoryRoot, "repo-tools"));
  const workflowSources = readWorkflowSources(join(repositoryRoot, ".github", "workflows"));
  if (repoToolsSources.some((source) => prohibitedNetwork.test(source))) {
    throw new Error("repo-tools source に native network access が含まれます");
  }

  const publicRoutes = [
    JSON.stringify(manifest.scripts ?? {}),
    ...taskCommands,
    ...workflowSources.map(withoutComments),
    withoutComments(readFileSync(join(repositoryRoot, "scripts/bootstrap.sh"), "utf8")),
    ...repoToolsSources,
  ];
  if (publicRoutes.some((route) => forbiddenRunner.test(route))) {
    throw new Error("公開経路に forbidden Node runner が含まれます");
  }

  return [
    "exact npm dependencies",
    "package-lock v3",
    "node_modules ignored",
    "deterministic npm install and audit routes",
    `TEMPLATE_VERSION ${templateVersion}`,
    "native network access: none",
    "forbidden Node runners in static command text: none",
    "skill updater routes",
    "legacy skill checker: absent",
    ...validateTemplateConfiguration(repositoryRoot),
  ];
}
