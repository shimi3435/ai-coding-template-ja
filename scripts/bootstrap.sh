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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ASSUME_YES="${ASSUME_YES:-0}"
INSTALL_NODE=0

for argument in "$@"; do
  case "$argument" in
    --install-node) INSTALL_NODE=1 ;;
    *)
      printf '[ERROR] 未知の引数: %s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
error() { printf '[ERROR] %s\n' "$*" >&2; }

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

runtime_preflight() {
  local node_output npm_output node_version node_major

  if ! command -v node >/dev/null 2>&1; then
    error "Node.js 24 が見つかりません。手動で導入するか --install-node を指定してください。"
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    error "npm が見つかりません。Node.js 24 に付属する npm を導入してください。"
    return 1
  fi
  if ! node_output="$(node --version 2>&1)"; then
    error "Node.js version command が失敗しました: $node_output"
    return 1
  fi
  if ! npm_output="$(npm --version 2>&1)"; then
    error "npm version command が失敗しました: $npm_output"
    return 1
  fi
  node_version="${node_output#v}"
  if [[ ! "$node_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+.-][0-9A-Za-z.-]+)?$ ]]; then
    error "Node.js version 出力を解釈できません: $node_output"
    return 1
  fi
  if [[ ! "$npm_output" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+.-][0-9A-Za-z.-]+)?$ ]]; then
    error "npm version 出力を解釈できません: $npm_output"
    return 1
  fi
  node_major="${node_version%%.*}"
  if [ "$node_major" -ne 24 ]; then
    error "Node.js 24 が必要です（検出: $node_output）。"
    return 1
  fi
  python_preflight

  info "Node.js $node_output"
  info "npm $npm_output"
  info "$PYTHON_RUNTIME_OUTPUT"
}

NODE_INSTALL_DOWNLOAD_TEMP=""
NODE_INSTALL_STAGE_TEMP=""

cleanup_node_install() {
  if [ -n "$NODE_INSTALL_STAGE_TEMP" ] && [ -e "$NODE_INSTALL_STAGE_TEMP" ]; then
    rm -rf -- "$NODE_INSTALL_STAGE_TEMP"
  fi
  if [ -n "$NODE_INSTALL_DOWNLOAD_TEMP" ] && [ -e "$NODE_INSTALL_DOWNLOAD_TEMP" ]; then
    rm -rf -- "$NODE_INSTALL_DOWNLOAD_TEMP"
  fi
}

