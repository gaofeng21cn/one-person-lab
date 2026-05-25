# OPL ACP-native Session Runtime 与 Shell Projection 边界设计

Owner: `One Person Lab`
Purpose: `acp_native_session_runtime_shell_projection_history_spec`
State: `history_process_spec_archived`
Machine boundary: 本文是人读设计记录；机器可读行为必须使用 contracts、source、CLI/API 行为、runtime ledger、生成产物或 `human_doc:*` 语义 id。

状态锚点：`2026-04-21`
当前状态说明（2026-05-11）：本文的 session-runtime-first pivot 已经被核心五件套、`docs/active/` 与 runtime-substrate roadmap 吸收。本文保留用于解释 Product API / ACP / GUI shell 作为 runtime projection 的历史形成过程。`Product API`、`opl web`、`ACP bridge` 和 `AionUI` 相关段落按 projection support 或历史设计背景复用；当前 owner 是 `docs/project.md`、`docs/status.md`、`docs/architecture.md` 与 `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`。

归档理由：session-runtime-first、shell/projection 分层和 domain-owned truth 边界已经合入当前 owner；整篇设计只保留为历史形成过程和 provenance，不再作为活跃规格或实现队列。

## 历史读法

本文中的“canonical architecture”“canonical runtime objects”“近期落地顺序”“验收标准”只表示 ACP / shell projection 形成期的历史设计语境。当前 Codex-default executor、Temporal-backed provider stage runtime、domain-agent entry、App/workbench projection 和 readiness 语义必须回到核心五件套、runtime / domain admission support docs、contracts、source、CLI/API 和 live read-model。

## 背景

截至 `2026-04-21`，`OPL` 已经完成两轮重要收口：

- GUI 主线确定为基于 `AionUI` codebase 的 `opl-aion-shell`
- 公开产品模型已经统一到 `system / engines / modules / agents / workspaces / sessions / progress / artifacts`

但这两轮收口之后，新的关键问题已经不是“GUI 基座选谁”，而是：

`OPL` 的 canonical interaction 到底是什么？

对当前真实使用路径而言，答案并不是“API”。
开发者和用户真正的一等路径是：

- 在本地目录里进入 `opl` shell / TUI
- 在 `Codex` 中显式调用 `OPL` 与其 domain agents
- 让外部壳消费同一套 runtime truth

也就是说：

`OPL` 先是一个 family-level session runtime，
之后才对外投影成：

- 本地 `opl` shell / TUI
- `Codex` 中的显式调用面
- ACP-compatible 外部壳
- `Product API` / `opl web`

这份设计当时的目标，是把当时主线从 “Product API first” 纠正成 “session runtime first”，同时继续保持：

- `OPL` 不吞并 domain-local runtime ownership
- 各 domain 仓继续持有自己的 agent logic、domain rules、deliverables 与 audit truth
- GUI / Web / API 都只是同一运行时的 projection

## 设计目标

### 1. `OPL` 成为 family-level session runtime

`OPL` 当时主线应明确收敛为：

`OPL = session runtime + workspace binding + agent registry + shell projection surfaces`

这里的 session runtime 只负责 family-level 交互与执行编排，不负责把各 domain 仓的专业逻辑抽走。

### 2. canonical interaction 先于 projection

`OPL` 的一等交互面按优先级收敛为：

1. 本地 `opl` shell / TUI
2. `Codex` 中的显式 `OPL` / `@mas` / `@mag` / `@rca` 路径
3. ACP-compatible 外部壳
4. `Product API` / `opl web` projection

也就是说，`Product API` 仍然保留，但不再是产品主语。

### 3. 外部壳不能成为 runtime owner

`AionUI` 是第一外部壳，不是主 runtime。
未来如果还有别的 ACP-compatible 壳接入，`OPL` 也不应因为某个壳的现成实现，就把 canonical truth 反向交给壳层。

### 4. Domain Agents 继续保持松耦合

`MAS`、`MAG`、`RCA` 等 domain agents 继续保持：

- 可以被 `Codex` 直接调用
- 可以被 `OPL` session runtime 统一调度
- 在两条入口下，工作逻辑保持语义一致

## 非目标

这条主线**不**意味着：

- `OPL` 成为各 domain 的 runtime owner
- `OPL` 接管各 domain 的交付真相、评审真相或发布真相
- `AionUI` 成为唯一允许的壳
- 先把 GUI 做完整，再倒推 runtime
- 让 `Product API` 消失

## canonical architecture

当时主线架构应明确为：

`Human / Codex / opl shell / ACP shell / GUI shell -> OPL Session Runtime -> Codex CLI or Hermes-Agent -> Domain Agent Entry -> Domain Repository`

### 1. Interaction Shell Layer

这一层包含：

- 本地 `opl` shell / TUI
- `Codex` 中显式调用 `OPL`
- `AionUI` 等外部壳
- 未来 hosted / web 壳

它们的职责是：

- 组织输入输出体验
- 选择 workspace / session / agent
- 显示 progress / artifacts / approvals

它们不拥有 canonical runtime truth。

### 2. OPL Session Runtime

这是新的主线核心层。
它负责：

- workspace binding
- session lifecycle
- runtime mode selection
- agent registry
- progress / artifact projection
- approval / interrupt / resume surface
- shell compatibility surface

### 3. Executor Layer

具体执行器继续按当前家族共识保持：

