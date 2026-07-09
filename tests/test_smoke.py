"""機械コア（PR1）のスモークテスト。

ここでは「テンプレートが作成直後に壊れていない」最小の不変条件を検証する:
- 既定パッケージが import できる
- 機械コアの必須ファイルが存在する
- TEMPLATE_VERSION が単一行・semver 形式である

doctor の green 検証と uv.lock 不変の検証は scripts/doctor.py 追加後に
別テスト（test_doctor.py 相当を本ファイルへ追記）で扱う。
"""

from __future__ import annotations

import importlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_default_package_importable() -> None:
    module = importlib.import_module("ai_coding_template_ja")
    assert module.__doc__ is not None


def test_core_files_exist() -> None:
    required = [
        "pyproject.toml",
        "uv.lock",
        ".python-version",
        ".gitignore",
        ".env.example",
        "LICENSE",
        "TEMPLATE_VERSION",
        "Taskfile.yml",
        ".pre-commit-config.yaml",
        "README.md",
        "scripts/bootstrap.sh",
        "scripts/doctor.py",
        "scripts/rename-package.py",
        "tests/test_smoke.py",
        "src/ai_coding_template_ja/__init__.py",
        "src/ai_coding_template_ja/py.typed",
    ]
    missing = [name for name in required if not (REPO_ROOT / name).exists()]
    assert not missing, f"必須ファイルが存在しません: {missing}"


def test_template_version_is_single_semver_line() -> None:
    raw = (REPO_ROOT / "TEMPLATE_VERSION").read_text(encoding="utf-8")
    lines = [line for line in raw.splitlines() if line.strip()]
    assert len(lines) == 1, "TEMPLATE_VERSION は単一行であること"
    assert re.fullmatch(r"\d+\.\d+\.\d+", lines[0]), "semver 形式であること"


def test_python_version_pinned_to_312() -> None:
    raw = (REPO_ROOT / ".python-version").read_text(encoding="utf-8").strip()
    assert raw.startswith("3.12"), f".python-version は 3.12 系であること: {raw!r}"


def _run_doctor() -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["uv", "run", "--no-sync", "python", "scripts/doctor.py"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        timeout=180,
    )


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv 未導入のためスキップ")
def test_doctor_is_green_and_keeps_lock_unchanged() -> None:
    """doctor が green（exit 0）であり、実行で uv.lock を変更しないこと（§20）。"""
    lock_before = (REPO_ROOT / "uv.lock").read_bytes()
    result = _run_doctor()
    assert result.returncode == 0, (
        f"task doctor が green ではありません:\n{result.stdout}\n{result.stderr}"
    )
    lock_after = (REPO_ROOT / "uv.lock").read_bytes()
    assert lock_before == lock_after, "doctor 実行で uv.lock が変更されました"


def _load_doctor_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "doctor_under_test", REPO_ROOT / "scripts" / "doctor.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_check_optional(doctor: ModuleType) -> tuple[int, int]:
    diag = doctor.Diagnostics()
    doctor.check_optional(diag)
    return diag.fail, diag.warn


def test_doctor_optional_adds_no_warn_or_fail_in_current_env() -> None:
    """check_optional は現環境の在席状況によらず WARN/FAIL を増やさない（§23.3）。"""
    fail, warn = _run_check_optional(_load_doctor_module())
    assert (fail, warn) == (0, 0), "オプション診断は全 INFO であること"


def test_doctor_optional_all_absent_is_info_only(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """オプション全不在（codex / docker / .mcp.json 無し）でも INFO のみであること。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor.shutil, "which", lambda _name: None)
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    assert _run_check_optional(doctor) == (0, 0)


def test_doctor_optional_all_present_is_info_only(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """オプション全在席（codex / docker / serena エントリ）でも INFO のみであること。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor.shutil, "which", lambda _name: "/usr/bin/present")
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    (tmp_path / ".mcp.json").write_text(
        json.dumps({"mcpServers": {"serena": {"type": "stdio"}}}), encoding="utf-8"
    )
    assert _run_check_optional(doctor) == (0, 0)


