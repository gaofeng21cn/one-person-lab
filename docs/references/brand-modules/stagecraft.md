# OPL Stagecraft

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态与 L4/L5 边界说明。机器真相继续归 stage contracts、domain stage packs、source、CLI/API 行为、runtime receipt、domain-owned quality gates、App read-model 和测试输出。
Currentness policy: 本文不冻结 Stagecraft L4 状态、readiness projection、gate refs、receipt refs、quality gate closure、App projection 或 production maturity。当前 Stagecraft 结构状态必须从 fresh `opl stagecraft status|validate|doctor --json`、stage contracts、domain stage packs、source/tests、runtime receipts 和 domain owner surfaces 读取。

## 品牌定位

`OPL Stagecraft` 是 OPL 的 stage 设计与认知计算模块。它定义一个复杂知识工作阶段应该怎样被描述、启动、审核、交接和关闭。

一句话：`Stagecraft` 管“每个 stage 要做什么、可用什么工具和知识、怎么证明可以进入下一步”。

## 当前 L4 / L5 口径

Fresh readback can support reading `Stagecraft` as Workspace 级 `L4_structural_baseline`。判断 SSOT 不是 registry 文案本身，而是 `contracts/opl-framework/brand-module-surfaces.json#modules.stagecraft`、`opl stagecraft status|inspect|interfaces|validate|doctor --json`、App action/read-model refs、focused tests 和 [完成度对照](./current-maturity-against-workspace.md) 的组合。

该声明只覆盖结构完成度：Stagecraft 有独立对象模型、schema/contract、模块级 CLI family、App/operator projection、validate/doctor、测试和状态文档。它不表示 quality gate 已全部真实闭合，不表示 domain owner 已签收，也不表示 durable runtime、artifact authority、quality verdict、domain ready 或 production ready。`L5 production operating maturity` 继续归 L5 evidence contract 与真实 owner evidence。

## 设计理念

- Stage 是专家工作单元，不是脚本节点。
- Stage 主提示词是 stage strategy ref，不是专业 Skill。标准源头是 domain repo 内的 `agent/stages/` 和 `agent/prompts/`；Codex Skill 物化只是某些 agent 的兼容投影。
- Stage 主提示词必须以正文、来源层和 SHA-256 进入 effective executor prompt；只投影 `prompt_ref`、让 executor 自行猜测或读取文件，不算 prompt 已消费。
- Professional specialist skill 承担专业方法、风格、审稿、图件、文献或工具使用 playbook；它可以放在 domain repo，也可以在体量大或需要跨 workspace 复用时拆到外部 specialist pack。
- Tool catalog / Tool Arsenal 是 affordance catalog，不是 workflow script。
- AI-first：规划、创作、评审、路线判断和修订由 selected executor 完成。
- Contract-light：合同只固定目标、refs、owner、scope、authority boundary、quality gate 和 receipt 下限。
- Quality gate 独立：执行 attempt 与 reviewer / auditor attempt 分离。

## 核心对象模型

| 对象 | 作用 | L4 验收要点 |
| --- | --- | --- |
| `stagecraft_profile` | Stagecraft 模块身份、stage policy、quality gate policy 和 authority flags。 | `status/inspect/interfaces` 必须返回 profile、contract refs、forbidden claims。 |
| `stage_pack` | stage goal、inputs、outputs、owner、scope、quality gate 和 strategy refs。 | `inspect` 必须能展示 stage pack shape 和 missing required refs。 |
| `stage_manifest` | domain stage 的 machine-readable manifest。 | `validate` 必须验证 manifest schema、owner、inputs、outputs、handoff 和 forbidden writes。 |
| `stage_strategy_refs` | prompt、skill、tool、knowledge、rubric、reviewer refs。 | `inspect` 必须返回 refs，不把 refs 写成固定 workflow script。 |
| `tool_affordance_boundary` | capability、tool card、permission、credential、write scope、side-effect risk、forbidden authority。 | `doctor` 必须发现缺失 permission/write-scope/credential/result-envelope/current-owner applicability boundary。 |
| `stage_admission` | launch 前的 static / runtime / domain-owned boundary check。 | `validate` 必须 fail closed，缺 source/artifact/workspace scope 时不能进入 stage。 |
| `quality_gate_plan` | 独立 reviewer / auditor gate 计划。 | `doctor` 必须发现 self-review、missing reviewer owner 或 missing gate output。 |
| `handoff_envelope` | 下游 stage 或 owner 所需的显式输入。 | `inspect` 必须展示下游需要的 refs 和 owner acceptance requirement。 |
| `route_back_ref` | 质量、证据、source 或 artifact 缺口回退到前序 owner。 | `status/doctor` 必须把 route-back 作为 owner route，不写成 stage success。 |

