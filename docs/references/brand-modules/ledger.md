# OPL Ledger

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态与 L4/L5 边界说明。机器真相继续归 evidence contracts、runtime ledgers、domain-owned receipts、artifact locators、source manifests、CLI/API 行为、App read-model 和测试输出。
Currentness policy: 本文不冻结 Ledger L4 状态、evidence ledger counts、verified refs、fresh index 状态、restore proof、no-regression refs、App projection 或 production maturity。当前 Ledger 结构状态必须从 fresh `opl ledger status|validate|doctor --json`、evidence contracts、runtime ledgers、source/tests、App read-model 和 domain owner surfaces 读取。

## 品牌定位

`OPL Ledger` 是 OPL 的证据、receipt、typed blocker 和 artifact lineage 模块。它让每个关键推进、阻塞、审核、恢复、移交和 no-regression 都能留下可审计 refs。

一句话：`Ledger` 管“哪些证据存在、谁签了什么、为什么没继续、产物 lineage 指向哪里”。

## 当前 L4 / L5 口径

Fresh readback can support reading `Ledger` as Workspace 级 `L4_structural_baseline`。判断 SSOT 不是 registry 文案本身，而是 `contracts/opl-framework/brand-module-surfaces.json#modules.ledger`、`opl ledger status|inspect|interfaces|validate|doctor --json`、App action/read-model refs、focused tests 和 [完成度对照](./current-maturity-against-workspace.md) 的组合。

该声明只覆盖结构完成度：Ledger 有独立对象模型、schema/contract、模块级 CLI family、App/operator projection、validate/doctor、测试和状态文档。它不表示 artifact/memory body authority 已迁给 OPL，不表示 domain owner 已签收，也不表示 quality verdict、artifact ready、domain ready 或 production ready。`L5 production operating maturity` 继续归 L5 evidence contract 与真实 owner evidence。

## 核心对象模型

| 对象 | 作用 | L4 验收要点 |
| --- | --- | --- |
| `ledger_profile` | Ledger 模块身份、refs-only policy、retention policy 和 authority flags。 | `status/inspect/interfaces` 必须返回 profile、contract refs、body-free policy、forbidden claims。 |
| `evidence_ref` | body-free evidence locator。 | `validate` 必须验证 ref shape、hash/locator/source binding，不读取 body。 |
| `ledger_event` | record/verify/fold/restore/no-regression 等事件 envelope。 | `inspect` 必须能展示 event type、owner、source ref、fold state 和 freshness。 |
| `owner_receipt_ref` | domain owner 签发的完成/移交凭据引用。 | Ledger 只能验证引用和绑定，不能签发或接受 receipt。 |
| `typed_blocker_ref` | domain / OPL / human owner 明确阻塞引用。 | `doctor` 必须能识别缺失、stale 或 orphan blocker ref。 |
| `quality_gate_receipt_ref` | 独立审核 attempt 输出引用。 | `validate` 必须防止把 gate evidence 写成 quality verdict。 |
| `artifact_lineage_ref` | artifact 从 source 到 stage output 到 export 的 lineage。 | `inspect` 必须展示 locator、hash、stage binding、package/export refs。 |
| `restore_proof_ref` | artifact/runtime/source 可恢复性证明引用。 | `doctor` 必须指出 missing restore proof 或 stale restore proof。 |
| `no_regression_ref` | 修改或迁移后的无回归证明引用。 | `validate` 必须区分 no-regression evidence 与 domain ready。 |
| `state_index_projection` | refs-only read-model / search index 投影。 | `doctor` 必须发现 stale index，但不能把 index 当 truth store。 |

## Schema / Contract

当前 L4 绑定这些机器 contract：

```text
contracts/opl-framework/evidence-ledger-event.schema.json
contracts/opl-framework/state-index-kernel-contract.json
contracts/opl-framework/stage-artifact-runtime-contract.json
contracts/opl-framework/role-artifact-ref.schema.json
contracts/opl-framework/artifact-provenance-bundle.schema.json
contracts/opl-framework/artifact-provenance-ledger-event.schema.json
contracts/opl-framework/stage-owner-receipt.schema.json
contracts/opl-framework/stage-typed-blocker.schema.json
contracts/opl-framework/brand-module-registry.json#modules.ledger
```

Ledger contract 的职责是表达 evidence event、refs-only locator、receipt/blocker refs、artifact lineage、restore proof、retention、no-regression 和 state-index projection 的 shape。它不表达 artifact body、memory body、paper/grant/visual body、domain quality verdict 或 owner acceptance。

