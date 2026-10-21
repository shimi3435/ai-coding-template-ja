"""固定 parser artifact の検証。network・install・build は行わない。"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import stat
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD_FLAGS = ["-mod=readonly", "-trimpath", "-buildvcs=false"]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def regular(path: Path, root: Path) -> bool:
    return (
        path.is_relative_to(root)
        and not any(
            p.is_symlink()
            for p in (path, *path.parents)
            if p != root and p.is_relative_to(root)
        )
        and path.is_file()
        and stat.S_ISREG(path.stat().st_mode)
    )


def supported_host() -> None:
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        raise ValueError("shell parser: Ubuntu amd64 のみ対応")
    if platform.freedesktop_os_release().get("ID") != "ubuntu":
        raise ValueError("shell parser: Ubuntu amd64 のみ対応")


def inputs(root: Path) -> tuple[dict, str]:
    directory = root / "repo-tools/shell-parser"
    names = ("manifest.json", "main.go", "upstream.patch", "LICENSE")
    if not all(regular(directory / name, root) for name in names):
        raise ValueError("shell parser 固定入力が不足・誤型。task setup を確認")
    manifest = json.loads((directory / "manifest.json").read_text())
    if not isinstance(manifest, dict) or manifest.get("protocol") != 1:
        raise ValueError("shell parser manifest 不正。task setup を確認")
    for name in ("go", "source"):
        spec = manifest.get(name)
        if (
            not isinstance(spec, dict)
            or not isinstance(spec.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", spec["sha256"])
        ):
            raise ValueError("shell parser archive identity 不正")
        if not isinstance(spec.get("version"), str) or not re.fullmatch(
            r"v?\d+\.\d+\.\d+", spec["version"]
        ):
            raise ValueError("shell parser version 不正")
    source = manifest["source"]
    if not isinstance(source.get("commit"), str) or not re.fullmatch(
        r"[0-9a-f]{40}", source["commit"]
    ):
        raise ValueError("shell parser source commit 不正")
    if (
        source.get("url")
        != "https://codeload.github.com/mvdan/sh/tar.gz/" + source["commit"]
    ):
        raise ValueError("shell parser source URL 不正")
    if (
        manifest["go"].get("url")
        != "https://go.dev/dl/go" + manifest["go"]["version"] + ".linux-amd64.tar.gz"
    ):
        raise ValueError("shell parser Go URL 不正")
    if digest(directory / "upstream.patch") != manifest.get("patch_sha256"):
        raise ValueError("shell parser patch checksum 不一致。task setup を確認")
    identity = hashlib.sha256(
        json.dumps(
            [[name, digest(directory / name)] for name in names]
            + [BUILD_FLAGS, "linux", "amd64"],
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    return manifest, identity


def prepared_parser(root: Path = ROOT) -> Path:
    """現在の固定入力と一致する artifact のみ返す。不足時も read-only。"""
    try:
        supported_host()
        _, identity = inputs(root)
        store = root / ".cache/shell-parser"
        pointer = store / "current.json"
        if not regular(pointer, root):
            raise ValueError("artifact の参照がない・誤型")
        value = json.loads(pointer.read_text())
        if not isinstance(value, dict) or value.get("identity") != identity:
            raise ValueError("artifact の固定入力が異なる")
        sha = value.get("sha256")
        if (
            not isinstance(sha, str)
            or len(sha) != 64
            or any(c not in "0123456789abcdef" for c in sha)
        ):
            raise ValueError("artifact checksum 形式不正")
        # The path is derived from validated identities, never from receipt path text.
        binary = store / (identity + "-" + sha) / "parser"
        if (
            not regular(binary, root)
            or not os.access(binary, os.X_OK)
            or digest(binary) != sha
        ):
            raise ValueError("artifact が欠落・破損・実行不能")
        return binary
    except (OSError, ValueError, TypeError) as exc:
        raise ValueError(f"shell parser 準備エラー: {exc}; task setup を実行") from exc
