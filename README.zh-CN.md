<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组的统一工作台与模块管理器</strong></p>
<p align="center">研究工作 · 基金申请 · 汇报交付</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>适合谁</strong><br/>
      医生、研究者、PI、教师与小团队，适合希望把长期任务、文件交付和专业工作流放进同一个入口的人
    </td>
    <td width="33%" valign="top">
      <strong>解决什么问题</strong><br/>
      研究材料怎么持续推进、基金申请怎么组织、汇报材料怎么交付，以及长任务做到哪里了
    </td>
    <td width="33%" valign="top">
      <strong>当前定位</strong><br/>
      `OPL` 是统一工作台，负责组织工作流、模块、进度反馈和交付文件
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-architecture-blueprint.svg" alt="OPL architecture blueprint" width="100%" />
</p>

> `OPL` 是一人课题组的统一工作台。它把日常协作、专业工作流、执行可见性和文件交付放在同一个入口里。

## 可以用来做什么

- 讨论课题、整理思路、拆解任务、持续推进工作。
- 发起研究项目，查看最近进展、当前状态和已产出的文件。
- 组织基金方向、申请书初稿、修订材料和配套文档。
- 生成讲课、组会、汇报、答辩等交付材料。
- 在同一个工作区里管理任务、文件和模块状态。

## 当前覆盖的产品家族

| 产品家族 | 当前实现 | 适合问题 | 常见交付物 |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学研究、证据整理、稿件准备 | 分析包、证据包、稿件 |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、作者侧修订 | 申请书、提纲、修订包 |
| `Presentation Ops` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩材料 | 幻灯片、讲稿、汇报材料 |
| `Thesis Ops` | 规划中 | 学位论文与答辩准备 | 章节草稿、答辩材料 |
| `Review Ops` | 规划中 | 审稿、回复和修回 | 评审意见、回复草稿、修回计划 |

## 在一个工作台里完成什么

| 工作区 | 用户看到的内容 | 当前状态 |
| --- | --- | --- |
| 日常协作 | 讨论、阅读、计划、快速澄清 | 默认入口 |
| 通用任务 | 多步任务推进、文件处理、结果检查 | 默认执行区 |
| 专业工作流 | 研究、基金、汇报等产品家族模块 | 持续扩展 |

## 进度与文件

右侧工作区应该把长任务做成清楚的执行可见性：

- 用人话显示进度，例如已受理、在查资料、在起草、执行中、等待审阅、已交付。
- 以任务和工作区为单位集中管理报告、幻灯片、表格和其他交付物。
- 把最近进展、当前状态和已产出文件放在一起，便于恢复工作。
- 在设置里查看模块、版本、健康状态、升级与安装情况。

## 用人话理解 OPL

`OPL` 负责的是统一工作台本身。
产品家族定义工作类型，当前实现负责承接具体能力与交付。

```text
Human
  -> OPL Workspace
      -> Everyday Collaboration
      -> General Tasks
      -> Research Foundry -> Med Auto Science
      -> Grant Foundry -> Med Auto Grant
      -> Presentation Ops -> RedCube AI
      -> Progress / Files / Settings
```

这意味着：

- `OPL` 负责入口、工作区、模块目录、进度反馈和文件交付区。
- 产品家族负责把研究、基金、汇报、学位论文、审稿修回这些工作类型组织清楚。
- 当前实现负责在具体领域里完成任务与交付。

## 这个仓库怎么读

1. 潜在用户、人类专家和非技术读者，先读当前首页，再继续看 [路线图](./docs/roadmap.zh-CN.md)、[任务版图](./docs/task-map.zh-CN.md)、[运行模型](./docs/operating-model.zh-CN.md)。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/`、`docs/history/omx/` 下的跟踪材料。

<details>
  <summary><strong>技术阅读入口</strong></summary>

产品实现、运行方式、接口边界和历史决策统一收在：

- [文档索引](./docs/README.zh-CN.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [架构](./docs/architecture.md)

</details>

## 延伸阅读

- [路线图](./docs/roadmap.zh-CN.md)
- [任务版图](./docs/task-map.zh-CN.md)
- [运行模型](./docs/operating-model.zh-CN.md)
- [统一工程基座](./docs/unified-harness-engineering-substrate.zh-CN.md)
- [文档索引](./docs/README.zh-CN.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [合同目录说明](./contracts/README.md)
