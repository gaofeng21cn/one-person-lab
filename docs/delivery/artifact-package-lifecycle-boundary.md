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
- Pack OS 的通用 capability pack descriptor intake、install registry、content-addressed cache、refs-only distribution bundle、refs-only pack lock、artifact lifecycle refs 和 review receipt refs transport；
- OPL-owned runtime/index/provenance/tombstone refs 的 dry-run / apply / verify lifecycle ledger apply；
- stage attempt closeout、owner receipt refs、typed blocker refs 和 App/workbench gallery projection；
- package/export lifecycle 的通用 read model、handoff shell 和 operator action route。

OPL 不拥有 manuscript、grant package、deck、visual artifact、review/export verdict、submission ready verdict 或 artifact mutation permission。真实 artifact body、receipt 实例和最终交付物应位于外部 runtime artifact root；developer checkout 只保存 locator、schema、receipt ref、restore / retention policy 和可审查 fixture。`family-runtime lifecycle apply` 遇到 domain truth、memory body、artifact body 或 source repo active file mutation 会 fail-closed；domain artifact mutation 只能作为 domain owner receipt ref 被记录。

Pack OS 是这条边界里的 landed 通用 transport surface：`contracts/opl-framework/pack-os-contract.json` 与 `src/modules/pack/pack-os.ts` 支持 `opl pack os inspect|install|registry|cache|distribute|lock|validate --json`，从 descriptor 派生 refs-only lock、registry entry、content-addressed cache manifest 和 refs-only distribution bundle，记录 descriptor ref/hash、present local file 的 content hash、artifact locator refs、lifecycle state refs、review receipt refs、provenance 和 authority false flags。它接受 domain-owned adapter 产出的通用 descriptor，不保留 MAS Display Pack 专用 smoke 或 conversion contract；它不复制 artifact body 到合同，不改写 domain artifact，不把 review receipt transport 解释成 quality verdict，不签 domain owner receipt，也不授权 publication/grant/visual/App ready 或 production maturity。

## Stage Artifact 单元

通用 artifact/package/export lifecycle 的默认物理读法是 stage-native：stage attempt 在外部 runtime artifact root 内以 `Stage Folder + Manifest + Receipt` 形成最小可物化单元。OPL 只索引 stage folder、manifest、receipt ref、content hash、lineage event、current/latest pointer、canonical/export promotion ref 和 retention / restore policy；domain repo 持有 artifact body、quality/export verdict、owner receipt 和最终交付 authority。

`opl stage open` / `opl stage-artifact open` 必须物化 `attempt.json`、`manifest.json`、`inputs/`、`outputs/`、`evidence/` 和 `receipts/`；`commit` 写入 required outputs、receipt refs 和 sha256 content hash；`promote` 只能从物理目录推导为 receipt-backed `success` 的 attempt 写 refs-only canonical pointer。对 RCA 这类 visual domain，OPL 的 RCA owner receipt、visual truth、review/export verdict 和 artifact body 写入权限保持显式 `false`。

`opl stage conformance` 是严格 gate：检查 deliverable/stage/attempt 必备条目、manifest/receipt/hash、latest/current pointer、orphan/broken attempt 和 lineage refs；通过只说明 Stage Folder Contract 自洽，不说明 domain ready、quality ready 或 export ready。`opl stage workbench` 是 App/operator 的 artifact-native projection，集中显示 current/canonical/export refs、receipt refs、typed blocker refs、hash、lineage、retention/restore policy 和 conformance summary。`opl stage gc --apply` 只把非 latest、非 canonical attempt 移入 retention archive 并写 restore proof；`restore` 必须带 matching restore proof ref，且不会生成 owner receipt 或 domain verdict。

artifact 状态分类固定为：

| 状态 | 判定 | 处理 |
| --- | --- | --- |
| `current artifact` | 当前 stage pointer 指向的 attempt 中，manifest、required outputs、hash 与 owner receipt 均成立。 | 可进入 App/operator projection 或被 domain owner promote。 |
| `canonical artifact` | domain owner receipt 或 promotion receipt 已把某个 stage output 提升到 `artifacts/canonical/`。 | 可作为交付 authority ref 被引用；OPL 仍不拥有 quality/export verdict。 |
| `export artifact` | package/handoff/export receipt 指向的外发 bundle 或渲染结果。 | 进入 package/export lifecycle projection；ready/export 判断回 domain owner。 |
| `orphan artifact` | 文件存在，但缺少 manifest 或 owner receipt 绑定。 | 只作为 repair / audit attention；不能计入 stage 完成。 |
| `broken artifact` | receipt 或 manifest 指向 required output，但文件缺失、hash 不匹配或不可读。 | 必须进入 repair / route-back；不能作为 current progress。 |
| `historical artifact` | 旧 attempt 产物存在，但不被 current/latest pointer 指向。 | 只作 provenance / rollback / audit evidence。 |

因此 artifact gallery、package/export projection、lifecycle index 和 restore proof 都必须解释这些状态，而不是把目录存在、文件数量、export bundle 存在或 receipt counter 写成 artifact ready。

## 动态证据入口

