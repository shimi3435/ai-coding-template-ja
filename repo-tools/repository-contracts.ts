import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

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

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function yamlBlock(lines: readonly string[], header: string, indent: number): readonly string[] {
  const exact = `${" ".repeat(indent)}${header}:`;
  const index = lines.findIndex((line) => line === exact);
  if (index < 0) throw new Error(`YAML field がありません: ${header}`);
  let end = index + 1;
  while (end < lines.length && (lines[end]!.trim().length === 0 || indentation(lines[end]!) > indent)) end += 1;
  return lines.slice(index + 1, end);
}

function directYamlKeys(lines: readonly string[], indent: number): readonly string[] {
  return lines.flatMap((line) => {
    if (indentation(line) !== indent) return [];
    const match = line.trim().match(/^([A-Za-z0-9_-]+):/);
    return match === null ? [] : [match[1]!];
  });
}

function yamlPermissions(jobBlock: readonly string[]): Record<string, string> {
  const permissions = yamlBlock(jobBlock, "permissions", 4);
  const entries = permissions.flatMap((line) => {
    const match = line.match(/^ {6}([A-Za-z-]+): (read|write|none)$/);
    return match === null ? [] : [[match[1]!, match[2]!]] as const;
  });
  if (entries.length !== permissions.filter((line) => line.trim().length > 0).length) {
    throw new Error("workflow job permissions が不正です");
  }
  if (new Set(entries.map(([name]) => name)).size !== entries.length) {
    throw new Error("workflow job permissions が重複しています");
  }
  return Object.fromEntries(entries);
}

function validateSkillUpdateWorkflow(repositoryRoot: string): void {
  const path = join(repositoryRoot, ".github", "workflows", "skill-update-prs.yml");
  const source = readFileSync(path, "utf8");
  if (source.includes("\t")) throw new Error(`${path}: tab indentation は許可されません`);
  const lines = source.split("\n");
  const triggers = yamlBlock(lines, "on", 0);
  if (!isDeepStrictEqual([...directYamlKeys(triggers, 2)].sort(), ["schedule", "workflow_dispatch"])) {
    throw new Error(`${path}: trigger は weekly schedule と workflow_dispatch だけが必要です`);
  }
  const schedule = yamlBlock(triggers, "schedule", 2).filter((line) => line.trim().length > 0);
  if (!isDeepStrictEqual(schedule, ["    - cron: \"17 3 * * 1\""]) &&
    !isDeepStrictEqual(schedule, ["    - cron: '17 3 * * 1'"])) {
    throw new Error(`${path}: weekly schedule が不正です`);
  }
  const dispatch = yamlBlock(triggers, "workflow_dispatch", 2);
  const inputs = yamlBlock(dispatch, "inputs", 4);
  if (!isDeepStrictEqual(directYamlKeys(inputs, 6), ["resume_closed"])) throw new Error(`${path}: resume_closed だけが許可されます`);
  const resume = yamlBlock(inputs, "resume_closed", 6);
  if (!resume.includes("        required: true") || !resume.includes("        default: false") ||
    !resume.includes("        type: boolean")) {
    throw new Error(`${path}: resume_closed は required boolean / default false が必要です`);
  }
  if (lines.filter((line) => line === "permissions: {}").length !== 1) {
    throw new Error(`${path}: top-level permissions は空が必要です`);
  }

  const jobs = yamlBlock(lines, "jobs", 0);
  if (!isDeepStrictEqual([...directYamlKeys(jobs, 2)].sort(), [
    "cleanup-merged", "detect", "publish-draft", "publish-finalize", "validate",
  ])) {
    throw new Error(`${path}: production workflow job集合が不正です。real-host smokeはworkflow外が必要です`);
  }
  const expectedPermissions: Record<string, Record<string, string>> = {
    detect: { contents: "read", "pull-requests": "read", issues: "read" },
    "publish-draft": { contents: "write", "pull-requests": "write" },
    "cleanup-merged": { contents: "write", "pull-requests": "read" },
    validate: { contents: "read" },
    "publish-finalize": { contents: "read", "pull-requests": "write", issues: "write" },
  };
  for (const [jobName, expected] of Object.entries(expectedPermissions)) {
    const job = yamlBlock(jobs, jobName, 2);
    if (!isDeepStrictEqual(yamlPermissions(job), expected)) throw new Error(`${path}: ${jobName} permissions が不正です`);
  }
  const writeJobs = directYamlKeys(jobs, 2).filter((jobName) =>
    Object.values(yamlPermissions(yamlBlock(jobs, jobName, 2))).includes("write"),
  ).sort();
  if (!isDeepStrictEqual(writeJobs, ["cleanup-merged", "publish-draft", "publish-finalize"])) {
    throw new Error(`${path}: write permission job集合が不正です`);
  }

  const prohibited = [
    /pull_request_target/,
    /--force(?:-with-lease)?/,
    /\+refs\/heads/,
    /\bgit\s+rebase\b/,
    /gh\s+pr\s+merge/,
    /--auto(?:-merge)?/,
    /\bsecrets\./,
    /SKILL_UPDATE_TOKEN|SKILLS_UPDATE_TOKEN|PERSONAL_ACCESS_TOKEN/,
  ];
  if (prohibited.some((pattern) => pattern.test(source))) {
    throw new Error(`${path}: prohibited trigger / history operation / token が含まれます`);
  }
}