`artifact-provenance-bundle.schema.json` 是 Ledger 的通用 artifact provenance bundle 基座：只允许 `schema_version`、`bundle_id`、`artifact_ref`、`domain_id`、`artifact_type`、`created_at`、`refs`、`missing_refs`、`restricted_refs`、`typed_issues`、`hashes` 和 `authority_boundary`。Ledger 可以登记 manifest ref/hash、section refs、typed issues 与 index keys，但不能读取或保存 artifact body。

`artifact-provenance-ledger-event.schema.json` 约束 `record / inspect / doctor / export` 这四类 bundle 事件。事件只保存 bundle ref、manifest hash、section refs、typed issues 和 refs-only authority boundary；不得写 artifact body、domain truth、owner receipt、typed blocker、quality verdict、artifact ready、domain ready、export ready、production ready 或 release ready claim。

## Artifact Provenance Bundle 物理存放与读回

Bundle body 由 domain workspace 或导出包持有，Ledger 只登记 refs。推荐每个 artifact 一个目录，例如：

```text
paper/build/provenance/figures/<figure_id>/bundle.json
paper/build/provenance/figures/<figure_id>/ro-crate-metadata.json
paper/build/provenance/figures/<figure_id>/code/
paper/build/provenance/figures/<figure_id>/inputs/manifest.json
paper/build/provenance/figures/<figure_id>/outputs/manifest.json
paper/build/provenance/figures/<figure_id>/environment/manifest.json
paper/build/provenance/figures/<figure_id>/agent_trace/manifest.json
paper/build/provenance/figures/<figure_id>/reviews/manifest.json
paper/build/provenance/figures/<figure_id>/replay/manifest.json
```

`bundle.json` 是 Ledger 消费的 manifest。它列出 `code / inputs / outputs / environment / agent_trace / reviews / replay` 的 refs 与 hash，不内嵌正文；无法公开或暂缺的材料写入 `restricted_refs` 或 `missing_refs`，CLI 会投影为 `code / severity / ref / message / action` typed issues。

OPL 默认状态文件是：

```text
$OPL_STATE_DIR/artifact-provenance-bundles.json
```

AI / App / 用户的最小流程：

```text
opl ledger bundle validate --bundle <bundle.json> --json
opl ledger bundle record --bundle <bundle.json> --domain <domain_id> --artifact <artifact_ref> --json
opl ledger bundle inspect --artifact <artifact_ref> --json
opl ledger bundle export --bundle <bundle.json> --format ro-crate --json
```

`inspect --artifact` 只查 `$OPL_STATE_DIR/artifact-provenance-bundles.json` 中已经 record 的 bundle record，不读取 artifact body，也不把 record 存在解释为 artifact ready、quality verdict 或 owner acceptance。需要直接审 manifest 时继续使用 `inspect --bundle <path>`。

## 模块级 CLI Family

当前 L4 由专属 CLI family 承担，并继续把底层实现委托给 evidence-ledger/state-index/stage-artifact 真实 source。

| 命令 | 验收说明 |
| --- | --- |
| `opl ledger status --json` | 返回 Ledger profile、refs-only policy、evidence ledger summary、receipt/blocker counts、artifact lineage summary、state index freshness、open evidence workorders 和 forbidden claim flags。 |
| `opl ledger inspect --evidence <ref> --json` | 返回 evidence ref 的 event envelope、source binding、hash/locator、owner、fold state 和 freshness，不读取 body。 |
| `opl ledger inspect --artifact <ref> --json` | 返回 artifact lineage、stage binding、receipt refs、restore/no-regression refs 和 package/export refs。 |
| `opl ledger inspect --receipt <ref> --json` | 返回 owner receipt 或 quality gate receipt 的引用、绑定、issuer、scope 和验证状态。 |
| `opl ledger interfaces --json` | 返回 CLI command specs、App action ids、read-model keys、descriptor delegates、contract refs、validation commands 和 status docs。 |
| `opl ledger validate --json` | 静态验证 registry refs、contract refs、event schemas、artifact refs、receipt/blocker refs、state-index projection、authority flags 和 forbidden claims。 |
| `opl ledger doctor --json` | 诊断 stale index、missing hash、orphan ref、body leakage risk、missing restore proof、missing no-regression ref 和 evidence foldback 缺口。 |
| `opl ledger bundle validate --bundle <path> --json` | 验证 Artifact Provenance Bundle manifest 的 refs/hash/authority shape，不读取 artifact body。 |
| `opl ledger bundle inspect --bundle <path> --json` | 读取 bundle manifest 并展示 refs、hashes、authority boundary 和 validation 结果，不读取 artifact body。 |
| `opl ledger bundle inspect --artifact <ref> --json` | 从 `$OPL_STATE_DIR/artifact-provenance-bundles.json` 查找已 record 的 bundle record，返回 refs、sections、typed issues 和 manifest ref/hash，不读取 artifact body。 |
| `opl ledger bundle record --bundle <path> --domain <id> --artifact <ref> --json` | 在 OPL 默认 state 登记 bundle manifest ref/hash、domain/artifact index 与 refs-only evidence，不保存 body。 |
| `opl ledger bundle export --bundle <path> --format ro-crate --json` | 生成最小 RO-Crate metadata 投影，不新增依赖、不写 domain truth。 |
| `opl ledger bundle doctor --bundle <path> --json` | 诊断 bundle manifest 缺字段、hash shape、refs-only authority 和 body field 风险。 |

