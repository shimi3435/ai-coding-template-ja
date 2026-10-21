"""テンプレート保守専用の release handoff と由来版固定。"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_v2_runtime_breaking_change_is_handed_off_without_bumping_version() -> None:
    release_guide = (REPO_ROOT / "docs" / "template" / "release.md").read_text(
        encoding="utf-8"
    )

    assert (REPO_ROOT / "TEMPLATE_VERSION").read_text(encoding="utf-8") == "1.0.0\n"
    for contract in (
        "establish-v2-runtime-foundation",
        "Node.js 24",
        "Python >=3.14",
        "破壊的変更",
        "prepare-v2-release",
        "全 4 changes",
        "TEMPLATE_VERSION=2.0.0",
        "移行ガイド最終化",
        "release-ready 判定",
    ):
        assert contract in release_guide
