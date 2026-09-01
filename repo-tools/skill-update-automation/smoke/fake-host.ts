import { createPresentResourceState, type ResourceState, type SmokePreview, type SmokeResource, type SmokeTarget } from "../model/index.ts";
import type {
  SmokeCommitComparison,
  SmokeHost,
  SmokeRepository,
  SmokeResourceObservation,
  SmokeWorkflowRun,
} from "./host.ts";

export class FakeSmokeHost implements SmokeHost {
  readonly writeTranscript: SmokeTarget[] = [];
  readonly #repository: SmokeRepository;
  readonly #workflowRuns: readonly SmokeWorkflowRun[];
  readonly #commitParents: ReadonlyMap<string, string>;
  readonly #commitComparisons: ReadonlyMap<string, SmokeCommitComparison>;
  readonly #defaultBranchSha: string;
  readonly #resources = new Map<string, SmokeResourceObservation>();
  #nextNumber = 1;

  constructor(input: Readonly<{
    repository: SmokeRepository;
    workflowRuns: readonly SmokeWorkflowRun[];
    commitParents?: Readonly<Record<string, string>>;
    commitComparisons?: Readonly<Record<string, SmokeCommitComparison>>;
    defaultBranchSha?: string;
    resources?: readonly Readonly<{ resource: SmokeResource; state: ResourceState; number?: number }>[];
  }>) {
    this.#repository = structuredClone(input.repository);
    this.#workflowRuns = structuredClone(input.workflowRuns);
    this.#commitParents = new Map(Object.entries(input.commitParents ?? {}));
    this.#commitComparisons = new Map(Object.entries(input.commitComparisons ?? {}));
    this.#defaultBranchSha = input.defaultBranchSha ?? "c".repeat(40);
    for (const seed of input.resources ?? []) {
      const observation = { state: structuredClone(seed.state), ...(seed.number === undefined ? {} : { number: seed.number }) };
      this.#resources.set(this.#resourceKey(seed.resource, new Map()), observation);
      if (seed.number !== undefined) {
        this.#resources.set(`${seed.resource.kind}:${seed.number}`, observation);
        this.#nextNumber = Math.max(this.#nextNumber, seed.number + 1);
      }
    }
  }

  async readRepository(): Promise<SmokeRepository> {
    return structuredClone(this.#repository);
  }

  async readWorkflowRun(runId: string): Promise<SmokeWorkflowRun | null> {
    return structuredClone(this.#workflowRuns.find((run) => run.id === runId) ?? null);
  }

  async readCommitParent(sha: string): Promise<string | null> {
    return this.#commitParents.get(sha) ?? "b".repeat(40);
  }

  async readCommitComparison(baseSha: string, headSha: string): Promise<SmokeCommitComparison> {
    return structuredClone(this.#commitComparisons.get(`${baseSha}...${headSha}`) ?? {
      status: "ahead",
      aheadBy: 1,
      behindBy: 0,
    });
  }

  #resourceKey(resource: SmokeResource, bindings: ReadonlyMap<string, number>): string {
    if (resource.kind === "branch") return `branch:${resource.ref}`;
    if (resource.locator.mode === "existing") return `${resource.kind}:${resource.locator.number}`;
    const binding = bindings.get(resource.key);
    return binding === undefined ? `planned:${JSON.stringify(resource)}` : `${resource.kind}:${binding}`;
  }

  async readResource(resource: SmokeResource, bindings: ReadonlyMap<string, number>): Promise<SmokeResourceObservation> {
    const stored = this.#resources.get(this.#resourceKey(resource, bindings));
    if (stored !== undefined) return structuredClone(stored);
    if (resource.kind === "branch" && resource.ref === this.#repository.defaultBranchRef) {
      return { state: createPresentResourceState({
        schemaVersion: 1,
        kind: "branch-state",
        ref: resource.ref,
        sha: this.#defaultBranchSha,
      }) };
    }
    return { state: { state: "absent" } };
  }

  async applyTarget(
    target: SmokeTarget,
    bindings: ReadonlyMap<string, number>,
    _preview: SmokePreview,
  ): Promise<SmokeResourceObservation> {
    this.writeTranscript.push(structuredClone(target));
    let number: number | undefined;
    if (target.operation === "create" && target.resource.kind !== "branch") {
      number = this.#nextNumber;
      this.#nextNumber += 1;
    } else if (target.resource.kind !== "branch") {
      number = target.resource.locator.mode === "existing"
        ? target.resource.locator.number
        : bindings.get(target.resource.key);
    }
    const observation = { state: structuredClone(target.after), ...(number === undefined ? {} : { number }) };
    this.#resources.set(this.#resourceKey(target.resource, bindings), observation);
    if (number !== undefined) this.#resources.set(`${target.resource.kind}:${number}`, observation);
    if (target.resource.kind === "branch" && target.operation === "update" && target.after.state === "present" &&
      target.after.value.kind === "branch-state") {
      for (const [key, current] of this.#resources) {
        if (current.state.state !== "present" || current.state.value.kind !== "pull-request-state" ||
          current.state.value.headRef !== target.resource.ref) continue;
        const updated = { ...current, state: createPresentResourceState({ ...current.state.value, headSha: target.after.value.sha }) };
        this.#resources.set(key, updated);
      }
    }
    return structuredClone(observation);
  }
}
