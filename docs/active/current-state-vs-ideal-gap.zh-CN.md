# OPL Family 当前状态与理想目标差距

Owner: `One Person Lab`
Purpose: 对照 OPL / Foundry Agents 理想目标态，记录 OPL、MAS、MAG、RCA、One Person Lab App 与 MDS 当前实际状态、差距和需要完善的部分。
State: `active_support`
Machine boundary: 本文是人读 gap / completion map。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App 证据。
Date: `2026-05-14`

## 结论

当前 family 已经完成“目标形态的控制面骨架”：`OPL Framework -> One Person Lab App -> Foundry Agents` 三层产品认知成立，MAS/MAG/RCA 都能被 OPL 识别为 descriptor-level aligned 的 standard domain agent，三仓 stage plane 和 domain memory descriptor 也都能被 OPL 只读解析。

回答原计划完成度时应分开两层：核心功能 surface / contract / receipt-ref / typed-blocker 机制已经落地；canonical `./bin/opl agents descriptors --json` 统一 descriptor CLI 已可用，`node dist/cli.js agents descriptors --json` 也已验证同步；显式 Temporal service / worker / production proof 已在本机 managed provider 上返回 `production_residency_proven`，proof receipt 已写入 runtime event ledger 并持久化到 OPL state，随后可被 `framework production-closeout` 投影为 `provider_continuous_proof`；OPL family queue 对 MAS `paper_autonomy/guarded-apply` 任务已能自动建立 task-bound provider-backed stage attempt，并接收 MAS sidecar typed closeout refs；`family-runtime intake/tick --hydrate` 现在能从 active workspace binding 派生 MAS sidecar export command，并自动携带最近一次 persisted Temporal production proof；显式声明 provider-hosted / controlled 的 MAG/RCA sidecar task 也已有 live 证据进入 task-bound attempt，并把 MAG product sidecar receipt / RCA no-regression evidence ref ingest 为 OPL typed closeout。使用 operator 超时预算重跑 production closeout 时，当前状态已推进到 `functional_closure_ready_for_live_soak`、`typed_blocker_count=0`。原计划里仍需要 evidence gate 的部分是破坏性物理目录迁移、真实 memory body / writeback apply、legacy 最终物理删除、长时 provider/operator SLO 和真实 domain owner chain；它们不再表现为 OPL functional closeout blocker，但也不能写成真实 paper/grant/visual soak 已完成。

离理想情况的主要差距不是概念、命名或 descriptor，而是 production closure：

- OPL 默认 fresh runtime view 仍是 `local_sqlite` provider ready，`full_online_ready=false`、`durable_online_ready=false`；这是 dev/offline baseline，不代表 production online readiness。
- 显式 Temporal view 已显示本机 managed service + worker ready，`OPL_FAMILY_RUNTIME_PROVIDER=temporal` 时 `full_online_ready=true`、`durable_online_ready=true`，且 `residency proof --provider temporal --production` 返回 `production_residency_proven`；这证明 provider readiness / residency proof，不等于真实 MAS/MAG/RCA domain owner chain 已闭合。
- `family-runtime residency proof --provider temporal --production` 现在会写入 `temporal_residency_proof` runtime event，并持久化到 `~/Library/Application Support/OPL/state/family-runtime/proofs/latest-temporal-production-proof.json`；`framework production-closeout` 会读取最近 proof receipt 并输出 `provider_continuous_proof`，同时在 `runtime_ledger.provider_continuous_proof` 保留可钻取摘要；`runtime snapshot` 会把 provider proof 作为 operator lane item 投到 attention / recent。当前 live proof projection 为 `all_observed_proofs_proven`，并带有 `latest_event_age_seconds`、`proof_freshness_status`、`proof_slo_status`；这关闭的是 provider proof ledger / operator visibility surface，不关闭长时 SLO 或 domain owner chain。
- MAS/MAG/RCA 都是 `descriptor_aligned`；当前 OPL 读模型显示三仓均已有 repo-source anchor evidence，三仓 legacy tombstone / no-active evidence 已被 closeout 消费。剩余 production closure 主要是 live owner-chain 与物理 follow-through，不是 descriptor 或 tombstone 声明缺口。
- 三仓 memory descriptor 均已 resolved；production closeout gate 可从 typed closeout packet 汇总 consumed refs、consumed memory refs、writeback receipt refs 和 rejected writes，并显式保留 `opl_writes_memory_body=false`。fresh domain-memory read model 中 retrieval apply、writeback apply 和 memory body migration 仍不是 OPL-applied success。
- Runtime snapshot 已有 stage-attempt workbench、stage-attempt operator item、attention queue 和 provider continuous proof operator item 投影；stage attempt item 可只读展示 provider completion、domain ready verdict、controlled apply contract、artifact locator / restore proof、memory refs、writeback receipt refs 与 rejected writes。当前 fresh snapshot 里 `stage_attempt_workbench.summary.total=4`、`by_status.completed=4`，分别覆盖 MAS、MAG、RCA；真实 long-running provider-hosted domain activity 仍未形成连续 owner-chain 证据。
- One Person Lab App 目前是 OPL-branded AionUI shell / workbench fork，消费 OPL runtime truth；它还不是 domain truth owner，也不是 OPL runtime owner。
- MDS 当前只是 MAS 声明的 archive/reference/diagnostic/upstream-intake surface，不是 active Foundry Agent，不需要补成 OPL 同级 domain agent。

