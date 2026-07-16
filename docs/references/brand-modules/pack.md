# OPL Pack

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态与 L4 验收说明。机器真相继续归 domain pack contracts、standard domain-agent skeleton、pack compiler source、generated surface contracts、CLI/API 行为、domain-owned authority functions 和测试输出。
Currentness policy: 本文不冻结 Pack L4 状态、registry entry、pack compiler alignment、generated bundle fingerprint、conformance pass、owner acceptance 或 production maturity。当前 Pack 结构状态必须从 fresh `opl pack status|validate|doctor --json`、pack contracts、source/tests、generated surface readback 和 domain owner surfaces 读取。

## 品牌定位

`OPL Pack` 是 OPL 的 Domain Pack、Capability Invocation ABI 与 Authority ABI 模块。它把一个 Foundry Agent 应该声明什么、Agent executor 怎样发现和调用能力、ordinary path 应消费什么 execution view / operational card / result envelope、哪些 authority function 可以被 OPL 调用、哪些 surfaces 可以由 OPL generated / hosted、以及 pack compiler 如何判断 drift 和 conformance，收成独立 bounded context。

一句话：`Pack` 管“一个 domain agent 用什么声明自己，Agent 怎样顺手调用能力，OPL 如何从声明生成可调用面，以及哪些最小 authority function 真正属于 domain owner”。

## 真实 L4 口径

`OPL Pack` 达到 Workspace 级 `L4_structural_baseline` 时，不能只依赖 `Atlas` catalog、`Connect` descriptor 或 `Foundry Kernel` improvement loop。它必须有自己的对象模型、contract refs、模块级 CLI family、App/operator read-model、validate/doctor、测试和状态 foldback。

Fresh registry and surface readback records Pack 的结构入口和 authority boundary；`contracts/opl-framework/brand-module-surfaces.json#modules.pack` 与 `opl pack status|inspect|interfaces|validate|doctor --json` 是 Pack 自身的 L4 executable surface。该声明只覆盖结构完成度，不覆盖 MAS/MAG/RCA/OMA domain ready、handler readiness、owner acceptance 或 production maturity。

## 设计理念

- Declarative first：domain repo 先声明 pack、stage、action、authority function、workspace/source/artifact/memory locator 和 generated-surface input，不让 OPL 猜目录或反向发明语义。
- Authority ABI first：OPL 可以调用最小 authority functions，但不能替 domain owner 写 truth、签 quality verdict、接受 memory writeback 或授权 artifact/export readiness。
- Capability Invocation ABI first：Agent Tool Arsenal / Capability Invocation OS 归 Pack 持有 ABI；ToolArsenalIndex、ToolUseCard、CapabilityInvocationPlan、ToolResultEnvelope 和 ToolAuditTrail 是 agent-facing 合同，不是 owner answer。
- Three-layer lifecycle first：Capability Invocation OS 不新增品牌模块；三层 lifecycle 折回 Pack。soft discovery 由 Atlas/Pack 做高召回发现，scored fit 由 Pack/Stagecraft 给出可解释匹配，hard gate 由 `current_owner_delta` + Stagecraft + Runway fail closed。
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
| `capability_invocation_lifecycle` | Capability Invocation OS 的三层 lifecycle：soft discovery、scored fit、hard gate。 | `validate` 必须证明 soft/scored 层只是 advisory；hard gate 只能由 `current_owner_delta` 授权，Runway 不写 domain truth、owner receipt 或 typed blocker。 |
| `authority_abi` | domain-owned authority function 的最小 ABI，定义输入、输出、owner answer shape 和 forbidden authority。 | `validate` 必须发现缺失 owner receipt / typed blocker / human gate boundary 或 false-authority 违规。 |
| `generated_surface_bundle` | CLI/MCP/Skill/OpenAI/AI SDK/App/status/workbench 的 generated descriptor bundle。 | `interfaces` 必须能展示 generated surfaces、source refs、descriptor refs 和 fingerprint。 |
| `standard_authority_function` | domain repo 中允许 OPL 调用的 thin function，例如 owner answer、handoff、dispatch target 或 artifact locator。 | `doctor` 必须区分 missing function、stale handler、domain owner required 和 forbidden write。 |
| `pack_compiler_result` | pack compiler 的 conformance / drift / generated artifact report。 | `status` 必须展示 aligned / drift_detected、validation refs、conformance refs 和 next owner action。 |

