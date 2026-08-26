import {
  classifyIssueBody,
  classifyPrBody,
  issueMarkerEnd,
  issueMarkerStart,
  managedIssueTitle,
  managedPrTitle,
  prMarkerEnd,
  prMarkerStart,
} from "../model/index.ts";
import type { GithubPullRequest } from "./discovery.ts";
import type { GithubIssue } from "./issue-discovery.ts";
import type {
  GithubAdapter,
  GithubAdapterOperation,
  GithubBranch,
  GithubPage,
  GithubPermissionPostState,
} from "./adapter.ts";

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
}>;

function copy<Value>(value: Value): Value {
  return structuredClone(value);
}

function replaceManagedSection(
  body: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
): string {
  const start = body.indexOf(startMarker);
  const end = body.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || body.indexOf(startMarker, start + startMarker.length) >= 0 ||
    body.indexOf(endMarker, end + endMarker.length) >= 0) {
    throw new GithubAdapterError("invalid-resource", "managed section identityが不正です");
  }
  return body.slice(0, start) + replacement + body.slice(end + endMarker.length);
}

export class FakeGithubAdapter implements GithubAdapter {
  readonly transcript: GithubAdapterTranscriptEntry[] = [];
  readonly #branches = new Map<string, string>();
  readonly #pullRequests = new Map<number, FakeGithubPullRequest>();
  readonly #issues = new Map<number, FakeGithubIssue>();
  readonly #faults: FakeGithubFault[];

