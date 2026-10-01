#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${OPL_REPO_URL:-https://github.com/gaofeng21cn/one-person-lab.git}
INSTALL_DIR=${OPL_INSTALL_DIR:-$HOME/.opl/one-person-lab}
BRANCH=${OPL_INSTALL_BRANCH:-main}
CARRIER_ONLY=${OPL_CARRIER_ONLY:-0}
INSTALL_SOURCE_MODE=${OPL_INSTALL_SOURCE_MODE:-auto}
MANAGED_TOOLCHAIN_ROOT=${OPL_MANAGED_TOOLCHAIN_ROOT:-$HOME/.opl/toolchain}
MANAGED_NODE_VERSION=${OPL_MANAGED_NODE_VERSION:-v22.21.1}
PREFILLED_NODE_MODULES_DIR=${OPL_PREFILLED_NODE_MODULES_DIR:-}
INSTALL_SOURCE_MARKER=.opl-install-source
INSTALL_SOURCE_IDENTITY=.opl-framework-installed-source-identity.json
LEGACY_GLOBAL_PACKAGE=opl-framework-shared
ARCHIVE_TMP_TO_CLEAN=
ARCHIVE_EXTRACT_ROOT_TO_CLEAN=
PREEXISTING_OPL_PATH=$(command -v opl 2>/dev/null || true)
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
  node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 22 ? 0 : 1)' >/dev/null 2>&1
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

install_node_dependencies() {
  if [ -f package-lock.json ]; then
    npm ci "$@"
  else
    npm install "$@"
  fi
}

resolve_cli_prefix() {
  local existing_cli
  if [ -n "${OPL_NPM_GLOBAL_PREFIX:-}" ]; then
    printf '%s\n' "$OPL_NPM_GLOBAL_PREFIX"
    return 0
  fi
  existing_cli=$PREEXISTING_OPL_PATH
  if [ -n "$existing_cli" ] && [ "$(basename "$(dirname "$existing_cli")")" = "bin" ]; then
    dirname "$(dirname "$existing_cli")"
    return 0
  fi
  printf '%s\n' "$HOME/.local"
}

link_cli_carrier() {
  local cli_prefix legacy_path
  cli_prefix=$(resolve_cli_prefix)
  legacy_path="$cli_prefix/lib/node_modules/$LEGACY_GLOBAL_PACKAGE"
  if [ -e "$legacy_path" ] || [ -L "$legacy_path" ]; then
    log "Retiring legacy OPL CLI carrier"
    env npm_config_prefix="$cli_prefix" npm uninstall --global "$LEGACY_GLOBAL_PACKAGE" --ignore-scripts
  fi
  env npm_config_prefix="$cli_prefix" npm link "$@"
}

normalize_framework_source_commit() {
  local commit=${1:-}
  if [[ ! "$commit" =~ ^[0-9a-fA-F]{40}$ ]]; then
    return 1
  fi
  printf '%s\n' "$commit" | tr '[:upper:]' '[:lower:]'
}

