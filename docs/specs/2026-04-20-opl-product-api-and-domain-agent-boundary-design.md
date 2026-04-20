# OPL Product API 与 Domain Agent 边界设计

## 背景

截至 `2026-04-20`，`OPL` 的产品形态已经明确：

- GUI 主线采用 `Onyx` 作为独立界面基座
- `OPL` 主仓负责共享运行时真相、智能体注册表、工作空间 / 会话 / 文件 / 系统接口
- `Codex` 是默认交互与执行宿主
- `Hermes-Agent` 是备用执行器与长期在线网关
- `MAS`、`MAG`、`RCA` 等领域仓是可被 `Codex` 直接调用的专用智能体仓

当前的主要问题已经从“界面长什么样”切换成“`OPL` 应该向 GUI 暴露什么样的产品接口”。历史 `frontdesk` 体系把多种阶段性语义揉在了一起：

- GUI 启动
- 环境安装与升级
- 工作空间注册
- ask / task / progress / files
- 领域接线
- hosted pilot / package
- readiness / entry guide / dashboard

这导致当前公开路径和公开名词里出现了大量产品层冗余，例如：

- `/api/opl/frontdesk/environment`
- `/api/opl/frontdesk/initialize`
- `/api/opl/frontdesk/modules`
- `/api/opl/frontdesk/domain-wiring`

这些名字保留了历史阶段的实现痕迹，已经不再适合当前的 `OPL + Onyx 界面壳` 目标形态。

这份设计的目标，是把 `OPL` 重做成一个清晰、稳定、长期可维护的 `Product API`，同时明确它和各个领域仓之间的边界。

## 设计目标

### 1. OPL 只承担顶层产品运行时

`OPL` 的目标定位固定为：

`OPL = runtime orchestrator + agent registry + workspace/session/file API`

这里的 `runtime orchestrator` 只负责顶层共享产品运行时，不负责替代各个领域仓自己的专业逻辑。

### 2. Domain Agents 与 OPL 保持松耦合

`MAS`、`MAG`、`RCA` 等仓继续是独立的领域智能体仓。

它们需要满足的核心要求是：

- 可以被 `Codex` 直接调用
- 可以被 `OPL` 通过统一智能体入口方式调用
- 在“直接调用”和“通过 OPL GUI 调用”两种路径下，行为语义保持一致

用户通过 `OPL GUI` 调用某个智能体，本质上等于：

`GUI -> OPL session runtime -> Codex -> selected domain agent`

用户直接在 `Codex` 中调用某个领域智能体，本质上等于：

`Codex -> selected domain agent`

两条路径的差异只在入口和管理能力，不在智能体本身的工作逻辑。

### 3. GUI 只消费产品资源模型

GUI 层不再理解 `frontdesk`、`readiness`、`entry-guide`、`domain-wiring` 这类历史概念。

GUI 只消费下面几类资源：

- `system`
- `engines`
- `modules`
- `agents`
- `workspaces`
- `sessions`
- `progress`
- `artifacts`

### 4. 共享模块只保留真正跨域复用的能力

`OPL` 可以继续维护各个领域智能体的共享功能模块。

这部分属于 `runtime orchestrator` 的内部组成，但需要严格收窄，只保留真正跨域、长期稳定、由多个智能体共同依赖的能力，例如：

- 会话 / 工作空间注册
- 引擎适配器
- 模块注册表
- 交付物发现
- 进度叙述
- 稳定接口合同
- 共享配置加载

领域专属逻辑继续留在各自仓内。

## OPL 的目标产品模型

### 顶层资源

`OPL` 只保留下面八类顶层资源。

#### 1. system

产品级运行时状态：

- OPL 版本
- state dir
- 当前默认执行模式
- 健康状态
- 更新通道

#### 2. engines

执行器管理：

- `codex`
- `hermes`

每个 engine 提供：

