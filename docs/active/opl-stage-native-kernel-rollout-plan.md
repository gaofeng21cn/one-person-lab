# OPL Stage Native Kernel 设计支撑

Owner: `One Person Lab`
Purpose: `stage_native_kernel_design_support`
State: `active_support`
Machine boundary: 本文是人读设计支撑与反膨胀约束。机器真相继续归 `contracts/`、schema、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、Stage Folder、owner receipt、typed blocker、真实 workspace 与 App evidence。当前落地状态、剩余 gap、下一步 owner 和验证入口只回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

## 读法

本文不再维护执行路线、canary 顺序、当前落地清单或下一轮写入范围。它只保留 Stage Native Kernel 的设计对象、owner split、admission 分层和 forbidden claims，防止后续实现把 StageRun Kernel 做成第二套 controller、worklist 或 proof ledger。

当前唯一 active owner 是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。Stage Native 的 machine surface 是否已落地、MAS/MAG/RCA/OMA 是否已通过 conformance、App cockpit 是否消费 StageRun、domain canary 是否完成、旧补偿链是否可退役，都只在唯一 active owner 或 live contracts/source/tests/CLI/read-model 中判断。

2026-06-06 live foldback 口径：`opl agents conformance --family-defaults --json` 当前证明四个 domain 的 StageRun profile 和 controlled canary evidence 已进入结构门；`opl framework readiness --family-defaults --json`、`opl agents default-callers --family-defaults --json` 与 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 当前状态只回 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 与 live readout 判断。这里不维护 dated counters，也不把 conformance pass、production evidence tail closed、open tail 为 0、provider SLO satisfied、controlled OMA canary、default-caller no-active-caller proof 或 refs-only ledger 写成 live domain progress、target-agent ready、domain ready、physical delete ready 或 production ready；本文件只保留设计支撑和 anti-bloat 边界。

## 目标内核

Stage Native 推广对象不是 MAS 论文流程、RCA visual workflow 或 OMA builder internals，而是这套 family 通用执行内核：

```text
Stage Folder
  + stage_manifest
  + role artifacts
  + owner receipt / typed blocker
  + minimal StageRun state
```

默认进度事实固定为：

```text
Stage 目录承载证据
manifest 定义角色和 required artifacts
role artifacts 承载 stage output slots
receipt / blocker 决定推进
StageRun 只表达最小 runtime 状态
```

StageRun 是最小状态壳，不是第二 controller。OPL 可以回答 StageRun 是否 running、blocked、terminalizing、accepted、superseded，以及当前 owner 欠什么 accepted answer shape；OPL 不能回答论文是否 publication ready、grant 是否 fundable、visual artifact 是否合格、agent patch 是否应进入目标 repo。

2026-06-09 以后，Stage Artifact Unit 还必须按 ordinary progress spine / audit sidecar 分层读取。Stage folder 仍是核心事实面，但不是每个普通 step 都要以 full delivery artifact closeout 运行。

| 层级 | Stage Native 读法 | 默认权限 |
| --- | --- | --- |
| `T0_progress_delta` | 普通 step 写 `ProgressDeltaReceipt`，记录 changed surfaces、produced refs、consumed refs、next owner 和 next required delta。 | 可驱动下一 ordinary owner delta；不能关闭 Stage。 |
| `T1_stage_transition` | stage 已运行并留下 artifact、草稿、阴性结果、failure/no-output diagnostic 或 owner answer ref。 | 可推进任意 declared stage；缺格式或 receipt 记质量债。 |
| `T2_delivery_artifact` | publication / export / submission / release package 带 domain/App authority receipt、independent review 或 human gate。 | 可进入交付 gate；不能声明 production maturity。 |
| `T3_production_evidence` | restore proof、long-soak、cleanup、release cohort、L5 evidence、no-regression refs。 | 只进入 explicit evidence lane；不抢占 ordinary current owner delta。 |

因此，StageRun Kernel 需要支持轻量 progress delta 与重型 transition / delivery proof 共存：ordinary path 先要求可接力 delta，transition path 再要求 manifest / receipt / blocker，audit sidecar 持续收集 lineage / replay / restore / long-soak refs。不能把 sidecar 完整性倒灌成普通 launch hard gate。

