# OPL Runway

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态与 L4/L5 边界说明。机器真相继续归 runtime contracts、provider state、stage-attempt projection/attempt ledger、CLI/API 行为、provider receipts、App read-model 和测试输出。
Currentness policy: 本文不冻结 Runway L4 状态、provider/service/worker readiness、stage-attempt counts、repair blockers、attempt refs、SLO/readiness evidence、App projection 或 production maturity。当前 Runway 结构和 provider 状态必须从 fresh `opl runway status|readiness|validate|doctor --json`、runtime contracts、provider state、stage-attempt projection/attempt ledger、source/tests 和 provider receipts 读取。

## 品牌定位

`OPL Runway` 是 OPL 的长跑执行、恢复与控制环模块。它把 stage attempt 放进 durable runtime，负责启动、lease、heartbeat、retry、dead-letter、resume、human gate、provider status、worker lifecycle/readiness projection，以及 desired/current reconciliation 产生的唯一下一 safe action。

一句话：`Runway` 管“任务怎么持续跑、怎么恢复、当前状态和目标是否一致、下一步唯一安全动作是什么”。

## 当前 L4 / L5 口径

- Desired/current reconciliation：domain owner 声明目标、下一步或 typed blocker，Runway 只负责把可执行部分投影成可恢复 attempt，并持续对账 current state。
- Control-loop runtime：Runway 的目标态是 `desired state -> current state -> Progress Reconciler -> next safe action -> provider / owner / gate observation -> authority event/read-model` 的控制环；该控制环只能产生 OPL runtime safe action、owner route、typed blocker requirement 或 refs-only observation，不产生 domain truth。
- Durable execution：Temporal-backed provider 是 production online substrate；Temporal 负责 workflow history、task queue、signal/query、retry、timeout、timer 和 replay，worker process/service 的启动、保活、重启、版本与依赖 readiness 由 Runway worker lifecycle surface 和部署 substrate 承担。
- Runtime environment / sandbox execution：Runway 拥有 Runtime Environment Substrate、Fast Local Env doctor / prepare / run-context、selected stage executor 的 sandbox provider selection、create-or-restore、executor run、timeout / retry / blocker 和 receipt projection。默认环境路径是 Fast Local Env；Local Docker / Devcontainer 是显式 local sandbox provider；E2B 是当前已实现的 remote provider，Daytona / Modal 只作参考候选。OPL Connect 只在需要时提供 provider discovery、configuration、package/install 或 connector 分发辅助，不拥有 stage execution sandbox。
- Workflow history payload boundary：Runway / Temporal activity result 只能向 workflow history 写入 refs-only 或 summary-only receipt；Temporal scheduler cadence activity 这类会读取 provider、stage-attempt projection、dispatch 和 SLO 的动作必须把完整 runtime body 留在 activity 内部或外部 ledger，返回 `temporal_scheduler_tick_activity_receipt` 摘要。`provider_runtime`、`provider_slo`、provider blocker / repair body、task scope payload match body 和 `retired_queue_tick.dispatches` 不能进入 Temporal completion result。
- Worker lifecycle supervision：Runway 必须投影 service/worker readiness、managed process/crash diagnostic、poll/heartbeat、SLO health 和 repair action；SLO watchdog 只是 health check / repair trigger，不替代 worker supervisor。
- Progress-first supervision：Runway 读面默认回答“当前是否在跑、卡在哪里、下一 owner 是谁”，不把 provider 运维动作抢成 domain 交付进展。
- Capability hard gate：Capability Invocation OS 的 hard gate 折回 Runway 的 runtime/control-loop 读面，但授权源仍是 `current_owner_delta`；Runway 只能 fail closed、等待 owner/gate 或生成 OPL runtime blocker，不写 domain truth、owner receipt 或 domain typed blocker。
- Fail-closed authority：缺 provider attempt、active lease、execution authorization、workspace/artifact scope、source fingerprint 或 closeout binding 时，Runway 只能返回 OPL runtime blocker。
- Module-owned surface：fresh `contracts/opl-framework/brand-module-surfaces.json#modules.runway` 与 `opl runway status|inspect|interfaces|validate|doctor|readiness|reconcile|handoff-gates|recovery-repair|control-loop status --json` readback 可以证明 Runway 达到 Workspace 级 `L4_structural_baseline`；`opl brand-modules ...` 只作为聚合目录。
- L5 boundary：Runway L4 只覆盖结构完成度。Temporal/provider/worker lifecycle/readiness、SLO repair、attempt refs 或 verified ledger 都不能单独声明 production long-soak、domain ready、quality verdict 或 `L5 production operating maturity`。

