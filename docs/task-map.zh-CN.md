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

## Research Ops

`Research Ops` 负责从数据到论文交付的主研究链。

典型任务包括：

- 数据治理
- 研究问题形成
- 分析与验证推进
- 证据组织
- 稿件与投稿交付

当前承接这个工作流的 domain gateway 是：

- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience)

## Grant Ops

`Grant Ops` 负责基金申请及其反向评审。

典型任务包括：

- 基金方向与选题可行性判断
- 申请书结构生成
- 研究背景、创新点和技术路线组织
- 模拟评审意见
- 申请书迭代

这个工作流会明显复用：

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

它和 `Research Ops` 高度相关，但仍应保留自己的任务边界。

## Review Ops

`Review Ops` 负责“站在评审方”与“回应评审方”两类任务。

典型任务包括：

- 审稿
- 基金评审
- 评审意见结构化整理
- 回复与修回路线组织

这个工作流也会积累可跨 domain 复用的评审标准和反馈模式。

## Presentation Ops

`Presentation Ops` 负责讲课、组会、汇报和答辩材料。

典型任务包括：

- 从研究材料抽取讲解主线
- 生成汇报级图表与叙事结构
- 组织讲课和答辩幻灯片
- 复用已有论文图表、摘要和结论

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
