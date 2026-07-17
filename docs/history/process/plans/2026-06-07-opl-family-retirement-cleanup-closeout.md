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
| `one-person-lab` | Framework active outputs no longer expose retained App/WebUI, Product API, legacy developer-mode, or MAS paper-alias compatibility fields. | `01d60cbf refactor: retire framework compatibility surfaces` | Retired duplicate App state / dashboard / package / stage-log compatibility surfaces and updated contracts, tests, and support docs. |

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

## OPL Framework compatibility surface thinning

Retired surfaces:

- `app_state.developer_profile.legacy_developer_mode`; the canonical top-level `developer_mode` surface remains.
- `status dashboard` GUI fields that projected retired Product API readiness: `local_web_status`, `local_web_command`, and `hosted_runtime_readiness`.
- `packages.webui_docker_image` in Framework package manifests; App/WebUI image coordinates and publish evidence now live only in App-owned release/contracts/evidence.
- Standard `stage_progress_log.user_stage_log` MAS paper aliases and legacy semantic sources: `paper_stage_log`, `paper_work_done`, `changed_paper_surfaces`, and generic `human_summary` advertisement. Canonical sources are `user_stage_log`, `stage_log_summary`, and `human_stage_log`; canonical work fields are `stage_work_done` and `changed_stage_surfaces`.

Updated owner surfaces:

- `src/app-state.ts`, `src/management/runtime-dashboard.ts`, `src/package-distribution.ts`, `src/family-runtime-stage-progress-log.ts`, `src/family-runtime-codex-stage-runner.ts`, `src/runtime-tray-app-operator-drilldown-parts/workstream-operating-loop.ts`, `src/standard-domain-agent-scaffold-constants.ts`.
- `contracts/opl-framework/family-runtime-attempt-contract.json` and `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`.
- Focused tests for App state provider source, system dashboard, workspace registry, package distribution, stage-attempt usage, and family-runtime attempt contract.
- Current support docs for Docker/WebUI and release package distribution.

This is a Framework surface thinning, not a domain cleanup receipt. MAS progress-study snapshots that still contain `human_summary` remain domain/MAS progress material and are not the standard OPL stage-log contract.

## Fresh family stale-surface audit tranche

Fresh status on `2026-06-07`:

| repo | git status | stale-surface result |
| --- | --- | --- |
| `one-person-lab` | `main` at `9c7de95d`, ahead `origin/main` by one commit, with only this closeout document dirty; one clean residual CI worktree at `.worktrees/github-ci-20260607-readmodel-closeout-fix` | Framework compatibility thinning is already on `main` via `01d60cbf`; stage operating principles are active via `02fc83f0` and `ba3beea7`. No additional main-checkout physical deletion candidate had enough owner evidence in this tranche. |
| `med-autoscience` | clean `main` at `72086f53` | Current recent main includes workspace topology and stage operating principles adoption. No fresh dirty residue or immediately deletable stale module was observed from this tranche. |
| `med-autogrant` | clean `main` at `a13b59d` | Sentrux/runtime facade and product-entry facade retirement candidates are already closed in current source/ledger; remaining `legacy` / `alias` / `facade` hits are negative guards, tombstone/provenance, domain aliases, or evidence-gated wrapper delete tails. |
| `redcube-ai` | clean `main` at `52db85b9` | Flat Stage Folder fixture retirement is already on `main`; remaining retired-surface hits are no-resurrection guards, tombstones, RCA domain alias metadata, or strict post-cutover wrapper delete tails. |
| `opl-meta-agent` | clean `main` at `c685dbf` | Meta-agent-loop facade and target-progress alias retirement candidates are already closed on current `main`; remaining generic wrapper/materializer tails need OMA/OPL generated-surface caller proof before physical deletion. |
| `one-person-lab-app` | `main` with unrelated local `package.json` modification and untracked `index.js` | App Build and Release workflow retirement is already closed in current history; this tranche did not mutate App because the dirty files were outside the current write set. Remaining candidate-shell and release surfaces stay under App-owned contracts. |

The earlier residual `opl-management-speed-gate-20260607` lane is not an absorb target for this closeout. Its old stage operating implementation has been superseded by the current main source and tests:

- `src/standard-domain-agent-stage-operating-principles.ts`
- `src/standard-domain-agent-conformance.ts`
- `src/standard-domain-agent-scaffold-template.ts`
- `contracts/stage_operating_principles.json`
- `tests/src/cli/cases/agents-conformance-stage-operating-principles.test.ts`
- `tests/src/cli/cases/agents-scaffold.test.ts`