## Schema / Contract

Pack 的机器 contract 至少绑定这些 refs：

```text
contracts/opl-framework/pack-bundle-contract.json
contracts/opl-framework/pack-native-helper-probe-contract.json
contracts/opl-framework/submission-resource-requirements.schema.json
contracts/opl-framework/submission-resource-provision-request.schema.json
contracts/opl-framework/submission-resource-provision-receipt.schema.json
contracts/opl-framework/artifact-projection-materialization-request.schema.json
contracts/opl-framework/artifact-projection-materialization-receipt.schema.json
contracts/opl-framework/domain-pack-compiler-contract.json
contracts/opl-framework/standard-domain-agent-skeleton-contract.json
contracts/opl-framework/foundry-agent-series-contract.json
contracts/opl-framework/owner-answer.schema.json
contracts/opl-framework/brand-module-registry.json#modules.pack
contracts/opl-framework/brand-module-surfaces.json#modules.pack
contracts/opl-framework/capability-registry-resolver.schema.json#/$defs/capability_invocation_lifecycle_policy
domain_contract:agent_tool_arsenal
```

这些 contract 的职责是表达 pack input、standard source layout、capability invocation ABI、authority ABI、execution view、operational card、result envelope、generated-surface projection、drift report、conformance gate 和 owner answer shape。它们是生成 / 校验材料，不是 Agent ordinary-path payload。普通执行只消费 execution view、operational card 和 ToolResultEnvelope；不得直接消费 MAS 原始合同细节、domain-private schema 或 domain owner source shape。它们不创建 domain handler，不写 domain truth，不保存 memory/artifact body，不生成 owner receipt / typed blocker，也不声明 domain ready、quality verdict、artifact authority、App release ready 或 production ready。

标准 Agent 的 stage source 固定为 repo-tracked `agent/stages/manifest.json`。`opl agents interfaces --repo-dir <path> --format product-entry --json` 由 Pack 直接读取 descriptor、action catalog、pack compiler input 和该 manifest，生成 schema-valid `family_stage_control_plane`；不会读取或回退到 domain repo 私有生成的 `contracts/stage_control_plane.json`。`generated_agent_interfaces.agent_id` 只接受 `contracts/pack_compiler_input.json#/canonical_agent_id`，不从 `target_domain_id`、module alias 或 repo 名推断；缺失时 fail closed。pack input 的 `domain_id` 必须与 domain descriptor 完全一致，且每个 `required_domain_pack_paths` 都必须解析到 repo 内真实文件。声明 `standard_stage_pack_conformance.required=true` 时，版本缺失或不是 `standard-stage-pack.v2` 同样 fail closed；domain manifest 不能覆盖 Stagecraft 提供的 completion policy 与 user-stage-log contract。source-derived stage 的 `pattern_id`、`step_id`、`stage_origin`、primary `source_pattern_ref`、source anchors 和 target-only requirement 由同一 manifest 显式投影，source-pattern 与 target-only 来源互斥；如果声明 `stage_pattern_source_refs`，其第一项必须与 primary `source_pattern_ref` 完全一致，后续 alias 不能替代 primary binding。生成 plane 仍只承载 domain-scoped stage/action/transition refs、Codex executor 默认绑定和 false-authority boundary，manifest SHA 仅作为 source binding/freshness，不改变稳定的 domain plane identity，也不授予 OPL domain truth、quality、artifact 或 owner receipt 权限。

`pack-bundle-contract.json` 专门处理上万行 JSON aggregate 的维护边界：`*.source/` 或 `*.source.json` 等 source parts 是唯一编辑面，`*.json` aggregate 是 regenerated consumer surface，`*.bundle-manifest.json` 记录 source entries、source digest、generated artifact hash 和 false-authority boundary。OPL Pack 可以执行 `manifest/write/check`，但 check 只证明 source parts 与 generated aggregate 一致，不能替 domain owner 声明 ready、quality、owner receipt、typed blocker 或 artifact authority。

