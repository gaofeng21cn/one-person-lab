# OPL 标准化智能体迁移 owner map

Owner: `One Person Lab`
Purpose: `standard_agent_migration_owner_map`
State: `active_plan`
Machine boundary: 本文是人读迁移验收源。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned contracts、domain owner receipt、typed blocker、真实 workspace / App / release evidence。

## 本轮边界

本计划只把本轮审计结论折回 canonical docs，作为后续 Plan Completion Audit 的验收源。当前落地类型是 source / contract / docs / readback 的结构性迁移计划，不声明 production readiness、runtime ready、domain ready、owner acceptance、App release ready、Brand L5 或 live owner-chain scaleout。

涉及的 OPL 主模块是 `OPL Pack`、`OPL Runway`、`OPL Stagecraft`、`OPL Console`、`OPL Ledger`、`OPL Workspace`、`OPL Connect`、`OPL Atlas` 和 `OPL Foundry Lab`。协同 owner 是 MAS、MAG、RCA、OMA、OBF 各自 domain repo。本文不触碰 App runtime、contracts、tests、domain repo、owner receipts、typed blockers 或 runtime state。

## 目标态

标准 OPL Agent 的目标形态固定为：

`Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`

含义：

- Domain repo 用 `agent/`、`contracts/`、stage control plane、capability map、quality gates、knowledge / tool refs 和最小 authority functions 声明领域能力。
- OPL 生成或托管 CLI / MCP / Skill/plugin / App action / status / workbench / session / default-caller / conformance / package transport 等通用面。
- Domain repo 继续持有 domain truth、quality / export / review verdict、artifact authority、memory accept/reject、owner receipt、typed blocker、human gate 和 direct domain skill path。
- 任何 repo-local generic scheduler、queue、session store、progress shell、workbench shell、sidecar/status wrapper、currentness tracker、artifact lifecycle shell、delivery export shell 或 conformance scaffold 都是迁移输入，不是长期设计。

## Domain -> OPL 上收 owner map

| 通用功能面 | OPL owner surface | Domain repo 保留 | 迁移 / 退役 gate |
| --- | --- | --- | --- |
| runtime wrapper、session shell、queue、provider heartbeat、currentness、retry/dead-letter | `Runway` stage-attempt runtime、Temporal-backed provider、StageRun identity、attempt ledger、execution authorization、provider repair readback | domain stage policy、owner answer、typed blocker、human gate、domain retry语义 | OPL replacement parity、same StageRun binding、no-forbidden-write proof、domain owner receipt / typed blocker 或 keep decision |
| progress / owner-delta / workbench / operator projection / delegation | `Console` current owner delta、App/operator drilldown、`Stagecraft` owner-answer projection、`Ledger` refs-only evidence | domain progress truth、artifact delta、quality/export/review verdict、owner receipt | generated surface cutover、active caller proof、route-back / owner receipt roundtrip、no second truth |
| tool affordance、skill inventory、professional Skill carrier、capability registry | `Pack` ABI、`Atlas` registry、`Connect` skill/package sync、generated Codex carrier | professional Skill source truth、domain rubric、domain knowledge、tool-use judgment | pack/compiler conformance、canonical skill source pointer、carrier provenance、no-authority flags |
| artifact lifecycle、delivery export、workspace/source locator、memory locator | `Workspace` project / stage artifact units、`Pack` descriptor / lifecycle refs、`Ledger` evidence refs、delivery/source shell docs | artifact body、package/export authority、memory body、accept/reject decision、domain source semantics | same-ref parity、owner receipt or typed blocker binding、no body migration by OPL、domain delete/keep/typed-blocker decision |
| conformance scaffolding、default caller、domain action adapter、status/read model | `Foundry Lab` scaffold/conformance、`Pack` generated interfaces、`Stagecraft` stage control plane, `Console` status projection | domain handler implementation、authority functions、domain-specific source code | `opl agents conformance` / `default-callers` fresh readback、active-caller cutover、tombstone/provenance ref、owner decision |

## Per-agent owner route

