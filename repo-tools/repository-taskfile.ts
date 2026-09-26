import { isAlias, isMap, isScalar, isSeq, parseDocument, visit, type YAMLMap } from "yaml";

const coreTags = new Set(["map", "seq", "str", "null", "bool", "int", "float"].map(name => `tag:yaml.org,2002:${name}`));

function parseTaskfile(source: string): YAMLMap {
  const document = parseDocument(source, { version: "1.2", schema: "core", strict: true, uniqueKeys: true, merge: false });
  const diagnostics = [...document.errors, ...document.warnings];
  if (diagnostics.length > 0) {
    throw new Error(`YAML が不正です: ${diagnostics.map(error => error.message).join("; ")}`);
  }
  if (document.directives?.yaml.version !== "1.2") {
    throw new Error("YAML 1.2 が必要です");
  }
  if (Object.entries(document.directives.tags).some(([handle, prefix]) => handle !== "!!" || prefix !== "tag:yaml.org,2002:")) {
    throw new Error("独自 YAML tag directive は未対応です");
  }
  visit(document, {
    Node(_, node) {
      if (isAlias(node)) throw new Error("YAML alias は未対応です");
      if (node.anchor !== undefined) throw new Error("YAML anchor は未対応です");
      if (node.tag !== undefined && !coreTags.has(node.tag)) throw new Error("独自 YAML tag は未対応です");
    },
    Pair(_, pair) {
      if (!isScalar(pair.key) || typeof pair.key.value !== "string") throw new Error("YAML mapping key は string が必要です");
      if (pair.key.value === "<<") throw new Error("YAML merge key は未対応です");
    },
  });
  if (!isMap(document.contents)) throw new Error("YAML root は mapping が必要です");
  return document.contents;
}

function commandString(node: unknown, path: string): string {
  if (!isScalar(node) || typeof node.value !== "string" || node.value.trim().length === 0) {
    throw new Error(`${path} は空でない string が必要です`);
  }
  return node.value;
}

function validateTaskPolicy(root: YAMLMap): readonly string[] {
  const tasks = root.get("tasks", true);
  if (!isMap(tasks)) throw new Error("tasks は mapping が必要です");
  const commands: string[] = [];
  const directCheckCommands: string[] = [];
  for (const { key, value: task } of tasks.items) {
    const name = commandString(key, "task name");
    if (!isMap(task) || task.has("cmd")) {
      throw new Error(`tasks.${name} は mapping 形式が必要です（コマンドは cmds に記載し、省略形は使えません）`);
    }
    if (!task.has("cmds")) continue;
    const cmds = task.get("cmds", true);
    if (!isSeq(cmds)) throw new Error(`tasks.${name}.cmds は sequence が必要です`);
    for (const [index, item] of cmds.items.entries()) {
      const path = `tasks.${name}.cmds[${index}]`;
      if (isScalar(item)) {
        const command = commandString(item, path);
        commands.push(command);
        if (name === "check") directCheckCommands.push(command.trim());
      } else if (isMap(item) && item.has("cmd") !== item.has("task") && !item.has("defer")) {
        const field = item.has("cmd") ? "cmd" : "task";
        const value = commandString(item.get(field, true), `${path}.${field}`);
        if (field === "cmd") commands.push(value);
      } else {
        throw new Error(`${path} は string / cmd object / task object のいずれかが必要です`);
      }
    }
  }

  const requiredNpmRoutes = ["npm ci --ignore-scripts", "npm audit --audit-level=high"];
  const normalizedCommands = new Set(commands.map(command => command.trim()));
  const missingNpmRoutes = requiredNpmRoutes.filter(route => !normalizedCommands.has(route));
  if (missingNpmRoutes.length > 0) throw new Error(`npm 公開入口が不足しています: ${missingNpmRoutes.join(", ")}`);

  const requiredSkillRoutes = ["skills:links", "skills:verify", "skills:check", "skills:update", "skills:repin", "skills:adopt-local", "skills:migrate"];
  const missingSkillRoutes = requiredSkillRoutes.filter(route => !tasks.has(route));
  if (missingSkillRoutes.length > 0) throw new Error(`skill updater routesが不足しています: ${missingSkillRoutes.join(", ")}`);

  if (!tasks.has("check")) throw new Error("task check が必要です");
  for (const route of ["node repo-tools/entrypoint.mjs skills:verify", "node --test repo-tools/*.test.ts"]) {
    if (!directCheckCommands.includes(route)) throw new Error(`task check に ${route} の直接 string が必要です`);
  }
  return commands;
}

export function validateRepositoryTaskfile(source: string): readonly string[] {
  return validateTaskPolicy(parseTaskfile(source));
}