本文对照 [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.zh-CN.md)。当前状态和比例判断仍以 [OPL 当前状态](../status.md)、[OPL 架构](../architecture.md)、[OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md) 与 [OPL 生产级框架闭环差距矩阵](./production-framework-closure-gap-matrix.zh-CN.md) 为准。

## Fresh Evidence 2026-05-14

本次文档使用以下 fresh checks：

| surface | fresh result | 读法 |
| --- | --- | --- |
| `git status --short` | OPL 当前有本轮实现与文档改动；MAG/RCA/MAS 证据来自各自 active manifest / runtime surface | 当前 gap 文档基于 fresh read model 和 runtime ledger；不把未提交文档当作已发布机器真相。 |
| `./bin/opl agents list --json` | `aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0`、`production_closure_gap_count=15` | 三仓 descriptor 已对齐；MAS/MAG/RCA 均已有 repo-source anchor evidence；production closure 仍未闭合。 |
| `./bin/opl agents descriptors --json` | `descriptor_surfaces_resolved_count=3`、`memory_descriptor_resolved_count=3`、`stage_control_plane_resolved_count=3`、`action_catalog_resolved_count=3`、`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0` | 统一 domain-agent descriptor 总入口已可用；它聚合 refs、readiness、parity 和 authority boundary，不承载 domain truth 或 memory body。 |
| `node dist/cli.js agents descriptors --json` | `descriptor_surfaces_resolved_count=3`、`memory_descriptor_resolved_count=3`、`stage_control_plane_resolved_count=3`、`action_catalog_resolved_count=3`、`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0` | release/dist CLI 已与 canonical `./bin/opl` descriptor 入口同步；后续作为持续验证项保留。 |
| `./bin/opl stages list --json` | `resolved_planes_count=3`、`stages_count=18`；MAS/MAG/RCA 各 6 个 stage | Stage control plane 已成为 OPL 可读 surface。 |
| `./bin/opl domain-memory list --json` | `resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0` | Memory locator/descriptor 已对齐；真实 retrieval/writeback/body migration 仍由 domain owner 后续闭合。 |
| `./bin/opl family-runtime status --json` | 默认 `configured_provider=local_sqlite`、`provider_ready=true`、`full_online_ready=false`、`durable_online_ready=false`；同一 runtime ledger 中 queue `total=7` / `succeeded=7`，stage attempts `total=4` / `completed=4` | 默认本机 provider 是 dev/offline baseline，不是 production online readiness；attempt ledger 是持久 OPL state，可被 workbench/closeout 消费。 |
| `./bin/opl family-runtime service status --provider temporal --json` | `service_status=running`、`address=127.0.0.1:7233`、`server_reachable=true`、`managed_service_pid=71440` | 本机 managed Temporal service 当前可达；这是显式 Temporal provider 证据。 |
| `./bin/opl family-runtime worker status --provider temporal --json` | `readiness_status=ready`、`worker_ready=true`、`server_reachable=true`、`managed_worker_pid=73456`、`task_queue=opl-stage-attempts` | 本机 managed Temporal worker 当前 ready；worker 仍只拥有 transport/lifecycle authority，不拥有 domain truth。 |
| `OPL_FAMILY_RUNTIME_PROVIDER=temporal ./bin/opl family-runtime status --json` | `configured_provider=temporal`、`selected_provider=temporal`、`provider_ready=true`、`full_online_ready=true`、`durable_online_ready=true`、`adapter_mode=managed_temporal_provider_ready` | 显式 production provider view ready；默认 `local_sqlite` view 与显式 Temporal view 必须分开读。 |
| `./bin/opl family-runtime residency proof --provider temporal --production --json` | `closeout_status=production_residency_proven`，checks 全 true：service reachable、worker ready、completed attempt、restart re-query、signal history、typed closeout required、missing closeout blocks completion、retry/dead-letter boundary、domain truth boundary；runtime event ledger 写入 `temporal_residency_proof` receipt，并返回 `persisted_proof_ref=/Users/gaofeng/Library/Application Support/OPL/state/family-runtime/proofs/latest-temporal-production-proof.json` | Temporal production proof 已通过、已持久化，并可被后续 closeout gate 与 MAS hydrate 读取；剩余 production closure 是真实 domain owner chain、长时 SLO、memory/lifecycle apply 和 artifact mutation receipt。 |
| `node --test tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts tests/src/cli/cases/family-runtime-stage-attempts.test.ts` | focused suite passed | OPL queue dispatch 对 MAS `paper_autonomy/guarded-apply` 已有 task-bound provider-backed stage attempt 证据；显式声明 provider-hosted / controlled 的 MAG/RCA sidecar task 也会建立 task-bound attempt，并把 MAS typed blocker、MAG product sidecar receipt、RCA no-regression evidence ref 进入 OPL typed closeout ledger；测试不证明真实 MAS owner apply receipt、MAG grant-stage owner receipt 或 RCA visual-stage soak 已闭合。 |
| `node --test tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts tests/src/cli/cases/workspace-domain.production-closeout.test.ts` | focused suite passed；production-closeout fixture 现在覆盖 MAG `physical_skeleton_follow_through.legacy_active_path_policy` tombstone evidence | Runtime snapshot / production closeout 已能把 provider proof、stage attempt operator item、typed closeout memory refs、controlled apply refs、artifact locator / restore proof、provider proof freshness 和 MAG legacy active-path tombstone evidence 投影给 App / operator；这些仍是 ref-only read model，不是 domain ready verdict 或 artifact mutation receipt。 |
| `./bin/opl family-runtime intake --domain medautoscience --source binding-hydrate-auto-proof --json` | MAS export command 从 active workspace binding 派生：`command_source=workspace_binding`、`command_cwd=/Users/gaofeng/workspace/med-autoscience`、profile 为 `/Users/gaofeng/workspace/Yang/NF-PitNET/ops/medautoscience/profiles/nfpitnet.workspace.toml`，并自动带上 latest persisted proof；`exported_count=4`，当前重跑为 `idempotent_noop_count=4` | MAS hydrate 已脱离手工 env / `/tmp` proof；OPL 只读取 binding locator 和 proof ref，不写 MAS truth。 |
| MAS guarded-apply live dispatch receipts | 两次 DM002 live dispatch 均返回 `typed_blocker` / `blocked_no_mas_owner_apply_receipt`，receipt refs 为 `artifacts/runtime/opl_family_sidecar/dispatch_receipts/409abb7d61ccadced8e6.json` 与 `artifacts/runtime/opl_family_sidecar/dispatch_receipts/418103627a9c82fa3f1c.json`；OPL stage attempts `sat_d25ea828d7cd06051c859329` 与 `sat_53c82e269f809355cfc925fb` 均为 `completed` / `accepted_typed_closeout`、`writes_performed=false`、`domain_ready_verdict=domain_gate_pending` | OPL/MAS live bridge 可重复传递 MAS owner typed blocker；这是有效生产证据边界，不是论文推进完成，也不是 MAS owner apply receipt 成功。 |
| MAG / RCA live sidecar attempts | MAG attempt `sat_3c210fbc86393af8d3a0e90c` / task `frt_4c4945a0295e8e2c0c6dba6a` 已完成，closeout refs 指向 MAG sidecar receipt；RCA attempt `sat_8623e55a341caf9672ed8ab2` / task `frt_0a2e1877774cecc94f7f2b0e` 已完成，closeout refs 指向 RCA no-regression evidence file | 两条都是 OPL task-bound typed closeout 证据；MAG 仍不是 grant quality / owner apply success，RCA 仍不是 long visual soak 或 artifact-producing owner receipt。 |
| `./bin/opl framework production-closeout --json` | `status=functional_closure_ready_for_live_soak`、`resolved_manifest_count=3`、`descriptor_aligned_count=3`、`physical_skeleton_evidence_observed_count=3`、`resolved_stage_plane_count=3`、`resolved_memory_descriptor_count=3`、`provider_ready=true`、`stage_attempt_evidence.ledger_attempt_count=4`、`typed_blocker_count=0` | 默认 closeout 预算已能解析当前真实三仓 manifest；排除真实 long soak 后，OPL functional closeout gate 已无当前 typed blocker；下一阶段是 live soak / owner-chain / memory body / artifact lifecycle evidence gate。 |
| `OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS=100 ./bin/opl framework production-closeout --json` with stalled manifest fixture | `medautoscience=command_timeout`，typed blocker 为 `domain_manifest_timeout` 且给出 `OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS=10000 opl framework production-closeout` | 显式短预算或真正 stalled manifest 仍 fail-closed；MAS timeout 不是 MAS 论文 truth、质量或 owner apply 失败。 |
| `./bin/opl runtime snapshot --json` | `running_items=0`、`attention_items=7`、`recent_items=1`、`stage_attempt_workbench.summary.total=4`、`by_status.completed=4`、`by_domain={medautoscience:2, redcube:1, medautogrant:1}`、`attention_count=2`、`provider_continuous_proof.latest_closeout_status=production_residency_proven` | Workbench 已展示四条 completed stage attempt 与 provider proof，其中 MAS 有两条 guarded-apply typed-blocker attempt；provider proof item 只代表 provider residency，stage attempt item 只代表 attempt/control/receipt refs，不代表 domain ready；OPL 没有新增本地 daemon。 |
| `npm run build` | exit 0；`tsc -p tsconfig.build.json` passed | release/dist descriptor CLI 验证前已重新构建。 |
| `npm run typecheck` | exit 0；`tsc --noEmit` passed | TypeScript 类型面通过。 |
| `npm run test:fast` | exit 0；`172` tests passed、`0` failed | Fast lane 覆盖 family runtime、provider-hosted attempts、production closeout、runtime snapshot/workbench、descriptor CLI、native smoke、quality details 和 repo hygiene。 |
| `./scripts/verify.sh structure` | exit 0；line budget / explicit rules passed；Sentrux baseline drift 以 advisory 输出，`new complex functions=0`、`worsened complex functions=0`、rules findings `0` | 结构 gate 的阻断项通过；Sentrux quality drift / god-file drift 继续作为后续治理输入，不把它误写成功能阻断。 |

