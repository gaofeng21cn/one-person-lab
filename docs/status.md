# OPL 当前状态

Owner: `One Person Lab`
Purpose: `status`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。
更新时间：`2026-06-10`

Plugin native profile pointer: `contracts/opl-native-profile.json` 只声明 OPL Flow / OPL Doc 插件同步与 drift 检查所需的 repo-native profile；它不是 framework truth、runtime truth、domain truth、artifact authority、owner receipt 或 production-ready 证据。

## 读法

本文只保存当前角色、当前成熟度、完成边界、动态真相入口和仍未闭合的缺口类别。它不冻结 receipt id、attempt id、workorder 数字、open/closed counter、branch/SHA、provider tick、ledger verify 流水或某轮 closeout 细节。

需要当前事实时，先读本文给出的 live 命令、contracts/source/tests、runtime ledger、provider receipt、domain-owned manifest、App release/user-path evidence 和真实 workspace evidence。需要历史过程时，读 `docs/history/**`、runtime ledger、提交历史或 domain-owned receipt/provenance。

## 品牌模块成熟度

OPL 顶层设计按当前十个品牌模块管理：`OPL Charter`、`OPL Atlas`、`OPL Workspace`、`OPL Pack`、`OPL Stagecraft`、`OPL Runway`、`OPL Vault`、`OPL Console`、`OPL Foundry Lab` 和 `OPL Connect`。品牌模块是 Framework 内部 bounded context 和成熟度语言，不是新的 runtime、第二 truth source 或 production-ready 证明；模块数量不作为硬约束，只有边界清楚的新 bounded context 才进入 registry。

成熟度读法固定为五级：

| 等级 | 含义 |
| --- | --- |
| `L1 conceptual` | 主要是理念或目标态。 |
| `L2 emerging` | 已有局部 docs/contracts/source。 |
| `L3 structural` | 合同、read model、conformance 或结构边界已经成型。 |
| `L4 executable baseline` | 具备品牌边界、schema/contract、CLI/App action、validate/doctor、docs foldback 和测试。 |
| `L5 production operating maturity` | 真实用户路径、跨 agent scaleout、长跑/恢复 evidence、release/install evidence、运维闭环和 owner acceptance 能持续证明。 |

当前十个品牌模块都达到 `L4 executable baseline` 的 structural/read-only baseline：`contracts/opl-framework/brand-module-registry.json` 持有品牌 registry，`contracts/opl-framework/brand-cli-governance.json` 持有 module-owned CLI command surface 和 `opl agents modules` 内部 branding spine，非 Workspace 模块走 `opl <brand-module> status|inspect|interfaces|validate|doctor --json`，Workspace 只新增 `opl workspace status|inspect --json` 品牌读面，`opl brand-modules validate --json`、`opl agents modules validate --json` 与 `opl contract validate --json` 提供机器守门。`OPL Runway` 的 L4 可执行读面已经扩展到 `opl runway readiness|reconcile|handoff-gates|recovery-repair|control-loop status --json`：这些读面只能表达 provider readiness、desired/current reconcile、handoff gate、repair plan、唯一下一 safe action 和 false-authority flags；Temporal 未配置、service down、worker not ready 或 scheduler missing 都读作 `provider_not_ready` / OPL repair action，不读作 domain ready。`OPL Pack` 是本轮从已有 machine surface 正式提升的第十模块，负责 Declarative Domain Pack、authority ABI、pack compiler、generated/hosted surfaces、standard authority functions，以及 Pack OS 通用 capability pack descriptor / install registry / content-addressed cache / refs-only distribution / lock / artifact lifecycle refs / review receipt refs transport。Pack OS 的机器入口是 `contracts/opl-framework/pack-os-contract.json`、`src/pack-os.ts` 和 `opl pack os inspect|install|registry|cache|distribute|lock|validate --json`；它只证明 descriptor/install/registry/cache/distribution/lock/lifecycle/review receipt refs transport 可用，不声明 domain ready、quality/export verdict、artifact authority、publication ready、App release ready 或 production ready。L5 evidence gate 已由 `contracts/opl-framework/brand-module-l5-operating-evidence.json`、`opl brand-modules l5-status|l5-validate|l5-interfaces --json`、`opl <brand-module> l5-status --json` 和 `opl runtime brand-module-l5-evidence record|verify|list --json` 落地；runtime ledger 只记录/验证本地 refs-only 证据并回投到 L5 status 的 route-level observed refs / receipt refs / ref shapes，不把 ledger receipt 计为 satisfied requirement。当前 ledger 已有 Runway `long_soak_recovery` 的 1 条 verified refs-only receipt，所有模块仍是 `evidence_required`，没有模块声明 `L5`；L5 不能由 docs foldback、contract validation、CLI governance pass、conformance pass、verified ledger、provider completion、pack lock written、Runway repair action 或 App projection 单独关闭。

