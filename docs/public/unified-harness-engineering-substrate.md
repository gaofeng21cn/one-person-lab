# Unified Harness Engineering Substrate

Owner: `One Person Lab`
Purpose: `public_unified_harness_engineering_substrate`
State: `public_support`
Machine boundary: 本文是人读公开支撑材料。当前产品 truth 继续归 README、核心五件套、contracts、source、CLI/API 行为、release artifacts、runtime ledger 和真实 App evidence。

> Currentness rule: 本文只保存公开层的 UHS 叙事和 shared-boundary 读法，不冻结 shared runtime / shared domain 的完成状态、当前 Foundry Agent 覆盖、App/release evidence、provider readiness、worklist counter 或 production-readiness 结论。当前产品分层、运行主线、shared runtime/domain contract 状态、admitted domain-agent catalog 与证据缺口必须从核心五件套、active gap plan、[Shared Runtime Contract](../specs/shared-runtime-contract.md)、[Shared Domain Contract](../specs/shared-domain-contract.md)、contracts、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts 读取。

## 目的

这份文档用于定义当前 `OPL` 体系下共享的 Harness Engineering 语言。
它的作用，是让 `OPL` 能以一套清楚的一致性架构对外呈现，而不是把几个 domain project 继续写成松散相关的零散仓库；同时，它也不声称所有 domain 已经被压进一个单体 runtime 或一个公共代码仓。

## 它是什么

`Unified Harness Engineering Substrate` 是 `OPL` 之下共享的 Harness Engineering 上位语言。
它定义的是多个 domain system 共同继承的一组稳定约束，而不是取代它们各自的 domain contract、domain-agent entry、domain-owned truth、quality gate、authority function 与 delivery authority。通用 runtime、attempt、queue、wakeup、receipt、projection 和 App/workbench shell 归 OPL Framework / One Person Lab App。

当前更准确的理解是：

- `UHS` 是共享总名词
- 其中与长期在线运行最相关的部分，由 [Shared Runtime Contract](../specs/shared-runtime-contract.md) 作为 active support contract 承接
- 其中与跨 domain 正式行为最相关的部分，由 [Shared Domain Contract](../specs/shared-domain-contract.md) 作为 active support contract 承接

这两个 shared contract 是当前支撑面，不是本文派生出的未来计划；它们的机器真相仍回到 contracts、source、tests、CLI/read-model、runtime ledger 与 domain-owned evidence。

在当前体系里，这个 substrate 先作用于 `OPL Framework` 与 `One Person Lab App`，再投影到已收录的 Foundry Agent domain：

- `OPL Framework`
  - 持有 provider-backed stage runtime、shared contracts/indexes、generated surface、receipt/projection 和 activation boundary
- `One Person Lab App`
  - 消费 framework/provider 状态和 domain-owned projection，作为普通用户工作台展示任务、阶段、阻塞、refs 与 owner-aware action
- `Med Auto Science`
- `RedCube AI`
- `Med Auto Grant`

`OPL Meta Agent` 是 Agent engineering semantic provider，只通过 `engineer-agent` 公开接收新建、接管和改进请求；`design` / `diagnose` 是该入口内部 operation，分别产出 `AgentBlueprint` / `EvalSpec` 与基于 `EvidenceBundle` 的 `EvolutionProposal`。评测执行、候选物化、证据打包、版本、canary、activation 和 rollback 归 OPL Foundry Kernel；保护测试、最终验收、权限授权与生产采用归目标 owner。OMA 不属于已收录 domain capability surface，也不持有 MAS/MAG/RCA 或未来 domain 的领域真相、质量裁决、artifact authority 或 owner receipt。

## 它不是什么

这个 substrate 不是：

- “所有 domain 已经共享完全一致对象模型”的声明
- “所有 domain 已经落在同一个公共代码仓”的声明
- 任何一个 domain-agent entry 的替代品
- 任何一个 domain-owned truth、quality gate、authority function 或 delivery authority 的替代品
- `OPL` 可以绕过 public domain-agent entry、直接触碰 domain-local execution plane 的许可
- `Hermes` 或其他 runtime 项目的简单套壳说法

## 分层关系

推荐长期分层保持为：

```text
Human / Agent
  -> OPL stage-led Agent executor framework
      -> Unified Harness Engineering Substrate
          -> Shared Runtime Contract
          -> Shared Domain Contract
              -> Domain-agent entry
                  -> Domain-owned authority functions / quality gates / delivery authority
                      -> Stage execution plane
                          -> Deployment Shape
```

每一层负责不同的事情：

- `OPL stage-led Agent executor framework`
  - 负责顶层任务语义、stage decomposition、activation 与跨域边界合同
- `Unified Harness Engineering Substrate`
  - 负责多个 domain 共享的 Harness Engineering 上位语言
- `Shared Runtime Contract`
  - 负责跨 domain 共享的长期在线运行合同
- `Shared Domain Contract`
  - 负责跨 domain 共享的正式行为合同
- `Domain-agent entry`
  - 负责 public domain-local task entry 与 product-entry surface
- `Domain-owned authority functions / quality gates / delivery authority`
  - 负责领域真相、质量判断、交付授权、memory accept/reject、artifact mutation permission 与 owner receipt
- `Stage execution plane`
  - 在 OPL provider-backed stage runtime、Codex CLI 默认 executor 和 domain-owned authority refs 之间执行 stage attempt，并留下 receipt、typed blocker 或 route-back 证据
- `Deployment Shape`
  - 负责 harness 具体部署在哪里、以什么形态运行，但不重写 domain contract

## 共享不变量

