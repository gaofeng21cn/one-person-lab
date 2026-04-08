# Contract Convergence v1 决策记录（2026-04-08）

## 文档定位

这是一份 `OPL` 第三层参考级内部记录。

它的目的只有一个：把截至 `2026-04-08` 已经明确、且后续四仓需要共同遵守的统一判断先冻结成同一份底稿，避免后续继续口头漂移。

这份文档当前不承担下面这些职责：

- 不自动改写 `one-person-lab` 的公开主线
- 不自动吸收为三个业务仓的 current truth
- 不代表 `redcube-ai` 与 `med-autogrant` 已完成停车并完成统一改写
- 不把尚未 repo-verified 的未来形态写成已经实现的现实

在剩余业务仓完成本轮停车前，这份文档只作为后续正式落地 `Contract Convergence v1` 的参考锚点。

## 适用范围

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

## 已冻结的统一结论

### 1. `OPL` 的系统位置

- `OPL` 是顶层 `gateway`、`federation` 与 shared-language 仓。
- `OPL` 不是第四个 `Domain Harness OS`。
- `OPL` 不持有 domain-local long-running runtime。
- `OPL` 的职责是统一系列项目的命名、边界、合同、联邦语义与治理语义。

因此，后续若要继续推进 `OPL`，方向不是“继续编一个更大的平台故事”，而是在 admitted-domain 的证据边界内，持续收紧顶层联邦、入口、路由、治理与对外口径。

### 2. `Unified Harness Engineering Substrate` 是上位架构名

- `Unified Harness Engineering Substrate` 是当前系列项目的总架构名称。
- 它首先是共享的架构语义、共享的合同语义、共享的五个平面与共享的工程方法，而不是已经独立交付的共享代码框架。
- 当前阶段统一的重点是共享 substrate 语言，而不是强行宣称四仓已经共享同一份运行内核。

因此，后续文档应优先把 `Unified Harness Engineering Substrate` 作为上位名词；`host-agent` 只适合描述当前本地默认部署形态，不应被继续写成未来商业化形态的唯一总称。

### 3. 四仓统一采用同一开发控制面语义

当前四仓统一遵守下面这套开发控制面分工：

- `Codex` 负责规划、真相冻结、阶段裁决、最终集成判断
- `OMX` 负责长时间连续执行、验证、报告回写与受控推进

这套统一的是开发控制面，不是产品 runtime 本体。

因此必须继续严格区分：

- 产品 runtime
- 开发控制面

`CURRENT_PROGRAM`、`reports`、`specs`、`plans`、验收记录与阶段指针，属于开发控制面；它们不能被误写成业务仓产品 runtime 已完全统一的证据。

### 4. formal entry 采用三层矩阵，而不是简单二选一

后续四仓在描述 formal entry 时，应统一采用下面这组三层字段：

- `default_formal_entry`
- `supported_protocol_layer`
- `internal_controller_surface`

当前已经明确的统一判断如下：

- `default_formal_entry`：`CLI-first`
- `supported_protocol_layer`：`MCP-capable`
- `internal_controller_surface`：`controller`

这里的含义必须写清楚：

- `CLI` 是默认对外正式入口，优先承担 agent 与本地执行环境之间的高密度交互闭环
- `MCP` 不是默认入口，但仍是正式的扩展协议层，用于远程系统接入、组织治理、标准化发现、授权与跨宿主复用
- `controller` 属于内部控制面，不应再与 `CLI`、`MCP` 并列写成同等级对外 formal entry

因此，后续不再采用“`CLI-only` 全局总路线”，也不再采用“`MCP / CLI / controller` 三者并列、无主次”的写法。

### 5. 三个业务仓当前都是 `Auto-only` 的 `Domain Harness OS`

当前 `med-autoscience`、`redcube-ai`、`med-autogrant` 的仓库主线，统一按下面方式理解：

- 它们都是 `Auto-only` 的当前主线
- 它们都属于 `Domain Harness OS`
- 它们都应逐步对齐同一 substrate contract

这同时意味着：

- `Auto / HITL 共基座` 指的是共享 substrate、共享对象语义、共享审计与 gate 语义
- 它不等于“在同一个仓里同时实现两套顶层判断逻辑”

未来的 `HITL` 版本更合理的路径是：

- 以上述 `Auto` 仓作为底层依赖或兼容执行基座
- 复用执行、对象、artifact、audit、gate、report 等稳定模块
- 在上层另建一个 sibling 或 upper-layer 产品，按人的意图重新设计控制逻辑

因此，当前三个业务仓不再按“同仓双模”理解，也不应被要求在当前仓内同时收敛出一套完整的人机回环顶层判断逻辑。

### 6. 近期统一的是合同面，不是同一份执行内核

三个业务仓虽然都属于 `Domain Harness OS`，但近期真正需要统一的，是下面这些合同面：

- formal entry 语义
- per-run handle
- durable report
- audit trail
- gate semantics
- control-plane 与 product runtime 的边界
- 五个共享平面的命名与职责解释

这不要求三仓立刻收敛成同一份共享运行内核。

以 `med-autoscience` 为例：

- 其主线仍可继续通过 `MedDeepScientist` 受控 surface 承担长跑执行
- 近期目标是把它纳入统一合同，而不是为了形式统一立刻推倒重构

因此，`Contract Convergence v1` 的直接目标，是先把三个业务仓拉到同一 substrate contract 上，而不是一开始就抽象出一套公共代码框架。

## 与现有参考文档的关系

这份文档当前主要补充和澄清两类尚未正式 absorb 的统一口径：

- `docs/references/host-agent-runtime-contract.md`
- `docs/references/development-operating-model.md`

需要特别注意的是：

- 这两份旧参考文档仍可继续描述已经 absorb 的既有边界
- 但凡涉及 formal entry matrix、`CLI-first / MCP-capable`、`Auto-only` 与未来 `HITL` 分层路径时，应优先以本决策记录为准
- 等剩余业务仓停车后，再把这些新结论正式吸收到对应仓的合同层与公开文档层

## 当前明确不做的事

- 不把这份文档直接升格为三个业务仓已 absorb 的 current truth
- 不把 `OPL` 写成 domain runtime owner
- 不把 `Unified Harness Engineering Substrate` 写成已经独立发布的共享代码框架
- 不把当前三个 `Auto` 仓写成已经内建完整 `HITL` 逻辑
- 不把“统一合同面”误写成“统一实现内核”
- 不在 `redcube-ai` 与 `med-autogrant` 停车前，提前批量改写它们的 `README`、`project truth` 或主线 runtime 文档

## 停车后的正式落地顺序

当 `redcube-ai` 与 `med-autogrant` 停车后，下一轮正式推进建议按下面顺序执行：

1. 在四仓同步推进 `Contract Convergence v1` 的合同层改写
2. 统一 formal entry matrix 的字段与表述
3. 统一三个业务仓的对象、报告、审计与 gate 语义
4. 把 `Auto-only` 主线从架构口号逐步收紧为仓内可验证的行为面
5. 至少等两个 domain 在对象边界、artifact schema、gate surface 上长期稳定后，再决定是否抽共享代码框架、统一平台 runtime 或统一 Web 前端

## 当前使用方式

在正式落地前，这份文档只承担三件事：

1. 给四仓后续统一改写提供同一份判断锚点
2. 防止旧口径与新口径继续在对话中来回漂移
3. 明确哪些结论已经冻结，哪些动作仍然必须等待业务仓停车后再 absorb
