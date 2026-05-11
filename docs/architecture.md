# OPL 架构

## 顶层分层

`OPL` 的目标不是只做入口聚合或工作台投影，而是完整的 Codex-first、stage-led family agent runtime framework。它允许使用外部 provider，但框架职责归 OPL：stage attempt lifecycle、typed queue、handoff、human gate、retry/dead-letter、observability、artifact/file lifecycle 与 operator projection。

`OPL` 的当前主链路是：

`Human / Codex / opl / GUI shell -> Codex-default Session Runtime -> OPL Activation Layer / Stage Control Plane / Typed Family Queue -> Domain Capability Surface -> Domain Repository`

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / Codex / opl / External Shell -> Codex-default session/runtime path -> explicit OPL activation when needed -> configured family runtime provider when durable orchestration is needed -> selected domain capability surface -> domain runtime and deliverables`

显式长跑托管任务与 online management 的目标链路在这个主链路下增加 provider-backed family runtime substrate：

`OPL Product Entry / GUI / CLI -> OPL Runtime Manager / family-runtime queue -> configured family runtime provider -> Domain Adapter -> selected domain capability surface -> domain runtime and deliverables`

这里的核心点是：

- `OPL` 当前主线以 `Codex-default session/runtime + explicit activation layer` 为 canonical truth
- `OPL` 的 family-level agent framework 以 domain `stage` 为可观察、可编排、可恢复、可审计的语义单元；`Codex CLI` 是 stage 内默认最小执行单元
- 大型任务按接近人类专家实施的阶段推进：界定目标、准备材料、执行、审核、修订、交付收口；OPL 负责阶段生命周期与可见性，domain agent 负责领域判断和交付 authority
- 本地 `opl`、直接 `Codex` 使用、ACP-compatible 外部壳与基于开源 AionUI 定制的 `opl-aion-shell` 都消费同一套 runtime truth
- `OPL Runtime Manager` 是 OPL 产品级管理/诊断/投影层；它管理受支持的 family runtime provider、typed family queue、stage attempt ledger、domain dispatch 与 online runtime readiness，但不复制 domain runtime kernel
- family-level runtime supervision 作为 domain-owned wakeup / supervision surface 的 discovery、export、parity、enqueue 与 projection；Temporal-backed provider 是目标生产 substrate，Hermes/local provider 在迁移期保留 legacy/optional provider 角色，`OPL` 不接管 domain scheduler、session、memory、quality 或 artifact authority
- `opl`、`opl exec`、`opl resume` 默认继承 `Codex CLI` 语义
- `opl install` 默认安装或复用 Codex、family runtime provider、MAS/MAG/RCA domain modules 与推荐 companion tools；`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- 首启 readiness 分为 Core、Domain modules、family runtime provider 三层；Full OPL readiness 要求三层都 ready
- `opl skill sync` 把 family domain skill pack 注册到 Codex 环境，并按 workspace/worktree 布局自动发现 sibling repo；显式 runtime switch 或 domain contract 调用才进入 activation layer
- `opl module install` 负责把缺失 domain repo 拉进 OPL-managed modules root，并串起 repo bootstrap、skill sync 与 health check 这条闭环安装线
- `opl module exec` 负责把自动化 CLI 调用绑定到 OPL module registry 解析出的当前 checkout；domain CLI 从 repo checkout 内启动，避免把用户 PATH 上的旧全局 tool 当作执行真相
- `Codex CLI` 是默认 concrete executor；family runtime provider 负责 stage-attempt durability / wakeup / approval / retry / query transport，具体 executor 仍由 Codex default 或 domain stage 选择
- `MAS`、`MAG`、`RCA` 等领域智能体继续保持独立，并通过 CLI / 本地程序 / 脚本 / contract 暴露 capability surface
- MAS v2 alignment 下，`MAS` 作为独立 domain agent 通过单一 MAS domain app skill 接入；`OPL` 只消费 MAS-owned entry/projection truth，包括 `mas_opl_runtime_workbench_projection` 的 App drilldown/read-only workbench 投影，不新增 MAS runtime kernel、standalone product release 或 OPL-owned readiness verdict

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
- stage descriptor、skill / prompt / evaluation refs、handoff envelope、receipt 与 authority boundary discovery
- shared module / contract / index registration
- family skill pack discovery / sync
- 显式 domain contract dispatch
- domain capability surface discovery

### 2.5 OPL Runtime Manager / Family Runtime Bridge

负责：

