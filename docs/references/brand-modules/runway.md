# OPL Runway

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 runtime contracts、provider state、queue/attempt ledger、CLI/API 行为和 provider receipts。

## 品牌定位

`OPL Runway` 是 OPL 的长跑执行与恢复模块。它把 stage attempt 放进 durable runtime，负责启动、lease、heartbeat、retry、dead-letter、resume、human gate、provider status 和 worker lifecycle/readiness projection。

一句话：`Runway` 管“任务怎么持续跑、怎么恢复、怎么知道现在停在哪里”。

## 设计理念

- Desired/current reconciliation：domain owner 声明目标、下一步或 typed blocker，Runway 只负责把可执行部分投影成可恢复 attempt，并持续对账 current state。
- Durable execution：Temporal-backed provider 是 production online substrate；Temporal 负责 workflow history、task queue、signal/query、retry、timeout、timer 和 replay，worker process/service 的启动、保活、重启、版本与依赖 readiness 由 Runway worker lifecycle surface 和部署 substrate 承担。
- Worker lifecycle supervision：Runway 必须投影 service/worker readiness、managed process/crash diagnostic、poll/heartbeat、SLO health 和 repair action；SLO watchdog 只是 health check / repair trigger，不替代 worker supervisor。
- Progress-first supervision：Runway 读面默认回答“当前是否在跑、卡在哪里、下一 owner 是谁”，不把 provider 运维动作抢成 domain 交付进展。
- Fail-closed authority：缺 provider attempt、active lease、execution authorization、workspace/artifact scope、source fingerprint 或 closeout binding 时，Runway 只能返回 OPL runtime blocker。

## Temporal / Runway / Deployment / Domain 分工

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| Temporal Server / Cloud | workflow history、timer、retry/timeout、task queue、signal/query/update、visibility 和 replay。 | OPL worker process 永久在线、domain truth、owner receipt、artifact verdict。 |
| OPL Runway | provider readiness、worker lifecycle/readiness 投影、typed queue、attempt ledger、lease、heartbeat、SLO health、repair action、dead-letter 和 runtime blocker。 | 在没有部署 substrate 的情况下承诺进程永久保活；替 domain owner 生成 truth、receipt 或 quality verdict。 |
| Deployment substrate | worker service 的启动、保活、重启、扩缩容、rolling deployment 和 health check 容器；本地可用 launchd/systemd/Docker Compose，生产形态应使用 Kubernetes/ECS/托管服务等。 | OPL attempt ledger、Temporal workflow truth、domain truth 或质量判断。 |
| Domain agent | owner route、typed blocker、owner receipt、domain artifact、quality/export verdict 和用户交付物 truth。 | provider lifecycle、Temporal worker readiness、queue lease 或 OPL runtime blocker。 |

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `typed_family_queue` | family-level runnable / waiting / blocked / dead-letter task。 |
| `stage_attempt` | OPL 可审计执行单元。 |
| `provider_run` | Temporal / local diagnostic provider 的运行记录。 |
| `attempt_lease` | 执行授权、租约、超时和 ownership。 |
| `heartbeat` | 长跑活动的 liveness / progress signal。 |
| `human_gate` | 人类批准、暂停、拒绝或 resume token。 |
| `retry_dead_letter_policy` | 重试预算、失败分类和 dead-letter closeout。 |
| `runtime_blocker` | provider 层无法进入 domain closeout 的 refs-only blocker。 |

## 结构基线与引用

| 维度 | L4 structural baseline |
| --- | --- |
| 合同 refs | `contracts/opl-framework/runtime-manager-contract.json`、`contracts/opl-framework/family-runtime-online-substrate-contract.json`、`contracts/opl-framework/family-runtime-attempt-contract.json`、`contracts/opl-framework/stage-run-kernel-contract.json`。 |
| CLI refs | `opl brand-modules inspect --module runway --json`、`opl family-runtime status --json`、`opl family-runtime queue list --json`、`opl family-runtime attempt query <stage_attempt_id> --json`、`opl family-runtime scheduler status --provider temporal --json`、`opl family-runtime provider-slo tick --provider temporal --json`。 |
| App refs | App/operator drilldown、current-control state、safe-action execution bridge、StageRun cockpit、provider health / SLO / scheduler drilldown。 |
| Descriptor / delegate refs | Domain descriptor 的 stage、executor binding、runtime assumptions、owner route refs、workspace locator 和 generated interface delegates；Runway 只消费这些 refs，不定义 domain truth。 |
| Validation refs | `opl framework readiness --family-defaults --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`、`opl runtime app-operator-drilldown --json`、stage attempt admission / closeout binding validation。 |
| Status refs | provider service / worker / scheduler status、attempt ledger、queue ledger、stage progress projection、current owner delta、runtime blocker projection。 |
| 文档 refs | `docs/references/brand-modules/runway.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`、`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`、`docs/invariants.md`。 |

理想品牌入口：

```text
opl family-runtime status --json
opl family-runtime queue list --json
opl family-runtime attempt query --attempt <id> --json
opl runtime manager doctor --json
opl runtime manager repair --json
opl runtime stage-run-authorization record|verify|list
```

理想文档：

```text
docs/references/brand-modules/runway.md
docs/runtime/opl-runtime-naming-and-boundary-contract.md
contracts/opl-framework/runtime-manager-contract.json
contracts/opl-framework/family-runtime-online-substrate-contract.json
contracts/opl-framework/family-runtime-attempt-contract.json
```

## Authority Boundary

| Runway 可以做 | Runway 不可以做 |
| --- | --- |
| 选择和诊断 provider。 | 声明 domain ready、artifact ready、quality ready 或 production ready。 |
| 建立 typed queue、stage attempt、lease、heartbeat、retry、dead-letter 和 human gate transport。 | 替 MAS/MAG/RCA 写 domain truth、质量结论、artifact body 或 memory body。 |
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

## L4 Structural Baseline 成功标准

- 品牌边界清楚：`Runway` 只承接 durable run、provider supervision、attempt recovery 和 runtime blocker。
- 合同边界清楚：provider、queue、attempt、authorization、closeout binding、human gate 和 retry/dead-letter 都有 contract / ledger ref。
- 多 surface 同源：CLI、App/operator、descriptor delegates、evidence-worklist 和 framework readiness 都从同一 runtime / attempt / provider refs 派生。
- 可验证：长跑任务可以被查询、恢复、重试、暂停、human-gate、dead-letter，并能通过 doctor/readiness/worklist 暴露缺口。
- Authority fail-closed：provider state 与 owner delta 冲突时阻断为 OPL runtime blocker，不生成 domain receipt 或 ready claim。
