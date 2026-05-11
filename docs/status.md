# OPL 当前状态

## 当前公开角色

- `OPL` 是 one-person lab 的顶层完整智能体运行框架：它 Codex-first、stage-led，面向高价值知识工作的全自动交付，提供 `Codex-default session runtime`、显式 activation 层、跨仓 shared modules / contracts / indexes，以及 domain stage 的 durable orchestration / projection 支撑。
- 当前公开认知保持三层：`产品运行时 -> 产品家族 -> 当前实现 / 模块`。
- `OPL` 持有 Codex-default session/runtime、智能体注册表、工作空间 / 会话 / 进度 / 交付物接口面，以及机器可读合同。
- `OPL` 持有 stage descriptor、handoff envelope、lifecycle receipt、typed family queue、approval/wakeup/retry/dead-letter transport、trace/projection/parity 这类 domain-neutral 控制面；domain agent 持有 stage 内专家语义、prompt/skill、质量判断和 truth authority。大型任务应按接近人类专家实施的阶段推进，`Codex CLI` 是阶段内默认最小执行单元。
- `OPL` 的目标是上收所有智能体运行外围能力：stage attempt ledger、typed queue、checkpoint/closeout/receipt、source fingerprint / idempotency、artifact index、file lifecycle、retention、restore proof、migration ledger、workspace lifecycle、human gate / resume token 和 operator projection。domain repo 只保留领域 stage 语义、知识/记忆合同、质量 gate、artifact locator contract 和最终 verdict authority；真实 artifact 内容属于 workspace / runtime artifact root。这个目标可以依赖 Temporal、Hermes legacy 或 local provider 这类外部/可替换 substrate，但 provider 不拥有 OPL framework 边界或 domain truth。
- `OPL` 现在把 `standard domain-agent skeleton` 作为目标形态：MAS/MAG/RCA 应按统一的 `agent/`、`contracts/`、`runtime/`、`docs/` 边界提供 stage 定义、提示词、Skill、knowledge、quality gate、sidecar、receipt schema、projection builder 和 artifact locator contract；业务内部不要求完全同构。当前三仓已通过 manifest adapter 对齐到这套 skeleton，物理目录重组仍需等 direct skill path、OPL-hosted path、restore/provenance proof 和 focused tests 都稳定后执行。
- `OPL` 继续持有 family-level shared modules、shared contracts 与 shared indexes 的顶层语义与注册面。
- OPL framework 后续开发、跨仓 stage-led 对齐、执行语言/runtime dependency 选择和过时面退役的总入口是 `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md`。Temporal 细化实施继续由 `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md` 承接；domain repo 的退役清理必须回指这个总入口和各自 status/project/invariants。
- `Family External Orchestration Learning Board` 已成为外部 agent / orchestration 学习的默认入口：`docs/references/convergence-governance/family-external-orchestration-learning-board-2026-04-30.md`。新 source 只允许归入 `adopt_family_contract`、`adopt_domain_template`、`watch_only`、`reject` 或 `saturated`，不能把学习结果只留在对话里。
- `OPL Runtime Manager` 已冻结为 provider-backed 产品控制面：它管理 family runtime provider 的 provision、profile、typed family queue、stage attempt ledger、domain dispatch、task registration、诊断、恢复入口、Rust native helper catalog 与高频状态索引，但不承担 domain scheduler/session/memory kernel。
- `Codex` 是默认具体交互与执行宿主；Temporal-backed provider 是 OPL durable stage attempt 的生产 substrate target，当前 provider code 已落地到 workflow/activity/signal/query、CLI start/query/signal 和 provider receipt，但真实 Temporal server/worker deployment 与 domain soak 仍未闭合。`Hermes-Agent` 在迁移期只保留 legacy/optional provider 或显式 executor/proof lane，具体执行语义只在显式切换 executor 或 domain route 选择时进入。
- 当前活跃实现是三个独立 `domain agent` 仓：`MAS`、`MAG`、`RCA`；其中 `MAS` 在 v2 alignment 下继续作为独立医学科研 domain agent，并以单一 MAS domain app skill 接入 `Codex` / `OPL`。IP、Award、Thesis 与 Review Foundry 均保持定义阶段。
- `OPL` 在 MAS v2 alignment 中只持有统一定义、shared module/contract/index 注册、模块发现和 MAS-owned projection 的消费面；`MAS` 继续持有医学科研 runtime、controller truth、quality authority、publication gate 与研究交付真相。
- `MAS` 近期已完成 monolith / no-history physical absorb closeout；外部 `MDS` checkout 不再是 MAS 默认 study/status/progress/cockpit operation 的运行必需依赖，只保留 MAS 显式声明的 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 和 parity oracle 引用。`MDS` 不进入 OPL 顶层 agent 列表，也不升级为单独 OPL-managed domain agent。

