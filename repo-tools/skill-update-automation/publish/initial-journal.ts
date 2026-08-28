import type { JournalGithubAdapter } from "../github/adapter.ts";
import {
  journalCommentBody,
  reduceJournalCommentsV2,
  type JournalEntryV2,
} from "../model/index.ts";

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
