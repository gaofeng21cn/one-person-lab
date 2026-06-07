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

| 模块 | 当前完成度 | 相对 Workspace | 判断 |
| --- | --- | --- | --- |
| `OPL Charter` | `L2 emerging` | 低于 Workspace | 核心五件套、docs lifecycle、invariants、decisions 已经很强，但还没有独立 `brand_module_registry`、authority matrix 和 term lifecycle contract。 |
| `OPL Atlas` | `L3 structural` | 略低于 Workspace | Domain descriptor、action catalog、stage control plane、generated interfaces、conformance 已形成结构，但还没有统一品牌化 `atlas` command/doc/graph 入口。 |
| `OPL Workspace` | `L4 baseline` | 基线 | 当前九模块里最接近“品牌 + 合同 + CLI/App + 验证 + docs”的完整形态。 |
| `OPL Stagecraft` | `L3 structural` | 略低于 Workspace | Cognitive kernel、tool affordance、stage pack、stage admission 和 StageRun 设计已较成熟；真实 independent quality gate / domain owner receipt scaleout 仍是证据尾项。 |
| `OPL Runway` | `L3 structural` | 略低于 Workspace | Runtime Manager、Temporal provider、typed queue、attempt ledger、authorization、blocker projection 已成型；生产 long-soak、provider-hosted owner-chain evidence 和 App/user-path 证据仍开放。 |
| `OPL Vault` | `L3 structural` | 略低于 Workspace | Evidence ledger、receipt/blocker refs、state index、artifact lineage/read-model 已强；统一 `vault` 品牌入口和 domain-scale artifact/memory/lifecycle receipts 还未像 Workspace 一样收束。 |
| `OPL Console` | `L2 emerging` | 低于 Workspace | App/operator projection、current owner delta、safe actions、workspace actions 已有；GUI product truth 和 release/user-path evidence 在 App 仓，当前 latest release evidence 不能与 Workspace 的结构基线等价。 |
| `OPL Foundry Lab` | `L2 emerging` | 低于 Workspace | Agent Lab、developer work order、risk-tier promotion、OMA 支撑已存在；品牌模块、用户可见路径、跨 agent scaleout evidence 和独立 Lab 文档体系仍不完整。 |
| `OPL Connect` | `L2 emerging` | 低于 Workspace | Pack compiler、interfaces、skill sync、module install、release docs 已有；外部 surface 和 release/install evidence 分散，尚未形成统一 `Connect` 品牌和 drift/release matrix。 |

## L5 规划

当前没有模块声明 `L5 production operating maturity`。L5 不是再补一层文档，而是把模块变成可持续运营能力：

- `Charter`: 术语、ADR/RFC、authority matrix 和 supersession 机制能持续约束新模块、新 surface 与旧路线退役。
- `Atlas`: agent / capability / surface / owner catalog 能被 CLI、App、conformance、release 和 operator drilldown 同源消费。
- `Workspace`: 真实 MAS/MAG/RCA/OMA 用户项目能长期通过 workspace ensure/adopt/validate/doctor/upgrade/export-map 跑通，并留下 owner acceptance 或 typed blocker。
- `Stagecraft`: 多个真实 domain stage 持续产出独立 quality gate、owner receipt、typed blocker 或 route-back evidence。
- `Runway`: Temporal-backed provider、queue、lease、retry/dead-letter、human gate 和 recovery 在长窗口内稳定承接真实 owner chain。
- `Vault`: memory/artifact/lifecycle/restore/no-regression receipts 在多个 domain 中形成 body-free、可验证、可回放的运营 ledger。
- `Console`: App 普通用户路径有同 cohort release/user-path evidence，能稳定展示 current owner、accepted answer shape、artifact/blocker 和 repair loop。
- `Foundry Lab`: agent improvement loop 能从 evidence -> work order -> canary -> promotion/rollback -> owner acceptance 持续闭环。
- `Connect`: CLI/MCP/Skill/OpenAI/AI SDK/App/release/install surfaces 从同一 contract 派生，并有 drift matrix、release evidence 和安装证据。

## 优先级建议

第一优先级是把 `Charter` 和 `Atlas` 补到 `L3/L4`。原因是它们是顶层治理和目录真相，能降低后续模块维护成本：

- `Charter`: 增加品牌模块注册表、authority matrix、term lifecycle policy、ADR/RFC 模板。
- `Atlas`: 把 descriptors、actions、stages、interfaces、lifecycle state 收成统一 catalog graph 和 `opl atlas` 入口。

第二优先级是把 `Vault` 和 `Runway` 品牌化，而不是继续堆 runtime/evidence 细节：

- `Runway`: 将 provider、queue、attempt、lease、human gate、retry/dead-letter、runtime blocker 收成用户能理解的 durable run 模块。
- `Vault`: 将 evidence、receipt、typed blocker、artifact lineage、restore proof、no-regression 收成统一 record/verify/list 模块。

第三优先级是 `Console`、`Foundry Lab`、`Connect`：

- `Console` 需要 App release/user-path evidence 支撑，否则容易只有 projection 没有真实用户体验。
- `Foundry Lab` 需要更多真实 agent improvement loop 和 canary evidence。
- `Connect` 需要把 CLI/MCP/Skill/OpenAI/AI SDK/App/release 分发统一成 generated surface + drift manifest + install evidence matrix。

## Forbidden Claims

- `Workspace L4` 不等于 MAS/MAG/RCA/OMA domain ready。
- 任何模块的 `L5` 都不能由 docs foldback、conformance pass、provider completion、verified ledger 或 App projection 单独声明。
- `Stagecraft L3` 不等于 quality gate 全部真实闭合。
- `Runway L3` 不等于 production long-soak complete。
- `Vault L3` 不等于 artifact/memory body authority 已迁给 OPL。
- `Console L2` 不等于 App release ready。
- `Connect L2` 不等于所有安装/分发路径 ready。
