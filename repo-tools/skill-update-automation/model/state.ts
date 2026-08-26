import { parseGeneration, parseObject, parsePositiveSafeInteger, requireExactKeys } from "./validation.ts";

export type TriggerDecision = Readonly<{
  decision: "run" | "opt-out";
  resumeClosed: boolean;
}>;

export function evaluateTrigger(value: unknown): TriggerDecision {
  const object = parseObject(value, "trigger");
  if (object.event === "schedule") {
    requireExactKeys(object, ["event", "autoUpdateVariable"], "schedule trigger");
    return {
      decision: object.autoUpdateVariable === "true" ? "run" : "opt-out",
      resumeClosed: false,
    };
  }
  if (object.event === "workflow_dispatch") {
    requireExactKeys(object, ["event", "inputs"], "manual trigger");
    const inputs = parseObject(object.inputs, "manual inputs");
    requireExactKeys(inputs, ["resume_closed"], "manual inputs");
    if (typeof inputs.resume_closed !== "boolean") throw new Error("resume_closedはbooleanが必要です");
    return { decision: "run", resumeClosed: inputs.resume_closed };
  }
  throw new Error("trigger eventが不正です");
}

export type ManagedPrHistoryMember = Readonly<{
  generation: number;
  prNumber: number;
  state: "open" | "closed";
  merged: boolean;
}>;
export type PrMemberIdentity = Readonly<{ generation: number; prNumber: number }>;
export type PrHistoryState =
  | Readonly<{ kind: "create"; generation: number }>
  | Readonly<{ kind: "generation-conflict" | "open-pr-conflict"; members: readonly PrMemberIdentity[] }>
  | Readonly<{ kind: "open" | "paused-closed"; member: PrMemberIdentity }>
  | Readonly<{ kind: "merged"; member: PrMemberIdentity; nextGeneration: number }>;

function parseHistoryMember(value: unknown): ManagedPrHistoryMember {
  const object = parseObject(value, "PR history member");
  requireExactKeys(object, ["generation", "prNumber", "state", "merged"], "PR history member");
  if (object.state !== "open" && object.state !== "closed") throw new Error("PR stateが不正です");
  if (typeof object.merged !== "boolean" || (object.state === "open" && object.merged)) throw new Error("PR merged stateが不正です");
  return {
    generation: parseGeneration(object.generation),
    prNumber: parsePositiveSafeInteger(object.prNumber),
    state: object.state,
    merged: object.merged,
  };
}

function identity(member: ManagedPrHistoryMember): PrMemberIdentity {
  return { generation: member.generation, prNumber: member.prNumber };
}

function sortedIdentities(members: readonly ManagedPrHistoryMember[]): readonly PrMemberIdentity[] {
  return [...members]
    .sort((left, right) => left.generation - right.generation || left.prNumber - right.prNumber)
    .map(identity);
}

function nextGeneration(current: number): number {
  return parseGeneration(current + 1);
}

export function selectPrHistoryState(values: readonly unknown[], resumeClosed: boolean): PrHistoryState {
  if (typeof resumeClosed !== "boolean") throw new Error("resumeClosedはbooleanが必要です");
  const members = values.map(parseHistoryMember);
  const numbers = new Set<number>();
  for (const member of members) {
    if (numbers.has(member.prNumber)) throw new Error("PR numberが重複しています");
    numbers.add(member.prNumber);
  }
  const counts = new Map<number, number>();
  for (const member of members) counts.set(member.generation, (counts.get(member.generation) ?? 0) + 1);
  const duplicateMembers = members.filter((member) => (counts.get(member.generation) ?? 0) > 1);
  if (duplicateMembers.length > 0) {
    return { kind: "generation-conflict", members: sortedIdentities(duplicateMembers) };
  }
  const open = members.filter((member) => member.state === "open");
  if (open.length > 1) return { kind: "open-pr-conflict", members: sortedIdentities(open) };
  if (members.length === 0) {
    if (resumeClosed) throw new Error("closed-unmergedではないためresumeできません");
    return { kind: "create", generation: 1 };
  }
  const latest = members.reduce((selected, member) => member.generation > selected.generation ? member : selected);
  if (resumeClosed) {
    if (latest.state !== "closed" || latest.merged) throw new Error("closed-unmergedではないためresumeできません");
    return { kind: "create", generation: nextGeneration(latest.generation) };
  }
  if (latest.state === "open") return { kind: "open", member: identity(latest) };
  if (latest.merged) return { kind: "merged", member: identity(latest), nextGeneration: nextGeneration(latest.generation) };
  return { kind: "paused-closed", member: identity(latest) };
}
