# OPL series docs governance tranche ledger part 45

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_45`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 release/package contract、App release channel、Full DMG manifest、first-run VM gate、updater metadata、签名/公证 oracle、domain truth、quality verdict、artifact authority、owner receipt 或 production readiness oracle。当前 truth 回到 `docs/references/current-support/opl-release-packages-modular-distribution.md`、核心五件套、contracts、source、tests、CLI/read-model、runtime ledger、`one-person-lab-app` release contracts / workflows / evidence 和真实 GitHub Release assets。
Date: `2026-05-29`

## Scope

本轮继续处理 OPL release/package current-support reference 中的 App-owned Full 首装包 currentness：

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- process ledger index

目标是保留 stable owner boundary，同时避免 OPL 支撑文档把 Full DMG 文件名、runtime 安装路径、payload allowlist、first-run sequence、updater metadata、签名/公证模式或 VM gate 结果冻结成 Framework-owned 当前事实。

## Fresh Evidence

本轮 live evidence：

- OPL 核心五件套与 active gap plan
  - `one-person-lab` 持有 Framework / runtime / CLI / contracts owner 边界。
  - `one-person-lab-app` 持有 GUI product truth、release、updater、用户教程、页面状态和 active-shell validation owner 边界。
  - App selected cohort、verified package/provider refs、user-path evidence ready、refs-only ledger verified 或 workorder accounting closed 都不能写成 App release ready、domain ready 或 production ready。
- OPL package source / tests
  - `src/package-distribution.ts` 仍声明 `module_install_update_source=git_checkout` 与 `package_consumption_status=packages_defined_not_consumed_by_install_update`。
  - `tests/src/cli/cases/package-distribution.test.ts` 继续覆盖 package coordinates、git-checkout source、package consumption status、MDS negative case、archive builder、channel manifest、checksum、source git head SHA 和 release discipline gate。
  - `contracts/opl-framework/fresh-install-test-matrix.json` 的 first-run log 只保留 `family_runtime_provider_event_types`，并用 negative guard 防止旧 `online_management` 字段复活。
- `one-person-lab-app` live read, read-only because the App repo had unrelated local modifications:
  - `AGENTS.md` 声明 App repo 是 desktop packaging、release assets、updater metadata、user guides、screenshots、first-run checks、GUI product requirements、GUI page-state tests 和 App release gates 的 sole control root。
  - `contracts/app-release-channel.json` 声明 release repo、standard updater allowed metadata/assets、Full first-install boundary、required payloads、size budget、same-tag refresh、payload boundary、remote verification checks、workflow owners 和 VM gates。
  - `contracts/app-first-run-test-matrix.json` 声明 Full / standard first-run scenarios、shared `opl system initialize --json` progress model、ready-to-launch gate、Full runtime and provider readiness evidence、standard updater exclusion 和 release evidence artifacts。
  - `docs/release/README.md` 声明 App repo owns standard package, Full first-install DMG, updater metadata, GitHub Release uploads, release asset normalization, GUI smoke and user-facing release notes; OPL Framework is only a Full DMG runtime/CLI/contracts payload source.
  - `scripts/full-first-install-package.ts` builds current Full artifact names, runtime manifest layout, payload boundary, product-profile projection, updater exclusion and signing policy fields.
  - `scripts/build-full-first-install-package.ts` assembles Full runtime payloads, rejects retired `--hermes-root`, verifies Temporal runtime payload, writes Full manifest / README / SHA256SUMS and treats signing/notarization as App workflow inputs.
  - `scripts/publish-release.ts` keeps Full release notes under App release publishing and states Full is first-install download, not updater channel.

## Changes

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
  - Extended the currentness policy so Full payload layout, App first-run sequence, signing/notarization mode and VM gate results are explicitly App-owned dynamic facts.
  - Expanded the machine-entry table for `one-person-lab-app` release contracts / workflows / evidence to include Full manifest, first-run matrix, runtime layout, payload refs and signing/notarization results.
  - Rewrote the Full package subsection from a Framework-side requirement list into a boundary statement: concrete Full package shape must be read from App release contracts, Full package scripts, publish script, release workflows and real release evidence.
  - Preserved durable boundaries: Full is not the updater channel; Full payload assembly does not own runtime truth, provider implementation, domain truth, quality verdict or artifact authority; Temporal remains the production online runtime substrate; Hermes/Gateway cannot return as Full default online substrate.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-45.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 45 index row.

No source, machine-readable contracts, tests, CLI behavior, runtime ledgers, App repo files, domain repo files or release artifacts were modified.

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
- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/references/current-support/README.md`
- `src/package-distribution.ts`
- `tests/src/cli/cases/package-distribution.test.ts`
- `contracts/opl-framework/fresh-install-test-matrix.json`
- `one-person-lab-app/AGENTS.md`
- `one-person-lab-app/TASTE.md`
- `one-person-lab-app/contracts/app-release-channel.json`
- `one-person-lab-app/contracts/app-first-run-test-matrix.json`
- `one-person-lab-app/docs/release/README.md`
- `one-person-lab-app/scripts/full-first-install-package.ts`
- `one-person-lab-app/scripts/build-full-first-install-package.ts`
- `one-person-lab-app/scripts/publish-release.ts`
- part 26 and part 34 release/package process ledgers

Edited:

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-45.md`
- `docs/history/process/plans/README.md`

No docs, modules, interfaces, tests or App release files were archived, tombstoned or deleted in this tranche.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was synced with `origin/main` at `8447db24` before part45 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part45-release-package-currentness`.
- Branch: `codex/opl-doc-governance-20260529-part45-release-package-currentness`, based on `origin/main`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-framework-self-update-20260529`.
- Retained unrelated App repo local modifications in `/Users/gaofeng/workspace/one-person-lab-app`; this tranche read them only as live context and did not modify the App repo.

## Remaining stale / retire candidates

- Continue scanning `docs/references/current-support/*` for fixed App/release/provider evidence snapshots, stale version anchors, head SHA examples, old support assumptions and prose that freezes App-owned release workflow details.
- Re-check fresh-install / GUI first-launch and Docker/WebUI support docs if App contracts or workflows show active-shell path, image payload, VM runner or validation timing assumptions that should be moved back to App-owned truth.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**` and public docs for retired interface wording, Gateway/frontdoor/routed-action pollution, compatibility alias language or prose path machine-interface drift.

## Verification

Fresh verification before absorb:

- `npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this docs-only tranche.
- Initial focused package test failed before dependency install with `ERR_MODULE_NOT_FOUND` for `@temporalio/client`; root cause was the new isolated worktree lacking `node_modules`, while `package.json` declares the dependency.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md`.
- Focused package test passed after dependency install: `node --experimental-strip-types --test tests/src/cli/cases/package-distribution.test.ts` reported `tests 3`, `pass 3`, `fail 0`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Prefer another small current-support, runtime/product, or specs tranche backed by fresh contracts/source/tests/read-model evidence.
- Strong candidates remain fresh-install / GUI first-launch, Docker/WebUI, and runtime/product support docs that still mention App release evidence, VM gates, package payloads, active shell implementation, provider counters or retired interface wording as if they were Framework-owned stable facts.
