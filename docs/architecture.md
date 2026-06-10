# OPL 架构

Owner: `One Person Lab`
Purpose: `architecture`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 顶层分层

`OPL` 的目标不是只做入口聚合或工作台投影，而是完整的 stage-led family agent runtime framework。当前产品认知分成 `OPL Framework`、`One Person Lab App` 和 `Foundry Agents` 三层：Framework 负责开发与运行框架，App 负责普通用户工作台，Foundry Agents 负责领域智能体与交付权威。阶段内最小执行单位是 Agent executor；`Codex CLI` 是当前第一公民 executor。

2026-06-10 以后，标准 Foundry Agent 的 family-level target shape 固定为 `OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry`。`OPL Agent OS` 承载通用 runtime、StageRun、generated/hosted surfaces、Console、Vault、Runway 和 cross-agent conformance；`Domain Declarative Pack` 声明 stage、prompt、skill、knowledge、tool affordance、artifact/memory/quality policy 和 authority ABI；`Domain Minimal Authority Kernel` 保留 domain truth、artifact / package / export authority、quality verdict、memory accept/reject、owner receipt、typed blocker 和 human gate；`Domain Capability Registry` 是 `Atlas + Pack + Stagecraft` 的 registry / ABI / use-policy，不新增品牌模块，不生成 owner answer 或 domain verdict。

同一目标态在人读架构上按 multi-plane operating model 表达：`Console` 承接 ordinary progress plane，只从 fresh `current_owner_delta` 生成 owner-action projection；`Runway` 承接 durable runway plane，只管理 admitted stage attempt、provider observation、repair/retry/dead-letter、handoff gate 和 OPL runtime blocker；`Workspace` / `Stage Artifact Unit` 承接 artifact plane；domain kernel / human gate 承接 authority decision plane；`Vault` 承接 passive evidence / telemetry plane；`Foundry Lab` / OMA 承接 improvement plane。所有 plane 共享一个规则：只有 domain/App/brand owner 可以签 owner answer、typed blocker、quality/export/review verdict、release verdict、physical delete authorization 或 ready declaration。

OPL 的设计取向是 AI-first、executor-first、AI 原生专家判断优先、contract-light：框架通过 stage、selected executor、清晰目标、上下文、authority boundary、available affordances、knowledge、rubric 与 quality gate 承接 AI 能力进步；合同只做 owner boundary、权限、安全、凭据、可写范围、审计、receipt、阻塞、恢复和 projection 这些下限，不把专家拆解、创作、评审、路线判断、工具编排或修订策略固化成脚本引擎，也不让机械检查替代专家 stage 判断。

当前 active 叙事统一为 `Minimal Trust Kernel + Stage Strategy Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`。Minimal Trust Kernel 是最小合同核：stage pack 是启动单位，stage 内最小执行单位是 Agent executor，默认 selected executor 是 `Codex CLI`；非默认 executor adapter 只能显式绑定并返回 receipt / audit / fail-closed 证据。Stage Strategy Kernel 是 stage 内的认知计算内核：它组织 candidate generation、reflection / review、ranking / selection、evolution / revision、meta-review / learning 这类开放式策略循环，并把 prompt、skills、tool affordance boundary、knowledge、rubric、quality gate refs 作为 Foundry Agent stage pack 的可审计声明；它不成为 OPL 脚本引擎、工具流程编排器、Route Reconciler 或质量权威。Readiness 是 operator / App 默认聚合面，只读 admission、scope、receipt、replay、assumption、monitor 和 evidence gap，不产生 domain ready、artifact ready、quality verdict 或 production closure。Derived Diagnostic Lenses 只用于解释 blocker、stale assumption、replay gap、failure localization、runtime budget 或 route-back evidence；这些 lens 可以被 readiness 折叠消费，但不得升级为 runtime planner、proof assistant、workflow compiler、domain verdict 或质量权威。Surface Budget 是新增 surface 的治理预算：只有影响 launch safety、authority boundary、evidence / replay / audit / route-back，或已被 App / runtime 反复消费的 surface，才允许升级为默认入口；其他学习点先进入 refs、warning、diagnostic lens、reference 或 history。AI Capability Aperture 保留 stage 内开放式专家空间，使模型升级、domain pack 改进和独立 reviewer 能力能直接转化为系统能力，同时不把 AI strategy refs completeness 写成 OPL launch hard gate。

Purpose-first 审计后的 Readiness 默认读法是 owner-delta-first。默认 App/operator 和 CLI summary 应先暴露：当前是否有 OPL 可执行 safe action、等待哪个 owner、owner 需要交付什么 deliverable delta / quality gate receipt / human gate receipt / owner receipt / no-regression ref / typed blocker，以及这个等待是否阻断 domain ready、App release ready 或 production ready。`blocked_refs_only_attention`、stage replay packet、evidence envelope、private residue inventory、lifecycle detail 和历史 receipt 计数属于 audit drilldown；它们可以解释缺口，不能成为完成声明。

Stage Transition Authority 是这条 owner-delta-first 链路的 OPL-owned generic primitive。MAS/MAG/RCA/OMA、Agent Lab、human gate 和 provider 都可以提交 transition intent、owner answer、typed blocker、human gate decision 或 provider observation，但它们不能直接写 Stage current pointer、StageRun terminal state 或 `current_owner_delta`。这些默认读面的状态只能从 OPL append-only authority event log 派生；修正也必须通过新 event，而不是由 projection、counter、App cockpit 或 domain module 原地覆盖。

OPL Framework 允许使用外部 provider，但框架职责归 OPL：stage attempt lifecycle、typed queue、handoff、human gate、retry/dead-letter、observability、artifact/file lifecycle 与 operator projection。标准 OPL Agent 的默认长跑路径是 OPL/Temporal 托管自治执行：domain agent 不内置通用 daemon、scheduler 或 attempt loop，任务启动后由 OPL/Temporal 负责持续唤醒、resume/re-query、retry/dead-letter 和 attempt ledger；Codex App 只是启动、观察、介入和展示入口。

`OPL` 的当前主链路是：

`Human / Codex / opl / One Person Lab App -> Codex-default Session Runtime -> OPL Activation Layer / Stage Control Plane / Typed Family Queue -> Domain Capability Surface -> Domain Repository`

## 品牌模块架构

OPL 的三层产品认知说明“面向谁”，当前十个品牌模块说明 Framework 内部能力如何高内聚、低耦合地演进。品牌模块不是新的 runtime，也不是第二 truth source；它们把已经存在的 contracts、source、CLI/App 行为、read model、runtime ledger、provider receipt 和 docs support 归入稳定 owner boundary。