## 总体差距矩阵

| 维度 | 理想情况 | 当前实际 | 差距 | 要完善的部分 |
| --- | --- | --- | --- | --- |
| OPL Framework | 完整生产级智能体开发与运行框架，支撑长期在线、stage attempt、状态、记忆、文件生命周期、恢复和审计 | 控制面骨架、shared contracts、Temporal provider code、local queue/attempt ledger、native helper、runtime snapshot、stage/domain-memory discovery、统一 domain-agent descriptor、owner receipt/ref surface、closeout gate、MAS/MAG/RCA task-bound stage attempt ledger、typed closeout memory-ref summary、manifest command timeout fail-closed、provider continuous proof ledger/projection、release/dist descriptor CLI 同步、显式 Temporal production proof和 `functional_closure_ready_for_live_soak` closeout 已落地 | 真实 domain owner receipt chain、长时 Codex/domain activity soak、memory/lifecycle apply 和 legacy physical delete 未闭合 | 保持 production Temporal proof 持续验证，优先完成 MAS 真实 paper-line owner chain、owner receipt envelope live proof，并把 `./bin/opl` / release CLI 输出一致性纳入持续验证 |
| Stage-led 模型 | 每个 domain stage 有输入、prompt、skill、knowledge、tool、quality gate、handoff 与 closeout | 三仓 18 个 stage plane 可读，descriptor ready；MAS/MAG/RCA 均已有 completed task-bound stage attempt 和 accepted typed closeout | Stage 仍主要证明 OPL attempt/closeout/ref projection；真实 provider-hosted live domain activity 和连续 owner chain 证据不足 | 用 MAS 真实 paper line、MAG grant controlled attempt、RCA visual controlled attempt 跑出 owner receipt / typed blocker / no-regression evidence |
| Agent executor | `Codex CLI` 为默认最小执行器，其他 executor 显式 adapter 接入并可审计 | 默认 Codex 口径已收口；Hermes/Claude 只作为显式 opt-in adapter/proof lane | 非默认 executor 不承诺行为等价；真实长时 Codex runner production soak 未完成 | 继续保留 non-equivalence notice；优先证明 Codex CLI long-running activity、heartbeat、typed closeout 和 domain receipt |
| Domain skeleton | MAS/MAG/RCA 使用统一 `agent/ contracts/ runtime/ docs/` repo-source 边界，runtime artifacts 不进开发仓 | 三仓 manifest/descriptor 声明 aligned；artifact locator surface declared；MAS/MAG/RCA 均已有 repo-source anchor evidence | 当前是 `physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0`；破坏性物理目录重组仍未完成 | 下一步做 path compatibility audit、direct skill parity、OPL-hosted parity、restore/provenance proof、no-forbidden artifact proof，并逐仓物理迁移 |
| Domain memory | OPL 只持 locator / refs / receipts；domain 持有正文、接受/拒绝、route/quality truth | 三仓 memory descriptor resolved；MAS 有 publication-route memory workspace apply closure、body-free receipt inventory、operator grouping 和 stale/deprecated review summary；MAG/RCA 有 receipt/evidence writer 或 proof contract | Fresh OPL read model 中 retrieval/writeback/body migration 仍不是 OPL-applied success；真实 receipt instances 和 body migration 仍不足 | 三仓产出真实 consumed/writeback accepted/rejected receipt；OPL/App 做 ref-only grouping；memory body 始终留在 workspace/runtime owner |
| File lifecycle | OPL 持 workspace/artifact locator、retention、cleanup、restore proof、migration ledger；产物在 workspace/runtime root | OPL lifecycle schema / locator 和 domain proof surface 已存在；MAG/RCA/MAS 都声明 guarded apply proof 或 locator | 跨三仓真实 workspace cleanup/restore/retention guarded apply 仍缺 live artifact mutation evidence | 用 domain-owned receipt 或 typed blocker 证明 artifact mutation；OPL 只写 framework-owned ledger/locator |
| App / Workbench | 用户可以看见 Agent、workspace、stage、progress、artifact、human gate、attention queue，并能按 owner 路由 action | OPL App 是 OPL fork of AionUI；runtime snapshot 有 attention queue、stage-attempt workbench、stage-attempt operator item 和 provider continuous proof operator item；Aion workbench 已有五轴 visibility | 当前 fresh snapshot 无 active domain attempt；App 仍需真实生产运行状态下的 domain receipt / artifact mutation receipt drilldown 与 UI polish | 对接真实 domain receipt；按 domain/stage/memory/artifact refs 分组；保持 App 不写 domain truth |
| Legacy retirement | Hermes-first/Gateway/frontdoor/local-manager/MDS-default 退出 active/default path | 默认语义已退役，三仓 legacy tombstone / no-active evidence 已能被 OPL closeout 消费 | 物理残留仍需 full no-active-caller、replacement parity 和 provenance 保留证据后清理 | 逐项删除或迁入 history/tombstone；保留项必须标明 explicit adapter / diagnostic / fixture / provenance |

