# OPL 任务版图

Owner: `One Person Lab`
Purpose: `public_task_map_support`
State: `public_support`
Machine boundary: 本文是人读任务版图。domain admission、runtime readiness、quality/export verdict 和 artifact authority 继续归 contracts、source、CLI/API 行为、domain-owned manifests / receipts 和真实 evidence。

> Currentness rule: 本文冻结顶层工作流语义、交付对象和 public task-family wording，不冻结当前 registered / candidate workstream 数量、domain-agent mapping、stage-selection readiness 或 stage-execution readiness。读取当前状态时，先看核心五件套、[OPL Domain-Agent Admission Contract](../specs/opl-domain-onboarding-contract.md)、[OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.md)、`task-topology.json`、`workstreams.json`、`domains.json`、CLI/read-model 与相关测试；本文中的“当前边界状态”只能作为这些 live surfaces 的人读复述。

## 总览

`OPL` 把一人课题组的正式工作拆成七类工作流：

- `Research Ops`
- `Grant Ops`
- `IP Ops`
- `Award Ops`
- `Thesis Ops`
- `Review Ops`
- `Presentation Ops`

这个拆分定义的是顶层任务语义。
`Agent Foundry` 不属于这七类正式交付 workstream。它以 `OPL Meta Agent` 的 `engineer-agent` 作为唯一公开工程入口：OMA 负责把新建、接管和改进意图转成 `AgentBlueprint`、`EvalSpec` 与基于证据诊断的 `EvolutionProposal`；OPL Foundry Kernel 负责物化、评测、`EvidenceBundle`、版本、canary、activation 和 rollback；目标 owner 负责保护测试、最终验收、权限授权与生产采用。OMA 和 Foundry Kernel 都不持有 MAS/MAG/RCA 或未来 domain 的领域真相、质量裁决、artifact authority 或 owner receipt。
在运行时，这些语义通过 Codex-default executor 路径、按需显式进入 `OPL` activation，由 provider-backed stage runtime 承载可恢复的阶段尝试，再路由到选定的 domain capability surface，同时保留清楚的 ownership 与 handoff 边界。

在执行层面，这些 workstream 也共享同一条目标原则：

- 采用 `AI-first / executor-first / Codex-first` 的 standard domain-agent shape：以 stage 为可审计推进单位，OPL provider-backed runtime 承担 queue / attempt / receipt / projection，selected executor 承担开放式知识工作
- 保持显式 domain-owned entry、quality gate、artifact / memory authority、owner receipt / typed blocker 与 direct skill path
- 当前已收录的 domain 仓统一按 `Auto-only` 主线理解
- 未来 `Human-in-the-loop` 产品应作为 sibling 或 upper-layer product 复用同一 substrate

任务版图冻结的是工作流边界与交付对象，同时允许各 domain 采用不同的界面、模型提供方与编排栈。

## 机器可读配套工件

- [`../contracts/opl-framework/task-topology.json`](../../contracts/opl-framework/task-topology.json)
- [`../contracts/opl-framework/workstreams.json`](../../contracts/opl-framework/workstreams.json)
- [`../contracts/opl-framework/domains.json`](../../contracts/opl-framework/domains.json)

这些配套工件分别把：

- 顶层 task topology materialize 成 machine-readable 的语义 surface
- stage selection 使用的已注册 active workstream catalog
- admitted domain-agent catalog 与 workstream ownership

读取方式是：`task-topology.json` 定义顶层语义与 candidate visibility，`workstreams.json` 只列出已注册 active workstream，`domains.json` 只列出已收录 domain-agent catalog。
本文不单独持有 admitted/candidate 状态，也不固定 workstream 数量。
按当前 live contracts 读取，已注册 workstream 由 `workstreams.json` 给出，仍在定义中的 workstream 由 `task-topology.json` 中的 `under_definition` / `not_registered` / `candidate_domain_agent_pending`、`current_domain_id=null`、`entry_surface=null` 与 `formal_domain_required=true` 给出。
任何 formal 收录、stage-selection readiness 或 stage-execution readiness 变化，都必须先落在这些 machine-readable contracts、onboarding evidence、CLI/read-model 和相关测试里，再同步刷新本文的人读 wording。

如果要查看这份 backlog 的人类可读配套说明，见 [OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.md)。

## Research Ops

`Research Ops` 负责从数据到论文交付的主研究链。

典型任务包括：

