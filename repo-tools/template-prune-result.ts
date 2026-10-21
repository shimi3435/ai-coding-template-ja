/** Python scanner の公開 JSON protocol を fail-closed で検証する。 */
type Row = Record<string, unknown> & { surface: string | null; source: string; line: number | null; reason?: string; target?: string; kind?: string };
export type Result = { state: string; coverage: string; references: Row[]; errors: Row[]; analysis_errors: Row[]; unevaluated: Row[]; edits: Record<string, string> };
function object(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("scanner protocol: object が必要");
}
function positive(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("scanner protocol: line は1以上の整数が必要");
}
function fieldPath(value: unknown): void {
  if (!Array.isArray(value) || !value.every(v => typeof v === "string" || Number.isSafeInteger(v) && v >= 0)) throw new Error("scanner protocol: field_path が不正");
}
export function parseResult(text: string): Result {
  const value: unknown = JSON.parse(text);
  object(value);
  if (!["bundled", "pruned", "inconsistent"].includes(String(value.state)) || typeof value.state !== "string") throw new Error("scanner protocol: state が不正");
  if (!["evaluated", "partial"].includes(String(value.coverage)) || typeof value.coverage !== "string") throw new Error("scanner protocol: coverage が不正");
  object(value.edits);
  if (!Object.values(value.edits).every(v => typeof v === "string")) throw new Error("scanner protocol: edits が不正");
  for (const key of ["references", "errors", "analysis_errors", "unevaluated"] as const) {
    const rows = value[key];
    if (!Array.isArray(rows)) throw new Error(`scanner protocol: ${key} は array が必要`);
    for (const row of rows) {
      object(row);
      if (typeof row.source !== "string" || !row.source) throw new Error("scanner protocol: source が不正");
      const common = key === "analysis_errors" && row.surface === null && row.line === null;
      if (!common) {
        if (typeof row.surface !== "string" || !["R01", "R02", "R03", "R04", "R05", "R06"].includes(row.surface)) throw new Error("scanner protocol: surface が不正");
        positive(row.line);
      }
      const detail = row[key === "references" ? "target" : "reason"];
      if (typeof detail !== "string" || !detail) throw new Error("scanner protocol: diagnostic が不正");
      if (key === "analysis_errors" && (typeof row.kind !== "string" || !["syntax", "dependency", "protocol", "io", "position"].includes(row.kind))) throw new Error("scanner protocol: analysis kind が不正");
      if (key === "unevaluated" && (typeof row.kind !== "string" || !["cwd", "placeholder", "document-fragment", "analysis-error"].includes(row.kind))) throw new Error("scanner protocol: partial kind が不正");
      if ("line_end" in row) {
        positive(row.line_end); positive(row.line);
        if (row.line_end < row.line) throw new Error("scanner protocol: range が逆転");
      }
      if ("position_kind" in row && (typeof row.position_kind !== "string" || !["statement-range", "field-value"].includes(row.position_kind))) throw new Error("scanner protocol: position kind が不正");
      if (row.position_kind === "statement-range" && !("line_end" in row)) throw new Error("scanner protocol: statement end がない");
      if (row.position_kind === "field-value" && !("field_path" in row)) throw new Error("scanner protocol: field path がない");
      if ("field_path" in row) fieldPath(row.field_path);
      if ("alias_uses" in row) {
        if (!Array.isArray(row.alias_uses)) throw new Error("scanner protocol: alias_uses が不正");
        for (const use of row.alias_uses) {
          object(use);
          if (typeof use.source !== "string") throw new Error("scanner protocol: alias source が不正");
          positive(use.line); fieldPath(use.field_path);
        }
      }
      if ("shell_range" in row) {
        object(row.shell_range); positive(row.shell_range.line); positive(row.shell_range.line_end);
        if (row.shell_range.line_end < row.shell_range.line) throw new Error("scanner protocol: shell range が逆転");
      }
    }
  }
  const result = value as Result;
  if ((result.unevaluated.length || result.analysis_errors.length) && result.coverage !== "partial") throw new Error("scanner protocol: coverage が矛盾");
  return result;
}
export function successful(result: Result): boolean {
  return result.state !== "inconsistent" && !result.references.length && !result.errors.length && !result.analysis_errors.length;
}