## OPL Framework 当前差距

### 已经成立

- 产品认知固定为 `OPL Framework -> One Person Lab App -> Foundry Agents`。
- `OPL` 已持有 family-level shared contracts、action catalog、stage control plane、runtime supervision、persistence/lifecycle/owner-route、domain memory ref/writeback 和 standard domain-agent skeleton contract。
- Runtime Manager 是 provider-backed 产品控制面，不是 domain runtime kernel。
- Native helper 已可用，本机 runtime manager 读模型显示 helper 来自 state cache，native state index freshness 为 fresh。
- `runtime snapshot` 已能投影 attention items、stage-attempt workbench、stage-attempt operator item、provider continuous proof operator item、daemon policy 和 non-goals；stage-attempt operator item 只展示 attempt/control/receipt refs，fresh snapshot 显示 `local_daemon_added=false`。

### 主要差距

- 默认 `family-runtime status` 当前选中 `local_sqlite`，只能代表 dev/CI/offline ledger ready；显式 Temporal provider view 已显示本机 managed service / worker ready，并且 production proof 已返回 `production_residency_proven`。proof receipt 现在进入 runtime event ledger，production closeout 与 runtime snapshot 都能读出 `provider_continuous_proof`，并把它投影成 operator 可发现项；stale proof 会成为 `temporal_provider_proof_freshness_not_current` typed blocker。这关闭的是 provider readiness/proof 可见性缺口，不关闭真实 domain owner chain。
- OPL queue 已能为 MAS `paper_autonomy/guarded-apply` 自动建立 task-bound provider-backed stage attempt，并在 MAS sidecar 返回 typed blocker receipt 时写入 typed closeout ledger；显式声明 provider-hosted / controlled 的 MAG/RCA sidecar task 也已具备 task-bound attempt 与 typed closeout live proof；当前 persisted stage attempt ledger 为 `total=4`、`completed=4`。这证明 OPL task-bound attempt / closeout refs 可跨三仓运转，但仍不能证明真实长时间 online owner-chain execution。
- `./bin/opl agents descriptors` 已成为可调用的统一只读入口；`node dist/cli.js agents descriptors --json` 已验证同步；后续是继续把 release/dist 构建输出、App consumption 和专题入口 drilldown 放进持续验证。
- Production closure 的 OPL functional gate 当前默认返回 `functional_closure_ready_for_live_soak`、`typed_blocker_count=0`；显式短预算或真正 stalled manifest 仍会 fail-closed 成 `domain_manifest_timeout`。剩余缺口是 live evidence：真实 provider-hosted guarded apply owner receipt chain、domain memory body / writeback apply、workspace artifact lifecycle apply 和旧面物理删除。当前 live run 证明了 typed blocker / receipt-ref / no-regression evidence 路径，不证明 owner apply receipt 或 domain quality 成功。

