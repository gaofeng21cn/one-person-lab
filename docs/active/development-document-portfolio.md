# OPL 开发文档组合整理

State: `active_support`

Status: `active_development_portfolio`
Owner: `One Person Lab`
Purpose: 按 2026-05-11 framework-first 定位，逐文档、逐内容整理 OPL 开发文档的当前角色、吸收关系、归档规则和执行优先级。
Machine boundary: 本文是人读开发文档组合入口。机器真相继续归 `contracts/`、source code、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/workbench projection 和真实验证 evidence。

## 当前结论

OPL 开发文档现在不能按“每份旧计划都继续完整执行”阅读。当前主线已经收敛为 framework-first：

1. 先完成 OPL 作为 stage-led、以 Agent executor 为最小执行单位的完整智能体框架的 framework foundation。
2. 再让 MAS/MAG/RCA 迁移为 OPL-admitted domain agents，保持 direct skill path 与 OPL-hosted path 等价。
3. 同步把旧功能逐块分层：framework-generic 能力上收到 OPL，domain truth 留在 domain，退役路线只保留为历史诊断、provenance、tombstone 或负向 guard。
4. 旧 Hermes-first、Gateway-era、direct-entry、local-manager、MDS-default 等路线在替代证据存在后立即退役清理；无 active caller 的模块、接口和测试直接删除或迁入 tombstone，不保留兼容入口。
5. 最后用 App workbench 和真实 domain soak 验证目标形态，而不是用旧路径证明旧计划。

因此，开发文档的整理原则是：**保留有效内容，合并到当前 owner；旧文档不再作为整份待办执行；旧路线保留为 provenance、migration reference 或 tombstone。**

## 当前执行顺序

| 顺序 | 内容线路 | 当前 owner 文档 | 当前含义 | 完成信号 |
| --- | --- | --- | --- | --- |
| `1` | `opl_framework_foundation` | [OPL 当前开发线路](./current-development-lines.md), [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md), [Temporal provider 落地计划](../references/runtime-substrate/temporal-family-runtime-provider-plan.md) | 完成 stage attempt、provider runtime、typed queue、wakeup、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive。 | provider-backed stage attempt 可恢复、可查询、可投影，且不写 domain truth。 |
| `2` | `domain_framework_migration` | [Domain-Agent Admission Contract](../specs/opl-domain-onboarding-contract.md), [Runtime 命名与边界合同](../runtime/opl-runtime-naming-and-boundary-contract.md), OPL roadmap | MAS/MAG/RCA 按 skeleton、descriptor、sidecar/receipt、artifact locator、projection builder、authority refs 接入。 | direct path 与 OPL-hosted path 共享 domain owner receipts，OPL 只持有 refs/projection/attempt history。 |
| `3` | `feature_partition_and_retirement` | 本文、[文档组合治理](../docs_portfolio_consolidation.md)、runtime-substrate index、domain owner docs | 把旧开发文档里的内容块分类为 retain、merge、lift、degrade、retire、archive。 | 旧默认依赖、compat alias、过时 manager、重复 UI 入口都有替代证据、owner 结论，且不保留 active compatibility interface。 |
| `4` | `opl_app_runtime_workbench` | [OPL Runtime Manager 目标形态](../references/runtime-substrate/opl-runtime-manager-target.md), current-support / App 相关参考 | 把 provider readiness、stage attempt、domain status、human gate、receipt、artifact refs、source refs 产品化。 | App/workbench 显示 framework/provider + domain owner receipts，不制造第二 truth。 |
| `5` | `domain_soak_and_acceptance` | OPL roadmap + MAS/MAG/RCA 各自 status/active/runtime owner docs | 在迁移后的目标形态做真实或 controlled domain soak。 | MAS/MAG/RCA 产生真实 progress delta、quality gate movement、human gate、stop-loss 或 typed blocker。 |
| `6` | `new_domain_admission` | [Domain-Agent Admission Contract](../specs/opl-domain-onboarding-contract.md), domain-admission references | 新 domain 只按标准 skeleton/descriptor/locator/authority boundary 接入。 | 不复制旧 Gateway-era direct-entry 路线。 |

## 文档组合地图

| 文档或文档组 | 当前角色 | 处置 |
| --- | --- | --- |
| `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md` | 核心五件套，持有当前 OPL 角色、状态、架构、硬约束和决策 | 保持 active truth。所有 reference、roadmap、旧计划不得覆盖它们。 |
| [文档组合治理](../docs_portfolio_consolidation.md) | 全仓 docs lifecycle owner | 保持治理入口。本文只负责开发文档组合和内容级归位。 |
| [OPL 当前开发线路](./current-development-lines.md) | framework-first 内容级执行地图 | 保持为当前开发线路总入口；旧计划执行前先按它判断内容块归属。 |
| [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md) | OPL 智能体框架总 roadmap | 保持 master roadmap。不要再新增平行总计划。 |
| [Temporal provider 落地计划](../references/runtime-substrate/temporal-family-runtime-provider-plan.md) | provider-backed runtime 技术细化 | 保持 active support；只承接 Temporal/provider 细节，不重新定义 domain truth。 |
| [Domain-Agent Admission Contract](../specs/opl-domain-onboarding-contract.md) | domain-agent 准入合同支撑 | 保持 active support；吸收新 domain 的 skeleton、descriptor、locator、authority 规则。 |
| [OPL runtime 命名与边界合同](../runtime/opl-runtime-naming-and-boundary-contract.md) | runtime 命名与边界支撑 | 保持 active support；承接 Codex-default、provider-backed、Temporal substrate、explicit executor adapter、MDS 退役等术语边界。 |
| [共享运行时合同](../specs/shared-runtime-contract.md) 与 [共享领域合同](../specs/shared-domain-contract.md) | shared runtime/domain 边界支撑 | 保持 active support；只表达共享语言和边界，不上收 domain truth。 |
| [Artifact / Package Lifecycle 边界](../delivery/artifact-package-lifecycle-boundary.md) 与 [Workspace / Source Intake 边界](../source/workspace-source-intake-boundary.md) | delivery/source 通用壳支撑 | 保持 active support；OPL 只持 locator、registry、transport、refs 和 projection，domain repo 持有 source semantics 与 artifact authority。 |
| `docs/public/roadmap*`, `task-map*`, `operating-model*`, `unified-harness-engineering-substrate*` | 公开产品方向和用户理解支撑 | 保持 public support；用户阅读，不作为实现 backlog。 |
| `docs/history/process/specs/2026-04-20-*`, `docs/history/process/specs/2026-04-21-*` | archived Product API / ACP 规格历史 | 八类产品资源模型、session-runtime-first pivot、shell/projection 边界和 domain truth 边界已吸收到核心五件套、current development lines、domain onboarding 与 stage-led roadmap；整文档不再作为活跃 specs 保留。 |
| `docs/references/runtime-substrate/opl-runtime-manager-target.md` | Runtime Manager / provider readiness / state index 目标支撑 | 保持 support reference；App/workbench 和 runtime snapshot 相关内容以当前实现和 contracts 为准。 |
| `docs/references/runtime-substrate/family-runtime-attempt-contract.md` | stage attempt 语义参考 | 有效内容合入 framework contracts / current roadmap；文档继续作为参考，不成为 machine contract。 |
| `docs/references/runtime-substrate/family-executor-adapter-defaults.md` | executor adapter 默认策略参考 | 按 roadmap 复核后保留；旧 Hermes-first 或非 Codex-default wording 不再扩写为主线。 |
| `docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md` | 外部 orchestration 模式吸收记录 | 保留为 external learning reference；只吸收 contract vocabulary，不引入外部 runtime truth。 |
| `docs/history/runtime-substrate/family-product-entry-and-domain-handoff-architecture.md` | 早期 product-entry / handoff 架构历史 | operator / agent / product entry taxonomy、handoff envelope、domain authority boundary 已吸收到 Domain-Agent Admission Contract；Hermes Kernel / Gateway wording 只保留为历史。 |
| `docs/history/runtime-substrate/family-lightweight-direct-entry-rollout-board.md` | 早期 direct-entry 推进板历史 | entry surface / operator loop 区分、direct path 与 OPL handoff 对齐经验已吸收到 Domain-Agent Admission Contract。 |
| `docs/history/runtime-substrate/mas-top-level-cutover-board.md` | 早期 OPL->MAS 切换板历史 | OPL -> MAS handoff 字段与 transition honesty 已吸收；当前 MAS 迁移顺序以 OPL roadmap 和 MAS active portfolio/current development lines 为准。 |
| `docs/history/runtime-substrate/opl-product-entry-and-hermes-kernel-integration.md` | Hermes-first product-entry 决策历史 | 不 fork/vendor 外部 runtime、不要把用户暴露给底层 runtime 拼装、Hermes-first 误写禁止项已吸收；当前目标是 provider-backed runtime。 |
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
| Hermes-first online substrate、Hermes Kernel as default product runtime | history / provenance / diagnostic / negative-guard reference；当前默认主线是 provider-backed framework |
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
| Hermes-first product-entry / kernel integration | 不再作为目标 runtime 主线。保留为历史决策和 provenance 背景。 |
| Lightweight direct-entry 全家族推进板 | 不再作为当前完整 backlog。保留 entry taxonomy、handoff envelope 和 entry/operator 边界经验。 |
| OPL vertical online-agent platform roadmap | 不再作为总路线图。有效内容已被 stage-led framework / public roadmap 吸收。 |
| MAS top-level cutover board | 不再作为 MAS 当前迁移顺序。当前 MAS 迁移按 OPL framework-first + MAS active portfolio 执行。 |
| Host-agent runtime contract | 不再独立定义当前目标 runtime。有效 Codex-default 口径已合入 runtime boundary、domain onboarding 和 framework roadmap；整文档进入 `docs/history/runtime-substrate/`。 |
| Managed runtime migration checklist | 不再作为当前迁移队列。R1-R8 readiness 维度已吸收到 runtime boundary；逐仓判断保留为历史 snapshot。 |
| Product API / ACP native specs | 不再作为实现队列；已迁入 `docs/history/process/specs/`，只保留历史形成过程。 |

## Coverage Ledger

Date: `2026-05-25 15:35 CST`
Tranche: `strict-source-purity-doc-governance`
State: `tranche_verified_scope_pending`

本轮只覆盖 OPL series 的 12 个主参考文档、当前 active truth owner、与 strict standard-agent source purity 直接相关的改动章节；它不关闭全局文档治理目标，也不表示 6 仓 `README*` 与 `docs/**/*.md` 已逐段全覆盖。

Fresh live truth inputs:

