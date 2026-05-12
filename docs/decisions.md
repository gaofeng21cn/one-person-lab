# OPL 关键决策

## 2026-05-12

### 决策：产品认知固定为 OPL Framework、One Person Lab App 与 Foundry Agents 三层

原因：OPL 已经从入口聚合和工作台投影演进为完整的 stage-led 智能体框架。如果继续把框架开发、运行托管、普通用户 App 和 MAS/MAG/RCA 这类领域产品都用同一个不分层的 `OPL` 叙事表达，开发者用户和纯使用者都会难以判断自己应该进入哪一层。更清晰的产品结构是：OPL Framework 负责开发与运行框架；One Person Lab App 负责普通用户使用体验；Foundry Agents 负责医学研究、基金、汇报等领域交付。

影响：

- `OPL Framework` 成为开发者与技术操作者面向的主语：CLI、stage control、activation、typed family queue、provider-backed runtime、contracts、模块发现、skill sync、恢复、审计和 shared projection 都属于这一层。
- `One Person Lab App` 成为普通用户面向的主语：它消费 OPL Framework 和已安装 Foundry Agents，把通用工作、医学研究、基金写作、汇报/PPT 等工作呈现成桌面工作台；它不持有 domain truth，不复制 runtime/provider 实现。
- `Foundry Agents` 成为 MAS/MAG/RCA 和后续 Patent/Award/Thesis/Review 的产品线主语：这些 agent 基于 OPL Framework 开发，可被 App 托管运行，也保留 direct Codex/app-skill 入口；领域判断、质量 verdict、artifact/package/submission/publication authority 继续归对应 domain 仓。
- 开发和运行保持集成在 OPL Framework 内；当前不拆 repo，也不把每个 domain agent 改成内嵌一份 OPL runtime。
- agent 的推荐发布形态是 OPL-compatible package / repo：声明 framework/version/contract 要求、stage descriptor、skill、quality gate、artifact locator、projection 和 authority refs，由 OPL Framework 安装、发现、托管、唤醒和投影。
- Full 首次安装包可以把 App、OPL Framework、MAS/MAG/RCA、provider payload、`officecli` 与推荐 skills 打在一起；这只是分发形态，不改变 single framework runtime truth。
- 后续 README、project/status/architecture、contracts 说明、App 文案和 onboarding 文档应优先使用这组三层主语，避免把 App 写成 Framework 本体，或把 Foundry Agents 写成 OPL 内部模块。

## 2026-05-10

### 决策：Temporal 成为 OPL production online family runtime 的必需 substrate，Hermes-first 口径退出目标在线底座

原因：OPL 当前目标已经从“找一个长期在线会话宿主”收敛为“以 domain stage 为语义单元、以 Agent executor 为最小执行单位的 durable family agent framework”。这类框架需要的是可恢复 stage attempt、activity retry/timeout、human gate signal、status query、workflow history、idempotent dispatch、dead-letter 和 operator projection。Temporal 的 Workflow / Activity / Signal / Query / History 模型正好对应 OPL production online runtime 的可靠性底座；它应像 Codex CLI 一样被安装、检测、修复和持续维护。Hermes 不再承担目标长期 session/wakeup substrate 的默认口径，但仍可作为显式 provider、Agent executor adapter、proof lane 或可选安装模块接入。

影响：

- `OPL Runtime Manager` 的目标表述从 Hermes-first 改为 Temporal-backed production family runtime；provider 枚举按 `local_sqlite | hermes_legacy | temporal` 方向保留，其中 `temporal` 是 production required provider，`local_sqlite` 是 dev/CI/offline diagnostic baseline，`hermes_legacy` 是 legacy/proof/diagnostic adapter。
- Temporal provider 的语义映射固定为：Workflow = `stage_attempt`，Activity = selected Agent executor stage execution / domain sidecar dispatch，Signal = human gate / user modification intake / resume，Query = App/CLI progress projection，History = durable replay/audit。
- `Codex CLI` 是当前第一公民 concrete executor；Temporal 只负责 durable orchestration substrate，不生成 domain idea，不判断 publication/fundability/visual quality。
- `Hermes-Agent` 迁移后的角色是可选 Agent executor adapter、显式 proof lane 或可选安装模块；Full readiness 不再要求 Hermes 作为目标 session/wakeup substrate，但要求 Temporal service / worker / readiness proof 成立。接入只承诺连接、生命周期、回执与审计面成立，不承诺行为或效果与 `Codex CLI` 等价。
- `MAS`、`MAG`、`RCA` 继续持有 domain truth、quality gate、artifact/package/submission/publication/deliverable authority；OPL 只持有 provider abstraction、stage attempt ledger、queue、human gate transport、retry/dead-letter、observability 和 projection。
- 2026-05-08 的 Hermes-first 决策保留为历史与迁移背景，但被本决策 supersede；后续新增投入默认服务 Temporal-backed production runtime lane。

### 决策：OPL 定位为完整 stage-led family agent runtime framework，Codex CLI 是当前第一公民 executor

原因：`MAS`、`MAG`、`RCA` 的共同需求不是让 OPL 变成一个领域大脑，而是需要长期自治、状态恢复、唤醒、队列、human gate、trace、projection 和跨域可见性这类 agent framework 能力。与以 LLM 调用或 agent node 为原子单位的通用框架不同，OPL family 的执行原子是 Agent executor，当前第一公民 executor 是 `Codex CLI`，更合理的语义单元是 domain stage：一个 stage 冻结目标、输入、skill/prompt、评价方法、handoff、receipt 和 authority boundary，stage 内部让被选中的 executor 与 domain skill 自主完成专家工作。