### 需要完善

1. Provider SLO：Temporal service/worker/proof 已纳入 runtime ledger、closeout projection 和 freshness blocker；继续观察 restart/re-query、query/signal/history、operator repair loop 和真实 domain owner chain 的长时稳定性。
2. Stage execution：让 provider-backed attempt 能真实启动 Codex/domain activity，留下 heartbeat、checkpoint、typed closeout、owner receipt 或 typed blocker。
3. Unified read model：保持 `./bin/opl agents descriptors` 作为 domain-agent descriptor 总入口，并让 release/dist 构建、App consumption 和专题 drilldown 持续同步。
4. Closeout gate：保持 owner receipt / typed blocker / no-regression evidence 跨仓生产闭环门禁；当前 operator closeout 已无功能性 typed blocker，后续仍需真实 domain owner receipt / memory apply evidence。
5. Legacy cleanup：在 full no-active-caller、replacement parity 和 provenance proof 后删除 active-path residue 或迁入 history/tombstone。

## MAS 当前差距

### 已经成立

- MAS 是活跃 `Research Foundry` / 医学研究 Foundry Agent，也是 OPL-compatible package。
- MAS 已完成 MDS default dependency 退役；MDS 只保留 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle reference。
- MAS product-entry manifest 已暴露 product positioning、family action catalog、family stage control plane、domain memory descriptor、provider runtime residency read model、guarded soak read model、legacy residue audit 和 standard domain-agent skeleton descriptor。
- Stage-Led Autonomy 已是 repo surface：stage knowledge packet、stage memory closeout packet、memory write router receipt、stage recall index、typed closeout routing、Progress/Portal visibility 和 route materialization guard 已落地。
- MAS 真实三篇 paper line 已有 read-only OPL-ingestable proof：DM002 -> `ai_reviewer_re_eval`，DM003 / Obesity -> `artifact_delta`，且 `writes_performed=false`。
- Publication-route memory 已从 descriptor/seed library 推进到 MAS-owned body-free inventory、OPL/Aion receipt inventory、按 workspace / stage / route family / status 的 operator grouping 和 stale/deprecated review summary；OPL 仍只消费 refs、freshness、分组和 review metadata。
- MAS runtime owner surface 已补齐 closed controller work-unit authorization 清理、runtime turn closeout artifact delta freshness、supervisor-only live quality repair owner routing、AI reviewer currentness guard 和 runtime-read manual finish guard，当前属于 repo-level owner/projection follow-through。

