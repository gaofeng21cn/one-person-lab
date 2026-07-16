# Hermes-Agent 备选执行器评估

Owner: `One Person Lab`
Purpose: `references_runtime_substrate_hermes_agent_executor_evaluation`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 当前读法

本文只定义 `hermes_agent` 作为显式非默认 executor adapter/backend 时的评估规则，不冻结某天的本机安装状态、binary 可用性、proof 结果、模型配置、reasoning effort 或 family conformance 计数。当前机器真相按 `contracts/opl-framework/family-executor-adapter-defaults.json`、`src/modules/runway/agent-executor.ts`、`src/modules/runway/foundry-provider-stage-run.ts`、stage attempt launch gate / executor binding tests、agent-executor tests、`opl executor doctor --executor <kind> --json`、`opl agents conformance --family-defaults --json` 和 `opl framework readiness --family-defaults --json` 读取。

当前口径是：`hermes_agent` 是 OPL family canonical executor backend 之一，但只作为显式非默认 adapter/backend 使用。它和 `claude_code`、`antigravity_cli` 一样只承诺接口连接、生命周期、receipt、audit 与 fail-closed；不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。本文的评估规则用于守住这个非等价边界；其他非默认 adapter 也受同一 receipt/audit 非等价边界约束。旧 Hermes provider / Gateway / readiness / compatibility surface 已退出 active/default path，不属于本文要保留的执行器接口。

## 目的

这份文档只回答一件事：

- 当 `Hermes-Agent` 被拿来当 `Codex CLI` 的备选执行器时，什么样的调用方式算合格评估证据。

它不做的事：

- 不改写当前 family 默认执行器
- 不把 runtime substrate 已落地，误写成 concrete executor 已等价
- 不把 generic chat relay、单次 chat completion，误写成 `Hermes-Agent` 备选执行器已经成立

## 稳定评估前提

- family 默认 concrete executor 仍然是 `Codex CLI`
- family 默认执行模式由 contract、source 与 executor doctor read model 读取；本文不冻结本机模型、reasoning effort 或 thinking 配置
- `hermes_agent` 是显式非默认 canonical executor adapter/backend，不是默认执行器
- `stage_attempt_executor_policy` 可以显式绑定非默认 executor、模型、reasoning effort 与 provider；非默认 executor 必须携带 `executor_binding_ref` 并产出独立 receipt / audit
- `Hermes-Agent` provider / Gateway / readiness / compatibility 旧面已经退役，不能被写成当前 runtime substrate 或兼容 fallback
- `hermes_agent` 执行路线只允许写成 `experimental`、`migration_bridge` 或 `regression_oracle`
- 本机 `executor doctor` 若返回 `surface_not_found` 或 binary missing，只表示当前环境不能执行该 adapter 且 fallback 不允许；它不是 adapter 已退役、可以由 Codex 代跑或可忽略 binding/receipt proof 的证据

## 什么样的路线算合格评估对象

只有下面两类入口，才允许进入评估：

1. 直接实例化 `Hermes AIAgent` 并跑完整 agent loop
2. 调用经证实会真实创建 `AIAgent`、并持续输出 terminal event stream 的 `/v1/runs`

这两类评估都必须满足：

- 输入是完整 service-entry / task envelope，而不是手写拆成很多固定小步骤
- agent 需要自己规划、调用工具、继续推进与收口
- 运行过程中要有真实 `run_id`、event stream、terminal event、error / interrupt surface

## 什么样的路线不进入评估

以下形式一律不算：

- 一步一步 chat
- 单次 `chat completion`
- chat relay
- repo-local planner 把大任务先拆成固定小步骤，再逐步喂给模型
- `provider = custom`、`api_mode = chat_completions`，只是在配置里写了 `xhigh`
- 把 `/v1/runs` 只当作一次性模型代理，而不是完整 agent loop

## 必须证明的能力

评估至少要同时覆盖这几组维度：

### 1. 自主权

- 能否像 `Codex CLI` 的 `autonomous` 模式一样接收完整任务目标
- 能否自主拆解、连续执行、根据中间结果调整下一步
- 能否避免退化成“人工编排的小步 chat pipeline”

### 2. 工具与技能

- terminal / file 工具是否真实可用
- browser / web 学习能力是否真实可用
- skills / MCP 工具扩展是否真实可用
- 这些能力是 agent loop 内原生可调，还是 repo-local 外挂拼接

### 3. 委派与并行

- 是否存在真实 child-agent / `delegate_task` / 等价能力
- 这些委派能力是否属于 agent runtime 自身，而不是 repo-local orchestration 假装出来的并行

### 4. 会话与记忆

- session 持久化、resume、memory、search 是否真实成立
- 这些能力是否和 run / event / interrupt surface 保持同一 truth

### 5. reasoning 语义真实性

- `thinking` / `reasoning_effort` 是否真实传到 provider
- `xhigh` 是否只是配置表面可写，还是 provider 侧真正生效
- 若走 `custom + chat_completions`，必须明确证明 reasoning extra body 没有被静默吞掉

### 6. 可观察性与 fail-closed

- 是否有稳定的 `run_id`
- 是否有结构化 event stream
- 是否有 terminal completion / failure signal
- 缺少关键评估证据时是否会 fail-closed，而不是静默降级成普通 chat

## 与 Codex CLI 的比较口径

当前家族的统一判断仍然是：

- `Codex CLI` 的 `autonomous` 模式仍是质量最稳、路径最清楚的默认 concrete executor
- `Hermes-Agent` 的现实意义主要在多 provider 兼容性、runtime stack 一体化、以及长期备选执行器潜力
- 评估通过后，也只代表“显式非默认执行器接口可用且证据充分”，不代表替换 family 默认，也不代表质量与 `Codex CLI` 等价

## 推荐执行顺序

1. 先在独立 worktree / 独立评估线内跑，不污染默认主线
2. 先选与 `Codex CLI` 当前 reference implementation 同类的任务目标
3. 只允许走完整 `AIAgent` loop 或真实 `/v1/runs`
4. 对比任务完成质量、工具使用、自主性、error handling、resume / memory、delegate 能力
5. 只有 full-loop、reasoning、event 这三组评估证据都成立，才允许讨论是否增加 family backup route

## 允许的 closeout 结论

- `FULL_AGENT_LOOP_PROOF_PASSED_AS_BACKUP_EXECUTOR`
- `FULL_AGENT_LOOP_PRESENT_BUT_NOT_YET_EQUIVALENT_TO_CODEX`
- `PROVIDER_REASONING_NOT_PROVED_KEEP_DEFAULT`
- `CHAT_RELAY_ONLY_REJECTED_AS_NON_HERMES_NATIVE`

## 当前对应关系

- 当前默认主线：`docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- 历史四仓执行器 follow-up：`docs/history/process/convergence-governance/four-repo-executor-follow-up-and-hermes-evaluation-2026-04.md`
- 当前顶层状态：`docs/status.md`
