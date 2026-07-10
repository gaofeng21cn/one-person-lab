# OPL 文档组合治理

Status: `active_docs_governance`
Owner: `One Person Lab`
Purpose: `docs_lifecycle_governance`
State: `active_support`
Machine boundary: 本文是人读治理入口。机器可读真相继续归 `contracts/`、schema、source、CLI/API 行为、runtime ledger、provider receipt、domain manifest、生成产物和语义化 `human_doc:*` id。

## 当前结论

`docs/**` 是 OPL 的中文内部开发与维护参考，不再维护 docs 层双语镜像。稳定文档路径优先使用无语言后缀 `.md` 承载中文 canonical 内容。历史文档可以保留旧双语方案、旧路径和旧命令作为 provenance，但 active/reference 索引必须指向当前无后缀路径。

OPL family docs governance 的默认维护巡检范围是 11 个 repo：`one-person-lab`、`one-person-lab-app`、`opl-native-workbench`、`opl-flow`、`opl-doc`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`opl-bookforge` 和 `mas-scholar-skills`。其中严格同名 canonical docs taxonomy 适用于当前 framework / domain owner repo：OPL、MAS、MAG、RCA。OMA、BookForge、App、Native Workbench、OPL Flow、OPL Doc 和 MAS Scholar Skills 按各自 repo 职责维护轻量 docs / support / capability-pack / workflow-profile truth，不反向扩大 framework/domain canonical taxonomy。

`opl-aion-shell`、`opl-hermes-shell`、`one-person-lab-app/shells/aionui` 和 `one-person-lab-app/_external/hermes-agent` 是 upstream fork / reference body，默认只做 owner、fork 状态、overlay 边界和文档链接的 read-only 盘点。`opl-agui-codex-shell` 只作为 archived technical proof / explicit replay provenance，除非用户明确要求 AGUI replay 或历史技术验证审计，不进入默认维护、polish、release 或功能面落地巡检。

`active/public/product/runtime/delivery/source/policies/specs/references/history`

这套目录不是按“当前有没有文件”决定保留，而是按 repo 长期生命周期职责决定保留。OPL/MAS/MAG/RCA 有长期职责时，可以暂时只有 README/索引；但索引必须写清 owner、purpose、state、machine boundary、当前承载状态和新增正文准入规则。目录没有长期职责时，不进入 taxonomy。

`opl-meta-agent` 属于 OPL-compatible Foundry Agent / target-agent builder repo，`opl-bookforge` 属于 OPL-compatible authoring agent / artifact lifecycle owner repo；二者纳入 series docs governance 巡检，但不强制套用 OPL/MAS/MAG/RCA 的完整目录骨架。OMA 和 BookForge 当前可以保持轻量 docs 形态；只有当它们出现长期 public、product、runtime、delivery、source、policies、specs 或 history 内容时，才按相同生命周期规则新增对应目录索引。

`one-person-lab-app/docs/` 治理 One Person Lab App 的产品文档、release、testing、user guides 和 screenshots，纳入 family 维护巡检，但按 App 产品仓职责治理，不反向扩大 framework/domain canonical taxonomy。当前 AionUI shell 的 upstream 依赖文档归 `opl-aion-shell/docs/`，不主导 App 顶层，也不纳入 OPL/MAS/MAG/RCA 的 canonical docs taxonomy。`opl-native-workbench` 是 App-owned foreground alternative GUI candidate；Hermes Desktop / `hermes-codex` 只作为 retained explicit reference candidate；AG-UI/CopilotKit / `agui-codex` 文档只作为 archived technical proof / explicit replay provenance 维护，不进入默认开发和 polish 巡检。`one-person-lab-app/shells/aionui` 只是外部 checkout 入口，不能把 AionUI 文档历史合入 App 默认分支。OPL 主仓只记录 One Person Lab App/workbench 的目标、消费合同、action routing 和 runtime/domain truth 投影边界。

## 主参考

