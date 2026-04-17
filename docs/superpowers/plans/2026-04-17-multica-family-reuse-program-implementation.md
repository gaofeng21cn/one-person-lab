# 2026-04-17 Multica family reuse program 实施计划

## 背景

对本地仓库与历史 `shared-family-modules` lane 的 fresh audit 已经确认三件事：

1. `OPL main` 已经持有第一批 family-shared implementation substrate：`src/managed-runtime-contract.ts` 与 `python/opl-harness-shared/`。
2. `MAG main` 与 `RCA main` 已经完成第一步 consumer intake：前者在 `src/med_autogrant/product_entry.py` 复用 `opl_harness_shared.managed_runtime`，后者在 `packages/redcube-gateway/src/actions/get-product-entry-manifest.js` 复用 `opl-readonly-gateway/managed-runtime-contract`。
3. `MAS main` 仍保留本地 `managed_runtime` builder、`hermes_supervision` 公共逻辑复制体，以及旧 gate wording；它是当前 family reuse program 里最明确的 live gap。

因此这轮 implementation 不再把“抽第一批共享 helper”当主任务。当前最值钱的做法是沿已落地基座继续扩 `runtime inventory / task lifecycle / skill catalog / automation` 四类 shared modules，并把 `MAS / MAG / RCA` 映射到同一组 contract。

## 目标

1. 继续以 `OPL` 为中央 source-of-truth，扩出 `runtime inventory / task lifecycle / skill catalog / automation` 四类 family shared modules。
2. 让 `MAS / MAG / RCA` 接入同一套 shared module contract，尽量复用已 landed 的 helper、schema、route truth、checkpoint truth、runtime watch truth 与 autopilot board。
3. 更新 `MAS` 的旧 gate 与相关测试，使“family shared modules 的跨仓收口”成为当前 live truth。
4. 让 `OPL domain-manifests / dashboard / handoff-envelope / web frontdesk` 统一消费新 companion，形成真正的 family-level 复用闭环。

## 非目标

- 不引入 `Multica` 作为直接运行时依赖。
- 不新开独立 shared repo。
- 不把 domain-owned durable truth 搬进 `OPL`。
- 不重做已经 landed 的 `managed_runtime_contract` 抽取。

## 复用优先矩阵

### OPL：中央共享基座

直接复用：

- `package.json`
- `src/managed-runtime-contract.ts`
- `python/opl-harness-shared/pyproject.toml`
- `python/opl-harness-shared/src/opl_harness_shared/managed_runtime.py`
- `python/opl-harness-shared/src/opl_harness_shared/hermes_supervision.py`
- `contracts/opl-gateway/managed-runtime-three-layer-contract.json`
- `tests/src/opl-managed-runtime-three-layer-contract.test.ts`

本轮新增与扩展：

- `contracts/opl-gateway/family-runtime-inventory.schema.json`
- `contracts/opl-gateway/family-task-lifecycle.schema.json`
- `contracts/opl-gateway/family-skill-catalog.schema.json`
- `contracts/opl-gateway/family-automation.schema.json`
- `contracts/opl-gateway/public-surface-index.json`
- `contracts/opl-gateway/README.md`
- `contracts/opl-gateway/README.zh-CN.md`
- `src/family-runtime-inventory.ts`
- `src/family-task-lifecycle.ts`
- `src/family-skill-catalog.ts`
- `src/family-automation.ts`
- `src/types.ts`
- `src/domain-manifest.ts`
- `src/management.ts`
- `src/handoff-bundle.ts`
- `src/web-frontdesk.ts`
- `python/opl-harness-shared/src/opl_harness_shared/runtime_inventory.py`
- `python/opl-harness-shared/src/opl_harness_shared/task_lifecycle.py`
- `python/opl-harness-shared/src/opl_harness_shared/skill_catalog.py`
- `python/opl-harness-shared/src/opl_harness_shared/automation.py`
- `python/opl-harness-shared/tests/test_runtime_inventory.py`
- `python/opl-harness-shared/tests/test_task_lifecycle.py`
- `python/opl-harness-shared/tests/test_skill_catalog.py`
- `python/opl-harness-shared/tests/test_automation.py`
- `tests/src/opl-family-runtime-inventory-contract.test.ts`
- `tests/src/opl-family-task-lifecycle-contract.test.ts`
- `tests/src/opl-family-skill-catalog-contract.test.ts`
- `tests/src/opl-family-automation-contract.test.ts`
- `tests/fixtures/family-manifests/med-autoscience-product-entry-manifest.json`
- `tests/fixtures/family-manifests/med-autogrant-product-entry-manifest.json`
- `tests/fixtures/family-manifests/redcube-product-entry-manifest.json`
- `docs/references/family-runtime-inventory-contract.md`
- `docs/references/family-task-lifecycle-contract.md`
- `docs/references/family-skill-catalog-contract.md`
- `docs/references/family-automation-contract.md`
- `docs/status.md`