这次定位同时明确：OPL 不是只做入口聚合、工作台投影或共享合同目录，而是完整的智能体运行框架。它可以使用 Temporal、Hermes legacy、local provider 或未来其他外部 substrate，但阶段生命周期、队列、attempt ledger、human gate、恢复、投影、artifact/file lifecycle 和 operator visibility 的 framework 边界归 OPL；provider 只承担可替换的运行 substrate。OPL 的产品目标是让医学研究、基金写作、视觉交付和后续高价值知识工作尽可能自动推进到可审计交付。

影响：

- `OPL` 的当前身份统一写成完整 stage-led family agent runtime framework，而不是 MAS/MAG/RCA 的领域模块集合、入口聚合层或单纯 runtime support layer。
- `OPL` 持有 activation、typed family queue、durable runtime/session support、wakeup/retry/dead-letter、approval transport、stage descriptor、handoff envelope、receipt、projection、trace 和 parity helper。
- `MAS`、`MAG`、`RCA` 持有各自 stage semantics、prompt/skill、quality gate、truth reducer、artifact/package authority、publication / submission / deliverable verdict。
- 直接 Codex App skill 调用保持一等入口；OPL 可以托管和唤醒 domain agent，但不要求所有调用都先经过 OPL。
- 大型任务默认按接近人类专家实施的 stage 推进；Agent executor 是 stage 内最小执行单位，`Codex CLI` 是当前第一公民 executor。
- 后续流程优化优先改 domain stage pack、prompt、skill、quality gate 和 framework descriptor；不得把领域判断重新写回 OPL 机械脚本。

### 决策：将 MAS stage 控制面经验提升为 OPL family 设计方向

原因：`MAS` 的论文生产、`RCA` 的视觉交付和 `MAG` 的基金写作都属于开放专家工作流。把这些流程写成大段硬编码脚本会限制 Agent executor 的自主拆解、创作、审核和修订能力，也会让程序承担不该承担的领域质量判断。更稳妥的 family 原则是用 `stage` 描述专家工作阶段：每个 stage 冻结目标、输入输出、skill、prompt、评价方法、handoff、receipt 与 authority boundary；stage 内部的执行由被选中的 Agent executor 和 domain-owned AI workflow 自主推进。

影响：