当前 runtime / product / policy 文档入口按十模块做 thin mapping：Workspace 是 resource root；Pack 是 Declarative Domain Pack、authority ABI、Pack OS 和 generated/hosted surface 输入；Stagecraft 是 stage / transition authority 与 capability use policy；Runway 是 provider durability；Atlas 是 topology / decision-map / resource telemetry 与 domain capability registry catalog；Vault 是 passive evidence telemetry；Console 是 App/operator cockpit 与 `current_owner_delta` default read root；Foundry Lab 是 improvement control plane；Connect 是 module/skill/plugin discovery；Charter 是 owner split / surface budget / forbidden claim。这个 mapping 是维护入口，不是新成熟度结论；每个模块的 L5 仍必须由真实用户路径、跨 agent scaleout、长跑/恢复 evidence、release/install evidence、运维闭环和 owner acceptance 证明。

2026-06-10 foldback：MAS 的 Agent OS 目标态已提升为 family-level `Foundry Agent OS` 标准，机器锚点是 `contracts/opl-framework/target-operating-architecture-contract.json#foundry_agent_os_standard`。该标准要求 MAS/MAG/RCA/OMA 都按 `OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry` 读取：Capability Registry 只归 `Atlas + Pack + Stagecraft` 承载 registry / ABI / use-policy，默认 `current_owner_delta_bound_jit_or_fail_open`；Console/Runway/Vault/Pack 继续证明 false authority flags。原先独立的 OPL / MAS supervisory acceptance 目标已折回 Foundry Agent OS plan 的 `Supervisory acceptance gate`，只作为 W0/W2/W6/W7 的验收细目：OPL 可以 intake / verify / project refs，但不能修 MAS currentness 源头、不能生成 MAS owner receipt / typed blocker、不能把 queued provider candidate 或 provider completion 写成 domain completion。当前 W0 读面已落为 `opl_foundry_agent_os_conformance`，W1/W5 已落为 MAS/MAG/RCA/OMA `generated_direct_parity`，RCA 同名 MCP descriptor drift 已按 source lineage / accepted-answer shape disambiguation 修复，W3 已落为 current-delta-bound Capability Registry resolver ABI 并消费 external-learning refs，W4 已落为 MAS/MAG/RCA/OMA domain kernel manifest，W6 已落为 App `current_owner_delta` ordinary cockpit contract，W7 已落为 `owner_evidence_intake`、`foundry_agent_os_production_evidence_gate.owner_route_work_orders`、domain owner evidence routes 和 private-platform retirement work order。`owner_evidence_intake` 读取 domain owner payload summary、MAG `contracts/production_acceptance/mag-production-acceptance.json`、RCA `contracts/owner_chain_live_progress_evidence.json`、OMA `contracts/target_agent_owner_chain_evidence.json`、Brand L5、App release 和 Codex App runtime evidence 的 refs-only ledger，并只把 observed refs 回投为 work-order context；这些只关闭 structural / functional landing、production evidence intake、work-order projection 和 non-closing guard，不声明 domain ready、Brand L5、App release ready 或 production ready。