允许复用的底层现有 surface：

```text
opl index doctor --json
opl index integrity-check --json
opl index rebuild --json
opl stage-artifact validate --json
opl stage-artifact status --json
opl family-runtime evidence-worklist --detail full --json
opl runtime app-operator-drilldown --detail full --json
opl brand-modules inspect --module ledger --json
```

这些 surface 是 Ledger 的 source/delegate。模块级 L4 以 `opl ledger status|inspect|interfaces|validate|doctor --json` 和 `brand-module-surfaces.json#modules.ledger` 为验收入口，底层 delegate 不能单独替代模块自身读面。

## App Action / Read-Model

当前 L4 给 App 和 operator 提供 Ledger 自身读面：

| Surface | 验收说明 |
| --- | --- |
| `app_action:ledger_status` | 只读 status action，delegated surface 为 `opl ledger status --json`。 |
| `app_action:ledger_inspect` | 只读 drilldown action，支持 evidence、artifact、receipt、blocker scope。 |
| `app_action:ledger_validate` | 结构验证 action，返回 checked refs、missing refs、body-free policy 和 authority flags。 |
| `app_action:ledger_doctor` | 诊断 action，返回 stale/orphan/missing evidence、state-index freshness 和 repair plan。 |
| `read_model.ledger.evidence_summary` | body-free evidence ledger summary 和 open workorders。 |
| `read_model.ledger.receipt_blocker_index` | owner receipt refs、typed blocker refs、quality gate refs 的引用索引。 |
| `read_model.ledger.artifact_lineage` | stage artifact lineage、restore proof、retention 和 no-regression refs。 |
| `read_model.ledger.index_freshness` | state-index freshness 与 rebuild requirement，不声明 truth ownership。 |

App read-model 只投影 Ledger refs。它不得把 `evidence-worklist zero-open`、`verified refs`、`fresh index` 或 `restore proof present` 写成 domain ready、artifact ready、quality verdict 或 production ready。

## Validate / Doctor

`validate` 是结构门：

- registry entry、contract refs、CLI specs、App action specs、descriptor delegates 和 status docs 必须齐全。
- evidence event、artifact locator、receipt ref、typed blocker ref、quality gate ref、restore/no-regression ref 和 state-index projection 必须可被机器验证。
- refs-only policy 必须可验证：Ledger 不能读取或保存 memory/artifact/paper/grant/visual body。

`doctor` 是证据健康门：

- stale state index、missing hash、missing source locator、orphan receipt/blocker、missing restore proof、missing no-regression ref 和 foldback gap 必须形成 explicit blocker 或 workorder。
- body leakage、truth-store confusion、owner receipt spoofing 和 quality verdict claim 必须 fail closed。
- repair plan 只能指向 refs、index、locator、restore proof 或 no-regression 修复；domain acceptance 必须留给 domain owner。

## 测试覆盖

当前 L4 focused tests 覆盖：

- `opl ledger status|inspect|interfaces|validate|doctor --json` 的 public help、JSON shape 和 error envelope。
- `ledger` module registry refs 与 CLI/App/descriptor/validation refs 一致。
- evidence event schema、artifact lineage、owner receipt ref、typed blocker ref、state-index stale fixture。
- App action catalog 中 `ledger_*` actions 的 delegated surface 与 read-model keys。
- forbidden claims negative guards：verified refs、fresh index 或 zero-open worklist 不得授权 domain ready / artifact authority / quality verdict。

## Authority Boundary

| Ledger 可以做 | Ledger 不可以做 |
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