- `OPL` 可以上收 family-level stage descriptor vocabulary、skill / prompt / evaluation refs、stage lifecycle receipts、handoff envelope、product-entry projection 与 parity helper。
- `family-action-graph` 继续承载 stage / action topology，`family-action-catalog` 继续承载可调用 action metadata；新增的 machine-readable surface 只允许是窄的 `family-stage-control-plane` companion，不新建重流程 runtime。
- `MAS` 作为深 adapter 候选，必须先盘点现有 `scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等 route contract，以及 controller / runtime / quality / delivery / read-model surface；OPL 文档里的 study intake、evidence preparation、analysis / argument、manuscript authoring 与 publication gate 只作为 family 抽象维度，不替换 MAS 实际 stage 名称、数量或 route id。
- `RCA` 作为轻 adapter 优先候选，把 source intake、communication strategy、visual direction、artifact creation、review / revision 与 package / handoff 映射成 stage，但视觉质量 verdict、deliverable authority 与最终审美判断仍归 RCA。
- `MAG` 把 call intake、fundability strategy、specific aims、proposal authoring、review / rebuttal 与 package gate 映射成 grant stage pack，但 fundability verdict、评审结论与提交可行性仍归 MAG。
- `OPL` 的角色保持 discovery、index、projection、parity 与 typed queue dispatch；不得把 stage 控制面写成替代 Agent executor 或 domain quality gate 的固定脚本引擎。
- 当前落地面是参考计划 [OPL Family stage control plane adoption plan](./references/convergence-governance/family-stage-control-plane-adoption-plan.zh-CN.md)、最小 `family-stage-control-plane` schema、manifest normalizer / parity helper 与只读 `opl stages list|inspect`；它不是 workflow runtime。MAS 第一阶段是 inventory 和映射，不是 stage 重构。

## 2026-05-08

### 历史决策：Hermes 恢复为 OPL family 默认在线 substrate

状态：已被 2026-05-10 的 Temporal-backed provider 决策 supersede。保留本段只用于解释 Hermes-first 回滚背景和迁移期实现口径，不作为当前默认 topology、安装纪律或 readiness 目标。

原因：最新核实显示，过去的问题不在于 Hermes 没有价值，而在于 OPL/MAS 只把它用成了 `every 5m` cron carrier。真正需要的是 24h 在线产品能力：常驻 gateway、cron/webhook wakeup、session store、delivery/notification、approval transport、memory/profile isolation。这个能力应由上游 `Hermes-Agent` 承担，`OPL` 在其上持有 typed family queue、跨仓 dispatch/control plane、Runtime Manager 和 Full App 包装；`MAS`、`MAG`、`RCA` 继续持有 domain truth、质量判断和 artifact/package/publication gate。

影响：

- 历史上 `opl install` 曾计划默认安装/复用 `Codex CLI`、Hermes online runtime、默认 domain modules、推荐 skills、`officecli` CLI 与 GUI；当前目标口径已改为 Temporal-backed family runtime，Temporal 是生产必需 substrate，Hermes 只保留为可选 Agent executor adapter、显式 proof lane 或诊断/历史语境。
- 历史上 `Hermes-Agent` 曾被写成 Full OPL family readiness 的 required online substrate；当前 Full OPL readiness 应按已配置 family runtime provider ready 判断，不能再把 Hermes 写成目标必需项。
- `Codex CLI` 仍是默认且第一公民的具体执行器；Hermes online substrate 不自动替换 domain-selected executor，也不成为 MAS/MAG/RCA truth owner。
- 新增 `opl family-runtime` typed queue / bridge：队列位于 `${OPL_STATE_DIR}/family-runtime/queue.sqlite`，Hermes cron/webhook 负责唤醒，OPL tick 负责跨仓 dispatch 和本地 inbox/event 记录。
- `opl family-runtime intake` 与 `opl family-runtime tick --hydrate` 会先读取 domain sidecar export 的 `pending_family_tasks[]`，按 dedupe key 入队，再在同一 tick 中派发已入队任务。Hermes cron 注册脚本必须使用 `opl family-runtime tick --source hermes-cron --hydrate`，否则只会消费已有队列而不会把 MAS/MAG/RCA read-model blocker 转成 executable task。
- 历史计划中 Full 首次安装包曾要求携带 Hermes payload、profile seed、CLI shim、LaunchAgent install/repair scripts、版本 manifest 与 checksum；当前 Full 包应携带已配置 family runtime provider 所需 payload，Temporal provider 落地后由 provider manifest/checksum 表达 readiness。
- 历史计划中 `opl system initialize` 和 App 首启曾显示 Core ready、Domain modules ready、Hermes online runtime ready 三层状态；当前应显示 Core、Domain modules、family runtime provider readiness，不能把 Hermes 写成目标默认层。
- 历史上“Hybrid optional Hermes provider adapter”的文档口径保留为 archive/decision history，不再作为当前安装或 readiness 行为。

### 历史决策：Hermes 从默认安装依赖降为显式可选 hosted/runtime provider adapter

状态：先被 2026-05-08 Hermes-first online substrate 决策取代，又被 2026-05-10 Temporal-backed provider 决策 supersede。保留本段用于解释 2026-05-08 早期误判和回滚背景，不作为当前实现口径。

原因：当时 `OPL` 的默认运行时、会话语义和 domain readiness 被临时收敛到 `Codex-default + MAS/MAG/RCA domain entries`。继续把 Hermes 写进 `opl install` 默认路径、首启 baseline 或 mandatory runtime substrate，会把尚未完整接入的 hosted/online-management 能力误读成 OPL 默认依赖。

历史影响：

- `opl install` 一度默认只安装/复用 `Codex CLI`、默认 domain modules、推荐 skills、`officecli` CLI 与 GUI。
- `Hermes-Agent` 一度只作为显式 optional hosted/runtime/provider adapter 保留。
- `opl system initialize`、App 首启与 README 一度把 Hermes 缺失视为非阻塞 online-management 状态。
- Full 首次安装包一度不携带 Hermes provider-adapter payload。

### 决策：引入 Family Action Catalog 作为 action metadata 单一声明面

原因：`MAS`、`MAG`、`RCA` 已经分别暴露 CLI、MCP、Skill、product-entry 等多种调用面。如果每个 surface 单独维护 action metadata，命令、schema、effect、human gate 与 authority boundary 容易漂移。`Ageniti` 值得学习的是“单一 app action 定义派生多种 tool surface”的思路；但它当前不应成为 OPL family runtime dependency。

影响：

- `contracts/family-orchestration/` 新增 `family-action-catalog.schema.json`，并允许 `family-product-entry-manifest-v2` 携带 `family_action_catalog`。
- `family-action-graph` 继续描述流程拓扑与 gate；`family-action-catalog` 专门描述可调用 action metadata 与 surface projection。
- `OPL` 增加 TS helper、Python mirror、manifest normalizer、parity helper，以及只读 `opl actions list|inspect|export` discovery/export 命令。
- `OPL` 不执行 domain actions，不生成 handler，不持有 domain runtime truth；actual execution 仍走 MAS/MAG/RCA 各自已有 CLI、MCP、Skill 或 product-entry handler。
- `MAS` 作为完整参考 adapter，`RCA` 作为 TypeScript 参考 adapter，`MAG` 作为轻 adapter；`MAG` 第一轮只声明 MCP-compatible descriptor，不宣传 public MCP server 已落地。
- 本决策不引入 `@ageniti/core` 或其他 Ageniti runtime package。

### 决策：引入 Family Runtime Supervision 作为只读 wakeup / supervision projection

原因：`MAS`、`MAG`、`RCA` 都需要把长期任务的 supervision freshness、repair hint 与 domain-owned source refs 投影给 OPL family 工作台，但这些信息不能被误读成 OPL 拥有 scheduler、daemon、session、memory、quality 或 artifact authority。

影响：

- `contracts/family-orchestration/` 新增 `family-runtime-supervision.schema.json`，并允许 `family-product-entry-manifest-v2` 携带 `family_runtime_supervision` discovery surface。
- 该 surface 覆盖 `adapter_id`、cadence、`last_success` / `last_tick`、lease freshness、SLO state、repair command、safe reconcile hint、domain-owned source refs 与 read-only authority boundary。
- `runtime-task-companions` 增加 TS builder，供 domain repos 投影同一 shared supervision surface。
- `OPL` 只做 discovery、export、parity 与 read-only projection；repair command 与 safe reconcile hint 只把操作者路由回 domain-owned repair / supervision surface。
- 本决策不引入 OPL daemon，不让 OPL 成为 domain scheduler、session store、memory owner、quality verdict owner 或 artifact authority。

### 决策：MAS monolith / MDS 默认依赖退役上升为 family companion-retirement 原则

原因：MAS 已完成 no-history physical absorb 与 monolith closeout，外部 `med-deepscientist` checkout 不再是 MAS 默认 study/status/progress/cockpit operation 的运行必需依赖。这一经验值得上升到 OPL family 层，但上收对象是通用 companion lifecycle 原则，不是 MAS 的医学论文 truth 或研究执行细节。

影响：

- admitted domain 可以吸收外部 companion 的可保留能力，但吸收后默认只暴露 domain-owned capability surface。
- 被降级的外部 companion 只能作为显式 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle 引用出现，不得回到 OPL 默认安装依赖、顶层 domain agent 或独立 OPL-managed module。
- 未来类似 no-history absorb 必须记录 source ref/hash、snapshot checksum、license refs、capability classification、domain owner、authority boundary、parity proof 和 contributor audit。
- `OPL` 只消费 domain-owned projections 与可发现 refs；不接管 domain runtime、scheduler、memory store、quality verdict、publication gate 或 artifact authority。

### 决策：MAS 验证过的 persistence / lifecycle / owner-route 原则上升为 family control-plane contract

原因：MAS 近期把 runtime 小文件压力收敛到 SQLite sidecar index，并把持久化层、记忆层、论文真相与 lifecycle cleanup 分开管理。这一类经验值得在 `OPL` family 层复用，但可上收的只有共享控制面：持久化角色、lifecycle receipt、owner-route 与 discovery refs。医学论文质量、publication readiness、AI reviewer、paper package 与 current package authority 仍属于 MAS domain truth。

影响：

- `contracts/family-orchestration/` 新增 `family-persistence-policy`、`family-lifecycle-ledger` 与 `family-owner-route` 三个 machine-readable schema。
- `family-product-entry-manifest-v2` 只增加 `persistence_policy`、`lifecycle_ledger`、`owner_route` 三个 optional discovery refs，不强制 domain runtime 改形。
- TS helper 与 Python mirror 提供对称 builder / validation surface，供 admitted domains 暴露 adapter，不复制 domain runtime。
- `MAS` 作为完整参考 adapter，映射 SQLite sidecar、lifecycle ledger 与 owner-route；`MAG` 第一轮只在既有 runtime-control / session-continuity / grant-progress / artifact_inventory 上做轻 adapter；`RCA` 第一轮把 managed-runs、product-entry sessions、review/publication projections 映射到 shared refs，并继续把 SQLite 标记为 deferred。
- `OPL` 继续只是 shared contracts / helpers / indexes owner；它不成为 domain runtime、scheduler、memory store、quality verdict owner 或 artifact authority。

## 2026-05-04

### 决策：MAS v2 以独立 domain agent 和单一 app skill 对接 OPL

原因：`MAS` 的 v2 alignment 需要同时保持两件事：医学科研 domain agent 继续独立演进，OPL 又能以统一定义、shared contract/index 与 projection 消费方式把它纳入同一工作台。把 MAS 写成 OPL runtime kernel 的一部分、恢复 MAS standalone release 通道，或把 OPL projection 写成 MAS ready / publication verdict，都会制造第二真相源。

影响：

- `MAS` 继续作为独立医学科研 `domain agent`；`MAG`、`RCA` 的独立 domain-agent 表述不受影响。
- `MAS` 对 `Codex` / `OPL` 暴露一个 MAS domain app skill；OPL 负责发现、同步和消费该 skill，不新增 OPL-only MAS skill family。
- `OPL` 持有 unified definitions、shared module/contract/index registration、module discovery 与 projection consumption surface；医学科研 runtime、controller truth、quality authority、publication gates 与 deliverable truth 继续由 `MAS` 持有。
- `MDS` 不再作为 OPL 默认安装的 MAS 运行依赖；MAS 只可把它显式声明为 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion。
- 公开文档与技术入口不得恢复 MAS 用户安装型 standalone GitHub Release / standalone product release 叙事；MAS 仍按 OPL Packages/GHCR-backed module 坐标与 git checkout / sibling repo 更新路径表达，MDS 只保留 MAS-declared optional companion 引用。
- OPL 对 MAS progress、publication、quality、runtime control、`mas_opl_runtime_workbench_projection` 等 projection 只做证据、provenance、状态、App drilldown 和路由/transport metadata 展示；不得把 projection 文案写成 OPL 持有的 ready verdict、submission-ready verdict、publication verdict、质量裁决、runtime authority 或 artifact authority。
- 本决策不修改 `contracts/` 与 projection contract；它只同步公开文档和核心 docs 的 MAS v2 wording。

## 2026-05-02

### 历史决策：首启 readiness 拆分为 core/domain 可用与 Hermes online-management 渐进就绪

状态：先被 2026-05-08 的 Hermes-first online substrate 决策取代，又被 2026-05-10 的 Temporal-backed production runtime 决策 supersede。当前 Full OPL readiness 要求 Temporal-backed family runtime provider ready；本段只保留迁移背景。

原因：当时新用户首屏优先目标是尽快进入 `OPL` 的核心工作与已准入 domain 工作。Hermes 仍然是外部 runtime substrate 与 online-management gateway，但 gateway system service 的加载状态不应被写成底层 Hermes runtime 未就绪式首屏 blocker。

影响：

- `opl install` 不再默认安装 Hermes；显式 Hermes provider adapter 可被安装或复用。
- Hermes online-management gateway 是由 Hermes installer/gateway command 管理的系统服务；OPL 负责触发安装/启动、检查 readiness 并报告状态，不接管 gateway service lifecycle 实现。
- `opl system initialize`、App 首启与公开 README 文案必须区分 core/domain readiness 与 online-management readiness。
- 当 Codex CLI 与已准入 domain modules ready 时，首屏可以进入通用工作、医学研究、基金写作或汇报/PPT 工作；Hermes gateway 未 loaded 只展示为 online-management pending / starting / needs attention。
- 只有 Codex CLI 不可用、当前命中版本不兼容、必需 domain 模块无法安装/检测，或其他核心依赖无法自动修复时，才写成首屏 blocker。

## 2026-04-27

### 决策：App 更新按 OPL 日期版本判断，GUI 基线版本只作为内部兼容信息

原因：用户下载和检查更新时看到的是 One Person Lab 版本，而不是 AionUI upstream package 版本。GUI 继续跟随 AionUI 大版本演进，但自动更新、Release tag、安装包文件名和环境管理里的最新版本判断都应使用 OPL 日期版本。

影响：

- `opl-aion-shell` 打包时把 Electron updater 元数据写成 `OPL_RELEASE_VERSION`
- App 关于页继续单独展示 OPL 版本与 GUI 基线版本
- GUI package.json 的 upstream/AionUI 基线版本不再决定 One Person Lab 自动更新顺序

### 决策：Packages 作为机器消费通道，Releases 继续作为用户下载通道

原因：桌面 App、Docker WebUI、native helper 和 domain modules 的更新节奏不同。把所有东西塞进 App release 会拖慢发布和回滚；只用 git repo 又缺少固定版本、校验和与机器可读更新面。

影响：

- `opl packages manifest` 成为 Packages 坐标的机器可读入口和后续分发目标
- 当前 `opl install`、App 首启协调和环境管理仍以 git checkout 更新到远端最新为正式路径；Packages/GHCR 接入模块安装更新前不得写成当前机制
- 中央 release manifest / Packages workflow 可以继续维护为机器分发雏形，但各 domain repo 不需要单独恢复用户安装型 GitHub Release
- WebUI Docker 镜像通过 GHCR 发布，服务 Docker/浏览器-only 场景
- Native helper 预构建 archive 同步发布到 GHCR，后续 `native:repair` 可优先消费
- 标准桌面 App 与自动更新包仍不打入 `MAS/MAG/RCA` runtime payload；macOS arm64 可额外发布 Full 首次安装资产，随包带 `MAS/MAG/RCA`、`officecli` CLI binary 与推荐 companion skill payload，但不得写入 `latest*.yml` 或改变 App 自动更新通道

### 决策：One Person Lab App 只做 CLI-backed GUI，不复制安装与环境管理逻辑

原因：OPL 的可维护边界应是 CLI 提供安装、初始化、诊断、更新、模块管理与 workspace 管理等完整能力；GUI 只负责触发命令、展示状态与提供更低门槛的交互界面。这样命令行一键安装、App 首启、Docker WebUI 与后续自动修复能共享同一套行为，不形成 GUI-only 第二实现。

影响：

- App 首启继续通过 `opl system initialize` 读取状态，必要时通过 `opl install --skip-gui-open` 自动补齐环境
- 设置里的环境管理继续通过 `opl doctor`、`opl install`、`opl modules`、`opl module *`、`opl engine *` 与 `opl workspace *` 完成动作
- GUI fallback 只负责在找不到 `opl` 命令时调用 OPL 主仓安装脚本的 bootstrap-only 模式取得 CLI，然后回到 `opl ...` 命令面
- 新增安装、修复或状态能力时，先落到 OPL CLI 与机器可读输出，再由 GUI 消费

## 2026-04-26

### 决策：首启默认走静默自动配置，减少新手选择障碍

原因：One Person Lab App 和 Docker WebUI 的首要目标是让新手或 OPL-first 用户尽快进入可用界面。workspace root、模块安装、推荐 skills 这类可以合理默认或自动修复的事项不应变成首启向导问题；命令行 `opl install` 已完成的配置也不应在 App 首启时重复打断用户。

影响：

- 未显式配置 workspace root 时，`opl system initialize` 默认使用用户 Home 目录
- 兼容版本的 `Codex CLI` 已可用时，不因缺少可读 Codex config 单独阻塞首启
- `opl install` 默认安装/检查 domain modules，并以保守 managed 模式同步推荐 companion skills 和 `officecli` CLI 工具
- `opl install` 默认安装/复用 family runtime provider；Full readiness 需要 provider ready。`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- App 首启先静默读取 `opl system initialize`；若命令行安装已经完成，则不再运行安装或打开首启向导
- 只有缺少 Codex CLI、当前命中版本过旧或无法解析、模块无法安装等不可自动解决事项，才进入环境管理提示

