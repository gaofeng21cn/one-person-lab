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

本文后续 tranche 记录中的 `framework readiness`、`family-runtime evidence-worklist`、App/operator drilldown 等 read-model 计数都是当轮 dated evidence；当前 open worklist、payload-required / payload-free、domain-dispatch workorder、domain ready 和 production ready 状态必须重新读取 live CLI/read-model，不能从旧 tranche 数字继承。

## Active Owner 落点

当前执行目标、ideal-operating-model redesign foldback 状态和 active-goal baton 只回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。本文不再给出独立执行顺序，只定义旧开发文档内容应归到哪个 owner surface，避免多条 active 线并行复活。

2026-06-11 单一真相整理后，`docs/active` 的 live gap 只由 `current-state-vs-ideal-gap.md#active-planning-gap-register` 维护。其他 active/support 文档里的 P0-P5、W0-W7、audit lane、rollout phase、matrix row、external-practice checklist 或 closeout wording 都只能作为设计标准、验收词表、证据解释或历史归位输入读取；它们不得直接升级成第二 backlog、第二执行顺序或第二 completion truth。

| 内容线路 | 归属 owner 文档 | 当前含义 | 折回信号 |
| --- | --- | --- | --- |
| `opl_framework_foundation` | [当前状态与理想目标差距](./current-state-vs-ideal-gap.md)、runtime contracts、Temporal provider references | stage attempt、provider runtime、typed queue、wakeup、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive。 | provider-backed stage attempt 可恢复、可查询、可投影，且不写 domain truth。 |
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
| `docs/references/convergence-governance/*` | family 收敛规则、docs 生命周期 playbook、intake 模板、shared release 维护和 stage control plane 支撑 | 保持 support reference；单次 rollout、dated board 和 closeout evidence 已迁入 `docs/history/process/convergence-governance/`。结论若变成当前规则，应提升到核心五件套、本文、policy/spec 或 active owner docs。 |
| `docs/references/domain-admission/*` | candidate backlog 与 admission support | 保留当前 candidate backlog；已完成 tranche / Phase 1/2 records 已归档到 `docs/history/process/domain-admission/`。正式准入规则由 active onboarding contract 持有。 |
| `docs/history/compatibility/gateway-federation/examples-corpora/*` | 旧 gateway / routed-action 样例语料和操作记录 | 历史 evidence corpus；不得作为当前行为 oracle。 |
| `docs/history/**` | 退役路线、dated snapshot、process archive、tombstone | 保持 history；旧计划可解释来龙去脉，不再指导当前实现。 |

## 内容级合并规则

| 旧内容类型 | 当前归属 |
| --- | --- |
| Stage attempt、workflow/activity/signal/query、typed queue、wakeup、retry/dead-letter、human gate、provider receipt | OPL framework / Runtime Manager / Temporal provider docs / machine contracts |
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

Do not append future tranche logs here. New docs-governance records must be compact topic-level provenance, not dated ledger chains for frozen inventory, doctor transcripts, branch/worktree state or command output. Durable conclusions fold back into active owner docs, contracts/source/tests/read-model or the relevant repo-local process index; historical detail stays in git history.

## 2026-06-30 七仓 SSOT 治理 Worklist

本 worklist 是本轮 `README*` 与 `docs/**/*.md` 语义治理的 authority-aware 索引；它不是 proof ledger，也不关闭七仓全量覆盖目标。已验证能安全写入的项目进入本轮；App publishing / generated guide 脏写集、MAS medical-display 大文档族和 release/live evidence 项只保留为后续 owner lane。

