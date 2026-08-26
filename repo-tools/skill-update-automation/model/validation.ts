export type RunRef = Readonly<{
  workflowRunId: string;
  workflowRunAttempt: number;
}>;

function parsePattern(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label}が不正です`);
  return value;
}

export function parseSha(value: unknown): string {
  return parsePattern(value, /^[0-9a-f]{40}$/, "SHA");
}

export function parseDigest(value: unknown): string {
  return parsePattern(value, /^sha256:[0-9a-f]{64}$/, "digest");
}

export function parseDecimalId(value: unknown): string {
  return parsePattern(value, /^[1-9][0-9]{0,19}$/, "decimal ID");
}

export function parsePositiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error("positive safe integerが必要です");
  return value as number;
}

export function parseGeneration(value: unknown): number {
  const generation = parsePositiveSafeInteger(value);
  if (generation > 999999) throw new Error("generationは999999以下が必要です");
  return generation;
}

export function parseRepositoryFullName(value: unknown): string {
  return parsePattern(value, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "repository full name");
}

export function parseUtcTimestamp(value: unknown): string {
  const timestamp = parsePattern(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "UTC timestamp");
  if (new Date(timestamp).toISOString() !== timestamp) throw new Error("UTC timestampが実在しません");
  return timestamp;
}

export function parseObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}はobjectが必要です`);
  }
  return value as Record<string, unknown>;
}

export function requireExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label}のkey集合が不正です`);
  }
}

export function parseRunRef(value: unknown): RunRef {
  const object = parseObject(value, "run");
  requireExactKeys(object, ["workflowRunId", "workflowRunAttempt"], "run");
  return {
    workflowRunId: parseDecimalId(object.workflowRunId),
    workflowRunAttempt: parsePositiveSafeInteger(object.workflowRunAttempt),
  };
}
