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

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-runtime-naming-and-boundary-contract.md` | `active_support` | OPL runtime owner | 解释 Codex-default executor、provider-backed stage runtime、Temporal substrate、explicit executor adapter、retired Hermes/Gateway/frontdoor/local-manager 语义边界；机器真相仍归 contracts/source/CLI/API/runtime ledger/provider receipt。 |
| `stage-graph-route-transition-runtime.md` | `active_plan` | OPL runtime owner | 解释复杂 domain agent 的 stage graph、route-as-transition、child graph、human gate、executor/reviewer split 和 MAS 承载方式；不把 transition pass、provider completion 或 route graph projection 写成 domain ready。 |
| `opl-agent-lab-control-plane.md` | `active_runtime_support` | OPL Agent Lab control-plane owner | 解释 Agent Lab 作为 OPL Framework 内部统一 eval / improvement control plane 的职责、输入输出和 authority boundary；它只聚合 refs/evidence/follow-up，不持有 domain truth、quality verdict 或 artifact authority。 |
