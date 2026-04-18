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

<p align="center">
  <img src="assets/branding/opl-architecture-blueprint.svg" alt="OPL architecture blueprint" width="100%" />
</p>

> `OPL` 是一人课题组的公开顶层 Gateway。它帮助人类专家或 Agent 找到合适的 domain system，保持 handoff 边界清楚，并让整条实验室工作线保持可理解、可追踪。

## OPL 主要用来做什么

- 从一个统一入口开始，而不是先把每个仓库、每套命令和每个 runtime 都学一遍。
- 快速知道当前问题属于医学科研、基金写作、评审回复，还是展示/汇报制作。
- 让实验室里会复用的数据、文献、判断、执行可见性和交付上下文保持连贯，但不把所有工作流混成一个大工具。
- 直接看清楚哪些路径今天已经活跃，哪些还处在定义阶段。

## 当前可走的主路径

| 需求 | 当前路径 | 状态 | 说明 |
| --- | --- | --- | --- |
| 医学科研 | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | Active | 当前 `Research Ops` 主承接面 |
| 基金写作 | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 活跃的医学 `Grant Ops` 业务仓路径 | 顶层 federation admission / handoff wording 仍在 `OPL` 单独门控 |
| 汇报与视觉交付 | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Active | 当前 `Presentation Ops` 主承接面，`ppt_deck` 是最直接 family 映射 |
| 学位论文准备 | Planned | 尚未正式收录 | 仍在定义为独立 domain boundary |
| 审稿与回复评审 | Planned | 尚未正式收录 | 仍在定义为独立 domain boundary |

## 这个仓库应该怎么读