  constructor(input: FakeGithubAdapterInput = {}) {
    for (const branch of input.branches ?? []) this.#branches.set(branch.ref, branch.sha);
    for (const pullRequest of input.pullRequests ?? []) this.#pullRequests.set(pullRequest.prNumber, copy(pullRequest));
    for (const issue of input.issues ?? []) this.#issues.set(issue.issueNumber, copy(issue));
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
    const items = [...this.#pullRequests.values()].sort((left, right) => left.prNumber - right.prNumber).map(copy);
    return { complete: !this.#takeFault("list-pull-requests", "partial-response"), items };
  }

  async listIssues(): Promise<GithubPage<FakeGithubIssue>> {
    const items = [...this.#issues.values()].sort((left, right) => left.issueNumber - right.issueNumber).map(copy);
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
    input: Omit<FakeGithubPullRequest, "prNumber" | "state" | "merged" | "draft">,
  ): Promise<FakeGithubPullRequest> {
    const operation = "create-draft-pull-request";
    this.#beforeWrite(operation);
    const classification = classifyPrBody(input.body, true);
    if (input.title !== managedPrTitle || classification.kind !== "strict") {
      this.#stateMismatch(operation, "draft PR managed identityが不正です");
    }
    if (this.#branches.get(input.headRef) !== input.headSha) {
      this.#stateMismatch(operation, "draft PR branch head mismatch");
    }
    const envelope = classification.envelope;
    if (
      envelope.repositoryId !== input.headRepositoryId || envelope.repositoryId !== input.baseRepositoryId ||
      envelope.headRef !== input.headRef || envelope.baseRef !== input.baseRef ||
      envelope.expectedHeadSha !== input.headSha
    ) {
      this.#stateMismatch(operation, "draft PR marker identity mismatch");
    }
    const prNumber = Math.max(0, ...this.#pullRequests.keys()) + 1;
    const pullRequest: FakeGithubPullRequest = {
      ...input,
      prNumber,
      state: "open",
      merged: false,
      draft: true,
    };
    this.#pullRequests.set(prNumber, pullRequest);
    this.#applied(operation);
    return copy(pullRequest);
  }

  async updatePullRequest(input: Readonly<{
    prNumber: number;
    draft?: boolean;
    managedSection?: string;
  }>): Promise<void> {
    const operation = "update-pull-request";
    this.#beforeWrite(operation);
    const current = this.#pullRequests.get(input.prNumber);
    if (current === undefined || current.state !== "open") this.#stateMismatch(operation, "open PRが必要です");
    const draft = input.draft ?? current.draft;
    const body = input.managedSection === undefined
      ? current.body
      : replaceManagedSection(current.body ?? "", prMarkerStart, prMarkerEnd, input.managedSection);
    const currentClassification = classifyPrBody(current.body, current.draft);
    const updatedClassification = classifyPrBody(body, draft);
    if (currentClassification.kind !== "strict" || updatedClassification.kind !== "strict") {
      this.#stateMismatch(operation, "updated PR managed identityが不正です");
    }
    const currentEnvelope = currentClassification.envelope;
    const updatedEnvelope = updatedClassification.envelope;
    if (
      updatedEnvelope.repositoryId !== currentEnvelope.repositoryId ||
      updatedEnvelope.repository !== currentEnvelope.repository ||
      updatedEnvelope.generation !== currentEnvelope.generation || updatedEnvelope.headRef !== current.headRef ||
      updatedEnvelope.baseRef !== current.baseRef || updatedEnvelope.expectedHeadSha !== current.headSha
    ) {
      this.#stateMismatch(operation, "updated PR expected head / marker identity mismatch");
    }
    this.#pullRequests.set(input.prNumber, { ...current, draft, body });
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

  async reopenPullRequest(prNumber: number): Promise<void> {
    const operation = "reopen-pull-request";
    this.#beforeWrite(operation);
    const current = this.#pullRequests.get(prNumber);
    if (current === undefined || current.state !== "closed") this.#stateMismatch(operation, "closed PRが必要です");
    if (current.merged) this.#stateMismatch(operation, "merged PRはreopenできません");
    this.#pullRequests.set(prNumber, { ...current, state: "open" });
    this.#applied(operation);
  }

  async createIssue(input: Readonly<{ title: string; body: string }>): Promise<FakeGithubIssue> {
    const operation = "create-issue";
    this.#beforeWrite(operation);
    if (input.title !== managedIssueTitle || classifyIssueBody(input.title, input.body).kind !== "strict") {
      this.#stateMismatch(operation, "managed issue identityが不正です");
    }
    const issueNumber = Math.max(0, ...this.#issues.keys(), ...this.#pullRequests.keys()) + 1;
    const issue: FakeGithubIssue = { ...input, issueNumber, state: "open", isPullRequest: false };
    this.#issues.set(issueNumber, issue);
    this.#applied(operation);
    return copy(issue);
  }

  async updateIssue(input: Readonly<{ issueNumber: number; managedSection: string }>): Promise<void> {
    const operation = "update-issue";
    this.#beforeWrite(operation);
    const current = this.#issues.get(input.issueNumber);
    if (current === undefined || current.state !== "open" || current.isPullRequest) {
      this.#stateMismatch(operation, "open issueが必要です");
    }
    const body = replaceManagedSection(current.body ?? "", issueMarkerStart, issueMarkerEnd, input.managedSection);
    const currentClassification = classifyIssueBody(current.title, current.body);
    const updatedClassification = classifyIssueBody(current.title, body);
    if (currentClassification.kind !== "strict" || updatedClassification.kind !== "strict") {
      this.#stateMismatch(operation, "updated issue managed identityが不正です");
    }
    if (
      updatedClassification.envelope.repositoryId !== currentClassification.envelope.repositoryId ||
      updatedClassification.envelope.repository !== currentClassification.envelope.repository
    ) {
      this.#stateMismatch(operation, "updated issue repository identity mismatch");
    }
    this.#issues.set(input.issueNumber, { ...current, body });
    this.#applied(operation);
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

  async reopenIssue(issueNumber: number): Promise<void> {
    const operation = "reopen-issue";
    this.#beforeWrite(operation);
    const current = this.#issues.get(issueNumber);
    if (current === undefined || current.state !== "closed" || current.isPullRequest) {
      this.#stateMismatch(operation, "closed issueが必要です");
    }
    this.#issues.set(issueNumber, { ...current, state: "open" });
    this.#applied(operation);
  }
}

export function createFakeGithubAdapter(input: FakeGithubAdapterInput = {}): FakeGithubAdapter {
  return new FakeGithubAdapter(input);
}