| Agent | 应上收到 OPL 的通用面 | 必须留在 domain 的 authority | 当前计划读法 |
| --- | --- | --- | --- |
| `MAS` | paper route wrapper、progress/workbench shell、session/currentness/delegation、workspace/source/artifact lifecycle transport、provider heartbeat、scientific connector receipt transport | study truth、paper mission truth、publication quality、source/evidence judgment、paper package authority、MAS Scholar Skills professional truth、owner receipt、typed blocker、human gate | OPL 只托管 route / attempt / refs / projection；`paper_mission` 等旧名只能作为 compatibility carrier，不能继续做 OPL canonical vocabulary。 |
| `MAG` | product/status/workbench shell、grant loop session shell、runtime report locator、package/lifecycle/memory projection envelope、default caller | grant truth、fundability verdict、grant strategy memory、grant package/export authority、transition oracle、owner receipt、typed blocker | grant / proposal 词汇可以在 public routing 或 domain profile 中出现，不能作为 OPL base assertion 或 generic lifecycle。 |
| `RCA` | product/session/status sidecar、domain action wrapper、runtimeWatch/operator evidence shell、artifact gallery/handoff shell、generic native-helper envelope | visual truth、layout/review/export verdict、canonical artifact authority、visual memory accept/reject、native helper implementation、owner receipt、typed blocker | visual / RCA 词汇只保留在 profile、fixture、domain repo 或 history；generated domain action / workbench 走 OPL generic surface。 |
| `OMA` | Agent Lab runner、promotion gate read model、target-agent work-order execution refs、generic materializer shell、generated interfaces | agent-building semantics、candidate package refs、proposal materialization refs、target-agent typed blocker refs | OMA 是 standard domain agent；`opl-meta-agent` 只是 repo/package/plugin carrier 名。scripts 只能是 authority implementation、smoke/helper、fixture/proof 或 work-order materializer。 |
| `OBF` | hosted/generated package/workbench、StageRun、Pack / Workspace / Ledger locator、dependency profile / package transport、delivery lifecycle shell | manuscript truth、chapter/source/reference judgment、quality/export verdict、book artifact authority、style/reference memory accept/reject、owner receipt、typed blocker | OBF 是当前 Stage Pack v2 样板；BookForge helper/materializer 的物理删除仍需 owner delete/keep/typed-blocker decision。 |

## OPL base -> 迁出 / 通用化 owner map

| OPL 基座残留 | 目标 owner / 目标形态 | 处理口径 | 禁止声明 |
| --- | --- | --- | --- |
| MAS-specific wording、paper/publication/medical fixtures、RCA visual 或 MAG grant 词汇进入 generic docs / schema / examples | generic vocabulary in OPL；domain profile / fixture / history in domain support docs | 新 canonical surface 使用 `domain_*`、`stage_*`、`owner_evidence_*`、`artifact_*`；domain terms 只作 compatibility、fixture 或 domain profile | 不能把 fixture 当 OPL ontology、domain truth 或 readiness evidence。 |
| App settings 中 MAS/MAG/RCA 具体配置被读成 base runtime identity | App repo owns GUI product truth；OPL owns registry/profile/package refs | OPL docs 只声明 App 消费 standard-agent registry、package profile 和 action refs；具体设置页改动回 App lane | 不能把 App settings clean 读成 OPL runtime ready 或 agent ready。 |
| CLI/API tests 用 MAS 名称作为 base 断言 | generic OPL contract / source tests；domain-specific cases marked fixture/profile | 后续代码 lane 应断言 machine surface、registry id、generic example 或 profile kind，不测试 prose，也不把 MAS 作为 base default | 测试绿不能证明 domain ready、paper progress 或 owner acceptance。 |
| OPL runtime / App shell concrete routing defaults 绑定 first-party agent | `standard_agent_registry`、domain profile、package descriptor、action catalog | default route 来自 registry/profile；MAS/MAG/RCA/OMA/OBF 是 first-party starter / admitted agents，不是框架上限 | 不能把 first-party starter 当用户不可替换的固定身份。 |
| `paper_mission`、`paper-autonomy`、MAG manifest alias、RCA visual profile、OMA/OBF helper-materializer 等 compatibility carrier | profile / fixture / history，或 owner-gated delete/keep/typed-blocker | active caller 存在时保留；caller cutover 后按 no-active-caller、no-forbidden-write、tombstone/provenance、owner decision 退役 | 空 worklist、closed gate、docs patch 或 default-caller clean 不授权 physical delete。 |

## 2026-07-09 fresh audit foldback

