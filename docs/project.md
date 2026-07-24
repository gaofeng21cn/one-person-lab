# OPL 项目概览

Owner: `One Person Lab`
Purpose: `project`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 项目是什么

对外公开时，`One Person Lab` (`OPL`) 同时包含三个清晰层次：`OPL Framework`、`One Person Lab App` 和 `Foundry Agents`。其中 `OPL Framework` 是面向高价值知识工作的完整智能体开发与运行框架。它给先进 AI executor 搭台：大型任务按接近人类专家实施的 stage 推进，stage 内最小执行单位是 Agent executor，当前默认且第一公民 executor 是 `Codex CLI`。
OPL 当前读法固定为 `AI-first / executor-first / Codex-first`。智能体进步主要来自 `Codex CLI` 等 AI executor 能力升级，以及 domain stage pack、prompt、skill、knowledge、rubric 与 quality gate 的改进。OPL 不限制 AI executor 的内部规划、创作、评审、路线判断或修订策略，也不把开放式专家工作写成固定脚本；它只守 owner boundary、权限、安全、审计、receipt、typed blocker、恢复、route-back 和 projection 这些可验证下限。
这组读法由 [硬约束](./invariants.md) 中的 OPL 内部 8 项原则冻结。provider proof、descriptor ready、generated surface ready、cleanup proof 或 tail ledger 只能作为证据和阻塞定位，不能替代 domain-owned quality / artifact / production verdict，也不能写成 OPL/domain/artifact/production ready。
OPL Framework 可以使用外部运行时 provider，但框架边界由本仓持有：`Codex-default session runtime`、显式 `domain-agent activation` 层、provider-backed family runtime control plane，以及 One Person Lab App / 其他 shell 背后的 shared projection/contract 层。
当前仓库跟踪：

- `opl` / `opl exec` / `opl resume` 这组 CLI / shell 前门
- Codex-default session/runtime 路径
- domain-agent activation / dispatch 规格
- stage descriptor、stage pack admission、requires / ensures composition、domain memory locator、handoff envelope、receipt、projection、trust lane 与 authority boundary 这组 family-level stage control 语言
- `OPL Runtime Manager` 产品控制面：把 family runtime provider 纳入 OPL 产品级 profile、stage-attempt request/projection、domain dispatch、任务注册、诊断和状态投影；Temporal-backed provider 是 OPL production online runtime 的必需 substrate，`hermes_agent`、`claude_code` 与 `antigravity_cli` 一样作为显式非默认 executor adapter/backend 保留，stage-level executor policy 可声明 `executor_kind`、`model`、`reasoning_effort`、`provider` 与 `executor_binding_ref`，`local_sqlite` 只作为已退役 provider 词汇和负向 guard，SQLite sidecar 只服务 projection/readback index，旧 Hermes provider/Gateway 语料只作为 legacy/proof/provenance/diagnostic/negative-guard 读取
- 智能体运行外围能力：stage attempt ledger、provider-backed attempt transport、checkpoint/closeout/receipt、artifact index、file lifecycle、retention、restore proof、migration ledger、workspace lifecycle、human gate / resume token 和 operator projection
- 统一 `domain-agent skeleton` 与 repo-source 边界：domain 仓按 `agent/`、`contracts/`、`runtime/authority_functions/`、`src/` 或 `packages/`、`docs/` 暴露 stage、prompt、Skill、domain-owned knowledge/memory locator、quality gate、最小 authority function、sidecar、receipt schema、projection builder 和 artifact locator contract；真实 workspace state、runtime artifact body、receipt 实例和交付物实例必须落在外部 workspace / runtime artifact root，不落在开发仓源码目录
- 执行引擎与模块注册表
- 工作空间、会话、进度、交付物等接口面
- 跨仓共享的模块、机器可读合同与可发现索引
- One Person Lab App / OPL-branded AionUI GUI/WebUI 使用的 runtime/release surface

当前 repo 分工固定为：`one-person-lab` 是 OPL Framework / runtime / CLI / contracts owner，不持有 GUI shell implementation；`one-person-lab-app` 是 GUI product truth、release、updater、用户教程、页面状态、active-shell validation 和 GUI candidate policy owner；`opl-aion-shell` 是当前 OPL-branded AionUI shell implementation carrier，负责实现 App-owned GUI contract；`opl-native-workbench` 是 App-owned foreground alternative GUI candidate；Hermes Desktop / `hermes-codex` 是 retained explicit reference candidate；`opl-agui-codex-shell` / `agui-codex` 只作为 AG-UI/CopilotKit archived technical proof 与显式 replay surface 保留。MAS/MAG/RCA/Book Forge 等 domain repos 是 domain app/runtime authority，持有自己的 stage 语义、prompt、skill、领域逻辑、质量 gate、truth reducer、运行规则、交付物真相、owner receipt 和 direct skill 入口。

