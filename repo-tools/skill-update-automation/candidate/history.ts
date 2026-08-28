import { createHash } from "node:crypto";

import { redactCredentialText, type GhRunner } from "../../skill-updater/index.ts";
import {
  classifyPrRootV2,
  computePrHistoryDigest,
  decodePrStateSnapshotV2,
  managedPrTitle,
  parseDecimalId,
  parseObject,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseSha,
  reduceJournalCommentsV2,
  requireExactKeys,
  selectPrHistoryState,
  validatePrJournalV2,
  type JournalCommentV2,
  type PrStateV2,
} from "../model/index.ts";

export type CandidatePullRequest = Readonly<{
  prNumber: number;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  headRepositoryId: string | null;
  headRef: string;
  headSha: string;
  baseRepositoryId: string | null;
  baseRef: string;
  title: string;
  body: string | null;
  authorUserId?: string;
  lastEditedAt?: string | null;
  journalComments?: readonly JournalCommentV2[];
}>;

export type CandidateHistory = Readonly<{
  complete: boolean;
  pages: readonly (readonly CandidatePullRequest[])[];
}>;

export type CandidateHistoryOptions = Readonly<{
  repositoryId: string;
  repository: string;
  defaultBranchSha: string;
  defaultBranchRef: string;
  resumeClosed: boolean;
  allowPendingRecovery?: boolean;
}>;

export type StrictManagedPullRequest = Readonly<{
  prNumber: number;
  generation: number;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  headRef: string;
  headSha: string;
  markerDigest: string;
  creatorUserId: string;
  envelope: PrStateV2;
}>;

export type CandidateDiscovery = Readonly<{
  historyDigest: string;
  baseHeadSha: string;
  createGeneration?: number;
  open?: StrictManagedPullRequest;
  paused: boolean;
}>;

function apiObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}がobjectではありません`);
  return value as Record<string, unknown>;
}

function apiString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label}が不正です`);
  return value;
}

