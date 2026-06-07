# OPL Vault

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态与 L4 验收说明。机器真相继续归 evidence contracts、runtime ledgers、domain-owned receipts、artifact locators、source manifests、CLI/API 行为、App read-model 和测试输出。

## 品牌定位

`OPL Vault` 是 OPL 的证据、receipt、typed blocker 和 artifact lineage 模块。它让每个关键推进、阻塞、审核、恢复、移交和 no-regression 都能留下可审计 refs。

一句话：`Vault` 管“哪些证据存在、谁签了什么、为什么没继续、产物 lineage 指向哪里”。

## 真实 L4 口径

`Vault` 达到真实 Workspace 级 `L4` 时，不能只依赖 `contracts/opl-framework/brand-module-registry.json` 里的模块描述。它必须像 `OPL Workspace` 一样具备独立对象模型、schema/contract、专属 CLI family、App action/read-model、doctor/validate、测试覆盖和状态文档。

当前 registry 已记录 Vault 的结构入口和 authority boundary；模块级 `opl vault ...` CLI、App action/read-model 与 focused tests 落地后，才可声明 Vault 达到真实 Workspace 级 L4。

## 核心对象模型

| 对象 | 作用 | L4 验收要点 |
| --- | --- | --- |
| `vault_profile` | Vault 模块身份、refs-only policy、retention policy 和 authority flags。 | `status/inspect/interfaces` 必须返回 profile、contract refs、body-free policy、forbidden claims。 |
| `evidence_ref` | body-free evidence locator。 | `validate` 必须验证 ref shape、hash/locator/source binding，不读取 body。 |
| `vault_event` | record/verify/fold/restore/no-regression 等事件 envelope。 | `inspect` 必须能展示 event type、owner、source ref、fold state 和 freshness。 |
| `owner_receipt_ref` | domain owner 签发的完成/移交凭据引用。 | Vault 只能验证引用和绑定，不能签发或接受 receipt。 |
| `typed_blocker_ref` | domain / OPL / human owner 明确阻塞引用。 | `doctor` 必须能识别缺失、stale 或 orphan blocker ref。 |
| `quality_gate_receipt_ref` | 独立审核 attempt 输出引用。 | `validate` 必须防止把 gate evidence 写成 quality verdict。 |
| `artifact_lineage_ref` | artifact 从 source 到 stage output 到 export 的 lineage。 | `inspect` 必须展示 locator、hash、stage binding、package/export refs。 |
| `restore_proof_ref` | artifact/runtime/source 可恢复性证明引用。 | `doctor` 必须指出 missing restore proof 或 stale restore proof。 |
| `no_regression_ref` | 修改或迁移后的无回归证明引用。 | `validate` 必须区分 no-regression evidence 与 domain ready。 |
| `state_index_projection` | refs-only read-model / search index 投影。 | `doctor` 必须发现 stale index，但不能把 index 当 truth store。 |

## Schema / Contract

真实 L4 至少绑定这些机器 contract：

```text
contracts/opl-framework/evidence-vault-event.schema.json
contracts/opl-framework/state-index-kernel-contract.json
contracts/opl-framework/stage-artifact-runtime-contract.json
contracts/opl-framework/role-artifact-ref.schema.json
contracts/opl-framework/stage-owner-receipt.schema.json
contracts/opl-framework/stage-typed-blocker.schema.json
contracts/opl-framework/brand-module-registry.json#modules.vault
```

Vault contract 的职责是表达 evidence event、refs-only locator、receipt/blocker refs、artifact lineage、restore proof、retention、no-regression 和 state-index projection 的 shape。它不表达 artifact body、memory body、paper/grant/visual body、domain quality verdict 或 owner acceptance。

## 模块级 CLI Family

真实 L4 必须有专属 CLI family，并继续把底层实现委托给 evidence-vault/state-index/stage-artifact 真实 source。