1. 潜在用户、人类专家和非技术读者，先读当前首页，再继续看 [路线图](./docs/roadmap.zh-CN.md)、[任务版图](./docs/task-map.zh-CN.md)、[Gateway 联邦](./docs/gateway-federation.zh-CN.md)。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/`、`docs/history/omx/` 下的跟踪材料。

## 用人话解释 OPL 的位置

`OPL` 不是把下面所有项目都吞掉的那个系统。
它的职责，是停在上面，负责把工作送到正确的地方。

在 `OPL` 体系下，当前共享的上位架构语言统一命名为 `Unified Harness Engineering Substrate`，简称 `UHS`。
`UHS` 用来描述运行结构、产品行为与跨域复用的共享 Harness Engineering 语言；其中最核心的两类合同是 [Shared Runtime Contract](docs/shared-runtime-contract.zh-CN.md) 与 [Shared Domain Contract](docs/shared-domain-contract.zh-CN.md)。

- `Shared Runtime Contract`
  - 冻结长期在线 runtime 至少应具备的共享运行对象，例如 `runtime profile`、`session substrate`、`gateway runtime status`、`memory provider hook`、`delivery / cron`、`approval / interrupt / resume`
- `Shared Domain Contract`
  - 冻结多个 `Domain Harness OS` 应保持一致的上层行为语义，例如 formal-entry matrix、`per-run handle`、durable report、audit trail、gate semantics 与 no-bypass 规则

这意味着：

- `OPL` 继续负责顶层 `Gateway / Federation`
- domain runtime ownership 继续留在各个业务仓
- 就算未来接入真实上游 `Hermes-Agent`，它也应位于 shared runtime substrate 这一层，而不是把 `OPL` 变成 domain runtime owner

如果要看这轮真相重置、真实接入标准，以及理想形态相对当前状态的优缺点，见 [Hermes-Agent 真相重置与目标形态说明](docs/references/hermes-agent-truth-reset-and-target-state.md)。

在这套 substrate 之上，当前几个项目应被理解成职责清楚、产品范围独立的 `Domain Harness OS`：

- `Med Auto Science`：医学 `Research Ops`
- `Med Auto Grant`：活跃的医学 `Grant Ops` 业务仓与 Domain Harness OS 方向；但在 `OPL` 顶层 public federation wording 上仍需与 admission / handoff state 分开表述
- `RedCube AI`：视觉交付，以及当前最直接映射到 `Presentation Ops` 的 family 入口

`OPL` 本身继续停留在 domain gateway 与 `Domain Harness OS` 之上的顶层 gateway 与 federation surface。

## 对外一句话理解

对外部读者来说，最简单的理解是：

- 它是“一人课题组如何使用多个 domain system 持续工作”的顶层产品面
- 它定义工作流如何映射到具体 domain system
- 它冻结跨 domain 语义，同时保留每个 domain 独立可用

## 产品入口与 Hermes Kernel Integration

当前公开主路径已经统一成：

`GUI 前台 -> Codex -> OPL Gateway`

这条主路径在仓内的当前落点是：

- `opl frontdesk bootstrap --path <workspace>` 是本机 GUI 前台主入口；它会准备 `OPL Atlas` Desktop 壳、把 `OPL Agent` 对齐到当前本机 `Codex` 默认模型与 thinking，并挂上 `OPL Cortex` MCP bridge
- `opl web` 是同一前台的本地 web companion surface
- `opl` 是默认前台命令，`opl "<request...>"` 与 `opl start --project <project_id> [--mode <mode_id>]` 是进入同一 front door / gateway surface 的 shell shortcut
- 当前活跃开发宿主是 Codex-only 本地会话，而优选的未来产品 runtime substrate 方向，仍然是先在某个 domain 仓里诚实证明真实的上游 `Hermes-Agent` 集成
- `opl ask` 默认执行器是 `Codex`
- frontdesk runtime modes 当前冻结为 `interaction_mode=codex` 与 `execution_mode=codex`
- `opl chat`、`opl resume`、`--executor hermes` 与前台显式 mode 切换保留 `Hermes` 备用 lane；这条 lane 用于显式交互续跑与 external kernel 验证
- 当前 primary entry surfaces 包括 `opl frontdesk bootstrap`、`opl`、`opl "<request...>"`、`opl doctor`、`opl ask`、`opl chat`、`opl resume`、`opl sessions`、`opl logs`、`opl repair-hermes-gateway` 与 `opl web`

围绕这条主路径，当前已经冻结的顶层发现与管理面包括：

- `frontdesk-entry-guide -> frontdesk-readiness / frontdesk-domain-wiring -> dashboard` 这条固定 bootstrap 顺序
- `workspace-catalog`、`workspace-bind|activate|archive`、`domain-manifests`、`session-ledger`、`dashboard` 这组 family-level 管理 surface
- `domain-manifests` 会解析 active binding 上的 `manifest_command`，把 routed domain 的 `product_entry_start`、`product_entry_shell`、`shared_handoff` 与可选 `family_orchestration.action_graph` 回灌到顶层 front desk
- `opl frontdesk-manifest`、`opl frontdesk-hosted-bundle` 与 `opl frontdesk-hosted-package` 继续承载 hosted-friendly contract 与 self-hostable packaging
- `opl frontdesk librechat install` 与 `opl frontdesk-librechat-package` 只保留 optional compatibility / fallback lane 的诚实表述
- `Paperclip` control-plane surfaces 只保留 optional downstream bridge 语义

当前家族级公开链路可以读成：

`GUI Front Desk -> Codex -> OPL Product Entry / Gateway -> Domain Handoff -> Domain Product Entry / Domain Gateway`

`Hermes Kernel Integration` 的正式选择继续是 `external kernel, managed by OPL product packaging`。
这表示 `Hermes` 保持 external kernel 目标与显式备用模式；`OPL` 继续负责产品层 bootstrap、launcher、version pinning、runtime wiring 与用户入口；domain runtime ownership 继续留在各个 admitted domain 仓。
hosted 产品化仍未落地。

如果要看 fork / 用户自管安装 / 托管式外部 kernel 集成三种方案的完整对比，见 [OPL 产品入口与 Hermes Kernel Integration 决策](docs/references/opl-product-entry-and-hermes-kernel-integration.md)。
如果要看四仓家族层面的入口栈与 `OPL -> domain` handoff 架构，见 [OPL 家族产品入口与 Domain Handoff 架构](docs/references/family-product-entry-and-domain-handoff-architecture.md)。
如果要看 hosted / web 前台、GUI 主入口与 compatibility lane 的配套取舍，见 [OPL Hosted / Web Front Desk 选型基准](docs/references/opl-hosted-web-frontdesk-benchmark.md)。
如果要看 `OPL` 与三个业务仓的 lightweight direct entry 后续该按什么顺序推进，见 [Family Lightweight Direct Entry 推进板](docs/references/family-lightweight-direct-entry-rollout-board.md)。
如果要看 front desk 这条线当前已经落了什么、还缺什么，见 [OPL Front Desk 落地推进板](docs/references/opl-frontdesk-delivery-board.md)。

## 统一执行范式

`OPL` 顶层默认采用 `Agent-first` 的执行范式。
Agent 是默认执行者：它负责读状态、调用稳定 gateway、编排步骤、组织中间产物，并把关键执行痕迹写回可审计表面；代码则负责提供稳定对象、控制器、工具封装、门控规则与交付表面。

当前公开默认执行器是 `Codex`，当前公开默认前台路径是 `GUI -> Codex -> OPL`。
`Hermes` 保留显式备用交互/执行模式和 external kernel 目标。
在产品/runtime 这一层，优选的未来 substrate 方向，仍然是先在某个 domain 仓里诚实证明真实的上游 `Hermes-Agent` 集成；`OPL` 自身继续只停留在顶层 gateway 与 federation 层。
当这条方向真正落地时，优选的集成方式仍然是 `external kernel, managed by OPL product packaging`。

在这个前提下，当前 domain 仓统一按 `Auto-only` 产品主线理解。
仓库主线优先服务全自动闭环、评估、硬化和审计。

如果未来要做高判断密度的 `Human-in-the-loop` 产品，更合理的形态是建立在这些 `Auto-only` 仓之上的 sibling 或 upper-layer product，去复用同一套稳定 substrate contract、对象语义、审计面和执行模块。

这就是当前 `OPL` 层已经冻结的统一执行范式。

## 为什么是 Gateway Federation

同一批数据、文献、图表和判断，会在这些任务之间反复复用：

- 研究推进与论文交付
- 基金申请与基金评审
- 学位论文写作与答辩准备
- 审稿、回复和修回
- 讲课、汇报和答辩材料

`OPL` 选择 gateway federation，是为了让这些任务共享同一套上下文、记忆、治理与审核面，同时继续保持清楚的 domain 边界与维护责任。

所以更合理的理解是：

- `OPL` 掌握顶层任务语义与共享基础结构
- 每个工作流保留独立的 domain gateway
- 每个 domain gateway 再由自己的 harness 驱动

## 顶层控制链

理想主链应是：

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
当前公开前台路径是 `GUI 前台 -> Codex -> OPL gateway surfaces`：`opl frontdesk bootstrap --path <workspace>` 准备本地 `OPL Atlas` Desktop 壳，本地 web front desk 保留 companion surface，交互与执行默认都走 `Codex`。
当前活跃开发宿主是 Codex-only 本地会话，而优选的未来产品 runtime substrate 方向，仍然是先在某个 domain 仓里诚实证明真实的上游 `Hermes-Agent` 集成。
`Hermes-Agent` 保留为显式备用模式，用于交互续跑、特定 executor routing 与 external kernel 验证；真实上游 `Hermes-Agent` rollout 仍属于 domain 侧迁移目标。

`OPL` 之下共享的上位架构语言是 `Unified Harness Engineering Substrate`。其中当前最重要的共享部分，正在收敛为 [Shared Runtime Contract](./docs/shared-runtime-contract.zh-CN.md) 和 [Shared Domain Contract](./docs/shared-domain-contract.zh-CN.md)。
共享运行层、托管入口与任何真实的 `Hermes-Agent` 落地进度，仍在各自仓与合同中推进。

当前公开主线继续保留已 absorbed 的 `Phase 1 / G2 release-closeout` 口径，而 repo-tracked formal entry 仍是 `TypeScript CLI`-first / read-only gateway surface。
当前 `Phase 2 / Minimal admitted-domain federation activation package` 只覆盖两个已 admitted domain surface：`MedAutoScience` 与 `RedCube AI`。
`Grant Foundry -> Med Auto Grant` 仍是活跃的医学 `Grant Ops` 业务仓路径，但顶层 federation admission / handoff wording 继续在 `OPL` 单独门控。

`OPL` 现在已经有了以 `opl` 为默认入口的本地 direct product-entry shell，公开 front door 仍以 GUI 前台为中心，`opl "<request...>"` 与 `opl web` 是围绕同一入口的 shell shortcut 或 companion surface。
它采用 `external kernel, managed by OPL product packaging`，不要求用户先手工安装并理解 `Hermes-Agent`。
当前 primary entry surfaces 包括 `opl frontdesk bootstrap`、`opl`、`opl "<request...>"`、`opl doctor`、`opl ask`、`opl chat`、`opl resume`、`opl sessions`、`opl logs`、`opl repair-hermes-gateway` 与 `opl web`。
`Paperclip` 是 optional downstream control-plane bridge，`LibreChat` 是 optional compatibility / fallback lane。
hosted 产品化仍未落地。

当前顶层已落地的入口表面因此包括本地 `opl` shell 和本地 web front desk pilot。
当前家族级管理面包括 `workspace-catalog`、`workspace-bind|activate|archive`、`domain-manifests`、`session-ledger` 与 `dashboard`。
对 AI / GUI 壳来说，默认 bootstrap 顺序固定为 `frontdesk-entry-guide -> frontdesk-readiness / frontdesk-domain-wiring -> dashboard`。
`workspace-bind` 现在也支持从结构化 workspace locator 自动推出 family `entry_command` 与 `manifest_command`，例如 `--profile`、`--input` 与 `--workspace-root`，不再要求所有项目都手写原始命令串。

当前公开家族链路是：

`GUI Front Desk -> Codex -> OPL Product Entry / Gateway -> Domain Handoff -> Domain Product Entry / Domain Gateway`

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
- [合同目录说明](./contracts/README.md)
