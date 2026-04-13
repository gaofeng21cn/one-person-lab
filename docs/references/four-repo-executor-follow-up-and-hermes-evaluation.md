# 四仓执行器后续任务与 Hermes-Agent 备选执行器评估

状态锚点：`2026-04-13`

## 这份文档解决什么

这份文档只回答三件事：

1. 家族默认执行器已经统一之后，当前主线还剩哪些 honest next steps。
2. 四仓与 `MedDeepScientist` 在文档层面还要补哪些同步。
3. `Hermes-Agent` 作为备选执行器时，当前真实能力上限和与 `Codex CLI` 的差异是什么。

这里默认把“四仓”理解为：

- `one-person-lab / OPL`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

其中 `med-deepscientist` 不是顶层“四仓公开主仓”之一，但它是医学线当前真实的受控执行后端，因此凡是涉及 `Med Auto Science` 最底层怎么调用 AI，都必须把它一并纳入事实面。

## 当前已完成基线

### `OPL`

`OPL` 当前冻结的是 family-level executor contract，而不是 domain execution owner：

- 家族默认执行器：`Codex CLI autonomous`
- 默认模型：`inherit_local_codex_default`
- 默认 reasoning effort：`inherit_local_codex_default`
- `Hermes-native` 只有完整 `Hermes AIAgent` agent loop 才算成立

这一层现在已经同时落在：

- 参考文档 `docs/references/family-executor-adapter-defaults.md`
- machine-readable contract `contracts/opl-gateway/family-executor-adapter-defaults.json`
- onboarding execution-model gate `contracts/opl-gateway/domain-onboarding-readiness.schema.json`

### `Med Auto Science`

`Med Auto Science` 自己并不直接发模型请求。当前 repo-tracked 真实链路是：

- `med_autoscience.runtime_transport.hermes`
- `med_autoscience.runtime_transport.med_deepscientist`
- `MedDeepScientist CodexRunner`
- `codex exec autonomous agent loop`

也就是说，`MAS` 当前承担的是 outer runtime gate + controlled backend delegation，而不是 repo-local 单次 chat 调用。

### `MedDeepScientist`

医学线当前最底层真正落到 AI 的链路，在 `MedDeepScientist`：

- `src/deepscientist/daemon/api/handlers.py` 构造 `RunRequest`
- `runner.run(request)` 调用默认 `CodexRunner`
- `src/deepscientist/runners/codex.py::CodexRunner._build_command()` 组装真实命令
- `subprocess.Popen(...)` 执行本机 `codex exec`

当前默认策略已经收口为：

- `default_runners().codex.model = "inherit"`
- `default_runners().codex.model_reasoning_effort = ""`
- 只有显式 override 才会传 `--model` 或 reasoning 参数
- `inherit_local_codex_default` 不再被误传成 `--model`

这一层因此已经和 family 默认执行器 contract 对齐；本轮只补根级 `status / architecture` 文档真相。

### `Med Auto Grant`

`Med Auto Grant` 当前 critique 路线的真实最底层调用已经是：

- `build_critique_execution_document()`
- `run_codex_exec()`
- `subprocess.run(codex exec --json --ephemeral --cd ... --output-last-message ...)`

当前默认策略也已经是：

- 未设置 `MED_AUTOGRANT_CODEX_MODEL` 时，不传 `--model`
- 未设置 `MED_AUTOGRANT_CODEX_REASONING_EFFORT` 时，不传 reasoning override
- 因此默认继承本机 Codex 配置

而且它的 docs / contract 也已经和这条 truth 对齐，不再继续把 critique 写成 `pending / handoff-required`。

### `RedCube AI`

`RedCube AI` 的 `Codex CLI autonomous` 默认执行器实现已经在待吸收提交中完成，执行形态同样是把完整 service entry envelope 直接交给 `codex exec` 的 agent loop，而不是 repo-local 小步 chat。

