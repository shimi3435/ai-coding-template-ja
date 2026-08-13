import { isMap, parseDocument } from "yaml";

export type SkillMetadata = Readonly<{ name: string; description: string }>;

export function parseSkillMetadata(markdown: string | Buffer, expectedName: string): SkillMetadata {
  let text: string;
  try {
    text = Buffer.isBuffer(markdown)
      ? new TextDecoder("utf-8", { fatal: true }).decode(markdown)
      : markdown;
  } catch {
    throw new Error("SKILL.md はvalid UTF-8が必要です");
  }
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (match === null) {
    throw new Error("SKILL.md frontmatterがありません");
  }
  const document = parseDocument(match[1]!, { strict: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`SKILL.md YAMLが不正です: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  if (!isMap(document.contents)) {
    throw new Error("SKILL.md frontmatter rootはmappingが必要です");
  }
  const value = document.toJS({ maxAliasCount: 0 }) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("SKILL.md frontmatter rootはmappingが必要です");
  }
  const mapping = value as Record<string, unknown>;
  if (mapping.name !== expectedName) {
    throw new Error(`SKILL.md name不一致: expected=${expectedName} actual=${String(mapping.name)}`);
  }
  if (typeof mapping.description !== "string" || mapping.description.trim().length === 0) {
    throw new Error("SKILL.md descriptionは空でないstringが必要です");
  }
  return { name: expectedName, description: mapping.description };
}