| Repo | Theme | SSOT owner | Route | Lifecycle | Authority blocker | Allowed write set | Forbidden write set | Risk | Verification | Parallel group | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `one-person-lab` | 七仓 docs governance worklist | 本文 + `docs/docs_portfolio_consolidation.md` | `governance_ssot` | `active_support` | none | 本文 compact worklist | contracts/source/runtime/evidence ledgers | L1 | `git diff --check`; conflict scan | root | selected |
| `one-person-lab` | runtime environment target design proof ledger | `docs/active/runtime-environment-bundle-cache-target-design.md` + `contracts/opl-framework/runtime-environment-substrate-contract.json` + `src/runtime-environment-substrate.ts` | `governance_ssot` | `active_target_design` | no domain/App/release/provider readiness claim | `docs/active/runtime-environment-bundle-cache-target-design.md`; `docs/history/process/README.md`; this ledger | contracts/source/tests/runtime artifacts/domain/App repos | L1 | `git diff --check`; stale proof-ledger scan; OPL Doc doctor | root | done |
| `med-autoscience` | runtime README duplicate link | `docs/runtime/README.md` | `refactor_patrol` | `active_index` | none | `docs/runtime/README.md` | active gap plan、medical-display、history bulk | L1 | `git diff --check`; targeted `rg` | docs-nav | selected |
| `med-autoscience` | active status / closeout ledgers | `docs/status.md` + `docs/active/current-development-lines.md` + active runbooks | `governance_ssot` | `active_truth` / `active_index` | no paper/runtime ready claim | `docs/status.md`; `docs/active/current-development-lines.md`; selected active runbook history pointers; history program index | contracts/source/runtime/live evidence/owner receipts/typed blockers | L1 | `git diff --check`; stale closeout scan; OPL Doc doctor | mas-owner | done |
| `med-autoscience` | MAS active plan source-morphology readout | `docs/active/mas-ideal-state-gap-plan.md` | `owner_lane` | `active_plan` | high-risk active owner doc; large plan | none this tranche | source/contracts/runtime/live evidence | L1/L3 depending edit | read-only explorer audit found current SSOT split safe | mas-owner | reviewed_no_edit |
| `med-autoscience` | medical-display portfolio overlap | `docs/delivery/medical-display/README.md` + delivery contracts/catalogs | `owner_lane` | `delivery_support` | delivery authority and large support family | none this tranche | domain artifact authority, visual templates, contracts | L1/L3 depending edit | read-only explorer audit found distinct semantic leaves | mas-delivery | reviewed_no_edit |
| `med-autogrant` | active/status false-ready repetition | `docs/active/mag-ideal-state-cross-repo-gap-plan.md` | `governance_ssot` | `active_plan` | none for docs-only, but no live/readiness claims | `docs/status.md` summary compression | contracts/source/runtime/receipts | L1 | `git diff --check`; conflict scan; OPL Doc doctor | mag | done |
| `med-autogrant` | dated support specs | `docs/specs/specs_lifecycle_map.md` | `governance_ssot` | `spec_support` | no source/contract refs changed | `docs/specs/README.md`; `docs/specs/specs_lifecycle_map.md` | active specs bodies, contracts/source/runtime/receipts | L1 | `git diff --check`; conflict scan; OPL Doc doctor | mag | done |
| `med-autogrant` | private inventory source-morphology guard trace | `docs/active/opl-private-implementation-migration-inventory.md` + `contracts/private_functional_surface_policy.json#/physical_source_morphology_policy` | `governance_ssot` | `active_inventory` | no source/contract/delete authority changed | `docs/active/opl-private-implementation-migration-inventory.md`; `docs/history/docs-portfolio-coverage-ledger/README.md` | contracts/source/tests/runtime/owner receipts | L1 | `git diff --check`; conflict scan; OPL Doc doctor | mag | done |
| `redcube-ai` | default-caller / source morphology active slices | `docs/active/rca-ideal-state-gap-plan.md` + private inventory + machine morphology contracts | `governance_ssot` | `active_plan` | no runtime/readiness/delete claim | `docs/active/rca-ideal-state-gap-plan.md`; `docs/history/process/README.md` | contracts/source/tests/runtime evidence/owner receipts/typed blockers | L1 | `git diff --check`; stale slice scan; OPL Doc doctor | rca | done |
| `redcube-ai` | status / private-inventory / support-doc SSOT review | `docs/active/rca-ideal-state-gap-plan.md` + private inventory + product/runtime/source indexes | `governance_ssot` | `active_truth` | no runtime/readiness claim | none this tranche after read-only review | contracts/source/tests/history bulk | L1 | read-only explorer audit; remaining status production-evidence thinning only | rca | reviewed_no_edit |
| `redcube-ai` | history/process re-expansion guard | `docs/history/process/README.md` | `governance_ssot` | `history_index` | none | `docs/history/process/README.md` | source/contracts/tests/runtime evidence | L1 | `git diff --check`; conflict scan; OPL Doc doctor | rca | done |
| `redcube-ai` | RCA-local series checklist membership wording | `docs/references/governance/series-doc-governance-checklist.md` + `docs/references/README.md` | `governance_ssot` | `support_reference` | OPL family membership / repo count belongs to OPL Doc / One Person Lab owner | `docs/references/governance/series-doc-governance-checklist.md`; `docs/references/README.md` | contracts/source/tests/runtime evidence/owner receipts/typed blockers | L1 | `git diff --check`; membership wording scan; OPL Doc doctor | rca | done |
| `opl-meta-agent` | script-to-pack/source-purity field-level repetition | `docs/active/opl-private-implementation-migration-inventory.md` + machine contracts/readbacks | `governance_ssot` | `active_plan` / `active_inventory` | no script retirement/readiness claim | `docs/active/opl-meta-agent-ideal-state-gap-plan.md`; `docs/active/opl-private-implementation-migration-inventory.md`; `docs/history/process/README.md` | contracts/source/tests/script gates/runtime/owner receipts/typed blockers | L1 | `git diff --check`; conflict scan; stale policy-name scan; OPL Doc doctor | oma | done |
| `opl-meta-agent` | private inventory duplicate script classification rows | `docs/active/opl-private-implementation-migration-inventory.md` + `docs/history/process/README.md` | `governance_ssot` | `active_inventory` / `history_index` | no script retirement/readiness claim | `docs/active/opl-private-implementation-migration-inventory.md`; `docs/history/process/README.md` | contracts/source/tests/script gates/runtime/owner receipts/typed blockers | L1 | `git diff --check`; duplicate owner-row scan; OPL Doc doctor | oma | done |
| `opl-bookforge` | evidence package file-list duplication | `docs/evidence/README.md` | `governance_ssot` | `evidence_index` | no production/owner acceptance claim | `docs/evidence/README.md`; `docs/status.md` compact evidence summary | evidence payloads, contracts, pilot artifacts | L1 | `git diff --check`; conflict scan; OPL Doc doctor | bookforge | done |
| `opl-bookforge` | active plan repeated later-evidence policy | `docs/active/bookforge-ideal-state-gap-plan.md` + `docs/invariants.md` | `governance_ssot` | `active_plan` | no publication/export readiness claim | `docs/status.md`; `docs/history/external-learning/revision-routing-2026-06-20.md` | contracts/source/evidence payloads | L1 | `git diff --check`; duplicate phrase scan; OPL Doc doctor | bookforge | done |
| `opl-bookforge` | publication-proof external-learning landing audit table | `docs/decisions.md` + `docs/invariants.md` + `docs/active/bookforge-ideal-state-gap-plan.md` | `governance_ssot` | `history_provenance` | no publication-proof / final-export / owner-acceptance claim | `docs/history/external-learning/kami-publication-proof-2026-06-20.md` | contracts/source/helpers/evidence payloads | L1 | `git diff --check`; conflict scan; OPL Doc doctor; external-learning audit-table scan | bookforge | done |
| `one-person-lab-app` | GUI docs broken link | `docs/product/gui/ideal-interaction-spec.md` | `refactor_patrol` | `product_support` | App has unrelated publishing/generated dirty write set | `docs/product/gui/feature-inventory.md` only | `docs/publishing/**`, generated guides/slides/public assets | L1 | `git diff --check`; targeted `rg` | app-nav | selected |
| `one-person-lab-app` | publishing / generated guide governance | `docs/publishing/README.md` and guide generators | `owner_lane` | `delivery_support` | existing dirty generated/public assets | none this tranche | publishing/generator/generated/public write set | L1/L3 depending owner | owner lane after dirty resolution | app-publishing | blocked_owner_gated |

