# Runtime 文档

Owner: `One Person Lab`
Purpose: `runtime_support`
State: `active_support`
Machine boundary: 人读索引。机器真相继续归 `contracts/`、源码、CLI/API、stage attempt ledger、provider receipt 与 runtime evidence。

本目录承接 OPL framework runtime、provider/executor、control plane、projection/read model、resume/wakeup 和 operator repair 语义的人读支撑。

当前入口先看：

- [架构](../architecture.md)
- [当前状态](../status.md)
- [OPL runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Stage Graph 与 Route-as-Transition Runtime](./stage-graph-route-transition-runtime.md)
- [OPL Agent Lab 控制面边界](./opl-agent-lab-control-plane.md)
- [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)
- [Runtime Substrate 参考索引](../references/runtime-substrate/README.md)

当前 runtime conflict / blocker 机器语法统一在 `contracts/family-orchestration/family-conflict-envelope.schema.json`。`stage_attempt_query`、`stage_attempt_workbench`、`runtime_tray_snapshot.operator_conflicts[]` 与 `runtime_tray_snapshot.app_operator_drilldown` 只投影 envelope、refs、owner-aware action route 与 App drilldown targets；OPL 不把 provider/executor completion 解释成 domain ready、quality、readiness、artifact 或 export verdict。

当前 MAS generic runtime handoff 的机器入口是 `contracts/opl-framework/runtime-manager-contract.json#/family_runtime_queue/mas_domain_route_projection` 与 `#/family_scheduler_replacement`。OPL 接收 `mas_runtime_owner_route_handoff`，并以 `opl_runtime_owner_route` 持有 generic runtime queue、stage attempt ledger、liveness projection、provider wakeup、redrive/retry/dead-letter；MAS 继续持有医学 domain truth、paper progress semantics、owner receipt、typed blocker、publication/artifact gate 与 current package authority。

MAS default-executor dispatch 的 task row 与 provider-hosted stage attempt 必须作为同一 OPL typed queue / attempt lifecycle 投影同步：当 linked Temporal attempt 的 terminal observation 显示 failed 或 not-completed，OPL 可以把仍处于 `queued`、`running`、`succeeded` 或 provider-only blocked 的同一 task 收敛到 `blocked`，并设置 provider dead-letter reason 以开放 formal redrive；当 linked attempt 产出 accepted typed closeout，OPL 可以把同一 task 收敛到 `succeeded` 并清除 provider-only blocker。该同步只表达 provider transport completion / failure / non-completion，不写 MAS study truth、不改 publication verdict、不签 owner receipt，也不把 provider completion 或 redrive 解释成 paper ready。

当 OPL tick 观察到 MAS default-executor task 仍是 `running`、lease 已过期、linked Temporal attempt 仍停在 `registered/queued`，但 Temporal query 返回 `temporal_workflow_not_started_or_not_found` 时，该状态属于 OPL provider admission / liveness failure。OPL 必须把 linked attempt 记录为 provider transport failure、把 task 收敛到 provider-only blocked reason，并在 retry budget 内由同一个 tick 自动 redrive；普通未 claim 的 queued attempt 不能因为 workflow not found 被误判为失败。自动 redrive 产生的新 stage attempt 使用同 task/stage/provider 下的 ordinal 保证可审计唯一性，不能依赖同毫秒时间戳或人工 queue update。

`stage_progress_log` 是当前 stage attempt 的 canonical 可观测读面：`attempt query|inspect`、operator visibility、`stage_attempt_workbench` 和 App full drilldown 都从同一 attempt ledger / provider run / activity events / usage projection / closeout packet 派生 planned work、actual work、timeline、usage、evidence refs、Temporal visibility refs 和 authority boundary。Temporal provider 负责 durable workflow history、activity heartbeat、workflow query 和 searchable visibility；OPL 不新建平行 log database，也不把 Temporal history 或 Web UI 当成 App 用户状态真相。

Temporal visibility readiness 属于 provider lifecycle gate。`temporal` provider 启动 searchable stage attempt 前必须具备 OPL stage attempt Search Attributes；缺失时返回明确 repair action，并通过 `opl family-runtime provider repair --provider temporal` 安装。Search Attributes 只能承载可检索 refs 与摘要字段，不能放 transcript、artifact body、memory body、domain body 或 owner verdict。

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-runtime-naming-and-boundary-contract.md` | `active_support` | OPL runtime owner | 解释 Codex-default executor、provider-backed stage runtime、Temporal substrate、explicit executor adapter、已退役 Hermes/Gateway/frontdoor/local-manager 语义边界；机器真相仍归 contracts/source/CLI/API/runtime ledger/provider receipt。 |
| `stage-graph-route-transition-runtime.md` | `active_support` | OPL runtime owner | 解释复杂 domain agent 的 stage graph、route-as-transition、child graph、human gate、executor/reviewer split 和 MAS 承载方式；已落地运行面与剩余 production evidence gate 分开读取，不把 transition pass、provider completion 或 route graph projection 写成 domain ready。 |
| `opl-agent-lab-control-plane.md` | `active_runtime_support` | OPL Agent Lab control-plane owner | 解释 Agent Lab 作为 OPL Framework 内部统一 eval / improvement control plane 的职责、输入输出和 authority boundary；它只聚合 refs/evidence/follow-up，不持有 domain truth、quality verdict 或 artifact authority。 |
