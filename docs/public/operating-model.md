# OPL 运行模型

Owner: `One Person Lab`
Purpose: `public_operating_model_support`
State: `public_support`
Machine boundary: 本文是人读公开运行模型。机器 truth 继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

> Currentness rule: 本文只保存公开运行模型和用户视角的 owner / activation / shared-boundary 读法，不冻结 shared runtime / shared domain contract 状态、provider readiness、App release/user-path evidence、worklist counter、domain-ready 或 production-ready 结论。当前产品分层、运行主线、shared runtime/domain contract 状态、Foundry Agent 覆盖、App evidence 与剩余证据缺口必须从核心五件套、active gap plan、[Shared Runtime Contract](../specs/shared-runtime-contract.md)、[Shared Domain Contract](../specs/shared-domain-contract.md)、contracts、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts 读取。

## 核心判断

`OPL` 的核心判断，不是“怎么让一个 Agent 一次性做完一个任务”，而是“怎么让一个研究型个人或极小团队，通过稳定表面持续承担正式实验室工作”。

所以，`OPL` 更准确的理解是面向持续实验室工作的 stage-led、以 Agent executor 为最小执行单位的智能体运行框架。它以 `Codex CLI` 作为 stage 内默认具体执行器，用接近人类专家实施方式的 stage 组织大型任务，并持有 activation、stage attempt、stage-attempt request/projection、wakeup、receipt、recovery、projection、shared modules / contracts / indexes 等框架能力。

## 顶层链路

理想主链应是：

```text
Human / Agent
  -> Codex-default executor
      -> explicit OPL activation
          -> provider-backed stage runtime
              -> selected domain agent entry
                  -> domain-owned truth / review surfaces / deliveries / audit truth
```

当前最清楚的三条映射是：

- `Research Foundry` -> 独立 `domain agent` `MedAutoScience`
- `Grant Foundry` -> 独立 `domain agent` `MedAutoGrant`
- `Presentation Foundry` -> 独立 `domain agent` `RedCube AI` 里的 `ppt_deck`

## 角色分工

### 人类

人类主要负责：

- 定义目标与任务边界
- 提供或授权使用数据、文献和上下文
- 审核关键结论与正式交付物
- 决定继续、停止、改题或提交

### Agent

Agent 主要负责：

- 先读状态再行动
- 调用稳定接口推进任务
- 组织中间产物和正式产物
- 把关键执行过程写回可审计表面

### OPL Framework 与共享基础结构

顶层 `OPL` framework 层负责：

- 表达顶层任务语义
- 只在显式请求时把任务 activation 到正确的 domain surface
- 持有 stage attempt、stage-attempt request/projection、wakeup、receipt、recovery、projection 与 shared runtime/index primitives
- 定义跨 domain 的共享基础结构要求
- 拥有 shared-foundation 的顶层控制语言，但不接管各 domain 的 canonical truth
- 让跨 domain 的身份、治理与交付语言保持一致
- 维护 family-level shared modules、contracts 与 indexes

当前仓库承担的是这个角色的公开 framework 与产品面；其中部分 provider/runtime 能力仍处在从合同与测试证据走向生产常驻的阶段。

### Domain Agent、Entry 与 Domain-Owned Authority

每个独立 `domain agent` 仓应保持三层分开：

- `domain agent` 作为仓库对外公开主语
- domain-owned entry surface 作为该工作流的稳定边界入口
- domain-owned authority function / quality gate / delivery authority 作为该工作流的领域判断、授权、记录与交付底座

例如：

- `MedAutoScience` 是 `Research Foundry` 的独立 domain agent，其内部继续持有 domain entry、research truth、publication quality gate、memory/artifact authority 与 delivery authority
- `RedCube AI` 是视觉交付的独立 domain agent，其内部继续持有 domain entry、visual truth、review/export gate、artifact authority 与 delivery authority

通用 stage attempt、queue、wakeup、retry/dead-letter、receipt/projection、generic lifecycle index、operator workbench 和 App drilldown 归 OPL Framework / One Person Lab App。domain repo 中仍存在的私有 runtime、session、workbench 或 sidecar 代码，只能按当前 gap plan 收薄为 authority function、domain handler target、refs-only adapter、diagnostic、history/tombstone 或 OPL generated/hosted target。

## AI-first / Executor-first 执行

`OPL` 默认采用 `AI-first / executor-first / Codex-first` 执行。
各个 domain 可以选择自己的模型接口，但 `OPL` 层的默认 executor 路径是 `Codex CLI`。
OPL 负责给 selected executor 提供 stage、上下文、工具、权限、质量门、receipt 和 projection；开放式推理、写作、评审、诊断和修订由 executor 完成。
主流程驱动者负责读状态、调用稳定的 domain-owned 工具、组织中间产物、推进 gate，并把关键痕迹写回可审计表面。

在这个模型里，代码的主要职责是提供：

- 稳定对象模型
- stage selector / launch gate
- 工具封装
- gate 规则
- 审计落盘
- review surface 与交付协议

