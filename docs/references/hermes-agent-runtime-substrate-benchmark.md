# Hermes Agent Runtime Substrate 对标与吸收清单

状态锚点：`2026-04-11`

## 文档目的

这份文档把 `Hermes Agent` 作为一个外部工程参照物，专门研究它在长期在线 agent runtime、gateway、session、memory、cron、approval 与 profile isolation 上已经做成熟的 substrate 设计。

这份文档的目标，不是把 `OPL` 改写成另一个 `Hermes Agent`，也不是把 `OPL` 重新定位成“通用长期在线 agent 平台”。

它只回答三个问题：

1. `Hermes Agent` 哪些 runtime substrate 设计已经足够成熟，值得 `OPL` 吸收。
2. 哪些设计要经过 domain-oriented 改写后才能吸收。
3. 哪些设计即使成熟，也不应该进入 `OPL` 的长期主线。

这份文档属于 `docs/references/` 下的内部参考级文档。
它不反向抬升为 `OPL` 的公开产品定位真相，也不替代：

- `docs/operating-model.zh-CN.md`
- `docs/shared-foundation.zh-CN.md`
- `docs/unified-harness-engineering-substrate.zh-CN.md`
- `contracts/project-truth/AGENTS.md`

## 对标范围

本次对标基于本地克隆仓：

- 本地路径：`/Users/gaofeng/workspace/_external/hermes-agent`
- 快照提交：`96051955`
- 快照日期：`2026-04-10`

本次重点阅读的实现文件包括：

- `hermes_state.py`
- `gateway/run.py`
- `gateway/session.py`
- `gateway/status.py`
- `cron/scheduler.py`
- `agent/memory_provider.py`
- `agent/memory_manager.py`
- `tools/memory_tool.py`
- `tools/session_search_tool.py`
- `tools/registry.py`
- `tools/approval.py`
- `hermes_cli/profiles.py`

## 一、当前最值得学习的部分

### 1. runtime profile 是一等隔离单元

`Hermes Agent` 不是只做一个默认 `~/.hermes` 目录，然后把所有状态都塞进去。

它已经把下面这些能力统一挂到 `profile` 概念下：

- `HERMES_HOME` 根目录隔离
- profile 级 gateway pid / runtime status
- profile 级 session store
- profile 级 memory / skills / config
- profile 级 subprocess `HOME`

这件事对 `OPL` 很重要，因为你现在真正要解决的，不只是“一个 agent 能不能跑起来”，而是：

- 不同 repo / 不同 domain / 不同 deployment shape 的 runtime 状态能不能隔离
- 长时间在线时，不同 owner line 能不能不互相污染
- 未来从本地 host-agent runtime 迁到平台托管 runtime 时，身份与状态能不能稳定迁移

### 2. session store 是 substrate，不是附属日志

`Hermes Agent` 用 `SQLite + WAL + FTS5` 做 session store，并显式存：

- session metadata
- full message history
- parent_session_id 链
- source tagging
- token / cost / title / model config

这比“把对话散落在临时文件里”成熟很多。

对 `OPL` 来说，可直接学习的不是“保存聊天记录”本身，而是这条工程判断：

- `session / run / execution history` 应该有 repo-independent 的 substrate owner
- 这个 substrate 要支持 search、resume、audit 与 cross-session recall
- 但它不能替代 domain-owned canonical truth

### 3. gateway 是长期在线 owner process

`Hermes Agent` 的 gateway 不是一个薄 webhook 入口，而是一个真正长期在线的 owner process。

它持有：

- 平台接入
- session routing
- runtime status
- delivery
- cron tick
- approval 回调
- interrupt / redirect

并且用 pid file、runtime status file、scope lock 来维持可观测与可恢复性。

这一点和 `OPL` 的未来方向高度一致。
未来 `OPL` 的稳定性，不会只来自单次 CLI 调用，而会来自：

- 长期在线 runtime owner
- 可观测 gateway
- 明确 session / delivery / audit linkage

### 4. memory provider 抽象很干净

`Hermes Agent` 把 memory 分成两层：

- 永远存在的 built-in memory
- 最多一个 external memory provider

同时把 provider 生命周期冻结成统一 contract：

- `initialize`
- `system_prompt_block`
- `prefetch`
- `queue_prefetch`
- `sync_turn`
- `on_session_end`
- `on_pre_compress`
- `on_delegation`

这比把“记忆”写死在某个工具或某个 prompt 里稳得多。

对 `OPL` 来说，值得吸收的是：

