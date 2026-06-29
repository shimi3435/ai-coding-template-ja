#!/usr/bin/env bash
# 初回セットアップ（Ubuntu のみ・§14）。
#
# task 未導入問題に対処するため、最初の 1 回だけこのスクリプトを直接実行する。
#   ./scripts/bootstrap.sh
#
# 方針:
# - uv は確認プロンプト付きで自動導入（ASSUME_YES=1 で非対話バイパス）。
# - go-task / gh は自動導入せず導入手順を表示する（導入経路が環境差大のため）。
# - Node.js はコア非依存。未導入でもブロックしない（doctor が WARN）。
# - secret / token / PAT は生成・保存しない。AI サービスへ自動ログインしない。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ASSUME_YES="${ASSUME_YES:-0}"

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }

confirm() {
  # $1: プロンプト文。ASSUME_YES=1 なら無条件 yes。
  if [ "$ASSUME_YES" = "1" ]; then
    return 0
  fi
  printf '%s [y/N]: ' "$1"
  read -r reply
  case "$reply" in
    [yY] | [yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

# 1. Ubuntu / 必須コマンドの確認
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] && [[ "${ID_LIKE:-}" != *debian* ]]; then
    warn "対象 OS は Ubuntu です（検出: ${ID:-unknown}）。続行しますが未検証です。"
  else
    info "OS: ${PRETTY_NAME:-Ubuntu}"
  fi
else
  warn "/etc/os-release が読めません。Ubuntu 以外の可能性があります。"
fi

for cmd in curl git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    warn "$cmd が見つかりません。先に導入してください（例: sudo apt install $cmd）。"
  fi
done

# 2. uv の導入（未導入時・確認付き / ASSUME_YES でバイパス）
if command -v uv >/dev/null 2>&1; then
  info "uv は導入済みです（$(uv --version)）。"
else
  info "uv が未導入です。公式インストーラ（https://astral.sh/uv/install.sh）で導入します。"
  if confirm "curl | sh で uv を導入してよいですか？"; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # 当該シェルで PATH を通す（~/.local/bin が一般的な導入先）。
    export PATH="$HOME/.local/bin:$PATH"
    info "uv 導入完了（$(uv --version 2>/dev/null || echo '要 PATH 再読込')）。"
  else
    warn "uv の導入をスキップしました。手動で導入してください。"
  fi
fi

# 3. go-task は導入手順の表示に留める（自動導入しない）
if command -v task >/dev/null 2>&1; then
  info "Task (go-task) は導入済みです（$(task --version)）。"
else
  warn "Task (go-task) が未導入です。次のいずれかで導入してください:"
  echo "  - 公式: sh -c \"\$(curl -sL https://taskfile.dev/install.sh)\" -- -d -b ~/.local/bin"
  echo "  - snap: sudo snap install task --classic"
  echo "  （npm 版は Node 依存のため非推奨）"
fi

# 4. Node.js / npm / npx の確認（任意・ハード依存にしない）
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  info "Node.js / npm 利用可能（node $(node --version)）。"
else
  warn "Node.js / npm が未導入です。コアはリモート MCP 前提で Node 不要のため続行します。"
fi

# 5. GitHub CLI (gh) の確認（コア前提・未導入なら手順表示）
if command -v gh >/dev/null 2>&1; then
  info "gh は導入済みです（$(gh --version | head -n1)）。"
  info "認証は手動で行ってください（gh auth login / GH_TOKEN）。secret は保存しません。"
else
  warn "gh が未導入です。GitHub read 操作のため導入を推奨します（apt: gh 公式 apt repo）:"
  echo "  https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
fi

# 6. task setup（uv sync + hooks）
if command -v task >/dev/null 2>&1 && command -v uv >/dev/null 2>&1; then
  info "task setup を実行します（uv sync + pre-commit install）..."
  task setup
  info "完了。次に: task check / task doctor"
else
  warn "task または uv が無いため task setup を自動実行できません。"
  warn "導入後に手動で実行してください: task setup"
fi