| 模块 | 主聚合面 | 主要消费 | 明确不拥有 |
| --- | --- | --- | --- |
| `OPL Charter` | 顶层宪章、命名、ADR/RFC、术语生命周期和品牌组合治理。 | 核心五件套、决策、authority matrix、品牌模块 registry。 | runtime truth、domain truth、release verdict。 |
| `OPL Atlas` | Agent、capability、domain capability registry、surface、owner、dependency 和 lifecycle catalog。 | domain descriptors、module registry、surface metadata、capability registry refs、conformance refs。 | 执行、receipt 签发、domain verdict、capability authority。 |
| `OPL Workspace` | Workspace Group、Project Unit、Stage Artifact Unit、用户检查面和文件生命周期投影。 | workspace contracts、domain workspace locator、stage artifact refs。 | domain artifact body、quality/export verdict、owner receipt authority。 |
| `OPL Pack` | Declarative Domain Pack、domain capability registry ABI、authority ABI、pack compiler、generated/hosted surfaces、standard authority functions，以及 Pack OS 通用 descriptor / install / registry / cache / distribution / lock / lifecycle / review receipt refs transport。 | standard domain-agent skeleton、domain pack compiler、generated interface bundle、Pack OS descriptor/install/registry/cache/distribution/lock refs、capability ABI refs、conformance refs。 | domain handler implementation、artifact body、owner receipt、typed blocker、quality verdict、publication/export readiness。 |
| `OPL Stagecraft` | Stage 设计、认知计算、capability use policy、tool affordance、prompt/skill/knowledge/rubric refs 和 independent quality gate 边界。 | Foundry Agent stage packs、prompt/skill/knowledge refs、capability use-policy refs、quality gate refs。 | durable provider、queue ownership、domain quality verdict。 |
| `OPL Runway` | Durable execution、control-loop runtime、typed queue、attempt、lease、retry/dead-letter、wakeup、human gate、runtime blocker、readiness / reconcile / handoff-gates / recovery-repair 读面和 desired/current Progress Reconciler。 | stage pack launch request、provider profile、domain owner route refs、current owner delta、worker/scheduler/provider refs。 | domain truth、owner receipt、artifact readiness、quality verdict、production readiness、L5 long-soak closure。 |
| `OPL Vault` | Evidence、receipt refs、typed blocker refs、artifact lineage、restore/provenance 和 refs-only ledger。 | domain-owned receipt/blocker refs、provider refs、no-regression refs。 | memory/artifact body、memory accept/reject、domain verdict。 |
| `OPL Console` | App/operator 工作台、`current_owner_delta` default read root、current owner、next action、阻塞、产物投影和 drilldown。 | framework readiness、App state、domain-owned projection、Vault refs。 | runtime truth、domain truth、owner answer、App release verdict。 |
| `OPL Foundry Lab` | Agent 创建、测试接管、mechanism improvement、canary、promotion、rollback 和 work order。 | Agent descriptors、attempt evidence、domain-owned eval/proof refs。 | MAS/MAG/RCA/OMA 的 domain authority。 |
| `OPL Connect` | CLI、MCP、OpenAI/AI SDK tools、Skill/plugin、module install、release/install 分发和 drift matrix。 | public surface index、module registry、skill/plugin metadata、release/install contracts。 | 语义重新解释、domain-owned handler、release evidence 伪造。 |

