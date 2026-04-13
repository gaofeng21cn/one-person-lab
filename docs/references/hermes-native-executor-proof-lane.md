# Hermes-native 备选执行器 Proof Lane

状态锚点：`2026-04-13`

## 目的

这份文档只回答一件事：

- 当 `Hermes-Agent` 被拿来当 `Codex CLI autonomous` 的备选执行器时，什么样的调用方式才算真实 proof，什么样的不算。

它不做的事：

- 不改写当前 family 默认执行器
- 不把 runtime substrate 已落地，误写成 concrete executor 已等价
- 不把 generic chat relay、单次 chat completion，误写成 `Hermes-native`

## 当前冻结前提

- family 默认 concrete executor 仍然是 `Codex CLI autonomous`
- 默认模型与默认 reasoning effort / thinking 仍继承本机 `Codex` 默认配置
- `Hermes-Agent` 在当前家族里首先承担 runtime substrate / orchestration，而不是自动等于默认执行器
- `Hermes-native` proof 通过之前，任何 Hermes 路线都只允许写成 `experimental`、`migration_bridge` 或 `regression_oracle`

## 什么才算 Hermes-native

只有下面两类入口，才允许进入 proof：

1. 直接实例化 `Hermes AIAgent` 并跑完整 agent loop
2. 调用经证实会真实创建 `AIAgent`、并持续输出 terminal event stream 的 `/v1/runs`

这两类 proof 都必须满足：

- 输入是完整 service-entry / task envelope，而不是手写拆成很多固定小步骤
- agent 需要自己规划、调用工具、继续推进与收口
- 运行过程中要有真实 `run_id`、event stream、terminal event、error / interrupt surface

## 什么不算 Hermes-native

以下形式一律不算：

- 一步一步 chat
- 单次 `chat completion`
- chat relay
- repo-local planner 把大任务先拆成固定小步骤，再逐步喂给模型
- `provider = custom`、`api_mode = chat_completions`，只是在配置里写了 `xhigh`
- 把 `/v1/runs` 只当作一次性模型代理，而不是完整 agent loop

## 必须证明的能力

proof 至少要同时覆盖这几组维度：

### 1. 自主权

- 能否像 `Codex CLI autonomous` 一样接收完整任务目标
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
- 缺少关键 proof 时是否会 fail-closed，而不是静默降级成普通 chat

## 与 Codex CLI 的比较口径

当前家族的统一判断仍然是：

- `Codex CLI autonomous` 仍是质量最稳、路径最清楚的默认 concrete executor
- `Hermes-Agent` 的现实意义主要在多 provider 兼容性、runtime stack 一体化、以及长期备选执行器潜力
- proof 通过后，也只代表“具备备选执行器候选资格”，不代表立刻替换 family 默认

## 推荐执行顺序

1. 先在独立 worktree / 独立 proof lane 内跑，不污染默认主线
2. 先选与 `Codex CLI autonomous` 当前 reference implementation 同类的任务目标
3. 只允许走完整 `AIAgent` loop 或真实 `/v1/runs`
4. 对比任务完成质量、工具使用、自主性、error handling、resume / memory、delegate 能力
5. 只有 full-loop proof、reasoning proof、event proof 都成立，才允许讨论是否增加 family backup route

## 允许的 closeout 结论

- `FULL_AGENT_LOOP_PROOF_PASSED_AS_BACKUP_EXECUTOR`
- `FULL_AGENT_LOOP_PRESENT_BUT_NOT_YET_EQUIVALENT_TO_CODEX`
- `PROVIDER_REASONING_NOT_PROVED_KEEP_DEFAULT`
- `CHAT_RELAY_ONLY_REJECTED_AS_NON_HERMES_NATIVE`

## 当前对应关系

- 当前默认主线：`docs/references/family-executor-adapter-defaults.md`
- 当前四仓执行器 follow-up：`docs/references/four-repo-executor-follow-up-and-hermes-evaluation.md`
- 当前顶层状态：`docs/status.md`
