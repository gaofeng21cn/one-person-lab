[English](./task-map.md) | **中文**

# OPL 任务版图

## 总览

`OPL` 把一人课题组需要持续承担的正式工作，先拆成五类并列工作流。

- `Research Ops`
- `Grant Ops`
- `Thesis Ops`
- `Review Ops`
- `Presentation Ops`

这个拆法不是为了制造五个彼此孤立的任务面，而是为了明确每个任务面真正负责什么。

## Research Ops

`Research Ops` 负责从数据到论文交付的主研究链。

典型任务包括：

- 数据治理
- 研究问题形成
- 分析与验证推进
- 证据组织
- 稿件与投稿交付

当前这个任务面当前最清楚的实现面是：

- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience)

## Grant Ops

`Grant Ops` 负责基金申请及其反向评审。

典型任务包括：

- 基金方向与选题可行性判断
- 申请书结构生成
- 研究基础、创新点和技术路线组织
- 模拟评审意见
- 申请书迭代

这个任务面会明显复用：

- 文献资产
- 研究记忆
- 评审记忆
- 已有研究结果与图表

## Thesis Ops

`Thesis Ops` 负责学位论文与答辩准备。

典型任务包括：

- 章节结构组织
- 已有论文与图表复用
- 章节间术语和叙事同步
- 摘要、引言和讨论层次组织
- 答辩准备

它和 `Research Ops` 的关系很紧，因为学位论文常常要复用同一批研究资产。

## Review Ops

`Review Ops` 负责“站在评审方”与“回应评审方”两种任务。

典型任务包括：

- 审稿
- 基金申请评审
- 评审意见结构化整理
- 回复与修回路线组织

这个工作流也会持续积累评审标准和反馈模式，反过来作用于研究与申请。

## Presentation Ops

`Presentation Ops` 负责讲课、组会、汇报和答辩材料。

典型任务包括：

- 从研究材料抽取讲解主线
- 生成汇报级图表与叙事结构
- 组织讲课和答辩幻灯片
- 复用已有论文图表、摘要和结论

这个工作流负责让交付材料与上游研究资产保持一致。

当前这个任务面最直接的 emerging implementation surface 是：

- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)

其中：

- `ppt_deck` 是当前最直接承接 `Presentation Ops` 的 overlay family
- `lecture_student`、`lecture_peer`、`executive_briefing`、`defense_deck` 这类差异，应由 `profile pack` 控制，而不是混在一个通用 deck 定义里
- `xiaohongshu` 虽然共享同一 runtime，但在 `OPL` 顶层语义里不应直接等同于 `Presentation Ops`

## 这些工作流如何共享基础结构

这五类工作流之所以能放进同一个总蓝图，是因为它们共享这些对象：

- 同一批数据与图表
- 同一批文献与外部证据
- 同一组研究问题与判断
- 同一套正式交付物
- 同一层 Agent 执行接口

因此，`OPL` 的任务地图不是功能清单，而是实验室正式工作的分工图。

这也意味着任务面与实现面并不总是一一对应：

- 一个实现面可以服务多个交付物 family
- 只有其中一部分 family 直接映射到某个 `OPL` 工作流