Current main evidence: `02fc83f0 test: gate stage operating principles`, `ba3beea7 Require stage operating principles in agent scaffold`, and `a7b279d4 docs: fold scaffold stage policy gate into active gap`.

This tranche deliberately did not delete tests that assert absence of retired fields, block legacy alias resurrection, or keep tombstone/provenance classifications. Those tests are active no-resurrection guards, not compatibility surfaces.

## Remaining retirement work

Broader OPL-family cleanup remains a live multi-repo effort. Future physical deletion still needs per-surface proof from current owners:

- Active caller scan.
- Contract/test/source refs scan.
- Replacement parity or current owner surface proof.
- Domain owner cleanup receipt, typed blocker, no-regression ref, or explicit keep-as-authority-adapter ref where required.
- No forbidden writes.
- Tombstone/provenance only when history is still useful.

OPL refs-only cleanup read models, conformance passes, doc foldback, and tests are not physical delete authority by themselves.

Carry-forward scope:

- Keep scanning README/docs/source/test/contract surfaces in the six core repos until the coverage ledger has no unreviewed sections.
- For MAG/RCA/OMA repo-local wrapper or adapter tails, require generated/default-caller consumption, no-active-caller proof, owner receipt or typed blocker, no-forbidden-write proof, and repo-native verification before physical deletion.
- For App candidate shells, release workflow, installer, and Homebrew surfaces, use App-owned contracts and release-boundary validators as the authority; do not let shell-carrier or design-reference evidence retire App product authority.
- Preserve negative guards and tombstones when they are the machine-readable no-resurrection boundary.

## 2026-06-29 cleanup closeout readback

This follow-up records the compact final state of the OPL / MAG / RCA cleanup
optimization list. It is docs-only provenance for the closeout batch; it does
not reopen the physical-delete plan, replace repo-local owner docs, or claim
runtime, release, domain, production, App, Brand L5, owner-receipt or typed
blocker readiness.

| Area | Final state | Evidence boundary |
| --- | --- | --- |
| OPL retired decisions history | Landed/current on OPL `origin/main` through `d569a9f32edcf9ab772cce35f697f27fa838a64a` and current head `e66cdd076d8c6a45a15fb533d140b62a2c25c2e7`. | `d569a9f3 docs: archive retired runtime decision history`; `e66cdd07 fix(release): pin default App release currentness`; both are ancestors of OPL `origin/main` in the 2026-06-29 readback. |
| RCA current-program split | Landed/current in RCA at `78efea47620cf32ae7be34b1a8284f81dc283104`. | `78efea47 refactor(contracts): split current program generator`; RCA `main...origin/main`; commit is ancestor of RCA `origin/main`. The split covers the current-program leaf / index / manifest / script generator surface. |
| MAG source policy split | Landed/current in MAG at `c6f2058bd14c87a7bd8f1b8761578bb54a5533bc`. | `c6f2058 refactor(source): split standard pack source policy`; MAG `main...origin/main`; commit is ancestor of MAG `origin/main`. |
| MAS backlog | Deferred to MAS owner docs and MAS repo truth. | This OPL history note does not carry MAS backlog authority, paper progress, package authority, owner receipt, typed blocker, or runtime readiness. |
| Aion / Hermes shell surfaces | Excluded from this OPL / MAG / RCA cleanup closeout. | Aion/Hermes shell work remains upstream-fork / App-owned / explicit adapter context, not an OPL main-repo cleanup tail for this batch. |

Primary OPL brand module: `OPL Charter`, because this closeout only governs
docs lifecycle and cross-repo cleanup provenance. Coordinating modules:
`OPL Runway` and `OPL Foundry Kernel`, because the recorded landed work touches
runtime/history boundary wording and standard-agent cleanup surfaces. Not
touched: source, tests, contracts, release artifacts, provider queues, domain
truth, owner receipts, typed blockers, MAS backlog bodies, Aion shell bodies or
Hermes shell bodies.

L1 docs verification boundary for this follow-up:

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs
rtk opl-doc-doctor doctor . --format json
```

Passing these checks proves only this history/provenance patch is syntactically
clean and remains inside the docs portfolio. The repo-local implementation and
verification evidence for RCA, MAG and OPL remains in their named commits,
git history, repo-native checks and owner docs.
