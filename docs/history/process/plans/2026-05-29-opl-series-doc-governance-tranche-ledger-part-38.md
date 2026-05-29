# OPL series docs governance tranche ledger part 38

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_38`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 GUI shell contract、App release gate、packaged runtime validator、runtime truth、domain truth、artifact authority 或 release readiness oracle。当前 truth 回到 `docs/references/current-support/opl-gui-shell-adapter-boundary.md`、核心五件套、contracts、source、tests、CLI/read-model、`one-person-lab-app` contracts/scripts/tests/workflows 和 active shell package scripts。
Date: `2026-05-29`

## Scope

本轮继续处理 GUI shell / App boundary support reference 的 currentness drift：

- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`
- process ledger index

目标是退役目标文档中把 active shell builder config 写成旧顶层 `opl-aion-shell/electron-builder.yml` 的 stale path，并把 packaged runtime validation 从“GUI 打包脚本必须在某个内部时机自动执行”的过度固定，改成 App contract / wrapper / release gate 持有验证入口、active shell 提供当前实现的读法。

## Fresh Evidence

本轮 live evidence：

- `one-person-lab-app/contracts/app-shell-adapter.json`
  - `active_shell=aionui`，`shell_root=shells/aionui`。
  - `shell_source.owner_repo=gaofeng21cn/opl-aion-shell`，`history_policy=external_checkout_not_merged_into_app_default_branch`。
  - `shell_contract.paths.electron_builder_config=packages/desktop/electron-builder.yml`。
  - `shell_contract.paths.packaged_runtime_validator=scripts/validate-packaged-runtime.js`。
  - `gui_product_contract_policy.aionui_upstream_must_not_override_app_truth=true`。
  - state surface contract 继续声明 fast/full/action/full-drilldown OPL CLI surfaces。
- `one-person-lab-app/contracts/app-runtime-bridge.json`
  - App/UI contract owner 是 `one-person-lab-app`，protocol owner 是 `one-person-lab`。
  - `summary_command` / `refresh_command` 是 `opl app state --profile fast --json`；full state 和 full drilldown 只用于 diagnostic 或 release evidence。
  - forbidden truth sources 包含 direct domain repo reads、runtime/internal state file reads、artifact body、memory body 和 shell private runtime status。
- `one-person-lab-app/contracts/app-gui-product-contract.json`
  - App product truth owner 是 App repo；active shell 只是 implementation carrier。
  - 默认 executor 是 `codex_cli`，普通 App path 不暴露 backend/model/permission selector。
- `one-person-lab-app/package.json`
  - `validate:gui-shell` 运行 App-root active shell validation、standard release payload preparation 和 active shell `bun run package`。
  - `validate:opl-package` 与 `test:packaged:bun` 通过 App wrapper 运行 active shell `bun run validate:opl-package`。
- `one-person-lab-app/shells/aionui/package.json`
  - `package` 当前运行 `electron-vite build --config packages/desktop/electron.vite.config.ts`。
  - `validate:packaged-runtime` 当前运行 `node scripts/validate-packaged-runtime.js`。
  - `validate:opl-package` 当前运行 `node scripts/validate-packaged-runtime.js --scan-all`。
- `one-person-lab-app/tests/release/app-release-boundary.test.ts`
  - release boundary tests assert active shell contract path `packages/desktop/electron-builder.yml`。
  - tests assert App wrappers and release workflow use `validate:opl-package` and do not hardcode shell cwd bypasses.
  - tests treat `validate:gui-shell` as active shell GUI compile evidence and assert packaged runtime validator exists at active shell `scripts/validate-packaged-runtime.js`.

## Changes

- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`
  - Replaced stale `opl-aion-shell/electron-builder.yml` path with App contract-backed active shell paths: `shells/aionui`, `packages/desktop/electron-builder.yml`, and `scripts/validate-packaged-runtime.js`.
  - Rewrote validation wording around App wrapper / release gate ownership: `validate:gui-shell`, `validate:opl-package`, `test:packaged:bun`, and active shell `validate:opl-package`.
  - Removed the over-specific claim that GUI packaging must always auto-run `--scan-all` at a fixed internal moment; current execution timing and script details now belong to App repo scripts, release workflow and active shell package scripts.
  - Kept the negative boundary: OPL main repo does not own shell-specific paths, aliases, compatibility facades, runtime truth, domain truth, artifact body, memory body or quality/export verdict.

No source, contracts, tests, App repo files, shell repo files, release workflow, runtime ledger, provider state or package artifact were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-25.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-37.md`
- `docs/history/process/plans/README.md`
- `one-person-lab-app/contracts/app-shell-adapter.json`
- `one-person-lab-app/contracts/app-runtime-bridge.json`
- `one-person-lab-app/contracts/app-gui-product-contract.json`
- `one-person-lab-app/package.json`
- `one-person-lab-app/shells/aionui/package.json`
- `one-person-lab-app/tests/release/app-release-boundary.test.ts`

Edited:

- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-38.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue scanning current-support docs for stale App release fixed-version anchors, VM runner assumptions, package channel overclaims, active-shell internal path drift and release workflow timing overclaims.
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if old Domain Gateway / Domain Harness OS wording starts acting as active truth instead of support/reference or history provenance.
- App release / Full DMG / Docker WebUI claims must continue to be refreshed from `one-person-lab-app` contracts, scripts, release workflow/tests and active shell package evidence before editing support prose.

## Verification

Fresh verification before absorb:

- `rtk npm ci` exited `0`, ran `npm run build`, and left the known npm audit state at 10 high severity vulnerabilities; dependency audit remediation is outside this tranche.
- `rtk git diff --check` exited `0`.
- Conflict-marker scan `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs README.md contracts scripts src tests .github` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/package-distribution.test.ts tests/src/cli/cases/system-install.test.ts tests/src/cli/cases/system-management.test.ts tests/src/verification-command-surfaces.test.ts` passed: `tests 53`, `pass 53`, `fail 0`.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue current-support cleanup in small evidence-backed slices, prioritizing remaining App release support docs, shared runtime/domain specs, or GUI/App support references where fresh source/contracts/tests still show stale release, runner, path, package channel or validation timing assumptions.
