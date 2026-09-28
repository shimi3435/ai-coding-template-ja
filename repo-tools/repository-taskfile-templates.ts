const cliArgumentCommands = new Map<string, string>([
  ["doctor", "uv run --no-sync python scripts/doctor.py {{.CLI_ARGS}}"],
  ["rename", "uv run python scripts/rename-package.py {{.CLI_ARGS}}"],
  ...["links", "verify", "check", "update", "repin", "adopt-local", "migrate"].map(
    (name): [string, string] => [`skills:${name}`, `node repo-tools/entrypoint.mjs skills:${name} {{.CLI_ARGS}}`],
  ),
  ["prune-template-docs", "uv run --no-sync python scripts/prune-template-docs.py {{.CLI_ARGS}}"],
]);

export function validateTaskTemplate(value: string, taskName: string, path: string, taskCall = false): void {
  if (!value.includes("{{")) return;
  if (!taskCall && cliArgumentCommands.get(taskName) === value.trim()) return;
  throw new Error(`${path} は未対応の Task template です（CLI_ARGS は指定済みの task / command の組だけで使用できます）`);
}
