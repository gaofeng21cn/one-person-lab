# 四仓统一对齐检查表与任务板

状态锚点：`2026-04-07`

## 文档目的

这份文档把当前已经冻结的统一构架，压缩成一份可执行的对齐任务板。

它主要回答四个问题：

1. 四仓当前共同需要对齐什么
2. 每个仓当前最优先要补什么
3. `Med Auto Science` 与 `RedCube AI` 何时适合进入手工测试
4. 现阶段哪些事情应继续后置，不要抢跑

## 使用规则

- 这是 `OPL docs` 下的内部参考文档，默认中文维护。
- 它不替代各仓自己的 `README`、`contracts/project-truth/AGENTS.md`、`CURRENT_PROGRAM.md` 或 domain 内主线文档。
- 它只作为内部参考同步面，不反向抬升为 `OPL` 公开主线真相。
- 这里的任务优先级只用于“统一对齐”阶段；进入手工测试后，应再按真实暴露的问题调整。
- 若需要把任务交给 `OMX` 长线执行，执行方式以 `omx-stage-gated-longrun-guide.md` 为准。
- 当任一仓的 `P0` 或 `P1` 明显完成后，应同步更新本表。

## 一、当前统一结论

当前最重要的不是继续发明新的上层名词，而是把已经冻结的统一合同真正压到各仓的 repo-durable truth 与 runtime contract 上。
对 `one-person-lab` 而言，当前 baton 是 `G2 stable public baseline` 收口与 `G3 thin handoff planning` 预冻结，而不是 runtime 扩面。

当前执行顺序已经明确为：

1. 先完成本轮 `P0` 对齐开发
2. 再让 `Med Auto Science` 与 `RedCube AI` 进入正式手工测试
3. 用测试暴露的问题继续推进各仓 `P1 / P2`
4. `Med Auto Grant` 继续以 `baseline hardening` 为主

这意味着：

- “继续收紧合同”和“开始测试”不是对立关系
- 但在当前时间点，测试应建立在本轮 `P0` 已完成的前提上
- 共享代码框架、统一平台 runtime、统一 Web 前端仍继续后置

## 二、四仓共同对齐检查表

| 对齐项 | 统一要求 | 当前判断 | 当前动作 |
| --- | --- | --- | --- |
| 开发控制面角色 | 四仓统一采用 `Codex Host` 负责规划冻结，`OMX` 负责长时执行 | 顶层口径已统一 | 继续把口径压到各仓 repo-durable 文档与回归 |
| 产品 runtime 与开发控制面分离 | 不能把开发控制面成熟度写成产品 runtime 成熟度 | 顶层口径已统一 | 各仓继续清理超前表述 |
| formal entry 矩阵 | 三个业务仓都要明确 `MCP / CLI / controller` 的正式入口边界 | 仅部分清楚 | 各仓补“已实现”和“未来目标”的明确分界 |
| 显式执行句柄 | 每个业务仓都要有稳定的 per-run handle | `redcube-ai` 已较完整，其他两仓仍需收紧 | 各仓补 `quest_id / run_id / grant_run_id` 一类正式句柄 |
| durable truth surface | 运行真相必须落到仓内或受控 surface | 三仓都有基础，但完整度不一 | 各仓补 artifact、gate、report、export 的闭环 |
| 控制动作语义 | `watch / status / resume / rerun / pause / stop` 要么正式支持，要么明确不支持 | 三仓均未完全收束 | 各仓做显式结论，不保留模糊状态 |
| repo-durable handoff surface | 关键 handoff 不能只停留在本地 `.omx/.codex` 隐式状态 | 三仓均有缺口 | 把最小必要真相提升到 repo-tracked surface 或严格 installer 链 |
| truth / gate 一致性 | 文档、reports、help、测试 gate、实现状态必须一致 | `redcube-ai` 缺口最大 | 先收敛 truth surface，再谈扩面 |

## 三、逐仓任务板

### 1. one-person-lab

#### 当前角色

- 顶层 `Gateway / Federation`
- 四仓统一语义、统一合同、统一文档治理的真相冻结面

#### P0

- 继续把四仓统一合同维持在 `OPL` 层：
  - `Unified Harness Engineering Substrate`
  - `Codex-default host-agent runtime`
  - `Codex Host / OMX` 开发控制面
- 维持并更新四份内部参考同步面：
  - `ecosystem-status-matrix.md`
  - `host-agent-runtime-contract.md`
  - `development-operating-model.md`
  - `runtime-alignment-taskboard.md`
- 同步回写 `OPL` 顶层参考同步面：
  - `docs/roadmap.zh-CN.md`
  - `docs/opl-public-surface-index.zh-CN.md`
  - `contracts/opl-gateway/README.zh-CN.md`
  - `docs/references/opl-gateway-rollout.zh-CN.md`
- 保持 `OPL` 不越界为 domain runtime owner

#### P1

- 继续把四仓共同检查项收进 `OPL` 的 onboarding / gateway 说明面
- 形成稳定的“四仓状态更新节奏”，避免各仓单独漂移
- `G3` 当前仅做 `thin handoff planning` 预冻结
- repo-tracked planning brief：`docs/plans/2026-04-07-g3-thin-handoff-planning-brief.md`
- repo-tracked release-closeout note：`docs/plans/2026-04-07-g2-release-closeout-note.md`
- 当前不推进统一 runtime owner，也不抽共享执行内核

#### P2

- 只有在至少两个业务仓长期稳定后，再讨论共享代码框架与统一平台 runtime 的抽取规范

### 2. Med Auto Science

#### 当前判断