resolve_archive_source_identity() {
  local commit archive_url commit_payload

  if [ -n "${OPL_FRAMEWORK_SOURCE_COMMIT:-}" ]; then
    commit=$(normalize_framework_source_commit "$OPL_FRAMEWORK_SOURCE_COMMIT") || {
      printf 'OPL_FRAMEWORK_SOURCE_COMMIT must be a complete 40-character Git SHA.\n' >&2
      exit 1
    }
    printf '%s|explicit_source_commit\n' "$commit"
    return 0
  fi

  if commit=$(normalize_framework_source_commit "$BRANCH" 2>/dev/null); then
    printf '%s|install_ref\n' "$commit"
    return 0
  fi

  archive_url=${OPL_SOURCE_ARCHIVE_URL:-}
  if [[ "$archive_url" =~ ([0-9a-fA-F]{40}) ]]; then
    commit=$(normalize_framework_source_commit "${BASH_REMATCH[1]}")
    printf '%s|source_archive_url\n' "$commit"
    return 0
  fi

  commit_payload=$(curl --http1.1 --connect-timeout 20 --max-time 60 --retry 3 --retry-delay 2 --retry-all-errors -fsSL \
    "https://api.github.com/repos/gaofeng21cn/one-person-lab/commits/$BRANCH")
  commit=$(printf '%s' "$commit_payload" | node -e '
    let payload = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { payload += chunk; });
    process.stdin.on("end", () => {
      try {
        const sha = JSON.parse(payload)?.sha;
        if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) process.exit(1);
        process.stdout.write(sha.toLowerCase());
      } catch {
        process.exit(1);
      }
    });
  ') || {
    printf 'Could not resolve an exact Framework commit for archive ref: %s\n' "$BRANCH" >&2
    printf 'Set OPL_FRAMEWORK_SOURCE_COMMIT to the expected 40-character SHA and retry.\n' >&2
    exit 1
  }
  commit=$(normalize_framework_source_commit "$commit") || {
    printf 'Resolved Framework archive commit was not a complete 40-character Git SHA.\n' >&2
    exit 1
  }
  printf '%s|github_commit_api\n' "$commit"
}

source_archive_url() {
  local source_commit=$1
  printf 'https://github.com/gaofeng21cn/one-person-lab/archive/%s.tar.gz\n' "$source_commit"
}

write_installed_source_identity() {
  local source_root=$1 install_mode=$2 framework_sha=$3 identity_source=$4
  local identity_path identity_tmp

  framework_sha=$(normalize_framework_source_commit "$framework_sha") || {
    printf 'Refusing to persist an invalid Framework source identity: %s\n' "$framework_sha" >&2
    exit 1
  }
  case "$install_mode" in
    archive|git)
      ;;
    *)
      printf 'Unsupported Framework install identity mode: %s\n' "$install_mode" >&2
      exit 1
      ;;
  esac
  case "$identity_source" in
    explicit_source_commit|install_ref|source_archive_url|github_commit_api|git_head)
      ;;
    *)
      printf 'Unsupported Framework install identity source: %s\n' "$identity_source" >&2
      exit 1
      ;;
  esac

  identity_path="$source_root/$INSTALL_SOURCE_IDENTITY"
  identity_tmp="$identity_path.tmp.$$"
  if [ -d "$identity_path" ] && [ ! -L "$identity_path" ]; then
    printf 'Framework source identity path must not be a directory: %s\n' "$identity_path" >&2
    exit 1
  fi
  rm -f "$identity_path" "$identity_tmp"
  (
    umask 077
    printf '{\n  "schema": "opl_framework_installed_source_identity.v1",\n  "framework_sha": "%s",\n  "install_mode": "%s",\n  "identity_source": "%s"\n}\n' \
      "$framework_sha" "$install_mode" "$identity_source" > "$identity_tmp"
  )
  if [ ! -f "$identity_tmp" ] || [ -L "$identity_tmp" ]; then
    printf 'Framework source identity temporary file is not a regular file: %s\n' "$identity_tmp" >&2
    exit 1
  fi
  mv "$identity_tmp" "$identity_path"
  if [ ! -f "$identity_path" ] || [ -L "$identity_path" ]; then
    printf 'Framework source identity is not a regular non-symlink file: %s\n' "$identity_path" >&2
    exit 1
  fi
}

write_git_source_identity() {
  local framework_sha identity_source
  if [ -n "${OPL_FRAMEWORK_SOURCE_COMMIT:-}" ]; then
    framework_sha=$OPL_FRAMEWORK_SOURCE_COMMIT
    identity_source=explicit_source_commit
  elif git_is_usable; then
    framework_sha=$(git -C "$INSTALL_DIR" rev-parse HEAD)
    identity_source=git_head
  elif [ -f "$INSTALL_DIR/$INSTALL_SOURCE_IDENTITY" ] && [ ! -L "$INSTALL_DIR/$INSTALL_SOURCE_IDENTITY" ]; then
    return 0
  else
    printf 'Cannot persist the installed Framework source identity without Git or OPL_FRAMEWORK_SOURCE_COMMIT.\n' >&2
    exit 1
  fi
  write_installed_source_identity "$INSTALL_DIR" git "$framework_sha" "$identity_source"
}

