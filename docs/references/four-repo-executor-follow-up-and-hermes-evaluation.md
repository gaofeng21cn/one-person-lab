# 四仓执行器后续任务与 Hermes-Agent 备选执行器评估

状态锚点：`2026-04-13`

## 这份文档解决什么

这份文档只回答三件事：

1. 除了“家族默认执行器统一到 `Codex CLI autonomous`”之外，当前主线还有哪些待完成事项。
2. 四个公开主仓是否还存在文档 truth 未同步的问题。
3. `Hermes-Agent` 作为备选执行器时，到底是不是只有简单 chat relay，还是已经具备可直接调用的 agent loop、工具自治和技能体系。

这里默认把“四仓”理解为：

- `one-person-lab / OPL`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

其中 `med-deepscientist` 不计入“四仓公开主仓”，但它是医学线当前真实的受控执行后端，因此凡是涉及 `Med Auto Science` 最底层怎么调用 AI，都必须把它一并纳入事实面。

## 当前执行真相

### `OPL`

`OPL` 当前冻结的是家族级默认 contract，不直接承担 domain execution owner：

- 家族默认执行器：`Codex CLI autonomous`
- 默认模型选择：`inherit_local_codex_default`
- 默认 reasoning effort：`inherit_local_codex_default`
- `Hermes-native` 只允许指完整 `Hermes AIAgent` agent loop，不允许拿 chat relay、单次 chat completion 或一步一步 chat 冒充

`OPL` 当前真正持有的是顶层 gateway、handoff、front desk 与 federation truth，不直接落到某个 domain 的最底层 AI 调用函数。

### `Med Auto Science`

`Med Auto Science` 自己的 `runtime_transport/hermes.py` 当前并不直接发模型请求。它做的是：

- 先通过 `inspect_hermes_runtime_contract(...)` 校验 external `Hermes-Agent` runtime 是否 ready
- 再把 `create_quest()`、`resume_quest()`、`pause_quest()`、`stop_quest()`、`get_quest_session()` 等动作委托给 `med_autoscience.runtime_transport.med_deepscientist`

也就是说，`MAS` 当前是“outer runtime gate + controlled backend delegation”，不是“仓内自己直接调一次 OpenAI Chat API 就结束”。

### `MedDeepScientist` 补充：医学线最底层实际 AI 调用

医学线当前最底层真正落到 AI 的链路，在 `MedDeepScientist`：

- daemon / API 入口会在 `src/deepscientist/daemon/api/handlers.py` 构造 `RunRequest`
- 随后调用 `runner.run(request)`
- `runner` 的默认实现是 `CodexRunner`
- `CodexRunner.run()` 会先准备 `CODEX_HOME`、技能目录与内建 MCP
- 然后由 `CodexRunner._build_command()` 组装真实命令
- 最后 `subprocess.Popen(...)` 执行本机 `codex exec`

当前组出来的命令语义是：

- `codex --search exec --json --cd <workspace> --skip-git-repo-check -`
- 按需追加 `--profile`
- 按需追加 `--model`
- 按需追加 `-c model_reasoning_effort="<...>"`
- 按需追加 `--sandbox`

因此医学线底层不是“小步骤单次 LLM 调用”。
它交给的是一个可以自主拆解、反复调用工具、持续推进的 `Codex` agent loop。

但这里还有一个当前明确未收口的点：

- `src/deepscientist/config/models.py` 的 `default_runners()` 仍把 `model = "gpt-5.4"`、`model_reasoning_effort = "xhigh"` 写成默认值
- `src/deepscientist/daemon/api/handlers.py` 里 body 未显式传值时，仍会回落到 `runner_cfg.get("model", "gpt-5.4")`，reasoning 也仍会回落到 `xhigh`
- `docs/en/00_QUICK_START.md`、`docs/en/01_SETTINGS_REFERENCE.md`、`docs/en/15_CODEX_PROVIDER_SETUP.md` 仍在把这套 pin 写成默认事实

所以医学线当前虽然已经是 `codex exec` agent loop，但“默认继承本机 Codex 配置”这件事，在 `MedDeepScientist` 这一层仍没有完全收口，仍是剩余任务。

### `RedCube AI`

`RedCube AI` 在已完成但尚未吸收到主 checkout `main` 的提交 `c1f584c` 上，最底层 concrete executor 已切到本机 `Codex CLI`：

