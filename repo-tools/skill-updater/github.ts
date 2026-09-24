import type { RemoteSource as V2RemoteSource, RemoteLock as V2RemoteLock, SourceRef as V2Ref } from "./types.ts";
import { validateInstalledTraversalPath, validateInstalledFilePaths } from "./installed-path.ts";
import { spawn } from "node:child_process";
import { gitBlobSha1, validateGitObjectSha } from "./git-object.ts";
import { addRemoteLegalFiles, resourceLimits, sha256 } from "./legal.ts";
import { parseSkillMetadata, type SkillMetadata } from "./metadata.ts";
import { validateCanonicalPath, type CanonicalTree, type TreeFile } from "./canonical.ts";
import type {
  RemoteLegalFile,
  RemoteLock,
  RemoteSource,
  SourceRef,
  Verification,
} from "./types.ts";

export type GhRunnerResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;
export type GhRunner = (args: readonly string[]) => Promise<GhRunnerResult>;

export type RemoteEntryObservation = Readonly<{
  name: string;
  metadata: SkillMetadata;
  tree: CanonicalTree;
  legalFiles: readonly RemoteLegalFile[];
}>;

const commitPattern = /^[0-9a-f]{40}$/;

export function redactCredentialText(text: string): string {
  return text
    .replace(/\b(?:gh[oprsu]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/g, "[REDACTED]")
    .replace(/(Authorization\s*:\s*(?:Bearer|token)?\s*)\S+/gi, "$1[REDACTED]");
}

export function createGhRunner(timeoutMilliseconds = 60_000): GhRunner {
  return async (args) => new Promise<GhRunnerResult>((resolve, reject) => {
    const child = spawn("gh", [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const maximumOutputBytes = 64 * 1_048_576;
    let settled = false;
    const finishError = (error: Error): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finishError(new Error(`gh api timeout (${timeoutMilliseconds}ms)`));
    }, timeoutMilliseconds);
    const collect = (chunks: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.length;
      if (outputBytes > maximumOutputBytes) {
        child.kill("SIGTERM");
        finishError(new Error("gh api outputが64 MiBを超えています"));
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.on("error", (error) => finishError(error));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      }
    });
  });
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} responseはobjectが必要です`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} response stringが不正です`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} response integerが不正です`);
  }
  return value;
}

async function apiJson(runner: GhRunner, endpoint: string, paginate = false): Promise<unknown> {
  const args = paginate
    ? ["api", "--method", "GET", "--paginate", "--slurp", endpoint]
    : ["api", "--method", "GET", endpoint];
  let result: GhRunnerResult;
  try {
    result = await runner(args);
  } catch (error: unknown) {
    throw new Error(`gh api失敗: ${redactCredentialText(error instanceof Error ? error.message : String(error))}`);
  }
  if (result.exitCode !== 0) {
    const detail = redactCredentialText(result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`);
    throw new Error(`gh api失敗 (${endpoint}): ${detail}`);
  }
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch (error: unknown) {
    throw new Error(`gh api JSON不正 (${endpoint}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

function verificationState(value: unknown, resolvedCommit: string): Verification {
  const commitResponse = object(value, "commit");
  if (string(commitResponse.sha, "commit.sha") !== resolvedCommit) {
    throw new Error("commit response SHAがresolved commitと一致しません");
  }
  const commitData = object(commitResponse.commit, "commit.commit");
  const verification = object(commitData.verification, "commit.verification");
  if (verification.verified === true) return "verified";
  if (verification.verified === false) return "unverified";
  return "unknown";
}

type GitTreeEntry = Readonly<{ path: string; mode: string; type: string; sha: string; size?: number }>;

function parseTree(value: unknown): readonly GitTreeEntry[] {
  const response = object(value, "tree");
  if (response.truncated !== false) throw new Error("GitHub treeがtruncatedでcompleteではありません");
  if (!Array.isArray(response.tree)) throw new Error("GitHub tree entriesがarrayではありません");
  return response.tree.map((item, index) => {
    const entry = object(item, `tree[${index}]`);
    return {
      path: string(entry.path, `tree[${index}].path`),
      mode: string(entry.mode, `tree[${index}].mode`),
      type: string(entry.type, `tree[${index}].type`),
      sha: validateGitObjectSha(string(entry.sha, `tree[${index}].sha`), `tree[${index}].sha`),
      ...(entry.size === undefined ? {} : { size: integer(entry.size, `tree[${index}].size`) }),
    };
  });
}

function decodeBase64File(value: unknown, label: string, expectedSha: string): Buffer {
  const response = object(value, label);
  const responseSha = validateGitObjectSha(string(response.sha, `${label}.sha`), `${label}.sha`);
  if (responseSha !== expectedSha) throw new Error(`${label} response SHAがrequested tree SHAと一致しません`);
  if (response.encoding !== "base64") throw new Error(`${label} encodingはbase64が必要です`);
  if (typeof response.content !== "string") throw new Error(`${label}.content response stringが不正です`);
  const encoded = response.content.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error(`${label} base64が不正です`);
  const content = Buffer.from(encoded, "base64");
  if (content.toString("base64") !== encoded) throw new Error(`${label} base64がcanonicalではありません`);
  if (content.length !== integer(response.size, `${label}.size`)) {
    throw new Error(`${label} sizeが実bytesと一致しません`);
  }
  if (gitBlobSha1(content) !== expectedSha) throw new Error(`${label} bytesのGit object SHAがtree SHAと一致しません`);
  return content;
}

async function readBlob(runner: GhRunner, repository: string, sha: string, expectedSize: number): Promise<Buffer> {
  validateGitObjectSha(sha, "requested blob SHA");
  const content = decodeBase64File(await apiJson(runner, `repos/${repository}/git/blobs/${sha}`), "blob", sha);
  if (content.length !== expectedSize) throw new Error("tree / blob sizeが一致しません");
  return content;
}

type PreparedSourceTree = Readonly<{
  source: V2RemoteSource;
  files: readonly Readonly<{ entry: GitTreeEntry; relativePath: string }>[];
  legalEntries: ReadonlyMap<string, GitTreeEntry>;
}>;

function prepareRemoteTrees(
  sources: readonly (V2RemoteSource)[],
  treeEntries: readonly GitTreeEntry[],
): readonly PreparedSourceTree[] {
  const treeByPath = new Map<string, GitTreeEntry>();
  for (const entry of treeEntries) {
    validateCanonicalPath(entry.path);
    if (treeByPath.has(entry.path)) throw new Error(`GitHub tree path重複: ${entry.path}`);
    treeByPath.set(entry.path, entry);
  }
  const cohortFiles = new Map<string, number>();
  const addCohortFile = (entry: GitTreeEntry): void => {
    if (entry.size === undefined) throw new Error(`blob sizeがありません: ${entry.path}`);
    if (entry.size > resourceLimits.singleFileBytes) throw new Error(`単一file上限超過: ${entry.path}`);
    if (cohortFiles.has(entry.path)) return;
    cohortFiles.set(entry.path, entry.size);
    if (cohortFiles.size > resourceLimits.cohortFiles) {
      throw new Error(`cohort unique filesが${resourceLimits.cohortFiles}件を超えています`);
    }
    const bytes = [...cohortFiles.values()].reduce((total, size) => total + size, 0);
    if (!Number.isSafeInteger(bytes) || bytes > resourceLimits.cohortBytes) {
      throw new Error(`cohort bytesが${resourceLimits.cohortBytes}を超えています`);
    }
  };

  return sources.map((source) => {
    const prefix = "path" in source.subtree ? `${source.subtree.path}/` : "";
    const selected = "root" in source.subtree
      ? treeEntries
      : treeEntries.filter((entry) => entry.path.startsWith(prefix));
    if (selected.length > resourceLimits.filesystemEntries) throw new Error("filesystem entry上限超過");
    const files: Array<{ entry: GitTreeEntry; relativePath: string }> = [];
    const targetEntries = new Map<string, GitTreeEntry>();
    const targetSizes = new Map<string, number>();
    const validateTargetLimits = (): void => {
      if (targetSizes.size > resourceLimits.skillFiles) {
        throw new Error(`skill file数が${resourceLimits.skillFiles}件を超えています`);
      }
      const skillBytes = [...targetSizes.values()].reduce((total, size) => total + size, 0);
      if (!Number.isSafeInteger(skillBytes) || skillBytes > resourceLimits.skillBytes) {
        throw new Error(`skill bytesが${resourceLimits.skillBytes}を超えています`);
      }
    };
    for (const entry of selected) {
      const relativePath = entry.path.slice(prefix.length);
      validateInstalledTraversalPath(relativePath);
      const depth = relativePath.split("/").length - (entry.type === "tree" ? 0 : 1);
      if (depth > resourceLimits.directoryDepth) throw new Error("directory depth上限超過");
      if (entry.type === "tree" && entry.mode === "040000") continue;
      if (entry.type !== "blob" || (entry.mode !== "100644" && entry.mode !== "100755")) {
        throw new Error(`special fileは取得できません: ${entry.path} (${entry.mode}/${entry.type})`);
      }
      validateCanonicalPath(relativePath);
      if (entry.size === undefined) throw new Error(`blob sizeがありません: ${entry.path}`);
      addCohortFile(entry);
      files.push({ entry, relativePath });
      targetSizes.set(relativePath, entry.size);
      targetEntries.set(relativePath, entry);
      validateTargetLimits();
    }
    const subtreeLabel = "root" in source.subtree ? "repository root" : source.subtree.path;
    if (files.length === 0) throw new Error(`empty subtreeです: ${subtreeLabel}`);
    if (!files.some(file => file.relativePath === "SKILL.md")) {
      throw new Error(`root SKILL.mdはexactly one必要です: ${source.name}`);
    }
    const legalEntries = new Map<string, GitTreeEntry>();
    for (const mapping of source.legalMappings) {
      const entry = treeByPath.get(mapping.sourcePath);
      if (entry === undefined) throw new Error(`legal sourceがGitHub treeにありません: ${mapping.sourcePath}`);
      if (entry.type !== "blob" || (entry.mode !== "100644" && entry.mode !== "100755")) {
        throw new Error(`legal sourceはregular fileが必要です: ${mapping.sourcePath}`);
      }
      if (entry.size === undefined) throw new Error(`blob sizeがありません: ${entry.path}`);
      addCohortFile(entry);
      legalEntries.set(mapping.sourcePath, entry);
      validateInstalledTraversalPath(mapping.targetPath);
      const existingSize = targetSizes.get(mapping.targetPath);
      const existing = targetEntries.get(mapping.targetPath);
      if (existingSize !== undefined && (existingSize !== entry.size || existing?.sha !== entry.sha)) {
        throw new Error(`legal target collision: ${mapping.targetPath}`);
      }
      targetSizes.set(mapping.targetPath, entry.size);
      targetEntries.set(mapping.targetPath, entry);
      validateTargetLimits();
    }
    validateInstalledFilePaths([...targetSizes.keys()], selected.map(entry => entry.path.slice(prefix.length)));
    return Object.freeze({ source, files: Object.freeze(files), legalEntries });
  });
}

async function fetchPreparedSources(preparedSources: readonly PreparedSourceTree[], repository: string, runner: GhRunner): Promise<RemoteEntryObservation[]> {
  const sourceContent = new Map<string, Buffer>();
  const entries: RemoteEntryObservation[] = [];
  for (const prepared of preparedSources) {
    const source = prepared.source;
    const files: TreeFile[] = [];
    for (const { entry, relativePath } of prepared.files) {
      let content = sourceContent.get(entry.path);
      if (content === undefined) {
        content = await readBlob(runner, repository, entry.sha, entry.size!);
        sourceContent.set(entry.path, content);
      }
      files.push({ path: relativePath, executable: entry.mode === "100755", content });
    }
    const subtreeLabel = "root" in source.subtree ? "repository root" : source.subtree.path;
    if (files.length === 0) throw new Error(`empty subtreeです: ${subtreeLabel}`);
    const skillFiles = files.filter((file) => file.path === "SKILL.md");
    if (skillFiles.length !== 1) throw new Error(`root SKILL.mdはexactly one必要です: ${source.name}`);
    const metadata = parseSkillMetadata(skillFiles[0]!.content, source.name);
    const legalBlobs = [];
    for (const mapping of source.legalMappings) {
      let content = sourceContent.get(mapping.sourcePath);
      if (content === undefined) {
        const legalEntry = prepared.legalEntries.get(mapping.sourcePath)!;
        content = await readBlob(runner, repository, legalEntry.sha, legalEntry.size!);
        sourceContent.set(mapping.sourcePath, content);
      }
      legalBlobs.push({ ...mapping, content });
    }
    const candidate = addRemoteLegalFiles(files, legalBlobs);
    entries.push({ name: source.name, metadata, tree: candidate.tree, legalFiles: candidate.legalFiles });
  }

  return entries;
}

export type RemoteCohortObservation = Readonly<{
  repository:string; ref:V2Ref; resolvedCommit:string; tagObjectSha?:string;
  verification:Verification; warnings:readonly string[]; entries:readonly RemoteEntryObservation[];
}>;
export type RepinApproval = Readonly<{commit:string;tagObjectSha?:string}>;
async function resolveV2Ref(repository:string, ref:V2Ref, runner:GhRunner):Promise<{commit:string;tagObjectSha?:string}> {
  if ("commit" in ref) return {commit:validateGitObjectSha(ref.commit,"commit")};
  const kind="branch" in ref ? "heads" : "tags";
  const name="branch" in ref ? ref.branch : ref.tag;
  const response=object(await apiJson(runner,`repos/${repository}/git/ref/${kind}/${encodeURIComponent(name)}`),"ref");
  let target=object(response.object,"ref.object");
  const direct=validateGitObjectSha(string(target.sha,"ref.sha"),"ref.sha");
  if ("branch" in ref) {
    if(target.type!=="commit") throw new Error("branch refはcommitが必要です");
    return {commit:direct};
  }
  const seen=new Set<string>();
  for(let depth=0;depth<32;depth++) {
    const sha=validateGitObjectSha(string(target.sha,"tag.sha"),"tag.sha");
    if(target.type==="commit") return {commit:sha,tagObjectSha:direct};
    if(target.type!=="tag" || seen.has(sha)) throw new Error("tag循環 / object type不正");
    seen.add(sha);
    const tag=object(await apiJson(runner,`repos/${repository}/git/tags/${sha}`),"tag");
    if(tag.sha!==sha) throw new Error("tag object SHA不一致");
    target=object(tag.object,"tag.object");
  }
  throw new Error("tag連鎖32段以内にcommitへ到達しません");
}
export async function observeRemoteCohort(sources:readonly V2RemoteSource[],locks:readonly V2RemoteLock[],runner:GhRunner,approval?:RepinApproval):Promise<RemoteCohortObservation> {
  const first=sources[0]; if(!first) throw new Error("空cohort");
  if(sources.some(s=>s.repository!==first.repository || JSON.stringify(s.ref)!==JSON.stringify(first.ref))) throw new Error("cohortのrepository / ref不一致");
  const info=object(await apiJson(runner,`repos/${first.repository}`),"repository");
  if(info.private!==false || info.visibility!=="public") throw new Error("public repositoryだけ取得できます");
  const resolved=await resolveV2Ref(first.repository,first.ref,runner);
  if(approval) {
    if(approval.commit!==resolved.commit || approval.tagObjectSha!==resolved.tagObjectSha) throw new Error("repin承認SHA / 観測SHA不一致");
  } else for(const lock of locks) {
    if("tag" in first.ref) {
      if(lock.tagObjectSha!==resolved.tagObjectSha || lock.resolvedCommit!==resolved.commit) throw new Error("locked tag moved/deleted");
    } else if("branch" in first.ref && lock.resolvedCommit!==resolved.commit) {
      const comparison=object(await apiJson(runner,`repos/${first.repository}/compare/${lock.resolvedCommit}...${resolved.commit}`),"compare");
      if(comparison.status!=="ahead" && comparison.status!=="identical") throw new Error("fast-forwardではないhistory rewrite");
    }
  }
  const verification=verificationState(await apiJson(runner,`repos/${first.repository}/commits/${resolved.commit}`),resolved.commit);
  const tree=parseTree(await apiJson(runner,`repos/${first.repository}/git/trees/${resolved.commit}?recursive=1`));
  const prepared=prepareRemoteTrees(sources,tree);
  const entries=await fetchPreparedSources(prepared,first.repository,runner);
  const rechecked=await resolveV2Ref(first.repository,first.ref,runner);
  if(JSON.stringify(rechecked)!==JSON.stringify(resolved)) throw new Error("取得中にrefが変化しました");
  return {repository:first.repository,ref:first.ref,resolvedCommit:resolved.commit,...(resolved.tagObjectSha ? {tagObjectSha:resolved.tagObjectSha}:{}),verification,warnings:verification==="verified"?[]:[`commit verification: ${verification}`],entries};
}
