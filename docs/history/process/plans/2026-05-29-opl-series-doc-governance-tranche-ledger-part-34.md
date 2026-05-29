# OPL series docs governance tranche ledger part 34

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_34`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 release/package contract、package manifest、install/update source、App release evidence、Full DMG readiness、GHCR package oracle 或 domain module truth。当前 truth 回到 `contracts/`、source、tests、核心五件套、package scripts、workflow 和 fresh CLI/read-model。
Date: `2026-05-29`

## Scope

本轮继续 OPL current-support reference cleanup，处理：

- `docs/references/current-support/opl-release-packages-modular-distribution.md`

目标是把 release / Packages / App / module 分发支撑文档从长 manifest JSON 示例和 numbered 落地队列收窄为 stable support reference：明确机器入口读法、动态事实边界、package workflow ownership、App release ownership 和 install/update 负边界，避免后续把 prose 示例里的版本、checksum、module head SHA、rollback target 或未来接入顺序读成当前机器 truth。

## Fresh Evidence

本轮 live evidence：

- `src/package-distribution.ts`
  - `MODULE_SPECS` 当前只包含 `medautoscience`、`medautogrant`、`redcube` 和 `oplmetaagent`。
  - `buildOplPackageManifest()` 仍声明 `module_install_update_source=git_checkout` 与 `package_consumption_status=packages_defined_not_consumed_by_install_update`。
  - `release_automation.status=prepared_not_consumed_by_module_install_update`，channel manifest outputs 为 `opl-release-manifest.json`、`opl-channel-manifest.json` 和 `SHA256SUMS`。
  - cleanup strategy 为 `retain_latest_n_versions_and_declared_rollbacks`，rollback strategy 为 `previous_channel_manifest_target`。
  - module release discipline 仍区分 `current_latest_source=git_checkout_upstream_default_branch` 与 `future_package_latest_source=opl_release_channel_manifest`。
- `scripts/package-module-archives.mjs`
  - 以 `git archive --format=tar.gz HEAD` 生成 module source archive。
  - 把 `source_archive.size`、`source_archive.sha256`、`checksum` 和 `source_git.head_sha` 写入 fresh manifest。
- `scripts/package-release-discipline.mjs`
  - 校验 manifest / module entry 仍保留 git-checkout current source、未消费 package 状态、sha256、channel manifest、rollback 和 cleanup discipline。
- `.github/workflows/packages.yml`
  - central package workflow 会构建 module archives、运行 release discipline、上传 `dist/opl-packages` artifact、用 ORAS 推送 module archives / release manifest 到 GHCR，并构建 WebUI image。
- `tests/src/cli/cases/package-distribution.test.ts`
  - 覆盖 CLI manifest 的 package coordinates、git-checkout current source、package consumption status、Codex default profile、module set、MDS negative case、archive builder、channel manifest、checksum、module source git head SHA 和 release discipline gate。
- Fresh CLI probe:
  - 初始 `./bin/opl packages manifest --json` 在 isolated part34 worktree 中因缺少 `@temporalio/client` 依赖而失败，错误为 `ERR_MODULE_NOT_FOUND` from `src/family-runtime-temporal-client.ts`。这是 worktree dependency state，不是 package distribution semantic evidence；后续验证需先 `npm ci`。
  - `npm ci` 后 `./bin/opl packages manifest --json` exited `0`，fresh output confirmed `opl_version=26.5.28`, `release_channel=stable`, `module_install_update_source=git_checkout`, `package_consumption_status=packages_defined_not_consumed_by_install_update`, `release_automation.status=prepared_not_consumed_by_module_install_update`, channel manifest outputs `opl-release-manifest.json` / `opl-channel-manifest.json` / `SHA256SUMS`, cleanup strategy `retain_latest_n_versions_and_declared_rollbacks`, rollback strategy `previous_channel_manifest_target`, and modules `medautoscience` / `medautogrant` / `redcube` / `oplmetaagent`.

## Changes

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
  - Removed the long manifest JSON example so prose no longer freezes field-level package output, module archive sizes, sha256 values, module head SHA, rollback target or Codex profile snapshots.
  - Replaced it with a machine-entry table pointing to `src/package-distribution.ts`, `opl packages manifest`, package archive / release discipline scripts, package workflow, native helper workflow and App release evidence owner.
  - Replaced the numbered future landing sequence with stable maintenance rules that only allow Packages/GHCR to become current install/update mechanism after live source/tests/CLI/read-model or App environment management actually consume the channel manifest.
  - Preserved negative boundaries: GitHub Releases remain user download surface; Packages/GHCR remain machine artifact channel; current module install/update source remains git checkout; `MDS` is not a default manifest or Full payload module; Full DMG belongs to `one-person-lab-app` release authority.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-34.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 34 index row.

No contracts, source, tests, package scripts, workflows, App files, MAS/MAG/RCA/OMA repos, runtime ledgers or provider state were modified.

## Verification

Fresh verification:

- `rtk npm ci` exited `0` and ran `npm run build`; npm audit reported 10 high severity vulnerabilities, unchanged and not addressed in this docs-only tranche.
- `rtk ./bin/opl packages manifest --json` exited `0` after dependency install and confirmed current package manifest still uses git checkout install/update source with package artifacts defined but not consumed by install/update.
- `rtk git diff --check` exited `0`.
- `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md contracts scripts src tests .github` returned no conflict markers.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/package-distribution.test.ts` passed: `tests 3`, `pass 3`, `fail 0`.
- After fast-forward / push from root, repeat static checks and focused package test from `main`.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `src/package-distribution.ts`
- `scripts/package-module-archives.mjs`
- `scripts/package-release-discipline.mjs`
- `.github/workflows/packages.yml`
- `package.json`
- `tests/src/cli/cases/package-distribution.test.ts`
- prior process ledger index entries, especially part 26 and part 33, to avoid duplicate scope

Edited:

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-34.md`
- `docs/history/process/plans/README.md`

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was synced with `origin/main` at `6c95b1cf` before part34 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part34`.
- Branch: `codex/opl-doc-governance-20260529-part34-current-support`, tracking `origin/main`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/codex/opl-stage-log-observability-closure` on branch `codex/opl-stage-log-observability-closure` at `2ac7e014`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/dm003-default-executor-single-flight` on branch `fix/dm003-default-executor-single-flight`.

## Remaining stale / retire candidates

- Continue scanning `docs/references/current-support/*` for fixed App/release/provider evidence snapshots, stale version anchors, head SHA examples and old support assumptions.
- Strong next candidates:
  - `docs/references/current-support/opl-default-skill-ecosystem.md`
  - `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if old Domain Gateway / Domain Harness OS notes start acting as current truth instead of support reference.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered one OPL current-support release/package reference.

## Next tranche write scope

- Prefer another current-support reference tranche backed by live contracts/source/tests/read-model evidence.
- Candidate areas:
  - default skill ecosystem and companion payload currentness;
  - fresh install / GUI first-launch / Docker WebUI support currentness;
  - cross-repo active truth owner refresh if fresh read-model evidence exposes a contradiction.
