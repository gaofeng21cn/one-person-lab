# OPL 开发文档组合整理

State: `active_support`

Status: `active_support`
Owner: `One Person Lab`
Purpose: 按当前 ideal operating model 定位，逐文档、逐内容整理 OPL 开发文档的当前角色、吸收关系、归档规则和 active owner 落点。
Machine boundary: 本文是人读开发文档组合入口。机器真相继续归 `contracts/`、source code、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/workbench projection 和真实验证 evidence。

## 当前结论

OPL 开发文档现在不能按“每份旧计划都继续完整执行”阅读。当前主线已经收敛为 framework-first：

1. 先完成 OPL 作为 stage-led、以 Agent executor 为最小执行单位的完整智能体框架的 framework foundation。
2. 再让 MAS/MAG/RCA 迁移为 OPL-admitted domain agents，保持 direct skill path 与 OPL-hosted path 等价。
3. 同步把旧功能逐块分层：framework-generic 能力上收到 OPL，domain truth 留在 domain，退役路线只保留为历史诊断、provenance、tombstone 或负向 guard。
4. 旧 Hermes-default、Gateway-era、direct-entry、local-manager、MDS-default 等路线在替代证据存在后立即退役清理；无 active caller 的模块、接口和测试直接删除或迁入 tombstone，不保留兼容入口。
5. 最后用 App workbench 和真实 domain soak 验证目标形态，而不是用旧路径证明旧计划。

因此，开发文档的整理原则是：**保留有效内容，合并到当前 owner；旧文档不再作为整份待办执行；旧路线保留为 provenance、migration reference 或 tombstone。**

本文历史记录中的 `framework readiness`、`family-runtime evidence-worklist`、App/operator drilldown 等 read-model 计数都是当轮 dated evidence；当前 open worklist、payload-required / payload-free、domain-dispatch workorder、domain ready 和 production ready 状态必须重新读取 live CLI/read-model，不能从旧批次数字继承。

## Active Owner 落点

当前执行目标、ideal-operating-model redesign foldback 状态和 active-goal baton 只回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。本文不再给出独立执行顺序，只定义旧开发文档内容应归到哪个 owner surface，避免多条 active 线并行复活。

2026-06-11 单一真相整理后，`docs/active` 的 live gap 只由 `current-state-vs-ideal-gap.md#active-planning-gap-register` 维护。其他 active/support 文档里的 P0-P5、W0-W7、audit lane、rollout phase、matrix row、external-practice checklist 或 closeout wording 都只能作为设计标准、验收词表、证据解释或历史归位输入读取；它们不得直接升级成第二 backlog、第二执行顺序或第二 completion truth。

| 内容线路 | 归属 owner 文档 | 当前含义 | 折回信号 |
| --- | --- | --- | --- |
| `opl_framework_foundation` | [当前状态与理想目标差距](./current-state-vs-ideal-gap.md)、runtime contracts、Temporal provider references | stage attempt、provider runtime、stage-attempt request/projection、wakeup、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive。 | provider-backed stage attempt 可恢复、可查询、可投影，且不写 domain truth。 |
| `domain_framework_migration` | [当前状态与理想目标差距](./current-state-vs-ideal-gap.md)、[Domain-Agent Admission Contract](../specs/opl-domain-onboarding-contract.md) | MAS/MAG/RCA/OMA 按 domain pack、descriptor、sidecar/receipt、artifact locator、projection builder、authority refs 接入。 | direct path 与 OPL-hosted path 共享 domain owner receipts，OPL 只持有 refs/projection/attempt history。 |
| `feature_partition_and_retirement` | [当前状态与理想目标差距](./current-state-vs-ideal-gap.md)、本文、[文档组合治理](../docs_portfolio_consolidation.md) | 把旧开发文档里的内容块分类为 retain、merge、lift、degrade、retire、archive。 | 旧默认依赖、compat alias、过时 manager、重复 UI 入口都有替代证据、owner 结论，且不保留 active compatibility interface。 |
| `opl_app_runtime_workbench` | App repo contracts、OPL product/runtime support references、[当前状态与理想目标差距](./current-state-vs-ideal-gap.md) | 把 provider readiness、stage attempt、domain status、human gate、receipt、artifact refs、source refs 产品化。 | App/workbench 显示 framework/provider + domain owner receipts，不制造第二 truth。 |
| `domain_soak_and_acceptance` | MAS/MAG/RCA/OMA repo-local status/gap/owner docs、[当前状态与理想目标差距](./current-state-vs-ideal-gap.md) | 在迁移后的目标形态做真实或 controlled domain soak。 | domain repo 产生真实 progress delta、quality gate movement、human gate、stop-loss 或 typed blocker。 |
| `new_domain_admission` | [Domain-Agent Admission Contract](../specs/opl-domain-onboarding-contract.md)、domain-admission references | 新 domain 只按标准 skeleton/descriptor/locator/authority boundary 接入。 | 不复制旧 Gateway-era direct-entry 路线。 |

