import {
  classifyIssueBody,
  classifyIssueRootV2,
  classifyPrBody,
  classifyPrRootV2,
  decodeJournalCommentBodyV2,
  managedIssueTitle,
  managedPrTitle,
} from "../model/index.ts";
import type { GithubPullRequest } from "./discovery.ts";
import type { GithubIssue } from "./issue-discovery.ts";
import type {
  GithubAdapter,
  GithubAdapterOperation,
  GithubBranch,
  GithubPage,
  GithubPermissionPostState,
  JournalGithubAdapter,
} from "./adapter.ts";
import type { JournalCommentV2 } from "../model/journal.ts";

export type FakeGithubPullRequest = GithubPullRequest;
export type FakeGithubIssue = GithubIssue;
export type FakeGithubBranch = GithubBranch;

export type { GithubAdapterOperation } from "./adapter.ts";

export type FakeGithubFault = Readonly<{
  operation: GithubAdapterOperation;
  kind: "permission-denied" | "partial-response";
}>;

export type GithubAdapterTranscriptEntry = Readonly<{
  operation: GithubAdapterOperation;
  outcome: "applied" | "permission-denied" | "state-mismatch";
  postState?: GithubPermissionPostState;
}>;

export class GithubAdapterError extends Error {
  readonly kind: "permission-denied" | "state-mismatch" | "invalid-resource";
  readonly operation: GithubAdapterOperation | null;
  readonly postState: GithubPermissionPostState | null;

  constructor(
    kind: "permission-denied" | "state-mismatch" | "invalid-resource",
    message: string,
    evidence?: Readonly<{ operation: GithubAdapterOperation; postState: GithubPermissionPostState }>,
  ) {
    super(message);
    this.name = "GithubAdapterError";
    this.kind = kind;
    this.operation = evidence?.operation ?? null;
    this.postState = evidence?.postState ?? null;
  }
}

export type FakeGithubAdapterInput = Readonly<{
  branches?: readonly FakeGithubBranch[];
  pullRequests?: readonly FakeGithubPullRequest[];
  issues?: readonly FakeGithubIssue[];
  faults?: readonly FakeGithubFault[];
  journalComments?: readonly Readonly<{ resourceNumber: number; comments: readonly JournalCommentV2[] }>[];
}>;

function copy<Value>(value: Value): Value {
  return structuredClone(value);
}

export class FakeGithubAdapter implements GithubAdapter, JournalGithubAdapter {
  readonly transcript: GithubAdapterTranscriptEntry[] = [];
  readonly #branches = new Map<string, string>();
  readonly #pullRequests = new Map<number, FakeGithubPullRequest>();
  readonly #issues = new Map<number, FakeGithubIssue>();
  readonly #journalComments = new Map<number, JournalCommentV2[]>();
  readonly #faults: FakeGithubFault[];

  constructor(input: FakeGithubAdapterInput = {}) {
    for (const branch of input.branches ?? []) this.#branches.set(branch.ref, branch.sha);
    for (const pullRequest of input.pullRequests ?? []) {
      this.#pullRequests.set(pullRequest.prNumber, copy(pullRequest));
      if (pullRequest.journalComments !== undefined) {
        this.#journalComments.set(pullRequest.prNumber, pullRequest.journalComments.map(copy));
      }
    }
    for (const issue of input.issues ?? []) {
      this.#issues.set(issue.issueNumber, copy(issue));
      if (issue.journalComments !== undefined) this.#journalComments.set(issue.issueNumber, issue.journalComments.map(copy));
    }
    for (const journal of input.journalComments ?? []) {
      this.#journalComments.set(journal.resourceNumber, journal.comments.map(copy));
    }
    this.#faults = [...(input.faults ?? [])];
  }