## 已落地读面与未声称边界

Runway 已落地的是可执行读面和 fail-closed control-loop 合同，不是 L5 生产运营声明。

| 已落地读面 | 当前能回答 | 未声称 |
| --- | --- | --- |
| `opl runway readiness --json` | provider/service/worker/scheduler 是否可用；缺 Temporal 配置时返回 `provider_not_ready` 与 repair action。 | 不声明 domain ready、production ready 或 Runway L5。 |
| `opl runway reconcile --json` | desired owner route 与 current queue/attempt/provider/gate/receipt refs 是否一致，以及唯一下一 safe action 或 owner/gate wait。 | 不生成 domain owner receipt、domain typed blocker、quality verdict 或 artifact readiness。 |
| `app_projection:capability_invocation_hard_gate` | route-required capability ref、current owner delta、Stagecraft policy 和 Runway runtime gate 的 hard-gate 投影。 | 不把 hard gate 通过写成 owner answer、typed blocker、domain ready 或 stage complete。 |
| `opl runway handoff-gates --json` | handoff、human gate、owner answer shape 与 closeout binding 的 refs-only gate 状态。 | 不把 gate passed 写成 stage complete、domain ready 或 owner receipt。 |
| `opl runway recovery-repair --json` | worker/provider/scheduler/lease/dead-letter 的 OPL repair plan、worker restart guard、blocked/failed attempt operator repair queue 和 refs-only blocker。 | 不把 repair 成功、attempt query 或 queue 清点写成 domain progress、production long-soak complete 或 App release ready。 |
| `opl runway control-loop status --json` | control-loop 当前 desired/current/action/ref 投影，以及 false-authority flags。 | 不把 chosen action、provider completed、worker healthy 或 queue closed 写成 production-ready 结论。 |

Temporal 未配置、service down、worker not ready 或 scheduler missing 都是 Runway / provider 层 `provider_not_ready` 或 repair action；它们表示 OPL runtime substrate 需要修复，不表示 domain agent ready，也不表示 domain 交付路径已经安全关闭。

## Control-loop Runtime 目标态

Runway L4/L4+ 的结构强化目标是把长跑 runtime 从“定时 tick + provider 状态读面”提升为明确控制环：

```text
desired owner route / target state
-> current stage-attempt projection / attempt / provider / gate / receipt refs
-> Progress Reconciler
-> exactly one next safe action or typed blocker requirement
-> Temporal workflow / worker supervisor / scheduler / owner handoff / gate wait
-> append-only observation refs and read-model projection
```

控制环的职责边界：

- Desired state 来自 domain owner route、stage pack admission、human gate decision、owner answer shape 或 explicit operator target；Runway 不推断 domain 想要什么，也不把 stale route 当成当前目标。
- Current state 来自 stage-attempt projection、stage attempt ledger、Temporal provider refs、worker supervisor status、scheduler cadence refs、human gate refs、dead-letter refs、owner receipt refs 和 typed blocker refs；Runway 只读 refs，不读取或保存 artifact/memory/domain body。
- Progress Reconciler 比较 desired/current，并输出唯一下一 safe action：launch/resume attempt、signal/update workflow、repair worker/provider、wait for human/domain owner、redrive dead-letter、emit OPL runtime blocker，或要求 domain owner 提供合法 owner answer shape。
- Capability Invocation hard gate 是 Progress Reconciler 的输入约束之一：route-required capability ref 缺失、current owner delta 缺失、owner route identity 不匹配或 forbidden write / irreversible mutation 时 fail closed；soft discovery 和 scored fit 只进入 advisory，不驱动默认 runtime action。
- 若同时存在多个候选动作，reconciler 必须按 current owner delta、StageRun identity、source fingerprint、lease、execution authorization、closeout binding 和 accepted answer shape 消歧；无法消歧时 fail closed 为 typed blocker requirement 或 OPL runtime blocker。
- Reconciler 不执行 stage 内专家策略，不生成 deliverable，不评审结果，不签 owner receipt，不创建 domain typed blocker，不声明 domain ready / quality ready / production ready。
- App/operator 默认只消费 reconciler 产生的 current owner、next safe action、blocker 和 refs-only drilldown；raw provider trace、scheduler cadence、worker liveness 和 ledger counter 是诊断面，不覆盖默认 owner delta。

