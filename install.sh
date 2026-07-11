#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${OPL_REPO_URL:-https://github.com/gaofeng21cn/one-person-lab.git}
INSTALL_DIR=${OPL_INSTALL_DIR:-$HOME/.opl/one-person-lab}
BRANCH=${OPL_INSTALL_BRANCH:-main}
CARRIER_ONLY=${OPL_CARRIER_ONLY:-0}
INSTALL_SOURCE_MODE=${OPL_INSTALL_SOURCE_MODE:-auto}
MANAGED_TOOLCHAIN_ROOT=${OPL_MANAGED_TOOLCHAIN_ROOT:-$HOME/.opl/toolchain}
MANAGED_NODE_VERSION=${OPL_MANAGED_NODE_VERSION:-v22.21.1}
INSTALL_SOURCE_MARKER=.opl-install-source
SYSTEM_GIT_PATH=${OPL_SYSTEM_GIT_PATH:-/usr/bin/git}
XCODE_SELECT=${OPL_XCODE_SELECT:-/usr/bin/xcode-select}

INSTALL_ARGS=()
INSTALL_MODE_EXPLICIT=0
for arg in "$@"; do
  case "$arg" in
    --carrier-only)
      CARRIER_ONLY=1
      ;;
    --headless|--with-app)
      INSTALL_MODE_EXPLICIT=1
      INSTALL_ARGS+=("$arg")
      ;;
    *)
      INSTALL_ARGS+=("$arg")
      ;;
  esac
done
if [ "$CARRIER_ONLY" != "1" ] && [ "$INSTALL_MODE_EXPLICIT" != "1" ]; then
  if [ "${#INSTALL_ARGS[@]}" -gt 0 ]; then
    INSTALL_ARGS=(--headless "${INSTALL_ARGS[@]}")
  else
    INSTALL_ARGS=(--headless)
  fi
fi
if [ "${#INSTALL_ARGS[@]}" -gt 0 ]; then
  set -- "${INSTALL_ARGS[@]}"
else
  set --
fi

case "$INSTALL_SOURCE_MODE" in
  auto|archive)
    ;;
  *)
    printf 'Unsupported OPL_INSTALL_SOURCE_MODE: %s\n' "$INSTALL_SOURCE_MODE" >&2
    printf 'Expected one of: auto, archive\n' >&2
    exit 1
    ;;
esac

log() {
  printf '==> %s\n' "$1"
}

is_darwin() {
  [ "$(uname -s)" = "Darwin" ]
}

node_darwin_arch() {
  case "$(uname -m)" in
    arm64|aarch64)
      printf 'arm64\n'
      ;;
    x86_64|amd64)
      printf 'x64\n'
      ;;
    *)
      return 1
      ;;
  esac
}

managed_node_dir() {
  local arch
  arch=$(node_darwin_arch) || return 1
  printf '%s/node-%s-darwin-%s\n' "$MANAGED_TOOLCHAIN_ROOT" "$MANAGED_NODE_VERSION" "$arch"
}

prepend_managed_node_if_present() {
  local node_dir
  node_dir=$(managed_node_dir 2>/dev/null) || return 0
  if [ -x "$node_dir/bin/node" ] && [ -x "$node_dir/bin/npm" ]; then
    PATH="$node_dir/bin:$PATH"
    export PATH
  fi
}

node_is_usable() {
  command -v node >/dev/null 2>&1 || return 1
  command -v npm >/dev/null 2>&1 || return 1
  node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 22 && major < 25 ? 0 : 1)' >/dev/null 2>&1
}

install_managed_node() {
  local arch node_dir archive_tmp archive_url
  arch=$(node_darwin_arch) || {
    printf 'One Person Lab cannot prepare managed Node.js on this Mac architecture: %s\n' "$(uname -m)" >&2
    exit 1
  }
  node_dir="$MANAGED_TOOLCHAIN_ROOT/node-$MANAGED_NODE_VERSION-darwin-$arch"
  archive_url="${OPL_MANAGED_NODE_URL:-https://nodejs.org/dist/$MANAGED_NODE_VERSION/node-$MANAGED_NODE_VERSION-darwin-$arch.tar.gz}"
  archive_tmp=$(mktemp "${TMPDIR:-/tmp}/node-$MANAGED_NODE_VERSION-darwin-$arch.XXXXXX")

  log "Preparing One Person Lab managed Node.js $MANAGED_NODE_VERSION"
  mkdir -p "$MANAGED_TOOLCHAIN_ROOT"
  curl --http1.1 --connect-timeout 20 --max-time 300 --retry 3 --retry-delay 2 --retry-all-errors -fsSL "$archive_url" -o "$archive_tmp"
  rm -rf "$node_dir"
  tar -xzf "$archive_tmp" -C "$MANAGED_TOOLCHAIN_ROOT"
  rm -f "$archive_tmp"
  prepend_managed_node_if_present
  if ! node_is_usable; then
    printf 'Managed Node.js was downloaded but is not usable: %s\n' "$node_dir" >&2
    exit 1
  fi
}

