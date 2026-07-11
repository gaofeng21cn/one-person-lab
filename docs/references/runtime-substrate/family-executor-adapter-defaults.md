# 家族 Executor Adapter 默认口径

Purpose: `references_runtime_substrate_family_executor_adapter_defaults`
State: `support_reference`

Status: `support_reference_updated`
Owner: `One Person Lab`
Machine boundary: 本文是人读 executor 边界参考；机器可读默认值以 `contracts/opl-framework/family-executor-adapter-defaults.json`、`contracts/opl-framework/domain-onboarding-readiness.schema.json`、source code 与 CLI/API 行为为准。

## 当前读法

本文只解释 executor adapter 的 owner boundary 与默认解析语义。机器合同归 `contracts/opl-framework/family-executor-adapter-defaults.json`，运行时解析和 fail-closed 行为归 `src/agent-executor.ts`、stage attempt launch gate、CLI/API 和相关测试；不要从本文复制 backend 列表、字段值、repo 状态或示例作为机器接口。

当前长期口径是 `Codex CLI` 作为默认且第一公民 executor。`hermes_agent`、`claude_code` 与 `antigravity_cli` 是 canonical 但显式非默认 backend/interface，只承诺连接、生命周期、回执、审计和 fail-closed 边界，不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。非默认 executor 必须通过 request、stage attempt、runtime handoff 或 Runtime Manager 选择显式绑定；缺少 binary、binding ref、receipt 或 required capability proof 时 fail-closed，不能静默回落成 Codex fallback。

当前读取入口：

```bash
rtk jq '.defaults, .canonical_executor_backends, .executor_registry, .stage_level_executor_policy' contracts/opl-framework/family-executor-adapter-defaults.json
rtk opl executor doctor --executor codex_cli --json
rtk opl executor doctor --executor hermes_agent --json
rtk opl agents conformance --family-defaults --json
```

旧 Hermes provider / Gateway / frontdoor / proof-provider / readiness / compatibility surface、`frontdoor`、`product frontdoor`、`federated product entry` 和 MDS 默认执行语境只作为 history/tombstone/provenance/negative-guard 阅读，不保留 active alias、兼容接口或默认入口。

## 目的

这份参考文档只做一件事：说明 `OPL` 家族统一的 `executor-adapter` 默认口径，避免后续再把 runtime substrate、domain authority 与具体执行器混成一层。

当前统一的是：

- `runtime substrate / orchestration` 的上层语义
- `executor-adapter` 的默认 route 与命名边界

当前还没有统一的是：

- admitted domain / agent repos 内部的全部业务对象与阶段语义
- 所有实验路线的最终结论

## 默认与非默认边界

- 默认执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型：继承本机 `Codex` 默认配置
- 默认 reasoning effort / thinking：继承本机 `Codex` 默认配置
- 默认语义：必须是能自主拆解、规划、执行、继续推进的 agent loop
- 家族 canonical executor backend 由 machine contract 读取；当前合同包含 `codex_cli`、`hermes_agent`、`claude_code` 与 `antigravity_cli`
- `hermes_agent` 是显式非默认 backend；它必须证明完整 agent loop 与 tool event receipt，缺少 binary、receipt 或 proof 时 fail-closed，不能静默转成 Codex fallback
- `antigravity_cli` 是显式非默认 experimental adapter；它只能通过 request、stage attempt 或 runtime handoff 的显式绑定生效，适合表达 `RCA` HTML route + `Gemini flash/high` 这类 stage-level executor/model/reasoning selection 示例，不承担默认交互、质量等价、工具语义等价或 resume 等价
- 调用形态单独写作 `execution_shape`：`structured_call` 表示 schema 约束下的一次性结构化输入输出；`agent_loop` 表示带事件、工具使用、修复和 review-loop proof 的多步 agent run
- `host_agent`、`simple_llm` 与 `openai_compatible_gateway` 不作为家族一等 backend，也不保留 active alias

这里说的 `Codex CLI` 默认路线，指的是把任务交给 `autonomous` agent loop 去自主推进，而不是人工先把任务拆成固定小步骤再逐步补空。

## Layered Executor 语义

当前共享合同把 executor 配置拆成三层，不再把用户入口、默认执行器和 route 级结构化调用揉成一层：

