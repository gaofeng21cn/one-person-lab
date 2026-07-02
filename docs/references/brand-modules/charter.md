# OPL Charter

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归核心五件套、contracts、source、CLI/API 行为、App projection、status foldback 和 runtime evidence。
Currentness policy: 本文不冻结 Charter L4 状态、命令通过状态、App descriptor refs、runtime evidence 或 release/domain readiness。当前 Charter 结构状态必须从 fresh `opl charter status|validate|doctor --json`、brand-module contracts、source/tests 和 status foldback 读取。

## 品牌定位

`OPL Charter` 是 OPL 的顶层宪章模块。它不执行任务，也不管理 runtime；它负责让整套系统长期保持同一套语言、边界、设计决策和品牌组合。

一句话：`Charter` 管“OPL 到底是什么、哪些词能用、哪些 owner 不能越界、哪些设计决策仍有效”。

## 设计理念

- 先固定产品层级，再设计实现：`OPL Framework -> One Person Lab App -> Foundry Agents`。
- 先固定 owner boundary，再设计接口：Framework、App、Foundry Agent、domain repo、executor、provider 各自只持有自己的 authority。
- 先设理想态，再用现状找差距：历史实现只能作为迁移输入，不能定义长期结构。
- 决策要可追溯：重要设计进入 ADR/RFC，不靠聊天记忆或散落 docs。
- 命名必须有生命周期：active term、deprecated term、retired term、history/provenance term 分开。
- 人读叙事与机器合同配对：核心文档解释为什么，contract / registry / validation 固定可检查边界。
- L4 只表示结构基线完整：不把 docs foldback、合同存在或 CLI/App 投影写成 production readiness。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `product_taxonomy` | 固定 OPL Framework、App、Foundry Agents 的产品层级。 |
| `authority_matrix` | 固定 runtime、domain truth、artifact authority、quality verdict、release truth 的 owner。 |
| `brand_module_registry` | 固定当前品牌模块及其 owner、scope、interfaces、forbidden claims。 |
| `term_lifecycle` | 管理 active / deprecated / retired / provenance 术语。 |
| `adr` | 记录关键设计决策、原因、取舍、替代方案和 supersession。 |
| `rfc` | 记录较大结构变化的设计提案、验收门和迁移边界。 |
| `contract_ref_set` | 绑定 registry、authority、term lifecycle、validation schema 的机器 ref。 |
| `status_ref_set` | 绑定 project / architecture / decisions / invariants / status 的 foldback ref。 |

## 接口与文档

当前可调用 surface 分为聚合目录层和 Charter 自身模块层。

聚合目录层：

```text
opl brand-modules list --json
opl brand-modules inspect --module charter --json
opl brand-modules maturity --json
opl brand-modules validate --json
opl brand-modules interfaces --json
opl contract validate --json
```

这些命令证明 `Charter` 已进入统一 brand registry、read-model、interface bundle 和 contract validation。

Charter 自身模块层：

```text
opl charter status --json
opl charter inspect --json
opl charter authority --json
opl charter terms --json
opl charter decisions --json
opl charter interfaces --json
opl charter validate --json
opl charter doctor --json
```

这些命令由 `contracts/opl-framework/brand-module-surfaces.json#modules.charter` 定义，并从同一 Charter read-model 派生 CLI、App descriptor、validation、doctor 与 status 输出。Fresh readback of those surfaces can support reading `Charter` as Workspace 级 `L4_structural_baseline`；该声明只覆盖结构完成度，不覆盖 L5、domain ready、App release ready 或 production ready。

当前 App / descriptor refs：

```text
App descriptors: brand_modules_list, brand_modules_inspect, brand_modules_maturity
Descriptor delegates: brand_modules_registry, brand_modules_cli_bundle
Boundary: MCP / Skill / OpenAI / AI SDK 只投影 Charter refs，不持有决策或 authority。
```

当前支撑 refs：

```text
docs/project.md
docs/architecture.md
docs/invariants.md
docs/decisions.md
docs/status.md
docs/references/brand-modules/current-maturity-against-workspace.md
```

当前 contract / validation refs：

```text
docs/references/brand-modules/charter.md
docs/decisions.md
docs/invariants.md
docs/policies/docs-lifecycle-policy.md
docs/policies/terminology-lifecycle-policy.md
contracts/opl-framework/brand-module-registry.json
contracts/opl-framework/public-surface-index.json
contracts/opl-framework/surface-budget-policy.json
```