2026-06-10 operating-model foldback：当前人读状态按 multi-plane operating model 解释，但 active baton 仍回 [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)。ordinary route 只有一条：fresh `current_owner_delta -> accepted owner answer shape -> domain/App/brand owner receipt、typed blocker、human gate、quality/export/review receipt、release verdict 或 route-back evidence -> next current_owner_delta`。`Runway` 是 durable execution / repair plane，`Console` 是 App/operator owner-action plane，`Vault` 是 passive evidence / telemetry plane；它们只能提供 refs、safe action、OPL runtime blocker、audit packet 或 false-authority flags，不能生成 domain owner answer、domain typed blocker、quality verdict、artifact authority、App release verdict、Brand L5 或 ready declaration。

## 当前公开角色

`OPL` 当前公开认知固定为三层：`OPL Framework -> One Person Lab App -> Foundry Agents`。

| 层 | 当前职责 | 不拥有 |
| --- | --- | --- |
| `OPL Framework` | Codex-default activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、shared contracts/indexes、Agent Lab、generated/hosted surface、safe action shell 和跨仓治理。 | domain truth、memory/artifact body、quality/export verdict、owner receipt authority、App release verdict。 |
| `One Person Lab App` | 面向人的工作台，消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source/artifact/memory refs、SLO、repair、workorder 和 owner-aware action。 | OPL runtime/provider implementation、domain truth、artifact authority、quality/export verdict、长跑任务外围驱动。 |
| `Foundry Agents` | MAS/MAG/RCA/OMA 及后续 domain agent，持有 domain pack、stage semantics、quality/export verdict、artifact authority、memory body / accept-reject decision、owner receipt、typed blocker 和 direct/generated skill path。 | Framework runtime、generic queue/attempt ledger、App release truth、跨 domain shared primitive。 |

普通用户 App 形态按 `Codex App wrapper` 读取：固定 `Codex CLI` executor，内置 MAS/MAG/RCA/OMA task entry。AionUI 原生多 backend、多 Agent 选择、非默认 executor adapter 和 shell implementation 细节只能进入显式 developer/operator diagnostic，不是普通用户 product truth。`one-person-lab-app` 是 GUI product truth、active-shell contract、validator 和 release/user-path evidence owner；`opl-aion-shell` 与 `opl-agui-codex-shell` 是 App-owned implementation carrier / candidate，不是 OPL runtime owner。

