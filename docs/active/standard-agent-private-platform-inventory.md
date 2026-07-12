# OPL 标准智能体私有平台化 inventory

Owner: `One Person Lab`
Purpose: `cross_repo_private_platform_inventory`
State: `active_support`
Machine boundary: 本文是跨 repo 人读治理台账。机器真相继续归 OPL `contracts/`、CLI/API 行为、provider receipt、domain-owned contracts、sidecar/manifest projection、真实 workspace receipt 与各 domain agent owner receipt。

## 文档职责

本文只维护 MAS/MAG/RCA/OMA/OBF 中仍可能被误读成 repo-local generic platform 的 surface 分类、owner 边界和迁移门。当前标准化智能体迁移 owner map 见 [OPL 标准化智能体迁移 owner map](./standard-agent-migration-owner-map.md)；ideal-operating-model redesign foldback、remaining residue/delete gate 和 active-goal baton 回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。本文不再保存逐日拆文件流水账、line-count closeout、commit 过程、dated readout counter 或长 follow-up 清单。

逐文件拆分过程已归入 [2026-05-22 OPL active ledger consolidation](../history/process/plans/2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md)。新增 private-platform 清理证据时，active 层只更新本文件的分类结论；过程证据进入 `docs/history/**` 或对应 repo 的 status / gap plan。

## 当前支撑读法

当前 OPL 标准智能体与基座按三层读取：

- `OPL Base` 持有 Framework、Temporal-backed provider runtime、stage attempt、attempt ledger、generic transition runner、workspace/source/artifact/memory locator、generated surface、Agent Lab 和 lifecycle/projection ledger；标准 Agent 只消费 Base，不反向管理它。
- compact standard-agent list 固定为 `MAS/MAG/RCA/OMA/OBF`；全称是 Med Auto Science、Med Auto Grant、RedCube AI、OPL Meta Agent、OPL Book Forge。五个 Agent 分别持有自身 domain truth、quality/export verdict、artifact authority、memory accept/reject、owner receipt、typed blocker 和 direct app skill path。
- `mas-scholar-skills` 是 MAS required capability package，`opl-flow` 是 workflow plugin package；它们由 OPL Packages 管理，但都不是第六个 standard Agent，也不形成独立用户 lifecycle。

当前代码扫描显示，OPL 已有对应的 generic platform classifier 和 scaffold/conformance surface：`opl agents platform-surfaces --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl agents legacy-cleanup apply ...`、`standard-domain-agent-conformance*`、`agent-platform-surface-ownership.ts`、`runtime-tray-app-operator-drilldown*` 和 `family-runtime-command-parts/*`。这些是 OPL 的 owner surface；它们只输出 classification、migration gate、read model、cleanup ledger 或 refs-only route，不生成 domain ready、quality verdict、artifact authority 或 production ready。

严格标准化口径：标准 OPL Agent 的 active source 只保留 declarative domain pack、machine-readable contracts、minimal authority functions、domain handler target、domain-specific implementation 与必要 native helper。repo-local generic control plane、default caller、compat facade、sidecar/status/workbench wrapper、session/queue/lifecycle shell 或 tombstone/provenance code path 不能作为长期组成部分。历史 provenance 进入 `docs/history/**`、提交历史或外部 receipt，不作为 active repo-local surface 保留。

Standard Agent Pack ABI 已成为这条 source-purity 口径的机器入口。`standard-domain-agent-skeleton-contract.json`、scaffold generator、stage pack v2 validation、pack compiler input projection 和 conformance report 都要求 domain repo 显式声明 standard ABI、标准 repo layout、authority function 入口和 L4/L5 false-authority boundary。ABI pass 只证明 repo 具备标准 agent pack shape；它不能替 domain 产出 owner receipt、typed blocker、quality/export verdict、artifact authority、production readiness 或 physical delete authorization。

Standard Agent registry / alias tables 的 active 机器来源现在是 `src/kernel/standard-agent-registry.ts`。Foundry Agent CLI list/inspect、`opl connect skills` 的 domain-agent pack projection、`standard-domain-agent-conformance-foundry-agent-os` 和 target architecture `foundry_agent_os_standard.applies_to_domain_agents` 都从该 registry 派生；`contracts/opl-framework/foundry-agent-series-contract.json` 只保留 registry pointer 和 projection policy，不再作为第二套 agent identity / alias table。MAS/MAG/RCA/OMA/OBF 公开 membership 统一为 `standard_domain_agent`，不得按 generated surface、plugin transport、domain-native CLI 或 minimal authority functions 拆分；MAS Scholar Skills 只保留 Foundry public projection，machine membership 是 `framework_capability_package`。

