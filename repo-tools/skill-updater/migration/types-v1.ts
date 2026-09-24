export type Redistribution = "allowed" | "blocked";
export type Verification = "verified" | "unverified" | "unknown";

export type BranchRef = Readonly<{ branch: string }>;
export type CommitRef = Readonly<{ commit: string }>;
export type SemverRef = Readonly<{ semver: string }>;
export type SourceRef = BranchRef | CommitRef | SemverRef;

export function sameSourceRef(left: SourceRef, right: SourceRef): boolean {
  if ("branch" in left && "branch" in right) return left.branch === right.branch;
  if ("commit" in left && "commit" in right) return left.commit === right.commit;
  return "semver" in left && "semver" in right && left.semver === right.semver;
}

export function sameSourceRefVariant(left: SourceRef, right: SourceRef): boolean {
  return ("branch" in left && "branch" in right) ||
    ("commit" in left && "commit" in right) ||
    ("semver" in left && "semver" in right);
}

export type RootSubtree = Readonly<{ root: true }>;
export type PathSubtree = Readonly<{ path: string }>;
export type SubtreeSelector = RootSubtree | PathSubtree;

export type RemoteLegalMapping = Readonly<{
  sourcePath: string;
  targetPath: string;
  expectedSha256: string;
}>;

export type LocalLegalMapping = Readonly<{
  sourcePath: string;
  expectedSha256: string;
}>;

type CommonSource = Readonly<{
  name: string;
  license: string;
  redistribution: Redistribution;
}>;

export type RemoteSource = CommonSource & Readonly<{
  ownership: "remote";
  target: string;
  repository: string;
  ref: SourceRef;
  subtree: SubtreeSelector;
  legalMappings: readonly RemoteLegalMapping[];
}>;

export type LocalSource = CommonSource & Readonly<{
  ownership: "local";
  target: string;
  legalMappings: readonly LocalLegalMapping[];
}>;

export type PluginSource = CommonSource & Readonly<{
  ownership: "plugin";
  manager: string;
}>;

export type SkillSource = RemoteSource | LocalSource | PluginSource;
export type SourcesDocument = Readonly<{ schemaVersion: 1; skills: readonly SkillSource[] }>;

export type RemoteLegalFile = Readonly<{
  sourcePath: string;
  targetPath: string;
  sha256: string;
}>;

export type LocalLegalFile = Readonly<{
  sourcePath: string;
  sha256: string;
}>;

type CommonLock = Readonly<{
  name: string;
  license: string;
  redistribution: Redistribution;
}>;

type InstalledLock = CommonLock & Readonly<{
  target: string;
  treeHash: string;
  fileCount: number;
  byteCount: number;
}>;

export type RemoteLock = InstalledLock & Readonly<{
  ownership: "remote";
  repository: string;
  ref: SourceRef;
  resolvedCommit: string;
  verification: Verification;
  selectedTag?: string;
  selectedVersion?: string;
  legalFiles: readonly RemoteLegalFile[];
}>;

export type LocalLock = InstalledLock & Readonly<{
  ownership: "local";
  legalFiles: readonly LocalLegalFile[];
}>;

export type PluginLock = CommonLock & Readonly<{
  ownership: "plugin";
  manager: string;
}>;

export type SkillLock = RemoteLock | LocalLock | PluginLock;
export type LockDocument = Readonly<{ schemaVersion: 1; skills: readonly SkillLock[] }>;