OPL 系列项目开发主参考是 [OPL 系列项目开发主参考](./active/opl-family-development-reference.md)。它持有：

- OPL 全局目标、全局差距、shared primitive 上收边界、App/workbench 目标、domain admission 与跨仓开发顺序；
- MAS/MAG/RCA 单仓目标、差距、authority、direct/hosted 边界和上收候选的放置规则；
- 过时模块、接口、alias、facade、聚合测试和旧文档入口的 direct retirement 规则；
- OPL/MAS/MAG/RCA canonical docs taxonomy、OMA/BookForge/App/Native Workbench/OPL Flow/OPL Doc/MAS Scholar Skills repo-specific docs governance 范围，以及非 canonical 目录迁移规则。

单仓文档只维护本仓 truth、差距、计划、authority 和与 OPL 的上收边界。MAS/MAG/RCA 不在本仓维护其他 domain 的 backlog，也不保留 parallel framework plan。

## 阅读顺序

1. 根层 `README*`：安装、启动和用户第一入口。
2. `docs/README.md`：文档入口和当前阅读路径。
3. 核心五件套：`project.md`、`status.md`、`architecture.md`、`invariants.md`、`decisions.md`。
4. `docs/active/`：当前执行、当前差距、active baton 与当前完成门槛。dated proof、receipt 流水和已完成 closeout 过程进入 `docs/history/**`。
5. `docs/runtime/`、`docs/specs/`、`docs/product/`：runtime、domain admission/shared boundary、App/workbench/product-entry 支撑。
6. `docs/source/`、`docs/delivery/`、`docs/policies/`：workspace/source、artifact/package lifecycle、稳定治理规则。
7. `docs/references/`：目标态、收敛治理、运行支撑、domain admission、样例和操作治理参考。
8. `docs/history/`：退役路线、完成计划、历史设计、tombstone 和 provenance。

## 目录职责

| 目录 | 长期职责 | 当前 OPL 承载 |
| --- | --- | --- |
| `docs/` root | 文档入口、核心五件套、docs governance | `README.md`、核心五件套、本文件。 |
| `docs/active/` | 当前执行、当前计划、当前差距、active baton、当前完成门槛 | `current-state-vs-ideal-gap.md` 是唯一 active owner；没有当前 gap 时保持薄 current-state / no-gap / next-audit baton。family 开发主参考、当前开发线路、生产闭环差距矩阵、ideal operating model、目标架构、Stage Native Kernel rollout 和设计审计只作 active support。 |
| `docs/public/` | 仓库首页之后给外部读者继续阅读的公开文档入口 | 白皮书、roadmap、task map、operating model、UHS 叙事。 |
| `docs/product/` | One Person Lab App/workbench、operator entry、product entry、action-routing shell | public surface index 与 App/workbench 消费边界。 |
| `docs/runtime/` | framework runtime、provider/executor、control plane、projection/read model、resume/wakeup、repair 语义 | runtime 命名与边界合同。 |
| `docs/delivery/` | 通用 artifact/package/export lifecycle shell、locator、restore/retention、handoff projection | artifact/package lifecycle boundary。domain delivery authority 留在 MAS/MAG/RCA；runtime artifact body 外置规则回 policies。 |
| `docs/source/` | 通用 workspace/source intake shell、locator、source readiness projection、source truth transport | workspace/source intake boundary。domain source semantics 留在 MAS/MAG/RCA；workspace state body 外置规则回 policies。 |
| `docs/policies/` | 稳定治理规则、运行纪律、repo-local 维护规则、workspace/file lifecycle | docs lifecycle policy 与 workspace/file lifecycle policy。硬约束仍以 core five 和 contracts 为准。 |
| `docs/specs/` | 当前仍有效的 domain admission、shared boundary、runtime/product boundary 规格支撑 | domain onboarding、shared runtime/domain contracts。 |
| `docs/references/` | north-star、positioning、integration、governance、verification、operating support | runtime substrate、convergence governance、current support、domain admission、operating governance。旧 examples / matrix 语料已进入 history。 |
| `docs/history/` | retired route、completed plans、tombstone、provenance、process archive | gateway/federation/frontdoor/OMX/runtime-substrate/process history。 |