| delivery/lifecycle 面 | 稳定读法 | 当前机器入口 |
| --- | --- | --- |
| Generic substrate projection | OPL 只拥有 artifact ref index、memory/source/workspace ref index、lifecycle projection、manifest ref transport 和 App/operator grouping。 | `contracts/opl-framework/generic-substrate-projection-contract.json`、`src/generic-substrate-projection.ts`、`tests/src/generic-substrate-projection.test.ts`。 |
| Pack OS descriptor / lifecycle | OPL 只把 capability pack descriptor、resource refs、content hashes、artifact lifecycle refs 和 review receipt refs 投影成 refs-only lock、registry entry、cache manifest 与 distribution bundle；domain conversion与质量判断留在domain adapter；不存artifact body，不生成owner receipt，不判断quality/publication/export readiness。 | `contracts/opl-framework/pack-os-contract.json`、`src/modules/pack/pack-os.ts`、`opl pack os inspect --descriptor <path> --json`、`opl pack os install --descriptor <path> --registry <path> --json`、`opl pack os registry --registry <path> --json`、`opl pack os cache --descriptor <path> --cache-root <dir> --json`、`opl pack os distribute --descriptor <path> --output <path> --json`、`opl pack os lock --descriptor <path> --json`、`opl pack os validate --descriptor <path> --json`。 |
| Stage Artifact runtime | OPL 从物理 stage folders 重建 status/explain/index/workbench，执行 conformance、content hash、lineage graph、retention archive 和 restore proof ref 维护；不持有 artifact body 或 owner verdict。 | `contracts/opl-framework/stage-artifact-runtime-contract.json`、`src/stage-artifact-runtime.ts`、`tests/src/stage-artifact-runtime.test.ts`、`opl stage conformance --json`、`opl stage workbench --json`。 |
| Package/export projection | Stage attempt 和 workbench 只投影 package refs、export refs、gap report refs、handoff refs、artifact refs 和 external submission status ref。 | `src/runtime-tray-package-export-lifecycle.ts`、`tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts`、`opl runtime app-operator-drilldown --json`。 |
| Lifecycle apply/index | OPL-owned runtime/index/provenance/tombstone refs 可以走 dry-run/apply/verify ledger；domain artifact mutation 只能以 domain owner receipt ref 进入索引；refs-only drift/readiness inspection 通过 lifecycle index、tests 和 App/operator read-model 读取。 | `contracts/family-orchestration/family-lifecycle-ledger.schema.json`、`src/family-runtime-lifecycle-index.ts`、`tests/src/family-runtime-lifecycle-index.test.ts`、`src/family-runtime-command-parts/lifecycle.ts`、`opl family-runtime lifecycle apply`、`opl family-runtime lifecycle reconcile`。 |
| Repo-source artifact boundary | Standard Foundry Agent repo-source 不保存真实 artifact body；只保存 locator refs、freshness、receipt refs、restore proof refs 和 migration state。 | `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`docs/policies/runtime-artifact-hygiene-policy.md`、`opl agents conformance --family-defaults --json`。 |

## 当前产品分层中的位置

| 仓库 | delivery 层职责 |
| --- | --- |
| `one-person-lab` / `OPL Framework` | 通用 locator、Pack OS descriptor/install/registry/cache/distribution/lock/lifecycle/review receipt refs transport、package/export lifecycle shell、restore/retention refs、OPL-owned cleanup ledger apply、refs-only artifact gallery projection、lifecycle reconciliation 和 safe action routing。 |
| `one-person-lab-app` | 消费 framework/provider 状态和 domain-owned projection，展示 artifact gallery、package/export refs、lifecycle refs、restore proof refs 和 owner-aware action；不读 artifact body，不持有 quality/export verdict、domain owner receipt、release ready 或 production ready。 |
| `med-autoscience` / `MAS` | manuscript、submission package、publication quality gate、medical display delivery 和 publication artifact authority。 |
| `med-autogrant` / `MAG` | proposal/package/export、fundability/quality verdict、submission-ready authority 和 grant artifact owner receipt。 |
| `redcube-ai` / `RCA` | PPT/小红书/poster 等 visual deliverable family、review/export verdict、canonical artifact 和 visual owner receipt。 |

当交付能力只是 locator、refs、package/export lifecycle transport、restore proof 或 App 展示，应上收到 OPL。只要能力会改写产物、判断 ready/export/quality 或决定交付方向，它必须留在 domain repo。

## 不能写成

- artifact/package/export refs observed 等于 artifact ready、export ready、submission ready、quality verdict 或 production ready。
- pack descriptor valid、pack lock written、review receipt refs observed 或 provider completion 等于 pack quality ready、domain ready、publication ready、grant ready、visual export ready、App release ready 或 production ready。
- stage folder、artifact directory、render file、export bundle 或 latest pointer 存在本身等于 stage complete、artifact ready 或 handoff complete。
- orphan artifact、broken artifact 或 historical artifact 被计入 current progress。
- App gallery、package/export projection、lifecycle index 或 restore proof ref 等于 domain owner receipt、artifact mutation authority 或 final deliverable authority。
- OPL 可读取、改写、清理或接受真实 artifact body、memory body、domain truth body 或 source repo active file。
- `family-runtime lifecycle apply` 可以替代 MAS/MAG/RCA 的 cleanup、restore、retention、artifact mutation 或 owner-chain receipt。
- developer checkout 可作为 runtime artifact root、真实交付物根、receipt 实例根或 package/export body 根。
- 为退役 product-entry、gateway-era route、local manager、compat alias、facade 或 wrapper 保留 delivery/package/export 入口。