## Owner Split

| 层 | OPL 基座负责 | Domain agent 负责 |
| --- | --- | --- |
| `StageRun Kernel` | `StageRun.spec/status`、generation、attempt、lease、retry/dead-letter、event log、read-model rebuild。 | stage semantics、entry requirements、quality gate、domain route semantics。 |
| `Stage Folder` | folder contract、manifest schema、hash/index/rebuild、current pointer、conformance validator。 | required role artifacts、domain artifact authority、receipt/blocker schema 和签发。 |
| `Runtime` | Temporal-backed attempt lifecycle、worker/provider liveness、terminal closeout ingest、projection。 | domain handler / authority function 只返回 owner receipt、typed blocker、human gate 或 safe action refs。 |
| `App/workbench` | StageRun current owner delta、stage status、missing roles、receipt/blocker drilldown。 | 人能理解的 `stage_work_done`、`changed_stage_surfaces`、domain next owner 和 owner answer。 |
| `Quality` | 结构合法性、refs 覆盖、manifest/hash/current pointer 和 receipt/blocker 是否存在。 | 医学、基金、视觉、agent-building 质量判断和 artifact/export verdict。 |

## Anti-Bloat Rules

StageRun Kernel 的目标是让默认路径更短，而不是增加 admission、readiness、evidence-worklist、replay 或 tail accounting。

| 检查项 | 必须满足 | 不允许 |
| --- | --- | --- |
| `launch_hard_gate` | 只阻断 identity、owner、scope、selected executor、authority boundary、required role artifacts、receipt/blocker shape、forbidden write 和 replay/audit 基础证据。 | 把 prompt、tool、knowledge、rubric completeness 一律变成启动 hard gate。 |
| `wrong_target_currentness` | 仅在即将写入错误 checkout / target identity 时硬停当前 mutation。 | 用 currentness、lease、receipt 或格式检查选择/拒绝 semantic route。 |
| `quality_evidence` | receipt、review、manifest、hash 与 lineage 只决定 quality/export/publication/ready 声明。 | 缺任一质量证据时阻止下一 stage 启动。 |
| `strategy_refs` | prompt/tool/knowledge/evaluation refs 可作为 context、warning、route-back 或 reviewer 输入。 | 用 strategy refs completeness 代替 domain quality gate 或阻塞普通 launch。 |
| `default_read_surface` | 默认只从 StageRun current owner delta 回答当前 Stage、缺什么 role/receipt/blocker、下一 owner。 | 默认首屏展示 raw worklist、replay packet、provider trace、typed blocker group、evidence ledger browser 或 route variant menu。 |
| `progress_truth` | progress 从 Stage Folder、manifest、role artifact、owner receipt / typed blocker 和 current pointer 派生。 | 从 SQLite row、Temporal completion、stage_progress_log、readiness clean、verified ledger 或 file presence 推导完成。 |
| `quality_gate` | gate receipt 是 Stage closeout 或下一 Stage 的明确 role artifact / receipt。 | gate evidence 漂在额外 worklist tail，导致 Stage 已有目录但无法定位推进口径。 |
| `route_boundary` | route hydrate 成 StageRun request、stage-attempt projection、human gate、typed blocker 或 owner projection。 | route 直接执行、生成候选、评审排序、签 receipt、创建 typed blocker 或写 domain truth。 |
| `agent_generalization` | MAS/MAG/RCA/OMA 共享 Stage Native Kernel，各自只声明 domain roles 和 owner authority。 | 把 MAS paper taxonomy、RCA visual taxonomy 或 OMA builder internals 写成 family lifecycle。 |

## Admission Policy

`Stage admission` 必须拆成两次判断：

```text
launch admission
  -> 只判断这个 StageRun 是否可以安全启动
closeout admission
  -> 只判断这个 Stage 是否可以被 receipt/blocker 关闭
```

Stage 启动不经过 execution authorization。provider attempt identity、lease、scope、source fingerprint、idempotency 与 stage packet 只用于 transport/currentness/observability；缺失时记录质量债或禁用 stale reuse。只有 wrong-target mutation、forbidden write、权限/安全、不可逆动作或显式 human decision 才硬停当前动作。

