<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组 Agent 的产品壳与模块管理器</strong></p>
<p align="center">GUI 优先 · Codex 默认 · Domain Agent 可插拔</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>适合谁</strong><br/>
      医生、医学专家、研究者、PI 与小型课题组，尤其适合想用一个 GUI 管理 Codex 与专业 Agent 的人
    </td>
    <td width="33%" valign="top">
      <strong>能帮什么</strong><br/>
      普通对话、通用 Codex 任务，以及医学科研、基金写作、视觉交付等专用 Agent 工作
    </td>
    <td width="33%" valign="top">
      <strong>公开角色</strong><br/>
      `OPL` 是产品壳，负责选择工作模式、管理模块、升级模块，并把专用 domain agents 放在一个入口里
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-architecture-blueprint.svg" alt="OPL architecture blueprint" width="100%" />
</p>

> `OPL` 是一人课题组的 GUI-first 产品壳。用户可以在同一个前台里选择普通 Codex 对话、通用 Codex 任务，或专用 domain agents，并在设置里管理模块与升级。

## OPL 主要用来做什么

- 打开一个 GUI，先选择合适的工作模式。
- 用普通 Codex 对话做讨论、解释、阅读、计划和轻量分析。
- 把目标交给通用 Codex 任务，在本地 workspace 里执行多步工作。
- 把专业工作交给 `MAS`、`MAG`、`RCA` 这类 domain agents。
- 在设置里管理模块、入口、版本、健康状态和升级。

## GUI 中并列的工作模式

| 模式 | 主执行者 | 适合任务 | 当前状态 |
| --- | --- | --- | --- |
| 普通 Codex 对话 | Codex | 讨论、解释、阅读、轻量规划 | 默认 GUI 模式 |
| 通用 Codex 任务 | Codex task runner | 文件修改、命令执行、验证、较长本地任务 | 默认执行模式 |
| 专用 domain agents | `MAS`、`MAG`、`RCA` | 医学科研、基金写作、视觉交付 | 活跃模块家族 |

GUI 将这三类模式并列呈现。`Hermes-Agent` 单独作为显式备用在线网关进入。

## 进度与交付文件

右侧 workspace 边栏应该把长任务做成用户一眼能懂的状态面：

- 用人话显示进度，例如已受理、在查资料、在起草、执行中、等待审阅、正在交付文件。
- 以任务为单位管理文件，把草稿、报告、幻灯片、表格和其他交付物清楚挂在对应 workspace 下。
- 用可恢复的状态卡把最近进度、正在运行的任务和已经产出的文件串起来。

## 备用在线网关

`Hermes-Agent` 保留给远端网关实验、替代长时会话和在线备用运行。
用户通过显式模式切换或设置里的 online gateway 配置进入。

## 当前模块

| 模块 | 仓库 | 职责 | 状态 |
| --- | --- | --- | --- |
| `MAS` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学科研 Agent | 活跃 |
| `MAG` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金与 proposal Agent | 活跃 |
| `RCA` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 汇报与视觉交付 Agent | 活跃 |
| 未来 thesis 模块 | Planned | 学位论文与答辩准备 | 定义阶段 |
| 未来 review 模块 | Planned | 审稿、回复和修回 | 定义阶段 |

## 这个仓库应该怎么读

1. 潜在用户、人类专家和非技术读者，先读当前首页，再继续看 [路线图](./docs/roadmap.zh-CN.md)、[任务版图](./docs/task-map.zh-CN.md)、[运行模型](./docs/operating-model.zh-CN.md)。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/`、`docs/history/omx/` 下的跟踪材料。

## 用人话解释 OPL 的位置

`OPL` 是位于 Codex 与 domain agents 之上的用户产品壳。
它负责展示工作模式、管理模块、启动模块，并把一人课题组常用能力放进同一个 workspace。

```text
Human
  -> OPL GUI Product Shell
      -> Codex Conversation
      -> General Codex Task
      -> Domain Agent Module: MAS / MAG / RCA
      -> Settings: Module Management / Upgrades
      -> Hermes-Agent Online Gateway
```

这意味着：

- `OPL` 负责 GUI 产品壳、工作模式选择、模块目录、设置与升级。
- `Codex` 负责默认对话与通用任务执行。
- `MAS`、`MAG`、`RCA` 负责各自专业任务。
- `Hermes-Agent` 保留为备用模式与在线网关。

## 模块管理

设置面应清楚展示模块生命周期：

- 已安装模块和对应本地仓库路径。
- 可用升级、当前 pin 住的版本和最近验证状态。
- 默认工作模式、每个模块的启动偏好和健康状态。
- `MAS`、`MAG`、`RCA` 的人话进度、交付文件、readiness 与最近运行入口。
- `Hermes-Agent` 在线网关的连接配置和备用模式开关。

<details>
  <summary><strong>面向技术读者的折叠说明</strong></summary>

`OPL` 当前公开定位是 GUI-first 产品壳与模块管理器。
当前公开前台路径是 `GUI 产品壳 -> 工作模式选择 -> Codex / domain agents`。
`opl frontdesk bootstrap --path <workspace>` 准备本地 `OPL Atlas` Desktop 壳。
`opl web` 是同一产品壳的本地浏览器 companion surface。
`opl`、`opl "<request...>"`、`opl ask` 与 `opl chat` 都围绕同一产品入口。

Codex 是普通对话与通用本地任务的默认执行者。
Domain agents 由各自仓库维护专业能力和真实状态。
`Hermes-Agent` 是显式备用模式与在线网关，用于远端运行、替代长时会话和 external kernel 验证。

`OPL` 之下共享的上位架构语言是 `Unified Harness Engineering Substrate`。
当前最重要的共享部分继续收敛到 [Shared Runtime Contract](./docs/shared-runtime-contract.zh-CN.md) 和 [Shared Domain Contract](./docs/shared-domain-contract.zh-CN.md)。
模块目录与设置面应展示已安装 domain agents、健康状态与升级状态。

当前家族状态需要继续诚实描述：

- `MAS` 是医学科研模块。
- `MAG` 是基金与 proposal 模块。
- `RCA` 是视觉交付模块。
- thesis 与 review 模块处在定义阶段。

如果要进入完整技术阅读路径，请继续看 [文档索引](./docs/README.zh-CN.md)。
</details>

## 延伸阅读

- [路线图](./docs/roadmap.zh-CN.md)
- [任务版图](./docs/task-map.zh-CN.md)
- [运行模型](./docs/operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./docs/unified-harness-engineering-substrate.zh-CN.md)
- [文档索引](./docs/README.zh-CN.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [合同目录说明](./contracts/README.md)