### MAS：补齐 live catch-up 与 gate 改写

直接复用现有 domain truth：

- `src/med_autoscience/controllers/study_progress.py`
- `src/med_autoscience/controllers/product_entry.py`
- `src/med_autoscience/controllers/hermes_supervision.py`
- `src/med_autoscience/controllers/mainline_status.py`
- `docs/status.md`
- `docs/runtime/agent_runtime_interface.md`

本轮核心改动：

- `pyproject.toml`
- `src/med_autoscience/controllers/hermes_supervision.py`
- `src/med_autoscience/controllers/product_entry.py`
- `src/med_autoscience/controllers/mainline_status.py`
- `AGENTS.md`
- `docs/status.md`
- `docs/runtime/agent_runtime_interface.md`
- `tests/test_product_entry.py`
- `tests/test_mainline_status.py`
- `tests/test_runtime_contract_docs.py`

这条 lane 的目标是两层同时成立：

1. `managed_runtime` 与 `hermes_supervision` 公共逻辑直接消费 `opl-harness-shared`
2. `physical migration / cross-repo refactor` 旧 gate 改成“family shared modules program 已允许，domain truth migration 仍按 phase gate 推进”

### MAG：在已 landed helper intake 上扩 task / skill / automation

直接复用现有 landed truth：

- `src/med_autogrant/product_entry.py`
- `src/med_autogrant/route_report.py`
- `src/med_autogrant/hosted_contract_bundle.py`
- `src/med_autogrant/submission_ready.py`
- `schemas/v1/grant-progress.schema.json`
- `schemas/v1/grant-cockpit.schema.json`
- `schemas/v1/grant-direct-entry.schema.json`
- `schemas/v1/grant-user-loop.schema.json`
- `schemas/v1/product-entry-manifest.schema.json`
- `schemas/v1/product-frontdesk.schema.json`
- `docs/decisions.md`
- `docs/status.md`

本轮核心改动：

- `pyproject.toml`
- `src/med_autogrant/product_entry.py`
- `src/med_autogrant/route_report.py`
- `schemas/v1/grant-progress.schema.json`
- `schemas/v1/grant-cockpit.schema.json`
- `schemas/v1/grant-direct-entry.schema.json`
- `schemas/v1/grant-user-loop.schema.json`
- `schemas/v1/product-entry-manifest.schema.json`
- `schemas/v1/product-frontdesk.schema.json`
- `tests/test_product_entry.py`
- `tests/test_stage_router.py`
- `tests/test_hosted_contract_bundle.py`
- `tests/test_submission_ready_package.py`

这条 lane 重点复用两类现成 truth：

- `shared author-side route truth`
- `verification_checkpoint / checkpoint_status` 的 canonical aggregation

### RCA：在已 landed helper intake 上扩 task / automation / autopilot

直接复用现有 landed truth：