`closeout receipt binding` 在 closeout admission 中单独检查。owner receipt / typed blocker 即使存在，也必须绑定当前 StageRun、stage manifest、current pointer、source fingerprint 和 idempotency；绑定缺失时继续阻断 closeout。

`launch admission` 的 hard blocker 只允许来自这些事实：

- `stage_run_id`、`domain_id`、`stage_id`、`generation`、`current_pointer` 不合法或不一致。
- `stage_manifest` 缺失、无法解析、schema 版本不支持，或 hash / lineage / input ref 基础字段损坏。
- `owner`、`selected_executor`、`authority_boundary` 缺失，或请求会越过 domain / OPL authority 边界。
- required role artifact slot 没有声明，导致执行者不知道本 Stage 要产出哪些角色。
- expected receipt / typed blocker shape 没有声明，导致执行后无法形成可验证 closeout。
- input ref 指向不可读、不可 hash、明显过期 generation，或需要 forbidden write 才能继续。
- replay/audit 所需最低 lineage 不足，导致启动后无法恢复、重放或审计。

`launch admission` 不得因为 prompt refs、skill refs、tool refs、knowledge refs、rubric refs、evaluation refs、optional context、reviewer notes、historical examples、strategy variants 或 route hint 不完整而直接阻断。这些问题默认进入 `advisory_warnings[]` 或 `route_back_recommendations[]`。只有当缺失项会造成越权、不可执行、不可恢复、不可审计或无法 closeout 时，才允许升级为 `launch_blockers[]`。

`closeout admission` 的 hard blocker 只允许来自这些事实：

- required role artifact 没有产出、不是 current generation、hash 不匹配，或 manifest 没有登记。
- owner receipt / typed blocker 缺失、schema 不合法、authority owner 不匹配，或没有消费对应 role artifacts。
- receipt / blocker 的 `next_stage_or_owner`、`next_safe_action`、`required_owner` 与 current pointer 不一致。
- independent quality gate 要求 domain owner 签发 receipt，但 receipt 缺失或 authority 不匹配。
- Stage 已经被 newer generation supersede，旧 closeout 仍试图写成 active truth。

`closeout admission` 不得用 provider attempt completed、State Index、SQLite、Temporal history、read-model、`stage_progress_log`、readiness、verified ledger、App projection、文件存在、latest.json refreshed、evidence worklist 清零或 conformance passed 关闭 Stage。

## 标准对象模型

### StageRun

```text
StageRun
  stage_run_id
  domain_id
  stage_id
  generation
  spec
    input_refs
    required_role_artifacts
    selected_executor
    authority_boundary
    expected_receipt_or_blocker
  status
    declared | inputs_ready | admitted | running | terminalizing | accepted | blocked | deferred | superseded | crashed
  observed_generation
  current_attempt_ref
  current_owner_delta_ref
  event_log_refs
```

规则：

- 一个 Stage 只能有一个 active generation。
- old generation 的 request、attempt、redrive 只能进入 superseded / historical。
- retry budget 绑定 `{stage_run_id, generation, input_fingerprint, failure_signature}`。
- `StageRun.status` 由 OPL 写；domain owner 只签 receipt/blocker。

### stage_manifest

```text
stage_manifest
  manifest_version
  domain_id
  stage_id
  stage_run_id
  generation
  required_roles[]
  produced_roles[]
  input_refs[]
  output_artifact_refs[]
  receipt_refs[]
  typed_blocker_refs[]
  content_hashes
  current_pointer
  lineage_refs
  authority_boundary
```

规则：

- role artifact 是产出角色，不是文件名。
- 文件存在只证明 evidence 存在。
- role 是否 current、是否满足 gate、是否被 receipt/blocker 消费，由 manifest 和 receipt/blocker 判定。

### Role Artifact

Role artifact 是每个 Stage 的 typed output slot。

