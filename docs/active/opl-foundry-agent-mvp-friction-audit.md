# OPL Foundry Agent MVP Friction Audit

Owner: `One Person Lab`
Purpose: `mvp_friction_audit`
State: `active_support`
Machine boundary: 本文是人读设计审计。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker 和真实 workspace / App evidence。
Date: `2026-06-04`

## 审计问题

本轮只回答一个问题：从 MVP 原则看，OPL 各 Foundry Agent 的哪些设计面正在帮助智能体最高效地产出，哪些设计面可能把时间耗在 receipt、read-model、replay、diagnostic 或 cleanup 上，反而阻碍 MAS/MAG/RCA/OMA 的核心交付推进。

若要按“不受当前实现分布约束”的理想情况全面重构 OPL / Foundry Agent，目标操作架构回到 [OPL Foundry Agent Target Operating Architecture](./opl-foundry-agent-target-operating-architecture.md)。本文保留 friction 诊断、fresh evidence 和阻力分类；目标文档承接 greenfield primitives、runtime flow、contract changes、migration phases 和 acceptance tests。

这里的 MVP 不是功能少，而是默认推进路径短：

```text
目标 / 材料 / stage pack
  -> selected executor attempt
  -> domain deliverable delta
  -> independent gate / owner receipt / typed blocker
  -> 下一 owner
```

任何默认面只要不能让上面这条链更快、更安全或更可恢复，就不应进入普通推进路径；它最多作为 full-detail audit、diagnostic lens、cleanup lane 或 terminal evidence gate。

## Fresh Evidence

本轮读取了项目偏好、核心 docs、跨仓 domain 状态和 live OPL read-model。`tool_affordance_boundary` / `tools` / `tool_refs` 相关设计曾在本地草案中把既有 family repo 推成 4/4 conformance blocked；当前实现已把这类缺口改为 existing repo adoption warning，只在显式 `standard-stage-pack.v2` pack 中作为硬门。下面按当前本地真相读取，并保留该回归风险作为 MVP friction 教训。

### 2026-06-04 current local checkout

| Surface | Fresh readout | MVP 读法 |
| --- | --- | --- |
| `git status --short --branch` | 当前在 `main...origin/main`，但有未提交 contracts/source/tests/docs 改动，集中在 `tool_affordance_boundary`、`tools`、`tool_refs`、stage admission/control-plane schema、scaffold validation 和 generated interface projection。 | 下列 conformance/readiness 结果是当前本地实现的实际效果，不能误写成 domain ready 或 production ready。 |
| `opl agents descriptors --json` | 4 个 descriptor 全部 resolved；`blocked_count=0`；`functional_privatization_active_private_generic_residue_count=0`；`functional_privatization_private_platform_residue_inventory_count=38` 但 audit-only；`production_closure_gap_count=20`。 | descriptor / source-purity 层仍然健康；private residue 不是默认推进任务，只能是清理 lane / audit tail。 |
| `opl agents conformance --family-defaults --json` | `total_repo_count=4`、`passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`。MAS/MAG/RCA/OMA 的 `stage_pack_v2_validation.status` 仍为 `advisory_missing`，因为它们尚未显式采用 standard-stage-pack.v2 的 tools / tool_refs / tool boundary 全量声明。 | 目标状态正确：既有 agent 不因 metadata adoption 缺口被阻断；新 v2 skeleton 和显式 v2 pack 仍被硬性要求声明 tool affordance boundary。 |
| `opl stages readiness --family-defaults --json` | 4 个 domain、19 个 stage 全部 admitted；`blocked_stage_count=0`、`hard_blocker_count=0`、`warning_count=53`。MAG 6/6、MAS 6/6、RCA 6/6、OMA 1/1 admitted。 | stage admission 与 structural conformance 当前保持一致：都不因未完成工具目录 adoption 阻断既有 ordinary route。默认推进应尊重 stage readiness / current owner delta，而不是被工具目录完整性先行阻断。 |
| domain stage drilldown | MAS 35 warning，主要 runtime-budget / replay；MAG 7 warning；RCA 4 replay warning；OMA 7 cohort/runtime/replay warning。 | warning 是 evidence / reliability tail，不是 stage launch hard blocker。 |
| `opl framework readiness --family-defaults --json` | 默认已产出 `compact_owner.surface_kind=opl_current_owner_delta`；current owner 是 `medautoscience`；desired delta 是 `domain_owner_receipt_quality_gate_or_typed_blocker_required`；audit warning 显示 `domain_dispatch_workorders_are_audit_tail=68`、`stage_replay_missing_receipts_are_audit_tail=14`；`audit_tail_can_drive_default_planning=false`。 | `current_owner_delta` 已经开始成为正确默认根；audit tail 被标为 passive，这是上一轮目标态中最关键的正向落地。 |
| `opl family-runtime evidence-worklist --family-defaults --detail full --json` | `open_worklist_item_count=71`；`open_safe_action_payload_required_item_count=68`；`domain_dispatch_evidence_workorder_count=68` 且只集中在 1 个 domain；`stage_replay_missing_receipt_workorder_count=14`、其中 human gate 9；`zero_open_worklist_is_completion_claim=false`。`progress_first_operator_summary.deliverable_progress_delta=null`，`platform_repair_delta=opl_operator_or_provider_supervision_delta_available`。 | MAS evidence / owner-payload tail 仍是内容推进外的主要噪音；但它已被 progress-first / current-owner-delta 语义压到 audit / owner answer 面，不能再作为“paper 进度”。 |
| `opl agents default-callers --family-defaults --json` | 32 个 generated default caller surface ready，0 blocked，删除证据缺口为 0；整体仍是 `ready_domain_evidence_required`。 | generated/default caller 结构已够用；不要把更多 deletion evidence 变成 agent 进度。 |

