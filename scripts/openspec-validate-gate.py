"""OpenSpec validate のゲート（task openspec:validate と CI openspec-validate の実体）。

doctor の probe（助言 WARN・exit 0 維持）と対になる FAIL 側。invalid で非ゼロ終了する。
`openspec validate --changes` は proposal.md を欠くディレクトリを検証対象から除外し
（fail-open）、tasks.md の checkbox 形式も検証しないため、CLI 実行前に preflight で
proposal.md / tasks.md の在席と tasks.md の checkbox 形式を検査する。
change の列挙・欠落・形式判定は doctor.py の list_change_dirs / broken_change_dirs /
malformed_tasks_changes を単一の正として共有する。engine 必須（不在は導入案内＋
非ゼロ終了）。
"""

from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_doctor() -> ModuleType:
    """隣の doctor.py をモジュールとして読み込む（scripts は非パッケージ）。"""
    path = Path(__file__).resolve().parent / "doctor.py"
    spec = importlib.util.spec_from_file_location("doctor_for_gate", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"doctor.py を読み込めません: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if shutil.which("openspec") is None:
        print(
            "[FAIL] openspec CLI 未導入のため実行できません（このゲートは engine 必須）"
        )
        print("       導入: npm install -g @fission-ai/openspec")
        print("       運用: docs/agents/workflow.md")
        return 1
    doctor = _load_doctor()
    change_dirs = doctor.list_change_dirs(REPO_ROOT / "openspec" / "changes")
    broken = doctor.broken_change_dirs(change_dirs)
    for name in broken:
        print(
            f"[FAIL] change {name} に proposal.md / tasks.md がありません"
            "（必須構成・docs/agents/workflow.md）"
        )
    malformed = doctor.malformed_tasks_changes(change_dirs)
    for message in malformed:
        print(f"[FAIL] {message}")
    if broken or malformed:
        return 1
    proc = subprocess.run(
        ["openspec", "validate", "--changes", "--no-interactive"],
        cwd=REPO_ROOT,
    )
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
