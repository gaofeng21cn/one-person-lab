# OPL 架构

## 顶层分层

`OPL` 的当前主链路是：

`Human / Codex / opl / GUI shell -> Codex-default Session Runtime -> OPL Activation Layer / Typed Family Queue -> Domain Capability Surface -> Domain Repository`

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / Codex / opl / External Shell -> Codex-default session/runtime path -> explicit OPL activation when needed -> selected domain capability surface -> domain runtime and deliverables`

显式长跑托管任务与 online management 的目标链路在这个主链路下增加 Hermes-first 在线 substrate：

`OPL Product Entry / GUI / CLI -> OPL Runtime Manager / family-runtime queue -> required external Hermes-Agent online substrate / Hermes gateway system service -> Domain Adapter -> selected domain capability surface -> domain runtime and deliverables`

这里的核心点是：

- `OPL` 当前主线以 `Codex-default session/runtime + explicit activation layer` 为 canonical truth
- 本地 `opl`、直接 `Codex` 使用、ACP-compatible 外部壳与基于开源 AionUI 定制的 `opl-aion-shell` 都消费同一套 runtime truth
- `OPL Runtime Manager` 是 OPL 产品级管理/诊断/投影层；它管理受支持的外部 `Hermes-Agent` online substrate、typed family queue、domain dispatch 与 online runtime readiness，但不复制 runtime kernel
- family-level runtime supervision 作为 domain-owned wakeup / supervision surface 的 discovery、export、parity、enqueue 与 projection；Hermes 提供 OPL-managed online wakeup substrate，`OPL` 不接管 domain scheduler、session、memory、quality 或 artifact authority
- `opl`、`opl exec`、`opl resume` 默认继承 `Codex CLI` 语义
- `opl install` 默认安装或复用 Codex、Hermes online runtime、MAS/MAG/RCA domain modules 与推荐 companion tools；`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- 首启 readiness 分为 Core、Domain modules、Hermes online runtime 三层；Full OPL readiness 要求三层都 ready
- `opl skill sync` 把 family domain skill pack 注册到 Codex 环境，并按 workspace/worktree 布局自动发现 sibling repo；显式 runtime switch 或 domain contract 调用才进入 activation layer
- `opl module install` 负责把缺失 domain repo 拉进 OPL-managed modules root，并串起 repo bootstrap、skill sync 与 health check 这条闭环安装线
- `opl module exec` 负责把自动化 CLI 调用绑定到 OPL module registry 解析出的当前 checkout；domain CLI 从 repo checkout 内启动，避免把用户 PATH 上的旧全局 tool 当作执行真相
- `Hermes-Agent` 是默认 online runtime substrate；具体 executor 仍由 Codex default 或 domain route 选择
- `MAS`、`MAG`、`RCA` 等领域智能体继续保持独立，并通过 CLI / 本地程序 / 脚本 / contract 暴露 capability surface
- MAS v2 alignment 下，`MAS` 作为独立 domain agent 通过单一 MAS domain app skill 接入；`OPL` 只消费 MAS-owned entry/projection truth，不新增 MAS runtime kernel、standalone product release 或 OPL-owned readiness verdict

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

### 2.5 OPL Runtime Manager / Family Runtime Bridge

负责：

- `Hermes-Agent` online substrate 的 provision / version pin / profile wiring
- Hermes online-management gateway readiness 的触发、检查与状态报告
- `opl family-runtime` typed queue、idempotency、lease、retry、dead-letter、approval、local inbox 与 event export
- Hermes cron/webhook bridge：`hermes cron -> opl family-runtime tick --source hermes-cron --hydrate`，以及 webhook intake 到 OPL queue
- domain task registration contract 的 hydration；当前 MAS 通过 `pending_family_tasks[]` 把非终局、非 hard human gate 的 autonomy blocker 交给 OPL queue
- family runtime supervision contract 的只读发现、导出、一致性检查与产品投影；其中 adapter_id、cadence、last_success / last_tick、lease_freshness、SLO state、repair command、safe reconcile hint 与 source refs 均来自 domain-owned surface
- runtime status、session、progress、artifact、attention queue 的 OPL 产品级投影
- `opl runtime manager`、doctor、repair、resume 等诊断和恢复入口
- 可选 Rust `OPL native helper` 的 registry，例如 system probe、native doctor、runtime watch、artifact indexer、state indexer
- Rust helper 的 package lifecycle：`native:build`、`native:doctor`、`native:repair`、`native:test`，以及随 npm package 分发的 Cargo workspace 与 helper 脚本
- Rust helper 的 prebuild/cache lifecycle：优先消费匹配平台与 crate version 的 prebuild manifest，把 binaries 安装进 `OPL_STATE_DIR` cache；缺失或无效时回到本地 Cargo build
- 高频文件/状态索引的 contract-first catalog；workspace 扫描、session ledger 索引、artifact manifest、large JSON 校验与目录 snapshot 优先由 Rust helper 承担
- 当 Rust helper 可发现时，`OPL Runtime Manager` 通过 JSON stdio 调用 native doctor、state indexer、artifact indexer 与 runtime watch，并把一次聚合 projection 持久化到 OPL 本地 state；该 projection 带 TTL、diff history、failure log、last-success snapshot 与 freshness 判断，只做索引与诊断加速，不替代 domain 仓的 durable truth
- native family smoke 明确分成本地真实 workspace 模式与 CI fixture 模式；两者都只覆盖 MAS/MAG，不进入 RCA 当前暂缓的 TS/Python 重分层线

