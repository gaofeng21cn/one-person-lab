# OPL 硬约束

Owner: `One Person Lab`
Purpose: `invariants`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 顶层定位

- `OPL` 是面向高价值知识工作的完整智能体运行框架。它以 `Codex-default session runtime` 为默认交互底座，以 stage-led family framework 承接长期自治、恢复、队列、human gate、trace、projection 与交付收口。
- `OPL` 的默认交互与具体执行 runtime 是 `Codex CLI`；`Codex CLI` 是阶段内默认最小执行单元。Full online family runtime 的 readiness 对象是已配置且 ready 的 Temporal-backed family runtime provider。Temporal 是 OPL production online runtime 的必需 substrate，local provider 只能作为 dev/CI/offline diagnostic baseline，不能替代 Full online readiness；`hermes_agent`、`claude_code` 与 `antigravity_cli` 只允许作为显式非默认 executor adapter/backend，Hermes provider / Gateway / readiness / compat 面只允许作为历史 provenance、诊断语料或负向 guard。
- `Codex CLI` 是 OPL 的受管 runtime dependency：OPL 必须检测实际命中的 binary、版本、最低版本策略和 PATH 候选；同版本兼容 wrapper / alias 归并到当前有效入口，低于当前最低版本或当前命中版本无法解析的 Codex CLI 只能进入 `attention_needed`，不得被报告为 ready。
- 只有显式 domain activation 或显式 runtime switch，才允许离开 Codex-default 语义。
- 大型任务必须按 stage 作为可观察、可恢复、可审计的工作单元推进；不得把开放式知识工作降级成只靠硬编码步骤或固定脚本后处理的流程。
- OPL 必须坚持 AI-first、AI 原生专家判断优先、contract-light。智能体能力提升主要来自 `Codex CLI` 等 AI executor、domain stage pack、prompt、skill、knowledge、rubric 和 quality gate 的演进；合同只负责边界、安全、权限、审计、receipt、阻塞、恢复和 projection 这些下限，不负责把开放式智能行为、创作策略、评审方法、路线判断或修订逻辑写死。
- AI 原生专家判断优先级高于机械分数、checklist、schema 完整性、contract completeness、descriptor readiness、provider completion、generated-surface proof 或 App/read-model proof。上述信号只能作为 advisory、blocker localization、evidence gap 或 route-back 输入；除非独立 AI stage、domain-owned quality gate、owner receipt 或 typed blocker 关闭对应判断，否则不得被写成 domain ready、quality verdict、artifact ready、publication/fundability/visual/export ready 或 production ready。
- 涉及知识交付、专家判断或正式交付质量的复杂步骤必须是 first-class stage，例如 AI 审稿、publication quality review、fundability review、visual review、revision/rebuttal review；不得把这类流程作为另一个 stage 内部的普通函数、helper、后处理或 authority function 暗中完成。
- 每个标准 OPL Agent stage 必须声明本 stage 的 prompt、tools、knowledge 和 quality gate。tools 可以包含 OPL 通用工具、domain skill、必要私有功能和 native helper；knowledge 可以包含 source refs、memory refs、经验卡、rubric、policy 和 prior receipt refs；quality gate 必须说明本 stage 如何被独立审核、何时 route-back、何时允许 handoff。
- 任何可由 OPL 启动的 stage pack 必须先通过 admission：stage id、owner、goal、输入/输出 refs、`requires`、`ensures`、knowledge refs、skill / prompt / evaluation refs、allowed action refs、handoff、trust lane、authority boundary、launch profile 和 selected executor binding 都必须明确。缺失这些准入信息时只能形成 blocker 或 human gate，不能进入默认启动路径。
- Stage 间组合必须由 `requires` / `ensures`、显式 refs、human gate decision 或 owner receipt 对齐；OPL 不得用启发式推断补齐缺失前置条件，也不得把 provider / executor 完成状态写成下游 `requires` 已满足。
- 可启动 stage pack 必须把 source/artifact/workspace launch scope 做成 refs：`source_scope_refs`、`artifact_scope_refs`、`workspace_scope_refs` 只允许 OPL 投影和检查可见性，不授予 OPL source truth、artifact authority 或 workspace truth。缺失、过期或冲突的 scope 只能进入 blocker、human gate 或 route-back。
- 可启动 stage pack 的 `runtime_assumptions` 应能被 `monitor_refs` 或 assumption-local monitor refs 支撑；stale assumption、缺 monitor ref 或缺 owner 默认进入 readiness warning 和 minimal counterexample，不能被写成 App/operator ready。只有当缺口同时影响启动安全、越权、边界事件记录或 replay/audit 基础证据时，才升级为 typed blocker / human gate / route-back。
- Stage pack hash 变化必须经过显式 migration policy；已有 attempt 只能继续绑定旧 hash、迁移到新 hash，或被 human gate 阻断，不能静默切换可复用 stage pack。
- Stage 与 route 必须保持不同层级：stage 是 OPL 可执行、可恢复、可审计的 attempt 单元；route 是 domain owner 输出的下一步、route-back、typed blocker、safe action ref 或 owner receipt ref 语义。route 不是小 stage，不得被 OPL 直接执行，也不得把 route hydration、queue admission、provider completion 或 read-model closed 写成 stage complete、domain owner receipt、domain ready、artifact ready 或 quality verdict。
- OPL 的 route 调度只能表现为 `stage graph + owner-route hydration + reconciliation + attempt ledger`：stage graph 投影 requires/ensures、scope、integrity 和 launch blockers；owner-route hydration 把 domain refs 转为 typed queue task、stage attempt request、conflict envelope 或 operator projection；reconciliation loop 对照 desired route refs 与 actual attempt / provider / receipt / human-gate / dead-letter state；attempt ledger 只记录 control metadata、checkpoint、closeout、typed blocker 与 owner receipt refs。这个模型可以借鉴 Temporal event history、LangGraph checkpoint/conditional edges、Kubernetes spec/status reconciliation 和 Dagster graph/op boundary，但不得引入 domain repo 私有 scheduler、第二 truth source 或 OPL-held domain verdict。
- Domain dispatch evidence 的记录必须执行 authoritative freshness / owner-receipt 协议：当 route 声明具体 `required_evidence_refs` 时，成功路径 payload 必须逐项覆盖这些 opaque refs；缺失任一 ref 时 fail closed。Domain-owned typed blocker refs 可以作为合法阻塞闭环被记录，但不能把缺失的 artifact delta、reviewer currentness、owner receipt 或 quality gate 解释成 ready。OPL 只检查 refs 覆盖、身份绑定和占位符，不解析医学、基金或视觉语义。
- MAS `domain_owner/default-executor-dispatch` 的 queue `succeeded` 只表示 OPL 已接收 MAS writer handoff 并启动 provider-backed `codex_cli` stage attempt；Temporal provider 不可启动时必须 fail-closed 为 `blocked`。hydrate/export 后续看到同一 dedupe key 的 payload 或 source fingerprint 变化时，不得把该 `succeeded` provider-admission task 自动 requeue；只有明确 blocked provider transport redrive、operator redrive、或 MAS owner 输出新的 dedupe/work-unit task，才能产生新的 provider attempt。若当前 linked attempt 的 Temporal query/inspect 观察到 failed、timed out，或 provider workflow 以 `typed_closeout_packet_required` 等 non-completion blocker 结束，OPL 必须把 linked queue task 反向投影为 `blocked` 并保留 provider-only reason，不能继续显示 clean succeeded。若同一 task 已存在更新的 queued/running redrive attempt 或更新 accepted typed closeout，旧 terminal observation 只能更新旧 attempt ledger，不能覆盖 task-level currentness。该状态不得被任何 status、tray、workbench 或 runtime read model 表述为 writer attempt completed、MAS owner receipt observed、domain ready、publication ready、artifact ready、package refreshed 或 current manuscript repaired。只有后续 Codex stage attempt closeout、MAS owner receipt / typed blocker、AI reviewer-backed publication eval 或 domain gate receipt 才能关闭对应语义。
- Stage replay certification 只能读取 append-only event log refs、attempt ledger refs、runtime event refs 与 closeout receipt refs；不得为了 replay 重新询问 AI、人类审批或外部系统。
- 文档和合同的 active 叙事必须统一为 `Minimal Trust Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`。Minimal Trust Kernel 只覆盖 descriptor 形状、组合关系、allowed refs、executor binding、manifest provenance、schema/parity check、authority boundary、expected receipt、audit、replay 与 route-back 下限；Readiness 只聚合 launch/evidence gap；Derived Diagnostic Lenses 只解释 blocker、assumption、cohort、runtime budget、replay 或 failure localization，不拥有 runtime/planner/proof assistant/workflow compiler/domain verdict 角色；AI Capability Aperture 保留 stage 内开放式专家执行空间，让更强 executor、domain pack、prompt、skill、knowledge、rubric 与独立 reviewer 能力直接转化为系统能力。
- Surface Budget 是新增默认 surface 的硬治理边界：新增能力默认不得进入普通 help、默认 docs 入口或 hard gate。只有影响 launch safety、authority boundary、evidence / replay / audit / route-back，或被 App / runtime 反复消费，才允许升级为 default surface；只有影响错误启动、越权或不可审计 / 不可恢复，才允许升级为 hard gate。该政策的机器入口是 `contracts/opl-framework/surface-budget-policy.json`。
- `guarantee_mode` 只能描述 OPL 能给 scheduler / App / operator 的保证范围：`static_admission_only`、`runtime_enforced`、`domain_owned_judgment` 或 `observability_only`。它不是证明器结论、domain ready、quality verdict、artifact verdict 或 publication / fundability / visual verdict；`observability_only` 不得被写成 ready。
- GraphFlow / GFL 只能贡献 governance vocabulary：boundary、evidence、audit、replay、route-back。不得被引入为 OPL runtime dependency、provider、executor、domain stage runner、planner、proof assistant、workflow compiler、artifact authority、memory owner 或 quality verdict owner。
- 新 GraphFlow / GFL 学习点默认先进入 reference/history 或现有 Derived Diagnostic Lenses，再由 `opl stages readiness` 折叠成 warning / recommendation / typed blocker / route-back ref；不得新增 standalone 默认 CLI/schema 目标，只有影响启动安全或 OPL 越权才升级为 hard gate。
- `OPL Runtime Manager` 只能是产品级薄管理/投影层和 typed family queue owner，不得被写成 domain scheduler、domain truth owner、domain quality owner、domain artifact owner 或 concrete executor。
- family runtime provider 负责 stage-attempt durability、wakeup、retry/dead-letter、human-gate transport、status query 与 execution history。生产在线路径必须由 Temporal-backed provider 承接；缺少 Temporal service、worker 或 readiness proof 时，OPL production readiness 必须 fail-closed 为可修复 blocker，而不是退回 local provider 宣称在线可用。
- `hermes_agent`、`claude_code` 与 `antigravity_cli` 可作为显式非默认 executor adapter/backend。非默认 adapter 不得被写成 provider、provider proof surface、readiness path、MAS/MAG/RCA domain truth、quality、artifact、publication gate 或默认 concrete executor owner，也不得被 fork/vendor 成 OPL 私有 runtime kernel。
- OPL 应上收 domain-neutral 的智能体运行外围能力：stage attempt ledger、typed queue、checkpoint / closeout / receipt、source fingerprint / idempotency、artifact index、file lifecycle、retention、restore proof、migration ledger、workspace lifecycle、human gate / resume token 和 operator projection。任何上收都必须保留 domain truth owner 不变。
- MAS/MAG/RCA 的目标接入形态是统一 `domain-agent skeleton`：`agent/`、`contracts/`、`runtime/authority_functions/`、`src/` 或 `packages/`、`docs/` 这些 repo-source 边界应可由 OPL 发现、校验和托管；workspace / source / artifact locator、index、schema、receipt refs、retention / restore policy 只以 contract、policy 和 receipt ref 暴露，真实 workspace state、runtime artifact body、receipt 实例和交付物实例必须在外部 workspace / runtime artifact root。domain 内部业务实现、语言和 quality gate 可以不同。
- 标准 OPL Agent 的真实语义必须在 `agent/` pack 和对应 machine-readable contracts 中归位。`agent/` 下必须有 prompt、stage、skill、knowledge、quality gate 的真实语义文件；`pack_compiler_input.required_domain_pack_paths` 必须解析到这些文件；每个 stage 必须声明 prompt refs、skill refs 或 skill id、knowledge refs 和 evaluation refs。空 `agents/` / `agent/` 目录、只有 README 的 skeleton、只靠 `src/` / `packages/` 承载领域语义、或缺失 stage-level prompt/skill/knowledge/evaluation refs 的 repo 不能被视为标准 OPL Agent。
- OPL family 开发 checkout 不承载运行生成物。默认验证入口、Python clean runner、Node-triggered Python helper 和 build/proof 命令必须把 `__pycache__`、`.pytest_cache`、`*.egg-info`、`uv sync` project venv、安装/同步副产物、临时 build 输出、workspace state 和 runtime artifact 导向仓库外的系统临时目录、用户级 runtime-state、workspace root 或 runtime artifact root；`.gitignore` 和 repo hygiene 只作为兜底守门。
- MAS 已验证的 SQLite / file lifecycle / restore-proof 经验只能作为 OPL framework primitive 的参考实现和 parity oracle。OPL 可以持有 lifecycle metadata、artifact locator、retention receipt、restore proof 和 migration ledger；不得复制 MAS study truth、publication verdict、evidence/review ledger 或 manuscript/package authority。
- `OPL native helper` 与高频状态索引只能加速系统探测、artifact discovery、session/progress/artifact projection，不得替代 admitted domain 仓自己的 durable truth。
- `OPL` 的 shared contract、graph、gate、index、scorecard 与 projection 只能携带证据、provenance、状态和路由信号；不得替 MAS/MAG/RCA 或未来 domain 持有 AI-first 作者判断、审稿判断、质量裁决或 ready verdict。
- `OPL` 可以上收 family-level stage descriptor、skill / prompt / evaluation refs、handoff 与 projection 语义；不得把 stage 控制面实现成替代 `Codex CLI` 自主拆解、创作、审核或 domain-owned quality gate 的硬编码流程引擎，也不得用越重的合同把 future AI executor 的行为空间锁死。
- `OPL` 可以上收 stage-level integrity / citation-support / evidence-handoff / data-access / human-checkpoint metadata，作为通用 framework primitive 和 App/operator 投影；不得据此持有 domain truth、publication / fundability / visual verdict、artifact authority、domain audit body、direct skill path 或最终质量裁决。
- AI-first quality gate 必须由独立 reviewer / gate stage attempt 完成。执行与审核必须是两个独立的智能体任务，具备独立上下文、输入 refs、closeout / gate receipt 与 owner；不得让同一个 `Codex CLI` attempt 在同一上下文里先执行再自审并放行。缺少独立 gate receipt、gate evidence stale 或出现 self-review attempt 时，stage progression 必须 fail-closed。
- `OPL` 可以上收 domain memory locator、stage `knowledge_refs`、migration plan ref、seed corpus ref、writeback proposal refs、router receipt refs、freshness 与 operator projection；不得持有 domain memory 正文，不得执行 memory body migration，不得接受或拒绝 memory writeback，不得把 memory card 提升为 evidence / review / grant / visual / artifact truth，也不得据此生成 publication、fundability、visual quality 或 artifact readiness verdict。
- `OPL` 文档中的 MAS stage 抽象只能作为跨仓投影维度；不得直接覆盖 MAS 现有 route contract、stage 名称、stage 数量、controller truth 或 publication / quality authority。
- MAS v2 wording 必须保持 `MAS` 为独立 `domain agent` 与单一 domain app skill owner；`OPL` 只能消费 MAS-owned entry/projection truth，不得把 MAS runtime、controller truth、quality authority 或 publication gate 收归 OPL。
- `MDS` 只能作为 `MAS` 显式声明的可选 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion 被读取；不得作为 OPL 默认安装依赖、顶层 domain-agent 入口或独立 OPL-managed domain agent 回流。
- 当 admitted domain 吸收外部 companion 能力时，OPL 只上收 domain-neutral control-plane 原则与 discovery refs；可保留能力必须落到 domain-owned surface，外部 companion 必须降级为显式 audit/diagnostic/intake/oracle 引用，并记录 source ref/hash、capability classification、license refs、owner boundary、parity proof 与 no-history contributor audit。
- `OPL` 持有 family-level 开发与运行框架、通用状态机、stage attempt lifecycle、queue/wakeup、resume/human gate、workspace/artifact/memory locator、operator projection 和 App/workbench shell。MAS/MAG/RCA 不维护平行的通用 runtime 模块；需要运行能力时通过 OPL Framework 托管。
- `OPL` 不替代各个领域仓的智能体逻辑、domain truth、quality verdict、artifact authority、memory body 或 domain transition semantics。
- 普通用户路径和 One Person Lab App 必须默认使用 OPL-managed environment：managed modules、managed skills、Codex plugin metadata、runtime tools 与 provider state 是 App 产品入口的运行真相；不得依赖开发者工作区 checkout 是否最新、是否 clean 或处于哪个实验分支。
- developer checkout 只能作为显式开发/调试 override 使用。override 必须通过环境变量、开发模式开关、workspace registry 或 App 明示状态表达，并且 App / CLI 必须能说明当前命中的 checkout。没有显式 override 时，不得让 sibling workspace 或 repo-local 实验分支反向定义 App 运行依赖。
- App 启动维护可以自动更新 clean 的 OPL-managed checkout，并在成功后运行 module health check、skill sync 与 Codex-visible plugin / skill metadata freshness check；遇到 dirty、ahead、diverged、no upstream、health check 失败或 cache 刷新需要重启时，必须 fail-closed 为可见的人工处理状态，不得静默覆盖、回滚或用开发仓污染 managed runtime。
- Codex-visible skill/plugin cache 只是当前 active managed source 的投影；它不能成为第二真相源。需要刷新或重启 Codex App 才能加载新 metadata 时，App 应明确提示或提供受控刷新入口。
- `OPL Developer Mode` 必须是显式系统级配置和 App 可见设置。安装流程可以在检测到配置的 GitHub developer login 时默认开启；其他用户也必须能在 App 设置或 CLI 中手动开启、关闭或改成只观察模式。当前命中状态、配置来源和 GitHub 身份不得隐式推断。
- Developer Mode 只授权开发与修复路由，不改变普通用户 managed runtime 的真相源。若 authenticated GitHub identity 对目标 repo 具备直接写权限，智能体在调用过程中发现 framework / domain repo 问题时可以进入 repo 层修复、提交和 owner-visible 审计路径；若没有直接写权限，只允许走 fork / branch / pull request 路径。
- Developer Mode 开启时可以默认启用外围 AI 巡检，但巡检必须通过 OPL Agent Lab 或等价 refs-only control plane 输出 issue、evidence、owner route、candidate fix 或 PR refs；不得静默写 domain truth、artifact、memory body、quality verdict 或 managed runtime。
- OPL family 的目标态高于当前实现分布。MAS/MAG/RCA 当前存在的私有 scheduler、runner、session store、SQLite/lifecycle、workspace/source intake、memory/artifact transport、workbench、sidecar/status/product wrapper 或 generated wrapper，只能作为迁移输入；不得因为已有 active caller 就写成长期合理。
- 标准 OPL Agent 必须收敛到 `Declarative Domain Pack + OPL generated/hosted surfaces + standard authority functions`。stage 定义、domain policy、quality/export verdict、artifact authority、memory accept/reject 和 owner receipt signer 属于标准 pack 或 OPL authority ABI，不算私有平台污染；repo-local 通用 runtime、状态机、持久化、调度、展示、transport、lifecycle 或 observability residue 只能作为明确例外保留，且必须有接口、receipt/blocker/ref 输出边界、active caller、不能上收原因、no-forbidden-write 证据和退役/复审门。
- 当 OPL primitive、pack compiler 或 App shell 还不够成熟时，应在 OPL 层定义缺口、必要时调研外部成熟系统，并把结论沉淀为 OPL generic primitive / generated surface / policy；不得让 MAS/MAG/RCA 各自复制私有平台。
- 文档和计划必须先设理想态，再找差距；差距不是妥协清单。为了理想态，可以做革命式重构并完全抛弃旧模块、旧接口、旧测试、旧目录和旧文案；处理清楚 active caller、替代 surface、provenance 和必要证据后，不保留历史兼容面。

