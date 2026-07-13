# OPL 系列项目开发主参考

Owner: `One Person Lab`
Purpose: `family_development_reference`
State: `active_support`
Machine boundary: 本文是人读开发参考。机器可读真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。

## 结论

OPL 系列项目的理想态、差距和完善计划按两层维护：

1. `OPL` 仓维护全局目标、全局差距、上收边界、shared primitives、One Person Lab App/workbench 目标、domain admission 与跨仓开发顺序。
2. `MAS`、`MAG`、`RCA` 与后续 domain repo 维护本仓目标、当前差距、领域 authority、direct path、OPL-hosted path、domain handler / opaque ref projection / receipt 边界，以及本仓哪些通用外围应上收到 OPL。

这份文档是 OPL 系列项目开发的总读法。它不替代各仓的当前状态、机器合同、运行证据或单仓计划；它只固定“计划放在哪里、谁负责什么、哪些内容上收、过时面如何处理、docs 目录如何按角色对齐”。

## 目标态优先原则

OPL family 的最高优先级是目标架构，而不是迁就当前实现分布。理想形态是：`OPL Framework` 成为完整的智能体开发、运行、托管、恢复、状态、记忆、文件生命周期、审计、评估和工作台框架；`MAS`、`MAG`、`RCA` 以及后续 domain repo 都是标准化 OPL Agent。现有 MAS/MAG/RCA 里已经实现的 scheduler、runner、session store、SQLite lifecycle、workspace/source intake、memory transport、artifact lifecycle、workbench、CLI/MCP/product-entry/sidecar/status wrapper 等私有功能面，只能作为迁移输入和重构清单，不能反过来定义理想态。

文档的基本方法是先设置理想态，再找差距。差距不是为了替现状找妥协理由，而是为了明确哪些现状必须被上收、重构、收薄、删除或归档。为了理想态，可以革命式替换旧结构，不限于渐进式修补；旧东西只要不属于目标形态，就不应以兼容性为理由继续污染 active surface。改革只服务于能直达理想态的路径；不能直达时，优先重构、替换、删除或归档。

标准 OPL Agent 的默认形态是 `Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`。domain repo 默认提交 declared stage set、prompt/skill/knowledge refs、policy table、domain schema、非权威 route context、artifact/source/memory policy、receipt schema、fixtures、tests 和必要的 authority function；CLI、MCP、Skill/product-entry metadata、sidecar、status/read model、workbench、queue、attempt ledger、runtime lifecycle、operator projection 和 App drilldown默认由 OPL Framework / One Person Lab App 生成、托管或提供通用 primitive。Codex CLI 独占 stage 语义路由。

所有新增开发都必须遵循 AI-first、AI 原生专家判断优先、contract-light。智能体能力提升优先来自 `Codex CLI` 等 AI executor、stage pack、prompt、skill、knowledge、rubric 和 quality gate 的迭代；合同只固定 owner boundary、权限、安全、receipt、audit、blocker、recovery、projection 和 fail-closed 条件这些下限。不得把开放式规划、写作、评审、路线判断、诊断或修订逻辑塞进 OPL 机械规则、固定评分器、脚本后处理或越来越厚的 contract，也不得把 contract completeness 当成专家判断上限。

真实语义必须归位到 `agent/` pack，而不是散落在 `src/`、`packages/`、旧 wrapper 或只有目录骨架的空 scaffold 里。标准 agent repo 的 `contracts/pack_compiler_input.json` 必须声明 canonical agent id、domain id、canonical `agent/` pack root 和 `required_domain_pack_paths`；`agent/stages/manifest.json` 的每个 stage 必须引用真实 `agent/prompts/*`、`agent/skills/*` 或明确 skill id、`agent/knowledge/*` 与 `agent/quality_gates/*`。OPL Pack 从该 manifest 生成 `family_stage_control_plane`，不读取或回退到 repo-tracked `contracts/stage_control_plane.json`。所有 required path 必须存在、非空、位于 repo 内并承载对应 domain 语义。`opl agents scaffold --validate <repo>` 是这一层的机器守门；空 `agents/`、只有 README 的目录、只靠 `src/` / `packages/` 承载领域语义、或 stage 缺 prompt/skill/knowledge/evaluation refs 都不能写成标准 OPL Agent。