- family runtime provider 的 provision / version pin / profile wiring
- provider readiness 的触发、检查与状态报告；Temporal provider 是生产目标，Hermes gateway readiness 只属于迁移期 legacy/optional provider
- `opl family-runtime` typed queue、stage attempt ledger、idempotency、lease、retry、dead-letter、approval、local inbox 与 event export
- `opl family-runtime attempt create|list|inspect` 的 provider receipt 与 task-bound lifecycle projection；该 ledger 只记录 control metadata、checkpoint/closeout refs、human gate refs 与 blocked reason
- provider wakeup bridge；迁移期 Hermes cron/webhook bridge 仍可使用 `hermes cron -> opl family-runtime tick --source hermes-cron --hydrate`，但不再是目标唯一 provider 形态
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
- provider system-service lifecycle implementation beyond invoking supported install/repair/status commands
- 私有 fork / vendor 一份 `Hermes-Agent` 或把 Temporal/Hermes 任一 provider 写成 domain truth owner

这层让未来 provider 切换时，已有 task registration、status projection、native helper、state index 与 domain owner 边界可以直接复用。当前优先级是 Temporal-backed provider pilot；只有 Temporal/provider abstraction 无法表达 OPL 必需的 task、wakeup、approval、audit 或产品隔离合同时，才进入自有完整长期常驻 sidecar 评估。

### 3. Engines

- `Codex CLI`
  - 默认交互与执行宿主
- `Family runtime provider`
  - 目标生产形态是 Temporal-backed provider，承接 durable workflow、activity retry/timeout、human-gate signal、status query 与 execution history；由 `OPL Runtime Manager` 做产品级管理和投影
- `Hermes-Agent`
  - 迁移期 legacy/optional provider 与显式 executor/proof lane；具体执行语义只在显式切换 executor 或 domain route 选择时进入

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
- `domain harness / controller` 继续保留为仓内边界层与执行层语言，不再作为仓库对外第一身份
- `OPL` 当前通过 repo-owned `domain agent entry spec` 消费各 domain agent 的基础入口真相，而不再只依赖顶层硬编码蓝图
- `MAS` 的当前接入单元是单一 domain app skill 加 repo-owned projection surfaces；`OPL` 消费这些 surface 做统一发现、显示和路由，不替代 MAS 的 runtime/controller/publication authority
- `mas_opl_runtime_workbench_projection` 是 MAS 输出给 OPL App 的 read-only study workbench 投影；OPL runtime snapshot 可以把它映射为 study drilldown、links、terminal read-only status 和 action transport metadata，但 action receipt、terminal attach owner、study truth、publication verdict、quality verdict 与 artifact authority 继续由 MAS 持有
- `MDS` 不再作为 MAS 默认运行依赖参与 OPL 安装；MAS 只可把它显式暴露为 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion，不作为这一层的 OPL 顶层 domain agent

#### Family Action Catalog

`Family Action Catalog` 是这一层新增的 machine-readable callable-action surface。它服务的目标是让 `MAS`、`MAG`、`RCA` 在各自仓内声明一次 action metadata，再派生 CLI、MCP descriptor、Skill command contract、product-entry manifest、OpenAI tool 与 AI SDK tool descriptor。

边界如下：

- `family-action-graph` 继续描述流程图、节点、边、checkpoint policy 与 human gate。
- `family-action-catalog` 描述可调用 action：`action_id`、owner、effect、input/output schema ref、source command、supported surfaces、human gates、workspace locator 与 authority boundary。
- `OPL` 只负责 shared schema、TS/Python helper、manifest normalizer、parity helper，以及 `opl actions list|inspect|export` 这组只读发现命令。
- domain 仓继续持有 handler、runtime、controller truth、review truth、quality verdict 与 publication/deliverable authority。
- 外部 `Ageniti` 的可取之处只被吸收到 contract 思路：单一 app action 定义派生多种调用面；OPL family 不引入 `@ageniti/core` runtime dependency。

#### Family Stage Control Plane

`Family Stage Control Plane` 是 `MAS` stage 化经验上升后的 family 级 shared descriptor / discovery surface。它把程序责任限制在阶段目标、skill / prompt / evaluation refs、输入输出、handoff、receipt、projection 与 authority boundary 上，把阶段内部的专家拆解、创作、审核、修订和诊断继续交给 `Codex CLI` 与 domain-owned AI workflow。阶段的粒度应接近人类专家真实推进复杂工作的方式，而不是把开放式知识工作压成固定脚本节点。

在顶层定位上，这就是 OPL 对标 DeerFlow、LangGraph、Temporal、Dify、AutoGen、CrewAI 等 agent / workflow framework 时的核心差异：这些框架通常以 LLM 调用、agent 节点、tool call 或 workflow activity 作为原子能力；OPL family framework 以 domain stage 作为语义调度单元，以 `Codex CLI` 这种强执行器作为默认最小执行单元。OPL 因此提供 durable state、queue、handoff、approval、retry、projection 和 observability，并以高价值知识工作的全自动交付为目标，但不替 domain agent 生成领域判断。

