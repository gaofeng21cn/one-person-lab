# Family Product Operator Projection

Owner: `One Person Lab`
Purpose: `references_operating_governance_family_product_operator_projection`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## Purpose

`OPL` product/operator view 把 family runtime attempt、domain quality projection 和 incident learning loop 聚合成用户可监督的状态面。它回答用户关心的问题：哪个 domain 在跑、当前卡点、是否会自动继续、下一次该看哪个 surface、是否需要 human gate、质量门是否关闭。

2026-05-28 live read-model 口径：`opl runtime app-operator-drilldown --json` 当前可读，provider cadence/capability SLO satisfied，stage attempt count 为 25，operator action route count 为 319，其中 executable 为 69；12 条 stage production evidence action route 仍需要 domain/App payload，domain-dispatch evidence 当前默认 actionable attempt 为 0。App release/user-path evidence refs 可见，但 `app_release_user_path_release_ready_claimed=false`、`app_release_user_path_production_ready_claimed=false`；Codex App 只承担 start / observe / intervene / display，不驱动 long-running task loop。Operator projection 的角色是展示 OPL / Temporal / domain-owned refs 和 next gate，不关闭 domain owner-chain、quality gate、artifact authority、memory writeback apply、App release 或 production ready。

## Source Contracts

本投影只消费 repo-tracked family contracts 和 domain-owned source refs：

- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `contracts/opl-framework/family-domain-quality-projection-contract.json`
- `contracts/opl-framework/family-incident-learning-loop.json`
- domain-owned runtime / quality / incident refs from `MAS`、`MAG`、`RCA`

## Projection Fields

Operator projection 必须表达：

- `domain_id`
- `active_item`
- `attempt_summary`
- `quality_summary`
- `incident_summary`
- `current_blocker`
- `auto_continue`
- `next_surface_ref`
- `human_gate_reason`
- `source_refs`
- `freshness`
- `owner_split`
- `control_loop_summary`
- `usage_projection`
- `resource_pressure`
- `observability_export`

## Runtime Semantics

- 默认 `opl`、`opl exec`、`opl resume` 保持 `Codex-default session/runtime`。
- 显式 runtime switch / explicit runtime switch 或显式 domain activation / explicit domain activation 才进入 domain / hosted runtime 语义。
- GUI / tray / dashboard 只能消费 `OPL` projection 和 domain-owned source refs。
- 不新增 local daemon、LaunchAgent、LaunchDaemon 或 SMAppService helper。
- 不让 `OPL` 接管 scheduler、session、memory、domain runtime truth 或 domain quality authority。

## Operator Answers

投影应能直接回答：

- 当前哪个 domain 在跑。
- 当前卡在 runtime、quality、incident、install/sync 还是 human gate。
- 是否会自动继续。
- 下一次应查看哪个 domain-owned source ref。
- human gate 的原因和请求入口。
- 质量门是 domain-owned closed、failed、blocked 还是 stale。
- 控制回路当前是正常推进、human gate、dead letter、blocker，还是只有 route/receipt refs 可读。
- token / cost / API / duration / cadence / retry budget 是否已有已观测压力信号。
- 是否需要把当前 runtime/stage/SLO counters 以 JSON 或 OpenMetrics 导出给外部监控。

## Fail-Closed Rules

- 没有 `source_refs` 时，投影状态必须是 `stale` 或 `blocked`。
- `freshness` 过期时，不能显示为 completed / passed。
- `owner_split` 缺失时，不能把 `OPL` 投影当成 domain truth。
- 缺少 domain-owned proof 或 eval pointer 时，不能关闭质量门。
- `usage_projection` 和 `resource_pressure` 只能报告已观测数据；缺失值不能估算，不能触发 executor auto-degradation。
- `control_loop_summary` 只能汇总 trigger、decision、action route、receipt refs 和 blocker/human-gate/dead-letter 状态；不能执行 domain action 或写 domain truth。
- `observability_export` 只能读取 OPL ledger、provider proof receipts、runtime snapshot、stage attempt workbench 和 domain-owned projection refs；不能授权 repair、ready、quality 或 artifact/export verdict。
- 外部 generic fallback 只能显示为 `degraded_attempt` 或 `alternative_route_proposal`；operator 面必须同时展示 blocker、evidence gap、owner receipt ref 和 next surface，不能显示为 completed / passed。
- 字符串 retry 规则不能直接驱动执行；只有 typed SLO / retry policy schema 且 parse 成功时才可成为 proposal 或 supervised action envelope，解析失败必须 fail-closed。
- 通用 event bus 只能贡献 event / alert 分类字段；operator projection 的 truth source 仍是 OPL ledger、Temporal proof、typed closeout 和 domain-owned receipt。
- 通用 runtime adapter 只能作为显式非默认 executor adapter 展示；operator 面不能把 adapter process started 写成行为、质量或 resume 等价。

## External Stability Learning

本轮从 `cybernetics-agent` 继续吸收的是稳定性表达，不是通用兜底执行机制。可学习项包括 control-loop 分类、已观测 usage / budget projection、typed SLO / retry policy 语言、只读 event / alert projection 和 dashboard grouping vocabulary。

不进入核心运行机制的项包括 generic fallback completion、string-rule retry execution、generic event bus as truth、generic runtime adapter success semantics。对 OPL 来说，稳定性不是“失败也产出点东西”，而是“失败被准确分类、可恢复、可审计，并且不会伪装成高质量完成”。

## Runtime Observability Export

当前 CLI surface 是：

```bash
opl runtime observability-export
opl runtime observability-export --format openmetrics
```

导出内容包括 provider readiness/proof counts、stage attempt counts、human gate / dead letter / blocker counters、memory writeback receipt/rejection counters 和 provider SLO receipt history。它是只读运维面，作用是让 App/operator 或外部监控更早发现不稳定信号，不是调度器、自动修复器或 domain verdict authority。