- `user_interaction_shell`：用户可见的自然语言 / session 外壳，可以由 `opl`、`opl tui`、OPL-branded GUI / `opl app` workbench、ACP stdio 或 domain direct skill entry 承担；这一层不选择 effective default executor，也不持有 domain truth。新增 canonical executor adapter 不改变这些用户入口的默认交互语义，只有显式 executor 选择才进入非默认执行器。旧 `frontdoor` 词只保留在历史/tombstone 语境。
- `frontend_executor_policy`：`opl tui`、`opl app` 和 ACP 这类前端可以承载用户显式选择的 executor，也可以展示 executor receipt / status；但它们不得自行解析隐式默认 executor，不得把新增 adapter 静默替换成默认交互路径。没有用户或 stage 的显式信号时，既有 Codex CLI 交互保持不变。
- `effective_default_executor`：family-level 默认执行器解析语义，归 `OPL` family runtime config / handoff default 管；默认 backend 仍是 `codex_cli`，这一层不持有 `RedCube AI` 等 domain truth，也不持有具体 executor 实现。
- `route_level_structured_call_routing`：domain 自己的 schema、route 和 structured call 选择；它可以接收 request-scoped explicit executor，但 route truth 和 domain truth 仍归 domain 仓。

Effective default executor 的解析顺序固定为：

1. `request_explicit_executor`
2. `opl_runtime_manager_or_handoff_default_executor`
3. `domain_local_user_config`
4. `domain_built_in_default_codex_cli`

这意味着顶层 `OPL` 可以传递 family-level user/runtime config 或 handoff default executor，但不能把 domain local config、domain built-in default、domain route truth 或 concrete executor implementation 收到 `OPL` 仓。

## Standalone Domain 行为

如果没有 `OPL` config 或 handoff default，`RCA`、`MAS`、`MAG` 等 domain 必须按自己的 domain defaults 独立运行。当前 family contract 只要求这些 defaults 与家族默认字段可对齐；它不要求 standalone domain 依赖 `OPL` 才能选择执行器。

## Stage-Level Executor Policy

Stage pack 可以显式声明 stage-level executor/model/reasoning policy，但默认路线仍继承 `Codex CLI` 第一公民语义。当前机器合同把这层字段定义为：

- `executor_kind`：stage 选择的 canonical backend key；没有显式绑定时仍解析为 `codex_cli`
- `model`：stage 选择的模型，或在默认 Codex 路径继承本机 `Codex` 默认配置
- `reasoning_effort`：stage 选择的 reasoning effort，或在默认 Codex 路径继承本机 `Codex` 默认配置
- `provider`：selected executor 的 provider / runtime ref；provider catalog 不进入 domain repo truth
- `executor_binding_ref`：非默认 executor 的显式绑定、handoff 或 runtime-manager selection 审计引用
- `executor_labels`：面向人读和 App/operator projection 的 executor 标签
- `required_capabilities`：stage 启动前要求 selected executor 证明的能力
- `receipt_requirements`：stage closeout 必须返回的 receipt、tool/event proof、状态和 fail-closed evidence

当前 executable capability activation 只开放 `image_generation`：请求必须通过 `AgentExecutionRequest.required_capabilities` 显式声明，selected executor 必须是 `codex_cli`，并在 `AgentExecutionReceipt.requested_capabilities` / `activated_capabilities` 回读。未知 capability 或非 Codex executor 请求必须 fail closed。该 activation 只打开 Codex image-generation transport，不决定 prompt、target path、产物 digest、figure manifest、质量或 artifact authority；这些仍由调用它的 domain owner 持有。

`AgentExecutionRequest.timeout_ms` 是实际 process deadline，不是提示字段。Codex executor 必须把它传给进程执行器；到期后返回带 `timed_out=true`、`timeout_reason=total_timeout`、原始 `timeout_ms` 和 `fallback_allowed=false` 的 fail-closed error，不得形成成功 receipt 或静默改用其他 executor。

这些字段只定义启动、审计和回执边界，不把 stage 内的专家推理写成静态流程，也不让非默认 adapter 获得默认执行权。`antigravity_cli` 一类 adapter 必须携带 explicit binding ref、experimental/non-default label、required capabilities 与 receipt requirements；缺少这些字段时应按 executor binding blocker 处理。

## 配置示例边界

可以保留 `hermes_agent`、`claude_code`、`antigravity_cli` 这类 canonical 非默认 backend 的配置示例，但示例必须标记为 `example_only_not_default_active`。默认激活 backend 仍是 `codex_cli`；非默认 backend 只有在 request explicit executor 或 `OPL Runtime Manager` / handoff default executor 显式配置时才生效。

`Hermes` runtime / profile catalog 不是当前 provider 配置引用层；如旧资料仍出现，只能作为 provenance、diagnostic source ref、fixture 或负向 guard 读取。`provider`、`base_url`、API key、model list 这类 provider catalog 不写入 domain repo，也不写成 domain-owned executor truth。

## Machine-Readable Mirror

