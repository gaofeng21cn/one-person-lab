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

## 当前十模块完成度

严格按 Workspace 级模块完成度口径，`L4 baseline` 要求模块自己有可执行 surface：对象模型、schema/contract、模块级 CLI family、App/read-model、validate、doctor、interfaces、测试和状态文档。当前实现分两层：

- `contracts/opl-framework/brand-module-registry.json` 与 `opl brand-modules ...` 是当前品牌模块目录和成熟度总览。
- `contracts/opl-framework/brand-module-surfaces.json` 与 `opl <module> status|inspect|interfaces|validate|doctor --json` 是每个模块自身的 L4 executable surface。
- `contracts/opl-framework/brand-system-profile.json` 是跨品牌模块的品牌系统冻结基线，负责三层产品认知、品牌模块 product grammar、Foundry Agent 命名、App 状态语言、design-token/icon/card/status pattern、receipt/blocker 文案规则和 false-authority boundary。

因此，当前不再以 `brand-modules inspect` 作为模块完成的唯一依据；每个模块都必须能通过自己的 `validate` / `doctor` 输出验收。

| 模块 | 当前完成度 | 相对 Workspace | 判断 |
| --- | --- | --- | --- |
| `OPL Charter` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.charter`、`opl charter status|inspect|interfaces|validate|doctor --json`，并补 `authority|terms|decisions` 对象视图；证明 Charter governance surface 可独立读、验、诊断。 |
| `OPL Atlas` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.atlas`、`opl atlas status|inspect|interfaces|validate|doctor --json`，并补 `list|surfaces|graph|lifecycle` 对象视图；底层 descriptors/actions/stages/tool-cards/conformance 仍作为 Atlas 输入 refs。 |
| `OPL Workspace` | `L4_structural_baseline` | 基线 | 保持 Workspace topology/schema、`workspace ensure/init/validate/doctor/adopt/interfaces`、App action、tests 和 docs/status foldback；新增 `opl workspace status|inspect --json` 作为品牌模块 status/inspect read-model，不覆盖原有 workspace validate/doctor/interfaces。 |
| `OPL Pack` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.pack`、`opl pack status|inspect|interfaces|validate|doctor --json`，并补 `domain-packs|authority-abi|generated-surfaces|compiler` 对象视图；Agent Tool Arsenal / Capability Invocation OS 归 Pack 的 ABI 边界，Pack 只定义 domain pack / capability invocation ABI / authority ABI / generated-surface input 和 compiler read-model，不替 domain owner 生成 handler、owner receipt、typed blocker、current-owner authorization 或 quality verdict。 |
| `OPL Stagecraft` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.stagecraft`、`opl stagecraft status|inspect|interfaces|validate|doctor --json`，并补 `stages|graph|receipts|blockers` 对象视图；StageRun/cognitive kernel/capability use policy/receipt/blocker refs 保持 refs-only。 |
| `OPL Runway` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.runway`、`opl runway status|inspect|interfaces|validate|doctor --json`，并补 `queue|attempts|provider|blockers` 对象视图；Temporal/provider/worker lifecycle/readiness、SLO repair 和 attempt refs 仍不等于 production long-soak 或 domain ready。 |
| `OPL Vault` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.vault`、`opl vault status|inspect|interfaces|validate|doctor --json`，并补 `evidence|artifacts|receipts|lineage` 对象视图；Vault 只持有 refs-only evidence/lineage/read-model，不读取 body。 |
| `OPL Console` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.console`、`opl console status|inspect|interfaces|validate|doctor --json`，并补 `actions|read-model|drilldown` 对象视图；本仓只证明 App state/action/invocation-plan projection producer，不声明 App GUI release truth、owner answer 或 domain readiness。 |
| `OPL Foundry Lab` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.foundry-lab`、`opl foundry-lab status|inspect|interfaces|validate|doctor --json`，并补 `blueprints|work-orders|conformance|promotions` 对象视图；不替 target domain owner 签 acceptance。 |
| `OPL Connect` | `L4_structural_baseline` | 达到 Workspace 结构基线 | 已有 `brand-module-surfaces.json#modules.connect`、`opl connect status|inspect|interfaces|validate|doctor --json`，并补 `descriptors|packages|channels|drift` 对象视图；MCP/OpenAI/AI SDK/Skill/ToolResultEnvelope descriptor、transport/install success 与 semantic authority 分开。 |