`Codex CLI` 是当前第一公民 executor。标准 OPL Agent 的默认长跑路径是 `opl_temporal_hosted_autonomous`：任务启动后进入 OPL/Temporal 托管的 stage attempt runtime，由 OPL provider scheduler / typed queue / wakeup / resume-requery / retry-dead-letter / attempt ledger 持久在线推进；Codex App 只承担启动、观察、介入和投影入口。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent`、`claude_code` 与 `antigravity_cli` 同属显式非默认 executor adapter/backend，以 request/stage binding、receipt/audit/fail-closed 证明连接，不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。

`MDS` 不进入 OPL 顶层 agent 列表。它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 或 parity oracle reference。

## 当前真实状态

OPL 已具备 framework 主干：

- domain descriptor / stage / action / memory discovery；
- Temporal provider code、service / worker lifecycle、typed family queue、stage attempt ledger、typed closeout、retry/dead-letter、human gate 和 execution authorization / closeout binding guard；
- evidence worklist read model、provider proof / SLO projection、runtime snapshot、safe runtime action shell、App/operator drilldown read model 和 refs-only external evidence ledger；
- State Index Kernel、Stage Artifact / Workspace topology、workspace ensure/validate/doctor/adopt/upgrade/export-map/health/inspect/inventory surfaces；
- Agent Lab、Foundry Agent series contract、standard domain-agent scaffold / conformance、generated/hosted interface 和 default-caller / cleanup / no-resurrection guard；
- OPL-owned refs-only intake / projection for domain-dispatch、stage-production evidence、memory/artifact/lifecycle/no-regression receipt refs。

这些 surface 只证明 Framework 的 transport、ledger、projection、guard、recovery、admission 和 diagnostic 基础可用。它们不读取 memory/artifact body，不写 domain truth，不接受或拒绝 memory writeback，不授权 artifact/package/export readiness，不生成 owner receipt / typed blocker，也不声明 domain ready、App release ready 或 production ready。

Agent Lab、observability eval 和 mechanism improvement 继续是 refs-only control plane。OPL 只消费 refs，不写入 body、truth、artifact、owner receipt 或 quality verdict；domain truth、quality/export verdict、artifact authority、memory body 和 owner receipt 仍归 MAS/MAG/RCA。

当前状态摘要：

| 面 | 当前读法 |
| --- | --- |
| Framework runtime | `Codex CLI` first-class executor + Runway control-loop runtime L4 executable read surface + Temporal-backed production online substrate + local/dev diagnostic baseline；`provider_not_ready` 是 OPL repair owner，不是 domain ready。 |
| App/operator | 默认 owner-delta-first；App 只启动、观察、介入和展示，不驱动外围长跑任务。 |
| Multi-plane operating model | `Console` 只消费 `current_owner_delta` 和 owner-action refs；`Runway` 只承载 provider attempt / lease / execution authorization / repair / reconcile refs；`Vault` 只保存 refs-only evidence、lineage、telemetry 和 audit packet。三者都不生成 domain owner answer、typed blocker、quality verdict 或 ready declaration。 |
| Foundry Agent structure | MAS/MAG/RCA/OMA 通过 contracts / descriptors / conformance 暴露标准 pack、stage、quality gate、authority function 和 direct/generated skill path。 |
| StageRun / owner answer | OPL 可签发 provider attempt、active lease、execution authorization decision 和 closeout binding refs；合法 closeout 仍必须来自 domain owner receipt、quality gate receipt、typed blocker、human gate 或 route-back evidence。 |
| Ordinary progress spine | `current_owner_delta` 机器读面已暴露 `ordinary_progress_spine`、T0 `progress_delta_receipt`、`artifact_tier_policy` 和 passive `audit_sidecar_policy`；App ordinary cockpit 与默认读面同步消费这些字段。它只让普通 owner delta 更短、更可接力，不授权 domain ready、App release ready、artifact/memory mutation、physical delete 或 production ready。 |
| Workspace / State Index | OPL 维护 workspace topology、workspace inspection、resource inventory、workspace report、workspace fleet report、Project lifecycle runtime、delete safe gate、Stage Artifact Unit、stage outputs index/current pointer 和 refs-only SQLite sidecar；workspace governance v2/v3 把 canonical generated roots 固定到 `control/opl/projections` 与 `control/opl/reports`，根层 `workspace_*.json` 只作兼容 mirror；新 workspace 的 Project Unit 默认物理集合是 `projects/<project-id>`，MAS `studies` 与 RCA/MAG/OMA `deliverables` 只作为 display / legacy alias；完成状态继续由 stage folder、manifest validity、owner receipt / typed blocker、current pointer 和 lineage 推导。 |
| Pack OS | OPL Pack 已有通用 refs-only pack descriptor/install/registry/cache/distribution/lock/lifecycle/review receipt transport：descriptor intake、registry entry、content-addressed cache manifest、distribution bundle manifest、lock projection、resource hash/ref、artifact lifecycle refs、review receipt refs 和 provenance 可被 OPL 读取、校验和写入。 | 该 surface 不存 artifact body 到合同、不改写 domain artifact、不签 owner receipt、不生成 typed blocker、不把 review receipt refs 当 quality verdict，也不授权 publication/grant/visual/App ready 或 production ready。 |
| External evidence | OPL 可记录/验证 body-free refs-only receipts；`runtime brand-module-l5-evidence` 同样只记录品牌模块 L5 evidence refs。verified ledger 只证明 refs transport 与 preflight 可用，不关闭 domain verdict、L5 completion 或 production evidence。 |

2026-06-09 foldback：本轮跨仓推进已把 MAS Stage Native next-action admission、MAG/RCA/OMA owner-chain canary evidence 和 App release evidence cohort readout 吸收回各自 `main` 并推送。OPL live readout 仍按 `framework_control_plane_available_with_hard_blockers` 读取：fresh `current_owner_delta.current_owner=med-autoscience`，具体 stage / lineage 以 `opl framework readiness --family-defaults --json` 为准。若当前 stage 是 `paper_autonomy/guarded-apply` 且 desired delta 是 `domain_owner_receipt_quality_gate_or_typed_blocker_required`，accepted / required answer shape 统一投影为 `domain_owner_receipt_ref`、`quality_gate_receipt_ref`、`typed_blocker_ref`、`human_gate_ref` 或 `route_back_evidence_ref`；缺的是 MAS/domain-owned owner answer，不是 OPL provider transport 再跑一次。`opl framework operating-maturity --family-defaults --json` 同步暴露 `current_owner_delta_bridge`，把 L5 / evidence lane 汇总重新锚回同一个 `current_owner_delta` source，并明确 evidence lane 只是 audit sidecar，不能生成默认 next action。`opl runtime app-operator-drilldown --json` 可暴露 current-default-actionable drilldown route，但 route 需要 domain/App payload，空 payload preflight fail closed；它们不能由 OPL 自动闭合。OPL current-control admission 继续执行 stage packet、StageRun identity、source fingerprint 和 owner-answer binding hard gate；缺 packet、缺 binding 或 stale identity 时 fail closed，而不是把 provider completion 写成 domain ready。`opl agents conformance --family-defaults --json` 的 blocked 状态不能被 repo-local canary commit、controlled fixture、suite pass 或 refs-only ledger 自动关闭。后续 runtime ledger 已记录并验证 Runway `long_soak_recovery` 的 1 条 Brand L5 refs-only receipt；`opl framework operating-maturity --family-defaults --json` 仍是 `evidence_required` / `L4_executable_baseline -> L5_production_operating_maturity`，但 App user-path evidence lane 已折返为 `app_release_user_path_open_count=0`，cleanup owner-decision missing 已折返为 `cleanup_retirement_open_decision_count=0`。provider long-soak 与 memory/artifact/lifecycle lane 现在也从 App drilldown / provider proof 派生非 null refs-only `open_count`：count 只说明该 lane 的 evidence/reconcile 缺口，不授予 production ready、domain ready、artifact ready、memory accepted 或 package/export ready。真实 L5、App release-ready、domain ready、physical delete authorization 和 production ready 均未授权声明。

## 未闭合项

具体数量和 drilldown 以 live CLI/read-model 为准，本文只保留类别和完成口径。

| 类别 | 仍缺什么 | 完成口径 |
| --- | --- | --- |
| `App release / user path` | OPL maturity 已消费 App drilldown 的 verified same-cohort user-path refs：`production_user_path_ready=true`、`verified_ledger_receipt_ref_count=6`、`release_ready_authorized=false`。仍缺 App release owner 的 release-ready / production-ready verdict。 | App release-owner receipt / typed blocker 或 release verdict 关闭 release-ready；OPL Framework 只记录 refs，不替 App 声明 release-ready。 |
| `Domain owner-chain scaleout` | MAS paper、MAG grant、RCA visual、OMA target-agent stage 在 OPL-hosted path 下持续返回 owner receipt、typed blocker、human gate、quality/export/review receipt 或 no-regression evidence。 | Domain-owned receipt / typed blocker 关闭对应 stage / transition / owner-chain 缺口；OPL 只承载 transport、ledger 和 projection。 |
| `StageRun closeout currentness` | 当前 owner delta、StageRun identity、manifest、current pointer、source fingerprint、idempotency、provider attempt、active lease 和 execution authorization decision 必须绑定到同一个合法 owner answer。 | 缺 provider / lease / authorization 时默认 owner 是 OPL runtime blocker；只缺 owner answer / closeout binding 时默认 owner 回到 domain owner。OPL 不借用旧 blocker 或 study-level decision 伪闭合。 |
| `Memory / artifact / lifecycle apply` | `operating-maturity` 已从 App drilldown 的 memory/artifact/lifecycle refs 与 reconcile counters 派生 `memory_artifact_lifecycle_open_count`；真实 memory retrieval/writeback、accepted/rejected receipt、artifact mutation receipt、package/export lifecycle receipt、cleanup/restore/retention 对账仍属 domain owner。 | Domain-owned surface 产生真实 receipts；OPL 只 intake / verify / project refs，count=0 也不代表 OPL 保存 memory body、修改 artifact body 或声明 package/export ready。 |
| `Provider long-soak` | `operating-maturity` 已从 provider cadence window / capability projection 派生 `provider_long_soak_open_count`；Temporal service/worker、provider cadence/capability、domain owner-chain dispatch、retry/dead-letter 和 repair loop 仍需在更长窗口内持续满足。 | Long-soak refs、provider state linkage、operator evidence refs 或 typed blocker refs 可重复 record/verify；count=0 只说明 provider lane evidence observed，不外推为 production ready 或 domain ready。 |
| `Runway control-loop runtime` | Runway 目标态按 L4/L4+ 结构强化读取：Temporal 只做 durable substrate，worker supervisor 只保 worker liveness，scheduler 只提供 cadence，Progress Reconciler 比较 desired/current 并输出唯一下一 safe action、owner/gate wait 或 OPL runtime blocker。`readiness`、`reconcile`、`handoff-gates`、`recovery-repair` 和 `control-loop status` 是已落地读面；Temporal 未配置时必须返回 provider repair owner。 | 该能力是 L5 evidence 前置，不是 L5 完成。真实 L5 仍需长跑/恢复、跨 agent scaleout、operator repair loop、release/install 和 owner acceptance 证据；handoff/gate/reconciler refs、provider repair、verified ledger 和 no-open-blocker 不能伪造 domain truth、receipt、typed blocker、verdict 或 production long-soak closure。 |
| `Private platform retirement` | Default-caller deletion evidence worklist 仍有 32 项 refs-only audit surface；fresh cleanup owner-decision missing count 为 0，`physical_delete_authorized=false`。 | 只有 domain owner 给出 physical delete authorization 才能物理删除；否则保持 authority adapter / tombstone / typed blocker 路径，OPL read-model 不能授权删除。 |
| `Brand module L5` | 当前十个品牌模块的 L5 evidence matrix、可执行 read/validate surface 和 refs-only runtime evidence ledger 已落地；Runway `long_soak_recovery` 已有 1 条 verified refs-only receipt；真实 L5 运营证据仍缺。 | 各模块用真实用户路径、跨 agent scaleout、long-soak、release/install、owner acceptance 和运营闭环证明；L4/L3、contract validation、provider completion、verified ledger 和 App projection 只能作为输入。 |
| `Workspace governance L5` | v3 已建立 profile binding、profile fingerprint、migration history、topology events、canonical generated projections/reports、root mirror 兼容、workspace report 用户检查面、workspace fleet report、workspace_norm 全量 projection drift gate、active/paused/archived/superseded/locked lifecycle、project delete safe gate 和 shared resource provenance refs-only inventory。 | 当前只声明 `L4_structural_baseline`：合同、初始化/ensure/upgrade/adopt 物化、validate/doctor drift gate、fleet report、lifecycle 操作和用户检查面可用。L5 仍需真实 App user path、跨 MAS/MAG/RCA/OMA scaleout、长跑迁移/恢复证据、release/install evidence 与 owner acceptance，不能由 workspace_norm pass、fleet report 或 generated projection currentness 单独关闭。 |

## Live 真相入口

当前状态、计数、receipt、attempt、workorder 和 owner-delta 必须从 live readout 读取：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl framework operating-maturity --family-defaults --json
rtk opl stages readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl runtime app-operator-drilldown --detail full --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl app state --profile fast --json
rtk opl brand-modules validate --json
rtk opl brand-modules l5-status --json
rtk opl runtime brand-module-l5-evidence list --json
rtk opl runtime domain-owner-payload-summary list --json
rtk opl runtime app-release-evidence list --json
rtk opl runtime codex-app-runtime-evidence list --json
rtk opl charter status --json
rtk opl pack status --json
rtk opl runway doctor --json
rtk opl runway readiness --json
rtk opl runway reconcile --json
rtk opl runway handoff-gates --json
rtk opl runway recovery-repair --json
rtk opl runway control-loop status --json
rtk opl agents modules validate --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
rtk opl index doctor --json
rtk opl workspace interfaces --json
rtk opl pack os inspect --descriptor <path> --json
rtk opl pack os install --descriptor <path> --registry <path> --json
rtk opl pack os registry --registry <path> --json
rtk opl pack os cache --descriptor <path> --cache-root <dir> --json
rtk opl pack os distribute --descriptor <path> --output <path> --json
rtk opl pack os lock --descriptor <path> --json
rtk opl pack os validate --descriptor <path> --json
rtk opl workspace fleet report --json
rtk opl workspace inspect --workspace <path> --json
rtk opl workspace inventory --workspace <path> --json
rtk opl workspace health --workspace <path> --json
rtk opl workspace project lifecycle --workspace <path> --project-id <id> --status paused --dry-run --json
rtk opl workspace project delete --workspace <path> --project-id <id> --dry-run --json
```

