# OPL Atlas

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 domain descriptors、contracts、source、CLI/API 行为、App projection、generated catalog/read-model、conformance report 和 status foldback。

## 品牌定位

`OPL Atlas` 是 OPL 的发现与目录模块。它把 Foundry Agents、capabilities、actions、stages、interfaces、owners、dependencies、workspace profiles、runtime surfaces 和 lifecycle state 组织成一个可查询 catalog。

一句话：`Atlas` 管“有什么、谁拥有、怎么调用、当前生命周期是什么”。

## 设计理念

成熟平台的经验是先有 catalog，再谈平台治理。Backstage Software Catalog 的关键启发是：metadata 与 owner 应靠 source-controlled descriptor 维护，再被集中收集、索引和展示。OPL Atlas 也应遵循这条路线：domain repo 持有自己的 descriptor，OPL 只聚合、校验和投影。

- Descriptor-first：domain repo 持有 agent / action / stage / private surface source descriptor，OPL 持有 catalog schema 和聚合投影。
- Generated-surface first：CLI、App、MCP、Skill、OpenAI、AI SDK descriptor 应从同一 catalog / interface bundle 派生。
- Body-free catalog：Atlas 只索引 refs、owners、schemas、lifecycle 和 dependency edge，不读取 artifact、memory 或 transcript body。
- Lifecycle visible：deprecated / retired / tombstone surface 可查，但不能进入默认用户入口。
- L4 只表示结构基线完整：不把 catalog graph、conformance pass 或 generated descriptors 写成 domain readiness。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `agent_descriptor` | Foundry Agent 的 identity、owner、domain、entry、truth boundary。 |
| `capability_card` | 某个 agent 能做什么、需要什么输入、产出什么 artifact/receipt。 |
| `action_catalog_entry` | callable action 的 id、owner、effect、schema、supported surfaces。 |
| `stage_catalog_entry` | stage 的 goal、inputs、outputs、quality gate、authority boundary。 |
| `surface_descriptor` | CLI、MCP、Skill、OpenAI tool、AI SDK tool、App action 的派生描述。 |
| `lifecycle_state` | draft、admitted、active、deprecated、retired、tombstone。 |
| `dependency_edge` | Agent / stage / action / workspace / runtime 的依赖关系。 |
| `catalog_graph` | agent、capability、action、stage、surface、workspace profile、runtime surface 的 refs-only graph。 |
| `interface_bundle_ref` | 指向 generated CLI/App/MCP/Skill/OpenAI/AI SDK descriptor bundle。 |
| `conformance_report_ref` | 指向 agent descriptor、generated surface、workspace norm、private surface 和 production evidence tail 的结构检查结果。 |
| `status_ref_set` | 指向 architecture/status/maturity 文档中的当前完成度和 forbidden claim foldback。 |

## 接口与文档

当前 L4 落地接口：

```text
opl atlas status --json
opl atlas inspect --json
opl atlas interfaces --json
opl atlas validate --json
opl atlas doctor --json
opl brand-modules inspect --module atlas --json
opl brand-modules validate --json
opl agents descriptors --json
opl agents interfaces --family-defaults --json
opl agents conformance --family-defaults --json
opl actions list --json
opl stages list --json
```

目标 App / descriptor：

```text
App descriptors: brand_modules_list, brand_modules_inspect, brand_modules_maturity
Descriptor delegates: MCP / Skill / OpenAI / AI SDK 从同一 generated interface bundle 投影，只描述调用面。
```

当前支撑 refs：

```text
docs/references/brand-modules/atlas.md
docs/references/brand-modules/current-maturity-against-workspace.md
docs/project.md
docs/architecture.md
docs/status.md
contracts/opl-framework/atlas-catalog.schema.json
contracts/opl-framework/brand-module-registry.json
contracts/opl-framework/brand-cli-governance.json
contracts/opl-framework/domain-pack-compiler-contract.json
contracts/opl-framework/foundry-agent-series-contract.json
contracts/opl-framework/standard-domain-agent-skeleton-contract.json
contracts/opl-framework/functional-privatization-audit-envelope-contract.json
src/domain-pack-compiler.ts
src/standard-domain-agent-conformance.ts
```