### 历史决策：`MDS` 默认安装依赖面已被 MAS monolith closeout 取代

原因：2026-04-26 的安装面决策服务于迁移期，当时 MAS 仍需外部 `Med Deep Scientist` 作为隐藏运行依赖。MAS 现已完成 no-history physical absorb、retained capability absorb、default-runtime-retirement 与 docs closeout；外部 `med-deepscientist` checkout 不再是 MAS 默认 operation 的运行必需依赖。

影响：

- `opl install` 默认安装/检查 `MAS`、`MAG`、`RCA`，不再把 `meddeepscientist` 写成 MAS 默认运行依赖。
- `opl modules` 与 App 设置里的环境管理可以显示 MAS 声明的可选 companion diagnostic / oracle / intake 状态，但不得把它写成独立 OPL module。
- 首页和 domain-agent 入口继续只露出 `MAS`、`MAG`、`RCA`。
- 若 MAS 未来继续学习 MDS / DeepScientist 能力，只能按 snapshot provenance、capability classification、owner boundary、parity proof 与 no-history contributor audit 进入 MAS-owned surface 或显式 oracle / intake / diagnostic 引用。

### 决策：冻结 `OPL Runtime Manager` 为 Hermes 上的产品控制面，而不是自有完整 runtime sidecar

状态：Runtime Manager 作为产品控制面继续有效；“Hermes 上”这一目标 substrate 已被 2026-05-10 的 Temporal-backed provider 决策 supersede。后续按 provider-backed Runtime Manager 解释。