## 当前长期文档台账

维护者审阅 `docs/**` 时，以本台账判断每份长期文档的唯一职责。台账没有列出的 loose 文档需要先归入某个 owner 文档、子目录索引、reference/history，或在本文补充职责后再扩写。

| 文档 | 生命周期 | 唯一职责 | 当前处置 |
| --- | --- | --- | --- |
| `docs/README.md` | `active_index` | 文档入口、阅读顺序、当前 truth 去向和历史入口导航。 | 保持入口索引；不承载新计划正文。 |
| `docs/project.md` | `active_truth` | 项目公开角色、产品分层和 admitted domain 总览。 | 核心五件套；current truth 优先。 |
| `docs/status.md` | `active_truth` | 当前状态、完成边界、差距摘要和下一步验证口径。 | 核心五件套；旧计划和过程 proof 不得覆盖。 |
| `docs/architecture.md` | `active_truth` | 顶层 runtime、activation、contract、domain-agent 和 App/workbench 边界。 | 核心五件套；当前架构 owner。 |
| `docs/invariants.md` | `active_truth` | 硬约束、不可破坏边界和 fail-closed 规则。 | 核心五件套；长期规则优先上提到这里。 |
| `docs/decisions.md` | `active_truth_with_history_notes` | 仍有效决策和被 supersede 决策的当前读法。 | 核心五件套；旧决策必须标明 superseded。 |
| `docs/active/opl-family-development-reference.md` | `active_support` | OPL 系列项目开发主参考、owner 分层、上收判断和 direct-retirement 规则。 | 保持主参考；不替代单仓 truth。 |
| `docs/active/current-state-vs-ideal-gap.md` | `active_plan` | OPL family 当前理想态读法、当前 active 功能/结构 gap、后置 evidence 指针、forbidden claims 和下一轮 baton 的唯一 active owner。 | 当前无 active gap 时保持薄 no-gap baton；已完成 gap、过程证据、dated closeout 和历史长清单进 history。 |
| `docs/active/opl-family-ideal-operating-model-redesign.md` | `active_support` | OPL family 统一 ideal operating model、`目的反推必要性，MVP 检查阻碍性` 和三类审计标准。 | 保持 active support 标准；不承载 live readiness、domain ready、App release ready 或 production ready 结论。 |
| `docs/active/current-development-lines.md` | `active_support` | 当前开发线路支撑；把工作类型映射回唯一 active owner 和长期 owner。 | 保持路线支撑；不维护独立路线图、不冻结 live counters。 |
| `docs/active/production-framework-closure-gap-matrix.md` | `active_support` | production closure 证据门支撑；解释证据如何被唯一 active owner 消费。 | 保持矩阵支撑；不维护 dated proof ledger、不声明 production ready。 |
| `docs/active/opl-foundry-agent-target-operating-architecture.md` | `active_support` | OPL / Foundry Agent 目标操作架构、ordinary progress / audit sidecar 分层、primitive、迁移阶段和验收门。 | 保持 active support；已吸收独立 Foundry OS 实施计划、ordinary progress 规划和 purpose-first 审计，不承载 live readiness 结论。 |
| `docs/active/opl-stage-native-kernel-rollout-plan.md` | `active_support` | OPL family Stage Native Kernel 设计支撑；定义 StageRun Kernel、stage manifest、role artifact、owner receipt / typed blocker、owner split、admission 分层和 forbidden claims。 | 只保留设计边界和反膨胀约束；当前落地状态、domain canary、App cockpit 和 cleanup tail 回 `current-state-vs-ideal-gap.md`，不得维护第二 active plan。 |
| `docs/active/development-document-portfolio.md` | `active_docs_support` | 开发文档组合整理和旧计划吸收/归档规则。 | 保持 active support；只管开发文档组合，不重复全仓治理。 |
| `docs/active/standard-agent-private-platform-inventory.md` | `active_inventory` | 跨 MAS/MAG/RCA/OPL Meta Agent 的 private-platform surface 分类、owner subdomain、migration gate 和 forbidden claim 台账。 | 保持分类台账；逐日拆分、line-count closeout 和具体执行流水进 history/provenance。 |
| `docs/history/process/plans/2026-06-01-standard-agent-design-consistency-audit.md` | `history_provenance` | 2026-06-01 MAS/MAG/RCA/OMA 同源设计和历史残留审计快照。 | 只作过程审计；当前结构同源结论回 live conformance/descriptors/default-caller surfaces 与 active inventory。 |
| `docs/history/process/plans/2026-06-03-opl-family-purpose-first-design-audit.md` | `history_provenance` | 2026-06-03 OPL family purpose-first 顶层设计审计快照。 | 只作过程审计；当前 owner、gap、下一步和完成口径回 active gap plan、closure matrix 和核心五件套。 |
| `docs/history/process/plans/2026-06-04-opl-foundry-agent-mvp-friction-audit.md` | `history_provenance` | 2026-06-04 OPL Foundry Agent MVP friction 诊断、fresh evidence 和阻力分类快照。 | 只作历史诊断；当前目标操作架构、迁移阶段和验收门回 active target architecture，当前 gap 回 active gap plan。 |
| `docs/history/process/plans/2026-06-30-opl-family-functional-gap-closure-foldback.md` | `history_provenance` | 2026-06-30 legacy family scope 非 live 功能/结构 gap closure 后 active gap 收薄的折返摘要。 | 只作历史折返和 no-resurrection guard；当前 gap、baton 和后置 evidence 指针回 active gap plan 与 live evidence 维护入口。 |
| `docs/public/*` | `public_support` | 外部读者公开入口；白皮书、roadmap、task map、operating model 和 UHS 叙事。 | 保持 public 支撑；不作为实现 backlog、release/readiness proof 或 owner receipt。 |
| `docs/product/README.md` 与 `docs/product/opl-public-surface-index.md` | `active_support` | App/workbench、operator/product entry、public surface 与 action routing 边界。 | 保持 product 支撑；App release truth 回 App 仓和 artifact。 |
| `docs/runtime/opl-runtime-naming-and-boundary-contract.md` | `active_support` | Codex-default executor、Temporal provider、explicit executor adapter 与 retired runtime vocabulary 边界。 | 保持 runtime 支撑；机器 truth 回 contracts/source/CLI/runtime ledger。 |
| `docs/delivery/artifact-package-lifecycle-boundary.md` | `active_support` | 通用 artifact/package/export lifecycle shell 与 domain delivery authority split。 | 保持 delivery 支撑；不写 domain verdict。 |
| `docs/source/workspace-source-intake-boundary.md` | `active_support` | 通用 workspace/source intake shell 与 domain source semantics split。 | 保持 source 支撑；不写领域 source truth。 |
| `docs/policies/docs-lifecycle-policy.md` | `active_policy` | docs taxonomy、中文 canonical 和 direct-retirement 政策。 | 保持 policy；硬约束必要时同步 `invariants.md`。 |
| `docs/policies/runtime-artifact-hygiene-policy.md` | `active_policy` | workspace / file lifecycle、repo-source 边界、developer checkout hygiene 和运行生成物外置政策。 | 保持 policy；source/delivery/runtime 文档只解释各自边界，不复制完整生命周期规则。 |
| `docs/specs/*` | `active_spec_support` | 当前仍有效的 domain admission、shared runtime/domain 和 boundary specs。 | 保持 specs 支撑；机器合同仍回 `contracts/`。 |
| `docs/references/runtime-substrate/opl-family-agent-ideal-state.md` | `active_support` | OPL Framework、Foundry Agents 与 App 的 north-star 目标态。 | 主参考；不能写成当前完成事实。 |
| `docs/references/brand-modules/*` | `support_reference` | OPL 当前品牌模块的 north-star、模块边界、设计理念和 L1-L5 成熟度对照。 | 保持支撑参考；核心五件套持有顶层意识和当前状态，active gap 持有当前推进口径；brand module reference 不作为 runtime truth、domain truth、release/install evidence、owner receipt、typed blocker 或 production maturity 证据。 |
| `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` | `active_support` | stage-led framework roadmap、runtime substrate 与旧面退役顺序。 | 保持 roadmap；状态需服从 core five 和 fresh evidence。 |
| `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md` | `support_reference` | AI-first / executor-first 长期调研提示词、成熟框架经验吸收规则、OPL/MAS/MAG/RCA/OMA 设计审计重点和下一轮 conformance / evidence 优化方向。 | 保持参考入口；不作为 current truth、runtime dependency 决策或 production ready 证据。 |
| `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md` | `active_support` | Temporal-backed provider 生产在线必需 substrate 的支撑参考和动态证据读法。 | 保持 provider 支撑；不能替代 domain owner soak 或 domain verdict。 |
| `docs/references/runtime-substrate/family-executor-adapter-defaults.md` | `active_support` | 默认 `Codex CLI` 与显式非默认 executor adapter 边界。 | 保持 executor 边界；`hermes_agent` 只能是显式非默认 backend。 |
| `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md` | `history_boundary_support` | Hermes 命名/迁移边界和旧 Hermes-first 误读 provenance。 | 因 stale-compat guard 与 executor 边界仍保留路径；不得读作 provider/readiness/Gateway/compatibility 计划。 |
| `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md` | `support_reference` | `hermes_agent` 显式非默认 executor adapter 的评估条件。 | 不影响默认 executor，不声明行为等价。 |
| `docs/references/runtime-substrate/opl-managed-runtime-three-layer-contract.md` | `contract_linked_support` | shared managed-runtime 三层 owner split 的人读边界。 | 因 machine contract / tests 仍引用而保留路径；旧 Hermes/upstream runtime owner 读法已过时。 |
| `docs/references/runtime-substrate/opl-runtime-manager-target.md` | `support_reference` | Runtime Manager 的 provider readiness、native helper、state index 与 operator projection 边界。 | 只做产品级管理与投影支撑；不替代 provider 或 domain truth。 |
| `docs/history/runtime-substrate/retired-decisions-history.md` | `history_provenance` | 从 `docs/decisions.md` 迁出的 Hermes-first、gateway/federation、Product API、frontdoor / GUI 分仓和旧 runtime sidecar 决策叙事。 | 只作历史来源和 no-resurrection guard；当前决策回 `docs/decisions.md`、runtime 命名边界和 App-owned evidence。 |
| `docs/references/current-support/*` | `support_reference` | 安装、GUI/WebUI、release、skills、测试和质量操作参考。 | 保持支撑参考；行为 truth 回命令、合同和 artifact。 |
| `docs/references/convergence-governance/*` | `support_reference` | 当前仍有效的收敛治理规则、文档生命周期 playbook、intake 模板、shared release 维护和 stage control plane 支撑。 | 单次 rollout、dated execution board、closeout evidence 和已被 taxonomy 吸收的同步记录进入 history；有效规则上提后才可作为当前治理依据。 |
| `docs/history/process/convergence-governance/*` | `history_or_tombstone` | 早期四仓同步、executor follow-up、用户面成熟度、文档治理 rollout、产品分层 closeout 和外部 orchestration learning 的历史快照。 | 只作 provenance；不得恢复为 active roadmap、manifest 要求、provider/readiness path 或 compatibility surface。 |
| `docs/references/operating-governance/*` | `support_reference` | quality、operator projection、memory governance、family governance 和 structure advisory 稳定读法支撑。 | 保持支撑参考；fresh generated counts、line lists、public-surface risk 列表和 dated structure snapshots 留在命令输出或 history/provenance，不复制进 active/reference 正文；gateway-derived 旧 matrix 留 history。 |
| `docs/references/operating-governance/family-live-evidence-maintenance.md` | `support_reference` | OPL family live / production / release / owner-evidence lane 的独立维护入口。 | 保持 live evidence 后置读法；active gap / ideal-state / active development 文档只保留功能面、结构面、历史遗留清理和 owner-route 指针，不维护 live receipt/run/cohort 流水。 |
| `docs/references/domain-admission/*` | `support_reference` | candidate backlog 和准入支撑参考。 | 保持 reference；正式准入规则回 specs。 |
| `docs/history/**` | `history_or_tombstone` | 退役路线、完成计划、frontdoor/gateway/federation/OMX/process provenance。 | 不作为 active owner；有用结论先吸收再保留原文。 |

