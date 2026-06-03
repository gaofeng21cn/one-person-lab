# OPL Foundry Agent MVP Friction Audit

Owner: `One Person Lab`
Purpose: `mvp_friction_audit`
State: `active_support`
Machine boundary: 本文是人读设计审计。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker 和真实 workspace / App evidence。
Date: `2026-06-04`

## 审计问题

本轮只回答一个问题：从 MVP 原则看，OPL 各 Foundry Agent 的哪些设计面正在帮助智能体最高效地产出，哪些设计面可能把时间耗在 receipt、read-model、replay、diagnostic 或 cleanup 上，反而阻碍 MAS/MAG/RCA/OMA 的核心交付推进。

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

本轮读取了项目偏好、核心 docs、跨仓 domain 状态和 live OPL read-model。关键机器证据：

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

## High-Friction Surfaces

### P0: MAS domain-dispatch / owner-payload tail

当前最大阻力在 MAS。

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
| MAS | study truth、paper/evidence delta、AI reviewer / auditor、publication route、artifact/memory authority、owner receipt / typed blocker。 | 68 个 MAS domain-dispatch payload workorder；大量 historical typed blocker / receipt refs；owner-route currentness 和 read-model reconcile 容易循环。 | P0。MAS 应优先收窄到“当前 study 的下一 paper delta 或 MAS-owned typed blocker”，把 historical dispatch accounting 移出默认面。 |
| MAG | grant proposal delta、fundability / quality / export / submission verdict、human gate、owner receipt / typed blocker。 | `submission_ready_export_gate`、product-entry / domain-handler shell、explicit Hermes receipt lane、runtime-budget warning。 | P1。默认 authoring 不应被 pre-workspace / shell / proof lane 阻断；human gate 可以稳定 typed blocker。 |
| RCA | visual artifact delta、review/export verdict、artifact authority、visual memory、owner receipt / typed blocker。 | human review replay refs、route multiplicity、long-soak / no-regression evidence tail、identity alias hygiene。 | P1。默认应直接产出 visual artifacts；review/export gate 保留，long-soak 和 route variants 不进普通首屏。 |
| OMA | target-agent semantics、developer work order、candidate / mechanism proposal、target-owner typed blocker。 | scripts/materializer hygiene、cohort/runtime warning、baseline owner review replay ref。 | P1。不要补成第二 framework；真实价值来自 target patch-loop 和 owner closeout。 |

## Root Cause

当前架构目标方向是对的：OPL 负责 runtime / queue / projection / recovery，domain agent 负责 truth / deliverable / quality / owner receipt。卡顿来自默认读面和运行循环里混入了过多“防假完成”的证据面。它们本意是保证 authority boundary，但在没有新 domain owner delta 时，会退化成：

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

除此之外的 ledger、replay、diagnostic、cleanup、long-soak 和 conformance 都应默认后置。

## Recommended Changes

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

### P1 follow-through

- MAG：把 `submission_ready_export_gate` 作为 human/domain owner gate；不要让 grouped CLI、manifest、Hermes proof lane 或 product-entry shell 成为 authoring 默认 blocker。
- RCA：默认 image-first artifact route；HTML/native PPTX/long-soak/replay refs 是 explicit route 或 production lane。
- OMA：把 script-to-pack hygiene 继续做薄，但真实优先级放在 target patch-loop、independent reviewer evidence、target owner closeout。
- OPL：private residue inventory、default-caller deletion evidence 和 long evidence ledger 只保留 owner-bound cleanup / production lane，不作为 Foundry Agent progress。

## Non-Goals

- 不删除任何当前有 active caller 的 domain helper、proof lane 或 shell。
- 不把 typed blocker、verified receipt、conformance pass、stage admitted、default caller ready 写成 domain ready 或 production ready。
- 不让 OPL/App 写 domain truth、artifact body、memory body、quality verdict、owner receipt 或 typed blocker。
- 不把 MVP 简化成没有质量门；独立 quality / owner review 仍是 domain deliverable 进入下一阶段的核心 gate。

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
- fresh CLI readouts listed above were run on `2026-06-04 CST`.
