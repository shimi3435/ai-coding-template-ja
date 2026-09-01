import { isDeepStrictEqual } from "node:util";

import type { GithubAdapter, JournalGithubAdapter } from "../github/adapter.ts";
import {
  classifyPrRootV2,
  decodePrStateSnapshotV2,
  journalCommentBody,
  managedPrTitle,
  reduceJournalCommentsV2,
  type JournalEntryV2,
  type PrRootV2,
  type PrStateV2,
} from "../model/index.ts";

export type CommentlessRecoveryAdapter = Pick<GithubAdapter, "readPullRequest" | "readBranch"> & JournalGithubAdapter;

export async function assertExactCommentlessRecoveryTarget(input: Readonly<{
  adapter: CommentlessRecoveryAdapter;
  prNumber: number;
  immutableBody: string;
  expectedRoot: PrRootV2;
  expectedState: PrStateV2;
}>): Promise<void> {
  const pullRequest = await input.adapter.readPullRequest(input.prNumber);
  const branch = await input.adapter.readBranch(input.expectedRoot.headRef);
  const comments = await input.adapter.listJournalComments(input.prNumber);
  const classification = classifyPrRootV2(pullRequest?.body ?? null);
  if (pullRequest === null || classification.kind !== "strict" || !comments.complete) {
    throw new Error("commentless recovery targetがfresh exact stateと一致しません");
  }
  let initialState: PrStateV2;
  try {
    initialState = decodePrStateSnapshotV2(classification.root.initialSnapshot);
  } catch {
    throw new Error("commentless recovery targetがfresh exact stateと一致しません");
  }
  let semanticCommentless = false;
  try {
    const journal = reduceJournalCommentsV2(comments.items, classification.root.creatorUserId);
    semanticCommentless = journal.entries.length === 0 && journal.pending === null;
  } catch {
    throw new Error("commentless recovery targetがfresh exact stateと一致しません");
  }
  const root = classification.root;
  if (!isDeepStrictEqual(root, input.expectedRoot) || !isDeepStrictEqual(initialState, input.expectedState) ||
    pullRequest.body !== input.immutableBody || pullRequest.state !== "open" || pullRequest.merged ||
    pullRequest.draft !== input.expectedState.draft || pullRequest.title !== managedPrTitle ||
    pullRequest.headRepositoryId !== input.expectedState.repositoryId ||
    pullRequest.baseRepositoryId !== input.expectedState.repositoryId ||
    pullRequest.headRef !== input.expectedState.headRef || pullRequest.baseRef !== input.expectedState.baseRef ||
    pullRequest.headSha !== input.expectedState.expectedHeadSha || branch?.sha !== input.expectedState.expectedHeadSha ||
    pullRequest.authorUserId !== root.creatorUserId || pullRequest.lastEditedAt !== null ||
    root.repositoryId !== input.expectedState.repositoryId || root.repository !== input.expectedState.repository ||
    root.generation !== input.expectedState.generation || root.headRef !== input.expectedState.headRef ||
    root.baseRef !== input.expectedState.baseRef || root.candidateDigest !== input.expectedState.candidateDigest ||
    root.initialSnapshotDigest !== root.initialSnapshot.stateDigest || !semanticCommentless) {
    throw new Error("commentless recovery targetがfresh exact stateと一致しません");
  }
}

function hasExactInitialEntry(
  comments: Awaited<ReturnType<JournalGithubAdapter["listJournalComments"]>>,
  expected: JournalEntryV2,
): boolean {
  if (!comments.complete) return false;
  const journal = reduceJournalCommentsV2(comments.items, expected.creatorUserId);
  return journal.pending === null && journal.entries.length === 1 &&
    journal.entries[0]?.digest === expected.digest;
}

export async function appendInitialJournalEntry(
  adapter: JournalGithubAdapter,
  expected: JournalEntryV2,
): Promise<void> {
  try {
    await adapter.appendJournalComment(expected.resourceNumber, journalCommentBody(expected));
  } catch (error: unknown) {
    const observed = await adapter.listJournalComments(expected.resourceNumber);
    if (hasExactInitialEntry(observed, expected)) return;
    throw error;
  }
  const observed = await adapter.listJournalComments(expected.resourceNumber);
  if (!hasExactInitialEntry(observed, expected)) {
    throw new Error("initial journal append後のfresh stateがexpected entry 1件と一致しません");
  }
}
