# OPL series docs governance tranche ledger part 46

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_46`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 fresh-install contract、App release channel、codesign/notarization oracle、VM runner contract、release evidence artifact set、domain truth、artifact authority、quality verdict、owner receipt 或 production readiness oracle。当前 truth 回到 `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`、`contracts/opl-framework/fresh-install-test-matrix.json`、核心五件套、source、tests、CLI/read-model、runtime ledger、`one-person-lab-app` release / first-run contracts、workflows、tests 与真实 release evidence。
Date: `2026-05-29`

## Scope

本轮继续处理 OPL fresh-install / GUI first-launch support reference 与 fresh-install contract 中的 App-owned release currentness：

- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `contracts/opl-framework/fresh-install-test-matrix.json`
- focused contract guard in `tests/src/fresh-install-smoke.test.ts`
- process ledger index

目标是保留 OPL 主仓 CLI clean-room、first-run log、GUI automation label 和基础 VM evidence consumption boundary，同时避免 OPL 合同或支撑文档把 App codesign/notarization、standard / Full DMG release gates、VM release profile、runner 配置或完整 artifact set 写成 Framework-owned 当前事实。

## Fresh Evidence

本轮 live evidence：

- OPL repo
  - `.github/workflows/verify.yml` 的 OPL 主仓 Verify workflow 跑 build/typecheck、fast、read-model-gates、regression、integration、fresh-install、native、lint/structure；未持有 App codesign/notarization release gate。
  - `.github/workflows/packages.yml` 持有 OPL module package manifest / GHCR package 与 WebUI image publish lane，不是 App DMG signing/notarization gate。
  - `contracts/opl-framework/fresh-install-test-matrix.json` 持有 CLI clean-room scenarios、first-run JSONL、GUI accessibility labels、App VM command shape 和 CI policy。
  - `tests/src/fresh-install-smoke.test.ts` 验证 fresh-install matrix、retired `online_management` negative guard、GUI labels 和 App VM workflow boundary。
  - `scripts/fresh-install-smoke.mjs` 验证 local CLI clean-room scenarios，仍不跑真实 App GUI release VM gate。
  - `src/system-installation/first-run-contract.ts` 仍持有 runtime first-run log、automation labels、VM implementation metadata 和 local clean-room matrix builder；`ci_policy` 的 overclaim 只在 tracked JSON contract 中。
- `one-person-lab-app` live read, read-only because the App repo had unrelated local modifications:
  - `AGENTS.md` 声明 App repo 是 desktop packaging、release assets、updater metadata、user guides、screenshots、first-run checks、GUI product requirements、GUI page-state tests 和 App release gates 的 sole control root。
  - `contracts/app-first-run-test-matrix.json` 声明 standard / Full / one-shot / Docker WebUI first-run scenarios、shared `opl system initialize --json` progress model、ready-to-launch gate 和 release evidence artifact refs including `artifacts/assistant-route-smoke-summary.json`。
  - `contracts/app-release-channel.json` 声明 standard updater、Full first-install payload boundary、release workflows、VM gates、remote verification、Full signing/checksum verification 和 release evidence acceptance boundary。
  - `docs/release/README.md` 声明 App repo owns standard package, Full first-install DMG, updater metadata, GitHub Release uploads, release asset normalization, GUI smoke and user-facing release notes; OPL Framework is only payload source for runtime/CLI/contracts.
  - `.github/workflows/desktop-release.yml` calls App `opl-first-run-vm.yml` for standard/Full clean VM smoke and aggregates `release-readiness-summary.json`.
  - `.github/workflows/opl-first-run-vm.yml` runs clean VM first launch smoke with `--assistant-route-smoke` and owns artifact upload.
  - `.github/workflows/full-first-install-release.yml` owns Full checksum and optional strict codesign/spctl checks.
  - `tests/release/app-release-boundary.test.ts` and related release tests assert App release/VM/assistant-route smoke boundaries.

## Changes

- `contracts/opl-framework/fresh-install-test-matrix.json`
  - Rewrote `ci_policy.github_actions` so OPL-owned GitHub Actions are build/typecheck, local CLI fresh-install smoke, package/verification lanes and non-GUI assertions.
  - Moved codesign/notarization, standard / Full DMG release gates, VM release profiles and release evidence to App release workflows/contracts.
- `tests/src/fresh-install-smoke.test.ts`
  - Added a focused guard that the fresh-install matrix says App release workflows own codesign/notarization.
  - Added a negative assertion so the old wording where OPL GitHub Actions directly run codesign/notarization does not return.
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
  - Clarified that signing/notarization mode, release profile and complete artifact upload strategy are App-owned release/test truth.
  - Replaced the OPL-side "must collect artifacts" wording with OPL-side "basic evidence fields consumed" wording, while pointing full artifact set, file names, upload paths, release cohort and readiness gate back to App release/testing contracts, workflow and evidence.
  - Rewrote CI layering so OPL Verify owns local CLI/build/package/non-GUI lanes and App workflows own codesign/notarization and DMG/VM release gates.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-46.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 46 index row.

No App repo files, release artifacts, runtime ledgers, domain repo files, GUI shell implementation, App workflow files or OPL runtime behavior were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `contracts/opl-framework/fresh-install-test-matrix.json`
- `tests/src/fresh-install-smoke.test.ts`
- `scripts/fresh-install-smoke.mjs`
- `src/system-installation/first-run-contract.ts`
- `.github/workflows/verify.yml`
- `.github/workflows/packages.yml`
- `contracts/README.md`
- `contracts/opl-framework/README.md`
- `contracts/opl-framework/README.zh-CN.md`
- `one-person-lab-app/AGENTS.md`
- `one-person-lab-app/TASTE.md`
- `one-person-lab-app/contracts/app-first-run-test-matrix.json`
- `one-person-lab-app/contracts/app-release-channel.json`
- `one-person-lab-app/docs/release/README.md`
- `one-person-lab-app/.github/workflows/desktop-release.yml`
- `one-person-lab-app/.github/workflows/opl-first-run-vm.yml`
- `one-person-lab-app/.github/workflows/full-first-install-release.yml`
- `one-person-lab-app/tests/release/app-release-boundary.test.ts`
- part 27, part 36 and part 45 process ledgers

Edited:

- `contracts/opl-framework/fresh-install-test-matrix.json`
- `tests/src/fresh-install-smoke.test.ts`
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-46.md`
- `docs/history/process/plans/README.md`