`functional_privatization_audit` 的 active standard source 现在是 canonical-only：标准 OPL Agent 只从 `contracts/functional_privatization_audit.json` 的 `functional_privatization_audit` 读取标准形状。MAS/MAG/RCA 历史字段只保留为 `legacy_import_adapter`，通过 `source_field_role=legacy_import_adapter` 暴露给读模型，不能再作为 scaffold、conformance、new-agent template 或 accepted source。当前三仓 canonical contract readback 已来自 `functional_privatization_audit` 顶层 module inventory；legacy adapter 仅保留为旧仓库诊断导入能力，不定义标准 Agent 形态。

Generated surfaces 现在是默认入口基线。`domain-pack-compiler-contract.json` 的 `default_entry_policy` / `supported_derived_surfaces` 把 CLI、MCP、OpenAI/AI SDK tool、Skill/plugin、App action、status read model 和 workbench 归到 OPL generated surface owner；`family-action-catalog.schema.json` 要求 action catalog 保留对应 surface slots。domain repo retained surface 只能是 domain handler target、refs-only adapter、migration input 或 tombstone candidate，不能重新长成 status/workbench shell、default caller 或 compatibility wrapper。

MAG/RCA/OMA/OBF 的默认 owner route 现在在 `target-operating-architecture-contract.json#foundry_agent_os_standard.default_owner_route_policy` 中显式绑定为 `StageRun + current_owner_delta`。默认 CLI、Skill/plugin、App/product-entry、status read model、workbench 和 conformance readback 都应从该策略投影；repo-local runner、private wrapper、generic owner surface、旧 product/status shell 只能作为 migration residue、deletion gate 或 diagnostic 读取，不能作为默认 owner，也不能绕过 StageRun owner boundary。OPL StageRun 只承载 attempt、lease、execution authorization、closeout binding 和 owner-delta projection，不签 domain owner receipt、不创建 typed blocker、不授权 quality/export verdict、不声明 domain/runtime ready。

App ordinary cockpit 已从 cleanup/detail lane 收薄：默认 payload 只展示 purpose、task、current owner、next action、artifact 或 blocker。provider trace、attempt ledger、raw receipt、worklist、MCP catalog、release evidence 和 private platform residue gate 只进入 full/developer/detail lane。若 cleanup gate 再次出现在普通 next action 或 first screen，应先降回 private cleanup lane，而不是把 delete accounting 当作 owner-delta progress。

`opl agents default-callers --family-defaults --json` 是当前 generated/hosted default-caller readiness primitive。family-defaults 发现面只覆盖 `standard_domain_agent` 仓；`mas-scholar-skills` 这类 `framework_capability_package` 继续由 `opl agents conformance --family-defaults --json` 的 framework capability package 投影读取，不进入 default-caller deletion gate、pack compiler family domains 或 generated interface family domains。default-callers 读取 `agents interfaces` 的 active-caller target / cutover proof 和 `agents platform-surfaces` 的 private-owner guard，输出每个标准 agent 的 generated CLI/MCP/Skill/product-entry/status/session/domain-handler/workbench surface 是否已具备 OPL replacement / active-caller cutover 结构证据。`domain_handler` 是对外 gate 名；canonical target set 只允许 `domain_handler`、`domain_action_adapter_export_dispatch`、`domain_action_adapter` 这类显式 domain handler target 机器面，避免为了证据对齐恢复 generic wrapper、compat facade 或 repo-local default caller。`agents interfaces` 现在同时输出 `active_legacy_caller_deletion_gate_readout`，把 active caller proof、replacement parity、no-forbidden-write proof、tombstone/provenance ref 和 owner 三选一裁决入口接到 generated interface 机器读面。`default-callers` report 还为每个 surface 输出 `opl_default_caller_surface_deletion_evidence_worklist`，把 replacement parity、active caller cutover、domain owner receipt / typed blocker、no-forbidden-write proof 与 tombstone/provenance ref 拆成可消费的 per-surface gate；这些 worklist 是 OPL-owned 退役执行读面，不签 domain owner receipt，也不授权 domain repo 物理删除。当 replacement/no-active-caller/no-forbidden-write/tombstone-provenance 结构前置证据齐全时，read model 把下一步收敛为 `domain_owner_choose_delete_authorize_keep_or_typed_blocker`，接受 `physical_delete_authorization_ref`、`keep_as_authority_adapter_ref` 或 `typed_blocker_ref` 三类 refs-only 裁决结果；即使 owner 裁决结果已 observed，`default_caller_delete_ready` 仍保持 false。

