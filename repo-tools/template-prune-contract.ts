import { spawnSync } from "node:child_process";
import { parseResult, successful } from "./template-prune-result.ts";

export function validateTemplateConfiguration(repositoryRoot: string): readonly string[] {
  const scanner = new URL("./template_prune_state.py", import.meta.url);
  const result = spawnSync("python3", ["-B", scanner.pathname, repositoryRoot, process.execPath], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`template configuration: ${result.error?.message ?? result.stderr + result.stdout}`);
  const state = parseResult(result.stdout);
  if (!successful(state)) throw new Error(`template configuration: 検査失敗\n${JSON.stringify(state)}`);
  const groups = new Map<string,string[]>();
  for (const row of state.unevaluated) {
    const sources=groups.get(row.reason!)??[];
    const position = Object.fromEntries(["line_end", "field_path", "alias_uses", "shell_range"].filter(key => key in row).map(key => [key, row[key]]));
    sources.push(`${row.surface} ${JSON.stringify(row.source)}:${row.line}${Object.keys(position).length ? " " + JSON.stringify(position) : ""}`);
    groups.set(row.reason!,sources);
  }
  return [
    `template configuration: ${state.state}; coverage: ${state.coverage}`,
    ...Array.from(groups,([reason,sources])=>`coverage partial (${sources.length} 件): ${reason}: ${[...new Set(sources)].join(", ")}`),
    ...(state.unevaluated.length ? [`評価できた範囲に専用参照の検出なし。未評価範囲あり（理由別の内訳を参照） (${state.unevaluated.length} 件)。task doctor で source / 位置 / surface / 理由を確認。保証は R01〜R06 の列挙構文のみ。`] : []),
  ];
}
