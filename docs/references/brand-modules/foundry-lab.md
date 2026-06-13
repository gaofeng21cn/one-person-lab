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
| `foundry_series` | 同一 Agent family 的 scaffold、evaluation、work-order、canary、promotion/rollback 生命周期。 |
| `evaluation_run` | 对 descriptor、stage、receipt、tool boundary、App projection 的评估。 |
| `improvement_candidate` | 机制改进候选、预期影响、风险层级。 |
| `developer_work_order` | 可执行 patch work order、验证命令、禁止范围和 owner closeout。 |
| `rho_backend_plan` | RHO no-apply sidecar 的候选计划面，只产出 trajectory digest、diagnosis、candidate harness、self-preference score、winner、candidate diff、work-order draft 和 promotion evidence refs。 |
| `dynamic_workflow_template` | Foundry Lab suite topology / verifier / work-order draft refs 的动态模板 catalog。 |
| `canary_ref` | 小范围真实或 controlled canary 证据。 |
| `promotion_receipt` | risk-tier promotion / rollback / no-regression refs。 |
| `target_agent_handoff` | 给目标 agent/domain owner 的交接。 |
| `owner_acceptance_ref` | target domain owner 的独立采纳/拒绝 refs；Foundry Lab 只能引用，不能签发。 |

Workspace 级 L4 的 Foundry Lab 对象模型必须像 Workspace 一样有自己的 schema、CLI、App/read-model、validate/doctor、测试和状态折返。最低模型如下：

| 对象 | L4 验收含义 |
| --- | --- |
| `foundry_lab_read_model` | Agent scaffold/readiness/conformance/work-order/canary/promotion 的 refs-only summary，供 App developer surface 和 Console drilldown 消费。 |
| `foundry_lab_interface_bundle` | `status`、`inspect`、`interfaces`、`validate`、`doctor` 的 CLI 与 descriptor shape。 |
| `foundry_lab_validation_report` | skeleton、domain pack compiler、guardrail tier、work-order receipt、promotion receipt 和 forbidden claims 的机器检查结果。 |
| `foundry_lab_doctor_report` | scaffold 缺口、conformance drift、测试缺口、canary 缺口、promotion gate 缺口和 owner acceptance pending。 |
| `target_owner_handoff` | 给 MAS/MAG/RCA/OMA 等目标 owner 的 refs-only handoff，不包含 domain verdict。 |

## Workspace 级 L4 验收 refs

| 层面 | 目标 refs |
| --- | --- |
| `schema / contract` | `contracts/opl-framework/agent-lab-contract.json`、`contracts/opl-framework/foundry-agent-series-contract.json`、`contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`contracts/opl-framework/domain-pack-compiler-contract.json`、`contracts/opl-framework/guardrail-tier-policy.json`。 |
| `CLI family` | `opl foundry-lab status --json`、`opl foundry-lab inspect --json`、`opl foundry-lab interfaces --json`、`opl foundry-lab validate --json`、`opl foundry-lab doctor --json`。 |
| `current delegate CLI` | `opl agents scaffold --json`、`opl agents conformance --family-defaults --json`、`opl agents readiness --family-defaults --json`、`opl agents default-callers --family-defaults --json`、`opl brand-modules inspect --module foundry-lab --json`。 |
| `App action / read-model` | Developer surface 的 Agent Lab entry、work-order review、canary evidence、promotion/rollback decision、target-agent handoff；当前 registry refs 为 `opl app state --profile full --json#developer_mode` 和 `opl brand-modules interfaces --json#app.descriptors.brand_modules_inspect`。 |
| `descriptor` | agent blueprint descriptor、evaluation report descriptor、developer work order descriptor、promotion receipt descriptor、target owner handoff descriptor。 |
| `validation / doctor` | `opl foundry-lab validate --json` 检查 skeleton/conformance/readiness/work-order/promotion contract；`opl foundry-lab doctor --json` 报告缺 scaffold、缺 tests、缺 canary、缺 owner gate 或 target repo handoff gap。 |
| `tests` | CLI public spec、agent scaffold fixture、conformance/readiness regression、work-order receipt fixture、promotion/rollback negative authority、owner-acceptance-not-claimed guard。 |
| `status` | `docs/status.md`、`docs/runtime/opl-agent-lab-control-plane.md`、`docs/references/brand-modules/current-maturity-against-workspace.md`、target repo owner closeout refs。 |
| `dynamic workflow template` | `src/agent-lab-workflow-templates.ts`、`opl agent-lab workflow-template --json`、`tests/src/cli/cases/agent-lab.test.ts`。 |

## 接口与文档

模块级 CLI family 验收入口：

```text
opl foundry-lab status --json
opl foundry-lab inspect --detail full --json
opl foundry-lab interfaces --json
opl foundry-lab validate --json
opl foundry-lab doctor --json
```

现有 delegate / source-of-truth 入口：

```text
opl brand-modules inspect --module foundry-lab --json
opl agents foundry status --json
opl agents foundry peers --json
opl agents scaffold --json
opl agents conformance --family-defaults --json
opl agents readiness --family-defaults --json
opl agents default-callers --family-defaults --json
opl agent-lab rho --project <target-agent-dir> --json
opl agent-lab workflow-template --json
opl work-order execute --work-order <file> --json
```