模块依赖的默认读法是：`Charter` 固定语言和边界，`Atlas` 提供目录与 capability registry catalog，`Workspace` 提供可检查落点，`Pack` 固定 domain pack / capability registry ABI / authority ABI / generated-surface 输入，并通过 Pack OS 承载 capability pack descriptor、install registry、content-addressed cache、refs-only distribution、refs-only lock、artifact lifecycle refs 和 review receipt refs，`Stagecraft` 设计 stage 内专家工作和 capability use policy，`Runway` 承接 durable execution，`Vault` 保存 refs-only evidence，`Console` 消费 `current_owner_delta` projection，`Foundry Lab` 产生 agent 改进 work order，`Connect` 把同一合同派生到外部调用和分发面。ordinary App/CLI/operator route 只有 `current_owner_delta` 一条；Runway、Vault、Atlas、Pack、Foundry Lab、Connect 和 full drilldown 只能提供 safe action、refs、audit packet、work order 或 support evidence。任何模块的 structural readiness、conformance pass、capability registry hit、pack lock written、review receipt refs observed、provider completion、ledger verified、Console projection 或 App projection 都不能单独升级成 domain ready、quality/export ready、App release ready 或 production ready。

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / Codex / opl / One Person Lab App / External Shell -> Codex-default session/runtime path -> explicit OPL activation when needed -> configured family runtime provider when durable orchestration is needed -> selected domain capability surface -> domain-owned stage pack / receipt / deliverables`

长跑托管任务与 online management 的默认目标链路在这个主链路下增加 provider-backed family runtime substrate：

`OPL Product Entry / One Person Lab App / CLI -> OPL stage-led family runtime provider -> thin Domain Adapter -> selected domain capability surface -> domain-owned stage pack / receipt / deliverables`

这里的核心点是：

- `OPL` 当前主线以 `Codex-default session/runtime + explicit activation layer` 为 canonical truth
- `OPL Framework` 集成开发与运行：developer-facing CLI/contracts/package 入口和 runtime control plane 使用同一套 truth；不通过拆仓或复制 runtime 来制造第二框架
- OPL-compatible Agent 以独立 repo/package 形态开发；运行时通过 `opl framework locate` / `opl_framework_locator` 定位外部 OPL Framework 环境，再调用 framework-owned runtime、contract、package 或 projection surface
- `One Person Lab App` 是 user-facing workbench：它消费 Framework 的 runtime/activation truth 和 domain-owned projection，持有 GUI product truth、GUI runtime bridge 产品合同、active shell validation、release gate、updater metadata 和用户文档，不成为 domain runtime、quality verdict 或 artifact authority
- App 普通用户路径等价于 `Codex App wrapper`：`Codex CLI` 是固定 concrete executor，MAS/MAG/RCA 及后续 Foundry Agent 以任务入口内置呈现；`opl-aion-shell` 只是当前 App-owned GUI contract 的 implementation carrier，上游 AionUI 的多 backend、多 Agent 选择只允许作为 shell implementation / developer-operator diagnostic 细节，不成为普通用户产品面
- `OPL` 的 family-level agent framework 以 domain `stage` 为可观察、可编排、可恢复、可审计的语义单元；Agent executor 是 stage 内最小执行单位，`Codex CLI` 是当前第一公民 executor
- 大型任务按接近人类专家实施的阶段推进：界定目标、准备材料、执行、审核、修订、交付收口；OPL 负责阶段生命周期与可见性，domain agent 负责领域判断和交付 authority
- OPL 的合同面必须保持 contract-light 且只保下限：Minimal Trust Kernel 约束启动条件、owner、权限、安全、凭据、可写范围、审计、replay、恢复与 route-back；Stage Strategy Kernel 声明 stage 内认知策略、prompt、skills、tool affordance boundary、knowledge、rubric 和独立 quality gate；Readiness 只聚合 launch/evidence gap；Derived Diagnostic Lenses 只解释缺口；AI Capability Aperture 保留 stage 内开放式思考、写作、评审、诊断、工具选择和迭代
- Jason Liu `Codex-maxxing` 这类外部 Codex operating-loop 经验只按 pattern source 吸收到 OPL 自有 surface：durable thread / steering / memory / heartbeat / artifact review 映射为 stage attempt ledger、`stage_progress_log`、refs-only memory/artifact/package refs、provider heartbeat 和 App/operator drilldown。默认可用机器面是 `opl runtime app-operator-drilldown --json` / `--detail full --json` 的 `workstream_operating_loop`，以及 `opl framework readiness --family-defaults --json` 的同源 summary；该 projection 只做 operator steering，不读 memory/artifact body、不执行 domain action、不创建 owner receipt、不声明 domain ready / production ready。外部文章 URL 只能作为 `pattern_source_refs`，不能成为 runtime、authority 或机器真相源。
- OPL 的 surface budget 必须保持减法治理：新增 surface 默认是 diagnostic / reference；升级成 default surface 需要证明它服务 launch safety、authority boundary、evidence/replay/audit/route-back，或被 App / runtime 多次消费；升级成 hard gate 还必须证明缺失会导致错误启动、越权或不可审计 / 不可恢复
- readiness、scorecard、schema completeness、contract completeness、provider completion 与 generated-surface proof 只能定位 advisory、blocker 或 evidence gap；专家质量判断必须来自独立 AI stage、domain-owned quality gate、owner receipt、typed blocker 或 route-back receipt
- 涉及知识交付、专家判断或正式质量裁决的复杂步骤必须保持为独立 stage，例如 MAS AI 审稿、publication quality review、MAG fundability review、RCA visual review；不得把这类工作折叠成另一个 stage 的函数、helper 或后处理
- AI-first quality gate 是独立审核任务：执行 attempt 产出 artifacts / refs / closeout packet，审核 attempt 只读取这些显式输入和必要上下游 refs，产出 gate receipt / typed blocker / route-back；同一个 `Codex CLI` attempt 不能在同一上下文里自审并推进下一 stage
- 本地 `opl`、直接 `Codex` 使用、ACP-compatible 外部壳与 App repo 通过 `opl-aion-shell` 提供的 GUI shell 都消费同一套 runtime truth；`one-person-lab-app` 持有 App-level GUI product contract、release gate 和 active-shell validation，`opl-aion-shell` 只是当前 replaceable GUI shell implementation carrier，不能持有 OPL runtime truth 或 App-level bridge contract authority
- OPL hosted integration 是标准 OPL Agent 的默认长跑 runtime path；它管理受支持的 family runtime provider、typed family queue、stage attempt ledger、domain dispatch 与 online runtime readiness，但不复制 domain runtime kernel，也不让 Codex App 成为持续驱动任务的外围 loop
- family-level runtime supervision 作为 domain-owned wakeup / supervision surface 的 discovery、export、parity、enqueue 与 projection；Temporal-backed provider 是 production online runtime 的必需 substrate，local provider 只服务 dev/CI/offline diagnostic baseline，`hermes_agent`、`claude_code` 与 `antigravity_cli` 是显式非默认 executor adapter/backend；旧 Hermes provider / Gateway 语料只作为 proof、provenance、diagnostic、fixture 或负向 guard 读取，MAS 显式 Hermes scheduler 只允许 status/remove legacy cleanup，不允许 ensure/create/edit/resume/run tick；`OPL` 持有通用 scheduler / queue / attempt ledger / retry-dead-letter / projection，但不接管 domain truth、memory、quality 或 artifact authority
- `stage_progress_log` 是 OPL family-runtime attempt/progress projection：它从 OPL SQLite attempt ledger、Temporal provider status/history refs、human-gate / dead-letter state、domain-owned receipt / typed blocker refs 和 closeout refs 派生。Agent Lab 只消费该 projection 的 refs 作为 eval/improvement/read-model 输入，不拥有 runtime log，不写 provider history 或 attempt ledger，也不把 refs-only progress 写成 domain truth、quality verdict、artifact authority 或 runtime ownership。
- OPL Agent Lab 属于 Framework 内部 eval / improvement control plane：它把 descriptor、stage attempt、provider receipt、domain-owned eval/proof refs 和 operator blocker 组织成 lab run、improvement candidate、acceptance evidence 与 follow-up projection；它不接管 MAS/MAG/RCA 的 domain truth、quality verdict、artifact authority、memory body 或 owner receipt authority
- 在智能体自进化闭环中，OPL Agent Lab 只负责 evidence / root cause / targeted fix / predicted impact / next-run falsification read model、best-of-N variant comparison、risk-tiered promotion gate、canary / rollback / no-forbidden-write refs 和 App/workbench projection；`opl-meta-agent` 负责把这些 refs 与目标 agent handoff 转成 developer patch work order、target capability candidate、mechanism patch proposal 或 typed blocker；目标 domain agent 负责最终 owner receipt、domain truth、quality verdict 和 artifact authority
- `opl`、`opl exec`、`opl resume` 默认继承 `Codex CLI` 执行语义；`opl --help` / `opl help` 展示 OPL Framework 自有命令树，`opl exec --help` 等执行器命令帮助继续保留 Codex-compatible passthrough 边界
- `opl install` 默认安装或复用 Codex、family runtime provider、MAS/MAG/RCA domain modules 与推荐 companion tools；`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- 首启 readiness 分为 Core、Domain modules、family runtime provider 三层；Full OPL readiness 要求三层都 ready
- `opl connect sync-skills` 把 family domain skill pack 注册到 Codex 环境，并按 workspace/worktree 布局自动发现 sibling repo；显式 runtime switch 或 domain contract 调用才进入 activation layer
- `opl connect install` 负责把缺失 domain repo 拉进 OPL-managed modules root，并串起 repo bootstrap、skill sync 与 health check 这条闭环安装线
- `opl connect exec` 负责把自动化 CLI 调用绑定到 OPL module registry 解析出的当前 checkout；domain CLI 从 repo checkout 内启动，避免把用户 PATH 上的旧全局 tool 当作执行真相
- `Codex CLI` 是默认且第一公民的 concrete executor；family runtime provider 负责 stage-attempt durability / wakeup / approval / retry / query transport，具体 executor 仍由 OPL / domain stage 显式选择
- `OPL Product Entry` 的普通 ask/chat/resume 路径只使用 Codex-default executor；runtime status 不再暴露 Hermes / Gateway diagnostics，显式非默认 executor 只通过独立 receipt / audit surface 进入
- `MAS`、`MAG`、`RCA` 等 Foundry Agents 继续保持独立，并通过 CLI / 本地程序 / 脚本 / contract 暴露 capability surface；它们以 OPL-compatible package / repo 接入，而不是内嵌一份 OPL runtime
- Foundry Agent repo 的目标形态是 `Domain Knowledge / Authority Pack + thin adapter`：按 `agent/`、`contracts/`、`runtime/authority_functions/`、`src/` 或 `packages/`、`docs/` 声明 stage、Stage Strategy Kernel refs（prompt、skills、tool affordance boundary、knowledge、rubric、quality gate refs）、transition spec、projection builder、receipt schema、workspace/source/artifact locator 和最小 authority function；不维护 parallel generic scheduler、queue、attempt ledger、state-machine runner、workspace lifecycle、artifact lifecycle、memory locator 或 App/workbench runtime
- Foundry Agent series 的机器外观由 `contracts/foundry_agent_series.json#/series_design_profile` 固定为同一 canonical profile：所有标准 agent 都必须声明相同 lifecycle、相同 generic input/output slots、相同 stage pack sections、相同 closeout shape 和相同 OPL/domain authority invariants。领域差异通过 `domain_specific_profile`、`domain_progress_aliases`、stage/action contracts 和 authority-function refs 表达；不能把 MAS/MAG/RCA/OMA 各自的输入输出 taxonomy 写成新的 series lifecycle。
- Foundry Agent 的 developer checkout 只保存 locator、index、schema、receipt refs、restore / retention policy 和可审查 fixture；真实 workspace state、artifact body、receipt 实例、最终交付物、临时 build/cache、venv/pycache/pytest cache 和 install sync 副产物必须进入外部 workspace / runtime artifact root 或仓外临时目录
- Pack OS 是 OPL Pack 的通用 package transport 层：`opl pack os inspect|install|registry|cache|distribute|lock|validate --json` 从 capability pack descriptor 派生 refs-only lock、registry entry、content-addressed cache manifest 和 distribution bundle，记录 descriptor hash、resource refs/hash、artifact lifecycle refs、review receipt refs、provenance 和 authority false flags。它可以运输 MAS display pack、MAG/RCA/deck/report/app UI pack 这类 domain-declared refs；domain truth、artifact body、owner receipt、typed blocker、quality/export/review verdict、publication readiness 和 App release readiness 仍回各自 domain/App owner。
- OPL-owned workspace 面现在按 `OPL Workspace Protocol` 读取，而不是只按目录结构读取。协议由 `contracts/opl-framework/workspace-topology-profile.schema.json` 固定为 `Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker`，实例级 `workspace_index.json` 由 `contracts/opl-framework/workspace-index.schema.json` 固定 canonical topology、display labels、legacy aliases、shared resource roles、shared manifest refs、indexed project roots、stage outputs root manifest refs、stage outputs index refs、current stage pointer refs、workspace inspection / resource inventory refs、project lifecycle、generated refs 和 authority false flags，并由 `opl workspace ensure` / `opl workspace init` 物化成可用目录结构。`workspace_modes` 只允许 `one_off`、`series`、`portfolio`，三者都使用 series-capable skeleton：默认 physical `project_collection_path` 统一为 `projects`，即 `one_off` 默认落在 `projects/<project-id>/`，RCA 同主题多 deck 默认用 `rca_series` profile 并落在 `projects/<deck-id>/`，MAS 多 study / 多 paper line 默认用 `mas_portfolio` profile 并落在 `projects/<study-id>/`；升级 series / portfolio 不搬已有 project root。MAS 共享 `data`、`literature`、`memory` 并保留 `studies` display / legacy alias，RCA 共享 `shared/sources`、`shared/brand`、`shared/visual_memory`、`shared/style_system`、`shared/material_inventory` 并保留 `deliverables` display / legacy alias；MAG/OMA 也保留 `deliverables` display / legacy alias。这些 alias 不再定义 canonical physical root，也不改写 shared lifecycle。`workspace ensure` 是默认快速入口：先复用 active binding，已有 project 直接返回，缺 project 时追加，缺 workspace 时初始化；`workspace init` 是显式初始化入口。两者可使用已配置 OPL workspace root 或显式路径，同时写 `workspace.yaml`、`workspace_index.json`、shared `opl_resource_manifest.json`、project `opl_stage_outputs_manifest.json`、project-local `stage_outputs_index.json` / `current_stage.json`、canonical `control/opl/projections/{workspace_map,workspace_health,workspace_inspection,workspace_resource_inventory}.json`、canonical `control/opl/reports/workspace_report.json` 和 root mirror `workspace_*.json` 并激活 OPL workspace registry。root mirror 只为兼容旧检查入口保留；`control/opl/projections` 与 `control/opl/reports` 是 v2 generated truth。`workspace validate` 是 fail-closed 结构门，`workspace doctor` 是同检查的只读诊断；二者检查 generated refs、inspection/resource inventory、stage outputs index/current pointer、profile binding、topology events、canonical projection 与 root mirror 的一致性，同时只验证 runtime projection 的 shape 和 authority boundary，不把合法非空 `current_stage.json` 覆盖成空模板。`workspace adopt --dry-run|--apply` 用于既有目录 adoption，apply 只写 OPL-owned topology metadata / generated refs，不绑定 registry、不迁移 domain truth；`workspace upgrade --apply` 原地刷新 OPL metadata / manifests / map / health / inspection / inventory / report 并补齐缺失的 stage index/current pointer，不移动 project roots、不覆盖 runtime 已写的合法 current pointer；`workspace project archive --apply` 只把 indexed project/study 标记为 archived，不删除文件，也不等价于 registry `workspace archive`；`workspace export-map`、`workspace health`、`workspace inspect`、`workspace inventory` 与 `workspace report` 是 read-only inspection surface。`workspace interfaces` 和 App `workspace_ensure` action 是同一默认 command contract 的调用面，App `workspace_initialize` 保留为显式 init，App 还暴露 `workspace_validate`、`workspace_doctor`、`workspace_adopt_dry_run`、`workspace_adopt_apply`、`workspace_upgrade`、`workspace_project_archive`、`workspace_export_map`、`workspace_inspect`、`workspace_inventory` 和 `workspace_health`；CLI/App 是真实执行入口，MCP/Skill/OpenAI/AI SDK 是 descriptor-only delegate，只能通过 ensure / interfaces delegate 发现或调用 workspace surface，不能自由猜目录。Stage Native 的普通用户默认检查面是 `<project-root>/artifacts/stage_outputs/<stage-id>/`、`control/opl/reports/workspace_report.json` 和 domain-owned product views；workspace inspection、resource inventory、stage outputs index、current pointer 与 root manifest 都只是 refs/root projection，不能替代 `opl_stage_manifest`、owner receipt、typed blocker、domain truth、quality/export verdict 或 production readiness；runtime-state、SQLite sidecar、provider ledger 和 App projection 只做 provider backing / provenance / restore / audit / read-model refs，不是普通用户默认查看面。
- Workspace governance v2 还要求 `workspace_index.json.profile_binding` 绑定 `workspace-topology-profile.v2`、`opl-workspace-topology-profile-v2-projects-stage-outputs`、profile contract ref 与 migration history，并要求 `topology_events[]` 留下初始化、adopt、upgrade 或 lifecycle mutation 的拓扑事件。`agent_workspace_norm` 在真实 workspace 中必须等于 `agent-workspace-norm-contract.json` 派生出的完整 projection；只匹配 norm id/version 不能通过结构门。Project lifecycle 统一由 OPL 投影 `active`、`paused`、`archived`、`superseded`、`locked`，并携带 paused/superseded/locked/archive metadata、retention policy 和 `domain_owner_receipt_required` safe delete gate；domain repo 只能声明 locator 和 owner receipt / typed blocker，不拥有 generic workspace lifecycle 或 physical delete authority。这个 v2 governance 对 MAS/MAG/RCA/OMA 采用同一物理语义；MAS 的 `study` / `studies` 只保留 display naming 例外，不改变 project unit、stage outputs、generated root、lifecycle 或 report 语义。
- 更严格的准入形态是 `Declarative Domain Pack + OPL generated/hosted surfaces + standard authority functions`：CLI/MCP/product-entry/sidecar/status/workbench、scheduler、attempt ledger、generic transition runner、SQLite lifecycle index、session store、memory/artifact/review/native-helper/observability shell 默认由 OPL 生成、托管或替换。`functional_privatization_audit` 必须先把代码路径拆成 `standard_domain_pack_inventory`、`authority_function_inventory` 和 `private_platform_residue_inventory`；只有第三层才算私有平台残留。domain repo 如需保留 residue，必须通过 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json` 和 scaffold 生成的 `contracts/private_functional_surface_policy.json` 证明它属于 refs-only adapter、临时 migration bridge、diagnostic cleanup path 或 provenance/fixture；authority function 则必须走 OPL 标准 ABI 和 no-forbidden-write guard。Domain 收薄的完成 gate 是 replacement parity、no-active-caller、owner receipt 或 typed blocker、no-forbidden-write 与 tombstone/provenance；descriptor ready、conformance pass、private audit 分类清零或 refs-only ledger verified 不能授权 physical delete。
- `One Person Lab App` 对这些 Agent 来说是可选前端；同一个 Agent 可以通过 direct Codex app skill、自己的 CLI、或 OPL Framework hosted/projection path 运行
- App 的 GUI navigation 只能包装 OPL `app state/action` 与 Foundry Agent task entry，不得把 shell repo 的 backend / Agent selector 当成 runtime truth、domain truth 或 ordinary executor switch
- App 运行状态页消费 OPL `runtime_visualization_projection` 与 `stage_attempt_workbench.stage_progress_log`，并把 Temporal Web UI 作为 operator/debug link 暴露；Temporal Web UI 不成为普通用户主页面、App 状态真相源或 domain authority surface。
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
- stage descriptor、stage pack admission、requires / ensures composition、skill / prompt / evaluation refs、trust lane、handoff envelope、receipt 与 authority boundary discovery
- shared module / contract / index registration
- family skill pack discovery / sync
- 显式 domain contract dispatch
- domain capability surface discovery

### 2.5 OPL Stage-Led Family Runtime Provider / Hosted Integration

负责：

- family runtime provider 的 provision / version pin / profile wiring
- provider readiness 的触发、检查与状态报告；Temporal provider 是 production online runtime 的必需 substrate，Hermes-Agent 不作为 provider / Gateway readiness surface
- `opl family-runtime` typed queue、SQLite stage attempt ledger、idempotency、attempt lease、execution authorization decision、closeout receipt binding、retry、dead-letter、approval、local inbox、event export 与 `stage_progress_log` projection
- `opl family-runtime attempt create|list|inspect` 的 provider receipt 与 task-bound lifecycle projection；该 ledger 只记录 control metadata、checkpoint/closeout refs、human gate refs 与 blocked reason
- StageRun execution authorization gate：provider attempt、attempt lease、workspace/artifact scope、source fingerprint、idempotency、execution authorization decision 和 forbidden-write guard 都成立后才允许进入 provider execution；closeout receipt 必须绑定 StageRun、stage manifest、current pointer 和 source fingerprint。缺口只能投影为 OPL runtime blocker，不改变 domain truth，不创建 domain typed blocker，不替 domain owner 签 receipt。
- `stage_progress_log` 统一投影每个 stage attempt 的 intended work、actual work、timeline、usage、Temporal visibility refs、Temporal Web UI debug ref、evidence refs 和 authority boundary。其 `user_stage_log` 子面向用户回答 stage 目的、问题、实际完成事项、耗时、token、费用、剩余 blocker 与证据 refs：OPL 负责时间/usage/refs 和显式缺失状态，domain agent 负责人话语义摘要。标准 OPL Agent 使用通用 `stage_work_done` / `changed_stage_surfaces` 说明论文、基金、视觉交付或其它 domain deliverable 的人话改动；旧 MAS 论文 alias 不再进入 OPL 标准 contract、runner 或 projection。Temporal provider 承担 durable workflow history、activity heartbeat、workflow query 与 searchable visibility；OPL 从 attempt ledger / provider run / activity events / usage projection / closeout packet 派生 projection，不另建平行 log database，不读取 domain truth/artifact body，也不把 provider completion 解释成 domain ready。
- `attempt_true_path_proof` 只把同一 `stage_attempt_id/task_id/workflow_id/run_id` 在 `attempt query`、`queue inspect`、App full drilldown、stage progress 和 Temporal debug refs 之间连起来；它不声明 long-soak、domain ready、artifact authority 或 quality verdict。
- Temporal visibility readiness 是 provider lifecycle 的 fail-closed 前置条件：生产 `temporal` provider 启动 searchable stage attempt 前必须具备 OPL stage attempt Search Attributes，缺失时输出 repair action；Search Attributes 只放可检索摘要和 refs，不放 transcript、artifact body、memory body 或 domain body。
- `Conflict / Blocker Envelope` 的统一投影：重复 task、identity incomplete、evidence/quality blocker、human gate、retry/dead-letter 和 receipt conflict 都进入 `opl_conflict_or_blocker.v1`，并在 `operator_conflicts[]` 中给 App/operator 消费
- provider wakeup bridge；生产路径使用 provider-backed signal / tick / hydrate 语义，旧 Gateway / cron bridge 不再属于 active interface
- domain task registration contract 的 hydration；当前 MAS 通过 `pending_family_tasks[]` 把非终局、非 hard human gate 的 autonomy blocker 交给 OPL queue
- family runtime supervision contract 的只读发现、导出、一致性检查与产品投影；其中 adapter_id、cadence、last_success / last_tick、lease_freshness、SLO state、repair command、safe reconcile hint 与 source refs 均来自 domain-owned surface
- runtime status、session、progress、artifact、attention queue 的 OPL 产品级投影
- `opl status runtime` 顶层报告 provider-backed family runtime、provider set 与 OPL-managed session ledger；旧 Hermes diagnostics、recent sessions 镜像与 process usage 不再作为 active runtime status 字段
- `opl runtime manager`、doctor、repair、resume 等诊断和恢复入口
- Runway control-loop runtime：Temporal 是 durable execution substrate，承担 workflow history、task queue、signal/query、retry/timeout、timer 和 replay；worker supervisor / deployment substrate 只保证 worker process liveness；scheduler / cadence surface 只提供 hydrate/tick/reconcile/repair 机会；Progress Reconciler 比较 desired/current 并产生唯一下一 safe action、owner/gate wait 或 OPL runtime blocker。Runway 已落地的可执行读面是 `opl runway readiness|reconcile|handoff-gates|recovery-repair|control-loop status --json` 与对应 App projection；Temporal 未配置、service down、worker not ready 或 scheduler missing 必须读作 `provider_not_ready` / OPL repair action。handoff、human gate、provider observation 和 reconciler output 只能传递 refs、typed blocker requirement、owner answer shape 或 repair command，不得伪造 domain truth、owner receipt、quality verdict、artifact readiness、production-ready 结论或 Runway L5 long-soak closure。
- `opl agent lab` 目标控制面：统一组织 framework-level eval run、improvement candidate、acceptance evidence、owner route 和 follow-up projection；它只引用 domain-owned proof/eval/receipt/artifact locator，不产生 domain ready、quality、publication、fundability、visual 或 export verdict
- 可选 Rust `OPL native helper` 的 registry，例如 system probe、native doctor、runtime watch、artifact indexer、state indexer
- Rust helper 的 package lifecycle：`native:build`、`native:doctor`、`native:repair`、`native:test`，以及随 npm package 分发的 Cargo workspace 与 helper 脚本
- Rust helper 的 prebuild/cache lifecycle：优先消费匹配平台与 crate version 的 prebuild manifest，把 binaries 安装进 `OPL_STATE_DIR` cache；缺失或无效时回到本地 Cargo build
- 高频文件/状态索引的 contract-first catalog；workspace 扫描、session ledger 索引、artifact manifest、large JSON 校验与目录 snapshot 优先由 Rust helper 承担
- `opl index doctor|rebuild|checkpoint|integrity-check|backup --json` 是 OPL-owned SQLite sidecar index 的可执行维护面：`queue.sqlite` 继续承载 typed queue / stage attempt ledger，`lifecycle-index.sqlite` 承载 lifecycle refs / apply receipts，`artifact-index.sqlite` 与 `read-model.sqlite` 只初始化和维护 refs-only projection tables。该命令不扫描或写入 domain artifact body，不生成 owner receipt，不把 SQLite record 解释成 stage completion；标准 Foundry Agent 必须用 `contracts/state_index_kernel_adoption.json` 声明 SQLite 分工，App 只消费 OPL/App read model projection，不直接读写这些 SQLite sidecar。
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

`Family Stage Control Plane` 是 `MAS` stage 化经验上升后的 family 级 shared descriptor / discovery surface。它把程序责任限制在阶段目标、prompt / skill refs、tool affordance boundary、knowledge / evaluation refs、输入输出、handoff、receipt、projection 与 authority boundary 上，把阶段内部的专家拆解、创作、审核、工具选择、修订和诊断继续交给被选中的 Agent executor、Stage Strategy Kernel 与 domain-owned AI workflow。阶段的粒度应接近人类专家真实推进复杂工作的方式，而不是把开放式知识工作压成固定脚本节点。

Stage / route 的顶层调度语义固定为 `stage graph + owner-route hydration + reconciliation + attempt ledger + Stage Transition Authority`。`Stage` 是 OPL 可启动、可恢复、可审计的 attempt 单元；它来自 admitted stage pack，并进入 OPL queue、provider、executor 与 attempt ledger。`Route` 是 domain owner 给出的下一步、route-back、typed blocker、safe action ref 或 owner receipt ref 语义；它不是小 stage，也不被 OPL 当作可执行单元。Route Reconciler 只负责把 owner route refs hydrate 成 typed queue task、stage attempt request、conflict/blocker envelope 或 operator read model，并对照 desired route refs 与 actual attempt / provider / receipt / human-gate / dead-letter state 做 reconciliation；它不执行 stage 内策略，不生成 candidate，不评审或选择结果，不创建 owner receipt，也不声明 ready。Stage Transition Authority 进一步把 transition intent、owner answer、typed blocker、human gate 与 provider observation 作为 append-only event 输入，单点派生 Stage current pointer、StageRun terminal state 与 `current_owner_delta`。该边界必须一直保留到 domain owner receipt、typed blocker、human gate 或 route-back 明确关闭。

这个模型以 MAS publication aftercare / default-executor-dispatch 流程作为复杂 domain agent 范本：MAS 输出 `owner_route_refs`、`typed_blocker_refs`、`owner_receipt_refs`、`source_refs`、`source_fingerprint`、`dispatch_ref` 与推荐 task/stage 语义；OPL 负责 idempotency、stage graph requires/ensures、Temporal/local provider attempt、retry/dead-letter、human gate、attempt ledger 与 App/operator projection。队列 admitted、provider completed 或 route hydrated 都不能写成 MAS owner receipt、publication quality ready、artifact ready 或 stage complete。

调度表达可以借鉴成熟系统的五种模式，但不引入第二 runtime：Kubernetes controller 的 desired/status 对应 `current_owner_delta` desired 与 attempt/provider/receipt status 的 reconcile loop；Temporal 的 durable execution、event history 与 message passing 对应 OPL provider history、attempt ledger、signal/update/query 和 authority event log；event sourcing 的 append-only stream 对应 Stage Transition Authority 从不可变 event 派生 current pointer / terminal state / owner delta；OpenAI/agent handoff 的 structured delegation 对应 owner answer / handoff payload / target owner refs；Dagster 的 asset graph / op boundary 对应 dependency graph 与 callable action 边界。OPL 吸收的是图、checkpoint、message、reconciliation、append-only derivation 和 read-model 词汇；domain truth、quality verdict、artifact authority、memory body 和 owner receipt 继续留在 domain owner。

这层必须保持 AI 原生专家判断优先和 contract-light。stage descriptor 可以声明目标、输入、约束、可用工具 affordance、知识、质量门、owner、receipt 与禁止写入边界，但不能把“如何推理、如何写作、如何评审、如何选工具、如何发现新路线”写成封闭流程。工具目录是 affordance catalog，不是 workflow script：OPL 只标准化能力、权限、凭据、可写范围、side effect 风险和 forbidden authority；具体工具选择、组合、跳过、替代、顺序、并行和追问，交给 executor 在 attempt 内自主决定。Stage Strategy Kernel 的 ideal pattern 来自科学方法式认知循环：候选生成负责提出多样方案；reflection / review 负责从正确性、novelty、safety、feasibility、citation / evidence support 等角度批评和补强；ranking / selection 负责用 rubric、pairwise comparison、proximity / diversity 或 human preference 对候选排序；evolution / revision 负责基于弱点、证据、组合与发散策略产生下一版；meta-review / learning 负责从评审、失败、winner / loser pattern 和 owner feedback 中形成后续 attempt 的策略输入。OPL 依靠 AI executor 的后续能力升级获得智能体进步，合同负责让这些升级在安全、可审计、可恢复的下限边界内运行。

Stage Strategy Kernel 不是一个 OPL-owned domain truth store，也不是对 Co-Scientist、LangGraph、AutoGen、CrewAI 或其他外部系统的 runtime 依赖。外部系统的 generation / reflection / ranking / evolution / meta-review 经验只作为 pattern source 进入 OPL ideal architecture；OPL 吸收的是 stage 内认知策略组织边界、test-time compute / self-improvement 读法和独立评审纪律。每个 Foundry Agent stage pack 必须把 `prompt_refs`、`skill_refs`、`tool_refs`、`tool_affordance_boundary`、`knowledge_refs`、`rubric_refs`、`quality_gate_refs` 显式声明到 domain-owned pack / contracts 中；其中 `tool_refs` 只表示可用 affordance 及其安全边界，不规定 executor 必须如何调用。OPL 只做 refs-only admission、projection、replay、route-back 和 no-forbidden-write 约束，不读取 domain knowledge body，不保存 artifact / memory body，不签发 publication / fundability / visual / export verdict。

复杂知识交付步骤的默认建模单位是 stage，而不是函数。MAS 的 AI reviewer、publication quality review、RCA 的 visual review、MAG 的 proposal / fundability review 这类步骤需要有自己的 goal、inputs、prompt / skill refs、evaluation refs、outputs、handoff 与 receipt；authority function 只能签发最小领域 verdict、owner receipt、typed blocker 或 safe action refs，不能暗中承载完整审稿、质量评估或修订建议生成流程。

Stage progression 的 AI-first quality gate 需要独立 reviewer / gate attempt。执行 attempt 与审核 attempt 必须分开调度、分开上下文、分开 receipt；审核 attempt 只能基于显式 refs 和产物判断是否进入下一 stage。缺少独立 gate receipt、gate evidence stale、审核 attempt 与执行 attempt 相同或共享污染上下文时，`family-stage-control-plane` 与下游 projection 都应把 progression 视为 blocked / route-back，而不是 ready。

#### Stage Pack Admission 与 Trust Lanes

默认 operator / App 总入口是 `opl framework readiness --family-defaults --json`。`opl stages readiness --family-defaults --json` 是 stage-level family 聚合入口；`opl stages readiness --domain <domain>` 是单仓 drilldown。它们把 Minimal Trust Kernel admission、scope refs、expected receipt refs、proof/replay refs、assumption/monitor refs 和 evidence gap 聚成 readiness 摘要；`stages graph|proof-bundle|assumptions|cohort-loop|runtime-budget|registry|source-spec|replay-certification` 继续是 Derived Diagnostic Lenses，服务维护者 drilldown，不是普通首屏，也不是独立学习目标。Surface Budget 的机器政策由 `contracts/opl-framework/surface-budget-policy.json` 冻结；默认文档和 help 不应把这些 drilldown 命令提升成普通 operator 路径。

GraphFlow / GFL 在 active narrative 中只提供治理词汇：boundary、evidence、audit、replay、route-back。OPL 不吸收其 runtime、planner、proof assistant、workflow compiler、stage runner、executor 或 domain verdict 角色；详细参考映射只保留在 [GraphFlow / GFL contract vocabulary reference](./references/runtime-substrate/graphflow-gfl-contract-vocabulary.md)。

OPL 的 stage pack admission 应形成独立准入门：一个可启动的 stage pack 必须声明 stage id、owner、stage goal、输入/输出 refs、`requires`、`ensures`、allowed action refs、handoff、trust lane、authority boundary、launch profile 和 selected executor binding；knowledge refs、skill / prompt / evaluation refs 与 tool affordance boundary 属于推荐显式声明的 AI strategy / safety boundary refs，可提升复用、审计和 reviewer 上下文，但不构成 OPL launch hard gate。准入通过只表示这个 pack 可以进入 OPL queue / provider / executor 启动路径，不表示 domain task 已完成、artifact 已可信、memory writeback 已接受或质量 gate 已通过。

`requires` / `ensures` 是 stage 间组合的 contract 语言：下游 stage 的 `requires` 必须能由上游 `ensures`、显式 source / artifact / memory refs、human gate 决策或 owner receipt 满足；缺少匹配、证据过期、owner 冲突或 receipt 冲突时，组合必须进入 typed blocker / route-back / human gate，而不是由 OPL 猜测补齐。这个组合检查服务 admission、handoff 和 App/operator projection，不替代 domain route contract 或质量判断。

Stage pack 的 launch scope 必须能被机器读面看见：`source_scope_refs` 冻结本次启动使用的 source cohort 或 source set，`artifact_scope_refs` 冻结允许读取、产出或对账的 artifact set，`workspace_scope_refs` 冻结 workspace / runtime scope。OPL 只投影这些 refs 与计数，不拥有 source truth、artifact authority 或 workspace truth；scope 缺失、过期或冲突时应形成 blocker、human gate 或 route-back。

Stage Kernel 采用两层 trust lane：

- `verified_static_core`：stage descriptor 形状、id、owner、requires / ensures、输入输出 ref shape、allowed action refs、executor binding、authority boundary、manifest provenance 和 schema/parity check。这里可以被 OPL 静态验证或在 admission 时 fail-closed。
- `runtime_enforced_boundary`：Agent executor 输出、LLM 判断、人类批准、外部系统返回、artifact mutation、memory writeback、domain quality / publication / fundability / visual verdict、owner receipt 和 long-running provider history。这里只能通过独立 attempt、receipt、gate、typed blocker、SLO 和 no-forbidden-write proof 运行时约束，不能写成静态证明已经保证。

`guarantee_mode` 是给 scheduler / App / operator 的保证读法，不是 domain verdict。`static_admission_only` 只说明 descriptor 和组合可准入；`runtime_enforced` 表示需要运行时 receipt、event、gate 或 guard 约束；`domain_owned_judgment` 表示质量、truth、artifact 或 memory 判断回到 domain owner；`observability_only` 只说明 OPL 可以显示状态或 refs。任何 observability-only 或 domain-owned judgment projection 都不能被 App 写成 ready。

Derived Diagnostic Lenses 是从 Stage Kernel 派生的只读解释面。`family-stage-pack-registry`、`family-stage-replay-certification`、`family-stage-assumption-lifecycle`、`family-stage-cohort-loop` 与 `family-stage-runtime-budget` 可以提供 hash migration、replay/audit、assumption freshness、cohort visibility 或 runtime observability 解释；`opl stages readiness --family-defaults` 和单仓 `opl stages readiness --domain <domain>` 只把它们折叠为 warning、recommendation、typed blocker、human gate 或 route-back ref。它们不产生 domain ready、quality、artifact、owner receipt verdict，也不成为独立 runtime 目标。

Agent 选择、绑定和启动必须发生在已准入 stage pack 之上。默认 selected executor 是 `Codex CLI`；`hermes_agent`、`claude_code`、`antigravity_cli` 或其他 executor 只有在 stage pack、domain route、stage attempt handoff 或显式 runtime switch 声明后才能绑定。`stage_attempt_executor_policy` 可以声明 `executor_kind`、`model`、`reasoning_effort`、`provider`、`executor_binding_ref`、`executor_labels`、`required_capabilities` 与 `receipt_requirements`；非默认 executor 缺少 `executor_binding_ref` 时必须 fail-closed。启动包必须携带 admitted stage pack ref、selected executor、provider attempt id、workspace/runtime roots、identity / idempotency key、consumed refs、authority boundary 和 expected receipt refs；executor 完成只代表 attempt 结束，只有 domain owner receipt / gate receipt 到位才代表 stage progression 可继续。

在顶层定位上，这就是 OPL 对标 DeerFlow、LangGraph、Temporal、Dify、AutoGen、CrewAI 等 agent / workflow framework 时的核心差异：这些框架通常以 LLM 调用、agent 节点、tool call 或 workflow activity 作为原子能力；OPL family framework 以 domain stage 作为语义调度单元，以 Agent executor 作为最小执行单位。`Codex CLI` 是当前第一公民 executor，其他 executor adapter 可以接入但需显式选择并接受回执/审计约束。OPL 因此提供 durable state、queue、handoff、approval、retry、projection 和 observability，并以高价值知识工作的全自动交付为目标，但不替 domain agent 生成领域判断。

#### Stage-Native Artifact Runtime

标准 OPL Agent 的长期 artifact 读法采用 `Stage-Native Artifact Runtime`：每个可持久化 stage attempt 都应物化成外部 runtime artifact root 下的 `Stage Folder + Manifest + Receipt` 单元。OPL 的 DB、UI、App/operator projection 和状态索引只能从这些 stage folders、manifest、receipt、content hash 与 current/latest pointer 重建；它们不是第一真相源。

固定判定公式是：

```text
Stage progress = physical outputs + manifest validity + receipt authority + current pointer
```

这条规则把“人能直接看目录”和“机器能确定性推导状态”合在一起，但不允许退化成目录存在即完成。没有 owner receipt 的文件是 `orphan artifact`，不能计入完成；receipt 指向的 required output 缺失、hash 不匹配或不可读是 `broken artifact`，必须进入 repair；旧 attempt 产物如果没有被 `latest` / `current` 指针选中，只能作为历史 evidence / provenance，不能代表当前进度。

Stage attempt 的终态只允许收敛到三类：`success` 表示 required outputs、manifest 与 owner receipt 同时成立；`blocked` 表示 typed blocker 和 missing/failed evidence 已落账；`skipped` / `deferred` 表示有显式 decision receipt。RCA 这类视觉交付 agent 应把 stage 输出声明成稳定角色，而不是随意文件名，例如 source truth pack、strategy brief、storyboard/page plan、render manifest、review verdict、handoff manifest 与 canonical/export artifact refs。领域仓继续持有 visual truth、review/export verdict、artifact authority 和 owner receipt；OPL 只托管 stage folder contract、locator/index、manifest parity、repair route 与 projection。

当前 OPL runtime API 已围绕这组语义收敛：`opl stage open` 创建 attempt workspace，`opl stage commit` 校验 outputs 并写 manifest/receipt 后原子更新 latest/current，`opl stage status` 从物理目录重建 read model，`opl stage explain` 解释 done/blocked/running/stale，`opl stage rebuild` 重建 index/lineage graph，`opl stage promote` 把 stage output 提升为 canonical artifact，`opl stage gc` 按 retention policy 归档非 canonical attempt，`opl stage restore` 通过 restore proof 恢复 archived attempt，`opl stage conformance` 和 `opl stage workbench` 分别提供严格检查与 App/operator refs-only 投影。

标准 agent 结构准入也已经把该读法变成机器 gate：`opl agents conformance` 要求 domain repo 暴露 `contracts/stage_artifact_kernel_adoption.json`，声明 stage folder 单元、terminal states、stage/attempt/manifest/receipt/current/canonical/export/lineage/retention refs、physical folder truth、rebuildable projection、manifest/receipt/hash policy 和 false authority flags。这个 gate 只证明 domain pack 能被 OPL Stage Artifact Kernel 承载；它不生成 owner receipt、不读取 artifact body、不授权 domain ready、quality/export verdict 或 production ready。

对 `MAS` 来说，这一层是对既有 route contract 和 stage-led policy 的 inventory / descriptor 映射，不是替换现有 stage、改变 stage 数量或重写 controller 流程。`scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等实际 route id 继续由 MAS 持有。