`OPL` 应避免把 domain workstream 重新压回“固定代码流水线 + 少量 prompt 占位”的形态，否则共享 foundation 仍会存在，但各个 `Ops` 会逐步失去可编排性与可迁移性。

## 当前 Auto 主线与未来 HITL 分层

在 `OPL` 层，当前冻结下来的规则已经不再是“同一个仓里同时暴露两套顶层模式”。
现在统一后的规则是：

- 已收录的 domain 仓按 `Auto-only` 主线理解
- 未来如果要做 `Human-in-the-loop` 产品，应作为 sibling 或 upper-layer product 复用同一套 substrate-compatible contract 与执行模块
- 真正共享的是 substrate contract，而不是同仓模式切换开关

这里的关键区别在于分层方式：未来更高判断密度的上层产品，建立在当前 `Auto-only` 主线之上，并复用同一套稳定 contract、对象语义、审计面与执行模块。
`OPL` 现在冻结的是这种分层规则，并保持当前主线定义清楚。

## 产品入口与 Runtime Manager

当前 repo-tracked 的 formal entry，是通过 `opl`、`opl exec` 与 `opl resume` 暴露的 `Codex CLI` default 路径。
这是当前真实默认入口，同时显式 activation 仍可以选择 domain agent 或非默认 runtime。

更合理的长期方向是：

- 当前继续以 `Codex CLI` 作为 formal executor
- `MCP` 继续作为 supported protocol layer
- domain-owned product entry surface 继续作为 domain workflow、domain truth、quality / delivery authority 与 receipt / typed blocker 的 ownership 边界
- `OPL Runtime Manager` 只作为已配置 family runtime provider 之上的 product-managed 薄 adapter

在这条演进线上：

- 顶层 `OPL` 继续定义产品体系、显式 activation 语义与 shared indexes
- `UHS` 继续作为共享 Harness Engineering 上位语言
- `Shared Runtime Contract` 作为 active support contract 承接长期在线运行所需的共享合同读法
- `Shared Domain Contract` 作为 active support contract 承接 formal entry、运行身份、报告面、审计面与 gate 语义这类跨 domain 正式行为合同读法
- 各个独立 `domain agent` 仓继续承接自己的产品入口、domain workflow truth、quality gate、memory/artifact authority 与交付授权

这两个 shared contract 是当前支撑面，不是本文派生出的未来计划；它们的机器真相仍回到 contracts、source、tests、CLI/read-model、runtime ledger 与 domain-owned evidence。

因此，未来更像是“多个垂类在线 agent 产品复用同一 substrate”，而不是“一个顶层巨型 runtime 吞掉所有 domain”。
当前已经落地的是这条结构的 framework/control-plane、executor adapter、provider code path、receipt/projection 和 domain descriptor 层；尚未闭合的是外部 production provider 长时运行和真实 domain soak。

当这里提到 `Hermes-Agent` 时，指的只是不受 OPL 持有的上游外部 runtime project / service。`hermes_agent`、`claude_code` 与 `antigravity_cli` 属于当前 canonical executor backend set，并且只能作为显式非默认 executor adapter/backend 使用。

Hermes provider / Gateway / readiness / compat 面只保留为历史 provenance、诊断语料或负向 guard。Temporal-backed provider 已是 production online runtime 的必需 substrate，真实 production soak 仍单独验收。
`OPL Runtime Manager` 可以在已配置 family runtime provider 之上适配 product-managed runtime operations，但不能写成 scheduler、session store、memory owner、domain truth owner 或 concrete executor owner。
Rust native helper / index-only 工作可以支持 native assistance 与 indexed discovery，但不能成为 domain execution 或 truth 的 owner。

## 运行原则

`OPL` 顶层遵循这些原则：

- 先读状态，再做变更
- 关键动作必须留下可审计结果
- 优先走稳定 domain-owned entry contract，而不是临时旁路
- 优先复用共享资产，而不是复制上下文
- 保留 domain 边界，而不是把一切压成一个 runtime
- 让人类停留在审核与决策面，而不是盯底层执行细节

## 边界规则

请用下面这组范围来理解 `OPL`：

- 实验室顶层产品与控制语言
- 跨 domain 语义最先冻结的地方
- 独立 domain agent 仓之上的显式 activation 层
- 连接各个 domain-owned authority surfaces、但不吞并其身份的 shared modules / contracts / indexes owner

## 为什么 Domain Entry 仍然必须保留

即使存在共享 `OPL` activation，domain-owned entry 仍然必须保留，因为它们提供：

- 独立使用的稳定入口
- domain-specific 的校验、治理与交付合同
- 独立发布与维护边界
- 某个工作流可以独立演进而不拖垮整个 stage-led framework 的能力

所以正确方向是：

- Codex-default `OPL` runtime 加显式 activation 在 domain 之上
- 显式而精简的 domain-owned entry 在中层
- 明确的 domain-owned authority function、quality gate、memory/artifact authority 与 delivery authority 在下层

## 延伸阅读

- [OPL Family 开发主参考](../active/opl-family-development-reference.md)
- [共享运行时合同](../specs/shared-runtime-contract.md)
- [共享领域合同](../specs/shared-domain-contract.md)
