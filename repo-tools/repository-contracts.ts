import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

function validIdentifiers(value: string, rejectNumericLeadingZero: boolean): boolean {
  if (value.length === 0) {
    return false;
  }
  return value.split(".").every((identifier) => {
    if (!/^[0-9A-Za-z-]+$/.test(identifier)) {
      return false;
    }
    return !(
      rejectNumericLeadingZero &&
      /^\d+$/.test(identifier) &&
      identifier.length > 1 &&
      identifier.startsWith("0")
    );
  });
}

function isExactSemver(version: string): boolean {
  const plus = version.indexOf("+");
  if (plus !== -1) {
    if (version.indexOf("+", plus + 1) !== -1 || !validIdentifiers(version.slice(plus + 1), false)) {
      return false;
    }
  }
  const withoutBuild = plus === -1 ? version : version.slice(0, plus);
  const dash = withoutBuild.indexOf("-");
  if (dash !== -1 && !validIdentifiers(withoutBuild.slice(dash + 1), true)) {
    return false;
  }
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(core);
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

  const templateVersion = readFileSync(join(repositoryRoot, "TEMPLATE_VERSION"), "utf8").trim();
  if (templateVersion !== "1.0.0") {
    throw new Error(`TEMPLATE_VERSION は 1.0.0 を維持してください（検出: ${templateVersion}）`);
  }

  const gitignorePath = join(repositoryRoot, ".gitignore");
  const gitignoreLines = readFileSync(gitignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim());
  if (!gitignoreLines.includes("/node_modules/")) {
    throw new Error(`${gitignorePath}: /node_modules/ を除外してください`);
  }

  const releaseHandoffPath = join(repositoryRoot, "docs", "template", "release.md");
  const releaseHandoff = readFileSync(releaseHandoffPath, "utf8");
  const requiredHandoffMarkers = [
    "prepare-v2-release",
    "Node.js 24",
    "Python >=3.14",
    "TEMPLATE_VERSION=2.0.0",
  ];
  const missingHandoffMarkers = requiredHandoffMarkers.filter(
    (marker) => !releaseHandoff.includes(marker),
  );
  if (missingHandoffMarkers.length > 0) {
    throw new Error(
      `${releaseHandoffPath}: prepare-v2-release handoff が不足しています: ${missingHandoffMarkers.join(", ")}`,
    );
  }

  const taskfilePath = join(repositoryRoot, "Taskfile.yml");
  const taskfileText = readFileSync(taskfilePath, "utf8");
  const requiredNpmRoutes = ["npm ci --ignore-scripts", "npm audit --audit-level=high"];
  const missingNpmRoutes = requiredNpmRoutes.filter((route) => !taskfileText.includes(route));
  if (missingNpmRoutes.length > 0) {
    throw new Error(`${taskfilePath}: npm 公開入口が不足しています: ${missingNpmRoutes.join(", ")}`);
  }

  const taskCommands: string[] = [];
  let insideCommands = false;
  for (const line of taskfileText.split("\n")) {
    if (/^  \S.*:\s*$/.test(line)) {
      insideCommands = false;
    } else if (line === "    cmds:") {
      insideCommands = true;
    } else if (insideCommands && !line.trimStart().startsWith("#")) {
      taskCommands.push(line);
    }
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
    taskCommands.join("\n"),
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
    "prepare-v2-release handoff",
    "native network access: none",
    "forbidden Node runners: none",
  ];
}
