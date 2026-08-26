import { classifyIssueBody, type IssueEnvelope } from "../model/index.ts";

export type GithubIssue = Readonly<{
  issueNumber: number;
  state: "open" | "closed";
  title: string;
  body: string | null;
  isPullRequest: boolean;
}>;

export type GithubIssueDiscoveryInput = Readonly<{
  repositoryId: string;
  repository: string;
  paginationComplete: boolean;
  issues: readonly GithubIssue[];
}>;

type IssueWriteStop = Readonly<{
  kind: "issue-identity-conflict" | "issue-cardinality-conflict" | "issue-discovery-incomplete";
  issueWritePolicy: "none";
  prWritePolicy: "continue";
  summaryOnly: true;
  issueNumbers: readonly number[];
}>;

type SelectedIssue = Readonly<{
  issueNumber: number;
  envelope: IssueEnvelope;
  markerDigest: string;
  body: string;
}>;

export type GithubIssueDecision =
  | Readonly<{ kind: "create"; issueWritePolicy: "create"; prWritePolicy: "continue" }>
  | (Readonly<{ kind: "update"; issueWritePolicy: "update"; prWritePolicy: "continue" }> & SelectedIssue)
  | (Readonly<{ kind: "reopen"; issueWritePolicy: "reopen"; prWritePolicy: "continue" }> & SelectedIssue)
  | IssueWriteStop;

export function discoverManagedIssue(input: GithubIssueDiscoveryInput): GithubIssueDecision {
  if (!input.paginationComplete) {
    return {
      kind: "issue-discovery-incomplete",
      issueWritePolicy: "none",
      prWritePolicy: "continue",
      summaryOnly: true,
      issueNumbers: [],
    };
  }

  const strict: Array<SelectedIssue & Readonly<{ state: "open" | "closed" }>> = [];
  const partial: number[] = [];
  for (const issue of [...input.issues].sort((left, right) => left.issueNumber - right.issueNumber)) {
    if (issue.isPullRequest) continue;
    const classification = classifyIssueBody(issue.title, issue.body);
    if (classification.kind === "none") continue;
    if (
      classification.kind === "partial" || classification.envelope.repositoryId !== input.repositoryId ||
      classification.envelope.repository !== input.repository
    ) {
      partial.push(issue.issueNumber);
      continue;
    }
    strict.push({
      issueNumber: issue.issueNumber,
      state: issue.state,
      envelope: classification.envelope,
      markerDigest: classification.markerDigest,
      body: issue.body ?? "",
    });
  }

  if (partial.length > 0) {
    return {
      kind: "issue-identity-conflict",
      issueWritePolicy: "none",
      prWritePolicy: "continue",
      summaryOnly: true,
      issueNumbers: partial,
    };
  }
  const open = strict.filter((issue) => issue.state === "open");
  if (open.length > 1) {
    return {
      kind: "issue-cardinality-conflict",
      issueWritePolicy: "none",
      prWritePolicy: "continue",
      summaryOnly: true,
      issueNumbers: open.map((issue) => issue.issueNumber),
    };
  }
  const selected = open[0];
  if (selected !== undefined) {
    return { kind: "update", issueWritePolicy: "update", prWritePolicy: "continue", ...selected };
  }
  const closed = strict.at(-1);
  if (closed !== undefined) {
    return { kind: "reopen", issueWritePolicy: "reopen", prWritePolicy: "continue", ...closed };
  }
  return { kind: "create", issueWritePolicy: "create", prWritePolicy: "continue" };
}
