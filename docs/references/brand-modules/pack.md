# OPL Pack

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态与 L4 验收说明。机器真相继续归 domain pack contracts、standard domain-agent skeleton、pack compiler source、generated surface contracts、CLI/API 行为、domain-owned authority functions 和测试输出。

## 品牌定位

`OPL Pack` 是 OPL 的 Domain Pack、Capability Invocation ABI 与 Authority ABI 模块。它把一个 Foundry Agent 应该声明什么、Agent executor 怎样发现和调用能力、ordinary path 应消费什么 execution view / operational card / result envelope、哪些 authority function 可以被 OPL 调用、哪些 surfaces 可以由 OPL generated / hosted、以及 pack compiler 如何判断 drift 和 conformance，收成独立 bounded context。

一句话：`Pack` 管“一个 domain agent 用什么声明自己，Agent 怎样顺手调用能力，OPL 如何从声明生成可调用面，以及哪些最小 authority function 真正属于 domain owner”。

## 真实 L4 口径

`OPL Pack` 达到 Workspace 级 `L4_structural_baseline` 时，不能只依赖 `Atlas` catalog、`Connect` descriptor 或 `Foundry Lab` improvement loop。它必须有自己的对象模型、contract refs、模块级 CLI family、App/operator read-model、validate/doctor、测试和状态 foldback。

当前 registry 已记录 Pack 的结构入口和 authority boundary；`contracts/opl-framework/brand-module-surfaces.json#modules.pack` 与 `opl pack status|inspect|interfaces|validate|doctor --json` 是 Pack 自身的 L4 executable surface。该声明只覆盖结构完成度，不覆盖 MAS/MAG/RCA/OMA domain ready、handler readiness、owner acceptance 或 production maturity。

## 设计理念

- Declarative first：domain repo 先声明 pack、stage、action、authority function、workspace/source/artifact/memory locator 和 generated-surface input，不让 OPL 猜目录或反向发明语义。
- Authority ABI first：OPL 可以调用最小 authority functions，但不能替 domain owner 写 truth、签 quality verdict、接受 memory writeback 或授权 artifact/export readiness。
- Capability Invocation ABI first：Agent Tool Arsenal / Capability Invocation OS 归 Pack 持有 ABI；ToolArsenalIndex、ToolUseCard、CapabilityInvocationPlan、ToolResultEnvelope 和 ToolAuditTrail 是 agent-facing 合同，不是 owner answer。
- Ordinary consumption first：Pack contracts 是生成和校验材料；Agent ordinary path 只消费 Pack 产出的 `capability_execution_view`、`agent_operational_card` 和 `tool_result_envelope`，不消费 MAS 原始合同细节或 domain-private source shape。
- Generated surface first：CLI、MCP、Skill/plugin、OpenAI tools、AI SDK tools、App action、status read-model 和 workbench 从同一 pack / action / stage metadata 派生。
- No private platform by default：domain repo 私有 scheduler、queue、session store、workbench、status shell、sidecar 或 generic wrapper 只能作为迁移输入、authority adapter 或 tombstone candidate。
- Drift visible：pack compiler 必须暴露 source fingerprint、generated bundle fingerprint、generated_from refs 和 aligned / drift_detected 状态。

## 核心对象模型

| 对象 | 作用 | L4 验收要点 |
| --- | --- | --- |
| `domain_pack` | Foundry Agent 的声明式 domain pack，包括 identity、stage/action refs、authority boundary 和 generated-surface inputs。 | `inspect` 必须展示 pack shape、owner、source refs 和 missing required sections。 |
| `capability_invocation_abi` | Agent-facing tool arsenal、tool cards、invocation plan、result envelope 和 audit trail。 | `validate` 必须发现缺失 tool card boundary、result envelope schema、forbidden authority 或 current-owner applicability。 |
| `capability_execution_view` | 从 domain pack、capability ABI 和 current-owner policy 派生的 agent ordinary-path execution view。 | `interfaces` / Console projection 只能暴露可执行视图、owner/action refs 和 false-authority flags，不暴露 MAS 原始合同细节。 |
| `agent_operational_card` | Agent 面向一次普通执行所需的 action label、inputs、tool affordance、expected envelope 和 handoff refs。 | `validate` 必须证明 operational card 来自 Pack ABI，不能成为 current-owner authorization 或 owner answer。 |
| `tool_result_envelope` | ToolResultEnvelope 的结构化结果形态，供 Console / Connect / audit surfaces 消费。 | `validate` 必须证明 envelope 只是结果载体，不是 quality verdict、artifact authority、typed blocker 或 owner receipt。 |
| `authority_abi` | domain-owned authority function 的最小 ABI，定义输入、输出、owner answer shape 和 forbidden authority。 | `validate` 必须发现缺失 owner receipt / typed blocker / human gate boundary 或 false-authority 违规。 |
| `generated_surface_bundle` | CLI/MCP/Skill/OpenAI/AI SDK/App/status/workbench 的 generated descriptor bundle。 | `interfaces` 必须能展示 generated surfaces、source refs、descriptor refs 和 fingerprint。 |
| `standard_authority_function` | domain repo 中允许 OPL 调用的 thin function，例如 owner answer、handoff、dispatch target 或 artifact locator。 | `doctor` 必须区分 missing function、stale handler、domain owner required 和 forbidden write。 |
| `pack_compiler_result` | pack compiler 的 conformance / drift / generated artifact report。 | `status` 必须展示 aligned / drift_detected、validation refs、conformance refs 和 next owner action。 |

