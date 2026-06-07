# OPL 品牌模块 L4 一步到位计划

Owner: `One Person Lab`
Purpose: `brand_module_l4_rollout_plan`
State: `active_support`
Machine boundary: 本文是人读执行计划与验收矩阵。机器真相继续归 `contracts/opl-framework/brand-module-registry.json`、`contracts/opl-framework/brand-cli-governance.json`、`opl brand-modules * --json`、非 Workspace 的 `opl <brand-module> status|inspect|interfaces|validate|doctor --json`、Workspace 的 `opl workspace status|inspect --json`、`opl agents modules * --json`、`opl contract validate`、source、测试、runtime ledger、provider receipt、domain-owned manifest 和真实 App/workspace evidence。

## 目标

把九个 OPL 品牌模块全部拉到 `OPL Workspace` 当前结构完成水平：每个模块至少具备品牌文档、机器注册表、合同或 policy refs、CLI 面、App/operator 或 descriptor 面、validation 面、status/maturity foldback、authority boundary 和 forbidden claims。

本目标只要求 `L4_structural_baseline`，不要求 production long-soak、真实 App release/user-path evidence、domain owner acceptance scaleout、artifact/export verdict 或 domain ready。

## 外部工程经验吸收

- `Catalog as source of metadata`: 采用类似 Backstage Software Catalog 的 owner/metadata/discoverability 思路，把九模块统一收进 `brand-module-registry.json`，CLI/App/descriptor 从 registry 派生。
- `Maturity by gates`: 采用平台成熟度模型的维度化验收方式，用 L4 gates 判断结构完成度，避免用单一“ready”标签混淆设计完成、实现完成和生产证据。
- `Thinnest viable platform`: 每个品牌模块只暴露必要 self-service surface；domain truth、artifact body、quality verdict、owner receipt 和 production readiness 保持在对应 owner。

## 九模块验收门

每个模块必须同时满足：

| Gate | 验收口径 |
| --- | --- |
| `brand_doc_ref` | 有 `docs/references/brand-modules/<module>.md` 品牌文档。 |
| `registry_entry` | 有 `contracts/opl-framework/brand-module-registry.json#modules.<module>` 机器注册项。 |
| `contract_or_policy_ref` | 至少一个稳定 contract、schema 或 policy ref。 |
| `cli_surface_ref` | 至少一个真实 CLI、统一 `opl brand-modules ...` inspection surface，或模块自有 `opl <brand-module> status|inspect|interfaces|validate|doctor --json` read surface。 |
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
| `brand-charter-atlas` | `docs/references/brand-modules/charter.md`、`atlas.md` | Charter/Atlas 文档与 Workspace 文档 | 两模块文档包含 L4 refs、authority boundary、forbidden claims。 |
| `brand-runway-vault` | `docs/references/brand-modules/runway.md`、`vault.md` | Runway/Vault 文档与 Workspace 文档 | 两模块文档包含 L4 refs、authority boundary、forbidden claims。 |
| `brand-console-connect` | `docs/references/brand-modules/console.md`、`foundry-lab.md`、`connect.md` | Console/Foundry Lab/Connect 文档与 Workspace 文档 | 三模块文档包含 L4 refs、authority boundary、forbidden claims。 |

## 已落地结构

当前 L4 结构源是：

```text
contracts/opl-framework/brand-module-registry.json
contracts/opl-framework/brand-cli-governance.json
  -> src/contracts.ts required contract validation
  -> src/brand-modules.ts read model
  -> opl brand-modules list|inspect|maturity|validate|interfaces --json
  -> opl <brand-module> status|inspect|interfaces|validate|doctor --json
     (Workspace collision exception: only status|inspect are brand read surfaces)
  -> opl agents modules list|inspect|interfaces|validate|doctor --json
  -> tests/src/cli/cases/brand-modules.test.ts
  -> docs/references/brand-modules/current-maturity-against-workspace.md
```

`opl brand-modules validate --json` 和 `opl agents modules validate --json` 是本计划的最小机器验收；`opl contract validate --json` 证明 registry 与 CLI governance 都已进入 required framework contract set。`brand-cli-governance.json` 只冻结 read-only frontdoor，不给任何品牌模块 domain truth、owner receipt、artifact body、quality verdict、typed blocker 或 production readiness authority；`opl workspace validate|doctor|interfaces` 继续是 Workspace operational surface，不是品牌读面的重命名。

## Forbidden Claims

本计划完成后仍然不能声明：

- MAS/MAG/RCA/OMA domain ready。
- App GUI release/user-path ready。
- production long-soak complete。
- domain quality/export verdict complete。
- artifact/memory body authority 已迁给 OPL。
- OPL 可替 domain owner 签 owner receipt 或 typed blocker。