物理源码形态也必须标准化。descriptor ready、generated interface ready、private functional audit closed 或 `functional_structure_gap_count=0` 只能证明“owner / handoff / contract 分类”正确；它不能自动证明源码已经像标准 OPL Agent 一样物理归位。标准 repo 的源码应该按长期角色分层：

- `agent/`：只承载 declarative domain pack，包括 stages、prompts、skills、knowledge、quality gates、policies 和 stage handoff policy。
- `contracts/`：只承载 machine-readable descriptor、pack compiler input、stage/action/memory/artifact/receipt contracts、generated handoff、evidence request 和 cleanup gate。
- `runtime/authority_functions/` 或等价 domain module：只承载无法声明化的最小 authority functions、native helper implementation、fixtures 和 receipt signer；输入输出必须是 refs、receipt、typed blocker 或 safe action metadata。
- `src/` / `packages/`：只能保留 direct domain handler、authority implementation、native helper、schema/contract helpers、fixtures 或 tests；不能继续放 repo-owned generic scheduler、queue、attempt ledger、state-machine runner、session store、SQLite lifecycle engine、operator workbench、generic product wrapper 或 default runtime owner。
- `docs/`：承载目标态、当前状态、差距、history/tombstone 和 provenance；不得作为机器接口或 stage semantic substitute。

文件名和目录名也是结构信号。`supervisor`、`scheduler`、`runtime manager`、`managed run`、`session store`、`workbench`、`gateway`、`frontdoor`、`local manager` 等词如果仍出现在 active source 中，必须能被当前合同解释为 domain handler、refs-only adapter、authority function、diagnostic 或 history/tombstone；否则就是功能/结构差距。尤其是 MAS 这类历史上存在 supervisor / runtime transport / SQLite sidecar 的仓，不能因为 handoff 投影已经正确就写成物理形态完成；仍需继续做 rename、split、delete、archive 或 tombstone，直到源码读者一眼能看出 generic runtime owner 在 OPL。

成熟 agent/runtime 项目的共同经验支持这条分层，而不是要求 OPL 引入它们作为依赖。OpenAI Agents SDK 把 agent 定义为 instructions、tools、handoffs、guardrails、sessions 等组合，并把 `Agent` 与 `Runner` 的 orchestration 责任分开；LangGraph 把 graph state persistence 拆成 checkpointer、thread、store 和 replay；AutoGen 把 agents、teams、tools/workbench 与 state/termination 分层；CrewAI 推荐用 YAML/config 声明 agent role/goal/tools，再由 crew/process 承载协作流程。OPL 吸收的是“声明、工具/authority、运行编排、持久化、工作台、证据门分离”的工程经验，不把这些框架写成 OPL provider、executor 或 domain authority。相关外部框架只作为参考资料，不作为本文的机器 truth source。

OPL 是知识工程驱动的智能体开发运行框架。标准 OPL Agent 必须把复杂工作先拆成 stage，并为每个 stage 明确：

- `prompt`：执行、修订、handoff、review/audit 所需提示词。
- `tools`：OPL 通用工具、domain skill、必要私有功能和 native helper；私有功能例如 MAS 绘图 / 统计 / artifact materialization helper，只能作为 stage 工具或 authority function 暴露，不能替代 stage。
- `knowledge`：领域知识、source refs、memory refs、经验卡、rubric、policy、fixture 和 prior receipt refs。
- `quality gate`：什么算本 stage 做好，谁有权放行进入下一 stage，输出什么 review/audit receipt、typed blocker 或 route-back。
- `user_stage_log`：对用户说明“问题是什么、这个 stage 要做什么、实际对 domain deliverable 做了什么、结果、耗时、token/费用”。OPL 提供 `stage_progress_log` 容器、时间/usage/refs 和 missing/null 状态；`duration` 可用 provider 或 attempt wall-clock 做用户可读 fallback，token/cost 没有真实 telemetry 时必须保持 missing/null。domain agent 必须提供 `stage_work_done` / `changed_stage_surfaces` 等人话语义。MAS/MAG/RCA/OMA 都应用同一通用字段描述 paper / grant / visual / agent deliverable 改动；完全缺失时暴露 `missing_domain_semantic_summary`，摘要不完整时暴露 `missing_domain_fields`。

