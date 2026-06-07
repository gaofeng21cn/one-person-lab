# OPL Atlas

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 domain descriptors、contracts、source、CLI/API 行为和 generated catalog/read-model。

## 品牌定位

`OPL Atlas` 是 OPL 的发现与目录模块。它把 Foundry Agents、capabilities、actions、stages、interfaces、owners、dependencies、workspace profiles、runtime surfaces 和 lifecycle state 组织成一个可查询 catalog。

一句话：`Atlas` 管“有什么、谁拥有、怎么调用、当前生命周期是什么”。

## 设计理念

成熟平台的经验是先有 catalog，再谈平台治理。Backstage Software Catalog 的关键启发是：metadata 与 owner 应靠 source-controlled descriptor 维护，再被集中收集、索引和展示。OPL Atlas 也应遵循这条路线：domain repo 持有自己的 descriptor，OPL 只聚合、校验和投影。

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

## 接口与文档

理想接口：

```text
opl atlas list --json
opl atlas inspect --agent <id> --json
opl atlas surfaces --agent <id> --json
opl atlas graph --json
opl atlas lifecycle --agent <id> --json
```

理想文档：

```text
docs/references/brand-modules/atlas.md
docs/specs/atlas-catalog-boundary.md
contracts/opl-framework/atlas-catalog.schema.json
contracts/opl-framework/domain-pack-compiler-contract.json
```

## 不做什么

- 不执行 action。
- 不推断 domain ready。
- 不读取 artifact body、memory body 或 transcript body。
- 不成为第二 domain contract；domain descriptor 仍由 domain repo 持有。

## 成功标准

- MAS/MAG/RCA/OMA 和未来 Agent 能用同一 catalog 发现。
- CLI/App/MCP/Skill/OpenAI/AI SDK descriptors 从同一 source 派生。
- 没有 orphan agent、orphan action、orphan stage 或 ownerless surface。
- deprecated / retired surface 能被发现，但不会出现在默认用户入口。

