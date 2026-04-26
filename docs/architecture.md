# OPL 架构

## 顶层分层

`OPL` 的当前主链路是：

`Human / Codex / opl / GUI shell -> Codex-default Session Runtime -> OPL Activation Layer -> Domain Capability Surface -> Domain Repository`

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / Codex / opl / External Shell -> Codex-default session/runtime path -> explicit OPL activation when needed -> selected domain capability surface -> domain runtime and deliverables`

长跑任务的目标链路在这个主链路下增加一层薄管理面：

`OPL Product Entry / GUI / CLI -> OPL Runtime Manager -> external Hermes-Agent runtime substrate -> Domain Adapter -> selected domain capability surface -> domain runtime and deliverables`

这里的核心点是：

- `OPL` 当前主线以 `Codex-default session/runtime + explicit activation layer` 为 canonical truth
- 本地 `opl`、直接 `Codex` 使用、ACP-compatible 外部壳与 OPL-branded AionUI GUI/WebUI 都消费同一套 runtime truth
- `OPL Runtime Manager` 是 OPL 产品级管理/诊断/投影层；它管理受支持的外部 `Hermes-Agent` kernel，但不复制 runtime kernel
- `opl`、`opl exec`、`opl resume` 默认继承 `Codex CLI` 语义
- `opl skill sync` 把 family domain skill pack 注册到 Codex 环境，并按 workspace/worktree 布局自动发现 sibling repo；显式 runtime switch 或 domain contract 调用才进入 activation layer
- `opl module install` 负责把缺失 domain repo 拉进 OPL-managed modules root，并串起 repo bootstrap、skill sync 与 health check 这条闭环安装线
- `Hermes-Agent` 只作为显式 opt-in 的备选 runtime
- `MAS`、`MAG`、`RCA` 等领域智能体继续保持独立，并通过 CLI / 本地程序 / 脚本 / contract 暴露 capability surface

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

这组资源一起定义了 GUI、CLI 与 activation handles 的共同产品模型。

## 各层职责

### 1. Codex-default Session Runtime

负责：

- family-level session runtime
- 默认交互合同
- `opl` / `opl exec` / `opl resume` 的前门语义
- 工作空间注册表
- 会话生命周期
- 进度投影
- 交付物投影
- shell compatibility surfaces

### 2. OPL Activation Layer

负责：

- 引擎注册表
- 模块注册表
- 智能体注册表
- shared module / contract / index registration
- family skill pack discovery / sync
- 显式 domain contract dispatch
- domain capability surface discovery

### 2.5 OPL Runtime Manager

负责：

- 受支持 `Hermes-Agent` runtime 的 provision / version pin / profile wiring
- domain task registration contract 的 hydration
- runtime status、session、progress、artifact、attention queue 的 OPL 产品级投影
- `opl runtime manager`、doctor、repair、resume 等诊断和恢复入口
- 可选 Rust `OPL native helper` 的 registry，例如 system probe、native doctor、runtime watch、artifact indexer、state indexer
- 高频文件/状态索引的 contract-first catalog；workspace 扫描、session ledger 索引、artifact manifest、large JSON 校验与目录 snapshot 优先由 Rust helper 承担
- 当 Rust helper 可发现时，`OPL Runtime Manager` 通过 JSON stdio 调用 native doctor、state indexer、artifact indexer 与 runtime watch，并把一次聚合 projection 持久化到 OPL 本地 state；该 projection 只做索引与诊断加速，不替代 domain 仓的 durable truth

不负责：

- scheduler kernel
- session / memory store
- domain truth
- concrete executor
- 私有 fork / vendor 一份 `Hermes-Agent`

这层让未来如果真的需要迁移到自有完整长期常驻 sidecar，已有 task registration、status projection、native helper、state index 与 domain owner 边界可以直接复用；但当前 promotion gate 是外部 `Hermes-Agent` 无法表达 OPL 必需的 task、wakeup、approval、audit 或产品隔离合同时，才进入完整 sidecar 评估。

### 3. Engines

- `Codex CLI`
  - 默认交互与执行宿主
- `Hermes-Agent`
  - 显式切换或长跑托管时使用的外部 runtime substrate owner；由 `OPL Runtime Manager` 做产品级管理和投影

### 4. Domain Capability Surface And Entry

各个独立 `domain agent` 仓继续持有自己的智能体入口。

它们负责：

- 稳定 capability surface（CLI / 本地程序 / 脚本 / contract）
- 领域逻辑
- 领域规则
- 领域运行时
- 领域交付物

在当前定位下：

- `agent entry` 是给 `Codex`、`OPL` 与其他通用 agent 调用的稳定入口
- `direct entry / product entry` 是各个 domain agent 自己的轻量独立前门
- `domain gateway / domain harness` 继续保留为仓内边界层与执行层语言，不再作为仓库对外第一身份
- `OPL` 当前通过 repo-owned `domain agent entry spec` 消费各 domain agent 的基础入口真相，而不再只依赖顶层硬编码蓝图

### 5. Shell Projection Layer

外部界面仓与 ACP-compatible 壳属于这一层。
它们读取同一套 session runtime truth，把 `agents / workspaces / sessions / progress / artifacts` 映射成：

- 本地 `opl` shell / TUI
- `Codex` 中的显式调用面
- ACP-compatible 外部壳
- OPL-branded AionUI GUI/WebUI
- 未来 hosted / online 壳

## OPL 与 Domain Agents 的关系

- `OPL` 不持有领域运行时所有权
- `OPL` 不替代领域智能体自己的逻辑
- `OPL` 负责 Codex-default session/runtime、activation layer、shared modules/contracts/indexes、统一入口与 projection surface
- `MAS`、`MAG`、`RCA` 作为独立 `domain agent`，可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用
- 两条入口的工作逻辑保持一致

## 默认执行策略

- 默认执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Hermes-Agent` 当前作为 `experimental` 备选执行路线，仅在显式切换时进入

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdesk` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