- memory provider 作为 substrate contract
- prefetch / sync / session-end / delegation 作为正式 hook 面
- memory context 要和主 prompt 明确隔离

### 5. cron / delivery 是正式 runtime 能力

`Hermes Agent` 把 cron 当成 runtime 的一等公民，而不是脚本外挂。

它有：

- job store
- due-job resolver
- delivery target resolver
- silent marker
- cron session persistence
- timeout / inactivity interruption

这对 `OPL` 很有价值，因为未来很多长跑任务都需要：

- 定时继续
- 定时审计
- 定时汇报
- 定时检查 gate

如果这些能力不进入 substrate，后面每个 `Domain Harness OS` 都会自己再造一遍。

### 6. approval / tool registry / interrupt 都是中心能力

`Hermes Agent` 把 tool registry、dangerous approval、session-scoped approval state、interrupt 都放在正式 runtime 面，而不是散在 CLI 回调里。

这个判断是成熟的。

对 `OPL` 来说，未来真正稳定的 substrate 也必须把下面这些冻结下来：

- tool registry contract
- approval contract
- interrupt / stop / resume contract
- result budget / output surface contract

## 二、可以直接吸收的设计

下面这些内容，`OPL` 不需要先重写产品定位，就可以直接吸收为统一 substrate 方向：

### 1. Runtime Profile Contract

建议 `OPL` 冻结统一的 `runtime profile` 语义，至少包括：

- `profile_id`
- `runtime_home`
- `session_store`
- `gateway_pid`
- `runtime_status`
- `memory_root`
- `subprocess_home`

这会直接提升四仓在本地长跑、worktree 隔离、未来托管迁移时的可控性。

### 2. Session Substrate Contract

建议统一冻结：

- `session_id`
- `parent_session_id`
- `source`
- `started_at / ended_at`
- `session_state`
- `interrupt_reason`
- `resume_pointer`
- `searchable transcript / summary`

这里的重点不是聊天 UI，而是让长期在线 runtime 拥有一个稳定的 execution memory substrate。

### 3. Gateway Runtime Status Contract

建议统一冻结：

- `gateway_state`
- `active_runs`
- `platforms`
- `restart_requested`
- `last_heartbeat`
- `exit_reason`

这样未来不管是本地 host-agent runtime 还是平台托管 runtime，外部都能看到可审计的 runtime 健康面。

### 4. Delivery / Cron Contract

建议统一冻结：

- `job_id`
- `origin`
- `delivery_target`
- `next_run_at`
- `last_run_at`
- `timeout`
- `output_record`
- `silent_delivery`

这样 `cron` 才会是 substrate，不会退回各仓私有脚本。

### 5. Approval / Interrupt Contract

建议统一冻结：

- `approval_request_id`
- `approval_scope`
- `session_key`
- `approval_decision`
- `interrupt_reason`
- `resume_allowed`

这部分对“长期在线但仍可控”非常关键。

## 三、需要改写后再吸收的设计

下面这些思路不能原样搬进 `OPL`，但它们背后的 substrate 价值很高。

### 1. user-centric memory 要改成 domain-centric memory

`Hermes Agent` 很强调：

- 对用户的跨 session 认识
- user profile
- preference modeling

这不适合成为 `OPL` 的核心。

`OPL` 更需要的是：

- object memory
- evidence memory
- decision memory
- gate memory
- delivery memory

也就是：记住“任务与对象怎么演化”，而不是把重点放在“用户画像越来越深”。

### 2. self-improving skill loop 需要受控

`Hermes Agent` 的一个亮点是：

- 自动从经验生成 skill
- skill 使用中继续自我改写

这对通用 agent 平台很有吸引力，但对 `OPL` 来说不能直接放开。

`OPL` 如果吸收，必须改成：

- 经验沉淀可以自动收集
- skill 候选可以自动提出
- 但进入 repo-tracked mainline 前必须经过 truth freeze、测试和人工裁决

否则会直接破坏 domain contract 的稳定性。

### 3. omnichannel messaging 不能先行膨胀

`Hermes Agent` 一次接很多消息平台，这对通用产品合理。

`OPL` 不应在当前阶段把这件事当主线。
值得吸收的是 gateway contract，而不是立刻扩平台矩阵。

当前更合理的顺序是：

1. 先冻结 gateway owner process、session substrate、delivery contract
2. 再按实际产品入口选择少数渠道水化

### 4. generic tool explosion 要改成 domain-scoped tool surfaces

`Hermes Agent` 的 tools 很多，而且面向通用代理。