function validateSmokeCliBoundary(repositoryRoot: string): void {
  const cliPath = join(repositoryRoot, "repo-tools", "cli.ts");
  const cliSource = readFileSync(cliPath, "utf8");
  const commandMarkers = [
    "skills:automation:smoke",
    "runFreshSmokeCli",
    "ProductionPublishAdapter",
    "ProductionSmokeHost",
    "process.stdin",
    "process.stdout",
    "process.stderr",
  ];
  if (commandMarkers.some((marker) => !cliSource.includes(marker))) throw new Error(`${cliPath}: human smoke CLI routeが必要です`);
  const smokeDirectory = join(repositoryRoot, "repo-tools", "skill-update-automation", "smoke");
  if (!existsSync(smokeDirectory)) throw new Error(`${smokeDirectory}: human smoke CLI implementationが必要です`);
  const smokeSource = readRepoToolsSources(smokeDirectory).join("\n");
  const credentialOrArtifact = /\b(?:GH_TOKEN|GITHUB_TOKEN|PERSONAL_ACCESS_TOKEN|SKILL_UPDATE_TOKEN|SKILLS_UPDATE_TOKEN)\b|\b(?:writeFile|writeFileSync|appendFile|appendFileSync)\b/;
  if (credentialOrArtifact.test(smokeSource)) {
    throw new Error(`${smokeDirectory}: smoke credentialまたはapproval artifact保存経路は許可されません`);
  }

  const automationDirectory = join(repositoryRoot, "repo-tools", "skill-update-automation");
  const automationSource = readRepoToolsSources(automationDirectory).join("\n");
  const prohibitedMutableRootSurface = /\bmanagedSection\b|\bupdateIssue\s*\(|\breopenIssue\s*\(|\breopenPullRequest\s*\(|["'](?:update-issue|reopen-issue|reopen-pull-request)["']/;
  if (prohibitedMutableRootSurface.test(automationSource)) {
    throw new Error(`${automationDirectory}: immutable rootまたはclosed issueを変更するpublic write surfaceは許可されません`);
  }
}

function requireDocumentMarkers(repositoryRoot: string): void {
  const requirements = new Map<string, readonly string[]>([
    ["README.md", ["SKILLS_AUTO_UPDATE", "resume_closed", "skill-update-prs.yml", "task check"]],
    ["docs/guide.md", ["validation-failed", "recovery-required", "cleanup-failed", "fresh approval", "exact digest",
      "journal v2", "fresh repository", "creator numeric user ID", "force-with-lease"]],
    ["docs/agents/safety.md", ["publish-draft", "cleanup-merged", "publish-finalize", "immutable root",
      "gh auth", "real GitHub write"]],
  ]);
  for (const [relativePath, markers] of requirements) {
    const path = join(repositoryRoot, relativePath);
    const text = readFileSync(path, "utf8");
    const missing = markers.filter((marker) => !text.includes(marker));
    if (missing.length > 0) throw new Error(`${relativePath}: ${missing.join(", ")} が不足しています`);
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
  const requiredSkillRoutes = ["skills:links:", "skills:verify:", "skills:check:", "skills:update:", "skills:lock-local:"];
  const missingSkillRoutes = requiredSkillRoutes.filter((route) => !taskfileText.includes(route));
  if (missingSkillRoutes.length > 0) {
    throw new Error(`${taskfilePath}: skill updater routesが不足しています: ${missingSkillRoutes.join(", ")}`);
  }
  const automationCheckRoute = "node --test repo-tools/skill-update-automation/**/*.test.ts";
  let checkTask = "";
  try {
    checkTask = yamlBlock(taskfileText.split("\n"), "check", 2).join("\n");
  } catch {
    throw new Error(`${taskfilePath}: task check が必要です`);
  }
  if (!checkTask.includes(automationCheckRoute)) {
    throw new Error(`${taskfilePath}: skill-update-automation tests を task check に追加してください`);
  }
  validateSkillUpdateWorkflow(repositoryRoot);
  validateSmokeCliBoundary(repositoryRoot);
  requireDocumentMarkers(repositoryRoot);
  const legacySkillPaths = [
    join(repositoryRoot, "scripts", "skills-upstream-check.py"),
    join(repositoryRoot, "tests", "test_skills_upstream_check.py"),
  ];
  const remainingLegacyPaths = legacySkillPaths.filter(existsSync);
  if (remainingLegacyPaths.length > 0) {
    throw new Error(`legacy skill checkerが残っています: ${remainingLegacyPaths.join(", ")}`);
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
    "skill updater routes",
    "legacy skill checker: absent",
    "skill update automation workflow",
    "skill update automation runbook",
    "human smoke CLI credential boundary",
  ];
}
