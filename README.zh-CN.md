<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组的 family gateway 与 headless adapter</strong></p>
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
      `OPL` 跟踪 one-person-lab 产品面背后的 contract-first family gateway、模块目录和 headless adapter / API surfaces
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL workbench overview" width="100%" />
</p>

> `OPL` 负责把家族入口、进度 surfaces、模块目录和 domain handoff contract 对齐起来。外部 overlay 或 CLI 消费这些 surfaces，各 domain 仓继续持有专业 runtime 与交付。

## 可以用来做什么

- 从同一个 family-level 入口发起研究、基金和汇报相关工作。
- 通过共享 adapter surfaces 查看最近进展、当前状态、已产出文件和模块状态。
- 让基金申请书、提纲、讲稿、幻灯片等交付继续挂在同一套 family gateway 上。
- 在保留顶层上下文的前提下把请求 handoff 到各 domain 产品入口。
- 用同一套产品面管理模块安装、升级和 workspace 绑定。

## 当前覆盖的产品家族

| 产品家族 | 当前实现 | 适合问题 | 常见交付物 |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学研究、证据整理、稿件准备 | 分析包、证据包、稿件 |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、作者侧修订 | 申请书、提纲、修订包 |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩材料 | 幻灯片、讲稿、汇报材料 |
| `Thesis Foundry` | 规划中 | 学位论文与答辩准备 | 章节草稿、答辩材料 |
| `Review Foundry` | 规划中 | 审稿、回复和修回 | 评审意见、回复草稿、修回计划 |

## OPL 串起什么

| 工作区 | 用户看到的内容 | 当前状态 |
| --- | --- | --- |
| 家族入口与路由 | 外部 GUI overlay 或 CLI 发起工作、选择家族、进入 domain 产品 | 默认公开入口 |
| 进度与文件 surfaces | 共享 adapter / API surfaces 暴露状态、交付物、会话上下文和模块健康 | 仓库跟踪的 headless truth |
| 专业工作流 | 研究、基金、汇报等产品家族继续路由到 domain-owned implementations | 活跃 |

## 进度、文件与模块

仓库跟踪的 adapter surfaces 继续把长任务做成清楚的执行可见性：

- 用人话显示进度，例如已受理、在查资料、在起草、执行中、等待审阅、已交付。
- 以任务和工作区为单位集中管理报告、幻灯片、表格和其他交付物。
- 把最近进展、当前状态和已产出文件放在一起，便于恢复工作。
- 在同一套家族 surfaces 里查看模块、版本、健康状态、升级与安装情况。
- 外部 overlay 可以把同一套 surfaces 投射成更完整的 GUI 壳，而不改写仓库里的真相。

## 用人话理解 OPL

`OPL` 跟踪的是 family gateway 和 headless truth surfaces。
外部 overlay 或 CLI 提供用户入口，当前实现继续承接 domain runtime 与交付。

```text
Human / External GUI Overlay / CLI
  -> OPL Family Gateway + Headless Adapter
      -> Research Foundry -> Med Auto Science
      -> Grant Foundry -> Med Auto Grant
      -> Presentation Foundry -> RedCube AI
      -> Progress / Files / Modules / Session Surfaces
```

这意味着：

- 这个仓库跟踪家族 gateway、模块目录、进度/文件/会话 surfaces，以及 machine-readable contracts。
- 外部 GUI overlay 会消费同一套 adapter / API surfaces，提供更完整的壳层体验。
- 当前实现继续持有 domain product entry、runtime 与交付。

## 这个仓库怎么读

1. 潜在用户、人类专家和非技术读者，先读当前首页，再继续看 [路线图](./docs/roadmap.zh-CN.md)、[任务版图](./docs/task-map.zh-CN.md)、[运行模型](./docs/operating-model.zh-CN.md)。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/`、`docs/history/frontdesk-legacy/`、`docs/history/omx/` 下的跟踪材料。

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