No docs, modules, interfaces, workflows or App release files were archived, tombstoned or deleted in this tranche.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `aa0ac358` before part46 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part46-fresh-install-currentness`.
- Branch: `codex/opl-doc-governance-20260529-part46-fresh-install-currentness`, based on root `main`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-framework-self-update-20260529`.
- Retained unrelated App repo local modifications in `/Users/gaofeng/workspace/one-person-lab-app`; this tranche read them only as live context and did not modify the App repo.

## Remaining stale / retire candidates

- Continue scanning `docs/references/current-support/*` for App release evidence, VM gate, Docker/WebUI, active-shell path, package payload and provider evidence wording that freezes App-owned dynamic facts.
- Re-check Docker/WebUI support reference against App release contracts/workflows and active shell Dockerfile/web-cli source; keep Docker proof out of macOS desktop first-launch proof.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**` and public docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.

## Verification

Fresh verification before absorb:

- `npm ci` was required because the isolated worktree lacked `node_modules`; it exited `0` and ran `npm run build`. npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this tranche.
- Initial focused test attempt failed because the new negative assertion used a broad `/Run .*codesign\/notarization/` regexp that matched across the new App-owned sentence; the guard was narrowed to the first OPL-owned policy sentence.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md`.
- Focused fresh-install / verification-surface tests passed: `node --experimental-strip-types --test tests/src/fresh-install-smoke.test.ts tests/src/verification-command-surfaces.test.ts`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Prefer Docker/WebUI or another current-support tranche backed by fresh OPL/App contracts, workflow, active shell source and tests.
- Keep tranches small: edit only the support doc / contract / focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
