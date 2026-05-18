# OPL 生产级框架闭环差距矩阵

Owner: `One Person Lab`
Purpose: 记录 OPL 距离完整生产级智能体框架的当前差距、证据门和下一跳闭环。
State: `active_plan`
Machine boundary: 本文是人读 gap matrix。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 与真实 workspace / App evidence。
Date: `2026-05-18`

## 当前判断

如果把理想状态定义为“OPL 能生产级托管 MAS/MAG/RCA 的长时间 stage attempt，同时 direct skill path 等价、domain truth 不迁出、旧默认面退役干净”，当前只能写成：framework/control-plane 与 closeout read model 已进入 live-soak-ready 基础面，production closure 尚未完成。

已经成立的是 OPL framework 骨架和读模型：Temporal provider、typed queue、stage attempt ledger、typed closeout、provider proof/readiness projection、functional runtime harness、generic substrate projection、transition runner/read model、domain pack compiler handoff、Agent Lab 和 private functional audit。

仍未闭合的是 production consumption 和真实 owner-chain：

- generated surface 还未成为 MAS/MAG/RCA 的生产默认 caller；
- App/operator drilldown 还未产品化；
- lifecycle / artifact / memory locator 与 domain receipt 还未持续对账；
- Temporal provider SLO / repair cadence 还缺长窗口证据；
- domain repo 内的 private platform residue 还需要 active caller cutover、refs-only 收薄、物理删除或 tombstone；
- MAS/MAG/RCA 的真实 owner receipt chain、memory body/writeback apply、artifact mutation receipt 和 controlled long soak 仍需 scaleout。

过程性 proof、receipt 事件、具体 task id 和阶段 closeout 摘要不放在本矩阵，统一归档到 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。

## Closure Gap Matrix