模块级 L4 CLI / read-model / validation surface：

```text
opl charter status --json
opl charter inspect --json
opl charter authority --json
opl charter terms --json
opl charter decisions --json
opl charter interfaces --json
opl charter validate --json
opl charter doctor --json
```

统一 `opl brand-modules ...` inspection surface 只作为 registry refs；Workspace 级 L4 结构完成度以 `brand-module-surfaces.json` 和 `opl charter validate|doctor --json` 为模块自身验收。

`Charter` 的人读文档解释设计意图；机器合同固定模块、owner、forbidden authority 和 term lifecycle。测试只验证 contract / schema / CLI 行为，不固定 prose wording。

## Authority Boundary

`Charter` 持有 OPL Framework 的品牌模块注册、产品层级、术语生命周期、authority matrix、ADR/RFC supersession 和 forbidden claim 规则。它可以阻止 ownerless module、过期术语回流、跨 owner claim 和文档生命周期漂移。

它不持有 domain truth、artifact body、quality verdict、runtime readiness、App release truth、provider completion、owner receipt 或 typed blocker authority。domain repo、Runway、Stagecraft、Vault、Console 和 App 仍分别持有自己的机器真相。

## 不做什么

- 不替 `Runway` 判断 runtime ready。
- 不替 `Stagecraft` 定义 stage 内部策略细节。
- 不替 `Vault` 签 receipt 或 closeout。
- 不替 `Console` 设计具体页面。
- 不把 ADR 写成永久不可改的神谕；被 supersede 的决策必须标出当前读法。

## Forbidden Claims

- `Charter L4` 即使完成，也不等于 L5、domain ready、App release ready 或 production ready。
- `authority_matrix` 不迁移 MAS/MAG/RCA/OMA 的 domain truth、artifact authority 或 quality verdict。
- `brand_module_registry` 只证明对应模块已有统一 `brand-modules` inspection、descriptor 和 validation refs；独立 `opl charter ...` 子命令由 `brand-module-surfaces.json` 和模块自身 validate/doctor 证明。
- `term_lifecycle` 不把 deprecated / retired term 恢复成 active surface。
- ADR/RFC 被接受不等于代码、合同、release、runtime 或用户路径已经落地。
- docs foldback 不等于 production readiness、owner acceptance 或 App release evidence。

## 目标验收

模块级 L4 baseline 成功标准：

- `brand_module_registry` 有 contract，并能被 `opl contract validate --json` 与 `opl brand-modules validate --json` 检查。
- `opl charter status|inspect|authority|terms|interfaces|validate|doctor --json` 真实可调用，并与 App descriptors 从同一 Charter read-model 派生。
- `opl charter validate --json` 能检查 Charter contract refs、authority boundary、term lifecycle、ADR/RFC lifecycle、forbidden claims 和 docs/status foldback。
- `opl charter doctor --json` 能输出缺失 refs、owner drift、术语生命周期漂移、deprecated/retired term 回流和跨 owner claim 的诊断。
- MCP、Skill、OpenAI、AI SDK 只作为 descriptor delegate，不能成为第二决策源。
- `docs/project.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`docs/status.md` 与 Charter refs 同步，不出现主语漂移。
- validation fail-closed：发现缺模块、缺 L4 gate、forbidden authority flag 不是 false 或 forbidden claims 缺失时失败。
- `current-maturity-against-workspace.md` 能把 Charter 状态读成结构完成度，而不是 readiness 声明。

聚合验收命令：

```text
opl brand-modules inspect --module charter --json
opl brand-modules interfaces --json
opl brand-modules validate --json
opl contract validate --json
```

模块自身验收命令：

```text
opl charter status --json
opl charter inspect --json
opl charter authority --json
opl charter terms --json
opl charter decisions --json
opl charter interfaces --json
opl charter validate --json
opl charter doctor --json
opl brand-modules inspect --module charter --json
opl brand-modules validate --json
opl contract validate --json
```

基础成功标准：

- 新模块、新接口、新术语都能归入明确品牌模块。
- 任何人问“这个归谁管”，能从 authority matrix 找到答案。
- 历史词汇不会回流成 active surface。
- 当前文档、contracts、CLI help、App projection 的主语一致。
