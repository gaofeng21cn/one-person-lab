# OPL 架构

## 顶层分层

`OPL` 的当前主链路是：

`Human / GUI Shell / CLI -> OPL Product Runtime -> Codex or Hermes -> Domain Agent Entry -> Domain Repository`

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / External GUI Shell / CLI -> OPL Product API -> Codex session or Hermes alternate -> selected agent entry -> domain runtime and deliverables`

这里的核心点是：

- GUI 外壳与 CLI 消费同一套 `OPL Product API`
- `Codex` 是默认交互和执行宿主
- `Hermes-Agent` 是备用执行器与长期在线网关
- `MAS`、`MAG`、`RCA` 等领域智能体继续保持独立

## 当前主线资源

`OPL` 当前主线只公开这组产品资源：

- `system`
- `engines`
- `modules`
- `agents`
- `workspaces`
- `sessions`
- `progress`
- `artifacts`

这组资源一起定义了 GUI 与 CLI 的共同产品模型。

## 各层职责

### 1. OPL Product Runtime

负责：

- 共享运行时
- 引擎注册表
- 模块注册表
- 智能体注册表
- 工作空间注册表
- 会话状态
- 进度叙述
- 交付物发现

### 2. Engines

- `Codex`
  - 默认交互与执行宿主
- `Hermes-Agent`
  - 备用执行器与长期在线网关

### 3. Domain Agent Entry

各个领域仓继续持有自己的智能体入口。

它们负责：

- 领域逻辑
- 领域规则
- 领域运行时
- 领域交付物

### 4. GUI Shell

外部界面仓负责 GUI 外壳。
它读取同一套 Product API，把 `agents / workspaces / sessions / progress / artifacts` 映射为界面。

## OPL 与 Domain Agents 的关系

- `OPL` 不持有领域运行时所有权
- `OPL` 不替代领域智能体自己的逻辑
- `OPL` 负责顶层共享运行时与统一入口
- `MAS`、`MAG`、`RCA` 可以通过 `OPL` 调用，也可以被 `Codex` 直接调用
- 两条入口的工作逻辑保持一致

## 默认执行策略

- 默认执行器：`Codex CLI autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Hermes-native` 继续作为实验路线和备用路径

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdesk` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