## Schema / Contract

Pack 的机器 contract 至少绑定这些 refs：

```text
contracts/opl-framework/domain-pack-compiler-contract.json
contracts/opl-framework/standard-domain-agent-skeleton-contract.json
contracts/opl-framework/foundry-agent-series-contract.json
contracts/opl-framework/owner-answer.schema.json
contracts/opl-framework/brand-module-registry.json#modules.pack
contracts/opl-framework/brand-module-surfaces.json#modules.pack
domain_contract:agent_tool_arsenal
```

这些 contract 的职责是表达 pack input、standard source layout、capability invocation ABI、authority ABI、execution view、operational card、result envelope、generated-surface projection、drift report、conformance gate 和 owner answer shape。它们是生成 / 校验材料，不是 Agent ordinary-path payload。普通执行只消费 execution view、operational card 和 ToolResultEnvelope；不得直接消费 MAS 原始合同细节、domain-private schema 或 domain owner source shape。它们不创建 domain handler，不写 domain truth，不保存 memory/artifact body，不生成 owner receipt / typed blocker，也不声明 domain ready、quality verdict、artifact authority、App release ready 或 production ready。

## 模块级 CLI Family

真实 L4 的 Pack 模块级入口：

```text
opl pack status --json
opl pack inspect --json
opl pack interfaces --json
opl pack validate --json
opl pack doctor --json
```

Pack 对象视图入口：

```text
opl pack domain-packs --json
opl pack authority-abi --json
opl pack generated-surfaces --json
opl pack compiler --json
```

底层 delegate / source refs：

```text
opl agents pack-compiler --json
opl agents interfaces --family-defaults --json
opl agents conformance --family-defaults --json
opl brand-modules inspect --module pack --json
opl contract validate --json
```

这些 delegate 是 Pack 的 source/read-model 输入，不足以单独构成 Pack 自身 L4；模块级 L4 仍以 `opl pack status|inspect|interfaces|validate|doctor --json` 和 `brand-module-surfaces.json#modules.pack` 为验收入口。

## App Action / Read-Model

| Surface | 验收说明 |
| --- | --- |
| `app_action:pack_status` | 只读 status action，delegated surface 为 `opl pack status --json`。 |
| `app_action:pack_inspect` | 只读 drilldown action，支持 domain pack、authority ABI、generated surface 或 compiler result scope。 |
| `read_model.pack.domain_packs` | Foundry Agent pack summary、owner、source refs、required sections 和 conformance state。 |
| `read_model.pack.authority_abi` | domain authority function refs、accepted owner answer shape 和 forbidden authority flags。 |
| `read_model.pack.capability_execution_view` | Agent ordinary path 的执行视图，只包含可执行 action、input shape、owner/action refs 和 false-authority flags。 |
| `read_model.pack.agent_operational_card` | Agent ordinary path 的操作卡，承接 tool affordance、expected result envelope 和 handoff refs。 |
| `read_model.pack.tool_result_envelope` | ToolResultEnvelope projection，供 Console / Connect / Vault 读结果载体。 |
| `read_model.pack.generated_surfaces` | generated bundle、descriptor refs、source/generated fingerprint 和 drift state。 |
| `read_model.pack.compiler` | pack compiler validation、drift summary、next owner action 和 false-authority boundary。 |

App read-model 只投影 Pack refs 和 Pack 生成的 ordinary consumption views。它不得把 pack compiler aligned、generated descriptor present、conformance pass、authority function exists、capability execution view、agent operational card 或 ToolResultEnvelope 写成 domain ready、handler ready、owner acceptance、quality verdict、artifact authority 或 production maturity。

## Console / Connect 普通消费边界

`Console` 消费 `capability_execution_view`、`agent_operational_card` 和 `tool_result_envelope` 的 App/operator projection，用于展示 current owner、next action、input readiness、result envelope 和 drilldown。Console 不读取 MAS 原始合同细节，不把 projection 写成 owner answer，也不成为第二 domain truth。