- `opl framework readiness --family-defaults --json`
- `opl agents conformance --family-defaults --json`
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`
- `opl runtime app-operator-drilldown --json`

Fresh read-model result:

- `opl agents conformance` 读为 `status=passed`、`passed_count=4`、`blocked_count=0`；这只证明 current descriptor / skeleton / policy 可读，不能升级为 strict source-purity 全局完成。
- `family-runtime evidence-worklist` 读为 `open_worklist_item_count=0`、`open_safe_action_payload_required_item_count=0`、`open_safe_action_payload_free_item_count=0`、`domain_ready_authorized=false`、`production_ready_authorized=false`；`default_caller_delete_ready` 仍在 not-authorized claims 中。
- `app-operator-drilldown` 读为 `availability=available`、`functional_privatization_action_required_count=0`、`default_caller_deletion_evidence_open_requirement_count=0`、`app_release_user_path_release_ready_claimed=false`、`app_release_user_path_production_ready_claimed=false`；这些读数只表示当前 read model 没有可执行 deletion-evidence requirement，不授权 domain repo 物理删除。

Reviewed primary references:

| Repo | Reviewed primary docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/active/current-state-vs-ideal-gap.md` strict purity gaps, `docs/status.md` current status, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md` target shape, this portfolio owner | `docs/active/development-document-portfolio.md` |
| `med-autoscience` | `README.md` public package role, `docs/active/mas-ideal-state-gap-plan.md` progress / functional gaps / prompt / closeout gate, `docs/references/positioning/mas_ideal_state.md`, `docs/status.md`, `docs/decisions.md` runtime guard wording | `README.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/decisions.md`, `docs/references/positioning/mas_ideal_state.md`, `docs/status.md` |
| `med-autogrant` | `README.md` package role, `docs/active/mag-ideal-state-cross-repo-gap-plan.md` progress / functional gaps / next prompt, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/references/med-auto-grant-ideal-state.md`, `docs/status.md` | `README.md`, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/references/med-auto-grant-ideal-state.md`, `docs/status.md` |
| `redcube-ai` | `README.md` package role, `docs/active/rca-ideal-state-gap-plan.md` progress / functional gaps / hygiene tail, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/decisions.md`, `docs/status.md` | `README.md`, `docs/active/rca-ideal-state-gap-plan.md`, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/decisions.md`, `docs/status.md` |
| `opl-meta-agent` | `docs/active/opl-meta-agent-ideal-state-gap-plan.md` strict script hygiene, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/status.md`, `docs/references/opl-meta-agent-ideal-state.md` | `docs/active/opl-meta-agent-ideal-state-gap-plan.md`, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/status.md` |
| `one-person-lab-app` | `README.md`, `docs/active/app-ideal-state-gap-plan.md`, `docs/status.md` status check only | none |

Archived / tombstoned / deleted docs:

- none this tranche. The active problem was stale completion wording, not a doc-path retirement with no-active-caller proof.

Unreviewed docs:

- All `README*` and `docs/**/*.md` sections not listed above remain unreviewed for this tranche.
- OPL `dist/package-sources/**` snapshots were intentionally not edited; they are generated/package source material and need a separate source-of-truth refresh path if stale.
- App `docs/release/README.md` and release scripts are held by an active `codex/nightly-release-20260525` worktree and were not governed in this tranche.

Remaining stale / retire candidates:

- MAS: product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell must either become domain handler / authority refs or be deleted after OPL generated/default caller parity and no-active-caller proof.
- MAG: product-entry, status/user-loop, sidecar, domain_runtime, lifecycle/projection/autonomy/CLI shell and compatibility tests remain strict source-purity tail after OPL cutover.
- RCA: product-entry/session/domain_action_adapter/runtimeWatch/operator projection/executor record adapters remain strict wrapper/source-purity tail; history terms `managed`, `gateway`, `runtime`, `session` require continued no-resurrection guards.
- OMA: scripts/materializers stay as authority implementation, smoke helper, fixture/proof helper or work-order materializer only; stable policy should move to `agent/`, `contracts/`, `runtime/authority_functions/` or an OPL primitive.
- App: release-ready / production-ready remains separate from App user-path evidence; nightly release lane has active local changes and must close in its own owner lane.

Next tranche write scope:

- Continue from the strict source-purity tail: choose one domain repo at a time, prove active caller and OPL generated/default replacement path from source/contracts/tests, then delete or thin repo-local generic wrapper / adapter / compatibility tests with repo-native verification.
- In parallel, continue whole-docs portfolio audit by repo: for each repo, work through `README*` and `docs/**/*.md` section-by-section, update this ledger with reviewed / unreviewed paths, and move stale process material to `docs/history/**` only when useful provenance remains.

Date: `2026-05-25 15:54 CST`
Tranche: `oma-readme-docs-full-coverage`
State: `tranche_verified`

本轮覆盖 `opl-meta-agent` 的全部 repo-root `README*`、`docs/**/*.md` 和 agent pack README 支撑文档，并用 OMA contracts、tests、runtime authority refs 与 OPL read-model 输出复核 readiness / production / generated-surface / script-hygiene 边界。未发现需要改写 OMA 文档的 stale current-truth、误授权 production ready、重复 active plan 或待 tombstone doc path；本轮唯一写入是本 coverage ledger。

Fresh live truth inputs:

- OMA `package.json` scripts、`contracts/functional_privatization_audit.json`、`contracts/default_caller_deletion_evidence.json`、`contracts/production_acceptance/meta-agent-production-acceptance.json`、`contracts/production_acceptance/oma-production-consumption-long-soak-typed-blocker.json`、`runtime/authority_functions/meta-agent-authority-functions.json`。
- OPL `agents conformance --family-defaults --json`、`framework readiness --family-defaults --json`、`runtime app-operator-drilldown --json`、`family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。
- OMA README/docs full text and `agent/*/README.md` support index files.

Fresh read-model result:

- OMA 标准 agent conformance 仍为 `status=passed`，family summary 为 `passed_count=4`、`blocked_count=0`、`production_evidence_tail_count=4`；这只证明 structural conformance，不授权 production ready。
- OPL App/operator drilldown 读到 `opl_meta_agent_production_consumption_ready=true`、`opl_meta_agent_claims_domain_ready=false`、`app_release_user_path_release_ready_claimed=false`、`app_release_user_path_production_ready_claimed=false`。该 ready 只表示 OPL refs-only production-consumption gate 可消费；OMA 自身 production acceptance contract 仍保留 `production_consumption_ready=false` 的 long-soak typed blocker。
- Family evidence worklist 读到 `open_worklist_item_count=0`、`domain_ready_authorized=false`、`production_ready_authorized=false`、`zero_open_worklist_is_domain_ready=false`、`zero_open_worklist_is_production_ready=false`，因此 zero-open worklist 不能写成 domain / production completion。
- OMA functional privatization contract 读到 `source_shape=landed`、`functional_structure_gap_count=0`、`domain_repo_retained_generic_surface_count=0`、`remaining_tail_kinds=[opl_generated_default_caller_consumption_tail, domain_refs_only_adapter_thinning, script_to_pack_hygiene, evidence_tail]`；这与 OMA docs 中的 strict source-purity tail 口径一致。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `opl-meta-agent` | `README.md`, `README.zh-CN.md`, `docs/README.md`, `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/references/opl-meta-agent-ideal-state.md`, `docs/active/opl-meta-agent-ideal-state-gap-plan.md`, `docs/active/opl-private-implementation-migration-inventory.md`, `agent/skills/README.md`, `agent/prompts/README.md`, `agent/knowledge/README.md`, `agent/stages/README.md`, `agent/quality_gates/README.md` | none |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. OMA currently has one active plan owner, one ideal-state reference, one private implementation inventory, and no stale doc path with proven no-active-role requiring archive/delete in this tranche.

Unreviewed docs:

- `opl-meta-agent`: none for repo-root `README*`, `docs/**/*.md`, and agent pack README support files. Non-README semantic pack files under `agent/` were used as contract support surface only, not governed as full prose docs in this tranche.
- Other repos remain under the previous ledger's unreviewed scope except for documents already listed in prior reviewed primary references. OPL/MAS/MAG/RCA/App still need repo-by-repo whole-docs coverage before the global `/goal` can close.
- App release docs and worktrees remain excluded because active release / GUI lanes have uncommitted or recent writes.

Remaining stale / retire candidates:

- OMA: no current README/docs tombstone candidate found. Remaining work is evidence/hygiene, not doc-path retirement: repeat long-soak / App live render-runtime drilldown evidence, more real target patch-loop owner receipt or typed blocker samples, standard target-agent handoff convergence, and continued script-to-pack / OPL primitive hygiene.
- OMA scripts/materializers must stay limited to authority implementation refs, smoke helpers, fixture/proof helpers, or developer work-order materializers; any growth toward private Agent Lab runner, promotion gate, workbench, generated shell, target truth writer, owner receipt body writer, scheduler, queue or attempt ledger reopens the active plan.

Next tranche write scope:

- Continue whole-docs portfolio audit in one remaining repo at a time, preferably a repo whose main checkout is clean and whose active worktrees are either absent or outside docs scope.
- For each chosen repo, inventory all `README*` and `docs/**/*.md`, compare active claims to source/contracts/tests/CLI read-model truth, then update this ledger with reviewed docs, edited docs, archive/tombstone/delete actions, unreviewed docs, stale/retire candidates and next prompt scope.

Date: `2026-05-25 16:11 CST`
Tranche: `strict-source-purity-implementation-cutover`
State: `tranche_verified`

本轮按 strict OPL standard-agent 口径推进 MAS、MAG、RCA 与 OMA 的源码/合同/测试落地，并吸收回各自 `main`。边界是：保留 domain pack、machine-readable contracts、minimal authority functions、domain handler target、refs-only owner/typed-blocker/receipt materialization 与必要 native/helper；不把 repo-local generic control plane、wrapper、compat alias、run store、workbench/status/product shell 写成长期标准智能体组成。

Fresh live truth inputs:

- OPL `opl agents conformance --family-defaults --json`
- OPL `opl runtime app-operator-drilldown --json`
- OPL `opl framework readiness --family-defaults --json`
- MAS/MAG/RCA/OMA 各自 repo-native tests、contracts 与 status docs

Fresh read-model result:

- `opl agents conformance` 读为 `status=passed`、`passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`；这只证明当前 standard-agent structural conformance 可读，不授权 domain ready 或 production ready。
- `app-operator-drilldown` 读为 `functional_privatization_action_required_count=0`、`functional_privatization_active_private_generic_residue_count=0`、`default_caller_deletion_evidence_open_requirement_count=0`、`domain_ready_claim_count=0`；这些读数不授权 domain repo 物理删除或 owner receipt 生成。
- `framework readiness` 在本轮 OMA test morphology 修复前曾因 `tests/source-purity.test.ts` 中 active forbidden role 字面量阻塞；修复后 OMA `physical_morphology_checks.status=passed`、`active_forbidden_name_residue_count=0`。

Implementation landed:

| Repo | Commit | Landed boundary | Verification |
| --- | --- | --- | --- |
| `med-autoscience` | `38e6f945 Retire MAS active compatibility alias purity proof` | current proof 字段从 `active_compatibility_aliases` 切到 `retired_alias_residue_refs`，源常量、functional closure 判定、provider-ready handoff、`functional_privatization_audit`、test-lane manifest 与 focused tests 同步；current purity proof 不再承认 active compat alias 字段。 | focused pytest `41 passed`; `make test-meta` `260 passed, 3784 deselected`; `git diff --check` |
| `med-autogrant` | `466e383 Clarify MAG OPL source-purity deletion gate` | machine truth 拆成 `claims_opl_replacement_exists=true` 与 `claims_domain_repo_physical_delete_authorized=false`；OPL replacement/cutover readiness 与 MAG repo physical delete authority 分离，避免把 direct handler / refs-only adapter 硬删成功能降级。 | `scripts/verify.sh` fast `226 passed, 154 subtests passed`; `make test-meta` `64 passed, 19 subtests passed`; focused tests `72 passed, 263 subtests passed`; `git diff --check` |
| `redcube-ai` | `f9641b2 rca: neutralize route-run record adapter api` | Hermes-named run/event API 收薄为 neutral route-run API；合同和 docs 明确 RCA 只保留 route policy、neutral route-run refs 与 receipt refs，runtime record/event log、stale audit 和 attempt ledger 属于 OPL default-caller tail。 | `npm run test:fast` passed; `npm run test:meta` `289 passed`; focused tests `8 passed`; `contracts:current-program:check` `292 leaf refs`; `git diff --check` |
| `opl-meta-agent` | `1db4e2a Tighten OMA source purity guard`; `17db095 Fix OMA source purity test morphology residue` | 新增 source-purity 专项测试和 `runtime/authority_functions` receipt；scripts 仅按 authority implementation、smoke helper、fixture/proof helper 或 work-order materializer 读取。随后修复测试自身的 active forbidden role 字面量，避免测试文件成为 morphology residue。 | `npm test` `41 passed`; OPL conformance `passed_count=4`, `blocked_count=0`; `git diff --check` |

Current strict boundary after this tranche:

- MAS：active product/status/workbench/sidecar/controller/progress shell 仍只能作为 domain handler、refs-only projection source、owner refs / typed blocker / diagnostic refs target 读取；不能作为长期 MAS generic wrapper。当前已清理的是 active compat alias proof 字段，不是所有 wrapper physical delete。
- MAG：OPL replacement exists 已入 machine truth，但 `claims_domain_repo_physical_delete_authorized=false`；不能物理删除仍被 direct path / domain handler 消费的 active shell，直到 MAG owner receipt/no-active-caller/no-forbidden-write proof 到位。
- RCA：route-run record adapter 已 neutralized；旧 Hermes-named API 不再是 active public route-run API。剩余是 OPL Agent Executor Adapter default caller、attempt ledger/runtime record/event log 与 stale audit read-model 默认化后的 deletion/thinning tail。
- OMA：repo shape 现在由 `agent/`、`contracts/`、`runtime/authority_functions/` 与 scripts authority/materializer/helper refs 组成；普通测试文件不再携带 active forbidden morphology token。

Remaining stale / retire candidates:

- MAS/MAG/RCA 的 physical delete 仍需要 domain owner receipt 或 stable typed blocker、no-active-caller proof、direct/hosted parity、no-forbidden-write proof 与 OPL default-caller parity；当前 read-model 的 zero open requirement 不等于 physical delete authorization。
- OMA 后续只做证据/hygiene 扩面，不新增 repo-owned generic CLI/MCP/Skill/product/status/workbench wrapper、Agent Lab runner、promotion gate、queue、attempt ledger 或 target truth writer。
- OPL framework 当前仍有 provider worker stale attention；这是 provider lifecycle repair，不是 standard-agent source-purity blocker，也不授权 domain ready / production ready。

Date: `2026-05-25 16:18 CST`
Tranche: `mag-docs-portfolio-entry-coverage`
State: `tranche_verified`

