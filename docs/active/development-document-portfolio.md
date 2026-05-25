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

## 验证

Docs-only 整理：

- `git diff --check`
- `rg` spot-check 新链接与旧文档引用
- 不新增依赖 Markdown prose 的测试

涉及 contracts/source/runtime/App 的变更：

- 跑触及线路的 focused tests
- 修改 machine-readable contracts、schema、CLI/API 或 runtime semantics 时跑对应 repo-native verification
- 真实 provider/domain soak 必须提供 provider receipts、domain owner receipts、progress delta / human gate / stop-loss / typed blocker evidence
