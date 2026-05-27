# OPL Family 当前状态与理想目标差距

Owner: `One Person Lab`
Purpose: `family_ideal_state_gap_plan`
State: `active_plan`
Machine boundary: 本文是人读 gap / completion map。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。
Date: `2026-05-28`

## 读法

- 本文是 OPL family 当前目标、完成进度、功能/结构差距、测试/证据差距和下一轮 baton 的唯一 active owner。
- North-star 目标态回到 [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.md)；核心公开角色、runtime 边界和默认入口回到 `project/status/architecture/invariants/decisions`。
- 过程 proof、dated closeout、worktree/branch、receipt 流水和历史长清单进入 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md) 或其他 `docs/history/**`。
- 本文不冻结瞬时 counters。当前读数从 `opl framework readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl runtime app-operator-drilldown --json` 和 evidence ledger 命令读取。
- 功能/结构差距按目标态判断；测试/证据差距只记录目标结构已正确但仍缺真实运行、owner receipt、long-soak、no-regression 或用户路径证据的事项。

## 当前唯一真相

OPL family 的目标形态已经明确：`OPL Framework -> One Person Lab App -> Foundry Agents`。

- `OPL Framework` 是完整 stage-led 智能体开发/运行框架，持有 Codex-default activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、generated/hosted surfaces、Agent Lab 和 App/operator read model。
- `One Person Lab App` 是人用工作台，只消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source/artifact/memory refs、SLO、repair、workorder 和 owner-aware action。
- `MAS`、`MAG`、`RCA` 是当前 Foundry Agents，持有各自 domain truth、quality/export verdict、artifact authority、memory body、owner receipt 和 direct app skill path。
- `OPL Meta Agent` 是 Agent Foundry / new-agent builder/tester module，不持有 MAS/MAG/RCA 的领域真相。

标准 Foundry Agent 的目标源码形态是：

```text
Declarative Domain Pack
  + OPL generated/hosted surfaces
  + standard authority functions
```