`contracts/opl-framework/wrapper-retirement-gate-policy.json` 现在把 default-caller ordinary lane 与 private platform cleanup lane 拆开：`default_ordinary_lane` 只承载 generated/default caller readiness 与 owner-decision evidence，不消费私有平台 residue 删除门；`private_platform_cleanup_lane` 只承载 MAS/MAG/RCA/OMA/OBF repo-local residue 分类。结构化分类字段是 `functional_privatization_audit.modules[].private_platform_residue_gate`，目标 residue kind 包括 `scheduler`、`queue`、`session_store`、`workbench`、`status_shell`、`domain_wrapper`、`runtime_watch`、`agent_lab_materializer`；允许处置为 `retain_authority_function`、`absorb_opl_primitive`、`no_active_caller_delete`、`tombstone` 或 `owner_typed_blocker`。该 cleanup lane 是 audit/delete-gate read model；它只能把分类、计数和 refs-only owner decision shape 暴露给 operator，不能授权物理删除、不能声明 domain ready / production ready，也不能把 default ordinary path 变成 cleanup path。

`opl runtime app-operator-drilldown --detail full` 现在会把上述 per-surface gate 投影为 `opl_default_caller_deletion_evidence_refs`。当 active workspace binding 指向带 `contracts/domain_descriptor.json` 的 repo 时，该投影优先直接消费 repo-native `agents default-callers` readiness；manifest projection 只作为没有 repo contract 的 fixture / diagnostic fallback。`opl agents default-callers --family-defaults --json` 的顶层 `physical_delete_authority_read_model` / `repo_deletion_gate_summary` 是当前 operator 快速读面：它把 per-repo evidence observed、`default_caller_delete_ready=false`、`physical_delete_authorized=false`、`owner_decision_result_shape`、`owner_decision_closeout_status`、`no_further_opl_default_caller_delete_work`、`next_opl_default_caller_delete_action` 和三类 accepted refs-only result shape 放到紧凑 summary。`opl family-runtime evidence-worklist --detail full` 只按 fresh App/operator projection 暴露当前 OPL 可执行 safe-action route；只有 live readback 同时返回 `no_further_opl_default_caller_delete_work=true` 和对应 next action 时，才可读作 OPL default-caller delete work 已关闭，不能从 historical evidence 或条件示例预设该值。2026-07-11 current snapshot 见 owner map，当前该值为 `false`。这个接入只让缺失的 domain owner receipt / typed blocker、no-forbidden-write proof、tombstone/provenance refs 进入统一 refs-only 读面；observed 后的三选一裁决仍由 domain owner 返回 physical-delete authorization、keep-as-authority-adapter 或 typed blocker ref，仍不代表 domain 私有平台代码可物理删除，也不生成 domain ready、quality verdict、artifact authority 或 production ready。

退役的 `family-runtime intake|tick --hydrate` 只能作为 history/provenance 读取；当前 domain-dispatch / external-evidence receipt 和 App/operator drilldown 只属于 stage-attempt projection、readback 与 evidence accounting 面。它们关闭的是 owner-route handoff、workorder accounting 或读模型入口，不把 MAS/MAG/RCA/OMA/OBF 的真实 verdict、artifact authority、memory body 或 production soak 迁到 OPL。

当前没有发现应把 MAS/MAG/RCA/OMA/OBF 的 domain truth 或 quality verdict 迁入 OPL 的 surface。Source-purity、default-caller deletion-evidence、wrapper retirement 或 private-platform cleanup 是否闭合，必须回到 fresh repo-native contracts / CLI readback / tests / owner receipts 读取；本文不保存某轮 readout counter 或 closeout 结论。后续风险来自新代码重新引入 repo-local generic handler / projection / wrapper / script owner，或把 evidence tail 误写成 production ready。治理动作是 fail-closed 防复发：只保留最小 authority function、domain handler target、必要 native implementation 和 machine-readable pack/contract。

