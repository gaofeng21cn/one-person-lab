# OPL family retirement cleanup closeout 2026-06-07

Owner: `One Person Lab`
Purpose: `opl_family_retirement_cleanup_closeout`
State: `history_closeout`
Machine boundary: 本文只记录本轮跨仓退役清理过程与证据边界。当前 truth 继续归各 repo 的 contracts、source、tests、release/workflow artifacts、runtime ledger、provider receipt、domain-owned owner receipt / typed blocker、App/operator read model 和 fresh CLI 输出。

## Scope

本轮承接 OPL family 重构后的 direct-retirement 规则，优先清理已经被当前 owner surface 替代、且不需要保留兼容面的 App release-boundary surface。

本轮实际落地范围：

| repo | closeout | commit | result |
| --- | --- | --- | --- |
| `one-person-lab-app` | Release-boundary tests no longer treat narrative docs or `scripts/README.md` prose as machine oracle. | `c5a645e test: retire release-boundary docs prose oracles` | Retired docs-prose release-boundary assertions and recorded App-local history closeout. |
| `one-person-lab-app` | Homebrew tap update path is direct-commit-only; PR mode and workflow compatibility were removed. | `93e76d7 ci: make Homebrew tap updates direct-only` | Retired `write_mode`, `pull_request` mode, `peter-evans/create-pull-request`, Nightly App tap PR job, and App release workflow PR permission. |

## App release-boundary docs-prose oracle retirement

Retired surfaces:

- Exact prose reads/assertions against App `docs/release/README.md`, `docs/testing/README.md`, `docs/status.md`, `docs/architecture.md`, and `scripts/README.md`.
- `macos_stable_local_authorization_docs` validation item in App release-boundary validation.

Current owner surfaces:

- App contracts, release workflows, package scripts, validators, generated artifacts, installer scripts, runtime bridge contracts, active-shell validators, and release-boundary tests over machine-readable surfaces.
- Narrative docs remain human guidance and public/product explanation; they are not release-boundary machine interfaces.

Observed verification:

```bash
rtk npm run ensure:shell
rtk npm run validate:release-boundary
rtk npm run test:release-boundary -- --runInBand
rtk git diff --check
rtk rg -n -I -e '^(<<<<<<< |=======|>>>>>>> |\|\|\|\|\|\|\| )' tests docs scripts contracts .github
rtk rg -n "readFileSync\(path\.join\(appRoot, 'docs|readFileSync\(path\.join\(appRoot, 'scripts', 'README'|docs/.+README|docs', 'release|docs', 'testing|docs', 'status|scripts', 'README|releaseDocs|testingDocs|scriptsDocs|statusDocs|combinedDocs|macos_stable_local_authorization_docs" tests/release/app-release-boundary-cases scripts/validate-release-boundary.ts
rtk opl-doc-doctor doctor . --format json
```

Result: `ensure:shell` passed against shell commit `4a1154d4c313`; release-boundary validator passed; release-boundary tests passed `115/115`; diff whitespace and conflict-marker scans were clean; targeted docs-prose oracle scan had no matches; doc doctor returned `finding_count=0`.

## App Homebrew direct-commit-only retirement

Retired surfaces:

- App Homebrew tap workflow `write_mode` input.
- App tap `pull_request` mode.
- `peter-evans/create-pull-request`.
- Nightly App release workflow tap PR job and pull-request permission.
- App release workflow `pull-requests: read` permission used only for the retired PR path.

Current owner surfaces:

- `contracts/app-release-channel.json` declares `app_release_direct_workflow`, `app_release_direct_token`, `app_release_pull_request_allowed: false`, and `app_release_workflow_write_mode: direct_commit_only`.
- `.github/workflows/homebrew-tap-update.yml` requires `OPL_HOMEBREW_TAP_TOKEN` and writes direct commits only.
- Stable release workflow calls the tap workflow without PR mode; Nightly no longer updates the App tap path.
- Tap freshness for Nightly remains a tap-repo self-sync concern; Full cask updates remain stable-only after Full gates pass.

Observed verification:

```bash
rtk npm run validate:release-boundary
rtk node --experimental-strip-types --input-type=module -e "import fs from 'node:fs'; const { validateReleaseChannelContract } = await import('./scripts/validate-active-shell/release-contract-validator.ts'); validateReleaseChannelContract(JSON.parse(fs.readFileSync('contracts/app-release-channel.json', 'utf8'))); console.log('release contract validator passed');"
rtk env OPL_APP_SHELL_ROOT=/Users/gaofeng/workspace/one-person-lab-app/.worktrees/release-boundary-doc-prose-guards/shells/aionui node --experimental-strip-types --test tests/release/app-release-boundary-cases/workflow-release-channels.ts tests/release/release-speed-vm-plan.test.ts
rtk env OPL_APP_SHELL_ROOT=/Users/gaofeng/workspace/one-person-lab-app/.worktrees/release-boundary-doc-prose-guards/shells/aionui npm run test:release-boundary -- --runInBand
rtk git diff --check
rtk rg -n -I -e '^(<<<<<<< |=======|>>>>>>> |\|\|\|\|\|\|\| )' .github contracts docs scripts tests
rtk opl-doc-doctor doctor . --format json
```

Result: release-boundary validator passed; release channel contract validator smoke passed; targeted release tests passed `16/16`; release-boundary tests passed `115/115`; diff whitespace and conflict-marker scans were clean; doc doctor returned `finding_count=0`.

The full release-boundary test run used `OPL_APP_SHELL_ROOT=/Users/gaofeng/workspace/one-person-lab-app/.worktrees/release-boundary-doc-prose-guards/shells/aionui` because the App main checkout `shells/aionui` worktree had unrelated dirty state. The release-boundary doc-prose worktree and branch were removed after both App commits were absorbed into App `main`.

## Boundaries

This closeout does not claim:

- A new App release cohort.
- Homebrew tap remote update success.
- Release readiness.
- Full clean-VM readiness.
- Domain ready, production ready, or OPL family global cleanup completion.

The App main checkout still had unrelated dirty files after this lane:

```text
.github/workflows/_build-reusable.yml
.github/workflows/desktop-release-promote.yml
.github/workflows/desktop-release.yml
.github/workflows/nightly-standard-release.yml
.github/workflows/release-verify-remote.yml
contracts/app-release-channel.json
scripts/validate-release-boundary.ts
scripts/verify-remote-release-assets.ts
tests/release/app-release-boundary-cases/helpers.ts
tests/release/app-release-boundary-cases/release-assets-and-remote-verification.ts
```

Those files were not part of this closeout unless named by commit `c5a645e` or `93e76d7`.

The OPL main checkout also had unrelated dirty files while this ledger was written:

```text
docs/references/operating-governance/family-structure-advisory-report.md
tests/src/cli/cases/family-runtime-evidence-worklist.test.ts
```

They are outside this closeout.

## Remaining retirement work

Broader OPL-family cleanup remains a live multi-repo effort. Future physical deletion still needs per-surface proof from current owners:

- Active caller scan.
- Contract/test/source refs scan.
- Replacement parity or current owner surface proof.
- Domain owner cleanup receipt, typed blocker, no-regression ref, or explicit keep-as-authority-adapter ref where required.
- No forbidden writes.
- Tombstone/provenance only when history is still useful.

OPL refs-only cleanup read models, conformance passes, doc foldback, and tests are not physical delete authority by themselves.