### 2026-06-03 pushed-main baseline

| Surface | Fresh readout | MVP 读法 |
| --- | --- | --- |
| `opl agents descriptors --json` | 4 个 descriptor 全部 resolved；`blocked_count=0`；`active_private_generic_residue_count=0`；`private_platform_residue_inventory_count=38` 但 audit-only；`production_closure_gap_count=20`。 | 结构层不是当前卡点。private residue 不是默认推进任务，只能是清理 lane / audit tail。 |
| `opl agents conformance --family-defaults --json` | `passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`。 | conformance 已足够支撑启动，不应继续扩写成更多结构 gate。 |
| `opl stages readiness --family-defaults --json` | 4 个 domain、19 个 stage 全部 admitted；`blocked_stage_count=0`、`hard_blocker_count=0`、`warning_count=53`。 | stage admission 可用；warning 不应阻断普通 stage 启动。 |
| domain stage drilldown | MAS 35 warning，主要 runtime-budget / replay；MAG 7 warning；RCA 4 replay warning；OMA 7 cohort/runtime/replay warning。 | warning 是 evidence / reliability tail，不是 stage launch hard blocker。 |
| `opl framework readiness --family-defaults --json` | framework hard blocker 全为 0；owner delta 是 `needs_domain_or_app_live_owner_payload`，next owner `medautoscience`；`evidence_envelope_open_count=68`、`blocked_count=2027`；`operator_actionable_attention_tail_count=69`，其中 `operator_payload_required_attention_tail_count=68`；`domain_blocked_attention_tail_count=2038`。 | 默认 attention 已被 refs-only / owner-payload 尾项占据；这会压过“下一份交付物 delta”。 |
| `opl family-runtime evidence-worklist --detail full --json` | `open_worklist_item_count=71`；`domain_dispatch_evidence_workorder_count=68`，全部在 MAS；`progress_first_operator_summary.deliverable_progress_delta=null`，`platform_repair_delta=opl_operator_or_provider_supervision_delta_available`；`progress_first_supervision_diagnostic_count=4` 且不算 open item。 | 当前主要推进面是 platform / evidence supervision，不是 domain deliverable progress。 |
| `opl agents default-callers --family-defaults --json` | 32 个 generated default caller surface ready，0 blocked，删除证据缺口为 0；整体仍是 `ready_domain_evidence_required`。 | generated/default caller 结构已够用；不要把更多 default-caller deletion evidence 变成 agent 进度。 |

## MVP Keep

这些设计面直接服务高产出，应保留在默认路径：

| 设计面 | 保留理由 |
| --- | --- |
| Stage-led domain pack | stage 是可恢复、可审计、可接力的真实工作包；当前 19 个 stage 都 admitted，符合 MVP。 |
| `Codex CLI` first-class executor | 让模型能力、prompt、skill、knowledge 直接转化为产出；避免 domain repo 自建 runner。 |
| Temporal / provider liveness gate | worker/service/liveness 是能否执行的硬前提；只要阻断 executor attempt，就应优先显示。 |
| `Progress-First` closeout fields | `deliverable_progress_delta`、`platform_repair_delta`、`next_forced_delta` 能防止把平台修复误报成内容进展。 |
| owner receipt / typed blocker | 成功或阻塞都要有 domain-owned answer；这是防止假完成的最低边界。 |
| independent quality / owner review stage | MAS reviewer、MAG fundability、RCA visual review、OMA target-owner review 是领域质量核心，不能降成 helper 后处理。 |
| authority boundary / no-forbidden-write | 防止 OPL/App/ledger 写入 domain truth、artifact body、memory body 或质量 verdict，是安全硬边界。 |
| tool affordance boundary as advisory authority catalog | 工具能力、权限、credential、write scope 和 forbidden authority 的边界声明有价值；它应帮助 executor 安全选择工具，而不是替 executor 规定认知流程或在迁移期阻断 stage launch。 |

## High-Friction Surfaces

### P0 Closed Guard: Tool affordance boundary as family-wide hard gate

本轮曾复现一个明确 P0 风险：工具 affordance 设计如果被提前提升成 family-wide structural conformance 硬门，会让 MAS/MAG/RCA/OMA 因缺 `agent_pack.tools`、stage `tool_refs` 或 design profile `tools` section 变成 4/4 blocked；与此同时 `opl stages readiness --family-defaults --json` 仍显示 19/19 stage admitted、0 hard blocker。当前实现已关闭该风险：existing family repos 的缺口只进入 advisory adoption signal，显式 `standard-stage-pack.v2` pack 才 hard-block 缺 `tool_refs` / `tool_affordance_boundary`。

MVP 风险：