默认阅读顺序是 owner-delta-first：先从 `current_owner_delta` 看等待哪个 owner、需要什么 deliverable delta / receipt / typed blocker，以及该等待是否阻断 readiness。OPL provider / transport safe action 只有在没有 current owner delta 时才可成为默认下一步。raw refs-only counters、provider worker / redrive / scheduler route、evidence envelope、stage replay packet、typed blocker group、private residue inventory 和历史 receipt 计数都只作 drilldown。

Runtime / product / policy 入口的迁移读法同样服从 owner-delta-first：新增 App Console 页面、Agent Lab control-plane view、Atlas/Vault telemetry、route reconciler、artifact reconciler 或 generated surface 时，先证明它是否能折叠成 `current_owner_delta`、owner answer、typed blocker、hard gate、route-back 或 audit/ref drilldown。不能折叠的内容只作为 diagnostic、history、cleanup 或 support 入口，不进入默认 next action，也不改变 active gap owner。

`family-runtime provider-worker supervisor` 现在提供 provider worker process 的本机监督面：macOS 上安装 LaunchAgent 后由 `KeepAlive` / `RunAtLoad` 托管 resident Temporal foreground worker，并把 `--family-runtime-root` 绑定到当前 OPL state root。这个 supervisor 对齐 Temporal 的部署分层：Temporal Service 持有 workflow history、task queue、retry 和 activity timeout；Worker process 的存活由 deployment / supervisor 层保证，云端目标是 Kubernetes / systemd / container supervisor，本机目标是 launchd。旧 `provider-slo watchdog` 的 5 分钟 `StartInterval` tick 安装面已退役，安装新 supervisor 时会清理旧 `ai.opl.family-runtime.provider-slo` LaunchAgent。`provider-slo tick` 继续作为显式 health-check / production proof / fallback repair receipt，不作为主调度器、不消费 domain queue、不写 MAS/MAG/RCA truth、不生成 owner receipt 或 typed blocker，也不把 provider 恢复解释成 paper/grant/visual 进展。默认读面仍必须先看 current owner delta；supervisor 只负责让 OPL provider worker 不因进程退出而静默停止。

