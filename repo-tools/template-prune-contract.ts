import { spawnSync } from "node:child_process";

export function validateTemplateConfiguration(repositoryRoot: string): readonly string[] {
  const scanner = new URL("./template_prune_state.py", import.meta.url);
  const result = spawnSync("python3", ["-B", scanner.pathname, repositoryRoot, process.execPath], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`template configuration: ${result.error?.message ?? result.stderr + result.stdout}`);
  const state = JSON.parse(result.stdout) as {
    state: string; coverage: string;
    references: {surface:string;source:string;line:number;target:string}[];
    errors: {surface:string;source:string;line:number;reason:string}[];
    unevaluated: {surface:string;source:string;line:number;reason:string}[];
  };
  if (state.state === "inconsistent") throw new Error(`template configuration: 不整合\n${JSON.stringify({errors:state.errors,references:state.references,coverage:state.coverage,unevaluated:state.unevaluated})}`);
  const groups = new Map<string,string[]>();
  for (const row of state.unevaluated) {
    const sources=groups.get(row.reason)??[];
    sources.push(`${row.surface} ${JSON.stringify(row.source)}:${row.line}`);
    groups.set(row.reason,sources);
  }
  return [
    `template configuration: ${state.state}; coverage: ${state.coverage}`,
    ...Array.from(groups,([reason,sources])=>`coverage partial: ${reason}: ${sources.join(", ")}`),
    ...(state.unevaluated.length ? [`評価できた範囲に専用参照の検出なし。cwd 依存参照に未評価あり (${state.unevaluated.length} 件)。task doctor で source / 位置 / surface / 理由を確認。保証は R01〜R06 の列挙構文のみ。`] : []),
  ];
}
