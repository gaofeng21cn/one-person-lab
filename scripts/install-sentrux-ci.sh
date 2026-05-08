#!/usr/bin/env bash
set -euo pipefail

install_dir="${SENTRUX_INSTALL_DIR:-$HOME/.local/bin}"
version="${SENTRUX_VERSION:-0.5.7}"
repo="${SENTRUX_REPO:-sentrux/sentrux}"

mkdir -p "$install_dir"

if command -v sentrux >/dev/null 2>&1; then
  sentrux --version
  exit 0
fi

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin)
    case "$arch" in
      arm64|aarch64) artifact="sentrux-darwin-arm64" ;;
      *) echo "Unsupported Sentrux CI architecture: $os/$arch" >&2; exit 1 ;;
    esac
    ;;
  Linux)
    case "$arch" in
      x86_64) artifact="sentrux-linux-x86_64" ;;
      aarch64|arm64) artifact="sentrux-linux-aarch64" ;;
      *) echo "Unsupported Sentrux CI architecture: $os/$arch" >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported Sentrux CI OS: $os" >&2
    exit 1
    ;;
esac

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/sentrux-ci.XXXXXX")"
trap 'rm -rf "$tmpdir"' EXIT

url="https://github.com/${repo}/releases/download/v${version}/${artifact}"
curl -fsSL "$url" -o "$tmpdir/sentrux"
chmod +x "$tmpdir/sentrux"
mv "$tmpdir/sentrux" "$install_dir/sentrux"

if [[ ":$PATH:" != *":$install_dir:"* ]]; then
  export PATH="$install_dir:$PATH"
fi

if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "$install_dir" >> "$GITHUB_PATH"
fi

sentrux --version
