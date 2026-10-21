"""全入口で共有する scanner result の検証と成功条件。"""


def validate(result: dict) -> None:
    if not isinstance(result, dict):
        raise ValueError("scanner result は object が必要")
    if result.get("state") not in ("bundled", "pruned", "inconsistent"):
        raise ValueError("scanner state が不正")
    if result.get("coverage") not in ("evaluated", "partial"):
        raise ValueError("scanner coverage が不正")
    edits = result.get("edits")
    if not isinstance(edits, dict) or any(
        not isinstance(k, str) or not isinstance(v, str) for k, v in edits.items()
    ):
        raise ValueError("scanner edits が不正")
    for key in ("references", "errors", "analysis_errors", "unevaluated"):
        rows = result.get(key)
        if not isinstance(rows, list):
            raise ValueError(f"scanner {key} は array が必要")
        for row in rows:
            if (
                not isinstance(row, dict)
                or not isinstance(row.get("source"), str)
                or not row["source"]
            ):
                raise ValueError(f"scanner {key} の source が不正")
            if "surface" not in row or "line" not in row:
                raise ValueError("scanner surface / line がない")
            common = (
                key == "analysis_errors"
                and row.get("surface") is None
                and row.get("line") is None
            )
            if not common:
                if row.get("surface") not in ("R01", "R02", "R03", "R04", "R05", "R06"):
                    raise ValueError("scanner surface が不正")
                positive(row.get("line"))
            field = "target" if key == "references" else "reason"
            if not isinstance(row.get(field), str) or not row[field]:
                raise ValueError(f"scanner {field} が不正")
            if key == "analysis_errors" and row.get("kind") not in (
                "syntax",
                "dependency",
                "protocol",
                "io",
                "position",
            ):
                raise ValueError("scanner analysis error kind が不正")
            if key == "unevaluated" and row.get("kind") not in (
                "cwd",
                "placeholder",
                "document-fragment",
                "analysis-error",
            ):
                raise ValueError("scanner partial kind が不正")
            if "line_end" in row:
                positive(row["line_end"])
                if common or row["line_end"] < row["line"]:
                    raise ValueError("scanner line range が不正")
            if "position_kind" in row and row["position_kind"] not in (
                "statement-range",
                "field-value",
            ):
                raise ValueError("scanner position kind が不正")
            if row.get("position_kind") == "statement-range" and "line_end" not in row:
                raise ValueError("scanner statement end がない")
            if row.get("position_kind") == "field-value" and "field_path" not in row:
                raise ValueError("scanner field path がない")
            if "field_path" in row:
                field_path(row["field_path"])
            if "alias_uses" in row:
                if not isinstance(row["alias_uses"], list):
                    raise ValueError("scanner alias uses が不正")
                for use in row["alias_uses"]:
                    if not isinstance(use, dict) or not isinstance(
                        use.get("source"), str
                    ):
                        raise ValueError("scanner alias source が不正")
                    positive(use.get("line"))
                    field_path(use.get("field_path"))
            if "shell_range" in row:
                span = row["shell_range"]
                if not isinstance(span, dict):
                    raise ValueError("scanner shell range が不正")
                positive(span.get("line"))
                positive(span.get("line_end"))
                if span["line_end"] < span["line"]:
                    raise ValueError("scanner shell range が逆転")
    if (result["unevaluated"] or result["analysis_errors"]) and result[
        "coverage"
    ] != "partial":
        raise ValueError("scanner coverage が診断と矛盾")


def positive(value) -> None:
    if type(value) is not int or value < 1:
        raise ValueError("scanner line は1以上の整数が必要")


def field_path(value) -> None:
    if not isinstance(value, list) or any(
        not isinstance(v, str) and not (type(v) is int and v >= 0) for v in value
    ):
        raise ValueError("scanner field path が不正")


def successful(result: dict) -> bool:
    validate(result)
    return result["state"] != "inconsistent" and not any(
        result[k] for k in ("references", "errors", "analysis_errors")
    )
