#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: scripts/run-with-repo-temp-env.sh <command> [args...]" >&2
  exit 2
fi

cleanup_temp_root=0
source_home="${HOME:-}"
if [ -n "${OPL_REPO_TEMP_ROOT:-}" ]; then
  repo_temp_root="${OPL_REPO_TEMP_ROOT}"
else
  repo_temp_root="$(mktemp -d "${TMPDIR:-/tmp}/opl-repo-temp.XXXXXX")"
  cleanup_temp_root=1
fi
mkdir -p "${repo_temp_root}"
repo_temp_root="$(cd "${repo_temp_root}" && pwd -P)"

cleanup() {
  if [ "${cleanup_temp_root}" = "1" ]; then
    rm -rf "${repo_temp_root}"
  fi
}
trap cleanup EXIT

mkdir -p \
  "${repo_temp_root}/home/.codex" \
  "${repo_temp_root}/state" \
  "${repo_temp_root}/tmp" \
  "${repo_temp_root}/python/pycache" \
  "${repo_temp_root}/python/pytest-cache" \
  "${repo_temp_root}/uv/cache" \
  "${repo_temp_root}/uv/project-venv" \
  "${repo_temp_root}/pip/cache" \
  "${repo_temp_root}/npm/cache" \
  "${repo_temp_root}/node/compile-cache" \
  "${repo_temp_root}/cargo-target" \
  "${repo_temp_root}/xdg-cache" \
  "${repo_temp_root}/xdg-config" \
  "${repo_temp_root}/xdg-data" \
  "${repo_temp_root}/xdg-state"

case "${TMPDIR:-}" in
  */) export TMPDIR="${repo_temp_root}/tmp/" ;;
  *) export TMPDIR="${repo_temp_root}/tmp/" ;;
esac

export OPL_REPO_TEMP_ENV_ACTIVE=1
export OPL_REPO_TEMP_ROOT="${repo_temp_root}"
export HOME="${repo_temp_root}/home"
export CODEX_HOME="${HOME}/.codex"
export OPL_STATE_DIR="${repo_temp_root}/state"
export PYTHONDONTWRITEBYTECODE="${PYTHONDONTWRITEBYTECODE:-1}"
export PYTHONPYCACHEPREFIX="${repo_temp_root}/python/pycache"
export PYTEST_ADDOPTS="${PYTEST_ADDOPTS:-} -p no:cacheprovider -o cache_dir=${repo_temp_root}/python/pytest-cache"
export UV_CACHE_DIR="${repo_temp_root}/uv/cache"
export UV_PROJECT_ENVIRONMENT="${repo_temp_root}/uv/project-venv"
export PIP_CACHE_DIR="${repo_temp_root}/pip/cache"
export NPM_CONFIG_CACHE="${repo_temp_root}/npm/cache"
export npm_config_cache="${NPM_CONFIG_CACHE}"
export NODE_COMPILE_CACHE="${repo_temp_root}/node/compile-cache"
export CARGO_TARGET_DIR="${repo_temp_root}/cargo-target"
export XDG_CACHE_HOME="${repo_temp_root}/xdg-cache"
export XDG_CONFIG_HOME="${repo_temp_root}/xdg-config"
export XDG_DATA_HOME="${repo_temp_root}/xdg-data"
export XDG_STATE_HOME="${repo_temp_root}/xdg-state"

# Native verification still reads the installed Rust toolchain after HOME is isolated.
if [ -n "${source_home}" ]; then
  export CARGO_HOME="${CARGO_HOME:-${source_home}/.cargo}"
  export RUSTUP_HOME="${RUSTUP_HOME:-${source_home}/.rustup}"
fi

"$@"
