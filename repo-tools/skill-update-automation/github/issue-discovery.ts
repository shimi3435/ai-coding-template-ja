import {
  classifyIssueRootV2,
  reduceJournalCommentsV2,
  validateIssueJournalV2,
  type IssueRootV2,
  type IssueStateV2,
  type JournalCommentV2,
} from "../model/index.ts";

export type GithubIssue = Readonly<{
  issueNumber: number;
  state: "open" | "closed";
  title: string;
  body: string | null;
  isPullRequest: boolean;
  authorUserId: string;
  lastEditedAt: string | null;
  journalComments?: readonly JournalCommentV2[];
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

type RootIssue = Readonly<{
  issueNumber: number;
  root: IssueRootV2;
  body: string;
}>;

type SelectedIssue = RootIssue & Readonly<{ envelope: IssueStateV2; markerDigest: string }>;

export type GithubIssueDecision =
  | Readonly<{ kind: "create"; issueWritePolicy: "create"; prWritePolicy: "continue" }>
  | (Readonly<{ kind: "recover-root"; issueWritePolicy: "update"; prWritePolicy: "continue" }> & RootIssue)
  | (Readonly<{ kind: "update"; issueWritePolicy: "update"; prWritePolicy: "continue" }> & SelectedIssue)
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

  const strict: Array<RootIssue & Readonly<{
    state: "open" | "closed";
    envelope: IssueStateV2 | null;
    markerDigest: string | null;
  }>> = [];
  const partial: number[] = [];
  for (const issue of [...input.issues].sort((left, right) => left.issueNumber - right.issueNumber)) {
    if (issue.isPullRequest) continue;
    const classification = classifyIssueRootV2(issue.title, issue.body);
    if (classification.kind === "none") continue;
    if (classification.kind !== "strict" || classification.root.repositoryId !== input.repositoryId ||
      classification.root.repository !== input.repository) {
      partial.push(issue.issueNumber);
      continue;
    }
    let journal;
    try {
      const journal = reduceJournalCommentsV2(issue.journalComments ?? [], classification.root.creatorUserId);
      if (journal.entries.length === 0) {
        if (issue.authorUserId !== classification.root.creatorUserId || issue.lastEditedAt !== null) {
          throw new Error("commentless issue root authorまたはbody edit証拠が不正です");
        }
        strict.push({
          issueNumber: issue.issueNumber,
          state: issue.state,
          root: classification.root,
          envelope: null,
          markerDigest: null,
          body: issue.body ?? "",
        });
        continue;
      }
      const first = journal.entries[0];
      if (first === undefined || first.resourceKind !== "issue" || first.resourceNumber !== issue.issueNumber ||
        journal.pending !== null) throw new Error("issue journal rootが不正です");
      const envelope = validateIssueJournalV2(classification.root, journal).at(-1)!;
      strict.push({
        issueNumber: issue.issueNumber,
        state: issue.state,
        root: classification.root,
        envelope,
        markerDigest: journal.entries.at(-1)!.digest,
        body: issue.body ?? "",
      });
    } catch {
      partial.push(issue.issueNumber);
    }
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
    if (selected.envelope === null || selected.markerDigest === null) {
      return {
        kind: "recover-root",
        issueWritePolicy: "update",
        prWritePolicy: "continue",
        issueNumber: selected.issueNumber,
        root: selected.root,
        body: selected.body,
      };
    }
    return {
      kind: "update",
      issueWritePolicy: "update",
      prWritePolicy: "continue",
      issueNumber: selected.issueNumber,
      root: selected.root,
      envelope: selected.envelope,
      markerDigest: selected.markerDigest,
      body: selected.body,
    };
  }
  return { kind: "create", issueWritePolicy: "create", prWritePolicy: "continue" };
}
