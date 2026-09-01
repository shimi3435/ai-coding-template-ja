import { isDeepStrictEqual } from "node:util";

export type RecoverableWriteResult =
  | Readonly<{ kind: "applied"; attempts: 1 | 2; recovered: boolean }>
  | Readonly<{ kind: "recovery-required"; attempts: 1 | 2 }>;

export type RecoverableWriteInput<State> = Readonly<{
  expectedBefore: State;
  candidateAfter: State;
  write: () => Promise<void>;
  read: () => Promise<State>;
  equals?: (left: State, right: State) => boolean;
}>;

export async function executeRecoverableWrite<State>(
  input: RecoverableWriteInput<State>,
): Promise<RecoverableWriteResult> {
  const equals = input.equals ?? isDeepStrictEqual;
  for (const attempts of [1, 2] as const) {
    let writeFailed = false;
    try {
      await input.write();
    } catch {
      writeFailed = true;
    }
    let observed: State;
    try {
      observed = await input.read();
    } catch {
      return { kind: "recovery-required", attempts };
    }
    if (equals(observed, input.candidateAfter)) {
      return { kind: "applied", attempts, recovered: writeFailed };
    }
    if (!equals(observed, input.expectedBefore) || attempts === 2) {
      return { kind: "recovery-required", attempts };
    }
  }
  throw new Error("unreachable recoverable write state");
}
