# Family Product Operator Projection

## Purpose

`OPL` product/operator view 把 family runtime attempt、domain quality projection 和 incident learning loop 聚合成用户可监督的状态面。它回答用户关心的问题：哪个 domain 在跑、当前卡点、是否会自动继续、下一次该看哪个 surface、是否需要 human gate、质量门是否关闭。

## Source Contracts

本投影只消费 repo-tracked family contracts 和 domain-owned source refs：

- `contracts/opl-gateway/family-runtime-attempt-contract.json`
- `contracts/opl-gateway/family-domain-quality-projection-contract.json`
- `contracts/opl-gateway/family-incident-learning-loop.json`
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

## Fail-Closed Rules

- 没有 `source_refs` 时，投影状态必须是 `stale` 或 `blocked`。
- `freshness` 过期时，不能显示为 completed / passed。
- `owner_split` 缺失时，不能把 `OPL` 投影当成 domain truth。
- 缺少 domain-owned proof 或 eval pointer 时，不能关闭质量门。