本轮覆盖 `med-autogrant` 的 docs portfolio 入口、12 个主参考文档中的 MAG ideal-state reference / active truth owner、核心五件套、当前 specs / references / history 索引和 root / agent / contracts / runtime README 支撑。MAG Markdown 总 inventory 为 120 份，其中 68 份是 `docs/history/specs/*.md` 历史 specs；本轮不逐篇改写历史正文，只在历史索引层补上继承 lifecycle 规则，避免把旧 `Current Truth`、Hermes/Gateway/local-runtime wording 或 dated completion claim 重新读成当前 owner。

Fresh live truth inputs:

- MAG `contracts/runtime-program/current-program.json`
- MAG `contracts/functional_privatization_audit.json`
- MAG `contracts/production_acceptance/mag-production-acceptance.json`
- MAG `contracts/generated_surface_handoff.json`
- MAG `contracts/external_evidence/mag-evidence-receipt-ledger.json`
- MAG OPL Doc Governance doctor on the tranche worktree

Fresh contract result:

- `runtime_owner.default_task_runtime_owner=one-person-lab`、`default_runtime_substrate=temporal`、`default_stage_executor=codex_cli`；MAG 不实现 daemon / scheduler / attempt loop / attempt ledger。
- `claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`、`claims_production_long_run_soak_complete=false`；OPL replacement/cutover 结构证据不授权 MAG repo 物理删除 active handler/adapter，也不授权 production ready。
- `mag_functional_structure_gap_count=0`、`standard_agent_source_shape_status=landed` 仍按历史结构分类读取，不写成 strict source-purity 物理完成。
- `mag-production-acceptance` 持有 MAG-owned owner receipt / typed blocker refs；`authority_boundary.opl_can_authorize_grant_domain_ready=false`、`provider_completion_equals_domain_ready=false`、`structural_conformance_equals_domain_ready=false`。
- external evidence ledger 中 `claims_direct_hosted_parity_passed=true`、`claims_temporal_provider_long_soak_complete=false`、`claims_grant_or_fundability_ready=false`。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | `README.md`, `README.zh-CN.md`, `agent/README.md`, `contracts/README.md`, `runtime/README.md`, `docs/README.md`, `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/docs_portfolio_consolidation.md`, `docs/active/README.md`, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/references/med-auto-grant-ideal-state.md`, `docs/references/README.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/README.md`, `docs/history/specs/README.md`, `docs/history/plans/README.md`, `docs/history/omx/README.md`, plus heading/metadata inventory for all 120 Markdown files. | `contracts/README.md`, `docs/history/README.md`, `docs/history/specs/README.md`, `docs/history/plans/README.md`, `docs/history/omx/README.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The active issue was missing first-screen lifecycle inheritance on MAG history/contract indexes, not a doc-path retirement with new no-active-caller proof.

Unreviewed docs:

- `med-autogrant`: the remaining 95 Markdown files are inventoried and route-checked by heading/metadata/stale-risk scan, but not fully paragraph-governed in this tranche. They stay under the global unreviewed scope until a later MAG full-body tranche covers each historical spec / support spec / public and product/runtime/source/delivery/policies README section.
- Other repos remain under the previous ledger's unreviewed scope except OMA, whose README/docs coverage was completed in `oma-readme-docs-full-coverage`.
- App docs remain excluded while dirty/recent App release and GUI worktrees own local changes.

Remaining stale / retire candidates:

- MAG history specs still contain dated `Current Truth`, `Activation Status`, Hermes/Gateway/local-runtime and hosted/provider wording; history index now declares inherited lifecycle semantics, but a later body-level pass should add or normalize per-file lifecycle notes only where a file lacks one and is likely to be opened directly.
- MAG support specs under `docs/specs/*.md` still need a later paragraph-level pass to confirm each current subsection against contracts/schema/source and the specs lifecycle map.
- MAG product/runtime/delivery/source/policies README files are thin indexes; keep them as directory duty anchors unless a later pass finds duplicate current truth.

Next tranche write scope:

- Continue with MAG full-body docs coverage in chunks: first `docs/specs/*.md` and public/product/runtime/delivery/source/policies README files, then historical specs by lifecycle-note coverage. Do not promote history wording to current truth; extract any still-current rule into core docs, active gap plan, specs lifecycle map, contract or source.
- Or switch to another clean remaining repo (`one-person-lab`, `redcube-ai`, or App after active worktrees close) and repeat README/docs section-by-section coverage with ledger update.

Date: `2026-05-25 16:31 CST`
Tranche: `mag-specs-thin-index-coverage`
State: `tranche_verified`

本轮覆盖 `med-autogrant` 的 `docs/specs/*.md`、`docs/specs/specs_lifecycle_map.md` 和 `docs/public|product|runtime|delivery|source|policies/README.md` 薄索引。目标是把上一轮 MAG entry coverage 留下的 support specs / thin index 缺口收窄：逐段核对 specs 的 lifecycle note、active/support/historical 分层、ready verdict 边界和旧 Hermes/Gateway/local-runtime 词族处置；薄索引只保留目录职责与当前入口，不复制 active plan、contract 或 product-entry manifest。

Fresh live truth inputs:

- MAG `contracts/runtime-program/current-program.json`
- MAG `contracts/functional_privatization_audit.json`
- MAG `contracts/production_acceptance/mag-production-acceptance.json`
- MAG `contracts/external_evidence/mag-evidence-receipt-ledger.json`
- MAG `schemas/v1/schema-index.json` and source/test refs for product-entry, progress, user-loop, submission-ready, quality/autonomy and executor surfaces
- MAG OPL Doc Governance doctor on the tranche worktree

Fresh contract result:

- `runtime_owner.default_task_runtime_owner=one-person-lab`、`default_runtime_substrate=temporal`、`default_stage_executor=codex_cli` remain current.
- `claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`、`claims_production_long_run_soak_complete=false` remain current.
- `mag_functional_structure_gap_count=0`、`standard_agent_source_shape_status=landed` remain structural classification signals only.
- `authority_boundary.opl_can_authorize_grant_domain_ready=false` and `provider_completion_equals_domain_ready=false` remain current.
- external evidence ledger still reads `claims_temporal_provider_long_soak_complete=false` and `claims_grant_or_fundability_ready=false`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, all 13 `docs/specs/*.md` records, `docs/public/README.md`, `docs/product/README.md`, `docs/runtime/README.md`, `docs/delivery/README.md`, `docs/source/README.md`, `docs/policies/README.md`; scan covered `Current Truth`, `Activation Status`, Hermes/Gateway/local-runtime wording, compatibility wording, hosted runtime / Web UI claims, and ready-verdict terms. | `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/public/README.md`, `docs/product/README.md`, `docs/runtime/README.md`, `docs/delivery/README.md`, `docs/source/README.md`, `docs/policies/README.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The specs files already have lifecycle notes and current/support/historical routing. This tranche only removed process-lane wording from current specs indexes and normalized thin-index owner signals.

Unreviewed docs:

- `med-autogrant`: root README, core docs, active plan, ideal-state reference, entry indexes and current `docs/specs/*.md` are now covered at current/support level. Remaining MAG body coverage is primarily historical specs/plans/support reference prose under `docs/history/**` and non-index reference docs that were not paragraph-governed in this tranche.
- Other repos remain under the previous ledger's unreviewed scope except OMA full coverage.
- App docs remain excluded while dirty/recent App release and GUI worktrees own local changes.

Remaining stale / retire candidates:

- MAG `docs/history/specs/*.md` still contains dated `Current Truth`, `Activation Status`, Hermes/Gateway/local-runtime and hosted/provider wording. History index inheritance now covers them, but direct-file body notes should be normalized later where missing or likely to be opened directly.
- MAG non-index references such as grant strategy memory and OPL family contract adoption still need a separate paragraph-level pass against current contracts/source.

Next tranche write scope:

- Continue MAG body coverage on `docs/history/specs/*.md` in batches, adding per-file lifecycle notes only where needed and avoiding promotion of historical wording.
- Or switch to OPL/MAS/RCA/App full README/docs coverage; keep App delayed until active release/GUI worktrees close.

Date: `2026-05-25 16:46 CST`
Tranche: `mag-history-foundation-specs-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 `med-autogrant` 的 `docs/history/specs/2026-04-06-*.md` foundation history specs。目标是把上一轮 MAG history specs body coverage 的第一批直接文件入口收紧：每份历史 foundation spec 首屏都持有文件级 `Owner`、`Purpose`、`State`、`Machine boundary`，明确这些文件只保留 2026-04-06 foundation 形成过程，当前 MAG role、OPL/Temporal runtime owner、active specs、schema/source/CLI/API truth 与机器行为回到核心五件套、`docs/specs/README.md`、`docs/specs/specs_lifecycle_map.md`、contracts、schemas、source 和 `contracts/runtime-program/current-program.json`。

Fresh live truth inputs:

- MAG `AGENTS.md`、`TASTE.md`
- MAG `README.md`、`README.zh-CN.md`、`docs/README.md`、`docs/status.md`、`docs/active/mag-ideal-state-cross-repo-gap-plan.md`、`docs/history/specs/README.md`
- MAG `contracts/runtime-program/current-program.json`
- MAG `contracts/functional_privatization_audit.json`
- MAG `contracts/external_evidence/mag-evidence-receipt-ledger.json`
- MAG `docs/active/opl-private-implementation-migration-inventory.md`

Fresh contract result:

- `runtime_owner.default_task_runtime_owner=one-person-lab`、`default_runtime_substrate=temporal`、`default_stage_executor=codex_cli`、`mag_implements_daemon=false`、`mag_implements_scheduler=false`、`mag_implements_attempt_loop=false`、`mag_owns_attempt_ledger=false` remain current.
- `claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`、`claims_production_long_run_soak_complete=false` remain current in functional privatization audit.
- `standard_agent_source_shape_status=landed` remains a structural classification signal only; it is not strict source-purity physical completion.
- External evidence ledger summary keeps `claims_temporal_provider_long_soak_complete=false` and `claims_grant_or_fundability_ready=false`; remaining real evidence gap is `temporal_provider_long_soak_window_evidence`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | `docs/history/specs/2026-04-06-med-auto-grant-top-level-design.md`, `docs/history/specs/2026-04-06-med-autogrant-mainline-and-omx-bridge.md`, `docs/history/specs/2026-04-06-nsfc-main-flow-and-critique-loop.md`, `docs/history/specs/2026-04-06-object-model-schema-v1.md`; sections reviewed include title, lifecycle note, goal, role/priority, flow/schema/long-run handoff content, historical next-step/current-priority language and references to old host-agent / OMX / local runtime surfaces. | same four files |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four files still carry useful foundation provenance and direct-file reader value; the governance action was first-screen lifecycle clarification, not physical archive/delete.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch are not paragraph-governed in this tranche. `docs/history/plans/**`, `docs/history/product/**`, `docs/history/runtime/**`, `docs/history/positioning/**` and non-index `docs/references/**/*.md` still need separate body-level coverage unless covered by earlier ledger entries.
- Other repos remain under the previous ledger's unreviewed scope except OMA full coverage and the MAG current/support specs / thin indexes already covered.
- App docs remain excluded while dirty/recent App release and GUI worktrees own local changes.

Remaining stale / retire candidates:

- MAG remaining history specs still contain dated `Current Truth`, `Activation Status`, Hermes/Gateway/local-runtime and hosted/provider wording. Directory inheritance covers them, but later direct-file body passes should add or normalize file-level lifecycle four-signal notes when a file is likely to be opened directly.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-07 authoring-flow provenance and 2026-04-11/2026-04-12 Hermes / hosted-caller specs because direct-file stale provider wording risk is higher there.
- Or switch to OPL/MAS/RCA/App full README/docs coverage; keep App delayed until active release/GUI worktrees close.

Date: `2026-05-25 17:21 CST`
Tranche: `strict-agent-boundary-refresh`
State: `tranche_superseded_by_later_live_refresh`

本条记录 17:21 前 strict-agent boundary refresh 的过程证据；后续 MAS/MAG/RCA/OMA 与 OPL read-model 已刷新，当前结论以本文件 19:40 `opl-entry-core-current-truth-coverage`、`docs/status.md`、`docs/active/current-state-vs-ideal-gap.md` 和 live CLI/read-model 为准。当前四仓 structural conformance 通过，但这只关闭 source-shape / structural gap，不授权 physical delete、domain ready、artifact authority、App release ready 或 production ready。

Fresh live truth inputs:

- OPL `opl agents conformance --family-defaults --json`
- OPL `opl agents default-callers --family-defaults --json`
- OPL `opl runtime app-operator-drilldown --json`
- OPL `opl framework readiness --family-defaults --json`
- OPL `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`
- MAS/MAG/RCA/OMA `contracts/functional_privatization_audit.json` and adjacent source-purity / production acceptance contracts

Fresh read-model result:

- `opl agents conformance` 读为 `status=passed`、`passed_count=4`、`blocked_count=0`，只证明 descriptor / skeleton / policy 可读。
- `opl agents default-callers` 读为 generated default-caller surface count `32`、blocked surface count `0`、missing domain-owner / no-forbidden-write / tombstone-provenance counts `0`，但 `physical_delete_authorized_by_this_report=false`。
- 当前 `runtime app-operator-drilldown` 读为 `functional_privatization_action_required_count=0`、`functional_privatization_active_private_generic_residue_count=0`、`default_caller_deletion_evidence_open_requirement_count=0`、`domain_legacy_cleanup_plan_count=3`、`domain_legacy_cleanup_ready_plan_count=2`、`domain_legacy_cleanup_blocked_plan_count=1`、`lifecycle_domain_physical_delete_can_execute=false`。
- 当前 `framework readiness` 读为 `control_plane_available=true`、`framework_kernel_hard_blocker_count=0`、`agent_conformance_hard_blocker_count=0`、`operator_actionable_attention_tail_count=0`、`domain_blocked_attention_tail_count=209`、`evidence_envelope_blocked_count=196`；provider SLO cadence / capability satisfied，当前没有 OPL 侧 operator-actionable safe-action tail。
- 当前 `family-runtime evidence-worklist` 读为 `open_worklist_item_count=0`、`open_safe_action_payload_required_item_count=0`、`open_safe_action_payload_free_item_count=0`、`zero_open_worklist_blocked_refs_only_envelope_count=196`、`domain_ready_authorized=false`、`production_ready_authorized=false`。

Per-agent audit:

| Repo | Fresh contract result | Boundary conclusion |
| --- | --- | --- |
| `med-autoscience` | 当前读为 `functional_structure_gap_count=0`、`repo_local_wrapper_tail_count=0`、`source_purity_cutover_status=standard_agent_source_shape_landed`、`domain_repo_physical_delete_authorized=false`。 | 结构源码形态已 landed。原 product/status/workbench、owner-route handoff 与 progress/domain-ref projection wrapper tail 只作为 former tail / deletion-gate provenance；剩余是 paper owner-chain、memory/artifact/lifecycle receipt 和 provider long-soak evidence。 |
| `med-autogrant` | `mag_functional_structure_gap_count=0`、`standard_agent_source_shape_status=landed`、`claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`。 | 结构源码形态已 landed，物理删除未授权。MAG wrapper / lifecycle / product shell 只能作为 deletion / evidence tail，不是长期组成。 |
| `redcube-ai` | `functional_structure_gap_count=0`、`unclassified_private_generic_residue_count=0`、allowed remaining module classes are domain handler / refs-only adapter / declarative pack / minimal authority / native helper / provenance；bridge gates read `physical_delete_authorized=false`。 | 结构源码形态已 landed，物理删除未授权。RCA generic wrapper、executor adapter、operator projection、stability read model 等继续按 deletion / hygiene tail 读取。 |
| `opl-meta-agent` | `source_shape=landed`、`functional_structure_gap_count=0`、`domain_repo_retained_generic_surface_count=0`，remaining tails are `opl_generated_default_caller_consumption_tail`、`domain_refs_only_adapter_thinning`、`script_to_pack_hygiene`、`evidence_tail`。 | 当前没有 active generic runtime owner；scripts 只允许 authority implementation、smoke helper、fixture/proof helper 或 work-order materializer，不能扩成 Agent Lab runner / promotion gate / queue / attempt ledger / target truth writer。 |

Edited docs this tranche:

| Repo | Edited docs |
| --- | --- |
| `one-person-lab` | `docs/policies/domain-private-functional-surface-policy.md`, `docs/active/standard-agent-private-platform-inventory.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/status.md`, `docs/active/development-document-portfolio.md` |

Remaining stale / retire candidates:

- MAS/MAG/RCA/OMA should not be marked dirty at structural-conformance level. Any retained repo-local generic-looking shell/materializer/wrapper may only remain under deletion / evidence / hygiene / provenance classification until physical delete is authorized by owner refs and no-active-caller proof.
- OPL read-model zero missing deletion requirements is only structural replacement evidence; it does not authorize domain repo physical delete, domain ready, artifact authority, quality/export verdict, App release ready or production ready.

Next tranche write scope:

- Continue OPL full docs coverage in bounded history/reference/support chunks, or pick a domain physical-delete/evidence-tail tranche with repo-native verification before refreshing OPL read-model docs.
- Do not revive repo-local wrapper, sidecar, materializer, diagnostic shell, facade, alias or compatibility-only test surfaces as standard-agent components.

Date: `2026-05-25 16:58 CST`
Tranche: `mag-20260407-authoring-flow-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 `med-autogrant` 的 `docs/history/specs/2026-04-07-*.md` authoring-flow / review-gate history specs。目标是把 P2.A / P2.B / P2.C authoring flow 和 P3.A review-gate 的直接文件入口收紧：每份历史 spec 首屏都持有文件级 `Owner`、`Purpose`、`State`、`Machine boundary`，明确这些文件只保留 2026-04-07 route/object/verdict 形成过程，当前 route truth、authoring pass、executor boundary、AI-first quality gate、OPL/Temporal runtime owner 与机器行为回到核心五件套、active specs index、specs lifecycle map、contracts、schemas、source、CLI/API 行为和 `contracts/runtime-program/current-program.json`。