涉及创作、评估、评审、路线判断、fundability、publication readiness、visual direction、review/export verdict、memory accept/reject 或 artifact mutation authorization 的工作必须 AI-first。程序可以校验 schema、物化 artifact、签 receipt、阻止越权、投影 refs；不能把函数返回值、scorecard、regex、截图机械检查、schema completeness、controller route、provider completion 或脚本退出码升级为 ready verdict。Stage 执行 AI 与 Stage 质控 AI 必须是两个独立智能体任务；它们可以都用 `Codex CLI`，但必须独立 invocation、独立上下文、独立 task record 和独立 receipt，缺少独立 gate receipt 时 fail closed。

私有平台 residue 是例外，不是默认。stage 定义、domain policy、quality/export verdict、artifact authority、memory accept/reject 和 owner receipt signer 这类内容如果走标准 pack 或 OPL authority function ABI，就属于标准智能体自定义点，不应被审计成污染面。只有 repo-local 通用运行平台、状态机、持久化、调度、展示、transport、lifecycle 或 observability 这类 residue，才必须写清 `cannot_absorb_reason`、接口输入输出、返回 receipt/blocker/ref 的形态、active caller、no-forbidden-write 证据、direct/hosted 语义边界和后续复审/退役门。缺少这些证据时，文档和计划应把它写成功能/结构差距，而不是写成合理保留项。

`contracts/opl-framework/private-platform-residue-owner-decisions.json` 与 `opl agents residue-decisions --family-defaults --json` 是这类 residue 的机器可读 owner-decision ledger。它把 MAS/MAG/RCA/OMA 的 scheduler、queue、session store、workbench、status shell、domain wrapper、runtime watch 和 agent-lab materializer residue 折成 `retain_authority_function`、`raise_to_opl_primitive`、`no_active_caller_delete_gate`、`tombstone_gate` 或 `typed_blocker_gate`，并保留 owner receipt / typed blocker ref 状态。该 ledger 只回答 owner 应如何裁决私有平台残留；它不替 domain owner 签 receipt，不创建 typed blocker，不声明 domain/production ready，也不授权物理删除。

`opl agents interfaces --repo-dir <domain> --json` 或 `opl agents interfaces --family-defaults --format product-entry --json` 返回 generated interface `ready` 时，只能说明 OPL 能从 domain-owned metadata 生成描述并路由到 domain handler target；其中 family-defaults product-entry 输出是 App/workbench 的 canonical metadata feed，必须包含 `product_entry`、`product_status`、`product_session`、`domain_handler`、`workbench`、`stage_routes`、`source_contract_consumption` 和 `authority_boundary`。`opl agents pack-compiler --family-defaults --json` 是同一批默认标准 agent repo contracts 的 generated-surface projection / drift 诊断；默认 `opl agents pack-compiler --json` 仍用于 admitted manifest 诊断。上述 ready 都不是 production caller migration、wrapper retirement、App/workbench GUI、真实 hosted attempt、legacy physical cleanup 或 domain ready 的完成证明。文档里凡写到 generated surface，都必须把 descriptor ready、production consumption、active caller migration、physical retirement 和 live evidence 分开。

当前不能把 descriptor ready、classification closed、selected proof passed 或 App/read-model proof 写成标准 OPL Agent 结构 closure。MAS/MAG/RCA 仍需按各自 gap plan 判断是否完成 generated surface production consumption、active caller migration、refs-only thinning、App/workbench productization、lifecycle reconciliation、private authority AI-first audit 和 legacy cleanup。证据门可以证明目标结构可用，但不能替代目标结构本身的迁移、上收、收薄、删除或产品化。

为了清洁目标态，四个 repo 都可以重构。旧接口、旧 alias、旧 wrapper、旧 facade、旧聚合测试、旧文档入口和旧 runtime owner 只要不是目标态的一部分，就迁移 active caller 后直接退役或进入 history/tombstone；不为了照顾现状保留兼容面。如果当前 OPL primitive、pack compiler 或 App shell 还不够优雅，应先把缺口上收到 OPL 层；必要时可以系统调研成熟框架和外部实现模式，再把结论沉淀成 OPL primitive / generated surface / policy，而不是让 MAS/MAG/RCA 各自复制一套私有平台。