原因：当前长跑托管任务应注册到外部 `Hermes-Agent` online runtime substrate，由它负责 session、scheduler、wakeup、interrupt/resume、memory、delivery、approval、cron 与 webhook。OPL 需要的是产品级 provision、version pin、profile wiring、typed family queue、domain task registration hydration、诊断、恢复入口、native helper catalog 与高频状态索引，而不是复制一套 runtime kernel。

影响：

- 新增 `opl runtime manager` 作为 Runtime Manager 的机器可读 projection
- 新增 `contracts/opl-framework/runtime-manager-contract.json` 冻结 owner split、responsibilities、non-goals、native helper target 与 state index target
- `opl runtime manager` 可以发现并调用可选 Rust native helper，把 `opl_runtime_manager_native_state_projection` 持久化到 OPL 本地 state；缺少 helper 时只报告 repair hint，不把 helper 伪装成 runtime kernel
- Rust native helper 现在作为 OPL package lifecycle 的一等面分发：npm package 包含 Cargo workspace 和 doctor/repair 脚本，`native:repair` 负责重建 helper 后输出 lifecycle doctor JSON
- native helper lifecycle 继续收紧为生产门禁：CI 跑 build/typecheck、fast、regression、integration、fresh-install、native、lint 与 structure；native lane 覆盖 doctor、prebuild check、package dry-run、Rust test/build、state cache 与 family smoke
- 测试治理采用单一 lane registry：`fast` 是默认本地信号，`regression` 承接宽回归，`integration` 覆盖 ACP/session runtime、install/configure 与 retired surface fail-closed，所有 active 测试文件必须被 `scripts/test-lanes.mjs assert-coverage` 覆盖
- 本地 `structure` lane 是 blocking Sentrux gate；GitHub Sentrux Advisory workflow 继续作为非阻断 sidecar 信号存在，不替代 Verify workflow 的 structure gate
- prebuild/cache 策略先按 manifest 和 `OPL_STATE_DIR` cache 落地，目标是让 fresh install 优先恢复匹配平台的 helper binary，只有缺失或无效时才走本地 Cargo build
- native state index 的 lifecycle 必须输出 TTL、history、failure、last-success、freshness、结构化 diff 与 history GC preserved/removed reporting，避免 helper 短暂不可用或 history 被裁剪时丢失可审计状态
- `opl runtime snapshot` 可以为桌面托盘和 App Runtime Workbench 投影 `attention_items`、`running_items`、`recent_items` 与 MAS study drilldown/read-only workbench 数据，但只读取 domain-owned durable surfaces；为了托盘状态显示或 App drilldown 不新增本地 daemon，也不把 MAS `mas_opl_runtime_workbench_projection` 升级为 OPL-owned study truth
- family runtime provider 继续是外部 online runtime substrate owner；`OPL Runtime Manager` 只做产品控制面、typed dispatch、诊断恢复和投影。Temporal 是 production required provider，Hermes 只在显式 provider / Agent executor adapter 或诊断语境中出现
- `domain task registration hydration` 是 Runtime Manager 的一等职责：OPL 读取 domain-owned sidecar export 中显式授权的 `pending_family_tasks[]`，写入 OPL typed queue，并保持 retry / dead-letter / notification / approval 语义；OPL 不从 read-only projection 自行推断医学、基金或视觉交付任务。
- provider system service lifecycle 由 provider-specific installer/gateway command 管理；OPL 只触发、检查和报告 readiness
- `MAS`、`MAG`、`RCA` 继续持有 domain truth 与 route-selected executor 语义
- 未来如需迁移到 OPL 自有完整 sidecar，必须先证明 provider abstraction / Temporal 无法表达必要的 task、wakeup、approval、audit 或产品隔离合同