稳定治理结论：MAS/MAG/RCA/OMA/OBF 的持续、全自动运行默认 owner 仍是 OPL/Temporal、OPL attempt ledger、stage-attempt request/projection、retry/dead-letter、wakeup/resume 与 App/operator read model；未发现这些 domain agent 应接管 domain truth、quality/export verdict、artifact authority、memory body 或 owner receipt 的 OPL surface。五个 agent 的 structural/source-purity 与 default-caller readiness 必须 fresh 读取 OPL live readout；本文只保留分类口径，不保存当前 counter。剩余只按 physical-delete authority、domain/live production evidence 和防回归读取：

- `MAS` 的 wrapper tail 只能作为 former tail / deletion-gate provenance 读取；是否仍有 source-purity gap 回 MAS 合同、source/readback 和 OPL conformance fresh 输出。剩余项是 live provider paper-line、memory receipt、artifact lifecycle receipt 与 provider SLO evidence gates，不是 MAS 私有 runtime owner 回流。
- `MAG` 不应作为 structural dirty 或正向私有控制面读取；`attempt_ledger` 等旧词只允许作为合同 policy/provenance/negative guard 中的非 owner claim 出现，不能作为 active residue。是否已满足 standard source shape 和 OPL replacement，回 MAG repo-native readback 与 OPL default-caller fresh 输出。
- `RCA` 不应作为 active generic runtime owner 或 structural dirty 读取；bridge/default-caller 相关结论只由 RCA repo-native readback、no-regression proof、no-forbidden-write proof 和 explicit owner receipt / typed blocker 关闭。
- `OMA` scripts 只允许 authority implementation、smoke helper、fixture/proof helper 或 work-order materializer；不得变成 Agent Lab runner、promotion gate、queue、attempt ledger、App/workbench 或 target truth writer。是否 structural clean，回 OMA repo-native source-structure / script-to-pack readback。

OPL read-model 只作为 fresh-live source 使用：`opl agents conformance --family-defaults --json` 读取 structural conformance，`opl agents default-callers --family-defaults --json` 读取 generated/default-caller replacement 与 deletion-evidence worklist。即使这些读面显示 blocked/missing 为零，它们仍不授权 domain repo 物理删除，也不声明 domain ready 或 production ready。

按严格目标态，domain repo 不能重新把 refs-only adapter、developer work-order materializer、status/workbench/domain-action shell 或 tombstone/provenance code path 写成 generic control plane、default caller 或长期产品面。当前剩余风险按 production evidence tail、防回归和 owner authority boundary 读取，不写成 production ready。

## 本轮旧智能体纯净度审计

| 复杂度来源 | 状态 | 处置口径 |
| --- | --- | --- |
| `functional_privatization_audit` legacy source shape | 已落地收敛 | 标准 source 只接受 canonical `functional_privatization_audit`；MAS/MAG/RCA 旧字段只作为 `legacy_import_adapter`，不再污染新 Agent 标准形态。 |
| MAS 嵌套 `functional_consumer_boundary.generated_surface_handoff` fallback | 已落地删除 | `repo-contract-descriptor` 只从标准 `contracts/generated_surface_handoff.json` 读取 generated handoff；旧 MAS 嵌套 handoff 不再补写 domain handler descriptor。 |
| MAS legacy DHD / default-executor / current-control active runtime path | 已落地切断 active owner-dispatch bridge | Codex stage runner 不再在缺 typed closeout 时主动调用 MAS owner dispatch；只允许读取已存在的 legacy default-executor execution receipt 作为 migration/diagnostic recovery，否则生成 OPL provider-runtime closeout blocker。旧 current-control / default-executor queue diagnostic 仍作为迁移输入与非退化测试存在，不再作为普通 MAS paper mission active route。 |
| MAS/MAG/RCA handler closeout 多形状 parser | ordinary path 已落地收敛 | family-runtime dispatch 的标准完成路径只接受 canonical `domain_stage_closeout_packet`；MAS/MAG/RCA 旧 closeout 形状保留为显式 legacy import adapter/diagnostic，不能写入 `accepted_typed_closeout` 或定义普通 closeout 语义。 |
| Standard Agent registry / alias tables 重复 | 已落地收敛 | `src/kernel/standard-agent-registry.ts` 是 agent id、domain id、brand CLI、work alias、plugin identity、canonical aliases、membership 与 pack/authority examples 的 active source；Foundry CLI、skills、conformance 与 target architecture 从它派生。 |
| platform ownership 文本/文件名扫描 | 已落地 hard/advisory 分层 | `agent-platform-surface-ownership` 的 hard gate 只读 machine contracts、receipts 和 proofs；filename、Markdown prose 和 contract text 扫描只进入 `advisory_diagnostics` / `advisory_diagnostic_refs`，不能阻断 standard OPL agent admission。 |