MAS 的论文推进 SSOT 不在 OPL 仓维护。当前 MAS paper-facing 默认入口是 MAS 仓的 `PaperMissionRun`、`paper-mission inspect|start|resume|consume-candidate`、product-entry / domain-handler `paper_mission/start_or_resume` 和 `artifact_first_mission_summary.paper_mission_run`。OPL 只持有承载这些 refs 的 Framework runtime、Runway StageRun、stage-attempt projection、attempt ledger、`current_owner_delta` 和 App/workbench projection；不能在 OPL 侧重建 paper mission 状态、签 MAS owner receipt、创建 MAS typed blocker、授权 publication / artifact / current package verdict，或把 provider completion / read-model clean 写成 MAS paper progress。

One Person Lab App 继续放在独立的界面仓中维护，作为普通用户使用 OPL Framework 与 Foundry Agents 的工作台产品。Framework 侧把普通用户 App 目标形态读作 `Codex App wrapper`：固定使用 `Codex CLI` 作为 concrete executor，内置 MAS/MAG/RCA 及后续 Foundry Agent 的任务入口，不把 AionUI 原生多 backend、多 Agent 选择或 executor 切换暴露成普通用户产品面。

## 品牌模块目标

`OPL Framework` 的内部能力长期按当前十个品牌模块组织：`OPL Charter`、`OPL Atlas`、`OPL Workspace`、`OPL Pack`、`OPL Stagecraft`、`OPL Runway`、`OPL Ledger`、`OPL Console`、`OPL Foundry Kernel` 和 `OPL Connect`。这组模块是顶层 taxonomy、owner boundary、源码物理组织和成熟度管理语言，不替代 `OPL Framework -> One Person Lab App -> Foundry Agents` 的当前必要产品面，也不把 reference 文档写成机器真相。当前用户工作面是 App desktop + Docker/WebUI；`OPL Cloud`、在线/managed Workspace 和 Gateway 是长期、条件启用的用户可见产品包装，只有真实 account、storage、isolation、backend 与 owner policy 齐备时才出现。它们不是第 11 个 Framework 源码模块；条件产品可以组合多个模块形成能力，Framework 实现仍按十个模块归位，不按产品包装重新划分源码 owner。

品牌模块目标态的详细设计留在 [OPL 品牌模块理想态](./references/brand-modules/README.md)。核心文档只承载当前项目意识：新增 capability、CLI/App surface、contract、read model、release/install path 或 docs support 时，必须能归到某个品牌模块，并保持 domain truth、artifact authority、quality verdict、owner receipt、typed blocker 和 App release truth 的原 owner 不变。模块数量不是冻结约束；新的 bounded context 只有在 owner、purpose、machine boundary、authority false flags 和 L4/L5 口径清楚时才进入 taxonomy。

源码组织也以这十个模块为终局：`src/modules/<module_id>/` 是 OPL Framework 模块代码的真实物理目录和默认入口。`contracts/opl-framework/source-module-map.json` 记录并校验模块归属；它不是 `src/modules/` 的替代组织。`entrypoints/`、`kernel/` 这类目录只是 CLI / adapter / shared runtime 的非品牌技术层，必须服务对应模块的 public index，不与十大模块争夺 brand owner。新代码进入 owning module，跨模块依赖从 owning module 的 `index.ts` 或 `src/modules/index.ts` public exports 走；root-level `src/*.ts` 不再作为新入口或扩展点。