- 安装状态
- 当前版本
- 安装路径
- 健康状态
- install / update / reinstall / remove 动作

#### 3. modules

可选领域模块管理：

- `med-autoscience`
- `med-autogrant`
- `redcube-ai`
- 未来其他模块

每个 module 提供：

- 安装状态
- 当前版本
- checkout path
- 健康状态
- install / update / reinstall / remove 动作

#### 4. agents

用户可选的工作模式。

建议固定分为两类：

- 通用 agents
  - `general-chat`
  - `general-task`
- 专用 agents
  - `mas`
  - `mag`
  - `rca`

每个 agent 提供：

- `agent_id`
- 用户可见名称
- 描述
- 默认 engine
- 是否需要 workspace
- 需要的 locator 字段
- 启动时使用的 entry spec

#### 5. workspaces

`workspace` 是一次工作容器的启动元数据。

对当前产品来说，最关键的字段是：

- `cwd`

`workspace` 还可以附带：

- label
- agent_id
- locator fields
- created_at
- updated_at
- active flag

#### 6. sessions

`session` 是一次真实的交互与执行会话。

它是 GUI 的中心对象。

一个 session 至少包含：

- `session_id`
- `agent_id`
- `engine_id`
- `workspace_id` 或 `cwd`
- `status`
- `summary`
- `created_at`
- `updated_at`

用户看到的“对话”“任务”“MAS 运行中实例”，在产品模型里都统一收敛成 `session`。

#### 7. progress

`progress` 是 session 关联的人话进度视图。

它至少包含：

- headline
- latest_update
- next_step
- status_summary
- task cards
- recent activity

#### 8. artifacts

`artifact` 是 session 或 workspace 关联的交付文件视图。

它至少分为：

- deliverable files
- supporting files

## Domain Agents 与 OPL 的关系

### 1. 运行时关系

`OPL` 不持有领域运行时所有权。

`MAS`、`MAG`、`RCA` 各自继续持有：

- 领域逻辑
- 领域产物结构
- 领域规则
- 领域 prompt / AGENTS / skill 组织
- 领域专用运行时与工具链

`OPL` 持有的是顶层统一入口与管理能力。

### 2. 调用关系

`OPL` 调用领域智能体时，使用的是统一的 `agent entry spec`。

这个 `agent entry spec` 至少需要定义：

- `agent_id`
- `entry_kind`
- `workspace_requirement`
- `locator_schema`
- `codex_entry_strategy`
- `artifact_conventions`
- `progress_conventions`

这样一来：

- `Codex` 直接调用领域智能体
- `OPL` 通过 GUI 调用领域智能体

这两种路径都会走同一套 entry spec。

### 3. handoff 的产品语义处理

当前公开语义中的 `handoff`、`domain wiring` 更像历史设计阶段留下的解释层。

新的产品模型里，公开概念统一收敛成：

- 选择 agent
- 选择 workspace
- 创建 session

内部如果仍然存在一次 adapter dispatch，也只属于 `session start` 的内部实现细节，不再作为一等公共产品概念暴露。

## 当前 Product API 目录

当前主线实现收敛为八类顶层资源与少量动作入口。

### 1. system

- `GET /api/opl/system`
- `GET /api/opl/system/initialize`
- `POST /api/opl/system/actions`
- `POST /api/opl/system/settings`

### 2. engines

- `GET /api/opl/engines`
- `POST /api/opl/engines/actions`

### 3. modules

- `GET /api/opl/modules`
- `POST /api/opl/modules/actions`

### 4. agents

- `GET /api/opl/agents`

### 5. workspaces

- `GET /api/opl/workspaces`
- `POST /api/opl/workspaces/root`
- `POST /api/opl/workspaces/bind`
- `POST /api/opl/workspaces/activate`
- `POST /api/opl/workspaces/archive`

### 6. sessions