这组默认值不从本文读取，已经落到机器合同与 schema：

- `contracts/opl-framework/family-executor-adapter-defaults.json`
- `contracts/opl-framework/domain-onboarding-readiness.schema.json` 的 `executionModelDeclaration`

这意味着家族默认执行器不是“叙述口径”；repo-tracked machine-readable contract 才是默认值、canonical backend、stage-level policy、forbidden backend 和 non-default boundary 的锚点。

## 与 Hermes 的边界

`Hermes` 在当前家族 active surface 中只保留一个窄角色：`hermes_agent` 显式非默认 executor adapter/backend。它不承担 runtime substrate、provider bridge、Gateway cron、provider proof surface、默认执行器、readiness path 或兼容 fallback。

当前 `Hermes-Agent` 语义必须非常严格：

- `hermes_agent` 属于 `canonical_executor_backends`，状态为显式非默认 / experimental
- `--executor hermes_agent` 只有在 request、stage attempt 或 runtime handoff 显式选择时生效
- 必须返回 `opl_agent_execution_receipt`，并证明完整 agent loop、tool events、session/receipt 边界
- 缺少 binary、JSON receipt、full-loop proof 或 tool-event proof 时必须 fail-closed，不能转成 Codex fallback
- 任何旧 `Hermes` / `Gateway` / `frontdoor` 名称不得恢复为安装、更新、readiness、provider、default executor 或兼容接口

## Family 读取方式

当前 admitted family、default executor evidence、non-default executor diagnostics 和 production evidence tail 都由 live contract / CLI / read-model 决定。默认读取顺序：

1. 用 `contracts/opl-framework/family-executor-adapter-defaults.json` 读取默认 executor、canonical backend、stage-level policy fields、non-default equivalence 和 forbidden backend 语义。
2. 用 `src/agent-executor.ts` 与 `opl executor doctor --executor <kind> --json` 读取本机 executor binary 是否可用、capability aperture、fallback policy 和 executor envelope。
3. 用 stage attempt launch gate 或 `family-runtime attempt create` 相关测试确认非默认 executor 缺少 `executor_binding_ref` 时 fail-closed。
4. 用 `opl agents conformance --family-defaults --json` 读取当前 family structural conformance 和 authority boundary。

本文不冻结 MAS/MAG/RCA/OMA 的当前 repo 状态、branch、具体 receipt、CLI 输出计数或某个 non-default binary 是否安装。`executor doctor` 对非默认 executor 返回 missing binary 只表示当前本机不能执行该 adapter；它同时证明 fallback 不允许。它不能被写成该 adapter 已退役、不可作为 future explicit adapter、或可以由 Codex 代跑。

## 统一 Contract 要求

Admitted domain / agent repos 后续都应在各自的 `executor_routing_contract` 或等价 surface 中，显式表达同一组 family 默认字段：

- `default_executor_name = codex_cli`
- `default_executor_mode = autonomous`
- `default_model = inherit_local_codex_default`
- `default_reasoning_effort = inherit_local_codex_default`
- `executor_labels.codex_cli = Codex CLI`
- `executor_labels.hermes_agent = Hermes-Agent`
- `executor_labels.claude_code = Claude Code`
- `executor_labels.antigravity_cli = Antigravity CLI`
- `executor_statuses.codex_cli = default`
- `executor_statuses.hermes_agent = experimental`
- `executor_statuses.claude_code = experimental`
- `executor_statuses.antigravity_cli = experimental_non_default_explicit_adapter`
- `chat_completion_only_executor_forbidden = true`
- `hermes_agent_requires_full_agent_loop = true`
- `hermes_agent_not_provider_or_gateway_surface = true`
- `non_default_executor_forbids_silent_codex_fallback = true`
- `canonical_executor_backends = [codex_cli, hermes_agent, claude_code, antigravity_cli]`
- `stage_level_executor_policy` 必须支持 `executor_kind`、`model`、`reasoning_effort`、`provider`、`executor_binding_ref`、`executor_labels`、`required_capabilities` 与 `receipt_requirements`
- `execution_shapes.structured_call` 与 `execution_shapes.agent_loop` 必须分开表达
- `simple_llm_backend_forbidden = true`
- `openai_compatible_gateway_backend_forbidden = true`

如果某个仓需要声明 canonical 非默认 executor 路线，也必须显式标明它是：

- `migration_bridge`
- `experimental`
- `regression_oracle`

而不是继续和默认主线混写。已退役的 Hermes provider / Gateway / frontdoor / proof-provider / readiness / compatibility 路线不属于可保留过渡路线；只允许留在 history/provenance/diagnostic/negative-guard/tombstone 语境。
