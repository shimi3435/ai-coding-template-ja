"""`task rename` の公開 CLI 挙動を検証する。"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OLD_MODULE = "_".join(("ai", "coding", "template", "ja"))
OLD_DISTRIBUTION = OLD_MODULE.replace("_", "-")


def _make_rename_fixture(tmp_path: Path) -> tuple[Path, Path]:
    (tmp_path / "scripts").mkdir()
    shutil.copy2(
        REPO_ROOT / "scripts" / "rename-package.py",
        tmp_path / "scripts" / "rename-package.py",
    )
    (tmp_path / "scripts" / "openspec-gsd-handoff-smoke.py").write_text(
        f"from {OLD_MODULE}.openspec_gsd_handoff.smoke import main\n",
        encoding="utf-8",
    )

    package = tmp_path / "src" / OLD_MODULE
    package.mkdir(parents=True)
    (package / "__init__.py").write_text(
        f'"""{OLD_DISTRIBUTION}."""\n', encoding="utf-8"
    )
    (tmp_path / "pyproject.toml").write_text(
        f'[project]\nname = "{OLD_DISTRIBUTION}"\n', encoding="utf-8"
    )
    (tmp_path / "CONTEXT.md").write_text(
        f"# {OLD_DISTRIBUTION}\n\n由来: {OLD_DISTRIBUTION}\n", encoding="utf-8"
    )

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_uv = fake_bin / "uv"
    fake_uv.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    fake_uv.chmod(0o755)
    return tmp_path, fake_bin


def test_rename_updates_all_project_names_in_context(tmp_path: Path) -> None:
    root, fake_bin = _make_rename_fixture(tmp_path)
    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}{os.pathsep}{env['PATH']}"

    result = subprocess.run(
        [
            sys.executable,
            str(root / "scripts" / "rename-package.py"),
            "sample_project",
            "--apply",
        ],
        capture_output=True,
        text=True,
        cwd=root,
        env=env,
        timeout=60,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert (root / "CONTEXT.md").read_text(encoding="utf-8") == (
        "# sample-project\n\n由来: sample-project\n"
    )
    assert (root / "scripts" / "openspec-gsd-handoff-smoke.py").read_text(
        encoding="utf-8"
    ) == ("from sample_project.openspec_gsd_handoff.smoke import main\n")
