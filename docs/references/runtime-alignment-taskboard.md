# 四仓统一对齐检查表与任务板

状态锚点：`2026-04-08`

## 文档目的

这份文档把已经吸收到四仓 current truth 的统一构架，压缩成一份仍然可执行的检查表。

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

## 使用规则

- 这是 `OPL docs` 下的内部参考文档，默认中文维护。
- 它不替代各仓自己的 `README`、`contracts/project-truth/AGENTS.md`、`CURRENT_PROGRAM.md` 或 domain 内主线文档。
- 它只作为内部参考同步面，不反向抬升为 `OPL` 公开主线真相。
- 截至 `2026-04-08`，其中大部分合同层对齐项已经完成；下面保留的主要是“下一步仍要继续压实的行为面”。
- 若与各仓 current truth 冲突，以各仓 current truth 为准。

## 一、当前统一结论

当前最重要的已经不是继续发明新名词，而是守住已经吸收到各仓 current truth 的统一口径，并把剩余工作明确归到行为面。

截至当前，四仓共同完成了这些统一：

- 开发控制面统一采用 `Codex Host / OMX` 分工
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
- 当前 active follow-on 是 `Minimal admitted-domain federation activation package`
- 当前 top-level formal entry contract 仍是 `TypeScript CLI + read-only gateway surface`
- `Review Ops -> Thesis Ops` 是已冻结的 candidate-domain closeout 顺序

## 二、跨仓统一检查表

| 对齐项 | 当前状态 | 仍需继续的部分 |
| --- | --- | --- |
| 开发控制面分工 | 已完成 | 各仓后续新增文档、report、回归不得再把 `Codex Host / OMX` 分工写乱 |
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

当前下一棒不是发明更大的平台叙事，而是继续把 admitted-domain federation 的顶层真相压稳，并持有 `Phase C` 的统一离场条件。

具体继续项：

- 维护 `OPL` 顶层 current truth / public docs / central references 的一致性
- 持续同步 `Phase C` 的行为收口定义到中央 references 与顶层测试
- 继续同步四仓当前状态到中央参考面
- 继续守住：
  - `TypeScript CLI + read-only gateway baseline`
  - candidate-domain blocked truth
  - `Grant Foundry -> Med Auto Grant` 的 signal-only 边界
- 不把 `OPL` 扩写成 runtime owner

### 2. Med Auto Science

这条主线在本轮补齐 handle / durable surface 合同后，下一棒应转为手工测试驱动的稳定化。

具体继续项：

- 围绕已稳定能力做正式手工测试
- 把测试中暴露的问题回流成 contract / audit / delivery / gate 修正
- 在 external runtime gate 清除前，不重开新的大架构 tranche
- display 资产化独立线不计入这条主线

### 3. RedCube AI

这条主线当前可以继续在同一 mainline 上做 hardening，而不是重新退回“等待显式下一棒”。

具体继续项：

- 继续同一主线上的 `review / export / gate / audit` hardening
- 把 `auditDeliverable / runtimeWatch / getReviewState / getPublicationProjection` 压成同一 deliverable/topic 边界上的 canonical behavior
- 持续保持 `CLI / MCP / controller` 三字段语义与实现状态一致
- 围绕 `ppt_deck`、`xiaohongshu` 等稳定 family 做手工测试
- 仍不提前扩成更大的统一 runtime 或 OPL runtime owner

### 4. Med Auto Grant

这条主线当前仍不是“产品效果打磨优先”，而是继续 author-side mainline hardening。

具体继续项：

- 继续把 `grant_run_id`、durability、checkpoint、verification surface 收紧
- 把 `stage-route-report` 压成当前 canonical verification / checkpoint 聚合面
- 保持 formal-entry matrix 的诚实表达：
  - `CLI` 是当前正式入口
  - `MCP` 仍是 future protocol layer
  - `controller` 仍是内部控制面
- 继续 author-side `Grant Ops` baseline hardening
- 不提前误写成成熟 submission-grade runtime

## 四、统一推进顺序

当前最合理的统一推进顺序如下：

1. 由 `one-person-lab` 持有 `Phase C` 的中央执行板、状态矩阵与任务板
2. 让 `redcube-ai` 先把 canonical audit / watch / review / projection surface 压成同轴行为验证
3. 让 `med-autogrant` 继续 author-side baseline hardening，并把 verification / checkpoint surface 压成同轴行为验证
4. 让 `med-autoscience` 以手工测试驱动稳定化，不重开新的架构 tranche
5. 在至少两个业务仓的对象面、报告面和 gate 行为验证真正稳定后，再进入下一阶段

## 五、继续后置的事项

以下事项仍然继续后置，不属于当前 taskboard 的活跃范围：

- 共享代码框架抽取
- 统一平台 runtime
- 统一 Web 前端
- future `Human-in-the-loop` sibling / upper-layer product 的单独实现
