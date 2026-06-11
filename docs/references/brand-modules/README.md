# OPL 品牌模块理想态

Owner: `One Person Lab`
Purpose: `brand_module_ideal_state_index`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App release/user-path evidence 和真实 workspace evidence。

## 读法

本文把 OPL 理想态拆成一组品牌化模块。它回答三个问题：

- 顶层设计应该分成哪些高内聚、低耦合的部分。
- 每个部分的品牌名、设计理念、核心对象和边界是什么。
- 这些模块如何服务维护、使用、持续开发和后续重构。

本文不冻结当前完成度、receipt id、worklist 计数、branch、worktree 或 release 证据。当前事实继续回到 `docs/status.md`、`docs/active/current-state-vs-ideal-gap.md` 和 fresh CLI/read-model。

当前品牌系统冻结基线归 `contracts/opl-framework/brand-system-profile.json`。它把三层产品认知、品牌模块 product grammar、Foundry Agent 命名、App 状态语言、design-token/icon/card/status pattern，以及 receipt/blocker 文案规则落成机器可读 contract；该 contract 只约束品牌系统语言和 pattern，不声明 L5、domain ready、quality verdict、artifact authority、App release ready 或 production ready。

## 外部经验吸收

OPL 借鉴的是成熟工程的分层原则，不引入外部 runtime dependency 或第二真相源：

- Kubernetes Operator pattern：用声明式对象、status 和 control loop 管理长生命周期系统。
- Temporal durable execution：把 workflow history、task queue、timer、恢复、重试和 timeout 交给 durable substrate；worker process/service lifecycle 仍归 OPL Runway 和部署 substrate，业务判断留给 owner。
- Backstage Software Catalog：用 catalog 维护 owner、metadata、entity graph 和 discoverability。
- DDD bounded context：每个上下文有自己的语言、owner 和边界，跨上下文只走显式接口。
- Dagster software-defined assets：把产物、lineage、materialization 和观测状态作为一等资产。
- OpenAPI / MCP：外部调用面从机器可读描述派生，prose 不做接口真相。
- ADR：关键架构决策要留下原因、取舍和 supersession 关系。

## 当前十个品牌模块

| 模块 | 品牌一句话 | 默认 owner |
| --- | --- | --- |
| [OPL Charter](./charter.md) | 顶层宪章、命名、边界、ADR/RFC 和品牌组合治理。 | OPL Framework |
| [OPL Atlas](./atlas.md) | Agent、capability、tool-card、surface、owner、dependency 和 lifecycle catalog。 | OPL Framework |
| [OPL Workspace](./workspace.md) | 用户项目空间、共享素材、stage outputs、handoff 和可检查文件结构。 | OPL Framework + domain workspace owner |
| [OPL Pack](./pack.md) | Declarative Domain Pack、Capability Invocation ABI、authority ABI、pack compiler、generated/hosted surfaces 和 standard authority functions。 | OPL Framework + Foundry Agent owners |
| [OPL Stagecraft](./stagecraft.md) | Stage 设计、认知计算、capability use policy、tool affordance、quality gate 和 handoff。 | OPL Framework + Foundry Agent |
| [OPL Runway](./runway.md) | Durable execution、typed queue、lease、retry/dead-letter、wakeup 和 human gate。 | OPL Framework |
| [OPL Vault](./vault.md) | Evidence、receipt、typed blocker、artifact lineage、restore/provenance 和 refs-only ledger。 | OPL Framework + domain authority owner |
| [OPL Console](./console.md) | App/operator 工作台、current owner、invocation plan、next action、阻塞、产物和 drilldown。 | One Person Lab App |
| [OPL Foundry Lab](./foundry-lab.md) | Agent 创建、测试接管、机制改进、canary、promotion 和 rollback。 | OPL Framework + OPL Meta Agent |
| [OPL Connect](./connect.md) | CLI、MCP、OpenAI/AI SDK tools、ToolResultEnvelope descriptor、Skill/plugin、release/install 分发。 | OPL Framework + App release owner |

## 模块关系

```text
OPL Charter
  -> OPL Atlas
  -> OPL Workspace
  -> OPL Pack
  -> OPL Stagecraft
  -> OPL Runway
  -> OPL Vault
  -> OPL Console
  -> OPL Foundry Lab
  -> OPL Connect
```

更具体地说：

- `Charter` 冻结语言、设计原则、ADR/RFC 和品牌组合边界。
- `Atlas` 是可发现目录和 tool-card catalog，不执行、不签 receipt、不拥有 domain truth。
- `Workspace` 是用户和 Agent 共同检查文件的默认落点。
- `Pack` 固定 domain pack、Capability Invocation ABI、authority ABI、pack compiler 和 generated-surface 输入，不接管 domain handler 或 owner verdict。
- `Stagecraft` 是 stage 内认知工作设计和 capability use policy，不承担 durable runtime。
- `Runway` 只负责把 stage attempt 跑起来、恢复和收口，不创建 domain verdict。
- `Vault` 只保存 refs、receipt、blocker、lineage 和 provenance，不保存 memory/artifact body。
- `Console` 只消费 projection 和 invocation plan，不成为第二 runtime 或第二 domain truth。
- `Foundry Lab` 只改进 agent 机制和生成 work order，不接管 domain authority。
- `Connect` 只把同一合同投给不同外部调用面，不重新解释语义或把 tool result envelope 写成 authority outcome。

Agent Tool Arsenal / Capability Invocation OS 不新增品牌模块。它以 `OPL Pack` 为 ABI owner，`Atlas`、`Stagecraft`、`Console`、`Connect` 分别消费 catalog、use-policy、current-owner projection 和 descriptor/export 边界；`Runway` / `Vault` 只承运执行与 refs evidence。

## 当前完成度对照

以 `OPL Workspace` 为基线的现状评估见 [OPL 品牌模块完成度对照](./current-maturity-against-workspace.md)。

品牌系统冻结基线的机器入口：

```text
contracts/opl-framework/brand-system-profile.json
opl contract validate --json
node --experimental-strip-types --test tests/src/cli/cases/brand-modules.test.ts
```
