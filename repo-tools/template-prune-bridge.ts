/** Python state scanner が既存の canonical YAML 契約と J lexer を使う read-only bridge。 */
import { readFileSync } from "node:fs";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { inspectRepositoryTaskfile } from "./repository-taskfile.ts";
import { inspectJavaScriptFiles } from "./template-prune-js.ts";

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
  const entries: {task:string;kind:string;value:string;line:number}[]=[];
  for (const {key,value} of tasks.items) {
    if (!isScalar(key) || !isMap(value)) continue;
    const cmds=value.get("cmds",true);
    if (!isSeq(cmds)) continue;
    for (const entry of cmds.items) {
      const kind=isMap(entry) && entry.has("task") ? "task" : "shell";
      const node=isMap(entry) ? entry.get(kind === "task" ? "task" : "cmd",true) : entry;
      if (isScalar(node) && typeof node.value === "string") entries.push({task:String(key.value),kind,value:node.value,line:input.taskfile.slice(0,node.range?.[0]??0).split(/\r\n|\r|\n/).length});
    }
  }
  output.taskfile={data:root.toJSON(),edit,entries};
} catch (error) { errors.push({path:"Taskfile.yml",reason:String(error)}); }
for (const [path,source] of Object.entries(input.workflows)) {
  try {
    const doc=parseDocument(source,{version:"1.2",schema:"core",strict:true,uniqueKeys:true});
    if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors,...doc.warnings].map(String).join("; "));
    if (!isMap(doc.contents)) throw new Error("workflow root は mapping が必要です");
    (output.workflows as Record<string,unknown>)[path]=doc.toJSON();
  } catch (error) { errors.push({path,reason:String(error)}); }
}
const javascript = inspectJavaScriptFiles(input.javascript);
output.javascript = javascript.javascript;
errors.push(...javascript.errors);
process.stdout.write(JSON.stringify(output));