- `runDeliverableRoute()`
- `executeServiceEntryViaCodexCli()`
- `spawnSync(codex exec --json --ephemeral --cd ... --output-last-message ...)`

它当前不是把一个任务拆成固定小步逐次 chat。
而是把 RedCube service entry envelope 直接交给 `codex exec` 去自主执行。

当前默认策略已经是：

- 不固定 `--model`
- 不固定 reasoning
- 未设置 `REDCUBE_CODEX_MODEL` / `REDCUBE_CODEX_REASONING_EFFORT` 时，继承本机 Codex 默认配置

当前剩余问题不是实现本身，而是吸收阻塞：

- `redcube-ai` 主 checkout 有其他对话或用户本地脏改动
- 其中有文件与本次提交重叠
- 所以当前不能安全直接把 `c1f584c` 吸收到主 checkout `main`

### `Med Auto Grant`

`Med Auto Grant` 当前 critique 路线的真实最底层调用已经是：

- `build_critique_execution_document()`
- `run_codex_exec()`
- `subprocess.run(codex exec --json --ephemeral --cd ... --output-last-message ...)`

这里同样不是一步一步 chat。
`run_codex_exec()` 会直接把完整 critique prompt 交给 `codex exec` 的 agent loop。

当前默认策略也已经是：

- 未设置 `MED_AUTOGRANT_CODEX_MODEL` 时，不传 `--model`
- 未设置 `MED_AUTOGRANT_CODEX_REASONING_EFFORT` 时，不传 reasoning override
- 因此默认继承本机 Codex 配置

但 `MedAutoGrant` 当前存在明显的 docs / contract 漂移：

- 代码层已经有 `src/med_autogrant/codex_cli.py`
- 代码层已经有 `src/med_autogrant/critique_executor.py`
- 但 `docs/status.md`、`docs/architecture.md`、`docs/decisions.md`、`contracts/runtime-program/current-program.json` 仍在把 `critique` 写成 `pending / handoff-required`

这已经不是“实现没做完”，而是“实现前进了，文档 truth 还停在旧阶段”。

## 除默认执行器统一之外，当前还剩哪些主线

### 一、把 `MedDeepScientist` 的默认 pin 真的收回到本机 Codex 默认

这件事现在还没有完成。
当前参考实现里仍有 `gpt-5.4 / xhigh` 的 repo-local 默认值和文档口径。

这意味着：

- 家族 contract 已经写成 `inherit_local_codex_default`
- 但医学参考实现本体还残留旧 pin

这条必须尽快收口，否则“家族默认继承本机 Codex 配置”还不是真正的一致事实。

### 二、修正 `MedAutoGrant` 的 code truth / docs truth 漂移

`MedAutoGrant` 现在最急的不是再发明新的 helper，而是把已经 landed 的 critique route 明确写进公开 truth：

- critique 不应继续写成 `pending / handoff-required`
- `current-program` 里应补上与 `RedCube` 同级的 `default_concrete_executor` truth
- 文档里应明确 critique 的最底层函数链与默认模型策略

### 三、把 `RedCube` 已完成的 Codex 默认执行器提交安全吸收到主线

`RedCube` 这条线当前的 blocker 已经不是设计，而是工作树 / 脏改动冲突。

必须做的不是重做实现，而是：

- 等主 checkout 上重叠文件的本地改动被吸收或转移
- 再把 `c1f584c` 安全并回 `main`
- 然后同步 `README`、`docs/status.md`、`docs/architecture.md` 与 `contracts/runtime-program/current-program.json`

### 四、刷新 `OPL` 顶层 reference sync 面

`OPL` 核心五件套已经跟上了新的默认执行器口径，但 reference-grade 同步面仍有旧 truth 残留。

最明显的例子：

- `docs/references/ecosystem-status-matrix.md` 仍停在 `2026-04-11`
- 它仍在讲旧的 `Codex-default host-agent runtime` 口径

这类中央 reference 如果不刷新，会持续给四仓提供过期信号。

### 五、把三个 domain 仓的 executor-adapter contract 补齐到同一组 machine-readable 字段

当前 `OPL` 已经定义的 family 默认字段至少包括：

- `default_executor = codex_cli_autonomous`
- `default_model = inherit_local_codex_default`
- `default_reasoning_effort = inherit_local_codex_default`
- `chat_completion_only_executor_forbidden = true`
- `hermes_native_requires_full_agent_loop = true`

但三个 domain 仓当前并没有都把这组字段明确写进各自 machine-readable contract。

