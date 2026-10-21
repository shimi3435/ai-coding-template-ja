/** Python state scanner が既存の canonical YAML 契約と J lexer を使う read-only bridge。 */
import { readFileSync } from "node:fs";
import { isMap, isScalar, isSeq } from "yaml";
import { inspectRepositoryTaskfile } from "./repository-taskfile.ts";
import { inspectJavaScriptFiles } from "./template-prune-js.ts";

import { workflowDocument } from "./template-prune-yaml.ts";

type Input = { taskfile: string; workflows: Record<string,string>; javascript: Record<string,string> };
const input = JSON.parse(readFileSync(0, "utf8")) as Input;
const output: Record<string,unknown> = { workflows: {}, javascript: {}, errors: [] };
const errors = output.errors as {path:string; reason:string}[];
try {
  const { root } = inspectRepositoryTaskfile(input.taskfile);
  const tasks = root.get("tasks",true);
  if (!isMap(tasks)) throw new Error("tasks mapping が必要です");
  const pair = tasks.items.find(p=>isScalar(p.key) && p.key.value === "check:template");
  let edit: [number,number] | null = null;
  if (pair && isScalar(pair.key) && isMap(pair.value) && pair.key.range && pair.value.range) {
    let start=pair.key.range[0], end=pair.value.range[2];
    if (!tasks.flow) start=input.taskfile.lastIndexOf("\n",start-1)+1;
    else {
      const suffix=input.taskfile.slice(end).match(/^\s*,/);
      if (suffix) end+=suffix[0].length;
      else {
        const prefix=input.taskfile.slice(0,start).match(/,\s*$/);
        if (prefix) start-=prefix[0].length;
      }
    }
    const edited=input.taskfile.slice(0,start)+input.taskfile.slice(end);
    inspectRepositoryTaskfile(edited);
    edit=[start,end];
  }
  const entries: {task:string;kind:string;value:string;line:number;field_path:(string|number)[]}[]=[];
  for (const {key,value} of tasks.items) {
    if (!isScalar(key) || !isMap(value)) continue;
    const cmds=value.get("cmds",true);
    if (!isSeq(cmds)) continue;
    for (const [index,entry] of cmds.items.entries()) {
      const kind=isMap(entry) && entry.has("task") ? "task" : "shell";
      const node=isMap(entry) ? entry.get(kind === "task" ? "task" : "cmd",true) : entry;
      if (isScalar(node) && typeof node.value === "string") entries.push({task:String(key.value),kind,value:node.value,field_path:["tasks",String(key.value),"cmds",index,...(isMap(entry)?[kind === "task"?"task":"cmd"]:[])],line:input.taskfile.slice(0,node.range?.[0]??0).split(/\r\n|\r|\n/).length});
    }
  }
  output.taskfile={data:root.toJSON(),edit,entries};
} catch (error) { errors.push({path:"Taskfile.yml",reason:String(error)}); }
for (const [path,source] of Object.entries(input.workflows)) {
  try {
    (output.workflows as Record<string,unknown>)[path]=workflowDocument(source,path);
  } catch (error) { errors.push({path,reason:String(error)}); }
}
const javascript = inspectJavaScriptFiles(input.javascript);
output.javascript = javascript.javascript;
errors.push(...javascript.errors);
process.stdout.write(JSON.stringify(output));
