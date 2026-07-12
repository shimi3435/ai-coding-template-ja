#!/usr/bin/env bash
# vendored skill の symlink を冪等再生成する（Ubuntu のみ・§9.2 / ADR-0001）。
#
# skill 実体は .agents/skills/<name>/ が単一の正。Claude Code 用 .claude/skills と
# Codex 用 .codex/skills にそれぞれ相対 symlink を張る（両エージェントが同一
# SKILL.md を参照）。symlink が欠落 / 壊れ / 別 path を指すときだけ張り直す。
#
# 保護: リンク先パスに symlink 以外の実体（実ディレクトリ・通常ファイル等）がある場合は
# preflight（検査パス）で全件列挙し、一切のファイルシステム変更を行わず復旧手順を表示して
# 非ゼロ終了する。置換のための削除は symlink の unlink（rm）に限定する（rm -rf 不使用）。
#
# secret は扱わない。ネットワークも使わない（同梱済み実体への symlink 操作のみ）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKILLS_ROOT=".agents/skills"
LINK_ROOTS=(".claude/skills" ".codex/skills")

info() { printf '[INFO] %s\n' "$*"; }
error() { printf '[ERROR] %s\n' "$*" >&2; }

if [ ! -d "$SKILLS_ROOT" ]; then
  echo "[WARN] $SKILLS_ROOT がありません。vendored skill が未配置です。" >&2
  exit 0
fi

# preflight（検査パス）: 非 symlink 衝突を全件検出する。1 件でもあれば変更パス
# （mkdir -p を含む）に入らず、全衝突パスと復旧手順を表示して非ゼロ終了する。
conflicts=()
for skill_path in "$SKILLS_ROOT"/*/; do
  [ -d "$skill_path" ] || continue
  name="$(basename "$skill_path")"
  for link_root in "${LINK_ROOTS[@]}"; do
    link="$link_root/$name"
    # symlink 以外の実体すべて（実ディレクトリ・通常ファイル・fifo 等）を衝突とする。
    if [ ! -L "$link" ] && [ -e "$link" ]; then
      conflicts+=("$link")
    fi
  done
done

if [ "${#conflicts[@]}" -gt 0 ]; then
  error "symlink 以外の実体と名前衝突するため中断しました（ファイルシステムは未変更）:"
  for conflict in "${conflicts[@]}"; do
    error "  衝突: $conflict"
  done
  error "復旧手順: 衝突パスを退避（mv <衝突パス> <退避先>）または手動削除してから再実行してください。"
  exit 1
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
    # 壊れた / 別 path を指す symlink のみ unlink する（symlink 自体だけを削除し、
    # 指し先の実体には触れない。非 symlink は preflight で除外済み）。
    if [ -L "$link" ]; then
      rm "$link"
    fi
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