边界如下：

- `family-action-graph` 继续描述 stage / action 拓扑、入口、出口、checkpoint 与 human gate。
- `family-action-catalog` 继续描述可调用 action metadata 和多 surface descriptor。
- `family-stage-control-plane` 只声明 stage descriptor、skill / prompt / evaluation refs、tool affordance boundary、handoff refs 与 authority boundary，不新建完整流程引擎或工具编排脚本。
- `family-stage-integrity-metadata` 只声明 stage-level integrity、citation-support、evidence-handoff、data-access 与 human-checkpoint metadata；这是从 academic research workflow 中吸收的通用模式，不是 MAS publication gate、MAG fundability gate、RCA visual-quality gate，也不接管任何 domain 的 direct skill path。
- `research-hypothesis-portfolio` 只声明 refs-only hypothesis candidate portfolio、assumption decomposition、novelty / provenance check、negative / failed path、ranking / proximity advisory metric 与 human review refs/status；这是从 Co-Scientist 风格 hypothesis loop 中吸收的通用投影模式，不是 domain hypothesis store、scientific truth reducer、quality gate、artifact authority 或 owner receipt signer。
- `opl stages list|inspect` 只做 discovery、inspection 与 parity，不执行 stage。
- `OPL` 只做 shared vocabulary、manifest discovery、parity、projection 与 typed queue dispatch，不执行 stage 内部专家动作。
- `MAS`、`RCA`、`MAG` 继续持有各自的写作、视觉设计、基金策略、审稿、publication / deliverable / package gate 与最终质量判断。
- `MAS` 命名统一只能在 inventory 证明逻辑层级不变、原 route contract 可追溯、truth surface 不漂移后进行。