Runway control-loop runtime 的当前人读方向是：scheduler 只制造 reconcile 机会，worker supervisor 只维持 worker process liveness，Temporal 只保存 durable execution history 和消息语义，Progress Reconciler 才负责把 desired owner route / current queue-attempt-provider-gate-receipt refs 对账成唯一下一 safe action。`opl runway readiness|reconcile|handoff-gates|recovery-repair|control-loop status --json` 是当前已落地读面；Temporal 未配置、service down、worker not ready 或 scheduler missing 必须投影为 `provider_not_ready` / OPL repair action。handoff、human gate、provider observation 和 reconciler output 只能携带 refs、typed blocker requirement、owner answer shape 或 OPL repair command；不能把 provider completed、worker healthy、scheduler ticked、gate passed、repair succeeded、no-open-blocker 或 chosen action 写成 domain ready、owner receipt、quality verdict、artifact ready、production ready 或 Runway L5 证据闭合。

## 当前默认入口

- 默认前门是 `opl`；`opl --help` / `opl help` 展示 OPL Framework 自有命令树，`opl exec` 负责一次性请求，`opl exec --help` 保留 Codex-compatible 执行器帮助边界，`opl resume` 负责续接会话。
- `opl install` 是当前一键安装入口，负责安装或复用 Codex CLI、Temporal-backed family runtime provider、MAS、MAG、RCA、OPL Meta Agent、推荐 skills 和 App 入口。
- `opl system` / `opl system initialize` / `opl system startup-maintenance` 管理 Codex CLI、provider profile/readiness、Connect module install/update、Connect skill sync、managed environment freshness、plugin cache freshness、reload prompt 和 local runtime state。
- `opl framework readiness --family-defaults --json` 是 family readiness 动态真相入口；它只输出 framework/operator 读面，不授权 domain ready、artifact authority 或 production ready。
- `opl framework operating-maturity --family-defaults --json` 是轻量 maturity gap aggregator，把 `current_owner_delta_bridge`、`owner_evidence_intake`、domain owner-chain scaleout、Brand module L5、App release/user-path、provider long-soak、private wrapper retirement 和 memory/artifact/lifecycle receipts 汇总为 refs-only 下一步读面；`owner_evidence_intake` 可读取 MAG production acceptance、RCA owner-chain live progress、OMA target-agent owner-chain evidence、`agents default-callers` private-platform refs 和 `runtime app-operator-drilldown` memory/artifact lifecycle refs，并只投影为 observed refs。它以 current owner delta 为默认 planning root，不跑全量 release/user-path proof，不替 App/domain owner 签 receipt 或 typed blocker，不声明 L5、App release ready、domain ready 或 production ready。
- `opl stages readiness --family-defaults --json` 是 stage readiness family drilldown 入口；单仓诊断继续使用 `opl stages readiness --domain <domain> --json`。
- `opl runtime app-operator-drilldown --json` 与 `opl runtime app-operator-drilldown --detail full --json` 是 App/operator drilldown 入口。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 是 runtime safe-action evidence worklist、stage evidence workorder packet、stage replay missing receipt attention packet 与 domain-dispatch evidence workorder packet 入口；cache-derived attention 仍不授权 domain truth、owner receipt、artifact authority 或 production ready。`family-runtime production-closeout` 已退役，不再是 active interface 或兼容 alias。
- `opl work-order execute --work-order <developer-patch-work-order.json> --json` 是 owner-gated developer patch work order 的唯一 canonical OPL 执行原语；Agent Lab 只消费该原语产出的 execution receipt、execution plan/report refs 与 re-evaluation refs，旧 `opl agent-lab execute-work-order` 兼容 alias 已退役。