def test_doctor_gh_missing_is_fail_only_with_optin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """gh 不在は既定 WARN・opt-in（--github / env）時のみ FAIL（ADR-0004 訂正）。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor.shutil, "which", lambda _name: None)

    default = doctor.Diagnostics()
    doctor.check_gh(default, require_gh=False)
    assert (default.fail, default.warn) == (0, 1), "既定は WARN 止まり（green 維持）"

    opted_in = doctor.Diagnostics()
    doctor.check_gh(opted_in, require_gh=True)
    assert opted_in.fail == 1, "opt-in 時は gh 不在を FAIL とすること"


def _make_change_dir(tmp_path: Path, name: str) -> Path:
    """proposal.md / tasks.md を備えた完全な change ディレクトリを tmp に作る。"""
    change = tmp_path / "openspec" / "changes" / name
    change.mkdir(parents=True)
    (change / "proposal.md").write_text("# Change\n", encoding="utf-8")
    (change / "tasks.md").write_text("- [ ] 1. task\n", encoding="utf-8")
    return change


def test_doctor_openspec_output_never_mentions_openspec_init(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """doctor 出力は engine 不在・在席の両経路で `openspec init` を含まないこと。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)

    # engine 不在経路（未導入案内の WARN 文言を捕捉）
    monkeypatch.setattr(doctor.shutil, "which", lambda _name: None)
    doctor.check_openspec(doctor.Diagnostics())

    # engine 在席経路（probe の invalid WARN 文言まで捕捉）
    monkeypatch.setattr(doctor.shutil, "which", lambda _name: "/usr/bin/openspec")
    _make_change_dir(tmp_path, "some-change")
    monkeypatch.setattr(doctor, "_run", lambda _cmd: (1, "invalid change"))
    doctor.check_openspec(doctor.Diagnostics())

    out = capsys.readouterr().out
    assert "openspec init" not in out, "doctor は openspec init を案内しないこと"


def test_doctor_openspec_probe_skips_when_no_changes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """changes 空（dir 不在 / .gitkeep のみ）では validate を実行せず出力も無いこと。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    calls: list[list[str]] = []

    def _fake_run(cmd: list[str]) -> tuple[int, str]:
        calls.append(cmd)
        return 0, ""

    monkeypatch.setattr(doctor, "_run", _fake_run)

    doctor._check_openspec_validate(doctor.Diagnostics())  # changes dir 不在

    changes = tmp_path / "openspec" / "changes"
    changes.mkdir(parents=True)
    (changes / ".gitkeep").write_text("", encoding="utf-8")
    doctor._check_openspec_validate(doctor.Diagnostics())  # .gitkeep のみ

    (changes / "archive").mkdir()
    doctor._check_openspec_validate(doctor.Diagnostics())  # archive/ は change でない

    assert calls == [], "changes 空では validate を実行しないこと"
    assert capsys.readouterr().out == "", "probe 由来の出力を出さないこと"


def test_doctor_openspec_probe_invalid_is_warn_not_fail(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """validate 非ゼロ（invalid）は WARN 1 件・FAIL ゼロで exit 0 を維持すること。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    _make_change_dir(tmp_path, "some-change")
    monkeypatch.setattr(doctor, "_run", lambda _cmd: (1, "invalid change"))
    diag = doctor.Diagnostics()
    doctor._check_openspec_validate(diag)
    assert (diag.fail, diag.warn) == (0, 1), "invalid は WARN 止まり（非ゲート）"
    assert diag.exit_code() == 0, "doctor の green（exit 0）を壊さないこと"


