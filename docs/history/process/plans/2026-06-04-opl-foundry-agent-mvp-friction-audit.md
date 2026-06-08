# OPL Foundry Agent MVP Friction Audit

Owner: `One Person Lab`
Purpose: `mvp_friction_audit`
State: `history_provenance_compressed`
Machine boundary: 本文是人读历史 friction 诊断摘要。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker 和真实 workspace / App evidence。
Date: `2026-06-04`
Compressed: `2026-06-08`

## 读法

本文保留 2026-06-04 OPL / Foundry Agent MVP friction 诊断的 compact provenance，不再承载当前目标架构、当前 gap、当前完成口径、当前实施 lane 或 fresh readiness 结论。

当前 owner 回到：

- 目标操作架构、primitive、迁移阶段和验收门：[OPL Foundry Agent Target Operating Architecture](../../../active/opl-foundry-agent-target-operating-architecture.md)
- 当前完成进度、功能/结构差距、测试/证据差距和下一轮 baton：[OPL Family 当前状态与理想目标差距](../../../active/current-state-vs-ideal-gap.md)
- 文档生命周期与历史压缩规则：[OPL 文档组合治理](../../../docs_portfolio_consolidation.md)

历史文件里的 `current`、`next`、CLI 计数、warning 数、workorder 数、attempt 状态和验收命令都只按 2026-06-03 至 2026-06-04 附近的历史审计语境阅读。继续处理 Foundry Agent 或 domain owner delta 时必须重新读取 live code、contracts、tests、CLI/read-model、runtime ledger、App evidence 和 domain owner refs。

## Historical Question

本轮只回答一个历史问题：从 MVP 原则看，OPL 各 Foundry Agent 的哪些设计面正在帮助 MAS/MAG/RCA/OMA 更快产出，哪些设计面可能把默认路径拖入 receipt、read-model、replay、diagnostic、long-soak 或 cleanup accounting。

当时采用的 MVP 默认链路是：

```text
目标 / 材料 / stage pack
  -> selected executor attempt
  -> domain deliverable delta
  -> independent gate / owner receipt / typed blocker
  -> 下一 owner
```

压缩后的长期可用结论是：默认面只应保留能让 selected executor 产出下一份 domain delta、保护 authority boundary、保证 provider/runtime 可恢复，或让 operator 直接看清 current owner delta 的 surface。其余 surface 进入 audit、diagnostic、production evidence、cleanup 或 history/provenance。

## Historical Evidence Snapshot

2026-06-03 pushed-main baseline 与 2026-06-04 local checkout readout 当时显示：

| Surface | 历史读法 | 当前使用边界 |
| --- | --- | --- |
| `opl agents descriptors --json` | MAS/MAG/RCA/OMA descriptor resolved；private platform residue 是 audit-only；production closure 仍有 evidence tail。 | 只能证明结构描述符当时可读，不证明 domain ready、production ready 或 physical delete authority。 |
| `opl agents conformance --family-defaults --json` | family structural conformance 当时应保持 4/4 passed；`tool_affordance_boundary` adoption 缺口被降为 warning 后，不再阻断 existing family repos。 | 当前 conformance truth 必须 fresh-read；历史 pass 不能替代当前 pack、contract、source 或 tests。 |
| `opl stages readiness --family-defaults --json` | 19 个 stage admitted、0 hard blocker；runtime budget、replay、cohort 等多为 warning。 | warning 只在导致错误启动、越权、不可审计、不可恢复或 provider 不可达时升级 hard blocker。 |
| `opl framework readiness --family-defaults --json` | `current_owner_delta` 已开始成为默认 root；audit tail 被标记为 passive。 | 当前 owner、lineage、hard gate 和 next owner 必须读 fresh readiness/read-model。 |
| `opl family-runtime evidence-worklist --detail full --json` | MAS domain-dispatch / owner-payload tail 是当时最大噪音；open worklist 不能写成 paper progress。 | current worklist count 只作为 live diagnostic，不作为完成、domain ready 或 next action authority。 |
| `opl agents default-callers --family-defaults --json` | generated/default caller surface 当时结构 ready，但仍需要 domain evidence。 | generated ready 不等于 App GUI ready、domain ready、production ready 或 wrapper physical delete authority。 |

## Compressed Findings

### Keep In Default Path

| 设计面 | 历史结论 |
| --- | --- |
| Stage-led domain pack | Stage 是可恢复、可审计、可接力的真实工作包。 |
| `Codex CLI` first-class executor | 让模型、prompt、skill 和 knowledge 直接进入 stage 内认知计算。 |
| Temporal / provider liveness gate | provider 不可用会阻断 attempt，是 launch-hard 级前提。 |
| `Progress-First` closeout fields | 防止把平台修复、ledger 增长或 receipt verified 写成 domain progress。 |
| owner receipt / typed blocker | domain-owned answer 是防止假完成的最低边界。 |
| independent quality / owner review stage | MAS reviewer、MAG fundability、RCA visual review、OMA target-owner review 不能降成 helper 后处理。 |
| authority boundary / no-forbidden-write | OPL/App/ledger 不得写 domain truth、artifact body、memory body、quality verdict、owner receipt 或 typed blocker。 |
| tool affordance boundary as advisory authority catalog | 工具能力、权限、credential、write scope、side-effect 和 forbidden authority 有价值，但不能成为迁移期 generic hard gate 或 workflow script。 |

