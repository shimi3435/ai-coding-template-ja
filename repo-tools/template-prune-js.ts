/** J の列挙構文を既存 TypeScript AST で検査する。入力の実行・emit・実 FS 参照は行わない。 */
import { spawnSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { posix } from "node:path";
import { API } from "typescript/unstable/sync";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import {
  isArrayLiteralExpression, isCallExpression, isExportDeclaration, isIdentifier,
  isImportDeclaration, isNamedImports, isNamespaceImport, isParenthesizedExpression,
  isPropertyAccessExpression, isStringLiteralLikeNode, SyntaxKind,
  type Node, type SourceFile,
} from "typescript/unstable/ast";

export type ReferenceEvent = { kind: "path" | "import" | "shell" | "argv"; value: string | (string | null)[]; line: number };

function inspectSourceFile(source: SourceFile): ReferenceEvent[] {
  const aliases = new Map<string, string>();
  const events: ReferenceEvent[] = [];
  const add = (kind: ReferenceEvent["kind"], value: ReferenceEvent["value"] | undefined, node: Node): void => {
    if (value !== undefined) events.push({ kind, value, line: source.text.slice(0, node.getStart(source)).split("\n").length });
  };
  for (const node of source.statements) {
    if (!(isImportDeclaration(node) || isExportDeclaration(node)) || !node.moduleSpecifier || !isStringLiteralLikeNode(node.moduleSpecifier)) continue;
    add("import", node.moduleSpecifier.text, node);
    if (!isImportDeclaration(node)) continue;
    const base = node.moduleSpecifier.text.replace(/^node:/, "");
    if (!["fs", "fs/promises", "child_process", "path"].includes(base)) continue;
    const clause = node.importClause;
    if (clause?.name) aliases.set(clause.name.text, base);
    const bindings = clause?.namedBindings;
    if (bindings && isNamespaceImport(bindings)) aliases.set(bindings.name.text, base);
    if (bindings && isNamedImports(bindings)) for (const item of bindings.elements) {
      const imported = (item.propertyName ?? item.name).text;
      aliases.set(item.name.text, imported === "default" ? base : `${base}.${imported}`);
    }
  }
  function name(node: Node): string {
    if (isIdentifier(node)) return aliases.get(node.text) ?? node.text;
    if (isPropertyAccessExpression(node)) return name(node.expression) + "." + node.name.text;
    if (node.kind === SyntaxKind.ImportKeyword) return "import";
    return "";
  }
  function path(node: Node | undefined): string | undefined {
    if (!node) return;
    if (isStringLiteralLikeNode(node)) return node.text;
    if (isParenthesizedExpression(node)) return path(node.expression);
    if (isIdentifier(node) && ["ROOT", "REPO_ROOT", "repositoryRoot"].includes(node.text)) return ".";
    if (!isCallExpression(node)) return;
    const callee = name(node.expression);
    if (!["path.join", "path.resolve"].includes(callee)) return;
    const values = node.arguments.map(path);
    if (!values.length || values.some(v => v === undefined)) return;
    const parts = values as string[];
    const start = callee === "path.resolve" ? Math.max(0, parts.findLastIndex(v => posix.isAbsolute(v))) : 0;
    return posix.join(...parts.slice(start));
  }
  function visit(node: Node): void {
    if (isCallExpression(node)) {
      const callee = name(node.expression);
      const first = node.arguments[0];
      if (["require", "import"].includes(callee) && first && isStringLiteralLikeNode(first)) add("import", first.text, node);
      if (/^(fs|fs\/promises)\.(readFile|readFileSync|createReadStream)$/.test(callee)) add("path", path(first), node);
      if (/^child_process\.(exec|execSync)$/.test(callee) && first && isStringLiteralLikeNode(first)) add("shell", first.text, node);
      if (/^child_process\.(spawn|spawnSync|execFile|execFileSync)$/.test(callee) && first && isStringLiteralLikeNode(first)) {
        const args = node.arguments[1];
        if (args && isArrayLiteralExpression(args)) add("argv", [first.text, ...args.elements.map(n => isStringLiteralLikeNode(n) ? n.text : null)], node);
      }
    }
    node.forEachChild(visit);
  }
  visit(source);
  return events;
}

export function inspectJavaScriptFiles(sources: Record<string, string>): {
  javascript: Record<string, ReferenceEvent[]>; errors: {path:string;reason:string}[];
} {
  const output = { javascript: {} as Record<string, ReferenceEvent[]>, errors: [] as {path:string;reason:string}[] };
  const names = Object.keys(sources).sort();
  if (!names.length) return output;
  const root = "/template-prune-virtual";
  const config = `${root}/tsconfig.json`;
  const files: Record<string, string> = {};
  for (const filename of names) files[`${root}/${filename}`] = sources[filename];
  files[config] = JSON.stringify({ compilerOptions: { noEmit: true, noLib: true, noResolve: true, allowJs: true, types: [] }, files: names });
  const fs = createVirtualFileSystem(files);
  fs.readFile = path => Object.hasOwn(files, path) ? files[path] : null;
  const entries = fs.getAccessibleEntries!;
  // 未登録 directory の undefined は実 FS fallback になるため、明示的に空を返す。
  fs.getAccessibleEntries = path => entries(path) ?? { files: [], directories: [] };
  const api = new API({ cwd: root, fs });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] });
    try {
      const program = snapshot.getProject(config)?.program;
      if (!program) throw new Error("virtual parser project を取得できない");
      for (const filename of names) {
        try {
          const source = sources[filename];
          const stripped = filename.endsWith(".ts") ? stripTypeScriptTypes(source) : source;
          const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: stripped, encoding: "utf8" });
          if (checked.error || checked.status !== 0) throw new Error(checked.error?.message ?? checked.stderr);
          const file = `${root}/${filename}`;
          const diagnostics = program.getSyntacticDiagnostics(file);
          if (diagnostics.length) throw new Error(JSON.stringify(diagnostics));
          const ast = program.getSourceFile(file);
          if (!ast) throw new Error("source AST を取得できない");
          output.javascript[filename] = inspectSourceFile(ast);
        } catch (error) { output.errors.push({path: filename, reason: String(error)}); }
      }
    } finally { snapshot.dispose(); }
  } finally { api.close(); }
  return output;
}
