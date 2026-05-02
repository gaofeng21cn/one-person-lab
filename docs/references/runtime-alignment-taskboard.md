# 四仓统一对齐检查表与任务板

状态锚点：`2026-05-02`

> 退役说明：这份 taskboard 保留为历史参考。OMX 已退出当前 OPL 开发环境；文中早期 `Codex Host / OMX` 分工只代表历史迁移背景，不再定义当前执行入口。

## 文档目的

这份文档把当时已经吸收到四仓 current truth 的统一构架，压缩成一份参考级检查表。

它主要回答四个问题：

1. 四仓当前共同已经对齐了什么
2. 还剩哪些真正活跃的行为面对齐项
3. 每个仓当前的“下一棒”应该是什么
4. 哪些事项仍应继续后置，不要抢跑

当前统一 program、阶段名与离场条件，以 [`contract-convergence-v1-execution-board.md`](./contract-convergence-v1-execution-board.md) 为准；本任务板只保留当前活跃的收敛项。

## 零、当前统一阶段

- 当前 program：`Contract Convergence v1`
- 当前阶段：`Phase C / Object And Report Behavior Convergence`
- 当前阶段目标：把 formal-entry 之后已经冻结的 execution handle、durable surface、audit trail 与 control-plane boundary，继续压成三个业务仓的 repo-verified behavior 面
- 当前阶段不做：共享执行内核抽取、统一平台 runtime、托管式 Web runtime、同仓双模
- `MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover` 仍是明确长线，但属于后置 domain-internal 轨道，不在当前 taskboard 的活跃实现范围

## 使用规则

- 这是 `OPL docs` 下的内部参考文档，默认中文维护。
- 它不替代各仓自己的 `README`、`AGENTS.md`、`CURRENT_PROGRAM.md` 或 domain 内主线文档。
- 它只作为内部参考同步面，不反向抬升为 `OPL` 公开主线真相。
- 截至 `2026-04-11`，其中大部分合同层对齐项已经完成；下面保留的主要是“下一步仍要继续压实的行为面”。
- 若与各仓 current truth 冲突，以各仓 current truth 为准。

## 一、当前统一结论

当前最重要的已经不是继续发明新名词，而是守住已经吸收到各仓 current truth 的统一口径，并把剩余工作明确归到行为面。

截至当前，四仓共同完成了这些统一：

- 历史开发控制面曾采用 `Codex Host / OMX` 分工；当前执行入口已回到 Codex-only / repo-tracked truth 口径
- 产品 runtime 与开发控制面分离，不再混写成熟度
- 三个业务仓统一按 `Auto-only` 主线理解
- 未来 `Human-in-the-loop` 统一理解为 sibling 或 upper-layer product，而不是同仓双模
- formal-entry matrix 统一采用：
  - `default_formal_entry`
  - `supported_protocol_layer`
  - `internal_controller_surface`
- 当前默认本地形态统一写作 `Codex-default host-agent runtime`

因此，这份 taskboard 不再是“从零开始的统一清单”，而是“合同层已完成后，行为层还剩什么”。

对 `OPL` 顶层当前 baton 的最小锚点，仍应同时保留：

- `G2 stable public baseline`
- `G3 thin handoff planning freeze`
- `Phase 1 exit + next-stage activation package freeze`
- 当前已 absorbed 的 federation package 是 `Minimal admitted-domain federation activation package`
- 当前 top-level formal entry contract 仍是 `TypeScript CLI + gateway contract surface`
- `Review Ops -> Thesis Ops` 是已冻结的 candidate-domain closeout 顺序
- 当前没有新的 active follow-on tranche；只有 admitted-domain 新增 absorbed delta 或中央 reference surfaces 发生真实漂移时，才重开中央同步线

## 二、跨仓统一检查表