## 2026-04-25

### 决策：8787 Product API service 模块退役

原因：当前 OPL GUI/WebUI 主线由 OPL-branded AionUI shell 提供，不消费仓内 8787 Product API service。该 service 来自旧本地 web adapter 历史阶段，继续保留模块本体会把后台 JSON/adapter 面误导成当前产品能力。

影响：

- `opl install` 不再安装、启动或打开 8787 Product API service
- public `opl service *`、`opl system reinstall-support`、`opl web`、`web bundle` 与 `web package` 退出当前命令面
- 仓内旧本地 web adapter 与 self-hostable web package 实现删除，避免继续形成第二产品入口
- GUI 分发由 `opl-aion-shell` 构建、`one-person-lab` GitHub Release 暴露；维护者用 `npm run gui:release` 发布 artifact

## 2026-04-23

### 决策：gateway-first 合同语料退到 reference / compatibility 层

原因：当前 `OPL` 的一等主线已经明确是 `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`。继续把 `gateway-federation`、`opl-federation-contract`、`opl-routed-action-gateway` 与 `contracts/opl-framework/*` 这批旧语料写成默认公开集成合同，只会制造第二真相。

影响：

- 这批 gateway-first 语料继续 repo-tracked，但角色收口为 reference / compatibility surface
- 当前真相优先回到 `README*`、核心五件套与 `contracts/README.md`
- 已收录 domain 的实际接入单元继续写成 repo-owned capability surface 与单一 app skill