install_from_archive() {
  local archive_tmp extract_root source_dir source_identity source_commit identity_source archive_url
  archive_tmp=$(mktemp "${TMPDIR:-/tmp}/one-person-lab.XXXXXX")
  extract_root=$(mktemp -d "${TMPDIR:-/tmp}/one-person-lab-src.XXXXXX")
  ARCHIVE_TMP_TO_CLEAN=$archive_tmp
  ARCHIVE_EXTRACT_ROOT_TO_CLEAN=$extract_root
  trap cleanup_archive_tmp EXIT

  log "Downloading One Person Lab source archive into $INSTALL_DIR"
  source_identity=$(resolve_archive_source_identity)
  IFS='|' read -r source_commit identity_source <<< "$source_identity"
  archive_url=${OPL_SOURCE_ARCHIVE_URL:-$(source_archive_url "$source_commit")}
  curl --http1.1 --connect-timeout 20 --max-time 300 --retry 3 --retry-delay 2 --retry-all-errors -fsSL \
    "$archive_url" \
    -o "$archive_tmp"
  tar -xzf "$archive_tmp" -C "$extract_root"
  source_dir=$(find "$extract_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)
  if [ -z "$source_dir" ] || [ ! -d "$source_dir" ]; then
    printf 'Downloaded One Person Lab source archive did not contain an installable directory.\n' >&2
    exit 1
  fi
  printf 'archive\n' > "$source_dir/$INSTALL_SOURCE_MARKER"
  write_installed_source_identity "$source_dir" archive "$source_commit" "$identity_source"
  rm -rf "$INSTALL_DIR"
  mv "$source_dir" "$INSTALL_DIR"
  trap - EXIT
  cleanup_archive_tmp
}

cleanup_archive_tmp() {
  if [ -n "$ARCHIVE_TMP_TO_CLEAN" ]; then
    rm -f "$ARCHIVE_TMP_TO_CLEAN"
    ARCHIVE_TMP_TO_CLEAN=
  fi
  if [ -n "$ARCHIVE_EXTRACT_ROOT_TO_CLEAN" ]; then
    rm -rf "$ARCHIVE_EXTRACT_ROOT_TO_CLEAN"
    ARCHIVE_EXTRACT_ROOT_TO_CLEAN=
  fi
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

if [ ! -f "$INSTALL_DIR/$INSTALL_SOURCE_MARKER" ]; then
  write_git_source_identity
fi

cd "$INSTALL_DIR"

log "Installing OPL CLI"
if [ -n "$PREFILLED_NODE_MODULES_DIR" ]; then
  if [ ! -d "$PREFILLED_NODE_MODULES_DIR" ]; then
    printf 'Prefilled OPL dependencies directory does not exist: %s\n' "$PREFILLED_NODE_MODULES_DIR" >&2
    exit 1
  fi
  log "Restoring prefilled OPL dependencies"
  rm -rf node_modules
  cp -R "$PREFILLED_NODE_MODULES_DIR" node_modules
  link_cli_carrier --ignore-scripts
elif [ "$CARRIER_ONLY" = "1" ]; then
  install_node_dependencies --omit=dev --ignore-scripts
  link_cli_carrier --ignore-scripts
else
  install_node_dependencies
  link_cli_carrier
fi

if [ "$CARRIER_ONLY" = "1" ]; then
  log "OPL base carrier is ready"
  exit 0
fi

log "Preparing the local background-service runtime"
node scripts/install-temporal-cli.mjs
export PATH="$HOME/.local/bin:$PATH"

log "Running complete One Person Lab setup"
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