## 内容审计收口

当前审计规则固定为：

- 主文档只记录最新情况、当前差距、当前 owner boundary 和当前完善顺序。
- Active gap / status / inventory 文档只允许保留当前 owner、当前状态、evidence gate、next action 和 forbidden claim；不得继续逐轮追加 receipt ref、cohort ref、attempt id、branch/worktree、line-count closeout、safe-action record/verify 流水或历史 counter。当前没有 gap 时，active gap 文档必须收薄为 no-gap / current-state baton，不得把已完成任务改写成长期 active 表。
- Stage Native Kernel 这类设计支撑文档可以保留对象模型、owner split、admission 分层和 forbidden authority 规则；当前落地状态、canary、迁移层次和 cleanup tail 必须回唯一 active owner，不能让支撑文档继续维护第二执行路线。
- dated follow-through、closeout 流水、receipt/proof 命令摘要和阶段性校准过程进入 [OPL family 文档过程归档 2026-05](./history/process/plans/2026-05-18-opl-family-doc-process-history.md) 或其他 `docs/history/**`。
- `docs/decisions.md` 可以保留决策日期日志，但被 supersede 的段落必须显式标注当前读法。
- path-stable reference/spec 如果仍因 contract、human_doc 或 audit context 保留原路径，必须在索引或文件开头说明生命周期；不得恢复旧 provider、Gateway、frontdoor、compatibility、direct-entry 或 host-agent-only 叙述为 active plan。
- 2026-06-03 起，`docs/active/current-state-vs-ideal-gap.md` 是 compact active gap plan；它不再承载 dated App/runtime/domain evidence ledger。相关归档见 [OPL Active Gap Plan Lifecycle Cleanup](./history/process/plans/2026-06-03-opl-active-gap-plan-lifecycle-cleanup.md)。2026-06-30 的历史折返仍按 legacy family scope 读取；当前维护巡检按 11 个 maintained repo 读取，并让 active gap 文档只保留 no-gap baton、后置 evidence 指针和 fresh-audit 入口。已完成功能/结构推进折回 [OPL family functional gap closure foldback](./history/process/plans/2026-06-30-opl-family-functional-gap-closure-foldback.md)。
- 用户原始 8 条调研建议的当前 tracker 只允许作为 `current-state-vs-ideal-gap.md` 内的 compact audit index：保留主题、当前功能 / 结构闭环、后置 owner/evidence lane 和 completion audit 入口；不得追加 branch/worktree、receipt id、attempt id、workflow run、closeout transcript 或逐轮 readback proof。若某条建议重新变成 active gap，必须从 fresh repo truth 另开 lane，并把过程写入 history / runtime ledger / owner repo provenance。