当前唯一 honest blocker 是：

- 主 checkout `main` 上仍有重叠本地改动
- 因此这条已完成实现还不能安全直接吸收到主线公开 truth

## 当前仍待完成的主线

### 一、把 `RedCube AI` 的待吸收 Codex 默认执行器改动安全并回 `main`

这条已经不是设计或实现问题，而是安全吸收问题。

必须做的是：

- 先消掉主 checkout 上与待吸收提交重叠的本地状态
- 再吸收已经完成的 `Codex CLI autonomous` 默认执行器提交
- 同步 `README*`、`docs/status.md`、`docs/architecture.md` 与 `contracts/runtime-program/current-program.json`

### 二、在 `RedCube` 吸收后刷新中央 reference sync 面

`OPL` 顶层当前最容易继续漂移的不是 core truth，而是 central reference sync 面。

下一次 honest 刷新时，应重点处理：

- `docs/references/ecosystem-status-matrix.md`
- 仍引用旧 snapshot 的顶层参考入口
- 与 `RedCube` 主线吸收状态直接相关的 central reference companion

### 三、继续要求三个 domain 仓沿同一组 machine-readable family defaults 收口

这一步现在已经从“只有参考文档”变成“有 contract-first 锚点”。
后续真正要守住的是：

- 不允许再把 repo-local `gpt-5.4 / xhigh` 之类 pin 写回 family 默认
- 不允许把 chat relay / 单次 chat completion 写成默认执行器
- 不允许把 `Hermes-native` 的语义放松成非 full-agent-loop

### 四、最后才开启 `Hermes-native` proof lane

这条线现在仍只算实验路线。
后续如果要做，必须满足：

- 入口不是一步一步 chat
- 也不是把 `/v1/chat/completions` 当一次性模型代理
- 而是直接调用 `Hermes AIAgent` full agent loop，或明确等价于该 loop 的 `/v1/runs` run surface

## 文档同步清单

### 本轮已同步

- `OPL`
  - `docs/status.md`
  - `docs/references/family-executor-adapter-defaults.md`
  - `docs/references/four-repo-executor-follow-up-and-hermes-evaluation.md`
  - `contracts/opl-gateway/family-executor-adapter-defaults.json`
  - `contracts/opl-gateway/README*.md`
  - `docs/plans/2026-04-13-family-executor-adapter-next-phase.md`
- `Med Auto Science`
  - 根级 `status / architecture / runtime interface` 已与真实执行链对齐
- `MedDeepScientist`
  - root `status / architecture` 本轮同步到“inherit local Codex default + CodexRunner -> codex exec”真相
- `Med Auto Grant`
  - 根级 `status / architecture / decisions / runtime-program current truth` 已对齐 critique `Codex CLI autonomous`

### 仍待同步

- `RedCube AI`
  - 主 checkout `main`
  - `README*`
  - `docs/status.md`
  - `docs/architecture.md`
  - `contracts/runtime-program/current-program.json`

原因很简单：

- 实现已经完成
- 但主 checkout 还没安全吸收，所以 repo-tracked public truth 不能提前写成已 landed

## Hermes-Agent 作为备选执行器：已经具备什么

### 它不是只有 chat relay

从上游 `hermes-agent` 当前实现看，至少已经有三种“直接调用 agent loop”的方式：

1. 直接在 Python 中实例化 `run_agent.AIAgent(...)` 并调用 `run_conversation(...)`
2. 启动 `hermes gateway` 后调用 `POST /v1/runs`
3. 调用 API server 的 `POST /v1/chat/completions` 或 `POST /v1/responses`

其中最接近“直接让 Hermes 自己跑一个 autonomous run”的是 `/v1/runs`：

- gateway 会创建 `AIAgent`
- agent 异步执行 `run_conversation(...)`
- `/v1/runs/{run_id}/events` 会持续输出结构化事件流

### 它已经具备真实 agent 自治能力

