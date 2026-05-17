# OPL 架构

## 顶层分层

`OPL` 的目标不是只做入口聚合或工作台投影，而是完整的 stage-led family agent runtime framework。当前产品认知分成 `OPL Framework`、`One Person Lab App` 和 `Foundry Agents` 三层：Framework 负责开发与运行框架，App 负责普通用户工作台，Foundry Agents 负责领域智能体与交付权威。阶段内最小执行单位是 Agent executor；`Codex CLI` 是当前第一公民 executor。

OPL Framework 允许使用外部 provider，但框架职责归 OPL：stage attempt lifecycle、typed queue、handoff、human gate、retry/dead-letter、observability、artifact/file lifecycle 与 operator projection。

`OPL` 的当前主链路是：

`Human / Codex / opl / One Person Lab App -> Codex-default Session Runtime -> OPL Activation Layer / Stage Control Plane / Typed Family Queue -> Domain Capability Surface -> Domain Repository`

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / Codex / opl / One Person Lab App / External Shell -> Codex-default session/runtime path -> explicit OPL activation when needed -> configured family runtime provider when durable orchestration is needed -> selected domain capability surface -> domain-owned stage pack / receipt / deliverables`

显式长跑托管任务与 online management 的目标链路在这个主链路下增加 provider-backed family runtime substrate：

`OPL Product Entry / One Person Lab App / CLI -> OPL stage-led family runtime provider -> thin Domain Adapter -> selected domain capability surface -> domain-owned stage pack / receipt / deliverables`

这里的核心点是：

- `OPL` 当前主线以 `Codex-default session/runtime + explicit activation layer` 为 canonical truth
- `OPL Framework` 集成开发与运行：developer-facing CLI/contracts/package 入口和 runtime control plane 使用同一套 truth；不通过拆仓或复制 runtime 来制造第二框架
- OPL-compatible Agent 以独立 repo/package 形态开发；运行时通过 `opl framework locate` / `opl_framework_locator` 定位外部 OPL Framework 环境，再调用 framework-owned runtime、contract、package 或 projection surface
- `One Person Lab App` 是 user-facing workbench：它消费 Framework 的 runtime/activation truth 和 domain-owned projection，不成为 domain runtime、quality verdict 或 artifact authority
- `OPL` 的 family-level agent framework 以 domain `stage` 为可观察、可编排、可恢复、可审计的语义单元；Agent executor 是 stage 内最小执行单位，`Codex CLI` 是当前第一公民 executor
- 大型任务按接近人类专家实施的阶段推进：界定目标、准备材料、执行、审核、修订、交付收口；OPL 负责阶段生命周期与可见性，domain agent 负责领域判断和交付 authority
- 本地 `opl`、直接 `Codex` 使用、ACP-compatible 外部壳与 App repo 通过 `opl-aion-shell` 提供的 GUI shell 都消费同一套 runtime truth
- OPL hosted integration 是 OPL 产品级管理/诊断/投影层；它管理受支持的 family runtime provider、typed family queue、stage attempt ledger、domain dispatch 与 online runtime readiness，但不复制 domain runtime kernel
- family-level runtime supervision 作为 domain-owned wakeup / supervision surface 的 discovery、export、parity、enqueue 与 projection；Temporal-backed provider 是 production online runtime 的必需 substrate，local provider 只服务 dev/CI/offline diagnostic baseline，`hermes_agent` 是显式非默认 executor adapter/backend；旧 Hermes provider / Gateway 语料只作为 proof、provenance、diagnostic、fixture 或负向 guard 读取，`OPL` 不接管 domain scheduler、session、memory、quality 或 artifact authority
- OPL Agent Lab 属于 Framework 内部 eval / improvement control plane：它把 descriptor、stage attempt、provider receipt、domain-owned eval/proof refs 和 operator blocker 组织成 lab run、improvement candidate、acceptance evidence 与 follow-up projection；它不接管 MAS/MAG/RCA 的 domain truth、quality verdict、artifact authority、memory body 或 owner receipt authority
- `opl`、`opl exec`、`opl resume` 默认继承 `Codex CLI` 语义
- `opl install` 默认安装或复用 Codex、family runtime provider、MAS/MAG/RCA domain modules 与推荐 companion tools；`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- 首启 readiness 分为 Core、Domain modules、family runtime provider 三层；Full OPL readiness 要求三层都 ready
- `opl skill sync` 把 family domain skill pack 注册到 Codex 环境，并按 workspace/worktree 布局自动发现 sibling repo；显式 runtime switch 或 domain contract 调用才进入 activation layer
- `opl module install` 负责把缺失 domain repo 拉进 OPL-managed modules root，并串起 repo bootstrap、skill sync 与 health check 这条闭环安装线
- `opl module exec` 负责把自动化 CLI 调用绑定到 OPL module registry 解析出的当前 checkout；domain CLI 从 repo checkout 内启动，避免把用户 PATH 上的旧全局 tool 当作执行真相
- `Codex CLI` 是默认且第一公民的 concrete executor；family runtime provider 负责 stage-attempt durability / wakeup / approval / retry / query transport，具体 executor 仍由 OPL / domain stage 显式选择
- `OPL Product Entry` 的普通 ask/chat/resume 路径只使用 Codex-default executor；runtime status 不再暴露 Hermes / Gateway diagnostics，显式非默认 executor 只通过独立 receipt / audit surface 进入
- `MAS`、`MAG`、`RCA` 等 Foundry Agents 继续保持独立，并通过 CLI / 本地程序 / 脚本 / contract 暴露 capability surface；它们以 OPL-compatible package / repo 接入，而不是内嵌一份 OPL runtime
- Foundry Agent repo 的目标形态是 `Domain Knowledge / Authority Pack + thin adapter`：声明 stage、prompt/skill、knowledge refs、quality gate、transition spec、projection builder、receipt schema 和 artifact locator；不维护 parallel generic scheduler、queue、attempt ledger、state-machine runner、workspace lifecycle、artifact lifecycle、memory locator 或 App/workbench runtime
- `One Person Lab App` 对这些 Agent 来说是可选前端；同一个 Agent 可以通过 direct Codex app skill、自己的 CLI、或 OPL Framework hosted/projection path 运行
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
- shell projection surfaces

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