| gap | 当前已落地 | 未闭合内容 | 下一跳完成门槛 |
| --- | --- | --- | --- |
| `production_temporal_residency` | Temporal 是 production required provider；`local_sqlite` 已降为 dev/CI/offline diagnostic baseline；provider proof/status/readiness 可读。 | 自动或受监督 cadence、overdue repair execution receipt、restart/re-query/signal/history 长窗口证据和真实 domain attempt 压测仍未闭合。 | Temporal production proof 按 cadence 持续可重复通过，并用长窗口 SLO 证明 service/worker/workflow/query/signal/history/restart recovery 不退化。 |
| `generated_surface_production_consumption` | `domain-pack-compiler` 已能投影 CLI/MCP/product-entry/sidecar/status/workbench/harness handoff metadata。 | MAS/MAG/RCA 生产默认 caller 仍未全面迁到 OPL generated/hosted surface；domain 手写 wrapper 仍是迁移桥。 | 生产 caller 切到 OPL generated/hosted surface；domain repo 只保留 domain handler、refs-only adapter、authority function 或 diagnostic cleanup。 |
| `app_operator_drilldown` | runtime snapshot、stage attempt、substrate projection、transition evidence 和 production closeout readiness 已有 read model。 | One Person Lab App 尚未将 route graph、review/repair queue、artifact gallery、package/export lifecycle、memory refs、quality/readiness、SLO 和 safe actions 做成人用 drilldown。 | App/workbench 能按 owner 展示 provider、attempt、source/artifact/memory refs、blocker、repair 和 action routing，并且不产生 domain verdict。 |
| `mas_paper_line_guarded_apply_soak` | MAS 三条真实 paper line 已有 OPL-ingestable refs/read-only evidence；OPL 禁止写 MAS truth 的边界可见。 | 多条真实 paper line 的 provider-hosted apply、owner receipt、progress delta、AI reviewer/gate/artifact movement、human gate 或 stable typed blocker 仍需 scaleout。 | MAS 每条主线都产出 owner receipt、progress delta 或 typed blocker；OPL 只持 attempt/proof/ref，不写 `publication_eval`、`controller_decisions`、artifact gate、review ledger、memory body 或 final verdict。 |
| `mag_controlled_soak` | MAG 已有 grant transition oracle、receipt reconciliation proof、refs-only handoff surface 和 owner receipt contract。 | 真实 OPL-hosted grant-stage attempt、持续 owner receipt / typed blocker / no-regression evidence 和 long soak 未闭合。 | MAG controlled transition / stage attempt 在真实 workspace 中持续返回 owner receipt、typed blocker 或 no-regression evidence；fundability/export authority 仍归 MAG。 |
| `rca_controlled_soak` | RCA 已有 visual transition spec/evaluator、hosted-attempt receipt shape、workspace receipt inventory 和 no-regression refs-only projection。 | 真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout 和 long visual-stage no-regression evidence 未闭合。 | RCA controlled visual / transition attempt 接到真实 provider evidence，并返回 domain receipt、no-regression evidence 或 typed blocker；visual verdict/export gate 仍归 RCA。 |
| `domain_memory_apply_generalization` | MAS/MAG/RCA 都有 memory descriptor、body-free refs、writeback proposal/receipt ref 和 forbidden-write boundary。 | 真实 memory body migration/retrieval/writeback apply、accepted/rejected receipt scaleout 和 operator proof 仍归 domain workspace owner。 | 三仓都能用 domain-owned surface 产出真实 memory consumed/writeback receipt；OPL 只展示 locator、attempt/proof/ref 和 blocker。 |
| `lifecycle_guarded_apply` | OPL lifecycle schema / locator / refs-only index 基础已存在，domain 仓暴露 guarded apply proof 或 receipt requirement refs。 | cleanup/restore/retention 与真实 workspace artifact mutation receipt 的持续对账还未闭合。 | OPL-owned ledger/locator 只写 framework refs；domain-owned artifact mutation 必须返回 domain receipt 或 typed blocker。 |
| `generic_state_machine_runner` | OPL 已有 domain-neutral transition schema、runner、matrix runner、receipt/projection envelope 和 refs-only transition bridge projection。 | MAS/MAG/RCA 真实 sidecar dispatch 后的 accepted owner receipt、typed blocker/no-regression evidence 和 long-soak matrix evidence 仍需 scaleout。 | Domain 提供 transition table、guard、oracle fixture、typed blocker 和 owner receipt；OPL 只执行 spec、审计 matrix、hydrate provider task 和投影 refs。 |
| `physical_skeleton_layout` | OPL read model 能区分 descriptor readiness、skeleton audit、repo-source anchor evidence 和 production closure gaps。 | 三仓破坏性目录迁移未执行；直接移动仍可能破坏 direct skill path、provenance refs 或 workspace boundary。 | direct/hosted parity、restore/provenance proof、focused tests 与 no-forbidden-write proof 稳定后，逐仓迁移 repo-source schema/adapter/builder/prompt/skill/knowledge refs；workspace artifacts 不迁入 repo skeleton。 |
| `legacy_active_path_retirement` | 默认语义已转为 Codex-default executor + Temporal-backed provider；旧名只允许在 diagnostic、fixture、provenance、history 或 negative guard 语境中出现。 | Hermes/Gateway/frontdoor/local-manager/MDS/default-compat 仍可能有物理残留或文档残留。 | replacement proof 与 no-active-caller proof 同时通过后，删除 active residue 或迁入 history/tombstone；不保留兼容接口。 |
| `executor_adapter_hygiene` | `codex_cli` 是默认 executor；`hermes_agent`、Claude Code 等是显式非默认 adapter。 | 非默认 adapter 的 receipt gate、tool-event proof、timeout、closeout 和 fail-closed 仍需按 route 验证；旧 Hermes provider/readiness/Gateway 词汇不得回流。 | 非默认 adapter 只证明连接和回执，不承诺 domain quality；旧 provider/Gateway/compat 面清理到 history/tombstone。 |

## 统一口径

可以写成：

OPL 已具备完整生产级智能体框架的控制面骨架，并已进入 live-soak-ready 基础面；Temporal 是 production required provider；MAS/MAG/RCA 的 descriptor、stage/action/memory、transition refs、owner receipt refs 和 authority boundary 已能被 OPL 只读消费。

不能写成：

- OPL 已全量生产可用。
- MAS paper closure、MAG grant-stage soak、RCA visual-stage soak 已完成。
- generated surface production caller 已全部切换。
- App/workbench 已完整产品化。
- private functional audit 分类完成等于代码路径物理清零。
- provider completion 等于 domain ready、quality ready、fundability ready、visual ready 或 export ready。

## 下一跳顺序

1. `generated_surface_production_consumption`
2. `App/operator drilldown productization`
3. `MAS paper-line guarded apply scaleout`
4. `Temporal provider continuous proof / SLO cadence`
5. `transition owner receipt / no-regression evidence on OPL bridge`
6. `domain memory/lifecycle apply generalization`
7. `MAG/RCA controlled soak`
8. `physical skeleton layout`
9. `legacy physical retirement`

每一步都必须留下 repo-native verification、domain owner receipt、no-regression evidence 或 typed blocker；没有 fresh evidence 不写完成。