当前参考计划是 [OPL Family stage control plane adoption plan](./references/convergence-governance/family-stage-control-plane-adoption-plan.md)。

### 5. Shell Projection Layer

外部界面仓与 ACP-compatible 壳属于这一层。当前 GUI implementation carrier 是 `opl-aion-shell`，并由 `one-person-lab-app` 作为 external checkout 消费；App repo 持有 GUI product truth、release gate、page-state contract 和 active-shell validation。Shell 通过 ACP-compatible runtime surface 消费 OPL session/runtime truth，不拥有 runtime。
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
- discovery：`opl actions` / `opl stages` / `opl agents` 只读发现与 parity；当前 OPL 已能校验 standard skeleton descriptor 并要求 artifact locator surface，MAS/MAG/RCA 均为 descriptor-level aligned，stage 与 domain-memory descriptor 也均 resolved；stage list/inspect 会投影 source/artifact/workspace scope counts 和 `guarantee_mode`，帮助 App/operator 区分静态准入、运行时约束、domain-owned judgment 与 observability-only 面。
- unified descriptor：`opl agents descriptors` / `opl agents descriptor --domain <domain>` 已把 entry、skeleton、stage、action、memory、skill、runtime/session/progress/artifact refs 聚合成统一 read model；它只携带 refs/status/parity/authority boundary，不承载 domain memory 正文或 domain verdict。
- generic substrate projection：`opl substrate projections` / `opl substrate projection --domain <domain>` 已把 domain manifest 中的 `workspace_locator`、`source_provenance`、`artifact_inventory`、`domain_memory_descriptor` refs 以及 MAS/MAG/RCA `sidecar export.opl_substrate_adapter` 的 opaque refs 聚合成 OPL-owned workspace / source / artifact / memory substrate projection。`opl substrate workbench` 在 projection 之上提供 App/operator drilldown 分组，按 domain、projection status、sidecar status 和 ref family 聚合 refs，并提供 inspect command。该 surface 只做 locator、index、lifecycle、operator projection 与 ref transport；workspace truth、source truth body、artifact body / authority、memory body / writeback accept-reject、domain truth 与 quality verdict 继续归 domain agent。
- provider execution：Temporal `StageAttemptWorkflow`、Codex / domain sidecar activity、human gate / user instruction / resume signal、stage attempt query、CLI `attempt start|query|signal`、worker lifecycle status 和 fail-closed readiness 已落地；2026-05-14 本机 managed Temporal service / worker proof 已返回 `production_residency_proven`，provider view 显示 `full_online_ready=true` / `durable_online_ready=true`。
- typed receipt / workbench：Codex stage activity 已有 dry-run / live-dry-run / `codex_cli` runner repo/test harness、typed closeout required-for-completion gate、consumed refs / memory refs / writeback receipt refs / rejected writes / route impact / next owner 投影；`opl runtime snapshot` 已输出只读 `stage_attempt_workbench`。

