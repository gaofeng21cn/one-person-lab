# Runtime 文档

Owner: `One Person Lab`
Purpose: `runtime_support`
State: `active_support`
Machine boundary: 人读索引。机器真相继续归 `contracts/`、源码、CLI/API、stage attempt ledger、provider receipt 与 runtime evidence。

Currentness policy: 本文只保存 runtime 支撑层的导航、稳定 owner split、动态证据入口和 negative boundary。不要从本文读取当前 attempt id、task id、worklist counter、provider proof snapshot、Search Attribute 安装状态、App/operator drilldown 数值、domain ready 或 production ready；这些必须从 fresh contracts、source、tests、CLI/read-model、runtime ledger、provider receipt 和 domain owner surface 读取。

本目录承接 OPL framework runtime、provider/executor、control plane、projection/read model、resume/wakeup 和 operator repair 语义的人读支撑。

当前入口先看：

- [架构](../architecture.md)
- [当前状态](../status.md)
- [OPL runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Stage Graph 与 Route-as-Transition Runtime](./stage-graph-route-transition-runtime.md)
- [OPL Agent Lab 控制面边界](./opl-agent-lab-control-plane.md)
- [Codex-maxxing Operating Loop Adoption](./codex-maxxing-operating-loop-adoption.md)
- [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)
- [Runtime Substrate 参考索引](../references/runtime-substrate/README.md)

## 运行入口读法

Runtime / product / policy 的维护入口按同一条资源链读取：

```text
Foundry Agent product pack
  -> OPL resource model
  -> Stage Attempt Runtime
  -> single Stage Transition Authority
  -> current_owner_delta
  -> App Console / operator action
  -> Agent Lab improvement control plane
```

这条链不是新的 active plan。当前 active gap、下一轮 baton 和完成口径仍回 [OPL Family 当前状态与理想目标差距](../active/current-state-vs-ideal-gap.md)；本目录只解释 runtime 支撑语义和各入口如何消费同一个 owner/truth split。

| 入口问题 | 稳定 owner | 默认阅读面 |
| --- | --- | --- |
| OPL resource model 从哪里读？ | OPL Framework | `docs/project.md`、`docs/status.md`、`docs/invariants.md`；资源从 `agents / workspaces / projects / stages / runs / artifacts / receipts / vault telemetry / console actions` 组织，不把任一投影写成 domain truth。 |
| Stage currentness 谁裁决？ | OPL runtime | [OPL Stage Graph 与 Route-as-Transition Runtime](./stage-graph-route-transition-runtime.md)；只有 Stage Transition Authority 可从 append-only authority event log 派生 current pointer、terminal state 和 `current_owner_delta`。 |
| Domain repo 应暴露什么？ | Foundry Agent owner | [Domain 私有功能面准入政策](../policies/domain-private-functional-surface-policy.md)；标准形态是 declarative Domain Pack + OPL generated/hosted surfaces + authority ABI。 |
| 新 surface 如何进入默认入口？ | OPL policy/compiler owner | [Policies 文档](../policies/README.md) 与 `contracts/opl-framework/surface-budget-policy.json`；默认 surface 必须通过 surface budget 分类，不能从支持文档或 debug view 直接进入 ordinary path。 |
| reconciler 如何拆小？ | OPL runtime owner | Route、artifact、owner-delta、telemetry 和 App Console reconciler 都只能做 desired/current 对齐和 refs-only 投影；它们不能生成 domain verdict、owner receipt 或 stage terminal state。 |
| Atlas / Vault telemetry 如何读？ | OPL Atlas / Vault | telemetry 只记录 route graph、evidence、receipt、trace、replay、blocker、long-soak 和 cleanup refs；只有 fold 成 owner answer、typed blocker、hard gate 或 `current_owner_delta` 后才影响默认路径。 |
| App Console 如何收薄？ | One Person Lab App / OPL Console | [Product 文档](../product/README.md)；App 默认消费 `opl app state` 与 `current_owner_delta`，full drilldown 只按 operator 显式展开。 |
| 改进闭环在哪里？ | OPL Agent Lab | [OPL Agent Lab 控制面边界](./opl-agent-lab-control-plane.md)；Agent Lab 只产出 improvement refs、work order、risk gate 和 follow-up，不持有 domain truth 或 App release verdict。 |

## 动态证据入口

