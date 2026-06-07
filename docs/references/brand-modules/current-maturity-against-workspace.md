# OPL 品牌模块完成度对照

Owner: `One Person Lab`
Purpose: `brand_module_maturity_assessment`
State: `support_reference`
Machine boundary: 本文是人读现状对照。当前完成度、计数、receipt、release 和 runtime truth 继续以 fresh CLI/read-model、contracts、source、runtime ledger、provider receipt、domain-owned manifests、App release/user-path evidence 和真实 workspace evidence 为准。

## 读法

本文用 `OPL Workspace` 作为完成度基线。这里的完成度不是“理念是否清楚”，而是五个层次：

| 等级 | 定义 |
| --- | --- |
| `L5 production operating maturity` | 在 L4 基础上，具备真实用户路径、跨 agent scaleout、长跑/恢复 evidence、release/install evidence、运维闭环和 owner acceptance。 |
| `L4 baseline` | 像 Workspace 一样，已有品牌边界、schema/contract、CLI/App action、验证/doctor、docs foldback、测试和当前状态文档。 |
| `L3 structural` | 目标结构、contracts、read model 或 conformance 已比较完整，但仍缺用户路径、真实长跑或 domain owner evidence scaleout。 |
| `L2 emerging` | 已有局部 contracts、docs 或实现面，但品牌边界、接口集合、文档体系或验证门还不完整。 |
| `L1 conceptual` | 主要是理想态叙事或分散能力，尚未形成独立品牌模块。 |

## Workspace 基线

`OPL Workspace` 当前可作为 `L4 baseline`：它已经有 `workspace-topology-profile.schema.json`、`workspace-index.schema.json`、`agent-workspace-norm-contract.json`、`opl workspace ensure/init/validate/doctor/adopt/interfaces`、App `workspace_ensure/workspace_initialize/workspace_validate/workspace_doctor/workspace_adopt_dry_run` action、workspace diagnostics、tests 和 docs/status/architecture foldback。

它的关键特点是：

- 目标对象清楚：`Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker`。
- 用户检查面清楚：project root、shared resources、`artifacts/stage_outputs` 和 domain product views。
- 机器边界清楚：runtime-state 只做 provider backing/provenance，不替代 stage folder、owner receipt 或 typed blocker。
- 多 surface 同源：CLI/App/descriptor delegates 绑定到同一 command contract。

## 九模块完成度

当前九模块都已达到 `L4_structural_baseline`。这里的 L4 是 `Workspace` 水平的结构完成：品牌文档、机器注册表、CLI governance、module-owned CLI frontdoor、contract/policy refs、CLI/App/descriptor/validation/status refs、authority boundary 和 forbidden claims 已经同源落到 `contracts/opl-framework/brand-module-registry.json` 与 `contracts/opl-framework/brand-cli-governance.json`，并由 `opl <brand-module> status|inspect|interfaces|validate|doctor --json`、`opl brand-modules validate --json`、`opl agents modules validate --json` 与 `opl contract validate --json` 守门。

Workspace 有一个明确碰撞例外：`opl workspace status|inspect --json` 是新增品牌读面；`opl workspace validate|doctor|interfaces --json` 继续保持 workspace operational 语义。