### 2.5 OPL Stage-Led Family Runtime Provider / Hosted Integration

负责：

- family runtime provider 的 provision / version pin / profile wiring
- provider readiness 的触发、检查与状态报告；Temporal provider 是 production online runtime 的必需 substrate，Hermes-Agent 不作为 provider / Gateway readiness surface
- `opl family-runtime` typed queue、stage attempt ledger、idempotency、lease、retry、dead-letter、approval、local inbox 与 event export
- `opl family-runtime attempt create|list|inspect` 的 provider receipt 与 task-bound lifecycle projection；该 ledger 只记录 control metadata、checkpoint/closeout refs、human gate refs 与 blocked reason
- `Conflict / Blocker Envelope` 的统一投影：重复 task、identity incomplete、evidence/quality blocker、human gate、retry/dead-letter 和 receipt conflict 都进入 `opl_conflict_or_blocker.v1`，并在 `operator_conflicts[]` 中给 App/operator 消费
- provider wakeup bridge；生产路径使用 provider-backed signal / tick / hydrate 语义，旧 Gateway / cron bridge 不再属于 active interface
- domain task registration contract 的 hydration；当前 MAS 通过 `pending_family_tasks[]` 把非终局、非 hard human gate 的 autonomy blocker 交给 OPL queue
- family runtime supervision contract 的只读发现、导出、一致性检查与产品投影；其中 adapter_id、cadence、last_success / last_tick、lease_freshness、SLO state、repair command、safe reconcile hint 与 source refs 均来自 domain-owned surface
- runtime status、session、progress、artifact、attention queue 的 OPL 产品级投影
- `opl status runtime` 顶层报告 provider-backed family runtime、provider set 与 OPL-managed session ledger；旧 Hermes diagnostics、recent sessions 镜像与 process usage 不再作为 active runtime status 字段
- `opl runtime manager`、doctor、repair、resume 等诊断和恢复入口
- `opl agent lab` 目标控制面：统一组织 framework-level eval run、improvement candidate、acceptance evidence、owner route 和 follow-up projection；它只引用 domain-owned proof/eval/receipt/artifact locator，不产生 domain ready、quality、publication、fundability、visual 或 export verdict
- 可选 Rust `OPL native helper` 的 registry，例如 system probe、native doctor、runtime watch、artifact indexer、state indexer
- Rust helper 的 package lifecycle：`native:build`、`native:doctor`、`native:repair`、`native:test`，以及随 npm package 分发的 Cargo workspace 与 helper 脚本
- Rust helper 的 prebuild/cache lifecycle：优先消费匹配平台与 crate version 的 prebuild manifest，把 binaries 安装进 `OPL_STATE_DIR` cache；缺失或无效时回到本地 Cargo build
- 高频文件/状态索引的 contract-first catalog；workspace 扫描、session ledger 索引、artifact manifest、large JSON 校验与目录 snapshot 优先由 Rust helper 承担
- 当 Rust helper 可发现时，OPL hosted integration 通过 JSON stdio 调用 native doctor、state indexer、artifact indexer 与 runtime watch，并把一次聚合 projection 持久化到 OPL 本地 state；该 projection 带 TTL、diff history、failure log、last-success snapshot 与 freshness 判断，只做索引与诊断加速，不替代 domain 仓的 durable truth
- native family smoke 明确分成本地真实 workspace 模式与 CI fixture 模式；两者都只覆盖 MAS/MAG，不进入 RCA 当前暂缓的 TS/Python 重分层线