## 主参考阅读顺序

| 层级 | 入口 | 作用 |
| --- | --- | --- |
| OPL 全局目标态 | [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.md) | 定义 OPL Framework、Foundry Agents、One Person Lab App、workspace/runtime artifact root 的 north-star。 |
| OPL 全局差距 | [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) | 记录 family-level 当前状态、production closure 缺口、全局完善顺序。 |
| OPL 当前路线 | [OPL 当前开发线路](./current-development-lines.md) 与 [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md) | 说明 framework-first 执行顺序、Temporal provider、standard domain-agent skeleton 与旧路线退役纪律。 |
| AI-first 长期调研与审计 | [AI-first / executor-first 长期优化调研入口](../references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md) | 固定成熟框架调研提示词、外部经验吸收规则、OPL/MAS/MAG/RCA/OMA 设计审计重点、stage pack v2 conformance 和 evidence-after-contract 后续方向。 |
| OPL 生产闭环矩阵 | [生产级框架闭环差距矩阵](./production-framework-closure-gap-matrix.md) | 承接跨仓 owner receipt、memory/lifecycle apply、operator workbench、legacy retirement、live soak gate 和当前功能/结构 owner；过程性计划归 history。 |
| 单仓目标与计划 | 各 repo 的 `docs/references/*ideal*`、`docs/status.md`、`docs/active/`、`docs/runtime/`、`docs/delivery/` 或 `docs/source/` | 只维护本仓 domain truth、authority、direct/hosted 边界、单仓差距和上收清单；旧 `program` / `plans` / `capabilities` 目录不再作为默认落点。 |

## Owner 分层

### OPL 仓负责

OPL 仓负责所有 domain-neutral、跨 MAS/MAG/RCA 可复用、服务长期运行和产品工作台的能力：

- provider-backed stage runtime、Temporal provider、stage attempt ledger、queue、retry/dead-letter、signal/query、human gate transport 和 resume token；
- workspace/source intake shell、workspace registry、runtime artifact root locator、artifact locator、package/export lifecycle shell、restore/retention/migration ledger；
- domain memory locator/index、body-free inventory、writeback proposal/receipt transport、freshness 与 operator grouping；
- generic persistence / runtime lifecycle SQLite index、refs-only sidecar index、functional privatization audit read model、checksum/receipt ref registry 和 legacy diagnostic/tombstone projection；
- operator projection、attention queue、route/decision graph shell、review/repair queue shell、quality/readiness projection shell、observability/SLO 和 repair command projection；
- module install/update、skill sync、domain discovery、standard domain-agent skeleton、contract validation、no-forbidden-write proof 和 family release/shared helper；
- One Person Lab App 需要消费的通用 workbench contracts、action routing shell、runtime snapshot 和 drilldown 语义。

OPL 不负责 domain truth、domain quality verdict、publication/fundability/visual/export ready verdict、memory body、artifact mutation permission 或最终交付 authority。

当前若发现实现 / 硬化需求，应按下列 OPL-owned support categories 归位；具体执行状态和下一步回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)：

