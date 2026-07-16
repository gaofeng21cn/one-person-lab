# Workspace / Source Intake 边界

Owner: `One Person Lab`
Purpose: `generic_source_workspace_boundary`
State: `active_support`
Machine boundary: 本文是人读边界说明。机器真相继续归 workspace/source contracts、source registry、domain manifests、runtime evidence、owner receipts 和 CLI/API 行为。

Currentness policy: 本文只保存通用 workspace/source intake shell 的稳定 owner split、动态证据入口和 negative boundary。不要从本文读取当前 source ref 数量、workspace binding 数量、App/workbench route 数量或 readiness 状态；这些必须从 fresh contracts、source、tests、CLI/read-model、domain manifests 和 runtime ledger 读取。

## 当前职责

OPL Framework 只负责通用 workspace/source intake shell：

- workspace registry、source locator、source refs/status projection 和 source refs 的通用传输；
- workspace / source scope refs 到外部 workspace root 的定位；源码仓只保存 locator、index、schema、receipt refs 和 retention / restore policy；
- source intake 到 stage attempt、operator workbench、artifact locator 和 domain projection 的只读连接；
- generic shell、refs、receipt envelope、freshness/status projection 和 App drilldown 语义。

OPL 不判断医学来源、基金材料、视觉素材、引用质量、研究路线、fundability、visual direction 或任何 domain source truth。真实 source body、workspace state、work-in-progress 和运行输入应位于外部 workspace root；developer checkout 不承载这些运行状态。

## Standard Agent 原则与 intake mapping

Standard Agent AI-first Principle Pack 的定位是通用原则包，不是新的 domain intake Skill。`docs/policies/standard-agent-ai-first-principles.md` 和 `contracts/opl-framework/standard-agent-principles.json` 分别持有人读原则和机器边界：

- OPL 只定义通用 workspace/source intake shell：locator、registry、scope refs、stage attempt source fingerprint、refs-only projection、freshness/status、owner answer shape 和 forbidden authority。
- Domain agent 定义 domain intake mapping：哪些材料算有效输入、source body 如何解释、领域语义如何映射、source readiness verdict 由谁签、缺口如何 route-back 或进入 typed blocker。
- `intake` 本身不外置为独立 OPL Skill；只有领域专业判断体量大、跨 workspace 复用且满足能力外置门时，才作为 domain-owned professional skill / reference pack / connector 暴露。
- 文档、read model、contract 或测试只能证明 intake shell / mapping 边界可读；不能证明 source truth current、domain ready、artifact ready、quality verdict、release ready 或 production ready。

## 临床数据治理使用方式

`medical-data-governance` 可以直接消费 OPL 基座的通用 lifecycle 能力，但只把它们当作 locator、index、projection 和 receipt transport：

- workspace/source locator refs 定位数据资产、机构存储、外部 bucket、数据库或文献来源；
- memory/data-asset registry refs 帮助 MAS 找到数据资产索引、manifest、dictionary、codebook、lineage 和 study binding；
- artifact lifecycle refs 表达数据派生物、stage output、materialized candidate、archive、restore proof 和 tombstone candidate；
- retention / restore / provenance refs 说明数据保留、冷存储、恢复证明和清理候选；
- refs-only ledger / owner-gate handoff refs 把治理发现交回 MAS 或下游 domain owner。

OPL 基座不接管临床数据 body、临床语义映射、source readiness verdict、清洗/归一化接受、study binding 接受、不可逆物理删除、owner receipt、typed blocker、human gate 或 publication readiness。这些判断由 MAS 或对应 Health / domain owner 消费 `medical-data-governance` 的 refs 后签发。

## 动态证据入口

| source/workspace 面 | 稳定读法 | 当前机器入口 |
| --- | --- | --- |
| Generic substrate projection | OPL 只拥有 workspace/source/artifact/memory locator、index、lifecycle projection、manifest ref transport 和 App/operator workbench grouping。 | `contracts/opl-framework/generic-substrate-projection-contract.json`、`src/generic-substrate-projection.ts`、`tests/src/generic-substrate-projection.test.ts`。 |
| Stage attempt source intake | Stage attempt 的 workspace/source intake 只投影 workspace root、runtime root、profile ref、source refs、material refs、missing material attention refs 和 source fingerprint。 | `src/runtime-tray-workspace-source-intake.ts`、`tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts`、`opl family-runtime attempt query|inspect`。 |
| Repo-source boundary | Standard Foundry Agent repo-source 只保存 declarative pack、contracts、minimal authority functions、docs 和 locator refs；真实 workspace/source body 在外部 workspace root。 | `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`docs/policies/runtime-artifact-hygiene-policy.md`、`opl agents conformance --family-defaults --json`。 |
| Standard Agent principle pack | OPL 只持有 AI-first / contract-light / intake shell / false-ready 通用原则；domain intake mapping 与领域判断留在 domain pack。 | `docs/policies/standard-agent-ai-first-principles.md`、`contracts/opl-framework/standard-agent-principles.json`、domain 仓 `contracts/standard-agent-principles-adoption.json`。 |
| App/workbench projection | App/operator 只能消费 refs-only projection 来展示 workspace/source refs、blocked reason、next owner 和 inspect command。 | `opl runtime app-operator-drilldown --json`、runtime tray source/workbench projection source 和 App-owned tests。 |

## 当前 owner split

| 层级 | source/workspace 层职责 |
| --- | --- |
| `OPL Framework` | 通用 locator、registry、intake shell、refs-only projection、lifecycle/status projection 和 App/workbench 消费边界。 |
| `One Person Lab App` | 消费 OPL workbench / operator projection，展示 workspace/source/artifact/memory refs、blocked reason、next owner 和 inspect command；不读取 source body，不生成 source readiness verdict。 |
| `Foundry Agents` | MAS/MAG/RCA 持有各自 workspace truth、source truth body、source provenance、domain intake mapping、domain source semantics、source readiness verdict、artifact authority 和 owner receipt。 |

当某个 source 能力能跨 MAS/MAG/RCA 复用为 locator、registry、transport、read model 或 App drilldown，它应上收到 OPL Framework。只要能力会解释领域来源质量、读取 source body、决定领域路线或签发 source readiness verdict，它必须留在 domain repo。

## 不能写成

- source refs/status projection 等于 source readiness verdict。
- workspace binding、manifest resolved、source fingerprint observed 或 App/workbench 可见等于 domain source truth current。
- OPL 可读取、整理、重写或接受 source body。
- OPL 可选择医学研究来源、基金材料、视觉素材或 domain profile。
- OPL 可把 intake 写成独立 Skill，或用通用 intake shell 替代 domain intake mapping。
- developer checkout 可作为 runtime workspace root、source body root、work-in-progress root 或真实输入输出根。
- 为退役 product-entry、gateway-era route、local manager、compat alias、facade 或 wrapper 保留 source/workspace 入口。