ensure_node_runtime() {
  prepend_managed_node_if_present
  if node_is_usable; then
    return 0
  fi

  if is_darwin; then
    need_cmd curl
    need_cmd tar
    install_managed_node
    return 0
  fi

  need_cmd node
  need_cmd npm
}

git_is_usable() {
  command -v git >/dev/null 2>&1 || return 1
  if is_darwin && [ "$(command -v git)" = "$SYSTEM_GIT_PATH" ] && ! "$XCODE_SELECT" -p >/dev/null 2>&1; then
    return 1
  fi
  git --version >/dev/null 2>&1
}

request_command_line_tools() {
  if is_darwin && [ -x "$XCODE_SELECT" ]; then
    "$XCODE_SELECT" --install >/dev/null 2>&1 || true
    printf 'One Person Lab has opened the macOS Command Line Tools installer for Git-backed updates.\n' >&2
    printf 'You can continue using this existing One Person Lab checkout while the Apple installer finishes.\n' >&2
    printf 'Git-backed background maintenance will resume after Command Line Tools are ready.\n' >&2
  fi
}

resolve_opl_modules_root() {
  local data_dir
  if [ -n "${OPL_MODULES_ROOT:-}" ]; then
    printf '%s\n' "$OPL_MODULES_ROOT"
  elif [ -n "${OPL_STATE_DIR:-}" ]; then
    printf '%s/modules\n' "$OPL_STATE_DIR"
  else
    data_dir=${OPL_DATA_DIR:-${AIONUI_DATA_DIR:-}}
    if [ -n "$data_dir" ]; then
      printf '%s/opl/state/modules\n' "$data_dir"
    else
      printf '%s/Library/Application Support/OPL/state/modules\n' "$HOME"
    fi
  fi
}

