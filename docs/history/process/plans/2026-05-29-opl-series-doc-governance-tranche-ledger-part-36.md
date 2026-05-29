# OPL series docs governance tranche ledger part 36

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_36`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 fresh-install contract、GUI 首启 contract、Runtime Manager contract、App release gate、provider readiness oracle 或 compatibility surface。当前 truth 回到 `contracts/`、source、tests、核心五件套、CLI/read-model、App repo contracts/workflows 和真实 evidence。
Date: `2026-05-29`

## Scope

本轮处理 OPL fresh-install / GUI first-run support 面上的退役命名：

- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `contracts/opl-framework/fresh-install-test-matrix.json`
- `src/system-installation/first-run-contract.ts`
- `src/system-installation/initialize.ts`
- `src/system-installation/turnkey.ts`
- `src/cli/modules/public-payloads.ts`
- fresh-install / system install / system initialize focused tests

目标是把当前首启 public payload 和首启日志合同从旧 `online_management` / `online_management_repair_*` 命名收敛到 `family_runtime_provider` / `family_runtime_provider_repair_*`。旧 Hermes online-management gateway 已是 history / negative guard；当前首启 truth 应直接暴露 configured family runtime provider readiness，避免 App、CLI 测试或后续文档继续把旧 online-management surface 当成兼容接口。

## Fresh Evidence

本轮 live evidence：

- `src/system-installation/initialize.ts`
  - `ready_to_launch` 只由 workspace root、Codex CLI、Codex API config 决定。
  - checklist item 已是 `family_runtime_provider`，但 public payload 仍暴露旧 `online_management` object。
  - provider readiness 来自 `environment.core_engines.family_runtime_provider`。
- `src/system-installation/turnkey.ts`
  - `opl install` 通过 Runtime Manager 和 `family-runtime install|status` 处理 configured family runtime provider。
  - 首启日志仍可能写旧 `online_management_repair_*` 事件。
- `src/system-installation/first-run-contract.ts` 与 `contracts/opl-framework/fresh-install-test-matrix.json`
  - GUI labels、first-run JSONL path 和 VM artifact list 仍有效。
  - 首启日志事件类型和 scenario expected fields 仍用 `online_management` 命名。
- `scripts/fresh-install-smoke.mjs`
  - clean-room smoke 仍读取 `system_initialize.online_management`。
- `tests/src/cli/cases/system-management.test.ts`
  - 已存在 negative assertion 确认 `gateway_loaded` 不在 service status，适合升级为旧 `online_management` surface 退役 guard。
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
  - 文档当前已经声明 Hermes online-management gateway 不再是 install / repair / readiness path，但未明确 public payload 退役字段。

## Changes

- `src/system-installation/initialize.ts`
  - Public initialize payload 从 `online_management` 改为 `family_runtime_provider`。
  - readiness 删除 `online_management_ready`，保留 `family_runtime_provider_ready`。
  - Surface id 改为 `opl_family_runtime_provider_readiness`。
  - Blocking 字段改为 `full_readiness_blocking`。
- `src/cli/modules/public-payloads.ts`
  - Public projection 只透出 `family_runtime_provider`，不再投影 `online_management`。
- `src/system-installation/first-run-contract.ts`
  - First-run event type 合同从 `online_management_repair_*` 改为 `family_runtime_provider_repair_*`。
  - Fresh-install matrix builder 的 expected fields 改为 `expected_family_runtime_provider`。
- `contracts/opl-framework/fresh-install-test-matrix.json`
  - `first_run_log.family_runtime_provider_event_types` 替代旧 `online_management_event_types`。
  - Local CLI scenarios 改为 `expected_family_runtime_provider.full_readiness_blocking`。
- `src/system-installation/turnkey.ts`
  - Runtime-manager action 分类变量改为 family-runtime-provider 命名。
  - 日志写入新 `family_runtime_provider_repair_completed|failed` event type。
- `scripts/fresh-install-smoke.mjs`
  - Smoke 读取 `system_initialize.family_runtime_provider`，并断言旧 `online_management` 不存在。
- `tests/src/fresh-install-smoke.test.ts`
  - Matrix test 锁定新 event types，并断言旧 `online_management_event_types` 不存在。
- `tests/src/cli/cases/system-management.test.ts`
  - `system initialize` 和 `opl install` focused tests 改为新 `family_runtime_provider` surface。
  - 增加旧 `online_management` object 不存在的负向断言。
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
  - 明确 `opl system initialize` 暴露 `family_runtime_provider`，并把旧 `online_management` / `online_management_ready` / `online_management_repair_*` 标为退役字段。

No App repo workflows, App release evidence, MAS/MAG/RCA/OMA repos, runtime ledgers, provider state, GUI implementation code, Docker/WebUI implementation, or non-default executor adapter contracts were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/README.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `contracts/opl-framework/fresh-install-test-matrix.json`
- `contracts/README.md`
- `contracts/opl-framework/README.md`
- `contracts/opl-framework/README.zh-CN.md`
- `src/system-installation/first-run-contract.ts`
- `src/system-installation/initialize.ts`
- `src/system-installation/turnkey.ts`
- `src/cli/modules/public-payloads.ts`
- `src/runtime-manager.ts`
- `scripts/fresh-install-smoke.mjs`
- `tests/src/fresh-install-smoke.test.ts`
- `tests/src/cli/cases/system-management.test.ts`
- `tests/src/cli/cases/system-install.test.ts`
- prior process ledger part 35 and index row

Edited:

- `contracts/opl-framework/fresh-install-test-matrix.json`
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-36.md`
- `docs/history/process/plans/README.md`
- `scripts/fresh-install-smoke.mjs`
- `src/cli/modules/public-payloads.ts`
- `src/system-installation/first-run-contract.ts`
- `src/system-installation/initialize.ts`
- `src/system-installation/turnkey.ts`
- `src/runtime-manager.ts`
- `tests/src/fresh-install-smoke.test.ts`
- `tests/src/cli/cases/system-management.test.ts`

