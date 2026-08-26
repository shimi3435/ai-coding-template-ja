import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

import { readCandidateHistory } from "../candidate/index.ts";
import type {
  GithubAdapter,
  GithubAdapterOperation,
  GithubBranch,
  JournalGithubAdapter,
  GithubPage,
  GithubPermissionPostState,
} from "../github/adapter.ts";
import type { GithubPullRequest } from "../github/discovery.ts";
import type { GithubIssue } from "../github/issue-discovery.ts";
import { issueMarkerEnd, issueMarkerStart, prMarkerEnd, prMarkerStart } from "../model/index.ts";
import type { JournalCommentV2 } from "../model/journal.ts";
import { parsePositiveSafeInteger, parseRepositoryFullName, parseSha } from "../model/index.ts";
import { redactCredentialText } from "../../skill-updater/index.ts";
import type { PublishDraftGithubAdapter } from "./draft.ts";

export type HostCommandResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;
export type HostCommandRunner = (
  command: string,
  args: readonly string[],
  options?: Readonly<{ cwd?: string; input?: string }>,
) => HostCommandResult;

export class GithubHostPermissionError extends Error {
  readonly kind = "permission-denied" as const;
  readonly operation: GithubAdapterOperation;
  readonly postState: GithubPermissionPostState;

  constructor(
    message: string,
    operation: GithubAdapterOperation,
    postState: GithubPermissionPostState,
  ) {
    super(message);
    this.name = "GithubHostPermissionError";
    this.operation = operation;
    this.postState = postState;
  }
}

function defaultRunner(command: string, args: readonly string[], options: Readonly<{ cwd?: string; input?: string }> = {}): HostCommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    env: process.env,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function command(
  runner: HostCommandRunner,
  operation: GithubAdapterOperation,
  name: string,
  args: readonly string[],
  options?: Readonly<{ cwd?: string; input?: string }>,
): string {
  const result = runner(name, args, options);
  if (result.exitCode !== 0) {
    throw hostError(result.stderr.trim() || result.stdout.trim() || `${name} failed`, operation);
  }
  return result.stdout.trim();
}