Foundry Agent series 的普通 CLI spine 是 `workspace / work / stage / run / vault / handoff / connect`。OPL brand modules 继续作为 framework taxonomy；`runtime`、`family-runtime`、`index`、`stage-artifact`、`skill/module/packages/engine` 等旧实现桶不再作为 Foundry Agent 用户 command surface。

## Dynamic workflow template

Foundry Lab 的 dynamic workflow template 是 Agent Lab 机器面的 refs-only catalog。它把常见 agent improvement 拓扑固定为可审计模板：`classify_and_act`、`fan_out_and_synthesize`、`adversarial_verification`、`generate_and_filter`、`tournament`、`loop_until_done`、`model_routing`、`worktree_isolation`。

这些模板只能产生 `suite_topology_ref`、`verifier_ref` 和 `work_order_draft_ref`。它们用于描述“怎样组织一次评估、验证或 patch work order 草稿”，不用于编译普通用户 workflow，不定义 runtime substrate，不替代 Runway / Temporal / family-runtime，也不能签发 domain truth、quality verdict 或 owner receipt。

机器入口是 `opl agent-lab workflow-template --json`。该输出可以被 App developer surface、OMA 和 operator drilldown 消费为 Foundry Lab template catalog；consumer 需要继续从 target repo verification、domain-owned proof 和 owner receipt refs 判断后续闭合，不能把 template catalog 本身当成 adoption、promotion 或 readiness 证据。

理想文档：

```text
docs/references/brand-modules/foundry-lab.md
docs/runtime/opl-agent-lab-control-plane.md
contracts/opl-framework/agent-lab-contract.json
contracts/opl-framework/standard-domain-agent-skeleton-contract.json
```

## 模块级 CLI 验收说明

- `status`：返回 foundry series、scaffold readiness、conformance/readiness summary、open work orders、canary/promotion refs 和 owner acceptance pending refs。
- `inspect`：返回对象模型、contract refs、target agent handoff refs、descriptor refs、forbidden claims 和与 `opl agents *` delegate 的 mapping。
- `interfaces`：输出 Agent Lab App developer surface、work-order review payload、canary evidence descriptor、promotion/rollback descriptor 和 target-owner handoff schema。
- `validate`：fail closed 检查 agent-lab contract、foundry series contract、standard skeleton、domain pack compiler、guardrail tier、work-order/promotion receipts 和 false authority flags。
- `doctor`：定位 scaffold drift、descriptor drift、缺测试、缺 canary、promotion gate 不足、target repo 不可达或 owner acceptance pending；输出只能是 Foundry Lab 诊断或 handoff，不能升级成 domain acceptance。

## Authority boundary

- Foundry Lab 持有 agent blueprint、evaluation、developer work order、canary 和 promotion/rollback 的改进循环边界。
- RHO backend 第一版只作为 no-apply sidecar/read-model：它可以生成 candidate refs、candidate diff refs、work-order draft refs 和 promotion evidence refs；不能写 target repo、不能直接 apply、不能作为 runtime substrate、truth source、domain owner、owner receipt 或 default promotion authority。
- Target domain owner 持有 domain truth、owner receipt、artifact authority、domain quality verdict 和最终 adoption/rollback 裁决。
- OPL Meta Agent 可作为 builder/tester module 提供 work order 和测试接管能力，但不成为 OPL Framework 或目标 domain 的 truth owner。
- Console、Atlas 和 Vault 只能消费 Foundry Lab 输出的 descriptor、receipt 或 refs，不从 Lab 推导 domain ready。

## Forbidden claims

- 不替 domain owner 签 receipt。
- 不把 eval pass 写成 production ready。
- 不直接删除 target repo surface；删除仍需 owner gate / no-active-caller / tombstone。
- 不把 OMA 变成第二 OPL Framework。
- 不把 canary 通过写成全量 rollout 通过。
- 不把 developer work order 完成写成 owner 已接受。
- 不把 Foundry Lab promotion 写成 target domain owner acceptance。
- 不把 RHO winner、self-preference score、candidate diff 或 work-order draft 写成 runtime substrate、domain truth、owner receipt、direct apply 或 default promotion。

## L4 structural baseline 成功标准

- `opl foundry-lab status|inspect|interfaces|validate|doctor` 与 `opl agents scaffold|conformance|readiness|default-callers` 从同一 Agent Lab / series / skeleton contracts 派生。
- Foundry Lab 有自己的 foundry series、read-model、interface bundle、validate gate 和 doctor report，不只依赖 `brand-module-registry` 说明。
- 新 Agent 能从 blueprint/scaffold 进入 standard skeleton；失败能转成 work order、canary、rollback、typed blocker 或 target-owner handoff。
- 改进 loop 有独立 reviewer/no-regression refs，tests 覆盖 scaffold、conformance/readiness、promotion/rollback 和 forbidden owner-acceptance claim。
- Foundry Lab 输出能被 Console 和 Atlas 消费，但不污染 domain authority。
- 每次 promotion/rollback 都能指向 risk tier、证据 refs、owner gate、owner acceptance pending 和残余风险。