## L5 规划

当前没有模块声明 `L5 production operating maturity`。本仓已新增 `contracts/opl-framework/brand-module-l5-operating-evidence.json`、对应 CLI/read-model 和 `opl runtime brand-module-l5-evidence record|verify|list --json` refs-only ledger，把 L5 证据门变成可执行 surface；它只记录每个模块需要关闭的 evidence class、owner route、accepted ref shape、ledger command refs 和 false-authority policy。当前 contract-tracked owner-evidence refs 已覆盖 `current_owner_delta_default_read`、`domain_authority_false_boundary`、`no_second_truth_regression` 和 `pack_compile_parity` 四类 requirement，并为每个模块的 `owner_acceptance` 记录 owner-needed typed blocker refs；这些 refs 只让 `l5-status` 和 `framework operating-maturity` 可以消费当前证据，不关闭 L5。L5 不是再补一层文档，而是把模块变成可持续运营能力：

- `Charter`: 术语、ADR/RFC、authority matrix 和 supersession 机制能持续约束新模块、新 surface 与旧路线退役。
- `Atlas`: agent / capability / surface / owner catalog 能被 CLI、App、conformance、release 和 operator drilldown 同源消费。
- `Workspace`: 真实 MAS/MAG/RCA/OMA 用户项目能长期通过 workspace ensure/adopt/validate/doctor/upgrade/export-map 跑通，并留下 owner acceptance 或 typed blocker。
- `Pack`: domain pack / authority ABI / generated-surface input / pack compiler drift gate 能在 MAS/MAG/RCA/OMA 和新 Foundry Agents 中长期生成、验证、修复并获得 domain owner acceptance。
- `Stagecraft`: 多个真实 domain stage 持续产出独立 quality gate、owner receipt、typed blocker 或 route-back evidence。
- `Runway`: Temporal-backed durable orchestration、Runway worker lifecycle/readiness surface、部署 substrate、queue、lease、retry/dead-letter、human gate 和 recovery 在长窗口内稳定承接真实 owner chain。
- `Vault`: memory/artifact/lifecycle/restore/no-regression receipts 在多个 domain 中形成 body-free、可验证、可回放的运营 ledger。
- `Console`: App 普通用户路径有同 cohort release/user-path evidence，能稳定展示 current owner、accepted answer shape、artifact/blocker 和 repair loop。
- `Foundry Lab`: agent improvement loop 能从 evidence -> work order -> canary -> promotion/rollback -> owner acceptance 持续闭环。
- `Connect`: CLI/MCP/Skill/OpenAI/AI SDK/App/release/install surfaces 从同一 contract 派生，并有 drift matrix、release evidence 和安装证据。

## 当前机器验收

聚合目录验收入口：

```text
opl brand-modules list --json
opl brand-modules inspect --module charter --json
opl brand-modules maturity --json
opl brand-modules validate --json
opl brand-modules interfaces --json
opl brand-modules l5-status --json
opl brand-modules l5-status --module runway --json
opl brand-modules l5-validate --json
opl brand-modules l5-interfaces --json
opl runtime brand-module-l5-evidence record --payload '{"module_id":"runway","evidence_class_id":"long_soak_recovery","evidence_refs":["long-soak:runway/demo"]}' --json
opl runtime brand-module-l5-evidence verify --receipt-ref <receipt_ref> --json
opl runtime brand-module-l5-evidence list --module runway --class long_soak_recovery --json
opl contract validate --json
```

模块自身 L4 验收入口：