### P0 Friction

| Surface | 历史风险 | 历史处置 |
| --- | --- | --- |
| `tool_affordance_boundary` family-wide hard gate | metadata completeness 会先阻断 existing family repos，抢占 domain deliverable delta。 | existing repos 缺 `tools` / `tool_refs` 只给 adoption warning；显式 `standard-stage-pack.v2` 才 hard-block 缺 tool boundary。 |
| MAS domain-dispatch / owner-payload tail | 大量 per-attempt record route 会把 operator 带入 receipt/accounting 循环，而不是 paper/evidence/reviewer delta。 | 默认面只暴露当前 study / owner-action lineage 的最新 `current_owner_delta`；historical / superseded / typed-blocked route 进 full audit。 |
| raw evidence envelope and attention tail | evidence count、blocked refs 和 typed blocker group 容易被误读成待执行任务或完成。 | App/CLI 默认只展示 compact owner delta；raw envelope、receipt counters、typed blocker groups 只在 full detail。 |
| stage replay / human-gate workorder defaultization | replay certification 和 human-gate replay refs 会抢占可执行 domain work。 | 只在阻断当前 launch/handoff/owner gate 时进入默认面；否则归 release / production / audit lane。 |
| runtime-budget / cohort / assumption warnings | reliability warning 可能被误升为 non-terminal stage hard blocker。 | 默认归 production-hardening backlog；只有安全、越权、不可恢复、不可审计和 provider liveness 风险才 hard-block。 |

### P1 Friction

| Surface | 历史处置 |
| --- | --- |
| private platform residue inventory | 保持 audit-only；专门 cleanup lane 才按 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write、provenance 处理。 |
| generated/default caller deletion evidence | 只做 no-resurrection guard 和 release/cleanup evidence，不写成 Foundry Agent progress。 |
| MAG product-entry / domain-handler / Hermes helper | 保留为 refs-only / explicit non-default proof lane；ordinary runtime 不走 Hermes。 |
| RCA route multiplicity / identity aliases | image-first 是默认；HTML/native PPTX/long-soak/replay refs 是 explicit route 或 production lane。 |
| OMA scripts / materializers | 只做 work-order / candidate / typed-blocker materializer 或薄 delegation，不扩成第二 Framework / Agent Lab。 |
| production long-soak evidence | 终局 production gate 必需，但不阻断普通 non-terminal stage。 |

## Historical Root Cause

这轮审计把卡顿机制归为两类：

1. 为防假完成引入的 raw evidence、receipt、typed blocker、replay 和 worklist 面，如果没有 fold 成 fresh domain owner delta、owner receipt、typed blocker、human gate 或 hard gate，会退化成 `record refs -> reconcile read-model -> expose more workorders -> repeat`。
2. 新 metadata completeness 若在 adoption 前提升成 family-wide hard gate，会退化成 `add cross-family field -> existing packs incomplete -> structural conformance blocked -> metadata backfill -> no domain deliverable delta`。

长期规则是：audit/control 面必须支持审计、恢复和 fail-closed；默认 delivery 面必须围绕 `current_owner_delta`、stage artifact unit、owner receipt、typed blocker 和 hard gate。不能让 audit count、metadata completeness、long-soak 或 cleanup accounting 反向生成 ordinary next action。

## Historical Target Objects

本轮提出的目标对象后来被 active docs 吸收：

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

相关 design lanes 当时包括 `default_owner_delta_lane`、`mas_tail_compaction_lane`、`stop_loss_lane`、`generated_surface_lane`、`audit_plane_lane` 和 `tool_affordance_adoption_lane`。这些 lane 现在只作为历史来源阅读；当前 owner、状态和下一步回 active gap plan 与 live read-model。

## No-Resurrection Rules

- 不把 typed blocker、verified receipt、conformance pass、stage admitted、default caller ready、doctor clean 或 docs updated 写成 domain ready / production ready。
- 不让 OPL/App 写 domain truth、artifact body、memory body、quality verdict、owner receipt 或 typed blocker。
- 不把 `tool_refs` 解释成 executor 必须执行的工具顺序、认知策略、stage goal 或 domain quality verdict。
- 不把 raw evidence envelope、full worklist、blocked refs-only group、stage replay packet、private residue inventory 或 receipt counter 放回 ordinary App/CLI/operator 首屏。
- 不为 retired wrapper、facade、alias、compatibility test 或 stale workflow 新增 shim、re-export、fallback 或兼容说明。

## Fresh Read Commands

继续处理此主题时，不复用本文历史计数，先 fresh-read：

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

## Compression Closeout

2026-06-08 本文件从逐条 fresh readout、P0/P1 展开、实现 lane、外部经验和验证流水的长清单压缩为 compact provenance。当前目标架构、current gap、implementation owner 和 fresh verification 不在本文维护。压缩 closeout 见 [2026-06-08 OPL MVP friction history compression closeout](./2026-06-08-opl-mvp-friction-history-compression-closeout.md)。