当前尚未闭合的是完整生产级 long domain owner chain：

- Temporal-backed provider 已证明本机 managed production residency 与当前 SLO/capability projection 可达；仍未闭合的是真实 domain owner-chain dispatch scaleout、长时 operator evidence、长时间 retry/dead-letter 观测与真实 domain soak。
- `Codex CLI` stage activity runner 已能在 repo/test harness 中启动 `codex_cli` runner、记录 stdout event summary、timeout、process output summary 和 checkpoint heartbeat；真实长时 domain activity soak、token / cost / progress 观测校准、domain sidecar live dispatch 与 owner receipt 连续 evidence 仍需继续落地。
- OPL App / GUI 已能消费 stage-attempt workbench、generic substrate projection 和 provider-level signal 传输，但仍需要真实 worker/domain 执行证明、domain/stage/blocker/memory refs 分组操作面，以及避免把 provider completion 或 substrate refs 写成 domain ready verdict 的持续 UI 验收。
- MAS real paper line 已有 read-only closeout projection，并通过 provider-hosted task-bound bridge 产出 typed blocker / no-forbidden-write proof；MAG/RCA 已有 live task-bound sidecar receipt / no-regression evidence ingestion。仍需证明真实 MAS owner guarded-apply chain 推动论文前进，以及 grant / visual long soak 到最终交付。

所以，OPL 现在可以被描述为 `stage-led family framework control plane, Codex CLI first-class executor, explicit optional executor adapters, Temporal production residency proof, provider-hosted task-bound bridge, Codex runner repo/test harness, typed closeout gate, and domain skeleton discovery / validation landed`。它的目标是完整智能体运行框架和高价值知识工作全自动交付，但当前不能描述为 `long-running domain-owner production chain fully closed`；当前 standard skeleton 家族对齐已在 MAS/MAG/RCA 三仓达到 descriptor-level aligned，仍不能写成三仓 physical skeleton layout 已完成。

## 默认执行策略

- 第一公民执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Family runtime provider` 当前是 Full OPL online family runtime 的 readiness 对象；Temporal-backed provider 是 production online runtime 的必需 substrate。`hermes_agent`、`claude_code` 与 `antigravity_cli` 是显式非默认 Agent executor adapter/backend，不替代 Codex CLI 默认执行语义，也不承诺行为、质量、工具语义或 resume 等价；旧 Hermes provider / Gateway proof 语料只按历史、诊断、fixture 或负向 guard 阅读

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按 `OPL Framework -> One Person Lab App -> Foundry Agents` 三层产品认知组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdoor` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
