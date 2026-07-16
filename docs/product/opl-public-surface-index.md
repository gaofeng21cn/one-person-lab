# OPL 公开界面索引

Owner: `One Person Lab`
Purpose: `public_surface_index`
State: `active_support`
Machine boundary: 本文是人读 public surface 索引。机器可读 surface truth 继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和 App release/test evidence。

## 目的

这份文档索引当前 `OPL` 的权威公开界面。

当前主线是：

- `Codex-default concrete executor`
- `explicit activation layer`
- `provider-backed stage runtime`
- `stage attempt / stage-attempt request/projection / wakeup / receipt / recovery / projection`
- `shared modules / contracts / indexes`
- `family domain skill sync / discovery`
- `One Person Lab App` workbench / operator projection

`OPL` 已经不再把旧的 gateway/federation/routed-action 语料作为活跃合同或样例层。
那批语料只保留在 history/reference 页面中，用于 provenance 和设计复盘。

如果要看仓库级文档生命周期与参考级处理规则，请继续看 [文档索引](../README.md) 和 [文档组合治理](../docs_portfolio_consolidation.md)。

## 当前活跃界面

### 1. OPL 自己持有的 runtime 与 activation 界面

下面这些文档定义当前 `OPL` 主线：

- [仓库首页](../README.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [合同目录说明](../../contracts/README.md)

这些界面解释默认入口（`opl`、`opl exec`、`opl resume`）、当前资源模型（`workspaces / sessions / progress / artifacts`），以及“只有显式 domain activation 或 executor switch 才进入 OPL 增量语义”这条规则。
它们也把 `OPL Runtime Manager` 限定为已配置 provider-backed family runtime 之上的产品控制面，并把 stage-attempt request/projection、provider 诊断、Rust native helper / index 工作限定在产品调度、native assistance 与 indexed discovery。Temporal-backed provider 是 production online runtime 的必需 substrate；未安装、不可达或 worker 未 ready 都是平台 readiness blocker，需要通过安装、修复、监控和运维维护闭合。旧 Hermes provider/readiness/Gateway 语义已经退出 runtime provider、默认 substrate、readiness path、兼容 fallback 和 cron surface；`hermes_agent`、`claude_code` 与 `antigravity_cli` 是 canonical 显式非默认 executor adapter/backend，必须走独立 receipt、audit、executor binding ref 和 fail-closed gate。普通 Product Entry 与 session resume 保持 Codex-default 路径。

### 2. 已链接的 domain capability surface

这些 surface 由 `OPL` 索引，但 ownership 仍留在各自仓。当前机器 descriptor index 只把 MAS/MAG/RCA 作为已收录 domain capability surface 读取：

- `Med Auto Science`
- `Med Auto Grant`
- `RedCube AI`

`OPL` 通过 `opl connect sync-skills` 和各 domain 仓自己的 CLI / 程序 / 脚本 / contract surface 来发现并激活它们。
所以当前顶层集成单元其实是 repo-owned 的 domain app skill 及其底下的 command contract，而不是 OPL 自己再造一套 gateway handoff 词汇。

`One Person Lab App` 是工作台产品 surface，消费 framework/provider 状态和 domain-owned projection；它不持有 domain truth、runtime provider 或 artifact authority。Framework 侧把普通用户 App path 定义为 `Codex App wrapper`：固定 `Codex CLI` executor、内置 Foundry Agent 任务入口、通过 OPL `app state/action` 读取和执行，不把 AionUI upstream 多 backend、多 Agent 选择暴露为普通用户 product surface。当前 GUI 主线是 `one-person-lab-app` 通过 `shells/aionui` 消费的 OPL-branded AionUI shell；`opl-native-workbench` 是 App-owned foreground alternative；Hermes Desktop / `hermes-codex` 是 retained explicit reference candidate。AG-UI/CopilotKit / `agui-codex` 只作为 archived technical proof / explicit replay provenance 读取，除非用户明确要求 AGUI，不进入默认开发、验证、polish、release 或 adoption worklist。`OPL Meta Agent` 是 Agent engineering semantic provider，只通过 `engineer-agent` 公开承接创建、接管和改进请求，产出 `AgentBlueprint` / `EvalSpec` 或基于 `EvidenceBundle` 的 `EvolutionProposal`；它可以被 OPL managed environment 与 generated plugin surface 消费，但不执行评测、候选物化、版本、canary、activation 或 rollback，也不替 MAS/MAG/RCA、future domain 或 target owner 签发 quality/export verdict、artifact authority、owner receipt 或生产采用结论。

### 3. 共享边界配套界面

下面这些文档仍然活跃，但它们服务的是 shared-boundary 边界，而不是重新把公开主线拉回已退役的 gateway-first 路线：

- [共享运行时合同](../specs/shared-runtime-contract.md)
- [共享领域合同](../specs/shared-domain-contract.md)
- [OPL 运行时命名与边界合同](../runtime/opl-runtime-naming-and-boundary-contract.md)

旧 `Shared Foundation` / `Shared Foundation Ownership` 页面已吸收到 [OPL Family 开发主参考](../active/opl-family-development-reference.md) 与 [运行模型](../public/operating-model.md)；历史副本进入 [Shared Boundary 过程历史](../history/process/shared-boundary/README.md)。

## 历史来源材料

早期 gateway-first 阶段只作为历史来源材料保留：

- [Gateway / Federation 来源归档](../history/compatibility/gateway-federation/README.md)

这些 surface 不能再作为今天 `OPL` 的活跃实现、测试或机器可读合同输入。
历史 provenance、fixture 或负向 guard 可保留旧名，但必须明确为退役证据，不能再作为 provider fallback、readiness 路径、compatibility alias、facade、wrapper 或 active product surface 入口。

## 参考级配套材料

下面这些材料继续承担审核与追溯作用：

- [参考级索引](../references/README.md)
- [历史归档索引](../history/README.md)
- [Convergence Governance 过程归档](../history/process/convergence-governance/README.md)
- `docs/history/compatibility/` 下的退役 gateway/federation provenance

## 阅读规则

把这份索引理解成一张 **runtime/activation 地图**。

- 如果你要恢复当前 `OPL` 真相，先读核心工作集和 [合同目录说明](../../contracts/README.md)。
- 如果你要恢复当前跨仓集成单元，去读已收录 domain 仓及其 app skill surface；App 与 OPL Meta Agent 分别按 workbench product surface 和 Agent Foundry managed module 读取。
- 如果你要恢复当前 GUI 路线，先读 App 仓 active-shell contract / GUI candidate policy、`opl-aion-shell` 当前 shell 实现和 [GUI shell adapter 边界](../references/current-support/opl-gui-shell-adapter-boundary.md)；不要把 AGUI archived proof 当作 foreground candidate。
- 如果某份文档仍然把主语写成 `OPL Gateway`、`domain_gateway`、routed handoff payload 或 gateway-owned public-surface indexing，都应按历史来源材料理解。

## 完成定义

只有当下面这些条件都成立时，这份 public surface index 才算合格：

- 它把当前 `Codex-default executor + activation + provider-backed stage runtime + shared modules/contracts/indexes + skill sync` 主线讲清楚
- 它把 `One Person Lab App` 与 `OPL Meta Agent` 放回 workbench / managed module 角色，不把它们误写成 domain truth owner
- 它区分 OPL-owned 的 runtime/activation surface 与 repo-owned 的 domain capability surface
- 它明确标出旧 gateway/federation 语料已经退到 reference/provenance 层
- 它把保留的旧名限制在退役 provider 负向 guard、provenance 或历史 fixture 语境
- 它继续把 domain runtime truth、progress truth 与 artifact truth 放在对应 domain 仓自己名下