- `Codex CLI` 是默认执行器
- `Hermes-Agent` 是迁移期 legacy/optional provider 或显式 executor/proof lane；当前长期在线生产目标以 provider-backed runtime 和 Temporal 候选为准

这层负责真正执行 prompt、命令与工具调用。

### 4. Domain Agent Entry

各个 domain 通过统一 `agent entry spec` 暴露给 `OPL` runtime。
至少包含：

- `agent_id`
- `entry_kind`
- `workspace_requirement`
- `locator_schema`
- `codex_entry_strategy`
- `artifact_conventions`
- `progress_conventions`

## canonical runtime objects

为了让 shell、API、GUI 和 online projection 共享同一套 truth，`OPL` 应把 canonical runtime objects 收敛为下面几类。

### 1. workspace binding

这是一次工作容器的绑定对象，最关键字段仍然是：

- `cwd`

它还需要附带：

- label
- selected agent
- locator fields
- active flag
- created / updated timestamps

### 2. session

`session` 是所有交互面的中心对象。
它不是“聊天专用对象”，而是统一承载：

- 普通对话
- 多步任务
- domain-agent continuation

至少包含：

- `session_id`
- `workspace_id` 或 `cwd`
- `agent_id`
- `executor_id`
- `status`
- `summary`
- `created_at`
- `updated_at`

### 3. message / update stream

`OPL` 需要正式拥有一条统一 update stream，用来承接：

- prompt 输入
- running output
- tool / approval updates
- recent output
- completion summary

`Product API`、ACP bridge 和 `opl` shell 只是对这条流做不同投影。

### 4. progress projection

`progress` 不应再被看成一个“GUI 附件”，而是 canonical runtime object 的人话投影。
它至少需要持续暴露：

- headline
- latest_update
- next_step
- status_summary
- task cards
- recent activity
- attention items

### 5. artifact projection

`artifact` 是 session / workspace 的交付面投影，至少继续保持：

- deliverable files
- supporting files
- summary
- inspect paths

## 交互面与 projection 角色

### 1. 本地 `opl` shell / TUI

这是当时主线的一等入口。
当时目标体验是：

- 在某个目录下直接运行 `opl`
- 进入一个 session-first 的交互界面
- 默认与 `Codex` 协作
- 通过 `@mas`、`@mag`、`@rca` 触发 domain agents

### 2. `Codex` 中的显式调用

这一层不需要额外 GUI。
只要 `OPL` runtime 自己足够清楚，用户就可以在 `Codex` 中显式要求：

- 使用某个 workspace
- 进入或恢复某个 session
- 让某个 domain agent 接手

### 3. ACP compatibility surface

这是让外部壳最少侵入接入 `OPL` 的关键层。
它的目标不是改写 canonical truth，而是把 `OPL` session runtime 翻译成 ACP-friendly surface。

第一阶段至少需要覆盖：

- `session/new`
- `session/prompt`
- `session/update`
- `session/request_permission`
- `loadSession` / resume
- `cancel / close`

### 4. Product API / `opl web`

`Product API` 继续保留，但角色收敛为：

- GUI projection
- debug / ops surface
- hosted / online adapter surface

它不再是“用户最先进入的主语”。

### 5. AionUI

`AionUI` 是第一外部壳。
它的角色应明确为：

- 第一 ACP-compatible shell
- 第一桌面壳验证对象
- 第一 hosted / web projection 参考对象

它不是：

- canonical runtime owner
- `OPL` 唯一允许的 GUI
- `OPL` 真实交互语义的定义者

## 与历史当时 Product API 的关系

`Product API` 这轮不会被推翻，而是被重新定位。

当时已经收敛好的八类顶层资源继续保留：

- `system`
- `engines`
- `modules`
- `agents`
- `workspaces`
- `sessions`
- `progress`
- `artifacts`

变化只在于：

- 它们不再被写成“产品核心先有 API，再有交互”
- 而是被写成 “session runtime 的 projection resource model”

## 与 Domain Repos 的边界

这轮 pivot 后，下面这些边界继续保持固定：

- `OPL` 不接管 domain-local runtime truth
- `OPL` 不接管 domain-local review / release / publication truth
- 各 domain 仓继续持有 agent logic、toolchain、deliverable conventions 与 domain rules
- `OPL` 只持有 family-level session runtime、entry dispatch 与 projection surface

## 历史近期落地顺序

### 1. 先冻结语义

先把核心文档全部改成：

- runtime-first
- shell-first
- projection-second
- `AionUI` first shell

### 2. 再落本地 `opl` shell / TUI

这是第一优先实现目标。
原因是它最直接验证 canonical runtime 是否真的成立。

### 3. 然后做 ACP bridge

只有当 `opl` shell / TUI 的 runtime 语义先跑通，ACP bridge 才不会变成 transport-first 的空壳。

### 4. 最后接 AionUI

`AionUI` 接入时应尽量复用 ACP / shell compatibility surface，而不是反过来定义 `OPL` 的 runtime。

## 历史验收标准

这份设计成立时，读者应能立刻理解：

- `OPL` 的主线已经不是 API-first，而是 session-runtime-first
- 本地 `opl` shell / TUI 是一等入口
- `AionUI` 是第一外部壳，不是 runtime owner
- `Product API` 仍然存在，但角色已经变成 projection surface
- `MAS`、`MAG`、`RCA` 继续保持 domain-owned truth 与松耦合接入