## 维护仓治理范围与目录状态

| 仓库 | 当前判断 |
| --- | --- |
| `OPL` | 完整保留 canonical 目录集合；runtime/spec/product/source/delivery/policies 内容按当前生命周期职责归位，不按空目录或历史批次判断。 |
| `MAS` | 完整保留 canonical 目录集合；`active/runtime/delivery/policies/references/history` 已真实承载，`product/public/source/specs` 可先保持薄索引，后续按真实 owner surface 吸收。旧 `program/`、`capabilities/` active 目录已物理退役，历史内容留在 `docs/history/`。 |
| `MAG` | 完整保留 canonical 目录集合；真实 owner 主要在 core five、`active/`、`references/`、`specs/`、`history/`，`product/runtime/delivery/source/policies/public` 先作为职责明确的薄索引，后续小批量吸收仍 current 的内容。旧 `plans/` 已退役。 |
| `RCA` | 完整保留 canonical 目录集合；`active/product/runtime/delivery/source/policies/references/history` 已真实承载，`public/specs` 可以保持薄索引。旧 `program/`、`plans/`、`capabilities/` 不复活成 active 目录。 |
| `OPL Meta Agent` | 纳入维护巡检；当前保持轻量 docs root / active / references 形态。只有当 target-agent builder 职责产生长期 public、product、runtime、delivery、source、policies、specs 或 history 内容时，才新增对应目录索引。 |
| `OPL BookForge` | 纳入维护巡检；按 authoring agent / artifact lifecycle owner 职责维护 active truth、history/provenance 和必要 reference。只有当长期 public、product、runtime、delivery、source、policies、specs 或 history 内容稳定出现时，才新增对应目录索引。 |
| `One Person Lab App` | 纳入维护巡检；App docs 归产品、release、testing、user guides 和 screenshot lifecycle。App release truth、GUI product truth、GUI candidate policy 和 active-shell validation 回 App repo 自身 contracts/source/tests；AionUI upstream docs 不合入 App 默认分支，也不主导 OPL framework/domain taxonomy。`opl-native-workbench` 是 foreground alternative；Hermes Desktop 是 retained explicit reference candidate；AGUI 只作为 archived technical proof / explicit replay provenance。 |
| `OPL Native Workbench` | 纳入维护巡检；作为 native GUI / workbench candidate 的 repo-native truth 读取，只对 App / Framework canonical `app_state`、`action_refs`、package/runtime/task projection 的消费边界负责，不声明 App release ready 或 runtime ready。 |
| `OPL Flow` | 纳入维护巡检；只持有 workflow profile、managed surface sync 和 repo profile drift 检查边界，不替代目标 repo 的 source/contracts/docs/runtime truth。 |
| `OPL Doc` | 纳入维护巡检；只持有 docs doctor、support repo policy、family-plan workflow 和文档治理工具边界，不成为 OPL family domain/App/runtime truth。 |
| `MAS Scholar Skills` | 纳入维护巡检；当前维护仓是 `mas-scholar-skills`。历史 `opl-scholarskills` 只作 tombstone/provenance alias；能力源、Skill source 和 capability-pack truth 回 MAS Scholar Skills repo，不作为 standard domain agent truth。 |