下一步不是再争论语义，而是把这组字段真实落到各仓 contract surface。

### 六、真正开启 `Hermes-native` 备选执行器 proof lane

这条线现在只能算“准入评估前夜”，还不算已开工完成。
后续如果要做，必须满足：

- 入口不是一步一步 chat
- 也不是 `/v1/runs` 当成一次性模型代理
- 而是直接调用 `Hermes AIAgent` 的完整 agent loop，或者调用明确映射到该 loop 的 run surface

## 四仓文档同步清单

### `OPL`

需要同步：

- `docs/references/ecosystem-status-matrix.md`
- 仍引用该历史同步面的参考入口
- 顶层对“四仓下一棒”和“备选执行器评估”的 reference-grade 文档

原因：

- 顶层 core truth 已更新
- 但 reference sync 面仍带着旧的 host-agent / OMX 时代口径

### `Med Auto Science`

需要同步：

- `docs/status.md`
- `docs/architecture.md`
- `docs/runtime/agent_runtime_interface.md`

原因：

- 当前这些文档已经诚实说明了 `Hermes substrate + MAS authority + MDS backend` 的三层分工
- 但还没有把“最底层真正调用 AI 的函数链”明确写到 `CodexRunner._build_command() -> codex exec`
- 也还没有把“医学线仍残留 `gpt-5.4 / xhigh` 默认 pin”作为剩余同步项写清

### `MedDeepScientist` 补充同步面

需要同步：

- `src/deepscientist/config/models.py`
- `docs/status.md`
- `docs/architecture.md`
- `docs/en/00_QUICK_START.md`
- `docs/en/01_SETTINGS_REFERENCE.md`
- `docs/en/15_CODEX_PROVIDER_SETUP.md`

原因：

- 这些文件仍在把 `gpt-5.4 / xhigh` 当成默认事实
- 如果这层不更新，医学线参考实现就和家族默认 contract 不一致

### `RedCube AI`

需要同步：

- 主 checkout `main`
- `README*`
- `docs/status.md`
- `docs/architecture.md`
- `contracts/runtime-program/current-program.json`

原因：

- 这些 truth 已在提交 `c1f584c` 中完成
- 但主 checkout 仍未安全吸收，所以主线公开 truth 还没有跟上

### `Med Auto Grant`

需要同步：

