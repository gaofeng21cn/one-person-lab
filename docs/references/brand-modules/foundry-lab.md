# OPL Foundry Lab

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 Agent Lab contracts、work-order execution receipts、target repo evidence、domain-owned manifests 和 CLI/API 行为。

## 品牌定位

`OPL Foundry Lab` 是 OPL 的 Agent 创建、测试接管和自改进模块。它把经验、失败、canary、review、patch work order 和 promotion/rollback 组织成可审计的 agent improvement loop。

一句话：`Foundry Lab` 管“怎么创建新 Agent、怎么测试它、怎么根据证据改进它”。

## 设计理念

- Lab 不接管 domain truth：它只组织 evidence、root cause、candidate fix、risk tier 和 follow-up projection。
- Patch work order 是交付物：改代码必须变成 owner-gated developer work order。
- Promotion 风险分级：低风险可自动推广，中高风险需要 reviewer、canary 或 owner gate。
- OPL Meta Agent 是 builder/tester module，不是 MAS/MAG/RCA 的 truth owner。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `agent_blueprint` | 新 Foundry Agent 的 domain pack / stage skeleton / authority boundary 蓝图。 |
| `evaluation_run` | 对 descriptor、stage、receipt、tool boundary、App projection 的评估。 |
| `improvement_candidate` | 机制改进候选、预期影响、风险层级。 |
| `developer_work_order` | 可执行 patch work order、验证命令、禁止范围和 owner closeout。 |
| `canary_ref` | 小范围真实或 controlled canary 证据。 |
| `promotion_receipt` | risk-tier promotion / rollback / no-regression refs。 |
| `target_agent_handoff` | 给目标 agent/domain owner 的交接。 |

## 接口与文档

理想接口：

```text
opl agent-lab evaluate --agent <id> --json
opl agent-lab propose --agent <id> --json
opl work-order execute --work-order <file> --json
opl agent-lab risk-tier-promotion record|verify|list
opl agents scaffold --agent <id> --json
```

理想文档：

```text
docs/references/brand-modules/foundry-lab.md
docs/runtime/opl-agent-lab-control-plane.md
contracts/opl-framework/agent-lab-contract.json
contracts/opl-framework/standard-domain-agent-skeleton-contract.json
```

## 不做什么

- 不替 domain owner 签 receipt。
- 不把 eval pass 写成 production ready。
- 不直接删除 target repo surface；删除仍需 owner gate / no-active-caller / tombstone。
- 不把 OMA 变成第二 OPL Framework。

## 成功标准

- 新 Agent 能从 blueprint/scaffold 进入 standard skeleton。
- 失败能转成 work order、canary、rollback 或 typed blocker。
- 改进 loop 有独立 reviewer/no-regression refs。
- Foundry Lab 输出能被 Console 和 Atlas 消费，但不污染 domain authority。

