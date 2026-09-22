#!/usr/bin/env bash
# 初回セットアップ（Ubuntu のみ・§14）。
#
# task 未導入問題に対処するため、最初の 1 回だけこのスクリプトを直接実行する。
#   ./scripts/bootstrap.sh
#
# 方針:
# - uv は確認プロンプト付きで自動導入（ASSUME_YES=1 で非対話バイパス）。
# - go-task / gh は自動導入せず導入手順を表示する（導入経路が環境差大のため）。
# - Node.js 24 / npm / Python >=3.14 を変更前に検証する。
# - secret / token / PAT は生成・保存しない。AI サービスへ自動ログインしない。
set -euo pipefail

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
error() { printf '[ERROR] %s\n' "$*" >&2; }

node_install_guidance() {
  printf '%s\n' \
    'Node.js 24 LTS と npm を手動で導入してください。公式導入先: https://nodejs.org/en/download' \
    '導入済みの場合は PATH を確認してください。確認後、./scripts/bootstrap.sh を引数なしで再実行してください。'
}

SHOW_HELP=0
for argument in "$@"; do
  case "$argument" in
    --help | -h) SHOW_HELP=1 ;;
    --install-node)
      error "--install-node は廃止されました。"
      node_install_guidance >&2
      exit 2
      ;;
    *)
      error "未知の引数: $argument"
      exit 2
      ;;
  esac
done

if [ "$SHOW_HELP" = "1" ]; then
  printf '%s\n' \
    'Usage: ./scripts/bootstrap.sh [--help | -h]' \
    '必須: Node.js 24 LTS / npm / Python >=3.14' \
    '引数なし: runtime を検査し、uv を確認付きで導入して task setup を実行します。' \
    '--help, -h: このヘルプを表示します（runtime 検査・通信・環境変更なし）。' \
    '--install-node: 廃止されました。指定すると終了コード 2 で停止します。'
  node_install_guidance
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
ASSUME_YES="${ASSUME_YES:-0}"

python_preflight() {
  local python_output python_version python_major python_minor

  if ! command -v python3 >/dev/null 2>&1; then
    error "Python >=3.14 が見つかりません。"
    return 1
  fi
  if ! python_output="$(python3 --version 2>&1)"; then
    error "Python version command が失敗しました: $python_output"
    return 1
  fi
  python_version="${python_output#Python }"
  if [[ ! "$python_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+.-][0-9A-Za-z.-]+)?$ ]]; then
    error "Python version 出力を解釈できません: $python_output"
    return 1
  fi
  python_major="${python_version%%.*}"
  python_minor="${python_version#*.}"
  python_minor="${python_minor%%.*}"
  if [ "$python_major" -lt 3 ] || { [ "$python_major" -eq 3 ] && [ "$python_minor" -lt 14 ]; }; then
    error "Python >=3.14 が必要です（検出: $python_output）。"
    return 1
  fi

  PYTHON_RUNTIME_OUTPUT="$python_output"
}

node_runtime_error() {
  error "$@"
  node_install_guidance >&2
}

runtime_preflight() {
  local node_output npm_output node_version node_major

  if ! command -v node >/dev/null 2>&1; then
    node_runtime_error "Node.js 24 が見つかりません。"
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    node_runtime_error "npm が見つかりません。"
    return 1
  fi
  if ! node_output="$(node --version 2>&1)"; then
    node_runtime_error "Node.js version command が失敗しました: $node_output"
    return 1
  fi
  if ! npm_output="$(npm --version 2>&1)"; then
    node_runtime_error "npm version command が失敗しました: $npm_output"
    return 1
  fi
  node_version="${node_output#v}"
  if [[ ! "$node_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+.-][0-9A-Za-z.-]+)?$ ]]; then
    node_runtime_error "Node.js version 出力を解釈できません: $node_output"
    return 1
  fi
  if [[ ! "$npm_output" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+.-][0-9A-Za-z.-]+)?$ ]]; then
    node_runtime_error "npm version 出力を解釈できません: $npm_output"
    return 1
  fi
  node_major="${node_version%%.*}"
  if [ "$node_major" -ne 24 ]; then
    node_runtime_error "Node.js 24 が必要です（検出: $node_output）。"
    return 1
  fi
  python_preflight

  info "Node.js $node_output"
  info "npm $npm_output"
  info "$PYTHON_RUNTIME_OUTPUT"
}

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

runtime_preflight

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

# 4. 必須 runtime は冒頭の preflight で検証・完全 version 表示済み
info "Node.js 24 / npm / Python >=3.14 の preflight 完了。"

# 5. GitHub CLI (gh) の確認（コア前提・未導入なら手順表示）
if command -v gh >/dev/null 2>&1; then
  info "gh は導入済みです（$(gh --version | head -n1)）。"
  info "認証は手動で行ってください（gh auth login / GH_TOKEN）。secret は保存しません。"
else
  warn "gh が未導入です。GitHub read 操作のため導入を推奨します（apt: gh 公式 apt repo）:"
  echo "  https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
fi

# 6. task setup（npm ci --ignore-scripts + uv sync + hooks）
if command -v task >/dev/null 2>&1 && command -v uv >/dev/null 2>&1; then
  info "task setup を実行します（npm ci --ignore-scripts + uv sync + pre-commit install）..."
  task setup
  info "完了。次に: task check / task doctor"
else
  warn "task または uv が無いため task setup を自動実行できません。"
  warn "導入後に手動で実行してください: task setup"
fi