| Agent | role artifact 示例 |
| --- | --- |
| MAS | `source_truth_pack`、`analysis_result`、`ai_reviewer_record`、`revision_action_matrix`、`publication_handoff_packet` |
| MAG | `call_intake_pack`、`specific_aims_draft`、`proposal_package`、`fundability_review`、`submission_handoff` |
| RCA | `source_truth_pack`、`visual_direction`、`render_manifest`、`review_verdict`、`export_bundle`、`handoff_manifest` |
| OMA | `target_agent_intake`、`stage_decomposition_pack`、`baseline_result`、`mechanism_patch_proposal`、`owner_closeout_packet` |

### OwnerReceipt / TypedBlocker

```text
OwnerReceipt
  receipt_id
  domain_id
  stage_id
  stage_run_id
  consumed_role_artifacts
  accepted_delta
  next_stage_or_owner
  authority_owner

TypedBlocker
  blocker_id
  domain_id
  stage_id
  stage_run_id
  blocked_surface
  missing_or_failed_input
  required_owner
  next_safe_action
  stability_or_retry_policy
```

规则：

- provider completion 不能代替 owner receipt。
- verified refs-only ledger 不能代替 owner receipt。
- typed blocker 是明确 owner answer，不是完成。

## Conformance Shape

conformance 输出必须分层：

```text
status
  launch_blockers[]
  closeout_blockers[]
  advisory_warnings[]
  route_back_recommendations[]
  audit_drilldown_refs[]
  forbidden_authority_flags[]
```

`opl agents conformance --family-defaults --json` 同时输出 `family_live_conformance_probe`：该 probe 对每个 domain 读取 generated interfaces、`contracts/action_catalog.json`、`agent/stages/manifest.json` 编译出的 `family_stage_control_plane` 和 `contracts/opl-framework/standard-agent-admission-gates.json`，把 standard admission gate 的通过/阻塞、blockers 与 false-authority boundary 投影到同一机器面。它不读取 tracked legacy stage-plane fallback。这个 probe 只证明 live gate readout 可执行，不声明 domain ready、production ready、owner receipt、typed blocker、artifact ready 或 quality verdict。

只有 `launch_blockers` 和 `closeout_blockers` 可以进入默认阻断；`advisory_warnings`、`route_back_recommendations` 和 `audit_drilldown_refs` 不得抢占 default next action。

反退化 fixtures 至少覆盖：

| Fixture | 预期 |
| --- | --- |
| 缺少 prompt / skill / knowledge refs，但 owner、executor、artifact slots、receipt/blocker shape 完整。 | `launch_blockers=[]`，输出 advisory / route-back，不阻断 launch。 |
| 缺少 selected executor、authority boundary 或 receipt/blocker shape。 | 进入 `launch_blockers[]`。 |
| provider completed 且 read-model refreshed，但没有 owner receipt / typed blocker。 | 进入 `closeout_blockers[]`，不得 stage complete。 |
| provider attempt、lease 或 receipt 缺失。 | 记录 transport/currentness diagnostic；不阻止 Codex 从当前 workspace 启动下一 declared stage。 |
| closeout 无可读输出。 | 生成 no-output/failure diagnostic 和质量债；下一 stage 可消费原输入、诊断与 lineage 继续。 |
| gate evidence 存在但没有挂到当前 Stage closeout 或下一 Stage role。 | 进入 `closeout_blockers[]` 或 route-back，不能成为 floating worklist tail。 |
| route 试图直接写 domain truth、签 receipt、创建 blocker 或执行候选排序。 | 进入 `forbidden_authority_flags[]`。 |
| App/default CLI 从 raw worklist、readiness 或 replay packet 得出 next action。 | conformance 失败；默认面必须来自 StageRun current owner delta。 |

## Forbidden Claims

- Stage folder 有文件不等于 stage complete。
- Provider completed 不等于 owner receipt。
- `latest.json` refreshed 不等于 domain accepted。
- Read-model rebuilt 不等于 progress。
- Verified refs-only ledger 不等于 owner answer。
- Conformance passed 不等于 domain ready。
- RCA reference 不等于 MAS/MAG/OMA 自动 ready。
- StageRun status 不能替代医学、基金、视觉或 agent-building 质量判断。