对 `MAS` 来说，这一层是对既有 route contract 和 stage-led policy 的 inventory / descriptor 映射，不是替换现有 stage、改变 stage 数量或重写 controller 流程。`scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等实际 route id 继续由 MAS 持有。

边界如下：

- `family-action-graph` 继续描述 stage / action 拓扑、入口、出口、checkpoint 与 human gate。
- `family-action-catalog` 继续描述可调用 action metadata 和多 surface descriptor。
- `family-stage-control-plane` 只声明 stage descriptor、skill / prompt / evaluation refs、handoff refs 与 authority boundary，不新建完整流程引擎。
- `opl stages list|inspect` 只做 discovery、inspection 与 parity，不执行 stage。
- `OPL` 只做 shared vocabulary、manifest discovery、parity、projection 与 typed queue dispatch，不执行 stage 内部专家动作。
- `MAS`、`RCA`、`MAG` 继续持有各自的写作、视觉设计、基金策略、审稿、publication / deliverable / package gate 与最终质量判断。
- `MAS` 命名统一只能在 inventory 证明逻辑层级不变、原 route contract 可追溯、truth surface 不漂移后进行。

当前参考计划是 [OPL Family stage control plane adoption plan](./references/convergence-governance/family-stage-control-plane-adoption-plan.zh-CN.md)。

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
- `OPL` 负责 stage-led family framework 支撑：stage descriptor、handoff、queue、wakeup、retry、approval、trace、projection 和 parity；domain agent 负责 stage pack、prompt/skill、quality gate、truth reducer 和交付 authority
- `MAS`、`MAG`、`RCA` 作为独立 `domain agent`，可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用
- 两条入口的工作逻辑保持一致
- 对 `MAS` 来说，OPL projection 只携带 evidence、provenance、状态和路由信号；ready、submission、publication、quality 等最终判断仍回到 MAS-owned durable surfaces

## 当前实现边界与缺口

当前 OPL 已经实现的是 family framework 的控制面骨架与 repo/test 级最小 provider 闭环：

- shared contract：`family-action-catalog`、`family-action-graph`、`family-stage-control-plane`、`family-runtime-supervision`、`family-persistence-policy`、`family-lifecycle-ledger`、`family-owner-route`、`family-product-entry-manifest-v2`。
- shared helper：TypeScript helper 与 `python/opl-harness-shared` mirror，可供 MAS/MAG/RCA 生成 action/stage/runtime/product-entry projection。
- local orchestration：`opl family-runtime` typed queue、pending task intake、guarded dispatch、local inbox/event、retry/dead-letter 信号和 stage attempt ledger。
- discovery：`opl actions` / `opl stages` / `opl agents` 只读发现与 parity；当前 MAS/MAG/RCA skeleton adapters 可被 OPL 真实 manifest discovery 校验为 aligned，且必须带 artifact locator surface。
- provider execution：Temporal `StageAttemptWorkflow`、Codex / domain sidecar activity、human gate / user instruction / resume signal、stage attempt query、CLI `attempt start|query|signal`、worker lifecycle status 和 fail-closed readiness 已落地到 repo/test 面；缺少 Temporal 地址时本机 worker readiness 明确报告 `not_configured`。
- typed receipt / workbench：Codex stage activity 已有 dry-run receipt、typed closeout required-for-completion gate、consumed refs / memory refs / writeback receipt refs / rejected writes / route impact / next owner 投影；`opl runtime snapshot` 已输出只读 `stage_attempt_workbench`。

当前尚未实现的是完整生产级 stage execution runtime：

- Temporal-backed provider 尚未成为默认生产 residency：真实 Temporal server / worker deployment、worker restart / re-query、长期 worker residency 和 production retry/dead-letter 运行证据仍未闭合。
- `Codex CLI` stage activity runner 仍停在 dry-run / fixture-run 层；真实长时 Codex process supervision、heartbeat、checkpoint、progress / cost sampling 和 live typed closeout collection 仍需落地。
- OPL App / GUI 已能消费 stage-attempt workbench 和 provider-level signal 传输，但仍需要真实 worker/domain 执行证明、domain/stage/blocker/memory refs 分组操作面，以及避免把 provider completion 写成 domain ready verdict 的持续 UI 验收。
- MAS real paper line、MAG grant stage 和 RCA visual stage 仍需要真实或 controlled guarded apply soak，证明 OPL-hosted path 与 direct skill path 共享 domain owner receipts 且语义等价。

所以，OPL 现在可以被描述为 `Codex-first, stage-led family framework control plane, Temporal provider minimal loop, typed closeout gate, and domain skeleton discovery landed`。它的目标是完整智能体运行框架和高价值知识工作全自动交付，但当前不能描述为 `production Temporal-backed autonomous execution framework fully landed`。

## 默认执行策略

- 默认执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Family runtime provider` 当前是 Full OPL online family runtime 的 readiness 对象；Temporal-backed provider 是生产目标，Hermes-Agent 在迁移期只作为 legacy/optional provider 或显式 route-selected executor/proof lane，不替代 Codex CLI 默认执行语义

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdoor` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
