# Workspace / Source Intake 边界

Owner: `One Person Lab`
Purpose: `generic_source_workspace_boundary`
State: `active_support`
Machine boundary: 本文是人读边界说明。机器真相继续归 workspace/source contracts、source registry、domain manifests、runtime evidence、owner receipts 和 CLI/API 行为。

## 当前职责

OPL Framework 只负责通用 workspace/source intake shell：

- workspace registry、source locator、source refs/status projection 和 source refs 的通用传输；
- workspace / source scope refs 到外部 workspace root 的定位；源码仓只保存 locator、index、schema、receipt refs 和 retention / restore policy；
- source intake 到 stage attempt、operator workbench、artifact locator 和 domain projection 的只读连接；
- generic shell、refs、receipt envelope、freshness/status projection 和 App drilldown 语义。

OPL 不判断医学来源、基金材料、视觉素材、引用质量、研究路线、fundability、visual direction 或任何 domain source truth。真实 source body、workspace state、work-in-progress 和运行输入应位于外部 workspace root；developer checkout 不承载这些运行状态。

## 当前 owner split

| 层级 | source/workspace 层职责 |
| --- | --- |
| `OPL Framework` | 通用 locator、registry、intake shell、refs-only projection、lifecycle/status projection 和 App/workbench 消费边界。 |
| `One Person Lab App` | 消费 OPL workbench / operator projection，展示 workspace/source/artifact/memory refs、blocked reason、next owner 和 inspect command；不读取 source body，不生成 source readiness verdict。 |
| `Foundry Agents` | MAS/MAG/RCA 持有各自 workspace truth、source truth body、source provenance、domain source semantics、source readiness verdict、artifact authority 和 owner receipt。 |

当某个 source 能力能跨 MAS/MAG/RCA 复用为 locator、registry、transport、read model 或 App drilldown，它应上收到 OPL Framework。只要能力会解释领域来源质量、读取 source body、决定领域路线或签发 source readiness verdict，它必须留在 domain repo。