- generic state-machine runner：OPL 已持有 domain-neutral transition contract、runner 和 matrix runner；后续 OPL 层硬化应继续补幂等 tick、provider attempt bridge、retry / dead-letter、human gate transport、dispatch receipt 和 matrix audit。MAS/MAG/RCA 只声明各自的 domain transition table / guard / oracle fixture / owner action。
- provider SLO 与 repair-loop 执行证据：Temporal production proof 已有 read-model、supervised receipt 与 `family-runtime provider-slo tick --provider temporal` cadence executor；`provider_capability_slo` 已把 restart / re-query / signal history、typed closeout required、missing closeout blocked、retry/dead-letter boundary 和 domain truth boundary preservation 做成 OPL runtime/provider 机器投影。后续仍要保持 cadence/capability 长窗口持续 satisfied，并把真实 domain owner-chain dispatch 和 no-forbidden-write proof 闭合到对应 evidence gate。
- stage activity bridge：OPL 负责从 stage-attempt request/projection 到 provider-backed stage attempt、sidecar dispatch、typed closeout ledger、owner receipt refs 与 typed blocker 的通用传输；真实 MAS paper、MAG grant、RCA visual owner receipt chain 继续由 domain owner 闭合。
- App / workbench 产品化：OPL App 负责把 workspace/source intake、artifact gallery、package/export lifecycle、route graph、review/repair queue、quality/readiness、observability/SLO、memory locator 和 action routing 这组通用 projection 做成人用 drilldown；domain repo 只提供 refs、verdict refs、route nodes/edges 和 receipts。
- memory / artifact / lifecycle transport：OPL 可实现 locator、body-free inventory、writeback proposal / receipt transport、retention / restore ledger 和 provenance shell；memory body、accept/reject、artifact mutation 和 package/export verdict 必须回到 domain receipt。
- functional privatization audit：OPL 持有统一读模型，读取 MAS/MAG/RCA manifest 里的私有化功能模块清单，并把每项归为 OPL replacement、domain thin adapter、domain authority 或 retire/tombstone；清单必须保留代码路径、active caller、迁移动作、保留理由或不能上收理由，避免把“仍有私有实现”误写成“已经干净”；domain repo 不能把 scheduler、persistence、native helper envelope、review/repair transport 等通用外围写成自己的长期 owner。
- physical skeleton / legacy follow-through gate：OPL 负责 no-active-caller、replacement parity、provenance retention、history/tombstone、no-retained-legacy-entry 与 delete readiness 的只读门禁；实际文件移动或删除由对应 repo owner 在 parity / provenance 证据齐备后执行。

### Domain repo 负责

MAS/MAG/RCA 这类 Foundry Agent repo 负责领域大脑、领域交付 authority 和 domain package 的薄程序面。这里的“薄程序面”是为了让 OPL 能发现、托管、审计和投影该 domain agent；它不构成第二套通用 framework/runtime。

- domain stage semantics、prompt、skill、knowledge pack、route policy、quality rubric、review gate 和 artifact gate；
- study/grant/visual truth、route decision、quality verdict、publication/fundability/visual/export authority；
- memory body、retrieval semantics、writeback proposal 的领域含义、accept/reject decision 和 owner receipt；
- canonical artifact/package/deck/manuscript/proposal authority、artifact mutation permission 和 export/submission gate；
- direct app skill path、domain CLI/MCP/API、descriptor、contract/schema、domain handler target、opaque ref projection output、domain transition spec/table、quality gate、artifact locator contract、receipt schema、tests 和 typed blocker；
- direct path 与 OPL-hosted path 的语义等价、no-forbidden-write、no-regression evidence 和 owner-chain 证据。

Domain repo 不应长期维护 generic scheduler、generic queue、generic attempt ledger、generic state-machine runner、generic workspace/source intake、generic memory locator、generic persistence engine、generic SQLite lifecycle index、generic artifact lifecycle、generic workbench、generic observability 或跨 domain App shell。需要 OPL 托管运行时，domain repo 声明 stage pack、transition spec、authority refs、receipt schema、domain handler target、opaque ref projection output、functional privatization audit 和必要 native helper，由 OPL Framework 承载运行、恢复、排队、唤醒、索引、投影和审计。MAS 历史上的 `runtime_lifecycle.sqlite` 这类设计只可作为 history/provenance 或 file-authority ref 被 OPL 消费，不能再作为 MAS-owned generic persistence layer 扩展。

反向盘点时，默认把 domain repo 中超出“定义 stage、知识/提示/质量 gate、domain receipt、domain handler target、opaque ref projection output 或必要 native helper”的模块列入 functional privatization inventory。若它是 transport、ledger、index、lifecycle、workbench、scheduler、runner、source intake、memory locator、artifact shell、review/repair envelope、native helper envelope 或 CLI/MCP/product shell，就先假定应上收到 OPL；只有当它直接承载领域判断、artifact/export authority、memory body/accept-reject、owner receipt 或 domain-specific helper implementation 时，才允许保留在 domain，并必须写清不能上收的原因。

