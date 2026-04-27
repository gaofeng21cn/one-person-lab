# 家族 Executor Adapter 默认口径

## 目的

这份参考文档只做一件事：把 `OPL` 家族当前统一的 `executor-adapter` 默认口径冻结清楚，避免后续再把 runtime substrate、domain authority 与具体执行器混成一层。

当前统一的是：

- `runtime substrate / orchestration` 的上层语义
- `executor-adapter` 的默认 route 与命名边界

当前还没有统一的是：

- 三个 domain 仓内部的全部业务对象与阶段语义
- 所有实验路线的最终结论

## 当前冻结默认

- 默认执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型：继承本机 `Codex` 默认配置
- 默认 reasoning effort / thinking：继承本机 `Codex` 默认配置
- 默认语义：必须是能自主拆解、规划、执行、继续推进的 agent loop
- `Hermes-Agent` 保留正式名称，当前执行路线状态写作 `experimental`
- 家族一等 executor backend 只冻结为 `codex_cli` 与 `hermes_agent`
- 调用形态单独写作 `execution_shape`：`structured_call` 表示 schema 约束下的一次性结构化输入输出；`agent_loop` 表示带事件、工具使用、修复和 review-loop proof 的多步 agent run
- `host_agent` 只作为旧合同输入兼容别名映射到 `codex_cli`；新的 public contract 不再输出它
- `simple_llm` 与 `openai_compatible_gateway` 不作为家族一等 backend；不同 provider/model 的适配继续交给 domain 仓或外部 runtime，例如 `Hermes-Agent`

这里说的 `Codex CLI` 默认路线，指的是把任务交给 `autonomous` agent loop 去自主推进，而不是人工先把任务拆成固定小步骤再逐步补空。

## Machine-Readable Mirror

这组默认值现在不再只停留在参考文档中，也已经同步冻结到：

- `contracts/opl-gateway/family-executor-adapter-defaults.json`
- `contracts/opl-gateway/domain-onboarding-readiness.schema.json` 的 `executionModelDeclaration`

这意味着家族默认执行器不再只是“叙述口径”，而是已经有 repo-tracked 的 machine-readable 锚点。

## 与 Hermes 的边界

`Hermes` 在家族里继续承担的是 runtime substrate / orchestration：

- session
- resume / interrupt
- memory
- scheduler
- long-running runtime management

它不自动等于默认执行器。

当前 `Hermes-Agent` 执行路线只算实验路线，而且语义必须非常严格：

- 满足 guardrail 的唯一形态，是完整的 `Hermes AIAgent` agent loop
- 当前路线状态统一写作 `experimental`
- 在这条路线完成独立评估前，相关实现只允许被记作迁移桥、实验路线或回归对照

## 三仓当前映射

- `Med Auto Science / MedDeepScientist`
  - 当前最成熟的参考实现
  - 已经以 `Codex CLI` 的 `autonomous` 模式作为真实可证实的底层执行器
- `RedCube AI`
  - `Codex CLI` 默认路线已经吸收回 `main`
  - 当前 repo-tracked truth 已同时包含 upstream runtime-owner cutover 与 repo-verified `product frontdesk / federated product entry / session continuity`
  - 现有 Hermes `/v1/runs` relay 继续只算迁移桥
- `Med Auto Grant`
  - 真实上游 `Hermes-Agent` runtime substrate 已可运行
  - `critique` route 已 landed 到 `Codex CLI`
  - docs / contract 已与默认模型策略一起收口

## 统一 Contract 要求

三个 domain 仓后续都应在各自的 `executor_routing_contract` 或等价 surface 中，显式表达同一组 family 默认字段：

- `default_executor_name = codex_cli`
- `default_executor_mode = autonomous`
- `default_model = inherit_local_codex_default`
- `default_reasoning_effort = inherit_local_codex_default`
- `executor_labels.codex_cli = Codex CLI`
- `executor_labels.hermes_agent = Hermes-Agent`
- `executor_statuses.codex_cli = default`
- `executor_statuses.hermes_agent = experimental`
- `chat_completion_only_executor_forbidden = true`
- `hermes_agent_requires_full_agent_loop = true`
- `canonical_executor_backends = [codex_cli, hermes_agent]`
- `execution_shapes.structured_call` 与 `execution_shapes.agent_loop` 必须分开表达
- `simple_llm_backend_forbidden = true`
- `openai_compatible_gateway_backend_forbidden = true`

如果某个仓需要保留过渡路线，也必须显式标明它是：

- `migration_bridge`
- `experimental`
- `regression_oracle`

而不是继续和默认主线混写。
