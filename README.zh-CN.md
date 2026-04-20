<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组的统一工作台</strong></p>
<p align="center">从同一个入口发起工作、查看进度、收集交付物</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>适合谁</strong><br/>
      医生、研究者、PI、教师与小团队，适合希望把长期专业工作收进同一套界面的人
    </td>
    <td width="33%" valign="top">
      <strong>它帮助管理什么</strong><br/>
      对话、基于目录的任务、进度反馈、交付文件，以及各类专业工作流
    </td>
    <td width="33%" valign="top">
      <strong>当前覆盖范围</strong><br/>
      <code>OPL</code> 是整个产品家族的顶层工作台，当前活跃方向包括医学研究、基金申请和汇报交付
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL workbench overview" width="100%" />
</p>

> `OPL` 把发起工作、查看进度和收集交付物放到同一个入口里，而每个专业产品家族继续保留自己的方法、规则和交付边界。

## 可以用来做什么

- 在同一个工作台里发起普通对话或多步骤任务。
- 在任务需要固定目录和文件上下文时，直接绑定真实工作目录。
- 调用研究、基金、汇报等专门产品家族完成专业工作。
- 用人话持续查看长任务当前做到哪里。
- 把稿件、申请书、幻灯片、表格、审阅文件等交付物集中起来管理。

## 当前产品家族

| 产品家族 | 当前产品 | 适合问题 | 常见交付物 |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学研究、证据整理、稿件准备 | 分析包、证据包、稿件 |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、修订工作 | 申请书、提纲、修订包 |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩材料 | 幻灯片、讲稿、汇报材料 |
| `Thesis Foundry` | 规划中 | 学位论文装配与答辩准备 | 章节草稿、答辩材料 |
| `Review Foundry` | 规划中 | 审稿、回复和修回 | 评审意见、回复草稿、修回计划 |

## 这套工作台怎么组织

- 普通工作：讨论、阅读、规划和通用任务。
- 基于目录的工作：需要真实文件目录和持续上下文的任务。
- 专业产品家族：面向特定领域的专门工作流。
- 进度与文件视图：持续挂在任务旁边，方便恢复和交付。
- 环境与模块管理：统一查看安装状态、版本和健康情况。

## 这个仓库跟踪什么

- 产品家族背后的共享工作台运行时与公开接口面。
- 执行引擎和模块管理。
- 工作空间、会话、进度与交付物的发现与组织能力。
- 共享产品层的机器可读合同。

完整图形界面外壳放在独立的界面仓中维护。
当前仓库负责那套界面和 CLI 共同依赖的共享运行时与合同真相。

## 这个仓库怎么读

1. 潜在用户、人类专家和非技术读者，先读当前首页，再继续看 [路线图](./docs/roadmap.zh-CN.md)、[任务版图](./docs/task-map.zh-CN.md)、[运行模型](./docs/operating-model.zh-CN.md)。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/` 和 [历史归档索引](./docs/history/README.zh-CN.md) 下的跟踪材料。

## 延伸阅读

- [路线图](./docs/roadmap.zh-CN.md)
- [任务版图](./docs/task-map.zh-CN.md)
- [运行模型](./docs/operating-model.zh-CN.md)
- [统一工程基座](./docs/unified-harness-engineering-substrate.zh-CN.md)
- [文档索引](./docs/README.zh-CN.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [合同目录说明](./contracts/README.md)