### 主要差距

- MAS 仍不能声明 OPL production-hosted paper automation 已闭合。
- OPL 侧 task-bound guarded-apply stage attempt bridge 已有 focused test 证据；DM002 live guarded-apply dispatch 已返回 MAS owner typed blocker 并进入 OPL typed closeout ledger；真实 provider-hosted live guarded apply soak 尚未跑出连续 MAS owner apply receipt chain。
- Human gate / resume 进入 MAS owner route 的运行证明仍不足。
- Publication-route memory 还需要更多真实 paper-line accepted/rejected writeback receipts；当前 grouping/review summary 已落地，但不替代真实 memory body/writeback apply。
- Legacy compatibility residue 虽有 tombstone/no-active-default-caller proof，物理删除仍需逐项执行。

### 需要完善

1. 用 DM002、DM003、Obesity 继续跑 live provider-hosted guarded apply；DM002 当前有效结果是 `blocked_no_mas_owner_apply_receipt` typed blocker，下一步仍需 artifact delta、AI reviewer update、route decision、human gate、stop-loss 或 MAS owner apply receipt。
2. 每条真实 paper line 留下 attempt query、typed closeout、MAS owner receipt、progress delta / blocker 和 no-forbidden-write proof。
3. 扩展 publication-route memory 的真实 accepted/rejected receipts，保持 memory body 和 accept/reject authority 在 MAS workspace/runtime root；OPL/App 只展示 MAS 输出的 body-free refs、分组、freshness 和 review summary。
4. 把 stage review locator proof 与 Portal/Workbench read-only 展示接到 production provider-hosted live apply。
5. 在 replacement proof 和 no-active-reference proof 后，物理清理旧 compatibility residue。

## MAG 当前差距

### 已经成立

- MAG 是活跃 `Grant Foundry` / medical grant domain agent，也是 OPL-compatible package。
- 单一 MAG app skill、CLI、MedAutoGrantDomainEntry、product-entry/projection commands 与 schema-backed contract 是当前默认 capability surface。
- MAG 已暴露 6-stage grant control plane、family action catalog、runtime_control、runtime_continuity、product sidecar export/dispatch、OPL stage runtime registration 和 standard domain-agent skeleton。
- MAG 已完成 owner receipt contract generalization、controlled domain-memory accepted/rejected runtime receipt evidence path、lifecycle cleanup/restore/retention guarded apply proof、physical skeleton minimum anchors 和 no-forbidden-write projection。

### 主要差距

- OPL 控制面已把显式 provider-hosted MAG guarded-run task 写成 MAG product sidecar action envelope，并把 MAG sidecar receipt refs ingest 为 task-bound controlled stage attempt 的 typed closeout；这是 live OPL 接入证据，但不是 grant-stage owner receipt、grant quality verdict 或 no-regression evidence。
- MAG repo 内 receipt evidence writer 已可把 accepted/rejected decision 写成 runtime receipt instance；真实 OPL-hosted grant-stage attempt 下的 receipt / no-regression evidence 仍未产出。
- Grant strategy memory 的 migration/readiness 是 descriptor 或 proof contract 层，真实 memory body / writeback apply 泛化未闭合。
- 更大范围 source path 迁移和 legacy active-path 删除仍需 path compatibility 与 no-active-caller proof。