- 工具目录完整性本身不产生 paper / grant / visual artifact / target-agent patch delta，却会先阻断所有 agent 的 structural conformance。
- conformance hard gate 与 stage readiness 分裂后，operator 会被迫先补 pack metadata，而不是启动当前 owner delta。
- `tool_refs` 如果被理解成 mandatory tool sequence，会把 executor 的开放式推理、工具选择、跳过工具和并行策略收窄成 workflow script。
- 这类全族同步字段在 MAS/MAG/RCA/OMA 尚未自然采用前硬推，会制造跨仓机械迁移和测试 churn，收益低于推进核心 deliverable。

处置规则：

- `tool_affordance_boundary` 保留为 control/audit metadata：声明 available affordance、权限、credential、write scope、side-effect risk 和 forbidden authority。
- 在 domain packs 完成显式 adoption 前，缺 `tools` / `tool_refs` 只能是 advisory warning 或 production-hardening backlog，不应作为 existing family repo 的 structural blocker。
- 只有缺失会导致 forbidden write、credential 越权、不可审计 side effect、provider 不可达或不可恢复启动时，才升级为 launch-hard blocker。
- promotion 条件必须是 explicit stage-pack version adoption、真实 consumer 已使用、四个 domain pack 均有 generated/adopted refs、并且默认 golden path 不被 metadata 补齐工作抢占。
- 工具目录不能定义 cognitive strategy、stage goal、mandatory order 或 domain verdict；executor 仍可在边界内选择、跳过、替换工具和决定并行顺序。

### P0: MAS domain-dispatch / owner-payload tail

MAS 仍是内容推进层最大的历史阻力。

Fresh readout 显示 `domain_dispatch_evidence_workorder_count=68`，且全部要求 domain/App live payload；framework owner delta 也指向 `medautoscience`。这类 item 的 accepted path 是 owner receipt / owner-chain / no-regression refs，或 MAS-owned typed blocker refs。OPL 自己不能生成这些 refs，也不能写 MAS truth。

MVP 风险：

- operator 默认读面会反复显示大量可记录 payload route，但这些 route 本身不产生 paper delta。
- stale owner route、重复 default-executor closeout、receipt-only closeout 和 read-model reconcile 容易把时间消耗在 accounting 上。
- 同一 study / source lineage 已有 typed blocker 或 terminal closeout 时，继续暴露 per-attempt record route 会造成“看起来还有很多工作”，实际没有新的 domain owner delta。

处置规则：

- 默认面只保留每个 study / owner-action lineage 的最新 current owner delta。
- historical / superseded / already typed-blocked dispatch route 只进 full-detail audit。
- 同一 lineage 连续出现 receipt-only / platform-repair closeout 时，必须收敛为 `domain_owner_typed_blocker_required` 或 `fresh_domain_owner_delta_required`，不继续启动或记录同源 attempt。
- open worklist 数不能作为 MAS 进度；MAS 进度只算 paper / evidence / reviewer / human gate / owner receipt / stable typed blocker 的新 delta。

### P0: Raw evidence envelope and attention tail

`framework readiness` 同时暴露 68 open evidence envelopes、2027 blocked envelopes、2038 domain-blocked attention、546 typed blocker refs。作为 full audit 这是有价值的；作为默认推进入口会制造噪音。

MVP 风险：

- operator 会先处理 raw count，而不是判断“谁欠什么 deliverable delta”。
- blocked refs-only attention 容易被误读成待执行任务。
- typed blocker group 增长会被误读成进展或完成。

处置规则：

- App/CLI 默认只展示 compact owner-delta：current owner、required delta、accepted return shape、是否有 provider/human hard gate。
- raw evidence envelope、typed blocker groups、receipt counters 只允许 `--detail full`。
- `open_worklist=0`、blocked refs 清零、receipt verified 增长都不能作为 completion claim。

### P0: Stage replay / human-gate workorder defaultization

当前 family readiness 有 14 个 stage replay missing receipt workorder，其中 9 个是 human gate refs。RCA、MAG、OMA 的 replay warning 大多属于 human/operator approval 或 baseline owner review。

MVP 风险：

- replay certification 是审计能力，不是每轮 agent execution 的必经前置。
- 如果 human gate 缺口默认抢占下一步，会让已可执行的 domain work 停在“补历史 replay receipt”。

处置规则：

- replay missing receipt 只在它阻断当前 stage launch、handoff 或 owner gate 时进入默认面。
- human-gate replay 缺口可用 domain-owned typed blocker 作为稳定 answer；不要要求 OPL 反复 requery human。
- replay packet 保留为 release / production / audit lane，不作为普通 MVP stage 推进门。

### P0: Runtime-budget / cohort / assumption warnings as launch blockers

MAS、MAG、OMA 当前有 runtime budget / cohort warning；family summary 仍是 19/19 admitted、0 hard blocker。

MVP 风险：

- 这些 warning 服务长期 reliability，不应在非终局 stage 阻止 executor 尝试。
- 如果每个 stage 都先补 success-rate ref、monitor coverage 或 cohort metrics，系统会偏离“先产出可审阅结果”。

处置规则：

- warning 默认只进 planning / production-hardening backlog。
- 只有缺失会导致错误启动、越权、不可审计、不可恢复或 provider 不可达时，才升级为 hard blocker。
- 非终局 stage 的验收先看 deliverable delta / owner answer；终局 readiness 再看 long-run reliability refs。

## P1 Friction

