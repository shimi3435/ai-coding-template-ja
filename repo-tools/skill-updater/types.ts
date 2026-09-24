export type Redistribution = "allowed" | "blocked";
export type Verification = "verified" | "unverified" | "unknown";
export type SourceRef = Readonly<{ branch: string } | { commit: string } | { tag: string }>;
export type SubtreeSelector = Readonly<{ root: true } | { path: string }>;
export type RemoteLegalMapping = Readonly<{ sourcePath: string; targetPath: string; expectedSha256: string }>;
export type RemoteLegalFile = Readonly<{ sourcePath: string; targetPath: string; sha256: string }>;
export type LocalLegalMapping = Readonly<{ path: string; expectedSha256: string }>;
export type LegacyRef = Readonly<{ semver: string; selectedTag: string; selectedVersion: string }>;
export type Origin = Readonly<{
  repository: string; subtree: SubtreeSelector; ref: SourceRef; resolvedCommit: string;
  legalMappings: readonly RemoteLegalMapping[]; tagObjectSha?: string; legacyRef?: LegacyRef;
}>;
type Common = Readonly<{ name: string; license: string }>;
export type RemoteSource = Common & Readonly<{
  ownership: "remote"; redistribution: "allowed"; target: string; repository: string;
  ref: SourceRef; subtree: SubtreeSelector; legalMappings: readonly RemoteLegalMapping[]; legacyRef?: LegacyRef;
}>;
export type LocalSource = Common & Readonly<{
  ownership: "local"; redistribution: "allowed"; target: string;
  legalMappings: readonly LocalLegalMapping[]; origin?: Origin;
}>;
export type PluginSource = Common & Readonly<{
  ownership: "plugin"; redistribution: Redistribution; manager: string;
}>;
export type SkillSource = RemoteSource | LocalSource | PluginSource;
export type SourcesDocument = Readonly<{ schemaVersion: 2; skills: readonly SkillSource[] }>;
export type RemoteLock = Omit<RemoteSource, "legalMappings"> & Readonly<{
  resolvedCommit: string; verification: Verification; tagObjectSha?: string;
  treeHash: string; fileCount: number; byteCount: number; legalFiles: readonly RemoteLegalFile[];
}>;
export type LockDocument = Readonly<{ schemaVersion: 2; skills: readonly RemoteLock[] }>;
