#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${OPL_REPO_URL:-https://github.com/gaofeng21cn/one-person-lab.git}
INSTALL_DIR=${OPL_INSTALL_DIR:-$HOME/.opl/one-person-lab}
BRANCH=${OPL_INSTALL_BRANCH:-main}

log() {
  printf '==> %s\n' "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    printf 'Install it first, then rerun this installer.\n' >&2
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

log "Running one-shot OPL setup"
if command -v opl >/dev/null 2>&1; then
  opl install "$@"
else
  ./bin/opl install "$@"
fi

log "One Person Lab is ready"