### 需要完善

1. 让真实 OPL-hosted controlled grant-stage attempt 经 MAG sidecar / direct entry 产出 domain receipt、typed blocker 或 no-regression evidence。
2. 用真实 OPL-hosted grant-stage attempt 产出 workspace/runtime accepted/rejected receipt 或 no-regression evidence。
3. 对 cleanup/restore/retention guarded apply 做真实 workspace 级 receipt proof。
4. 在 direct skill path 和 OPL-hosted path parity 稳定后，推进 physical skeleton 物理迁移。
5. 清理旧 Hermes/Gateway/local-manager 命名和 legacy manager 入口，保留项迁入 explicit proof/provenance/history。

## RCA 当前差距

### 已经成立

- RCA / RedCube AI 是活跃 `Presentation Foundry` / visual-deliverable Foundry Agent，也是 OPL-compatible package。
- Direct route 已 landed；OPL-hosted route 是 contract/projection landed，但 production provider soak pending。
- `ppt_deck` 与 `xiaohongshu` image-first 是当前默认视觉路线，HTML/native PPTX 是显式可选路线。
- RCA 已暴露 family action catalog、stage control projection、route equivalence、product sidecar export/dispatch、OPL runtime manager registration、standard skeleton、artifact locator contract、domain memory descriptor、controlled visual stage attempt、controlled memory apply proof、domain owner receipt contract、lifecycle guarded apply proof 和 physical skeleton follow-through。
- RCA 已拆分 `review.py` 的 geometry audit、markdown report 与 summary projection helper，并删除既有 line-budget baseline；主 helper 回到默认预算内。

### 主要差距

- RCA 还不能声明 Temporal-backed production execution 或 OPL-hosted controlled visual stage soak 已完成。
- OPL 控制面已把显式 provider-hosted RCA `emit_no_regression_evidence` task 写成 product sidecar action envelope，并把 RCA no-regression evidence ref ingest 为 task-bound visual stage attempt 的 typed closeout；这是 live no-regression evidence ref ingestion 证据，但不是 visual-stage long soak 或 artifact-producing owner receipt。
- 真实 reusable visual lesson body 写入、真实 artifact-producing owner receipt 和 OPL-hosted visual-stage no-regression evidence 仍未跑出。
- Review helper 后续只剩 screenshot capture 主体可继续按自然边界拆分；geometry audit、markdown report、summary projection 已不是 blocker。

### 需要完善

1. 跑真实 OPL-hosted controlled visual stage attempt，让 RCA 返回 domain receipt、artifact-producing owner receipt、typed blocker 或 no-regression evidence。
2. 把 visual pattern memory 从 descriptor/proof 推进到真实 runtime receipt refs 和 reusable lesson body writeback，同时继续禁止 repo 保存 memory body 或 artifact blob。
3. 对 lifecycle cleanup/restore/retention 做真实 visual workspace guarded apply proof。
4. 继续按自然边界拆分 screenshot capture 主体，但不得恢复 line-budget baseline。
5. 在 no-active-caller proof 后，继续清理旧 Hermes/Gateway/local-manager history residue。

## One Person Lab App 当前差距

### 已经成立

- 当前 App 仓是 `opl-aion-shell`，也就是 OPL fork of AionUI；OPL product mainline 是 `gaofeng/main`，upstream `origin/main` 只作为 AionUI sync source。
- App 作为 OPL-branded GUI shell，消费 Codex-default session/runtime truth、OPL runtime snapshot、stage-attempt workbench / operator item、provider continuous proof operator item 和 domain-owned projection。
- OPL 主仓状态已明确 App 预编译包由 `opl-aion-shell` 构建，OPL 一键安装负责打开已安装 App 或下载匹配 release DMG。
- App / workbench 已有 provider completion、domain ready verdict、human gate、dead letter、rejected writeback 等 operator 状态轴的实现方向。

### 主要差距

- App 不是 runtime owner，也不是 domain truth owner；它不能替代 OPL Framework 或 MAS/MAG/RCA。
- 当前 fresh runtime snapshot 没有 running domain attempt，但 `stage_attempt_workbench.summary.total=4` 且四条 attempt 均 completed，其中 MAS 两条 guarded-apply attempt 都是 rejected-write attention；provider proof receipt drilldown 已进入 snapshot 的 attention / recent lane item，stage-attempt operator item 已能投影 domain/stage/blocker/memory/artifact locator refs。App 仍缺真实生产运行状态下的 domain owner receipt、artifact mutation receipt 与长时运行 drilldown 证据。
- App 仓仍是 fork overlay，需要持续处理 upstream AionUI intake 与 OPL-specific overlay 边界。
- 如果界面展示 provider completion、domain ready verdict、quality verdict 或 artifact authority，需要持续防止文案越权。

