# 合同目录说明

Owner: `One Person Lab`
Purpose: `contract_surface_support_index`
State: `active_support`
Machine boundary: 本文是人读合同目录说明和边界索引。机器 truth 继续归 contracts 下的 JSON / schema 文件、source、tests、CLI/read-model、runtime ledger 和 provider/domain receipts。

这个目录只保留 `OPL` 的 machine-readable contract surface 与其目录说明。

- narrative 协作规则看仓库根 `AGENTS.md`
- 默认人类/AI 入口看 `README*` 与 `docs/README*`
- 当前 OPL framework 合同入口看 `contracts/opl-framework/README.md`
- 当前产品认知按 `OPL Framework -> One Person Lab App -> Foundry Agents` 阅读：Framework 持有合同与运行控制面；App 持有 GUI product truth、release gate 和 active-shell validation，并消费这些合同做用户工作台；`opl-aion-shell` 是当前 App-owned GUI contract 的 implementation carrier；MAS/MAG/RCA 等 Foundry Agents 声明并适配这些合同但不内嵌一份 OPL runtime
- 当前公开默认主路径是 `One Person Lab App or CLI -> Codex CLI first-class executor -> OPL activation / stage-attempt projection layer -> Temporal-backed family runtime provider -> selected domain agent entry`。普通 App path 是 `Codex App wrapper`：固定 `Codex CLI` executor，并以内置 MAS/MAG/RCA Foundry Agent task entry 呈现工作；AionUI backend / Agent selector 与非默认 executor adapter 只属于显式 developer/operator diagnostic 或 stage binding。Full OPL family readiness 的 online runtime substrate 是已配置且 ready 的 Temporal provider，Hermes-Agent 在 provider/readiness/compat 语境只作为历史 provenance、参考材料、诊断语料或负向 guard，`hermes_agent`、`claude_code` 与 `antigravity_cli` 同属 canonical 显式非默认 executor adapter/backend，只承诺接口、生命周期、receipt、audit 与 fail-closed gate，不承诺质量、工具语义或 resume 与 `Codex CLI` 等价；`local_sqlite` 只作为 retired-provider negative guard，SQLite sidecar 只作为 projection/readback index
- 当前 active domain agent 集合是 `MAS`、`MAG`、`RCA`；`MDS` 只作为 `MAS` 下的显式可选 backend/audit/oracle companion 进入环境管理和投影，不作为默认安装依赖或顶层 domain-agent entry。
- 已退役的旧入口词族不是 OPL 当前合同面；若只在历史 gateway 语料或 domain 仓内部 command/schema contract 中出现，必须按对应层级阅读。

## 合同下限 8 原则

这些原则解释 contracts 目录的边界：OPL 是 `AI-first / executor-first / Codex-first` 的 stage-led framework，合同只保下限，不把智能行为写死。