当前 runtime / product / policy 入口的归位方式固定为：`OPL Workspace` 提供 Framework workspace protocol、Project / Stage Artifact Unit 和用户检查根，不等同在线 `OPL Workspace` 产品体验；`OPL Stagecraft` 提供 stage pack、declared stage context、Stage Attempt Runtime 和 capability use policy，语义 route 由 Codex CLI 选择；`OPL Runway` 提供 Temporal-backed provider、stage-attempt projection、lease、retry/dead-letter 和 worker lifecycle；`OPL Atlas` 提供 route graph、decision map、workspace/resource index、capability / tool-card catalog 与 cross-agent topology telemetry；`OPL Ledger` 提供 refs-only evidence、receipt、trace、replay、long-soak、cleanup 和 no-regression telemetry，不保存 artifact body 或 domain verdict；OpenScience-style artifact graph / claim warning / project-local ledger pointer / annotation regeneration / native viewer watch 模式也只进入 Ledger 的 refs-only substrate provenance surface，不引入 OpenScience runtime、Electron、MCP、AGPL code、第二 artifact authority 或第二 skill catalog；`OPL Console` 提供 App/operator owner-delta-first cockpit、invocation-plan projection、治理和 action boundary，不是 Connect 私有后端；`OPL Foundry Kernel` 提供候选物化、评测、`EvidenceBundle`、版本、canary、activation 与 rollback control plane，并通过 OMA `engineer-agent` 获取 blueprint / eval / evolution semantics；`OPL Connect` 提供可独立调用的 source connector、managed modules、skills、plugin metadata、MCP/OpenAI/AI SDK descriptors 和 domain discovery；`OPL Charter` 冻结 owner split、surface budget 和 forbidden claims。

2026-06-10 后，当前十模块共同承载 family-level Foundry Agent OS pattern：`OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry`。Agent Tool Arsenal / Capability Invocation OS 不新增第 11 个品牌模块；它归入 `OPL Pack` 的 capability invocation ABI / ToolResultEnvelope 边界，由 `OPL Atlas` 负责 capability 与 tool-card catalog，`OPL Stagecraft` 负责 capability use policy 与 tool affordance boundary，`OPL Console` 负责 `current_owner_delta` 默认读根和 invocation-plan projection，`OPL Connect` 负责 MCP / OpenAI / AI SDK / Skill descriptor 分发，`OPL Runway` 和 `OPL Ledger` 分别负责 durable execution 与 refs-only evidence。Capability Registry 和 Tool Arsenal 都不执行 capability，不生成 owner receipt、typed blocker 或 domain verdict。

`Evidence-Grounded Decision Agent Profile` 也按这组协同边界读取：它是标准 Foundry Agent 的横切 decision-support profile，不是医学、血液病或任何单一领域 agent，也不新增第 11 个品牌模块。通用 flow 是 `material/case intake -> structured extraction -> enrichment -> mode routing -> evidence/tool execution -> synthesis -> independent review/human gate -> decision-support artifact + evidence trace`。OPL 只固定 stage pack、tool affordance、runtime attempt、refs-only evidence、Console projection、connector boundary、agent improvement 和 forbidden-claim 这些 framework 下限；domain truth、最终决策、质量裁决、artifact authority、owner receipt、typed blocker 和 human gate 仍由对应 domain / App / human owner 持有。

这组归位只帮助维护入口变薄。它不创造新的 runtime owner、product truth、domain truth、artifact authority、quality verdict、owner receipt 或 production maturity 证明；当前活跃差距和执行顺序仍以 [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md) 为准。

## 当前产品层级

`OPL` 当前对外使用三层结构组织产品认知：Framework、当前 App desktop + Docker/WebUI 工作面、Foundry Agents。公开材料可以保留 `OPL Cloud` 长期路线，但在线 Workspace、Console/Gateway 和托管运行体验只在真实 account、storage、isolation、backend 与 owner policy 齐备时条件启用；它们不是当前必要产品面，也不持有 Framework 源码 owner、domain truth、receipt 或 release verdict。

安装、管理和更新也只使用三层用户对象：`OPL Base` 是可独立使用的 Framework runtime，`OPL App` 是可替换 GUI/部署载体，`OPL Package` 是可自由组合的安装单元。Skill、Tool、Plugin、MCP、workflow 和 entrypoint 是 Package 可发现 capability，不是平行生命周期。Package identity、carrier 与 executor route 相互独立：每个 owner 在独立 GHCR repository 发布完整 Package runtime 和自己的 `latest-stable`；Base 只提供薄 OCI/native-carrier adapter 与 fresh installed 聚合；Codex Plugin Manager 只管理 Codex plugin/config/cache 投影；executor adapter 只投影 route callability。Framework 不自建跨包 resolver、lock、payload、LKG、receipt 或固定 registry，共享 manifest 只服务 Full/offline/integration/QA 快照。该目标当前为 `planned`，现有 `opl packages` 仅作迁移期 compatibility，详见 [`OPL Package 平台组合迁移计划`](./active/opl-package-platform-composition-migration.md)。