`Codex CLI` 是当前第一公民 executor。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent`、`claude_code`、`antigravity_cli` 等只能作为显式非默认 executor adapter/backend。

## 当前完成进度

| Area | 当前进度 | 当前读法 |
| --- | --- | --- |
| OPL framework control plane | `landed_with_evidence_tail` | Temporal provider path、typed queue、stage attempt ledger、safe action shell、refs-only evidence ledger、App/operator drilldown、Agent Lab、pack compiler 和 conformance/readiness 读面已经是 framework 主干；不能写成 production ready。 |
| Framework readiness availability | `bounded_fail_closed_read_model` | `opl framework readiness --family-defaults --json` 现在在同一聚合内复用 5s bounded domain manifest catalog，并把该 catalog 传给 pack compiler、stage readiness 和 full App/operator snapshot；`runtime app-operator-drilldown --detail full --json` 只展开 full refs/routes，不放宽 manifest command timeout。projection cache fallback 只提供 operator visibility 与 timeout diagnostics，不授权 domain ready、production ready、artifact authority、owner receipt 或 App release ready。 |
| Standard agent structural conformance | `passed_clean_with_production_evidence_tail` | Fresh `opl agents conformance --family-defaults --json` 显示 4 个 repo 通过、0 个 repo blocked，structural conformance passed。Fresh `opl agents default-callers --family-defaults --json` 显示 32 个 generated/default caller surfaces、0 blocked surfaces、0 missing owner/typed-blocker、0 missing no-forbidden-write、0 missing tombstone/provenance refs。MAS/MAG/RCA/OMA 当前都按 strict source-shape landed / default-caller evidence clean 读取；这仍不授权物理删除或 production/domain ready。 |
| App/user path evidence | `user_path_evidence_ready` | App release/user-path ledger 已验证同 cohort release package、screenshot、reload prompt、provider linkage 与 long operator evidence；`framework readiness` 读为 App user-path evidence ready，但 `release_ready_claimed=false`、`production_ready_claimed=false`，不等于 App release ready。 |
| Codex App runtime evidence | `temporal_hosted_long_soak_refs_verified_gate_cleared` | `codex_app_runtime_role` 已把 `temporal_hosted_long_soak_refs` 投影为 refs-only production evidence follow-through gate，并在 `evidence_next_steps` 暴露真实 Temporal-hosted long-soak refs、provider state linkage、operator evidence refs 或 typed blocker refs 的 operator payload workorder。该 workorder 已接入 `codex_app_runtime_evidence:codex_app_runtime_role:record` / `verify` safe-action route、`opl runtime codex-app-runtime-evidence record|verify|list` 专用 ledger，以及 `opl runtime codex-app-runtime-evidence long-soak start|event|finish` 本地 observation surface。当前本机 long-soak observation 已满足 60 分钟窗口和 4 类 required events，`finish` 物化 manifest / record payload 后，ledger record / verify 已写入 1 条真实 `temporal_hosted_long_soak_refs` verified receipt；fresh App/operator drilldown 读为 `codex_app_runtime_evidence_open_gate_count=0`、`codex_app_runtime_evidence_verified_ledger_receipt_ref_count=1`、`codex_app_production_long_soak_claimed=false`、`codex_app_production_evidence_gate_remains_open=false`。该面不驱动长跑任务、不创建 owner receipt、不生成 typed blocker、不写 domain truth，也不声明 production ready。 |
| OMA/new agent consumption | `production_consumption_ready` | New-agent scaffold consumption 现在重复穿过 scaffold validation、standard conformance、agent readiness 和 App/operator projection；2026-05-26 fresh proof 对 `award-foundry`、`thesis-foundry`、`review-foundry` 三个临时样本均读为 `passed`，每个样本写入 30 个模板文件、消费 5 个 pack path、观察 1 个默认 `codex_cli` executor binding，并消费 scaffold / conformance / readiness / App operator 四类 surface。managed install/update、App live path、owner receipt/typed blocker scaleout 和 verified long-soak 已进入读面；OMA production-consumption ready 不授权 MAS/MAG/RCA 或 family production ready。 |
| Domain production evidence | `refs_only_dynamic_attention` | MAS/MAG/RCA 的 owner receipt refs、typed blocker refs、no-regression refs 可进入 OPL refs-only ledger；worklist/readiness 已把重复 domain-owned typed blocker refs 作为 attention group 去重展示，同时保留 raw item / envelope 审计数量。`open_worklist_item_count`、payload-required / payload-free、`domain_dispatch_evidence_workorder_count`、App drilldown route count、evidence envelope open count 和 operator attention count 都是动态读数，只从 fresh `opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json` 与 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 读取，不在本文冻结具体数值。open worklist 为 0 时只表示当前没有 OPL 可执行 safe-action route，大于 0 时只表示 OPL refs-only accounting 暴露了可提交 route；payload 仍必须来自 domain/App/live owner 的真实 refs 或 typed blocker，不能写成 MAS owner receipt、typed blocker、owner-chain ref、no-regression ref、completion、domain ready 或 production ready。`domain_ready_authorized=false`、`production_ready_authorized=false`、`zero_open_worklist_is_completion_claim=false`、`zero_open_worklist_is_domain_ready=false`、`zero_open_worklist_is_production_ready=false` 和 App release / production ready claim false flags 是固定完成口径：worklist/read-model 状态不能替代真实 paper/grant/visual owner-chain、request/gate-bound lifecycle receipts、quality/export verdict、long-soak 或 repeated no-regression evidence。App/operator `domain_owner_payload_summary_refs` 已能消费 RCA `operator_evidence_readiness_projection`、MAS 显式 `real_paper_autonomy_guarded_apply_proof.paper_line_provider_canary_closeout` 和 MAG `mag_opl_owner_payload_response` / `owner_payload_response` 中的 refs-only owner payload summary；MAG count-only workspace receipt scaleout snapshot 只生成 owner item guidance，不扩展为 per-stage route。`domain-owner-payload-summary` ledger receipt 不是 MAS/MAG/RCA owner receipt、typed blocker、owner-chain closeout、domain ready 或 production ready；显式 payload body 或 grant/quality/export/submission readiness claim 会 fail closed。当前本机 OPL ledger 已记录并验证 7 条 MAG owner-payload-summary receipt，全部走 recommended typed-blocker path：`submission_ready_export_gate` human-approval-required 与六个 grant stage source/runtime-live-evidence pending blocker；这只证明 OPL 可 record/verify MAG full owner-payload response 的 refs-only typed-blocker path，不生成 MAG owner receipt、fundability/export/submission readiness 或 long-soak closeout。MAG legacy lifecycle refs、MAG package/lifecycle receipt refs、RCA workspace receipt proof 与 RCA repeated no-regression receipt `opl://external-evidence/redcube_ai/rca-cross-family-repeated-no-regression-20260527-2-refs` 已作为 standalone verified external evidence receipts 进入 OPL refs-only ledger；这些 observed refs 只证明 domain-owned body-free refs 可被 OPL ledger/App 投影或验证，不声明 RCA visual ready、MAG submission ready、exportable、handoffable、artifact authority、Temporal visual-stage long soak 或 production soak complete。 |
| Legacy cleanup ledger | `source_purity_clean_not_physical_delete_authorized` | OPL normalizer 可消费 MAS/MAG/RCA/OMA 当前 standard-agent evidence；fresh default-caller deletion evidence 已清零。该状态证明 OPL cleanup ledger/read-model 可定位并关闭 source-purity 结构门，不授权 domain repo 物理删除。最终标准智能体不保留 repo-local generic adapter / compat facade / hand-written default caller；后续是 no-resurrection、防回归和 production evidence。 |
| Docs lifecycle | `current_doc_compacted` | 本文只保留当前真相、当前 gap 和下一步；已闭合 lane、历史 proof 和细节长清单不再作为 active plan 展开。 |