1. **真相归主**：领域事实、质量裁决、产物权威、owner receipt 和 typed blocker 留在对应 owner。OPL 只运输 locator、refs、prompt-context refs、receipt 和 projection，不能把 memory ref、read model、generated surface、provider proof 或 cleanup proof 做成 recipe engine、route scorer、winning-path generator、controller source、quality gate、domain ready、artifact ready 或 production ready。
2. **抓大放小**：Stage 启动 hard stop 只覆盖错误目标 identity、实际不可用的 selected executor、安全/权限/authority、不可逆动作与明确 human decision。composition、event、receipt、capacity、monitor、assumption、cohort、replay 和 review 缺口只进入 quality debt / attention / drilldown，不作为 launch authority。
3. **目标先于路径**：用户目标、owner decision、human gate、artifact delta 或可接力结果决定 runtime、queue、stage、docs、测试和修复路径；contracts 是路径约束，不是目标交付本身。
4. **AI-first, contract-light**：AI-first / executor-first 执行不被静态合同写死。`Codex CLI` 是默认 selected executor；`hermes_agent`、`claude_code`、`antigravity_cli` 或其他 executor adapter 只能通过 request、stage attempt 或 handoff 显式绑定，并以 `executor_binding_ref`、receipt / audit / fail-closed 证明连接。合同只绑定 prompt、skill、tool affordance boundary、knowledge refs、expected receipt 和 authority boundary；工具目录是 affordance catalog，不规定 executor 必须何时、为何、按什么顺序使用工具。
5. **阶段交付，交付即推进**：Stage pack 是启动单位；OPL 准入并启动 stage，不启动自由形态 workflow script。`requires` / `ensures` 组合在启动前检查；domain judgment 仍是 runtime / domain-owned 结果。独立 AI stage、domain-owned quality gate、owner receipt、typed blocker 或 route-back verdict 才能替代 advisory 信号。
6. **单源派生，薄入口**：关键合同、路由、状态和描述符从 canonical source 派生到 CLI、API、App、Skill/plugin、MCP、文档和报表。`verified_static_core` 只覆盖 identity、owner、refs、scope、composition 与 forbidden-authority 约束。
7. **结构收敛，历史退役**：当前责任面替代旧入口后，旧合同、alias、facade、wrapper、兼容测试和过时文档应删除、归档或 tombstone；历史只保留 provenance，不继续作为 active contract 路径。
8. **证据匹配风险**：`runtime_enforced_boundary` 覆盖 AI 输出、人类决策、外部系统、artifact mutation、memory writeback 与 domain verdict。descriptor ready、read model 可读、generated-surface proof、provider proof 或 cleanup proof 都不等于 domain ready、artifact ready 或 production evidence complete；每个阻断或未闭合边界都必须返回 typed blocker、human gate、receipt conflict 或 route-back ref。

`evidence_requirement.v1` 是上述第 10 条的 canonical requirement payload：每条 requirement 都必须携带 `not_authorized_claims`、`requirement_is_completion_claim=false`、`can_claim_domain_ready=false`、`can_claim_production_ready=false` 与 `can_claim_artifact_authority=false`。下游即使只消费 requirement ledger，而不读取完整 worklist item，也不能把 open route、closed refs-only receipt、provider / cleanup receipt 或 domain-owned typed blocker 解释成 domain ready、artifact authority、production ready 或任务完成声明。

## Surface Budget

当前新增 surface 的默认治理规则由 `contracts/opl-framework/surface-budget-policy.json` 冻结，并由 `contracts/opl-framework/public-surface-index.json` 中每个 surface 的 `surface_budget` envelope 逐项声明。它把 OPL 默认面限制在 `Minimal Trust Kernel + Stage Strategy Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`：普通 operator / App 默认看 `opl framework readiness --family-defaults --json`，stage 默认聚合看 `opl stages readiness --family-defaults --json`；`stages readiness --domain <domain>` 与 `stages graph|proof-bundle|assumptions|cohort-loop|runtime-budget|registry|source-spec|replay-certification` 只作为显式 diagnostic drilldown。`Stage Strategy Kernel` 的机器边界由 `contracts/opl-framework/cognitive-computation-kernel.json` 冻结，尤其是 `tool_affordance_boundary`：工具目录是 affordance catalog，不是工具流程脚本。

新增能力只有满足以下任一条件，才允许升级为 default surface：影响 launch safety、影响 authority boundary、影响 evidence / replay / audit / route-back，或已经被 App / runtime 反复消费。升级为 hard gate 还必须证明缺失会造成错误启动、越权或不可审计 / 不可恢复。其他外部学习点、论文模式、单消费者诊断和 workflow preference 只能进入 refs、warning、diagnostic lens、reference 或 history。

当前保留的 repo-tracked machine-readable truth：

