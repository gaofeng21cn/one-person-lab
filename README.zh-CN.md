<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组智能体的产品壳与模块管理器</strong></p>
<p align="center">GUI 优先 · Codex 默认 · 专用智能体可插拔</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>适合谁</strong><br/>
      医生、研究者、PI、教师与小团队，适合希望用一个 GUI 管理研究、基金与交付工作的人
    </td>
    <td width="33%" valign="top">
      <strong>能帮什么</strong><br/>
      普通 Codex 对话、可执行的 Codex 任务，以及科研、基金和汇报交付等专用工作
    </td>
    <td width="33%" valign="top">
      <strong>公开角色</strong><br/>
      `OPL` 是产品壳，负责选择工作模式、管理模块，并把长任务进度与交付文件放到同一个入口里
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-architecture-blueprint.svg" alt="OPL architecture blueprint" width="100%" />
</p>

> `OPL` 是一人课题组的 GUI-first 产品壳。它对外把工作组织成三层：产品壳、产品家族、当前实现。现在最成熟的实现集中在医学科研、医学基金与视觉交付。

## 当前覆盖的工作

- 打开一个 GUI，先选择合适的工作模式。
- 用普通 Codex 对话做讨论、解释、阅读、计划和轻量分析。
- 把目标交给通用 Codex 任务，在本地 workspace 里执行多步工作。
- 把专业工作交给 `Research Foundry`、`Grant Foundry`、`Presentation Ops` 这类产品家族。
- 在 workspace 侧边栏查看进度与交付文件。
- 在设置里管理模块、入口、版本、健康状态和升级。

## GUI 中并列的工作模式

| 模式 | 主执行者 | 适合任务 | 当前状态 |
| --- | --- | --- | --- |
| 普通 Codex 对话 | Codex | 讨论、解释、阅读、轻量规划 | 默认 GUI 模式 |
| 通用 Codex 任务 | Codex task runner | 文件修改、命令执行、验证、较长本地任务 | 默认执行模式 |
| 专用家族模块 | `MAS`、`MAG`、`RCA` | 科研、基金写作、视觉交付 | 活跃模块家族 |

GUI 将这三类模式并列呈现。`Hermes-Agent` 单独作为显式备用在线网关进入。
当前活跃执行入口仍是 `Codex-only` 本地会话，也就是今天的开发宿主；优选的未来 substrate 方向是先在某个 domain 仓库里证明真实的上游 `Hermes-Agent` 集成。

## 产品家族