## 当前不能声明

- 不能声明 OPL 已全量生产可用。
- 不能声明 Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- 不能把 StageRun authorization、stage evidence workorder、domain-dispatch evidence workorder、refs-only receipt verified、provider/SLO satisfied、ledger closed 或 open worklist 为 0 写成 domain owner-chain、App 用户路径、release/dist、artifact authority、expected receipt instance、monitor freshness、long-soak evidence、domain ready、App release ready 或 production ready。
- 不能把 Runway safe action / repair、Console owner-action projection、Vault verified refs、multi-plane health 或 ideal operating model foldback 写成 domain owner answer、domain typed blocker、quality/export/review verdict、artifact authority、App release verdict、Brand L5、physical delete authorization 或 ready declaration。
- 不能声明 private functional audit 分类完成就等于物理代码路径清零。
- 不能把 owner-delta summary、`next_forced_delta`、`goal_oracle_missing`、selected cohort 或 typed blocker verified 写成完成。
- 不能把 `agents legacy-cleanup apply` 的 dry-run / apply / verify ready 状态写成 OPL 已删除 domain repo 文件或 production evidence 已闭合。
- 不能为了兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。

## 参考入口

- [文档索引](./README.md)
- [项目概览](./project.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)
- [OPL 与 Foundry Agents 理想目标态](./references/runtime-substrate/opl-family-agent-ideal-state.md)