这不是 L5 完成声明。它是 Runway 从 `L4 executable baseline` 走向 L5 运营证据前的结构前置能力：只有经过真实长跑、恢复、跨 agent scaleout、operator repair loop、release/install 和 owner acceptance 证据，才能进入 `L5 production operating maturity`。

## Temporal / Runway / Deployment / Domain 分工

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| Temporal Server / Cloud | workflow history、timer、retry/timeout、task queue、signal/query/update、visibility、replay 和 durable message transport。 | OPL worker process 永久在线、scheduler cadence policy、Progress Reconciler、domain truth、owner receipt、artifact verdict。 |
| Worker supervisor / deployment substrate | worker service 的启动、保活、重启、扩缩容、rolling deployment 和 health check 容器；本地可用 launchd/systemd/Docker Compose，生产形态应使用 Kubernetes/ECS/托管服务等。 | OPL attempt ledger、Temporal workflow truth、scheduler cadence、domain truth 或质量判断。 |
| Scheduler / cadence surface | 按 policy 触发 hydrate/tick/reconcile/repair 机会，提供 missed tick、last success、next due、jitter 和 disabled/paused 状态 refs。 | 保证 worker liveness、执行 stage 内策略、签 receipt、判断 domain progress 或自行 redrive stale route。 |
| Progress Reconciler | 比较 desired/current，选择唯一下一 safe action、等待 owner/human gate、触发 provider repair 或返回 OPL runtime blocker。 | 生成 domain truth、owner receipt、domain typed blocker、quality verdict、artifact body、memory body 或 production-ready 结论。 |
| OPL Runway | Runtime Environment Substrate、Fast Local Env doctor / prepare / run-context、provider readiness、stage execution sandbox provider selection、worker lifecycle/readiness 投影、scheduler/cadence refs、Progress Reconciler、stage-attempt projection、attempt ledger、lease、heartbeat、SLO health、repair action、dead-letter 和 runtime blocker。 | 在没有部署 substrate 的情况下承诺进程永久保活；把 Docker/devcontainer 或 E2B/remote sandbox 写成默认路径；替 domain owner 生成 truth、receipt、typed blocker 或 quality verdict。 |
| Domain agent | owner route、typed blocker、owner receipt、domain artifact、quality/export verdict 和用户交付物 truth。 | provider lifecycle、Temporal worker readiness、queue lease 或 OPL runtime blocker。 |

## 核心对象模型

| 对象 | 作用 | L4 验收要点 |
| --- | --- | --- |
| `runway_profile` | Runway 模块身份、provider policy、默认 scope 和 authority flags。 | `status/inspect/interfaces` 必须可返回 profile、contract refs、forbidden claims。 |
| `provider_binding` | Temporal production provider 或 local diagnostic provider 的显式绑定。 | `doctor` 必须区分 provider not configured、service down、worker not ready 和 scheduler missing。 |
| `stage_attempt_projection` | family-level runnable / waiting / blocked / dead-letter attempt projection。 | `inspect` 必须能从 projection refs 追到 linked attempt、owner route refs 和 blocker。 |
| `stage_attempt` | OPL 可审计执行单元。 | `inspect` 必须能返回 attempt id、domain/stage refs、provider run、lease、closeout binding。 |
| `attempt_lease` | 执行授权、租约、超时和 ownership。 | `validate` 必须发现缺失或过期 lease，不能把 provider completed 写成 stage complete。 |
| `heartbeat` | 长跑活动的 liveness / progress signal。 | `status` 必须展示当前 liveness，不得把 heartbeat 当作 deliverable progress。 |
| `human_gate` | 人类批准、暂停、拒绝或 resume token。 | `doctor` 必须把 waiting approval 投影为 human-owned blocker。 |
| `retry_dead_letter_policy` | 重试预算、失败分类和 dead-letter closeout。 | `inspect` 必须展示 retry budget、dead-letter reason 和 redrive boundary。 |
| `progress_reconciler` | desired/current 对账与唯一下一 safe action 选择。 | `status/doctor` 必须展示 chosen action、discarded candidates、owner/gate requirement 和 false-authority flags。 |
| `runtime_blocker` | provider 层无法进入 domain closeout 的 refs-only blocker。 | `validate/doctor` 必须 fail closed，不能生成 domain typed blocker 或 owner receipt。 |

