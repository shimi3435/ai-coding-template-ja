"""Workflow の列挙 path fields、YAML 定義位置、静的 cwd 優先順位。"""

import json

from template_prune_references import References


def inspect_workflow(refs: References, source: str, document: dict, text: str) -> None:
    workflow = document["data"]
    locations = document["locations"]

    def position(field):
        value = locations.get(
            json.dumps(field, ensure_ascii=False, separators=(",", ":"))
        )
        if (
            not isinstance(value, dict)
            or type(value.get("line")) is not int
            or value["line"] < 1
        ):
            raise ValueError("YAML field の元位置がない")
        return value

    def paths(value, field, filter_path=False):
        if isinstance(value, list):
            for index, item in enumerate(value):
                paths(item, [*field, index], filter_path)
            return
        if not isinstance(value, str):
            return
        with refs.located(position(field)):
            for line in value.splitlines():
                line = line.strip()
                if filter_path:
                    line = line.removeprefix("!")
                if line and "$" not in line and "{{" not in line:
                    refs.path(line, "R03", source, refs.position["line"])

    def defaults(mapping):
        d = mapping.get("defaults", {})
        run = d.get("run", {}) if isinstance(d, dict) else {}
        return run if isinstance(run, dict) else {}

    default_field = ["defaults", "run", "working-directory"]
    paths(defaults(workflow).get("working-directory"), default_field)
    on = workflow.get("on", {})
    if isinstance(on, dict):
        for event in ("push", "pull_request"):
            value = on.get(event, {})
            if isinstance(value, dict):
                for key in ("paths", "paths-ignore"):
                    paths(value.get(key), ["on", event, key], True)
    jobs = workflow.get("jobs", {})
    if not isinstance(jobs, dict):
        raise ValueError("workflow jobs mapping が不正")
    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            raise ValueError("workflow job mapping が不正")
        base = ["jobs", job_name]
        if isinstance(job.get("uses"), str) and job["uses"].startswith("./"):
            paths(job["uses"], [*base, "uses"])
        paths(defaults(job).get("working-directory"), [*base, *default_field])
        for index, step in enumerate(job.get("steps", [])):
            if not isinstance(step, dict):
                raise ValueError("workflow step mapping が不正")
            field = [*base, "steps", index]
            if isinstance(step.get("uses"), str) and step["uses"].startswith("./"):
                paths(step["uses"], [*field, "uses"])
            paths(step.get("working-directory"), [*field, "working-directory"])
            with_ = step.get("with", {})
            if isinstance(with_, dict):
                for key in ("path", "paths", "cache-dependency-path"):
                    paths(with_.get(key), [*field, "with", key])
            if "run" not in step:
                continue
            if not isinstance(step["run"], str):
                raise ValueError("workflow run string が不正")
            cwd = "."
            for mapping, cwd_field in (
                (step, [*field, "working-directory"]),
                (defaults(job), [*base, *default_field]),
                (defaults(workflow), default_field),
            ):
                if "working-directory" in mapping:
                    with refs.located(position(cwd_field)):
                        cwd = refs.cwd(
                            mapping["working-directory"],
                            "R03",
                            source,
                            refs.position["line"],
                        )
                    break
            with refs.located(position([*field, "run"])):
                refs.shell(step["run"], "R03", source, refs.position["line"], cwd)