## 文档组合地图

| 文档或文档组 | 当前角色 | 处置 |
| --- | --- | --- |
| `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md` | 核心五件套，持有当前 OPL 角色、状态、架构、硬约束和决策 | 保持 active truth。所有 reference、roadmap、旧计划不得覆盖它们。 |
| [文档组合治理](../docs_portfolio_consolidation.md) | 全仓 docs lifecycle owner | 保持治理入口。本文只负责开发文档组合和内容级归位。 |
| [OPL 当前开发线路](./current-development-lines.md) | framework-first 内容级执行地图 | 保持为当前开发线路总入口；旧计划执行前先按它判断内容块归属。 |
| [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md) | OPL 智能体框架总 roadmap | 保持 master roadmap。不要再新增平行总计划。 |
| [Temporal provider 支撑参考](../references/runtime-substrate/temporal-family-runtime-provider-plan.md) | provider-backed runtime 支撑边界与动态证据入口 | 保持 active support；只承接 Temporal/provider 细节，不重新定义 domain truth、readiness oracle 或 provider proof ledger。 |
| [Domain-Agent Admission Contract](../specs/opl-domain-onboarding-contract.md) | domain-agent 准入合同支撑 | 保持 active support；吸收新 domain 的 skeleton、descriptor、locator、authority 规则。 |
| [OPL runtime 命名与边界合同](../runtime/opl-runtime-naming-and-boundary-contract.md) | runtime 命名与边界支撑 | 保持 active support；承接 Codex-default、provider-backed、Temporal substrate、explicit executor adapter、MDS 退役等术语边界。 |
| [共享运行时合同](../specs/shared-runtime-contract.md) 与 [共享领域合同](../specs/shared-domain-contract.md) | shared runtime/domain 边界支撑 | 保持 active support；只表达共享语言和边界，不上收 domain truth。 |
| [Artifact / Package Lifecycle 边界](../delivery/artifact-package-lifecycle-boundary.md) 与 [Workspace / Source Intake 边界](../source/workspace-source-intake-boundary.md) | delivery/source 通用壳支撑 | 保持 active support；OPL 只持 locator、registry、transport、refs 和 projection，domain repo 持有 source semantics 与 artifact authority。 |
| `docs/public/roadmap*`, `task-map*`, `operating-model*`, `unified-harness-engineering-substrate*` | 公开产品方向和用户理解支撑 | 保持 public support；用户阅读，不作为实现 backlog。 |
| `docs/history/process/specs/2026-04-20-*`, `docs/history/process/specs/2026-04-21-*` | archived Product API / ACP 规格历史 | 八类产品资源模型、session-runtime-first pivot、shell/projection 边界和 domain truth 边界已吸收到核心五件套、current development lines、domain onboarding 与 stage-led roadmap；整文档不再作为活跃 specs 保留。 |
| `docs/references/runtime-substrate/opl-runtime-manager-target.md` | Runtime Manager / provider readiness / state index 目标支撑 | 保持 support reference；App/workbench 和 runtime snapshot 相关内容以当前实现和 contracts 为准。 |
| `docs/references/runtime-substrate/family-runtime-attempt-contract.md` | stage attempt 语义参考 | 有效内容合入 framework contracts / current roadmap；文档继续作为参考，不成为 machine contract。 |
| `docs/references/runtime-substrate/family-executor-adapter-defaults.md` | executor adapter 默认策略参考 | 按 roadmap 复核后保留；旧 Hermes-default 或非 Codex-default wording 不再扩写为主线。 |
| `docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md` | 外部 orchestration 模式吸收记录 | 保留为 external learning reference；只吸收 contract vocabulary，不引入外部 runtime truth。 |
| `docs/history/runtime-substrate/family-product-entry-and-domain-handoff-architecture.md` | 早期 product-entry / handoff 架构历史 | operator / agent / product entry taxonomy、handoff envelope、domain authority boundary 已吸收到 Domain-Agent Admission Contract；Hermes Kernel / Gateway wording 只保留为历史。 |
| `docs/history/runtime-substrate/family-lightweight-direct-entry-rollout-board.md` | 早期 direct-entry 推进板历史 | entry surface / operator loop 区分、direct path 与 OPL handoff 对齐经验已吸收到 Domain-Agent Admission Contract。 |
| `docs/history/runtime-substrate/mas-top-level-cutover-board.md` | 早期 OPL->MAS 切换板历史 | OPL -> MAS handoff 字段与 transition honesty 已吸收；当前 MAS 迁移顺序以 OPL roadmap 和 MAS active portfolio/current development lines 为准。 |
| `docs/history/runtime-substrate/opl-product-entry-and-hermes-kernel-integration.md` | Hermes-default product-entry 决策历史 | 不 fork/vendor 外部 runtime、不要把用户暴露给底层 runtime 拼装、Hermes-default 误写禁止项已吸收；当前目标是 provider-backed runtime。 |
| `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md` 与 `docs/history/runtime-substrate/hermes-agent-runtime-substrate-benchmark.md` | Hermes 命名/迁移边界与历史 benchmark | truth reset 只因 stale-compat / executor 边界 guard 保留在 reference 层，生命周期是 `history_boundary_support`；benchmark 已归 history。两者都不得作为 provider/readiness/Gateway/compatibility 计划读取。 |
| `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md` | `hermes_agent` 显式非默认 executor adapter 评估 | 只评估 full agent loop、tool event、receipt 与 fail-closed 证据；不影响默认 `Codex CLI`，不声明行为等价。 |
| `docs/history/runtime-substrate/host-agent-runtime-contract.md` | Codex-default host-agent runtime 历史合同 | Codex-default runtime、formal-entry matrix、execution handle、durable truth、fail-closed 规则已吸收到 runtime boundary 和 domain onboarding。 |
| `docs/references/runtime-substrate/opl-managed-runtime-three-layer-contract.md` | shared managed-runtime 三层 owner split 的 contract-linked support | machine contract / tests 仍引用三层 owner split，所以保留路径；旧 Gateway/Domain Gateway / upstream Hermes runtime owner 只作 historical support，不保留 compatibility surface。 |
| `docs/history/runtime-substrate/opl-vertical-online-agent-platform-roadmap.md` | 早期垂类在线 Agent 平台蓝图历史 | 垂类产品族、shared runtime/domain contract、future managed runtime 与当前 reality 区分已吸收到 runtime boundary、public roadmap 和 stage-led roadmap。 |
| `docs/history/runtime-substrate/managed-runtime-migration-readiness-checklist.md` | 早期 managed runtime 迁移准备清单历史 | R1-R8 readiness 维度已吸收到 runtime naming and boundary contract；逐仓进度判断保留为 dated snapshot。 |
| `docs/references/current-support/*` | GUI、Docker/WebUI、安装、发布、测试、quality 参考 | 保持 current support；命令和产品事实必须服从当前 CLI/API/source/contract。 |
| `docs/references/operating-governance/*` | surface、quality、operator、memory、family governance 参考 | 保持 current governance support；legacy-derived gateway ids、audit/publish matrix 和 surface authority/lifecycle/review matrix 已归档到 `docs/history/compatibility/gateway-federation/operating-governance/`。 |
| `docs/references/convergence-governance/*` | family 收敛规则、docs 生命周期 playbook、intake 模板和 stage control plane 支撑 | 保持 support reference；单次 rollout、dated board 和 closeout evidence 已迁入 `docs/history/process/convergence-governance/`。结论若变成当前规则，应提升到核心五件套、本文、policy/spec 或 active owner docs。 |
| `docs/references/domain-admission/*` | candidate backlog 与 admission support | 保留当前 candidate backlog；已完成 tranche / Phase 1/2 records 已归档到 `docs/history/process/domain-admission/`。正式准入规则由 active onboarding contract 持有。 |
| `docs/history/compatibility/gateway-federation/examples-corpora/*` | 旧 gateway / routed-action 样例语料和操作记录 | 历史 evidence corpus；不得作为当前行为 oracle。 |
| `docs/history/**` | 退役路线、dated snapshot、process archive、tombstone | 保持 history；旧计划可解释来龙去脉，不再指导当前实现。 |