| 产品家族 | 当前实现 | 当前覆盖范围 | 状态 |
| --- | --- | --- | --- |
| Research Foundry | `MAS` / [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学科研、证据整理、稿件交付 | 活跃 |
| Grant Foundry | `MAG` / [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 医学基金方向判断、申请书写作、作者侧模拟评审 | 活跃仓线 |
| Presentation Ops | `RCA` / [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| Thesis Ops | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| Review Ops | Planned | 审稿、回复和修回工作流 | 定义阶段 |

`OPL` 负责把产品壳稳定下来，产品家族负责定义工作类型，当前实现负责承接具体领域能力与仓库真相。当前活跃实现集中在医学方向，产品表面本身按照工作家族组织，因此也可以继续承接更多领域。

## 进度、文件与设置

右侧 workspace 边栏和设置面应让长任务保持清楚可见，并保留明确的执行可见性：

- 用人话显示进度，例如已受理、在查资料、在起草、执行中、等待审阅、正在交付文件。
- 以任务为单位管理文件，把草稿、报告、幻灯片、表格和其他交付物清楚挂在对应 workspace 下。
- 用可恢复的状态卡把最近进度、正在运行的任务和已经产出的文件串起来。
- 用模块目录展示已安装实现、健康状态、可用升级、固定版本和默认启动偏好。
- 用显式 online gateway 配置承接 `Hermes-Agent` 备用运行。

## 这个仓库应该怎么读

1. 潜在用户、人类专家和非技术读者，先读当前首页，再继续看 [路线图](./docs/roadmap.zh-CN.md)、[任务版图](./docs/task-map.zh-CN.md)、[运行模型](./docs/operating-model.zh-CN.md)。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/`、`docs/history/omx/` 下的跟踪材料。

## 用人话解释 OPL 的位置

`OPL` 是位于 Codex 与产品家族之上的用户产品壳。
它负责展示工作模式、管理家族与模块，并把一人课题组常用能力放进同一个 workspace。

```text
Human
  -> OPL GUI Product Shell
      -> Codex Conversation
      -> General Codex Task
      -> Product Families
          -> Research Foundry -> MAS / Med Auto Science
          -> Grant Foundry -> MAG / Med Auto Grant
          -> Presentation Ops -> RCA / RedCube AI
      -> Settings: Modules / Upgrades / Health / Gateway
      -> Hermes-Agent Online Gateway
```

这意味着：

- `OPL` 负责 GUI 产品壳、工作模式选择、进度视图、文件区、设置与升级。
- 产品家族定义长期稳定的工作类别：科研、基金、汇报、学位论文、审稿修回。
- `MAS`、`MAG`、`RCA` 这类当前实现承接具体领域能力与仓库真相。
- `Codex` 负责默认对话与通用任务执行。
- `Hermes-Agent` 保留为备用模式与在线网关。

<details>
  <summary><strong>面向技术读者的折叠说明</strong></summary>

`OPL` 已经落下本地 direct product-entry shell，默认入口是 `opl`。
冻结中的产品入口选择是 `external kernel, managed by OPL product packaging`，不要求用户先手工安装并理解 `Hermes-Agent`。
当前面向用户的链路是 `User -> OPL Product Entry -> OPL Gateway -> Domain Handoff -> Domain Product Entry / Domain Gateway`。
本地 web front desk pilot 已经落地，hosted web front desk 仍未完成。

`OPL` 当前公开定位是 GUI-first 产品壳与模块管理器。
当前公开前台路径是 `GUI 产品壳 -> 工作模式选择 -> Codex / 专用智能体`。
`opl frontdesk bootstrap --path <workspace>` 准备本地 `OPL Atlas` Desktop 壳。
`opl web` 是同一产品壳的本地浏览器 companion surface。
`opl`、`opl "<request...>"`、`opl start`、`opl ask` 与 `opl chat` 都围绕同一产品入口。
当前 grouped CLI matrix 已经和落地前门保持一致：

- 顶层壳面：`opl`、`opl "<request...>"`、`opl start`、`opl doctor`、`opl ask`、`opl chat`、`opl web`
- contract 面：`opl contract validate|workstreams|workstream|domains|domain|surfaces|surface|handoff-envelope`
- domain 面：`opl domain manifests|launch|resolve-request|explain-boundary`
- status 面：`opl status workspace|runtime|dashboard`
- workspace 面：`opl workspace projects|list|bind|activate|archive`
- frontdesk 面：`opl frontdesk manifest|entry-guide|readiness|domain-wiring|hosted-bundle|hosted-package|service *|bootstrap`
- session 面：`opl session list|resume|logs|ledger`
- runtime 运维面：`opl runtime repair-gateway`

现在的代表性 grouped command 可以直接读成 `opl contract validate`、`opl domain manifests`、`opl status runtime`、`opl workspace bind`、`opl frontdesk entry-guide`、`opl session ledger` 与 `opl runtime repair-gateway`。

`opl "<request...>"` 继续作为同一 direct product entry 之上的 quick ask 路径。

Codex 是普通对话与通用本地任务的默认执行者。
Domain agents 由各自仓库维护专业能力和真实状态。
`Hermes-Agent` 是显式备用模式与在线网关，用于远端运行、替代长时会话和 external kernel 验证。

`OPL` 之下共享的上位架构语言是 `Unified Harness Engineering Substrate`。
当前最重要的共享部分继续收敛到 [Shared Runtime Contract](./docs/shared-runtime-contract.zh-CN.md) 和 [Shared Domain Contract](./docs/shared-domain-contract.zh-CN.md)。
模块目录与设置面应展示已安装专用智能体、健康状态与升级状态。

`Phase 1 / G2 release-closeout` 继续作为顶层公开基线，覆盖共享运行层、托管入口与任何真实的 `Hermes-Agent` 落地进度。
当前公开联邦冻结面是 `Minimal admitted-domain federation activation package`。它当前只覆盖两条已 admitted domain surface，也就是 `MedAutoScience` 和 `RedCube AI`，formal entry 继续保持本地 `TypeScript CLI`-first / gateway contract surface，runtime ownership 继续留在 admitted domain 一侧。
`Grant Foundry -> Med Auto Grant` 已经是活跃的 grant-domain 业务仓路径；在 `OPL` 顶层，它的 federation admission 与 domain handoff wording 继续单独门控。

当前家族状态需要继续诚实描述：

- `Research Foundry -> MAS / Med Auto Science` 是当前活跃的医学科研实现。
- `Grant Foundry -> MAG / Med Auto Grant` 是当前活跃的医学基金实现。
- `Presentation Ops -> RCA / RedCube AI` 是当前活跃的视觉交付实现。
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
