<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组的 Codex-default session runtime 与统一工作台</strong></p>
<p align="center">以 Codex-default 会话为默认入口，在需要时显式激活 domain agent，并让可选外壳共享同一套运行时真相</p>

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

<p align="center">
  <img src="assets/branding/opl-architecture-plan.svg" alt="OPL architecture and product plan" width="100%" />
</p>

> `OPL` 把发起工作、查看进度和收集交付物放到同一个入口里，而每个专业产品家族继续保留自己的方法、规则和交付边界。

## 全新 Mac 最快用起来

给用户的一行命令：

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git && cd one-person-lab && npm install && npm link && opl install
```

给 Codex Agent 的一句话：

> 安装并配置这个 OPL repo：clone repo，安装 OPL CLI，运行 `opl install`，确认 Codex CLI、Hermes-Agent、MAS/MAG/RCA、skills、本地 Product API service 和 OPL GUI 都准备好；如果某一步缺失，直接补齐或报告准确阻塞。

`opl install` 会一揽子配置 `Codex CLI`、`Hermes-Agent`、`MAS`、`MAG`、`RCA`、短名 Codex skills、本地 Product API service，并启动已安装的 OPL GUI。

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

这个仓库是 OPL 的产品 / runtime gateway，不是 GUI 外壳仓，也不是某个 domain agent 的实现仓。它跟踪：

- `opl`、直接 Codex 使用和外部壳共同消费的 Codex-default session/runtime 路径。
- 让 `MAS`、`MAG`、`RCA` 以短名 skill 被调用的 activation layer。
- 模块安装、skill 同步、service 配置和健康检查面。
- 工作空间、会话、进度与交付物的发现与组织能力。
- 共享产品层的机器可读合同。

桌面 GUI 由 [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell) 作为基于 AionUI codebase 的 OPL 品牌壳维护。OPL 提供这个 GUI、网页入口和 Codex 共同消费的本地 Product API 与运行时真相。

## 这个仓库怎么读

1. 用户先读当前首页和上面的 `opl install` 路径。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/` 和 [历史归档索引](./docs/history/README.zh-CN.md) 下的跟踪材料。

## 给 Agent 和技术操作者的快速入口

<details>
  <summary><strong>如果你准备把 OPL 直接交给 Codex 或其他通用 Agent，先看这里</strong></summary>

- 先读 [文档索引](./docs/README.zh-CN.md)。这里已经把当前产品模型、技术工作集、合同入口和文档分层收口好了。
- 再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md) 和 [关键决策](./docs/decisions.md)。这是恢复顶层边界、Codex-default runtime 合同、显式激活层与 admitted domains 的最快路径。
- 默认前门是 `opl`、`opl exec` 和 `opl resume`。除非显式切换 runtime 或显式激活 domain agent，这几个入口都继承 Codex-default 语义。`MCP` 继续是支持协议层，`controller` 继续只是 internal surface。
- 当前主线交互路径以 Codex-default 为先：本地 `opl`、直接 `Codex` 使用，以及未来外部壳都消费同一套 session/runtime truth。`opl skill sync` 现在默认会按 workspace 布局自动发现 sibling family repo，worktree 场景不再需要额外设置 `OPL_FAMILY_WORKSPACE_ROOT` 才能把家族 skill pack 装进 Codex。
- 如果某个 admitted domain repo 还没落地到本机，运行 `opl module install --module <module_id>`。这条安装线现在是闭环：先 clone 到 OPL-managed modules root，再执行仓库自己的 bootstrap、同步对应 Codex skill pack，最后跑仓库健康检查。
- 默认本地状态目录是 `~/Library/Application Support/OPL/state`。如果需要改到其他本地状态根目录，直接设置 `OPL_STATE_DIR`。
- 当前 active domain agents 是 [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience)、[`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) 和 [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)。它们分别承接医学研究、基金写作和视觉交付，并把本地 CLI、程序/脚本与 repo-tracked contract 暴露成稳定 capability surface；家族映射与公开入口可继续从 [当前状态](./docs/status.md)、[架构](./docs/architecture.md) 和 [OPL 公开界面索引](./docs/opl-public-surface-index.zh-CN.md) 进入。
- 当任务需要顶层 session/runtime 路径、共享 `workspaces / sessions / progress / artifacts` surface 或显式 domain activation 时，从 `OPL` 进入；当任务已经明确落在某个 domain 上时，继续进入对应仓库首页和 `docs/README*`，按该仓自己的 CLI/脚本/contract 边界执行。

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
