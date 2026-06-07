# OPL Runway

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 runtime contracts、provider state、queue/attempt ledger、CLI/API 行为和 provider receipts。

## 品牌定位

`OPL Runway` 是 OPL 的长跑执行与恢复模块。它把 stage attempt 放进 durable runtime，负责启动、lease、heartbeat、retry、dead-letter、resume、human gate 和 provider status。

一句话：`Runway` 管“任务怎么持续跑、怎么恢复、怎么知道现在停在哪里”。

## 设计理念

Kubernetes Operator pattern 的启发是 desired/current reconciliation；Temporal 的启发是 durable execution 和 crash-proof history。OPL Runway 应吸收这两点：domain owner 声明目标和下一步，Runway 负责把它变成可恢复 attempt，并持续对账 current state。

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

## 接口与文档

理想接口：

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

## 不做什么

- 不创建 domain owner receipt。
- 不把 provider completed 当成 domain ready。
- 不保存 artifact/memory body。
- 不让 domain repo 重建私有 daemon、queue、attempt ledger 或 scheduler。

## 成功标准

- 长跑任务可以被查询、恢复、重试、暂停、dead-letter。
- App/operator 能看到当前 owner、attempt state、runtime blocker 和 repair route。
- Temporal-backed provider 是 production online substrate；local provider 只用于 dev/CI/offline diagnostic。
- Provider state 与 owner delta 不冲突；冲突时 fail closed。