function hostError(message: string, operation: GithubAdapterOperation): Error {
  const redacted = redactCredentialText(message);
  if (/HTTP 403|resource not accessible by integration|permission denied/i.test(redacted)) {
    return new GithubHostPermissionError(redacted, operation, "unchanged");
  }
  return new Error(redacted);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}がobjectではありません`);
  return value as Record<string, unknown>;
}

function repositoryId(value: unknown): string | null {
  if (value === null) return null;
  const numeric = object(value, "repository").id;
  if (!Number.isSafeInteger(numeric) || (numeric as number) < 1) throw new Error("repository idが不正です");
  return String(numeric);
}

function ref(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._/-]+$/.test(value)) throw new Error("GitHub refが不正です");
  return `refs/heads/${value}`;
}

function pullRequestFromApi(value: unknown): GithubPullRequest {
  const item = object(value, "pull request");
  const head = object(item.head, "pull request head");
  const base = object(item.base, "pull request base");
  if (item.state !== "open" && item.state !== "closed") throw new Error("pull request stateが不正です");
  if (typeof item.draft !== "boolean" || typeof item.title !== "string") throw new Error("pull request fieldが不正です");
  if (item.body !== null && typeof item.body !== "string") throw new Error("pull request bodyが不正です");
  if (item.merged_at !== null && typeof item.merged_at !== "string") throw new Error("pull request merged stateが不正です");
  return {
    prNumber: parsePositiveSafeInteger(item.number),
    state: item.state,
    merged: item.merged_at !== null,
    draft: item.draft,
    headRepositoryId: repositoryId(head.repo),
    headRef: ref(head.ref),
    headSha: parseSha(head.sha),
    baseRepositoryId: repositoryId(base.repo),
    baseRef: ref(base.ref),
    title: item.title,
    body: item.body,
  };
}

function issueFromApi(value: unknown): GithubIssue {
  const item = object(value, "issue");
  if (item.state !== "open" && item.state !== "closed") throw new Error("issue stateが不正です");
  if (typeof item.title !== "string" || (item.body !== null && typeof item.body !== "string")) {
    throw new Error("issue fieldが不正です");
  }
  return {
    issueNumber: parsePositiveSafeInteger(item.number),
    state: item.state,
    title: item.title,
    body: item.body,
    isPullRequest: Object.hasOwn(item, "pull_request"),
  };
}

function journalCommentFromApi(value: unknown): JournalCommentV2 {
  const item = object(value, "journal comment");
  const user = object(item.user, "journal comment user");
  if (typeof item.body !== "string" || typeof item.created_at !== "string" || typeof item.updated_at !== "string") {
    throw new Error("journal comment fieldが不正です");
  }
  return {
    id: String(parsePositiveSafeInteger(item.id)),
    authorUserId: String(parsePositiveSafeInteger(user.id)),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    body: item.body,
  };
}

function replaceManagedSection(body: string, replacement: string): string {
  const start = body.indexOf(prMarkerStart);
  const end = body.indexOf(prMarkerEnd, start + prMarkerStart.length);
  if (start < 0 || end < 0 || body.indexOf(prMarkerStart, start + prMarkerStart.length) >= 0 ||
    body.indexOf(prMarkerEnd, end + prMarkerEnd.length) >= 0) {
    throw new Error("managed PR section identityが不正です");
  }
  return body.slice(0, start) + replacement + body.slice(end + prMarkerEnd.length);
}

function replaceIssueManagedSection(body: string, replacement: string): string {
  const start = body.indexOf(issueMarkerStart);
  const end = body.indexOf(issueMarkerEnd, start + issueMarkerStart.length);
  if (start < 0 || end < 0 || body.indexOf(issueMarkerStart, start + issueMarkerStart.length) >= 0 ||
    body.indexOf(issueMarkerEnd, end + issueMarkerEnd.length) >= 0) {
    throw new Error("managed issue section identityが不正です");
  }
  return body.slice(0, start) + replacement + body.slice(end + issueMarkerEnd.length);
}

function branchName(value: string): string {
  const prefix = "refs/heads/";
  if (!value.startsWith(prefix)) throw new Error("branch refが不正です");
  return value.slice(prefix.length);
}

export class ProductionPublishAdapter implements GithubAdapter, JournalGithubAdapter, PublishDraftGithubAdapter {
  readonly #repository: string;
  readonly #repositoryRoot: string;
  readonly #runner: HostCommandRunner;
  readonly #remoteUrl: string;

  constructor(input: Readonly<{ repository: string; repositoryRoot: string; runner?: HostCommandRunner }>) {
    this.#repository = parseRepositoryFullName(input.repository);
    this.#repositoryRoot = input.repositoryRoot;
    this.#runner = input.runner ?? defaultRunner;
    this.#remoteUrl = `https://github.com/${this.#repository}.git`;
  }

  async listPullRequests(): Promise<GithubPage<GithubPullRequest>> {
    const history = await readCandidateHistory(this.#repository, async (args) => this.#runner("gh", args));
    return { complete: history.complete, items: history.pages.flat() };
  }

  async listIssues(): Promise<GithubPage<GithubIssue>> {
    const output = command(this.#runner, "list-issues", "gh", [
      "api", "--method", "GET", "--paginate", "--slurp",
      `repos/${this.#repository}/issues?state=all&per_page=100`,
    ]);
    const pages = JSON.parse(output) as unknown;
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
      throw new Error("issue paginationがpage配列ではありません");
    }
    return { complete: true, items: pages.flat().map(issueFromApi) };
  }

  async readBranch(branchRef: string): Promise<GithubBranch | null> {
    const output = command(this.#runner, "read-branch", "git", [
      "-c", "credential.helper=!gh auth git-credential",
      "ls-remote", "--refs", this.#remoteUrl, branchRef,
    ], { cwd: this.#repositoryRoot });
    if (output.length === 0) return null;
    const lines = output.split("\n");
    if (lines.length !== 1) throw new Error("remote branch resultが一意ではありません");
    const [sha, observedRef, extra] = lines[0]!.split(/\s+/);
    if (extra !== undefined || observedRef !== branchRef) throw new Error("remote branch identityが不正です");
    return { ref: branchRef, sha: parseSha(sha) };
  }

  async readPullRequest(prNumber: number): Promise<GithubPullRequest | null> {
    const result = this.#runner("gh", ["api", "--method", "GET", `repos/${this.#repository}/pulls/${parsePositiveSafeInteger(prNumber)}`]);
    if (result.exitCode !== 0) {
      if (/HTTP 404|Not Found/i.test(result.stderr)) return null;
      throw hostError(result.stderr.trim() || "pull request read failed", "read-pull-request");
    }
    return pullRequestFromApi(JSON.parse(result.stdout) as unknown);
  }

  async readIssue(issueNumber: number): Promise<GithubIssue | null> {
    const result = this.#runner("gh", ["api", "--method", "GET", `repos/${this.#repository}/issues/${parsePositiveSafeInteger(issueNumber)}`]);
    if (result.exitCode !== 0) {
      if (/HTTP 404|Not Found/i.test(result.stderr)) return null;
      throw hostError(result.stderr.trim() || "issue read failed", "read-issue");
    }
    return issueFromApi(JSON.parse(result.stdout) as unknown);
  }

  async createBranch(input: GithubBranch): Promise<void> {
    command(this.#runner, "create-branch", "git", [
      "-c", "credential.helper=!gh auth git-credential",
      "push", `--force-with-lease=${input.ref}:`, this.#remoteUrl, `${parseSha(input.sha)}:${input.ref}`,
    ], { cwd: this.#repositoryRoot });
  }

  async appendBranch(input: Readonly<{ ref: string; expectedSha: string; candidateSha: string }>): Promise<void> {
    const current = await this.readBranch(input.ref);
    if (current?.sha !== parseSha(input.expectedSha)) throw new Error("remote branch expected head mismatch");
    command(this.#runner, "append-branch", "git", [
      "-c", "credential.helper=!gh auth git-credential",
      "push", `--force-with-lease=${input.ref}:${parseSha(input.expectedSha)}`,
      this.#remoteUrl, `${parseSha(input.candidateSha)}:${input.ref}`,
    ], { cwd: this.#repositoryRoot });
  }

  async deleteBranch(input: Readonly<{ ref: string; expectedSha: string }>): Promise<void> {
    const current = await this.readBranch(input.ref);
    if (current?.sha !== parseSha(input.expectedSha)) throw new Error("remote branch expected head mismatch");
    command(this.#runner, "delete-branch", "git", [
      "-c", "credential.helper=!gh auth git-credential",
      "push", `--force-with-lease=${input.ref}:${parseSha(input.expectedSha)}`,
      this.#remoteUrl, `:${input.ref}`,
    ], { cwd: this.#repositoryRoot });
  }

  async createDraftPullRequest(
    input: Omit<GithubPullRequest, "prNumber" | "state" | "merged" | "draft">,
  ): Promise<GithubPullRequest> {
    const body = JSON.stringify({
      title: input.title,
      head: branchName(input.headRef),
      base: branchName(input.baseRef),
      body: input.body,
      draft: true,
    });
    const output = command(this.#runner, "create-draft-pull-request", "gh", [
      "api", "--method", "POST", `repos/${this.#repository}/pulls`, "--input", "-",
    ], { input: body });
    return pullRequestFromApi(JSON.parse(output) as unknown);
  }

  async updatePullRequest(input: Readonly<{ prNumber: number; draft?: boolean; managedSection?: string }>): Promise<void> {
    const current = await this.readPullRequest(input.prNumber);
    if (current === null || current.state !== "open") throw new Error("open PRが必要です");
    const desired = {
      ...current,
      draft: input.draft ?? current.draft,
      body: input.managedSection === undefined
        ? current.body
        : replaceManagedSection(current.body ?? "", input.managedSection),
    };
    try {
      if (input.draft === true && !current.draft) {
        command(this.#runner, "update-pull-request", "gh", ["pr", "ready", String(input.prNumber), "--undo", "--repo", this.#repository]);
      }
      if (input.managedSection !== undefined) {
        command(this.#runner, "update-pull-request", "gh", [
          "api", "--method", "PATCH", `repos/${this.#repository}/pulls/${input.prNumber}`, "--input", "-",
        ], { input: JSON.stringify({ body: desired.body }) });
      }
      if (input.draft === false && current.draft) {
        command(this.#runner, "update-pull-request", "gh", ["pr", "ready", String(input.prNumber), "--repo", this.#repository]);
      }
    } catch (error: unknown) {
      if (!(error instanceof GithubHostPermissionError)) throw error;
      let postState: GithubPermissionPostState = "unknown";
      try {
        const observed = await this.readPullRequest(input.prNumber);
        if (isDeepStrictEqual(observed, current)) postState = "unchanged";
        else if (isDeepStrictEqual(observed, desired)) postState = "applied";
      } catch {
        postState = "unknown";
      }
      throw new GithubHostPermissionError(error.message, "update-pull-request", postState);
    }
  }

  async closePullRequest(prNumber: number): Promise<void> {
    command(this.#runner, "close-pull-request", "gh", [
      "api", "--method", "PATCH", `repos/${this.#repository}/pulls/${parsePositiveSafeInteger(prNumber)}`,
      "--input", "-",
    ], { input: JSON.stringify({ state: "closed" }) });
  }

  async reopenPullRequest(prNumber: number): Promise<void> {
    command(this.#runner, "reopen-pull-request", "gh", [
      "api", "--method", "PATCH", `repos/${this.#repository}/pulls/${parsePositiveSafeInteger(prNumber)}`,
      "--input", "-",
    ], { input: JSON.stringify({ state: "open" }) });
  }

  async createIssue(input: Readonly<{ title: string; body: string }>): Promise<GithubIssue> {
    const output = command(this.#runner, "create-issue", "gh", [
      "api", "--method", "POST", `repos/${this.#repository}/issues`, "--input", "-",
    ], { input: JSON.stringify(input) });
    return issueFromApi(JSON.parse(output) as unknown);
  }

  async updateIssue(input: Readonly<{ issueNumber: number; managedSection: string }>): Promise<void> {
    const current = await this.readIssue(input.issueNumber);
    if (current === null || current.state !== "open" || current.isPullRequest) throw new Error("open issueが必要です");
    const body = replaceIssueManagedSection(current.body ?? "", input.managedSection);
    command(this.#runner, "update-issue", "gh", [
      "api", "--method", "PATCH", `repos/${this.#repository}/issues/${input.issueNumber}`, "--input", "-",
    ], { input: JSON.stringify({ body }) });
  }

  async closeIssue(issueNumber: number): Promise<void> {
    command(this.#runner, "close-issue", "gh", [
      "api", "--method", "PATCH", `repos/${this.#repository}/issues/${parsePositiveSafeInteger(issueNumber)}`,
      "--input", "-",
    ], { input: JSON.stringify({ state: "closed" }) });
  }

  async reopenIssue(issueNumber: number): Promise<void> {
    command(this.#runner, "reopen-issue", "gh", [
      "api", "--method", "PATCH", `repos/${this.#repository}/issues/${parsePositiveSafeInteger(issueNumber)}`,
      "--input", "-",
    ], { input: JSON.stringify({ state: "open" }) });
  }

  async listJournalComments(resourceNumber: number): Promise<GithubPage<JournalCommentV2>> {
    const output = command(this.#runner, "list-journal-comments", "gh", [
      "api", "--method", "GET", "--paginate", "--slurp",
      `repos/${this.#repository}/issues/${parsePositiveSafeInteger(resourceNumber)}/comments?per_page=100`,
    ]);
    const pages = JSON.parse(output) as unknown;
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
      throw new Error("journal comment paginationがpage配列ではありません");
    }
    return { complete: true, items: pages.flat().map(journalCommentFromApi) };
  }

  async appendJournalComment(resourceNumber: number, body: string): Promise<JournalCommentV2> {
    if (body.length === 0 || Buffer.byteLength(body, "utf8") > 64 * 1024) throw new Error("journal comment bodyが不正です");
    const output = command(this.#runner, "append-journal-comment", "gh", [
      "api", "--method", "POST",
      `repos/${this.#repository}/issues/${parsePositiveSafeInteger(resourceNumber)}/comments`, "--input", "-",
    ], { input: JSON.stringify({ body }) });
    return journalCommentFromApi(JSON.parse(output) as unknown);
  }
}