这条判断不以“当前代码已经这么写了”为理由让步。当前实现可以被大幅重构、移动、删除或由 OPL generated surface 替换；单仓计划里所谓 direct path、sidecar、product-entry、projection builder 或 status wrapper，默认先视为 migration bridge，只有无法声明化且确实属于 domain authority 的部分才保留为长期接口。

必要私有函数必须逐项审计。质量、创作、评审、路线判断、fundability、publication readiness、visual direction、review/export verdict、memory accept/reject 和 artifact mutation authorization，默认适合 AI-first stage output 或独立 reviewer/auditor attempt；程序只能做 validator、materializer、receipt signer、guard、refs projection 或 domain-native helper implementation。函数返回值、scorecard、schema completeness、regex、截图机械检查、controller route、provider completion 或脚本退出码都不能替代 AI-first verdict。若某个函数必须保留，单仓 gap plan 必须写清 active caller、cannot absorb reason、输入输出、receipt/blocker/ref 返回、AI-first record 要求、no-forbidden-write 和退役门。

单仓文档只写本仓目标、当前差距、与 OPL 的 owner boundary、哪些能力应上收、哪些能力必须保留在本仓。目录结构应与 OPL family taxonomy 保持同名一致，代码内部结构可以按领域实现差异保留，但 OPL-facing skeleton、docs taxonomy 和 owner boundary 应统一。不在 MAS 文档维护 MAG/RCA backlog，不在 MAG 文档维护 MAS/RCA backlog，不在 RCA 文档维护 MAS/MAG backlog。

gap plan 和开发计划默认只维护 `功能/结构差距`：owner 边界、模块归属、接口退役、generated surface、目录/合同/调用链、source morphology、App/shell contract、no-second-truth guard 和历史遗留清理仍未到目标态的部分。Release、readiness、production、Brand L5、真实 workspace receipt、provider-hosted apply、live soak、App release/user-path、owner receipt、typed blocker、human gate、physical delete authorization 或真实项目 evidence 不放进 active gap 表；这些只在对应声明或不可逆 owner decision 前回独立 evidence owner 做 fresh gate。

反过来，classification surface closed、descriptor aligned、generated descriptor ready、selected proof passed 或 no-regression fixture passed，也不能把仍未完成的生产 caller 迁移、App/workbench 产品化、refs-only 收薄、legacy physical retirement、source_ref refresh 或私有函数 AI-first 审计从功能/结构差距中抹掉。只要目标 owner、调用链、物理代码路径或文档目录职责还未到理想态，就继续是功能/结构差距。

当某个 domain 的结构 closure 未来被真实迁移和 no-active-caller proof 明确关闭时，后续文档只能把 ready / release / production 类证据路由到独立 evidence owner，不能在 active plan 中重建第二 evidence backlog。不能提前把 descriptor ready、classification closed、no-regression fixture、read-model proof 或 provider proof 写成结构 closure。

### App / Workbench 负责

One Person Lab App / Workbench 的目标、消费合同和边界由 OPL 主仓负责记录。当前 GUI shell 主线来自独立 `one-person-lab-app` 产品仓的 `shells/aionui/`，该目录作为 upstream-backed AionUI shell adapter 维护，并由 `opl-aion-shell` 持有实现历史。`opl-native-workbench` 是 App-owned foreground alternative GUI candidate；Hermes Desktop / `hermes-codex` 只作为 retained explicit reference candidate；AG-UI/CopilotKit / `agui-codex` 只作为 archived technical proof 与显式 replay surface 保留，除非用户明确要求 AGUI，不进入普通开发 worklist。拆分 closeout 已归档到 [One Person Lab App 仓库拆分 Closeout](../history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)；当前 App/workbench 边界以 `docs/product/`、App 仓合同和真实 release artifact 为准。

它的产品工作台职责是：

- 展示 OPL runtime truth、provider proof、stage attempt、attention queue、domain projection、artifact refs、review/repair refs 和 action owner；
- 执行明确 owner 的 UI action routing：OPL CLI/provider signal、domain sidecar/direct skill、manual handoff；
- 保持 OPL fork overlay、upstream AionUI intake、packaging/update、bridge adapter 和本地 GUI shell 规则；迁移后这些规则应落在 App 仓顶层 contract 与 `shells/aionui/AGENTS.md`，避免 AionUI 规则主导 App 顶层。Hermes alternative 和 AGUI archived proof 的边界由 App candidate registry / shell-adapter contracts 持有，OPL 主仓只记录消费边界。

