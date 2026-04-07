[English](./task-map.md) | **中文**

# OPL 任务版图

## 总览

`OPL` 把一人课题组的正式工作拆成五类工作流：

- `Research Ops`
- `Grant Ops`
- `Thesis Ops`
- `Review Ops`
- `Presentation Ops`

这个拆分定义的是顶层任务语义。
在运行时，这些语义应该先经过 `OPL Gateway`，再路由到独立的 domain gateway，而不是被压进一个 runtime。

在执行层面，这些 workstream 也共享同一条目标原则：

- 采用 `Agent-first` 的 domain system，而不是 fixed-code-first 的工作流引擎
- 在同一套共享基础结构上支持 `Auto` 与 `Human-in-the-loop` 两种执行模式

任务版图冻结的是工作流边界与交付对象，不要求它们共享同一个界面、同一个模型提供方，或同一套固定代码编排栈。

## 机器可读配套工件

- [`../contracts/opl-gateway/task-topology.json`](../contracts/opl-gateway/task-topology.json)
- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

这些配套工件分别把：

- 顶层 task topology materialize 成 machine-readable 的语义 surface
- 当前 under-definition workstream 仍缺哪些 admission boundary material 写成 machine-readable backlog

它们可以描述 `Grant Ops`、`Thesis Ops`、`Review Ops` 这类仍在定义中的 workstream，但**不会**因此自动完成新 domain 收录，也不会为它们创造 `G2` discovery readiness 或 `G3` routed-action readiness。

在当前基线上，`candidate-domain definition` 由三部分共同构成：

- `task-topology` 中的任务边界与交付对象
- candidate-domain backlog 中仍缺的 boundary package
- domain-onboarding contract 中的 formal admission rules

`OPL` 当前**不会**在这三层之上再额外插入一层独立的 candidate-domain-definition surface，因为那样会制造重复的 semantic / blocker / admission truth。

如果要查看这份 backlog 的人类可读配套说明，见 [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)。

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

当前承接这个工作流的 domain gateway 是：

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

当前边界状态：

- 仍处于定义阶段
- 还不是正式收录 domain
- 还不是已注册的 `G1` workstream/domain mapping
- 还不是 `G2` discovery target
- 还不是 `G3` routed-action target
- 还不具备 domain handoff 资格
- 当前 `Grant Foundry -> Med Auto Grant` 公开 scaffold 只提供 top-level signal / domain-direction evidence；它不等于已正式收录的 domain gateway，也不等于 `G2` discovery readiness，也不等于 `G3` routed-action readiness，更不等于 handoff-ready surface
- formal 收录前的 blocker 已在 [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md) 中跟踪
- `Grant Foundry -> Med Auto Grant` 当前只提供公开 scaffold / top-level signal / domain-direction evidence；它还不构成 registry material、discovery readiness、routing readiness 或 domain handoff 资格
- 但如果顶层语义已经足够清楚，在真实 domain owner 被收录前，最多只能显式返回 `unknown_domain`，且不会构建 handoff payload

## Thesis Ops

`Thesis Ops` 负责学位论文与答辩准备。

典型任务包括：

- 章节结构组织
- 已有论文与图表复用
- 章节间术语和叙事同步
- 摘要、引言和讨论层次组织
- 答辩准备

它和 `Research Ops` 高度相关，但仍应保留自己的任务边界。
当前冻结下来的 negative boundary 是：学位论文装配与答辩准备协调，并不等同于 `Research Ops` 里的 manuscript / submission delivery；它也不能因为会产出答辩 deck 衍生物，就被压缩成 `Presentation Ops` / `RedCube AI` 的 deck 生产。
这些已收录 surface 可以提供复用证据或承接下游衍生物，但它们并不因此拥有 Thesis Ops 的 domain boundary。

典型交付对象包括：

- 章节结构方案
- 章节草稿集
- 跨章节同步包
- 答辩准备包

当前边界状态：

- 仍处于定义阶段
- 还不是正式收录 domain
- 还不是已注册的 `G1` workstream/domain mapping
- 还不是 `G2` discovery target
- 还不是 `G3` routed-action target
- 还不具备 domain handoff 资格
- formal 收录前的 blocker 已在 [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md) 中跟踪
- 但如果顶层语义已经足够清楚，在真实 domain owner 被收录前，最多只能显式返回 `unknown_domain`，且不会构建 handoff payload

## Review Ops

`Review Ops` 负责“站在评审方”与“回应评审方”两类任务。

这个组合仍然只是顶层语义包；它不会因此自动收录成独立 review domain，也不会让 OPL 成为这些评审工件的 canonical truth owner。

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

当前边界状态：

- 仍处于定义阶段
- 还不是正式收录 domain
- 还不是已注册的 `G1` workstream/domain mapping
- 还不是 `G2` discovery target
- 还不是 `G3` routed-action target
- 还不具备 domain handoff 资格
- formal 收录前的 blocker 已在 [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md) 中跟踪
- 但如果顶层语义已经足够清楚，在真实 domain owner 被收录前，最多只能显式返回 `unknown_domain`，且不会构建 handoff payload

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

当前承接这个工作流的 domain gateway 是：

- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)

在这个 surface 内：

- `ppt_deck` 是最直接映射到 `Presentation Ops` 的 family
- `lecture_student`、`lecture_peer`、`executive_briefing`、`defense_deck` 这类差异应由 `profile pack` 控制
- `xiaohongshu` 虽然共享同一 RedCube harness，但在 OPL 顶层不应直接等同于 `Presentation Ops`

## 这些工作流为什么属于同一个 OPL Federation

这些工作流之所以能放进同一个 `OPL federation`，是因为它们共享：

- 同一批数据与图表
- 同一批文献与外部证据
- 同一组研究问题与判断
- 同一层正式交付表面
- 同一套共享基础结构语言

所以 `OPL` 的任务地图不是 feature list。
它是 domain gateway 与 harness 之上的分工图。