### 需要完善

1. 用真实 provider/domain receipts 驱动 App drilldown，而不是只展示 fixture / empty workbench。
2. 继续把 stage-attempt / provider proof drilldown 扩展到真实 domain receipt：按 domain、stage、blocker、memory refs、artifact locator 和 lifecycle refs 分组，让普通用户看见“谁负责、卡在哪里、能做什么”。
3. 所有 action button 必须路由到明确 owner：OPL CLI / provider signal / domain sidecar / direct skill。
4. 继续维护 OPL fork boundary：upstream AionUI 变化只通过显式 intake 分支吸收，OPL overlay 保持薄而清晰。
5. App 文案和状态轴持续避免把 provider completion 写成 domain ready verdict。

## MDS 当前差距

### 已经成立

- MDS 当前定位是 MAS/MDS 分层后的 frozen source archive、historical fixture、explicit legacy diagnostic target 与 upstream intake reference。
- MDS 不再是 MAS 默认 runtime backend、default diagnostic dependency、WebUI dependency 或独立 product entry。
- MDS 不作为 OPL active domain agent、默认安装依赖或 stage adapter。
- MDS 仍可作为 source provenance、historical fixture、explicit archive import、backend audit 或 parity oracle reference 被 MAS 显式读取。

### 主要差距

- MDS 不需要补成理想 Foundry Agent；它与理想目标态的差距不是“缺少 OPL skeleton”，而是“历史兼容面还需要继续收缩”。
- MDS daemon、WebUI、quest layout、connector docs、`ds` launcher、runtime home、fork-local runner 和兼容 namespace 仍作为 archive/diagnostic/fixture surface 存在。
- 物理删除必须等待 MAS source provenance、behavior fixture、explicit restore/import 或 upstream intake 替代面闭合。

### 需要完善

1. 保持 MDS archive/reference/diagnostic/upstream-intake 定位，不把它列为 OPL Foundry Agent。
2. 对每个旧兼容面标明 provenance、diagnostic、fixture 或 upstream-intake 用途。
3. 等 MAS 已有 replacement proof 后，再逐项删除或迁入 history/tombstone。
4. 保持 MDS 较早 shared pin 只作为 legacy diagnostic / archive reference，不作为 active OPL adapter 要求。

## 优先完善顺序

当前不建议再新建平行总计划。下一步应按下面顺序收口：

1. `MAS paper-line provider-hosted guarded apply`
   OPL task-bound attempt bridge 已落地；DM002 live dispatch 已两次产出 MAS owner typed blocker，第二次经 active workspace binding hydrate 与 latest persisted Temporal proof 自动触发。下一步以三篇真实 paper line 为主验收，继续争取 MAS owner receipt、progress delta、human gate、stop-loss 或稳定 blocker。
2. `Temporal provider SLO and continuous proof`
   保持显式 Temporal service / worker / production proof 可重复通过，并把 query/signal/history、restart/re-query 和 operator repair 纳入长时 SLO 证据。
3. `Unified descriptor and closeout read model`
   保持 `agents descriptors` 聚合入口稳定；MAS/MAG/RCA sidecar 返回的 owner receipt、typed blocker、no-regression evidence refs 都应进入统一 OPL closeout gate，typed closeout memory refs 只做 ref-only 汇总，domain ready verdict 仍由 domain owner 给出。
4. `Domain memory and lifecycle apply`
   三仓都产出真实 consumed/writeback accepted/rejected receipt、memory body apply evidence 和 cleanup/restore/retention guarded apply receipt。
5. `OPL App operator drilldown`
   用真实 receipts 做 domain/stage/memory/artifact drilldown，明确 action owner。
6. `Physical skeleton follow-through`
   在 direct/hosted parity、restore/provenance proof、focused tests 和 no-forbidden-write proof 都成立后，逐仓迁移 repo-source skeleton。
7. `Legacy physical retirement`
   对 Hermes/Gateway/frontdoor/local-manager/MDS-default residue 做 no-active-caller proof，再删除或归档。
8. `New Foundry Agent admission`
   Patent/Award/Thesis/Review 只按 standard skeleton、stage descriptor、memory locator、artifact locator、quality gate 和 authority boundary 接入，不复制旧路线。

## 当前不能写成

- 不能写成 OPL 已经全量生产可用。
- 不能写成 `local_sqlite ready` 等于 production online ready。
- 不能写成 MAS/MAG/RCA descriptor aligned 等于 physical skeleton layout 已完成。
- 不能写成 provider completion 等于 domain ready / publication-ready / fundability-ready / visual-ready。
- 不能写成 OPL 持有 MAS study truth、MAG grant truth、RCA visual truth 或 MDS archive truth。
- 不能写成 MDS 是新的 OPL Foundry Agent。
- 不能写成 One Person Lab App 是 OPL runtime owner 或 domain truth owner。