## 分类词表

| class | 含义 | 迁移口径 |
| --- | --- | --- |
| `domain_authority_retained` | 必须留在 domain repo 的 truth / verdict / artifact / memory / owner receipt / typed blocker / native helper authority。 | 不迁 OPL；只收窄接口、receipt 和 guard。 |
| `opl_framework_migration_candidate` | 当前由 domain repo 手写，但长期 owner 应是 OPL generated/hosted surface 或 shared runtime primitive。 | 等 OPL replacement parity、active caller cutover、domain receipt parity、focused tests、no-forbidden-write proof 后迁移或删除。 |
| `already_thin_adapter` | 已收薄为 refs-only adapter、diagnostic、projection 或 tombstone，但因 direct/domain/diagnostic caller 暂留。 | 保持不扩写；caller 清零且 OPL parity 成立后 tombstone 或删除。 |
| `needs_split_before_migration` | 同一文件混有 domain authority 与 generic platform shell，迁移前必须先按 owner 子域拆清。 | 先拆成 authority / adapter / projection / generic shell，再分别处理。 |
| `strict_delete_after_cutover` | 已经能归类但仍存在 active repo-local generic shell、bridge、diagnostic wrapper、compat test 或 generated/default caller 副本。 | 不作为长期状态；OPL generated/hosted parity 与 direct caller migration 成立后删除 active source，只保留必要 history/provenance。 |

## OPL-Owned Generic Subdomains

| generic subdomain | OPL owner surface | Domain allowed role | 当前治理重点 |
| --- | --- | --- | --- |
| Generated CLI / MCP / Skill / product shell | Pack compiler、generated interface bundle、`agents interfaces`、`agents conformance` | Domain handler target 或 refs-only adapter | 生产默认 caller 和 direct/hosted parity；domain repo 不再扩写手写 wrapper。 |
| Generated / hosted default caller readiness | `agents default-callers`、`physical_delete_authority_read_model`、`repo_deletion_gate_summary`、`opl_default_caller_surface_deletion_evidence_worklist`、`opl_default_caller_deletion_evidence_refs` | Domain handler target 或 refs-only adapter | 只证明 OPL replacement / active caller cutover，并把 per-surface 删除证据缺口接入 refs-only 读面；结构前置证据 observed 后只推进到 domain owner 三选一裁决入口，不能升级成 open worklist closure、delete ready 或 physical delete authority。 |
| Domain action dispatch surface | OPL generated domain action adapter / domain-handler descriptor、stage-attempt request/projection transport、domain-dispatch read model | Domain handler target、owner receipt / typed blocker producer | OPL 只承载 dispatch transport 和 refs-only ledger；domain action 仍在 domain。 |
| Action metadata / command registration | `agent-platform-surface-ownership.ts`、action catalog、stage control plane | Domain action ids、handler refs、forbidden-write policy | 旧 guarded action catalog 只能作为 declarative pack source 或 thin adapter。 |
| Status / workbench / operator shell | App/operator drilldown、runtime tray、generated status surface | Refs-only projection adapter | Domain repo 不再维护 generic workbench owner；只提供 truth refs 和 blockers。 |
| Workspace / source / artifact / memory locator | Generic substrate projection、lifecycle/index primitives | Opaque ref provider、domain body owner | OPL 只管 locator/ref/transport；body、verdict、mutation authority 留 domain。 |
| Stage attempt / queue / retry / dead-letter | Temporal provider、family runtime、attempt ledger | Owner receipt、typed blocker、domain authority callable | Domain repo 不内置 generic scheduler/daemon/attempt loop。 |
| Generic transition runner | Family transition runner、stage graph route runtime | Transition spec 或 oracle ref | OPL 执行 spec/transport；domain owns route truth、guard 和 verdict。 |