def test_doctor_openspec_probe_valid_is_ok(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """validate 0（全 change valid）では WARN/FAIL を増やさないこと。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    _make_change_dir(tmp_path, "some-change")
    monkeypatch.setattr(doctor, "_run", lambda _cmd: (0, "ok"))
    diag = doctor.Diagnostics()
    doctor._check_openspec_validate(diag)
    assert (diag.fail, diag.warn) == (0, 0), "valid は OK のみ（WARN/FAIL ゼロ）"


def test_doctor_openspec_probe_warns_on_incomplete_change_dir(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """proposal.md / tasks.md を欠く change は WARN とし、CLI が対象外として rc 0 を
    返しても「全 change が valid」と断定しないこと（fail-open 検出）。"""
    doctor = _load_doctor_module()
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    (tmp_path / "openspec" / "changes" / "broken-change").mkdir(parents=True)
    monkeypatch.setattr(doctor, "_run", lambda _cmd: (0, "No items found to validate."))
    diag = doctor.Diagnostics()
    doctor._check_openspec_validate(diag)
    out = capsys.readouterr().out
    assert (diag.fail, diag.warn) == (0, 1), "必須ファイル欠落は WARN（非ゲート）"
    assert diag.exit_code() == 0, "doctor の green（exit 0）を壊さないこと"
    assert "全 change が valid" not in out, "壊れた change があるとき OK と断定しない"


def _load_gate_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "gate_under_test", REPO_ROOT / "scripts" / "openspec-validate-gate.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_openspec_validate_gate_fails_without_engine(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """engine 不在時は導入案内を出して非ゼロ終了すること（silent pass しない）。"""
    gate = _load_gate_module()
    monkeypatch.setattr(gate.shutil, "which", lambda _name: None)
    assert gate.main() == 1, "engine 不在で green にしてはならない"
    out = capsys.readouterr().out
    assert "npm install -g @fission-ai/openspec" in out
    assert "docs/agents/workflow.md" in out


def test_openspec_validate_gate_fails_on_incomplete_change_dir(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """proposal.md / tasks.md を欠く change は preflight で非ゼロ終了し、
    CLI を実行しないこと（CLI の fail-open を gate で塞ぐ）。"""
    gate = _load_gate_module()
    monkeypatch.setattr(gate, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(gate.shutil, "which", lambda _name: "/usr/bin/openspec")
    calls: list[list[str]] = []
    monkeypatch.setattr(gate.subprocess, "run", lambda cmd, **_kw: calls.append(cmd))
    (tmp_path / "openspec" / "changes" / "broken-change").mkdir(parents=True)
    assert gate.main() == 1, "必須ファイル欠落 change で green にしてはならない"
    assert "proposal.md" in capsys.readouterr().out
    assert calls == [], "preflight FAIL 時は CLI を実行しないこと"


def test_openspec_validate_gate_propagates_cli_exit_code(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """完全な change のみのとき CLI を実行し、exit code をそのまま伝播すること。"""
    gate = _load_gate_module()
    monkeypatch.setattr(gate, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(gate.shutil, "which", lambda _name: "/usr/bin/openspec")
    _make_change_dir(tmp_path, "some-change")

    class _Proc:
        def __init__(self, returncode: int) -> None:
            self.returncode = returncode

    for cli_rc in (0, 1):
        monkeypatch.setattr(
            gate.subprocess, "run", lambda _cmd, _rc=cli_rc, **_kw: _Proc(_rc)
        )
        assert gate.main() == cli_rc, "CLI の exit code を fail-closed で伝播すること"


def _make_prune_fixture(tmp_path: Path) -> Path:
    """prune-template-docs.py を tmp へコピーした最小リポジトリ木を作る。

    スクリプトは自身の位置から REPO_ROOT を導出するため、実リポジトリを
    触らずに --apply の実削除まで検証できる。
    """
    (tmp_path / "scripts").mkdir()
    shutil.copy2(
        REPO_ROOT / "scripts" / "prune-template-docs.py",
        tmp_path / "scripts" / "prune-template-docs.py",
    )
    (tmp_path / "docs" / "template" / "adr").mkdir(parents=True)
    (tmp_path / "docs" / "template" / "adr" / "0001-meta.md").write_text(
        "テンプレのメタ ADR", encoding="utf-8"
    )
    (tmp_path / "docs" / "adr").mkdir()
    (tmp_path / "docs" / "adr" / "0000-template.md").write_text(
        "下流用スキャフォルド", encoding="utf-8"
    )
    (tmp_path / "TEMPLATE_VERSION").write_text("0.1.0\n", encoding="utf-8")
    return tmp_path


def _run_prune(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(root / "scripts" / "prune-template-docs.py"), *args],
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_prune_template_docs_dry_run_deletes_nothing(tmp_path: Path) -> None:
    """既定は dry-run で docs/template/ を削除しないこと（ADR-0006）。"""
    root = _make_prune_fixture(tmp_path)
    result = _run_prune(root)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "dry-run" in result.stdout
    assert (root / "docs" / "template" / "adr" / "0001-meta.md").is_file(), (
        "dry-run で削除してはならない"
    )


def test_prune_template_docs_apply_deletes_only_target_and_is_idempotent(
    tmp_path: Path,
) -> None:
    """--apply は docs/template/ のみ削除し、docs/adr と TEMPLATE_VERSION は不可侵。
    再実行は no-op で正常終了（冪等）であること。"""
    root = _make_prune_fixture(tmp_path)
    result = _run_prune(root, "--apply")
    assert result.returncode == 0, result.stdout + result.stderr
    assert not (root / "docs" / "template").exists(), "docs/template/ が残っている"
    assert (root / "docs" / "adr" / "0000-template.md").is_file(), (
        "docs/adr/ を削除してはならない"
    )
    assert (root / "TEMPLATE_VERSION").read_text(encoding="utf-8") == "0.1.0\n", (
        "TEMPLATE_VERSION を変更してはならない"
    )

    rerun = _run_prune(root, "--apply")
    assert rerun.returncode == 0, "docs/template/ 不在時は no-op で正常終了すること"
    assert "no-op" in rerun.stdout


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv 未導入のためスキップ")
def test_rename_rejects_invalid_distribution_name_without_mutating() -> None:
    """先頭アンダースコアの module 名（'-bad' を導出）は変更ゼロで abort すること。"""
    src_pkg = REPO_ROOT / "src" / "ai_coding_template_ja"
    pyproject_before = (REPO_ROOT / "pyproject.toml").read_bytes()
    result = subprocess.run(
        ["uv", "run", "--no-sync", "python", "scripts/rename-package.py", "_bad"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        timeout=120,
    )
    assert result.returncode != 0, "不正な配布名は abort（非ゼロ終了）すべき"
    assert src_pkg.is_dir(), "abort 時に src パッケージを rename してはならない"
    assert (REPO_ROOT / "pyproject.toml").read_bytes() == pyproject_before, (
        "abort 時に pyproject.toml を書き換えてはならない"
    )