## Schema / Contract

当前 L4 绑定这些机器 contract：

```text
contracts/opl-framework/runtime-manager-contract.json
contracts/opl-framework/family-runtime-attempt-contract.json
contracts/opl-framework/family-runtime-online-substrate-contract.json
contracts/opl-framework/stage-route-scheduler-contract.json
contracts/opl-framework/current-owner-delta.schema.json
contracts/opl-framework/capability-registry-resolver.schema.json#/$defs/capability_invocation_lifecycle_policy
contracts/opl-framework/managed-runtime-three-layer-contract.json
contracts/opl-framework/brand-module-registry.json#modules.runway
```

Runway contract 的职责是表达 provider、stage-attempt projection、attempt、lease、human gate、retry/dead-letter、authorization、capability invocation hard gate、closeout binding 和 runtime blocker 的 shape。它不表达 domain truth、artifact body、quality verdict、owner receipt body 或 production long-soak 结论。

新增或调整 Runway contract 时必须保持 false-authority boundary：handoff、gate、scheduler、supervisor 和 reconciler 只能传递 refs、typed blocker requirement、owner answer shape、provider/runtime observation 或 repair command；不能伪造 domain truth、owner receipt、quality verdict、artifact readiness、memory accept/reject 或 production-ready verdict。

新增或调整 Temporal-backed activity result 时还必须保持 payload-history boundary：activity 可以读取和处理完整 provider/runtime/dispatch body，但 workflow history result 只能返回 compact receipt、count、status、small identity refs 和 false-authority flags。需要长期保存的大 body 进入 runtime ledger、artifact refs 或 external payload ref；不能把 `provider completed`、`scheduler cadence observed`、`compact receipt written` 或 `history size under limit` 写成 production long-soak 或 L5。

## 模块级 CLI Family

当前 L4 由专属 CLI family 承担，并继续把底层实现委托给 family-runtime/runtime-manager 真实 source，而不是复制第二套 truth。

| 命令 | 验收说明 |
| --- | --- |
| `opl runway status --json` | 返回 Runway profile、provider readiness、stage-attempt projection summary、running/blocked attempt summary、human gate count、runtime blocker summary、source commands 和 forbidden claim flags。 |
| `opl runway inspect --attempt <id> --json` | 返回单个 attempt 的 stage refs、projection refs、provider run、lease、heartbeat、human gate、retry/dead-letter、closeout binding 和 owner boundary。 |
| `opl runway inspect --projection <id> --json` | 从 stage-attempt projection 追踪 linked attempts、owner route refs、source fingerprint、dispatch refs、blocker 或 retry eligibility。 |
| `opl runway interfaces --json` | 返回 CLI command specs、App action ids、read-model keys、descriptor delegates、contract refs、validation commands 和 status docs。 |
| `opl runway validate --json` | 静态验证 registry refs、contract refs、provider binding shape、queue/attempt schema、closeout binding、authority flags 和 forbidden claims。 |
| `opl runway doctor --json` | 运行时诊断 provider service/worker/scheduler、stage-attempt projection health、lease staleness、attempt liveness、human gate、dead-letter 和 repair plan。 |
| `opl runway readiness --json` | 返回 provider/service/worker/scheduler readiness、provider-not-ready reason、repair action 和 false-authority flags。 |
| `opl runway reconcile --json` | 返回 desired/current diff、唯一下一 safe action、owner/gate wait 或 OPL runtime blocker。 |
| `opl runway handoff-gates --json` | 返回 handoff、human gate、owner answer shape 和 closeout binding 的 refs-only gate 状态。 |
| `opl runway recovery-repair --json` | 返回 worker/provider/scheduler/lease/dead-letter repair plan，并把 blocked / failed backlog 拆成 `attempt_repair_queue` 只读查询项；repair command 只作用于 OPL runtime/provider，attempt queue command 只帮助 operator/owner review。 |
| `opl runway control-loop status --json` | 返回 control-loop desired/current/action projection、read-model refs 和 forbidden claim flags。 |

