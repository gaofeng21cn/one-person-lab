# Contract Convergence v1 执行板

状态锚点：`2026-04-08`

## 文档目的

这份文档是四仓统一推进时的中央执行板。
它不替代各仓自己的 `README`、`contracts/project-truth/AGENTS.md`、`CURRENT_PROGRAM` 或主线测试，只负责把当前统一 program、阶段定义、完成标准和四仓交付项压到同一个参考面。

## 当前统一 program

- 统一 program：`Contract Convergence v1`
- 当前阶段：`Phase C / Object And Report Behavior Convergence`
- 长线目标：先把三个业务仓在共享 `Unified Harness Engineering Substrate` 上的对象层、报告层、gate semantics 与 audit-watch 行为面压成 repo-verified behavior surface，再进入更深的验证面与未来 substrate core 抽取

这意味着当前并不是继续发明新的顶层叙事，也不是提前抽共享执行内核，而是在 `Phase B` 已完成的前提下，把已经冻结的统一架构继续落实到各仓可验证的对象行为、报告行为、gate semantics 与 audit trail 上。

这里还要额外钉死一件事：`MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover` 长线没有取消，但它属于 domain-internal 后置轨，不属于当前四仓 `Phase C` 的直接交付。当前先做 `Phase C`，正是为了把那条长线未来需要依赖的对象边界、报告边界、gate semantics 与 audit 行为面先冻结干净。

## 四项统一完成标准

`Contract Convergence v1` 当前要求四仓共同满足以下四项：

1. `formal entry` 统一为：
   - `default_formal_entry = CLI`
   - `supported_protocol_layer = MCP`
   - `internal_controller_surface = controller`
2. 每个业务仓都要显式冻结 execution handle contract：
   - `program_id` 级 control-plane / report-routing 指针
   - 域对象聚合根身份
   - 单次运行或受管执行句柄
3. 每个业务仓都要显式冻结 durable surface contract：
   - 当前 canonical report / audit / watch surface
   - 当前 repo-verified artifact surface
   - gate semantics 与 fail-closed 边界
4. `control-plane` 与 `product runtime` 的边界必须一致：
   - 不把开发控制面误写成产品 runtime 已成熟
   - 不把 `controller` 抬成对外 formal entry
   - 不把 `Auto-only` 主线与 future `Human-in-the-loop` sibling / upper-layer layering 写乱

## 分阶段视图

### `Phase A / Naming And Boundary Convergence`

已完成并冻结：

- `OPL` 是顶层 `Gateway / Federation`
- `Unified Harness Engineering Substrate` 是共享架构基座
- 三个业务仓是共享 substrate 上的 `Domain Harness OS`
- 当前统一按 `Auto-only` 主线理解，future `Human-in-the-loop` 产品作为 sibling 或 upper-layer product
- `CLI-first / MCP supported / controller internal` 的 formal-entry matrix 已完成统一

### `Phase B / Handle And Surface Convergence`

已完成并冻结。

本阶段完成后，已经达到：

- `redcube-ai`、`med-autogrant`、`med-autoscience` 都已写清楚各自的 execution handle contract
- 三个业务仓都已写清楚当前 canonical durable report / audit / watch surface
- `OPL` 有单独的中央执行板、状态总表和任务板来持有统一 program，而不是继续按四仓各自进度散管

### `Phase C / Object And Report Behavior Convergence`

当前阶段，要求四仓把统一架构继续压到 repo-verified behavior 面：

- `OPL`
  - 持续维护中央执行板、状态总表、任务板与顶层 reference docs/tests 的同相同步
  - 明确 `Phase C` 的统一离场条件，不让四仓重新散管
- `redcube-ai`
  - 把 `auditDeliverable / runtimeWatch / getReviewState / getPublicationProjection` 压到同一 deliverable/topic 边界上的 repo-verified behavior
  - 继续锁定 `run_id` 只是 per-run handle，不污染 `topic_id / deliverable_id`
  - 当前 latest absorbed tranche 已推进到 `Phase 2 / direct-delivery operator handoff hardening`；若继续，需要新的 same-mainline truthful freeze，而不是直接扩写 future scope
- `med-autogrant`
  - 把 `validate-workspace / summarize-workspace / critique-summary / stage-route-report` 继续压成一致的 verification / checkpoint 行为面
  - 继续锁定 `forced_rollback_stage / forced_rollback_reason / presubmission_frozen` 的 machine-readable checkpoint 语义
  - 当前 latest absorbed checkpoint 已推进到 `P4.A / Verification Gate Surface`；下一 truthful step 不是直接实现 `P4.B`，而是先冻结 `P4.B / Verification OS And Checkpoint Surface` activation package
- `med-autoscience`
  - 主线不重开新的架构 tranche
  - 以手工测试驱动稳定化，并保持 external runtime gate 的 truth 不漂移
  - `monorepo / runtime core ingest / controlled cutover` 仍是明确长线，但在 external runtime gate 清除前，不提前进入 physical migration、cross-repo refactor 或 scaffold cutover

本阶段的重点不是再补一轮命名，而是把统一合同继续变成 repo-verified behavior。

### `Phase D / Substrate Core Extraction`

明确后置：

- 共享公共代码框架抽取
- 统一平台 runtime
- 托管式 Web runtime
- 真正可复用的新 `Harness OS` scaffold
- `MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover` domain-internal 长线

只有当至少两个以上 domain 在对象边界、artifact schema、gate surface 与行为验证层都稳定后，才进入这一阶段。

## 四仓本轮交付项

| 仓库 | 本轮在 `Contract Convergence v1` 下的交付项 | 当前判断 |
| --- | --- | --- |
| `one-person-lab` | 持有中央执行板、状态总表、任务板与顶层 references；冻结统一阶段与完成标准 | 当前负责 `Phase C` program owner 与 reference-sync |
| `redcube-ai` | 把 `auditDeliverable / runtimeWatch / getReviewState / getPublicationProjection` 收口为同一 deliverable/topic 边界上的 canonical behavior | 已 absorb 到 `Phase 2 / direct-delivery operator handoff hardening`；当前没有已冻结的下一候选 tranche |
| `med-autogrant` | 把 `stage-route-report` 收口为 verification / checkpoint canonical behavior，并锁定 rollback / frozen gate 语义 | 已 absorb 到 `P4.A / Verification Gate Surface`；下一 truthful step 仅是先冻结 `P4.B` activation package |
| `med-autoscience` | 保持 `program_id / study_id / quest_id / active_run_id` 与 current durable surface truth，不重开新 tranche | 当前转入手工测试稳定化面；`monorepo / runtime core ingest / controlled cutover` 明确保留为后置长线 |

## 当前阶段的离场条件

只有同时满足以下条件，`Phase C` 才算完成：

- `redcube-ai` 已把四个 canonical surface 的同轴行为冻结进 repo-verified 测试
- `med-autogrant` 已把 verification / checkpoint surface 的聚合语义冻结进 repo-verified 测试
- `med-autoscience` 主线的手工测试稳定化边界与 external runtime gate truth 继续保持一致
- `OPL` 的中央执行板、状态总表、任务板和顶层 tests 使用同一 `Phase C` 口径

## 本轮明确不做的事

- 不把三个业务仓强行收敛成同一种执行内核实现
- 不提前抽共享公共代码框架
- 不把 `OPL` 扩写成 runtime owner
- 不在 `Med Auto Science` 主线里碰论文配图资产化独立支线
- 不把 future `Human-in-the-loop` sibling / upper-layer product 拉回同仓双模
- 不把 `MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover` 提前拉进当前四仓 `Phase C`
