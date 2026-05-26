# OPL 生产级框架闭环差距矩阵

Owner: `One Person Lab`
Purpose: `production_closure_gap_matrix`
State: `active_plan`
Machine boundary: 本文是人读 gap matrix。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 与真实 workspace / App evidence。
Date: `2026-05-26`

## 文档职责

本文只维护 OPL 距离生产级 framework closure 的当前差距矩阵、完成口径和验证入口。它不再保存 provider proof、receipt 事件、workorder 计数、具体命令输出、分支名或 dated closeout 流水。

需要当前动态读数时，直接读取机器面：

- `opl framework readiness --family-defaults --json`
- `opl agents readiness --family-defaults --json`
- `opl agents conformance --family-defaults --json`
- `opl agents interfaces --domain <domain> --json`
- `opl stages readiness --domain <domain> --json`
- `opl runtime app-operator-drilldown --json`
- `opl runtime app-operator-drilldown --detail full --json`
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`

过程性 proof、receipt 事件和本文件瘦身前的 active-ledger 读法归入 [2026-05-22 OPL active ledger consolidation](../history/process/plans/2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md) 与既有过程归档。旧记录只作 provenance，不恢复为 active checklist。

## 当前判断

OPL 当前已经具备生产级智能体框架的主要控制面骨架：Temporal-backed provider、typed queue、stage attempt ledger、retry/dead-letter、human gate transport、safe runtime action shell、external evidence refs-only ledger、stage evidence accounting、App/operator drilldown、generated surface read model、private functional audit、standard conformance、Agent Lab 与 lifecycle/source/artifact/memory refs-only primitives。

当前仍不能写成全量 production ready。Strict standard-agent source-purity 已清理干净：fresh conformance 为 4/4 passed、0 blocked，fresh default-callers 为 32 surfaces、0 blocked surfaces、0 missing deletion-evidence requirements。剩余闭环尾项集中在三类：

1. MAS/MAG/RCA 的 domain owner-chain receipts、typed blockers、memory/artifact/lifecycle receipts 与 long-soak scaleout。
2. RCA naming hygiene 已进入 guarded / monitor-only 口径；production evidence tail 仍需真实 visual owner receipt、artifact-producing receipt、visual memory reuse、workspace receipt scaleout 与 repeated no-regression evidence。
3. MAG production long-soak 与 owner/human evidence 仍需真实 grant-owned receipt、typed blocker 或 no-regression evidence；OPL 不代签 production evidence。

App release / real user path evidence、Codex App runtime evidence 与 New Agent / OPL Meta Agent production-consumption 的当前 gate 已有 verified refs：App `26.5.19` cohort 五类 gate 均 observed，active typed blocker 清零；Codex App runtime evidence 读为 `temporal_hosted_long_soak_refs` verified、open gate 0、`production_long_soak_claimed=false`；OMA managed install/update、App live path、owner receipt / typed blocker scaleout 和 verified long-soak ref 均 observed。它们只关闭各自 refs-only evidence gate，不授权 App release ready、Codex App production ready、OMA domain truth、MAS/MAG/RCA ready 或 family production ready。

OPL readiness、provider proof、generated surface proof、legacy cleanup ledger、conformance pass、stage evidence workorder accounting 或 refs-only typed blocker roundtrip，都只能定位控制面和证据缺口。它们不能授权 MAS paper closure、MAG grant readiness、RCA visual ready、App release ready、artifact authority、memory writeback 或 production-ready verdict。

当前直接清理原则是：production closure 只接受目标态 owner surface 上的真实证据。旧模块、旧接口、旧测试、旧 CLI alias、compat wrapper、facade、历史 gateway/frontdoor/Hermes-first 文案和已替代文档入口，不作为“兼容性资产”保留；如果后续重新出现 active repo-local generic caller / wrapper / shell，必须 fail closed 到 cleanup，而不是写成标准智能体组成。

## Closure Gap Matrix

| gap | 当前已落地 | 未闭合内容 | 完成口径 |
| --- | --- | --- | --- |
| `framework_control_plane` | Provider-backed stage runtime、typed queue、attempt ledger、safe action shell、App/operator drilldown 与 evidence worklist read model 已形成统一控制面。 | 需要持续保持同源读面，避免新增命令、App 卡片或文档自行推断 readiness / owner / production status。 | 默认 summary 和 drilldown 均消费同一机器 payload；新增 surface 只作派生投影，不制造第二真相。 |
| `strict_standard_agent_source_purity` | 已闭合。Conformance 当前读为通过，domain contracts 已能声明 standard pack / authority / residue 分类；default-callers 当前读为 32 surfaces、0 blocked、0 missing deletion-evidence requirements。 | 没有 structural source-purity blocker。剩余是 production evidence、domain physical-delete authority 与 no-resurrection 防回归。 | 标准智能体 active source 只保留 domain pack、machine-readable contract、standard authority function、domain handler target、domain-specific implementation 和必要 native helper；generic control plane、default caller、workbench、sidecar、session、queue、lifecycle、wrapper 均由 OPL 生成/托管，域仓副本删除。 |
| `semantic_hygiene_guard_surface` | Provider readiness single truth、generated surface gate、summary-first App drilldown、family-runtime parser split、stage launch guarantee clarity、legacy vocabulary hygiene、expert-judgment floor 和 functional privatization explicit semantic-equivalence refs 已有守门面。 | 后续 surface 容易重新把 descriptor/readiness/proof 写成 domain ready，或把 domain 未给出 explicit semantic-equivalence refs 的 adapter 直接按文字启发式放行。 | Focused tests、contracts 和文档同时阻断 `proof/readiness = domain verdict` 的误读；semantic-equivalence closeout 只能来自 domain-owned explicit status / evidence / typed-blocker / no-regression refs，OPL fallback heuristic 只用于发现 review-required。 |
| `provider_slo_long_window` | Temporal 是 production required provider；local provider 只作 dev/CI/offline diagnostic baseline。 | 仍需长期 provider cadence/capability evidence，并证明 domain owner-chain dispatch 不退化。 | Provider window 持续 satisfied，且 domain/App/live evidence 继续返回 owner receipt、typed blocker 或 no-regression refs。 |
| `app_release_user_path` | App/operator drilldown 已能消费 provider cadence、domain evidence、stage evidence、cleanup plan 和 safe action route；默认 `app_release_user_path_evidence` gate 会把 release package、screenshot、reload prompt user path、provider state linkage 和 long operator evidence 五类 required refs 投给 App/live operator 或 release owner，并可通过 `runtime action execute` 的 App release/user-path evidence record/verify route 写入 OPL refs-only evidence ledger，消费真实 refs 或 typed blocker refs，同时保持 false authority flags。record route、App `evidence_next_steps` 和 framework review action 现在携带 `opl_app_release_user_path_evidence_payload_workorder`，把真实同 cohort App release/user-path refs path 与 release-owner typed blocker path 明确为机器字段；该 workorder 还给默认 caller 暴露 `long-operator start|event|finish` observation command set、`record --payload-file` 和 `verify --receipt-ref`，但这些 path / command 都不能关闭 release ready、production ready 或 App release user path；`event` 只追加受控 operator observation event，`finish` 才在观察窗口和 required events 满足后物化 manifest / payload。read model 要求单一 release/user-path cohort；当前 verified `26.5.19` package/provider refs、真实已安装 App 窗口截图 receipt、startup-maintenance / first-run reload-check receipt 和同 cohort long operator evidence 已让五类 gate observed，active typed blocker 清零，historical typed blocker 只保留 provenance。 | 当前 refs-only evidence gate 已闭合；剩余风险是后续 release cohort 仍需重复提供真实 refs，且 open gate 清零不能外推为 App release ready 或 production ready。first-run `already-prepared` 日志只证明 reload-check / GUI preparation user path 已检查，不证明实际 reload 发生。 | App release artifact、截图、reload prompt、provider state linkage 与真实用户路径在同一 release/user-path cohort 下可重复证明；App/OPL 只展示 refs/action/typed blocker route，不写 domain truth、owner receipt、release-ready verdict 或 production verdict。 |
| `codex_app_runtime_evidence` | Codex App runtime evidence ledger 已记录并验证 1 条真实 `temporal_hosted_long_soak_refs` receipt；fresh App/operator drilldown 读为 `codex_app_runtime_evidence_open_gate_count=0`、`codex_app_runtime_evidence_verified_ledger_receipt_ref_count=1`、`codex_app_production_long_soak_claimed=false`、`codex_app_production_evidence_gate_remains_open=false`。 | 当前 refs-only evidence gate 已闭合；后续仍需按新窗口重复 observation / finish / record / verify，并且不能把 support-only refs、record-only receipt、operator log 或 provider SLO 本身外推为 production ready。 | Codex App 只承担启动、观察、介入和展示；OPL/Temporal 托管长跑任务。该 evidence surface 只记录/验证 refs，不写 domain truth、不创建 owner receipt、不生成 typed blocker、不声明 production ready。 |
| `domain_owner_chain_scaleout` | MAS/MAG/RCA 的 owner receipt refs、typed blocker refs、no-regression refs 可进入 OPL refs-only ledger。 | 多条真实 paper/grant/visual stage 仍需 owner receipt、typed blocker、human gate、quality/export/review receipt 或 long-soak evidence。 | Domain-owned receipt 或 typed blocker 关闭对应 stage / transition / owner-chain 缺口；OPL 只承载 transport、ledger 和 projection。 |
| `generated_surface_production_consumption` | Descriptor、stage/action/memory metadata、pack compiler、interfaces/conformance/readiness 均可被 OPL 识别和投影。 | 生产默认 caller、App/default consumption、direct/hosted parity 和 release/dist evidence 仍需 scaleout。 | MAS/MAG/RCA/OMA 生产入口使用 OPL generated/hosted surfaces；repo-local wrapper 不保留为最终 adapter，只保留 domain handler target 或 authority function。 |
| `MAS production evidence and no-resurrection` | MAS generic runtime owner 已通过 handoff/projection 归 OPL；旧 `runtime_transport` / SQLite / runner / worker lease 已按 no-alias retirement 读取，source-purity gate 已闭合。 | 真实 paper owner-chain、memory/artifact/lifecycle receipt、provider long-soak 和后续 no-resurrection guard 仍需持续验证。 | MAS 只保 medical study truth、publication gate、artifact/package authority、owner receipt / typed blocker 和 domain handler；OPL 不用兼容 facade 保留旧面，也不代签 paper closure 或 artifact authority。 |
| `MAG wrapper_and_runtime_shell_retirement` | 已按 structural/source-purity 闭合；MAG repo-side handler / refs-only / authority boundary 已闭合，且 default-caller deletion evidence 无缺口。 | 生产 grant-stage owner receipt、typed blocker、no-regression 与 long-soak evidence 仍需 scaleout。 | MAG 只保留 grant authority functions、transition oracle、owner receipt / typed blocker 和 domain handler；OPL 不代签 grant-ready 或 production evidence。 |
| `MAG controlled soak` | MAG transition oracle、owner receipt contract、refs-only handoff 与 grant authority boundary 已清晰，未发现需要保留的私有 generic control plane。 | 真实 OPL-hosted grant-stage attempt、持续 owner receipt / typed blocker / no-regression evidence、人类 gate 和 production long soak 未闭合。 | MAG 返回 grant-owned receipt、typed blocker 或 no-regression evidence；fundability/export authority 仍归 MAG，OPL 不代签 production evidence。 |
| `RCA controlled soak_and_naming` | RCA generated/hosted shell、legacy cleanup 和 visual authority boundary 已清晰；naming hygiene 已降为 guarded / monitor-only。 | 真实 artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout、long visual-stage no-regression evidence 未闭合；generic wrapper / executor adapter / operator projection shell 也应继续迁出 RCA active source。 | RCA 返回 visual-owned receipt、typed blocker、artifact-producing receipt 或 no-regression evidence；旧 `managed` 命名和 generic shell 只留 history/provenance，不留 active adapter。 |
| `memory_artifact_lifecycle_apply` | OPL 已持 locator/index/retention/restore refs-only primitives，domain repos 暴露 descriptor、proposal 或 receipt refs。 | 真实 memory body retrieval/writeback、accepted/rejected receipt、artifact mutation receipt 和 cleanup/restore/retention 对账仍需 scaleout。 | Domain-owned surface 产生真实 memory/artifact/lifecycle receipts；OPL 不保存 body、不判定 verdict。 |
| `new_domain_admission` | Standard agent skeleton、pack compiler、conformance/readiness 和 template consumption cohort 已有基础；scaffold consumption cohort 现在由生成模板本身提供 action catalog、generated-surface handoff targets、functional audit modules 和 physical source morphology policy，并重复穿过 scaffold validation、standard conformance、agent readiness 与 App/operator projection；`opl-meta-agent` 真实仓已通过 scaffold validation、generated interface、conformance 和 readiness structural consumption；App/framework 默认读面已把 OMA production-consumption follow-through 固定成 managed install/update、App live path、owner receipt / typed blocker scaleout 和 long-soak 四类 gate，并会把已观测到的 OPL-managed `oplmetaagent` install/update receipt、OPL refs-only App live path receipt、target owner receipt / typed blocker scaleout refs 与 verified long-soak ref 计为 observed。当前本机 App drilldown 读为 OMA `open_gate_ids=[]`、active `typed_blocker_refs=[]`、`production_consumption_ready=true`，historical typed blocker 只保留 provenance。 | 当前 OMA refs-only production-consumption gate 已闭合；后续 target cohort 仍需重新提供 managed install/update、App live evidence、owner receipt / typed blocker scaleout 和 verified long-soak refs。`oma-production-consumption` ledger 只记录/验证 refs，不启动长时运行、不生成 owner receipt、不写 OMA truth；recorded 但未 verify 的 receipt、typed blocker ref、operator evidence ref、event-only operator log 或未 record/verify 的 observation manifest 都不能替代 verified long-soak ref。 | 新 Agent 通过 scaffold validation、pack compiler、conformance/readiness、private surface policy、App/operator projection 和 focused tests；production closure 只按 owner receipt / typed blocker / App live evidence / managed install-update / verified long-soak refs 报告，当前 OMA gate 不外推到 family production ready。 |

## 统一口径

可以写成：

OPL 已具备 production framework control plane 的基础面，并能 refs-only 承载 MAS/MAG/RCA 的 descriptor、stage/action/memory metadata、owner receipt refs、typed blocker refs、provider receipt 和 App/operator drilldown。这个状态是继续收敛到标准 OPL Agent 的基础，不是三仓 production closure。

不能写成：

- OPL 已全量生产可用。
- MAS paper closure、MAG grant-stage soak、RCA visual-stage soak 已完成。
- Provider/SLO、generated surface、conformance、legacy cleanup 或 refs-only ledger verified 等于 App release/user path、domain owner-chain receipts、artifact/memory authority 或 long-soak 完成。
- Private functional audit / default-caller deletion evidence 清零等于 domain repo physical delete authorized。
- Refs-only adapter、diagnostic shell、tombstone/provenance code path 或 compatibility wrapper 是 generic control plane / default caller / product shell 的长期组成。
- Developer Mode repair route read model 等于真实 repo direct-fix / fork-PR owner acceptance closeout。
- 为兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。

## 验证入口

Docs-only 治理只需 `git diff --check`、冲突标记扫描和 stale wording spot-check。涉及 contracts/source/runtime/App 的变更，按触及面补跑：

- `rtk ./scripts/verify.sh`
- `rtk npm run test:fast`
- `rtk npm run test:meta`
- `rtk npm run test:artifact`
- `rtk opl agents interfaces --domain mas --json`
- `rtk opl agents interfaces --domain mag --json`
- `rtk opl agents interfaces --domain rca --json`
- `rtk opl stages proof-bundle --domain mas --json`
- `rtk opl stages proof-bundle --domain mag --json`
- `rtk opl stages proof-bundle --domain rca --json`
- `rtk opl family-runtime status --json`
- `rtk opl runtime app-operator-drilldown --json`
- `rtk opl runtime app-operator-drilldown --detail full --json`
- `rtk git status --short`
- `rtk git worktree list`
