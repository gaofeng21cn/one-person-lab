# Contract Convergence v1 执行板

状态锚点：`2026-04-08`

## 文档目的

这份文档是四仓统一推进时的中央执行板。
它不替代各仓自己的 `README`、`contracts/project-truth/AGENTS.md`、`CURRENT_PROGRAM` 或主线测试，只负责把当前统一 program、阶段定义、完成标准和四仓交付项压到同一个参考面。

## 当前统一 program

- 统一 program：`Contract Convergence v1`
- 当前阶段：`Phase B / Handle And Surface Convergence`
- 长线目标：先把三个业务仓在共享 `Unified Harness Engineering Substrate` 上的行为合同层拉平，再进入更深的对象面、报告面、验证面与未来 substrate core 抽取

这意味着当前并不是继续发明新的顶层叙事，也不是提前抽共享执行内核，而是把已经冻结的统一架构真正落实到各仓可验证的 handle、durable surface、audit trail 与边界语义上。

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

当前阶段，要求四仓把统一架构继续压到 repo-tracked handle / surface 合同层。

本阶段完成后，应达到：

- `redcube-ai`、`med-autogrant`、`med-autoscience` 都已写清楚各自的 execution handle contract
- 三个业务仓都已写清楚当前 canonical durable report / audit / watch surface
- `OPL` 有单独的中央执行板、状态总表和任务板来持有统一 program，而不是继续按四仓各自进度散管

### `Phase C / Object And Report Behavior Convergence`

后续阶段，不在本轮直接落地：

- 进一步压平对象层、报告层、gate surface 与 audit-watch 行为面
- 把当前统一合同继续变成 repo-verified 行为验证面
- 让三个业务仓在行为层达到更接近的完成标准，而不是只停留在文档层

### `Phase D / Substrate Core Extraction`

明确后置：

- 共享公共代码框架抽取
- 统一平台 runtime
- 托管式 Web runtime
- 真正可复用的新 `Harness OS` scaffold

只有当至少两个以上 domain 在对象边界、artifact schema、gate surface 与行为验证层都稳定后，才进入这一阶段。

## 四仓本轮交付项

| 仓库 | 本轮在 `Contract Convergence v1` 下的交付项 | 当前判断 |
| --- | --- | --- |
| `one-person-lab` | 持有中央执行板、状态总表、任务板与顶层 references；冻结统一阶段与完成标准 | 当前负责 program owner 与 reference-sync |
| `redcube-ai` | 明确 `program_id / topic_id / deliverable_id / run_id` 与 `auditDeliverable / runtimeWatch` 等 canonical surface | 已进入 Phase B 合同层完成态 |
| `med-autogrant` | 明确 `grant_run_id / workspace_id / draft_id / program_id` 与 `summarize-workspace / critique-summary / stage-route-report` | 已进入 Phase B 合同层完成态 |
| `med-autoscience` | 明确 `program_id / study_id / quest_id / active_run_id` 及 `study_runtime_status / runtime_watch / publication_eval / runtime_escalation / controller_decisions` | 本轮补齐到与另外两仓同层级的表达面 |

## 当前阶段的离场条件

只有同时满足以下条件，`Phase B` 才算完成：

- 三个业务仓都已经把 execution handle contract 写进 repo-tracked truth/docs
- 三个业务仓都已经把 current durable surface contract 写进 repo-tracked truth/docs
- `OPL` 的中央执行板、状态总表、任务板和 gateway contract references 使用同一阶段口径
- 测试已冻结这些表述，避免后续文档漂移

## 本轮明确不做的事

- 不把三个业务仓强行收敛成同一种执行内核实现
- 不提前抽共享公共代码框架
- 不把 `OPL` 扩写成 runtime owner
- 不在 `Med Auto Science` 主线里碰论文配图资产化独立支线
- 不把 future `Human-in-the-loop` sibling / upper-layer product 拉回同仓双模
