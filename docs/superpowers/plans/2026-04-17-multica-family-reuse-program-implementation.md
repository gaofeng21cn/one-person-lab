# 2026-04-17 Multica family reuse program 实施计划

## 背景

对本地仓库与历史 `shared-family-modules` lane 的 fresh audit 已经确认四件事：

1. `OPL main` 已经持有第一批 family-shared implementation substrate：`src/managed-runtime-contract.ts` 与 `python/opl-harness-shared/`。
2. `MAS main`、`MAG main` 与 `RCA main` 都已经完成第一步 shared helper intake。
3. 三个 domain repo 当前仍各自手写 `product_entry_quickstart / product_entry_overview / product_entry_readiness`，这是当下最清晰、最稳定、最值得先抽的重复 family boundary module。
4. `MAS` 当前仍保留旧 gate wording，因此除了代码复用之外，还要同步把“允许 family shared modules 收口”和“MAS internal monorepo 继续按 phase gate 推进”写成同一份 live truth。

因此这轮 implementation 不再把“抽第一批共享 helper”当主任务。当前最值钱的做法是先把 `product_entry_quickstart / product_entry_overview / product_entry_readiness` 这组 shared companion helper 收成中央模块，再以这条 tranche 为模板继续扩 `runtime inventory / task lifecycle / skill catalog / automation`。

## 目标

1. 继续以 `OPL` 为中央 source-of-truth，先落下 `product_entry_quickstart / product_entry_overview / product_entry_readiness` 这组 family shared companion helper。
2. 让 `MAS / MAG / RCA` 接入同一套 shared helper，同时保留各自的 domain truth、action graph、gate、route 和 session/runtime 真相。
3. 更新 `MAS` 的旧 gate 与相关测试，使“family shared modules 的跨仓收口”成为当前 live truth。
4. 把这条 tranche 作为后续 `runtime inventory / task lifecycle / skill catalog / automation` 的复用模板，并明确它与 `MAS` future monorepo internal module 的边界。

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

- `src/product-entry-companions.ts`
- `python/opl-harness-shared/src/opl_harness_shared/product_entry_companions.py`
- `python/opl-harness-shared/src/opl_harness_shared/__init__.py`
- `python/opl-harness-shared/tests/test_product_entry_companions.py`
- `tests/src/product-entry-companions.test.ts`
- `package.json`
- program docs

### MAS：shared companion helper intake + gate 改写

直接复用现有 domain truth：

- `src/med_autoscience/controllers/study_progress.py`
- `src/med_autoscience/controllers/product_entry.py`
- `src/med_autoscience/controllers/hermes_supervision.py`
- `src/med_autoscience/controllers/mainline_status.py`
- `docs/status.md`
- `docs/runtime/agent_runtime_interface.md`

本轮核心改动：

- `pyproject.toml`
- `src/med_autoscience/controllers/product_entry.py`
- `AGENTS.md`
- `docs/status.md`
- `tests/test_product_entry.py`

这条 lane 的目标是两层同时成立：

1. `product_entry` 里的 `quickstart / overview / readiness` 直接消费 `opl-harness-shared.product_entry_companions`
2. `physical migration / cross-repo refactor` 旧 gate 改成“family shared modules program 已允许，domain truth migration 仍按 phase gate 推进”

### MAG：shared companion helper intake

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
- `uv.lock`
- focused product-entry tests

这条 lane 重点复用两层现成 truth：

- `shared author-side route truth`
- `verification_checkpoint / checkpoint_status` 的 canonical aggregation

### RCA：shared companion helper intake

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

- `packages/redcube-gateway/package.json`
- `package-lock.json`
- `packages/redcube-gateway/src/actions/get-product-entry-manifest.js`
- focused manifest/frontdesk tests

这条 lane 重点复用两层现成 truth：

- `product_entry_session / runtime watch / rerun linkage`
- `family parity / autonomous stop reason / autopilot closeout evidence` 的 same-mainline board

## 实施顺序

### 1. 先冻结 OPL 中央 shared companion helper 命名与 export

1. 在 `OPL` 中把 `product-entry-companions` 的 TS export、Python module 名和最小测试冻结下来。
2. 先补 OPL 侧 helper 测试，再开始动三个 domain repo。
3. OPL 形成 authoritative commit 后，三个 consumer repo 统一更新到同一 SHA。

### 2. 紧接着并行接入 MAS / MAG / RCA

`MAS`：

1. 给 `med-autoscience` 更新 `opl-harness-shared` 依赖 SHA。
2. 把 `controllers/product_entry.py` 中手写的 `product_entry_quickstart / overview / readiness` 换成 shared helper。
3. 把 `AGENTS.md` 与状态文档上的旧 gate wording 改成当前 live truth。
4. 补跑 focused product-entry 与 meta 验证。

`MAG`：

1. 更新 `opl-harness-shared` 依赖 SHA。
2. 把 `product_entry.py` 中手写的 `product_entry_quickstart / overview / readiness` 换成 shared helper。
3. 继续把 route truth 与 checkpoint truth 作为 MAG 自己的 domain-owned truth，只把 companion payload 形状收敛到共享层。
4. 补跑 focused product-entry 与 package 验证。

`RCA`：

1. 更新 `@redcube/gateway` 里的 `opl-readonly-gateway` 依赖 SHA。
2. 把 `get-product-entry-manifest.js` 中手写的 `product_entry_quickstart / overview / readiness` 换成 shared helper。
3. 保留 `family-orchestration-companion` 继续作为 RedCube visual-domain truth owner。
4. 补跑 focused manifest/frontdesk tests。

### 3. 完成后再进入下一轮 shared boundary modules

1. 当前 tranche merge 完成后，继续按同样 pattern 扩到 `runtime inventory / task lifecycle / skill catalog / automation`。
2. `OPL domain-manifests / dashboard / handoff-envelope / web frontdesk` 继续消费 domain 产物，不额外发明第二套 truth。
3. `MAS` future monorepo internal modules 继续留在 MAS 自己的 phase ladder，不跟这一层 family shared companion 混写。

## 并行开发与吸收顺序

推荐 worktree：

1. `one-person-lab/.worktrees/multica-family-reuse-program`
2. `med-autoscience/.worktrees/codex/family-product-entry-companions`
3. `med-autogrant/.worktrees/codex/family-product-entry-companions`
4. `redcube-ai/.worktrees/codex/family-product-entry-companions`

推荐并行方式：

1. `OPL` 先冻结 `product-entry-companions` 的 export 与测试。
2. `MAS / MAG / RCA` 基于同一 OPL commit 并行推进。
3. 每仓 focused 验证通过后立刻吸收回 `main`。
4. 当前 tranche 清掉后，再开下一条 shared boundary lane。

推荐吸收顺序：

1. `OPL` shared companion helpers
2. `MAS` shared companion intake + gate rewrite
3. `MAG` 与 `RCA` shared companion intake
4. 下一轮 shared boundary tranche

## 验证

### OPL

- `npm run build`
- `npm test`
- `npm run test:meta`
- `pytest python/opl-harness-shared/tests -q`

### MAS

- `uv run pytest tests/test_product_entry.py -q`
- `scripts/verify.sh meta`

### MAG

- `uv run pytest tests/test_cli_validate_workspace.py -q`
- `scripts/verify.sh meta`

### RCA

- `npm test -- tests/product-entry.test.js`
- `npm run test:meta`

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