不负责：

- domain truth / quality verdict / artifact authority
- domain memory body 或 memory accept/reject decision
- domain truth
- domain-owned eval/proof 结论或 owner receipt authority
- concrete executor
- domain stage pack 内部专家判断
- provider system-service lifecycle implementation beyond invoking supported install/repair/status commands
- 私有 fork / vendor 一份 `Hermes-Agent` 或把 Temporal/provider runtime history 写成 domain truth owner

这层让未来 provider 切换时，已有 task registration、status projection、native helper、state index 与 domain owner 边界可以直接复用。当前优先级是 Temporal-backed provider pilot；只有 Temporal/provider abstraction 无法表达 OPL 必需的 task、wakeup、approval、audit 或产品隔离合同时，才进入自有完整长期常驻 sidecar 评估。

### 3. Engines

- `Codex CLI`
  - 当前第一公民交互与执行宿主
- `Family runtime provider`
  - production online 形态是 Temporal-backed provider，承接 durable workflow、activity retry/timeout、human-gate signal、status query 与 execution history；由 `OPL Runtime Manager` 做产品级管理和投影
- `Hermes-Agent`
  - 可选 Agent executor adapter 与显式 proof lane；具体执行语义只在显式切换 executor 或 domain route 选择时进入。当前只保证可接入、可回执、可审计，不保证行为效果与 `Codex CLI` 等价

### 4. Domain Capability Surface And Entry

各个独立 `domain agent` 仓继续持有自己的智能体入口。

它们负责：

- 稳定 capability surface（CLI / 本地程序 / 脚本 / contract）
- 领域逻辑
- 领域规则
- domain transition spec、owner receipt、typed blocker 和 projection builder
- 领域交付物

在当前定位下：

- `agent entry` 是给 `Codex`、`OPL` 与其他通用 agent 调用的稳定入口
- `direct entry / product entry` 是各个 domain agent 自己的轻量独立前门
- `domain harness / controller` 继续保留为仓内边界层与执行层语言，不再作为仓库对外第一身份
- `OPL` 当前通过 repo-owned `domain agent entry spec` 消费各 domain agent 的基础入口真相，而不再只依赖顶层硬编码蓝图
- `MAS` 的当前接入单元是单一 domain app skill 加 repo-owned projection surfaces；`OPL` 消费这些 surface 做统一发现、显示和路由，不替代 MAS 的 controller/publication authority、domain transition semantics 或 owner receipt authority
- `mas_opl_runtime_workbench_projection` 是 MAS 输出给 OPL App 的 read-only study workbench 投影；OPL runtime snapshot 可以把它映射为 study drilldown、links、terminal read-only status 和 action transport metadata，但 action receipt、terminal attach owner、study truth、publication verdict、quality verdict 与 artifact authority 继续由 MAS 持有
- `MDS` 不再作为 MAS 默认运行依赖参与 OPL 安装；MAS 只可把它显式暴露为 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion，不作为这一层的 OPL 顶层 domain agent

#### Unified Domain-Agent Descriptor