## Remaining stale / retire candidates

- `runtime-manager` still uses internal `action_lane: online_runtime`, `priority: p0_online_runtime`, and `owner_split.online_runtime_substrate_owner`. This remains valid as substrate vocabulary for provider-backed online runtime and is outside the public first-run compatibility surface retired in this tranche.
- CLI option `--no-online-runtime` remains current as a development/offline diagnostic flag. It should only be renamed if product command specs and App caller contracts are intentionally changed together.
- `hermes_agent` remains a canonical explicit non-default executor adapter/backend. It was not touched and must not be confused with retired Hermes provider / Gateway / readiness surfaces.
- Continue scanning current-support docs for App release fixed-version anchors, stale VM runner assumptions, Docker/WebUI payload claims, and GUI shell/App boundary drift.

## Verification

Fresh verification before absorb:

- `rtk npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this tranche.
- `rtk git diff --check` exited `0`.
- Conflict-marker scan `rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md contracts scripts src tests .github` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/fresh-install-smoke.test.ts tests/src/cli/cases/system-management.test.ts tests/src/cli/cases/system-install.test.ts` passed: `tests 38`, `pass 38`, `fail 0`.
- `rtk npm run test:fresh-install` passed: `tests 8`, `pass 8`, `fail 0`.
- `rtk npm run build` exited `0`.
- `rtk npm run test:fast` passed: first batch `tests 149`, `pass 149`, `fail 0`; second batch `tests 91`, `pass 91`, `fail 0`.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue current-support cleanup in small evidence-backed slices, prioritizing Docker/WebUI support currentness or remaining GUI shell/App boundary docs if fresh source/contracts/tests still show stale release or runner assumptions.
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if old Domain Gateway / Domain Harness OS wording starts acting as active truth instead of support/reference or history provenance.