## Schema / Contract

当前 L4 绑定这些机器 contract：

```text
contracts/opl-framework/cognitive-computation-kernel.json
contracts/opl-framework/stage-run-kernel-contract.json
contracts/opl-framework/stage-manifest.schema.json
contracts/opl-framework/stage-owner-receipt.schema.json
contracts/opl-framework/stage-typed-blocker.schema.json
contracts/opl-framework/brand-module-registry.json#modules.stagecraft
```

Stagecraft contract 的职责是表达 stage pack、stage manifest、cognitive kernel、strategy refs、tool affordance boundary、capability use policy、admission、quality gate、handoff、route-back、owner receipt ref 和 typed blocker ref 的 shape。它不运行 durable attempts，不签 domain quality/export verdict，不接管 domain owner，也不把 tool card presence 写成 executor strategy。

## 模块级 CLI Family

当前 L4 由专属 CLI family 承担，并继续把底层实现委托给 stages/stage readiness 和 stage manifest validation 真实 source。

| 命令 | 验收说明 |
| --- | --- |
| `opl stagecraft status --json` | 返回 Stagecraft profile、family stage readiness summary、stage graph summary、admission blocker summary、quality gate coverage、handoff/route-back summary 和 forbidden claim flags。 |
| `opl stagecraft inspect --domain <domain> --json` | 返回该 domain 的 stage graph、stage packs、strategy refs、quality gate refs、handoff envelopes 和 route-back refs。 |
| `opl stagecraft inspect --stage <stage_id> --json` | 返回单个 stage 的 manifest、admission requirements、tool affordance boundary、quality gate plan、receipt/blocker refs 和 downstream handoff。 |
| `opl stagecraft interfaces --json` | 返回 CLI command specs、App action ids、read-model keys、descriptor delegates、contract refs、validation commands 和 status docs。 |
| `opl stagecraft validate --json` | 静态验证 registry refs、contract refs、stage manifests、stage packs、tool affordance boundary、quality gate separation、handoff envelope、authority flags 和 forbidden claims。 |
| `opl stagecraft doctor --json` | 诊断 missing stage manifest、missing source/artifact/workspace scope、missing quality gate owner、self-review risk、missing handoff、route-back gap 和 stale stage graph。 |

允许复用的底层现有 surface：

```text
opl stages readiness --family-defaults --json
opl stages readiness --domain <domain> --json
opl stages graph --domain <domain> --json
opl stage validate --json
opl stage conformance --json
opl agents interfaces --family-defaults --json
opl brand-modules inspect --module stagecraft --json
```

这些 surface 是 Stagecraft 的 source/delegate。模块级 L4 以 `opl stagecraft status|inspect|interfaces|validate|doctor --json` 和 `brand-module-surfaces.json#modules.stagecraft` 为验收入口，底层 delegate 不能单独替代模块自身读面。

## App Action / Read-Model

当前 L4 给 App 和 operator 提供 Stagecraft 自身读面：

