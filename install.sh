#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${OPL_REPO_URL:-https://github.com/gaofeng21cn/one-person-lab.git}
INSTALL_DIR=${OPL_INSTALL_DIR:-$HOME/.opl/one-person-lab}
BRANCH=${OPL_INSTALL_BRANCH:-main}
BOOTSTRAP_ONLY=${OPL_BOOTSTRAP_ONLY:-0}

INSTALL_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --bootstrap-only)
      BOOTSTRAP_ONLY=1
      ;;
    *)
      INSTALL_ARGS+=("$arg")
      ;;
  esac
done
set -- "${INSTALL_ARGS[@]}"

log() {
  printf '==> %s\n' "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    printf '\n' >&2
    printf 'One Person Lab needs git, Node.js, and npm before it can run the one-shot installer.\n' >&2
    if [ "$(uname -s)" = "Darwin" ]; then
      printf 'Fastest macOS setup:\n' >&2
      printf '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n' >&2
      printf '  brew install git node\n' >&2
    elif command -v apt-get >/dev/null 2>&1; then
      printf 'Fastest Debian/Ubuntu setup:\n' >&2
      printf '  sudo apt-get update && sudo apt-get install -y git nodejs npm\n' >&2
    elif command -v dnf >/dev/null 2>&1; then
      printf 'Fastest Fedora/RHEL setup:\n' >&2
      printf '  sudo dnf install -y git nodejs npm\n' >&2
    elif command -v apk >/dev/null 2>&1; then
      printf 'Fastest Alpine setup:\n' >&2
      printf '  apk add --no-cache git nodejs npm\n' >&2
    else
      printf 'Install git, Node.js, and npm with your system package manager, then rerun this installer.\n' >&2
    fi
    printf '\n' >&2
    printf 'After that, rerun:\n' >&2
    printf '  curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash\n' >&2
    exit 1
  fi
}

need_cmd git
need_cmd node
need_cmd npm

mkdir -p "$(dirname "$INSTALL_DIR")"

if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating One Person Lab in $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch --prune origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  if [ -e "$INSTALL_DIR" ]; then
    printf 'Install directory exists but is not a git checkout: %s\n' "$INSTALL_DIR" >&2
    printf 'Move it away or set OPL_INSTALL_DIR to another path.\n' >&2
    exit 1
  fi
  log "Cloning One Person Lab into $INSTALL_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

log "Installing OPL CLI"
npm install
npm link

if [ "$BOOTSTRAP_ONLY" = "1" ]; then
  log "OPL CLI is ready"
  exit 0
fi

log "Running one-shot OPL setup"
if command -v opl >/dev/null 2>&1; then
  opl install "$@"
else
  ./bin/opl install "$@"
fi

log "One Person Lab is ready"
printf '\nNext steps:\n'
printf '  1. Open the One Person Lab App on macOS, or open the Docker/WebUI URL from your deployment.\n'
printf '  2. Choose a workspace root when the App asks for it.\n'
printf '  3. Run "opl system initialize" to inspect Codex, Hermes-Agent, modules, skills, and GUI state.\n'
