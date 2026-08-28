import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { GithubAdapter, JournalGithubAdapter } from "../github/adapter.ts";
import { discoverManagedIssue } from "../github/issue-discovery.ts";
import { reduceIssueEntries } from "../github/issue-reducer.ts";
import {
  appendJournalEntryDigest,
  issueStateSnapshotV2,
  journalCommentBody,
  managedIssueTitle,
  classifyIssueRootV2,
  reduceJournalCommentsV2,
  renderManagedIssueRootV2,
  validateIssueJournalV2,
  type IssueEntry,
  type IssueEntryObservation,
  type IssueStateV2,
} from "../model/index.ts";
import { appendInitialJournalEntry } from "../publish/initial-journal.ts";

export type IssueJournalAdapter = GithubAdapter & JournalGithubAdapter;

function digest(parts: readonly string[]): string {
  return `sha256:${createHash("sha256").update(parts.join("\0"), "utf8").digest("hex")}`;
}

function issueState(
  repositoryId: string,
  repository: string,
  entries: readonly IssueEntry[],
): IssueStateV2 {
  return { schemaVersion: 2, kind: "managed-issue-state", repositoryId, repository, entries };
}

type SyncIssueInput = Readonly<{
  adapter: IssueJournalAdapter;
  context: Readonly<{ repositoryId: string; repository: string; creatorUserId: string }>;
  observations: readonly IssueEntryObservation[];
  resolvedKeys?: readonly string[];
  resolveCurrent?: (entries: readonly IssueEntry[]) => readonly string[];
}>;

export async function syncManagedIssueEntriesV2(input: SyncIssueInput): Promise<string> {
  return await syncManagedIssueEntriesV2Once(input, true);
}

