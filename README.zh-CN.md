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
- 让实验室里会复用的数据、文献、判断和交付上下文保持连贯，但不把所有工作流混成一个大工具。
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

当前真实状态仍是过渡态，但已经往前走了一步：

- `OPL` 现在已经有了以 `opl` 为默认入口的本地 direct product-entry shell
- `opl` 会直接进入 `OPL Front Desk`，在外部 Hermes kernel 之上种入或恢复会话
- `opl "<request...>"` 现在已经成为自然语言 quick ask 的快捷路径
- `opl start --project <project_id> [--mode <mode_id>]` 现在会把某个 admitted domain 的 `product_entry_start` surface 解析成 OPL 当前建议的精确下一步入口模式
- `opl doctor`、`opl ask`、`opl chat`、`opl resume`、`opl sessions`、`opl logs`、`opl repair-hermes-gateway`、`opl frontdesk-manifest`、`opl frontdesk-hosted-bundle`、`opl frontdesk-hosted-package`、`opl frontdesk-librechat-package`、`opl session-ledger`、`opl handoff-envelope`、`opl domain-manifests`、`paperclip-*` 以及 `frontdesk-service-*` 现在共同构成显式的产品入口与 runtime 运维命令面；其中 `paperclip-*` 仍是可选下游 bridge，只在已配置外部 control plane 时启用
- `opl frontdesk-bootstrap --path <workspace>` 是本机 GUI 前台的主入口；它现在会准备无 Docker 的 `OPL Atlas` Desktop 壳，把 `OPL Agent` 对齐到当前本机 Codex 默认模型与 thinking，并继续挂上 `OPL Cortex` 这条 MCP bridge，同时把当前 workspace 接入顶层 registry
- `opl frontdesk-manifest`、`opl frontdesk-hosted-bundle`、`opl frontdesk-hosted-package` 与 `opl frontdesk-librechat-package`，现在把 hosted-friendly shell contract、hosted-ready bundle surface、可自托管的 frontdesk package，以及真实的 LibreChat-first hosted shell pilot package 一并冻结下来，同时不夸大 managed hosted runtime readiness
- 对 AI / GUI 壳来说，当前默认 bootstrap 顺序也已经明确冻结：先读 `frontdesk-entry-guide`，再看 `frontdesk-readiness` 与 `frontdesk-domain-wiring`，`dashboard` 明确只保留给 operator/debug 聚合视图
- `opl projects`、`opl workspace-status`、`opl workspace-catalog`、`opl workspace-bind|activate|archive`、`opl domain-manifests`、`opl runtime-status`、`opl session-ledger`、`opl dashboard` 现在补上了可写的顶层管理面，用来观察并管理项目、工作区、会话、handoff 与 runtime；`workspace-catalog` 继续只做 registry，而 `domain-manifests` 会实际解析当前 active binding 上的 `manifest_command`，把 domain-owned 的产品入口 manifest 变成可消费的 machine-readable discovery surface，避免 family wiring 自己猜 domain shell 能力；这层发现面现在也会原样保留各 domain 的 `product_entry_start`、`product_entry_shell`、`shared_handoff` 与可选的 `family_orchestration.action_graph` companion，而不是再把 richer shell 语义压扁掉
- `opl web` 现在补上了本地 web front desk pilot，可以直接从浏览器进入 OPL、解析 routed start surface、做 quick ask、绑定 workspace、查看 managed session ledger、导出可自托管的 hosted pilot package，并消费 hosted-friendly `health / manifest / domain-manifests / hosted-bundle / hosted-package / librechat-package / start / sessions / resume / logs / handoff-envelope` 界面
- `opl frontdesk-service-install|status|start|stop|open|uninstall` 现在又补上了基于 launchd 的 service-safe 本地包装层，让 OPL 的浏览器入口不再只能靠手动挂着终端
- 用户在本机上不再必须先进入 `Codex`，才能触达顶层 `OPL` surface
- 这次落地的 product entry 已经同时包含本地 CLI-first 入口壳与本地 web front desk pilot；同时也已经落下可自托管的 hosted pilot package，以及真实的 LibreChat-first hosted shell pilot package，但 actual managed hosted runtime 仍未落地
- hosted / web 这一层的选型现在也已经冻结：短期最快可用路线是 `LibreChat-first`，长期目标仍是 `OPL` 自有 web front desk；`Chatbot UI` 太薄，不适合作为主 hosted 基座
- 三个业务仓的成熟度缺口现在已经缩小，但仍然真实存在：`Med Auto Grant` 已经有 grant-facing 的结构化 shell 和只读 direct-product projection，`Med Auto Science` 已经补上 research-only shell 与共享 envelope 的 `build-product-entry`，`RedCube AI` 也已经有 repo-verified 的 `redcube product frontdesk`、direct / federated / session entry surfaces，以及 family-orchestration companions；但三者都还不应被夸大成成熟的 hosted 或最终用户前台
- 四个仓已经不再处于同一条 `Hermes-Agent` 集成阶段线上：`Med Auto Grant` 已切到真实 runtime substrate，`Med Auto Science` 已打通 external runtime bring-up，`RedCube AI` 已把 route / managed execution 收口到本地 `Codex CLI` host-agent runtime，同时落下 repo-verified product-entry federation，而 `OPL` 继续只持有顶层 gateway / federation 语言，同时开始持有 family-level 的本地入口壳