## 功能/结构差距

| gap | 当前状态 | 完成口径 |
| --- | --- | --- |
| `zero_retained_generic_adapter_purity` | 已闭合。MAS/MAG/RCA/OMA 都已从功能/结构 gap 收敛到 source-shape landed / replacement-readable 状态；fresh conformance 为 4/4 passed，fresh default-callers 为 32 surfaces、0 blocked、0 missing deletion-evidence requirements。剩余风险统一按 physical delete authority、production evidence tail 和 no-resurrection guard 读取。 | 标准智能体 active source 只允许 `agent/` domain pack、machine-readable contracts、standard authority functions、domain handler target、domain-specific implementation 和必要 native helper。任何 generic control-plane / default-caller / workbench / sidecar / session / queue / lifecycle / wrapper 逻辑都由 OPL 生成或托管；域仓副本删除，不保留兼容 alias、facade、re-export wrapper 或 compatibility-only tests。 |
| `generated_surface_default_consumption` | 已闭合到 structural/default-caller evidence：OPL 已能从 descriptor/stage/action/memory/artifact metadata 生成或投影 CLI、MCP、Skill/product-entry、domain-handler、status、session、workbench、harness 等 surface。`domain_handler` gate 可消费 `domain_handler`、`domain_action_adapter_export_dispatch` 或 `domain_action_adapter` 这类显式 domain handler target；它们只是 canonical target 机器面，不是 generic wrapper 或第二 truth source。App/operator default-caller deletion read model 在 active binding 有 repo contracts 时优先使用 repo-native `agents default-callers` readiness，manifest projection 只保留为 fixture / diagnostic fallback。 | MAS/MAG/RCA/OMA 的生产默认 caller 使用 OPL generated/hosted surfaces；repo-local wrapper 不再作为最终形态存在，迁移后只保留 domain handler target 或 authority function。生产可用性继续按 live owner receipt / typed blocker / no-regression / long-soak evidence 判定。 |
| `domain_private_platform_retirement` | 已闭合到 structural/source-purity 口径。OPL 已能审计 standard pack、authority functions、private platform residue、semantic equivalence 和 forbidden generic owner flags，并且本轮 read-model 没有 open structural blocker。 | 任何 repo-local scheduler、queue、attempt ledger、session store、workspace/source shell、artifact/memory lifecycle shell、workbench、generated wrapper owner、diagnostic cleanup shell 或 default caller 重新出现时 fail-closed；历史只允许在 `docs/history/**` 或外部 provenance 中作审计材料，不属于标准智能体组成。 |
| `MAS_physical_thinning` | MAS 默认 runtime owner 已回到 OPL provider-backed stage runtime；旧 runtime transport、runner、worker lease、SQLite lifecycle writer 只按 retired/no-resurrection 读取。本轮 MAS source shape 已 landed：原 `generic_cli_mcp_product_wrappers`、`owner_route_reconcile_materialize_dispatch_shell`、`workbench_portal_generic_shell` 只作为 former wrapper tail / deletion-gate provenance，当前不再是 open functional follow-through。OPL active workspace binding hydrate / dispatch 现在保持同一 bound MAS checkout：workspace-derived pending task 会携带 `command_cwd`，dispatch 回到该 checkout 调用 MAS domain handler，而不是落回 managed module 或 PATH 旧工具。OPL structured workspace binding 现在通过 generated product-entry materializer 调用 MAS `build_product_entry_manifest` / `build_product_entry_status`，不再派生退役的 `med_autoscience.cli product manifest/status` grouped CLI；当前本机 MAS active binding 已重绑并 live resolved。MAS product-entry import-light 后，warm OPL managed env 的 5s live manifest refresh 不再回退 projection cache；首次 uv project venv 建立和依赖下载仍按 managed environment 预热尾项读取。 | MAS 只留 medical study truth、publication gate、artifact/package authority、owner receipt / typed blocker 和 domain handler；不能据此声明 physical delete authorized、paper closure、artifact authority ready 或 production ready，剩余关闭条件是 real paper-line owner-chain、memory/artifact/lifecycle receipt 与 provider SLO evidence。 |
| `MAG_wrapper_shell_retirement` | 已按 structural/source-purity 闭合；MAG repo-side handler/ref-only/authority boundary 已闭合，顶层合同读为 `standard_agent_source_shape_status=landed`、`claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`。OPL structured workspace binding 现在通过 generated product-entry materializer 调用 MAG `MedAutoGrantProductEntry` manifest/status builder，不再派生退役的 `med_autogrant product manifest/status` grouped CLI；当前本机 MAG active binding 已重绑并 live resolved。 | MAG 只留 grant authority functions、transition oracle、owner receipt / typed blocker 和 domain handler。后续只扩真实 grant owner receipt、typed blocker、no-regression 和 long-soak evidence，不把结构闭合、binding resolved 或 manifest resolved 写成 physical delete authorized / grant ready。 |
| `RCA_wrapper_adapter_retirement` | 已按 structural/source-purity 闭合；RCA generated/hosted shell、legacy cleanup 和 visual authority boundary 已清晰，bridge gate 当前读为 `source_shape_status=landed`、`functional_structure_gap_count=0`、`remaining_bridge_module_ids=[]`、`declares_no_active_bridge_modules=true`。旧 session/store/managed/runtime/gateway 命名已降到 retired/provenance/tombstone 语境。OPL structured workspace binding 现在通过 generated product-entry materializer 调用 RCA `@redcube/domain-entry` `getProductEntryManifest` / `getProductStatus`，不再派生退役的 `redcube product manifest/status` wrapper；当前本机 RCA active binding 已重绑并 live resolved。 | active source 保持 visual authority implementation、native helper、domain handler target 和 artifact/visual pack logic；后续只扩真实 artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout 和 repeated no-regression evidence，不把结构闭合写成 production/default-caller complete。 |
| `App_workbench_user_path` | App/operator drilldown、safe action route、payload workorder、App release/user-path evidence ledger 已可用，且 `26.5.19` 同 cohort 五类 evidence 已 verified。 | 保持同 cohort evidence 可重复证明；App 不生成 release-ready 或 production-ready verdict，App release owner boundary 仍需单独关闭。 |
| `OMA_production_consumption` | OMA structural consumption、App live-path evidence、owner receipt / typed blocker scaleout 和 verified long-soak 已进入读面。 | 继续用真实 target patch/rerun/owner receipt 样本验证 OMA consumption；OMA ready 不授权目标 domain ready、family production ready 或默认 promotion。 |
| `memory_artifact_lifecycle_apply` | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。App/operator 与 framework attention-first 读面已把 memory refs、memory writeback receipt refs、domain-dispatch memory writeback refs、artifact/package/export refs、lifecycle index refs、restore proof refs 和 domain artifact mutation receipt refs 统一投影为 refs-only 计数。External evidence ledger 现在可通过 `opl agents evidence apply` 或 `opl runtime action execute` body-free 记录/验证 `memory_writeback_receipt_refs`、`artifact_mutation_receipt_refs`、`package_lifecycle_receipt_refs`、`lifecycle_receipt_refs` 和 `restore_proof_refs`；即使这类 receipt 没有绑定 domain-declared request/gate，只要属于当前 resolved domain，也会作为 standalone verified receipt 进入 App/operator summary 的 `domain_external_verified_*` 计数。verified standalone `memory_writeback_receipt_refs` 同步进入 App/operator `memory_writeback_refs`、ref family memory refs 和 runtime visualization 的 `memory_writeback_receipt` 节点；operator 可从 summary 下钻到同一 body-free receipt ref，但仍不能读取 memory body 或作 accept/reject。MAG legacy cleanup/lifecycle refs 已用 `opl://external-evidence/med-autogrant/mag-lifecycle-external-evidence-scaleout-20260526` 验证为 standalone external evidence；MAG `product receipt-readiness` 输出的 package lifecycle receipt refs 与 cleanup / restore / retention lifecycle receipt refs 已用 `opl://external-evidence/med-autogrant/mag-package-lifecycle-receipt-scaleout-20260526` 验证。RCA 5-workspace snapshot `rca.workspace_receipt_scaleout.2026-05-27.5-workspaces` 已用 `opl://external-evidence/redcube_ai/rca-workspace-receipt-scaleout-20260527-5-workspaces` 验证为 standalone external evidence，消费 5 条 artifact-producing owner receipt refs、10 条 accepted/rejected visual memory writeback receipt refs 与 15 条 cleanup/restore/retention lifecycle receipt refs。RCA repeated visual-stage no-regression refs 已用 `opl://external-evidence/redcube_ai/rca-cross-family-repeated-no-regression-20260527-2-refs` 验证，消费 `rca-no-regression:visual-stage:2026-05-27-opl-family-cross-family-repeat-a` 与 `rca-no-regression:visual-stage:2026-05-27-opl-family-cross-family-repeat-b`；它不进入 memory/artifact/lifecycle external summary 分项计数。Fresh App/operator summary 可读 external evidence receipts = 13、verified = 13、memory writeback refs = 11、artifact mutation refs = 2、package lifecycle refs = 3、lifecycle refs = 18、restore proof refs = 6；framework readiness 仍把未绑定 domain-declared request/gate 的 evidence envelope 保持为 operator attention。该路径不创建或关闭 request/gate，不新增 domain action route，不重复计数 `domain_dispatch:*` / `stage_production_evidence:*` 专用 receipt，不读取 memory/artifact body，不接受或拒绝 memory writeback，不授权 artifact mutation、package/export readiness、visual ready、domain ready、Temporal visual-stage long soak 或 production ready。 | MAS/MAG/RCA 在真实 workspace 继续形成 accepted/rejected memory writeback、artifact mutation、cleanup/restore/retention、no-regression 和 request/gate-bound lifecycle receipts；默认读面 observed 计数不等于 owner-chain、artifact authority、quality/export verdict 或 long-soak 完成。 |

