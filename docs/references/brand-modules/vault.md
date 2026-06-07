# OPL Vault

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 evidence contracts、runtime ledgers、domain-owned receipts、artifact locators、source manifests 和 CLI/API 行为。

## 品牌定位

`OPL Vault` 是 OPL 的证据、receipt、typed blocker 和 artifact lineage 模块。它让每个关键推进、阻塞、审核、恢复、移交和 no-regression 都能留下可审计 refs。

一句话：`Vault` 管“哪些证据存在、谁签了什么、为什么没继续、产物 lineage 指向哪里”。

## 设计理念

- Refs-only by default：OPL 保存 ref、hash、locator、receipt metadata 和 provenance，不保存 domain body。
- Owner receipt 优先：完成判断来自 domain owner receipt、quality gate receipt、typed blocker、human gate 或 route-back。
- Evidence is not verdict：证据 ledger 可以关闭 transport/workorder 缺口，不能替 domain 判断。
- Artifact lineage 是资产图：artifact、stage、receipt、restore proof、retention 和 package/export refs 应能追踪。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `evidence_ref` | body-free evidence locator。 |
| `owner_receipt_ref` | domain owner 签发的完成/移交凭据。 |
| `typed_blocker_ref` | domain / OPL / human owner 明确阻塞。 |
| `quality_gate_receipt_ref` | 独立审核 attempt 输出。 |
| `artifact_lineage_ref` | artifact 从 source 到 stage output 到 export 的 lineage。 |
| `restore_proof_ref` | artifact/runtime/source 可恢复性证明。 |
| `no_regression_ref` | 修改或迁移后的无回归证明。 |
| `vault_record` | record/verify/list 的 refs-only ledger entry。 |

## 接口与文档

理想接口：

```text
opl vault record --payload <json> --json
opl vault verify --receipt <ref> --json
opl vault list --domain <id> --json
opl family-runtime evidence-worklist --detail full --json
opl index rebuild --json
```

理想文档：

```text
docs/references/brand-modules/vault.md
docs/delivery/artifact-package-lifecycle-boundary.md
contracts/opl-framework/evidence-vault-event.schema.json
contracts/opl-framework/state-index-kernel-contract.json
contracts/opl-framework/stage-artifact-runtime-contract.json
```

## 不做什么

- 不读取 memory body、artifact body、paper body、grant body 或 visual body。
- 不接受/拒绝 memory writeback。
- 不授权 artifact mutation。
- 不把 verified refs 写成 domain ready、artifact ready 或 production ready。

## 成功标准

- 每个 closeout、blocker、route-back、restore、retention、no-regression 都有 owner 和 ref。
- App/operator 可从 summary 下钻到证据来源。
- Artifact lineage 可以重建，但 SQLite/index 不是 truth store。
- 缺失证据时生成 typed blocker 或 owner workorder，而不是猜测补齐。