- 数据治理
- 研究问题形成
- 分析与验证推进
- 证据组织
- 稿件与投稿交付

典型交付对象包括：

- 分析包
- 证据包
- 稿件
- 投稿包

按 live workstream/domain-agent registry，当前承接这个工作流的 domain surface 是：

- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience)

## Grant Ops

`Grant Ops` 负责基金方向判断、申请书写作，以及处在申请书写作闭环里的作者侧模拟评审与修订。

典型任务包括：

- 基金方向与选题可行性判断
- 申请书结构生成
- 研究背景、创新点和技术路线组织
- 模拟评审意见
- 申请书迭代

这里的模拟评审与修订仍属于申请书作者侧的辅助环节；它们本身不会自动变成“站在评审方”的 surface。

这个工作流会明显复用：

- 文献资产
- 研究记忆
- 评审记忆
- 已有研究结果与图表

典型交付对象包括：

- 基金方向评估
- 申请书提纲与初稿
- 模拟评审包
- 申请书修订计划

当前边界状态按 live contracts / onboarding evidence 读取：

- 当前生命周期状态：已注册 workstream，并直接映射到已收录的 `MedAutoGrant` domain surface
- formal 映射：`grant_ops -> medautogrant` 已经在活跃 workstream/domain-agent catalog 中冻结
- 当前公开入口：顶层 domain entry 已经是 `MedAutoGrant`，基金方向判断、申请书写作、作者侧模拟评审与修订 truth 都继续由它持有
- stage-entry 规则：successful handoff 只能 targeting public domain-agent entry，并继续禁止绕过 public entry 直接触碰 domain-local execution plane
- 当前顶层处理方式：清楚的请求会通过活跃 stage vocabulary 与 domain manifest surface 直接解析到 `medautogrant`

## IP Ops

`IP Ops` 负责围绕科研成果做知识产权保护材料。

典型任务包括：

- 专利可申请性 framing
- 技术交底组织
- 权利要求与实施例起草
- 现有技术、新颖性和创造性定位
- 审查意见答复路线规划

它可以复用研究证据、基金叙事、图表和技术路线，但专利申请的 canonical truth 必须独立于基金申请 truth 和论文发表 truth。

典型交付对象包括：

- 技术交底书
- 专利申请书草稿
- 权利要求书
- 实施例材料包
- 审查意见答复计划

当前边界状态按 live topology / candidate backlog 读取：

- 当前生命周期状态：under-definition candidate workstream
- 规划产品表达：`IP Foundry` / 知产工坊，首个规划产品为 `Med Auto Patent`
- formal 收录路径：等待正式 domain-agent admission 与注册后的 workstream/domain mapping
- stage 路径：等待 stage-selection readiness、stage-execution readiness 与 domain-agent handoff 资格
- 已跟踪的 blocker package：`truth_ownership`、`review_surfaces`、`execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording`
- truth boundary：专利 canonical truth 与人工/法律审阅 gate 必须由未来 IP Ops domain boundary 持有
- 路由规则：清楚的专利请求可以返回 `unknown_domain`；不得作为基金申请工作路由到 `MedAutoGrant`

## Award Ops

`Award Ops` 负责报奖申请和成果推广型材料。

典型任务包括：

- 奖项类别与匹配度判断
- 成果主线组织
- 贡献与创新排序
- 影响力与应用佐证材料整理
- 报奖评审意见答复路线规划

它可以复用 Research Ops 的证据和 Grant Ops 的写作基座，但报奖中的贡献、影响力、推荐材料 truth 必须独立于基金申请 truth。

典型交付对象包括：

- 报奖书草稿
- 成果总结
- 贡献排序材料包
- 影响力佐证材料包
- 推荐材料

当前边界状态按 live topology / candidate backlog 读取：

- 当前生命周期状态：under-definition candidate workstream
- 规划产品表达：`Award Foundry` / 报奖工坊，首个规划产品为 `Med Auto Award`
- formal 收录路径：等待正式 domain-agent admission 与注册后的 workstream/domain mapping
- stage 路径：等待 stage-selection readiness、stage-execution readiness 与 domain-agent handoff 资格
- 已跟踪的 blocker package：`truth_ownership`、`review_surfaces`、`execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording`
- truth boundary：报奖 canonical truth 与人工专家审阅 gate 必须由未来 Award Ops domain boundary 持有
- 路由规则：清楚的报奖请求可以返回 `unknown_domain`；不得作为基金申请工作路由到 `MedAutoGrant`