async function syncManagedIssueEntriesV2Once(input: SyncIssueInput, allowRediscovery: boolean): Promise<string> {
  const page = await input.adapter.listIssues();
  const decision = discoverManagedIssue({
    repositoryId: input.context.repositoryId,
    repository: input.context.repository,
    paginationComplete: page.complete,
    issues: page.items,
  });
  if (decision.issueWritePolicy === "none") return decision.kind;
  if ((decision.kind === "update" || decision.kind === "recover-root") &&
    decision.root.creatorUserId !== input.context.creatorUserId) return "issue-identity-conflict";
  const currentEntries = decision.kind === "update" ? decision.envelope.entries : [];
  const entries = reduceIssueEntries({
    currentEntries,
    observations: input.observations,
    resolvedKeys: input.resolveCurrent?.(currentEntries) ?? input.resolvedKeys ?? [],
  });
  if (entries.length === 0 && decision.kind === "create") return "none";
  if (decision.kind === "update" && isDeepStrictEqual(entries, currentEntries)) return "unchanged";
  const snapshot = issueStateSnapshotV2(issueState(input.context.repositoryId, input.context.repository, entries));

  if (decision.kind === "create") {
    const rootOperationId = digest([
      "issue-root-v2", input.context.repositoryId, input.context.creatorUserId, snapshot.stateDigest,
    ]);
    const body = renderManagedIssueRootV2({
      schemaVersion: 2,
      kind: "managed-issue-root",
      repositoryId: input.context.repositoryId,
      repository: input.context.repository,
      creatorUserId: input.context.creatorUserId,
      rootOperationId,
      initialSnapshot: snapshot,
      initialSnapshotDigest: snapshot.stateDigest,
    }, "Managed automation failures require attention.");
    const created = await input.adapter.createIssue({ title: managedIssueTitle, body });
    const entry = appendJournalEntryDigest({
      schemaVersion: 2,
      resourceKind: "issue",
      resourceNumber: created.issueNumber,
      creatorUserId: input.context.creatorUserId,
      sequence: 1,
      previousDigest: null,
      phase: "committed",
      operation: "root",
      operationId: rootOperationId,
      snapshot,
    });
    const freshCreated = await input.adapter.readIssue(created.issueNumber);
    if (freshCreated === null || freshCreated.state !== "open" || freshCreated.isPullRequest ||
      freshCreated.title !== managedIssueTitle || freshCreated.body !== body ||
      freshCreated.authorUserId !== input.context.creatorUserId || freshCreated.lastEditedAt !== null) {
      return "issue-identity-conflict";
    }
    const beforeComments = await input.adapter.listJournalComments(created.issueNumber);
    if (!beforeComments.complete || reduceJournalCommentsV2(beforeComments.items, input.context.creatorUserId).entries.length !== 0) {
      return "issue-identity-conflict";
    }
    const appendTarget = await input.adapter.readIssue(created.issueNumber);
    if (appendTarget === null || appendTarget.state !== "open" || appendTarget.isPullRequest ||
      appendTarget.title !== managedIssueTitle || appendTarget.body !== body ||
      appendTarget.authorUserId !== input.context.creatorUserId || appendTarget.lastEditedAt !== null) {
      if (appendTarget?.state === "closed" && appendTarget.title === managedIssueTitle && appendTarget.body === body) {
        return allowRediscovery ? await syncManagedIssueEntriesV2Once(input, false) : "issue-identity-conflict";
      }
      return "issue-identity-conflict";
    }
    await appendInitialJournalEntry(input.adapter, entry);
    const postIssue = await input.adapter.readIssue(created.issueNumber);
    const postComments = await input.adapter.listJournalComments(created.issueNumber);
    if (postIssue === null || postIssue.state !== "open" || postIssue.title !== managedIssueTitle ||
      postIssue.body !== body || postIssue.authorUserId !== input.context.creatorUserId ||
      postIssue.lastEditedAt !== null || !postComments.complete) {
      return "issue-identity-conflict";
    }
    const postRoot = classifyIssueRootV2(postIssue.title, postIssue.body);
    if (postRoot.kind !== "strict") return "issue-identity-conflict";
    const postJournal = reduceJournalCommentsV2(postComments.items, postRoot.root.creatorUserId);
    validateIssueJournalV2(postRoot.root, postJournal);
    if (postJournal.pending !== null || postJournal.entries.at(-1)?.digest !== entry.digest) {
      return "issue-identity-conflict";
    }
    return "created";
  }

  if (decision.kind === "recover-root") {
    const expectedOperationId = digest([
      "issue-root-v2", input.context.repositoryId, input.context.creatorUserId, snapshot.stateDigest,
    ]);
    if (decision.root.creatorUserId !== input.context.creatorUserId ||
      decision.root.initialSnapshotDigest !== snapshot.stateDigest ||
      !isDeepStrictEqual(decision.root.initialSnapshot, snapshot) ||
      decision.root.rootOperationId !== expectedOperationId) return "issue-identity-conflict";
    const liveIssue = await input.adapter.readIssue(decision.issueNumber);
    if (liveIssue === null || liveIssue.state !== "open" || liveIssue.body !== decision.body ||
      liveIssue.title !== managedIssueTitle || liveIssue.authorUserId !== decision.root.creatorUserId ||
      liveIssue.lastEditedAt !== null) {
      if (liveIssue?.state === "closed" && liveIssue.body === decision.body && liveIssue.title === managedIssueTitle) {
        return allowRediscovery ? await syncManagedIssueEntriesV2Once(input, false) : "issue-identity-conflict";
      }
      return "issue-identity-conflict";
    }
    const beforeComments = await input.adapter.listJournalComments(decision.issueNumber);
    if (!beforeComments.complete || reduceJournalCommentsV2(
      beforeComments.items, decision.root.creatorUserId,
    ).entries.length !== 0) return "issue-identity-conflict";
    const entry = appendJournalEntryDigest({
      schemaVersion: 2,
      resourceKind: "issue",
      resourceNumber: decision.issueNumber,
      creatorUserId: decision.root.creatorUserId,
      sequence: 1,
      previousDigest: null,
      phase: "committed",
      operation: "root",
      operationId: decision.root.rootOperationId,
      snapshot,
    });
    const appendTarget = await input.adapter.readIssue(decision.issueNumber);
    if (appendTarget === null || appendTarget.state !== "open" || appendTarget.isPullRequest ||
      appendTarget.title !== managedIssueTitle || appendTarget.body !== decision.body ||
      appendTarget.authorUserId !== decision.root.creatorUserId || appendTarget.lastEditedAt !== null) {
      if (appendTarget?.state === "closed" && appendTarget.title === managedIssueTitle &&
        appendTarget.body === decision.body) {
        return allowRediscovery ? await syncManagedIssueEntriesV2Once(input, false) : "issue-identity-conflict";
      }
      return "issue-identity-conflict";
    }
    await appendInitialJournalEntry(input.adapter, entry);
    const postIssue = await input.adapter.readIssue(decision.issueNumber);
    const postComments = await input.adapter.listJournalComments(decision.issueNumber);
    if (postIssue === null || postIssue.state !== "open" || postIssue.title !== managedIssueTitle ||
      postIssue.body !== decision.body || postIssue.authorUserId !== decision.root.creatorUserId || !postComments.complete) {
      return "issue-identity-conflict";
    }
    const reduced = reduceJournalCommentsV2(postComments.items, decision.root.creatorUserId);
    validateIssueJournalV2(decision.root, reduced);
    return reduced.pending === null && reduced.entries.at(-1)?.digest === entry.digest
      ? "recovered"
      : "issue-identity-conflict";
  }

  const liveIssue = await input.adapter.readIssue(decision.issueNumber);
  if (liveIssue === null || liveIssue.state !== "open" || liveIssue.title !== managedIssueTitle ||
    liveIssue.body !== decision.body) {
    if (liveIssue?.state === "closed" && liveIssue.title === managedIssueTitle && liveIssue.body === decision.body) {
      return allowRediscovery ? await syncManagedIssueEntriesV2Once(input, false) : "issue-identity-conflict";
    }
    return "issue-identity-conflict";
  }
  const comments = await input.adapter.listJournalComments(decision.issueNumber);
  if (!comments.complete) return "issue-discovery-incomplete";
  const journal = reduceJournalCommentsV2(comments.items, decision.root.creatorUserId);
  validateIssueJournalV2(decision.root, journal);
  const previous = journal.entries.at(-1);
  if (previous === undefined || previous.digest !== decision.markerDigest) return "issue-identity-conflict";
  const entry = appendJournalEntryDigest({
    schemaVersion: 2,
    resourceKind: "issue",
    resourceNumber: decision.issueNumber,
    creatorUserId: decision.root.creatorUserId,
    sequence: previous.sequence + 1,
    previousDigest: previous.digest,
    phase: "committed",
    operation: "failure",
    operationId: digest(["issue-state-v2", String(decision.issueNumber), previous.digest, snapshot.stateDigest]),
    snapshot,
  });
  const freshIssue = await input.adapter.readIssue(decision.issueNumber);
  const freshComments = await input.adapter.listJournalComments(decision.issueNumber);
  if (freshIssue === null || freshIssue.state !== "open" || freshIssue.isPullRequest ||
    freshIssue.title !== managedIssueTitle || freshIssue.body !== decision.body || !freshComments.complete) {
    if (freshIssue?.state === "closed" && freshIssue.title === managedIssueTitle && freshIssue.body === decision.body) {
      return allowRediscovery ? await syncManagedIssueEntriesV2Once(input, false) : "issue-identity-conflict";
    }
    return "issue-identity-conflict";
  }
  const freshJournal = reduceJournalCommentsV2(freshComments.items, decision.root.creatorUserId);
  validateIssueJournalV2(decision.root, freshJournal);
  if (freshJournal.pending !== null || freshJournal.entries.at(-1)?.digest !== previous.digest) {
    return "issue-identity-conflict";
  }
  const appendTarget = await input.adapter.readIssue(decision.issueNumber);
  if (appendTarget === null || appendTarget.state !== "open" || appendTarget.isPullRequest ||
    appendTarget.title !== managedIssueTitle || appendTarget.body !== decision.body) {
    if (appendTarget?.state === "closed" && appendTarget.title === managedIssueTitle && appendTarget.body === decision.body) {
      return allowRediscovery ? await syncManagedIssueEntriesV2Once(input, false) : "issue-identity-conflict";
    }
    return "issue-identity-conflict";
  }
  await input.adapter.appendJournalComment(decision.issueNumber, journalCommentBody(entry));
  const postIssue = await input.adapter.readIssue(decision.issueNumber);
  const post = await input.adapter.listJournalComments(decision.issueNumber);
  if (postIssue === null || postIssue.state !== "open" || postIssue.title !== managedIssueTitle ||
    postIssue.body !== decision.body) {
    return "issue-identity-conflict";
  }
  if (!post.complete) return "issue-discovery-incomplete";
  const reduced = reduceJournalCommentsV2(post.items, decision.root.creatorUserId);
  validateIssueJournalV2(decision.root, reduced);
  if (reduced.entries.at(-1)?.digest !== entry.digest) return "issue-identity-conflict";
  return "updated";
}
