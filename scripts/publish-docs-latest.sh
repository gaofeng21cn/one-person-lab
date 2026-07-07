#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

site_dir="${OPL_DOCS_SITE_DIR:-docs/site/latest}"
remote="${OPL_DOCS_REMOTE:-origin}"
publish_branch="${OPL_DOCS_PUBLISH_BRANCH:-gh-pages}"

if [[ -n "${OPL_DOCS_BUILD_COMMAND:-}" ]]; then
  echo "==> Building latest docs locally: ${OPL_DOCS_BUILD_COMMAND}"
  bash -lc "${OPL_DOCS_BUILD_COMMAND}"
elif [[ -f package.json ]] && node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['docs:latest'] ? 0 : 1)"; then
  echo "==> Building latest docs locally: npm run docs:latest"
  npm run docs:latest
elif [[ -f scripts/build-opl-cloud-whitepaper.ts ]]; then
  echo "==> Building latest docs locally: node --experimental-strip-types scripts/build-opl-cloud-whitepaper.ts"
  node --experimental-strip-types scripts/build-opl-cloud-whitepaper.ts
else
  echo "No docs build command found. Set OPL_DOCS_BUILD_COMMAND or add docs:latest." >&2
  exit 1
fi

if [[ ! -d "$site_dir" ]]; then
  echo "Missing generated docs directory: $site_dir" >&2
  exit 1
fi

if find "$site_dir" -name index.html -print -quit | grep -q .; then
  echo "Refusing to publish index.html; use artifact-aligned HTML filenames." >&2
  exit 1
fi

if ! find "$site_dir" -type f \( -name '*.html' -o -name '*.pdf' -o -name '*.pptx' \) -print -quit | grep -q .; then
  echo "No public HTML/PDF/PPTX files found under $site_dir" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "warning: publishing from a dirty checkout; only generated docs are copied" >&2
fi

tmp_parent="$(mktemp -d "${TMPDIR:-/tmp}/opl-docs-publish.XXXXXX")"
tmp_worktree="$tmp_parent/worktree"
tmp_branch="docs-publish-$(date +%s)-$$"

cleanup() {
  git worktree remove --force "$tmp_worktree" >/dev/null 2>&1 || true
  git branch -D "$tmp_branch" >/dev/null 2>&1 || true
  rm -rf "$tmp_parent"
}
trap cleanup EXIT

git worktree add --detach "$tmp_worktree" HEAD >/dev/null
git -C "$tmp_worktree" checkout --orphan "$tmp_branch" >/dev/null
git -C "$tmp_worktree" rm -rf . >/dev/null 2>&1 || true
mkdir -p "$tmp_worktree/latest"

rsync -a \
  --exclude '*.md' \
  --exclude '*.qmd' \
  --exclude '*.tex' \
  --exclude '*.json' \
  --exclude '.DS_Store' \
  "$repo_root/$site_dir"/ "$tmp_worktree/latest"/

touch "$tmp_worktree/.nojekyll"

if find "$tmp_worktree/latest" -type f \( -name '*.md' -o -name '*.qmd' -o -name '*.tex' -o -name '*.json' \) -print -quit | grep -q .; then
  echo "Refusing to publish process files." >&2
  exit 1
fi

git -C "$tmp_worktree" add -A
git -C "$tmp_worktree" commit -m "docs: publish latest docs" >/dev/null
git -C "$tmp_worktree" push "$remote" "HEAD:$publish_branch" --force

echo "Published $site_dir to $remote/$publish_branch:/latest"
