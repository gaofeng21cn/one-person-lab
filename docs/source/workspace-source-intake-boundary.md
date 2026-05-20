# Workspace / Source Intake 边界

Owner: `One Person Lab`
Purpose: `generic_source_workspace_boundary`
State: `active_support`
Machine boundary: 本文是人读边界说明。机器真相继续归 workspace/source contracts、source registry、domain manifests、runtime evidence、owner receipts 和 CLI/API 行为。

## 当前职责

OPL 只负责通用 workspace/source intake shell：

- workspace registry、source locator、source readiness projection 和 source refs 的通用传输；
- workspace / source scope refs 到外部 workspace root 的定位；源码仓只保存 locator、index、schema、receipt refs 和 retention / restore policy；
- source intake 到 stage attempt、operator workbench、artifact locator 和 domain projection 的只读连接；
- generic shell、refs、receipt envelope、freshness/status projection 和 App drilldown 语义。

OPL 不判断医学来源、基金材料、视觉素材、引用质量、研究路线、fundability、visual direction 或任何 domain source truth。真实 source body、workspace state、work-in-progress 和运行输入应位于外部 workspace root；developer checkout 不承载这些运行状态。

## 四仓分工

| 仓库 | source 层职责 |
| --- | --- |
| `OPL` | 通用 locator、registry、intake shell、projection 和 App/workbench 消费边界。 |
| `MAS` | study workspace、文献/数据/source provenance、publication source readiness 与 medical source semantics。 |
| `MAG` | funder/task/source intake、grant source truth、workspace canonical document 与 source-to-proposal boundary。 |
| `RCA` | visual/source readiness、augmentation、deep research trigger/gate 和 source-to-deliverable boundary。 |

当某个 source 能力能跨 MAS/MAG/RCA 复用为 locator、registry、transport、read model 或 App drilldown，它应上收到 OPL。只要能力会解释领域来源质量或决定领域路线，它必须留在 domain repo。