App 不持有 OPL runtime，不持有 domain truth，也不把 provider completion 写成 domain ready verdict。

App 普通用户产品面按 `Codex App wrapper` 设计：固定 `Codex CLI` concrete executor，内置 MAS/MAG/RCA 及后续 Foundry Agent 的 task entry，并通过 OPL `app state/action` 消费 Framework runtime/read-model/action truth。AionUI 多 backend、多 Agent selector、通用 Agent host 或非默认 executor adapter 只能作为 shell implementation、developer/operator diagnostic 或显式 stage-level binding 语境存在；它们不能成为普通用户默认产品选择器。App 仓负责把这条产品取舍落实到 GUI product contract、page-state tests、release/user docs 和 active-shell validation；OPL 主仓只记录 Framework 侧目标、消费边界和机器读写 surface。

## 上收判断

判断一个能力是否应上收到 OPL，按下面规则：

| 问题 | 结论 |
| --- | --- |
| 是否能被 MAS/MAG/RCA 两个以上 domain 复用？ | 优先进入 OPL/shared primitive。 |
| 是否只是 transport、locator、index、ledger、projection、receipt ref、operator shell、UI shell 或 SLO？ | 优先进入 OPL/App。 |
| 是否是为了减少小文件、做 lifecycle/ref registry、projection cache 或 SQLite sidecar index？ | 优先进入 OPL refs-only persistence/lifecycle primitive；domain repo 只保留 file authority 与 receipt refs。 |
| 是否会判断研究路线、基金 fundability、视觉方向、质量、memory accept/reject 或 artifact/export readiness？ | 留在 domain repo。 |
| 是否会写真实 workspace artifact、memory body、manuscript、proposal、deck 或 package？ | 必须由 domain owner receipt 授权；OPL 只持 refs/ledger/projection。 |
| 是否只是旧 provider、旧 gateway、旧 wrapper、旧 alias 或旧 aggregate test 的兼容入口？ | 迁移 active caller 后直接删除或归档，不保留兼容层。 |

## Docs 目录结构对齐

OPL series 的开发文档治理默认巡检 OPL、MAS、MAG、RCA、OMA 和 App 六仓。OPL、MAS、MAG、RCA 采用同名 canonical docs taxonomy。统一目录名不是因为
这些目录现在都必须很厚，而是因为 framework / domain owner repo 的长期生命周期角色已经稳定：
读者进入任意由 OPL 系列直接管理的 framework/domain repo 时，都应能在同一组目录下找到同类材料。

目录是否保留按长期职责判断，不按当前文件数量判断。有长期职责的目录可以暂时只放
README/索引，但 README 必须说明 owner、purpose、state、machine boundary、当前承载状态、
以及什么内容未来应进入该目录。没有长期职责的目录不进入 canonical taxonomy。

已有非 canonical 目录属于迁移对象；能直接迁移的直接迁入 canonical 目录。
不能迁移的，只允许作为 upstream/imported support、历史 provenance、外部依赖目录
或 tombstone 暂留，并由 canonical 目录 README 明确指向。旧目录不能继续作为
new recurring material 的默认落点。

OMA 纳入巡检，但按 Agent Foundry / target-agent builder 职责保持轻量 docs 形态；只有出现长期 public、product、runtime、delivery、source、policies、specs 或 history 内容时，才新增对应目录索引。App 顶层 `docs/` 应纳入 One Person Lab App 的产品文档、release、testing、user guide 和 screenshot lifecycle；`opl-aion-shell/docs/` 仍按 upstream AionUI 依赖文档处理，不主导 App 顶层治理，也不合入 App 默认分支。

统一目录集合如下：