- `README*`
- `docs/status.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `contracts/runtime-program/current-program.json`
- 仍在陈列 critique pending 的 specs / current truth 入口

原因：

- 代码已经 landed critique 的 `Codex CLI autonomous` 执行路径
- 但文档和 contract 仍在写 critique 未落地

## Hermes-Agent 作为备选执行器：已经具备什么

### 它不是只有 chat relay

从上游 `hermes-agent` 当前实现看，至少已经有三种“直接调用 agent loop”的方式：

1. 直接在 Python 中实例化 `run_agent.AIAgent(...)` 并调用 `run_conversation(...)`
2. 启动 `hermes gateway` 后调用 `POST /v1/runs`
3. 调用 API server 的 `POST /v1/chat/completions` 或 `POST /v1/responses`

这三种路径最终都会进入 `AIAgent`，而不是只做一次性模型 relay。

其中 `/v1/runs` 最像“直接让 Hermes 自己跑一个 agent run”：

- `gateway/platforms/api_server.py` 的 `_handle_runs()` 会创建 `AIAgent`
- 然后异步执行 `agent.run_conversation(...)`
- 同时从 `/v1/runs/{run_id}/events` 输出结构化事件流

### 它已经有真实 agent 自治能力

当前上游文档和代码明确显示，`Hermes-Agent` 已经具备：

- terminal / file / web / browser 工具
- memory / session search
- skills system
- `delegate_task` 子代理并行
- MCP 工具扩展
- cron / scheduler
- `SessionDB` 持久会话
- gateway / API server / ACP 多入口

换句话说，`Hermes-Agent` 作为备选执行器时，并不是“只能一步一步 chat”。
它已经是一个真实的 tool-calling agent runtime。

### 它也可以用 custom provider，不只绑 OpenAI

上游文档当前明确支持：

- `provider: custom`
- `base_url: <OpenAI-compatible endpoint>`
- named custom providers
- 多 provider 切换与 fallback

这一点是它作为备选执行器最有现实意义的地方：

- 可以接 OpenRouter、Nous、OpenAI、Copilot、Anthropic、Gemini
- 也可以接自建或第三方 OpenAI-compatible endpoint

## Hermes-Agent 与 Codex CLI 的关键差异

### 一、模型兼容性：`Hermes-Agent` 更强

`Codex CLI` 的执行脑本质上还是 OpenAI / Codex 路线。
`Hermes-Agent` 则天然支持多 provider、多 endpoint 与自定义 base URL。

这一点决定了它非常适合作为后续跨模型、跨供应商的备选执行器。

### 二、当前家族落地成熟度：`Codex CLI` 更强

在 `OPL` 这几个仓里，当前已经被 repo-verified 的“可直接替换、质量稳定、路径清楚”的默认执行器，仍然是 `Codex CLI autonomous`。

`Hermes-Agent` 当前在这几个仓里的主要已落地点，仍然是：

- runtime substrate
- gateway / API surface
- run/event/session substrate
- 部分 relay / pilot / proof gate

还不是“已落地可替代 Codex CLI 的 family default concrete executor”。

### 三、技能与工具生态：两者都强，但不是同一套体系

`Hermes-Agent` 有自己的：

- `~/.hermes/skills/`
- toolsets
- browser / terminal backends
- delegate / cron / memory / gateway 体系

但它并不天然等于当前你这台机器上的 Codex skills、Codex tool semantics 和 Codex CLI 行为。

所以即使未来选择 `Hermes-Agent` 作为备选执行器，也必须接受一个事实：

- 它是“另一套强执行生态”
- 不是“把 Codex CLI 换个壳子就自动等价”

### 四、`xhigh` 与 `custom + chat_completions`：不能想当然

上游 `Hermes-Agent` 在配置层确实接受：

- `agent.reasoning_effort = xhigh`

而且 `parse_reasoning_effort(...)` 也明确支持 `xhigh`。

但要非常注意实际传输路径：

- 如果走 `codex_responses`，`run_agent.py` 会把 reasoning 作为 `{"effort": ..., "summary": "auto"}` 传出
- 如果走 generic `chat_completions`，只有 `_supports_reasoning_extra_body()` 返回 true 时，才会把 reasoning 放进 `extra_body`
- 当前这个判断主要覆盖的是 OpenRouter、GitHub Models、AI Gateway 这类已知兼容路由
- 对一个普通的 `provider: custom`、`api_mode: chat_completions` generic endpoint，不能默认认为 `xhigh` 会真实生效

这意味着：

- `Hermes-Agent` 的配置表面可以写 `xhigh`
- 但 `custom + chat_completions` 并不天然等于“真的拿到了 GPT-5.4 的 xhigh thinking 语义”

如果目标是 OpenAI GPT-5.x 的真正 reasoning + tool use，上游当前自己的策略其实是：

- 直连 `api.openai.com` 时，自动把 `chat_completions` 切成 `codex_responses`

所以对当前家族仓来说，不能把“`provider: custom` + `chat_completions` 能配置 `xhigh`”误判成“已经等价于 Codex CLI 的高质量 agent 路线”。

## 建议开工顺序

1. 先修文档 truth 漂移最大的两处：`MedAutoGrant` 与 `OPL` 顶层 reference sync。
2. 再收医学参考实现：把 `MedDeepScientist` 的 `gpt-5.4 / xhigh` 默认 pin 改成继承本机 Codex 默认配置，并同步 `MedAutoScience` / `MedDeepScientist` 文档。
3. 随后处理 `RedCube` 主 checkout 的冲突吸收条件，把 `c1f584c` 安全并回 `main`。
4. 在三个 domain 仓的 machine-readable surface 中补齐统一的 `executor-adapter` 默认字段。
5. 最后再开 `Hermes-native` proof lane，而且只能基于真实 `AIAgent` agent loop 或 `POST /v1/runs` 这类 run surface，不再允许 chat relay 冒充。

## 一句话结论

当前最诚实的判断是：

- 家族默认 concrete executor 仍应坚持 `Codex CLI autonomous`
- `Hermes-Agent` 已经具备真实 agent loop、工具自治、skills、browser、subagent 与多 provider 兼容能力，因此非常有资格成为后续备选执行器
- 但在这几个仓里，它还没有被 repo-verified 成“当前就能平替 Codex CLI 的默认 concrete executor”
- 因此下一步正确动作不是回去争论方向，而是先把四仓文档 truth、参考实现默认值和 machine-readable contract 全部收紧，再基于真实 `AIAgent` loop 开启 `Hermes-native` proof
