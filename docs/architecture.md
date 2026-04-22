# OPL 架构

## 顶层分层

`OPL` 的当前主链路是：

`Human / Codex / opl shell / ACP shell / GUI shell -> OPL Session Runtime -> Codex CLI or Hermes-Agent -> Domain Agent Entry -> Domain Repository`

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / Codex / opl shell / External Shell -> OPL Session Runtime -> Codex CLI session or Hermes-Agent alternate -> selected agent entry -> domain runtime and deliverables`

这里的核心点是：

- `OPL` 当前主线以 family-level `session runtime` 为 canonical truth
- 本地 `opl` shell / TUI、`Codex` 显式调用、ACP-compatible 外部壳与 `Product API` 都消费同一套 runtime truth
- `Codex CLI` 是默认交互和执行宿主
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

### 1. OPL Session Runtime

负责：

- family-level session runtime
- 引擎注册表
- 模块注册表
- 智能体注册表
- shared module / contract / index registration
- 工作空间注册表
- 会话生命周期
- 进度投影
- 交付物投影
- shell compatibility surfaces

### 2. Engines

- `Codex CLI`
  - 默认交互与执行宿主
- `Hermes-Agent`
  - 备用执行器与长期在线网关

### 3. Domain Agent Entry

各个独立 `domain agent` 仓继续持有自己的智能体入口。

它们负责：

- 领域逻辑
- 领域规则
- 领域运行时
- 领域交付物

在当前定位下：

- `agent entry` 是给 `Codex`、`OPL` 与其他通用 agent 调用的稳定入口
- `direct entry / product entry` 是各个 domain agent 自己的轻量独立前门
- `domain gateway / domain harness` 继续保留为仓内边界层与执行层语言，不再作为仓库对外第一身份
- `OPL` 当前通过 repo-owned `domain agent entry spec` 消费各 domain agent 的基础入口真相，而不再只依赖顶层硬编码蓝图

### 4. Shell Projection Layer

外部界面仓、ACP-compatible 壳与 `Product API` projection 都属于这一层。
它们读取同一套 session runtime truth，把 `agents / workspaces / sessions / progress / artifacts` 映射成：

- 本地 `opl` shell / TUI
- `Codex` 中的显式调用面
- ACP-compatible 外部壳
- `Product API` / `opl web`
- 未来 hosted / online 壳

## OPL 与 Domain Agents 的关系

- `OPL` 不持有领域运行时所有权
- `OPL` 不替代领域智能体自己的逻辑
- `OPL` 负责 family-level session runtime、shared modules/contracts/indexes、统一入口与 projection surface
- `MAS`、`MAG`、`RCA` 作为独立 `domain agent`，可以通过 `OPL` 调用，也可以被 `Codex` 直接调用
- 两条入口的工作逻辑保持一致

## 默认执行策略

- 默认执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Hermes-Agent` 当前作为 `experimental` 备选执行路线与长期在线网关

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdesk` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
