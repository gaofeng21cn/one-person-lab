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

- 默认执行器：`Codex CLI autonomous`
- 默认模型：继承本机 `Codex` 默认配置
- 默认 reasoning effort / thinking：继承本机 `Codex` 默认配置
- 默认语义：必须是能自主拆解、规划、执行、继续推进的 agent loop

这里说的 `Codex CLI autonomous`，不是一次性的 chat completion，也不是把大任务先拆成手写的固定小步骤再让模型逐步补空。
它要求 `Executor Adapter` 把任务交给一个可以自主决策推进的 Codex agent route。

## 与 Hermes 的边界

`Hermes` 在家族里继续承担的是 runtime substrate / orchestration：

- session
- resume / interrupt
- memory
- scheduler
- long-running runtime management

它不自动等于默认执行器。

当前 `Hermes-native` 只算实验路线，而且语义必须非常严格：

- 只有完整的 `Hermes AIAgent` agent loop 才能写成 `Hermes-native`
- 一步一步 chat 不是 `Hermes-native`
- 单次 chat completion 不是 `Hermes-native`
- chat relay 不是 `Hermes-native`
- 把 `/v1/runs` 只当成一次性模型代理，也不是 `Hermes-native`

在真实 `Hermes-native` 路线被证明之前，这些实现都只能被记作迁移桥、实验路线或回归对照。

## 三仓当前映射

- `Med Auto Science / MedDeepScientist`
  - 当前最成熟的参考实现
  - 已经以 `Codex CLI autonomous` 作为真实可证实的底层执行器
- `RedCube AI`
  - 现有 Hermes `/v1/runs` relay 仍是迁移桥
  - 不应继续被记作默认执行器主线
  - 默认路线应切到 `Codex CLI autonomous`
- `Med Auto Grant`
  - 真实上游 `Hermes-Agent` runtime substrate 已可运行
  - 但 authoring 主线还没有因为 substrate 落地就自动完成
  - 在 `critique` 等 authoring route 切到 `Codex CLI autonomous` 之前，还不能把默认 authoring 主线写成已完成

## 统一 contract 期待

三个 domain 仓后续都应在各自的 `executor_routing_contract` 或等价 surface 中，显式表达同一组 family 默认字段：

- `default_executor = codex_cli_autonomous`
- `default_model = inherit_local_codex_default`
- `default_reasoning_effort = inherit_local_codex_default`
- `chat_completion_only_executor_forbidden = true`
- `hermes_native_requires_full_agent_loop = true`

如果某个仓需要保留过渡路线，也必须显式标明它是：

- `migration_bridge`
- `experimental`
- `regression_oracle`

而不是继续和默认主线混写。