Fresh live truth inputs:

- MAG `AGENTS.md`、`TASTE.md`
- MAG `README.md`、`docs/README.md`、`docs/status.md`、`docs/active/mag-ideal-state-cross-repo-gap-plan.md`、`docs/history/specs/README.md`
- MAG `contracts/runtime-program/current-program.json`
- MAG `contracts/functional_privatization_audit.json`
- MAG `contracts/external_evidence/mag-evidence-receipt-ledger.json`

Fresh contract result:

- `runtime_owner.default_task_runtime_owner=one-person-lab`、`default_runtime_substrate=temporal`、`default_stage_executor=codex_cli` remain current.
- `mag_implements_daemon=false`、`mag_implements_scheduler=false`、`mag_implements_attempt_loop=false`、`mag_owns_attempt_ledger=false` remain current.
- `claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`、`claims_production_long_run_soak_complete=false` remain current.
- `standard_agent_source_shape_status=landed` remains structural classification only, not strict source-purity physical completion.
- External evidence ledger keeps `claims_temporal_provider_long_soak_complete=false` and `claims_grant_or_fundability_ready=false`; remaining real evidence gap is `temporal_provider_long_soak_window_evidence`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | `docs/history/specs/2026-04-07-p2a-intake-direction-question-mainline-current-truth.md`, `docs/history/specs/2026-04-07-p2b-argument-fit-outline-mainline-current-truth.md`, `docs/history/specs/2026-04-07-p2c-draft-critique-revision-skeleton-mainline-current-truth.md`, `docs/history/specs/2026-04-07-p3a-mentor-verdict-contract-freeze-current-truth.md`; sections reviewed include title, lifecycle note, goal, current pointer, canonical route/object/artifact/audit surface, non-goals and old formal-entry / CLI/runtime wording. | same four files |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four files remain useful authoring-flow / review-gate provenance; the governance action was first-screen lifecycle clarification, not physical archive/delete.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation and 2026-04-07 authoring-flow/review-gate batches are not paragraph-governed in this tranche. `docs/history/plans/**`, `docs/history/product/**`, `docs/history/runtime/**`, `docs/history/positioning/**` and non-index `docs/references/**/*.md` still need separate body-level coverage unless covered by earlier ledger entries.
- Other repos remain under previous ledger scopes except OMA full coverage and MAG current/support specs / thin indexes / 2026-04-06 foundation / 2026-04-07 authoring-flow batches.
- App docs remain excluded while active release/GUI worktrees own local changes.

Remaining stale / retire candidates:

- MAG remaining history specs with higher stale-provider risk are 2026-04-11 / 2026-04-12 Hermes, hosted-caller, hosted contract bundle, OPL alignment and lightweight product-entry handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-11 Hermes/reset/local-runtime closeout and 2026-04-12 hosted-caller / OPL alignment / lightweight handoff specs.
- Or switch to OPL/MAS/RCA/App full README/docs coverage; keep App delayed until active release/GUI worktrees close.

Date: `2026-05-25 17:26 CST`
Tranche: `mag-hermes-hosted-history-specs-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 `med-autogrant` 的 2026-04-11 / 2026-04-12 Hermes、hosted-caller、route snapshot、OPL alignment 与 lightweight handoff history specs。目标是把这些高 stale-risk 的直接文件入口统一收紧：每份历史 spec 首屏都持有文件级 `Owner`、`Purpose`、`State`、`Machine boundary`，明确旧 `Current Truth`、Hermes、OPL Gateway、host-agent、hosted/runtime owner 和 pending route wording 只保留为 provenance；当前 runtime owner、OPL/Temporal provider、executor boundary、route catalog、App/workbench readiness、grant readiness 与机器行为回到核心五件套、active plan、active specs index、specs lifecycle map、contracts、schemas、source、CLI/API 行为和 `contracts/runtime-program/current-program.json`。

Fresh live truth inputs:

- MAG `AGENTS.md`、`TASTE.md`
- MAG `docs/status.md`、`docs/active/mag-ideal-state-cross-repo-gap-plan.md`、`docs/history/specs/README.md`、`docs/specs/specs_lifecycle_map.md`
- MAG `contracts/runtime-program/current-program.json`
- MAG `contracts/functional_privatization_audit.json`
- MAG `contracts/external_evidence/mag-evidence-receipt-ledger.json`

Fresh contract result:

- `runtime_owner.default_task_runtime_owner=one-person-lab`、`default_runtime_substrate=temporal`、`default_stage_executor=codex_cli` remain current.
- `mag_implements_daemon=false`、`mag_implements_scheduler=false`、`mag_implements_attempt_loop=false`、`mag_owns_attempt_ledger=false` remain current.
- `claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`、`claims_production_long_run_soak_complete=false` remain current.
- `standard_agent_source_shape_status=landed` remains structural classification only, not strict source-purity physical completion.
- External evidence ledger keeps `claims_temporal_provider_long_soak_complete=false` and `claims_grant_or_fundability_ready=false`; remaining real evidence gap is `temporal_provider_long_soak_window_evidence`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | `docs/history/specs/2026-04-11-hermes-backed-runtime-capability-migration-map-current-truth.md`, `docs/history/specs/2026-04-11-hermes-backed-runtime-substrate-program-current-truth.md`, `docs/history/specs/2026-04-11-post-r5a-local-runtime-upper-bound-honest-stop-current-truth.md`, `docs/history/specs/2026-04-11-upstream-hermes-agent-truth-reset-current-truth.md`, `docs/history/specs/2026-04-12-author-side-executor-routing-contract-current-truth.md`, `docs/history/specs/2026-04-12-critique-pending-handoff-contract-current-truth.md`, `docs/history/specs/2026-04-12-hosted-caller-consumption-proof-current-truth.md`, `docs/history/specs/2026-04-12-hosted-contract-bundle-entry-and-route-catalog-current-truth.md`, `docs/history/specs/2026-04-12-lightweight-product-entry-and-opl-handoff-current-truth.md`, `docs/history/specs/2026-04-12-opl-aligned-ideal-target-and-phase-map-current-truth.md`, `docs/history/specs/2026-04-12-pending-authoring-route-handoff-matrix-current-truth.md`, `docs/history/specs/2026-04-12-upstream-hermes-agent-fast-cutover-board.md`, `docs/history/specs/2026-04-12-upstream-hermes-agent-fast-cutover-current-truth.md`, `docs/history/specs/README.md`, `docs/specs/specs_lifecycle_map.md`; sections reviewed include title/lifecycle note, activation status, goal, superseded note, old prompt artifact, route/handoff status, Hermes/Gateway/local-runtime/hosted wording and current owner pointers. | same fifteen files |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files remain useful provider-proof, hosted-caller, route-snapshot, OPL-alignment and product-entry handoff provenance; this tranche clarified lifecycle and direct-reader guards instead of deleting historical context.

Unreviewed docs:

- `med-autogrant`: history specs outside the covered 2026-04-06, 2026-04-07, 2026-04-11 and 2026-04-12 batches still need paragraph-governance, especially 2026-04-08 verification/rollback and 2026-04-09 / 2026-04-10 post-R5A fail-closed hardening records.
- `med-autogrant`: `docs/history/plans/**`, `docs/history/product/**`, `docs/history/runtime/**`, `docs/history/positioning/**` and non-index `docs/references/**/*.md` still need separate body-level coverage unless covered by earlier ledger entries.
- Other repos remain under previous ledger scopes except OMA full coverage and MAG current/support specs / thin indexes / 2026-04-06 foundation / 2026-04-07 authoring-flow / 2026-04-11-12 Hermes-hosted batches.
- App docs remain excluded while active release/GUI worktrees own local changes.

Remaining stale / retire candidates:

- MAG 2026-04-08 verification/rollback and 2026-04-09 / 2026-04-10 post-R5A hardening specs still contain dense dated `Current Truth` / activation-package wording; they should be covered in date/topic batches without promoting old local runtime, Gateway, hosted or compatibility bridge text.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` body coverage with 2026-04-08 P3/P4 verification/rollback records or 2026-04-09 / 2026-04-10 post-R5A fail-closed hardening records.
- Or switch to OPL/MAS/RCA/App full README/docs coverage; keep App delayed until active release/GUI worktrees close.