允许复用的底层现有 surface：

```text
opl family-runtime status --json
opl family-runtime attempt list|inspect|query --json
opl family-runtime doctor --json
opl family-runtime provider-slo tick --provider temporal --json
opl runtime app-operator-drilldown --detail full --json
opl brand-modules inspect --module runway --json
```

这些 surface 是 Runway 的 source/delegate。模块级 L4 以 `opl runway status|inspect|interfaces|validate|doctor --json` 和 `brand-module-surfaces.json#modules.runway` 为验收入口，底层 delegate 不能单独替代模块自身读面。

## App Action / Read-Model

当前 L4 给 App 和 operator 提供 Runway 自身读面：

| Surface | 验收说明 |
| --- | --- |
| `app_action:runway_status` | 只读 status action，delegated surface 为 `opl runway status --json`。 |
| `app_action:runway_inspect` | 只读 drilldown action，支持 attempt 或 projection scope。 |
| `app_action:runway_validate` | 结构验证 action，返回 blockers、warnings、checked refs 和 claim authorization flags。 |
| `app_action:runway_doctor` | 运行时 doctor action，返回 provider/projection/lease/human-gate repair plan。 |
| `read_model.runway.provider_readiness` | 当前 provider/service/worker/scheduler readiness，不得写成 production ready。 |
| `read_model.runway.attempt_supervision` | running/blocked/dead-letter attempt 摘要和下一检查命令。 |
| `read_model.runway.capability_invocation_hard_gate` | Capability Invocation OS hard gate 的 refs-only 投影；只说明是否可进入 runtime action、等待 owner/gate 或 fail closed。 |
| `read_model.runway.runtime_blockers` | OPL-owned runtime blocker 列表和 owner route，不替 domain 生成 typed blocker。 |

App read-model 只投影 Runway refs。它不得把 `provider completed`、projection clean、`no open runtime blocker` 写成 domain ready、artifact ready、quality verdict 或 production long-soak complete。

## Validate / Doctor

`validate` 是结构门：

- registry entry、contract refs、CLI specs、App action specs、descriptor delegates 和 status docs 必须齐全。
- stage-attempt projection、attempt、lease、provider binding、human gate、retry/dead-letter 和 runtime blocker schema 必须可被机器验证。
- capability invocation hard gate 必须指回 `current_owner_delta`、Stagecraft policy 和 Pack/resolver lifecycle；Runway 不能把 hard gate 变成 domain authority。
- authority flags 必须全部 false：Runway 不能写 domain truth、artifact body、memory body、owner receipt 或 quality verdict。

`doctor` 是运行时健康门：

- provider service、worker、scheduler、SLO tick、stage-attempt projection index、attempt ledger 和 active lease 必须有当前状态。
- Temporal provider 未配置或未启动时，必须投影为 `provider_not_ready`、`temporal_provider_not_configured` / `temporal_service_unavailable` / `worker_not_ready` / `scheduler_missing` 这类 OPL repair reason；不能写成 domain ready、domain blocker 已关闭或 L5 evidence 已满足。
- Progress Reconciler 必须能解释 desired/current 是否一致、为何选择某个唯一下一 safe action、哪些候选被降为 diagnostic，以及当前等待的是 provider、scheduler、human gate 还是 domain owner。
- 缺 provider attempt、active lease、execution authorization、workspace/artifact scope、source fingerprint 或 closeout binding 时，必须返回 OPL runtime blocker。
- repair plan 只能指向 OPL runtime/provider/projection 修复命令；blocked / failed attempt worklist 只能给出只读查询与 owner review 入口；domain owner 修复必须保留为 owner route 或 typed blocker requirement。