| Surface | 验收说明 |
| --- | --- |
| `app_action:stagecraft_status` | 只读 status action，delegated surface 为 `opl stagecraft status --json`。 |
| `app_action:stagecraft_inspect` | 只读 drilldown action，支持 domain 或 stage scope。 |
| `app_action:stagecraft_validate` | 结构验证 action，返回 checked stage packs、manifest blockers、quality gate separation 和 authority flags。 |
| `app_action:stagecraft_doctor` | 诊断 action，返回 missing scope、missing gate、handoff gap、route-back gap 和 repair plan。 |
| `read_model.stagecraft.stage_graph` | domain stage graph 与 stage pack summary。 |
| `read_model.stagecraft.admission` | source/artifact/workspace scope、owner、tool boundary 和 launch blockers。 |
| `read_model.stagecraft.quality_gates` | independent reviewer/gate requirements 和 receipt refs。 |
| `read_model.stagecraft.handoff_route_back` | downstream handoff requirements、route-back refs 和 owner route。 |

App read-model 只投影 Stagecraft refs。它不得把 readiness、schema completeness、quality gate presence 或 route-back closure 写成 domain ready、quality verdict、artifact authority 或 production ready。

## Validate / Doctor

`validate` 是结构门：

- registry entry、contract refs、CLI specs、App action specs、descriptor delegates 和 status docs 必须齐全。
- stage manifest、stage pack、strategy refs、tool affordance boundary、admission、quality gate、handoff envelope、owner receipt ref 和 typed blocker ref 必须可被机器验证。
- reviewer / auditor gate 必须与 executor attempt 分离；同一 executor attempt 不能在同一上下文中自审并关闭质量门。

`doctor` 是 stage health 门：

- 缺 source/artifact/workspace scope、owner、quality gate、tool boundary、handoff 或 forbidden-write guard 时必须 fail closed。
- route-back、typed blocker 和 missing receipt 必须投影为 owner action，不得被解释为 stage complete。
- repair plan 只能修 stage pack、manifest、tool boundary、handoff 或 gate refs；domain verdict 必须留给 domain owner。

## 测试覆盖

当前 L4 focused tests 覆盖：

- `opl stagecraft status|inspect|interfaces|validate|doctor --json` 的 public help、JSON shape 和 error envelope。
- `stagecraft` module registry refs 与 CLI/App/descriptor/validation refs 一致。
- missing stage manifest、missing tool boundary、self-review risk、missing quality gate、route-back fixture。
- App action catalog 中 `stagecraft_*` actions 的 delegated surface 与 read-model keys。
- forbidden claims negative guards：readiness pass、manifest complete 或 gate ref present 不得授权 domain ready / quality verdict / durable runtime owner。

## Authority Boundary

| Stagecraft 可以做 | Stagecraft 不可以做 |
| --- | --- |
| 定义 stage pack、stage manifest、tool affordance boundary、admission、quality gate shape 和 handoff envelope。 | 运行 durable provider attempt、queue、lease、retry 或 dead-letter。 |
| 验证 stage 结构、launch precondition、reviewer separation 和 route-back refs。 | 替 domain owner 签 owner receipt、quality verdict、artifact/export verdict 或 typed blocker。 |
| 为 CLI、App、descriptor delegate 和 readiness 提供 stage design/readiness projection。 | 把 readiness、scorecard 或 schema completeness 写成 domain ready。 |
| 把缺口投影为 route-back、typed blocker requirement 或 owner action。 | 把 route reconciler 写成 planner、reviewer 或 domain decision maker。 |

## Forbidden Claims

- 不由 Framework 或 tool catalog 规定专业工具流程；domain stage / professional skill 可以声明专业语义、证据、authority、安全和不可逆动作依赖。
- 不把 Agent Tool Arsenal 或 tool card presence 写成固定 executor strategy。
- 不把 readiness / scorecard / schema completeness 升级成 domain verdict。
- 不让同一 executor attempt 在同一上下文中自审并关闭质量门。
- 不把 route reconciler 写成 planner 或 reviewer。
- 不声明 durable runtime owner。
- 不声明 artifact authority、quality verdict、domain ready 或 production ready。
