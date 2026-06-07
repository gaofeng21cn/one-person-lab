# OPL Runway

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态与 L4 验收说明。机器真相继续归 runtime contracts、provider state、queue/attempt ledger、CLI/API 行为、provider receipts、App read-model 和测试输出。

## 品牌定位

`OPL Runway` 是 OPL 的长跑执行与恢复模块。它把 stage attempt 放进 durable runtime，负责启动、lease、heartbeat、retry、dead-letter、resume、human gate、provider status 和 worker lifecycle/readiness projection。

一句话：`Runway` 管“任务怎么持续跑、怎么恢复、怎么知道现在停在哪里”。

## 真实 L4 口径

- Desired/current reconciliation：domain owner 声明目标、下一步或 typed blocker，Runway 只负责把可执行部分投影成可恢复 attempt，并持续对账 current state。
- Durable execution：Temporal-backed provider 是 production online substrate；Temporal 负责 workflow history、task queue、signal/query、retry、timeout、timer 和 replay，worker process/service 的启动、保活、重启、版本与依赖 readiness 由 Runway worker lifecycle surface 和部署 substrate 承担。
- Worker lifecycle supervision：Runway 必须投影 service/worker readiness、managed process/crash diagnostic、poll/heartbeat、SLO health 和 repair action；SLO watchdog 只是 health check / repair trigger，不替代 worker supervisor。
- Progress-first supervision：Runway 读面默认回答“当前是否在跑、卡在哪里、下一 owner 是谁”，不把 provider 运维动作抢成 domain 交付进展。
- Fail-closed authority：缺 provider attempt、active lease、execution authorization、workspace/artifact scope、source fingerprint 或 closeout binding 时，Runway 只能返回 OPL runtime blocker。
- Module-owned surface：`contracts/opl-framework/brand-module-surfaces.json#modules.runway` 与 `opl runway status|inspect|interfaces|validate|doctor --json` 是 Runway 自身 L4 验收入口；`opl brand-modules ...` 只作为聚合目录。

## Temporal / Runway / Deployment / Domain 分工

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| Temporal Server / Cloud | workflow history、timer、retry/timeout、task queue、signal/query/update、visibility 和 replay。 | OPL worker process 永久在线、domain truth、owner receipt、artifact verdict。 |
| OPL Runway | provider readiness、worker lifecycle/readiness 投影、typed queue、attempt ledger、lease、heartbeat、SLO health、repair action、dead-letter 和 runtime blocker。 | 在没有部署 substrate 的情况下承诺进程永久保活；替 domain owner 生成 truth、receipt 或 quality verdict。 |
| Deployment substrate | worker service 的启动、保活、重启、扩缩容、rolling deployment 和 health check 容器；本地可用 launchd/systemd/Docker Compose，生产形态应使用 Kubernetes/ECS/托管服务等。 | OPL attempt ledger、Temporal workflow truth、domain truth 或质量判断。 |
| Domain agent | owner route、typed blocker、owner receipt、domain artifact、quality/export verdict 和用户交付物 truth。 | provider lifecycle、Temporal worker readiness、queue lease 或 OPL runtime blocker。 |

## 核心对象模型

| 对象 | 作用 | L4 验收要点 |
| --- | --- | --- |
| `runway_profile` | Runway 模块身份、provider policy、默认 scope 和 authority flags。 | `status/inspect/interfaces` 必须可返回 profile、contract refs、forbidden claims。 |
| `provider_binding` | Temporal production provider 或 local diagnostic provider 的显式绑定。 | `doctor` 必须区分 provider not configured、service down、worker not ready 和 scheduler missing。 |
| `typed_family_queue` | family-level runnable / waiting / blocked / dead-letter task。 | `inspect` 必须能从 queue task 追到 linked attempt、owner route refs 和 blocker。 |
| `stage_attempt` | OPL 可审计执行单元。 | `inspect` 必须能返回 attempt id、domain/stage refs、provider run、lease、closeout binding。 |
| `attempt_lease` | 执行授权、租约、超时和 ownership。 | `validate` 必须发现缺失或过期 lease，不能把 provider completed 写成 stage complete。 |
| `heartbeat` | 长跑活动的 liveness / progress signal。 | `status` 必须展示当前 liveness，不得把 heartbeat 当作 deliverable progress。 |
| `human_gate` | 人类批准、暂停、拒绝或 resume token。 | `doctor` 必须把 waiting approval 投影为 human-owned blocker。 |
| `retry_dead_letter_policy` | 重试预算、失败分类和 dead-letter closeout。 | `inspect` 必须展示 retry budget、dead-letter reason 和 redrive boundary。 |
| `runtime_blocker` | provider 层无法进入 domain closeout 的 refs-only blocker。 | `validate/doctor` 必须 fail closed，不能生成 domain typed blocker 或 owner receipt。 |

## Schema / Contract

真实 L4 至少绑定这些机器 contract：

```text
contracts/opl-framework/runtime-manager-contract.json
contracts/opl-framework/family-runtime-attempt-contract.json
contracts/opl-framework/family-runtime-online-substrate-contract.json
contracts/opl-framework/stage-route-scheduler-contract.json
contracts/opl-framework/managed-runtime-three-layer-contract.json
contracts/opl-framework/brand-module-registry.json#modules.runway
```

Runway contract 的职责是表达 provider、queue、attempt、lease、human gate、retry/dead-letter、authorization、closeout binding 和 runtime blocker 的 shape。它不表达 domain truth、artifact body、quality verdict、owner receipt body 或 production long-soak 结论。