`Unified Domain-Agent Descriptor` 是 OPL 对已收录 domain agent 的统一只读发现入口。它不新建一套 domain contract，也不把自然语言经验正文或 stage 内判断移入 OPL；它把现有 domain-owned manifest surface 聚合成一个可给 CLI、App、维护者和后续 admission gate 使用的 read model。

当前机器入口是：

- `opl agents descriptors --json`：列出 MAS/MAG/RCA 的统一 descriptor index。
- `opl agents descriptor --domain mas --json`：检查单个 domain agent 的 entry、standard skeleton、action catalog、stage control plane、domain memory descriptor、skill catalog、runtime/session/progress/artifact refs 与 authority boundary。

它聚合的字段包括：

- `domain_agent_entry_spec`
- `standard_domain_agent_skeleton`
- `family_action_catalog`
- `family_stage_control_plane`
- `domain_memory_descriptor`
- `skill_catalog`
- `runtime_inventory` / `session_continuity` / `progress_projection` / `artifact_inventory`
- `descriptor_refs`、`readiness`、`parity`、`non_authority_flags`

边界如下：

- OPL 持有 descriptor discovery、projection、transport 和 runtime lifecycle metadata。
- Domain agent 持有 domain truth、memory body、quality verdict、publication / fundability / visual judgment、artifact authority 与写回接受/拒绝。
- 给 Agent 理解的长正文继续按 Markdown-first 管理：例如 MAS publication-route memory 正文在 MAS policy / memory Markdown 里；OPL descriptor 只引用 `memory_pack_ref`、freshness、receipt locator 和 forbidden-authority flags。

这个设计对应成熟系统的常见分层：工具、插件、CRD 或 MCP surface 用 machine-readable descriptor 做发现、schema、权限和状态；Skill / domain knowledge / operating guidance 用 Markdown 或自然语言材料给 Agent 读取。OPL 的 descriptor 因此是总入口和索引，不是 recipe engine。

#### Family Action Catalog

`Family Action Catalog` 是这一层新增的 machine-readable callable-action surface。它服务的目标是让 `MAS`、`MAG`、`RCA` 在各自仓内声明一次 action metadata，再派生 CLI、MCP descriptor、Skill command contract、product-entry manifest、OpenAI tool 与 AI SDK tool descriptor。

边界如下：

- `family-action-graph` 继续描述流程图、节点、边、checkpoint policy 与 human gate。
- `family-action-catalog` 描述可调用 action：`action_id`、owner、effect、input/output schema ref、source command、supported surfaces、human gates、workspace locator 与 authority boundary。
- `OPL` 只负责 shared schema、TS/Python helper、manifest normalizer、parity helper，以及 `opl actions list|inspect|export` 这组只读发现命令。
- domain 仓继续持有 handler、runtime、controller truth、review truth、quality verdict 与 publication/deliverable authority。
- 外部 `Ageniti` 的可取之处只被吸收到 contract 思路：单一 app action 定义派生多种调用面；OPL family 不引入 `@ageniti/core` runtime dependency。

#### Family Stage Control Plane

`Family Stage Control Plane` 是 `MAS` stage 化经验上升后的 family 级 shared descriptor / discovery surface。它把程序责任限制在阶段目标、skill / prompt / evaluation refs、输入输出、handoff、receipt、projection 与 authority boundary 上，把阶段内部的专家拆解、创作、审核、修订和诊断继续交给被选中的 Agent executor 与 domain-owned AI workflow。阶段的粒度应接近人类专家真实推进复杂工作的方式，而不是把开放式知识工作压成固定脚本节点。

在顶层定位上，这就是 OPL 对标 DeerFlow、LangGraph、Temporal、Dify、AutoGen、CrewAI 等 agent / workflow framework 时的核心差异：这些框架通常以 LLM 调用、agent 节点、tool call 或 workflow activity 作为原子能力；OPL family framework 以 domain stage 作为语义调度单元，以 Agent executor 作为最小执行单位。`Codex CLI` 是当前第一公民 executor，其他 executor adapter 可以接入但需显式选择并接受回执/审计约束。OPL 因此提供 durable state、queue、handoff、approval、retry、projection 和 observability，并以高价值知识工作的全自动交付为目标，但不替 domain agent 生成领域判断。