## 内容级整合规则

文档生命周期按内容判断，不按文件名、日期或目录名自动判断。维护时先拆分同一文件中的几类内容：

1. 当前事实合入核心五件套、当前 owner doc、contracts/schema/source 或 runtime/generated surface。
2. 当前执行、当前差距、active baton 和当前完成门槛留在 `docs/active/`。
3. Runtime、product、source、delivery、policy、spec 这类长期 owner 内容进入对应 canonical 目录。
4. 目标态、外部学习、governance、verification、operator support 进入 `docs/references/`，不得写成 current truth。
5. 已完成计划、旧路线、旧接口、旧 provider、旧 gateway/frontdoor/federation、旧 compatibility 叙事进入 `docs/history/` 或 tombstone。
6. 如果文件仍有 current subsection、contract-linked reader context 或 active support role，可以留在 current/support 层并用 README/index 标清生命周期。
7. 如果文件已被判定为纯历史、纯 activation package、纯 fail-closed tranche、纯旧 provider proof 或纯 tombstone，不再靠 path stability 留在 current/support 层；先把有效结论吸收到当前 owner，再物理移动到 `docs/history/**`。

长清单治理单独按下面规则执行：

- active 文档中的表格只保留当前 owner、当前状态、下一步 gate 和完成口径；不再逐轮追加 dated proof、closeout 命令、旧分支名或历史 batch。
- active inventory 文档只保留分类维度、owner subdomain、迁移门和当前 high-risk surface group；逐文件 line-count 变化、拆分过程和某次 worktree closeout 进入 `docs/history/**`。
- 同一文档内不能同时承担 target state、current truth、active plan、proof ledger 和 history narrative。发现混用时，目标态进 `docs/references/`，current truth 进核心五件套或 owner doc，执行计划进 `docs/active/`，过程流水进 `docs/history/**`。
- 已闭合的 lane 只在 active 文档保留一行“当前守门面 / 后续回归口径”；完整来龙去脉进入 history/provenance。
- 如果一张表超过“当前执行决策”需要的粒度，先合并成 capability / owner / evidence gate 三列，再把原始逐条记录归档。
- 任何长清单都不得把 descriptor ready、read model ready、provider proof、generated bundle ready 或 cleanup ledger ready 写成 domain production ready。

