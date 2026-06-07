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
- Foldback only through owner delta：raw evidence、replay packet、typed blocker group 或 audit tail 只有折回 owner answer、hard gate、typed blocker 或 current owner delta 后，才影响默认行动。
- Bounded audit：Vault 记录可审计 refs、摘要、hash 和 locator；超大 body、domain memory、artifact 内容和 provider transcript 留在各自 authority owner。

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

## 结构基线与引用

| 维度 | L4 structural baseline |
| --- | --- |
| 合同 refs | `contracts/opl-framework/evidence-vault-event.schema.json`、`contracts/opl-framework/state-index-kernel-contract.json`、`contracts/opl-framework/stage-artifact-runtime-contract.json`、`contracts/opl-framework/stage-owner-receipt.schema.json`、`contracts/opl-framework/stage-typed-blocker.schema.json`。 |
| CLI refs | `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`、`opl runtime action execute --action-id <id> --json`、`opl index rebuild --json`、stage artifact `open|commit|status|validate|conformance|workbench`。 |
| App refs | App/operator drilldown 的 evidence envelope、evidence next steps、domain dispatch evidence、memory/artifact lifecycle evidence、production evidence tail ledger 和 source-ref drilldown。 |
| Descriptor / delegate refs | Domain descriptor、stage manifest、owner answer、artifact locator、source manifest、workspace locator、quality gate receipt 和 no-regression refs；Vault 只保存或验证引用形状，不接管 body authority。 |
| Validation refs | evidence vault event schema validation、receipt verify action、stage artifact validation、state index rebuild / freshness、framework readiness、evidence-worklist zero-open guard。 |
| Status refs | owner receipt / typed blocker refs、closed refs-only ledger、open evidence workorders、fold state、artifact lineage projection、restore / retention / no-regression status。 |
| 文档 refs | `docs/references/brand-modules/vault.md`、`docs/delivery/artifact-package-lifecycle-boundary.md`、`docs/invariants.md`、`docs/decisions.md`。 |

当前 L4 落地入口：

```text
opl brand-modules inspect --module vault --json
opl brand-modules validate --json
opl family-runtime evidence-worklist --detail full --json
opl stage-artifact validate --json
opl stage-artifact status --json
opl index integrity-check --json
opl index rebuild --json
```

未来如需拆出独立 Vault 品牌命令，可在同一 refs-only ledger / action shell 下派生 `opl vault record|verify|list`；当前 L4 结构基线不依赖这组独立子命令。

理想文档：

```text
docs/references/brand-modules/vault.md
docs/delivery/artifact-package-lifecycle-boundary.md
contracts/opl-framework/evidence-vault-event.schema.json
contracts/opl-framework/state-index-kernel-contract.json
contracts/opl-framework/stage-artifact-runtime-contract.json
```

## Authority Boundary

| Vault 可以做 | Vault 不可以做 |
| --- | --- |
| 记录 refs-only evidence、receipt metadata、hash、locator、fold state 和 provenance。 | 读取或保存 memory body、artifact body、paper body、grant body 或 visual body。 |
| 验证 receipt / blocker / lineage ref 的形状、存在性、绑定和 freshness。 | 替 domain owner 接受、拒绝或生成 owner receipt / typed blocker。 |
| 为 App、CLI、readiness 和 worklist 提供 audit drilldown 与 missing evidence workorder。 | 授权 artifact mutation、memory writeback、package export 或 quality verdict。 |
| 把 raw evidence 折回 owner delta、hard gate、owner answer 或 typed blocker 的输入。 | 让 raw audit tail、raw worklist、replay packet 或 private residue inventory 驱动默认 planning。 |

## Forbidden Claims

- 不读取 memory body、artifact body、paper body、grant body 或 visual body。
- 不接受/拒绝 memory writeback。
- 不授权 artifact mutation。
- 不把 verified refs 写成 domain ready、artifact ready 或 production ready。
- 不把 evidence-worklist zero-open 写成全局完成。
- 不把 refs-only ledger closed 写成 domain owner 已签收。
- 不把 state index / SQLite / search index 写成 truth store。
- 不把 restore proof 或 no-regression ref 写成质量、发表、fundability、visual/export verdict。

## L4 Structural Baseline 成功标准

- 品牌边界清楚：`Vault` 只承接 evidence、receipt、typed blocker、artifact lineage、restore、retention 和 no-regression refs。
- 合同边界清楚：evidence event、state index、stage artifact runtime、owner receipt 和 typed blocker 都有 schema / contract ref。
- 多 surface 同源：CLI、App/operator、descriptor delegates、framework readiness 和 evidence-worklist 都从同一 refs-only ledger / locator / receipt refs 派生。
- 可验证：每个 closeout、blocker、route-back、restore、retention、no-regression 都能定位 owner、source ref、fold state 和验证入口。
- Authority fail-closed：缺失或冲突证据生成 owner workorder、typed blocker requirement 或 route-back，不猜测补齐，不写 ready claim。