## 当前主线产品模型

当前主线公开模型统一为：

- `system`
- `engines`
- `modules`
- `agents`
- `workspaces`
- `sessions`
- `progress`
- `artifacts`

这组资源是 `opl` 与 OPL-branded AionUI GUI/WebUI 的共同产品真相。
其中 `agents` 资源已经开始消费各 domain 仓 repo-owned 的 `domain agent entry spec`，而不是只由 OPL 顶层静态描述。

## 当前默认入口

- 默认前门是 `opl`；`opl exec` 负责一次性请求，`opl resume` 负责续接会话。
- `opl install` 是当前最短一键安装入口：默认安装或复用 `Codex CLI`、family runtime provider、`MAS`、`MAG`、`RCA`，同步短名 Codex skills，并以保守 managed 模式同步推荐 companion skills 和 `officecli` CLI 工具；MAS 声明的 MDS 相关 surface 只作为显式可选 companion diagnostic / oracle / intake 引用读取，不再作为 OPL 默认安装依赖。迁移期 Hermes online-management gateway 仍由 Hermes installer/gateway command 管理；Temporal-backed provider 是下一步生产目标，OPL 通过 `opl family-runtime install|repair`、`opl runtime manager action --apply` 或 provider-specific repair 路径触发、检查 readiness 并报告状态，不把 provider service lifecycle 变成 OPL domain runtime 实现。若 OPL 品牌 GUI 已安装则尝试打开，macOS 上未安装时会自动下载并安装匹配当前平台的 release DMG 后再打开；历史 8787 Product API service 模块已退役。
- `opl system` / `opl system initialize` 现在把 `Codex CLI` 当作受管 runtime dependency：报告实际命中的 binary path、raw version、parsed version、最低版本策略、版本状态与必要诊断。同版本兼容 wrapper / alias 会归并到当前有效入口，不再作为普通用户诊断；低于最低版本或无法解析当前命中版本时不会报告为 ready。当前默认最低版本是 `0.125.0`，可用 `OPL_MIN_CODEX_CLI_VERSION` 覆盖。
- 这几个入口默认继承 `Codex` 语义；只有显式 runtime switch 或显式 domain activation 才进入不同语义。
- `opl skill sync` 负责把家族 domain app skill pack 同步到 Codex 环境，供默认 `opl` / `opl exec` / `opl resume` 直接使用；默认 sibling repo 发现已经按 workspace/worktree 布局自动解析，不再依赖 `OPL_FAMILY_WORKSPACE_ROOT`。MAS v2 对外只承认一个 MAS domain app skill，OPL 消费该 skill 的 repo-owned entry/projection truth，不新增 OPL-only MAS skill family。
- `opl module install --module <module_id>` 现在走完整闭环：clone 到 OPL-managed modules root，执行仓库 bootstrap，同步对应 skill pack，再跑仓库健康检查。
- `opl module exec --module <module_id> -- <domain_cli_args...>` 是当前自动化调用 domain CLI 的 OPL 管理入口：它从 OPL module registry 解析当前 checkout，并在该 checkout 内启动 repo-owned CLI，而不是依赖用户 `PATH` 上可能滞后的全局 tool。
- `opl packages manifest` 现在暴露 OPL 中央 Packages 坐标雏形：WebUI Docker 镜像、native helper GHCR 包，以及 MAS/MAG/RCA 模块源码归档坐标；当前 `opl install`、App 首启协调、`opl system reconcile-modules` 与环境管理仍以 git checkout / sibling repo 更新到远端最新为正式路径。MAS 不恢复用户安装型 standalone GitHub Release 通道，MDS 也不作为独立 OPL module 坐标回流。
- `opl system initialize` 是当前一键配置安装的聚合面：同时暴露 workspace root、Codex default runtime、family runtime provider readiness、domain modules、推荐 companion skills、OPL 品牌 GUI shell、local support service、developer supervisor 用户级配置与下一步动作；没有显式 workspace root 时默认使用用户 Home 目录。首启 readiness 分成 Core、Domain modules、family runtime provider 三层：Full OPL readiness 需要三层都 ready；迁移期 Hermes/local provider 或未来 Temporal provider 未 ready 都会报告 degraded / attention needed。
- Fresh install 与 GUI 首启测试已有机器可读矩阵：`contracts/opl-framework/fresh-install-test-matrix.json` 冻结本机 clean-room、离线 blocker、干净 macOS VM 首启、首启 JSONL 日志和 GUI accessibility labels；本机验证入口是 `npm run test:fresh-install` / `./scripts/verify.sh fresh-install`，OPL Verify workflow 已纳入该 lane。真实 GUI 首启由 `gaofeng21cn/opl-aion-shell` 的 `scripts/opl-first-run-vm-smoke.mjs`、`scripts/opl-first-run-tart-smoke.mjs` 与 `.github/workflows/opl-first-run-vm.yml` 执行，目标 runner labels 为 `self-hosted`、`macOS`、`opl-gui-vm`。用户可见文案应把已配置 family runtime provider 未 ready 写成 Full online runtime degraded，不得把 Hermes gateway 单独写成未来唯一 readiness blocker。
- 测试入口已经收敛为机器可检查的 lane registry：`npm test` / `npm run test:fast` 是默认快速本地信号，`npm run test:smoke` 是秒级核心入口，`npm run test:regression` 承接宽回归，`npm run test:integration` 覆盖 ACP/session runtime、install/configure 与 retired Product API fail-closed，`npm run test:artifact`、`npm run test:fresh-install`、`./scripts/verify.sh native` 与 `./scripts/verify.sh structure` 保持独立语义。所有 active 测试文件必须通过 `node scripts/test-lanes.mjs assert-coverage` 归属到 lane；`docs/references/current-support/opl-test-lane-governance.zh-CN.md` 记录维护口径。
- `opl runtime manager` 是当前 Runtime Manager 的机器可读 projection：它展示 OPL 管理 family runtime provider 的 owner split、非目标、v1 domain registration registry、family runtime queue、stage attempt provider surface、Rust native helper lifecycle、native helper target 与 state index target；Temporal-backed provider code 已落地，Hermes/local provider 是当前迁移期实现信号，真实 provider deployment / domain soak 仍是未完成证据。Rust helper 源码、doctor/repair/prebuild 脚本和 Cargo workspace 已进入 npm package surface；当 helper 可发现时，它会调用 native doctor / state indexer / artifact indexer 与 runtime watch，并把 `opl_runtime_manager_native_state_projection` 写入 `OPL_STATE_DIR/runtime-manager/native-state-index.json`，同时报告 TTL、history、failure、last-success、freshness、结构化 diff 与 history GC preserved/removed 状态。
- `opl family-runtime` 已能把 MAS sidecar 导出的 `paper_autonomy/repair-recheck`、`paper_autonomy/ai-reviewer-recheck`、`paper_autonomy/gate-replay` 与 `paper_autonomy/route-decision` 入队、去重、派发，并在 task / dispatch JSON 中保留 `paper_autonomy` 投影：study id、next owner、callable surface、source refs、source fingerprint 与 idempotency key。`opl family-runtime attempt create|list|inspect|start|query|signal` 现在把 domain stage 执行登记为 provider-backed stage attempt，记录 provider kind、workflow id、workspace locator、checkpoint/closeout/human gate refs、retry budget、task binding 与 provider receipt，并可对 Temporal workflow 执行 start/query/signal；缺少 Temporal 地址时 fail-closed。该投影只服务 OPL Runtime Manager 和本地 inbox/event 可见性；OPL/provider 不写 MAS study truth、publication quality、artifact gate 或 `current_package`。
- 当前完成边界：OPL 已落地 MAS paper autonomy task 的 family queue / projection / guarded dispatch bridge；MAG/RCA domain adapters 已在各自 repo main 上落地，并可通过 `pending_family_tasks[]` 进入同一 OPL typed queue；MAS/MAG/RCA skeleton adapters 已能被 `opl agents list|inspect` 真实发现并校验为 aligned。Temporal provider code 已落地，Hermes/local provider 路径仍是迁移期可用实现信号。OPL 侧已用 fixture E2E 覆盖 gateway stopped -> repair -> ready、跨仓 MAS/MAG/RCA notification / approval / retry / dead-letter。剩余重型验收是真实 Temporal server/worker deployment、Codex long-running activity runner、provider cutover，以及真实 paper / grant / visual line 的 controlled apply 到最终交付。
- `opl runtime snapshot` 是 OPL 品牌桌面托盘与 App Runtime Workbench 的轻量投影面：它把 active domain manifest / progress projection 归入 `attention_items`、`running_items`、`recent_items`，并可消费 MAS-owned `mas_opl_runtime_workbench_projection` 生成单篇 study drilldown / read-only workbench 数据，同时保留 `source_refs` 与 `daemon_policy.local_daemon_added=false`；该入口只读 domain-owned truth，不新增 LaunchAgent / LaunchDaemon / SMAppService helper，也不让 OPL 接管调度内核。
- MAS progress、publication、quality、runtime control 与 `mas_opl_runtime_workbench_projection` 等投影在 OPL 中只作为 shared workbench projection 被读取和展示；这些投影不得被 OPL 文案升级为 `ready`、submission-ready、publication-ready、质量裁决、runtime authority 或 artifact authority 的最终 verdict。
- `Family Product Operator Projection` 已冻结为 OPL family 监督面：它消费 runtime attempt、domain quality projection 与 incident learning loop 合同，展示 `source_refs`、`freshness`、`owner_split`、`next_surface_ref` 与 `human_gate_reason`，但不接管 domain runtime truth 或 domain quality authority。
- Rust native helper 的生产化门禁已经进入仓库验证面：`native:doctor`、prebuild check、`npm pack --dry-run`、Rust tests/build、state cache 与 MAS/MAG family smoke 共同构成 native lane；CI 使用 fixture family smoke 验证 MAS/MAG 已声明的 `opl_stage_runtime_registration` 与 `native_helper_consumption.proof_surface` 投影，本地集成机继续可以对真实 MAS/MAG sibling workspace 做只读 indexing / registration / proof smoke。结构质量门禁分成两层：本地与 Verify workflow 的 `./scripts/verify.sh structure` 是 blocking gate，单独的 Sentrux Advisory workflow 只发布非阻断结构信号和 OPL quality details sidecar。
- `Family Persistence / Lifecycle / Owner-Route` 已冻结为 OPL family 共享控制面：`contracts/family-orchestration/` 现在包含 persistence policy、lifecycle ledger 与 owner-route schema，TS helper 与 Python mirror 已可构建这些 surface；`family-product-entry-manifest-v2` 只暴露 discovery refs。MAS 作为完整参考 adapter 映射 SQLite sidecar / lifecycle ledger / owner-route，MAG 做既有 runtime-control / grant-progress 的轻 adapter，RCA 做 managed-run/session/review projection 的厚 adapter且 SQLite 继续 deferred。OPL 只消费这些 projection，不成为 domain runtime、memory store、scheduler、quality verdict 或 artifact authority。
- 2026-05-11 skeleton/lifecycle 校准：MAS 已验证的 SQLite 持久化、file lifecycle、restore proof、artifact index、retention 和 lifecycle 管理经验应抽象成 OPL framework primitives；MAS 私有 study truth、publication quality、evidence/review ledger 和 manuscript/package authority不得迁出。MAG/RCA 后续要复用 OPL lifecycle primitives，并继续通过 skeleton mapping 暴露现有 stage/action/projection surface；当前对齐以 manifest/adapter 为准，物理目录重组必须等 direct skill path、OPL-hosted path、restore/provenance proof 和 focused tests 都稳定后执行。
- `Family Runtime Supervision` 已进入 shared contract 面：`contracts/family-orchestration/family-runtime-supervision.schema.json` 冻结 adapter id、cadence、last_success / last_tick、lease freshness、SLO state、repair command、safe reconcile hint、domain-owned source refs 与 read-only authority boundary；`runtime-task-companions` 可构建该 surface，`family-product-entry-manifest-v2` 可发现它。OPL 只做 discovery / export / parity / queue dispatch / projection，在线 wakeup substrate 由已配置 family runtime provider 承担；OPL 不成为 domain scheduler、session store、memory owner、quality verdict owner 或 artifact authority。
- `Family Action Catalog` 已进入 shared contract 面：`contracts/family-orchestration/family-action-catalog.schema.json` 冻结可调用 action metadata，`family-product-entry-manifest-v2` 可携带 `family_action_catalog`，TS helper 与 Python mirror 可派生 CLI、MCP、Skill、product-entry、OpenAI 与 AI SDK descriptor；`opl actions list|inspect|export` 只做发现和导出，不执行 domain action，也不把 handler truth 移进 OPL。
- `Family Stage Control Plane` 已冻结为 family 级设计方向，并已有最小 shared descriptor / discovery surface：`contracts/family-orchestration/family-stage-control-plane.schema.json` 与只读 `opl stages list|inspect` 负责 stage descriptor、skill / prompt / evaluation refs、handoff、projection 与 parity 语义；`docs/references/convergence-governance/family-stage-control-plane-adoption-plan.zh-CN.md` 记录 MAS 以 stage 为控制面的经验如何上升到 OPL，RCA/MAG 如何按专家工作流吸收。domain repo 继续持有真实创作、审核、质量 verdict 和交付 authority。对 MAS 来说，第一阶段是 inventory 和映射，不是替换现有 stage 名称、数量或 route contract。
- `Family Domain Memory` 已进入 locator / receipt / migration-plan 合同面：`contracts/family-orchestration/family-domain-memory-ref.schema.json`、`family-domain-memory-writeback.schema.json` 与 stage `knowledge_refs` 让 OPL 可以发现、索引、投影和携带 domain-owned memory refs；`opl domain-memory list|inspect|migration-plan` 是只读索引入口。MAS/MAG/RCA 的 memory 内容、写回接受/拒绝、route / fundability / visual quality 判断和 artifact authority 继续归各自 domain 仓。当前状态是 `contract_landed_projection_ready`，已能展示 migration plan ref、seed corpus ref、writeback receipt locator 和 readiness；真实 retrieval、writeback apply、memory body migration、App/workbench 展示和跨 domain soak 仍需后续验证。
- 这个 stage-led 方向也明确了 OPL 与 domain agents 的产品关系：`MAS`、`MAG`、`RCA` 是运行在 OPL family framework 上的独立 domain agents，不是 OPL 内部模块；它们仍可被 Codex App 通过各自单一 app skill 直接调用，OPL 只是提供长期托管、唤醒、队列、投影、恢复和跨域可见性。
- 2026-05-11 fresh assessment：stage-led / provider-backed 计划已经落到 `shared contracts + domain descriptors + local queue / attempt ledger + Temporal provider code + standard skeleton discovery + runtime snapshot / Aion workbench projection`，但没有完全落到生产闭环。OPL 层当前可实测的 shared 面包括 `python/opl-harness-shared`、`contracts/family-orchestration/`、`contracts/opl-framework/`，以及 root `src/` 下 family runtime、Temporal provider、stage control、action catalog、handoff、product-entry、domain catalog、runtime manager、native helper、skill sync、runtime tray 相关 TypeScript surface。MAS/MAG/RCA 已分别消费当前 shared pin 或 JS shared package，并暴露 stage/action/projection/skeleton descriptor；`opl agents list` 当前能把三仓识别为 aligned，且每个 skeleton 都带 artifact locator surface。MDS 保持较早 shared pin，符合 archive / diagnostic / upstream-intake 角色。仍未完成的是真实 Temporal server/worker deployment、Codex CLI long-running activity runner、typed closeout ingestion、human-gate 操作闭环、stage-attempt 操作面，以及真实 paper / grant / visual line 的 guarded apply soak。后续文档和实现可以把“完整智能体运行框架、全自动交付”写成目标定位，但不得把当前状态表述成“全量生产可用”。
- 当前旧面退役状态应按默认路径和物理残留分开判断：`MDS` 默认依赖、旧 Product API / `opl web`、project-level `.codex` / `.omx`、MAS standalone release 和 MDS 顶层 domain agent 已退出默认产品语义；Hermes / Gateway / compatibility vocabulary 若仍出现在 domain docs、program records 或 command key 中，只能按 legacy provider、历史来源或待删除残留读取。它们不再拥有默认 authority。下一阶段清理应继续保证 direct skill path、domain sidecar、family queue 和 descriptor parity 可用，再删除或归档残留旧名，避免形成第二套污染源。
- `MAS monolith / companion-retirement` 已上升为 OPL family 原则：domain 可以吸收外部 companion 的可保留能力，但吸收后默认只暴露 domain-owned capability surface；被降级的外部 companion 只能作为显式 audit、diagnostic、upstream intake 或 parity oracle 出现。未来类似吸收必须记录 source ref/hash、capability classification、license refs、domain owner、authority boundary、parity proof 和 no-history contributor audit。
- Rust native helper 的生产化门禁已经进入仓库验证面：`native:doctor`、prebuild check、`npm pack --dry-run`、Rust tests/build、state cache 与 MAS/MAG family smoke 共同构成 native lane；CI 使用 fixture family smoke 验证 MAS/MAG 已声明的 `opl_stage_runtime_registration` 与 `native_helper_consumption.proof_surface` 投影，本地集成机继续可以对真实 MAS/MAG sibling workspace 做只读 indexing / registration / proof smoke。结构质量门禁分成两层：本地与 Verify workflow 的 `./scripts/verify.sh structure` 是 blocking gate，单独的 Sentrux Advisory workflow 只发布非阻断结构信号和 OPL quality details sidecar。
- 推荐 companion 能力当前包括 `superpowers`、`ui-ux-pro-max`、`officecli` skill 组和 `officecli` CLI binary；Office 类 skill 只有 skill payload 与 `officecli --version` 同时可用时才报告 ready。它们不改变 OPL runtime 语义，只作为 MAS / MAG / RCA 工作流的增强能力。
- 默认本地状态目录是 `~/Library/Application Support/OPL/state`；如需切换到其他本地状态根目录，使用 `OPL_STATE_DIR`。Developer Supervisor Mode 的 family 用户级配置文件是 `developer-supervisor.json`，可通过 `opl system developer-supervisor` 读取或设置；`enabled=auto` 使用 GitHub 登录做默认探测，`enabled=on/off` 分别手动开启或关闭。
- `Codex` 中显式调用 `OPL` 与其 domain agents 是并列的一等使用方式。
- Domain app 通过各自仓库提供的本地 CLI / 程序 / 脚本 / contract 与 skill pack 接入；`OPL` 负责统一同步与发现。
- GUI / Web 主线保持 `AionUI / opl-aion-shell -> ACP-compatible OPL session runtime`。
- 当前 GUI 交付物是 `opl-aion-shell` 维护的 OPL 品牌桌面壳，它基于开源 AionUI codebase 做 OPL 裁剪与品牌化，并通过 ACP-compatible runtime surface 消费 OPL 的 Codex-default session/runtime truth；原版 AionUI app 不算 OPL GUI，`opl-aion-shell` 也不是 OPL runtime owner。OPL 一键安装负责打开已安装 GUI，macOS 上缺失时自动消费 one-person-lab GitHub Release 里的 OPL 品牌预编译 DMG；只有缺少匹配平台 / 架构 artifact 时才回退源码构建。
- `OPL GUI` 预编译包指 Electron-builder 产出的 OPL 品牌 `.dmg` / `.exe` / `.deb` 分发文件及 `latest*.yml` updater metadata；这些 release artifact 由 `opl-aion-shell` 构建，再通过 `npm run gui:release` 上传到 `one-person-lab` GitHub Release。macOS arm64 另有 `One-Person-Lab-Full-<version>-mac-arm64.dmg` 首次安装资产，随包带 MAS/MAG/RCA、当前 family runtime provider payload、`officecli` CLI binary 和推荐 companion skill payload，但不得写入 `latest*.yml` 或成为 App 自动更新目标。
- App 内自动更新按 OPL 日期版本判断；GUI/AionUI 基线版本只作为关于页和维护诊断信息展示。
- 本地 8787 `Product API` / `opl web` 模块已退役；WebUI 路径由 OPL-branded AionUI shell 提供。