| 目录 | 角色 | 迁移/保留规则 |
| --- | --- | --- |
| `docs/active/` | 当前执行、当前计划、当前差距、active baton 与完成门槛 | MAS 旧 `program/`、MAG 旧 `plans/`、RCA 旧 `program/` 的 current 内容已迁入 `active/`；历史过程进入 history，后续 active material 直接落这里。 |
| `docs/public/` | 公开叙事、用户第一阅读层、roadmap/task map、对外定位 | MAG 根层 public allowlist、App localized `readme/` 由 `public/README*` 收口，不直接删除。 |
| `docs/product/` | 人类/operator 入口、product entry、workbench、quickstart、profile、发布协作 | OPL 维护 App/workbench 的消费目标和合同；domain repo 的 direct skill/product entry 指南落这里。 |
| `docs/runtime/` | runtime topology、control plane、projection/read model、provider/executor 边界、watch/repair 语义 | root `contracts/` 仍是机器合同目录；`docs/runtime/` 只做人读说明和当前 runtime owner 索引。 |
| `docs/delivery/` | artifact/package/export/submission/deck/deliverable family 与 proof | OPL 只放通用 artifact lifecycle shell；domain repo 放本领域交付 authority。 |
| `docs/source/` | workspace/source intake、source readiness、knowledge/source truth consumption | OPL 只放通用 source/workspace shell；domain repo 放本领域 source semantics。 |
| `docs/policies/` | 稳定治理规则、运行纪律、repo-local 维护规则 | 不替代 core five 的 invariants/decisions；更细的长期政策落这里。 |
| `docs/specs/` | 当前仍有效的技术规格、active product/runtime boundary spec | 旧 dated spec 或 path-stable spec 必须在 index 标清 active/history，不作为兼容接口保留。 |
| `docs/references/` | north-star、positioning、integration、governance、verification support | 目标态和外部学习材料放这里，不能写成 current truth。 |
| `docs/history/` | retired route、completed plans、tombstone、provenance、process archive | 过时接口、旧路线和完成计划只在这里保留来龙去脉。 |

根层 `docs/` 只保留 `README*`、核心五件套和
`docs_portfolio_consolidation.md`。每个 repo 的
`docs/docs_portfolio_consolidation.md` 必须说明本仓 canonical 目录状态、
迁移来源、owner/purpose/state/machine boundary，以及哪些非 canonical 目录仍因
path stability、contract-linked `human_doc:*` 或历史归档暂留原位。

`docs/**` 是开发和维护参考，默认只保留中文 canonical 内容。稳定路径优先使用
无语言后缀 `.md` 承载中文正文；历史材料可以保留旧双语方案的描述作为 provenance，
但 active/reference 索引应指向当前无语言后缀路径。根层 `README*` 是否继续保留公开
双语入口，由各仓 public/product 需求单独判断；这不改变 `docs/**` 的中文内部开发文档定位。

## 过时面清理规则

当一个旧模块、旧接口、旧 CLI alias、旧 wrapper、旧 facade、旧测试入口或旧文档入口已经被当前 owner surface 替代时，默认处理是直接退役：

1. 先确认 active caller、合同引用、fixture/provenance 需求。
2. active caller 存在时，先迁移到最新 owner surface。
3. caller 迁完后删除旧模块、接口、alias、wrapper、facade 或 aggregate compatibility test。
4. 需要保留来龙去脉时，放入 `docs/history/`、tombstone 或明确的 provenance/reference，不保留 active compatibility interface。
5. 测试只断言 contract/schema/source/CLI/API/manifest/generated artifact 行为，不断言 prose wording 或旧文档路径。

这条规则适用于 Hermes-first、Gateway/frontdoor/federation、local-manager、repo-local runtime pilot、legacy service wrapper、flat shell alias、compatibility facade、旧 `production-closeout` 聚合入口、旧聚合测试和旧 active-path 文案。保留历史不等于保留兼容接口。

## 工作准入分类

任何新增 OPL 系列开发工作，先归类到以下之一：

- `OPL global`: framework/shared primitive/App workbench/domain admission/production-tail owner-evidence。
- `domain-owned`: MAS/MAG/RCA 的领域 truth、quality、artifact、memory body、owner receipt 或 direct skill。
- `App-owned`: GUI shell、workbench 展示、action routing、packaging/update、fork overlay。
- `reference/history`: 外部学习、旧路线、proof lane、迁移背景或 tombstone。

归类之后再决定落点。无法归类的文档不应直接新增到 active layer；先更新对应 portfolio 或进入 reference/history。