Date: `2026-05-25 17:33 CST`
Tranche: `mag-20260408-p3p4-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 `med-autogrant` 的 2026-04-08 P3/P4 revision、rollback、verification gate 与 checkpoint history specs。目标是补齐这批直接文件入口的文件级 `Owner`、`Purpose`、`State`、`Machine boundary`，明确这些文件只保留 2026-04-08 revision/re-review、forced rollback、presubmission hard gate、verification gate surface 和 checkpoint surface 的形成过程；当前 revision / re-review / quality gate、authoring completion、rollback、submission-ready export gate、verification commands、route checkpoint、OPL/Temporal runtime owner 与机器行为回到核心五件套、active specs index、specs lifecycle map、contracts、schemas、source、CLI/API 行为和 `contracts/runtime-program/current-program.json`。

Fresh live truth inputs:

- MAG `AGENTS.md`、`TASTE.md`
- MAG `docs/status.md`、`docs/active/mag-ideal-state-cross-repo-gap-plan.md`、`docs/history/specs/README.md`、`docs/specs/specs_lifecycle_map.md`
- MAG `contracts/runtime-program/current-program.json`
- MAG `contracts/functional_privatization_audit.json`
- MAG `contracts/external_evidence/mag-evidence-receipt-ledger.json`

Fresh contract result:

- `runtime_owner.default_task_runtime_owner=one-person-lab`、`default_runtime_substrate=temporal`、`default_stage_executor=codex_cli` remain current.
- `mag_implements_daemon=false`、`mag_implements_scheduler=false`、`mag_implements_attempt_loop=false`、`mag_owns_attempt_ledger=false` remain current.
- `claims_opl_replacement_exists=true`、`claims_domain_repo_physical_delete_authorized=false`、`claims_production_long_run_soak_complete=false` remain current.
- `standard_agent_source_shape_status=landed` remains structural classification only, not strict source-purity physical completion.
- External evidence ledger keeps `claims_temporal_provider_long_soak_complete=false` and `claims_grant_or_fundability_ready=false`; remaining real evidence gap is `temporal_provider_long_soak_window_evidence`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | `docs/history/specs/2026-04-08-p3b-revision-transition-and-re-review-hardening-current-truth.md`, `docs/history/specs/2026-04-08-p3c-forced-rollback-and-presubmission-gate-current-truth.md`, `docs/history/specs/2026-04-08-p4a-verification-gate-surface-current-truth.md`, `docs/history/specs/2026-04-08-p4b-verification-os-and-checkpoint-surface-current-truth.md`; sections reviewed include title/lifecycle note, activation/current pointer, goal, hard boundary docs, revision/re-review contract, rollback/presubmission hard gate, verification gate surface, checkpoint object boundary and old absolute specs references. | same four files |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files remain useful revision/re-review, rollback, verification gate and checkpoint provenance; this tranche clarified first-screen lifecycle and direct-reader guards.

Unreviewed docs:

- `med-autogrant`: history specs outside the covered 2026-04-06, 2026-04-07, 2026-04-08 P3/P4, 2026-04-11 and 2026-04-12 batches still need paragraph-governance, especially 2026-04-08 P5 / R-series and 2026-04-09 / 2026-04-10 post-R5A fail-closed hardening records.
- `med-autogrant`: `docs/history/plans/**`, `docs/history/product/**`, `docs/history/runtime/**`, `docs/history/positioning/**` and non-index `docs/references/**/*.md` still need separate body-level coverage unless covered by earlier ledger entries.
- Other repos remain under previous ledger scopes except OMA full coverage and MAG current/support specs / thin indexes / covered history batches.
- App docs remain excluded while active release/GUI worktrees own local changes.

Remaining stale / retire candidates:

- MAG 2026-04-08 P5 / R-series and 2026-04-09 / 2026-04-10 post-R5A hardening specs still contain dense dated activation-package wording; cover them in smaller date/topic batches without promoting old local runtime, Gateway, federation, hosted or compatibility bridge text.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` body coverage with 2026-04-08 P5 / R-series future/runtime-productization records or 2026-04-09 / 2026-04-10 post-R5A fail-closed hardening records.
- Or switch to OPL/MAS/RCA/App full README/docs coverage; keep App delayed until active release/GUI worktrees close.

Date: `2026-05-25 17:49-19:16 CST`
Tranche: `family-doc-coverage-ledger-compaction`
State: `coverage_ledger_compacted_current_scope_preserved`

本段压缩 MAG/RCA/MAS 后续文档治理流水账，只保留当前 closeout 结论、仍开放范围和机器边界。被压缩的原始 tranche 细节均只作为当时覆盖记录读取，不作为当前 runtime、production、physical-delete 或 domain-ready 授权。

Compacted covered scopes:

| Repo | Covered scope | Current ledger conclusion | Still open |
| --- | --- | --- | --- |
| `med-autogrant` | Post-R5A history specs、history plans/product/runtime/positioning、non-index references、final whole-doc reconciliation over `README*`, `agent/README.md`, `contracts/README.md`, `runtime/README.md`, and all `docs/**/*.md`. | MAG README/docs scoped coverage is closed for the then-current inventory; old Hermes/Gateway/local-runtime/default-owner wording remains only in history/provenance/tombstone or explicit no-resurrection guard contexts. | Runtime/evidence/physical-cleanup tails remain: `claims_domain_repo_physical_delete_authorized=false`, `claims_production_long_run_soak_complete=false`, submission-ready human gate, sustained real consumption and long-soak evidence. |
| `redcube-ai` | Repo-root `README*`, `agent/README.md`, `contracts/README.md`, `runtime/README.md`, `config/local/README.md`, prompt README support files and all `docs/**/*.md`. | RCA README/docs scoped coverage is closed for the then-current inventory; current docs do not promote old Hermes/Gateway/runtime/session/domain_action_adapter wording to current owner truth. | Runtime/evidence/source-purity tails remain around production evidence scaleout, generated/default-caller thinning, naming/contract hygiene and compatibility-free retirement. Source/build verification remains the owner of future source/contract/test changes. |
| `med-autoscience` | 79 non-history delivery/policy/reference/runtime-support documents plus repo-root `README*` and `docs/history/**` lifecycle/provenance headers. | MAS lifecycle signal coverage is landed for the covered support/history surfaces; headers bind historical material to provenance/tombstone/support roles and do not promote those files to machine truth. | MAS full README/docs paragraph-level semantic coverage remains open, especially product/status/workbench, owner-route handoff, progress/domain-ref projection, controller shell, non-history body wording and generated/default-caller replacement boundaries. |

Cross-repo result:

- OMA, MAG and RCA README/docs coverage are closed for their recorded scopes, subject to future repo changes creating new docs.
- OPL full README/docs coverage remains open.
- MAS paragraph-level semantic coverage remains open.
- App docs remain delayed until active release/GUI worktrees close, App `main` is updated to the current release commits, or an explicit owner decision makes current App docs safe to govern.
- None of these coverage entries authorizes domain ready, App release ready, production ready, physical delete, long-soak complete, artifact/export readiness, or owner-chain closeout.

Date: `2026-05-25 19:40 CST`
Tranche: `opl-entry-core-current-truth-coverage`
State: `tranche_verified`

本轮只覆盖 OPL entry/core/current-truth 支撑面，不关闭全局文档治理目标，也不表示 OPL 全部 `README*` 与 `docs/**/*.md` 已逐段覆盖。目标是把 OPL current truth 从本轮初始 stale / drift 状态刷新到最新 live read-model：family structural conformance 当前是 `4 passed / 0 blocked`，但 evidence worklist zero-open、blocked refs-only envelope、domain physical delete authority 和 App release/product ready 仍不授权 domain ready 或 production ready。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、root `README*`、`docs/README.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、contracts README / package scripts / OPL Doc Governance doctor。
- `opl agents conformance --family-defaults --json`
- `opl runtime app-operator-drilldown --json`
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`
- `opl framework readiness --family-defaults --json`

Fresh read-model result:

- `opl agents conformance` 读为 `passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`、`production_evidence_tail_count=4`；这只证明 structural conformance，不授权 physical delete、domain ready 或 production ready。
- `family-runtime evidence-worklist` 读为 `open_worklist_item_count=0`、`open_safe_action_payload_required_item_count=0`、`open_safe_action_payload_free_item_count=0`、`zero_open_worklist_blocked_refs_only_envelope_count=196`、`domain_ready_authorized=false`、`production_ready_authorized=false`。
- `runtime app-operator-drilldown` 读为 `availability=available`、`functional_privatization_action_required_count=0`、`default_caller_deletion_evidence_open_requirement_count=0`、`domain_legacy_cleanup_plan_count=3`、`domain_legacy_cleanup_ready_plan_count=2`、`domain_legacy_cleanup_blocked_plan_count=1`、`lifecycle_domain_physical_delete_can_execute=false`、`app_release_user_path_release_ready_claimed=false`、`app_release_user_path_production_ready_claimed=false`。
- `framework readiness` 读为 `control_plane_available=true`、`framework_kernel_hard_blocker_count=0`、`agent_conformance_hard_blocker_count=0`、`operator_actionable_attention_tail_count=0`、`domain_blocked_attention_tail_count=209`、`evidence_envelope_blocked_count=196`。Provider cadence/capability SLO satisfied；blocked refs-only attention 不授权 App release ready、domain ready、production ready 或 physical delete。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `README*` entry shape, `docs/README.md`, `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/active/current-development-lines.md`, `docs/active/standard-agent-private-platform-inventory.md`, `docs/active/development-document-portfolio.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, contract/package/script/read-model surfaces listed above. | `docs/status.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/active/current-development-lines.md`, `docs/active/standard-agent-private-platform-inventory.md`, `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The stale item was current-truth wording and not a doc path with proven retired role.

Unreviewed docs:

- OPL full README/docs portfolio is still open: this tranche did not paragraph-govern all OPL `README*` and `docs/**/*.md`, especially history/reference/support bodies not listed above.
- MAS paragraph-level semantic coverage remains open as recorded above.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or an explicit owner decision makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- MAG/RCA physical delete authority remains a strict tail even though structural conformance currently passes; do not write `passed_count=4` as physical delete, App release, domain ready or production ready.
- OPL remaining docs/history/reference body coverage still needs chunked paragraph governance; history records must not be promoted into current truth.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from already observed App user-path evidence.

Next tranche write scope:

- Continue OPL full docs coverage in a bounded history/reference/support chunk, or pick a domain physical-delete/evidence-tail tranche with repo-native verification before refreshing OPL read-model docs.
- Keep App delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 20:21 CST`
Tranche: `opl-gateway-federation-history-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/compatibility/gateway-federation/**` 的 gateway / federation / routed-action 历史块。目标是把这些旧 gateway-first 文件逐段绑定到 history/provenance/tombstone 语境，避免 `OPL Gateway`、`domain_gateway`、`domain harness`、routed-action、surface matrix 或 old acceptance spec wording 被读成当前 runtime、compatibility interface、machine-readable contract、test oracle、domain-ready 或 production-ready 授权。

Fresh live truth inputs:

- `opl agents conformance --family-defaults --json`
- `opl framework readiness --family-defaults --json`
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`
- `docs/history/compatibility/gateway-federation/**/*.md` full text and current lifecycle headers

Fresh read-model result:

- `opl agents conformance` 读为 `passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`、`production_evidence_tail_count=4`；这只证明 standard-agent structural conformance，不授权 physical delete、domain ready 或 production ready。
- `framework readiness` 读为 `hard_blocker_count=0`、`operator_actionable_attention_tail_count=0`、`domain_blocked_attention_tail_count=209`、`evidence_envelope_blocked_count=196`。
- `family-runtime evidence-worklist` 读为 `open_worklist_item_count=0`、`zero_open_worklist_blocked_refs_only_envelope_count=196`、`domain_ready_authorized=false`、`production_ready_authorized=false`。Zero-open worklist 不等于 domain ready、production ready、App release ready、provider maintenance complete 或旧 gateway path 复活。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/compatibility/gateway-federation/README.md`; `gateway-federation.md`; `opl-federation-contract.md`; `opl-gateway-acceptance-test-spec.md`; `opl-gateway-rollout.md`; `opl-minimal-admitted-domain-federation-activation-package.md`; `opl-read-only-discovery-gateway.md`; `opl-routed-action-gateway.md`; `examples-corpora/README.md`; `examples-corpora/opl-gateway-example-corpus.md`; `examples-corpora/opl-operating-example-corpus.md`; `examples-corpora/opl-operating-record-catalog.md`; `examples-corpora/opl-routed-safety-example-corpus.md`; `operating-governance/README.md`; `operating-governance/opl-governance-audit-operating-surface.md`; `operating-governance/opl-publish-promotion-operating-surface.md`; `operating-governance/opl-surface-authority-matrix.md`; `operating-governance/opl-surface-lifecycle-map.md`; `operating-governance/opl-surface-review-matrix.md` | `docs/history/compatibility/gateway-federation/README.md`; `gateway-federation.md`; `opl-federation-contract.md`; `opl-gateway-acceptance-test-spec.md`; `opl-gateway-rollout.md`; `opl-minimal-admitted-domain-federation-activation-package.md`; `opl-read-only-discovery-gateway.md`; `opl-routed-action-gateway.md`; `examples-corpora/opl-gateway-example-corpus.md`; `examples-corpora/opl-operating-example-corpus.md`; `examples-corpora/opl-operating-record-catalog.md`; `examples-corpora/opl-routed-safety-example-corpus.md`; `operating-governance/opl-governance-audit-operating-surface.md`; `operating-governance/opl-publish-promotion-operating-surface.md`; `operating-governance/opl-surface-authority-matrix.md`; `operating-governance/opl-surface-lifecycle-map.md`; `operating-governance/opl-surface-review-matrix.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. The whole covered subtree now carries history-only / provenance / tombstone boundaries, and the two directory README files already held compatible history-only directory-level boundaries.

Unreviewed docs:

- OPL full README/docs coverage remains open outside this bounded subtree, especially other `docs/history/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open, especially product/status/workbench, owner-route handoff, progress/domain-ref projection, controller shell, non-history body wording and generated/default-caller replacement boundaries.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; no other old gateway/frontdoor/federation language should be promoted to current truth without live source/contract/read-model proof.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from already observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, or switch to MAS non-history paragraph reconciliation.
- Keep App delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 20:41 CST`
Tranche: `mas-portal-workbench-boundary-coverage`
State: `tranche_verified`

本轮覆盖 MAS 非 history 文档中的 Progress Portal / study-progress projection / OPL App workbench 边界块。目标是把 MAS local Progress Portal 从“固定用户入口 / MAS-owned workbench”风险口径收束为 workspace-local read-model / diagnostic / no-App 展示入口，同时确认主用户运行工作台、notification、approval transport、terminal UI shell、provider drilldown 和长期 App-native workbench 归 OPL App / OPL Runtime Manager。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、`docs/active/mas-ideal-state-gap-plan.md`、`docs/references/positioning/mas_ideal_state.md`、`docs/status.md`。
- MAS `contracts/functional_privatization_audit.json`、`contracts/generated_surface_handoff.json`、`contracts/production_acceptance/mas-production-acceptance.json`、`contracts/test-lane-manifest.json`。
- MAS source/test references for `progress_portal_parts/workspace_carrier.py`, `mas_progress_portal_workspace_carrier_boundary`, `OPL current_control_state` and focused Portal/workbench lanes.
- MAS support docs: `docs/runtime/display/progress_portal.md`, `docs/runtime/projections/study_progress_projection.md`, `docs/references/integration/progress_portal_opl_app_integration.md`, `docs/active/opl_app_mas_runtime_workbench_program.md`.

Fresh semantic result:

- MAS Progress Portal payload / HTML / workspace helper / optional local read-only service are landed read-model/display surfaces, but remain part of `workbench_sidecar_status_cutover` and strict source-purity tail until OPL App default progress carrier, workspace helper no-active-caller proof and focused tests allow further thinning or deletion.
- OPL App / OPL Runtime Manager owns the long-term user workbench, notification/approval transport, terminal UI shell, provider drilldown and App-native study workbench.
- Portal, study-progress, workspace cockpit, product-entry-status, MCP compact/markdown and OPL App workbench should consume the same `study_progress.user_visible_projection`; none of them may rewrite study truth, publication verdict, artifact authority, runtime authority or `current_package`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | `docs/runtime/display/progress_portal.md` header, entry conclusion, form decision, OPL App integration conclusion; `docs/runtime/projections/study_progress_projection.md` core conclusion and MAS Progress Portal relation; `docs/references/integration/progress_portal_opl_app_integration.md` App boundary; `docs/active/opl_app_mas_runtime_workbench_program.md` P1 owner boundary; `docs/status.md` product/status/workbench source-purity clauses; MAS active plan / ideal-state references and contracts listed above. | `docs/runtime/display/progress_portal.md`; `docs/runtime/projections/study_progress_projection.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. This tranche clarified active support docs; it did not prove no-active-caller for the MAS workspace carrier or Portal helper, so no physical delete was authorized.

Unreviewed docs:

- MAS full paragraph-level semantic coverage remains open outside this bounded Portal/projection/App-workbench block, including remaining product/status/workbench, owner-route handoff, progress/domain-ref projection, controller shell and non-history body wording not listed above.
- OPL full README/docs coverage remains open outside previously covered entry/core and gateway-federation history blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- MAS product-entry / status / workbench projection shell, sidecar export/dispatch, controller-authorized shell and progress/domain-ref consumers still need default-caller cutover, no-active-caller proof, focused tests and tombstone/provenance proof before deletion.
- MAS local Progress Portal workspace carrier remains a read-model/display tail, not a long-term MAS generic workbench.
- MAS real paper-line owner receipt, memory/artifact/lifecycle receipt, human gate/resume and provider SLO long-soak evidence gaps remain open.

Next tranche write scope:

- Continue MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell, or switch back to another bounded OPL history/reference/support chunk.
- Keep App docs delayed until the active release/GUI lane is safe to govern.