## 内容级合并规则

| 旧内容类型 | 当前归属 |
| --- | --- |
| Stage attempt、workflow/activity/signal/query、stage-attempt request/projection、wakeup、retry/dead-letter、human gate、provider receipt | OPL framework / Runtime Manager / Temporal provider docs / machine contracts |
| Domain skeleton、stage descriptor、sidecar export/dispatch、artifact locator、projection builder、authority refs | OPL domain admission + domain repo owner surfaces |
| Product-entry taxonomy、handoff envelope、entry surface / operator loop 区分 | active contracts、public docs、domain admission；旧 direct-entry boards 保留为 provenance |
| MAS paper truth、publication gate、evidence/review ledger、manuscript/package authority | MAS |
| MAG grant strategy、fundability / proposal quality、specific aims authority | MAG |
| RCA visual direction、visual artifact、review/export gate | RCA |
| MDS / DeepScientist backend facts | MAS provenance / parity oracle / explicit archive import，不回到 OPL 默认 runtime |
| Hermes-default online substrate、Hermes Kernel as default product runtime | history / provenance / diagnostic / negative-guard reference；当前默认主线是 provider-backed framework |
| Gateway-era federation/routed-action 旧路线 | history / tombstone / negative guard；active docs 只作为历史上下文引用，不保留兼容入口 |
| Dated implementation board、activation package、one-off closeout | `docs/history/process/**` 或对应 references/history；有效结论提升到当前 owner doc |
| 外部框架学习 | references / convergence-governance；只吸收 vocabulary、contract pattern、provenance/gate 方法 |