Capability Invocation OS 的 lifecycle 固定为三层：

| 层 | Owner modules | 语义 | Authority |
| --- | --- | --- | --- |
| `soft_discovery` | `atlas` / `pack` | 高召回发现候选 capability、tool card、source family 和 refs。 | advisory；不能执行 capability 或拥有 domain authority。 |
| `scored_fit` | `pack` / `stagecraft` | 给出与当前 stage/capability policy 的可解释匹配。 | advisory；不能把 fit 分数写成 quality verdict 或 stage completion。 |
| `hard_gate` | `current_owner_delta` / `stagecraft` / `runway` | 对 route-required、hard-boundary、missing ref、owner route identity 和 forbidden write fail closed。 | `current_owner_delta` 是授权面；Runway 只承接 runtime gate/observation，不写 domain truth、owner receipt 或 typed blocker。 |

## 模块级 CLI Family

真实 L4 的 Pack 模块级入口：

```text
opl pack status --json
opl pack inspect --json
opl pack interfaces --json
opl pack validate --json
opl pack doctor --json
```

通用 pack 资源入口：

```text
opl pack inspect --pack <path> --json
opl pack check --pack <path> --json
opl pack run --pack <path> --action <id> --template <id> --mode final|candidate --json
opl pack gallery --pack <path> --json
opl pack native-helper probe --descriptor <path> --json
opl pack provision-submission-resource --requirements <path> --resource-id <id> (--package-root <dir>|--source-path <path>) --json
opl pack materialize-artifact-projection --request <path> [--dry-run] --json
```

这些入口只读取 `opl_pack.json`、Pack OS descriptor、native-helper probe descriptor、domain-owned submission-resource requirements，或 domain owner 已准备并授权的 artifact projection request。`provision-submission-resource` 只接受 requirement 中冻结的 `provisioning/package_path/path_env` 形状：package 模式严格以 `package_root + package_path` 做 containment 和 symlink 检查，host 模式只接受 caller 显式传入的 absolute `source_path`；`path_env` 仅回投为 operator guidance，OPL 不读环境变量、不下载、不尝试 URL fallback。它对 exact bytes 做稳定读取与 SHA-256 校验，把内容和 false-authority receipt 原子写入 OPL state 或显式 destination root；dry-run 只解析、校验和计算路径，零写入。该 surface 不是 Agent Package install/update/repair 生命周期，不改变 package lock，也不授权 submission ready、quality verdict、artifact authority 或 owner receipt。

`materialize-artifact-projection` 只搬运 domain owner 已经完成、逐文件列入 manifest 且带 completion markers 的完整树。OPL 在 sibling staging 中重新校验每个文件的 size/SHA-256，验证 source tree 与 expected manifest 完全一致后才切换 canonical target；切换失败恢复旧树，dead-owner transaction 先恢复再重试。这个 transport 可以防止半成品目录被 preferred-root consumer 抢先读取，但不会创建或解释 `STATUS.json`、publication evaluation、next action、quality verdict、owner receipt、typed blocker 或 submission authority。`domain_authorization` 只是调用方提供并进入 receipt 的授权引用，Framework 不验证或扩张其 domain 语义。

其余入口生成 refs-only inspection / validation / action plan 或由 descriptor/content SHA-256 绑定的 `resolved|missing` 探测 receipt。native-helper probe 只解析 entrypoint 与声明的 runtime/tool commands，不执行 helper 或 domain renderer，不渲染 PDF/image asset，也不声明质量 verdict、artifact authority、publication proof 或 export readiness。`medical-display-core` 是 MAS Scholar Skills 提供的外部 capability pack resource；OPL 不提供 `opl display` 顶层命令，也不把科研画图纳入 OPL 基座 domain 语义。

Pack 对象视图入口：