Selected batch原则：只做 `selected` 行；其余行留作下一轮治理范围，不因本轮局部修复声称七仓全部 docs 逐段覆盖。

## 2026-06-30 七仓 Coverage Ledger

本 ledger 只记录本轮 SSOT / OPL Doc 治理覆盖，不是完成证明。计数排除了 `node_modules`、外部 fork、shell checkout、`tmp` 和非 `docs/**` 的运行产物；root `README*.md` 单独计数。全量目标仍是逐段审查所有 root `README*` 与 `docs/**/*.md`，当前只完成 selected semantic batch。

| Repo | Root README files | docs markdown files | Reviewed / edited this tranche | Unreviewed or deferred themes | Next write scope |
| --- | --- | --- | --- | --- | --- |
| `one-person-lab` | 2 | 248 | Active family gap owner, SSOT worklist, coverage ledger. Operating-governance Ponytail audit matrix was moved to history with the reference path reduced to a superseded pointer; reusable cleanup protocol stays in the Ponytail cleanup runbook. Runtime environment bundle/cache target design now keeps target architecture, current readback owner surface and remaining owner lanes; dated 2026-06-21 MAS/App/OPL proof transcripts, branch/worktree state and adoption percentages were compressed into process provenance. `docs/status.md` currentness / CI hygiene now keeps only live-read rules and owner routes; dated GitHub Actions run ids, sibling repo clean-current SHAs and external-owner state moved to history/provenance semantics. | Long support refs such as `docs/decisions.md`, Foundry target architecture, broad history folders, and remaining reference snapshots that still carry dated evidence chains. | Continue topic batches from docs portfolio; do not expand active gap, status or support references into completed-work ledgers; runtime/currentness/release evidence claims must be rerun from current contracts/source/CLI/read-model or repo-local owner surfaces. |
| `med-autoscience` | 2 | 294 | Runtime README duplicate link was fixed; active plan prompt fields normalized to executable OPL Doc baton; runtime/source/delivery README support boundaries clarified; medical-display README and portfolio map now point to the correct active board, generated status, catalogs, contracts, plans and provenance owners. `docs/status.md` active closeout ledger was compressed into current control-plane reading, `docs/active/current-development-lines.md` was thinned back to content-index role, and the B002/B003 recovery runbook now routes dated replay details to history/program provenance. Read-only follow-up confirmed source-morphology baton belongs in `docs/active/mas-ideal-state-gap-plan.md`, history indexes are provenance/no-resurrection guards, decisions.md is decision log, and medical-display leaves have distinct owners. | Future conflicts only: same current count/status duplicated outside generated status / landing status, active docs misreading history/decision text, or source-morphology detail leaking out of active plan. | Do not force-compress MAS history, decisions, or medical-display leaves without a concrete current-owner conflict. |
| `med-autogrant` | 2 | 51 | Active plan prompt fields normalized; specs lifecycle SSOT clarified in `docs/specs/specs_lifecycle_map.md` and specs README now points direct-file readers away from dated-support backlogs. `docs/status.md` now keeps a compact current-state SSOT index and routes per-surface / gate detail back to active gap plan, private inventory and machine contracts. Private inventory source-morphology dated guard trace is now compressed into a current guard table, with topic-level provenance recorded in the history coverage ledger. | Product/runtime/delivery/source thin indexes and any future private inventory refresh that changes source/contract owner mapping. | Keep status and private inventory thin; future private inventory edits must start from machine contracts/source refs and must not re-expand into dated guard closeout logs. |
| `redcube-ai` | 2 | 93 | Active gap explicit remainder compressed into SSOT table; prompt fields normalized; `docs/history/process/README.md` now has a re-expansion guard and a compressed 2026-06-12 docs lifecycle batch row. The later default-caller / source morphology dated slices in `docs/active/rca-ideal-state-gap-plan.md` were also folded into a current readout with process provenance. Read-only follow-up confirmed private inventory, product-entry briefs, product/runtime/source indexes, ideal-state reference and retained history bodies already have stable SSOT routing. RCA-local series checklist wording now says it is only RCA-view support and that OPL family membership / repo count belongs to OPL Doc / One Person Lab governance owner. | Deep private inventory / status production-evidence compression remains possible only after fresh source/ref owner map; product-entry support docs should stay contract-linked, not a new handoff overview. | Do not re-expand process history into dated proof logs; do not delete history bodies that still carry provenance or `human_doc:*` context; do not use RCA support checklist as OPL series membership SSOT. |
| `opl-meta-agent` | 2 | 14 | Active plan prompt fields normalized; private inventory dated cleanup batches compressed into current migration gates; status source-purity/readback detail thinned back to private inventory and machine contracts. This tranche also compressed active plan / private inventory script-to-pack field-level machine guard prose into compact owner/readback pointers and recorded the foldback in `docs/history/process/README.md`. Read-only follow-up confirmed `docs/README.md` already delegates lifecycle taxonomy to `docs/docs_portfolio_consolidation.md`. The later private-inventory audit found and folded a duplicate `scripts/lib/agent-evidence-materializer.ts` classification row so each script surface has one owner row. | Future script-to-pack changes that alter active inventory or contracts; live/registry/App evidence tails; optional status table thinning if it starts duplicating active plan/private inventory again. | Keep private inventory as gate owner; move future dated cleanup batches to history/provenance without re-expanding README, status or active plan with machine guard field lists; keep one owner row per script surface. |
| `opl-bookforge` | 2 | 28 | Active plan prompt fields normalized; decisions date-log compressed into durable decision themes; evidence package navigation clarified as `docs/evidence/README.md` SSOT and status evidence table compressed to claim-boundary bullets. `docs/status.md` now points later-evidence policy to the active plan/invariants instead of duplicating the long list. Both external-learning landing audit tables are now compressed into provenance summaries: revision-routing no longer reads as current hosted/runtime adoption progress, and Kami publication-proof no longer reads as proof completion, final export, owner acceptance, or production readiness. | Revision-routing real-workspace evidence, real manuscript proof evidence, owner/export acceptance, and optional runtime support only if durable material appears. | Do not point to nonexistent runtime README; keep evidence payload detail in `docs/evidence/**` or git history; inspect revision-routing / publication-proof evidence only when a real workspace run, real manuscript proof, or owner route changes the current truth. |
| `one-person-lab-app` | 2 | 47 | Active plan prompt fields normalized; prior GUI spec link fix remains selected batch output. | Publishing/generated user-guide dirty write set, release README, GUI inventory/spec long support docs, status/release evidence routing. | Owner lane must resolve/absorb App publishing/generated/public write set before governance writes under `docs/publishing/**`, generated guide assets or public guide artifacts. |

Carry-forward rule：下一轮必须从上表的 `Unreviewed or deferred themes` 选 semantic theme，先定 SSOT，再读 peer docs 和 machine truth。不得把本轮 prompt-field normalization、selected compression 或 doctor pass 写成七仓 docs 全量覆盖完成。