| 对齐项 | 当前状态 | 仍需继续的部分 |
| --- | --- | --- |
| 开发控制面分工 | 已退役为历史背景 | 各仓后续新增文档、report、回归不得再把 `Codex Host / OMX` 写成当前执行入口 |
| 产品 runtime 与开发控制面分离 | 已完成 | 不得把 control-plane 可用性误写成产品 runtime 已成熟 |
| `Auto-only` 与 future `HITL` layering | 已完成 | 后续不允许再出现“同仓双模”叙述或实现漂移 |
| formal-entry matrix 三字段 | 已完成 | 各仓继续诚实维护“字段语义统一、实现成熟度不同”的状态 |
| execution handle contract | 已完成（合同层） | 后续继续让对象层与行为验证层保持同一边界，避免重新混写 `program_id`、聚合根身份与单次执行句柄 |
| durable report / audit trail | 已完成（合同层基线） | 继续让 artifact、gate、report、export 闭环更完整 |
| control-plane 与 product runtime 的边界 | 合同层已完成 | 文档、测试、help、实现状态必须继续一致，不得再漂移 |
| gate semantics repo verification | 进行中 | 继续把 fail-closed gate、watch、decision-loop 从合同层压到行为验证层 |
| verification / checkpoint aggregation | 进行中 | 继续把 route aggregation、rollback gate、frozen gate 与 verification summary 压成一致的 machine-readable behavior |

## 三、逐仓当前下一棒

### 1. one-person-lab

当前下一棒不是发明更大的平台叙事，而是在 admitted-domain 新增 absorbed delta 或中央 reference surfaces 真实漂移时，作为中央同步持有人继续把顶层真相压稳。

具体继续项：

- 维护 `OPL` 顶层 current truth / public docs / central references 的一致性
- 持续同步 `Phase C` 的行为收口定义到中央 references 与顶层测试
- 继续同步四仓当前状态到中央参考面
- 继续守住：
  - `TypeScript CLI + gateway contract baseline`
  - candidate-domain blocked truth
  - `Grant Foundry -> Med Auto Grant` 的 signal-only 边界
- 不把 `OPL` 扩写成 runtime owner
- 如果 admitted-domain 没有新增 repo-tracked absorbed delta，或中央 reference surfaces 没有真实漂移，就应 honest stop

### 2. Med Auto Science

这条主线在本轮补齐 handle / durable surface 合同后，下一棒应转为手工测试驱动的稳定化。

具体继续项：

- 围绕 `docs/program/manual_runtime_stabilization_checklist.md` 这条 canonical checklist 做正式手工测试
- `runtime_watch` heartbeat / auto-recovery、closure handoff-ready bundle 识别、以及 publication gate 未 clear 时拒绝 premature completion 都已 absorbed 到 repo-side behavior hardening；后续只在真实 bugfix delta 出现时继续收紧
- 把测试中暴露的问题回流成 contract / audit / delivery / gate 修正
- 在 external runtime gate 清除前，不重开新的大架构 tranche
- `monorepo / runtime core ingest / controlled cutover` 长线保留，但在 external runtime gate 清除前，不提前进入 physical migration、cross-repo refactor 或 scaffold cutover
- display 资产化独立线不计入这条主线

### 3. RedCube AI

这条主线当前已经 absorb 到 `Phase 2 / runtime watch locator integrity hardening`，并把后续 same-mainline continuation board 预冻结完成。

具体继续项：

- 当前 absorbed provenance 已把 `workspace doctor -> source intake / source research -> deliverable create -> deliverable audit -> deliverable run` 冻结成同一条 repo-verified operator quickstart route
- `workspace doctor` 继续只做诊断；brand-new workspace 的 canonical bootstrap writer 是 `source intake / source research`（`run_source_intake` / `source research`），不是独立 workspace-init surface
- `Phase 2 / source-readiness deep research trigger + gate convergence` 继续作为 absorbed provenance 保留；`fd01266` 已把 quickstart 测试与 source-intake bootstrap flow 对齐
- `e8146a1` 已把 verification surfaces 分层，`762ea4c` 已把 runtime-program state 迁回 repo-tracked truth
- 当前已冻结 `phase_2_family_parity_autopilot_continuation_board`；若继续，应从 `phase_2_family_parity_governance_surface_convergence` 开始推进，而不是把 quickstart 再写成等待 freeze 的 blocker
- 持续保持 `CLI / MCP / controller` 三字段语义与实现状态一致
- 围绕 `ppt_deck`、`xiaohongshu` 等稳定 family 做手工测试
- 仍不提前扩成更大的统一 runtime 或 OPL runtime owner