```text
opl pack domain-packs --json
opl pack authority-abi --json
opl pack generated-surfaces --json
opl pack compiler --json
```

底层 delegate / source refs：

```text
opl pack bundle manifest --assembly <path> --json
opl pack bundle write --assembly <path> --json
opl pack bundle check --assembly <path> --json
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
| `app_action:opl_pack_provision_submission_resource` | 复用同一 Pack action，把既有 exact local bytes 写入 OPL content-addressed cache；支持零写入 dry-run，不读取 `path_env`，不进入 Agent Package lifecycle，也不签 submission/quality/owner verdict。 |
| `app_action:opl_pack_materialize_artifact_projection` | 原子投影 domain owner 已授权的完整 exact-byte artifact tree；只生成 OPL transport receipt，不创建或提升 domain truth、quality、publication 或 submission authority。 |
| `read_model.pack.domain_packs` | Foundry Agent pack summary、owner、source refs、required sections 和 conformance state。 |
| `read_model.pack.authority_abi` | domain authority function refs、accepted owner answer shape 和 forbidden authority flags。 |
| `read_model.pack.capability_execution_view` | Agent ordinary path 的执行视图，只包含可执行 action、input shape、owner/action refs 和 false-authority flags。 |
| `read_model.pack.capability_invocation_lifecycle` | Capability Invocation OS 三层 lifecycle 的 projection，供 Console / Connect / Runway 读取同一 soft/scored/hard gate 语义。 |
| `read_model.pack.agent_operational_card` | Agent ordinary path 的操作卡，承接 tool affordance、expected result envelope 和 handoff refs。 |
| `read_model.pack.tool_result_envelope` | ToolResultEnvelope projection，供 Console / Connect / Ledger 读结果载体。 |
| `read_model.pack.generated_surfaces` | generated bundle、descriptor refs、source/generated fingerprint 和 drift state。 |
| `read_model.pack.compiler` | pack compiler validation、drift summary、next owner action 和 false-authority boundary。 |

App read-model 只投影 Pack refs 和 Pack 生成的 ordinary consumption views。它不得把 pack compiler aligned、generated descriptor present、conformance pass、authority function exists、capability execution view、agent operational card 或 ToolResultEnvelope 写成 domain ready、handler ready、owner acceptance、quality verdict、artifact authority 或 production maturity。

## Console / Connect 普通消费边界

`Console` 消费 `capability_execution_view`、`capability_invocation_lifecycle`、`agent_operational_card` 和 `tool_result_envelope` 的 App/operator projection，用于展示 current owner、next action、input readiness、soft/scored/hard gate 状态、result envelope 和 drilldown。Console 不读取 MAS 原始合同细节，不把 projection 写成 owner answer，也不成为第二 domain truth。

`Connect` 发布 `capability_invocation_lifecycle_descriptor`、`capability_execution_view_descriptor`、`agent_operational_card_descriptor` 和 `tool_result_envelope_descriptor`，用于 CLI/MCP/OpenAI/AI SDK/Skill/plugin 等外部调用面稳定消费同一 ordinary-path envelope。Connect 不导出 MAS 原始合同细节，不重新解释 domain semantics，不把 descriptor presence 或 transport success 写成 handler readiness、domain authority 或 release truth。

## Validate / Doctor

`validate` 是结构门：

- registry entry、contract refs、CLI specs、App action specs、descriptor delegates 和 status docs 必须齐全。
- domain pack、authority ABI、generated surface bundle、standard authority function 和 pack compiler result 的 required refs 必须可被机器验证。
- capability execution view、agent operational card 和 ToolResultEnvelope 必须能由 Pack ABI 派生，并被 Console / Connect 以 projection / descriptor 方式消费。
- capability invocation lifecycle 必须能由 Pack ABI / resolver schema 派生，并折回 Console projection、Connect descriptor 和 Runway hard gate；不得新增第 11 品牌模块。
- authority flags 必须全部保持 false：Pack 不能写 domain truth、memory/artifact body、owner receipt、typed blocker 或 quality/export verdict。

`doctor` 是 pack health 门：

- 缺 pack source、authority ABI、generated surface input、source/generated fingerprint 或 compiler report 时，必须返回 Pack-owned structural blocker 或 diagnostic。
- 缺 domain owner handler、owner answer、quality/export decision 或 artifact locator 时，必须投影为 domain owner action，不得由 Pack 自动补齐。
- repair plan 只能修 pack declaration、generated descriptor、compiler drift 或 authority ABI refs；domain verdict 必须留给 domain owner。

## 测试覆盖

真实 L4 至少需要 focused tests 覆盖：

- `opl pack status|inspect|interfaces|validate|doctor --json` 的 public help、JSON shape 和 error envelope。
- `pack` module registry refs 与 CLI/App/descriptor/validation refs 一致。
- ordinary-path smoke 覆盖 Capability Invocation OS 不新增第 11 品牌模块，Pack 持有 ABI 和三层 lifecycle，Console / Connect 消费 lifecycle、execution view、operational card 和 result envelope，不消费 MAS 原始合同细节。
- `domain-pack-compiler-contract.json`、standard skeleton、Foundry series contract 和 owner-answer schema 的 required refs 被 `contract validate` 纳入。
- missing authority ABI、missing generated surface input、drift_detected、forbidden authority flag 和 domain owner required fixtures。
- forbidden claims negative guards：pack compiler pass、generated surface present 或 conformance pass 不得授权 domain ready / quality verdict / artifact authority / production ready。

## Authority Boundary

| Pack 可以做 | Pack 不可以做 |
| --- | --- |
| 定义 domain pack shape、authority ABI、generated-surface inputs、capability invocation lifecycle、capability execution view、agent operational card、ToolResultEnvelope、pack compiler report 和 conformance read-model。 | 替 domain owner 创建 handler implementation、owner receipt、typed blocker、quality verdict 或 artifact/export verdict。 |
| 验证 standard source layout、authority function refs、generated descriptor drift 和 false-authority flags。 | 写 domain truth、memory body、artifact body、workspace runtime state 或 App release truth。 |
| 把缺口投影成 pack structural blocker、domain owner action、drift diagnostic 或 generated-surface repair plan。 | 把 descriptor present、compiler aligned、conformance pass 或 generated bundle present 写成 L5、domain ready、handler ready 或 production ready。 |

## Forbidden Claims

- 不把 pack compiler pass 写成 domain ready。
- 不把 generated surface bundle 写成 handler implementation。
- 不把 authority function ref 写成 owner receipt / typed blocker 已存在。
- 不把 conformance pass 写成 owner acceptance。
- 不把 standard skeleton 完整写成 artifact authority、quality verdict、App release ready 或 production ready。
- 不让 ToolResultEnvelope、tool card、capability registry hit 或 tool availability 变成 owner answer、current-owner authorization、quality verdict 或 artifact authority。
- 不让 capability invocation lifecycle 本身变成 domain authority；hard gate 只能引用 `current_owner_delta`，Runway 不能因此写 domain truth、owner receipt 或 typed blocker。
- 不让 Agent ordinary path 直接消费 MAS 原始合同细节；普通路径只消费 Pack 生成/校验后的 execution view、operational card 和 result envelope。
- 不让 Pack 接管 Atlas catalog、Stagecraft stage semantics、Runway durable execution、Ledger evidence body、Console release truth、Foundry Kernel improvement verdict 或 Connect transport/install evidence。

## L4 / L5 成熟度读法

With fresh registry and surface readback, `OPL Pack` 可按 `L4_structural_baseline` 读取：registry、module surface contract、CLI family、object views、contract refs、App descriptor refs、validation refs 和 focused tests 已能证明结构归位。

`L5 production operating maturity` 仍需要真实 MAS/MAG/RCA/OMA 或新 Foundry Agent 的 live user path、跨 agent scaleout、long-soak/recovery、release/install evidence、operator repair loop、domain owner acceptance 和 no-second-truth 回归证据。Pack 的 L5 不能由 docs foldback、contract validation、pack compiler aligned、generated descriptor present、conformance pass、verified ledger 或 App projection 单独声明。