## 证据差距

| evidence gate | 当前读法 | 完成口径 |
| --- | --- | --- |
| Provider long SLO | Temporal provider cadence/capability SLO 已有机器读面；`family-runtime attempt query|inspect` 的 operator visibility 也会直接投影 Temporal Codex stage 的长 `start_to_close`、短 heartbeat、周期 heartbeat、runner 总窗口和 no-output watchdog policy。App/operator safe-action shell 当前能覆盖 stale worker restart 与 service-reachable/worker-not-ready start 两条 OPL-owned provider worker lifecycle 修复路径；读数以 `framework readiness`、App drilldown 和 attempt query 为准。 | 持续窗口 satisfied，并在真实 domain owner-chain dispatch 中保持 worker start/restart re-query、signal history、typed closeout、retry/dead-letter、Codex runner progress / no-output fail-close 和 no-forbidden-write proof。 |
| App long operator evidence | `26.5.19` 同 cohort long operator evidence 已 verified，并使 App user-path evidence ready。 | 后续只需守住同 cohort 规则和 release-owner boundary；不把 user-path evidence ready 写成 App release ready。 |
| Codex App Temporal long soak | `codex_app_runtime_role.production_evidence_followthrough` 暴露的 `temporal_hosted_long_soak_refs` gate 已由 verified refs 读为 observed：当前本机 ledger 有 1 条 verified `temporal_hosted_long_soak_refs` receipt，fresh App/operator drilldown 读为 open gate 0、verified receipt 1、`codex_app_production_long_soak_claimed=false`。provider state linkage 与 operator evidence refs 仍只作为支撑审计 refs，typed blocker refs 只作为 provider-owner 阻塞信号。 | 后续需要在新窗口或新 cohort 继续重复真实 observation -> finish -> record -> verify 路径；observation workorder、空 payload、event-only log、未 verify receipt、support-only payload 或 OPL 自造 ref 仍不能关闭 gate。必须继续保持 Codex App 不驱动长跑任务、不创建 owner receipt、不写 domain truth、不声明 production ready。 |
| OMA long soak | OMA production-consumption ledger 已观察 verified real long-soak ref。 | 后续只需守住 refs-only intake 和 target-owner authority boundary；不把 OMA ready 写成 family/domain production ready。 |
| MAS real paper chain | MAS guarded-apply、owner-route、aftercare、default-executor typed blocker payload 与逐 paper-line `paper_line_owner_chain_results` 可被 OPL record/verify 消费；显式 `real_paper_autonomy_guarded_apply_proof.paper_line_provider_canary_closeout` 也可被 App/operator drilldown 投影成 refs-only owner payload summary，让 operator 看到 paper-line success refs path 或 typed blocker path，并通过 `opl runtime action execute` 或 `opl runtime domain-owner-payload-summary record|verify|list` 进入 body-free OPL ledger。per-line result 只归一化为 refs-only owner receipt、owner-chain support、no-forbidden-write proof 或 stable typed blocker，不携带 body，不关闭 paper / publication / artifact authority；显式 body 或 readiness/artifact authority claim 会在 domain-dispatch 和 domain-owner-payload-summary preflight fail closed。当前 refs-only accounting 没有 open domain-dispatch workorder，已记录/验证、typed-blocker 化或未 closeout 的 MAS evidence 只作为 ledger / blocked / superseded attention 投影。 | 多条真实 paper line 产生 progress delta、AI reviewer update、artifact delta、human gate、stop-loss、owner receipt、owner-chain / no-regression refs 或 stable typed blocker。 |
| MAG grant soak | MAG transition oracle、owner receipt contract、refs-only handoff 边界清晰；MAG legacy lifecycle cleanup 的 artifact mutation refs、restore proof refs、package/lifecycle refs 已作为 verified standalone external evidence 被 App/operator 消费；`package_and_submit_ready` stage production evidence 已 verified，source/runtime refs observed，但 submission-ready human gate 仍以 typed blocker 暴露。OPL App/operator 现在可消费 MAG full owner-payload response 的 owner refs 与 per-stage expected receipt refs，并把 grant/quality/export/submission readiness claim 挡在 refs-only ledger preflight 外；当前本机 OPL `domain-owner-payload-summary` ledger 已验证 7 条 MAG recommended typed-blocker path receipts，其中 `package_and_submit_ready` 仍指向 human approval required，其余六个 stage 指向 source/runtime-live-evidence pending；默认 live manifest 是否持续暴露该 response 仍按 fresh `runtime app-operator-drilldown` 读取。 | 真实 OPL-hosted grant-stage attempt 持续返回 grant-owned receipt、typed blocker 或 no-regression evidence；legacy lifecycle receipt、stage evidence 可见性和 App/operator refs-only summary 不等于 grant authoring / fundability / submission readiness。 |
| RCA visual soak | RCA transition/evidence fixture、refs-only projection 和 visual authority boundary 清晰；RCA 5-workspace snapshot `rca.workspace_receipt_scaleout.2026-05-27.5-workspaces` 已被 OPL external evidence ledger verified，消费 5 条 artifact-producing owner receipt refs、10 条 accepted/rejected visual memory writeback receipt refs 与 15 条 cleanup/restore/retention lifecycle receipt refs，并保持 `workspace_receipt_scaleout_claimed=false`。本轮新增 verified RCA no-regression receipt `opl://external-evidence/redcube_ai/rca-cross-family-repeated-no-regression-20260527-2-refs`，消费两条 RCA domain-owned visual-stage no-regression refs。 | 继续扩真实 artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout、quality/export owner verdict、Temporal controlled visual-stage long soak 和 production-like repeated route no-regression evidence；refs-only workspace receipt scaleout 和两条 no-regression refs 不能升级为 visual ready、exportable、handoffable 或 production soak complete。 |
| Cross-family regression | MAS/MAG/RCA/OMA structural conformance 与 generated/readiness consumer boundary 可读。 | direct/hosted parity、generated default consumption、legacy no-active-caller、no-forbidden-write 和 release/dist consumption 反复通过。 |