| 命令 | 验收说明 |
| --- | --- |
| `opl vault status --json` | 返回 Vault profile、refs-only policy、evidence ledger summary、receipt/blocker counts、artifact lineage summary、state index freshness、open evidence workorders 和 forbidden claim flags。 |
| `opl vault inspect --evidence <ref> --json` | 返回 evidence ref 的 event envelope、source binding、hash/locator、owner、fold state 和 freshness，不读取 body。 |
| `opl vault inspect --artifact <ref> --json` | 返回 artifact lineage、stage binding、receipt refs、restore/no-regression refs 和 package/export refs。 |
| `opl vault inspect --receipt <ref> --json` | 返回 owner receipt 或 quality gate receipt 的引用、绑定、issuer、scope 和验证状态。 |
| `opl vault interfaces --json` | 返回 CLI command specs、App action ids、read-model keys、descriptor delegates、contract refs、validation commands 和 status docs。 |
| `opl vault validate --json` | 静态验证 registry refs、contract refs、event schemas、artifact refs、receipt/blocker refs、state-index projection、authority flags 和 forbidden claims。 |
| `opl vault doctor --json` | 诊断 stale index、missing hash、orphan ref、body leakage risk、missing restore proof、missing no-regression ref 和 evidence foldback 缺口。 |

允许复用的底层现有 surface：

```text
opl index doctor --json
opl index integrity-check --json
opl index rebuild --json
opl stage-artifact validate --json
opl stage-artifact status --json
opl family-runtime evidence-worklist --detail full --json
opl runtime app-operator-drilldown --detail full --json
opl brand-modules inspect --module vault --json
```

这些 surface 是 Vault 的 source/delegate，不足以单独构成真实 L4；真实 L4 需要 `opl vault status|inspect|interfaces|validate|doctor` 成为用户和 App 可消费的模块级入口。

## App Action / Read-Model

真实 L4 必须给 App 和 operator 提供 Vault 自身读面：

| Surface | 验收说明 |
| --- | --- |
| `app_action:vault_status` | 只读 status action，delegated surface 为 `opl vault status --json`。 |
| `app_action:vault_inspect` | 只读 drilldown action，支持 evidence、artifact、receipt、blocker scope。 |
| `app_action:vault_validate` | 结构验证 action，返回 checked refs、missing refs、body-free policy 和 authority flags。 |
| `app_action:vault_doctor` | 诊断 action，返回 stale/orphan/missing evidence、state-index freshness 和 repair plan。 |
| `read_model.vault.evidence_summary` | body-free evidence ledger summary 和 open workorders。 |
| `read_model.vault.receipt_blocker_index` | owner receipt refs、typed blocker refs、quality gate refs 的引用索引。 |
| `read_model.vault.artifact_lineage` | stage artifact lineage、restore proof、retention 和 no-regression refs。 |
| `read_model.vault.index_freshness` | state-index freshness 与 rebuild requirement，不声明 truth ownership。 |

App read-model 只投影 Vault refs。它不得把 `evidence-worklist zero-open`、`verified refs`、`fresh index` 或 `restore proof present` 写成 domain ready、artifact ready、quality verdict 或 production ready。

## Validate / Doctor

`validate` 是结构门：

- registry entry、contract refs、CLI specs、App action specs、descriptor delegates 和 status docs 必须齐全。
- evidence event、artifact locator、receipt ref、typed blocker ref、quality gate ref、restore/no-regression ref 和 state-index projection 必须可被机器验证。
- refs-only policy 必须可验证：Vault 不能读取或保存 memory/artifact/paper/grant/visual body。

`doctor` 是证据健康门：

- stale state index、missing hash、missing source locator、orphan receipt/blocker、missing restore proof、missing no-regression ref 和 foldback gap 必须形成 explicit blocker 或 workorder。
- body leakage、truth-store confusion、owner receipt spoofing 和 quality verdict claim 必须 fail closed。
- repair plan 只能指向 refs、index、locator、restore proof 或 no-regression 修复；domain acceptance 必须留给 domain owner。

## 测试覆盖

真实 L4 至少需要 focused tests 覆盖：

- `opl vault status|inspect|interfaces|validate|doctor --json` 的 public help、JSON shape 和 error envelope。
- `vault` module registry refs 与 CLI/App/descriptor/validation refs 一致。
- evidence event schema、artifact lineage、owner receipt ref、typed blocker ref、state-index stale fixture。
- App action catalog 中 `vault_*` actions 的 delegated surface 与 read-model keys。
- forbidden claims negative guards：verified refs、fresh index 或 zero-open worklist 不得授权 domain ready / artifact authority / quality verdict。

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