- `packages/redcube-gateway/src/actions/get-product-entry-manifest.js`
- `packages/redcube-gateway/src/actions/get-product-entry-session.js`
- `packages/redcube-gateway/src/actions/family-orchestration-companion.js`
- `packages/redcube-gateway/src/types.ts`
- `docs/program/phase-2/phase_2_family_parity_autopilot_continuation_board.md`
- `docs/program/phase-2/phase_2_family_parity_governance_surface_convergence.md`
- `contracts/runtime-program/phase-2-family-parity-autopilot-continuation-board.json`
- `contracts/runtime-program/phase-2-family-parity-governance-surface-convergence.json`
- `contracts/runtime-program/current-program.json`
- `docs/status.md`

本轮核心改动：

- `package.json`
- `package-lock.json`
- `packages/redcube-gateway/src/actions/get-product-entry-manifest.js`
- `packages/redcube-gateway/src/actions/get-product-entry-session.js`
- `packages/redcube-gateway/src/actions/family-orchestration-companion.js`
- `packages/redcube-gateway/src/types.ts`
- `docs/status.md`
- `docs/program/phase-2/phase_2_family_parity_autopilot_continuation_board.md`
- `docs/program/phase-2/phase_2_family_parity_governance_surface_convergence.md`
- `contracts/runtime-program/phase-2-family-parity-autopilot-continuation-board.json`
- `contracts/runtime-program/phase-2-family-parity-governance-surface-convergence.json`
- `contracts/runtime-program/current-program.json`
- `tests/product-entry.test.js`
- `tests/mcp-gateway.test.js`
- `tests/cli-v2-smoke.test.js`
- `tests/phase-2-runtime-watch-locator-integrity-hardening.test.js`
- `tests/phase-2-family-parity-governance-surface-convergence.test.js`

这条 lane 重点复用两类现成 truth：

- `product_entry_session / runtime watch / rerun linkage`
- `family parity / autonomous stop reason / autopilot closeout evidence` 的 same-mainline board

## 实施顺序

### 1. 先冻结 OPL 中央共享模块命名与 helper export

1. 在 `OPL` 中把四类 shared modules 的 contract 文件名、TS export、Python module 名冻结下来。
2. 同步更新 `contracts/opl-gateway/public-surface-index.json`、`README*` 与 reference docs，让后续 consumer repo 全部指向同一组名字。
3. 先补 OPL 侧 contract / helper 测试与 fixture，再开始动三个 domain repo。

### 2. 紧接着补齐 MAS live catch-up

1. 给 `med-autoscience` 增加 `opl-harness-shared` 依赖。
2. 把 `controllers/hermes_supervision.py` 中的通用 job/script/jobs.json 匹配逻辑直接换成 shared helper。
3. 把 `controllers/product_entry.py` 中的本地 `managed_runtime_contract` builder 换成 shared helper。
4. 把 `mainline_status`、`status`、`agent_runtime_interface` 与 `AGENTS.md` 上的旧 gate wording 改成当前用户授权下的 live truth。
5. 让 `tests/test_product_entry.py`、`tests/test_mainline_status.py`、`tests/test_runtime_contract_docs.py` 同步新口径。

### 3. OPL contract 名冻结后，MAG 与 RCA 并行接入新增 shared modules

`MAG`：

1. 保持现有 `managed_runtime_contract` 共享 builder 不动。
2. 在 `product_entry.py` 与相关 schema 中新增 shared `task_lifecycle / skill_catalog / automation` companion 投影。
3. 继续把 route truth 与 checkpoint truth 作为 MAG 自己的 domain-owned truth，只把投影 shape 收敛到共享层。
4. 更新测试，保证 `product_entry_overview / readiness / family_orchestration / checkpoint_status` 与新 shared contract 同步。

`RCA`：