install_node() {
  local install_root canonical_home canonical_install_root
  local os_name machine archive_arch distribution_url
  local checksums archive archive_name expected_checksum actual_checksum extra
  local matches candidate checksum target extract_root activation_source installed_version
  local quoted_node_bin
  local required_command

  python_preflight
  for required_command in curl uname mktemp realpath sha256sum tar mkdir mv rm; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      error "Node.js 導入に必要な command が見つかりません: $required_command"
      return 1
    fi
  done

  if ! os_name="$(uname -s 2>&1)" || ! machine="$(uname -m 2>&1)"; then
    error "OS / architecture を検出できません。"
    return 1
  fi
  if [ "$os_name" != "Linux" ]; then
    error "--install-node の対応対象は Linux x64 / arm64 です（検出: $os_name $machine）。"
    return 1
  fi
  case "$machine" in
    x86_64) archive_arch="x64" ;;
    aarch64 | arm64) archive_arch="arm64" ;;
    *)
      error "--install-node の対応対象は Linux x64 / arm64 です（検出: $machine）。"
      return 1
      ;;
  esac

  if [ "${NODE_INSTALL_ROOT+x}" = "x" ]; then
    install_root="$NODE_INSTALL_ROOT"
  else
    install_root="${HOME:-}/.local/nodejs"
  fi
  if [ -z "${HOME:-}" ] || [[ "$HOME" != /* ]] || [ -z "$install_root" ] ||
    [[ "$install_root" != /* ]]; then
    error "user-local install root を絶対 path で決定できません。HOME 配下の NODE_INSTALL_ROOT を指定してください。"
    return 1
  fi
  if ! canonical_home="$(realpath --canonicalize-missing -- "$HOME")" ||
    ! canonical_install_root="$(realpath --canonicalize-missing -- "$install_root")" ||
    [[ "$canonical_install_root" != "$canonical_home"/* ]]; then
    error "user-local install root を HOME 配下に安全に決定できません。HOME 配下の NODE_INSTALL_ROOT を指定してください。"
    return 1
  fi
  install_root="$canonical_install_root"

  distribution_url="https://nodejs.org/dist/latest-v24.x"
  if ! NODE_INSTALL_DOWNLOAD_TEMP="$(mktemp -d)"; then
    error "Node.js 導入用の一時 directory を作成できません。"
    return 1
  fi
  trap cleanup_node_install EXIT
  checksums="$NODE_INSTALL_DOWNLOAD_TEMP/SHASUMS256.txt"
  if ! curl --fail --location --silent --show-error --output "$checksums" \
    "$distribution_url/SHASUMS256.txt"; then
    error "Node.js 公式 checksum の取得に失敗しました。"
    return 1
  fi

  matches=0
  archive_name=""
  expected_checksum=""
  while read -r checksum candidate extra; do
    candidate="${candidate#\*}"
    if [[ "$candidate" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-${archive_arch}\.tar\.xz$ ]]; then
      if [ -n "${extra:-}" ] || [[ ! "$checksum" =~ ^[[:xdigit:]]{64}$ ]]; then
        error "SHASUMS256.txt の対象 entry を解釈できません。"
        return 1
      fi
      matches=$((matches + 1))
      archive_name="$candidate"
      expected_checksum="${checksum,,}"
    fi
  done < "$checksums"
  if [ "$matches" -ne 1 ]; then
    error "SHASUMS256.txt から Linux $archive_arch の Node.js 24 archive を一意に決定できません。"
    return 1
  fi

  target="$install_root/${archive_name%.tar.xz}"
  if [ -e "$target" ] || [ -L "$target" ]; then
    error "Node.js 導入 target は既に存在します。上書きしません: $target"
    return 1
  fi
  archive="$NODE_INSTALL_DOWNLOAD_TEMP/$archive_name"
  if ! curl --fail --location --silent --show-error --output "$archive" \
    "$distribution_url/$archive_name"; then
    error "Node.js 公式 archive の取得に失敗しました。"
    return 1
  fi
  if ! actual_checksum="$(sha256sum "$archive")"; then
    error "Node.js archive の SHA-256 計算に失敗しました。"
    return 1
  fi
  actual_checksum="${actual_checksum%% *}"
  if [ "${actual_checksum,,}" != "$expected_checksum" ]; then
    error "Node.js archive の SHA-256 checksum が一致しません。"
    return 1
  fi

  if ! mkdir -p -- "$install_root"; then
    error "Node.js install root を作成できません: $install_root"
    return 1
  fi
  if [ -e "$target" ] || [ -L "$target" ]; then
    error "Node.js 導入 target は既に存在します。上書きしません: $target"
    return 1
  fi
  if ! NODE_INSTALL_STAGE_TEMP="$(mktemp -d "$install_root/.node-install.XXXXXX")"; then
    error "Node.js 展開用の一時 directory を作成できません。"
    return 1
  fi
  extract_root="$NODE_INSTALL_STAGE_TEMP/extract"
  if ! mkdir -- "$extract_root" ||
    ! tar --extract --xz --file "$archive" --directory "$extract_root" --no-same-owner; then
    error "Node.js archive の展開に失敗しました。"
    return 1
  fi
  if [ ! -x "$extract_root/${archive_name%.tar.xz}/bin/node" ] ||
    [ ! -x "$extract_root/${archive_name%.tar.xz}/bin/npm" ]; then
    error "Node.js archive に必要な node / npm executable がありません。"
    return 1
  fi

  activation_source="$extract_root/${archive_name%.tar.xz}"
  PATH="$activation_source/bin:$PATH" runtime_preflight
  installed_version="$("$activation_source/bin/node" --version)"
  if ! mv -nT -- "$activation_source" "$target" ||
    [ -e "$activation_source" ] || [ -L "$activation_source" ]; then
    error "Node.js を最終 target へ有効化できませんでした。"
    return 1
  fi
  export PATH="$target/bin:$PATH"
  cleanup_node_install
  NODE_INSTALL_STAGE_TEMP=""
  NODE_INSTALL_DOWNLOAD_TEMP=""
  trap - EXIT
  info "Node.js $installed_version を $target へ導入しました。"
  printf -v quoted_node_bin '%q' "$target/bin"
  info "次回 shell でも使うには実行してください: export PATH=${quoted_node_bin}:\$PATH"
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

if [ "$INSTALL_NODE" = "1" ]; then
  install_node
fi
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