## OPL 10 项原则

这 10 项原则是核心五件套、active gap、closure matrix 与 contracts README 的共同读法。它们把 `AI-first`、`executor-first`、`Codex-first` 和 `contract-light` 拆开：开放式专家工作优先交给 AI executor；stage 内最小执行单位是 Agent executor；当前默认且第一公民 executor 是 `Codex CLI`；合同只保边界、安全、审计、receipt、阻塞、恢复和 projection 下限。

1. Stage pack 是启动单位；OPL 准入并启动 stage，不启动自由形态 workflow script。
2. AI-first 执行不被静态合同写死；合同只绑定 prompt、tools、knowledge refs、expected receipt 和 authority boundary。
3. `Codex CLI` 是默认 selected executor；`hermes_agent`、`claude_code`、`antigravity_cli` 或其他 executor adapter 只能通过 request、stage attempt 或 handoff 显式绑定，并以 `executor_binding_ref`、receipt / audit / fail-closed 证明连接。
4. AI 原生专家判断优先；机械分数、checklist、contract completeness、descriptor ready、provider completion 和 generated-surface proof 只能作为 advisory，除非独立 AI stage 或 domain-owned quality gate 返回 receipt / typed blocker / route-back verdict，否则不能替代专家判断。
5. `requires` / `ensures` 组合在启动前检查；domain judgment 仍是 runtime / domain-owned 结果。
6. `verified_static_core` 只覆盖 identity、owner、refs、scope、composition 与 forbidden-authority 约束。
7. `runtime_enforced_boundary` 覆盖 AI 输出、人类决策、外部系统、artifact mutation、memory writeback 与 domain verdict。
8. Hard blocker 只覆盖启动安全、越权、关键 runtime event 记录缺失、composition 不满足、hard human gate 或 executor binding 缺失。
9. capacity、monitor、assumption、cohort-loop、replay 和 domain-owner review 信号折叠为 `opl stages readiness --domain <domain>` 的 advisory refs，不作为独立 launch-authority schema。
10. descriptor ready、read model 可读、generated-surface proof、provider proof 或 cleanup proof 都不等于 domain ready、artifact ready 或 production evidence complete；每个阻断或未闭合边界都必须返回 typed blocker、human gate、receipt conflict 或 route-back ref，不用 fallback verdict 补语义。