1. `OPL Framework`
   开发者和技术操作者使用的智能体开发与运行框架。它持有 CLI、Codex-default session runtime、activation layer、stage control plane、provider-backed stage-attempt transport、shared contracts/indexes、Connect 模块发现、skill sync、恢复和审计 surface。独立 OPL-compatible agent 在运行前通过 `opl framework locate` / `opl_framework_locator` 找到外部 OPL Framework 依赖环境；Agent 不内嵌 OPL runtime，App 也不是必需入口。
2. `One Person Lab App`
   普通用户使用的工作台产品。它消费 OPL Framework 的 runtime/activation truth，把通用工作和 Foundry Agents 呈现为可直接使用的桌面体验；它持有 GUI product truth、GUI runtime bridge 产品合同、page-state policy、release gate、updater metadata、用户文档和 active shell validation，不持有 domain truth，也不复制 runtime/provider 实现。普通用户在 App 中选择任务或 Foundry Agent 入口，而不是选择 AionUI backend、通用 Agent host 或非默认 executor adapter。
3. `Foundry Agents`
   MAS/MAG/RCA/Book Forge 以及后续 Patent/Award/Thesis/Review 等基于 OPL Framework 开发的领域智能体。它们以 OPL-compatible package / repo 暴露 descriptor、skill、stage、quality gate、artifact locator 和 projection，可被 App 托管运行，也保留 direct Codex/app-skill 入口。OPL Meta Agent 是 Agent Foundry 的 semantic provider，只通过 `engineer-agent` 把创建、接管和改进请求转成 `AgentBlueprint`、`EvalSpec` 与 `EvolutionProposal`；它不执行评测、物化或版本生命周期，也不持有领域真相或交付物权威。

其中 `OPL Runtime Manager` 位于默认运行时层与显式激活层之间。它是产品级管理/投影层，不是新的 domain runtime kernel：具体 executor 由 OPL / domain route 显式选择，当前第一公民 executor 是 `Codex CLI`；Temporal-backed provider 的目标职责是 durable workflow、activity retry/timeout、signal/query、history 与恢复，SQLite sidecar 只承担可重建 projection/readback index。

`hermes_agent`、`claude_code` 与 `antigravity_cli` 只作为显式非默认 Agent executor adapter/backend 接入，必须提供独立 receipt、audit、executor binding ref 和 fail-closed 语义；其中 `hermes_agent` 额外要求 full agent loop / tool event proof，`antigravity_cli` 只作为类似 RCA HTML route + Gemini model/reasoning selection 的 stage-level experimental adapter 示例。`OPL Runtime Manager` 负责把 provider profile、stage-attempt request/projection、domain task registration、诊断、恢复入口、可选 native helper 与高频状态索引统一投影进 `sessions / progress / artifacts / attention queue`。

## 项目目标