## Direct Retirement

过时模块、接口、CLI alias、wrapper、facade、聚合测试和旧文档入口被当前 owner surface 替代后，默认直接退役：

1. 搜 active caller、contract refs、`human_doc:*`、fixture/provenance 需求。
2. active caller 存在时先迁移到最新 owner surface。
3. caller 迁完后删除旧模块、接口、alias、wrapper、facade 或 compatibility-only aggregate test。
4. 需要保留来龙去脉时，放入 `docs/history/`、tombstone 或明确 provenance/reference。
5. 不新增兼容 shim、别名、re-export facade 或只为旧入口存在的聚合测试。

文档归档不能替代内容清理。旧内容必须吸收、归档或删除，避免在 active/reference 层二次污染新规划。

## 机器边界

`README*`、`docs/**` 与参考文档是人读面。代码、测试、contracts、dashboard 或 runtime 不得把 prose path、Markdown 章节或文案当成稳定机器接口。确需关联人读材料时，使用 contract/schema/source 路径或语义化 `human_doc:*` id。

允许测试的对象是 contracts、schemas、CLI/API 行为、source paths、generated artifact structure、manifest、runtime receipt、`human_doc:*` id 和 machine-readable index。不要新增固定 Markdown wording、章节标题、叙述路径或状态文案的测试。

