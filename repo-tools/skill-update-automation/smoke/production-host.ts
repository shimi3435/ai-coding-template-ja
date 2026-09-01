import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import {
  createPresentResourceState,
  parseDecimalId,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseSha,
} from "../model/index.ts";
import type { SmokePreview, SmokeResource, SmokeTarget } from "../model/index.ts";
import { redactCredentialText } from "../../skill-updater/index.ts";
import { smokeIssueBody, smokePullRequestBody, smokePullRequestTitle } from "./command.ts";
import type {
  SmokeCommitComparison,
  SmokeHost,
  SmokeRepository,
  SmokeResourceObservation,
  SmokeWorkflowRun,
} from "./host.ts";

export type SmokeHostCommandResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;
export type SmokeHostCommandRunner = (
  command: string,
  args: readonly string[],
  options?: Readonly<{ input?: string }>,
) => SmokeHostCommandResult;

const smokeHostEnvironmentKeys = [
  "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR", "GH_CONFIG_DIR",
  "DBUS_SESSION_BUS_ADDRESS", "TMPDIR", "TMP", "TEMP", "SystemRoot", "ComSpec", "PATHEXT",
  "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "TZ",
  "SSL_CERT_FILE", "SSL_CERT_DIR",
] as const;

export function buildSmokeHostEnvironment(source: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of smokeHostEnvironmentKeys) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function defaultRunner(command: string, args: readonly string[], options: Readonly<{ input?: string }> = {}): SmokeHostCommandResult {
  const result = spawnSync(command, args, { encoding: "utf8", input: options.input, env: buildSmokeHostEnvironment(process.env) });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}がobjectではありません`);
  return value as Record<string, unknown>;
}

function githubId(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("GitHub IDが不正です");
    return String(value);
  }
  return parseDecimalId(value);
}

function command(runner: SmokeHostCommandRunner, args: readonly string[], options?: Readonly<{ input?: string }>): string {
  const result = runner("gh", args, options);
  if (result.exitCode !== 0) throw new Error(redactCredentialText(result.stderr.trim() || result.stdout.trim() || "gh api failed"));
  return result.stdout.trim();
}

function branchRef(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._/-]+$/.test(value)) throw new Error("default branchが不正です");
  return `refs/heads/${value}`;
}

function digestBody(value: unknown): string {
  if (value !== null && typeof value !== "string") throw new Error("GitHub bodyが不正です");
  return `sha256:${createHash("sha256").update(value ?? "", "utf8").digest("hex")}`;
}

function pullRequestObservation(value: unknown): SmokeResourceObservation {
  const item = object(value, "pull request");
  const head = object(item.head, "pull request head");
  const base = object(item.base, "pull request base");
  const headRepository = object(head.repo, "pull request head repository");
  const baseRepository = object(base.repo, "pull request base repository");
  if (item.state !== "open" && item.state !== "closed") throw new Error("pull request stateが不正です");
  if (typeof item.draft !== "boolean") throw new Error("pull request draftが不正です");
  let merged: boolean;
  if (typeof item.merged === "boolean") merged = item.merged;
  else if (item.merged_at === null) merged = false;
  else if (typeof item.merged_at === "string" && item.merged_at.length > 0) merged = true;
  else throw new Error("pull request mergedが不正です");
  const number = parsePositiveSafeInteger(item.number);
  return {
    number,
    state: createPresentResourceState({
      schemaVersion: 1,
      kind: "pull-request-state",
      headRepositoryId: githubId(headRepository.id),
      headRef: branchRef(head.ref),
      headSha: parseSha(head.sha),
      baseRepositoryId: githubId(baseRepository.id),
      baseRef: branchRef(base.ref),
      draft: item.draft,
      state: item.state,
      merged,
      bodyDigest: digestBody(item.body),
    }),
  };
}

function issueObservation(value: unknown): SmokeResourceObservation {
  const item = object(value, "issue");
  if (Object.hasOwn(item, "pull_request")) throw new Error("issue locatorがpull requestを参照しています");
  if (item.state !== "open" && item.state !== "closed") throw new Error("issue stateが不正です");
  if (typeof item.title !== "string" || item.title.length === 0) throw new Error("issue titleが不正です");
  const number = parsePositiveSafeInteger(item.number);
  return {
    number,
    state: createPresentResourceState({
      schemaVersion: 1,
      kind: "issue-state",
      state: item.state,
      title: item.title,
      bodyDigest: digestBody(item.body),
    }),
  };
}

function branchName(ref: string): string {
  if (!ref.startsWith("refs/heads/")) throw new Error("branch refが不正です");
  return ref.slice("refs/heads/".length);
}

function resourceNumber(resource: SmokeResource, bindings: ReadonlyMap<string, number>): number {
  if (resource.kind === "branch") throw new Error("branchにnumberはありません");
  if (resource.locator.mode === "existing") return resource.locator.number;
  const number = bindings.get(resource.key);
  if (number === undefined) throw new Error("planned resource keyが未束縛です");
  return parsePositiveSafeInteger(number);
}

function pullRequestBodyContext(preview: SmokePreview, resource: SmokeResource) {
  if (resource.kind !== "pull-request" || resource.locator.mode !== "planned") {
    throw new Error("planned PR body contextが不正です");
  }
  const initialBranch = preview.steps.flatMap((step) => step.after)
    .find((item) => item.resource.kind === "branch" && item.state.state === "present");
  if (initialBranch?.state.state !== "present" || initialBranch.state.value.kind !== "branch-state") {
    throw new Error("planned PR validation baseが見つかりません");
  }
  return {
    repositoryId: preview.repositoryId,
    repository: preview.repository,
    run: preview.run,
    headRef: resource.locator.headRef,
    baseRef: resource.locator.baseRef,
    validationBaseSha: initialBranch.state.value.sha,
    sourceCommit: preview.sourceCommit,
  };
}

function issueBodyContext(preview: SmokePreview) {
  return {
    repositoryId: preview.repositoryId,
    repository: preview.repository,
    run: preview.run,
    sourceCommit: preview.sourceCommit,
  };
}

export class ProductionSmokeHost implements SmokeHost {
  readonly #repository: string;
  readonly #runner: SmokeHostCommandRunner;

  constructor(input: Readonly<{ repository: string; runner?: SmokeHostCommandRunner }>) {
    this.#repository = parseRepositoryFullName(input.repository);
    this.#runner = input.runner ?? defaultRunner;
  }

  async readRepository(): Promise<SmokeRepository> {
    const value = object(JSON.parse(command(this.#runner, ["api", "--method", "GET", `repos/${this.#repository}`])) as unknown, "repository");
    return {
      id: githubId(value.id),
      fullName: parseRepositoryFullName(value.full_name),
      defaultBranchRef: branchRef(value.default_branch),
    };
  }

  async readWorkflowRun(runId: string): Promise<SmokeWorkflowRun | null> {
    const id = parseDecimalId(runId);
    const result = this.#runner("gh", ["api", "--method", "GET", `repos/${this.#repository}/actions/runs/${id}`]);
    if (result.exitCode !== 0) {
      if (/HTTP 404|Not Found/i.test(result.stderr)) return null;
      throw new Error(redactCredentialText(result.stderr.trim() || "workflow run read failed"));
    }
    const value = object(JSON.parse(result.stdout) as unknown, "workflow run");
    const repository = object(value.repository, "workflow run repository");
    return {
      id: githubId(value.id),
      attempt: parsePositiveSafeInteger(value.run_attempt),
      repositoryId: githubId(repository.id),
      repository: parseRepositoryFullName(repository.full_name),
      headSha: parseSha(value.head_sha),
    };
  }

  async readCommitParent(sha: string): Promise<string | null> {
    const commitSha = parseSha(sha);
    const value = object(JSON.parse(command(this.#runner, [
      "api", "--method", "GET", `repos/${this.#repository}/commits/${commitSha}`,
    ])) as unknown, "commit");
    if (!Array.isArray(value.parents)) throw new Error("commit parentsが不正です");
    if (value.parents.length === 0) return null;
    const parent = object(value.parents[0], "commit parent");
    return parseSha(parent.sha);
  }

  async readCommitComparison(baseSha: string, headSha: string): Promise<SmokeCommitComparison> {
    const base = parseSha(baseSha);
    const head = parseSha(headSha);
    const value = object(JSON.parse(command(this.#runner, [
      "api", "--method", "GET", `repos/${this.#repository}/compare/${base}...${head}`,
    ])) as unknown, "commit comparison");
    const statuses: readonly SmokeCommitComparison["status"][] = ["ahead", "behind", "identical", "diverged"];
    if (typeof value.status !== "string" || !statuses.includes(value.status as SmokeCommitComparison["status"])) {
      throw new Error("commit comparison statusが不正です");
    }
    const count = (input: unknown, label: string): number => {
      if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) {
        throw new Error(`${label}が不正です`);
      }
      return input;
    };
    return {
      status: value.status as SmokeCommitComparison["status"],
      aheadBy: count(value.ahead_by, "commit comparison ahead_by"),
      behindBy: count(value.behind_by, "commit comparison behind_by"),
    };
  }

  #readApiResource(endpoint: string, normalize: (value: unknown) => SmokeResourceObservation, number?: number): SmokeResourceObservation {
    const result = this.#runner("gh", ["api", "--method", "GET", endpoint]);
    if (result.exitCode !== 0) {
      if (/HTTP 404|Not Found/i.test(result.stderr)) {
        return { state: { state: "absent" }, ...(number === undefined ? {} : { number }) };
      }
      throw new Error(redactCredentialText(result.stderr.trim() || "GitHub resource read failed"));
    }
    return normalize(JSON.parse(result.stdout) as unknown);
  }

  async readResource(resource: SmokeResource, bindings: ReadonlyMap<string, number>): Promise<SmokeResourceObservation> {
    if (resource.kind === "branch") {
      const endpoint = `repos/${this.#repository}/git/ref/${resource.ref.slice("refs/".length)}`;
      const result = this.#runner("gh", ["api", "--method", "GET", endpoint]);
      if (result.exitCode !== 0) {
        if (/HTTP 404|Not Found/i.test(result.stderr)) return { state: { state: "absent" } };
        throw new Error(redactCredentialText(result.stderr.trim() || "branch read failed"));
      }
      const item = object(JSON.parse(result.stdout) as unknown, "git ref");
      const gitObject = object(item.object, "git ref object");
      if (item.ref !== resource.ref) throw new Error("branch ref identityが一致しません");
      return {
        state: createPresentResourceState({
          schemaVersion: 1,
          kind: "branch-state",
          ref: resource.ref,
          sha: parseSha(gitObject.sha),
        }),
      };
    }
    if (resource.kind === "pull-request" && resource.locator.mode === "existing") {
      return this.#readApiResource(
        `repos/${this.#repository}/pulls/${resource.locator.number}`,
        pullRequestObservation,
        resource.locator.number,
      );
    }
    if (resource.kind === "issue" && resource.locator.mode === "existing") {
      return this.#readApiResource(
        `repos/${this.#repository}/issues/${resource.locator.number}`,
        issueObservation,
        resource.locator.number,
      );
    }
    const binding = bindings.get(resource.key);
    if (resource.kind === "pull-request" && binding !== undefined) {
      return this.#readApiResource(`repos/${this.#repository}/pulls/${binding}`, pullRequestObservation, binding);
    }
    if (resource.kind === "issue" && binding !== undefined) {
      return this.#readApiResource(`repos/${this.#repository}/issues/${binding}`, issueObservation, binding);
    }
    if (resource.kind === "pull-request") {
      if (resource.locator.mode !== "planned") throw new Error("pull request locator modeが不正です");
      const locator = resource.locator;
      const pages = JSON.parse(command(this.#runner, [
        "api", "--method", "GET", "--paginate", "--slurp",
        `repos/${this.#repository}/pulls?state=all&per_page=100`,
      ])) as unknown;
      if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error("pull request paginationが不正です");
      const matches = pages.flat().filter((value) => {
        const item = object(value, "pull request");
        const head = object(item.head, "pull request head");
        const base = object(item.base, "pull request base");
        return branchRef(head.ref) === locator.headRef && branchRef(base.ref) === locator.baseRef;
      });
      if (matches.length > 1) throw new Error("planned pull request identityが一意ではありません");
      return matches.length === 0 ? { state: { state: "absent" } } : pullRequestObservation(matches[0]);
    }
    if (resource.locator.mode !== "planned") throw new Error("issue locator modeが不正です");
    const locator = resource.locator;
    const pages = JSON.parse(command(this.#runner, [
      "api", "--method", "GET", "--paginate", "--slurp",
      `repos/${this.#repository}/issues?state=all&per_page=100`,
    ])) as unknown;
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error("issue paginationが不正です");
    const marker = "<!-- skill-update-automation-smoke:v1 key=smoke-issue -->";
    const matches = pages.flat().filter((value) => {
      const item = object(value, "issue");
      return !Object.hasOwn(item, "pull_request") && item.title === locator.title &&
        typeof item.body === "string" && item.body.includes(marker);
    });
    if (matches.length > 1) throw new Error("planned issue identityが一意ではありません");
    return matches.length === 0 ? { state: { state: "absent" } } : issueObservation(matches[0]);
  }

  async applyTarget(
    target: SmokeTarget,
    bindings: ReadonlyMap<string, number>,
    preview: SmokePreview,
  ): Promise<SmokeResourceObservation> {
    if (target.resource.kind === "branch") {
      if (target.operation === "delete") {
        command(this.#runner, [
          "api", "--method", "DELETE",
          `repos/${this.#repository}/git/refs/${target.resource.ref.slice("refs/".length)}`,
        ]);
        return { state: { state: "absent" } };
      }
      if (target.after.state !== "present" || target.after.value.kind !== "branch-state") {
        throw new Error("branch write after stateが不正です");
      }
      const endpoint = target.operation === "create"
        ? `repos/${this.#repository}/git/refs`
        : `repos/${this.#repository}/git/refs/${target.resource.ref.slice("refs/".length)}`;
      const input = target.operation === "create"
        ? { ref: target.resource.ref, sha: target.after.value.sha }
        : { sha: target.after.value.sha, force: false };
      const value = object(JSON.parse(command(this.#runner, [
        "api", "--method", target.operation === "create" ? "POST" : "PATCH", "--input", "-", endpoint,
      ], { input: JSON.stringify(input) })) as unknown, "git ref");
      const gitObject = object(value.object, "git ref object");
      if (value.ref !== target.resource.ref) throw new Error("branch write response refが一致しません");
      return {
        state: createPresentResourceState({
          schemaVersion: 1,
          kind: "branch-state",
          ref: target.resource.ref,
          sha: parseSha(gitObject.sha),
        }),
      };
    }

    if (target.resource.kind === "pull-request" && target.operation === "create") {
      if (target.resource.locator.mode !== "planned" || target.after.state !== "present" ||
        target.after.value.kind !== "pull-request-state") throw new Error("planned PR create targetが不正です");
      const body = smokePullRequestBody(pullRequestBodyContext(preview, target.resource), "initial");
      if (target.after.value.bodyDigest !== digestBody(body)) throw new Error("planned PR body digestが一致しません");
      const output = command(this.#runner, [
        "api", "--method", "POST", "--input", "-", `repos/${this.#repository}/pulls`,
      ], { input: JSON.stringify({
        title: smokePullRequestTitle,
        head: branchName(target.resource.locator.headRef),
        base: branchName(target.resource.locator.baseRef),
        body,
        draft: true,
      }) });
      return pullRequestObservation(JSON.parse(output) as unknown);
    }

    if (target.resource.kind === "issue" && target.operation === "create") {
      if (target.resource.locator.mode !== "planned" || target.after.state !== "present" ||
        target.after.value.kind !== "issue-state") throw new Error("planned issue create targetが不正です");
      const body = smokeIssueBody(issueBodyContext(preview), "initial");
      if (target.after.value.bodyDigest !== digestBody(body)) throw new Error("planned issue body digestが一致しません");
      const output = command(this.#runner, [
        "api", "--method", "POST", "--input", "-", `repos/${this.#repository}/issues`,
      ], { input: JSON.stringify({ title: target.resource.locator.title, body }) });
      return issueObservation(JSON.parse(output) as unknown);
    }

    const number = resourceNumber(target.resource, bindings);
    if (target.resource.kind === "pull-request") {
      if (target.operation === "draft" || target.operation === "ready") {
        command(this.#runner, [
          "pr", "ready", String(number), ...(target.operation === "draft" ? ["--undo"] : []), "--repo", this.#repository,
        ]);
      } else {
        let input: Readonly<Record<string, unknown>>;
        if (target.operation === "close" || target.operation === "reopen") {
          input = { state: target.operation === "close" ? "closed" : "open" };
        } else if (target.operation === "update") {
          if (target.after.state !== "present" || target.after.value.kind !== "pull-request-state") {
            throw new Error("PR update after stateが不正です");
          }
          const afterValue = target.after.value;
          const context = pullRequestBodyContext(preview, target.resource);
          const bodies = [
            smokePullRequestBody(context, "validation-failed"),
            smokePullRequestBody(context, "passed"),
          ];
          const body = bodies.find((candidate) => afterValue.bodyDigest === digestBody(candidate));
          if (body === undefined) throw new Error("PR update body digestが未対応です");
          input = { body };
        } else {
          throw new Error("PR smoke operationが不正です");
        }
        command(this.#runner, [
          "api", "--method", "PATCH", "--input", "-", `repos/${this.#repository}/pulls/${number}`,
        ], { input: JSON.stringify(input) });
      }
      return this.readResource(target.resource, bindings);
    }

    if (target.operation === "update") {
      const body = smokeIssueBody(issueBodyContext(preview), "updated");
      if (target.after.state !== "present" || target.after.value.kind !== "issue-state" ||
        target.after.value.bodyDigest !== digestBody(body)) throw new Error("issue update body digestが未対応です");
      command(this.#runner, [
        "api", "--method", "PATCH", "--input", "-", `repos/${this.#repository}/issues/${number}`,
      ], { input: JSON.stringify({ body }) });
    } else if (target.operation === "close" || target.operation === "reopen") {
      command(this.#runner, [
        "api", "--method", "PATCH", "--input", "-", `repos/${this.#repository}/issues/${number}`,
      ], { input: JSON.stringify({ state: target.operation === "close" ? "closed" : "open" }) });
    } else {
      throw new Error("issue smoke operationが不正です");
    }
    return this.readResource(target.resource, bindings);
  }
}
