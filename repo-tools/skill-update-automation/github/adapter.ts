import type { GithubPullRequest } from "./discovery.ts";
import type { GithubIssue } from "./issue-discovery.ts";
import type { JournalCommentV2 } from "../model/journal.ts";

export type GithubBranch = Readonly<{ ref: string; sha: string }>;
export type GithubPage<Value> = Readonly<{ complete: boolean; items: readonly Value[] }>;
export const githubAdapterOperations = [
  "list-pull-requests", "list-issues", "read-branch", "read-pull-request", "read-issue",
  "create-branch", "append-branch", "delete-branch", "create-draft-pull-request", "update-pull-request",
  "close-pull-request", "reopen-pull-request", "create-issue", "update-issue", "close-issue", "reopen-issue",
  "list-journal-comments", "append-journal-comment",
] as const;
export type GithubAdapterOperation = (typeof githubAdapterOperations)[number];
export type GithubPermissionPostState = "unchanged" | "applied" | "unknown";
export type GithubPermissionEvidence = Readonly<{
  operation: GithubAdapterOperation;
  postState: GithubPermissionPostState;
}>;

export function parseGithubPermissionEvidence(
  operation: string | undefined,
  postState: string | undefined,
): GithubPermissionEvidence | undefined {
  if ((operation ?? "") === "" && (postState ?? "") === "") return undefined;
  if (!githubAdapterOperations.includes(operation as GithubAdapterOperation) ||
    (postState !== "unchanged" && postState !== "applied" && postState !== "unknown")) {
    throw new Error("GitHub permission evidence is invalid");
  }
  return { operation: operation as GithubAdapterOperation, postState };
}

export interface GithubAdapter {
  listPullRequests(): Promise<GithubPage<GithubPullRequest>>;
  listIssues(): Promise<GithubPage<GithubIssue>>;
  readBranch(ref: string): Promise<GithubBranch | null>;
  readPullRequest(prNumber: number): Promise<GithubPullRequest | null>;
  readIssue(issueNumber: number): Promise<GithubIssue | null>;
  createBranch(input: GithubBranch): Promise<void>;
  appendBranch(input: Readonly<{ ref: string; expectedSha: string; candidateSha: string }>): Promise<void>;
  deleteBranch(input: Readonly<{ ref: string; expectedSha: string }>): Promise<void>;
  createDraftPullRequest(
    input: Omit<GithubPullRequest, "prNumber" | "state" | "merged" | "draft">,
  ): Promise<GithubPullRequest>;
  updatePullRequest(input: Readonly<{
    prNumber: number;
    draft?: boolean;
    managedSection?: string;
  }>): Promise<void>;
  closePullRequest(prNumber: number): Promise<void>;
  reopenPullRequest(prNumber: number): Promise<void>;
  createIssue(input: Readonly<{ title: string; body: string }>): Promise<GithubIssue>;
  updateIssue(input: Readonly<{ issueNumber: number; managedSection: string }>): Promise<void>;
  closeIssue(issueNumber: number): Promise<void>;
  reopenIssue(issueNumber: number): Promise<void>;
}

export interface JournalGithubAdapter {
  listJournalComments(resourceNumber: number): Promise<GithubPage<JournalCommentV2>>;
  appendJournalComment(resourceNumber: number, body: string): Promise<JournalCommentV2>;
}