- `contracts/opl-framework/*.json`：当前 stage-led OPL framework、App consumer surface、Foundry package/domain-agent catalog、runtime 与 supporting-surface contract
- `contracts/opl-framework/brand-module-registry.json`：当前 OPL 品牌模块的机器注册表；`opl brand-modules list|inspect|maturity|validate|interfaces --json` 从这里派生，作为聚合目录与成熟度总览。
- `contracts/opl-framework/brand-cli-governance.json`：品牌模块 command surface 与 domain-agent internal module spine 治理；它约束 `opl agents modules * --json` 和 Workspace validate/doctor/interfaces 的碰撞边界。
- `contracts/opl-framework/brand-module-surfaces.json`：当前 OPL 品牌模块的自身 executable surface 合同；`opl charter|atlas|workspace|pack|stagecraft|runway|ledger|console|foundry-lab|connect status|inspect|interfaces|validate|doctor --json` 从这里派生，证明模块级 Workspace-level `L4_structural_baseline`，但不声明 domain ready、quality verdict、artifact authority、production ready、owner receipt、typed blocker 或 App release truth。
- `contracts/opl-framework/brand-module-l5-operating-evidence.json`：当前 OPL 品牌模块的 L5 operating-evidence 矩阵；`opl brand-modules l5-status|l5-validate|l5-interfaces --json` 与 `opl <module> l5-status --json` 从这里派生。它只证明 L5 证据门可执行、可验证、可维护，不能把 docs foldback、contract validation、provider completion、App projection 或 conformance pass 单独升级成 `L5 production operating maturity`。
- `contracts/opl-framework/target-operating-architecture-contract.json`：OPL family 顶层目标操作架构合同；它冻结标准资源模型、Codex CLI 单一 stage 语义路由 owner、Domain Pack + generated surfaces + authority ABI、passive transport/currentness projection、Atlas/Ledger telemetry、App Console 默认字段与 Agent Lab refs-only improvement 边界。
- `contracts/opl-framework/advisory-knowledge-boundary-contract.json`：OPL family advisory knowledge 边界合同；它固定 MAS Publication Strategy Memory / MAG grant strategy memory / RCA visual pattern memory / Book Forge reference/style memory / OMA external-learning memory 这类 Markdown 经验只作为 reference-only prompt context，正文、accept/reject、route judgment、quality/export/publication verdict、owner receipt 和 typed blocker 仍归 domain 仓。该合同同时冻结 `gate_intent`：`context` / `advisory_check` 只能进入参考建议或软缺口，`claim_gate` / `authority_gate` 才能进入硬 owner gate，且必须绑定具体 claim/source/owner authority ref。
- `contracts/opl-framework/surface-budget-policy.json`：AI-first、contract-light 的 surface budget 机器政策；它限制 default surface / hard gate 的升级条件，并防止 diagnostic lenses 或旧 capacity/domain-validity 面回到普通 help/docs 入口
- `contracts/opl-framework/public-surface-index.json`：active public surface 索引；每个 surface 必须声明 `surface_budget`，包括 default 状态、允许理由、promotion evidence refs、consumer refs 和不得声明 domain ready / quality verdict / artifact authority / production ready / executor planning / domain owner 的 authority false flags
- `contracts/opl-framework/README.md`：这些 active JSON contract 的人类可读说明
- `contracts/opl-framework/runtime-manager-contract.json`：当前 OPL Runtime Manager 产品控制面合同；它冻结 OPL 如何管理 provider-backed family runtime、stage-attempt request/projection、stage attempt ledger、domain dispatch、可选 native helper lifecycle、高频状态索引、prebuild/cache 策略与 freshness 口径，同时明确不复制 runtime kernel
- `contracts/opl-framework/family-runtime-online-substrate-contract.json`：provider-backed family runtime 合同；它冻结 Temporal 唯一 runtime provider、retired `local_sqlite` negative guard、stage-attempt projection index、degraded diagnostic mode 与 forbidden authority
- `contracts/opl-framework/stage-route-transport-contract.json`：OPL stage/route 顶层调度合同；它固定 stage graph、owner-route hydration、reconciliation loop 与 attempt ledger 四层模型，明确 stage 是 OPL attempt 单元，route 是 domain owner 语义，不是小 stage
- `contracts/opl-framework/cognitive-computation-kernel.json`：OPL 认知计算内核合同；它固定 Stage 内 candidate generation、reflection / review、comparative selection、evolution / revision、meta-review / learning、tool affordance boundary、knowledge 和独立 quality gate 的 refs-only 组织边界，同时明确工具目录不是流程脚本、Route 不是小 Stage、OPL 不持有 domain truth 或质量裁决
- `contracts/opl-framework/state-index-kernel-contract.json`：OPL State Index Kernel 合同；它冻结 File Truth + SQLite Sidecar Index + Temporal Runtime 分工，规定 SQLite 只做可重建 queue/attempt/lifecycle/artifact/lineage/outbox/read-model 索引，不存 domain truth、memory body、artifact body、owner receipt authority、quality/export verdict 或 production readiness
- `opl index doctor|rebuild|checkpoint|integrity-check|backup --json` 是该合同的 OPL-owned SQLite sidecar 维护面；它只维护 `${OPL_STATE_DIR}/family-runtime/{queue,lifecycle-index,artifact-index,read-model}.sqlite`，其中 `queue.sqlite` 是兼容文件名，语义是 `stage_attempt_index`；`artifact-index.sqlite` / `read-model.sqlite` 初始化为 refs-only projection tables。标准 Foundry Agent 默认通过 `contracts/stage_artifact_kernel_adoption.json#/opl_state_index_kernel_adoption` 声明 OPL-owned deferred sidecar 的消费边界；旧根合同只作显式兼容读取，不由 scaffold 生成。`opl agents conformance` 允许为 domain truth / visual / artifact / receipt 写入格式正确且为 `true` 的 domain ownership declaration，但会阻止 SQLite truth store、artifact body store、owner receipt authority、未知字段或私有 generic persistence engine。
- `contracts/opl-framework/native-helper-contract.json`：OPL Rust native helper 的 JSON stdio 合同；它冻结 `opl-sysprobe`、`opl-doctor-native`、`opl-runtime-watch`、`opl-artifact-indexer` 与 `opl-state-indexer` 的输入输出边界，以及 helper 的 build / doctor / repair / prebuild / package 分发面。`owner_split.domain_truth_owners` 由 `src/kernel/standard-agent-registry.ts` 的 `standard_domain_agent` 成员投影，ScholarSkills 等 capability package 不进入该列表
- `contracts/opl-framework/fresh-install-test-matrix.json`：OPL fresh install 与 GUI 首启验证矩阵；它冻结 CLI clean-room 场景、首启 JSONL 日志、GUI accessibility labels 与 VM 工件要求
- `contracts/family-orchestration/*.schema.json`：跨 active 四仓线（`one-person-lab` + `MAS` + `MAG` + `RCA`）统一的 family orchestration companion schemas
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json` 与 `family-stage-graph-projection.schema.json`：OPL-owned stage-pack proof / graph read models；它们投影 composition、receipt/runtime-event refs、guarantee modes 与 integrity digest，只供 scheduler / App 消费，不执行 stage、不写 domain truth、不授权 readiness 或 quality verdict
- `contracts/family-orchestration/family-stage-integrity-metadata.schema.json`：OPL-owned stage-level integrity / claim-support / evidence-handoff / data-access / human-checkpoint metadata companion；它只做通用 framework metadata projection，不持有 MAS/MAG/RCA domain truth、质量裁决、publication/fundability/visual authority、artifact authority 或 direct skill path；legacy citation-support 只作为 profile alias 读取
- `contracts/family-orchestration/stage-candidate-portfolio.schema.json`：OPL-owned refs-only stage candidate portfolio companion；它只承载 candidate、assumption decomposition、provenance check、negative/failed path、ranking/proximity/advisory metric 与 human review refs/status，不持有 domain truth、quality verdict、artifact authority、candidate acceptance 或 owner receipt authority
- `contracts/family-orchestration/README*.md`：这些 family orchestration schema 的人类可读说明

围绕这些 machine-readable contract 的上位共享合同，当前统一在 `docs/` 层维护：

- `docs/specs/shared-runtime-contract.md`：跨 domain 共享的长期在线运行合同人读支撑
- `docs/specs/shared-domain-contract.md`：跨 domain 共享的正式行为合同人读支撑

其中：

- `family event envelope`
- `family checkpoint lineage`

属于 runtime-oriented 的 companion contract；

- `family action graph`
- `family human gate`
- `family product-entry manifest v2`
- `family runtime supervision`
- `family persistence policy`
- `family lifecycle ledger`
- `family owner route`

属于 domain-oriented / control-plane-oriented 的 companion contract。

这些 schema 只冻结跨仓 orchestration 语义，不引入 CrewAI/LangGraph 等第三方框架作为 family runtime dependency，也不改写 `Hermes-Agent` / `Codex CLI` / `domain-owned truth` 的 owner 边界。

这里不再保留 narrative 的 `project-truth/AGENTS.md` 层。