对 `MAS` 来说，这一层是对既有 route contract 和 stage-led policy 的 inventory / descriptor 映射，不是替换现有 stage、改变 stage 数量或重写 controller 流程。`scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等实际 route id 继续由 MAS 持有。

边界如下：

- `family-action-graph` 继续描述 stage / action 拓扑、入口、出口、checkpoint 与 human gate。
- `family-action-catalog` 继续描述可调用 action metadata 和多 surface descriptor。
- `family-stage-control-plane` 只声明 stage descriptor、skill / prompt / evaluation refs、handoff refs 与 authority boundary，不新建完整流程引擎。
- `family-stage-integrity-metadata` 只声明 stage-level integrity、citation-support、evidence-handoff、data-access 与 human-checkpoint metadata；这是从 academic research workflow 中吸收的通用模式，不是 MAS publication gate、MAG fundability gate、RCA visual-quality gate，也不接管任何 domain 的 direct skill path。
- `opl stages list|inspect` 只做 discovery、inspection 与 parity，不执行 stage。
- `OPL` 只做 shared vocabulary、manifest discovery、parity、projection 与 typed queue dispatch，不执行 stage 内部专家动作。
- `MAS`、`RCA`、`MAG` 继续持有各自的写作、视觉设计、基金策略、审稿、publication / deliverable / package gate 与最终质量判断。
- `MAS` 命名统一只能在 inventory 证明逻辑层级不变、原 route contract 可追溯、truth surface 不漂移后进行。

当前参考计划是 [OPL Family stage control plane adoption plan](./references/convergence-governance/family-stage-control-plane-adoption-plan.md)。

### 5. Shell Projection Layer

外部界面仓与 ACP-compatible 壳属于这一层。当前 GUI 适配由 `opl-aion-shell` 提供，并由 `one-person-lab-app` 作为 external checkout 消费；它通过 ACP-compatible runtime surface 消费 OPL session/runtime truth，不拥有 runtime。
它们读取同一套 session runtime truth，把 `agents / workspaces / sessions / progress / artifacts` 映射成：

- 本地 `opl` shell / TUI
- `Codex` 中的显式调用面
- ACP-compatible 外部壳
- `opl-aion-shell` AionUI 定制 GUI，经 `one-person-lab-app` 打包发布
- 未来 hosted / online 壳

## OPL 与 Domain Agents 的关系

- `OPL` 持有通用开发与运行框架：stage attempt lifecycle、provider-backed runtime、queue/wakeup、state-machine runner、human gate、workspace/artifact/memory locator、operator projection 和 App/workbench shell
- `OPL` 不替代领域智能体自己的逻辑、domain transition semantics、quality verdict、artifact authority、memory body 或 owner receipt authority
- `OPL` 负责 Codex-default session/runtime、activation layer、shared modules/contracts/indexes、统一入口与 projection surface
- `OPL` 负责 stage-led family framework 支撑：stage descriptor、handoff、queue、wakeup、retry、approval、trace、projection 和 parity；domain agent 负责 stage pack、prompt/skill、quality gate、truth reducer 和交付 authority
- `MAS`、`MAG`、`RCA` 作为独立 `domain agent`，可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用
- 两条入口的工作逻辑保持一致
- 对 `MAS` 来说，OPL projection 只携带 evidence、provenance、状态和路由信号；ready、submission、publication、quality 等最终判断仍回到 MAS-owned durable surfaces

## 当前实现边界与缺口

当前 OPL 已经实现的是 family framework 的控制面骨架、Temporal production proof 入口与 task-bound bridge 闭环：

- shared contract：`family-action-catalog`、`family-action-graph`、`family-stage-control-plane`、`family-runtime-supervision`、`family-persistence-policy`、`family-lifecycle-ledger`、`family-owner-route`、`family-product-entry-manifest-v2`。
- shared helper：TypeScript helper 与 `python/opl-harness-shared` mirror，可供 MAS/MAG/RCA 生成 action/stage/runtime/product-entry projection。
- local orchestration：`opl family-runtime` typed queue、pending task intake、guarded dispatch、local inbox/event、retry/dead-letter 信号和 stage attempt ledger。
- discovery：`opl actions` / `opl stages` / `opl agents` 只读发现与 parity；当前 OPL 已能校验 standard skeleton descriptor 并要求 artifact locator surface，MAS/MAG/RCA 均为 descriptor-level aligned，stage 与 domain-memory descriptor 也均 resolved。
- unified descriptor：`opl agents descriptors` / `opl agents descriptor --domain <domain>` 已把 entry、skeleton、stage、action、memory、skill、runtime/session/progress/artifact refs 聚合成统一 read model；它只携带 refs/status/parity/authority boundary，不承载 domain memory 正文或 domain verdict。
- generic substrate projection：`opl substrate projections` / `opl substrate projection --domain <domain>` 已把 domain manifest 中的 `workspace_locator`、`source_provenance`、`artifact_inventory`、`domain_memory_descriptor` refs 以及 MAS/MAG/RCA `sidecar export.opl_substrate_adapter` 的 opaque refs 聚合成 OPL-owned workspace / source / artifact / memory substrate projection。`opl substrate workbench` 在 projection 之上提供 App/operator drilldown 分组，按 domain、projection status、sidecar status 和 ref family 聚合 refs，并提供 inspect command。该 surface 只做 locator、index、lifecycle、operator projection 与 ref transport；workspace truth、source truth body、artifact body / authority、memory body / writeback accept-reject、domain truth 与 quality verdict 继续归 domain agent。
- provider execution：Temporal `StageAttemptWorkflow`、Codex / domain sidecar activity、human gate / user instruction / resume signal、stage attempt query、CLI `attempt start|query|signal`、worker lifecycle status 和 fail-closed readiness 已落地；2026-05-14 本机 managed Temporal service / worker proof 已返回 `production_residency_proven`，provider view 显示 `full_online_ready=true` / `durable_online_ready=true`。
- typed receipt / workbench：Codex stage activity 已有 dry-run / live-dry-run / `codex_cli` runner repo/test harness、typed closeout required-for-completion gate、consumed refs / memory refs / writeback receipt refs / rejected writes / route impact / next owner 投影；`opl runtime snapshot` 已输出只读 `stage_attempt_workbench`。

当前尚未闭合的是完整生产级 long domain owner chain：

- Temporal-backed provider 已证明本机 managed production residency 当前可达；仍未闭合的是周期性长时 SLO、真实 production service 运维证据、长时间 retry/dead-letter 观测与真实 domain soak。
- `Codex CLI` stage activity runner 已能在 repo/test harness 中启动 `codex_cli` runner、记录 stdout event summary、timeout、process output summary 和 checkpoint heartbeat；真实长时 domain activity soak、token / cost / progress 观测校准、domain sidecar live dispatch 与 owner receipt 连续 evidence 仍需继续落地。
- OPL App / GUI 已能消费 stage-attempt workbench、generic substrate projection 和 provider-level signal 传输，但仍需要真实 worker/domain 执行证明、domain/stage/blocker/memory refs 分组操作面，以及避免把 provider completion 或 substrate refs 写成 domain ready verdict 的持续 UI 验收。
- MAS real paper line 已有 read-only closeout projection，并通过 provider-hosted task-bound bridge 产出 typed blocker / no-forbidden-write proof；MAG/RCA 已有 live task-bound sidecar receipt / no-regression evidence ingestion。仍需证明真实 MAS owner guarded-apply chain 推动论文前进，以及 grant / visual long soak 到最终交付。

所以，OPL 现在可以被描述为 `stage-led family framework control plane, Codex CLI first-class executor, explicit optional executor adapters, Temporal production residency proof, provider-hosted task-bound bridge, Codex runner repo/test harness, typed closeout gate, and domain skeleton discovery / validation landed`。它的目标是完整智能体运行框架和高价值知识工作全自动交付，但当前不能描述为 `long-running domain-owner production chain fully closed`；当前 standard skeleton 家族对齐已在 MAS/MAG/RCA 三仓达到 descriptor-level aligned，仍不能写成三仓 physical skeleton layout 已完成。

## 默认执行策略

- 第一公民执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Family runtime provider` 当前是 Full OPL online family runtime 的 readiness 对象；Temporal-backed provider 是 production online runtime 的必需 substrate。`hermes_agent` 是显式非默认 Agent executor adapter/backend，不替代 Codex CLI 默认执行语义，也不承诺行为、质量、工具语义或 resume 等价；旧 Hermes provider / Gateway proof 语料只按历史、诊断、fixture 或负向 guard 阅读

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按 `OPL Framework -> One Person Lab App -> Foundry Agents` 三层产品认知组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdoor` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