- formal entry、结构化 hydration、`quest_id`、watch/status/review/gate 与 `MedDeepScientist` 受控 execution surface 已基本对齐
- 当前核心问题不在入口层，而在 `delivery plane contract map`、outer-loop 决策闭环、legacy transport 单一路径化、以及 repo-durable handoff surface

#### P0

- 完成 `study_outer_loop_tick(...)` 与 `study_decision_record`，把 study-level durable decision loop 真正闭环
- 收紧 `MedDeepScientist` transport，为 runtime 不可达场景建立 fail-closed 合同
- 退役或显式禁止本地文件写旁路，避免 daemon 不可达时走第二写路径

#### P1

- 补齐 formal study-runtime control surface 的 `stop` 语义
- 明确 `rerun` 是正式支持还是当前明确不支持
- 补齐 `.omx/plans/spec-program-operating-model.md` 或同等级 canonical spec
- 为 repo-tracked `docs/specs/**` 或 `docs/plans/**` 建稳定桥接入口

#### P2

- 把 `Codex Host / OMX` 分工提升为 repo-tracked 内部操作文档
- 给 `runtime_escalation_record`、`publication_eval`、`launch_report`、`runtime_watch`、`publishability_gate` 建统一 artifact map

#### 进入手工测试前的门槛

- 上述 `P0` 完成
- 至少有一条从 runtime escalation 到 study decision 再到 next action 的闭环 smoke path 可跑通
- transport 不再通过本地旁路掩盖真实失败

### 3. RedCube AI

#### 当前判断

- 结构化 hydration、显式 `run_id`、durable artifact/review/gate surface 已较完整
- 当前 formal entry 真相应固定为 `MCP / CLI`
- 当前 active mainline 是 `redcube-runtime-program / P0 credible green baseline repair`；`Phase 2 / source intake + shared source truth` 尚未重新开工
- 当前最大问题不是执行内核，而是 authoritative truth surface、formal entry 口径与 green baseline 已出现明显漂移

#### P0

- 收敛 `CURRENT_PROGRAM`、`LATEST_STATUS`、`OPEN_ISSUES`、测试 gate 与实际实现状态的主线口径
- 重新建立可信的 green baseline，让 `npm test` 或正式测试 gate 再次可用
- 冻结 formal entry 真相为当前已验证的 `MCP / CLI`
- 在 `truth drift` 收敛前，不重开 `Phase 2 / source intake + shared source truth`

#### P1

- 修正 runtime 文档与 family contract 漂移
- 写清 `shared source truth` 是“代码能力已具备但 current mainline 未激活”，还是“已进入当前主线”
- 处理 `.codex/AGENTS.md` 中的 dangling references
- 补 repo-tracked program operating model，明确 `.omx/plans/**` 与仓库版本化 truth 的关系

#### P2

- 对 `resume / pause / stop` 做显式结论：
  - 正式实现
  - 或明确当前不支持
- 在 truth drift 收敛前，不继续扩 controller、新入口或更大的 OPL 联动面

#### 进入手工测试前的门槛

- 上述 `P0` 完成
- formal entry 真相与对外文档一致
- 当前 green baseline 能被真实测试重新验证

### 4. Med Auto Grant

#### 当前判断

- 当前最像“四仓开发控制面参考实现”的本地形态
- 但按统一 runtime 合同严格看，仍只达到“最小 baseline 基本成立”，还未进入成熟长跑 runtime 阶段
- 当前 `grant_run_id` 已进入正式执行句柄合同；下一步重点是 formal-entry / durability current truth 收口

#### P0

- 守住 `grant_run_id` 作为当前正式执行句柄
- 明确它与 `workspace_id`、`draft_id`、`program_id` 的边界
- 让 CLI 输出、runtime reports 与未来恢复入口统一携带同一 handle
- 把 formal entry matrix 与 durability current truth 收口到 repo-tracked surfaces

#### P1

- 冻结 formal entry 矩阵：
  - 若当前只正式支持 `CLI`，就明确写成当前真相
  - 否则补受控 `MCP` 或 `controller` 入口
- 解决 `.omx/.codex` 的 durability 模型冲突
- 让文档、测试与 installer / bootstrap 依赖同一条真相链

#### P2

- 补 runtime write / export surface 与 `HITL gate` skeleton
- 把 CLI 命令数、blocker / risk 口径、future tranche 叙述继续编码进 regression

#### 当前阶段说明

- 当前不进入“功能效果手工测试优先”序列
- 先把 baseline hardening 做扎实，再谈产品级稳定化

## 四、推荐推进顺序

### 并行推荐

1. `OPL` 先回写四仓最新状态到顶层参考同步面，完成 `G2` 收口并预冻结 `G3 thin handoff planning`
2. `Med Auto Science` 处理 `P0`
3. `RedCube AI` 处理 `P0`
4. `Med Auto Grant` 处理 `P0`，并并行准备 `P1` 的 formal entry freeze

### 若开发资源不足

建议顺序如下：

1. `RedCube AI P0`
2. `Med Auto Science P0`
3. `Med Auto Grant P0`
4. `OPL` 回写顶层参考同步面并持续同步口径

原因不是 `redcube-ai` 最重要，而是它当前 truth drift 最大；如果不先收敛，后续测试与口径都会继续失真。

## 五、测试启动结论

当前结论应统一理解为：

- `Med Auto Science`：先完成本轮 `P0`，再开始手工测试
- `RedCube AI`：先完成本轮 `P0`，再开始手工测试
- `Med Auto Grant`：当前不以手工测试为主，继续 baseline hardening
- `OPL`：不进入产品手工测试序列，继续维护顶层合同与状态总表

也就是说，现阶段不是“直接开始测试”，而是“先完成最小统一对齐，再让测试成为下一轮主方法”。
