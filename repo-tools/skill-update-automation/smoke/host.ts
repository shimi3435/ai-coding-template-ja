import type { ResourceState, SmokePreview, SmokeResource, SmokeTarget } from "../model/index.ts";

export type SmokeRepository = Readonly<{
  id: string;
  fullName: string;
  defaultBranchRef: string;
}>;

export type SmokeWorkflowRun = Readonly<{
  id: string;
  attempt: number;
  repositoryId: string;
  repository: string;
  headSha: string;
}>;

export type SmokeCommitComparison = Readonly<{
  status: "ahead" | "behind" | "identical" | "diverged";
  aheadBy: number;
  behindBy: number;
}>;

export type SmokeResourceObservation = Readonly<{
  state: ResourceState;
  number?: number;
}>;

export interface SmokeHost {
  readRepository(): Promise<SmokeRepository>;
  readWorkflowRun(runId: string): Promise<SmokeWorkflowRun | null>;
  readCommitParent(sha: string): Promise<string | null>;
  readCommitComparison(baseSha: string, headSha: string): Promise<SmokeCommitComparison>;
  readResource(resource: SmokeResource, bindings: ReadonlyMap<string, number>): Promise<SmokeResourceObservation>;
  applyTarget(
    target: SmokeTarget,
    bindings: ReadonlyMap<string, number>,
    preview: SmokePreview,
  ): Promise<SmokeResourceObservation>;
}