1. 保持现有 `managed_runtime_contract` 共享 builder 不动。
2. 在 `product-entry manifest / session / family_orchestration` 上新增 shared `task_lifecycle / automation` companion 投影。
3. 直接借现有 autopilot continuation board、governance surface convergence 与 runtime watch quartet truth，生成 family automation surface。
4. 更新 types、program contracts 与测试，保证 CLI / MCP / manifest / session 都吃同一份 shared shape。

### 4. 最后收口 OPL central consumer

1. 在 `src/domain-manifest.ts`、`src/management.ts`、`src/handoff-bundle.ts` 与 `src/web-frontdesk.ts` 中把四类 shared companion 一次接进 family-level consumer。
2. 更新 `tests/fixtures/family-manifests/*.json`，让 OPL 用 repo-tracked fixture 覆盖三仓新 companion。
3. 让 `dashboard / domain-manifests / handoff-envelope / web frontdesk` 能直接展示 shared runtime/task/skill/automation surface，不再靠每仓各自解释。

## 并行开发与吸收顺序

推荐 worktree：

1. `one-person-lab/.worktrees/multica-family-reuse-program`
2. `med-autoscience/.worktrees/codex/multica-family-reuse-program`
3. `med-autogrant/.worktrees/codex/multica-family-reuse-program`
4. `redcube-ai/.worktrees/codex/multica-family-reuse-program`

推荐并行方式：

1. `OPL` 先冻结 contract file names 与 helper exports。
2. `MAS` 立即开始 base catch-up 与 gate rewrite。
3. `MAG` 与 `RCA` 在 `OPL` contract 名冻结后并行推进。
4. 三仓 adapter 基本稳定后，再回到 `OPL` 做 final consumer convergence。

推荐吸收顺序：

1. `OPL` 中央共享 contracts/helpers
2. `MAS` live catch-up + gate rewrite
3. `MAG` 与 `RCA` 并行吸收
4. `OPL` final consumer convergence

## 验证

### OPL

- `npm run build`
- `npm test`
- `npm run test:meta`
- `pytest python/opl-harness-shared/tests -q`

### MAS

- `pytest tests/test_product_entry.py tests/test_mainline_status.py tests/test_runtime_contract_docs.py -q`
- `scripts/verify.sh meta`
- `scripts/verify.sh`

### MAG

- `pytest tests/test_product_entry.py tests/test_stage_router.py tests/test_hosted_contract_bundle.py tests/test_submission_ready_package.py -q`
- `scripts/verify.sh meta`
- `scripts/verify.sh`

### RCA

- `npm test`
- `npm run test:meta`
- `scripts/verify.sh`

## 风险

- `MAS` 当前有一整串 docs/tests 绑定旧 gate wording；这条 lane 必须把代码、文档、测试一起改，才会形成稳定 live truth。
- `MAG` 与 `RCA` 已经在 live main 里吃 OPL git pin；新增 shared modules 后，依赖 pin 与 helper export 必须同步更新，避免仓间 helper version 漂移。
- `OPL` 当前已经把 `domain-manifests / dashboard / handoff-envelope / web frontdesk` 建成统一 consumer；三仓若只接一半 companion 字段，顶层很快会长出 partial truth。
- 历史 `shared-family-modules` lane 的价值现在主要已经吸收到 live main；这轮继续新开 main-based worktree，能减少和旧 lane 并行重写同一文件的冲突。

## 完成标准

- `OPL` 已持有四类 shared module 的 machine-readable contract、JS helper、Python helper 与 conformance tests。
- `MAS` 已经切到 shared helper，并完成 gate/docs/tests 改写。
- `MAG` 与 `RCA` 已经在现有 shared helper intake 上补齐 task/skill/automation 或 task/automation companion。
- `OPL` 顶层 consumer 已经能统一读取并展示三仓 shared runtime/task/skill/automation surface。
- 四仓都完成 fresh verification、逐仓吸收回 `main`、push，并清理对应 worktree。