Date: `2026-05-25 21:08 CST`
Tranche: `opl-frontdoor-legacy-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/history/frontdoor-legacy/**` 的旧 frontdoor / Initialize OPL / Codex Host / OMX 对齐历史块。目标是把这些旧 `frontdoor`、`Product API`、`OPL Front Desk`、GUI overlay、`Hermes-Agent` 备用执行、OMX 和四仓对齐 taskboard wording 明确绑定到 history/provenance/tombstone 语境，避免读者从搜索结果或正文标题直接把“当前主线”“当前缺口”“下一棒”“建议新增”读成今天的 active topology、App/workbench plan、runtime provider contract、domain ready 或 production ready。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、`docs/history/README.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`、`docs/specs/opl-domain-onboarding-contract.md`、`docs/status.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, finding_count=0.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this remains structural conformance, not production readiness.
- `framework readiness` read `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `domain_blocked_attention_tail_count=211`, `evidence_envelope_blocked_count=198`, `provider_slo_cadence_window_status=window_cadence_satisfied`, `provider_slo_capability_status=capability_slo_satisfied`; refs-only blocked attention remains and does not authorize readiness claims.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=198`, `domain_ready_authorized=false`, `production_ready_authorized=false`, and not-authorized claims still include domain truth write, domain ready, quality verdict, artifact authority, production ready, domain repo physical delete authorization and default caller delete ready.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/frontdoor-legacy/README.md` directory role; `2026-04-19-opl-initialize-and-environment-manager-design.md` header, historical read mode, baseline / missing surfaces / API suggestions / implementation order wording; `opl-frontdoor-delivery-board.md` header, historical read mode, current-mainline / landed / gap / in-progress / issue / baton sections; `development-operating-model.md` header, Codex Host / OMX tombstone and historical conclusion; `runtime-alignment-taskboard.md` header, historical read mode, program/stage/current conclusion/next baton wording. Support evidence came from the live truth inputs listed above. | `docs/history/frontdoor-legacy/README.md`; `docs/history/frontdoor-legacy/2026-04-19-opl-initialize-and-environment-manager-design.md`; `docs/history/frontdoor-legacy/opl-frontdoor-delivery-board.md`; `docs/history/frontdoor-legacy/development-operating-model.md`; `docs/history/frontdoor-legacy/runtime-alignment-taskboard.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. All five files remain useful frontdoor-era provenance; this tranche added file-level lifecycle/machine-boundary signals and direct-reader guards instead of removing historical context.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history and frontdoor-legacy history blocks, especially other `docs/history/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside the prior Portal/projection/App-workbench tranche.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old frontdoor, Product API, OMX, Gateway/federation, hosted shell, Hermes-first, local-manager and desktop bootstrap wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, preferably `docs/history/process/**` or a compact `docs/references/current-support/**` subset with live CLI/source checks.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 21:18 CST`
Tranche: `opl-process-specs-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/history/process/specs/**` 的早期 design-spec 历史块。目标是把旧 bilingual public-doc rollout、MAG 顶层设计迁移、Unified Harness Engineering Substrate、frontdoor / family entry、Product API 和 ACP-native shell projection specs 绑定到 history/provenance/tombstone 语境，避免 `current`、`当前`、`目标`、`建议`、`acceptance criteria`、`Product API`、`ACP`、`frontdoor`、`Gateway`、`Domain Harness OS`、`Hermes`、`AionUI` 或 GUI shell wording 被读成当前 active specs、runtime provider contract、App release plan、domain truth、readiness oracle 或 implementation queue。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、`docs/history/process/README.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`、`docs/specs/opl-domain-onboarding-contract.md`、`docs/project.md`、`docs/architecture.md`、`docs/decisions.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, finding_count=0.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance, not production readiness.
- `framework readiness` summary read `control_plane_available=true`, `framework_kernel_hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `domain_blocked_attention_tail_count=211`, `evidence_envelope_blocked_count=198`, `provider_slo_cadence_window_status=window_cadence_satisfied`, `provider_slo_capability_status=capability_slo_satisfied`; refs-only blocked attention remains and does not authorize readiness claims.
- `family-runtime evidence-worklist` summary read `open_worklist_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=198`, `domain_ready_authorized=false`, `production_ready_authorized=false`, and not-authorized claims still include domain truth write, domain ready, quality verdict, artifact authority, production ready, domain repo physical delete authorization and default caller delete ready.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/process/specs/README.md` new index; `2026-04-02-bilingual-homepage-and-core-docs-design.md` header / historical reading / acceptance criteria risk; `2026-04-06-med-auto-grant-top-level-design.md` MAG migration authority note; `2026-04-07-unified-harness-engineering-substrate-design.md` UHS / Gateway / Domain Harness OS historical read mode; `2026-04-12-opl-frontdoor-and-family-entry-design.md` frontdoor / Hermes / family-entry historical read mode; `2026-04-20-opl-product-api-and-domain-agent-boundary-design.md` Product API / domain-agent boundary history read mode; `2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md` ACP / shell projection history read mode. Support evidence came from the live truth inputs listed above. | `docs/history/process/specs/README.md`; all six `docs/history/process/specs/*.md` files; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These specs already live under process history; this tranche added an index, file-level lifecycle / machine-boundary signals, and direct-reader guards instead of removing historical context.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history and process/specs history blocks, especially other `docs/history/process/**`, `docs/history/runtime-substrate/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Product API, ACP, Gateway, Domain Harness OS, frontdoor, Hermes-first, AionUI shell, local-manager, hosted shell and desktop bootstrap wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, preferably `docs/history/process/plans/**` or `docs/history/process/convergence-governance/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 22:04 CST`
Tranche: `opl-process-plans-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/history/process/plans/**` 的 early implementation plans、planning freeze、closeout note 与 2026-05 process history 块。目标是让这些历史计划即使从搜索结果或文件首屏直接打开，也不会把 `Goal`、`Architecture`、agent worker instruction、checkbox、`current`、`next`、G2/G3、Gateway、frontdoor、Product API、ACP、Hermes、AionUI、UHS、Domain Harness OS 或 production functional closure wording 误读成当前 active implementation queue、runtime provider contract、App release plan、domain truth、readiness oracle 或 production-ready claim。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、`docs/history/process/README.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, finding_count=0.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance, not production readiness.
- `framework readiness` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `domain_blocked_attention_tail_count=212`, `evidence_envelope_blocked_count=199`, `provider_slo_cadence_window_status=window_cadence_satisfied`, `provider_slo_capability_status=capability_slo_satisfied`; refs-only blocked attention remains and does not authorize readiness claims.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=199`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`, `domain_ready_authorized=false`, `production_ready_authorized=false`, and not-authorized claims still include domain truth write, domain ready, quality verdict, artifact authority, production ready, domain repo physical delete authorization and default caller delete ready.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/process/README.md` plans entry; new `docs/history/process/plans/README.md` index; all historical plan files under `docs/history/process/plans/*.md`: bilingual homepage/core docs plan; G2 release closeout; G3 thin handoff brief and closeout; UHS doc alignment; frontdoor/family entry plan; hosted entry/control room plan; family executor adapter follow-up; family reuse landing; Product API reset; ACP-native runtime-first; production functional closure plan; App repo split closeout; OPL family doc process history; active ledger consolidation. Support evidence came from the live truth inputs listed above. | `docs/history/process/README.md`; `docs/history/process/plans/README.md`; all 15 existing `docs/history/process/plans/*.md` historical files; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These files already live under process history and remain useful dated provenance; this tranche added a directory index, file-level lifecycle / machine-boundary signals, and direct-reader guards instead of removing historical context.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history and process/plans history blocks, especially `docs/history/process/convergence-governance/**`, `docs/history/process/domain-admission/**`, `docs/history/process/shared-boundary/**`, `docs/history/process/superpowers/**`, `docs/history/runtime-substrate/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, Product API, ACP, UHS, Domain Harness OS, Hermes-first, AionUI shell, hosted pilot, local-manager, G2/G3 and checkbox task wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, preferably `docs/history/process/convergence-governance/**`, `docs/history/process/domain-admission/**` or `docs/references/current-support/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 22:06 CST`
Tranche: `opl-convergence-governance-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/history/process/convergence-governance/**` 的 early convergence program、executor/Hermes 评估、四仓 docs sync、用户面成熟度、外部 orchestration learning、AionUI GUI pivot、docs lifecycle rollout、content-level consolidation 和 product-layer rollout closeout 历史块。目标是让这些历史治理文档即使从搜索结果或文件首屏直接打开，也不会把 `当前`、`Current`、`Planned`、`Done`、`Verification`、`Gateway`、`frontdoor`、`federation`、`Hermes`、`Product API`、`AionUI`、`MDS`、`Domain Harness OS` 或 `Unified Harness Engineering Substrate` wording 误读成当前 active roadmap、runtime provider contract、App release plan、domain truth、readiness oracle、production ready claim 或 executor default path。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, finding_count=0.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance, not production readiness.
- `framework readiness` read `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `domain_blocked_attention_tail_count=212`, `evidence_envelope_blocked_count=199`, `provider_slo_cadence_window_status=window_cadence_satisfied`, `provider_slo_capability_status=capability_slo_satisfied`; refs-only blocked attention remains and does not authorize readiness claims.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=199`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`, `domain_ready_authorized=false`, `production_ready_authorized=false`, and not-authorized claims still include domain truth write, domain ready, quality verdict, artifact authority, production ready, domain repo physical delete authorization and default caller delete ready.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/process/convergence-governance/README.md` directory role and file table; all 11 history files under `docs/history/process/convergence-governance/*.md`: contract convergence decision note and execution board; ecosystem status matrix; family content-level docs consolidation; family docs lifecycle governance rollout; family external orchestration learning board; family user-facing maturity roadmap; four-repo docs sync summary; four-repo executor follow-up and Hermes evaluation; GUI mainline pivot to AionUI; OPL product-layer Foundry Agent rollout closeout. Support evidence came from the live truth inputs listed above. | `docs/history/process/convergence-governance/README.md`; all 11 existing `docs/history/process/convergence-governance/*.md` historical files; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These files already live under process history and remain useful dated provenance; this tranche strengthened the directory index, current-owner jumps, file-level history framing and active-looking headings instead of removing historical context.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history and process/convergence-governance history blocks, especially `docs/history/process/domain-admission/**`, `docs/history/process/shared-boundary/**`, `docs/history/process/superpowers/**`, `docs/history/runtime-substrate/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager and product-layer rollout wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, preferably `docs/history/process/domain-admission/**`, `docs/history/process/shared-boundary/**` or `docs/references/current-support/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 22:34 CST`
Tranche: `opl-domain-admission-history-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/process/domain-admission/**` 的 candidate workstream closeout、Phase 1 exit activation package、Phase 2 admitted-domain delta intake、central reference sync board 和 ecosystem sync owner-line 历史块。目标是让这些历史文档即使从搜索结果或文件首屏直接打开，也不会把 `Phase 1/2`、`G2/G3`、`gateway/federation`、`activation package`、`central sync`、old phase contracts / reference paths 或 `当前` wording 误读成当前 active runtime topology、domain admission rule、recurring worktree prompt、machine-readable contract surface、readiness oracle 或 production/domain ready claim。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/specs/opl-domain-onboarding-contract.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, `finding_count=0`.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance, not production readiness.
- `framework readiness` read `status=framework_control_plane_available_with_operator_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=2`, `operator_payload_required_attention_tail_count=2`, `operator_payload_free_attention_tail_count=0`, `domain_blocked_attention_tail_count=212`, `evidence_envelope_open_count=2`, `evidence_envelope_blocked_count=199`, and provider cadence / capability SLO satisfied. This is refs-only operator attention, not domain ready or production ready.
- `family-runtime evidence-worklist` read `open_worklist_item_count=1`, `open_safe_action_payload_required_item_count=1`, `open_safe_action_payload_free_item_count=0`, `domain_dispatch_evidence_workorder_count=1`, `domain_ready_authorized=false`, `production_ready_authorized=false`, and not-authorized claims include domain truth write, domain ready, quality verdict, artifact authority, production ready, domain repo physical delete authorization and default caller delete ready. The open workorder is a MAS owner payload route for `domain_owner/default-executor-dispatch`; it requires real domain receipt / owner-chain / no-regression refs or a domain-owned typed blocker and cannot be closed by OPL prose.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/process/domain-admission/README.md` directory role, current owner jump table, file table and read rules; all 5 history files under `docs/history/process/domain-admission/*.md`: candidate workstream closeout, Phase 1 exit activation package, Phase 2 admitted-domain delta intake refresh, Phase 2 central reference sync board, ecosystem sync owner-line brief. Support evidence came from the live truth inputs listed above. | `docs/history/process/domain-admission/README.md`; all 5 existing `docs/history/process/domain-admission/*.md` historical files; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These files already live under process history and remain useful dated provenance; this tranche strengthened directory indexing, current-owner jumps, file-level lifecycle headers and active-looking headings instead of removing historical context.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history and process/domain-admission history blocks, especially `docs/history/process/shared-boundary/**`, `docs/history/process/superpowers/**`, `docs/history/runtime-substrate/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, old Phase package and old reference-sync wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, preferably `docs/history/process/shared-boundary/**`, `docs/history/process/superpowers/**` or `docs/references/current-support/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 23:03 CST`
Tranche: `opl-shared-boundary-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/history/process/shared-boundary/**` 的 Shared Foundation 与 Shared Foundation Ownership 历史块。目标是让这些历史文档即使从搜索结果或文件首屏直接打开，也不会把 `Shared Foundation`、Auto/HITL 分层、shared asset / memory index、`current` / `当前`、public-surface readiness 或 owner split wording 误读成当前 active support、runtime contract、domain admission rule、shared-index roadmap、public-entry surface、domain truth owner、mutation owner、quality verdict、artifact authority、owner receipt 或 production/domain ready claim。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/specs/shared-runtime-contract.md`、`docs/specs/shared-domain-contract.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, `finding_count=0`.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; conformance report still cannot claim domain ready.
- `framework readiness` read `status=framework_control_plane_available_with_open_production_tail`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=1`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=216`, `evidence_envelope_open_count=0`, `evidence_envelope_blocked_count=203`, `provider_slo_cadence_window_status=window_repair_receipt_observed`, `provider_slo_capability_status=capability_slo_blocked`; this is refs-only / provider-tail attention, not domain ready or production ready.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=203`, `domain_dispatch_evidence_workorder_count=0`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/process/shared-boundary/README.md` directory role, current owner jump table, archive file table and read rules; `shared-foundation.md` lifecycle header, historical Auto/HITL framing, framework consumption wording and active-domain-surface wording; `shared-foundation-ownership.md` lifecycle header, historical shared-index roadmap, public-surface readiness conditions and stage interpretation. Support evidence came from the live truth inputs listed above. | `docs/history/process/shared-boundary/README.md`; `docs/history/process/shared-boundary/shared-foundation.md`; `docs/history/process/shared-boundary/shared-foundation-ownership.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These files already live under process history and remain useful dated provenance; this tranche strengthened directory indexing, current-owner jumps, file-level lifecycle headers and active-looking headings instead of removing historical context.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history and process/shared-boundary history blocks, especially `docs/history/process/superpowers/**`, `docs/history/runtime-substrate/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, shared foundation and shared-index wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, preferably `docs/history/process/superpowers/**`, `docs/history/runtime-substrate/**` or `docs/references/current-support/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-25 23:31 CST`
Tranche: `opl-superpowers-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/history/process/superpowers/**` 的早期 Superpowers worker-generated plans/specs 历史块。目标是让这些文件即使从搜索结果或首屏直接打开，也不会把 `Goal`、`Task`、checkbox、`Validation`、`frontdoor-readiness`、旧 `opl web`、`Workspace Inbox`、`Multica`、shared-module absorb、`domain_agent_entry_spec` 或 MAS action graph coverage wording 误读成当前 active backlog、active spec、runtime/provider contract、domain admission rule、App/product surface、readiness oracle、production/domain ready claim 或 current `/goal` baton。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/specs/opl-domain-onboarding-contract.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`、`docs/specs/shared-runtime-contract.md`、`docs/product/README.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, `finding_count=0`.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`, `production_evidence_tail_policy=reported_separately_not_a_structural_pass_condition`; this is structural conformance, not production readiness.
- `framework readiness` read `framework_kernel_hard_blocker_count=0`, `open_tail_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=220`, `evidence_envelope_open_count=0`, `evidence_envelope_blocked_count=207`, `provider_slo_cadence_window_status=window_cadence_satisfied`, `provider_slo_capability_status=capability_slo_satisfied`, `can_claim_domain_ready=false`, `can_claim_production_ready=false`; this is refs-only blocked attention, not domain ready or production ready.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=205`, `domain_dispatch_evidence_workorder_count=0`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/process/superpowers/README.md` new directory role, current owner table and boundary guard; `docs/history/process/superpowers/plans/README.md` new historical plans index; all 5 plan files under `docs/history/process/superpowers/plans/*.md`; `docs/history/process/superpowers/specs/README.md` new historical specs index; all 4 spec files under `docs/history/process/superpowers/specs/*.md`. Support evidence came from the live truth inputs listed above. | `docs/history/process/superpowers/README.md`; `docs/history/process/superpowers/plans/README.md`; `docs/history/process/superpowers/specs/README.md`; all 9 existing `docs/history/process/superpowers/{plans,specs}/*.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These files already live under process history and remain useful dated provenance; this tranche added missing directory indexes, file-level lifecycle headers, current-owner jumps, and historical heading/checkbox wording so the plans/specs are no longer active-looking process packets.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history and process/superpowers history blocks, especially `docs/history/runtime-substrate/**`, `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, old `opl web`, Superpowers generated task packets, shared foundation and shared-index wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded history/reference/support chunk, preferably `docs/history/runtime-substrate/**`, `docs/references/current-support/**` or `docs/runtime/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 00:01 CST`
Tranche: `opl-runtime-substrate-history-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/history/runtime-substrate/**` 的 runtime / product-entry / migration 整文档历史块。目标是让这些文件即使从搜索结果或首屏直接打开，也不会把 `当前`、`目标结构`、`推进顺序`、`完成判据`、`Gateway`、`frontdoor`、`direct-entry`、`Hermes Kernel`、`Host-Agent Runtime`、`Managed Runtime`、`Product Entry`、`Domain Harness OS`、`MDS` / `MedDeepScientist` wording 误读成当前 active roadmap、provider contract、runtime readiness path、App release plan、domain admission rule、domain truth、artifact authority、production/domain ready claim 或 `/goal` baton。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`、`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`、`docs/specs/opl-domain-onboarding-contract.md`、`docs/specs/shared-runtime-contract.md`、`docs/specs/shared-domain-contract.md`、`docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`、`docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, `finding_count=0`.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; conformance report still cannot claim domain ready or production ready.
- `framework readiness` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=220`, `evidence_envelope_open_count=0`, `evidence_envelope_blocked_count=207`, `provider_slo_cadence_window_status=window_cadence_satisfied`, `provider_slo_capability_status=capability_slo_satisfied`; refs-only blocked attention remains and does not authorize readiness claims.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=207`, `domain_dispatch_evidence_workorder_count=0`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/history/runtime-substrate/README.md` directory role, current-owner jump table, read rules, file table and tombstone rules; all 8 historical files under `docs/history/runtime-substrate/*.md`: family lightweight direct-entry rollout board, family product-entry and domain handoff architecture, Hermes runtime substrate benchmark, host-agent runtime contract, managed-runtime migration readiness checklist, MAS top-level cutover board, OPL product-entry / Hermes kernel integration decision, and vertical online-agent platform roadmap. Support evidence came from the live truth inputs listed above. | `docs/history/runtime-substrate/README.md`; all 8 existing historical files under `docs/history/runtime-substrate/*.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These files already live under runtime-substrate history and remain useful dated provenance; this tranche normalized lifecycle headers, added current-owner jumps and historical read-mode guards, and reworded active-looking headings instead of deleting provenance.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history and runtime-substrate history blocks, especially `docs/references/**`, `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded reference/support chunk, preferably `docs/references/current-support/**`, `docs/runtime/**` or `docs/product/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 00:21 CST`
Tranche: `opl-current-support-reference-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/references/current-support/**` 的安装、GUI/WebUI、发布打包、默认 skills、quality details 和测试 lane 治理支撑参考。目标是确认这些 reference 只作为操作支撑材料存在，不拥有 runtime topology、App release verdict、provider readiness、domain truth、artifact authority、quality verdict、production/domain ready claim 或 machine contract。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/README.md`、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`、`docs/specs/shared-runtime-contract.md`、`contracts/README.md`、`contracts/opl-framework/family-runtime-online-substrate-contract.json`。
- Current support source/contract surfaces: `package.json` test scripts, `scripts/test-lanes.mjs`, `scripts/verify.sh`, `scripts/run-structural-quality-gate.sh`, `src/quality-details/**`, `src/install-companions.ts`, `src/system-installation/first-run-contract.ts`, `src/system-installation/initialize.ts`, `src/cli/cases/public-command-specs.ts`, `src/cli/cases/private-command-specs.ts`, `contracts/opl-framework/fresh-install-test-matrix.json`, `contracts/opl-framework/family-executor-adapter-defaults.json`。
- OPL Doc Governance doctor preflight for this worktree: active truth pass, `finding_count=0`.
- `opl agents conformance --family-defaults --json`.
- `opl framework readiness --family-defaults --json`.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.

Fresh read-model result:

- `opl agents conformance` summary read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; conformance report still cannot claim domain ready or production ready.
- `framework readiness` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=221`, `evidence_envelope_open_count=0`, `evidence_envelope_blocked_count=208`, `provider_slo_cadence_window_status=window_cadence_satisfied`, `provider_slo_capability_status=capability_slo_satisfied`; refs-only blocked attention remains and does not authorize readiness claims.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=208`, `domain_dispatch_evidence_workorder_count=0`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/references/current-support/README.md`; `opl-default-skill-ecosystem.md`; `opl-docker-webui-deployment.md`; `opl-fresh-install-and-gui-first-launch-testing.md`; `opl-gui-shell-adapter-boundary.md`; `opl-quality-details.md`; `opl-release-packages-modular-distribution.md`; `opl-test-lane-governance.md`. Sections reviewed include lifecycle header, owner / purpose / state / machine boundary, GUI/App/WebUI owner split, package/release current-vs-future mechanism, Temporal vs explicit non-default executor wording, CLI/test/source truth refs, validation commands and no-ready-claim boundaries. | `docs/references/current-support/opl-release-packages-modular-distribution.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none physically moved or deleted. These files remain current support references. This tranche only changed one Docker/WebUI package table entry so it names Codex configuration initialization, Temporal-backed provider / explicit executor adapter refs, and browser entry instead of implying Hermes is a default WebUI initialization substrate.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history, runtime-substrate history and current-support reference blocks, especially `docs/runtime/**`, `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**`, `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining runtime/product/source/delivery/public/specs/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded support chunk, preferably `docs/runtime/**`, `docs/product/**` or `docs/specs/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 00:41 CST`
Tranche: `opl-runtime-docs-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/runtime/**` 的当前 runtime 支撑文档。目标是把 runtime 命名、stage graph / route transition、Agent Lab control plane 与目录索引都读回当前 OPL Framework / App / Foundry Agent 分层，避免把旧四仓口径、host-agent deployment shape、plan table、provider completion、App user-path evidence、Agent Lab read model 或 work-order primitive 写成 domain ready、release ready、production ready、artifact authority、quality verdict 或 active `/goal` baton。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`。
- Current runtime docs: `docs/runtime/README.md`, `docs/runtime/opl-runtime-naming-and-boundary-contract.md`, `docs/runtime/stage-graph-route-transition-runtime.md`, `docs/runtime/opl-agent-lab-control-plane.md`.
- Code/source surfaces: CodeGraph context for Developer Mode / Agent Lab / work-order execution, `src/agent-lab-work-order-execution.ts`, `src/agent-lab-developer-mode.ts`, `src/developer-mode.ts`, `src/codex.ts`.
- CLI/read-model surfaces: `opl framework readiness --family-defaults --json`, `opl runtime app-operator-drilldown --json`, `opl family-runtime status --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`, `opl agents conformance --family-defaults --json`, `opl agents interfaces --repo-dir /Users/gaofeng/workspace/med-autoscience --json`.
- CLI help surfaces: `opl work-order execute --help`, `opl agent-lab complete --help`, `opl agent-lab workbench --help`, `opl system developer-supervisor --help`, `opl runtime developer-mode-closeout record --help`.

Fresh read-model result:

- `opl family-runtime status --json` read `provider_ready=true`, `full_online_ready=true`, `durable_online_ready=true`, `default_standard_agent_runtime_path=opl_temporal_hosted_autonomous`, `temporal_hosted_autonomy_default_enabled=true`, `provider_managed_long_running_tasks=true`, `domain_agent_internal_daemon_allowed=false`, `domain_agent_internal_scheduler_allowed=false`, `domain_agent_internal_attempt_loop_allowed=false`, `codex_app_drives_long_running_tasks=false`, selected provider `temporal` ready, managed worker source current, and `local_sqlite` classified as dev/CI/offline diagnostic baseline.
- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=224`, `evidence_envelope_blocked_count=211`, provider cadence/capability SLO satisfied, and authority boundary still `can_claim_domain_ready=false`, `can_claim_production_ready=false`.
- `opl runtime app-operator-drilldown --json` read `availability=available`, provider cadence/capability SLO satisfied, `functional_privatization_action_required_count=0`, `domain_dispatch_evidence_current_default_actionable_attempt_count=0`, `app_release_user_path_production_user_path_ready=true`, `app_release_user_path_release_ready_claimed=false`, `app_release_user_path_production_ready_claimed=false`, `opl_meta_agent_production_consumption_ready=true`, `opl_meta_agent_claims_domain_ready=false`, `codex_app_runtime_role_status=opl_temporal_hosted_autonomous`, `codex_app_drives_long_running_tasks=false`, and no default next safe action.
- `opl family-runtime evidence-worklist ... --detail full --json` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=211`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`, and `default_caller_delete_ready` remains not authorized.
- `opl agents conformance --family-defaults --json` read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance only.
- `opl agents interfaces --repo-dir /Users/gaofeng/workspace/med-autoscience --json` read `status=ready` for generated CLI/MCP/Skill/product-entry descriptors, with `generated_surface_owner=one-person-lab`, `domain_repo_can_own_generated_surface=false`, and authority boundary forbidding generated interface from writing domain truth, memory body, artifact mutation or quality/export verdict.
- `opl work-order execute --help` confirms the canonical OPL Codex CLI worktree primitive exists and emits refs-only closeout receipts; `agent-lab complete/workbench` help confirms Agent Lab subcommands are concrete command surfaces; `system developer-supervisor` and `runtime developer-mode-closeout record` help confirm Developer Mode config and refs-only closeout intake surfaces.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/runtime/README.md` directory role and file state table; `docs/runtime/opl-runtime-naming-and-boundary-contract.md` current status note, purpose, scope, fixed terminology, current family positioning, host-agent / Temporal / managed runtime distinction, MDS boundary; `docs/runtime/stage-graph-route-transition-runtime.md` lifecycle header, route/stage semantics, landed capability vs evidence-gate table, route/stage acceptance boundaries; `docs/runtime/opl-agent-lab-control-plane.md` Developer Mode, work-order primitive, Agent Lab / OMA split, landed CLI surfaces, longline suite and test-convergence rules. | `docs/runtime/README.md`; `docs/runtime/opl-runtime-naming-and-boundary-contract.md`; `docs/runtime/stage-graph-route-transition-runtime.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. All four files remain current runtime support. This tranche rewrote stale lifecycle/state and scope wording instead of moving files.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history, runtime-substrate history, current-support reference blocks and this `docs/runtime/**` tranche, especially `docs/product/**`, `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**`, `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and other long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining product/source/delivery/public/specs/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded support chunk, preferably `docs/product/**`, `docs/specs/**` or `docs/source/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 00:58 CST`
Tranche: `opl-product-docs-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/product/**` 的 App/workbench 与 public surface 支撑文档。目标是确认 product 支撑面只解释 App/operator entry、public surface、action routing、runtime/domain truth 投影边界和历史 gateway/federation 读法，不把 App user-path evidence、zero-open worklist、provider proof、safe action route、Runtime Manager route-support 或 public surface 索引写成 App release ready、domain ready、production ready、owner-chain closeout、quality/export verdict 或 active `/goal` baton。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/docs_portfolio_consolidation.md`。
- Product docs: `docs/product/README.md`, `docs/product/opl-public-surface-index.md`.
- CLI/read-model surfaces: `opl runtime app-operator-drilldown --json`, `opl framework readiness --family-defaults --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`.
- CLI help surfaces: `opl runtime action execute --help`, `opl runtime app-release-evidence record --help`, `opl runtime app-release-evidence verify --help`, `opl runtime app-release-evidence long-operator start --help`, `opl runtime app-release-evidence long-operator finish --help`.

Fresh read-model result:

- `opl runtime app-operator-drilldown --json` read `availability=available`, `operator_action_route_count=304`, `app_execution_bridge_safe_action_route_count=54`, `app_release_user_path_evidence_open_gate_count=0`, `app_release_user_path_production_user_path_ready=true`, `app_release_user_path_release_ready_claimed=false`, `app_release_user_path_production_ready_claimed=false`, `codex_app_runtime_role_status=opl_temporal_hosted_autonomous`, `codex_app_drives_long_running_tasks=false`, no default next safe action, and refs-only authority boundary with no domain truth write authority.
- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=224`, `evidence_envelope_blocked_count=211`, provider cadence/capability SLO satisfied, and non-goals still include no domain ready, production ready, artifact authority, quality/export verdict, domain action execution, owner receipt closeout or monitor freshness closeout.
- `opl family-runtime evidence-worklist ... --detail full --json` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=211`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`, and not-authorized claims include `domain_repo_physical_delete_authorization` and `default_caller_delete_ready`.
- `opl runtime action execute --help` confirms the App/operator safe action shell exists and explicitly executes through OPL-owned safe action routing without taking domain truth authority.
- `runtime app-release-evidence record|verify` and `runtime app-release-evidence long-operator start|finish` help confirms App release/user-path evidence intake and long-operator observation workorders remain refs-only / preflight-gated evidence surfaces, not release or production readiness verdicts.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/product/README.md` lifecycle header, App/workbench topology note, App/operator drilldown paragraph, App execution bridge route semantics, App release/user path evidence boundary, cleanup/detail `command_domain_id` rule, content table; `docs/product/opl-public-surface-index.md` lifecycle header, purpose, active surface map, OPL-owned runtime/activation surface, domain capability surface, shared boundary support surface, gateway/federation history links, reading rules and completion definition. | this coverage ledger only |

Archived / tombstoned / deleted docs:

- none. Both files remain active product support. No product prose was changed because current wording already matches the fresh read-model and CLI-help boundaries.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history, runtime-substrate history, current-support reference blocks, runtime docs and this `docs/product/**` tranche, especially `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/specs/**`, `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and other long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining source/delivery/public/specs/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-first, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded support chunk, preferably `docs/specs/**`, `docs/source/**`, `docs/delivery/**` or `docs/public/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

## 验证

Docs-only 整理：

- `git diff --check`
- `rg` spot-check 新链接与旧文档引用
- 不新增依赖 Markdown prose 的测试

涉及 contracts/source/runtime/App 的变更：

- 跑触及线路的 focused tests
- 修改 machine-readable contracts、schema、CLI/API 或 runtime semantics 时跑对应 repo-native verification
- 真实 provider/domain soak 必须提供 provider receipts、domain owner receipts、progress delta / human gate / stop-loss / typed blocker evidence