## 新文档准入

新增长期文档前先回答：

| 问题 | 决策 |
| --- | --- |
| 是否决定当前执行顺序、差距、baton 或完成门槛？ | 放 `docs/active/`。 |
| 是否面向 public narrative / roadmap / task map / operating model？ | 放 `docs/public/`。 |
| 是否面向 App/workbench、operator/product entry、profile 或 action routing？ | 放 `docs/product/`。 |
| 是否解释 runtime/provider/executor/control plane/projection/watch/repair？ | 放 `docs/runtime/`。 |
| 是否解释 artifact/package/export lifecycle shell 或 domain deliverable support？ | 放 `docs/delivery/`。 |
| 是否解释 workspace/source intake、source readiness 或 source truth transport？ | 放 `docs/source/`。 |
| 是否是长期规则、repo-local discipline、developer checkout hygiene 或 workspace/file lifecycle 政策？ | 放 `docs/policies/`，必要时同步 `invariants.md`。 |
| 是否定义当前 active spec 或 boundary spec？ | 放 `docs/specs/`。 |
| 是否是目标态、支撑参考、外部学习、governance 或 verification support？ | 放 `docs/references/`。 |
| 是否只是旧路线、完成计划、provenance 或 tombstone？ | 放 `docs/history/`。 |

无法归类的文档不得直接新增到 active 层；先更新本治理文档或对应目录 README。