## 当前公开产品模型

- 当前主线公开模型固定为：
  - `system`
  - `engines`
  - `modules`
  - `agents`
  - `workspaces`
  - `sessions`
  - `progress`
  - `artifacts`
- `OPL` 的 session runtime 是这组资源的 canonical truth。
- `opl`、`opl exec`、`opl resume` 与 OPL-branded AionUI GUI/WebUI 必须围绕这组资源组织当前产品语义。
- `agents` 资源必须指向 admitted domain 仓的稳定 capability surface，而不是重新发明第二套 domain 协议。

## 文档分层

- `README*` 与 `docs/README*` 是默认公开入口。
- `docs/project.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`docs/status.md` 是 AI / 维护者核心工作集。
- `docs/README*` 维护的 canonical docs taxonomy 继续有效：`active/public/product/runtime/delivery/source/policies/specs/references/history`。
- 参考级与历史文档不得反向改写公开主线。
- 文档生命周期状态按内容角色判断，长期落点服从 canonical docs taxonomy。若一份文档内容已经是过时计划、旧 topology、旧入口或旧 provider 判断，即使它仍在 `docs/references/` 或被索引引用，也必须标注为 superseded / retired / tombstone 语境，并指向当前 owner surface。
- 叙述性 `README*`、`docs/**` 与参考文档不得被脚本或测试固定措辞、标题、段落或具体 prose path；需要机器约束时使用 contract/schema/source surface、CLI/API 行为、生成 artifact 或 `human_doc:*` 语义标识。
- 理想态差距、gap plan 和开发计划必须把 `功能/结构差距` 与 `测试/证据差距` 分开维护；真实运行证据、soak、coverage、no-forbidden-write proof 或 regression proof 不得被写成同一条未完成的功能缺口。
- `功能/结构差距` 以标准 OPL Agent 目标态为准；不符合目标态的现有通用功能面，即使当前可运行，也必须写成上收、generated surface 替换、收薄或退役对象。
- `当前实际` 只能作为迁移起点、风险和证据来源；不得反向约束理想态，不得把现有私有实现包装成长期设计。

## 合同面

- `contracts/` 只保留机器可读真相，不承载叙事规则。
- 修改 machine-readable contracts、公开边界或已收录领域表述时，必须同步更新文档与测试。
- admitted domain 仓对外应继续暴露本地 CLI、程序/脚本与 repo-tracked contract；`OPL` activation 只消费这些稳定 surface。

## 目标优先级

- 一旦系列项目的目标形态已经明确，新增投入默认服务该目标形态。
- 旧执行形态只能作为迁移桥、回归基线或历史记录存在；替代面成熟后直接退役，不保留兼容层。
- 当前主线禁止重新把旧本地 Product API / UI-adapter 公开语义拉回产品入口。
- 当前主线禁止恢复 `MAS` 用户安装型 standalone GitHub Release / standalone product release 叙事；MAS 的分发与安装表述必须继续落在 OPL module / Packages / git checkout / sibling repo 更新路径上，MDS 相关内容只能作为 MAS-declared optional companion provenance / audit / oracle / intake 引用出现。

## GUI 主线约束

- `OPL` 主仓跟踪 family-level session runtime、`opl` shell / TUI、release distribution 与 activation contracts，不跟踪外部 GUI 外壳实现。
- 本地 8787 `Product API` / `opl web` 模块已退役，不再作为 projection surface 或用户入口保留。
- 外部壳不得反向定义 `workspace / session / agent / progress / artifacts` 的 canonical truth。
- 外部壳不得反向改写默认 runtime 合同；GUI 定制只能建立在 Codex-default 路径之上。
- 外部产品名只能在基准、上游参考或规划中的界面目标语境出现。

## 语言规则

- `docs/**` 是中文内部开发与维护参考；稳定文档路径优先使用无语言后缀 `.md` 承载中文 canonical 内容。
- 根层 `README*` 是否保留公开双语入口，由产品分发和 public 需求单独决定；它不要求 `docs/**` 继续维护双语镜像。

## 本地工具状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为当前仓库的本地状态入口。
- 如需保留历史 session、prompt、log、hook 或执行痕迹，应迁入用户级 `~/.codex/` 归档。
