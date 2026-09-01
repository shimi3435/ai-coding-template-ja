import { selectPrHistoryState, type PrScope } from "../model/index.ts";

export type ManagedPrObservation = Readonly<{
  generation: number;
  prNumber: number;
  state: "open" | "closed";
  merged: boolean;
}>;

export type ManagedPrDecision =
  | Readonly<{ kind: "create"; generation: number; writePolicy: "publish" }>
  | Readonly<{
      kind: "generation-conflict" | "open-pr-conflict";
      state: "generation-conflict" | "open-pr-conflict";
      writePolicy: "issue-only";
      scope: Extract<PrScope, { mode: "set" }>;
    }>
  | Readonly<{
      kind: "open";
      member: Readonly<{ generation: number; prNumber: number }>;
      writePolicy: "publish";
    }>
  | Readonly<{
      kind: "paused-closed";
      state: "paused-closed";
      member: Readonly<{ generation: number; prNumber: number }>;
      writePolicy: "issue-only";
      scope: Extract<PrScope, { mode: "single" }>;
    }>
  | Readonly<{
      kind: "merged";
      member: Readonly<{ generation: number; prNumber: number }>;
      nextGeneration: number;
      writePolicy: "publish";
    }>;

export function reduceManagedPrHistory(
  observations: readonly ManagedPrObservation[],
  resumeClosed: boolean,
): ManagedPrDecision {
  const state = selectPrHistoryState(observations, resumeClosed);
  if (state.kind === "create") return { kind: "create", generation: state.generation, writePolicy: "publish" };
  if ("members" in state) {
    return {
      kind: state.kind,
      state: state.kind,
      writePolicy: "issue-only",
      scope: { kind: "pr", mode: "set", members: state.members },
    };
  }
  if (state.kind === "open" && "member" in state) return { kind: "open", member: state.member, writePolicy: "publish" };
  if (state.kind === "merged" && "nextGeneration" in state) {
    return {
      kind: "merged",
      member: state.member,
      nextGeneration: state.nextGeneration,
      writePolicy: "publish",
    };
  }
  if (!("member" in state)) throw new Error("PR history reducer stateが不正です");
  return {
    kind: "paused-closed",
    state: "paused-closed",
    member: state.member,
    writePolicy: "issue-only",
    scope: {
      kind: "pr",
      mode: "single",
      generation: state.member.generation,
      prNumber: state.member.prNumber,
    },
  };
}