  #takeFault(operation: GithubAdapterOperation, kind: FakeGithubFault["kind"]): boolean {
    const index = this.#faults.findIndex((fault) => fault.operation === operation && fault.kind === kind);
    if (index < 0) return false;
    this.#faults.splice(index, 1);
    return true;
  }

  #beforeWrite(operation: GithubAdapterOperation): void {
    if (this.#takeFault(operation, "permission-denied")) {
      this.transcript.push({ operation, outcome: "permission-denied", postState: "unchanged" });
      throw new GithubAdapterError("permission-denied", `${operation}: permission denied`, {
        operation,
        postState: "unchanged",
      });
    }
  }

  #stateMismatch(operation: GithubAdapterOperation, message: string): never {
    this.transcript.push({ operation, outcome: "state-mismatch" });
    throw new GithubAdapterError("state-mismatch", message);
  }

  #applied(operation: GithubAdapterOperation): void {
    this.transcript.push({ operation, outcome: "applied" });
  }

  async listPullRequests(): Promise<GithubPage<FakeGithubPullRequest>> {
    const items = [...this.#pullRequests.values()].sort((left, right) => left.prNumber - right.prNumber).map((pullRequest) => ({
      ...copy(pullRequest),
      journalComments: (this.#journalComments.get(pullRequest.prNumber) ?? []).map(copy),
    }));
    return { complete: !this.#takeFault("list-pull-requests", "partial-response"), items };
  }

  async listIssues(): Promise<GithubPage<FakeGithubIssue>> {
    const items = [...this.#issues.values()].sort((left, right) => left.issueNumber - right.issueNumber).map((issue) => ({
      ...copy(issue),
      journalComments: (this.#journalComments.get(issue.issueNumber) ?? []).map(copy),
    }));
    return { complete: !this.#takeFault("list-issues", "partial-response"), items };
  }

  async readBranch(ref: string): Promise<FakeGithubBranch | null> {
    const sha = this.#branches.get(ref);
    return sha === undefined ? null : { ref, sha };
  }

  async readPullRequest(prNumber: number): Promise<FakeGithubPullRequest | null> {
    const pullRequest = this.#pullRequests.get(prNumber);
    return pullRequest === undefined ? null : copy(pullRequest);
  }

  async readIssue(issueNumber: number): Promise<FakeGithubIssue | null> {
    const issue = this.#issues.get(issueNumber);
    return issue === undefined ? null : copy(issue);
  }

  async createBranch(input: FakeGithubBranch): Promise<void> {
    const operation = "create-branch";
    this.#beforeWrite(operation);
    if (this.#branches.has(input.ref)) this.#stateMismatch(operation, "branch already exists");
    this.#branches.set(input.ref, input.sha);
    this.#applied(operation);
  }

  async appendBranch(input: Readonly<{ ref: string; expectedSha: string; candidateSha: string }>): Promise<void> {
    const operation = "append-branch";
    this.#beforeWrite(operation);
    if (this.#branches.get(input.ref) !== input.expectedSha) {
      this.#stateMismatch(operation, "branch expected head mismatch");
    }
    this.#branches.set(input.ref, input.candidateSha);
    for (const [number, pullRequest] of this.#pullRequests) {
      if (pullRequest.headRef === input.ref && pullRequest.state === "open") {
        this.#pullRequests.set(number, { ...pullRequest, headSha: input.candidateSha });
      }
    }
    this.#applied(operation);
  }

  async deleteBranch(input: Readonly<{ ref: string; expectedSha: string }>): Promise<void> {
    const operation = "delete-branch";
    this.#beforeWrite(operation);
    if (this.#branches.get(input.ref) !== input.expectedSha) {
      this.#stateMismatch(operation, "branch expected head mismatch");
    }
    this.#branches.delete(input.ref);
    this.#applied(operation);
  }

  async createDraftPullRequest(
    input: Omit<FakeGithubPullRequest, "prNumber" | "state" | "merged" | "draft" | "authorUserId" | "lastEditedAt">,
  ): Promise<FakeGithubPullRequest> {
    const operation = "create-draft-pull-request";
    this.#beforeWrite(operation);
    const classification = classifyPrBody(input.body, true);
    const root = classifyPrRootV2(input.body);
    if (input.title !== managedPrTitle || (classification.kind !== "strict" && root.kind !== "strict")) {
      this.#stateMismatch(operation, "draft PR managed identityが不正です");
    }
    if (this.#branches.get(input.headRef) !== input.headSha) {
      this.#stateMismatch(operation, "draft PR branch head mismatch");
    }
    const identity = classification.kind === "strict" ? classification.envelope : root.kind === "strict" ? root.root : null;
    if (identity === null || identity.repositoryId !== input.headRepositoryId || identity.repositoryId !== input.baseRepositoryId ||
      identity.headRef !== input.headRef || identity.baseRef !== input.baseRef ||
      (classification.kind === "strict" && classification.envelope.expectedHeadSha !== input.headSha)) {
      this.#stateMismatch(operation, "draft PR marker identity mismatch");
    }
    const prNumber = Math.max(0, ...this.#pullRequests.keys()) + 1;
    const pullRequest: FakeGithubPullRequest = {
      ...input,
      prNumber,
      state: "open",
      merged: false,
      draft: true,
      authorUserId: root.kind === "strict" ? root.root.creatorUserId : "1",
      lastEditedAt: null,
    };
    this.#pullRequests.set(prNumber, pullRequest);
    this.#applied(operation);
    return copy(pullRequest);
  }

  async updatePullRequest(input: Readonly<{ prNumber: number; draft: boolean }>): Promise<void> {
    const operation = "update-pull-request";
    this.#beforeWrite(operation);
    const current = this.#pullRequests.get(input.prNumber);
    if (current === undefined || current.state !== "open") this.#stateMismatch(operation, "open PRが必要です");
    this.#pullRequests.set(input.prNumber, { ...current, draft: input.draft });
    this.#applied(operation);
  }

  async closePullRequest(prNumber: number): Promise<void> {
    const operation = "close-pull-request";
    this.#beforeWrite(operation);
    const current = this.#pullRequests.get(prNumber);
    if (current === undefined || current.state !== "open" || current.merged) {
      this.#stateMismatch(operation, "open unmerged PRが必要です");
    }
    this.#pullRequests.set(prNumber, { ...current, state: "closed", merged: false });
    this.#applied(operation);
  }

  async mergePullRequestForTest(prNumber: number): Promise<void> {
    const current = this.#pullRequests.get(prNumber);
    if (current === undefined || current.state !== "open") throw new Error("open PRが必要です");
    this.#pullRequests.set(prNumber, { ...current, state: "closed", merged: true, draft: false });
  }

  setBranchForTest(ref: string, sha: string | null): void {
    if (sha === null) this.#branches.delete(ref);
    else this.#branches.set(ref, sha);
  }

  async createIssue(input: Readonly<{ title: string; body: string }>): Promise<FakeGithubIssue> {
    const operation = "create-issue";
    this.#beforeWrite(operation);
    if (input.title !== managedIssueTitle ||
      (classifyIssueBody(input.title, input.body).kind !== "strict" && classifyIssueRootV2(input.title, input.body).kind !== "strict")) {
      this.#stateMismatch(operation, "managed issue identityが不正です");
    }
    const issueNumber = Math.max(0, ...this.#issues.keys(), ...this.#pullRequests.keys()) + 1;
    const root = classifyIssueRootV2(input.title, input.body);
    const issue: FakeGithubIssue = {
      ...input,
      issueNumber,
      state: "open",
      isPullRequest: false,
      authorUserId: root.kind === "strict" ? root.root.creatorUserId : "1",
      lastEditedAt: null,
    };
    this.#issues.set(issueNumber, issue);
    this.#applied(operation);
    return copy(issue);
  }

  async closeIssue(issueNumber: number): Promise<void> {
    const operation = "close-issue";
    this.#beforeWrite(operation);
    const current = this.#issues.get(issueNumber);
    if (current === undefined || current.state !== "open" || current.isPullRequest) {
      this.#stateMismatch(operation, "open issueが必要です");
    }
    this.#issues.set(issueNumber, { ...current, state: "closed" });
    this.#applied(operation);
  }

  async listJournalComments(resourceNumber: number): Promise<GithubPage<JournalCommentV2>> {
    const items = (this.#journalComments.get(resourceNumber) ?? []).map(copy);
    return { complete: !this.#takeFault("list-journal-comments", "partial-response"), items };
  }

  async appendJournalComment(resourceNumber: number, body: string): Promise<JournalCommentV2> {
    const operation = "append-journal-comment";
    this.#beforeWrite(operation);
    if (!this.#pullRequests.has(resourceNumber) && !this.#issues.has(resourceNumber)) {
      this.#stateMismatch(operation, "journal resourceがありません");
    }
    const entry = decodeJournalCommentBodyV2(body);
    if (entry === null || entry.resourceNumber !== resourceNumber) {
      this.#stateMismatch(operation, "journal comment identityが不正です");
    }
    const allComments = [...this.#journalComments.values()].flat();
    const id = String(Math.max(0, ...allComments.map((comment) => Number(comment.id))) + 1);
    const comment: JournalCommentV2 = {
      id,
      authorUserId: entry.creatorUserId,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      body,
    };
    this.#journalComments.set(resourceNumber, [...(this.#journalComments.get(resourceNumber) ?? []), comment]);
    this.#applied(operation);
    return copy(comment);
  }
}

export function createFakeGithubAdapter(input: FakeGithubAdapterInput = {}): FakeGithubAdapter {
  return new FakeGithubAdapter(input);
}
