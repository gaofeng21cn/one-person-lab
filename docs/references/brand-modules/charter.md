# OPL Charter

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归核心五件套、contracts、source、CLI/API 行为、App projection、status foldback 和 runtime evidence。

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
| `brand_module_registry` | 固定九个品牌模块及其 owner、scope、interfaces、forbidden claims。 |
| `term_lifecycle` | 管理 active / deprecated / retired / provenance 术语。 |
| `adr` | 记录关键设计决策、原因、取舍、替代方案和 supersession。 |
| `rfc` | 记录较大结构变化的设计提案、验收门和迁移边界。 |
| `contract_ref_set` | 绑定 registry、authority、term lifecycle、validation schema 的机器 ref。 |
| `status_ref_set` | 绑定 project / architecture / decisions / invariants / status 的 foldback ref。 |

## 接口与文档

当前 L4 落地 CLI：

```text
opl charter status --json
opl charter inspect --json
opl charter interfaces --json
opl charter validate --json
opl charter doctor --json
opl brand-modules list --json
opl brand-modules inspect --module charter --json
opl brand-modules maturity --json
opl brand-modules validate --json
opl brand-modules interfaces --json
opl contract validate --json
```

当前 App / descriptor：

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

当前 L4 contract / validation refs：

```text
docs/references/brand-modules/charter.md
docs/decisions.md
docs/invariants.md
docs/policies/docs-lifecycle-policy.md
docs/policies/terminology-lifecycle-policy.md
contracts/opl-framework/brand-module-registry.json
contracts/opl-framework/public-surface-index.json
contracts/opl-framework/surface-budget-policy.json
contracts/opl-framework/brand-cli-governance.json
```

`opl charter status|inspect|interfaces|validate|doctor` 是当前 Charter 自有只读品牌 frontdoor；`opl brand-modules *` 保留为九模块 aggregate registry/read-model，不再作为 Charter 存在的唯一证明。

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

- `Charter L4` 不等于 L5、domain ready、App release ready 或 production ready。
- `authority_matrix` 不迁移 MAS/MAG/RCA/OMA 的 domain truth、artifact authority 或 quality verdict。
- `brand_module_registry` 只证明对应模块进入 aggregate registry；Charter L4 还必须通过 `opl charter status|inspect|interfaces|validate|doctor --json` 证明自有只读 frontdoor 可调用。
- `term_lifecycle` 不把 deprecated / retired term 恢复成 active surface。
- ADR/RFC 被接受不等于代码、合同、release、runtime 或用户路径已经落地。
- docs foldback 不等于 production readiness、owner acceptance 或 App release evidence。

## 成功标准

L4 structural baseline 成功标准：

- `brand_module_registry` 有 contract，并能被 `opl contract validate --json` 与 `opl brand-modules validate --json` 检查。
- `opl charter status|inspect|interfaces|validate|doctor` 与 `opl brand-modules list|inspect|maturity|validate|interfaces` 从同一 registry/governance contract 派生。
- MCP、Skill、OpenAI、AI SDK 只作为 descriptor delegate，不能成为第二决策源。
- `docs/project.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`docs/status.md` 与 Charter refs 同步，不出现主语漂移。
- validation fail-closed：发现缺模块、缺 L4 gate、forbidden authority flag 不是 false 或 forbidden claims 缺失时失败。
- `current-maturity-against-workspace.md` 能把 Charter 状态读成结构完成度，而不是 readiness 声明。

基础成功标准：

- 新模块、新接口、新术语都能归入明确品牌模块。
- 任何人问“这个归谁管”，能从 authority matrix 找到答案。
- 历史词汇不会回流成 active surface。
- 当前文档、contracts、CLI help、App projection 的主语一致。
