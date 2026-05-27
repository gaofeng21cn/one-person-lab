# Family Runtime Attempt Contract

Owner: `One Person Lab`
Purpose: `references_runtime_substrate_family_runtime_attempt_contract`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## Purpose

本合同把 `MAS` work-unit / route-unit attempt 经验抽象成 `OPL` family-level 最小共同语义。它服务 `OPL Runtime Manager` 的状态索引、诊断和产品投影，不改变 `Codex-default session/runtime`，也不让 `OPL` 接管 `MAS`、`MAG`、`RCA` 的 domain runtime truth。

## Owner Split

- `OPL` owns：family contract vocabulary、shared indexes、operator projection、diagnostic freshness。
- domain repo owns：runtime truth、route semantics、domain quality judgment、write authority。
- `OPL Runtime Manager` reads domain-owned durable surfaces and produces observability-only projection。
- The configured family runtime provider is the OPL online runtime substrate for Full readiness. Temporal-backed execution is the required production substrate; `local_sqlite` is only the dev/CI/offline diagnostic baseline. `Hermes-Agent` is not a provider and retained references are explicit proof diagnostics, executor experiments, fixtures, or provenance. No provider is a domain truth owner or domain scheduler authority。

## Attempt Record Fields

每个 domain repo 可以按自己的格式持久化 attempt，但投影给 `OPL` 时必须能表达：

- `attempt_state`：`unclaimed`、`claimed`、`running`、`retry_queued`、`released`、`succeeded`、`failed`、`blocked`。
- `attempt_count`：当前 work item / route item 已尝试次数。
- `retry_policy`：retry/backoff 的触发原因、下一次可运行时间、最大边界。
- `workspace_boundary`：`workspace_root` / `cwd` / `owner_repo` / allowed artifact roots。
- `failure_reason`：最近一次失败原因，必须区分 runtime failure、domain quality failure、human gate block。
- `reconciliation_status`：`fresh`、`stale`、`conflict`、`needs_domain_refresh`。
- `last_observed_projection`：`source_ref`、`observed_at`、`freshness`、`projection_owner`。

## Stage Progress Log

`stage_progress_log` 是 OPL 对 stage attempt 的统一语义 log。它从 attempt ledger、provider run、activity events、usage projection、typed closeout packet、blocker refs 和 domain receipt refs 派生，表达 planned stage / actual work / timeline / token-cost-duration / evidence refs / authority boundary。它不新增平行状态库，不读取 transcript、artifact body、memory body 或 domain body，也不替 domain owner 发布 quality、artifact、package、publication 或 domain-ready verdict。

`attempt_true_path_proof` 是同一 attempt 的 refs-only 追踪证明面。它把 `attempt query`、`queue inspect`、App full drilldown、`stage_progress_log`、Temporal visibility 和 Temporal Web UI debug refs 绑定到同一 `stage_attempt_id/task_id/workflow_id/run_id`，只证明当前 provider-backed 真路径可追踪；它不构成 long-soak、domain-ready、artifact authority、owner receipt 或 quality verdict。

Temporal-backed attempt 必须把 durable history、activity heartbeat、workflow query 和 searchable visibility 交给 Temporal provider；OPL 只把这些 provider refs 投影成 `temporal_visibility` 和 `temporal_webui_ref`。`temporal_visibility` 只包含 namespace、task queue、workflow/run refs、Search Attribute refs 与可检索摘要；`temporal_webui_ref` 只作为 operator debug link，不是 One Person Lab App 的主状态页、用户 truth surface 或 domain authority。

## State Semantics

- `claimed` 只表示 work item 已被某个 domain runtime 或 route unit 接手。
- `running` 只表示 domain-owned surface 报告仍在执行或等待下一次 runtime tick。
- `retry_queued` 表示恢复策略已经排队；它不是 domain quality judgment。
- `released` 表示该 attempt 不再持有 workspace / route claim，可以由 domain repo 重新调度或升级 human gate。
- `blocked` 必须携带 `human_gate_reason`、`quality_gate_reason` 或 `runtime_owner_mismatch`。

## External Stability Pattern Policy

`cybernetics-agent` 一类外部 agent wrapper 的 fallback、字符串 retry、event bus 和 runtime adapter 不是完全不能学；它们不能作为 `OPL` core runtime 成功语义照搬。`OPL` 的稳定性定义是失败能被准确分类、可恢复、可审计，并且不会伪装成高质量完成。

- `generic_fallback` 只能进入 `degraded_attempt` 或 `alternative_route_proposal`。它必须携带 blocker、evidence gap 和 owner receipt ref；不能标记 `fallback_complete`，不能绕过质量门或 domain authority。
- `string_rule_retry` 只能升级为 typed SLO / retry policy schema。规则必须有 trigger kind、metric source、cooldown、max attempts、owner、allowed action 和 receipt refs；解析失败必须 fail-closed。
- `generic_event_bus` 只能作为只读 event classification / alert projection。真实状态仍以 stage attempt ledger、Temporal workflow history、typed queue、typed closeout packet 和 domain-owned receipt 为准；event stream 不能成为第二真相源。
- `generic_runtime_adapter` 只能落到显式 executor adapter registry。每个 adapter 必须声明 capability boundary、receipt shape、tool-event proof、timeout rule、typed closeout rule 和 fail-closed gate；不能把“能启动进程”解释为行为等价、质量等价或 resume 等价。

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