| Surface | 风险 | 处置 |
| --- | --- | --- |
| private platform residue inventory | 38 个 audit-only residue 若反复出现在默认面，会变成 cleanup busywork。 | 保持 audit-only；只在专门 cleanup lane 处理，必须满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 provenance。 |
| generated/default caller deletion evidence | 32 个 surface 已 ready 且 0 missing；继续围绕 deletion evidence 扩写收益低。 | 不再作为 agent progress；只做 no-resurrection guard 和 release/cleanup evidence。 |
| MAG product-entry / domain-handler / Hermes helper | 当前有 active tests 和 receipt caller；删除会破坏 direct/proof path。 | 保留为 refs-only / explicit non-default executor proof lane；普通 runtime 不走 Hermes；删除等 OPL executor adapter parity。 |
| RCA route multiplicity / identity aliases | image-first、HTML、native PPTX 和多 identity 同时默认化会增加选择成本。 | image-first 作为默认；HTML/native PPTX 显式选择；alias 只做 identity map，不做 authority source。 |
| OMA scripts / materializers | 容易膨胀成第二 Agent Lab、runner、promotion gate 或 worktree lifecycle owner。 | 脚本只做 work-order / candidate / typed-blocker materializer 或薄 delegation；执行、absorb、cleanup、reviewer pool 归 OPL / target owner。 |
| production long-soak evidence | 对最终 production 必需，但会拖慢普通 stage。 | 只在 production gate / release gate / long-run soak lane 阻断；非终局 stage 可用 typed blocker 或 follow-through refs。 |

## Per-Agent MVP Diagnosis

| Agent | MVP core | 当前高阻力点 | 判断 |
| --- | --- | --- | --- |
| MAS | study truth、paper/evidence delta、AI reviewer / auditor、publication route、artifact/memory authority、owner receipt / typed blocker。 | 当前本地 conformance 因缺 `tools` / stage `tool_refs` 被 blocked；另有 68 个 MAS domain-dispatch payload workorder、大量 historical typed blocker / receipt refs、owner-route currentness 和 read-model reconcile 循环风险。 | P0。先把工具 affordance 硬门降为 advisory/adoption gate；MAS 默认面继续收窄到“当前 study 的下一 paper delta 或 MAS-owned typed blocker”，把 historical dispatch accounting 移出默认面。 |
| MAG | grant proposal delta、fundability / quality / export / submission verdict、human gate、owner receipt / typed blocker。 | 当前本地 conformance 因缺 `tools` / stage `tool_refs` 被 blocked；domain-specific tail 是 `submission_ready_export_gate`、product-entry / domain-handler shell、explicit Hermes receipt lane、runtime-budget warning。 | family-wide P0 + domain P1。默认 authoring 不应被工具目录补齐、pre-workspace、shell 或 proof lane 阻断；human gate 可以稳定 typed blocker。 |
| RCA | visual artifact delta、review/export verdict、artifact authority、visual memory、owner receipt / typed blocker。 | 当前本地 conformance 因缺 `tools` / stage `tool_refs` 被 blocked；domain-specific tail 是 human review replay refs、route multiplicity、long-soak / no-regression evidence tail、identity alias hygiene。 | family-wide P0 + domain P1。默认应直接产出 visual artifacts；review/export gate 保留，long-soak 和 route variants 不进普通首屏。 |
| OMA | target-agent semantics、developer work order、candidate / mechanism proposal、target-owner typed blocker。 | 当前本地 conformance 因缺 `tools` / stage `tool_refs` 被 blocked，且 OMA stage 数更多所以 blocker=13；domain-specific tail 是 scripts/materializer hygiene、cohort/runtime warning、baseline owner review replay ref。 | family-wide P0 + domain P1。不要补成第二 framework；真实价值来自 target patch-loop、independent reviewer evidence 和 target owner closeout。 |

## Root Cause

当前架构目标方向是对的：OPL 负责 runtime / queue / projection / recovery，domain agent 负责 truth / deliverable / quality / owner receipt。当前能观察到两类卡顿机制。

第一类来自默认读面和运行循环里混入过多“防假完成”的证据面。它们本意是保证 authority boundary，但在没有新 domain owner delta 时，会退化成：

```text
record receipt refs
  -> reconcile read-model
  -> expose more workorders
  -> record typed blocker refs
  -> repeat
```

这个循环对审计有价值，对 MVP 产出不够有价值。MVP 设计应该让系统尽快到达三种终态之一：

1. executor 产生新的 domain deliverable delta；
2. independent gate / domain owner 签发 receipt；
3. domain owner 返回 stable typed blocker，并明确下一 owner 或 stop-loss。

第二类来自把新 metadata completeness 一次性提升成 family-wide hard gate。当前 `tool_affordance_boundary` 的意图是好的：把工具 capability、permission、credential、write scope 和 forbidden authority 说清楚。但如果 adoption 前就要求所有 agent pack 和每个 stage 都有 `tools` / `tool_refs`，它会退化成：

```text
add cross-family metadata requirement
  -> all existing packs incomplete
  -> structural conformance blocked
  -> cross-repo metadata backfill
  -> no domain deliverable delta
```

这类循环对长期 contract hygiene 有价值，对 MVP 产出不够有价值。除此之外的 ledger、replay、diagnostic、cleanup、long-soak、conformance completeness 和工具目录 completeness 都应默认后置；只有安全、权限、provider liveness、不可恢复或不可审计风险才可以进入 launch hard gate。

## External Practice Calibration

本轮按当前日期做了外部工程经验 refresh。可吸收的是工程原则，不是外部 runtime 或外部术语本身：