- 把 `OPL Framework` 建成完整的 stage-led 智能体开发与运行框架，支撑高价值知识工作的全自动交付
- 让大型任务按接近人类专家的阶段推进：界定目标、准备材料、执行、审核、修订、交付收口，并把每个阶段变成可恢复、可审计、可追踪的工作单元
- 把 Agent executor 固定为阶段内最小执行单位；`Codex CLI` 是当前默认且第一公民 executor，其他 executor adapter 只在显式选择后接入并接受回执/审计约束
- 坚持 AI-first、AI 原生专家判断优先、contract-light：通过 AI executor 升级、domain stage pack、prompt、skill、knowledge 与 quality gate 迭代获得智能提升；合同只固定边界、权限、安全、审计、receipt、恢复和 projection 下限，不规定 AI executor 的内部策略，也不让 readiness / scorecard / checklist 替代 domain-owned quality gate
- 把外部流程验证论文中值得吸收的模式收敛成 OPL 自有 stage pack 准入规则：静态准入只验证 descriptor core、requires / ensures 组合、trust lane 和 authority boundary；运行时边界继续由 provider、executor、human gate、domain receipt 与 fail-closed blocker 约束，不引入 GraphFlow / GFL runtime dependency
- 给 `opl`、`opl exec`、`opl resume`、直接 `Codex` 使用和外部壳提供稳定一致的 Codex-default session/runtime 合同
- 把品牌模块作为 OPL Framework 长期设计语言和成熟度推进模型：以 `OPL Workspace` 的 `L4 executable baseline` 作为当前可执行基线，推动 `Charter / Atlas / Pack / Stagecraft / Runway / Ledger / Console / Foundry Kernel / Connect` 分别补齐品牌边界、合同、CLI/App 入口、验证、真实用户路径和 owner evidence，最终达到 `L5 production operating maturity`
- 冻结 `OPL Runtime Manager` 的产品控制面合同，让 OPL 能管理 provider-backed family runtime，而不复制一套 domain scheduler/session/memory kernel
- 把 MAS 已验证的 SQLite / file lifecycle / restore proof / retention / artifact index 经验上收成 OPL framework primitives，并让 MAG/RCA 等 domain agent 可复用
- 用 OPL Meta Agent 的 `engineer-agent` 统一承接新 Agent 的创建、接管和改进语义，产出 `AgentBlueprint` / `EvalSpec` 或基于 `EvidenceBundle` 的 `EvolutionProposal`；由 Foundry Kernel 执行标准骨架物化、评测、版本、canary、activation 和 rollback，并让目标 owner 持有保护测试、最终验收、权限授权和生产采用；MAS/MAG/RCA/Book Forge 的业务内部继续允许保持领域差异
- 让 `opl install` 只负责 OPL Base：Codex + Temporal-backed family runtime provider + native helpers；`--with-app` 只增加桌面 App。Agent/capability/workflow Packages 由显式 Package lifecycle 或 App 首装 Official Profile 负责；`--no-online-runtime` 只用于开发/离线 degraded diagnostics，不能通过 Full online readiness
- 以 contract-first 方式规划 `OPL native helper` 与高频文件/状态索引：只做系统探测、artifact discovery、状态投影加速，不替代 domain-owned durable truth
- 把 domain app 以可同步的 skill pack 与稳定 contract 接入统一 activation layer
- 统一管理执行引擎、模块、工作空间、会话、进度与交付物
- 维护 family-level shared modules、shared contracts 与 shared indexes
- 让 One Person Lab App 作为用户可见工作台，复用同一套 runtime/activation truth
- 明确 `OPL Framework`、One Person Lab App 与各个独立 `domain agent` / `Foundry Agent` 仓的边界
- 保持公开文档、machine-readable contracts 与已收录领域状态一致
- 同步 OPL 内部 8 项原则：真相归主、抓大放小、目标先于路径、AI-first / contract-light、阶段交付、单源派生、结构收敛和证据匹配风险；其中 `verified_static_core` 与 `runtime_enforced_boundary` 分层仍是合同下限，未闭合边界必须返回 typed blocker、human gate、receipt conflict 或 route-back ref

## 作用边界

