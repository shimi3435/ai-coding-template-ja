"""明示 setup 専用。固定 archive を検証してから private Go で build する。"""

from __future__ import annotations

import errno
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from shell_parser_artifact import (
    BUILD_FLAGS,
    ROOT,
    digest,
    inputs,
    prepared_parser,
    regular,
    supported_host,
)


def download(url: str, expected: str, target: Path) -> None:
    if not url.startswith(
        ("https://go.dev/dl/", "https://codeload.github.com/mvdan/sh/tar.gz/")
    ):
        raise ValueError("parser archive URL が固定 host 外")
    with (
        urllib.request.urlopen(url, timeout=60) as response,
        target.open("wb") as stream,
    ):
        shutil.copyfileobj(response, stream)
    if digest(target) != expected:
        raise ValueError("parser archive checksum 不一致")


def extract(archive: Path, destination: Path) -> None:
    with tarfile.open(archive) as tar:
        for item in tar:
            if not (item.isfile() or item.isdir()):
                raise ValueError("parser archive に通常 file / directory 以外がある")
        tar.extractall(destination, filter="data")


def setup(root: Path = ROOT) -> Path:
    supported_host()
    manifest, identity = inputs(root)
    try:
        return prepared_parser(root)
    except ValueError:
        pass
    store = root / ".cache/shell-parser"
    for path in (root / ".cache", store):
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError("parser 準備先の型が不正")
    store.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=store, prefix="stage-") as temporary:
        stage = Path(temporary)
        for name in ("go", "source"):
            spec = manifest[name]
            archive = stage / (name + ".tar.gz")
            download(spec["url"], spec["sha256"], archive)
            extract(archive, stage)
        source = stage / ("sh-" + manifest["source"]["commit"])
        fixed = root / "repo-tools/shell-parser"
        # Prevent discovery of the surrounding repository when applying inside .cache.
        env = {
            "PATH": os.defpath,
            "GIT_CEILING_DIRECTORIES": str(stage),
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
        }
        subprocess.run(
            ["git", "apply", str(fixed / "upstream.patch")],
            cwd=source,
            env=env,
            check=True,
        )
        if (source / "LICENSE").read_bytes() != (fixed / "LICENSE").read_bytes():
            raise ValueError("parser upstream license 不一致")
        bridge = source / "cmd/template-parser"
        bridge.mkdir()
        shutil.copy2(fixed / "main.go", bridge / "main.go")
        home = stage / "home"
        home.mkdir()
        env.update(
            HOME=str(home),
            GOTOOLCHAIN="local",
            GOENV="off",
            GOWORK="off",
            CGO_ENABLED="0",
            GOPROXY="off",
            GOSUMDB="off",
            GOOS="linux",
            GOARCH="amd64",
            GOFLAGS="",
            GOEXPERIMENT="",
            GOCACHE=str(stage / "go-cache"),
            GOMODCACHE=str(stage / "go-mod-cache"),
        )
        binary = stage / "parser"
        subprocess.run(
            [
                str(stage / "go/bin/go"),
                "build",
                *BUILD_FLAGS,
                "-o",
                str(binary),
                "./cmd/template-parser",
            ],
            cwd=source,
            env=env,
            check=True,
        )
        smoke = subprocess.run(
            [str(binary)],
            input="echo ready\n",
            capture_output=True,
            text=True,
            check=True,
        )
        if json.loads(smoke.stdout).get("Type") != "File":
            raise ValueError("parser build smoke 不正")
        # Do not publish a build for source changed concurrently with setup.
        if inputs(root)[1] != identity:
            raise ValueError("parser 固定入力が build 中に変化した")
        sha = digest(binary)
        destination = store / (identity + "-" + sha)
        publish = stage / "publish"
        publish.mkdir()
        shutil.move(binary, publish / "parser")
        if destination.exists():
            existing = destination / "parser"
            if destination.is_symlink() or not destination.is_dir():
                raise ValueError("既存 parser cache の型が不正")
            if (
                not existing.is_file()
                or existing.is_symlink()
                or not os.access(existing, os.X_OK)
                or digest(existing) != sha
            ):
                os.replace(publish / "parser", existing)
        else:
            try:
                publish.rename(destination)
            except OSError as exc:
                if exc.errno not in (errno.EEXIST, errno.ENOTEMPTY):
                    raise
                if (
                    not regular(destination / "parser", root)
                    or digest(destination / "parser") != sha
                ):
                    raise ValueError("同時 setup の artifact が不一致") from None
        pointer = stage / "current.json"
        pointer.write_text(json.dumps({"identity": identity, "sha256": sha}) + "\n")
        os.replace(pointer, store / "current.json")
    return prepared_parser(root)
