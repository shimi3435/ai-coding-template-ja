"""実parserの呼出コストを計測する。wall-clockの固定閾値は設けない。

直接実行時は現在のrepositoryを計測する。通常runtimeには計測を挿入しない。
"""

import importlib
import json
import statistics
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from unittest.mock import patch

import pytest
from template_prune_fixture import ROOT, fixture, inspect

artifact = importlib.import_module("shell_parser_artifact")
shell = importlib.import_module("template_prune_shell")
successful = importlib.import_module("template_prune_result").successful


@dataclass
class Costs:
    parse_calls: int = 0
    artifact_checks: int = 0
    binary_hashes: int = 0
    binary_bytes_read: int = 0
    parser_processes: int = 0
    artifact_seconds: float = 0.0
    binary_hash_seconds: float = 0.0
    parser_process_seconds: float = 0.0
    scanner_seconds: float = 0.0


def measure(root: Path, *, empty_repeats: int = 16) -> dict:
    # 起動の対照測定用path。scan外の準備確認は集計に含めない。
    binary = artifact.prepared_parser()
    size = binary.stat().st_size
    costs = Costs()
    original_parse = shell.parse
    original_prepare = shell.prepared_parser
    original_digest = artifact.digest
    original_run = subprocess.run

    def parse(*args, **kwargs):
        costs.parse_calls += 1
        return original_parse(*args, **kwargs)

    def prepare(*args, **kwargs):
        costs.artifact_checks += 1
        start = time.perf_counter()
        try:
            return original_prepare(*args, **kwargs)
        finally:
            costs.artifact_seconds += time.perf_counter() - start

    def digest(path):
        if path != binary:
            return original_digest(path)
        costs.binary_hashes += 1
        costs.binary_bytes_read += size
        start = time.perf_counter()
        try:
            return original_digest(path)
        finally:
            costs.binary_hash_seconds += time.perf_counter() - start

    def run(args, *positional, **kwargs):
        if str(args[0]) != str(binary):
            return original_run(args, *positional, **kwargs)
        costs.parser_processes += 1
        start = time.perf_counter()
        try:
            return original_run(args, *positional, **kwargs)
        finally:
            costs.parser_process_seconds += time.perf_counter() - start

    start = time.perf_counter()
    with (
        patch.object(shell, "parse", parse),
        patch.object(shell, "prepared_parser", prepare),
        patch.object(artifact, "digest", digest),
        patch.object(subprocess, "run", run),
    ):
        result = inspect(root)
    costs.scanner_seconds = time.perf_counter() - start

    empty_seconds = []
    for _ in range(empty_repeats):
        start = time.perf_counter()
        original_run(
            [str(binary)], input=b"", capture_output=True, timeout=30, check=True
        )
        empty_seconds.append(time.perf_counter() - start)
    return {
        "state": result["state"],
        "successful": successful(result),
        "analysis_errors": len(result["analysis_errors"]),
        "binary_size": size,
        **asdict(costs),
        "empty_process_samples": len(empty_seconds),
        "empty_process_median_seconds": statistics.median(empty_seconds),
    }


@pytest.mark.parametrize("units", [1, 8])
def test_measure_real_scanner_work(tmp_path: Path, units: int) -> None:
    fixture(tmp_path, bundled=False)
    for i in range(units):
        (tmp_path / "scripts" / f"probe-{i}.sh").write_text("printf 'hello\\n'\n")
    report = measure(tmp_path, empty_repeats=3)
    assert report["successful"], report
    assert report["parse_calls"] >= units
    assert report["parser_processes"] == report["parse_calls"]
    assert 0 < report["artifact_checks"] <= report["parse_calls"]
    assert report["binary_hashes"] == report["artifact_checks"]
    assert (
        report["binary_bytes_read"] == report["binary_hashes"] * report["binary_size"]
    )
    assert 0 <= report["binary_hash_seconds"] <= report["artifact_seconds"]
    assert report["artifact_seconds"] <= report["scanner_seconds"]
    assert 0 < report["parser_process_seconds"] <= report["scanner_seconds"]
    assert report["empty_process_samples"] == 3
    assert report["empty_process_median_seconds"] > 0
    print(json.dumps({"fixture_units": units, **report}, sort_keys=True))


def test_measure_preserves_analysis_failure_and_restores_instrumentation(
    tmp_path: Path,
):
    fixture(tmp_path, bundled=False)
    (tmp_path / "scripts/probe.sh").write_text("if then\n")
    original = shell.parse, shell.prepared_parser, artifact.digest, subprocess.run
    report = measure(tmp_path, empty_repeats=1)
    assert not report["successful"] and report["analysis_errors"] == 1
    assert (
        shell.parse,
        shell.prepared_parser,
        artifact.digest,
        subprocess.run,
    ) == original


if __name__ == "__main__":
    print(json.dumps(measure(ROOT), sort_keys=True, indent=2))