## Per-Agent Migration Classification

| agent | 当前保留 authority | 主要 migration candidates | 当前处置 |
| --- | --- | --- | --- |
| `MAS` | Study truth、publication quality、source readiness、artifact/package authority、AI reviewer judgment、owner receipt、typed blocker。 | CLI/MCP/product wrapper、workspace/source intake shell、status/read-model assembly、progress portal/workbench、owner-route handoff、sidecar domain-ref adapter。旧 `runtime_transport/`、`mas_runtime_core*`、turn runner、worker lease 和 lifecycle refs SQLite writer 已 no-alias retired。 | Fresh MAS contract/source/readback 和 OPL conformance 决定是否仍有 wrapper/source-purity gap；former tail 只作 deletion-gate provenance。剩余 work 若存在，应归 real paper-line、memory/artifact/lifecycle receipt 或 provider SLO evidence gate，不写成功能/结构 gap。 |
| `MAG` | Fundability / authoring quality / export verdict、grant strategy memory body / accept-reject、package authority、transition oracle、owner receipt、typed blocker。 | Product-entry/status/sidecar/grouped CLI shell、product user-loop route-command shell、runtime report locator shell、runtime registration、lifecycle/package/memory projection envelope、autonomy loop shell、source-layout/scaffold scan/read-model shell。 | Fresh MAG repo-native readback 与 OPL default-caller readback 决定 source-shape / replacement state；旧 wrapper / ledger / scheduler / alias / compat 名称只允许作为 deletion gate、policy、provenance 或 negative guard，不是长期组成。 |
| `RCA` | Source readiness、visual direction、review/export verdict、artifact authority、visual memory accept/reject、native helper implementation、owner receipt、typed blocker。 | Product-entry/session/status/sidecar/MCP wrapper、guarded action metadata wrapper、executor adapter shell、runtimeWatch/operator evidence/stability read model、workspace/run envelope、native-helper generic envelope、review/repair transport、artifact gallery/handoff shell。 | Fresh RCA repo-native readback、no-regression proof、no-forbidden-write proof 和 explicit owner receipt / typed blocker 决定 bridge/default-caller 关闭状态；production/default-caller consumption 不能写成 complete。RCA 不再作为 active generic runtime owner 或 structural dirty 读取。 |
| `OMA` | Agent-building semantics、candidate package/work-order/proposal materialization refs、target-agent typed blocker refs。 | Script-level materializers、bootstrap contract pack writer、external suite work-order/blocker output assembly、default-caller deletion evidence contracts。 | Fresh OMA source-structure / script-to-pack readback 决定 source-shape 和 retained generic surface state；`opl-meta-agent` 只是 repo/package/plugin carrier 名。scripts 只允许 authority implementation、smoke helper、fixture/proof helper 或 work-order materializer，不得变成 Agent Lab runner、promotion gate、queue、attempt ledger、App/workbench 或 target truth writer。 |

## High-Risk Surface Groups

| group | examples | class | migration gate |
| --- | --- | --- | --- |
| MAS runtime / watch / outer loop | retired `runtime_transport/*`、retired turn runner / worker lease / lifecycle refs SQLite writer、current owner-route / progress / workbench projection | retired surfaces: history only；current projections: `strict_delete_after_cutover` | 旧 runtime 控制面不复活；current projections 只保迁移所需 MAS owner receipt / typed blocker / domain refs，并在 OPL provider/default-caller parity、real paper-line receipt parity、no-forbidden-write proof 和 no-active-caller 成立后删除 active source。 |
| MAS status / portal / workbench | `study_progress*`、`progress_portal_parts/*`、`product_entry_parts/manifest*` | `opl_framework_migration_candidate` | OPL App/status/workbench default caller parity；不读取 review body，不生成 publication/source/artifact verdict。 |
| MAS workspace/source intake | `workspace_init*` | `opl_framework_migration_candidate` | OPL workspace/source/lifecycle primitive parity；MAS 保留 source readiness 与 workspace policy authority。 |
| MAG product / user-loop / status shell | `product_entry_parts/*`、`loop_contracts*`、`consumer_thinning*` | `strict_delete_after_cutover` | OPL generated/default caller parity、owner receipt / typed blocker roundtrip、no-forbidden-write proof；grant route truth 和 quality/export authority 不迁，shell 删除。 |
| MAG autonomy loop shell | `grant_autonomy_controller*`、`grant_autonomy_loop*` | `needs_split_before_migration` then `strict_delete_after_cutover` | Grant route policy 和 verdict 留 MAG；generic attempt lifecycle / operator report / scheduler semantics 必须迁到 OPL 后删除 MAG shell。 |
| RCA domain-action / manifest / guarded actions | retired `product-sidecar*`、manifest/status builders、domain-action adapter refs | `source_purity_clean_with_no_resurrection_guard` | OPL generated domain-action/default caller parity 已有结构证据；RCA 只保 visual authority action ids、domain handler refs、native helper 和 artifact authority。 |
| RCA skeleton / locator / native helper | `standard-domain-agent-skeleton*`、native PPT helpers | mixed | Generic skeleton / locator / controlled attempt shell 可上收；visual memory accept/reject、native PPT implementation 和 review/export verdict 留 RCA。 |
| OMA script materializers | `scripts/*agent*`、`scripts/lib/*materializer*`、bootstrap pack writers | `strict_delete_after_cutover` except true authority functions | OPL Agent Lab work-order readiness、target-owner return、promotion gate read model parity 后删除 generic materializer shell；只保 candidate package / mechanism proposal authority functions，不写 target truth。 |