目标 L4 validation refs：

```text
opl brand-modules validate --json
opl agents pack-compiler --json
opl agents interfaces --json
opl agents conformance --json
opl contract validate --json
```

`opl atlas status|inspect|interfaces|validate|doctor` 是当前 Atlas 自有只读品牌 frontdoor；它读取 registry / governance / descriptor refs，不执行 catalog action，也不替代 `opl agents descriptors|interfaces|conformance` 的 operational surface。

`Atlas` 的人读文档解释 catalog 设计；机器合同固定 descriptor shape、catalog graph、generated interface bundle、lifecycle state、owner refs 和 conformance 输出。测试只验证 contract / schema / CLI/App 行为，不固定 prose wording。

## Authority Boundary

`Atlas` 持有 OPL-owned catalog schema、descriptor ingestion、refs-only graph、generated interface projection、lifecycle index 和 orphan/ownerless/drift validation。它可以判断某个 agent/action/stage/surface 是否有 descriptor、owner、schema、lifecycle 和 generated interface ref。

它不执行 action，不实现 domain handler，不持有 domain truth、artifact body、memory body、stage semantics、quality verdict、export readiness、runtime completion、owner receipt 或 typed blocker authority。domain descriptor 的 source truth 仍在 domain repo；OPL 只消费、校验和投影。

## 不做什么

- 不执行 action。
- 不推断 domain ready。
- 不读取 artifact body、memory body 或 transcript body。
- 不成为第二 domain contract；domain descriptor 仍由 domain repo 持有。

## Forbidden Claims

- `Atlas L4` 不等于 MAS/MAG/RCA/OMA ready。
- agent 出现在 catalog 不等于 admitted、active、release-ready 或 production-ready。
- generated CLI/App/MCP/Skill/OpenAI/AI SDK descriptor 不等于 handler 已实现或用户路径已验证。
- `opl agents conformance` 通过不等于 live soak、owner acceptance、quality verdict 或 App release evidence。
- catalog graph dependency 不等于 runtime route execution，也不迁移 owner authority。
- deprecated / retired surface 可查询不等于可作为默认入口使用。

## 成功标准

L4 structural baseline 成功标准：

- `atlas_catalog`、domain descriptor、generated interface bundle、lifecycle state 和 conformance report 有 schema / contract，并能由 `contract validate` 或等价验证检查。
- `opl atlas status|inspect|interfaces|validate|doctor`、`opl brand-modules inspect --module atlas`、`opl agents descriptors|interfaces|conformance` 与 App descriptors 从同一 catalog / generated interface bundle 派生。
- MCP、Skill、OpenAI、AI SDK descriptors 只做 delegate，不写 domain truth、不执行 action、不声明 readiness。
- validation fail-closed：发现 orphan agent、orphan action、orphan stage、ownerless surface、missing lifecycle、descriptor drift、generated bundle drift 或 unsupported default deprecated surface 时失败。
- MAS/MAG/RCA/OMA 和新 scaffold 能被同一 catalog graph 表达，并保留 domain-owned descriptor source。
- `docs/project.md`、`docs/architecture.md`、`docs/status.md` 与 `current-maturity-against-workspace.md` 能表达 Atlas 当前完成度和 forbidden claims，不把结构 pass 写成 L5。

基础成功标准：

- MAS/MAG/RCA/OMA 和未来 Agent 能用同一 catalog 发现。
- CLI/App/MCP/Skill/OpenAI/AI SDK descriptors 从同一 source 派生。
- 没有 orphan agent、orphan action、orphan stage 或 ownerless surface。
- deprecated / retired surface 能被发现，但不会出现在默认用户入口。