```text
opl charter status|inspect|interfaces|validate|doctor --json
opl atlas status|inspect|interfaces|validate|doctor --json
opl workspace status|inspect --json
opl workspace interfaces --json
opl pack status|inspect|interfaces|validate|doctor --json
opl stagecraft status|inspect|interfaces|validate|doctor --json
opl runway status|inspect|interfaces|validate|doctor --json
opl vault status|inspect|interfaces|validate|doctor --json
opl console status|inspect|interfaces|validate|doctor --json
opl foundry-lab status|inspect|interfaces|validate|doctor --json
opl connect status|inspect|interfaces|validate|doctor --json
```

模块自身 L5 evidence 读面：

```text
opl charter l5-status --json
opl atlas l5-status --json
opl workspace l5-status --json
opl pack l5-status --json
opl stagecraft l5-status --json
opl runway l5-status --json
opl vault l5-status --json
opl console l5-status --json
opl foundry-lab l5-status --json
opl connect l5-status --json
```

`runtime brand-module-l5-evidence` 是 evidence intake/read-model，不是 completion command。它只把外部真实用户路径、long-soak、release/install、owner acceptance、no-regression 或 typed blocker refs 记录到本地 OPL state ledger，再让 `l5-status` 显示 observed / verified counts；它不能创建 owner receipt / typed blocker，不能写 domain truth，不能把 verified receipt 升级成 L5。

Contract-tracked `evidence_refs` / `blocker_refs` 与 runtime ledger 一样是 refs-only input。它们可以把 requirement route 从 `owner_route_evidence_missing` 推到 `owner_evidence_observed_not_l5_claimed` 或 `owner_typed_blocker_recorded`，但不改变 `l5_can_be_claimed=false`、不减少模块级 `evidence_required_module_count=10`，也不授权 `production_ready`。

品牌系统冻结基线验收入口：

```text
contracts/opl-framework/brand-system-profile.json
opl contract validate --json
node --experimental-strip-types --test tests/src/cli/cases/brand-modules.test.ts
```

对象视图入口示例：

```text
opl charter authority --json
opl charter terms --json
opl atlas graph --json
opl atlas lifecycle --json
opl pack domain-packs --json
opl pack authority-abi --json
opl stagecraft receipts --json
opl runway queue --json
opl vault evidence --json
opl console actions --json
opl foundry-lab blueprints --json
opl connect drift --json
```

focused 测试入口：

```text
node --experimental-strip-types --test tests/src/cli/cases/brand-modules.test.ts
npm run test:fast
npm run typecheck
```

## Forbidden Claims

- 品牌模块进入统一 registry 只能证明目录层存在；模块级 L4 必须以 `brand-module-surfaces.json` 和各自 `opl <module> validate|doctor --json` 为证据。
- `brand-system-profile.json` 只冻结品牌系统语言、命名和视觉/status pattern；不能把产品 grammar 一致性写成 L5、App release ready、domain ready、quality verdict、artifact authority、owner receipt 或 typed blocker。
- 任何模块 `L4_structural_baseline` 不等于 MAS/MAG/RCA/OMA domain ready。
- `brand-module-l5-operating-evidence.json`、`opl brand-modules l5-validate --json`、`opl <module> l5-status --json` 和 `opl runtime brand-module-l5-evidence verify --json` 只能证明 L5 证据矩阵存在、形状有效、refs transport 可记录/验证和当前 open/blocked/satisfied 状态；不能单独声明 L5。
- 任何模块的 `L5` 都不能由 docs foldback、contract validation、conformance pass、provider completion、verified ledger 或 App projection 单独声明。
- `Stagecraft L4` 不等于 quality gate 全部真实闭合。
- `Runway L4` 不等于 production long-soak complete。
- `Vault L4` 不等于 artifact/memory body authority 已迁给 OPL。
- `Console L4` 不等于 App release ready。
- `Connect L4` 不等于所有安装/分发路径已有真实 release/install evidence。
