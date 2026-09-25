import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync, readFileSync, readlinkSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

export const managedRoots = [".agents/skills", ".claude/skills", ".codex/skills"] as const;
export type IsolationInput = Readonly<{ source: string; base: string; candidate: string }>;
export type IsolatedCandidate = IsolationInput & Readonly<{ fingerprint: string }>;
const forbiddenGitEnv = /^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG(?:_.*)?|NAMESPACE|SHALLOW_FILE|REPLACE_REF_BASE)$/;
export function readonlyGit(root: string, args: readonly string[]): Buffer {
  if (Object.keys(process.env).some(k => forbiddenGitEnv.test(k))) throw new Error("Git環境変数による差替えを拒否しました");
  const result = spawnSync("git", ["--no-replace-objects", "-c", "core.fsmonitor=false", "-c", "core.filemode=true", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, maxBuffer: 64 * 1_048_576,
    timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new Error(`Git読取り失敗: ${args[0]}`);
  return result.stdout;
}
function gitText(root: string, args: readonly string[]): string { return readonlyGit(root,args).toString("utf8").trim(); }
function within(parent: string, child: string): boolean {
  const p=relative(parent,child); return p==="" || (!p.startsWith(`..${sep}`) && p!==".." && !p.startsWith(sep));
}
export function assertSafeParents(root: string, path: string): void {
  const relativePath=relative(root,path);
  if (!within(root,path)) throw new Error("repository外pathです");
  let current=root;
  for (const part of relativePath.split(sep).slice(0,-1)) {
    current=join(current,part);
    const stat=lstatSync(current,{throwIfNoEntry:false});
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`親pathがdirectoryではありません: ${relative(root,current)}`);
  }
}
function rootIdentity(path: string): string {
  const stat=lstatSync(path); return `${stat.dev}:${stat.ino}`;
}
function repositoryRoot(input: string): Readonly<{root:string;git:string}> {
  const root=realpathSync(input);
  if (gitText(root,["rev-parse","--is-bare-repository"])!=="false" || realpathSync(gitText(root,["rev-parse","--show-toplevel"]))!==root) throw new Error("repository rootが必要です");
  const metadata=join(root,".git"); const stat=lstatSync(metadata);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("独立cloneが必要です（linked worktree不可）");
  const git=realpathSync(gitText(root,["rev-parse","--path-format=absolute","--git-common-dir"]));
  if (git!==realpathSync(metadata)) throw new Error("Git common directory共有を拒否しました");
  for (const name of ["alternates","http-alternates"]) if (lstatSync(join(git,"objects/info",name),{throwIfNoEntry:false})) throw new Error("Git alternatesを拒否しました");
  return {root,git};
}
function treeFingerprint(root: string, path: string, allowLinks: boolean, rejectHardlinks: boolean): string {
  const hash=createHash("sha256");
  const walk=(current:string):void=>{
    const stat=lstatSync(current,{throwIfNoEntry:false});
    hash.update(JSON.stringify([relative(root,current),stat?.mode,stat?.dev,stat?.ino]));
    if (!stat) return;
    if (stat.isSymbolicLink()) {
      if (!allowLinks || relative(path,current).split(sep).length!==1 || current===path) throw new Error("symlink経由の逸脱を拒否しました");
      hash.update(readlinkSync(current)); return;
    }
    if (stat.isDirectory()) for (const name of readdirSync(current).sort()) walk(join(current,name));
    else {
      if (!stat.isFile() || (rejectHardlinks && stat.nlink!==1)) throw new Error("special file / hardlink共有を拒否しました");
      hash.update(readFileSync(current));
    }
  };
  walk(path); return hash.digest("hex");
}
export function preflightIsolation(input: IsolationInput): IsolatedCandidate {
  if (!/^[0-9a-f]{40}$/.test(input.base)) throw new Error("完全な開始commit SHAが必要です");
  const source=repositoryRoot(input.source); const candidate=repositoryRoot(input.candidate);
  if (within(source.root,candidate.root) || within(candidate.root,source.root) || source.git===candidate.git) throw new Error("source / candidateの共有・包含を拒否しました");
  if (gitText(source.root,["rev-parse",`${input.base}^{commit}`])!==input.base || gitText(candidate.root,["rev-parse","HEAD"])!==input.base) throw new Error("base / candidate HEAD不一致");
  if (readonlyGit(candidate.root,["ls-files","-v","-z"]).toString("utf8").split("\0").some(entry=>/^[a-zS]/.test(entry))) throw new Error("candidate indexのassume-unchanged / skip-worktreeを拒否しました");
  if (readonlyGit(candidate.root,["status","--porcelain=v1","-z","--untracked-files=no"]).length) throw new Error("dirty candidateを拒否しました");
  if (readonlyGit(candidate.root,["ls-files","--others","-z","--",...managedRoots]).length) throw new Error("管理pathのuntracked / ignored衝突を拒否しました");
  const parts=[source.root,candidate.root,rootIdentity(source.root),rootIdentity(candidate.root)];
  parts.push(treeFingerprint(source.root,source.git,false,false));
  parts.push(treeFingerprint(candidate.root,candidate.git,false,true));
  for (const p of managedRoots) {
    const target=resolve(candidate.root,p); assertSafeParents(candidate.root,join(target,"placeholder"));
    parts.push(treeFingerprint(candidate.root,target,p!==".agents/skills",true));
  }
  return {source:source.root,candidate:candidate.root,base:input.base,fingerprint:createHash("sha256").update(JSON.stringify(parts)).digest("hex")};
}
export function recheckIsolation(candidate: IsolatedCandidate): void {
  if (preflightIsolation(candidate).fingerprint!==candidate.fingerprint) throw new Error("書込み前に隔離入力が変化しました");
}
