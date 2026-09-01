import { createHash } from "node:crypto";

import {
  parseDecimalId,
  parseDigest,
  parseObject,
  parsePositiveSafeInteger,
  parseSha,
  requireExactKeys,
} from "./validation.ts";

export type PrHistoryMember = Readonly<{
  prNumber: number;
  state: "open" | "closed";
  merged: boolean;
  headRepositoryId: string;
  headRef: string;
  headSha: string;
  baseRepositoryId: string;
  baseRef: string;
  titleDigest: string;
  bodyDigest: string;
}>;

function parseRef(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new Error(`${label}が不正です`);
  }
  return value;
}

function parseHistoryMember(value: unknown): PrHistoryMember {
  const object = parseObject(value, "PR history member");
  requireExactKeys(object, [
    "prNumber", "state", "merged", "headRepositoryId", "headRef", "headSha", "baseRepositoryId", "baseRef",
    "titleDigest", "bodyDigest",
  ], "PR history member");
  if (object.state !== "open" && object.state !== "closed") throw new Error("PR history stateが不正です");
  if (typeof object.merged !== "boolean" || (object.state === "open" && object.merged)) throw new Error("PR history merged stateが不正です");
  return {
    prNumber: parsePositiveSafeInteger(object.prNumber),
    state: object.state,
    merged: object.merged,
    headRepositoryId: parseDecimalId(object.headRepositoryId),
    headRef: parseRef(object.headRef, "headRef"),
    headSha: parseSha(object.headSha),
    baseRepositoryId: parseDecimalId(object.baseRepositoryId),
    baseRef: parseRef(object.baseRef, "baseRef"),
    titleDigest: parseDigest(object.titleDigest),
    bodyDigest: parseDigest(object.bodyDigest),
  };
}

export function computePrHistoryDigest(repositoryIdValue: unknown, values: readonly unknown[]): string {
  const repositoryId = parseDecimalId(repositoryIdValue);
  const members = values.map(parseHistoryMember).sort((left, right) => left.prNumber - right.prNumber);
  for (let index = 1; index < members.length; index += 1) {
    if (members[index - 1]!.prNumber === members[index]!.prNumber) throw new Error("PR history numberが重複しています");
  }
  const canonical = JSON.stringify({ schemaVersion: 1, repositoryId, members });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
