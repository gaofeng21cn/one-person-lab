<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组的公开总入口，用来组织科研、基金、评审与展示工作</strong></p>
<p align="center">非技术专家友好 · Domain 边界清楚 · Gateway 优先</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>适合谁</strong><br/>
      医生、医学专家、研究者、PI 与小型课题组，尤其适合需要跨多个专业系统协同工作的人
    </td>
    <td width="33%" valign="top">
      <strong>能帮什么</strong><br/>
      把科研推进、基金写作、评审工作与汇报材料放进同一个清楚的顶层工作组织面里
    </td>
    <td width="33%" valign="top">
      <strong>公开角色</strong><br/>
      `OPL` 是顶层 gateway，用来说明每类工作该去哪个 domain system，以及不同系统之间如何诚实 handoff
    </td>
  </tr>
</table>

> `OPL` 是一人课题组的公开顶层 Gateway。它帮助人类专家或 Agent 找到合适的 domain system，保持 handoff 边界清楚，并让整条实验室工作线保持可理解、可追踪。

## OPL 主要用来做什么

- 从一个统一入口开始，而不是先把每个仓库、每套命令和每个 runtime 都学一遍。
- 快速知道当前问题属于医学科研、基金写作、评审回复，还是展示/汇报制作。
- 让实验室里会复用的数据、文献、判断和交付上下文保持连贯，但不把所有工作流混成一个大工具。
- 直接看清楚哪些路径今天已经活跃，哪些还处在定义阶段。

## 当前可走的主路径

| 需求 | 当前路径 | 状态 | 说明 |
| --- | --- | --- | --- |
| 医学科研 | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | Active | 当前 `Research Ops` 主承接面 |
| 基金写作 | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 活跃业务仓路径 | 顶层 federation admission / handoff wording 仍在 `OPL` 单独门控 |
| 汇报与视觉交付 | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Active | 当前 `Presentation Ops` 主承接面，`ppt_deck` 是最直接 family 映射 |
| 学位论文准备 | Planned | 尚未正式收录 | 仍在定义为独立 domain boundary |
| 审稿与回复评审 | Planned | 尚未正式收录 | 仍在定义为独立 domain boundary |

## 这个仓库应该怎么读

1. 潜在用户、人类专家和非技术读者，先读当前首页，再继续看 [路线图](./docs/roadmap.zh-CN.md)、[任务版图](./docs/task-map.zh-CN.md)、[Gateway 联邦](./docs/gateway-federation.zh-CN.md)。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.zh-CN.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/`、`docs/history/omx/` 下的跟踪材料。

## 用人话解释 OPL 的位置

`OPL` 不是把下面所有项目都吞掉的那个系统。
它的职责，是停在上面，负责把工作送到正确的地方。

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
```

更直白地说：

- `OPL` 负责说明顶层工作流和边界。
- 每个 domain 仓继续负责自己的 domain workflow 和交付真相。
- 实验室里的共享语言可以统一，但不要求所有 domain 被硬压进同一个 runtime。

## OPL 不是什么

- 它不是一个要吞掉所有 domain 仓的单体 runtime。
- 它不是“所有 domain 今天都已经同等成熟”的宣传口径。
- 它不是研究、基金或视觉交付真相的最终 owner；这些真相仍然归各自 domain 仓。

<details>
  <summary><strong>面向技术读者的折叠说明</strong></summary>

`OPL` 继续只持有顶层 `Gateway / Federation` 角色，admitted domain 仓继续持有各自的 domain runtime ownership。

`OPL` 之下共享的上位架构语言是 `Unified Harness Engineering Substrate`。其中当前最重要的共享部分，正在收敛为 [Shared Runtime Contract](./docs/shared-runtime-contract.zh-CN.md) 和 [Shared Domain Contract](./docs/shared-domain-contract.zh-CN.md)。

当前顶层已落地的入口表面包括本地 `opl` shell 和本地 web front desk pilot。
当前家族级管理面包括 `workspace-catalog`、`workspace-bind|activate|archive`、`domain-manifests`、`session-ledger` 与 `dashboard`。
`workspace-bind` 现在也支持从结构化 workspace locator 自动推出 family `entry_command` 与 `manifest_command`，例如 `--profile`、`--input` 与 `--workspace-root`，不再要求所有项目都手写原始命令串。

当前家族状态必须继续诚实描述：

- `Med Auto Science` 是当前活跃的医学 `Research Ops` 承接面，但 runtime 对齐仍处于过渡态。
- `Med Auto Grant` 是当前活跃的医学 `Grant Ops` 业务仓路径，且已经跑在真实上游 `Hermes-Agent` substrate 上；但顶层 admission / handoff wording 仍在 `OPL` 单独门控。
- `RedCube AI` 是当前活跃的视觉交付承接面，并在本地 `Codex CLI` host-agent runtime 上运行当前主线。

如果要进入完整技术阅读路径，请继续看 [文档索引](./docs/README.zh-CN.md)。
</details>

## 延伸阅读

- [路线图](./docs/roadmap.zh-CN.md)
- [任务版图](./docs/task-map.zh-CN.md)
- [Gateway 联邦](./docs/gateway-federation.zh-CN.md)
- [运行模型](./docs/operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./docs/unified-harness-engineering-substrate.zh-CN.md)
- [文档索引](./docs/README.zh-CN.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [合同目录说明](./contracts/README.zh-CN.md)
