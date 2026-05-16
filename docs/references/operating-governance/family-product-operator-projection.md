# Family Product Operator Projection

## Purpose

`OPL` product/operator view 把 family runtime attempt、domain quality projection 和 incident learning loop 聚合成用户可监督的状态面。它回答用户关心的问题：哪个 domain 在跑、当前卡点、是否会自动继续、下一次该看哪个 surface、是否需要 human gate、质量门是否关闭。

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

## Runtime Observability Export

当前 CLI surface 是：

```bash
opl runtime observability-export
opl runtime observability-export --format openmetrics
```

导出内容包括 provider readiness/proof counts、stage attempt counts、human gate / dead letter / blocker counters、memory writeback receipt/rejection counters 和 provider SLO receipt history。它是只读运维面，作用是让 App/operator 或外部监控更早发现不稳定信号，不是调度器、自动修复器或 domain verdict authority。