| 模块 | 当前完成度 | 相对 Workspace | 判断 |
| --- | --- | --- | --- |
| `OPL Charter` | `L4_structural_baseline` | 达到 Workspace | 已有品牌文档、registry entry、surface-budget/registry refs、自有 `opl charter status|inspect|interfaces|validate|doctor` frontdoor、App/descriptor-only projection、validation 和 forbidden authority flags。 |
| `OPL Atlas` | `L4_structural_baseline` | 达到 Workspace | Domain descriptors、actions、stages、generated interfaces 与 conformance 已折入品牌 registry、自有 `opl atlas *` frontdoor 和 aggregate inspection surface。 |
| `OPL Workspace` | `L4_structural_baseline` | 基线 | 保持 Workspace topology/schema、CLI/App action、validation/doctor、interfaces 和 docs/status foldback。 |
| `OPL Stagecraft` | `L4_structural_baseline` | 达到 Workspace | StageRun/cognitive kernel/stage manifest/receipt/blocker refs 已折入 registry、自有 `opl stagecraft *` frontdoor、descriptor 和 validation gates。 |
| `OPL Runway` | `L4_structural_baseline` | 达到 Workspace | Runtime manager、Temporal orchestration refs、worker lifecycle/readiness surface、typed queue、attempt ledger、provider SLO health/repair refs 已折入 registry、自有 `opl runway *` frontdoor、operator projection 和 validation gates。 |
| `OPL Vault` | `L4_structural_baseline` | 达到 Workspace | Evidence vault、state index、stage artifact runtime、receipt/blocker refs 已折入 registry、自有 `opl vault *` frontdoor、operator projection 和 validation gates。 |
| `OPL Console` | `L4_structural_baseline` | 达到 Workspace | App state/action、current owner delta、operator projection 与 safe action shell 已作为 Console refs-only module surface 登记，并有自有 `opl console *` frontdoor。 |
| `OPL Foundry Lab` | `L4_structural_baseline` | 达到 Workspace | Agent Lab、Foundry Agent series、scaffold/conformance/readiness/default-caller refs 已作为 Lab module surface 登记，并有自有 `opl foundry-lab *` frontdoor。 |
| `OPL Connect` | `L4_structural_baseline` | 达到 Workspace | CLI/Skill/module/package/generated interface/release discipline refs 已作为 Connect descriptor/distribution surface 登记，并有自有 `opl connect status|inspect|interfaces|validate|doctor` frontdoor。 |

## L5 规划

当前没有模块声明 `L5 production operating maturity`。L5 不是再补一层文档，而是把模块变成可持续运营能力：

- `Charter`: 术语、ADR/RFC、authority matrix 和 supersession 机制能持续约束新模块、新 surface 与旧路线退役。
- `Atlas`: agent / capability / surface / owner catalog 能被 CLI、App、conformance、release 和 operator drilldown 同源消费。
- `Workspace`: 真实 MAS/MAG/RCA/OMA 用户项目能长期通过 workspace ensure/adopt/validate/doctor/upgrade/export-map 跑通，并留下 owner acceptance 或 typed blocker。
- `Stagecraft`: 多个真实 domain stage 持续产出独立 quality gate、owner receipt、typed blocker 或 route-back evidence。
- `Runway`: Temporal-backed durable orchestration、Runway worker lifecycle/readiness surface、部署 substrate、queue、lease、retry/dead-letter、human gate 和 recovery 在长窗口内稳定承接真实 owner chain。
- `Vault`: memory/artifact/lifecycle/restore/no-regression receipts 在多个 domain 中形成 body-free、可验证、可回放的运营 ledger。
- `Console`: App 普通用户路径有同 cohort release/user-path evidence，能稳定展示 current owner、accepted answer shape、artifact/blocker 和 repair loop。
- `Foundry Lab`: agent improvement loop 能从 evidence -> work order -> canary -> promotion/rollback -> owner acceptance 持续闭环。
- `Connect`: CLI/MCP/Skill/OpenAI/AI SDK/App/release/install surfaces 从同一 contract 派生，并有 drift matrix、release evidence 和安装证据。

## 当前机器验收

当前验收入口：

```text
opl brand-modules list --json
opl brand-modules inspect --module workspace --json
opl brand-modules maturity --json
opl brand-modules validate --json
opl brand-modules interfaces --json
opl charter status --json
opl atlas inspect --json
opl stagecraft interfaces --json
opl runway doctor --json
opl vault validate --json
opl console status --json
opl foundry-lab inspect --json
opl connect interfaces --json
opl agents modules list --json
opl agents modules validate --json
opl contract validate --json
```

`opl brand-modules maturity --json` 当前应读为 `module_count=9`、`l4_structural_baseline_count=9`、`below_baseline_module_ids=[]`。

详细 rollout 和并行写集见 [OPL 品牌模块 L4 一步到位计划](../../active/brand-module-l4-rollout-plan.md)。

## Forbidden Claims

- 九模块 `L4_structural_baseline` 不等于 MAS/MAG/RCA/OMA domain ready。
- 任何模块的 `L5` 都不能由 docs foldback、conformance pass、provider completion、verified ledger 或 App projection 单独声明。
- `Stagecraft L4` 不等于 quality gate 全部真实闭合。
- `Runway L4` 不等于 production long-soak complete。
- `Vault L4` 不等于 artifact/memory body authority 已迁给 OPL。
- `Console L4` 不等于 App release ready。
- `Connect L4` 不等于所有安装/分发路径已有真实 release/install evidence。