当前上游代码和文档明确显示，`Hermes-Agent` 已经具备：

- terminal / file / web / browser 工具
- memory / session search
- skills system
- `delegate_task` 子代理并行
- MCP 工具扩展
- cron / scheduler
- `SessionDB` 持久会话
- gateway / API server / ACP 多入口

所以它不是“只能一步一步 chat”的薄壳，而是一个真正的 tool-calling agent runtime。

### 它的多 provider 兼容性强于 `Codex CLI`

上游当前明确支持：

- `provider: custom`
- OpenAI-compatible `base_url`
- named custom providers
- 多 provider 切换与 fallback

这意味着：

- `Hermes-Agent` 更适合作为后续跨模型、跨供应商的备选执行器
- 它的现实意义主要在“兼容性上限”，而不是“今天就能无痛平替 Codex CLI”

## Hermes-Agent 与 Codex CLI 的关键差异

### 一、当前 family 落地成熟度：`Codex CLI` 更强

在 `OPL` 这一系列仓里，当前已经 repo-verified、质量稳定、路径清楚的默认执行器，仍然是 `Codex CLI autonomous`。

`Hermes-Agent` 当前在这几个仓里的主要已落地点，仍然是：

- runtime substrate
- gateway / API surface
- run / event / session substrate
- 局部 relay / pilot / proof gate

它还没有被 repo-verified 成“当前就能替代 Codex CLI 的 family default concrete executor”。

### 二、技能和工具生态都强，但不是同一套体系

`Hermes-Agent` 有自己的：

- `~/.hermes/skills/`
- toolsets
- browser / terminal backends
- delegate / cron / memory / gateway 体系

但它并不天然等于当前本机 Codex 的 skill 目录、tool semantics 和 CLI 行为。
所以即使后续选它做备选执行器，也不能把它理解成“给 Codex CLI 套个壳子”。

### 三、`xhigh` 与 `custom + chat_completions` 不能想当然

上游 `Hermes-Agent` 在配置层确实接受 `reasoning_effort = xhigh`，但要非常注意实际传输路径：

- 如果走 `codex_responses`，reasoning 会被显式传给兼容该语义的后端
- 如果走 generic `chat_completions`，只有 provider 明确支持 reasoning extra body 时，这个字段才会真实生效

这意味着：

- `Hermes-Agent` 的配置表面可以写 `xhigh`
- 但 `provider: custom + api_mode: chat_completions` 不天然等于“真的拿到了 Codex CLI 级别的高质量 reasoning + tool use”

所以当前 family 的正确策略仍然是：

- 默认执行器继续坚持 `Codex CLI autonomous`
- `Hermes-Agent` 作为后续多 provider 备选执行器去做真实 proof，而不是先在主线上想当然平替

## 建议开工顺序

1. 当前批次先落地 OPL family executor contract、更新中央文档，并同步 `MedDeepScientist` 根级 truth。
2. 随后处理 `RedCube AI` 主 checkout 的安全吸收条件，把已完成的 `Codex CLI autonomous` 默认执行器并回 `main`。
3. 在 `RedCube` 吸收完成后，再刷新 `OPL` 顶层 central reference sync 面。
4. 最后才开启 `Hermes-native` proof lane，而且只允许基于真实 `AIAgent` / `/v1/runs` full-agent-loop 路线。

## 一句话结论

当前最诚实的判断是：

- 家族默认 concrete executor 仍应坚持 `Codex CLI autonomous`
- `Hermes-Agent` 已经具备真实 agent loop、工具自治、skills、browser、subagent 与多 provider 兼容能力，因此非常有资格成为后续备选执行器
- 但在这几个仓里，它还没有被 repo-verified 成“当前就能平替 Codex CLI 的默认 concrete executor”
- 因此下一步正确动作不是重新争论方向，而是先把 `RedCube` 吸收、中央 reference sync 与 `Hermes-native` proof lane 分 tranche 做完