- `OPL` 负责 Codex-default session/runtime、activation layer、release distribution surface，以及 shared modules / contracts / indexes
- `OPL` 负责把 domain stage 表达成可发现、可恢复、可审计的 family-level work unit；stage 内部的专家拆解、创作、审核、修订和最终质量判断由 domain agent 与被选中的 Agent executor 执行，当前第一公民 executor 是 `Codex CLI`
- `OPL` 负责把合同保持为轻量下限：它声明 owner、权限、safe action、receipt、blocker、audit、recovery 和 projection，不检查或规定 stage 内的开放式 AI 内部策略，也不把合同完整性解释为质量裁决
- `OPL` 负责在启动 stage 前完成 stage pack admission：检查 stage id、owner、输入/输出 refs、`requires`、`ensures`、knowledge refs、skill / prompt / evaluation refs、tool affordance boundary、trust lane、authority boundary、launch profile 和 selected executor binding 是否自洽。该准入只证明 stage pack 可以被 OPL 调度，不证明 domain 工作已完成或质量已达标，也不规定 executor 必须如何选择或编排工具。
- `OPL` 负责把可静态验证的 stage descriptor core 与必须运行时约束的边界分开：descriptor、组合关系、allowed refs 和 executor binding 属于 verified static core；AI 判断、人类批准、外部系统结果、artifact mutation、memory writeback 和 domain verdict 属于 runtime-enforced boundary。
- `OPL` 负责发现和投影 domain-owned memory locator、stage `knowledge_refs` 与 writeback receipt refs；memory 正文、写回接受/拒绝、route 判断、quality verdict 和 artifact authority 继续由 domain agent 持有
- `OPL` 负责智能体运行外围：attempt、provider-backed transport、checkpoint、receipt、artifact index、file lifecycle、retention、restore proof、workspace lifecycle、human gate 和 operator projection
- `OPL` 负责定义并验证 standard domain-agent skeleton；domain repo 负责把自身 stage、prompt、Skill、tool affordance boundary、knowledge、quality gate、domain truth authority refs、workspace / source / artifact locator contract 和 authority function 映射到这个 skeleton。developer checkout 只保存 locator、index、schema、receipt refs、restore / retention policy 和可审查 fixture，不保存运行生成物或 workspace state body
- `OPL Runtime Manager` 负责 family runtime provider provisioning、profile wiring、stage-attempt request/projection、task registration hydration、diagnostics、status projection、native helper catalog 与 state index catalog
- `OPL Runtime Manager` 不拥有 domain truth、domain quality authority、artifact gate、publication/package gate 或 concrete executor
- Full OPL family readiness 要求 Temporal-backed family runtime provider 已配置且 ready。Temporal 不是可选候选，而是生产在线 runtime 的必需 substrate；Hermes gateway readiness 只作为历史 / 诊断 / 负向 guard 语境出现。
- `hermes_agent` executor adapter 不提供 provider readiness，`local_sqlite` 只代表 retired-provider negative guard；SQLite sidecar 只代表 projection/readback index
- `OPL` 的默认具体 executor 仍是 `Codex CLI`
- `Hermes-Agent` 不再是新的目标默认 session/wakeup substrate；`hermes_agent` 保留为显式非默认 Agent executor adapter，当前只保证可接入、可回执、可审计、可 fail-closed，不保证行为、质量、工具语义或 resume 与 `Codex CLI` 等价
- family runtime provider 缺失或未 ready 表示 Full OPL readiness degraded；本地 CLI/status/manifest 可以继续报告诊断，但完整在线能力未通过
- `OPL` 不持有领域运行时所有权
- `OPL` 不替代各个领域仓的智能体逻辑
- 外部界面仓负责 One Person Lab App 外壳；当前仓库只跟踪 framework runtime、release discovery/consumer surface 与接口真相。`one-person-lab-app` 持有 GUI product truth、release gate、页面状态、active-shell validation 和 GUI candidate policy；当前主线 `opl-aion-shell` 是 replaceable GUI shell implementation carrier，`opl-native-workbench` 是 foreground alternative，Hermes Desktop / `hermes-codex` 是 retained explicit reference candidate，`opl-agui-codex-shell` / `agui-codex` 只作为 archived technical proof explicit replay surface
- 普通用户 App 面必须保持 `Codex CLI` 固定执行器和内置 Foundry Agent 入口语义；非默认 executor adapter 只能由显式 stage / request / developer-operator diagnostic 绑定进入，不得成为 App 普通产品选择器或 shell-owned truth
- `Med Auto Science`、`Med Auto Grant`、`RedCube AI`、`OPL Book Forge` 等仓继续是独立 `domain agent`
- 这些 `domain agent` 通过本地 CLI、程序/脚本与 repo-tracked contract 暴露稳定 capability surface；它们既可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用，工作逻辑保持一致
- `MAS`、`MAG`、`RCA` 可以作为运行在 OPL Framework 上的 Foundry Agents 被托管、唤醒和投影，但不是 OPL 内部模块；direct Codex app skill 调用仍是一等入口
- `harness / controller` 继续作为各 domain 仓内部的边界层语言存在，但不再是顶层公开主语
- `frontdoor`、gateway-first、federation-first、Hermes-first 和旧 Product API 计划只在 history、compatibility、diagnostic 或 superseded reference 语境中出现；active docs 不把这些路线写成当前产品入口或目标 topology

## 默认入口

建议阅读顺序：

1. `README.md`
2. `docs/README.md`
3. `docs/status.md`
4. `docs/project.md`
5. `docs/architecture.md`
6. `docs/invariants.md`
7. `contracts/README.md`

## 核心公开面

- 顶层叙事：`README*`、`docs/README*` 与 `docs/public/`
- 当前接口与合同入口：`contracts/README.md`、`docs/product/opl-public-surface-index.md`、`docs/active/` 与 `docs/specs/` 下仍生效的 runtime / product-boundary 规格
- 旧 gateway-first 语料：人读材料已经进入 `docs/history/compatibility/gateway-federation/`；活跃机器可读合同只保留当前 stage-led framework、runtime 与 domain-agent catalog surface
- 参考与历史：`docs/references/`、`docs/history/` 与 `docs/docs_portfolio_consolidation.md`