## Primitive Support Boundaries

- Generated CLI/MCP/Skill/product-entry/status/domain-handler/workbench default-caller structural replacement must be read fresh from `opl agents default-callers --family-defaults --json`. A clean structural replacement readback is source-purity evidence, not domain physical-delete authorization or production readiness.
- Generic domain-action dispatch transport still needs production-scale domain owner receipt / typed blocker roundtrip and no-forbidden-write proof across real MAS/MAG/RCA/OMA/OBF workloads.
- Generic App/workbench stage-review, executor conversation and status projection lanes must consume refs without reading bodies or generating domain verdicts.
- Generic workspace/source/artifact/memory locator must provide same-ref parity while leaving body and verdict in domain repos.
- Generic private-platform cleanup-gate registry 已能通过 App/operator drilldown、`agents default-callers` 顶层 `physical_delete_authority_read_model` / `repo_deletion_gate_summary` 和 refs-only default-caller deletion evidence 读取 per-surface gate；当前 strict source-purity gate 已闭合。后续只按 production evidence、domain owner authority 和 no-resurrection guard 继续验证；结构前置证据齐全只显示 `domain_owner_choose_delete_authorize_keep_or_typed_blocker`，不把 open worklist 为零或任何新 retained adapter 写成完成态。
- Generic scaffold/source-layout and legacy active-path scan primitive must not turn descriptor readiness into production/domain readiness.
- Agent Lab / OMA handoff vocabulary must remain target-agent generic; domain-specific suite/command families belong in target owner refs or history.

## Verification

Docs-only inventory updates:

- `git diff --check`
- `rg -n '^(<<<<<<<|>>>>>>>)' docs`
- targeted stale wording scan for `compatibility alias`、`provider proof = ready`、`generated surface = domain ready` and old Gateway/frontdoor/Hermes-default wording outside `docs/history/**`

When this inventory drives code or contract changes, use the owning repo verification rather than Markdown wording tests:

- OPL: `npm run test:fast`, `npm run test:meta`, focused conformance/platform-surface tests.
- MAS: `scripts/verify.sh` or focused tests listed in MAS repo-local gap plan.
- MAG: `scripts/verify.sh`, `make test-meta`, focused product-entry/autonomy tests.
- RCA: `npm run test:fast` or focused product-entry/sidecar/native helper tests.
- OMA: `npm test`, `npm run typecheck`.

## Forbidden Claims

- Descriptor ready, conformance passed, generated bundle ready, queue completion, suite pass, file existence or test pass cannot be written as domain quality verdict.
- OPL ledger receipt, stage evidence workorder, provider proof or App drilldown projection cannot be written as MAS paper closure, MAG grant-ready, RCA visual-ready or OMA default promotion.
- The same executor cannot execute and then self-review to close an AI-first quality gate.
- Active caller not migrated means OPL has not fully taken over that surface, even if a replacement descriptor exists.
- Retained refs-only adapter, diagnostic shell, tombstone/provenance code path, compatibility facade, re-export wrapper, or default-caller duplicate is not a standard-agent completion state.