| 成熟经验 | 对 OPL 的约束 |
| --- | --- |
| [Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) 强调简单、可组合的 agent / workflow patterns，复杂 agent 只在简单模式不够时引入。 | Foundry Agent 默认路径必须短；不要把多 agent、replay、diagnostic、worklist 或 proof lane 先做成普通入口。 |
| [OpenAI A Practical Guide to Building Agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) 把模型、工具、指令、orchestration、guardrails、人类介入和评估拆成可组合层。 | OPL 应保留 stage executor 的开放式能力，把 guardrail 分级为 launch-hard、runtime-enforced、human/domain gate、audit-only；不要把所有 guardrail 都提升成 launch blocker。 |
| [Kubernetes controller pattern](https://kubernetes.io/docs/concepts/architecture/controller/) 用 desired state / current state reconciliation 推进系统。 | OPL control plane 应围绕 desired owner delta 与 actual attempt / receipt / blocker 对账；audit tail 不能反向生成新的 desired work。 |
| [Kubernetes object spec/status](https://kubernetes.io/docs/concepts/overview/working-with-objects/kubernetes-objects/) 区分用户声明的 desired state 与系统观测的 status。 | Foundry Agent 的 `stage pack / owner delta` 是 spec；attempt ledger、provider status、receipt refs、worklist counters 是 status。status 不得自称新的 domain goal。 |
| [Temporal docs](https://docs.temporal.io/) 把长跑任务的 crash-proof / resume 交给 durable execution substrate。 | OPL 基座要把 wakeup、retry、dead-letter、history、query、heartbeat 交给 Temporal-backed provider；domain repo 不再复制 scheduler / daemon / attempt loop。 |
| [Google SRE Eliminating Toil](https://sre.google/sre-book/eliminating-toil/) 把手工、重复、可自动化、战术性且缺少持久价值的工作识别为 toil。 | receipt record、read-model reconcile、stale route redrive、重复 typed-blocker accounting 若不产生 deliverable delta，就是平台 toil；默认面应 stop-loss 或下沉到 audit。 |
| [Team Topologies TVP examples](https://github.com/TeamTopologies/Thinnest-Viable-Platform-examples) 把平台控制在能加速团队交付的最小 API / docs / tools 集合。 | OPL Framework 的理想基座是 thinnest viable agent platform：stage runtime、receipt boundary、owner projection、artifact kernel、generated surface；其余默认诊断后置。 |
| [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) 与 [observability primer](https://opentelemetry.io/docs/concepts/observability-primer/) 区分 traces、metrics、logs，并强调从外部理解系统。 | OPL 默认状态应是 broad signal：owner、delta、hard gate、current attempt；full traces/logs/receipt groups 只用于 drilldown，不作为普通 action queue。 |

这些经验共同指向一个设计结论：理想 OPL 不应该更厚，而应该更窄、更强、更可恢复。厚度放在 full audit、production evidence 和 diagnostic；普通推进路径只保留能让 selected executor 产出下一份 domain delta 的最小平台。

## Ideal MVP Redesign

### Target loop

理想默认循环应收敛为：

```text
user goal / domain material / admitted stage pack
  -> compact current owner delta
  -> selected Codex executor attempt
  -> stage-native physical output + manifest
  -> independent gate / domain owner answer
  -> owner receipt or stable typed blocker
  -> compact projection / next owner delta
```

默认面只回答一句话：

```text
谁现在欠什么可验证 delta；OPL 能否安全启动；如果不能，硬阻塞 owner 是谁。
```

所有不能填入这句话的 surface，都不得出现在普通 App / CLI / operator 首屏。

### Three-plane architecture

| Plane | 默认职责 | 禁止职责 |
| --- | --- | --- |
| `Delivery Plane` | 当前 owner delta、stage attempt、domain deliverable delta、independent gate、owner receipt、typed blocker、handoff。 | 展示 raw envelope、历史 receipt group、full replay packet、private residue list。 |
| `Control Plane` | Temporal-backed provider、typed queue、attempt ledger、single-flight、retry/dead-letter、human gate transport、stage artifact kernel、currentness reconcile。 | 持有 domain truth、质量 verdict、artifact body、memory body、owner receipt signer。 |
| `Audit Plane` | raw evidence envelope、receipt ledger、stage replay、diagnostic traces、long-soak refs、cleanup provenance、full worklist。 | 自动抢占 next action；把 ledger 增长写成 progress；把 audit count 当成 completion。 |

MVP 优化的核心是把默认 action selector 固定在 `Delivery Plane`，只在以下情况穿透到 `Control Plane`：

- provider / worker liveness 阻断 executor attempt；
- queue / lease / dead-letter 阻断当前 owner delta 启动；
- human gate 是当前 stage 的真实 entry condition；
- no-forbidden-write / authority boundary 缺失会导致越权或不可恢复。

`Audit Plane` 不主动生成 work；它只解释为什么当前 owner delta 不能推进，或为 release / production / incident review 提供证据。

### Canonical MVP object: `current_owner_delta`

OPL 基座应把所有默认读面压到同一个 compact object，而不是让 App、CLI、worklist 和 readiness 各自解释：

```text
current_owner_delta
  identity: domain + study/task + stage + source/work-unit fingerprint + lineage
  desired_delta: deliverable delta / quality gate / human answer / owner receipt / typed blocker
  current_owner: provider / domain / human / app / framework
  accepted_answer_shape: receipt refs / typed blocker refs / artifact refs / human decision refs
  launch_gate: hard blocker / warning / audit-only
  live_attempt: none / queued / running / human_gate / dead_letter / terminal
  stop_loss: false / fresh_owner_delta_required / stable_typed_blocker_required
```

这应成为 App fast profile、`framework readiness` 默认 summary、`evidence-worklist.progress_first_operator_summary`、runtime tray 和 Agent Lab 的 shared source。raw counters 可以存在，但只能挂在 `audit_refs` 下。

### Reconciliation rule

OPL 的 reconcile loop 应只比较两件事：

```text
desired current_owner_delta
  vs
actual attempt / provider / receipt / human-gate / typed-blocker state
```

如果 actual 已经有 terminal owner receipt、terminal typed blocker、superseded source 或 accepted closeout，reconcile 的结果应是 compact / close / stop-loss，而不是再暴露一条 per-attempt record route。若 desired delta 本身不新鲜，OPL 只能要求 domain owner 刷新 route，不能用 audit tail 合成新 work。

### Surface budget gate

新增模块、命令、read-model、worklist item 或 App card 想进入默认面，必须同时满足三条：

1. 它能改变当前 owner delta 的可启动性或下一 owner。
2. 它能阻止错误启动、越权、不可恢复、不可审计或 provider 不可达。
3. 它能减少 operator 决策成本，而不是只增加解释细节。

不满足三条的设计面，默认分类为 `audit_only`、`diagnostic_only`、`production_hardening`、`cleanup_lane` 或 `reference`。

## OPL Base Optimizations

### 1. Owner-delta store before worklist store

OPL 当前已有 owner-delta-first 叙事；理想实现应把它变成更强的基座 primitive：先派生 `current_owner_delta`，再从它派生 worklist、attention、App state 和 CLI summary。worklist 不应直接从 raw receipt envelope 生成默认 action。

完成口径：

- 同一 `domain + stage + lineage + source fingerprint` 默认只暴露 1 条 current delta。
- historical / superseded / typed-blocked / terminal attempts 进入 lineage audit。
- worklist count 不能影响 next action 排序；next action 由 current owner delta 决定。

### 2. Stop-loss as a control-plane primitive

重复 receipt-only、platform-repair-only、read-model reconcile-only、stale route redrive-only 的 lineage 应自动进入 stop-loss。stop-loss 后默认只接受两种输入：

- fresh domain owner delta；
- domain-owned stable typed blocker。

这不是降级处理，而是防止平台 toil 消耗 executor 预算。对 MAS，这条规则应优先覆盖 `domain_owner/default-executor-dispatch`、paper autonomy stale route、AI reviewer currentness 和 stage evidence refs-only tail。

### 3. Stage-native artifact progress

默认进度应由 `physical outputs + manifest validity + receipt authority + current pointer` 推导。receipt ledger verified、stage replay observed、provider completed 或 open worklist closed，只能证明 audit/control 状态，不能替代 artifact / deliverable progress。

对四类 agent 的默认进度读法应固定为：

| Agent | 默认 progress unit |
| --- | --- |
| MAS | paper / evidence / reviewer / publication handoff delta + MAS owner receipt or typed blocker。 |
| MAG | grant proposal / fundability / export / submission gate delta + MAG owner receipt or typed blocker。 |
| RCA | visual artifact / review / export delta + RCA owner receipt or typed blocker。 |
| OMA | target-agent work order / candidate / mechanism proposal / target owner answer。 |

### 4. Golden path over route menu

每个 Foundry Agent 只能有一个 ordinary golden path。其他 route variant、proof lane、diagnostic lane、long-soak lane 和 cleanup lane 必须显式选择。

| Agent | Ordinary golden path | Explicit / non-default |
| --- | --- | --- |
| MAS | current study -> next paper/reviewer/human gate delta。 | historical dispatch refs、MDS / provenance、platform repair、full typed blocker groups。 |
| MAG | selected grant -> authoring / fundability / export gate delta。 | funding rediscovery、Hermes proof lane、grouped CLI internals、manifest consumer long-soak。 |
| RCA | source -> image-first visual artifact -> review/export gate。 | HTML/native PPTX variants、route aliases、visual long-soak, native helper diagnostics。 |
| OMA | target agent -> work order / candidate / typed blocker。 | script materializer internals、second-lab promotion, reviewer pool management。 |

### 5. Evidence as observability, not planning

OPL 应按 OpenTelemetry 的 broad/deep 读法维护证据：

- broad signal：owner、delta、stage、attempt state、hard blocker、next owner；
- trace signal：attempt lineage、provider events、receipt refs、human-gate refs；
- log signal：raw CLI/provider/domain outputs with bounded envelope；
- metric signal：SLO、cadence、queue length、retry/dead-letter、latency、lineage repeat count。

broad signal 进默认面；trace/log/metric 默认只进 drilldown。任何 trace/log/metric 想升级为默认 action，都必须先折叠成 owner delta 或 hard blocker。

### 6. Domain pack compiler absorbs wrappers

理想 OPL 基座要让 MAS/MAG/RCA/OMA 不再手写 generic product-entry、status、session、workbench、sidecar、default caller wrapper。Domain repo 只提供：

- `agent/` semantic pack；
- contracts / descriptors / stage definitions；
- minimal authority functions；
- direct domain skill path；
- owner receipt / typed blocker schema。

OPL 生成或托管 CLI/MCP/App/product-entry/status/workbench/default-caller shell。保留 private helper 必须证明它是 domain authority function、native helper、refs-only adapter、fixture 或 temporary bridge。

### 7. App as cockpit, not ledger browser

One Person Lab App 的 ordinary path 应只消费 compact owner delta。App 可以提供 full drilldown，但默认页不应显示 raw evidence counts、blocked envelope groups、replay packets、private residue inventory、provider internal ledger 或 route variant menu。用户看到的是：

- 当前任务在做什么；
- 卡在哪个 owner；
- 缺什么 answer；
- 有什么产物可看；
- 哪个动作需要用户介入。

这也意味着 App 不需要把 AionUI / AG-UI / backend / executor selector 暴露给普通用户。普通产品面固定 `Codex CLI + Foundry Agent purpose entries`。

### 8. Tool affordance catalog, not workflow script

OPL 基座应支持工具 affordance catalog，但它的默认语义是安全边界和可用能力目录，不是 workflow DSL。工具 catalog 可声明：

- capability refs；
- permission scope refs；
- credential boundary refs；
- write scope refs；
- side-effect risk refs；
- forbidden authority refs；
- executor autonomy rules。

它不能声明 stage goal、domain verdict、mandatory tool order、mandatory cognitive strategy 或 forbidden-write authorization。现有 agent pack 未采用该 catalog 时，默认 conformance 应显示 adoption warning；只有实际启动会触发越权、不可审计副作用、credential 泄漏、provider 不可达或不可恢复风险时，才升级为 hard blocker。

## Module Disposition Rules

从 MVP 原则判断一个模块是否应该保留在默认设计面，用下面的处置表：

| 问题 | 是 | 否 |
| --- | --- | --- |
| 失败会导致错误启动、越权、不可恢复、不可审计或 provider 不可达吗？ | `launch_hard_gate` / `control_plane`。 | 继续下一问。 |
| 它直接产生 domain deliverable delta、quality gate receipt、owner receipt、human decision 或 stable typed blocker 吗？ | `delivery_plane_default`。 | 继续下一问。 |
| 它只是解释历史、receipt、replay、SLO、long-soak、cleanup 或 residue 吗？ | `audit_or_production_lane`。 | 继续下一问。 |
| 它是 domain-specific authority function 或 native helper，且不能声明化 / 不能上收？ | `domain_authority_function`，必须有 no-forbidden-write 和 receipt boundary。 | 迁移到 OPL generated/hosted surface，或 tombstone/delete。 |
| 它只是新增 metadata completeness 要求，且当前缺失不会导致错误启动、越权、不可恢复、不可审计或 provider 不可达吗？ | `adoption_warning` / `production_hardening`，不得默认 hard-block existing agents。 | 继续下一问。 |
| 它让 operator 更快判断 current owner delta 吗？ | 可进入 compact default projection。 | `diagnostic_only` 或删除。 |

这个表比“当前有没有 active caller”优先。active caller 只决定迁移顺序，不决定长期设计正当性。

## Target Redesign / Recommended Changes

### P0 next design moves

1. `owner_delta_default_only`
   - 默认 App/CLI/operator summary 只显示 compact owner-delta，不显示 raw evidence envelope、full worklist、blocked refs-only groups 或 replay packet。
   - 验收：默认输出可一句话回答 current owner、required delta、accepted return shape、是否有 hard blocker。

2. `mas_dispatch_tail_compaction`
   - MAS domain-dispatch workorder 按 `study + action lineage + source fingerprint/current owner route` 分组，只暴露最新 current work unit。
   - historical verified receipt / typed blocker / superseded source 进入 full audit。
   - 验收：DM002/DM003 类问题默认不会再看到几十个 stale/superseded per-attempt record route。

3. `next_action_requires_deliverable_or_hard_gate`
   - 默认 next safe action 若不能产生 domain deliverable delta、provider liveness repair、human gate answer、owner receipt 或 typed blocker，就降为 diagnostic。
   - 验收：provider scheduler status、progress-first supervision、replay audit、private residue inventory 不进入 default next action。

4. `anti_spin_stop_loss_as_default`
   - 同一 lineage 连续 receipt-only / platform-repair / read-model reconcile closeout 到阈值后，默认只接受 fresh owner delta 或 domain-owned typed blocker。
   - 验收：重复 tick / redrive 不再启动同源无交付物 attempt。

5. `warning_to_backlog`
   - runtime-budget、cohort、assumption、replay warnings 默认进入 production-hardening backlog；只有安全、越权、不可恢复、不可审计和 provider liveness 才 hard-block launch。
   - 验收：stage launch readout 明确区分 `hard_blocker=0` 与 `warning_count>0`。

6. `owner_delta_store_before_worklist`
   - 先派生 current owner delta，再派生 worklist / App / runtime tray / Agent Lab read-model。
   - 验收：raw evidence envelope 不能直接生成默认 next action；默认 next action 必须可追溯到 current owner delta 或 provider/human hard gate。

7. `golden_path_single_default`
   - 每个 domain 只有一个 ordinary route；route variants、proof lane、long-soak、cleanup 和 diagnostics 必须显式选择。
   - 验收：App / CLI 默认不会同时展示 MAS historical dispatch、MAG Hermes proof、RCA HTML/native variants、OMA materializer internals作为可并列推进路径。

8. `audit_tail_cannot_plan`
   - audit / replay / receipt ledger 只能解释、验证、定位，不允许直接成为 planner input 或 work generator。
   - 验收：stage replay packet、typed blocker group、blocked envelope count、private residue inventory 不再自动进入 action selector。

9. `tool_affordance_adoption_not_hard_gate`
   - `tool_affordance_boundary` 作为 authority catalog 保留；existing family repos 缺 `tools` / `tool_refs` 时只产生 adoption warning。
   - 验收：`opl agents conformance --family-defaults --json` 不因尚未采用工具 catalog 而 4/4 blocked；若某 stage 真实存在 forbidden-write、credential、side-effect 或 provider-liveness 风险，则用具体 hard blocker 表达，而不是用 generic missing-tools blocker。

### P1 follow-through

- MAG：把 `submission_ready_export_gate` 作为 human/domain owner gate；不要让 grouped CLI、manifest、Hermes proof lane 或 product-entry shell 成为 authoring 默认 blocker。
- RCA：默认 image-first artifact route；HTML/native PPTX/long-soak/replay refs 是 explicit route 或 production lane。
- OMA：把 script-to-pack hygiene 继续做薄，但真实优先级放在 target patch-loop、independent reviewer evidence、target owner closeout。
- OPL：private residue inventory、default-caller deletion evidence 和 long evidence ledger 只保留 owner-bound cleanup / production lane，不作为 Foundry Agent progress。
- OPL：工具 affordance catalog 先做 explicit stage-pack adoption lane，不得用全族 metadata backfill 抢占 ordinary golden path。

### Implementation lanes

| Lane | 目标 | 主要 owner | 完成口径 |
| --- | --- | --- | --- |
| `default_owner_delta_lane` | 把 `current_owner_delta` 做成默认读面 primitive。 | OPL Framework + App | App fast state、framework readiness、evidence-worklist summary、runtime tray 使用同源 payload。 |
| `mas_tail_compaction_lane` | 收敛 MAS domain-dispatch / owner-payload tail。 | OPL + MAS | DM002/DM003 类 study 默认只暴露 current paper/reviewer/human gate delta 或 MAS typed blocker。 |
| `stop_loss_lane` | receipt-only / platform-repair-only / stale-route lineage 自动 stop-loss。 | OPL control plane | 重复 tick/redrive 不再启动同源无交付物 attempt，只要求 fresh owner delta 或 typed blocker。 |
| `generated_surface_lane` | domain generic wrappers 迁到 OPL generated/hosted surfaces。 | OPL + domain owner | active caller 迁移后，domain repo 只保留 domain pack、authority functions、native helper 和 refs-only adapters。 |
| `audit_plane_lane` | raw envelope、replay、long-soak、cleanup、diagnostic 统一后置。 | OPL | default help/docs/App 不把 audit lane 展示成普通推进路径；full detail 保留完整证据。 |
| `tool_affordance_adoption_lane` | 工具 affordance 从 advisory catalog 渐进推广到显式 stage-pack contract。 | OPL + domain owner | 缺 `tools` / `tool_refs` 不阻断 existing agents；只有具体安全/权限/provider 风险 hard-block；四个 domain pack adoption 后再提升 conformance 等级。 |

## Non-Goals

- 不删除任何当前有 active caller 的 domain helper、proof lane 或 shell。
- 不把 typed blocker、verified receipt、conformance pass、stage admitted、default caller ready 写成 domain ready 或 production ready。
- 不让 OPL/App 写 domain truth、artifact body、memory body、quality verdict、owner receipt 或 typed blocker。
- 不把 MVP 简化成没有质量门；独立 quality / owner review 仍是 domain deliverable 进入下一阶段的核心 gate。
- 不把 `tool_refs` 解释成 executor 必须执行的工具顺序、认知策略、stage goal 或 domain quality verdict。

## Next Read Commands

每次继续处理这类问题，先 fresh read：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl agents descriptors --json
rtk opl stages readiness --family-defaults --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
```

MAS 具体 study 卡顿再补：

```bash
rtk opl family-runtime queue list --domain medautoscience --study <study-id> --json
rtk opl family-runtime attempt list --domain medautoscience --study <study-id> --compact-timeline --json
```

## Verification For This Audit

本文是 docs-only design audit。最小验证：

- `rtk git diff --check`
- `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs/active/opl-foundry-agent-mvp-friction-audit.md docs/active/README.md`
- fresh CLI readouts listed above were run on `2026-06-03 CST`.
- external web refresh used Anthropic, OpenAI, Kubernetes, Temporal, Google SRE, Team Topologies TVP examples and OpenTelemetry docs on `2026-06-03 CST`.
- current local checkout refresh ran on `2026-06-04 CST` with `git status --short --branch`, `./bin/opl agents descriptors --json`, `./bin/opl agents conformance --family-defaults --json`, `./bin/opl stages readiness --family-defaults --json`, `./bin/opl framework readiness --family-defaults --json`, `./bin/opl family-runtime evidence-worklist --family-defaults --detail full --json`, and `./bin/opl agents default-callers --family-defaults --json`; after the tool affordance adoption guard was fixed, `./bin/opl agents conformance --family-defaults --json` was rerun and read `passed_count=4` / `blocked_count=0`.