### 4. Med Auto Grant

这条主线当前已经 absorb 到 post-R5A local runtime hardening current truth（`6277163` / `e8f9582` / `2c434b1` / `c3ba2a7` / `98df81f`）。

具体继续项：

- 当前五个 canonical CLI surface 仍是 formal entry / verifier baseline，但本地 runtime ladder 已继续吸收到 `run-local / resume-local / build-artifact-bundle / execute-revision-pass / build-final-package / build-hosted-contract-bundle`
- `stage-route-report` 继续承载 `verification_checkpoint / checkpoint_status`；post-R5A hardening 已把 canonical current-truth / walkthrough 路径锚回 root checkout，避免继续指向临时 worktree
- canonical local walkthrough / output consistency current truth 已冻结（`e8f9582`），revised-workspace validator / operator alignment drift 已 closeout（`2c434b1`）
- `build-hosted-contract-bundle` 覆盖既有 output 时，除 `grant_run_id / workspace_id / draft_id` 外，还必须校验 `execution_identity.program_id` 与 root-checkout `CURRENT_PROGRAM.program_id` 一致（`c3ba2a7`）
- `98df81f` 已把 control-plane state 迁回 repo-tracked truth；当前不得再把 `.omx/**` 当成仓内活真相 owner
- 当前不得回退成旧 `P4.B` 审计线；若继续，必须先有新的 concrete post-R5A local runtime hardening delta
- 保持 formal-entry matrix 的诚实表达：
  - `CLI` 是当前正式入口
  - `MCP` 仍是 future protocol layer
  - `controller` 仍是内部控制面
- 继续 author-side `Grant Ops` baseline hardening
- 不提前误写成 actual hosted runtime、`P5` federation 或成熟 submission-grade runtime

## 四、统一推进顺序

当前最合理的统一推进顺序如下：

1. 由 `one-person-lab` 持有 `Phase C` 的中央执行板、状态矩阵与任务板
2. 把 `redcube-ai` 已 absorb 的 `Phase 2 / runtime watch locator integrity hardening`、`e8146a1` verification-surface split、`762ea4c` runtime-program state migration back to repo-tracked truth，以及 `phase_2_family_parity_autopilot_continuation_board` 同步进中央参考面
3. 把 `med-autogrant` 已 absorb 的 post-R5A root-checkout truth path anchoring（`6277163`）、canonical walkthrough / output consistency（`e8f9582`）、validator / operator alignment closeout（`2c434b1`）、root `CURRENT_PROGRAM.program_id` fail-closed guard（`c3ba2a7`）与 `98df81f` control-plane state migration back to repo-tracked truth 同步进中央参考面，不回退旧 `P4.B`
4. 让 `med-autoscience` 围绕 manual stabilization checklist、runtime_watch auto-recovery、publication gate closeout semantics 做 repo-side 稳定化，不重开新的架构 tranche；display 资产线继续独立于 runtime 主线
5. 在至少两个业务仓的对象面、报告面和 gate 行为验证真正稳定后，再进入下一阶段

## 五、继续后置的事项

以下事项仍然继续后置，不属于当前 taskboard 的活跃范围：

- 共享代码框架抽取
- 统一平台 runtime
- 统一 Web 前端
- future `Human-in-the-loop` sibling / upper-layer product 的单独实现
- `MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover`