| runtime 面 | 稳定读法 | 当前机器入口 |
| --- | --- | --- |
| Conflict / blocker envelope | Queue、stage attempt、closeout 和 App/operator projection 共享同一 fail-closed blocker/conflict vocabulary；OPL 只投影 envelope、refs、owner-aware route 和 drilldown target。 | `contracts/family-orchestration/family-conflict-envelope.schema.json`、`contracts/family-orchestration/README.md`、相关 `family-conflict-envelope` source/tests。 |
| Runtime manager / route handoff | OPL 接收 domain-declared route refs，持有 generic queue、stage attempt ledger、liveness projection、provider wakeup、redrive/retry/dead-letter；domain repo 继续持有 truth、owner receipt、typed blocker、quality/artifact authority。 | `contracts/opl-framework/runtime-manager-contract.json`、`src/family-runtime*.ts`、`tests/src/cli/cases/family-runtime-binding-intake.test.ts`、`opl family-runtime status|tick|queue inspect`。 |
| Stage attempt / progress projection | `stage_progress_log` 是 OPL attempt/progress projection，不是平行 log database；它从 attempt ledger、provider run、activity events、usage projection、typed closeout packet 和 refs 派生。 | `contracts/opl-framework/family-runtime-attempt-contract.json`、`contracts/opl-framework/README.md`、`src/family-runtime-stage-progress-log.ts`、`tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`、`opl family-runtime attempt query|inspect`。 |
| Temporal visibility / repair | Temporal Search Attributes 和 Web UI refs 是 provider lifecycle / operator debug surface；payload 只能是 refs 与可索引摘要，不能携带 transcript、artifact body、memory body、domain body 或 owner verdict。 | `src/family-runtime-providers.ts`、`src/family-runtime-temporal-provider-parts/attempt-query.ts`、`tests/src/cli/cases/family-runtime.test.ts`、`opl family-runtime provider repair --provider temporal`。 |
| Stage graph / transition / App drilldown | Stage graph、route transition、runtime visualization、App/operator drilldown 和 evidence worklist 只是 refs-only operator lens；可见、通过、blocked 或 closed counter 不能升级为 domain ready、artifact authority、quality/export verdict 或 production ready。Stage-native artifact progress 必须从 stage folder、manifest、receipt 和 current pointer 重建。 | `docs/runtime/stage-graph-route-transition-runtime.md`、`contracts/opl-framework/family-transition-runner-contract.json`、`src/runtime-tray-snapshot.ts`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。 |
| State Index / SQLite sidecar | SQLite sidecar 是可重建索引，不是 truth。`doctor` 只读健康度；`rebuild` 从 Stage Folder manifest、receipt refs、content hash、lineage 和 retention proof 回填 artifact/read-model rows。SQLite row 不能让 stage complete。 | `contracts/opl-framework/state-index-kernel-contract.json`、`src/family-runtime-state-index.ts`、`tests/src/family-runtime-state-index.test.ts`、`opl index doctor|rebuild|checkpoint|integrity-check|backup --json`。 |

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-runtime-naming-and-boundary-contract.md` | `active_support` | OPL runtime owner | 解释 Codex-default executor、provider-backed stage runtime、Temporal substrate、explicit executor adapter、已退役 Hermes/Gateway/frontdoor/local-manager 语义边界；机器真相仍归 contracts/source/CLI/API/runtime ledger/provider receipt。 |
| `codex-maxxing-operating-loop-adoption.md` | `active_support` | OPL runtime / product operator owner | 解释 Codex-maxxing operating-loop 参考如何收敛为 OPL-native workstream/thread、goal oracle、heartbeat/steering、artifact-first review、memory refs、receipt 和 read-model 边界；机器锚点是 `contracts/opl-framework/operating-loop-adoption-policy.json`。 |
| `stage-graph-route-transition-runtime.md` | `active_support` | OPL runtime owner | 解释复杂 domain agent 的 stage graph、route-as-transition、Stage Folder Contract、child graph、human gate、executor/reviewer split 和 MAS/RCA 承载方式；已落地运行面与剩余 production evidence gate 分开读取，不把 transition pass、provider completion、route graph projection 或目录存在写成 domain ready / stage complete。 |
| `opl-agent-lab-control-plane.md` | `active_runtime_support` | OPL Agent Lab control-plane owner | 解释 Agent Lab 作为 OPL Framework 内部统一 eval / improvement control plane 的职责、输入输出和 authority boundary；它只聚合 refs/evidence/follow-up，不持有 domain truth、quality verdict 或 artifact authority。 |
