export type ExactSchema<T> = Readonly<{
  parse(value: unknown): T;
}>;

function escapeHtmlSensitiveCharacters(json: string): string {
  return json.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

export function encodeCanonicalJson<T>(schema: ExactSchema<T>, value: unknown): Buffer {
  const parsed = schema.parse(value);
  const json = JSON.stringify(parsed);
  if (json === undefined) throw new Error("canonical JSONのtop-level valueが不正です");
  return Buffer.from(escapeHtmlSensitiveCharacters(json), "utf8");
}

export function decodeCanonicalJson<T>(schema: ExactSchema<T>, bytes: Uint8Array): T {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(text);
  const value = schema.parse(parsed);
  if (!encodeCanonicalJson(schema, value).equals(Buffer.from(bytes))) {
    throw new Error("canonical JSON bytesではありません");
  }
  return value;
}