## 下一轮 Agent prompt

Objective:

- 推进 OPL family production-evidence tranche。每轮先读 fresh machine truth，再只修改仍 open 的功能/结构差距或证据差距；完成后把 durable current truth 折回本文、核心五件套或对应 repo-owned active plan。

Write scope:

- `one-person-lab` 的 active truth owner、核心五件套、contracts/source/tests、runtime read model 与 App/operator projection；必要时同步 MAS/MAG/RCA/OMA repo-owned active plan 中对应的 current truth。

Live truth inputs:

- `TASTE.md`、核心五件套、本文、`docs/docs_portfolio_consolidation.md`、`docs/active/opl-family-development-reference.md`。
- `opl framework readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。
- MAS/MAG/RCA/OMA repo-owned contracts、generated handoff、production acceptance、owner receipt / typed blocker refs 和 focused verification。

优先顺序：

1. 读取 `opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`，确认当前 open gate。
2. 继续把 `opl agents conformance --family-defaults --json` 作为结构回归守门；若 fresh conformance hard blocker 重新出现，先处理 blocker，再推进证据尾项。
3. 把 strict standard-agent source purity 作为防回归守门：若 MAS/MAG/RCA/OMA 重新出现 repo-local generic default caller、domain-action/status/workbench wrapper、runtime projection、queue/ledger/session/lifecycle shell、compat alias 或 compatibility-only test，先 fail closed 处理。
4. 推进 MAS/MAG/RCA repo-owned production caller、owner receipt、typed blocker、memory/artifact/lifecycle receipt、no-regression 和 live long-soak evidence。
5. 推进 Developer Mode non-owner fork/PR owner acceptance 与 App release-ready owner boundary；App user-path evidence ready 不等于 App release ready。

Non-goals:

- 不把 provider proof、generated surface proof、conformance pass、refs-only ledger verified、doctor clean 或 workorder accounting closed 写成 domain ready、App release ready 或 production ready。
- 不恢复 gateway/frontdoor/Hermes-first、compatibility alias、facade、wrapper 或旧默认入口。
- 不把 MAS/MAG/RCA 的 domain truth、quality/export verdict、artifact body、memory body 或 owner receipt authority 上收到 OPL。

Verification commands:

- Docs-only：`rtk git diff --check`、`rtk rg -n "^(<<<<<<<|>>>>>>>|=======)" docs`。
- 触及 source/contracts/runtime/App 时追加：`rtk ./scripts/verify.sh`、`rtk npm run test:fast`、`rtk npm run test:meta`、`rtk npm run test:artifact`、`rtk opl framework readiness --family-defaults --json`、`rtk opl runtime app-operator-drilldown --json`。

Completion gate:

- 本轮关闭的 gap 已从本文重写为当前完成进度或移出 active path；仍 open 的 strict source purity / production evidence tail 保持在功能/结构差距或证据差距中。
- 所有 worktree lane 已吸收回 `main` 或明确标记为近期写入/有未提交改动而保留；最终在 `main` checkout 上完成最小充分验证。

Foldback target:

- Durable current truth 折回本文、核心五件套或对应 repo-owned active plan；过程 proof、receipt id、命令流水、worktree/branch 细节进入 `docs/history/**`、runtime ledger、提交历史或 automation memory。

## 验证入口

Docs-only 治理最小验证：

```bash
rtk git diff --check
rtk rg -n "^(<<<<<<<|>>>>>>>|=======)" docs
```

涉及 contracts/source/runtime/App 的变更按触及面补跑：

```bash
rtk ./scripts/verify.sh
rtk npm run test:fast
rtk npm run test:meta
rtk npm run test:artifact
rtk opl framework readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk git status --short
```

## 当前不能写成

- OPL 已全量 production ready。
- Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- Structural conformance 通过等于 production evidence tail 关闭。
- App selected cohort、verified package/provider refs、typed blocker refs、partial observed gates 或 user-path evidence ready 等于 App release ready / production ready。
- Workorder accounting、stage evidence route、domain-dispatch refs-only receipt 或 legacy cleanup ledger 等于真实 owner-chain、expected receipt instance、monitor freshness、artifact mutation 或 long-soak evidence。
- Blocked cleanup plan / route-back blocker 等于 production evidence complete，或等于 domain typed blocker。
- Private functional audit 分类完成等于 domain repo 物理代码路径清零。
- Refs-only adapter、diagnostic shell、tombstone/provenance ref 或 active direct path 可以作为 generic control plane / default caller / product shell 的长期组成。
- Descriptor ready、read model ready、generated bundle ready、provider completion 或 cleanup proof 等于 domain ready、artifact ready、quality/export/fundability/visual verdict。
- 为兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。
