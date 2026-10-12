"""workflow の列挙 path fields と静的 cwd 優先順位。"""

from template_prune_references import References


def inspect_workflow(refs: References, source: str, workflow: dict, text: str) -> None:
    def location(value) -> int:
        return text[: max(0, text.find(str(value)))].count("\n") + 1

    def paths(value, filter_path=False):
        for item in value if isinstance(value, list) else [value]:
            if not isinstance(item, str):
                continue
            for line in item.splitlines():
                line = line.strip()
                if filter_path:
                    line = line.removeprefix("!")
                if not line or "$" in line or "{{" in line:
                    continue
                refs.path(line, "R03", source, location(item))

    def defaults(mapping):
        d = mapping.get("defaults", {})
        run = d.get("run", {}) if isinstance(d, dict) else {}
        return run if isinstance(run, dict) else {}

    paths(defaults(workflow).get("working-directory"))
    on = workflow.get("on", {})
    if isinstance(on, dict):
        for event in ("push", "pull_request"):
            value = on.get(event, {})
            if isinstance(value, dict):
                for key in ("paths", "paths-ignore"):
                    paths(value.get(key), True)
    jobs = workflow.get("jobs", {})
    if not isinstance(jobs, dict):
        raise ValueError("workflow jobs mapping が不正")
    for job in jobs.values():
        if not isinstance(job, dict):
            raise ValueError("workflow job mapping が不正")
        if isinstance(job.get("uses"), str) and job["uses"].startswith("./"):
            paths(job["uses"])
        paths(defaults(job).get("working-directory"))
        for step in job.get("steps", []):
            if not isinstance(step, dict):
                raise ValueError("workflow step mapping が不正")
            if isinstance(step.get("uses"), str) and step["uses"].startswith("./"):
                paths(step["uses"])
            paths(step.get("working-directory"))
            with_ = step.get("with", {})
            if isinstance(with_, dict):
                for key in ("path", "paths", "cache-dependency-path"):
                    paths(with_.get(key))
            if "run" not in step:
                continue
            if not isinstance(step["run"], str):
                raise ValueError("workflow run string が不正")
            selected = "."
            for mapping in (step, defaults(job), defaults(workflow)):
                if "working-directory" in mapping:
                    selected = mapping["working-directory"]
                    break
            line = location(step["run"])
            cwd = refs.cwd(selected, "R03", source, line)
            refs.shell(step["run"], "R03", source, line, cwd, validate=False)