## Thesis Ops

`Thesis Ops` 负责学位论文与答辩准备。

典型任务包括：

- 章节结构组织
- 已有论文与图表复用
- 章节间术语和叙事同步
- 摘要、引言和讨论层次组织
- 答辩准备

它和 `Research Ops` 高度相关，同时围绕学位论文装配与答辩准备保留自己的任务边界。
现有 admitted surface 可以提供复用证据和下游衍生物，Thesis Ops 的 domain ownership 则通过单独 onboarding 路径来冻结。

典型交付对象包括：

- 章节结构方案
- 章节草稿集
- 跨章节同步包
- 答辩准备包

当前边界状态按 live topology / candidate backlog 读取：

- 当前生命周期状态：under-definition candidate workstream
- 规划产品表达：`Thesis Foundry` / 学位论文工坊，首个规划产品为 `Med Auto Thesis`
- formal 收录路径：等待正式 domain-agent admission 与注册后的 workstream/domain mapping
- stage 路径：等待 stage-selection readiness、stage-execution readiness 与 domain-agent handoff 资格
- 已跟踪的 blocker package：`execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording`
- truth boundary：Thesis-specific canonical truth 会随着未来 Thesis Ops domain boundary 一起冻结
- stage-entry 规则：任何未来的 successful handoff 都必须 targeting public domain-agent entry，并继续禁止绕过 public entry 直接触碰 domain-local execution plane
- 当前顶层处理方式：在真实 domain owner 被收录前，清楚的请求会显式返回 `unknown_domain`，且不会构建 handoff payload

## Review Ops

`Review Ops` 负责“站在评审方”与“回应评审方”两类任务。

这个组合当前仍处在顶层 semantic bundle 阶段。
review artifact 的 truth 继续保持为 future domain-owned，直到 dedicated Review Ops boundary 被正式冻结。

典型任务包括：

- 审稿
- 基金评审
- 评审意见结构化整理
- 回复与修回路线组织

这个工作流也会积累可跨 domain 复用的评审标准和反馈模式。

典型交付对象包括：

- 评审报告
- 评审意见结构稿
- rebuttal 计划
- 修订路线图

当前边界状态按 live topology / candidate backlog 读取：

- 当前生命周期状态：under-definition candidate workstream
- 规划产品表达：`Review Foundry` / 评审工坊，首个规划产品为 `Med Auto Review`
- formal 收录路径：等待正式 domain-agent admission 与注册后的 workstream/domain mapping
- stage 路径：等待 stage-selection readiness、stage-execution readiness 与 domain-agent handoff 资格
- 已跟踪的 blocker package：`execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording`
- truth boundary：review truth 会在 dedicated Review Ops boundary 冻结后继续保持为 domain-owned
- stage-entry 规则：任何未来的 successful handoff 都必须 targeting public domain-agent entry，并继续禁止绕过 public entry 直接触碰 domain-local execution plane
- 当前顶层处理方式：在真实 domain owner 被收录前，清楚的请求会显式返回 `unknown_domain`，且不会构建 handoff payload

## Presentation Ops

`Presentation Ops` 负责讲课、组会、汇报和答辩材料。

典型任务包括：

- 从研究材料抽取讲解主线
- 生成汇报级图表与叙事结构
- 组织讲课和答辩幻灯片
- 复用已有论文图表、摘要和结论

典型交付对象包括：

- 讲课 deck
- 组会 / 汇报 deck
- 项目汇报 deck
- 答辩 deck

按 live workstream/domain-agent registry，当前承接这个工作流的 domain surface 是：

- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)

在这个 surface 内：

- `ppt_deck` 是最直接映射到 `Presentation Ops` 的 family
- `lecture_student`、`lecture_peer`、`executive_briefing`、`defense_deck` 这类差异应由 `profile pack` 控制
- `xiaohongshu` 虽然共享同一 RedCube harness，但在 OPL 顶层继续保留独立的视觉 family 语义

## 这些工作流为什么属于同一个 OPL stage-led framework

这些工作流之所以能放进同一个 `OPL stage-led framework`，是因为它们共享：

- 同一批数据与图表
- 同一批文献与外部证据
- 同一组研究问题与判断
- 同一层正式交付表面
- 同一套共享基础结构语言

所以 `OPL` 的任务地图不是 feature list。
它是 domain surface 与 OPL shared substrate 之上的分工图。
