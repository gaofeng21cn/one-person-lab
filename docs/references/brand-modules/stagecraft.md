# OPL Stagecraft

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 stage contracts、domain stage packs、source、CLI/API 行为、runtime receipt 和 domain-owned quality gates。

## 品牌定位

`OPL Stagecraft` 是 OPL 的 stage 设计与认知计算模块。它定义一个复杂知识工作阶段应该怎样被描述、启动、审核、交接和关闭。

一句话：`Stagecraft` 管“每个 stage 要做什么、可用什么工具和知识、怎么证明可以进入下一步”。

## 设计理念

- Stage 是专家工作单元，不是脚本节点。
- Tool catalog 是 affordance catalog，不是 workflow script。
- AI-first：规划、创作、评审、路线判断和修订由 selected executor 完成。
- Contract-light：合同只固定目标、refs、owner、scope、authority boundary、quality gate 和 receipt 下限。
- Quality gate 独立：执行 attempt 与 reviewer / auditor attempt 分离。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `stage_pack` | stage goal、inputs、outputs、owner、scope、quality gate 和 strategy refs。 |
| `stage_strategy_refs` | prompt、skill、tool、knowledge、rubric、reviewer refs。 |
| `tool_affordance_boundary` | capability、permission、credential、write scope、side-effect risk、forbidden authority。 |
| `stage_admission` | launch 前的 static / runtime / domain-owned boundary check。 |
| `quality_gate_receipt` | 独立 gate attempt 输出的 review / route-back / typed blocker ref。 |
| `handoff_envelope` | 下游 stage 或 owner 所需的显式输入。 |
| `route_back_ref` | 质量、证据、source 或 artifact 缺口回退到前序 owner。 |

## 接口与文档

理想接口：

```text
opl stages readiness --family-defaults --json
opl stages readiness --domain <domain> --json
opl stages graph --domain <domain> --json
opl stages proof-bundle --domain <domain> --json
opl stage validate --stage-folder <path> --json
```

理想文档：

```text
docs/references/brand-modules/stagecraft.md
contracts/opl-framework/cognitive-computation-kernel.json
contracts/family-orchestration/family-stage-control-plane.schema.json
contracts/family-orchestration/family-stage-admission.schema.json
```

## 不做什么

- 不规定工具调用顺序。
- 不把 readiness / scorecard / schema completeness 升级成 domain verdict。
- 不让同一 executor attempt 在同一上下文中自审并关闭质量门。
- 不把 route reconciler 写成 planner 或 reviewer。

## 成功标准

- 每个 Foundry Agent 都能用同一 stage pack shape 描述 domain 工作。
- Stage 内 AI 自主性和 authority boundary 同时清楚。
- 缺少 source/artifact/workspace scope、owner、quality gate 或 forbidden-write guard 时 fail closed。
- Reviewer receipt / typed blocker / route-back 是进入下一 stage 的真实依据。