`OPL` 不该照搬“一个大而全的工具箱”。
更合理的是：

- substrate 持有统一 tool registry contract
- domain 仓各自持有 domain-scoped tool surface
- formal entry 继续由 `CLI-first + MCP supported + controller internal` 统一表达

## 四、明确不吸收的部分

下面这些内容不应进入 `OPL` 的主线判断。

### 1. 不把 OPL 改写成通用长期在线 agent 平台

`OPL` 的目标不是做另一个“什么都能聊、什么都能接”的通用 agent 产品。

`OPL` 的目标仍然是：

- 顶层 `Gateway / Federation`
- 多个 `Domain Harness OS`
- 共享 `Unified Harness Engineering Substrate`

### 2. 不把用户画像深化作为核心产品卖点

`OPL` 卖的是：

- runtime / harness 带来的任务完成能力
- domain truth、audit、delivery、gate semantics

不是“越来越懂你”的通用陪伴式 agent。

### 3. 不允许自动 skill growth 改写主线真相

任何自动生成的：

- skill
- runtime rule
- gate
- object schema
- approval policy

都不能直接改写 repo-tracked mainline。

### 4. 不把 domain gateway 吞回一个总 runtime

`Hermes Agent` 的单体感很强。

而 `OPL` 必须继续保留：

- `OPL Gateway`
- `Domain Gateway`
- `Domain Harness OS`

三层结构。

吸收 substrate，不等于取消 domain 边界。

## 五、对 OPL 的直接启发

如果把这次对标压成一句话，那么最值得吸收的是：

> 让 `OPL` 拥有一个稳定、可隔离、可审计、可恢复、可托管的 runtime substrate，而不是继续把长期在线执行逻辑分散在各仓自己的临时控制面里。

据此，`OPL` 下一版 substrate contract 最值得优先冻结七个方面：

1. `runtime profile`
2. `session substrate`
3. `gateway owner process`
4. `memory tier contract`
5. `delivery / cron substrate`
6. `approval / interrupt / resume`
7. `report / audit linkage`

这七项一旦冻结，后面无论是本地 host-agent runtime，还是 future managed runtime，都有一条稳定的迁移骨架。

## 六、四仓落地优先级

### 1. one-person-lab

优先级最高的任务不是写更多故事，而是把上面七项 substrate contract 作为顶层参考级合同冻结出来。

当前最适合承接的事情是：

- 写清 `Runtime Substrate Contract v1`
- 写清 `profile / session / gateway / memory / cron / approval` 的顶层统一语言
- 不越界成 runtime owner

### 2. redcube-ai

最适合先吸收。

原因是：

- 它已经有相对清楚的 product runtime surface
- 当前主线不受 external runtime gate 阻塞
- family / deliverable / audit / watch surface 已经比较清楚

最适合先落地的是：

- repo-tracked runtime state owner
- session / run substrate
- audit-watch linkage
- hosted-friendly gateway state

### 3. med-autogrant

第二优先。

原因是：

- 它已经把 local runtime ladder 和 hosted-friendly contract prep 压得比较清楚
- 适合进一步吸收 `session substrate / approval / resume / bundle lifecycle`

但仍然不该直接跳成 actual hosted runtime。

### 4. med-autoscience

后置吸收。

原因不是它不重要，而是：

- 当前仍有 external runtime dependency gate
- 主线已明确转入 manual stabilization
- display 资产线独立存在

它更适合在 external gate 清除后，再把 substrate contract 吸收进去，而不是现在重构主线。

## 七、当前最合理的执行顺序

### Step 1

先在 `one-person-lab` 冻结 `Runtime Substrate Contract v1` 的参考级合同文档。

### Step 2

优先在 `redcube-ai` 和 `med-autogrant` 各落一轮 repo-side hydration：

- runtime profile
- session substrate
- gateway status
- approval / interrupt / resume
- report / audit linkage

### Step 3

等 `med-autoscience` 的 external runtime gate 清掉后，再判断如何把同一 substrate contract 吸收进它的 runtime 主线。

## 最终结论

`Hermes Agent` 最值得 `OPL` 学习的，不是“通用长期在线 agent 平台”这层产品形态，而是它背后已经相对成熟的 runtime substrate：

- profile isolation
- session store
- gateway owner process
- pluggable memory
- cron / delivery
- approval / interrupt

`OPL` 应该吸收这些 substrate 设计，来增强自己的稳定性、可观测性和未来托管迁移能力；
但同时必须继续保留自己的 domain-oriented 边界，不让 `OPL` 退化成一个通用 agent 壳。