### 决策：`OPL` 默认合同冻结为 `Codex-default session runtime + explicit activation layer`

原因：当前产品目标已经明确为“默认尽量等价 Codex，只在显式切换 runtime 或显式调用 domain agent 时进入 OPL 增量语义”。继续把 `OPL` 叙事写成 wrapper-first、GUI-first 或混合默认 runtime，会直接污染默认交互合同。

影响：

- `opl`、`opl exec`、`opl resume` 继续以 `Codex` 语义为默认前门
- `opl skill sync` 成为 family domain skill pack 的统一同步入口；默认前门继续保持原生 Codex 语义
- GUI 壳与 ACP-compatible 外壳都围绕同一套 Codex-default runtime contract 工作

### 决策：admitted domain 通过 repo-owned capability surface 接入 `OPL`

原因：系列项目需要让 `Codex` / `OPL` 调用 domain agent 时尽量保持同一使用体验。更自然的接入方式不是为每个 domain 发明 ask-wrapper，而是让 domain 仓把 CLI、本地程序/脚本与 repo-tracked contract 暴露成稳定 capability surface，再由 `OPL` activation 层消费。

影响：

- `MAS`、`MAG`、`RCA` 等 admitted domain 继续以 repo-owned CLI / 程序 / 脚本 / contract 作为稳定接入面
- `OPL` 负责 activation / dispatch，不把 domain-specific 行为改写成 OPL-only 语义
- 直接在 `Codex` 中调用某个 domain，与先进入 `OPL` 再显式激活该 domain，工作逻辑保持一致

## 2026-04-21

### 决策：活跃 domain 仓对外统一写成独立 `domain agent`

原因：在 `OPL` 已经收敛为 family-level `session runtime` 之后，`MAS`、`MAG`、`RCA` 的公开主语更准确地应是“可被 `Codex`、`OPL` 或其他通用 agent 直接调用的独立 `domain agent` 仓”。继续把 `domain gateway / domain harness` 当成仓库对外第一身份，容易把内部边界层语言和公开产品角色混在一起。

影响：

- `MAS`、`MAG`、`RCA` 当前公开主语统一收口为独立 `domain agent`
- `agent entry / direct entry` 成为对外更优先的入口语言
- `domain gateway / domain harness` 继续保留为各仓内部的边界层与执行层术语

### 决策：`OPL` 继续持有 shared modules / contracts / indexes，但不制造 OPL-only domain semantics

原因：系列项目必须有一层承接跨仓共享模块、共享合同和共享索引；这层归属继续属于 `OPL / UHS`。但共享模块的存在，不应把 domain-specific 行为语义绑成“只有经过 `OPL` 才成立”的特殊工作流。

影响：

- `OPL` 继续持有 family-level shared modules、shared contracts、shared indexes
- `MAS`、`MAG`、`RCA` 通过 `OPL` 调用或被 `Codex` 直接调用时，领域语义保持一致
- 顶层 session/runtime/projection 与 domain-specific truth/logic 继续分层

### 决策：`OPL` 主线切换为 `ACP-native session runtime`

原因：对开发者和一线使用者来说，`OPL` 的一等使用路径不是直接调用 API，而是进入本地 `opl`、在 `Codex` 中显式激活 `OPL` 与其 domain agent，或让外部壳通过兼容层消费同一套 session runtime。继续把 `Product API` 作为主语，会把交互主线与真实用户路径写反。

影响：

- `OPL` 主仓当前主线以 `Codex-default session runtime + activation layer` 为中心，而不是以 GUI 或 API 壳为中心
- canonical truth 收敛到：workspace binding、session lifecycle、progress / artifact projection、agent entry dispatch、runtime mode
- GUI / Web shell 使用这套 session runtime；本地 8787 Product API / `opl web` 模块退役
- `opl-aion-shell` 是第一 GUI 交付仓；它基于 AionUI codebase 产出 OPL 品牌壳，但原版 AionUI app 不是 OPL GUI，也不是 runtime owner

### 决策：GUI 主线确定为基于 AionUI codebase 的 OPL 品牌壳

