# Artifact / Package Lifecycle 边界

Owner: `One Person Lab`
Purpose: `generic_delivery_lifecycle_boundary`
State: `active_support`
Machine boundary: 本文是人读边界说明。机器真相继续归 artifact locator、package/export lifecycle contracts、runtime ledger、domain owner receipts、生成产物和 CLI/API 行为。

## 当前职责

OPL 只负责通用 artifact/package/export lifecycle shell：

- artifact locator、package/export ledger、restore/retention/migration refs；
- runtime artifact root locator、artifact index、receipt refs 和 restore proof refs；源码仓只保存这些引用和 policy，不保存 artifact body；
- OPL-owned runtime/index/provenance/tombstone refs 的 dry-run / apply / verify lifecycle ledger apply；
- stage attempt closeout、owner receipt refs、typed blocker refs 和 App/workbench gallery projection；
- package/export lifecycle 的通用 read model、handoff shell 和 operator action route。

OPL 不拥有 manuscript、grant package、deck、visual artifact、review/export verdict、submission ready verdict 或 artifact mutation permission。真实 artifact body、receipt 实例和最终交付物应位于外部 runtime artifact root；developer checkout 只保存 locator、schema、receipt ref、restore / retention policy 和可审查 fixture。`family-runtime lifecycle apply` 遇到 domain truth、memory body、artifact body 或 source repo active file mutation 会 fail-closed；domain artifact mutation 只能作为 domain owner receipt ref 被记录。

## 当前产品分层中的位置

| 仓库 | delivery 层职责 |
| --- | --- |
| `one-person-lab` / `OPL Framework` | 通用 locator、package/export lifecycle shell、restore/retention refs、OPL-owned cleanup ledger apply、refs-only artifact gallery projection、lifecycle reconciliation 和 safe action routing。 |
| `one-person-lab-app` | 消费 framework/provider 状态和 domain-owned projection，展示 artifact gallery、package/export refs、lifecycle refs、restore proof refs 和 owner-aware action；不读 artifact body，不持有 quality/export verdict、domain owner receipt、release ready 或 production ready。 |
| `med-autoscience` / `MAS` | manuscript、submission package、publication quality gate、medical display delivery 和 publication artifact authority。 |
| `med-autogrant` / `MAG` | proposal/package/export、fundability/quality verdict、submission-ready authority 和 grant artifact owner receipt。 |
| `redcube-ai` / `RCA` | PPT/小红书/poster 等 visual deliverable family、review/export verdict、canonical artifact 和 visual owner receipt。 |

当交付能力只是 locator、refs、package/export lifecycle transport、restore proof 或 App 展示，应上收到 OPL。只要能力会改写产物、判断 ready/export/quality 或决定交付方向，它必须留在 domain repo。
