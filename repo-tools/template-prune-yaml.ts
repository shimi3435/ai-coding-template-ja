/** YAML value の定義位置と alias 利用位置を、値の文字列検索なしで取得する。 */
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";

type FieldPath = (string | number)[];
type AliasUse = { source: string; line: number; field_path: FieldPath };
type Position = { line: number; field_path: FieldPath; position_kind: "field-value"; alias_uses: AliasUse[] };

export function workflowDocument(source: string, path: string) {
  const doc = parseDocument(source, { version: "1.2", schema: "core", strict: true, uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors, ...doc.warnings].map(String).join("; "));
  if (!isMap(doc.contents)) throw new Error("workflow root は mapping が必要です");
  // Keep yaml's default alias expansion limit before traversing resolved nodes.
  const data: unknown = doc.toJSON();
  const locations: Record<string, Position> = {};
  function line(node: unknown): number {
    if (typeof node !== "object" || node === null || !("range" in node)) throw new Error("YAML node range がない");
    const range = node.range;
    if (!Array.isArray(range) || !Number.isInteger(range[0]) || range[0] < 0 || range[0] > source.length) throw new Error("YAML node range が不正");
    return source.slice(0, range[0]).split("\n").length;
  }
  function visit(node: unknown, field: FieldPath, aliases: AliasUse[], ancestors: Set<unknown>): void {
    if (node === null) return;
    if (ancestors.has(node)) throw new Error("循環 YAML alias は位置を確定できない");
    const next = new Set(ancestors).add(node);
    if (isAlias(node)) {
      const resolved = node.resolve(doc);
      if (!resolved) throw new Error("YAML alias の定義がない");
      visit(resolved, field, [...aliases, { source: path, line: line(node), field_path: field }], next);
      return;
    }
    locations[JSON.stringify(field)] = { line: line(node), field_path: field, position_kind: "field-value", alias_uses: aliases };
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== "string") throw new Error("workflow field key は string が必要");
        visit(pair.value, [...field, pair.key.value], aliases, next);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, index) => visit(item, [...field, index], aliases, next));
    }
  }
  visit(doc.contents, [], [], new Set());
  return { data, locations };
}