这个 substrate 当前冻结的共享约束包括：

- 默认采用 `AI-first / executor-first / Codex-first` 执行姿态：共享 substrate 提供 stage、上下文、工具、权限、receipt、projection 和边界，开放式知识工作由 selected executor 完成
- 当前各个 domain 仓首先都是共享同一 substrate 的 `Auto-only` 主线
- 未来 `Human-in-the-loop` 产品应作为兼容 sibling 或 upper-layer product 复用同一 substrate，而不是把当前仓强行改成同仓双模
- formal entry 采用同一套显式矩阵：默认正式入口 `CLI`、支持协议层 `MCP`、`controller` 仅作为 internal control surface
- 状态迁移、审阅面与交付边界保持可审计
- 部署形态可以变化，但不应因此改写 domain contract

其中，最需要继续压实的两类共享合同是：

- `Shared Runtime Contract`
  - provider-backed stage attempt
  - queue / wakeup / retry / dead-letter
  - signal / query / human gate
  - stage runtime status
  - memory / artifact / source locator transport
  - receipt / approval / interrupt / resume
- `Shared Domain Contract`
  - formal-entry matrix
  - `per-run handle`
  - durable report
  - audit trail
  - gate semantics
  - no-bypass to public domain-agent entry

## 部署形态

在当前阶段：

- 活跃具体执行器是 Codex-default 本地执行路径，stage 内默认最小执行单元是 `Codex CLI`
- 公开的 OPL formal entry 仍是本地 `TypeScript CLI`-first / framework contract surface
- provider-backed stage runtime 是长期在线、恢复、human gate 和 projection 的 production online 承载层，Temporal-backed provider 是必需 substrate

这个区分很重要：Codex 说的是默认具体执行器，不是 substrate 的本体定义。
在后续阶段，同一套 substrate 也应支持：

- 托管式 Web runtime
- 平台侧统一托管的执行面

如果某个 domain 仓保留上游 `Hermes-Agent` 集成证据，它更准确的归属应是：

- 历史 provenance、诊断语料或负向 guard

它不是：

- `UHS` 的同义词
- `OPL` 的替代品
- domain truth 的 owner

也就是说，未来如果从“装在用户电脑上”迁移到“运行在平台上”，不应因此重写 substrate，也不应因此压平 domain 边界。

## 从共享 substrate 到垂类在线 Agent 平台族

这套 substrate 的长期产品意义，是让 `OPL` 作为 stage-led、provider-backed 的智能体框架，承载一组垂类 Foundry Agents 的长期运行外围和工作台能力，而不是把 domain truth 或质量裁决压成一个中心化大脑。

在这个理想结构里：

- `OPL`
  - 继续负责 stage-led、以 Agent executor 为最小执行单位的 framework、activation、provider-backed stage runtime、receipt/projection 与 shared primitives
- `UHS`
  - 继续作为共享 Harness Engineering 的上位语言
- `Shared Runtime Contract`
  - 承接 `runtime profile`、`session substrate`、stage runtime status、`memory hook`、`delivery / cron`、`approval / interrupt` 这类共享运行合同的 active support 读法
- `Shared Domain Contract`
  - 承接 formal-entry matrix、`per-run handle`、durable report、audit trail、gate semantics 等跨 domain 正式行为合同的 active support 读法
- 各 domain agent
  - 继续持有自己的 formal entry、domain object、gate、audit、delivery authority、authority function 与 canonical truth

因此，后续更合理的方向不是“直接把三个业务仓改造成同一种执行内核”，而是：

- OPL 层持续硬化 provider-backed stage runtime、shared contract、generated surface 和 App/workbench projection
- domain 层持续把通用外围迁出、收薄为 authority function / refs-only adapter / generated target，并保留领域判断与交付 authority
- 通过真实 MAS/MAG/RCA owner receipt、typed blocker、App evidence 和 long-soak 验证目标形态

这条演进线仍不能写成 family production ready：provider-backed runtime 和 shared surfaces 已经是 OPL framework owner，真实 domain owner-chain、App release/user path、memory/artifact apply 和 long-soak 仍单独验收。

## 当前 family scope 与 Domain Mapping

当前 `OPL` 体系按三层理解：

- `OPL Framework`
  - stage-led、以 Agent executor 为最小执行单位的 framework 与 activation layer
- `One Person Lab App`
  - 面向人的 workbench，消费 framework runtime truth 与 domain-owned projection，不持有 domain truth
- `Foundry Agents`
  - 已收录 domain capability surface 继续由各 domain 仓持有

- `Med Auto Science`
  - 医学研究 domain agent
- `RedCube AI`
  - 视觉交付 domain agent
- `Med Auto Grant`
  - 基金写作 domain agent

`OPL` 本身不是再额外多出来的一个 domain agent。`One Person Lab App` 也不是 domain agent；它是工作台入口。`OPL Meta Agent` 是只通过 `engineer-agent` 暴露的 Agent engineering semantic provider，不进入 MAS/MAG/RCA 的 domain truth ownership，不执行 Foundry Kernel 生命周期，也不替目标 owner 签发质量、交付或采用结论。

## 现实意义

这个共享 substrate 的意义，在于后续新 domain 可以沿着同一套思路快速展开：

- 共享执行哲学与边界语言
- domain-specific contract 继续留在各自 domain
- `OPL` 负责 framework runtime、activation、shared primitives 和 App/workbench projection；domain repo 负责领域 truth、quality gate、authority function 和交付授权

这样，后续新增 domain agent 时，就能更像是在同一套框架思想上演化，而不是重复发明几套彼此不兼容的系统。
