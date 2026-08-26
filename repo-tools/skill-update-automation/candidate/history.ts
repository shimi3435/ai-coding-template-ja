import { createHash } from "node:crypto";

import { redactCredentialText, type GhRunner } from "../../skill-updater/index.ts";
import {
  classifyPrBody,
  computePrHistoryDigest,
  managedPrTitle,
  parseDecimalId,
  parseObject,
  parsePositiveSafeInteger,
  parseRepositoryFullName,
  parseSha,
  requireExactKeys,
  selectPrHistoryState,
  type PrEnvelope,
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
  envelope: PrEnvelope;
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
  const result = await runner([
    "api", "--method", "GET", "--paginate", "--slurp",
    `repos/${parseRepositoryFullName(repository)}/pulls?state=all&per_page=100`,
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
    };
  }));
  return { complete: true, pages };
}

function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

type SameRepositoryPullRequest = CandidatePullRequest & Readonly<{
  headRepositoryId: string;
  baseRepositoryId: string;
}>;

function parseCandidatePullRequest(value: unknown): SameRepositoryPullRequest {
  const object = parseObject(value, "candidate PR");
  requireExactKeys(object, [
    "prNumber", "state", "merged", "draft", "headRepositoryId", "headRef", "headSha",
    "baseRepositoryId", "baseRef", "title", "body",
  ], "candidate PR");
  if (object.state !== "open" && object.state !== "closed") throw new Error("candidate PR stateが不正です");
  if (typeof object.merged !== "boolean" || (object.state === "open" && object.merged)) {
    throw new Error("candidate PR merged stateが不正です");
  }
  if (typeof object.draft !== "boolean" || typeof object.title !== "string") throw new Error("candidate PR fieldが不正です");
  if (object.body !== null && typeof object.body !== "string") throw new Error("candidate PR bodyが不正です");
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
  };
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
      body.includes("<!-- skill-update-pr-automation:pr:v1:");
    if (!identityMatch) continue;
    candidates.push(pullRequest);
    const classification = classifyPrBody(pullRequest.body, pullRequest.draft);
    if (
      classification.kind !== "strict" || pullRequest.title !== managedPrTitle ||
      !managedBranch(pullRequest.headRef) || pullRequest.baseRef !== options.defaultBranchRef
    ) {
      throw new Error(`PR automation identityがpartialです: #${pullRequest.prNumber}`);
    }
    const envelope = classification.envelope;
    if (
      envelope.repositoryId !== options.repositoryId || envelope.repository !== options.repository ||
      envelope.headRef !== pullRequest.headRef || envelope.baseRef !== pullRequest.baseRef ||
      envelope.expectedHeadSha !== pullRequest.headSha
    ) {
      throw new Error(`PR automation identityが一致しません: #${pullRequest.prNumber}`);
    }
    strict.push({
      prNumber: pullRequest.prNumber,
      generation: envelope.generation,
      state: pullRequest.state,
      merged: pullRequest.merged,
      draft: pullRequest.draft,
      headRef: pullRequest.headRef,
      headSha: pullRequest.headSha,
      markerDigest: classification.markerDigest,
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