## 当前交互模式

| 模式 | 默认执行者 | 主要用途 | 状态 |
| --- | --- | --- | --- |
| 普通对话 | Codex | 讨论、解释、阅读、计划、轻量分析 | 默认 |
| 通用任务 | Codex | 本地文件工作、命令执行、验证、多步任务 | 默认 |
| 专用智能体 / domain agent | `MAS`、`MAG`、`RCA` | 医学科研、基金写作、视觉交付 | 活跃 |

## 当前产品家族

| 产品家族 | 当前实现 | 当前覆盖范围 | 公开状态 |
| --- | --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研、证据整理、稿件交付 | 活跃 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 基金方向判断、申请书写作、修订工作 | 活跃 |
| `Presentation Foundry` | `RCA / RedCube AI` | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| `IP Foundry` | `Med Auto Patent` planned | 专利申请、技术交底、权利要求、实施例整理 | 定义阶段 |
| `Award Foundry` | `Med Auto Award` planned | 科技进步奖、自然科学奖、成果奖和荣誉材料 | 定义阶段 |
| `Thesis Foundry` | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| `Review Foundry` | Planned | 审稿、回复与修回 | 定义阶段 |

## 当前维护边界

- AI / 维护者核心工作集保持在 `project / architecture / invariants / decisions / status`。
- 默认公开文档保持在 `README*` 与 `docs/README*`。
- `contracts/` 只保留机器可读合同面。
- `docs/references/` 承接参考级配套文档；`docs/specs/` 只保留当前 active runtime / product-boundary 规格；`docs/history/` 承接历史归档与过程计划记录。
- 历史 `gateway / federation / routed-action` 语料已经退到 reference / provenance 层，不再作为默认实现依据。
- 旧本地 Product API / UI-adapter 公开语义已经退出当前主线，只保留在参考或历史层。
- 本地 Product API projection 已退役，避免把历史 adapter 面误导成当前产品主线。
- 自有完整长期常驻 runtime sidecar 不是当前 active work；当前通过 Runtime Manager 冻结可迁移边界，并把 Temporal-backed provider 作为生产 substrate 候选推进。只有 Temporal/provider abstraction 无法表达 OPL 必需的 task/wakeup/approval/audit/product isolation contract 时，才评估 OPL sidecar promotion。Hermes-Agent 在该路线中降级为 legacy/optional provider 或 executor/proof module。
- 各 domain 仓的 `harness / controller` 继续作为内部分层语言存在；对外公开主语优先写成独立 `domain agent` 与其 `agent entry / direct entry`。
- MAS v2 公开 wording 必须保持：`MAS = independent domain agent + single domain app skill + MAS-owned monolith boundary`，`OPL = unified definitions and projection/shared-contract consumer`，`MDS = optional MAS-declared backend audit / source provenance / historical fixture / explicit archive import / upstream intake / parity oracle companion`。不得写成新增 OPL runtime kernel、恢复 MAS standalone release、恢复 MDS 默认运行依赖，或由 OPL 对 MAS projection 给出 ready verdict。

## 参考入口

- `docs/references/README.md`
- `docs/history/README.md`