| Agent | 本轮结论 | 已落地 / 保持边界 | 未声明 |
| --- | --- | --- | --- |
| `MAS` | 未发现 OPL 误持有 MAS authority；仍有 runtime / workbench / status / capability registry refs-only tail。 | MAS 保留 paper / study / publication / package / owner receipt / typed blocker authority；物理删除前需要 OPL live readback、direct/hosted parity、no-active-caller scan 或 owner decision。 | 不声明 MAS physical delete complete、paper progress、runtime ready 或 package release currentness。 |
| `MAG` | 未发现 OPL 误持有 MAG authority；product/status/user-loop/domain-handler/control-plane/lifecycle 仍是 refs-only adapter tail。 | MAG 保留 grant truth、fundability / export / submission verdict、package authority、strategy memory、owner receipt 和 typed blocker；OPL 侧继续作为 generated/default caller 与 projection owner。 | 不声明 MAG physical delete complete、grant ready、package release currentness 或 owner acceptance。 |
| `RCA` | 标准 package manifest 与 RCA no-false-authority 边界已落地；stage 粒度保持 RCA 现有顶层结构。 | RCA 保留 visual truth、layout/review/export verdict、canonical artifact authority、visual memory、native helper implementation、owner receipt 和 typed blocker。 | 不声明 visual delivery ready、export ready、production ready 或 owner acceptance。 |
| `OMA` | OMA 当前没有新的未治理通用能力；本轮已把 stage-decomposition subpacket chain rebase 到远端测试瘦身提交之后并推送。 | OMA 保留 agent-building semantics、candidate package refs、proposal/materialization refs、target-agent typed blocker refs；Agent Lab runner、promotion gate、attempt ledger 和 generated surfaces 继续归 OPL。 | 不声明 OMA physical delete complete、target agent ready 或 promotion ready。 |
| `OBF` | OBF 的 OMA 命名 stage-native authority fields、stale generated handler paths 与 diagnostic helper default-watchlist 字段错配已清理并推送；family conformance 结构态 readback 已降到 `blocked_count=0`。 | OBF 保留 manuscript truth、style/source judgment、quality/export verdict、artifact authority、memory body、owner receipt 和 typed blocker；generated/current path 只指向真实 repo file 或 OPL generated descriptor refs；publication proof gate 只阻断 publication-proof / final-export claims，不阻断普通 drafting / review-PDF 刷新。 | 不声明 book ready、publication proof ready、final export ready、owner acceptance 或 production ready。 |

## 2026-07-09 final structural readback

本轮最终 OPL readback：

- `opl agents default-callers --family-defaults --json`：`blocked_count=0`、`active_deletion_evidence_worklist_count=0`、`closed_surface_retirement_gate_count=40`、`physical_delete_authorized=false`、`no_further_opl_default_caller_delete_work=true`。
- `opl agents conformance --family-defaults --json`：`passed_count=6`、`blocked_count=0`、`structural_conformance_status=passed`、`structural_contract_status=passed`、`family_live_conformance_probe_status=passed`；`live_domain_progress_status=owner_evidence_recorded_not_ready_claim`，`production_evidence_tail_policy=reported_separately_not_a_structural_pass_condition`。

这证明结构 / contract / generated surface / default caller / conformance readback 已完成本轮迁移闭环；它不授权 domain repo physical delete，不声明 live domain progress complete、domain ready、production ready、owner acceptance、App release ready 或 Brand L5。

## 后续 Plan Completion Audit 条目

后续声称“标准化智能体迁移已全部落地”时，至少逐项审计：

| 验收项 | 需要的 evidence | 不能替代它的证据 |
| --- | --- | --- |
| Domain 通用 wrapper / runtime / workbench 已由 OPL 托管 | fresh OPL generated/default-caller readback、active-caller cutover、same StageRun / owner-answer binding、domain owner receipt 或 typed blocker | docs、descriptor ready、conformance pass、test pass、queue empty |
| Domain authority 留在 domain repo | domain-owned receipt / typed blocker / quality gate / artifact authority readback 与 no-second-truth proof | OPL projection clean、Ledger receipt、App drilldown |
| OPL base 不再把 first-party agent 当 generic ontology | generic vocabulary / schema / readback / tests；domain terms confined to profile / fixture / history | grep clean alone、prose edit alone |
| Compatibility carrier 可退役 | no-active-caller proof、replacement parity、no-forbidden-write proof、tombstone/provenance ref、domain owner delete/keep/typed-blocker decision | empty deletion worklist、closed cleanup lane、focused tests |
| Live Evidence / owner acceptance | provider long-soak、owner-chain live scaleout、真实 App/user path、真实 project run、release / production owner verdict | 本轮 docs patch、contracts、readback、refs-only ledger、focused validation |