- `GET /api/opl/sessions`
- `POST /api/opl/sessions`
- `POST /api/opl/sessions/resume`
- `GET /api/opl/sessions/logs`

### 7. progress

- `GET /api/opl/progress`

### 8. artifacts

- `GET /api/opl/artifacts`

调试与运行态排查继续保留独立 debug / ops 路由，例如：

- `/api/health`
- `/api/status/dashboard`
- `/api/status/runtime`
- `/api/status/workspace`
- `/api/domain/manifests`
- `/api/session/ledger`

## GUI 与 OPL 的映射

### 左侧栏

读取：

- `agents`
- `workspaces`
- `sessions`

用户操作：

- New Chat
- New Workspace
- 选择 agent
- 选择 workspace
- 切换 session

### 中间主区

围绕 `session` 展开：

- 创建 session
- 给 session 发消息
- 展示最近输出
- 展示当前状态

### 右侧侧栏

读取：

- `progress`
- `artifacts`
- `system`

用户看到的是：

- 人话进度
- 任务卡片
- 当前交付文件
- 环境与模块状态

## 共享模块的收敛原则

`OPL` 继续维护共享模块，前提是它们满足下面三个条件：

1. 至少服务两个以上领域智能体
2. 与具体领域逻辑无关
3. 在 GUI 与 CLI 两条入口中都能复用

建议保留的共享能力：

- `engine adapters`
- `workspace registry`
- `session store`
- `artifact index`
- `progress narrator`
- `agent registry`
- `shared contracts`

建议回收到领域仓的能力：

- 领域 prompt 拼装
- 领域专用产物约定
- 领域专用工具链
- 领域内部 runtime 控制面

## 可直接退役的旧公开语义

这轮重做完成后，下面这些旧公开语义进入退役清单：

- `frontdesk` 作为主线产品命名
- `frontdesk readiness`
- `frontdesk entry-guide`
- `frontdesk domain-wiring`
- `frontdesk dashboard`
- `/api/project-progress`
- `/api/ask`
- `/api/task-status`
- `/api/session/list`
- `/api/workspace/list`
- `/api/start`
- `/api/domain/launch`
- `/api/contract/handoff-envelope`

对应保留的真实能力，迁移到新的产品资源模型中：

- 安装与升级动作进入 `engines / modules / system`
- workspace 管理进入 `workspaces`
- 会话创建与恢复进入 `sessions`
- 进度进入 `progress`
- 交付文件进入 `artifacts`

## 对用户理解的直接结论

当前产品定义下，下面这些判断成立：

1. `OPL` 负责统一产品入口、共享运行时、系统管理与 GUI API
2. `MAS`、`MAG`、`RCA` 等领域仓继续作为独立专用智能体仓存在
3. `Codex` 继续承担默认交互与执行宿主
4. `OPL GUI` 调用领域智能体，与用户直接在 `Codex` 里调用该智能体，工作逻辑保持一致
5. `OPL` 与各个领域仓之间保持松耦合
6. 历史 `frontdesk / handoff / readiness` 公共语义进入退役或内部归档

## 本轮重构原则

### 要做

- 用新的产品资源模型重命名和重组 OPL API
- 用新的边界重写文档
- 清理旧的 `frontdesk` 主线命名
- 让 GUI 只对接新的 Product API

### 不做

- 不保留面向当前产品主线的公开兼容层
- 不继续给旧 `frontdesk` 体系增加新能力
- 不再把历史阶段解释面继续暴露为 GUI 主线真相

## 验收标准

1. 主线公开 API 里不再使用 `frontdesk` 作为用户面资源命名
2. `OPL` 的文档、代码与测试统一使用新的资源模型
3. Domain Agents 的调用语义在“直接 Codex 调用”和“OPL GUI 调用”之间保持一致
4. GUI 只消费 `system / engines / modules / agents / workspaces / sessions / progress / artifacts`
5. 历史 `frontdesk` 公开语义全部进入退役或内部归档
