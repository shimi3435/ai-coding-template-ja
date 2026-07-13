#!/usr/bin/env bash
# MCP 設定の実体を template ＋ .env から冪等再生成する（§10.3 / ADR-0002）。
#
# .env が値の単一ソース（source of record）。実体（.mcp.json / .codex/config.toml）は
# 毎回 template ＋ .env から決定的に再生成する生成物で gitignore 済み。古い値は残さない。
# secret は .env と gitignore 済みの生成物にのみ置き、template にハードコードしない。
set -euo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE=".env"
PLACEHOLDER="__CONTEXT7_API_KEY__"

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }

# .env から CONTEXT7_API_KEY を読む（最後の定義を採用・前後空白と囲みクォートを除去）。
key=""
if [ -f "$ENV_FILE" ]; then
  raw="$(grep -E '^[[:space:]]*CONTEXT7_API_KEY=' "$ENV_FILE" | tail -n1 || true)"
  key="${raw#*=}"
  key="${key#"${key%%[![:space:]]*}"}"   # 先頭空白除去
  key="${key%"${key##*[![:space:]]}"}"   # 末尾空白除去
  key="${key%\"}"; key="${key#\"}"        # 二重引用符除去
  key="${key%\'}"; key="${key#\'}"        # 単一引用符除去
fi

if [ -z "$key" ]; then
  warn "CONTEXT7_API_KEY が $ENV_FILE にありません（または空）。空値で生成します。"
  warn "Context7 を使う場合は .env に CONTEXT7_API_KEY=... を設定して再実行してください。"
fi

# template の placeholder を key で置換して実体を生成（bash 置換＝replacement は literal）。
generate() {
  local tpl="$1" dest="$2"
  if [ ! -f "$tpl" ]; then
    warn "$tpl が見つかりません。スキップします。"
    return 0
  fi
  local content
  content="$(cat "$tpl")"
  content="${content//$PLACEHOLDER/$key}"
  printf '%s\n' "$content" > "$dest"
  chmod 600 "$dest"
  info "生成: $dest（source of record=$ENV_FILE）"
}

generate ".mcp.json.template" ".mcp.json"
mkdir -p ".codex"
generate ".codex/config.toml.template" ".codex/config.toml"

info "完了。実体は gitignore 済みです（コミットしないでください）。"
