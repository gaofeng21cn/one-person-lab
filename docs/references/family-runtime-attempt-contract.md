# Family Runtime Attempt Contract

## Purpose

本合同把 `MAS` work-unit / route-unit attempt 经验抽象成 `OPL` family-level 最小共同语义。它服务 `OPL Runtime Manager` 的状态索引、诊断和产品投影，不改变 `Codex-default session/runtime`，也不让 `OPL` 接管 `MAS`、`MAG`、`RCA` 的 domain runtime truth。

## Owner Split

- `OPL` owns：family contract vocabulary、shared indexes、operator projection、diagnostic freshness。
- domain repo owns：runtime truth、route semantics、domain quality judgment、write authority。
- `OPL Runtime Manager` reads domain-owned durable surfaces and produces observability-only projection。
- `Hermes-Agent` can remain an explicit optional runtime substrate, but it is not a required scheduler entry for `OPL` family adoption。

## Attempt Record Fields

每个 domain repo 可以按自己的格式持久化 attempt，但投影给 `OPL` 时必须能表达：

- `attempt_state`：`unclaimed`、`claimed`、`running`、`retry_queued`、`released`、`succeeded`、`failed`、`blocked`。
- `attempt_count`：当前 work item / route item 已尝试次数。
- `retry_policy`：retry/backoff 的触发原因、下一次可运行时间、最大边界。
- `workspace_boundary`：`workspace_root` / `cwd` / `owner_repo` / allowed artifact roots。
- `failure_reason`：最近一次失败原因，必须区分 runtime failure、domain quality failure、human gate block。
- `reconciliation_status`：`fresh`、`stale`、`conflict`、`needs_domain_refresh`。
- `last_observed_projection`：`source_ref`、`observed_at`、`freshness`、`projection_owner`。

## State Semantics

- `claimed` 只表示 work item 已被某个 domain runtime 或 route unit 接手。
- `running` 只表示 domain-owned surface 报告仍在执行或等待下一次 runtime tick。
- `retry_queued` 表示恢复策略已经排队；它不是 domain quality judgment。
- `released` 表示该 attempt 不再持有 workspace / route claim，可以由 domain repo 重新调度或升级 human gate。
- `blocked` 必须携带 `human_gate_reason`、`quality_gate_reason` 或 `runtime_owner_mismatch`。

## Workspace Isolation

- attempt 必须携带 owner repo 与 workspace boundary，防止跨 repo 写入。
- `OPL` 只读取 domain-owned projection source refs，不推断额外 workspace 权限。
- 路径越界、缺少 source refs 或 owner repo 不匹配时 fail-closed。
- hosted worker / external runtime 只能作为 carrier；domain repo 仍然是 authority。

## Unsupported Scheduler Boundaries

以下内容不得写成 `OPL` family 必需入口：

- Linear required entry。
- Symphony scheduler owner。
- external issue tracker required entry。
- generic task scheduler replacing `Codex-default session/runtime`。
- `OPL Runtime Manager` as scheduler / session / memory kernel。

## Reconciliation

`OPL` 可以报告 stale / conflict / missing projection，但修复动作必须回到 domain-owned surface。`OPL` 的职责是说明当前卡在哪里、下一次应检查哪个 source ref、是否需要 human gate；domain repo 的职责是决定是否继续、重试、修复或关闭。