## 模块级 CLI Family

真实 L4 必须有专属 CLI family，并继续把底层实现委托给 family-runtime/runtime-manager 真实 source，而不是复制第二套 truth。

| 命令 | 验收说明 |
| --- | --- |
| `opl runway status --json` | 返回 Runway profile、provider readiness、queue summary、running/blocked attempt summary、human gate count、runtime blocker summary、source commands 和 forbidden claim flags。 |
| `opl runway inspect --attempt <id> --json` | 返回单个 attempt 的 stage refs、queue task、provider run、lease、heartbeat、human gate、retry/dead-letter、closeout binding 和 owner boundary。 |
| `opl runway inspect --queue-task <id> --json` | 从 queue task 追踪 linked attempts、owner route refs、source fingerprint、dispatch refs、blocker 或 redrive eligibility。 |
| `opl runway interfaces --json` | 返回 CLI command specs、App action ids、read-model keys、descriptor delegates、contract refs、validation commands 和 status docs。 |
| `opl runway validate --json` | 静态验证 registry refs、contract refs、provider binding shape、queue/attempt schema、closeout binding、authority flags 和 forbidden claims。 |
| `opl runway doctor --json` | 运行时诊断 provider service/worker/scheduler、queue health、lease staleness、attempt liveness、human gate、dead-letter 和 repair plan。 |

允许复用的底层现有 surface：

```text
opl family-runtime status --json
opl family-runtime queue list --json
opl family-runtime attempt list|inspect|query --json
opl family-runtime doctor --json
opl family-runtime provider-slo tick --provider temporal --json
opl runtime app-operator-drilldown --detail full --json
opl brand-modules inspect --module runway --json
```

这些 surface 是 Runway 的 source/delegate，不足以单独构成真实 L4；真实 L4 需要 `opl runway status|inspect|interfaces|validate|doctor` 成为用户和 App 可消费的模块级入口。

## App Action / Read-Model

真实 L4 必须给 App 和 operator 提供 Runway 自身读面：

| Surface | 验收说明 |
| --- | --- |
| `app_action:runway_status` | 只读 status action，delegated surface 为 `opl runway status --json`。 |
| `app_action:runway_inspect` | 只读 drilldown action，支持 attempt 或 queue task scope。 |
| `app_action:runway_validate` | 结构验证 action，返回 blockers、warnings、checked refs 和 claim authorization flags。 |
| `app_action:runway_doctor` | 运行时 doctor action，返回 provider/queue/lease/human-gate repair plan。 |
| `read_model.runway.provider_readiness` | 当前 provider/service/worker/scheduler readiness，不得写成 production ready。 |
| `read_model.runway.attempt_supervision` | running/blocked/dead-letter attempt 摘要和下一检查命令。 |
| `read_model.runway.runtime_blockers` | OPL-owned runtime blocker 列表和 owner route，不替 domain 生成 typed blocker。 |

App read-model 只投影 Runway refs。它不得把 `provider completed`、`queue succeeded`、`no open runtime blocker` 写成 domain ready、artifact ready、quality verdict 或 production long-soak complete。

## Validate / Doctor

`validate` 是结构门：

- registry entry、contract refs、CLI specs、App action specs、descriptor delegates 和 status docs 必须齐全。
- queue、attempt、lease、provider binding、human gate、retry/dead-letter 和 runtime blocker schema 必须可被机器验证。
- authority flags 必须全部 false：Runway 不能写 domain truth、artifact body、memory body、owner receipt 或 quality verdict。

`doctor` 是运行时健康门：

- provider service、worker、scheduler、SLO tick、queue database、attempt ledger 和 active lease 必须有当前状态。
- 缺 provider attempt、active lease、execution authorization、workspace/artifact scope、source fingerprint 或 closeout binding 时，必须返回 OPL runtime blocker。
- repair plan 只能指向 OPL runtime/provider/queue 修复命令；domain owner 修复必须保留为 owner route 或 typed blocker requirement。

## 测试覆盖

真实 L4 至少需要 focused tests 覆盖：

- `opl runway status|inspect|interfaces|validate|doctor --json` 的 public help、JSON shape 和 error envelope。
- `runway` module registry refs 与 CLI/App/descriptor/validation refs 一致。
- provider not ready、worker not ready、scheduler missing、stale lease、dead-letter 和 human gate fixture。
- App action catalog 中 `runway_*` actions 的 delegated surface 与 read-model keys。
- forbidden claims negative guards：provider completed、queue succeeded 或 zero blocker 不得授权 domain ready / production ready。

## Authority Boundary

| Runway 可以做 | Runway 不可以做 |
| --- | --- |
| 选择和诊断 provider。 | 声明 domain ready、artifact ready、quality ready 或 production ready。 |
| 建立 typed queue、stage attempt、lease、heartbeat、retry、dead-letter 和 human gate transport。 | 替 MAS/MAG/RCA/OMA 写 domain truth、质量结论、artifact body 或 memory body。 |
| 签发 provider / execution authorization / runtime blocker refs。 | 替 domain owner 签 owner receipt、quality gate receipt 或 domain typed blocker。 |
| 把 provider state 投影给 CLI、App、descriptor delegate 和 evidence-worklist。 | 把 provider completed、queue succeeded 或 read-model closed 写成 stage complete。 |

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