## 退役与归档规则

1. 有效结论先合入当前 owner：核心五件套、current development lines、stage-led roadmap、active contracts、runtime manager target 或 domain owner docs。
2. 旧文档若仍被链接或承载 provenance，先加 lifecycle note 或在索引中标明 `superseded` / `legacy` / `retired`，再决定是否物理移动。
3. 只有在 `rg` 确认 inbound links、machine-readable refs 和历史审计都安全后，才把旧文档迁入 `docs/history/**`。
4. 旧路径中的命令示例、绝对路径、历史状态可以保留，但必须处在 provenance / tombstone 语境。
5. 任何 active docs 不得把 legacy wording 写成当前默认路径；必要时只说“历史上这样设计过，当前 owner 是 X”。
6. 文档归档不能替代实现清理。旧 alias、compat path、manager surface 和 UI 入口在 replacement evidence 与 verification 证明 no-active-caller 后必须删除或迁入 history。

## 当前不再按整份执行的旧计划

| 旧计划 | 当前处置 |
| --- | --- |
| Hermes-default product-entry / kernel integration | 不再作为目标 runtime 主线。保留为历史决策和 provenance 背景。 |
| Lightweight direct-entry 全家族推进板 | 不再作为当前完整 backlog。保留 entry taxonomy、handoff envelope 和 entry/operator 边界经验。 |
| OPL vertical online-agent platform roadmap | 不再作为总路线图。有效内容已被 stage-led framework / public roadmap 吸收。 |
| MAS top-level cutover board | 不再作为 MAS 当前迁移顺序。当前 MAS 迁移按 OPL framework-first + MAS active portfolio 执行。 |
| Host-agent runtime contract | 不再独立定义当前目标 runtime。有效 Codex-default 口径已合入 runtime boundary、domain onboarding 和 framework roadmap；整文档进入 `docs/history/runtime-substrate/`。 |
| Managed runtime migration checklist | 不再作为当前迁移队列。R1-R8 readiness 维度已吸收到 runtime boundary；逐仓判断保留为历史 snapshot。 |
| Product API / ACP native specs | 不再作为实现队列；已迁入 `docs/history/process/specs/`，只保留历史形成过程。 |

## Coverage Ledger Foldback

Dated coverage entries that previously lived in this active support document have been folded into [OPL active development portfolio ledger foldback](../history/process/plans/2026-05-29-opl-active-development-portfolio-ledger-foldback.md).

Current docs-governance truth remains in `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, the core five docs, and live contracts/source/CLI/read-model output. This file now keeps only the current development-document portfolio map, role assignment rules, retirement rules, and the pointer to historical coverage provenance.

Do not append future execution logs here. New docs-governance records must be compact topic-level provenance, not dated ledger chains for frozen inventory, doctor transcripts, branch/worktree state or command output. Durable conclusions fold back into active owner docs, contracts/source/tests/read-model or the relevant repo-local process index; historical detail stays in git history.

## Prior Seven-Repo Governance Foldback

The previous seven-repo SSOT worklist and coverage ledger are historical governance provenance, not this file's active worklist. Their durable conclusions are now read from the current owner surfaces named above: `docs/docs_portfolio_consolidation.md`, the core five docs, `docs/active/current-state-vs-ideal-gap.md`, repo-local process indexes, and live contracts/source/CLI/read-model output.

Current governance entries belong here only when they change the development-document portfolio map, owner assignment rules, retirement rules, or historical foldback pointer. Detailed batch ledgers, edited-file tables, coverage counts, doctor transcripts, branch/worktree state, command output, local smoke evidence, generated payload headers, release placeholders, and later evidence tails must stay in history/provenance, runtime ledgers, owner repo records, automation memory, or git history.

Carry-forward rule: reopen this support document only when a new tracked development doc appears, a current SSOT owner changes, an active/history boundary conflict returns, or a dated evidence chain starts acting as current docs truth again. Reopened entries must first name the semantic theme, truth owner, allowed write set, forbidden write set, verification entry, and false-ready boundary; they must not claim release/currentness/runtime/domain-ready/owner-accepted status from docs compression, doctor pass, contract pass, generated payload headers, local smoke, release placeholders, a materialized candidate, or refs-only readback.