## 测试覆盖

当前 L4 focused tests 覆盖：

- `opl runway status|inspect|interfaces|validate|doctor --json` 的 public help、JSON shape 和 error envelope。
- `opl runway readiness|reconcile|handoff-gates|recovery-repair|control-loop status --json` 的 direct command binding、live control-loop projection、next safe action、attempt repair queue 和 false-authority flags。
- `runway` module registry refs 与 CLI/App/descriptor/validation refs 一致。
- provider not ready、worker not ready、scheduler missing、stale lease、dead-letter 和 human gate fixture。
- App action catalog 中 `runway_*` actions 的 delegated surface 与 read-model keys。
- forbidden claims negative guards：provider completed、projection clean 或 zero blocker 不得授权 domain ready / production ready。
- Capability Invocation OS hard-gate guards：route-required missing ref、owner-route mismatch 或 forbidden write fail closed；Runway 仍不能写 domain truth、owner receipt 或 typed blocker。

## Authority Boundary

| Runway 可以做 | Runway 不可以做 |
| --- | --- |
| 选择和诊断 provider。 | 声明 domain ready、artifact ready、quality ready 或 production ready。 |
| 建立 stage-attempt projection、stage attempt、lease、heartbeat、retry、dead-letter 和 human gate transport。 | 替 MAS/MAG/RCA/OMA 写 domain truth、质量结论、artifact body 或 memory body。 |
| 签发 provider / execution authorization / runtime blocker refs。 | 替 domain owner 签 owner receipt、quality gate receipt 或 domain typed blocker。 |
| 用 Progress Reconciler 选择唯一下一 OPL safe action、等待 owner/gate，或生成 OPL runtime blocker。 | 用 handoff/gate/reconciler 伪造 domain truth、owner receipt、quality verdict 或 production ready。 |
| 投影 Capability Invocation hard gate，并在缺 route-required ref、owner route mismatch 或 forbidden write 时 fail closed。 | 把 hard gate 通过写成 domain ready、owner answer、domain typed blocker 或 stage complete。 |
| 把 provider state 投影给 CLI、App、descriptor delegate 和 evidence-worklist。 | 把 provider completed、projection clean、scheduler cadence observed 或 read-model closed 写成 stage complete。 |

## Forbidden Claims

- 不创建 domain owner receipt。
- 不把 provider completed 当成 domain ready。
- 不保存 artifact/memory body。
- 不让 domain repo 重建私有 daemon、queue、attempt ledger 或 scheduler。
- 不把 Temporal service reachable、workflow history available 或 provider refs available 写成 worker process 永久在线。
- 不把 Temporal provider ready 写成 production long-soak complete。
- 不把 SLO watchdog 写成 worker supervisor、domain progress 或 production long-soak。
- 不把 LaunchAgent / 300 秒 cadence 写成 production topology；它只可作为 local/small-install fallback 或 diagnostic。
- 不把 local provider 写成 Full online readiness 替代品。
- 不把 runtime blocker 写成 domain typed blocker。
- 不把 App/operator safe action 写成用户交付物进展。
- 不把 scheduler cadence 写成 worker liveness、domain progress 或 owner answer。
- 不把 worker supervisor healthy 写成 Temporal workflow healthy、stage complete 或 Runway 已达 L5。
- 不把 compact Temporal activity receipt、workflow history size under limit 或 scheduler cadence activity completed 写成 production long-soak、domain progress、Runway L5 或 production ready。
- 不把 Progress Reconciler chosen action 写成 domain owner receipt、quality verdict、artifact ready 或 production ready。
- 不把 Capability Invocation hard gate 写成 domain owner receipt、domain typed blocker、owner answer、quality verdict、artifact ready 或 production ready。
- 不让 handoff/gate payload 携带 refs 和 typed blocker / owner answer shape 以外的伪 truth。
