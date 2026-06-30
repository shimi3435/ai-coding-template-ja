#!/usr/bin/env bash
# vendored skill の symlink を冪等再生成する（Ubuntu のみ・§9.2 / ADR-0001）。
#
# skill 実体は .agents/skills/<name>/ が単一の正。Claude Code 用 .claude/skills と
# Codex 用 .codex/skills にそれぞれ相対 symlink を張る（両エージェントが同一
# SKILL.md を参照）。symlink が欠落 / 壊れ / 別 path を指すときだけ張り直す。
#
# secret は扱わない。ネットワークも使わない（同梱済み実体への symlink 操作のみ）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKILLS_ROOT=".agents/skills"
LINK_ROOTS=(".claude/skills" ".codex/skills")

info() { printf '[INFO] %s\n' "$*"; }

if [ ! -d "$SKILLS_ROOT" ]; then
  echo "[WARN] $SKILLS_ROOT がありません。vendored skill が未配置です。" >&2
  exit 0
fi

for link_root in "${LINK_ROOTS[@]}"; do
  mkdir -p "$link_root"
done

created=0
for skill_path in "$SKILLS_ROOT"/*/; do
  [ -d "$skill_path" ] || continue
  name="$(basename "$skill_path")"
  target="../../$SKILLS_ROOT/$name"
  for link_root in "${LINK_ROOTS[@]}"; do
    link="$link_root/$name"
    # 既に正しい相対 symlink を指していれば何もしない（冪等）。
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ] && [ -e "$link" ]; then
      continue
    fi
    rm -rf "$link"
    ln -s "$target" "$link"
    info "symlink 再生成: $link -> $target"
    created=$((created + 1))
  done
done

if [ "$created" -eq 0 ]; then
  info "全 skill の symlink は最新です（変更なし）。"
else
  info "$created 件の symlink を生成 / 修復しました。"
fi