`Connect` 发布 `capability_execution_view_descriptor`、`agent_operational_card_descriptor` 和 `tool_result_envelope_descriptor`，用于 CLI/MCP/OpenAI/AI SDK/Skill/plugin 等外部调用面稳定消费同一 ordinary-path envelope。Connect 不导出 MAS 原始合同细节，不重新解释 domain semantics，不把 descriptor presence 或 transport success 写成 handler readiness、domain authority 或 release truth。

## Validate / Doctor

`validate` 是结构门：

- registry entry、contract refs、CLI specs、App action specs、descriptor delegates 和 status docs 必须齐全。
- domain pack、authority ABI、generated surface bundle、standard authority function 和 pack compiler result 的 required refs 必须可被机器验证。
- capability execution view、agent operational card 和 ToolResultEnvelope 必须能由 Pack ABI 派生，并被 Console / Connect 以 projection / descriptor 方式消费。
- authority flags 必须全部保持 false：Pack 不能写 domain truth、memory/artifact body、owner receipt、typed blocker 或 quality/export verdict。

`doctor` 是 pack health 门：

- 缺 pack source、authority ABI、generated surface input、source/generated fingerprint 或 compiler report 时，必须返回 Pack-owned structural blocker 或 diagnostic。
- 缺 domain owner handler、owner answer、quality/export decision 或 artifact locator 时，必须投影为 domain owner action，不得由 Pack 自动补齐。
- repair plan 只能修 pack declaration、generated descriptor、compiler drift 或 authority ABI refs；domain verdict 必须留给 domain owner。

## 测试覆盖

真实 L4 至少需要 focused tests 覆盖：

- `opl pack status|inspect|interfaces|validate|doctor --json` 的 public help、JSON shape 和 error envelope。
- `pack` module registry refs 与 CLI/App/descriptor/validation refs 一致。
- ordinary-path smoke 覆盖 Capability Invocation OS 不新增第 11 品牌模块，Pack 持有 ABI，Console / Connect 消费 execution view、operational card 和 result envelope，不消费 MAS 原始合同细节。
- `domain-pack-compiler-contract.json`、standard skeleton、Foundry series contract 和 owner-answer schema 的 required refs 被 `contract validate` 纳入。
- missing authority ABI、missing generated surface input、drift_detected、forbidden authority flag 和 domain owner required fixtures。
- forbidden claims negative guards：pack compiler pass、generated surface present 或 conformance pass 不得授权 domain ready / quality verdict / artifact authority / production ready。

## Authority Boundary

| Pack 可以做 | Pack 不可以做 |
| --- | --- |
| 定义 domain pack shape、authority ABI、generated-surface inputs、capability execution view、agent operational card、ToolResultEnvelope、pack compiler report 和 conformance read-model。 | 替 domain owner 创建 handler implementation、owner receipt、typed blocker、quality verdict 或 artifact/export verdict。 |
| 验证 standard source layout、authority function refs、generated descriptor drift 和 false-authority flags。 | 写 domain truth、memory body、artifact body、workspace runtime state 或 App release truth。 |
| 把缺口投影成 pack structural blocker、domain owner action、drift diagnostic 或 generated-surface repair plan。 | 把 descriptor present、compiler aligned、conformance pass 或 generated bundle present 写成 L5、domain ready、handler ready 或 production ready。 |

## Forbidden Claims

- 不把 pack compiler pass 写成 domain ready。
- 不把 generated surface bundle 写成 handler implementation。
- 不把 authority function ref 写成 owner receipt / typed blocker 已存在。
- 不把 conformance pass 写成 owner acceptance。
- 不把 standard skeleton 完整写成 artifact authority、quality verdict、App release ready 或 production ready。
- 不让 ToolResultEnvelope、tool card、capability registry hit 或 tool availability 变成 owner answer、current-owner authorization、quality verdict 或 artifact authority。
- 不让 Agent ordinary path 直接消费 MAS 原始合同细节；普通路径只消费 Pack 生成/校验后的 execution view、operational card 和 result envelope。
- 不让 Pack 接管 Atlas catalog、Stagecraft stage semantics、Runway durable execution、Vault evidence body、Console release truth、Foundry Lab improvement verdict 或 Connect transport/install evidence。

## L4 / L5 成熟度读法

`OPL Pack` 当前可按 `L4_structural_baseline` 读取：registry、module surface contract、CLI family、object views、contract refs、App descriptor refs、validation refs 和 focused tests 已能证明结构归位。

`L5 production operating maturity` 仍需要真实 MAS/MAG/RCA/OMA 或新 Foundry Agent 的 live user path、跨 agent scaleout、long-soak/recovery、release/install evidence、operator repair loop、domain owner acceptance 和 no-second-truth 回归证据。Pack 的 L5 不能由 docs foldback、contract validation、pack compiler aligned、generated descriptor present、conformance pass、verified ledger 或 App projection 单独声明。
