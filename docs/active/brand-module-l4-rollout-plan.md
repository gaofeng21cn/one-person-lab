# OPL 品牌模块 L4 一步到位计划

Owner: `One Person Lab`
Purpose: `brand_module_l4_rollout_plan`
State: `active_support`
Machine boundary: 本文是人读执行计划与验收矩阵。机器真相继续归 `contracts/opl-framework/brand-module-registry.json`、`contracts/opl-framework/brand-module-surfaces.json`、各模块 `opl <module> status|inspect|interfaces|validate|doctor --json`、`opl brand-modules * --json`、`opl contract validate`、source、测试、runtime ledger、provider receipt、domain-owned manifest 和真实 App/workspace evidence。

## 目标

把当前 OPL 品牌模块全部拉到 `OPL Workspace` 当前结构完成水平：每个模块至少具备品牌文档、机器注册表、自身 executable surface contract、对象模型、模块级 CLI family、App/operator 或 descriptor 面、validation/doctor 面、status/maturity foldback、authority boundary 和 forbidden claims。当前 registry 已扩展为十个模块，并新增 `OPL Pack` 承接 Domain Pack、Authority ABI、pack compiler 和 generated/hosted surfaces。

本目标只要求 `L4_structural_baseline`，不要求 production long-soak、真实 App release/user-path evidence、domain owner acceptance scaleout、artifact/export verdict 或 domain ready。

## 外部工程经验吸收

- `Catalog as source of metadata`: 采用类似 Backstage Software Catalog 的 owner/metadata/discoverability 思路，把当前品牌模块统一收进 `brand-module-registry.json`，再用 `brand-module-surfaces.json` 固定每个模块自己的 object model、CLI family、App/read-model descriptor、validation 和 doctor gates。
- `Maturity by gates`: 采用平台成熟度模型的维度化验收方式，用 L4 gates 判断结构完成度，避免用单一“ready”标签混淆设计完成、实现完成和生产证据。
- `Thinnest viable platform`: 每个品牌模块只暴露必要 self-service surface；domain truth、artifact body、quality verdict、owner receipt 和 production readiness 保持在对应 owner。

## 品牌模块验收门

每个模块必须同时满足：

| Gate | 验收口径 |
| --- | --- |
| `brand_doc_ref` | 有 `docs/references/brand-modules/<module>.md` 品牌文档。 |
| `registry_entry` | 有 `contracts/opl-framework/brand-module-registry.json#modules.<module>` 机器注册项。 |
| `contract_or_policy_ref` | 至少一个稳定 contract、schema 或 policy ref。 |
| `cli_surface_ref` | 必须有模块自身 `opl <module> status|inspect|interfaces|validate|doctor --json`；`opl brand-modules ...` 只作为聚合目录。 |
| `app_or_operator_surface_ref` | 至少一个 App/operator projection 或 descriptor-only App surface。 |
| `descriptor_surface_ref` | 至少一个 generated descriptor、delegate 或 registry descriptor ref。 |
| `validation_surface_ref` | 至少一个 validation/doctor/conformance/contract validate surface。 |
| `status_or_maturity_doc_ref` | 折回 maturity/status/active plan 文档。 |
| `authority_boundary` | false authority flags 完整，并由 contract validator 检查。 |
| `forbidden_claims` | 明确禁止把结构完成误读成 domain ready、quality verdict、artifact authority 或 production ready。 |

## 并行落地线

| Lane | 写集 | Source of truth | 停止条件 |
| --- | --- | --- | --- |
| `brand-core` | `contracts/opl-framework/brand-module-registry.json`、`src/brand-modules.ts`、CLI specs、contract loader、tests、active/maturity docs | Workspace L4 基线、品牌模块 ideal docs、contract validation | focused tests、typecheck、contract validate 通过。 |
| `brand-pack` | `docs/references/brand-modules/pack.md`、Pack CLI/help/status foldback、contracts README | `brand-module-surfaces.json#modules.pack`、domain pack compiler contract、standard skeleton contract | Pack 文档、CLI help、focused tests 和 contract validate 对齐当前十模块。 |
| `brand-charter-atlas` | `docs/references/brand-modules/charter.md`、`atlas.md` | Charter/Atlas 文档与 Workspace 文档 | 两模块文档包含 L4 refs、authority boundary、forbidden claims。 |
| `brand-runway-vault` | `docs/references/brand-modules/runway.md`、`vault.md` | Runway/Vault 文档与 Workspace 文档 | 两模块文档包含 L4 refs、authority boundary、forbidden claims。 |
| `brand-console-connect` | `docs/references/brand-modules/console.md`、`foundry-lab.md`、`connect.md` | Console/Foundry Lab/Connect 文档与 Workspace 文档 | 三模块文档包含 L4 refs、authority boundary、forbidden claims。 |

## 已落地结构

当前 L4 结构源分为目录层和模块层：

```text
contracts/opl-framework/brand-module-registry.json
  -> src/brand-modules.ts aggregate read model
  -> opl brand-modules list|inspect|maturity|validate|interfaces --json

contracts/opl-framework/brand-module-surfaces.json
  -> src/brand-module-surfaces.ts module read model
  -> opl charter|atlas|workspace|pack|stagecraft|runway|vault|console|foundry-lab|connect status|inspect|interfaces|validate|doctor --json
  -> module object views, such as opl charter authority, opl atlas graph, opl runway queue, opl vault evidence, opl connect drift

src/contracts.ts required contract validation
  -> opl contract validate --json
  -> tests/src/cli/cases/brand-modules.test.ts
  -> docs/references/brand-modules/current-maturity-against-workspace.md
```

`opl <module> validate --json` 与 `opl <module> doctor --json` 是模块自身 L4 最小机器验收；`opl brand-modules validate --json` 只证明聚合 registry；`opl contract validate --json` 证明 registry 与 module surface contract 都进入 required framework contract set。

## Forbidden Claims

本计划完成后仍然不能声明：

- MAS/MAG/RCA/OMA domain ready。
- App GUI release/user-path ready。
- production long-soak complete。
- domain quality/export verdict complete。
- artifact/memory body authority 已迁给 OPL。
- OPL 可替 domain owner 签 owner receipt 或 typed blocker。