function apiId(value: unknown, label: string): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${label}が不正です`);
  return String(value);
}

export async function readCandidateHistory(repository: string, runner: GhRunner): Promise<CandidateHistory> {
  const repositoryName = parseRepositoryFullName(repository);
  const [owner, name] = repositoryName.split("/") as [string, string];
  const result = await runner([
    "api", "--method", "GET", "--paginate", "--slurp",
    `repos/${repositoryName}/pulls?state=all&per_page=100`,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`PR history取得失敗: ${redactCredentialText(result.stderr.trim() || result.stdout.trim())}`);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error("PR history JSONが不正です");
  }
  if (!Array.isArray(decoded) || decoded.some((page) => !Array.isArray(page))) {
    throw new Error("PR history paginationがpage配列ではありません");
  }
  const pages = decoded.map((page, pageIndex) => (page as unknown[]).map((raw, itemIndex): CandidatePullRequest => {
    const item = apiObject(raw, `pulls[${pageIndex}][${itemIndex}]`);
    const head = apiObject(item.head, "pull.head");
    const base = apiObject(item.base, "pull.base");
    const headRepositoryId = head.repo === null
      ? null
      : apiId(apiObject(head.repo, "pull.head.repo").id, "pull.head.repo.id");
    const baseRepositoryId = base.repo === null
      ? null
      : apiId(apiObject(base.repo, "pull.base.repo").id, "pull.base.repo.id");
    const authorUserId = item.user === undefined
      ? undefined
      : apiId(apiObject(item.user, "pull.user").id, "pull.user.id");
    if (item.state !== "open" && item.state !== "closed") throw new Error("pull.stateが不正です");
    if (typeof item.draft !== "boolean" || (item.body !== null && typeof item.body !== "string")) {
      throw new Error("pull draft/bodyが不正です");
    }
    if (item.merged_at !== null && typeof item.merged_at !== "string") throw new Error("pull.merged_atが不正です");
    return {
      prNumber: parsePositiveSafeInteger(item.number),
      state: item.state,
      merged: item.merged_at !== null,
      draft: item.draft,
      headRepositoryId,
      headRef: `refs/heads/${apiString(head.ref, "pull.head.ref")}`,
      headSha: parseSha(head.sha),
      baseRepositoryId,
      baseRef: `refs/heads/${apiString(base.ref, "pull.base.ref")}`,
      title: apiString(item.title, "pull.title"),
      body: item.body,
      ...(authorUserId === undefined ? {} : { authorUserId }),
    };
  }));
  const hydratedPages: CandidatePullRequest[][] = [];
  for (const page of pages) {
    const hydrated: CandidatePullRequest[] = [];
    for (const pullRequest of page) {
      if (!(pullRequest.body ?? "").includes("<!-- skill-update-pr-automation:pr-root:v2:")) {
        hydrated.push(pullRequest);
        continue;
      }
      const commentsResult = await runner([
        "api", "--method", "GET", "--paginate", "--slurp",
        `repos/${parseRepositoryFullName(repository)}/issues/${pullRequest.prNumber}/comments?per_page=100`,
      ]);
      if (commentsResult.exitCode !== 0) {
        throw new Error(`PR journal取得失敗: ${redactCredentialText(commentsResult.stderr.trim() || commentsResult.stdout.trim())}`);
      }
      let commentPages: unknown;
      try {
        commentPages = JSON.parse(commentsResult.stdout) as unknown;
      } catch {
        throw new Error("PR journal JSONが不正です");
      }
      if (!Array.isArray(commentPages) || commentPages.some((commentPage) => !Array.isArray(commentPage))) {
        throw new Error("PR journal paginationがpage配列ではありません");
      }
      const journalComments = commentPages.flat().map((rawComment): JournalCommentV2 => {
        const comment = apiObject(rawComment, "journal comment");
        const user = apiObject(comment.user, "journal comment user");
        if (typeof comment.body !== "string" || typeof comment.created_at !== "string" || typeof comment.updated_at !== "string") {
          throw new Error("journal comment fieldが不正です");
        }
        return {
          id: apiId(comment.id, "journal comment id"),
          authorUserId: apiId(user.id, "journal comment user id"),
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          body: comment.body,
        };
      });
      const root = classifyPrRootV2(pullRequest.body);
      let semanticCommentless = false;
      if (root.kind === "strict") {
        try {
          semanticCommentless = reduceJournalCommentsV2(journalComments, root.root.creatorUserId).entries.length === 0;
        } catch {
          semanticCommentless = false;
        }
      }
      if (!semanticCommentless) {
        hydrated.push({ ...pullRequest, journalComments });
        continue;
      }
      const query = "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){lastEditedAt}}}";
      const metadataResult = await runner([
        "api", "graphql", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `name=${name}`,
        "-F", `number=${pullRequest.prNumber}`,
      ]);
      if (metadataResult.exitCode !== 0) {
        throw new Error(`PR edit metadata取得失敗: ${redactCredentialText(metadataResult.stderr.trim() || metadataResult.stdout.trim())}`);
      }
      const response = apiObject(JSON.parse(metadataResult.stdout) as unknown, "GraphQL response");
      const data = apiObject(response.data, "GraphQL data");
      const graphRepository = apiObject(data.repository, "GraphQL repository");
      const graphPullRequest = apiObject(graphRepository.pullRequest, "GraphQL pullRequest");
      if (graphPullRequest.lastEditedAt !== null && typeof graphPullRequest.lastEditedAt !== "string") {
        throw new Error("pullRequest lastEditedAtが不正です");
      }
      hydrated.push({ ...pullRequest, lastEditedAt: graphPullRequest.lastEditedAt, journalComments });
    }
    hydratedPages.push(hydrated);
  }
  return { complete: true, pages: hydratedPages };
}

function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

type SameRepositoryPullRequest = CandidatePullRequest & Readonly<{
  headRepositoryId: string;
  baseRepositoryId: string;
  journalComments: readonly JournalCommentV2[];
}>;

function parseCandidatePullRequest(value: unknown): SameRepositoryPullRequest {
  const object = parseObject(value, "candidate PR");
  const {
    journalComments: rawJournalComments,
    authorUserId,
    lastEditedAt,
    ...identity
  } = object;
  requireExactKeys(identity, [
    "prNumber", "state", "merged", "draft", "headRepositoryId", "headRef", "headSha",
    "baseRepositoryId", "baseRef", "title", "body",
  ], "candidate PR");
  if (object.state !== "open" && object.state !== "closed") throw new Error("candidate PR stateが不正です");
  if (typeof object.merged !== "boolean" || (object.state === "open" && object.merged)) {
    throw new Error("candidate PR merged stateが不正です");
  }
  if (typeof object.draft !== "boolean" || typeof object.title !== "string") throw new Error("candidate PR fieldが不正です");
  if (object.body !== null && typeof object.body !== "string") throw new Error("candidate PR bodyが不正です");
  if (lastEditedAt !== undefined && lastEditedAt !== null && typeof lastEditedAt !== "string") {
    throw new Error("candidate PR lastEditedAtが不正です");
  }
  const headRef = String(object.headRef);
  const baseRef = String(object.baseRef);
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(headRef) || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(baseRef)) {
    throw new Error("candidate PR refが不正です");
  }
  return {
    prNumber: parsePositiveSafeInteger(object.prNumber),
    state: object.state,
    merged: object.merged,
    draft: object.draft,
    headRepositoryId: parseDecimalId(object.headRepositoryId),
    headRef,
    headSha: parseSha(object.headSha),
    baseRepositoryId: parseDecimalId(object.baseRepositoryId),
    baseRef,
    title: object.title,
    body: object.body,
    ...(authorUserId === undefined ? {} : { authorUserId: parseDecimalId(authorUserId) }),
    ...(lastEditedAt === undefined ? {} : { lastEditedAt }),
    journalComments: rawJournalComments === undefined ? [] : parseJournalComments(rawJournalComments),
  };
}

function parseJournalComments(value: unknown): readonly JournalCommentV2[] {
  if (!Array.isArray(value)) throw new Error("candidate PR journal commentsが配列ではありません");
  return value.map((raw): JournalCommentV2 => {
    const comment = parseObject(raw, "candidate PR journal comment");
    requireExactKeys(comment, ["id", "authorUserId", "createdAt", "updatedAt", "body"], "candidate PR journal comment");
    if (typeof comment.body !== "string" || typeof comment.createdAt !== "string" || typeof comment.updatedAt !== "string") {
      throw new Error("candidate PR journal comment fieldが不正です");
    }
    return {
      id: parseDecimalId(comment.id),
      authorUserId: parseDecimalId(comment.authorUserId),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      body: comment.body,
    };
  });
}

function managedBranch(ref: string): boolean {
  return /^refs\/heads\/automation\/skill-updates\/g[0-9]{6}$/.test(ref);
}

export function discoverCandidateHistory(
  history: CandidateHistory,
  options: CandidateHistoryOptions,
): CandidateDiscovery {
  if (!history.complete) throw new Error("PR history paginationがcompleteではありません");
  const candidates: SameRepositoryPullRequest[] = [];
  const strict: StrictManagedPullRequest[] = [];
  for (const raw of history.pages.flat()) {
    if (raw.headRepositoryId !== options.repositoryId || raw.baseRepositoryId !== options.repositoryId) continue;
    const pullRequest = parseCandidatePullRequest(raw);
    const body = pullRequest.body ?? "";
    const identityMatch = managedBranch(pullRequest.headRef) || pullRequest.title === managedPrTitle ||
      body.includes("<!-- skill-update-pr-automation:pr:v1:") ||
      body.includes("<!-- skill-update-pr-automation:pr-root:v2:");
    if (!identityMatch) continue;
    const classification = classifyPrRootV2(pullRequest.body);
    if (
      classification.kind !== "strict" || pullRequest.title !== managedPrTitle ||
      !managedBranch(pullRequest.headRef) || pullRequest.baseRef !== options.defaultBranchRef
    ) {
      throw new Error(`PR automation identityがpartialです: #${pullRequest.prNumber}`);
    }
    const root = classification.root;
    const journal = reduceJournalCommentsV2(pullRequest.journalComments, root.creatorUserId);
    const first = journal.entries[0];
    const latest = journal.entries.at(-1);
    const currentEntry = journal.pending === null ? latest : journal.entries.at(-2);
    if (journal.entries.length === 0) {
      const initial = decodePrStateSnapshotV2(root.initialSnapshot);
      if (pullRequest.authorUserId !== root.creatorUserId || pullRequest.lastEditedAt !== null ||
        pullRequest.state !== "open" || pullRequest.merged || !pullRequest.draft ||
        initial.expectedHeadSha !== pullRequest.headSha || initial.draft !== pullRequest.draft ||
        initial.repositoryId !== options.repositoryId || initial.repository !== options.repository ||
        initial.headRef !== pullRequest.headRef || initial.baseRef !== pullRequest.baseRef) {
        throw new Error(`PR automation commentless rootが不正です: #${pullRequest.prNumber}`);
      }
      candidates.push(pullRequest);
      strict.push({
        prNumber: pullRequest.prNumber,
        generation: initial.generation,
        state: pullRequest.state,
        merged: pullRequest.merged,
        draft: pullRequest.draft,
        headRef: pullRequest.headRef,
        headSha: pullRequest.headSha,
        markerDigest: root.initialSnapshotDigest,
        creatorUserId: root.creatorUserId,
        envelope: initial,
      });
      continue;
    }
    if (first === undefined || latest === undefined || currentEntry === undefined || first.resourceKind !== "pull-request" ||
      first.resourceNumber !== pullRequest.prNumber || first.snapshot.stateDigest !== root.initialSnapshotDigest ||
      (journal.pending !== null && options.allowPendingRecovery !== true)) {
      throw new Error(`PR automation journalが不正です: #${pullRequest.prNumber}`);
    }
    const states = validatePrJournalV2(root, journal);
    const envelope = states[journal.pending === null ? states.length - 1 : states.length - 2]!;
    const preparedAfter = journal.pending === null ? null : states.at(-1)!;
    if (
      root.repositoryId !== options.repositoryId || root.repository !== options.repository ||
      root.generation !== envelope.generation || root.headRef !== envelope.headRef || root.baseRef !== envelope.baseRef ||
      envelope.repositoryId !== options.repositoryId || envelope.repository !== options.repository ||
      envelope.headRef !== pullRequest.headRef || envelope.baseRef !== pullRequest.baseRef ||
      ((envelope.expectedHeadSha !== pullRequest.headSha || envelope.draft !== pullRequest.draft) &&
        (preparedAfter === null || preparedAfter.expectedHeadSha !== pullRequest.headSha || preparedAfter.draft !== pullRequest.draft))
    ) {
      throw new Error(`PR automation identityが一致しません: #${pullRequest.prNumber}`);
    }
    candidates.push({ ...pullRequest, headSha: envelope.expectedHeadSha, draft: envelope.draft });
    strict.push({
      prNumber: pullRequest.prNumber,
      generation: envelope.generation,
      state: pullRequest.state,
      merged: pullRequest.merged,
      draft: pullRequest.draft,
      headRef: pullRequest.headRef,
      headSha: envelope.expectedHeadSha,
      markerDigest: currentEntry.digest,
      creatorUserId: root.creatorUserId,
      envelope,
    });
  }
  const historyDigest = computePrHistoryDigest(options.repositoryId, candidates.map((pullRequest) => ({
    prNumber: pullRequest.prNumber,
    state: pullRequest.state,
    merged: pullRequest.merged,
    headRepositoryId: pullRequest.headRepositoryId,
    headRef: pullRequest.headRef,
    headSha: pullRequest.headSha,
    baseRepositoryId: pullRequest.baseRepositoryId,
    baseRef: pullRequest.baseRef,
    titleDigest: digestText(pullRequest.title),
    bodyDigest: digestText(pullRequest.body ?? ""),
  })));
  const selected = selectPrHistoryState(strict.map((pullRequest) => ({
    generation: pullRequest.generation,
    prNumber: pullRequest.prNumber,
    state: pullRequest.state,
    merged: pullRequest.merged,
  })), options.resumeClosed);
  if (selected.kind === "generation-conflict" || selected.kind === "open-pr-conflict") {
    throw new Error(`PR history conflict: ${selected.kind}`);
  }
  if (selected.kind === "open") {
    const open = strict.find((pullRequest) => pullRequest.prNumber === selected.member.prNumber)!;
    return { historyDigest, baseHeadSha: open.headSha, open, paused: false };
  }
  if (selected.kind === "create") {
    return { historyDigest, baseHeadSha: options.defaultBranchSha, createGeneration: selected.generation, paused: false };
  }
  if (selected.kind === "merged") {
    return { historyDigest, baseHeadSha: options.defaultBranchSha, createGeneration: selected.nextGeneration, paused: false };
  }
  return { historyDigest, baseHeadSha: options.defaultBranchSha, paused: true };
}