materialize_opl_flow_source() {
  local modules_root flow_dir flow_tmp flow_url installer_path
  modules_root=$(resolve_opl_modules_root)
  flow_dir="$modules_root/opl-flow"
  installer_path="$flow_dir/scripts/install_local_plugin.py"
  if [ -f "$installer_path" ]; then
    return 0
  fi
  if [ -e "$flow_dir" ]; then
    printf 'Mandatory OPL Flow source is incomplete: %s\n' "$flow_dir" >&2
    printf 'Expected: %s\n' "$installer_path" >&2
    exit 1
  fi

  flow_url=${OPL_FLOW_REPO_URL:-https://github.com/gaofeng21cn/opl-flow.git}
  flow_tmp="${flow_dir}.tmp.$$"
  mkdir -p "$modules_root"
  rm -rf "$flow_tmp"
  log "Preparing mandatory OPL Flow source"
  if ! git clone --depth 1 "$flow_url" "$flow_tmp"; then
    rm -rf "$flow_tmp"
    exit 1
  fi
  if [ ! -f "$flow_tmp/scripts/install_local_plugin.py" ]; then
    rm -rf "$flow_tmp"
    printf 'Downloaded OPL Flow source is missing scripts/install_local_plugin.py\n' >&2
    exit 1
  fi
  mv "$flow_tmp" "$flow_dir"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    printf '\n' >&2
    if is_darwin; then
      printf 'One Person Lab could not prepare the required macOS setup helper automatically.\n' >&2
      printf 'Please retry from the One Person Lab App after the current setup step finishes.\n' >&2
    elif command -v apt-get >/dev/null 2>&1; then
      printf 'One Person Lab needs git, Node.js, and npm before it can run the complete setup.\n' >&2
      printf 'Fastest Debian/Ubuntu setup:\n' >&2
      printf '  sudo apt-get update && sudo apt-get install -y git nodejs npm\n' >&2
    elif command -v dnf >/dev/null 2>&1; then
      printf 'One Person Lab needs git, Node.js, and npm before it can run the complete setup.\n' >&2
      printf 'Fastest Fedora/RHEL setup:\n' >&2
      printf '  sudo dnf install -y git nodejs npm\n' >&2
    elif command -v apk >/dev/null 2>&1; then
      printf 'One Person Lab needs git, Node.js, and npm before it can run the complete setup.\n' >&2
      printf 'Fastest Alpine setup:\n' >&2
      printf '  apk add --no-cache git nodejs npm\n' >&2
    else
      printf 'Install git, Node.js, and npm with your system package manager, then rerun this installer.\n' >&2
    fi
    printf '\n' >&2
    printf 'After that, rerun:\n' >&2
    printf '  curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/install.sh | bash\n' >&2
    exit 1
  fi
}

source_archive_url() {
  printf 'https://github.com/gaofeng21cn/one-person-lab/archive/refs/heads/%s.tar.gz\n' "$BRANCH"
}

install_from_archive() {
  local archive_tmp extract_root source_dir
  archive_tmp=$(mktemp "${TMPDIR:-/tmp}/one-person-lab.XXXXXX")
  extract_root=$(mktemp -d "${TMPDIR:-/tmp}/one-person-lab-src.XXXXXX")
  cleanup_archive_tmp() {
    rm -f "$archive_tmp"
    rm -rf "$extract_root"
  }
  trap cleanup_archive_tmp EXIT

  log "Downloading One Person Lab source archive into $INSTALL_DIR"
  curl --http1.1 --connect-timeout 20 --max-time 300 --retry 3 --retry-delay 2 --retry-all-errors -fsSL \
    "${OPL_SOURCE_ARCHIVE_URL:-$(source_archive_url)}" \
    -o "$archive_tmp"
  tar -xzf "$archive_tmp" -C "$extract_root"
  source_dir=$(find "$extract_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)
  if [ -z "$source_dir" ] || [ ! -d "$source_dir" ]; then
    printf 'Downloaded One Person Lab source archive did not contain an installable directory.\n' >&2
    exit 1
  fi
  printf 'archive\n' > "$source_dir/$INSTALL_SOURCE_MARKER"
  rm -rf "$INSTALL_DIR"
  mv "$source_dir" "$INSTALL_DIR"
  trap - EXIT
  cleanup_archive_tmp
}

ensure_node_runtime

mkdir -p "$(dirname "$INSTALL_DIR")"

if [ "$INSTALL_SOURCE_MODE" = "archive" ]; then
  if [ -e "$INSTALL_DIR" ] && [ ! -f "$INSTALL_DIR/$INSTALL_SOURCE_MARKER" ]; then
    printf 'Install directory exists and cannot be replaced by explicit archive mode: %s\n' "$INSTALL_DIR" >&2
    printf 'Move it away or set OPL_INSTALL_DIR to another path.\n' >&2
    exit 1
  fi
  install_from_archive
elif [ -d "$INSTALL_DIR/.git" ]; then
  if ! git_is_usable; then
    if is_darwin; then
      request_command_line_tools
      log "Using existing One Person Lab checkout in $INSTALL_DIR"
    else
      printf 'One Person Lab needs Git to update the existing source checkout: %s\n' "$INSTALL_DIR" >&2
      exit 1
    fi
  else
    log "Updating One Person Lab in $INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch --prune origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
  fi
elif [ -f "$INSTALL_DIR/$INSTALL_SOURCE_MARKER" ]; then
  install_from_archive
else
  if [ -e "$INSTALL_DIR" ]; then
    printf 'Install directory exists but is not a git checkout: %s\n' "$INSTALL_DIR" >&2
    printf 'Move it away or set OPL_INSTALL_DIR to another path.\n' >&2
    exit 1
  fi
  if ! git_is_usable; then
    if is_darwin; then
      install_from_archive
    else
      need_cmd git
    fi
  else
  CLONE_TMP="${INSTALL_DIR}.tmp.$$"
  rm -rf "$CLONE_TMP"
  cleanup_clone_tmp() {
    rm -rf "$CLONE_TMP"
  }
  trap cleanup_clone_tmp EXIT
  log "Cloning One Person Lab into $INSTALL_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$CLONE_TMP"
  mv "$CLONE_TMP" "$INSTALL_DIR"
  trap - EXIT
  fi
fi

cd "$INSTALL_DIR"

log "Installing OPL CLI"
if [ "$CARRIER_ONLY" = "1" ]; then
  npm install --omit=dev --ignore-scripts
  npm link --ignore-scripts
else
  npm install
  npm link
fi

if [ "$CARRIER_ONLY" = "1" ]; then
  log "OPL base carrier is ready"
  exit 0
fi

log "Running complete One Person Lab setup"
materialize_opl_flow_source
if command -v opl >/dev/null 2>&1; then
  opl install "$@"
  log "Inspecting OPL system state"
  opl system initialize
else
  ./bin/opl install "$@"
  log "Inspecting OPL system state"
  ./bin/opl system initialize
fi

log "One Person Lab is ready"
printf '\nNext steps:\n'
printf '  1. Use OPL from Codex/CLI, or install the optional One Person Lab App as a GUI.\n'
printf '  2. Choose a workspace root when the App asks for it.\n'
printf '  3. Re-run "opl system initialize" any time you want to inspect Codex, modules, skills, runtime provider, and GUI state.\n'
