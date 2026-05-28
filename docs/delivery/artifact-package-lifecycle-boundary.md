# Artifact / Package Lifecycle 边界

Owner: `One Person Lab`
Purpose: `generic_delivery_lifecycle_boundary`
State: `active_support`
Machine boundary: 本文是人读边界说明。机器真相继续归 artifact locator、package/export lifecycle contracts、runtime ledger、domain owner receipts、生成产物和 CLI/API 行为。

Currentness policy: 本文只保存通用 artifact/package/export lifecycle shell 的稳定 owner split、动态证据入口和 negative boundary。不要从本文读取当前 artifact/package/export/lifecycle ref 数量、App gallery 数量、verified receipt 数量或 readiness 状态；这些必须从 fresh contracts、source、tests、CLI/read-model、domain manifests、domain owner receipts 和 runtime ledger 读取。

## 当前职责

OPL 只负责通用 artifact/package/export lifecycle shell：

- artifact locator、package/export ledger、restore/retention/migration refs；
- runtime artifact root locator、artifact index、receipt refs 和 restore proof refs；源码仓只保存这些引用和 policy，不保存 artifact body；
- OPL-owned runtime/index/provenance/tombstone refs 的 dry-run / apply / verify lifecycle ledger apply；
- stage attempt closeout、owner receipt refs、typed blocker refs 和 App/workbench gallery projection；
- package/export lifecycle 的通用 read model、handoff shell 和 operator action route。

OPL 不拥有 manuscript、grant package、deck、visual artifact、review/export verdict、submission ready verdict 或 artifact mutation permission。真实 artifact body、receipt 实例和最终交付物应位于外部 runtime artifact root；developer checkout 只保存 locator、schema、receipt ref、restore / retention policy 和可审查 fixture。`family-runtime lifecycle apply` 遇到 domain truth、memory body、artifact body 或 source repo active file mutation 会 fail-closed；domain artifact mutation 只能作为 domain owner receipt ref 被记录。

## 动态证据入口

| delivery/lifecycle 面 | 稳定读法 | 当前机器入口 |
| --- | --- | --- |
| Generic substrate projection | OPL 只拥有 artifact ref index、memory/source/workspace ref index、lifecycle projection、manifest ref transport 和 App/operator grouping。 | `contracts/opl-framework/generic-substrate-projection-contract.json`、`src/generic-substrate-projection.ts`、`tests/src/generic-substrate-projection.test.ts`。 |
| Package/export projection | Stage attempt 和 workbench 只投影 package refs、export refs、gap report refs、handoff refs、artifact refs 和 external submission status ref。 | `src/runtime-tray-package-export-lifecycle.ts`、`tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts`、`opl runtime app-operator-drilldown --json`。 |
| Lifecycle apply/index | OPL-owned runtime/index/provenance/tombstone refs 可以走 dry-run/apply/verify ledger；domain artifact mutation 只能以 domain owner receipt ref 进入索引；refs-only drift/readiness inspection 通过 lifecycle index、tests 和 App/operator read-model 读取。 | `contracts/family-orchestration/family-lifecycle-ledger.schema.json`、`src/family-runtime-lifecycle-index.ts`、`tests/src/family-runtime-lifecycle-index.test.ts`、`src/family-runtime-command-parts/lifecycle.ts`、`opl family-runtime lifecycle apply`、`opl family-runtime lifecycle reconcile`。 |
| Repo-source artifact boundary | Standard Foundry Agent repo-source 不保存真实 artifact body；只保存 locator refs、freshness、receipt refs、restore proof refs 和 migration state。 | `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`docs/policies/runtime-artifact-hygiene-policy.md`、`opl agents conformance --family-defaults --json`。 |

## 当前产品分层中的位置

| 仓库 | delivery 层职责 |
| --- | --- |
| `one-person-lab` / `OPL Framework` | 通用 locator、package/export lifecycle shell、restore/retention refs、OPL-owned cleanup ledger apply、refs-only artifact gallery projection、lifecycle reconciliation 和 safe action routing。 |
| `one-person-lab-app` | 消费 framework/provider 状态和 domain-owned projection，展示 artifact gallery、package/export refs、lifecycle refs、restore proof refs 和 owner-aware action；不读 artifact body，不持有 quality/export verdict、domain owner receipt、release ready 或 production ready。 |
| `med-autoscience` / `MAS` | manuscript、submission package、publication quality gate、medical display delivery 和 publication artifact authority。 |
| `med-autogrant` / `MAG` | proposal/package/export、fundability/quality verdict、submission-ready authority 和 grant artifact owner receipt。 |
| `redcube-ai` / `RCA` | PPT/小红书/poster 等 visual deliverable family、review/export verdict、canonical artifact 和 visual owner receipt。 |

当交付能力只是 locator、refs、package/export lifecycle transport、restore proof 或 App 展示，应上收到 OPL。只要能力会改写产物、判断 ready/export/quality 或决定交付方向，它必须留在 domain repo。

## 不能写成

- artifact/package/export refs observed 等于 artifact ready、export ready、submission ready、quality verdict 或 production ready。
- App gallery、package/export projection、lifecycle index 或 restore proof ref 等于 domain owner receipt、artifact mutation authority 或 final deliverable authority。
- OPL 可读取、改写、清理或接受真实 artifact body、memory body、domain truth body 或 source repo active file。
- `family-runtime lifecycle apply` 可以替代 MAS/MAG/RCA 的 cleanup、restore、retention、artifact mutation 或 owner-chain receipt。
- developer checkout 可作为 runtime artifact root、真实交付物根、receipt 实例根或 package/export body 根。
- 为退役 product-entry、gateway-era route、local manager、compat alias、facade 或 wrapper 保留 delivery/package/export 入口。