不负责：

- domain scheduler kernel
- domain session / memory store
- domain truth
- concrete executor
- domain wakeup / supervision scheduler
- Hermes gateway system service lifecycle implementation beyond invoking Hermes-supported install/repair/status commands
- 私有 fork / vendor 一份 `Hermes-Agent`

这层让未来如果真的需要迁移到自有完整长期常驻 sidecar，已有 task registration、status projection、native helper、state index 与 domain owner 边界可以直接复用；但当前 promotion gate 是外部 `Hermes-Agent` 无法表达 OPL 必需的 task、wakeup、approval、audit 或产品隔离合同时，才进入完整 sidecar 评估。

### 3. Engines

- `Codex CLI`
  - 默认交互与执行宿主
- `Hermes-Agent`
  - 默认 online runtime substrate 与 gateway owner；由 `OPL Runtime Manager` 做产品级管理和投影，具体执行语义只在显式切换 executor 或 domain route 选择时进入

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
- `MAS` 的当前接入单元是单一 domain app skill 加 repo-owned projection surfaces；`OPL` 消费这些 surface 做统一发现、显示和路由，不替代 MAS 的 runtime/controller/publication authority
- `MDS` 不再作为 MAS 默认运行依赖参与 OPL 安装；MAS 只可把它显式暴露为 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion，不作为这一层的 OPL 顶层 domain agent

#### Family Action Catalog

`Family Action Catalog` 是这一层新增的 machine-readable callable-action surface。它服务的目标是让 `MAS`、`MAG`、`RCA` 在各自仓内声明一次 action metadata，再派生 CLI、MCP descriptor、Skill command contract、product-entry manifest、OpenAI tool 与 AI SDK tool descriptor。

边界如下：

- `family-action-graph` 继续描述流程图、节点、边、checkpoint policy 与 human gate。
- `family-action-catalog` 描述可调用 action：`action_id`、owner、effect、input/output schema ref、source command、supported surfaces、human gates、workspace locator 与 authority boundary。
- `OPL` 只负责 shared schema、TS/Python helper、manifest normalizer、parity helper，以及 `opl actions list|inspect|export` 这组只读发现命令。
- domain 仓继续持有 handler、runtime、controller truth、review truth、quality verdict 与 publication/deliverable authority。
- 外部 `Ageniti` 的可取之处只被吸收到 contract 思路：单一 app action 定义派生多种调用面；OPL family 不引入 `@ageniti/core` runtime dependency。

### 5. Shell Projection Layer

外部界面仓与 ACP-compatible 壳属于这一层。当前 GUI 适配仓是基于开源 AionUI 定制的 `opl-aion-shell`；它通过 ACP-compatible runtime surface 消费 OPL session/runtime truth，不拥有 runtime。
它们读取同一套 session runtime truth，把 `agents / workspaces / sessions / progress / artifacts` 映射成：

- 本地 `opl` shell / TUI
- `Codex` 中的显式调用面
- ACP-compatible 外部壳
- `opl-aion-shell` AionUI 定制 GUI
- 未来 hosted / online 壳

## OPL 与 Domain Agents 的关系

- `OPL` 不持有领域运行时所有权
- `OPL` 不替代领域智能体自己的逻辑
- `OPL` 负责 Codex-default session/runtime、activation layer、shared modules/contracts/indexes、统一入口与 projection surface
- `MAS`、`MAG`、`RCA` 作为独立 `domain agent`，可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用
- 两条入口的工作逻辑保持一致
- 对 `MAS` 来说，OPL projection 只携带 evidence、provenance、状态和路由信号；ready、submission、publication、quality 等最终判断仍回到 MAS-owned durable surfaces

## 默认执行策略

- 默认执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Hermes-Agent` 当前作为 Full OPL online family runtime 的 required external substrate / online-management gateway 保留；作为 concrete executor 时仍是显式 route 选择，不替代 Codex CLI 默认执行语义

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdoor` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