原因：在 `OPL` 已经明确走 `Codex-default session runtime + activation layer` 主线之后，当前 GUI 形态确定为基于 AionUI codebase 的 OPL 品牌壳。用户面对的交付物必须是 OPL 品牌壳：去掉 OPL 用不上的通用 AionUI 模块，替换品牌、文案和安装包身份，并消费 OPL runtime/release contracts。

影响：

- `OPL` 主仓继续保留 family-level session runtime、`opl` shell / TUI、release distribution surface 与 activation contracts
- 当前第一 GUI 交付物按 `opl-aion-shell` 的 OPL 品牌壳推进
- 仓内已移除旧 GUI 备线材料；当前 GUI 实施依据收敛到 `opl-aion-shell` 与 AionUI codebase

## 2026-04-20

### 历史决策：公开产品模型曾重置为 `Product API`

原因：旧本地 UI adapter 体系把 GUI 启动、环境管理、工作空间、任务、进度、文件、领域接线和 hosted 试验语义揉在了一层，已经不适合当前 `OPL + 独立界面仓` 目标形态。

影响：

- 当前公开模型统一收敛为：
  - `system`
  - `engines`
  - `modules`
  - `agents`
  - `workspaces`
  - `sessions`
  - `progress`
  - `artifacts`
- `opl` shell / TUI、GUI 外壳与 CLI 共同消费这组产品资源
- 旧本地 UI adapter 公开语义退出当前主线

### 决策：Domain Agents 与 OPL 保持松耦合

原因：`MAS`、`MAG`、`RCA` 等仓的专业逻辑需要继续独立演进，而 `OPL` 需要保持顶层共享运行时和统一入口。

影响：

- `OPL` 负责共享运行时、shared modules/contracts/indexes 与 release distribution surface
- 各个领域仓继续持有智能体入口、领域逻辑、运行规则与交付物
- 通过 `OPL` 调用领域智能体，与直接在 `Codex` 里调用该智能体，工作逻辑保持一致

### 决策：旧本地 UI adapter 相关公开语义进入退役清单

原因：这些语义属于上一阶段的公开设计，继续保留在主线里会污染当前开发和文档。

影响：

- 当前主线不再把旧本地 UI adapter、entry-guide、domain-wiring、hosted bundle/package 作为公开产品主语。
- 相关文档只留在参考层或历史层

## 2026-04-19

### 决策：GUI 主线冻结为“OPL 主仓共享运行时 + 独立界面仓”

原因：GUI 壳与 `OPL` 运行时需要保持分仓演进；`OPL` 主仓只保留运行时真相与接口面，真正的 GUI 主线放在独立界面仓里推进。

影响：

- `OPL` 主仓只保留 CLI 产品入口、工作空间 / 会话 / 进度 / 交付物真相、release distribution surface，以及 Codex / Hermes mode config
- 独立界面仓负责真正的 GUI 外壳
- 一键安装默认打开已安装 GUI；macOS 上缺失时自动下载、挂载并安装 one-person-lab release 中匹配当前平台的 OPL 品牌 Electron DMG；缺少匹配 release asset 时才把 `opl-aion-shell` 源码构建作为 fallback

### 决策：外部 GUI 基座只在“当前主线 / 基准 / 参考 / 备线”语境出现

原因：必须持续区分“上游参考对象”和“当前已经真实集成的对象”。

影响：

- AionUI codebase 可以作为当前 GUI 主线基座出现在 current status / implementation planning，但必须明确用户交付物是 OPL 品牌壳
- 外部 GUI 产品名只能用于基准或参考语境；当前 GUI 主线只承认 `opl-aion-shell` 这一 OPL 品牌壳
- 只有真实集成发生后，才允许在 current status / current implementation 里写成已集成事实

## 2026-04-11

### 决策：`Hermes-Agent` 只指上游外部 runtime substrate

原因：避免把仓内 shim、helper 或 scaffold 误写成“已接入 Hermes-Agent”。

### 决策：统一 runtime substrate，不强制统一具体执行器

状态：历史决策，已被 2026-05 的 provider-backed family runtime / Temporal production required substrate 口径吸收。当前读法是：Temporal-backed family runtime provider 承担 production online substrate；`Hermes-Agent` 保留为可选 Agent executor adapter 或显式 proof lane。`Codex CLI` 当前仍是家族默认且第一公民的具体执行器，默认模式是 `autonomous`。

影响：

- family runtime provider 统一负责 session、memory、scheduler、interrupt / resume、online-management gateway 等 substrate 能力；历史 `Hermes Kernel` 说法只作为迁移期背景
- `OPL` 与各领域仓继续负责 gateway、authority、object contract、audit truth
- 具体任务执行继续通过领域内部的执行路径完成

### 决策：家族第一公民执行器正式名称冻结为 `Codex CLI`

原因：这是当前最成熟、质量最可控、并且已经在医学研究线证明可行的默认路线；把正式名称、默认模式与路线状态分开表达，更适合跨仓共享合同长期维护。

影响：

- 家族第一公民执行器正式名称统一写作 `Codex CLI`
- 家族默认执行模式统一写作 `autonomous`
- `Hermes-Agent` 继续保留正式名称，当前路线状态统一写作 `optional_executor_adapter / experimental`
- 默认模型与默认 reasoning effort 继续继承本机 `Codex` 默认配置