目标产品链路应是：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Adapter -> Domain Gateway -> Domain Harness OS`

但这条顶层链路只解决了一半问题。
业务仓不能长期只是“内部 runtime surface”。
更完整的家族级目标结构应是：

- 顶层：`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Product Entry / Domain Gateway`
- 单仓：`User -> Domain Product Entry -> Domain Gateway -> Hermes Kernel -> Domain Harness OS`

也就是说，`OPL` 要成为 family-level 的 direct entry，而每个业务仓也都要拥有自己的 lightweight direct entry，服务那些已经明确知道自己要做研究、基金申请或视觉交付的用户。

这次在本仓实际落下的是这个目标的第一版本地入口壳：

- `opl`
  - 直接进入 `OPL Front Desk`；在交互环境下会种入并恢复 Hermes 会话
- `opl "<request...>"`
  - 把自然语言请求直接作为 routed quick ask 处理，不必显式写 `ask`
- `opl start --project <project_id> [--mode <mode_id>]`
  - 解析某个 admitted domain 的 `product_entry_start` surface，并在 handoff 前直接给出推荐模式、可选模式、resume surface 与 human gate 摘要
- `opl doctor`
  - 检查本地 product-entry shell、Hermes kernel 可见性与 gateway service 就绪度
- `opl ask "<request...>"`
  - 先经 `OPL` 做顶层路由，生成 handoff prompt，再执行一次 Hermes 单轮查询
- `opl chat "<request...>"`
  - 先由 `OPL` 预热并种入一条 Hermes 会话，再切进交互式会话继续工作
- `opl resume <session_id>`
  - 恢复一个已存在的 Hermes-backed OPL 会话
- `opl sessions`、`opl logs`、`opl repair-hermes-gateway`
  - 暴露这层本地 shell 的 machine-readable 会话与 runtime 运维界面
- `opl session-ledger`
  - 查看由 `OPL` 记录的会话事件，以及事件发生时采集到的诚实资源样本
- `opl handoff-envelope`
  - 生成机器可读的 family handoff bundle，把 `OPL Front Desk` 和 domain direct entry / domain gateway 接起来
- `opl frontdesk-service-install|status|start|stop|open|uninstall`
  - 安装并管理 launchd 驱动的本地 OPL web front desk，让浏览器入口可以长期运行，而不需要人工盯着终端
- `opl frontdesk-manifest`
  - 暴露 hosted-friendly front desk contract，给后续 web 壳接入使用，同时保持 hosted 包装状态描述诚实
- `opl frontdesk-hosted-bundle`
  - 冻结 hosted-pilot-ready shell bundle，包括 base-path-aware 的入口与 API 端点，但不把它写成实际 hosted runtime
- `opl frontdesk-hosted-package`
  - 导出可自托管的 hosted pilot package，包含 app snapshot、启动脚本、env 模板、`systemd` unit、service-install / healthcheck helper 与反向代理资产，但不把它写成 actual hosted runtime
- `opl frontdesk-librechat-package`
  - 导出真实的 LibreChat-first hosted shell pilot package，把 OPL front-desk package、同源反向代理资产与 LibreChat 部署文件打包到一起，同时保持 managed hosted runtime 的表述诚实
- `opl projects`
  - 列出当前经由 `OPL` 暴露的 family-level 项目面
- `opl workspace-status`
  - 检查某个 workspace 路径的 git / worktree / 文件可见性状态
- `opl workspace-catalog`
  - 查看 `OPL` 与 admitted domain 项目面的 file-backed workspace registry
- `opl domain-manifests`
  - 解析当前 active 的 admitted-domain `manifest_command` 绑定，并输出 machine-readable 的 product-entry discovery surface，其中也包含 `product_entry_start`
- `opl workspace-bind|activate|archive`
  - binding 现在还可携带 routed domain workspace 对应的 `manifest_command`
  - 管理项目 workspace 绑定与可选 direct-entry locator，让顶层 handoff 保持机器可读且不编故事
- `opl runtime-status`
  - 输出 Hermes runtime 健康、最近会话与 runtime-level 进程资源占用
- `opl dashboard`
  - 把 front desk、projects、workspace、workspace catalog、resolved domain manifests、session ledger 与 runtime 汇总成当前顶层管理视图
  - 这是 operator/debug aggregate surface，不再作为 GUI / shell 默认 discovery 起点
- `opl web`
  - 启动本地 web front desk pilot，让用户直接在浏览器里进入 OPL、解析某个 routed domain 的 `product_entry_start`、发起 quick ask、绑定 workspace、查看 managed session ledger、检查 resolved domain manifests、导出可自托管的 frontdesk package 与 LibreChat-first hosted shell pilot package，并消费 hosted-friendly `health / manifest / domain-manifests / hosted-bundle / hosted-package / librechat-package / start / sessions / resume / logs / handoff-envelope` API

这层新入口壳并不会抹掉现有的 `Phase 1` gateway contract。
只读 gateway 命令仍然是联邦真相面的稳定 formal surface。
新的 product-entry shell 是叠在这层 formal gateway contract 之上的第一层用户入口。

这次已经冻结的集成选择是：

- 不把 `Hermes-Agent` kernel 代码 fork / vendor 进 `OPL` 自己长期维护
- 不要求用户先手工安装并理解 `Hermes-Agent`，再来使用 `OPL`
- 让 `Hermes-Agent` 继续作为 external kernel，而 `OPL` 负责面向产品的 bootstrap、launcher、version pinning、runtime wiring 与用户入口

这条路线的固定简称是：

- `external kernel, managed by OPL product packaging`

对本地开源版来说，这意味着应由 `OPL` 为用户 provision 并管理一个受支持的 `Hermes` runtime，而不是把 runtime 拼装工作甩给用户。
对未来托管版来说，这意味着平台内部运行 `Hermes` kernel，而用户只直接面对 `OPL` 的入口。
因此，`Codex` 继续只是开发宿主和本地 operator brain，而不是未来产品的前置条件。
同样的逻辑，后续也应在各个 admitted domain 仓里落成各自轻量的 direct entry，而不是长期停留在“只能被 `Codex` 调用”的状态。

如果要看 fork / 用户自管安装 / 托管式外部 kernel 集成三种方案的完整对比，见 [OPL 产品入口与 Hermes Kernel Integration 决策](docs/references/opl-product-entry-and-hermes-kernel-integration.md)。
如果要看四仓家族层面的入口栈与 `OPL -> domain` handoff 架构，见 [OPL 家族产品入口与 Domain Handoff 架构](docs/references/family-product-entry-and-domain-handoff-architecture.md)。
如果要看 hosted / web 前台为什么优先选 `LibreChat-first` 而不是 `Chatbot UI`，见 [OPL Hosted / Web Front Desk 选型基准](docs/references/opl-hosted-web-frontdesk-benchmark.md)。
如果要看 `OPL` 与三个业务仓的 lightweight direct entry 后续该按什么顺序推进，见 [Family Lightweight Direct Entry 推进板](docs/references/family-lightweight-direct-entry-rollout-board.md)。
如果要看 front desk 这条线当前已经落了什么、还缺什么，见 [OPL Front Desk 落地推进板](docs/references/opl-frontdesk-delivery-board.md)。

## 统一执行范式

`OPL` 顶层默认采用 `Agent-first` 的执行范式。
Agent 是默认执行者：它负责读状态、调用稳定 gateway、编排步骤、组织中间产物，并把关键执行痕迹写回可审计表面；代码则负责提供稳定对象、控制器、工具封装、门控规则与交付表面。

当前活跃的开发宿主是 Codex-only 本地会话：规划、实现、验证与评审都继续通过标准 Codex 会话完成。
但这不等于 `OPL` 的产品 runtime 真相就是 Codex。
在产品/runtime 这一层，优选的未来 substrate 方向，仍然是先在某个 domain 仓里诚实证明真实的上游 `Hermes-Agent` 集成；`OPL` 自身继续只停留在顶层 gateway 与 federation 层。
当这条方向真正落地时，优选的集成方式仍然是 `external kernel, managed by OPL product packaging`，而不是长期 fork，也不是把安装负担留给用户。

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
当前活跃执行入口仍是 Codex-only 开发宿主，而优选的未来 substrate 方向仍是上游 `Hermes-Agent` 集成。
这个顶层表面继续把执行可见性、审计与交付语义保持对齐，而不是把 `OPL` 抬升成 runtime owner。

`OPL` 之下共享的上位架构语言是 `Unified Harness Engineering Substrate`。其中当前最重要的共享部分，正在收敛为 [Shared Runtime Contract](./docs/shared-runtime-contract.zh-CN.md) 和 [Shared Domain Contract](./docs/shared-domain-contract.zh-CN.md)。
共享运行层、托管入口与任何真实的 `Hermes-Agent` 落地进度，仍在各自仓与合同中推进。

当前公开主线继续保留已 absorbed 的 `Phase 1 / G2 release-closeout` 口径，而 repo-tracked formal entry 仍是 `TypeScript CLI`-first / read-only gateway surface。
当前 `Phase 2 / Minimal admitted-domain federation activation package` 只覆盖两个已 admitted domain surface：`MedAutoScience` 与 `RedCube AI`。
`Grant Foundry -> Med Auto Grant` 仍是活跃的医学 `Grant Ops` 业务仓路径，但顶层 federation admission / handoff wording 继续在 `OPL` 单独门控。

`OPL` 现在已经有了本地 direct product-entry shell，默认入口是 `opl`，同时也有本地 web front desk pilot。
它采用 `external kernel, managed by OPL product packaging`，不要求用户先手工安装并理解 `Hermes-Agent`。
`opl "<request...>"` 是快速自然语言入口，当前产品入口表面包括 `opl doctor`、`opl ask`、`opl chat`、`opl resume`、`opl sessions`、`opl logs`、`opl repair-hermes-gateway` 与 `opl web`。
hosted pilot 已经存在，但 managed hosted runtime 仍未落地。

当前顶层已落地的入口表面因此包括本地 `opl` shell 和本地 web front desk pilot。
当前家族级管理面包括 `workspace-catalog`、`workspace-bind|activate|archive`、`domain-manifests`、`session-ledger` 与 `dashboard`。
`workspace-bind` 现在也支持从结构化 workspace locator 自动推出 family `entry_command` 与 `manifest_command`，例如 `--profile`、`--input` 与 `--workspace-root`，不再要求所有项目都手写原始命令串。

当前目标家族链路是：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Product Entry / Domain Gateway`

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
