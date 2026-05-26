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
4. 旧 Hermes-default、Gateway-era、direct-entry、local-manager、MDS-default 等路线在替代证据存在后立即退役清理；无 active caller 的模块、接口和测试直接删除或迁入 tombstone，不保留兼容入口。
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

## Coverage Ledger

Date: `2026-05-25 15:35 CST`
Tranche: `strict-source-purity-doc-governance`
State: `tranche_verified`

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
State: `tranche_verified`

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
- 当前 `runtime app-operator-drilldown` 读为 `functional_privatization_action_required_count=0`、`functional_privatization_active_private_generic_residue_count=0`、`default_caller_deletion_evidence_open_requirement_count=0`、`domain_legacy_cleanup_plan_count=3`、`domain_legacy_cleanup_ready_plan_count=3`、`domain_legacy_cleanup_blocked_plan_count=0`、`lifecycle_domain_physical_delete_can_execute=false`。
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
- `runtime app-operator-drilldown` 读为 `availability=available`、`functional_privatization_action_required_count=0`、`default_caller_deletion_evidence_open_requirement_count=0`、`domain_legacy_cleanup_plan_count=3`、`domain_legacy_cleanup_ready_plan_count=3`、`domain_legacy_cleanup_blocked_plan_count=0`、`lifecycle_domain_physical_delete_can_execute=false`、`app_release_user_path_release_ready_claimed=false`、`app_release_user_path_production_ready_claimed=false`。
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

Date: `2026-05-26 11:34 CST`
Tranche: `opl-convergence-governance-reference-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/references/convergence-governance/**` 当前 reference 支撑块。目标是把 convergence governance 的可复用规则从旧四仓 / dated adoption / stale shared-release closeout 口径刷新到当前 OPL series truth：治理范围是 6 仓 OPL series；stage control plane 已落地为 contract + manifest + `opl stages` 只读 discovery/admission/readiness 支撑，不是 workflow runtime；family shared release 当前存在 MAS consumer pin drift attention，不能写成全员 aligned closeout。

Fresh live truth inputs:

- `opl framework readiness --family-defaults --json`
- `opl agents conformance --family-defaults --json`
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`
- `opl runtime app-operator-drilldown --json`
- `opl stages list --json`
- `npm run family:shared-release -- check`
- `contracts/family-release/shared-owner-release.json`
- `contracts/family-orchestration/family-stage-control-plane.schema.json`
- OPL core docs、active truth owner、reference index 和 convergence-governance docs full text.

Fresh read-model / contract result:

- `framework readiness` 读为 `framework_control_plane_available_with_blocked_refs_only_attention`、`hard_blocker_count=0`、`evidence_envelope_blocked_count=216`、`domain_blocked_attention_tail_count=229`；provider cadence / capability SLO satisfied，但 blocked refs-only attention 不授权 domain ready、production ready 或 App release ready。
- `agents conformance` 读为 `status=passed`、`passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`；这只证明 standard-agent structural conformance。
- `family-runtime evidence-worklist` 读为 `open_worklist_item_count=0`、`zero_open_worklist_blocked_refs_only_envelope_count=216`、`domain_ready_authorized=false`、`production_ready_authorized=false`、not-authorized claims 包含 `domain_repo_physical_delete_authorization` 与 `default_caller_delete_ready`。
- `app-operator-drilldown` 读为 `availability=available`、provider SLO cadence/capability satisfied、`functional_privatization_action_required_count=0`、`default_caller_deletion_evidence_open_requirement_count=0`、`app_release_user_path_release_ready_claimed=false`、`app_release_user_path_production_ready_claimed=false`，同时 next safe action 仍是 OPL-owned Temporal worker source-stale restart。
- `opl stages list --json` 读为 3 resolved planes、18 admitted stages、0 blocked stages；这是 discovery/admission 证据，不是 stage execution、quality verdict、owner receipt 或 production evidence closeout。
- `family:shared-release -- check` 读为 contract owner commit `c5d4a93bd4bb64adf1228ecf7f2a9038c7dce278`；MAG/RCA aligned，MAS `pyproject.toml` 与 `uv.lock` 仍 pin `e3fd0b6be41e858958d42ea400a3e63c4205ff8a`，因此当前 shared release state 是 `drift_attention`。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/references/convergence-governance/README.md`; `docs/references/convergence-governance/docs-lifecycle-management-playbook.md`; `docs/references/convergence-governance/family-shared-release-maintenance.md`; `docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`; `docs/references/convergence-governance/series-doc-intake-template.md` renamed from the old four-repo intake template; `docs/references/convergence-governance/opl-positioning-convergence-lessons.md`; `docs/references/README.md`; source/contract/read-model surfaces listed above. | `docs/references/convergence-governance/README.md`; `docs/references/convergence-governance/docs-lifecycle-management-playbook.md`; `docs/references/convergence-governance/family-shared-release-maintenance.md`; `docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`; `docs/references/convergence-governance/opl-positioning-convergence-lessons.md`; `docs/references/convergence-governance/series-doc-intake-template.md`; `docs/references/README.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- Renamed active reference template `docs/references/convergence-governance/four-repo-doc-intake-template.md` to `docs/references/convergence-governance/series-doc-intake-template.md`. The old four-repo template identity remains only in history process records; current OPL series governance uses the six-repo template.
- No document was physically moved to `docs/history/**` in this tranche. The edited reference docs remain support references with refreshed owner/purpose/state/machine-boundary signals.

Unreviewed docs:

- OPL convergence-governance reference directory is covered for this tranche.
- OPL `docs/references/governance/**`, `docs/references/domain-admission/**` and any remaining uncovered support/reference bodies still need chunked paragraph governance.
- MAS paragraph-level semantic coverage remains open outside previously covered Portal/projection/App-workbench block.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- MAS shared release pin drift is an operational consumer alignment tail, not a doc-only closeout. Future shared release work should either align MAS pins with the current owner contract or intentionally update the owner contract/pins through the release flow.
- OPL remaining governance/domain-admission references may still carry old Gateway, frontdoor, federation, Product API, Hermes-default, MDS default, hosted pilot, local-manager, managed-runtime or direct-entry wording; those must stay history/provenance/diagnostic/negative-guard only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- Stage control plane support docs must keep discovery/admission/readiness separate from execution, owner receipt, artifact authority, quality/export verdict and production/domain ready.

Next tranche write scope:

- Continue OPL reference body coverage with `docs/references/governance/**` or `docs/references/domain-admission/**`, or switch to MAS non-history paragraph reconciliation.
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

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old frontdoor, Product API, OMX, Gateway/federation, hosted shell, Hermes-default, local-manager and desktop bootstrap wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Product API, ACP, Gateway, Domain Harness OS, frontdoor, Hermes-default, AionUI shell, local-manager, hosted shell and desktop bootstrap wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, Product API, ACP, UHS, Domain Harness OS, Hermes-default, AionUI shell, hosted pilot, local-manager, G2/G3 and checkbox task wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager and product-layer rollout wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, old Phase package and old reference-sync wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, shared foundation and shared-index wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining history/reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, old `opl web`, Superpowers generated task packets, shared foundation and shared-index wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining reference/support body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining runtime/product/source/delivery/public/specs/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining product/source/delivery/public/specs/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
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

- OPL remaining source/delivery/public/specs/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded support chunk, preferably `docs/specs/**`, `docs/source/**`, `docs/delivery/**` or `docs/public/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 01:18 CST`
Tranche: `opl-specs-docs-coverage`
State: `tranche_verified_and_foldback_pending`

本轮覆盖 OPL `docs/specs/**` 的活跃规格支撑文档。目标是把 domain admission、shared domain contract、shared runtime contract 和 specs index 都读回当前 `OPL Framework -> One Person Lab App -> Foundry Agents` 分层，避免把旧“四仓统一”、Gateway/Hermes/provider、descriptor ready、App evidence、provider proof 或 shared schema 写成 domain ready、production ready、artifact authority、quality/export verdict、owner receipt closeout 或 active `/goal` baton。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`contracts/README.md`。
- Specs docs: `docs/specs/README.md`, `docs/specs/opl-domain-onboarding-contract.md`, `docs/specs/shared-domain-contract.md`, `docs/specs/shared-runtime-contract.md`.
- Machine-readable / source refs: `contracts/README.md`, `contracts/opl-framework/README.md`, `contracts/opl-framework/domains.json`, `contracts/opl-framework/public-surface-index.json`.
- CLI/read-model surfaces: `opl agents descriptors --json`, `opl agents conformance --family-defaults --json`, `opl framework readiness --family-defaults --json`, `opl runtime app-operator-drilldown --json`.

Fresh read-model result:

- `opl agents descriptors --json` read `total_projects_count=3`, `resolved_manifest_count=3`, `descriptor_surfaces_resolved_count=3`, `blocked_count=0`; descriptor notes still state the surface carries refs/readiness/locator/parity/authority boundaries only, while memory bodies, route decisions, quality verdicts and artifact authority remain domain-owned.
- `opl agents conformance --family-defaults --json` read `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance only and does not claim domain ready or production ready.
- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=225`, `evidence_envelope_blocked_count=212`, provider cadence/capability SLO satisfied, and authority boundary still forbids domain ready, production ready, artifact authority, quality/export verdict, domain action execution and owner receipt closeout claims.
- `opl runtime app-operator-drilldown --json` read `availability=available`, `app_release_user_path_release_ready_claimed=false`, `app_release_user_path_production_ready_claimed=false`, `codex_app_runtime_role_status=opl_temporal_hosted_autonomous`, `codex_app_drives_long_running_tasks=false`, `functional_privatization_action_required_count=0`, and `evidence_envelope_blocked_count=212`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/specs/README.md` lifecycle header, current truth jumps, active specs table and收录规则; `docs/specs/opl-domain-onboarding-contract.md` lifecycle header, machine-readable companion artifacts, execution-model review refs, onboarding package and non-goals; `docs/specs/shared-domain-contract.md` lifecycle header, current status note, current-state section, product-layer position and no-ready-claim boundaries; `docs/specs/shared-runtime-contract.md` lifecycle header, current status note, Hermes / provider split, current-state section, implementation boundary and product-layer position. | `docs/specs/shared-domain-contract.md`; `docs/specs/shared-runtime-contract.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. All four files remain active spec support. This tranche rewrote stale current-layer wording instead of moving files.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history, runtime-substrate history, current-support reference blocks, runtime docs, product docs and this `docs/specs/**` tranche, especially `docs/source/**`, `docs/delivery/**`, `docs/public/**`, `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and other long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining source/delivery/public/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded support chunk, preferably `docs/source/**`, `docs/delivery/**`, `docs/public/**` or focused `docs/references/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 01:30 CST`
Tranche: `opl-delivery-docs-coverage`
State: `tranche_verified_and_foldback_pending`

本轮覆盖 OPL `docs/delivery/**` 的通用 artifact/package/export lifecycle 支撑文档。目标是把 delivery 支撑面校准到当前 `OPL Framework -> One Person Lab App -> Foundry Agents` 分层，避免把 artifact locator、package/export refs、lifecycle apply/reconcile、artifact gallery、restore proof、external evidence receipt 或 App/operator projection 写成 artifact authority、quality/export verdict、domain ready、App release ready 或 production ready。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`contracts/README.md`。
- Delivery docs: `docs/delivery/README.md`, `docs/delivery/artifact-package-lifecycle-boundary.md`.
- Machine-readable / source refs: `contracts/opl-framework/generic-substrate-projection-contract.json`, `contracts/opl-framework/family-product-operator-projection.json`, `contracts/opl-framework/public-surface-index.json`, `contracts/family-orchestration/family-lifecycle-ledger.schema.json`, `tests/src/generic-substrate-projection.test.ts`, `tests/src/family-runtime-lifecycle-index.test.ts`, `tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts`.
- CLI/read-model surfaces: `opl help --text`, `opl substrate projections --json`, `opl substrate workbench --json`, `opl runtime app-operator-drilldown --json`, `opl runtime lifecycle apply --help`, `opl runtime lifecycle reconcile --help`.

Fresh read-model result:

- `opl substrate projections --json` read `total_projects_count=3`, `resolved_manifest_count=3`, `substrate_refs_resolved_count=3`, `substrate_refs_partial_count=0`, `blocked_count=0`; notes state OPL carries locators and lifecycle status only while domain agents retain truth/body/verdict/authority.
- `opl substrate workbench --json` read `total_projects_count=3`, `workspace_ref_count=3`, `source_ref_count=12`, `artifact_ref_count=22`, `memory_ref_count=3`, all projections resolved, and authority boundary `opl_owns=[locator_index, ref_transport, lifecycle_projection, operator_projection, workbench_grouping]` while domain agents own workspace/source/artifact/memory truth and quality verdict. Non-authority flags still forbid OPL memory body reads/writes, memory writeback apply, domain truth writes, source truth interpretation, artifact body mutation, artifact authority and quality/fundability/publication authorization.
- `opl runtime app-operator-drilldown --json` read `availability=available`, `artifact_gallery_item_count=37`, `package_ref_count=0`, `export_ref_count=0`, `lifecycle_index_ref_count=3`, `lifecycle_restore_proof_ref_count=3`, `lifecycle_domain_artifact_mutation_receipt_ref_count=2`, `lifecycle_domain_physical_delete_can_execute=false`, `lifecycle_opl_cleanup_apply_can_execute=true`, `evidence_envelope_artifact_authority_claim_count=0`, and refs-only authority boundary still forbids domain truth writes, artifact mutation, quality/export verdict authorization and provider-completion-as-domain-ready.
- `opl runtime lifecycle apply --help` confirms the App/operator lifecycle apply surface reuses the OPL family-runtime lifecycle ledger; `opl runtime lifecycle reconcile --help` confirms reconciliation does not give OPL domain delete authority.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/delivery/README.md` lifecycle header, scope paragraph, current entries and artifact authority boundary; `docs/delivery/artifact-package-lifecycle-boundary.md` lifecycle header, current responsibilities, forbidden authority paragraph, product-layer role table and final routing rule. | `docs/delivery/README.md`; `docs/delivery/artifact-package-lifecycle-boundary.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. Both delivery files remain active support. This tranche rewrote stale product-layer wording instead of moving files.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history, runtime-substrate history, current-support reference blocks, runtime docs, product docs, specs docs and this `docs/delivery/**` tranche, especially `docs/source/**`, `docs/public/**`, `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and other long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining source/public/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded support chunk, preferably `docs/source/**`, `docs/public/**` or focused `docs/references/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 01:43 CST`
Tranche: `opl-source-docs-coverage`
State: `tranche_verified_and_foldback_pending`

本轮覆盖 OPL `docs/source/**` 的通用 workspace/source intake 支撑文档。目标是把 source 支撑面校准到当前 `OPL Framework -> One Person Lab App -> Foundry Agents` 分层，避免把 source locator、source refs/status projection、workspace locator、App/workbench inspect command 或 source provenance ref 写成 source body ownership、source readiness verdict、domain truth、artifact authority、quality/export verdict、domain ready、App release ready 或 production ready。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`contracts/README.md`。
- Source docs: `docs/source/README.md`, `docs/source/workspace-source-intake-boundary.md`.
- Machine-readable / source refs: `contracts/opl-framework/generic-substrate-projection-contract.json`, `contracts/opl-framework/family-product-operator-projection.json`, `src/generic-substrate-projection.ts`, `tests/src/generic-substrate-projection.test.ts`.
- CLI/read-model surfaces: `opl help --text`, `opl substrate projections --json`, `opl substrate workbench --json`.

Fresh read-model result:

- `opl substrate projections --json` read `total_projects_count=3`, `resolved_manifest_count=3`, `substrate_refs_resolved_count=3`, `substrate_refs_partial_count=0`, `blocked_count=0`; project ids were `medautogrant`, `medautoscience`, and `redcube`.
- Each substrate projection read workspace and source refs as `resolved`, with lifecycle role `locator_index_lifecycle_projection_only`; notes state OPL carries locators and lifecycle status only while domain agents retain truth/body/verdict/authority.
- `opl substrate workbench --json` read `total_projects_count=3`, `workspace_ref_count=3`, `source_ref_count=12`, `artifact_ref_count=22`, `memory_ref_count=3`, `substrate_refs_missing_count=0`, `blocked_count=0`.
- Workbench authority boundary read `opl_owns=[locator_index, ref_transport, lifecycle_projection, operator_projection, workbench_grouping]` while domain agents own `workspace_truth`, `source_truth_body`, `artifact_body`, `artifact_authority`, `memory_body`, `memory_writeback_accept_reject`, `domain_truth`, `quality_verdict`, and `publication_fundability_visual_verdict`; non-authority flags still forbid OPL memory body reads/writes, memory writeback apply, domain truth writes, source truth interpretation, artifact mutation, artifact authority and quality/fundability/publication authorization.
- `opl help --text` confirms active `opl substrate projections`, `opl substrate projection --domain <domain>`, `opl substrate workbench`, `opl workspace ...`, `opl status workspace`, and `opl status dashboard` source/workspace/operator projection surfaces.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/source/README.md` lifecycle header, directory role paragraph, entry links and content table; `docs/source/workspace-source-intake-boundary.md` lifecycle header, current responsibilities, source/domain non-authority paragraph, owner split table and final routing rule. | `docs/source/README.md`; `docs/source/workspace-source-intake-boundary.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. Both source files remain active support. This tranche rewrote stale "四仓分工" and `source readiness projection` wording into current Framework/App/Foundry Agents owner split and refs/status projection language.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history, runtime-substrate history, current-support reference blocks, runtime docs, product docs, specs docs, delivery docs and this `docs/source/**` tranche, especially `docs/public/**`, `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and other long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history and Portal/projection/App-workbench blocks.
- App docs remain delayed until active release/GUI worktrees close, App `main` is current, or explicit ownership makes current App docs safe to govern.
- Future changes in OMA/MAG/RCA can reopen coverage even though their recorded scopes were previously closed.

Remaining stale / retire candidates:

- OPL remaining public/reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, UHS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in another bounded support chunk, preferably `docs/public/**` or focused `docs/references/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 01:58 CST`
Tranche: `mas-inspection-package-product-delivery-coverage`
State: `tranche_verified`

本轮覆盖 MAS `inspection_package` 产品、交付与 delivery-plane contract 文档，并吸收回 MAS `main`。目标是把 human-inspection-only inspection surface 读回 live source / tests / product-entry 事实，明确它可以物化 blocked snapshot，也可以在 existing controller-authorized current package 已 current 时只返回 `authorized_current_package_available` review pointer；两条路径都不能授权投稿、质量放行、`current_package` 写入、`submission_minimal` 写入或 eval / decision artifact 更新。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/mas-ideal-state-gap-plan.md`、MAS docs-governance ledger。
- MAS product / delivery / runtime docs: `docs/product/inspection_package.md`, `docs/delivery/inspection_package.md`, `docs/runtime/contracts/delivery_plane_contract_map.md`, `docs/runtime/control/controllers.md`.
- MAS source / tests: `src/med_autoscience/controllers/submission_inspection_export.py`, `src/med_autoscience/controllers/delivery_visibility_projection.py`, `src/med_autoscience/action_catalog.py`, `src/med_autoscience/controllers/product_entry_parts/manifest_shell_surfaces.py`, `tests/test_inspection_package_contract.py`, `tests/test_submission_inspection_export.py`, `tests/product_entry_cases/delivery_inspection_visibility.py`.
- CodeGraph context / explore for `inspection_package`, `human_inspection_only`, `not_for_submission`, `gate_blocked_snapshot`, and related tests.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | `docs/product/inspection_package.md` full file; `docs/delivery/inspection_package.md` full file; `docs/runtime/contracts/delivery_plane_contract_map.md` inspection-package sections and delivery-plane artifact row; `docs/runtime/control/controllers.md` inspection package contract section; `docs/product/README.md` and `docs/delivery/README.md` inspection-package index rows. | `docs/product/inspection_package.md`; `docs/delivery/inspection_package.md`; `docs/runtime/contracts/delivery_plane_contract_map.md`; `docs/runtime/control/controllers.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Verification:

- MAS worktree and rebased branch: `git diff --check`; strict README/docs/contracts/tests/src conflict-marker scan; OPL Doc Governance doctor `finding_count=0` and active truth status `pass`; `scripts/run-pytest-clean.sh tests/test_inspection_package_contract.py tests/test_submission_inspection_export.py tests/product_entry_cases/delivery_inspection_visibility.py -q` read `11 passed`.
- MAS main after fast-forward: same diff/conflict/doctor checks passed; focused pytest again read `11 passed`.
- MAS commit `cbbe1ce1 docs: cover MAS inspection package boundary` was pushed to `origin/main`; the tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-inspection-package-docs-coverage-20260526` and branch `codex/mas-inspection-package-docs-coverage-20260526` were removed.

Archived / tombstoned / deleted docs:

- none. The MAS product, delivery and runtime contract docs remain active support because they hold distinct product, export and delivery-plane boundary roles.

Unreviewed docs:

- MAS integration references under `docs/references/integration/*.md` that mention product/workbench/Portal/owner-route current-truth claims remain open.
- MAS runtime support docs outside the touched delivery-plane contract and controller section remain open, especially other `docs/runtime/contracts/**` and `docs/runtime/control/**` files.
- OPL full README/docs coverage remains open outside recorded OPL coverage tranches; App docs remain delayed until active release/GUI lanes are safe to govern.

Remaining stale / retire candidates:

- `inspection_package` is not a retire candidate in this tranche; live source and tests prove it is an active human-inspection-only delivery surface.
- Future MAS prose must keep blocked snapshot materialization separate from `authorized_current_package_available` pointer mode, and must not describe either mode as `current_package` freshness proof, formal submission package, publication verdict, quality gate closeout, delivery-sync dispatch, or artifact mutation authority.

Next tranche write scope:

- MAS integration references under `docs/references/integration/*.md`, or runtime support docs under `docs/runtime/contracts/**` / `docs/runtime/control/**` that still carry product/workbench/Portal/owner-route current-truth claims.
- Or continue OPL full docs coverage in another bounded support chunk, preferably `docs/public/**` or focused `docs/references/**`.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 02:07 CST`
Tranche: `opl-public-docs-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/public/**` 的公开方向、任务版图、运行模型与 UHS 支撑文档。目标是把 public support 叙事校准到当前 `AI-first / executor-first / Codex-first`、`OPL Framework -> One Person Lab App -> Foundry Agents`、Codex-default executor、Temporal-backed provider 和 refs-only control-plane 边界，避免把 domain 仓写成 runtime/harness owner、把旧 `Agent-first` 主语继续当成当前顶层原则，或把 public docs 中的 substrate / roadmap / task-map 写成 domain ready、release ready、production ready、artifact authority 或 quality/export verdict。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、`contracts/README.md`。
- Public docs: `docs/public/README.md`, `docs/public/operating-model.md`, `docs/public/roadmap.md`, `docs/public/task-map.md`, `docs/public/unified-harness-engineering-substrate.md`。
- CLI/read-model surfaces: `opl framework readiness --family-defaults --json`, `opl agents conformance --family-defaults --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`, `opl runtime app-operator-drilldown --json`。

Fresh read-model result:

- `opl agents conformance --family-defaults --json` read `standard_domain_agent_conformance.status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, and `production_evidence_tail_count=4`; this proves current structural conformance only, not domain ready or production ready.
- `opl family-runtime evidence-worklist ... --detail full --json` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=213`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, and `zero_open_worklist_is_production_ready=false`.
- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `framework_kernel_hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=226`, `evidence_envelope_blocked_count=213`, provider cadence/capability SLO satisfied, and authority boundary still `can_claim_domain_ready=false`, `can_claim_production_ready=false`, `can_authorize_quality_or_export=false`, `can_mutate_domain_artifact=false`.
- `opl runtime app-operator-drilldown --json` read `availability=available` and `codex_app_runtime_role.runtime_policy=opl_temporal_hosted_autonomous`, `codex_app_roles=[start, observe, intervene, display]`, `codex_app_drives_long_running_tasks=false`, `long_running_task_driver_owner=one-person-lab`, `long_running_task_driver_substrate=temporal`, `default_stage_executor=codex_cli`, and authority boundary forbids domain truth writes, memory/artifact body access, artifact mutation, quality/export/submission authorization, owner receipt creation, domain ready, production ready and long-soak closeout.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/public/README.md` full file; `docs/public/operating-model.md` AI/executor execution, product-entry/runtime-manager and domain authority sections; `docs/public/roadmap.md` family shape and hosted/desktop boundary wording; `docs/public/task-map.md` execution principles, handoff / no-bypass rules and final task-map framing; `docs/public/unified-harness-engineering-substrate.md` shared invariant / execution posture section. | `docs/public/operating-model.md`; `docs/public/roadmap.md`; `docs/public/task-map.md`; `docs/public/unified-harness-engineering-substrate.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. All five public docs remain active public support. This tranche rewrote stale or ambiguous current-layer wording instead of moving files.

Unreviewed docs:

- OPL full README/docs coverage remains open outside previously covered entry/core, gateway-federation history, frontdoor-legacy history, process/specs history, process/plans history, process/convergence-governance history, process/domain-admission history, process/shared-boundary history, process/superpowers history, runtime-substrate history, current-support reference blocks, runtime docs, product docs, specs docs, delivery docs, source docs and this `docs/public/**` tranche, especially `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and other long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history, Portal/projection/App-workbench and inspection-package blocks.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- OPL remaining reference body coverage still needs chunked paragraph governance; old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, hosted pilot, local-manager, managed-runtime and direct-entry wording must stay history-only or support-only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in a focused `docs/references/**` chunk, preferably runtime-substrate or operating-governance support bodies with older Gateway / Hermes / managed-runtime / local-manager wording.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.


Date: `2026-05-26 02:42 CST`
Tranche: `opl-runtime-substrate-reference-currentness-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/references/runtime-substrate/**` 的核心当前支撑文档，重点是把 AI-first / executor-first 调研入口、stage-led roadmap 与 Temporal provider 计划从 2026-05-14/17 dated proof 校准到 2026-05-26 live read-model。目标是避免把 provider proof、task-bound bridge 旧计数、App user-path evidence、OMA production-consumption、conformance pass 或 zero-open worklist 写成 domain ready、production ready、App release ready、artifact authority、quality/export verdict、owner-chain closure 或 long-soak closeout。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`contracts/README.md`。
- Runtime-substrate reference docs: `docs/references/runtime-substrate/README.md`, `ai-first-executor-first-long-horizon-optimization.md`, `opl-stage-led-agent-framework-roadmap.md`, `temporal-family-runtime-provider-plan.md`, `opl-runtime-manager-target.md`, `family-executor-adapter-defaults.md`, `family-runtime-attempt-contract.md`, `family-orchestration-contract-absorb-crewai.md`, `opl-managed-runtime-three-layer-contract.md`, `hermes-agent-executor-evaluation.md`, `hermes-agent-truth-reset-and-target-state.md`, `opl-family-agent-ideal-state.md`, `graphflow-gfl-contract-vocabulary.md`。
- CLI/read-model surfaces: `opl framework readiness --family-defaults --json`, `opl agents conformance --family-defaults --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`, `opl runtime app-operator-drilldown --json`。

Fresh read-model result:

- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=226`, `evidence_envelope_blocked_count=213`, provider cadence/capability SLO satisfied, and authority boundary still forbids domain ready, production ready, quality/export verdict and artifact mutation authority claims.
- `opl agents conformance --family-defaults --json` read four repos structural conformance passed and `blocked_count=0`; this proves standard pack / descriptor / authority boundary readability only, not production ready.
- `opl family-runtime evidence-worklist ... --detail full --json` read `open_worklist_item_count=0`, `closed_refs_only_item_count=246`, `zero_open_worklist_blocked_refs_only_envelope_count=213`, `domain_ready_authorized=false`, and `production_ready_authorized=false`; zero-open worklist is not a completion, domain-ready or production-ready claim.
- `opl runtime app-operator-drilldown --json` read `availability=available`, `stage_attempt_count=25`, provider cadence/capability SLO satisfied, App user-path production user path ready, but `app_release_user_path_release_ready_claimed=false` and `app_release_user_path_production_ready_claimed=false`; Codex App role remains start / observe / intervene / display, while long-running task driver owner is OPL on Temporal and default stage executor is `codex_cli`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/references/runtime-substrate/README.md` current/legacy index boundary; `ai-first-executor-first-long-horizon-optimization.md` current conclusion, evidence priority, established system assessment and next directions; `opl-stage-led-agent-framework-roadmap.md` current landing assessment and dated proof sections; `temporal-family-runtime-provider-plan.md` conclusion, P1/P3 proof wording; `opl-runtime-manager-target.md` owner split and route-support sections; `family-executor-adapter-defaults.md` default executor and non-default adapter boundary; `family-runtime-attempt-contract.md` owner split / scheduler boundary; `family-orchestration-contract-absorb-crewai.md` external framework absorption boundary; Hermes / ideal-state / GraphFlow reference docs spot-checked for active-surface leakage. | `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md`; `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`; `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. Runtime-substrate reference docs remain active support or explicit history/provenance references. This tranche corrected currentness and authority wording instead of moving files.

Unreviewed docs:

- OPL reference body coverage remains open outside this runtime-substrate tranche, especially `docs/references/operating-governance/**`, `docs/references/convergence-governance/**`, `docs/references/governance/**` and any long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history, Portal/projection/App-workbench and inspection-package blocks.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- OPL runtime-substrate docs now have an explicit 2026-05-26 live read-model guard, but older dated proof sections still intentionally retain historical counters as provenance. Future edits must keep dated counters separate from latest read-model and rerun CLI evidence before making status claims.
- OPL remaining operating/convergence/governance references may still carry old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, hosted pilot, local-manager, managed-runtime or direct-entry wording; those must stay history/provenance/diagnostic/negative-guard only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in `docs/references/operating-governance/**` or `docs/references/convergence-governance/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 02:40 CST`
Tranche: `mas-runtime-binding-id-currentness-coverage`
State: `tranche_verified`

本轮覆盖 MAS runtime support docs 中最容易误导后续自动化的 runtime id、runtime binding 与 provider-owner 口径。目标是把 MAS active current truth、runtime backend contract、runtime handle contract 和 capability projection 中旧 `opl_provider_backed_stage_runtime` 机器 id 写法，对齐 MAS live `opl_runtime_contract.py`、`write_runtime_binding`、product-entry manifest 和 focused tests：当前 machine ref 是 `opl_hosted_stage_runtime` / `opl-hosted-stage-runtime`，OPL/Temporal provider-backed 是 owner/topology 语义，MAS domain adapter 是 `mas_domain_intent_adapter` / `mas_domain_owner_receipt_adapter`。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/mas-ideal-state-gap-plan.md`、MAS docs-governance ledger。
- MAS runtime docs: `docs/status.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/runtime/contracts/runtime_backend_interface_contract.md`, `docs/runtime/contracts/runtime_handle_and_durable_surface_contract.md`, `docs/runtime/contracts/agent_runtime_interface.md`, `docs/runtime/projections/runtime_capability_matrix.md`.
- MAS source / tests: `src/med_autoscience/opl_runtime_contract.py`, `src/med_autoscience/runtime_protocol/study_runtime.py`, `src/med_autoscience/controllers/product_entry_parts/entry_runtime.py`, `src/med_autoscience/controllers/product_entry_parts/manifest_surfaces.py`, `tests/test_opl_runtime_contract.py`, `tests/test_runtime_protocol_study_runtime.py`, `tests/test_profiles.py`, `tests/test_mainline_status.py`, `tests/product_entry_cases/repo_shell_runtime_assertions.py`.
- CLI/read-model: MAS clean-runner CLI help for `med_autoscience.cli`, `runtime`, `runtime maintain-storage`, and `runtime storage-audit`.

Fresh semantic result:

- Current runtime machine identity is `runtime_substrate=opl_hosted_stage_runtime`, `runtime_ref=opl_hosted_stage_runtime`, and `runtime_engine_id=opl-hosted-stage-runtime`.
- `runtime_binding.yaml` writes `runtime_substrate`, `opl_runtime_ref`, `runtime_ref`, `runtime_engine_id`, `research_backend_id`, `research_backend`, `research_engine_id`, `runtime_home`, and `runtime_quests_root`; current protocol tests assert it no longer writes `runtime_backend_id` or `runtime_backend`.
- OPL/Temporal provider-backed stage runtime remains the default generic runtime owner/topology. That owner wording must not be converted back into a MAS-local backend id or callable module.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Risk scan across all files under `docs/runtime/contracts/**`, `docs/runtime/control/**`, `docs/runtime/stage_route_handoff_standard.md`, plus focused review of runtime id / backend / binding sections in `docs/status.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/runtime/contracts/runtime_backend_interface_contract.md`, `docs/runtime/contracts/runtime_handle_and_durable_surface_contract.md`, `docs/runtime/contracts/agent_runtime_interface.md`, and `docs/runtime/projections/runtime_capability_matrix.md`. | `docs/status.md`; `docs/active/mas-ideal-state-gap-plan.md`; `docs/runtime/contracts/runtime_backend_interface_contract.md`; `docs/runtime/contracts/runtime_handle_and_durable_surface_contract.md`; `docs/runtime/contracts/agent_runtime_interface.md`; `docs/runtime/projections/runtime_capability_matrix.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Verification:

- MAS worktree and rebased branch: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor `finding_count=0` and active truth status `pass`; MAS clean-runner CLI help for `med_autoscience.cli`, `runtime`, `runtime maintain-storage`, `runtime storage-audit`; focused pytest `tests/test_opl_runtime_contract.py tests/test_runtime_protocol_study_runtime.py tests/test_profiles.py::test_profile_to_dict_exposes_machine_readable_contract tests/test_mainline_status.py::test_mainline_status_projects_ideal_state_current_stage_and_gaps tests/product_entry_cases/repo_shell_runtime_assertions.py -q` read `52 passed`.
- MAS commit `b5bf3840 docs: cover MAS runtime binding ids` was pushed to `origin/main`; the tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-runtime-docs-coverage-20260526` and branch `codex/mas-runtime-docs-coverage-20260526` were removed.
- OPL main ledger commit recorded this series coverage. Six-repo final lightweight checkout verification read clean main checkouts, doctor `finding_count=0`, active truth `pass`, missing=0 and next-not-ready=0 for all six.

Archived / tombstoned / deleted docs:

- none. This tranche corrected current-truth wording in place; the affected MAS documents remain active support / active current truth owners.

Unreviewed docs:

- MAS paragraph-level coverage remains open for most of `docs/runtime/contracts/**`, especially long support bodies not touched beyond lifecycle header / heading / stale-id risk scan.
- MAS paragraph-level coverage remains open for `docs/runtime/control/study_runtime_control_surface.md` and `docs/runtime/control/study_runtime_orchestration.md` beyond the runtime binding / owner split sections inspected here.
- `docs/runtime/stage_route_handoff_standard.md` was risk-scanned and read for owner split, but not fully rewritten or marked fully paragraph-covered.
- OPL reference body coverage remains open outside previously covered tranches; App docs remain delayed until active release/GUI lanes close or explicit ownership makes them safe to govern.

Remaining stale / retire candidates:

- Future prose that writes `opl_provider_backed_stage_runtime` as a current machine id, required `runtime_backend_id`, required `runtime_backend`, or MAS-local callable backend is stale.
- `runtime_backend_id` and `runtime_backend` may appear only as legacy migration / provenance fields or historical input names; they must not become current required `runtime_binding.yaml` fields again.

Next tranche write scope:

- MAS paragraph-level coverage for a bounded subset of `docs/runtime/contracts/**`, preferably `runtime_event_and_outer_loop_input_contract.md`, `durable_workflow_contract.md`, `stage_route_contract.md`, `stage_surfaces.md`, or `workspace_knowledge_and_literature_contract.md`.
- MAS `docs/runtime/control/study_runtime_control_surface.md` / `study_runtime_orchestration.md` paragraph compaction if the next tranche focuses on stop/rerun/current-control-state semantics.
- Or continue OPL full docs coverage in `docs/references/operating-governance/**` / `docs/references/convergence-governance/**`.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 02:58 CST`
Tranche: `opl-operating-governance-reference-currentness-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/references/operating-governance/**` 的 governance、operator projection、domain memory、incident learning、quality projection、directory governance 与 structure advisory 支撑文档。目标是把 operating-governance reference 校准到当前 `AI-first / executor-first / Codex-first`、refs-only operator projection、domain-owned memory/quality/artifact authority 与 dated advisory snapshot 边界，避免旧 Gateway / compatibility / Hermes provider / dated proof / advisory scan / zero-open worklist 被误读成 active topology、domain ready、production ready、App release ready、memory apply、quality/export verdict 或 fail-closed structure backlog。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`contracts/README.md`。
- Operating-governance docs: `docs/references/operating-governance/README.md`, `family-product-operator-projection.md`, `family-domain-memory-governance.md`, `family-domain-quality-projection-contract.md`, `family-incident-learning-loop.md`, `family-structure-advisory-report.md`, `opl-family-directory-governance.md`。
- Machine-readable / test refs: `contracts/opl-framework/family-product-operator-projection.json`, `contracts/opl-framework/family-domain-quality-projection-contract.json`, `contracts/opl-framework/family-incident-learning-loop.json`, `tests/src/active-path-residue-scan.test.ts`, `tests/src/stale-compat-retirement-guard.test.ts`, `tests/src/family-structure-advisory.test.ts`。
- CLI/read-model surfaces: `opl framework readiness --family-defaults --json`, `opl agents conformance --family-defaults --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`, `opl runtime app-operator-drilldown --json`, `opl domain-memory list --json`, `npm run --silent family:structure-advisory -- --format=json|markdown`。

Fresh read-model result:

- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=228`, `evidence_envelope_blocked_count=215`, and authority boundary still forbids domain ready, production ready, quality/export verdict and artifact mutation authority claims.
- `opl agents conformance --family-defaults --json` read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, and `production_evidence_tail_count=4`; this is structural conformance only.
- `opl family-runtime evidence-worklist ... --detail full --json` read `open_worklist_item_count=0`, `closed_refs_only_item_count=246`, `zero_open_worklist_blocked_refs_only_envelope_count=214`, `domain_ready_authorized=false`, and `production_ready_authorized=false`; worklist snapshot and framework readiness snapshot were taken at different times, so their blocked-envelope counts are recorded separately.
- `opl runtime app-operator-drilldown --json` read `availability=available`, `stage_attempt_count=25`, `quality_ref_count=0`, `memory_ref_count=0`, `memory_writeback_ref_count=2`, provider cadence/capability SLO satisfied, `evidence_envelope_blocked_count=214`, `app_release_user_path_release_ready_claimed=false`, `app_release_user_path_production_ready_claimed=false`, `codex_app_runtime_role_status=opl_temporal_hosted_autonomous`, and `codex_app_drives_long_running_tasks=false`.
- `opl domain-memory list --json` read `resolved_memory_descriptor_count=3`, `missing_memory_descriptor_count=0`, `total_projects_count=3`.
- Fresh structure advisory one-person-lab scan remained advisory-only, with `mechanical_residue=[]`; public-surface-risk still includes `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`, `contracts/family-orchestration/family-stage-proof-bundle.schema.json`, and `contracts/opl-framework/agent-lab-contract.json`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/references/operating-governance/README.md` index and topology guard; `family-product-operator-projection.md` purpose/runtime semantics/fail-closed/observability export; `family-domain-memory-governance.md` current landing, dated proof, completion and next steps; `family-domain-quality-projection-contract.md` owner split and forbidden authority; `family-incident-learning-loop.md` incident taxonomy and runtime-owner mismatch wording; `family-structure-advisory-report.md` state and snapshot reading rule; `opl-family-directory-governance.md` directory standardization state and repo-source/runtime-artifact boundary. | `docs/references/operating-governance/README.md`; `docs/references/operating-governance/family-product-operator-projection.md`; `docs/references/operating-governance/family-domain-memory-governance.md`; `docs/references/operating-governance/family-incident-learning-loop.md`; `docs/references/operating-governance/family-structure-advisory-report.md`; `docs/references/operating-governance/opl-family-directory-governance.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. All operating-governance files remain active support or dated snapshot support. This tranche corrected currentness and authority wording instead of moving files.

Unreviewed docs:

- OPL reference body coverage remains open outside this operating-governance tranche, especially `docs/references/convergence-governance/**`, `docs/references/governance/**`, `docs/references/domain-admission/**` and other long support bodies not listed above.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history, Portal/projection/App-workbench and inspection-package blocks.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Operating-governance docs now have explicit refs-only / dated-snapshot guards, but future edits must rerun CLI/read-model before quoting exact counts because framework readiness, evidence worklist and app drilldown snapshots can legitimately differ.
- OPL remaining convergence/governance/domain-admission references may still carry old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, hosted pilot, local-manager, managed-runtime or direct-entry wording; those must stay history/provenance/diagnostic/negative-guard only unless current source/contracts/read-model explicitly re-admit a narrow surface.
- MAS product/status/workbench, owner-route handoff, progress/domain-ref projection and controller shell still need paragraph-level semantic coverage against generated/default-caller replacement boundaries.
- App release-ready / production-ready remains separate from observed App user-path evidence and is still owned by active release/GUI lanes.

Next tranche write scope:

- Continue OPL full docs coverage in `docs/references/convergence-governance/**`, `docs/references/governance/**` or `docs/references/domain-admission/**`.
- Or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 03:17 CST`
Tranche: `opl-governance-reference-checklist-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/references/governance/**` 当前唯一文件 `series-doc-governance-checklist.md`。目标是把仓级治理清单从旧五仓口径刷新到当前六仓 OPL series，并把 App、OMA、descriptor/conformance/stage/read-model 的 authority 边界写清，避免把 refs-only / structural / zero-open worklist / provider SLO 信号误读成 domain ready、production ready、App release ready、artifact authority ready 或 domain repo physical delete authorized。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/references/README.md`。
- `docs/references/governance/series-doc-governance-checklist.md` full text and `package.json` scripts.
- Machine-readable refs: `contracts/opl-framework/domains.json`, `contracts/opl-framework/workstreams.json`, `contracts/opl-framework/family-executor-adapter-defaults.json`.
- CLI/read-model surfaces: `opl framework readiness --family-defaults --json`, `opl agents descriptors --json`, `opl agents conformance --family-defaults --json`, `opl runtime app-operator-drilldown --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`, `opl stages list --json`.

Fresh read-model result:

- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=229`, `evidence_envelope_blocked_count=216`, provider cadence/capability SLO satisfied, and authority boundary still forbids domain ready, production ready, artifact authority and quality/export verdict claims.
- `opl agents descriptors --json` read `total_projects_count=3`, `resolved_manifest_count=3`, `descriptor_surfaces_resolved_count=3`, `blocked_count=0`; descriptors remain refs/readiness/locator/parity/authority boundaries only.
- `opl agents conformance --family-defaults --json` read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance only.
- `opl stages list --json` read `resolved_planes_count=3`, `stages_count=18`, `admitted_stages_count=18`, `blocked_stages_count=0`; this is stage discovery/admission evidence, not workflow runtime, production or domain readiness.
- `opl runtime app-operator-drilldown --json` read `availability=available`, provider cadence/capability SLO satisfied, `evidence_envelope_blocked_count=216`, `app_release_user_path_release_ready_claimed=false`, `app_release_user_path_production_ready_claimed=false`, `opl_meta_agent_production_consumption_ready=true`, `opl_meta_agent_claims_domain_ready=false`, `codex_app_runtime_role_status=opl_temporal_hosted_autonomous`, and `codex_app_drives_long_running_tasks=false`.
- `opl family-runtime evidence-worklist ... --detail full --json` read `open_worklist_item_count=0`, `closed_refs_only_item_count=246`, `zero_open_worklist_blocked_refs_only_envelope_count=216`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`, and not-authorized claims include `domain_repo_physical_delete_authorization` and `default_caller_delete_ready`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/references/governance/series-doc-governance-checklist.md` goal, default entries, core-doc rules, public/internal layering, series consistency checks and default verification section; supporting owner references listed above. | `docs/references/governance/series-doc-governance-checklist.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. `series-doc-governance-checklist.md` remains active support; this tranche corrected stale scope and authority wording in place.

Unreviewed docs:

- OPL `docs/references/governance/**` is covered for this tranche.
- OPL reference body coverage remains open outside previously covered reference chunks, especially `docs/references/domain-admission/**` and any remaining long support bodies not listed in prior ledgers.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history, Portal/projection/App-workbench, inspection-package and runtime-binding blocks.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future governance/checklist prose that reverts to the older five-repo series scope is stale; OPL series governance must include `one-person-lab-app`.
- Any current-support wording that treats descriptor/conformance/stage discovery, zero-open worklist, provider SLO satisfied, OMA production-consumption refs or App user-path evidence as domain ready, production ready, App release ready, owner receipt closure, artifact authority or physical-delete authorization is stale.
- OPL remaining domain-admission references may still carry old Gateway, frontdoor, federation, Product API, Hermes-default, Hermes provider, AionUI shell, MDS default, Domain Harness OS, hosted pilot, local-manager, managed-runtime or direct-entry wording; those must stay history/provenance/diagnostic/negative-guard only unless current source/contracts/read-model explicitly re-admit a narrow surface.

Next tranche write scope:

- Continue OPL full docs coverage in `docs/references/domain-admission/**`, or switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 03:31 CST`
Tranche: `opl-domain-admission-reference-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/references/domain-admission/**` 当前唯一文件 `opl-candidate-domain-backlog.md`。目标是把 candidate backlog 的机器边界校准到当前 `task-topology.json` / `workstreams.json` / domain-onboarding 合同事实：`IP Ops`、`Award Ops`、`Thesis Ops` 和 `Review Ops` 仍只是 `under_definition` / `candidate_domain_agent_pending` workstream signal，未进入 registered workstream、admitted stage、discovery target、routing target、domain handoff 或 readiness surface。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/specs/opl-domain-onboarding-contract.md`、`docs/references/README.md`。
- `docs/references/domain-admission/opl-candidate-domain-backlog.md` full text。
- Machine-readable refs: `contracts/opl-framework/task-topology.json`, `contracts/opl-framework/workstreams.json`, `contracts/opl-framework/domains.json`, `contracts/opl-framework/README.md`。
- CLI/read-model surfaces: `opl framework readiness --family-defaults --json`, `opl agents descriptors --json`, `opl agents conformance --family-defaults --json`, `opl stages list --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。

Fresh read-model result:

- `task-topology.json` lists `research_ops`, `grant_ops`, and `presentation_ops` as frozen / registered / `domain_agent_entry_ready`; it lists `thesis_ops`, `review_ops`, `ip_ops`, and `award_ops` as `under_definition`, `not_registered`, `candidate_domain_agent_pending`, with no `current_domain_id` or `entry_surface`, and `formal_domain_required=true`.
- `workstreams.json` lists only active `grant_ops`, `research_ops`, and `presentation_ops`; it does not register the four candidate workstreams.
- `opl stages list --json` read `resolved_planes_count=3`, `stages_count=18`, `admitted_stages_count=18`, `blocked_stages_count=0`; this proves admitted stage plane discovery only, not candidate admission or domain readiness.
- `opl agents descriptors --json` read `total_projects_count=3`, `resolved_manifest_count=3`, `descriptor_surfaces_resolved_count=3`, `blocked_count=0`; descriptors remain refs/readiness/locator/parity/authority boundaries only.
- `opl agents conformance --family-defaults --json` read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`; this is structural conformance only.
- `opl framework readiness --family-defaults --json` read `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_actionable_attention_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=229`, `evidence_envelope_blocked_count=216`, provider cadence/capability SLO satisfied, and authority boundary still forbids domain ready, production ready, artifact authority and quality/export verdict claims.
- `opl family-runtime evidence-worklist ... --detail full --json` read `open_worklist_item_count=0`, `closed_refs_only_item_count=246`, `zero_open_worklist_blocked_refs_only_envelope_count=216`, `domain_ready_authorized=false`, `production_ready_authorized=false`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`, and not-authorized claims include `domain_repo_physical_delete_authorization` and `default_caller_delete_ready`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | `docs/references/domain-admission/opl-candidate-domain-backlog.md` purpose, Task Topology / Domain Onboarding relationship, machine boundary, non-goals, each candidate entry, reading rules, upstream evidence and completion definition; supporting owner references listed above. | `docs/references/domain-admission/opl-candidate-domain-backlog.md`; this coverage ledger |

Archived / tombstoned / deleted docs:

- none. `opl-candidate-domain-backlog.md` remains active support; this tranche corrected stale machine-boundary and old Gateway authority wording in place.

Unreviewed docs:

- OPL `docs/references/domain-admission/**` is covered for this tranche.
- OPL `docs/references/**` current inventory is covered by the recorded current-support, runtime-substrate, operating-governance, convergence-governance, governance and domain-admission reference tranches.
- OPL full README/docs coverage still remains open outside the covered OPL chunks named in earlier ledger entries; exact remaining non-reference scope should be selected from the latest inventory before the next OPL tranche.
- MAS paragraph-level semantic coverage remains open outside prior lifecycle/history, Portal/projection/App-workbench, inspection-package and runtime-binding blocks.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Any current wording that treats `IP Ops`, `Award Ops`, `Thesis Ops`, or `Review Ops` as registered/admitted/discoverable/routable domain agents is stale until a real onboarding package updates contracts and live read-models.
- Any use of historical `Gateway`, routed-action or federation acceptance specs as current admission authority, machine-readable contract surface, readiness gate or current handoff rule is stale.
- Candidate backlog prose must keep `task-topology.json` candidate visibility separate from `workstreams.json` active registration and `opl stages list` admitted-stage discovery.

Next tranche write scope:

- Switch to MAS non-history paragraph reconciliation around owner-route handoff / domain-ref projection / controller shell, or choose the next exact OPL non-reference uncovered body from the fresh coverage ledger and inventory.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 03:48 CST`
Tranche: `mas-owner-route-control-boundary-coverage`
State: `tranche_verified`

本轮覆盖 MAS owner-route / controller shell / current-control-state 文档边界，并吸收回 MAS `main`。目标是把 MAS core entry、stage-route handoff 和 runtime control support 中容易误读成 MAS 长期自有 CLI/MCP/product-entry/sidecar/controller wrapper、MAS child scheduler 或 MAS provider-control 写入口的段落，统一校准到 current OPL standard-agent 目标：MAS 保留医学 truth、domain handler target、authority refs、owner receipt / typed blocker producer、AI reviewer / publication gate 和必要医学 helper；OPL generated/default callers、queue、attempt、retry/dead-letter、provider worker、current-control-state、generic transition transport、App/workbench shell 和长期 runtime owner 归 OPL。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、核心五件套、`docs/active/mas-ideal-state-gap-plan.md`、`docs/references/positioning/mas_ideal_state.md`、MAS docs-governance ledger。
- MAS docs: `README.zh-CN.md`, `docs/project.md`, `docs/architecture.md`, `docs/runtime/control/controllers.md`, `docs/runtime/control/study_runtime_control_surface.md`, `docs/runtime/control/study_runtime_orchestration.md`, `docs/runtime/stage_route_handoff_standard.md`.
- MAS machine/source refs: `contracts/action_catalog.json`, `contracts/generated_surface_handoff.json`, `contracts/functional_privatization_audit.json`, `contracts/stage_control_plane.json`, `src/med_autoscience/controllers/owner_route_handoff_parts/owner_route_handoff_tasks.py`, `src/med_autoscience/controllers/owner_route_reconcile_parts/opl_owner_route_handoff.py`, `src/med_autoscience/controllers/study_progress_parts/opl_current_control_state_handoff.py`, `src/med_autoscience/runtime_control/ports.py`.
- CodeGraph context/explore for `owner_route_handoff`, `owner_route_handoff_task`, `request_opl_stage_attempt`, `opl_current_control_state_handoff_path`, and `opl_current_control_state_study_handoff_projection`.
- CLI/read-model: MAS clean-runner `scripts/run-python-clean.sh -m med_autoscience.cli runtime --help`.

Fresh semantic result:

- `contracts/action_catalog.json` declares `generated_surface_owner=one-person-lab` and `domain_repo_runtime_role=domain_handler_target_and_authority_functions`; `contracts/generated_surface_handoff.json` declares generated CLI/MCP/Skill/product-entry/sidecar/status/workbench/test-harness surfaces as OPL-owned and not domain-owned.
- MAS root `agent/` is the canonical OPL Agent semantic pack source; current MAS CLI/MCP/product-entry/sidecar/controller surfaces are discoverable direct/operator surfaces, migration input, diagnostic refs, generated/default caller targets, domain handler targets or minimal authority implementation, not MAS-owned generic runtime/product wrappers.
- `owner_route_handoff` / `owner_route_handoff_task` prove refs-only owner-route handoff: `queue_owner=one-person-lab`, `domain_truth_owner=med-autoscience`, `runtime_state_mutated=false`, route is not stage, OPL owns stage lifecycle/runtime transition/queue, and forbidden writes include runtime state, user message queue, retry/dead-letter/worker liveness truth, publication eval, controller decisions and `current_package`.
- OPL current-control-state handoff is read from `artifacts/supervision/opl_current_control_state/latest.json` as observability/status projection; MAS consumes it for operator/status/read-model context and does not turn it into MAS runtime truth.
- `request_opl_stage_attempt(...)`, pause/stop/relaunch and orchestration persistence wording now separates MAS-facing intent / owner authorization / owner receipt / typed blocker / owner-route refs from OPL-owned provider pause/stop/relaunch, attempt hydration, queue/retry/dead-letter, worker liveness and current-control-state mutation.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Core entry positioning in `README.zh-CN.md`, `docs/project.md`, `docs/architecture.md`; controller boundary in `docs/runtime/control/controllers.md`; `docs/runtime/stage_route_handoff_standard.md` full file; stop/pause/relaunch/current-control-state sections in `docs/runtime/control/study_runtime_control_surface.md` and `docs/runtime/control/study_runtime_orchestration.md`; MAS docs-governance ledger entries for standard-agent direct/control boundary, stage-route handoff currentness and runtime-control owner-route/current-control-state. | `README.zh-CN.md`; `docs/project.md`; `docs/architecture.md`; `docs/runtime/control/controllers.md`; `docs/runtime/control/study_runtime_control_surface.md`; `docs/runtime/control/study_runtime_orchestration.md`; `docs/runtime/stage_route_handoff_standard.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Verification:

- MAS worktree/main verification: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor `finding_count=0`, active truth `pass`, missing=0, next-not-ready=0; MAS clean-runner CLI help for `med_autoscience.cli runtime`.
- MAS docs commits now on `origin/main`: `54aa77dd docs: reconcile MAS control handoff boundaries` and follow-up `f5b05e58 docs: clarify MAS tranche follow-up scope`.
- Current MAS tranche worktree/branch was removed after the docs commits were superseded/absorbed into `main`; unrelated external MAS source/test dirty files in the root checkout and the external `standard-agent-purity-clean-mas` worktree were left untouched.

Archived / tombstoned / deleted docs:

- none. The touched MAS files remain active entry/current-truth/support docs; this tranche corrected owner-boundary wording in place and did not prove physical deletion authorization.

Unreviewed docs:

- MAS paragraph-level runtime contract body coverage remains open for `docs/runtime/contracts/**`, especially `stage_route_contract.md`, `stage_surfaces.md`, `workspace_knowledge_and_literature_contract.md` and other long support bodies not covered by prior runtime-id/current-control tranches.
- MAS product/status/workbench and progress/domain-ref projection coverage remains open outside prior Portal/projection/App-workbench, inspection-package, runtime-binding and owner-route/control-boundary blocks.
- OPL full README/docs coverage still remains open outside the covered OPL chunks named in earlier ledger entries; exact remaining non-reference scope should be selected from the latest inventory before the next OPL tranche.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not call MAS CLI/MCP/product-entry/sidecar/controller shell a long-term generic capability owner. Keep it as direct path, migration input, diagnostic ref, generated/default caller target, domain handler target or minimal authority implementation.
- MAS must not claim OPL queue, attempt ledger, provider worker, retry/dead-letter, current-control-state, App/workbench shell or generic runtime lifecycle ownership through controller wording.
- Any future prose that treats `route_transition_contract`, `stage_graph_handoff`, descriptor parity, zero forbidden writes, provider completion or OPL runner pass as MAS owner receipt, publication-ready, submission-ready, artifact-ready, App release ready, physical delete authorization or domain completion is stale.
- Historical transport helper names such as `_resume_quest(...)`, `_relaunch_stopped_quest(...)`, `_pause_quest(...)` and daemon result remain retired provenance / diagnostic mapping / test-only patch-target context only.

Next tranche write scope:

- MAS paragraph-level coverage for bounded `docs/runtime/contracts/**` bodies such as `stage_route_contract.md`, `stage_surfaces.md`, or `workspace_knowledge_and_literature_contract.md`.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the Portal/projection/App-workbench and inspection-package blocks already covered.
- Or choose the next exact OPL non-reference uncovered body from the fresh coverage ledger and inventory.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 04:00 CST`
Tranche: `mas-runtime-stage-knowledge-contract-coverage`
State: `tranche_verified`

本轮覆盖 MAS runtime contracts 中的 stage route、generated stage surfaces、workspace knowledge / literature 三个长支撑文档，并吸收回 MAS `main`。目标是确认这些人读 support docs 与 MAS live YAML/source/contracts/tests 当前事实一致：canonical route truth 归 `agent/stages/stage_route_contract.yaml`，generated Markdown 不是 machine truth，workspace canonical literature / study reference context / quest-local materialization 不能混叠，stage memory closeout 只能提出 writeback 并经 router receipt / owner surface 决定接受。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、MAS docs-governance ledger and preceding runtime id / owner-route control ledger entries.
- MAS runtime docs: `docs/runtime/contracts/stage_route_contract.md`, `docs/runtime/contracts/stage_surfaces.md`, `docs/runtime/contracts/workspace_knowledge_and_literature_contract.md`.
- MAS machine/source refs: `agent/stages/stage_route_contract.yaml`, `contracts/stage_control_plane.json`, `contracts/generated_surface_handoff.json`, `contracts/functional_privatization_audit.json`, `contracts/test-lane-manifest.json`, `src/med_autoscience/stage_knowledge_contract.py`, `src/med_autoscience/controllers/stage_knowledge_plane.py`, `src/med_autoscience/controllers/workspace_literature.py`, `src/med_autoscience/runtime_protocol/workspace_literature_status.py`.
- CodeGraph context for stage knowledge packets, workspace literature and runtime workspace contract summaries.
- Focused test inventory: `tests/test_stage_route_contract.py`, `tests/test_stage_surface_contract.py`, `tests/test_stage_quality_contract.py`, `tests/test_stage_knowledge_plane.py`, `tests/test_stage_knowledge_entry_injection.py`, `tests/test_stage_knowledge_visibility.py`, `tests/test_workspace_literature.py`, `tests/test_cli_cases/stage_memory_cli_commands.py`, `tests/test_cli_cases/study_state_matrix_memory_writeback_receipts.py`, `tests/test_runtime_protocol_study_runtime_cases/test_owner_route_stage_knowledge_hydration.py`, `tests/product_entry_cases/action_catalog_parity_cases/stage_descriptor_cases.py`, and `tests/progress_portal_cases/test_stage_review_surface.py`.

Fresh semantic result:

- `stage_route_contract.md` remains a human-readable projection of `agent/stages/stage_route_contract.yaml`; the YAML still owns route ids, mode contracts, stage obligations, evidence/review rules, route-back logic and startup boundary rules.
- `stage_surfaces.md` is already marked as generated human-reading Markdown and points stage cards back to canonical route refs, stage knowledge packet, stage recall index, memory closeout packet, router receipt, evidence/review/controller decision refs and OPL read/dispatch-only boundaries.
- `workspace_knowledge_and_literature_contract.md` is aligned with source: workspace canonical literature is under `portfolio/research_memory/literature/*`, study reference context is study-owned, quest literature is working-copy materialization only, and stage closeout cannot bypass owner acceptance.
- No reviewed paragraph currently reintroduces retired default-runtime / legacy entrypoint wording, stale `opl_provider_backed_stage_runtime` machine id, MAS-owned generic runtime owner, publication-ready, submission-ready, artifact-ready or production-ready leakage.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/contracts/stage_route_contract.md`, `docs/runtime/contracts/stage_surfaces.md`, and `docs/runtime/contracts/workspace_knowledge_and_literature_contract.md`, plus source/contract/test inventory listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification / absorb:

- MAS commit `80b71cb2 docs: cover MAS stage knowledge contracts` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS worktree verification before absorb and OPL main ledger verification after edit: `git diff --check`, strict README/docs/contracts conflict-marker scan and OPL Doc Governance doctor all passed with `finding_count=0`.
- No source, contract schema, CLI/API or runtime behavior changed; this tranche did not add tests because it only records paragraph-level docs governance.

Archived / tombstoned / deleted docs:

- none. The reviewed MAS runtime contract files remain active support docs with distinct roles.

Unreviewed docs:

- MAS paragraph-level coverage remains open for other long support bodies under `docs/runtime/contracts/**`, especially `runtime_event_and_outer_loop_input_contract.md`, `durable_workflow_contract.md`, `runtime_boundary.md`, `runtime_core_convergence_and_controlled_cutover.md`, `runtime_backend_interface_contract.md`, `runtime_handle_and_durable_surface_contract.md`, and delivery/artifact/source adjacent contracts not covered by prior focused tranches.
- MAS product/status/workbench and progress/domain-ref projection coverage remains open outside prior Portal/projection/App-workbench, inspection-package, runtime-binding, owner-route/control-boundary and this stage/knowledge contract block.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat generated stage surface Markdown, stage graph hints, route contract readability, workspace literature registry presence, stage memory closeout packet, memory router receipt, provider projection or zero forbidden writes as MAS owner receipt, publication-ready, submission-ready, artifact-ready, App release ready, physical delete authorization, domain completion or production readiness.
- Quest-local literature materialization remains a working copy and must not be promoted to workspace canonical literature, study reference context, evidence authority, AI reviewer verdict or controller decision.
- Stage memory closeout remains proposed writeback plus router receipt; it must not bypass owner acceptance, evidence ledger, review ledger, controller decision or human gate.

Next tranche write scope:

- MAS paragraph-level coverage for another bounded `docs/runtime/contracts/**` group, preferably `runtime_event_and_outer_loop_input_contract.md` + `durable_workflow_contract.md`, or `runtime_boundary.md` + runtime backend / handle contracts if current owner wording drifts.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 04:28 CST`
Tranche: `mas-runtime-event-durable-workflow-contract-coverage`
State: `tranche_verified`

本轮覆盖 MAS runtime contracts 中的 runtime event / outer-loop input 与 durable workflow 两个长支撑文档，并吸收回 MAS `main`。目标是确认这些人读 support docs 与 MAS live source/contracts/tests 当前事实一致：OPL/current-control-state 持有 runtime event refs、attempt、retry/dead-letter、human-gate transport、provider liveness 和 repair projection；MAS 只消费 refs 并输出 domain authority refs、outer-loop judgment、owner receipt、typed blocker、runtime escalation 与 diagnostic blocker refs。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、MAS docs-governance ledger, `docs/active/mas-ideal-state-gap-plan.md`, and preceding runtime id / owner-route control / stage-knowledge ledger entries.
- MAS runtime docs: `docs/runtime/contracts/runtime_event_and_outer_loop_input_contract.md`, `docs/runtime/contracts/durable_workflow_contract.md`, with support reads of `docs/runtime/contracts/delivery_plane_contract_map.md`, `docs/runtime/control/study_runtime_control_surface.md`, and `docs/runtime/control/study_runtime_orchestration.md`.
- MAS machine/source refs: `src/med_autoscience/controllers/study_outer_loop.py`, `contracts/functional_privatization_audit.json`, `contracts/stage_control_plane.json`, and `contracts/test-lane-manifest.json`.
- Focused test inventory: `tests/test_durable_workflow_contract.py`, `tests/test_study_outer_loop.py`, and `tests/test_study_outer_loop_cases/controller_and_manifest_cases.py` runtime event, runtime escalation, supervisor tick freshness, retry budget and family human-gate cases.

Fresh semantic result:

- `runtime_event_and_outer_loop_input_contract.md` remains aligned with live outer-loop behavior: `runtime_event_ref` comes from OPL current_control_state / provider-backed stage runtime, MAS may consume and expose refs, and managed runtime inputs fail closed when runtime event identity, supervisor freshness or runtime escalation refs are missing or mismatched.
- `durable_workflow_contract.md` remains a human-readable support contract for pause/resume, replay, idempotent ticks, human-gate durability and retry budget semantics. The durable event log, attempt/retry/dead-letter/provider repair owner remains OPL; MAS writes only bounded projection, domain health diagnostic, runtime escalation and controller decision refs where its domain authority applies.
- Focused tests assert replay from `restore_point_id`, reconstruction of `retry_budget_remaining`, `retry_budget_decremented`, retry-budget exhaustion requiring `runtime_escalation_record.json`, duplicate tick idempotency, and durable human-gate decision requirements.
- No reviewed paragraph currently reintroduces MAS-owned generic queue, attempt ledger, worker liveness, runtime lifecycle scheduler, publication-ready, submission-ready, artifact-ready, App release ready, domain-ready or production-ready leakage.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/contracts/runtime_event_and_outer_loop_input_contract.md` and `docs/runtime/contracts/durable_workflow_contract.md`, plus source/contract/test inventory listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification / absorb:

- MAS commit `59b7033c docs: cover MAS runtime event contracts` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS worktree verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_durable_workflow_contract.py tests/test_study_outer_loop.py -q` read `68 passed`.
- Current MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-runtime-event-contracts-coverage-20260526` and branch `codex/mas-runtime-event-contracts-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. The reviewed MAS runtime contract files remain active support docs with distinct roles.

Unreviewed docs:

- MAS paragraph-level coverage remains open for other long support bodies under `docs/runtime/contracts/**`, especially `runtime_boundary.md`, `runtime_core_convergence_and_controlled_cutover.md`, `runtime_backend_interface_contract.md`, `runtime_handle_and_durable_surface_contract.md`, `agent_runtime_interface.md`, and delivery/artifact/source adjacent contracts not covered by prior focused tranches.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered Portal/projection/App-workbench, inspection-package, runtime-binding, owner-route/control-boundary, stage/knowledge and this runtime-event/durable-workflow block.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat missing or fallback `runtime_event_ref`, stale supervisor tick, runtime escalation, retry budget exhaustion, human-gate signal, domain health diagnostic, OPL provider closeout, queue completion or current_control_state projection as MAS domain completion, publication-ready, submission-ready, artifact-ready, quality-ready, App release ready or production-ready.
- `runtime_escalation_record.json`, `domain_health_diagnostic`, owner-route handoff refs and typed blockers are MAS diagnostic / blocker outputs; they must not become MAS-owned retry/dead-letter, provider repair, worker liveness, generic resume or runtime lifecycle truth.
- Durable human gate remains a decision ref with scope and evidence refs; it must not be rewritten as chat permission, executor self-approval, controller shortcut or automatic publication/quality override.

Next tranche write scope:

- MAS paragraph-level coverage for another bounded `docs/runtime/contracts/**` group, preferably `runtime_boundary.md` with runtime backend / handle contracts, or delivery/artifact/source adjacent contracts if owner wording drifts.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 04:30 CST`
Tranche: `mas-runtime-boundary-backend-handle-contract-coverage`
State: `tranche_verified`

本轮覆盖 MAS runtime contract 中的 runtime owner boundary、backend interface、execution handle / durable surface 和 agent runtime interface 四个长支撑文档，并吸收回 MAS `main`。目标是确认这些人读 support docs 与 live source/contracts/tests 当前事实一致：OPL provider-backed stage runtime 持有默认 generic runtime owner、provider attempt、queue、wakeup、retry/dead-letter、worker residency、transition runner、provider transport 与 current-control-state；MAS 只承担 domain authority refs、DomainIntent / owner route、owner receipt、typed blocker、artifact/source/quality refs、guarded apply receipt、diagnostic explanation 和研究治理边界。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、MAS docs-governance ledger, `docs/status.md`, `docs/architecture.md`, `docs/active/mas-ideal-state-gap-plan.md`, and preceding runtime id / owner-route control / stage-knowledge / runtime-event ledger entries.
- MAS runtime docs: `docs/runtime/contracts/runtime_boundary.md`, `docs/runtime/contracts/runtime_backend_interface_contract.md`, `docs/runtime/contracts/runtime_handle_and_durable_surface_contract.md`, `docs/runtime/contracts/agent_runtime_interface.md`.
- MAS machine/source refs: `contracts/modules/runtime/module_contract.yaml`, `contracts/modules/controller_charter/module_contract.yaml`, `contracts/functional_privatization_audit.json`, `contracts/action_catalog.json`, `contracts/production_acceptance/mas-production-acceptance.json`, `src/med_autoscience/opl_runtime_contract.py`, `src/med_autoscience/runtime_protocol/study_runtime.py`, `src/med_autoscience/controllers/opl_runtime_refs.py`, `src/med_autoscience/runtime_protocol/domain_authority_refs_index.py`, `src/med_autoscience/action_catalog.py`.
- CodeGraph context for runtime owner refs, `OplRuntimeRefs`, default runtime operation contract and control intent identity.
- Focused test inventory: `tests/test_opl_runtime_contract.py`, `tests/test_runtime_protocol_study_runtime.py`, `tests/product_entry_cases/repo_shell_runtime_assertions.py`, `tests/test_opl_family_persistence_adapter.py`, `tests/product_entry_cases/manifest_launch_and_task_intake.py`, `tests/owner_route_reconcile_cases/owner_route_test_helpers.py`, and `tests/test_control_plane_generalization_cases/test_runtime_facts.py`.

Fresh semantic result:

- `runtime_boundary.md` remains aligned with current owner split: OPL provider-backed stage runtime owns generic runtime core; MAS owns domain authority refs and owner surfaces; product projection only reads OPL current-control-state plus MAS domain refs.
- `runtime_backend_interface_contract.md` is aligned with live machine contract: `runtime_substrate/runtime_ref=opl_hosted_stage_runtime`, `runtime_engine_id=opl-hosted-stage-runtime`, `domain_runtime_adapter_id=mas_domain_intent_adapter`, `runtime_backend_role=mas_domain_owner_receipt_adapter`, `runtime_backend_is_generic_owner=false`, `default_runtime_backend_is_opl_provider_owned=true`, and `external_mds_required_for_default_operation=false`.
- `runtime_handle_and_durable_surface_contract.md` is aligned with source/tests: `program_id`, `study_id`, `quest_id` and `active_run_id` stay separate; `runtime_binding.yaml` writes current OPL runtime and MAS domain-intent adapter metadata; `mas_runtime_core` and `hermes` runtime refs are rejected as current OPL runtime refs.
- `agent_runtime_interface.md` is aligned with current product-entry / agent runtime surfaces: default executor remains `Codex CLI`, OPL is default generic runtime owner, MAS is domain entry / authority owner, and MDS / Hermes wording stays in provenance / explicit diagnostic / explicit proof-lane context.
- No reviewed paragraph currently reintroduces MAS-owned generic runtime owner, provider backend, runtime backend registry, hidden MDS fallback, Hermes default substrate, publication-ready, submission-ready, artifact-ready, App release ready, domain-ready or production-ready leakage.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/contracts/runtime_boundary.md`, `docs/runtime/contracts/runtime_backend_interface_contract.md`, `docs/runtime/contracts/runtime_handle_and_durable_surface_contract.md`, and `docs/runtime/contracts/agent_runtime_interface.md`, plus source/contract/test inventory listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification / absorb:

- MAS commit `6237c372 docs: cover MAS runtime boundary contracts` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS worktree verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- No source, contract schema, CLI/API or runtime behavior changed; this tranche did not add tests because it only records paragraph-level docs governance.

Archived / tombstoned / deleted docs:

- none. The reviewed MAS runtime contract files remain active support docs with distinct roles.

Unreviewed docs:

- MAS paragraph-level coverage remains open for `docs/runtime/contracts/runtime_core_convergence_and_controlled_cutover.md` and delivery/artifact/source-adjacent runtime contracts not covered by prior focused tranches.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered Portal/projection/App-workbench, inspection-package, runtime-binding, owner-route/control-boundary, stage/knowledge, runtime-event/durable-workflow and runtime-boundary/backend/handle blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat `mas_runtime_core`, `runtime_backend_id`, local scheduler, LaunchAgent, MDS daemon, Hermes gateway cron, `Codex-default host-agent runtime`, product-entry shell, sidecar, status or workbench helpers as current MAS-owned generic runtime owner or provider backend.
- MAS durable refs/projections such as `runtime_binding.yaml`, `progress_projection`, `domain_health_diagnostic`, `runtime_escalation_record.json`, `controller_decisions/latest.json`, runtime health snapshots and domain authority refs must not be promoted into OPL provider attempt truth, publication quality verdict, artifact mutation authorization, App release readiness or production readiness.
- Explicit MDS / Hermes / legacy local references remain source provenance, historical fixture, explicit archive import, backend audit, diagnostic adapter or proof-lane context only.

Next tranche write scope:

- MAS paragraph-level coverage for `docs/runtime/contracts/runtime_core_convergence_and_controlled_cutover.md`, or delivery/artifact/source-adjacent runtime contracts if owner wording drifts.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 04:43 CST`
Tranche: `mas-runtime-core-convergence-contract-coverage`
State: `tranche_verified`

本轮覆盖 MAS runtime contract 中的 runtime core convergence / controlled cutover 支撑文档，并吸收回 MAS `main`。目标是确认该文档继续把 MAS functional monolith closeout 读作 default independence，而不是旧 MDS resident daemon、WebUI、workspace-local service、MAS local scheduler、runtime lifecycle SQLite、turn runner 或 `mas_runtime_core` 的 full behavior equivalence 或当前 runtime owner 复活。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、MAS docs-governance ledger, `docs/status.md`, `docs/architecture.md`, `docs/active/mas-ideal-state-gap-plan.md`, and preceding runtime owner / runtime-event / runtime-boundary ledger entries.
- MAS runtime / parity docs: `docs/runtime/contracts/runtime_core_convergence_and_controlled_cutover.md` and `docs/references/mds-parity/mds_behavior_equivalence_gap_matrix.md`.
- MAS machine/source refs: `contracts/functional_privatization_audit.json`, `contracts/test-lane-manifest.json`, `contracts/production_acceptance/mas-production-acceptance.json`, `contracts/runtime/legacy-active-path-tombstones.json`, `src/med_autoscience/opl_runtime_contract.py`, `src/med_autoscience/controllers/mds_capability_parity_parts/behavior_equivalence.py`, `src/med_autoscience/controllers/mds_capability_parity_parts/paper_progress_degradation.py`, `src/med_autoscience/controllers/owner_route_reconcile_parts/scan_output.py`, and `src/med_autoscience/controllers/workspace_monolith_migration.py`.
- Focused test inventory: `tests/test_mds_capability_parity.py`, `tests/test_opl_runtime_contract.py`, `tests/test_module_boundary_audit.py`, `tests/test_architecture_owner_boundary.py`, and study-progress runtime owner naming guard cases.

Fresh semantic result:

- `runtime_core_convergence_and_controlled_cutover.md` remains aligned with current contracts: default operation no longer requires external MDS repo, daemon, runtime root or WebUI; MDS is source provenance, historical fixture, explicit archive import, backend audit and parity oracle reference only.
- The document separates `default_independence` / `functional_monolith_completion=landed` from full resident daemon behavior equivalence. The MDS behavior-equivalence matrix remains the owner for retained differences such as resident WebSocket/session continuity, connector background delivery, in-memory session API and interactive console parity.
- OPL provider-backed stage runtime / OPL scheduler replacement remains the default generic runtime and cadence owner. MAS keeps domain authority refs, owner receipt, typed blocker, artifact/source/quality refs, paper-progress SLO explanation and diagnostic projection.
- MAS local scheduler / LaunchAgent and Hermes gateway cron are only explicit legacy diagnostic / cleanup / provenance contexts, not current MAS active scheduler options or default runtime truth.
- No reviewed paragraph currently reintroduces MDS daemon/WebUI/default backend dependency, workspace-local launchd/systemd/cron/docker service, MAS-owned generic runtime owner, `mas_runtime_core` active adapter, publication-ready, submission-ready, artifact-ready, App release ready, domain-ready or production-ready leakage.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/contracts/runtime_core_convergence_and_controlled_cutover.md`, plus support read of `docs/references/mds-parity/mds_behavior_equivalence_gap_matrix.md` and source/contract/test inventory listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification / absorb:

- MAS commit `2704046e docs: cover MAS runtime core convergence` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS worktree verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_mds_capability_parity.py tests/test_opl_runtime_contract.py tests/test_module_boundary_audit.py tests/test_architecture_owner_boundary.py -q` read `18 passed`.
- Current MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-runtime-core-convergence-coverage-20260526` and branch `codex/mas-runtime-core-convergence-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. The reviewed MAS runtime contract file remains an active runtime-support / behavior-equivalence reference bridge with a distinct role.

Unreviewed docs:

- MAS paragraph-level coverage remains open for delivery/artifact/source-adjacent runtime contracts not covered by prior focused tranches.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered Portal/projection/App-workbench, inspection-package, runtime-binding, owner-route/control-boundary, stage/knowledge, runtime-event/durable-workflow, runtime-boundary/backend/handle and this runtime-core-convergence block.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat `functional_monolith_completion=landed`, default independence, Portal/Live Console read-only parity, behavior-equivalence purpose equivalence or zero external-MDS requirement as full resident-daemon equivalence, domain completion, production readiness or App release readiness.
- MDS resident daemon, WebUI, connector background delivery, in-memory session API, workspace-local launchd/systemd/cron/docker service, MAS local scheduler, Hermes gateway cron and `mas_runtime_core` can appear only as historical fixture, backend audit, parity oracle, explicit diagnostic / cleanup adapter or tombstone/provenance context.
- Behavior-equivalence matrix gaps should remain parity / UX / evidence candidates. They must not reopen MDS as default runtime owner or let UI/connector/old daemon surfaces bypass MAS study truth, publication gate, quality authority, artifact authority or OPL current-control-state.

Next tranche write scope:

- MAS paragraph-level coverage for delivery/artifact/source-adjacent runtime contracts, or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 05:05 CST`
Tranche: `mas-artifact-baseline-retention-contract-coverage`
State: `tranche_verified`

本轮覆盖 MAS delivery / artifact / source-adjacent runtime contract 中的 artifact retention、canonical artifact 和 baseline refresh 支撑文档，并吸收回 MAS `main`。目标是确认这些人读 support docs 与 MAS live source/contracts/tests 当前事实一致：MAS 可以产出 artifact authority refs、canonical rebuild proof、read-only retention candidate、baseline refresh obligation 和 typed blocker；OPL 持有 generic cleanup / restore / retention shell、provider stage runtime、queue / attempt / retry / dead-letter 和 App/workbench shell。

Fresh live truth inputs:

- MAS `AGENTS.md`、`TASTE.md`、MAS docs-governance ledger, `docs/active/mas-ideal-state-gap-plan.md`, and preceding runtime-owner / runtime-core-convergence coverage entries.
- MAS runtime/support docs: `docs/runtime/contracts/artifact_retention_operations_contract.md`, `docs/runtime/contracts/canonical_artifact_contract.md`, `docs/runtime/contracts/baseline_refresh_contract.md`, with support reads of `docs/runtime/contracts/delivery_plane_contract_map.md` and `docs/source/README.md`.
- MAS machine/source refs: `contracts/functional_privatization_audit.json`, `contracts/test-lane-manifest.json`, `contracts/stage_control_plane.json`, `src/med_autoscience/controllers/artifact_retention_operations_plan.py`, `src/med_autoscience/controllers/artifact_lifecycle_operations_report.py`, `src/med_autoscience/controllers/storage_governance_policy_kernel.py`, `src/med_autoscience/controllers/canonical_artifact_contract.py`, `src/med_autoscience/stage_knowledge_contract.py`, and `src/med_autoscience/overlay/templates/medical-research-baseline.block.md`.
- Focused test inventory: `tests/test_artifact_retention_operations_plan.py`, `tests/test_storage_governance_policy_kernel.py`, `tests/test_canonical_artifact_contract.py`, `tests/test_body_free_evidence_refs_scaleout.py`, `tests/test_domain_entry.py::test_domain_entry_rejects_control_plane_cleanup_apply`, `tests/test_installed_mcp_smoke.py`, `tests/product_entry_cases/authority_operation_manifest.py`, and `tests/test_stage_surface_contract.py`.

Fresh semantic result:

- `artifact_retention_operations_plan` and `artifact_lifecycle_report` remain read-only planning/report surfaces. They can mark `delete_safe_cache` as a candidate and project restore-contract gaps, but public CLI, domain entry, product-entry command contracts and installed MCP must not expose cleanup apply commands. Physical cleanup / restore / retention apply belongs to the OPL owner shell after explicit parity and receipt gates.
- `canonical_artifact_contract` and `artifact_rebuild_integrity_contract` remain MAS artifact authority support. `manuscript/current_package/`, `artifacts/final/`, `current_package.zip` and `submission_minimal/` are derived projections / handoff surfaces, never edit source, quality authority or submission authorization root; rebuild proof requires source refs, fingerprints, quality decision ref, controller decision ref and generated artifact role.
- `baseline_refresh_contract` is currently enforced as a route / stage policy obligation through the `baseline` stage inputs, memory closeout obligations and `medical-research-baseline.block.md`, not as an independent public CLI or artifact mutation command. Comparator, cohort, endpoint, Table 1, external-validation or manuscript-facing baseline changes need durable reason, affected surface list, verification refs and route / human-gate decision before becoming authoritative.
- Verification exposed stale smoke-test expectation around installed MCP tool naming: current MCP registry exposes `authority_operations`; old `product_entry` tool is not active. The smoke test was updated to assert the current tool without resurrecting an old tool-name bypass.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/contracts/artifact_retention_operations_contract.md`, `docs/runtime/contracts/canonical_artifact_contract.md`, and `docs/runtime/contracts/baseline_refresh_contract.md`, plus support read of `delivery_plane_contract_map.md`, `docs/source/README.md`, and source/contract/test inventory listed above. | `docs/docs_portfolio_consolidation.md`; `docs/runtime/contracts/artifact_retention_operations_contract.md`; `docs/runtime/contracts/baseline_refresh_contract.md`; `tests/test_installed_mcp_smoke.py` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification / absorb:

- MAS commit `bf578b47 docs: cover MAS artifact lifecycle contracts` was fast-forwarded into MAS `main`.
- MAS worktree verification before absorb: `git diff --check`; strict README/docs/contracts/tests conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest for artifact retention, lifecycle report, storage governance, canonical artifact, baseline/stage surface, product-entry authority manifest, installed MCP smoke and domain-entry cleanup non-exposure read `58 passed in 13.82s`.

Archived / tombstoned / deleted docs:

- none. The reviewed MAS runtime contract files remain active support docs with distinct roles; stale apply-command wording and stale MCP smoke expectation were rewritten in place.

Unreviewed docs:

- MAS paragraph-level coverage remains open for `docs/runtime/contracts/standard_domain_agent_skeleton.md` beyond quick support read.
- MAS source-support docs outside `docs/source/README.md` and delivery/medical-display documents that mention baseline refresh or artifact lifecycle remain outside this tranche.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not say MAS exposes `control-plane-cleanup-apply` / `control-plane-safe-cache-cleanup-apply`, performs physical cleanup from retention reports, or treats `delete_safe_cache` as already applied unless a new OPL owner shell and MAS receipt parity are proven.
- Future MAS prose must not treat derived packages, DOCX/PDF/zip, `current_package`, `submission_minimal`, inspection packages, display packs, provider completion or executor logs as edit source, quality authority, source readiness verdict, publication-ready, submission-ready or artifact mutation authorization.
- Baseline refresh remains a stage-policy contract. A future materializer must produce durable refresh record / blocker / route refs; it must not silently overwrite comparator, Table 1, display pack, publication eval or submission package.

Next tranche write scope:

- MAS paragraph-level coverage for remaining `docs/runtime/contracts/standard_domain_agent_skeleton.md` and source/delivery support docs that mention source truth, artifact lifecycle, baseline refresh or standard-domain-agent anchors.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 05:38 CST`
Tranche: `mas-standard-skeleton-source-delivery-coverage`
State: `tranche_verified`

本轮覆盖 MAS standard-domain-agent skeleton 支撑文档以及 source / delivery 目录索引中会影响 source truth、artifact authority、generated surface 和 OPL/MAS owner 边界的段落，并更新 MAS docs-governance ledger。目标是把 repo-source physical anchor、body-free locator、source readiness / artifact authority gate 和 generated surface handoff 读回 live contracts/source/tests：MAS 持有 `agent/` 语义包、source/artifact authority gate、owner receipt、typed blocker 和 minimal authority functions；OPL 持有 generated CLI/MCP/Skill/product-entry/status/workbench shell、generic locator/projection/workbench 和 provider/runtime transport。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, MAS docs-governance ledger, `docs/active/mas-ideal-state-gap-plan.md`, `docs/references/positioning/mas_ideal_state.md`, and preceding artifact / baseline / retention coverage ledger.
- MAS docs: `docs/runtime/contracts/standard_domain_agent_skeleton.md`, `docs/source/README.md`, `docs/delivery/README.md`.
- MAS machine/source refs: `agent/standard-domain-agent-anchor.json`, `contracts/runtime/standard-domain-agent-anchor.json`, `runtime/artifact_locator/workspace-runtime-artifact-root.locator.json`, `contracts/pack_compiler_input.json`, `contracts/generated_surface_handoff.json`, `contracts/functional_privatization_audit.json`, `contracts/production_acceptance/mas-production-acceptance.json`, `src/med_autoscience/controllers/opl_provider_ready_adapter_parts/skeleton_mapping.py`, `src/med_autoscience/controllers/opl_provider_ready_adapter.py`, and product-entry manifest assembly.
- CodeGraph context for `build_standard_domain_agent_skeleton_surface`, physical skeleton layout audit, product-entry manifest projection and locator boundary.
- Focused test inventory: `tests/test_dev_preflight_contract.py`, `tests/test_opl_family_persistence_adapter.py`, `tests/test_product_entry.py` skeleton / workspace runtime evidence receipt cases, `tests/test_opl_standard_pack.py`, `tests/test_body_free_evidence_refs_scaleout.py`, and `tests/test_real_paper_autonomy_soak_inventory_cases/test_canary_body_free_packets.py`.

Fresh semantic result:

- `standard_domain_agent_skeleton.md` remains active runtime support. Its opening wording was tightened so existing callable/product/status/workbench surfaces are migration inputs and direct-path bridges, not long-term MAS-owned generated shells.
- Standard skeleton machine truth reads `mapping_mode=repo_source_physical_anchors_landed`, `repo_tracks_real_workspace_artifacts=false`, `repo_source_boundary.required_dirs=[agent, contracts, runtime, docs]`, `repo_source_boundary.forbidden_dirs=[artifacts]`, `artifact_roots_are_locators=true`, and default new surface slots under `agent/stages`, `agent/prompts`, `agent/skills`, `agent/knowledge`, `agent/quality_gates` and `contracts/runtime/*`.
- `runtime/artifact_locator/workspace-runtime-artifact-root.locator.json` remains locator-only. It can name workspace artifact roots, owner-route receipt refs, stage review indexes, publication-eval refs and controller-decision refs; it cannot move artifact bodies into repo source, authorize source readiness, mark publication quality, update `current_package`, or replace owner receipt / typed blocker evidence.
- `docs/source/README.md` and `docs/delivery/README.md` remain aligned as thin support indexes: Semantic Scholar remains read-model-only and cannot authorize readiness/verdicts; delivery support stays MAS-owned while generic artifact lifecycle primitive remains an OPL upscope candidate.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/contracts/standard_domain_agent_skeleton.md`, `docs/source/README.md`, and `docs/delivery/README.md`, plus live contract/source/test evidence listed above. | `docs/docs_portfolio_consolidation.md`; `docs/runtime/contracts/standard_domain_agent_skeleton.md`; `docs/source/README.md`; `docs/delivery/README.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification:

- MAS worktree verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL ledger worktree verification: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- No source, contract schema, CLI/API or runtime behavior changed; this tranche did not add tests because it only records docs/support boundary currentness.

Archived / tombstoned / deleted docs:

- none. The reviewed MAS files remain active support docs with distinct roles; stale generated-facade ownership wording was rewritten in place.

Unreviewed docs:

- MAS source-support documents outside `docs/source/README.md`, including `docs/references/workspace/**` and source-readiness / study-workflow policy docs, remain outside this tranche.
- MAS delivery docs outside `docs/delivery/README.md` and the already-covered inspection/artifact/baseline blocks remain outside this tranche, including medical-display support docs that mention artifact lifecycle, source truth or package authority.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat repo-source anchors, existing direct-path callables, product/status/workbench wrappers or generated docs as MAS-owned generated shell ownership. They are descriptor / locator / receipt / typed-blocker / authority-function refs until OPL generated/default caller cutover proves replacement and no-active-caller deletion gates.
- Future MAS prose must not treat source provider ranking, citation count, abstract match, cache hit, package freshness, file presence, generated-interface readiness, test pass or provider completion as source readiness, publication quality, submission readiness, artifact mutation authorization or `current_package` update.
- `runtime/artifact_locator` and body-free evidence packets must stay locator/ref/receipt/blocker surfaces. Artifact body, memory body, study truth body or quality verdict body entering repo source or OPL projection remains stale pollution.

Next tranche write scope:

- MAS paragraph-level coverage for source references under `docs/references/workspace/**` and source-readiness / study-workflow policy docs, or delivery / medical-display docs that mention artifact lifecycle, source truth or package authority.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 05:33 CST`
Tranche: `mas-workspace-source-reference-coverage`
State: `tranche_verified`

本轮覆盖 MAS workspace/source reference 中会影响 workspace lifecycle、source truth、artifact locator、root Git retirement、Hermes/MDS retained-role 和 OPL/MAS owner split 的段落，并吸收回 MAS `main`。目标是确认 workspace bootstrap / architecture prose 与 live contracts/source/tests 当前事实一致：MAS 持有 source readiness、study truth、quality gate、artifact authority、owner receipt 和 typed blocker；OPL 持有 generic workspace/file lifecycle、artifact locator、restore/retention shell、provider runtime、queue/attempt/retry-dead-letter 和 App/operator projection shell。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, MAS docs-governance ledger, `docs/active/mas-ideal-state-gap-plan.md`, `docs/references/positioning/mas_ideal_state.md`, and preceding artifact / runtime / standard skeleton coverage ledger.
- MAS docs: `docs/references/workspace/disease_workspace_quickstart.md`, `docs/references/workspace/workspace_architecture.md`, `docs/source/README.md`, `docs/policies/study-workflow/workspace_autoscience_rules.md`, `docs/policies/study-workflow/stage_led_research_autonomy.md`, and `docs/policies/study-workflow/data_asset_management.md`.
- MAS machine/source refs: `contracts/workspace_lifecycle_policy.json`, `contracts/functional_privatization_audit.json`, `contracts/pack_compiler_input.json`, `contracts/stage_control_plane.json`, `profiles/workspace.profile.template.toml`, `src/med_autoscience/controllers/workspace_init.py`, `src/med_autoscience/controllers/workspace_init_parts/profile_config.py`, `src/med_autoscience/controllers/workspace_init_parts/retired_entries.py`, `src/med_autoscience/controllers/runtime_storage_maintenance.py`, `src/med_autoscience/controllers/storage_governance_policy_kernel.py`, `src/med_autoscience/controllers/workspace_literature.py`, and `src/med_autoscience/profiles.py`.
- CodeGraph context for workspace bootstrap/profile/storage/source boundary symbols.
- Focused test inventory: `tests/test_workspace_init.py`, `tests/test_workspace_init_cases/workspace_creation.py`, `tests/test_workspace_init_cases/managed_script_bindings.py`, `tests/test_runtime_storage_maintenance.py`, `tests/test_profiles.py`, `tests/test_opl_runtime_contract.py`, and `tests/test_stage_surface_contract.py`.

Fresh semantic result:

- `disease_workspace_quickstart.md` remains active workspace bootstrap reference. Its machine boundary and lifecycle paragraphs were tightened so SQLite / ledger / manifest surfaces are durable refs/projections, not MAS generic lifecycle ownership.
- `workspace_architecture.md` remains active workspace architecture support. Its retained workspace shape still uses `runtime/quests`, `runtime/archives`, `runtime/restore_index`, `artifacts/runtime`, `ops/medautoscience` and `ops/mas`, while root Git and quest Git remain retired from active truth.
- Hermes is only an optional external executor adapter / proof lane / diagnostic / historical reference, not default outer runtime substrate or scheduler owner. MDS / DeepScientist remains source provenance, historical fixture, explicit archive import, backend audit, upstream intake or parity oracle reference only.
- `docs/source/README.md` and reviewed study-workflow policies remain aligned: source provider readiness, literature records, data asset registry, ToolUniverse output, workspace memory or quest-local materialization cannot authorize source readiness verdict, publication quality, submission readiness, artifact mutation, `current_package` update or controller decision.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/references/workspace/disease_workspace_quickstart.md` and `docs/references/workspace/workspace_architecture.md`, plus support read of source index / study-workflow policies and source/contract/test inventory listed above. | `docs/docs_portfolio_consolidation.md`; `docs/references/workspace/disease_workspace_quickstart.md`; `docs/references/workspace/workspace_architecture.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification / absorb:

- MAS commit `92334f0c docs: cover MAS workspace source references` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS worktree verification before absorb: `git diff --check`; strict README/docs/contracts/tests conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_workspace_init.py tests/test_runtime_storage_maintenance.py tests/test_profiles.py tests/test_opl_runtime_contract.py tests/test_stage_surface_contract.py -q` read `79 passed in 21.24s`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-workspace-source-docs-coverage-20260526` and branch `codex/mas-workspace-source-docs-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. The reviewed MAS files remain active support docs with distinct roles; stale lifecycle / runtime owner wording was rewritten in place.

Unreviewed docs:

- Source-readiness policy and stage workflow docs were read as support, but full paragraph-level governance remains open for all `docs/policies/study-workflow/*.md` outside the source/workspace owner-boundary sections listed above.
- MAS delivery / medical-display docs outside the already-covered inspection, artifact/baseline/retention and delivery index blocks remain open when they mention artifact lifecycle, source truth, package authority or display-pack authority.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat runtime lifecycle SQLite, lifecycle ledgers, storage audit, root Git retirement, restore index, artifact locator, provider completion or OPL read model as MAS-owned generic lifecycle authority.
- Future MAS prose must not write Hermes, MAS `local` adapter, LaunchAgent, `mas_runtime_core`, MDS/DeepScientist daemon, workspace-local service or root/quest Git back into default runtime owner, scheduler owner, active adapter, diagnostic fallback or compatibility alias.
- Future MAS prose must not treat source provider ranking, citation count, abstract match, ToolUniverse output, data asset registry, workspace literature, quest-local cache, file presence, package freshness, test pass or provider completion as source readiness, publication quality, submission readiness, artifact mutation authorization or `current_package` update.

Next tranche write scope:

- MAS paragraph-level coverage for remaining study-workflow source-readiness / data-asset policy docs, or delivery / medical-display docs that mention artifact lifecycle, source truth, package authority or display-pack authority.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 05:44 CST`
Tranche: `mas-workspace-profile-source-policy-correction`
State: `tranche_verified`

本轮在 MAS workspace/source reference coverage 之后补齐 residual profile/runtime wording drift，并吸收回 MAS `main`。目标是把 MAS workspace architecture、profile template 和 data-asset policy 对齐当前 live profile/runtime/source truth：active profile field 是 `opl_runtime_ref`，默认值是 `opl_hosted_stage_runtime`，runtime engine id 是 `opl-hosted-stage-runtime`；OPL/Temporal provider-backed 是 owner/topology 语义；Hermes 只作显式非默认 executor adapter、proof lane、diagnostic 或 history reference；ToolUniverse 只作外部工具适配层，不能替代 MAS source readiness、study truth、quality gate、artifact authority 或 OPL provider/runtime owner。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, preceding runtime-id / standard skeleton / workspace-source coverage entries.
- MAS docs/templates: `docs/references/workspace/workspace_architecture.md`, `docs/policies/study-workflow/data_asset_management.md`, `profiles/workspace.profile.template.toml`, with support reads of `docs/source/README.md`, `docs/references/workspace/disease_workspace_quickstart.md`, `docs/runtime/contracts/workspace_knowledge_and_literature_contract.md`, and `docs/policies/study-workflow/workspace_autoscience_rules.md`.
- MAS machine/source refs: `src/med_autoscience/profiles.py`, `src/med_autoscience/opl_runtime_contract.py`, `src/med_autoscience/runtime_protocol/study_runtime.py`, `src/med_autoscience/runtime_protocol/workspace_literature_status.py`, `src/med_autoscience/stage_knowledge_contract.py`, `contracts/functional_privatization_audit.json`, `contracts/test-lane-manifest.json`, and `contracts/stage_control_plane.json`.
- Focused test evidence: MAS `tests/test_profiles.py` read `17 passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Focused correction read of `workspace_architecture.md` profile contract section, `data_asset_management.md` ToolUniverse principle, `profiles/workspace.profile.template.toml` Hermes comments, plus support reads listed above. | `docs/docs_portfolio_consolidation.md`; `docs/references/workspace/workspace_architecture.md`; `docs/policies/study-workflow/data_asset_management.md`; `profiles/workspace.profile.template.toml` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Verification / absorb:

- MAS commit `153f0dcc docs: align MAS workspace profile references` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS verification before absorb: `git diff --check`; strict README/docs/profiles conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; `scripts/run-pytest-clean.sh tests/test_profiles.py -q` read `17 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-source-workspace-support-coverage-20260526` and branch `codex/mas-source-workspace-support-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. The changed MAS docs and template remain active support/template surfaces; this was current wording correction, not no-active-caller retirement.

Unreviewed docs:

- Same as the preceding MAS workspace/source reference coverage entry: full paragraph-level governance remains open for other `docs/policies/study-workflow/*.md` files, delivery/medical-display docs with artifact/source/package authority claims, MAS product/status/workbench and progress/domain-ref projection shell, and OPL series coverage outside MAS.

Remaining stale / retire candidates:

- Future prose must not write `managed_runtime_backend_id` or `opl_provider_backed_stage_runtime` as current workspace profile machine truth; use `opl_runtime_ref=opl_hosted_stage_runtime` for profile/runtime ref identity and reserve OPL/Temporal provider-backed wording for owner/topology.
- Future prose must not write Hermes as default outer runtime substrate, default scheduler owner or required workspace bootstrap dependency unless it is explicitly history/provenance.
- Future prose must not use ToolUniverse, data asset registry, workspace literature, provider output or test pass as source readiness verdict, publication quality verdict, artifact mutation authority, `current_package` freshness proof or OPL provider completion.

Next tranche write scope:

- MAS paragraph-level coverage for remaining study-workflow source-readiness / data-asset policy docs, or delivery / medical-display docs that mention artifact lifecycle, source truth, package authority or display-pack authority.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 06:18 CST`
Tranche: `mas-study-workflow-policy-authority-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/policies/study-workflow/*.md` study workflow policy bundle，并吸收回 MAS `main`。目标是确认 stage-led autonomy、publication route memory、data asset、bounded analysis、route contract、submission/revision 和 workspace autoscience 摘要都按 MAS owner boundary 读取：policy / route memory / data asset / workspace literature / ToolUniverse / OPL projection 只能提供 stage context、evidence input、diagnostic、locator、receipt refs 或 route-back 线索；source readiness、publication quality、submission readiness、artifact mutation、`current_package` 更新、domain ready 和 controller decision replacement 仍归 MAS owner surface、AI-first gate、owner receipt 或 typed blocker。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/references/positioning/mas_ideal_state.md`, MAS docs-governance ledger, and preceding workspace/source policy coverage entries.
- MAS policy docs: all Markdown files under `docs/policies/study-workflow/`: `README.md`, `bounded_analysis_frontier_policy.md`, `data_asset_management.md`, `publication_route_memory_policy.md`, `publication_route_memory_library.md`, `research_route_bias_policy.md`, `stage_led_research_autonomy.md`, `study_archetypes.md`, `study_route_contract.md`, `submission_revision_operating_contract.md`, and `workspace_autoscience_rules.md`.
- MAS machine/source refs: `contracts/pack_compiler_input.json`, `contracts/stage_control_plane.json`, `agent/knowledge/source_readiness_and_artifact_authority.md`, `agent/knowledge/publication_route_memory.md`, `agent/knowledge/medical_research_truth.md`, `agent/stages/stage_route_contract.yaml`, `src/med_autoscience/stage_knowledge_contract.py`, `src/med_autoscience/controllers/workspace_literature.py`, `src/med_autoscience/policies/research_route_bias.py`, and data-asset controller surfaces.
- CodeGraph context for workspace literature, literature records, publication route memory, data assets and stage knowledge/source readiness boundaries.
- Focused test evidence: MAS focused pytest for stage surface / stage knowledge / workspace literature / data assets / data asset gate / stage route assets read `73 passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all `docs/policies/study-workflow/*.md` Markdown policy files listed above, plus live contract/source/test evidence listed above. | `docs/docs_portfolio_consolidation.md`; `docs/policies/study-workflow/workspace_autoscience_rules.md`; `docs/policies/study-workflow/bounded_analysis_frontier_policy.md`; `docs/policies/study-workflow/study_route_contract.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `publication_route_memory_policy.md` and `publication_route_memory_library.md` remain aligned: route-memory prose is advisory natural-language experience for Codex-led stage reasoning; workspace packs, inventories, seed fixtures and OPL/Aion projections are locator/index/receipt surfaces; controller decision, publication quality, memory accept/reject and artifact/source authority remain MAS owner surfaces.
- `stage_led_research_autonomy.md`, `study_archetypes.md` and `research_route_bias_policy.md` remain aligned: stage autonomy and first-generation route bias preserve exploratory reasoning and route context without turning scorecards, archetypes or route memory into route-authority or quality gates.
- `data_asset_management.md` remains aligned after the prior correction: data asset registries, public-data opportunities and ToolUniverse support evidence building, impact assessment and knowledge/function analysis, but cannot replace MAS source readiness, study truth, quality gate, artifact authority or OPL runtime owner.
- `workspace_autoscience_rules.md` now explicitly guards workspace literature, data asset registry, ToolUniverse output and workspace memory as context / evidence input / diagnostic / route-back only.
- `bounded_analysis_frontier_policy.md` now explicitly states candidate boards are comparison/audit surfaces and cannot authorize claim expansion, publication quality, source readiness, artifact mutation, submission readiness or `current_package` updates.
- `study_route_contract.md` now explicitly states `hard_success_gate`, `durable_outputs_minimum`, generated stage cards, human review pages and OPL projections are stage closeout / projection obligations, not quality, submission, artifact, source readiness or controller-decision authority.

Verification / absorb:

- MAS commit `0ed003c7 docs: cover MAS study workflow policies` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS verification after rebasing onto fresh `origin/main`: `git diff --check`; strict README/docs/contracts/tests/agent conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_stage_surface_contract.py tests/test_stage_knowledge_plane.py tests/test_stage_knowledge_entry_injection.py tests/test_workspace_literature.py tests/test_data_assets.py tests/test_data_asset_gate.py tests/test_stage_route_assets.py -q` read `73 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-study-workflow-source-policy-coverage-20260526` and branch `codex/mas-study-workflow-source-policy-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. All reviewed study-workflow policy files remain active policy or canonical memory-body support with distinct roles; stale authority leakage was corrected in place.

Unreviewed docs:

- MAS delivery / medical-display docs outside the already-covered inspection, artifact/baseline/retention and delivery index blocks remain open when they mention artifact lifecycle, source truth, package authority or display-pack authority.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat route memory, archetypes, route-bias prose, route contract, stage cards, human review pages, bounded-analysis candidate boards, data asset registry, workspace literature, ToolUniverse output, file presence, package freshness, local test pass, provider completion or OPL projection as source readiness verdict, publication quality verdict, submission readiness, artifact mutation authorization, `current_package` update, controller decision, domain ready or production ready.
- Future prose must not make OPL read or mutate MAS memory body, accept/reject memory writebacks, choose publication route, write MAS truth, sign artifact authority or interpret medical quality.
- Route-memory library cards remain advisory reusable experience. They should not be turned into recipe-engine schemas, winning-route scorers, fixed workflows or ordinary-user edit UI without audited evidence obligations, owner boundary, receipt generation and failure behavior.

Next tranche write scope:

- MAS delivery / medical-display docs that mention artifact lifecycle, source truth, package authority or display-pack authority.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 06:02 CST`
Tranche: `mas-study-workflow-policy-boundary-rebase-followup`
State: `tranche_verified`

本轮延续上一条 MAS study-workflow policy coverage，并在 fresh MAS `origin/main` 上重新吸收。期间 MAS `origin/main` 已先落地 `0ed003c7 docs: cover MAS study workflow policies`；本轮把该 coverage 与本轮补读的 seed fixture、source index、workspace knowledge/runtime contract、submission revision boundary 合并成最新 MAS commit `9e9989dd docs: cover MAS study workflow policy boundaries`。旧 `0ed003c7` 记录保持为 provenance；当前引用最新落点时使用 `9e9989dd`。

Reviewed / edited delta:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all `docs/policies/study-workflow/*` Markdown files plus `publication_route_memory_seed_fixture.json`; support read of `docs/source/README.md`, `docs/runtime/contracts/workspace_knowledge_and_literature_contract.md`, and `docs/runtime/contracts/stage_route_contract.md`; live contract/source/test evidence from stage route, stage knowledge, workspace literature, data assets, Semantic Scholar provider runtime and OPL family adoption surfaces. | `docs/docs_portfolio_consolidation.md`; `docs/policies/study-workflow/study_route_contract.md`; `docs/policies/study-workflow/bounded_analysis_frontier_policy.md`; `docs/policies/study-workflow/submission_revision_operating_contract.md`; `docs/policies/study-workflow/workspace_autoscience_rules.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `study_route_contract.md` now states stage packet is stage handoff / read-model input, not route authority; go / stop / reroute / human-gate decisions still need controller decision, evidence/review ledgers, publication eval, owner receipt or typed blocker.
- `bounded_analysis_frontier_policy.md` now combines candidate-board audit semantics with claim/source/artifact/human-gate boundary checks; selected path / stop reason can feed controller, AI reviewer, publication gate and later stages, but cannot itself declare scientific success or package freshness.
- `submission_revision_operating_contract.md` now explicitly scopes same-line revision and submission delivery, distinguishing controller-authorized `paper/` sources from current-package / DOCX / PDF / ZIP projections and review overlays.
- `workspace_autoscience_rules.md` now names MAS controller / owner surfaces for data, gate and delivery updates, while OPL remains provider/runtime/projection shell owner. Workspace literature, data asset registry, ToolUniverse output, provider cache/ranking, quest-local materialization, provider completion, file presence, test pass and package freshness cannot become source readiness, quality verdict, artifact authority, domain ready or paper closure.

Verification / absorb:

- MAS commit `9e9989dd docs: cover MAS study workflow policy boundaries` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS verification after rebase onto fresh `origin/main`: `git diff --check` passed; strict `README* docs contracts profiles agent src tests` conflict-marker scan had no hits; OPL Doc Governance doctor reported `finding_count=0`, active truth `pass`; focused pytest `tests/test_stage_route_contract.py tests/test_stage_knowledge_plane.py tests/test_stage_knowledge_entry_injection.py tests/test_semantic_scholar_provider_runtime_contract.py tests/test_data_asset_gate.py -q` read `45 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-study-workflow-policy-docs-coverage-20260526` and branch `codex/mas-study-workflow-policy-docs-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. All changed files remain active policy / docs-governance surfaces with distinct roles.

Unreviewed docs:

- `docs/policies/study-workflow/` is paragraph-covered for this source/stage-workflow authority-boundary pass.
- MAS delivery / medical-display docs outside the already-covered inspection, artifact/baseline/retention and delivery index blocks remain open when they mention artifact lifecycle, source truth, package authority or display-pack authority.
- MAS runtime/control support docs under `docs/runtime/contracts/**` and `docs/runtime/control/**` remain open outside previously covered projection/display/inspection/controller/stage route snippets.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes are safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat stage packet, candidate board, route memory, archetype, route-bias prose, data asset registry, workspace literature, ToolUniverse output, provider cache/ranking, quest-local materialization, file presence, package freshness, local test pass, provider completion or OPL projection as source readiness verdict, publication quality verdict, submission readiness, artifact mutation authorization, `current_package` update, controller decision, domain ready or production ready.
- Future MAS prose must not make OPL read or mutate MAS memory body, accept/reject memory writebacks, choose publication route, write MAS truth, sign artifact authority or interpret medical quality.

Next tranche write scope:

- MAS delivery / medical-display docs that mention artifact lifecycle, source truth, package authority or display-pack authority.
- Or MAS runtime/control support docs under `docs/runtime/contracts/**` and `docs/runtime/control/**` not already covered.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 06:10 CST`
Tranche: `mas-medical-display-delivery-authority-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/delivery/medical-display/` 中最容易影响 display owner round 路由的入口、portfolio、figure route、platform mainline 和 active board 文档，并吸收回 MAS `main`。目标是确认 medical-display 能力族只定义 renderer、schema、template、layout QC、route cookbook、display-to-claim audit input 和 generated display artifact 支撑；source readiness、publication quality、submission readiness、artifact mutation、`current_package` freshness、delivery sync、paper closure、domain ready 和 production ready 仍归 MAS owner authority、owner receipt、typed blocker 与真实 workspace evidence。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/delivery/README.md`, MAS docs-governance ledger, and preceding source / delivery / artifact authority coverage entries.
- MAS medical-display docs: `docs/delivery/medical-display/README.md`, `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`, `docs/delivery/medical-display/contracts/domain_handler_figure_routes.md`, `docs/delivery/medical-display/contracts/medical_display_platform_mainline.md`, and `docs/delivery/medical-display/board/medical_display_active_board.md`.
- MAS machine/source refs: `contracts/pack_compiler_input.json`, `contracts/stage_control_plane.json`, `contracts/artifact_locator_contract.json`, `agent/knowledge/source_readiness_and_artifact_authority.md`, `src/med_autoscience/figure_routes.py`, `src/med_autoscience/figure_renderer_contract.py`, `src/med_autoscience/display_pack_contract.py`, `src/med_autoscience/display_pack_loader.py`, and display materialization / layout QC source indexed by CodeGraph.
- Focused test evidence: MAS focused pytest for figure routes, renderer contract, display pack contract/loader and figure loop guard read `42 passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/delivery/medical-display/README.md`, `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`, `docs/delivery/medical-display/contracts/domain_handler_figure_routes.md`, `docs/delivery/medical-display/contracts/medical_display_platform_mainline.md`, and `docs/delivery/medical-display/board/medical_display_active_board.md`, plus live contract/source/test evidence listed above. | `docs/docs_portfolio_consolidation.md`; `docs/delivery/medical-display/README.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- MAS `figure_routes.py` accepts only `figure_script_fix:<figure-id>` and `figure_illustration_program:<figure-id>`; ambiguous `sidecar:<figure-id>` and removed autofigure routes fail closed, and route help states display-to-claim QA input does not authorize publication readiness.
- MAS `figure_renderer_contract.py` keeps evidence figures on `python` / `r_ggplot2`, allows `html_svg` only for illustration / submission companion semantics, and requires `fallback_on_failure=false` plus `failure_action=block_and_fix_environment`.
- MAS display pack contracts validate namespaced pack/template ids, audit families, renderer family, schema refs, QC refs, required exports, paper roles and pack source/version refs; these are template / renderer / inventory truth, not artifact mutation authority, source readiness verdict or submission readiness.
- MAS medical-display README now carries a first-screen delivery-authority guard so future owner rounds do not treat display-pack readiness, generated display artifacts, route cookbook, visual audit or exemplar intake as source/publication/artifact/domain readiness.

Verification / absorb:

- MAS commit `19f6e082 docs: cover MAS medical display authority` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS verification after rebasing onto fresh `origin/main`: `git diff --check`; strict README/docs/contracts/tests/agent conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_figure_routes.py tests/test_figure_renderer_contract.py tests/test_display_pack_contract.py tests/test_display_pack_loader.py tests/test_figure_loop_guard.py -q` read `42 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-delivery-medical-display-docs-coverage-20260526` and branch `codex/mas-delivery-medical-display-docs-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. The reviewed medical-display docs remain active delivery support docs with distinct roles; stale authority leakage was handled by adding the missing first-screen boundary to the subtree README.

Unreviewed docs:

- MAS full paragraph-level coverage remains open for the long medical-display inventory / catalog / plan / provenance bodies: `medical_display_audit_guide.md`, `medical_display_visual_audit_protocol.md`, `medical_display_arsenal.md`, `medical_display_template_backlog.md`, `medical_display_template_catalog.md`, `medical_figure_route_cookbook.md`, `medical_display_template_pack_architecture.md`, `medical_display_template_pack_implementation_plan.md`, `medical_display_family_roadmap.md`, and `medical_display_anchor_paper_audit.md`.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat display pack presence, template count, generated display artifact, visual-audit pass, route cookbook, exemplar intake, renderer success, display materialization, package source/version lock or OPL projection as source readiness verdict, publication quality verdict, submission readiness, artifact mutation authorization, `current_package` update, delivery sync, paper closure, domain ready or production ready.
- External drawing / sidecar / autofigure route wording must stay retired unless a new explicit owner route, artifact authority receipt, focused tests and tombstone/provenance boundary are landed. `figure_illustration_program` cannot be used to edit evidence, claim text, result plots or source/statistics refs.
- Long medical-display catalogs and plans still need dedicated future coverage because their size and inventory role make them unsuitable for this bounded tranche.

Next tranche write scope:

- MAS paragraph-level coverage for the remaining medical-display catalog / plan / audit-guide bodies, preferably `medical_display_audit_guide.md` + `medical_display_visual_audit_protocol.md` or `medical_display_template_pack_architecture.md` + `medical_display_template_pack_implementation_plan.md`.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 06:10 CST`
Tranche: `opl-runtime-docs-coverage`
State: `tranche_verified_scope_pending`

本轮覆盖 OPL `docs/runtime/**` 四份 runtime 支撑文档。目标是确认 runtime 目录当前只承接 framework runtime、provider/executor、control plane、projection/read model、resume/wakeup 与 repair 语义，不把 provider SLO、Agent Lab suite pass、zero-open evidence worklist、App drilldown、route graph visibility 或 OMA/App consumption refs 写成 domain ready、quality/export verdict、artifact authority、default promotion 或 production ready。

Fresh live truth inputs:

- OPL `AGENTS.md`、`TASTE.md`、核心 docs、active gap plan、runtime docs、family coverage ledger。
- OPL runtime docs: `docs/runtime/README.md`, `docs/runtime/opl-runtime-naming-and-boundary-contract.md`, `docs/runtime/stage-graph-route-transition-runtime.md`, `docs/runtime/opl-agent-lab-control-plane.md`.
- OPL machine/source/test refs: `contracts/opl-framework/runtime-manager-contract.json`, `contracts/opl-framework/agent-lab-contract.json`, `contracts/opl-framework/family-runtime-attempt-contract.json`, `contracts/family-orchestration/family-stage-*.schema.json`, `src/family-runtime*.ts`, `src/runtime-tray-app-operator-drilldown*.ts`, `src/agent-lab*.ts`, and focused CLI tests under `tests/src/cli/cases/family-runtime*.test.ts`, `runtime-app-operator-drilldown*.test.ts`, `agent-lab*.test.ts`, and `work-order-execution.test.ts`.
- Fresh read models: `opl agents conformance --family-defaults --json`, `opl framework readiness --family-defaults --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`, and `opl runtime app-operator-drilldown --json`.

Fresh semantic result:

- Runtime docs already carry first-screen `Owner` / `Purpose` / `State` / `Machine boundary` signals and remain active support docs with distinct roles: runtime index, naming/boundary contract, stage graph / route transition support, and Agent Lab control-plane boundary.
- `agents conformance` read `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`, and `conformance_report_can_claim_domain_ready=false`; this remains structural conformance only.
- `framework readiness` read `status=framework_control_plane_available_with_hard_blockers`, `hard_blocker_count=1`, `pack_compiler_hard_blocker_count=1`, `operator_actionable_attention_tail_count=0`, `domain_blocked_attention_tail_count=234`, `evidence_envelope_blocked_count=221`, and provider SLO cadence/capability satisfied. Runtime docs must therefore not imply global framework completion.
- `family-runtime evidence-worklist` read `open_worklist_item_count=0`, `open_safe_action_payload_required_item_count=0`, `open_safe_action_payload_free_item_count=0`, `zero_open_worklist_blocked_refs_only_envelope_count=221`, `zero_open_worklist_is_domain_ready=false`, `zero_open_worklist_is_production_ready=false`, `domain_ready_authorized=false`, and `production_ready_authorized=false`.
- `runtime app-operator-drilldown` remained available and refs-only. It projected `codex_app_runtime_role_status=opl_temporal_hosted_autonomous`, `codex_app_drives_long_running_tasks=false`, provider SLO satisfied, `next_safe_action=provider-worker:temporal:start`, `provider_health.health_status=attention_required`, `domain_dispatch_evidence_current_default_actionable_attempt_count=0`, `evidence_envelope_open_count=0`, `evidence_envelope_blocked_count=221`, `domain_ready_claim_count=0`, `production_ready_claim_count=0`, `artifact_authority_claim_count=0`, `app_release_user_path_production_user_path_ready=true`, `app_release_user_path_release_ready_claimed=false`, and `app_release_user_path_production_ready_claimed=false`.
- No runtime prose was changed this tranche: the reviewed docs already described these surfaces as human-readable support and refs-only projection, with explicit no-ready / no-verdict / no-artifact-authority boundaries. The only write is this coverage ledger entry.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph read of `docs/runtime/README.md`, `docs/runtime/opl-runtime-naming-and-boundary-contract.md`, `docs/runtime/stage-graph-route-transition-runtime.md`, and `docs/runtime/opl-agent-lab-control-plane.md`, plus live contract/source/test/read-model evidence listed above. | this coverage ledger |

Archived / tombstoned / deleted docs:

- none. The four reviewed runtime docs remain active support docs with unique roles; no stale runtime doc path had no-active-role proof requiring archive, tombstone or deletion.

Unreviewed docs:

- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries and this runtime tranche, especially `docs/product/**`, `docs/source/**`, `docs/public/**`, `docs/specs/**`, remaining `docs/references/**` bodies, and OPL root/core docs not yet covered by a whole-repo final reconciliation.
- MAS paragraph-level coverage remains open for delivery / medical-display docs, product/status/workbench, progress/domain-ref projection and source/delivery shell outside the already-covered blocks.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future OPL runtime prose must not treat provider SLO satisfied, App drilldown availability, Agent Lab suite pass, `app_workbench_consumption_ready`, OMA production-consumption refs, zero-open worklist, route graph visibility, transition runner pass, generated descriptor readiness, provider completion, redrive, worker start/restart, App user-path evidence, or runtime budget estimate as domain ready, quality/export verdict, artifact authority, owner receipt, default promotion or production ready.
- Future runtime support should keep `Hermes-Agent` as explicit non-default executor adapter / diagnostic / historical reference only; `Host-Agent Runtime` remains dev/offline diagnostic deployment vocabulary, while production online long-running path stays OPL/Temporal hosted autonomous stage runtime.
- Future Agent Lab prose must keep `opl work-order execute` as the canonical work-order execution primitive and must not revive `opl agent-lab execute-work-order` as active compatibility surface.

Next tranche write scope:

- OPL paragraph-level coverage for `docs/product/**`, `docs/source/**`, `docs/public/**`, `docs/specs/**`, or remaining `docs/references/**` support bodies.
- Or MAS delivery / medical-display docs that mention artifact lifecycle, source truth, package authority or display-pack authority.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 11:54 CST`
Tranche: `mas-medical-display-audit-protocol-coverage`
State: `tranche_verified`

本轮继续覆盖 MAS medical-display 的 audit/protocol 长文档，并吸收回 MAS `main`。目标是把 `medical_display_audit_guide.md` 与 `medical_display_visual_audit_protocol.md` 读回当前 live renderer / schema / display pack / layout QC / publication-display / submission-minimal 事实：显示审计可以定义 deterministic lower bound、视觉审计格式、style/override 合同、generated display output 接受门和 promotion-to-contract/QC/golden-regression 路径；它不能授权 source readiness、publication quality verdict、submission readiness、artifact mutation、`current_package` freshness、delivery sync、paper closure、domain ready 或 production ready。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, MAS docs-governance ledger, and the preceding medical-display delivery authority coverage entry.
- MAS medical-display docs: `docs/delivery/medical-display/contracts/medical_display_audit_guide.md` and `docs/delivery/medical-display/contracts/medical_display_visual_audit_protocol.md`.
- MAS machine/source refs: `src/med_autoscience/figure_routes.py`, `src/med_autoscience/figure_renderer_contract.py`, `src/med_autoscience/display_pack_contract.py`, `src/med_autoscience/display_pack_loader.py`, `src/med_autoscience/publication_display_contract.py`, `src/med_autoscience/controllers/display_surface_materialization/`, `src/med_autoscience/display_layout_qc/`, `src/med_autoscience/controllers/medical_publication_surface.py`, and `src/med_autoscience/controllers/submission_minimal.py`.
- Focused test evidence: MAS focused pytest for renderer contract, publication display contract, submission-minimal display surface and medical publication surface read `137 passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/delivery/medical-display/contracts/medical_display_audit_guide.md` and `docs/delivery/medical-display/contracts/medical_display_visual_audit_protocol.md`, plus live contract/source/test evidence listed above. | `docs/docs_portfolio_consolidation.md`; `docs/delivery/medical-display/contracts/medical_display_audit_guide.md`; `docs/delivery/medical-display/contracts/medical_display_visual_audit_protocol.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `medical_display_audit_guide.md` remains the active engineering audit surface for deterministic display lower-bound coverage, audited template inventory, schema/renderer/QC/export coupling and change protocol.
- Generated display outputs, `paper/submission_minimal/`, `paper/publication_style_profile.json` and readability failures are now explicitly scoped to display / projection / visual-style authority. These surfaces do not become artifact authority, source truth, source readiness verdict, publication quality verdict, submission readiness or package freshness authority.
- `medical_display_visual_audit_protocol.md` remains the active AI-first visual audit support protocol above deterministic QC. Its finding format, promotion rules and minimal Codex loop remain valid, but acceptance wording is now scoped to paper-facing display-surface completion.
- `visual audit clear` means the generated display surface can be accepted for the paper-facing display lane after deterministic and visual findings are closed or explicitly accepted. It does not close publication gate, submission package readiness, artifact mutation, `current_package`, delivery sync, paper closure, domain ready or production ready.

Verification / absorb:

- MAS commit `6841f7cf docs: cover MAS display audit protocol` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS verification before absorb: `git diff --check`; strict README/docs/contracts/tests/agent conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_figure_renderer_contract.py tests/test_publication_display_contract.py tests/test_submission_minimal_display_surface.py tests/test_medical_publication_surface.py -q` read `137 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-medical-display-audit-docs-coverage-20260526` and branch `codex/mas-medical-display-audit-docs-coverage-20260526` were removed after absorb.
- MAS root checkout still has unrelated local changes in `scripts/opl-module-healthcheck.sh` and `tests/test_test_command_surfaces.py`; this tranche did not touch them.

Archived / tombstoned / deleted docs:

- none. Both MAS display audit files remain active delivery contract support docs with distinct roles; stale authority leakage was corrected in place.

Unreviewed docs:

- MAS full paragraph-level coverage remains open for the remaining medical-display inventory / catalog / plan / provenance bodies: `medical_display_arsenal.md`, `medical_display_template_backlog.md`, `medical_display_template_catalog.md`, `medical_figure_route_cookbook.md`, `medical_display_template_pack_architecture.md`, `medical_display_template_pack_implementation_plan.md`, `medical_display_family_roadmap.md`, and `medical_display_anchor_paper_audit.md`.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS prose must not treat `gate clear`, `visual audit clear`, generated display outputs, visual style profile, display overrides, submission-minimal projection, renderer/QC pass, display pack lock or catalog entry as source readiness, formal publication-quality verdict, submission readiness, artifact mutation authorization, `current_package` freshness, delivery sync, paper closure, domain ready or production ready.
- Hidden post-processing, handmade figure cleanup, fallback renderer substitution, external exemplar copying, legacy sidecar/autofigure route wording and compatibility aliases remain retire candidates unless a new explicit MAS owner route, artifact authority receipt, focused tests and tombstone/provenance boundary are landed.

Next tranche write scope:

- MAS paragraph-level coverage for `medical_display_template_pack_architecture.md` + `medical_display_template_pack_implementation_plan.md`, or `medical_display_arsenal.md` + `medical_display_template_backlog.md` + `medical_display_template_catalog.md` if the next lane focuses on inventory/catalog role separation.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 16:05 CST`
Tranche: `mas-medical-display-template-pack-plan-lifecycle`
State: `tranche_verified`

本轮覆盖 MAS medical-display template-pack plan 生命周期，并吸收回 MAS `main`。目标是把 template-pack architecture / implementation-plan 读回当前 live display-pack source、tests、contracts 和已完成迁移事实：架构文档保留为 active support design；Phase 1-2 逐步实施计划保留为 history/provenance，不能继续留在 active `plans/` 下作为当前 agent work queue、checkbox 任务包、expected-failure 流水或 commit 指令来源。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, MAS docs-governance ledger, and preceding medical-display delivery authority / audit-protocol coverage entries.
- MAS medical-display docs: `docs/delivery/medical-display/plans/medical_display_template_pack_architecture.md`, `docs/delivery/medical-display/plans/medical_display_template_pack_implementation_plan.md`, `docs/delivery/medical-display/README.md`, `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`, and `docs/history/capabilities/medical-display/README.md`.
- MAS machine/source/test refs: CodeGraph context for `LoadedDisplayPack`, `LoadedDisplayTemplate`, `DisplayPackManifest`, `load_display_pack_manifest`, `load_enabled_local_display_pack_records`, and `load_enabled_local_display_template_records`; source/test evidence from `display_pack_contract`, `display_pack_loader`, `display_pack_resolver`, `display_pack_lock`, and focused display-pack tests.
- Focused test evidence: MAS focused pytest for display-pack contract, loader, resolver, lock, runtime and submission-minimal display surface read `34 passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/delivery/medical-display/plans/medical_display_template_pack_architecture.md` and the full moved Phase 1-2 implementation plan; role/index review of `docs/delivery/medical-display/README.md`, `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`, and `docs/history/capabilities/medical-display/README.md`, plus live source/test evidence listed above. | `docs/docs_portfolio_consolidation.md`; `docs/delivery/medical-display/README.md`; `docs/delivery/medical-display/plans/medical_display_template_pack_architecture.md`; `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`; `docs/history/capabilities/medical-display/README.md`; `docs/history/capabilities/medical-display/medical_display_template_pack_implementation_plan_2026_04.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- The template-pack plan is no longer a current implementation queue. Live source already contains the package manifest contract, enabled pack/template record loader, resolver, display-pack lock payload and provenance write path; focused tests cover namespaced ids, local pack loading, runtime consumption, lock provenance and submission-minimal display surface integration.
- `medical_display_template_pack_architecture.md` remains active support because it explains the split between MAS host-platform duties and pack ecosystem duties, exact-version / repo-paper configuration intent, pack-local assets and remaining ecosystem gaps.
- `docs/delivery/medical-display/plans/medical_display_template_pack_implementation_plan.md` was moved to `docs/history/capabilities/medical-display/medical_display_template_pack_implementation_plan_2026_04.md`, marked `history_provenance`, and prefaced so its checkboxes, expected failures, code snippets, command sequences and commit instructions are historical provenance only.
- Active medical-display README and portfolio map now route users to template-pack architecture as current support design and to the moved file as implementation provenance, avoiding a second active work queue under `docs/delivery/medical-display/plans/`.

Verification / absorb:

- MAS commit `e8c81dae docs: archive MAS display pack plan` was fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS verification before absorb: `git diff --check`; strict README/docs/contracts/tests/agent conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_display_pack_contract.py tests/test_display_pack_loader.py tests/test_display_pack_resolver.py tests/test_display_pack_lock.py tests/test_display_pack_runtime.py tests/test_submission_minimal_display_surface.py -q` read `34 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-medical-display-pack-plan-docs-coverage-20260526` and branch `codex/mas-medical-display-pack-plan-docs-coverage-20260526` were removed after absorb.
- External MAS worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-display-template-pack-docs-coverage-20260526` was retained because it has unrelated uncommitted/recent writes and was not owned by this tranche.

Archived / tombstoned / deleted docs:

- Moved `docs/delivery/medical-display/plans/medical_display_template_pack_implementation_plan.md` to `docs/history/capabilities/medical-display/medical_display_template_pack_implementation_plan_2026_04.md`.

Unreviewed docs:

- MAS remaining long medical-display inventory / catalog / provenance bodies: `medical_display_arsenal.md`, `medical_display_template_backlog.md`, `medical_display_template_catalog.md`, `medical_figure_route_cookbook.md`, `medical_display_family_roadmap.md`, and `medical_display_anchor_paper_audit.md`.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future MAS active prose that links the Phase 1-2 implementation plan as current work, preserves its checkbox tasks as open execution, or tells agents to run its historical command sequence is stale pollution.
- Future template-pack prose must not downgrade live package contracts, loader/resolver/lock surfaces, namespaced template ids, generated catalog/provenance and focused tests back into “not started” plan language.
- Display pack presence, lock presence, pack source/version refs and generated catalog provenance still do not authorize source readiness, publication quality, submission readiness, artifact mutation, `current_package` freshness, delivery sync, paper closure, domain ready or production ready.

Next tranche write scope:

- MAS paragraph-level coverage for `medical_display_arsenal.md` + `medical_display_template_backlog.md` + `medical_display_template_catalog.md`, or `medical_figure_route_cookbook.md` + `medical_display_family_roadmap.md` + `medical_display_anchor_paper_audit.md`.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 17:10 CST`
Tranche: `mas-medical-display-catalog-inventory-lifecycle`
State: `tranche_verified`

本轮覆盖 MAS medical-display catalog / inventory 三件套，并吸收回 MAS `main`。目标是把 `medical_display_arsenal.md`、`medical_display_template_backlog.md` 与 `medical_display_template_catalog.md` 读回当前 audited display source、audit guide、template-pack source/tests 和已完成 backlog 出队事实：catalog / arsenal / backlog 是 human-readable inventory 和 candidate pool，不是 active owner round、执行流水、吸收记录、source readiness、publication quality、submission readiness、artifact mutation、`current_package` freshness、paper closure、domain ready 或 production ready 判据。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/invariants.md`, `docs/decisions.md`, MAS docs-governance ledger, and preceding medical-display delivery authority / audit-protocol / template-pack lifecycle coverage entries.
- MAS medical-display docs: `docs/delivery/medical-display/catalogs/medical_display_arsenal.md`, `docs/delivery/medical-display/catalogs/medical_display_template_backlog.md`, `docs/delivery/medical-display/catalogs/medical_display_template_catalog.md`, plus role/index review of `docs/delivery/medical-display/README.md` and `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`.
- MAS machine/source/test refs: `display_registry`, `display_schema_contract`, `display_schema_contract_parts`, `display_pack_contract`, `display_pack_loader`, `display_pack_resolver`, `display_pack_lock`, `display_pack_bootstrap`, `display_pack_runtime`, display materialization, layout QC, medical publication surface and submission-minimal display consumers.
- Focused test evidence: MAS focused pytest for display-pack contract / loader / resolver / runtime / lock / bootstrap / surface-sync / renderer-structure / materialization / submission-minimal display surface and schema-doc contract case read `259 passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/delivery/medical-display/catalogs/medical_display_arsenal.md`, `docs/delivery/medical-display/catalogs/medical_display_template_backlog.md`, and `docs/delivery/medical-display/catalogs/medical_display_template_catalog.md`; role/index review of `docs/delivery/medical-display/README.md` and `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`, plus live source/test evidence listed above. | `docs/docs_portfolio_consolidation.md`; `docs/delivery/medical-display/catalogs/medical_display_arsenal.md`; `docs/delivery/medical-display/catalogs/medical_display_template_backlog.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `medical_display_arsenal.md` remains active support as the human-readable capability inventory. Its current audited inventory count is `98`; the stale intra-file reference to current total `93` was corrected to `98`. Family membership counts remain paper-question duplicated counts and are not unique template totals.
- `medical_display_template_backlog.md` remains active support for inactive candidate pool and historical backlog cleanup. It now states that it does not preserve current round execution流水、commit 指令或 absorb state; landed template truth comes from audit guide, template catalog, registry/source and focused tests. Old “本轮/上一轮 absorb” wording was normalized to current out-of-backlog state so future agents do not treat it as an active execution queue.
- `medical_display_template_catalog.md` remains the exhaustive human-readable generated matrix for registered templates, renderers, schemas and QC profiles. Its header already ties truth to `med_autoscience.display_registry` and `med_autoscience.display_schema_contract`; no catalog rewrite was needed.
- The reviewed MAS index docs already route catalogs as inventory and preserve delivery authority boundaries. No index relocation was needed.

Verification / absorb:

- MAS commits `ed01d417 docs: cover MAS display catalog inventory` and `0db65ef6 docs: align MAS display inventory wording` were fast-forwarded into MAS `main` and pushed to `origin/main`.
- MAS verification before and after absorb: `git diff --check`; strict README/docs/contracts/tests/src/agent/profiles/scripts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`; focused pytest `tests/test_display_pack_contract.py tests/test_display_pack_loader.py tests/test_display_pack_resolver.py tests/test_display_pack_runtime.py tests/test_display_pack_lock.py tests/test_display_pack_bootstrap.py tests/test_display_pack_surface_sync.py tests/test_display_pack_renderer_structure.py tests/test_display_surface_materialization.py tests/test_submission_minimal_display_surface.py tests/display_schema_contract_cases/shap_templates_and_docs_contracts.py -q` read `259 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-medical-display-catalog-docs-coverage-20260526` and branch `codex/mas-medical-display-catalog-docs-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. All three MAS catalog docs remain active support with distinct inventory/candidate roles.

Unreviewed docs:

- MAS remaining long medical-display route / roadmap / provenance bodies: `medical_figure_route_cookbook.md`, `medical_display_family_roadmap.md`, and `medical_display_anchor_paper_audit.md`.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside the already-covered blocks.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- App docs remain delayed until active release/GUI lanes are safe to govern.

Remaining stale / retire candidates:

- Future MAS catalog/backlog prose that reports stale template totals, preserves “本轮 absorb / 将随本轮进入 main” as current execution state, or treats inactive candidates / historical cleanup as active blocker is stale pollution.
- Future MAS catalog/backlog prose must not downgrade audited registry/source/schema/display-pack/QC surfaces into “not started” plan language, and must not upgrade catalog presence, candidate pool entries, generated matrix or pack refs into source readiness、publication quality、submission readiness、artifact mutation、`current_package` freshness、paper closure、domain ready or production ready.

Next tranche write scope:

- MAS paragraph-level coverage for `medical_figure_route_cookbook.md` + `medical_display_family_roadmap.md` + `medical_display_anchor_paper_audit.md`.
- Or choose the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 07:10 CST`
Tranche: `rca-active-doc-retired-alias-wording`
State: `tranche_verified`

本轮覆盖 RCA active plan / status 中的 retired-alias wording，并吸收回 RCA `main`。目标是关闭 OPL Doc Governance doctor 对 RCA active docs 的两个 legacy-vocabulary warning：active prose 不再把旧 `compatibility alias` 词组写成当前治理语言；machine contract field id `managed_runtime_compatibility_alias` 继续只作为 forbidden payload / forbidden receipt negative guard 由 RCA contracts/tests 持有。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `docs/docs_portfolio_consolidation.md`, `docs/status.md`, `docs/active/rca-ideal-state-gap-plan.md`.
- RCA machine contracts: `contracts/physical_source_morphology_policy.json`, `contracts/production_acceptance/rca-production-acceptance.json`, and runtime-program current leaf refs that carry retired surface guards.
- RCA tests: `tests/rca-retired-surface-guard.test.ts` and `tests/rca-production-acceptance.test.ts`.
- OPL Doc Governance doctor before/after signal: previous six-repo doctor showed RCA `finding_count=2`; after this tranche RCA doctor reads `finding_count=0`, active truth `pass`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | `docs/active/rca-ideal-state-gap-plan.md` completion truth, source hygiene tail, production evidence tail and next prompt wording; `docs/status.md` current evidence/accounting and naming hygiene tail; RCA live contract/test guard surfaces listed above. | `docs/active/rca-ideal-state-gap-plan.md`; `docs/status.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- RCA root cause was active-doc wording pollution: live machine contracts already classify retired managed runtime compatibility fields as forbidden / negative-guard / tombstone policy, while active prose still used the retired literal phrase as current language.
- Active docs now use `retired-alias no-resurrection`, `retired-alias resurrection` or `active public alias` where prose describes current governance. This preserves no-resurrection meaning without reintroducing an active compatibility promise.
- `managed_runtime_compatibility_alias` remains allowed as a machine-readable field name only where the RCA policy/tests identify retired forbidden payload / receipt guard fields; this tranche did not change contracts or tests.
- RCA production evidence tails remain open for memory/lifecycle receipt scaleout, Temporal controlled visual-stage long soak, and repeated no-regression evidence. This wording tranche does not close domain ready, artifact/export readiness or production ready.

Verification / absorb:

- RCA commit `3b56693 docs: clarify RCA retired alias wording` was fast-forwarded into RCA `main` and pushed/aligned with `origin/main`.
- RCA verification before absorb: `git diff --check`; strict README/docs/contracts/tests/agent conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused `npm test -- tests/rca-retired-surface-guard.test.ts tests/rca-production-acceptance.test.ts` read `177 passed`, then serialized route-heavy batches `25 passed`, `33 passed`, and native PPT batch `28 passed`.
- RCA tranche worktree `/Users/gaofeng/workspace/redcube-ai/.worktrees/rca-active-doc-retired-name-wording-20260526` and branch `codex/rca-active-doc-retired-name-wording-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. RCA active plan and status remain the current owner docs; this tranche only rewrote stale active wording and added RCA's own coverage ledger entry.

Unreviewed docs:

- RCA full repo-wide paragraph coverage remains open for product/runtime/delivery/source/policies/references/history bodies outside the touched active plan/status sections and previously recorded coverage.
- OPL full README/docs coverage remains open outside the covered OPL chunks named in earlier ledger entries.
- MAS paragraph-level semantic coverage remains open for remaining delivery / medical-display route / roadmap / provenance bodies, product/status/workbench, progress/domain-ref projection and source/delivery shell outside already-covered blocks.
- App docs remain delayed until active release/GUI lanes close, App `main` is current, or explicit ownership makes current App docs safe to govern.

Remaining stale / retire candidates:

- Future RCA active prose that reintroduces retired alias terminology as active public path, active caller, active payload template, success payload, readiness claim, runtime owner, wrapper, facade or compatibility promise is stale pollution.
- RCA machine contracts/tests may keep `compatibility_alias` tokens only when they identify forbidden negative-guard fields or policy ids; those tokens are machine truth, not active prose authority.
- RCA support docs that mention generated/default caller thinning, domain handler, product-entry/session, runtimeWatch, domain_action_adapter or retired route vocabulary still need later section-by-section governance.

Next tranche write scope:

- RCA product/runtime/delivery/source support docs that mention generated/default caller thinning, product-entry/session, runtimeWatch, domain_action_adapter or retired route vocabulary.
- Or MAS remaining medical-display route / roadmap / provenance bodies.
- Or the next exact OPL uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 07:25 CST`
Tranche: `mas-medical-display-route-roadmap-provenance`
State: `tranche_verified`

本轮覆盖 MAS medical-display route / roadmap / provenance 三件套，并吸收回 MAS `main`。目标是把 `medical_figure_route_cookbook.md`、`medical_display_family_roadmap.md` 与 `medical_display_anchor_paper_audit.md` 读回当前 live figure-route source、domain-handler route contract、display audit / catalog truth 和 anchor-paper closure lifecycle：cookbook 是 paper-facing route family support，不是 dispatchable route registry；roadmap 是 long-horizon paper-family target，不是当前 execution queue；anchor audit 是 `001/003` closure snapshot provenance，不是当前 package freshness、publication quality、submission readiness、artifact mutation、paper closure、domain ready 或 production ready 判据。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, MAS docs-governance ledger, and preceding medical-display delivery authority / audit-protocol / catalog inventory / template-pack lifecycle coverage entries.
- MAS medical-display docs: `docs/delivery/medical-display/catalogs/medical_figure_route_cookbook.md`, `docs/delivery/medical-display/portfolio/medical_display_family_roadmap.md`, `docs/delivery/medical-display/provenance/medical_display_anchor_paper_audit.md`, plus role/index review of `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`.
- MAS machine/source/test refs: `src/med_autoscience/figure_routes.py`, `src/med_autoscience/controllers/figure_loop_guard.py`, `docs/delivery/medical-display/contracts/domain_handler_figure_routes.md`, `docs/delivery/medical-display/contracts/medical_display_platform_mainline.md`, display audit guide, generated template catalog, registry/schema contracts and display-pack source/tests.
- CodeGraph evidence for `FigureRoute`, `build_figure_route`, `parse_figure_route`, `normalize_required_route`, `partition_required_routes` and figure-loop guard route consumption.
- Focused test evidence: MAS focused pytest for figure routes, figure loop guard, display pack contract / loader / resolver / runtime / lock / bootstrap / surface-sync / renderer-structure / materialization / submission-minimal display surface and schema-doc contract case read `275 passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/delivery/medical-display/catalogs/medical_figure_route_cookbook.md`, `docs/delivery/medical-display/portfolio/medical_display_family_roadmap.md`, and `docs/delivery/medical-display/provenance/medical_display_anchor_paper_audit.md`; role/index review of `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`, plus live source/test evidence listed above. | `docs/docs_portfolio_consolidation.md`; `docs/delivery/medical-display/catalogs/medical_figure_route_cookbook.md`; `docs/delivery/medical-display/portfolio/medical_display_family_roadmap.md`; `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`; `docs/delivery/medical-display/provenance/medical_display_anchor_paper_audit.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `medical_figure_route_cookbook.md` now distinguishes paper-facing route families from executable MAS/OPL route ids. Dispatchable figure-route truth stays in `figure_routes.py` and the domain-handler route contract; only `figure_script_fix:<figure-id>` and `figure_illustration_program:<figure-id>` are current parseable figure-route metadata. `sidecar:<figure-id>`, autofigure and external drawing routes remain retired / fail-closed.
- `medical_display_family_roadmap.md` remains active support for the long-horizon `A-H` paper-family roadmap. Its anchor-paper recovery section now reads as post-recovery direction rather than an open figure-QA queue, and it explicitly keeps roadmap progress separate from source readiness, publication quality, submission readiness, artifact mutation, `current_package` freshness, paper closure, domain ready and production ready.
- `medical_display_anchor_paper_audit.md` remains `history_provenance` for the `001/003` closure snapshot. It now labels its authority / verification wording as closure-time provenance and prevents historical `fresh` / `clear` language from being used as current package freshness, publication quality, submission readiness, paper closure, domain ready or production ready evidence.
- `medical_display_portfolio_consolidation.md` separates route references from anchor-paper provenance in the portfolio map.

Verification / absorb:

- MAS commit `6c72f4b4 docs: mark MAS display route provenance boundaries` is on MAS `main` and aligned with `origin/main`.
- MAS verification before/after absorb: `git diff --check`; strict README/docs/contracts/tests/src/agent/profiles/scripts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused pytest `tests/test_figure_routes.py tests/test_figure_loop_guard.py tests/test_display_pack_contract.py tests/test_display_pack_loader.py tests/test_display_pack_resolver.py tests/test_display_pack_runtime.py tests/test_display_pack_lock.py tests/test_display_pack_bootstrap.py tests/test_display_pack_surface_sync.py tests/test_display_pack_renderer_structure.py tests/test_display_surface_materialization.py tests/test_submission_minimal_display_surface.py tests/display_schema_contract_cases/shap_templates_and_docs_contracts.py -q` read `275 passed`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-medical-display-route-roadmap-provenance-20260526` and branch `codex/mas-medical-display-route-roadmap-provenance-20260526` were removed after absorb. External MAS worktree `codex/visual-workbench-mas` was retained.

Archived / tombstoned / deleted docs:

- none. MAS cookbook and roadmap remain active support with distinct route-family and roadmap roles; anchor audit remains history provenance.

Unreviewed docs:

- MAS bounded medical-display delivery authority, audit protocol, catalog/inventory, template-pack lifecycle, route cookbook, roadmap and anchor-paper provenance bodies now have paragraph-level coverage entries.
- MAS product/status/workbench, progress/domain-ref projection and source/delivery shell coverage remains open outside already-covered blocks.
- OPL, RCA, MAG and App repo-wide coverage remains open outside already-recorded chunks.

Remaining stale / retire candidates:

- Future MAS route cookbook prose that treats cookbook route families as dispatchable MAS/OPL route ids, revives `sidecar:<figure-id>` / autofigure / external drawing routes, or treats figure-route metadata as artifact authority, quality verdict, source readiness, submission readiness or paper closure is stale pollution.
- Future MAS roadmap prose that turns `A-H` target families into an active execution queue, checklist-completion gate or production/domain readiness claim is stale pollution.
- Future MAS anchor-paper audit prose that uses `001/003` historical clear/fresh results as current package freshness, current workspace authority, publication quality, submission readiness, artifact mutation authorization, paper closure, domain ready or production ready evidence is stale pollution.

Next tranche write scope:

- MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside the already-covered blocks, or source/delivery shell docs that still mention artifact lifecycle, source truth or package authority.
- Or RCA product/runtime/delivery/source support docs that mention generated/default caller thinning, product-entry/session, runtimeWatch, domain_action_adapter or retired route vocabulary.
- Or the next exact OPL/MAG/App uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 07:40 CST`
Tranche: `rca-product-entry-support-current-caller`
State: `tranche_verified`

本轮覆盖 RCA product-entry support reference 三件套，并吸收回 RCA `main`。目标是把 2026-04-12 direct / hosted product-entry support brief 读回当前 live CLI/source/tests/contract truth：repo-local `redcube product` 只保留 `invoke` direct domain target；product `status` / `session` / `manifest` / `domain_action_adapter` generated/default wrapper 归 OPL generated/hosted shell；RCA 当前 target 是 direct `invokeProductEntry`、direct `getProductEntrySession` API 与 `domain-handler export|dispatch`，不是长期 generic wrapper owner。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, core docs, `docs/active/rca-ideal-state-gap-plan.md`, RCA docs-governance ledger and prior active-doc retired-alias coverage entry.
- RCA product-entry support docs: `docs/references/product-entry/redcube_product_entry_mvp.md`, `docs/references/product-entry/product_entry_session_continuity.md`, `docs/references/product-entry/opl_framework_hosted_product_entry.md`, plus role/index review of `docs/references/product-entry/README.md`.
- RCA machine/source refs: `contracts/runtime-program/redcube-product-entry-mvp.json`, `contracts/runtime-program/product-entry-session-continuity.json`, `contracts/runtime-program/opl-framework-hosted-product-entry.json`, `contracts/runtime-program/current-program.json`, `contracts/physical_source_morphology_policy.json`, `apps/redcube-cli/src/cli-parts/dispatch.ts`, `apps/redcube-cli/src/cli-parts/help.ts`, and `packages/redcube-domain-entry/src/index.ts`.
- RCA test refs: `tests/product-entry-cases/direct-and-oplHosted-entry.test.ts`, `tests/product-domain-action-api-cases/product-and-operator-surfaces.test.ts`, `tests/product-domain-action-api-cases/definitions-and-delegation.test.ts`, `tests/product-entry-cases/runtime-and-domain_action_adapter-surfaces.test.ts`, and `tests/rca-retired-surface-guard.test.ts`.
- CodeGraph evidence for product-entry live source found `invokeProductEntry`, `ProductEntryRequest`, and `ProductEntryResponse` under the RCA domain-entry / product-entry source.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full paragraph read of the three product-entry support briefs; role/index read of `docs/references/product-entry/README.md`; live source/contract/test refs listed above. | `docs/docs_portfolio_consolidation.md`; `docs/references/product-entry/redcube_product_entry_mvp.md`; `docs/references/product-entry/product_entry_session_continuity.md`; `docs/references/product-entry/opl_framework_hosted_product_entry.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `redcube_product_entry_mvp.md` now states that repo-local `redcube product` keeps only `invoke`; generated/default product wrapper surfaces belong to OPL generated/hosted shell.
- `product_entry_session_continuity.md` now states that `getProductEntrySession` is a direct API and generated session-shell continuation target, but only as refs-only entry-session domain snapshot adapter; it does not create RCA-owned generic session runtime.
- `opl_framework_hosted_product_entry.md` now points OPL generated `domain_action_adapter` descriptor/shell consumption to RCA `domain-handler export|dispatch`, replacing the obsolete `redcube product domain_action_adapter dispatch` CLI wording.
- RCA repo-local `docs/docs_portfolio_consolidation.md` records this coverage tranche and leaves runtimeWatch/runtime architecture, integration support, delivery/source support and history/reference bodies as open coverage.

Verification / absorb:

- RCA commit `70d3483 docs: align RCA product-entry support ownership` is on RCA `main` and aligned with `origin/main`.
- RCA verification before absorb: `git diff --check`; strict README/docs/contracts/tests/src/agent/profiles/scripts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused product/domain tests read `46 passed`.
- RCA tranche worktree `/Users/gaofeng/workspace/redcube-ai/.worktrees/rca-support-docs-coverage-20260526` and branch `codex/rca-support-docs-coverage-20260526` were removed after absorb.

Archived / tombstoned / deleted docs:

- none. RCA product-entry support briefs remain contract-linked support references; stale current-caller wording was corrected in place.

Unreviewed docs:

- RCA product-entry support reference bodies are now covered for current-caller / generated-wrapper ownership.
- RCA runtimeWatch / runtime architecture, integration support, delivery/source support, policies/references/history bodies remain open outside already-covered chunks.
- OPL, MAS, MAG and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future RCA support prose that treats `redcube product status/session/manifest/domain_action_adapter` as current repo-local CLI surfaces or RCA-owned wrapper owners is stale pollution.
- Future RCA prose that treats OPL-generated `domain_action_adapter` descriptor as RCA-owned generic runtime/workbench/session shell is stale pollution.
- Future session-continuity prose that implies artifact body, visual truth, memory body, review/export verdict or generic session runtime ownership moved into RCA product-entry continuity is stale pollution.

Next tranche write scope:

- RCA runtimeWatch / runtime architecture support and integration docs that mention OPL generated/default caller thinning, `domain_action_adapter`, operator projection, `runtimeWatch`, or retired route vocabulary.
- Or RCA delivery/source support docs that mention route-run records, artifact lifecycle, source truth, review/repair transport, native-helper envelope or retired route vocabulary.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 07:55 CST`
Tranche: `rca-runtimewatch-integration-support-current-caller`
State: `tranche_verified`

本轮覆盖 RCA runtimeWatch、runtime architecture 与 OPL integration support 文档中涉及 generated/default caller thinning、`domain_action_adapter`、Temporal provider、lifecycle adapter 和 runtime read-model 的当前边界，并吸收回 RCA `main`。目标是把 support reference 读回当前 live source/contracts/tests：`runtimeWatch` 是 direct review/progress refs-only read model；`runtime_watch` 已从 generated `domain_action_adapter` dispatch 退役；OPL/Temporal 持有 provider-backed scheduling / wakeup / retry-dead-letter / query projection，但不持有 RCA visual truth、review/export verdict、canonical artifacts、visual memory body 或 owner receipt authority。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, core docs, `docs/active/rca-ideal-state-gap-plan.md`, and RCA docs-governance ledger.
- RCA support docs: `docs/runtime/README.md`, `docs/runtime/runtime_architecture.md`, `docs/references/integration/lightweight-product-entry-and-opl-handoff.md`, `docs/references/integration/opl-family-contract-adoption.md`.
- RCA machine/source refs: `packages/redcube-domain-entry/src/actions/run-review-ref-projection.ts`, `packages/redcube-domain-entry/src/index.ts`, `packages/redcube-domain-entry/src/actions/domain-handler.ts`, `packages/redcube-domain-entry/src/actions/domain-action-adapter-parts/domain_action_adapter-export-projection.ts`, `packages/redcube-domain-entry/src/actions/domain-action-adapter-parts/temporal-autonomy-readiness.ts`, `apps/redcube-cli/src/cli-parts/dispatch.ts`, `apps/redcube-cli/src/cli-parts/help.ts`, `contracts/runtime-program/current-program.json`, `contracts/runtime-program/current-program-parts/current_state/active_baton/scope/privatized_functional_module_audit/retired_no_resurrection_guards.json`, and `contracts/production_acceptance/rca-production-acceptance.json`.
- RCA test refs: `tests/product-entry-cases/runtime-and-domain_action_adapter-surfaces.test.ts`, `tests/product-entry-cases/temporal-autonomy-readiness.test.ts`, `tests/family-parity-governance-surface.test.ts`, `tests/product-domain-action-api-cases/definitions-and-delegation.test.ts`, and `tests/rca-retired-surface-guard.test.ts`.
- CodeGraph context was attempted for runtimeWatch/domain handler, but its returned path set was stale against live filesystem; this tranche used live filesystem/source/tests as semantic authority.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full paragraph read of `docs/runtime/README.md`, `docs/runtime/runtime_architecture.md`, `docs/references/integration/lightweight-product-entry-and-opl-handoff.md`, `docs/references/integration/opl-family-contract-adoption.md`; live source/contract/test refs listed above. | `docs/docs_portfolio_consolidation.md`; `docs/references/integration/lightweight-product-entry-and-opl-handoff.md`; `docs/references/integration/opl-family-contract-adoption.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `runtimeWatch` remains RCA direct API / review-progress read model with `RUNTIME_WATCH_BOUNDARY` classification `refs_only_read_model`; it exports run, artifact, review, typed blocker, operator evidence and telemetry refs, and explicitly does not own generic supervisor, runner, attempt ledger, session runtime, workbench, visual truth, artifact blob, memory body or production-soak claim.
- `domain-handler export|dispatch` remains the current RCA target consumed by OPL-generated descriptor/shells. `redcube product` keeps only `invoke`; product `status/session/manifest/domain_action_adapter` repo-local CLI defaults remain retired as generated/default wrapper responsibilities.
- `runtime_watch` remains forbidden as MCP / generated `domain_action_adapter` default dispatch. OPL runtime queries target status/workbench runtime read-model; RCA keeps direct `runtimeWatch` for review/progress refs.
- `temporal_autonomy_readiness` allows OPL/Temporal hosted autonomy and long-time scheduling, while `production_visual_stage_long_soak_complete=false`; provider completion is not visual ready, exportable, handoffable or production-soak complete.
- `opl_family_lifecycle_adapter` wording now says refs-only lifecycle adoption projection instead of RCA-owned generic lifecycle adapter.

Verification / absorb:

- RCA commit `6df6721 docs: align runtimeWatch integration support` is on RCA `main` and aligned with `origin/main`.
- RCA verification before absorb: `npm run --silent build`; focused runtime/domain tests `node --experimental-strip-types --test tests/product-entry-cases/runtime-and-domain_action_adapter-surfaces.test.ts tests/product-entry-cases/temporal-autonomy-readiness.test.ts tests/family-parity-governance-surface.test.ts tests/product-domain-action-api-cases/definitions-and-delegation.test.ts tests/rca-retired-surface-guard.test.ts` read `34 passed`; `git diff --check`; strict README/docs/contracts/tests/src/agent/profiles/scripts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- RCA tranche worktree `/Users/gaofeng/workspace/redcube-ai/.worktrees/rca-runtimewatch-support-coverage-20260526` and branch `codex/rca-runtimewatch-support-coverage-20260526` were removed after absorb. External RCA worktree `codex/fallow-rca-20260526` was retained.

Archived / tombstoned / deleted docs:

- none. The integration support docs remain active support references; stale lifecycle/runtime ownership wording was corrected in place.

Unreviewed docs:

- RCA runtimeWatch/runtime architecture and the two integration support docs are now covered for current-caller / generated-wrapper / Temporal provider authority wording.
- RCA delivery/source support, policy support, remaining reference bodies and history/provenance bodies remain open outside already-covered chunks.
- OPL, MAS, MAG and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future RCA support wording that treats `runtime_watch` as generated `domain_action_adapter` dispatch, public MCP default wrapper, or RCA repo-local generic supervision/session/workbench caller is stale pollution.
- Future RCA wording that treats OPL provider completion, structural conformance, refs-only projection or `temporal_autonomy_readiness` as RCA visual ready, exportable, handoffable, production ready or production visual-stage long-soak complete is stale pollution.
- Future lifecycle-adapter wording that makes RCA owner of generic runner, attempt ledger, queue, workbench, session shell or lifecycle runtime is stale pollution.

Next tranche write scope:

- RCA delivery/source support docs that mention route-run records, artifact lifecycle, source truth, review/repair transport, native-helper envelope or retired route vocabulary.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Or the next exact OPL/MAG/App uncovered body from the family coverage ledger.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 08:25 CST`
Tranche: `rca-delivery-source-authority-boundary`
State: `tranche_verified`

本轮覆盖 RCA delivery/source support 文档中容易被读成 readiness proof 或 authority transfer 的边界语句，并吸收回 RCA `main`。目标是把 `source augmentation`、delivery examples、route/proof/export support 读回当前 live source/contracts/tests：source augmentation 只更新 canonical source truth 与 source readiness report；delivery docs/examples 只提供 family / route / proof / export 读者上下文；最终 visual ready、exportable、handoffable、artifact authority 和 review/export verdict 仍来自 RCA-owned review/export gates、workspace artifacts、artifact manifests、review/export receipts 与 owner receipts。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, core docs, `docs/active/rca-ideal-state-gap-plan.md`, `docs/references/rca-visual-deliverable-agent-ideal-state.md`, and RCA docs-governance ledger.
- RCA source/delivery support docs: `docs/source/README.md`, `docs/source/source_augmentation_executor_contract.md`, `docs/delivery/README.md`, `docs/delivery/deliverable_examples.md`, `docs/delivery/html-ppt-route-quality.md`, `docs/delivery/image-first-ppt-production-route.md`, `docs/delivery/native-ppt-proof-environment.md`, `docs/delivery/real-route-evolution-probe.md`.
- RCA machine/source refs: source augmentation request/result/execution/executor/research runtime files, CLI `source` dispatch, `runDeliverableRoute`, `contracts/production_acceptance/rca-production-acceptance.json`, `contracts/runtime-program/ppt-html-route-quality-nonregression.json`, and `contracts/runtime-program/ppt-image-first-production-route.json`.
- RCA tests: `tests/source-research.test.ts`, `tests/source-intake.test.ts`, `tests/source-intake-cases/augmentation-execution.test.ts`, `tests/real-route-evolution-probe.test.ts`, `tests/runtime-deliverable-route-cases/cache-liveness-and-repeat-blocks.test.ts`, `tests/ppt-html-route-quality-nonregression.test.ts`, `tests/render-html-guardrails.test.ts`, plus delivery E2E references.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full paragraph read of `docs/source/README.md`, `docs/source/source_augmentation_executor_contract.md`, `docs/delivery/README.md`, `docs/delivery/deliverable_examples.md`, `docs/delivery/html-ppt-route-quality.md`, `docs/delivery/image-first-ppt-production-route.md`, `docs/delivery/native-ppt-proof-environment.md`, `docs/delivery/real-route-evolution-probe.md`; live source/contract/test refs listed above. | `docs/source/README.md`; `docs/source/source_augmentation_executor_contract.md`; `docs/delivery/README.md`; `docs/delivery/deliverable_examples.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Fresh semantic result:

- `source intake -> source augment -> source execute-augmentation` and `source research` are current source readiness surfaces. `external_command` and `result_file` adapters are strict contract consumers; invalid request/result, unsupported adapter, missing result file or unconfigured executor return explicit blocked reports instead of silent success.
- Valid source augmentation writes canonical source artifacts and a source augmentation report. Its `planning_ready` means source truth can support downstream Storyline / Plan consumption; it is not visual ready, exportable, handoffable, domain ready, production ready or production visual-stage long-soak complete.
- Delivery route docs remain active support: image-first is default for `ppt_deck`; HTML and native PPTX are explicit optional routes; proof runners and examples explain route behavior but do not replace `visual_director_review`, `screenshot_review`, `export_pptx`, review/export receipts or owner receipts.
- OPL / generated shell and Agent Lab can consume refs-only source, route, quality, cache and suite input refs; they cannot write artifact body, visual truth, review/export verdict, visual memory body, owner receipt body, or authorize artifact authority / review-export readiness.

Verification / absorb:

- RCA commit `581b7ac docs: clarify RCA delivery source authority` is on RCA `main`. RCA `main` is ahead of `origin/main` by this doc commit plus pre-existing external test commit `344d3f7 test: narrow retired surface guards`.
- RCA verification before absorb and after rebase onto local `main`: `npm run --silent build` passed; focused tests `node --experimental-strip-types --test tests/source-research.test.ts tests/source-intake.test.ts tests/real-route-evolution-probe.test.ts tests/runtime-deliverable-route-cases/cache-liveness-and-repeat-blocks.test.ts tests/ppt-html-route-quality-nonregression.test.ts tests/render-html-guardrails.test.ts` read `51 passed`; `git diff --check`; strict README/docs/contracts/tests/src/agent/profiles/scripts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.

Archived / tombstoned / deleted docs:

- none. The delivery/source docs remain active support references; stale authority ambiguity was corrected in place.

Unreviewed docs:

- RCA delivery/source support docs listed above are now covered for source readiness, route/proof/example and review/export authority wording.
- RCA policy support, remaining reference bodies and history/provenance bodies remain open outside already-covered chunks.
- OPL, MAS, MAG and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future wording that treats source augmentation `planning_ready`, delivery examples, proof runner success, route cache, Agent Lab suite score or OPL refs-only projection as RCA visual ready, exportable, handoffable, domain ready, production ready or production visual-stage long-soak complete is stale pollution.
- Future wording that lets source augmentation, OPL generated shell, Agent Lab or proof examples write artifact body, visual truth, review/export verdict, visual memory body, owner receipt body or artifact authority is stale pollution.
- Future support wording that turns HTML/native optional routes into hidden fallback chains or weakens image-first default route / review-export gates is stale pollution.

Next tranche write scope:

- RCA policy support docs that mention visual memory, AI-first route authority, review/export memory or deliverable contract model.
- Or remaining RCA references/history bodies with old managed/gateway/runtime/session/domain_action_adapter vocabulary, after confirming current role and no-resurrection boundaries from live contracts/tests.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 08:27 CST`
Tranche: `rca-policy-support-visual-memory-boundary`
State: `tranche_verified_scope_pending`

本轮覆盖 RCA policy support 文档中与 AI-first、deliverable contract、runtime operating model、TypeScript migration 和 visual pattern memory 相关的长期规则。目标是把 policy support 读回 current RCA contracts/tests/source：policy 可以固定人读治理边界，但不能把 OPL / Agent Lab / generated shell / product projection / mechanical scorecard 写成 RCA visual truth、route choice、review/export verdict、artifact authority、visual memory body、domain ready 或 production ready owner。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/active/rca-ideal-state-gap-plan.md`, `docs/references/rca-visual-deliverable-agent-ideal-state.md`, and RCA docs-governance ledger.
- RCA policy docs: `docs/policies/README.md`, `docs/policies/ai_first_quality_boundary.md`, `docs/policies/deliverable_contract_model.md`, `docs/policies/runtime_operating_model.md`, `docs/policies/typescript_migration_policy.md`, `docs/policies/visual_pattern_memory_policy.md`.
- RCA machine/source refs: `contracts/memory_descriptor.json`, `contracts/production_acceptance/rca-production-acceptance.json`, `contracts/functional_privatization_audit.json`, `contracts/pack_compiler_input.json`, `contracts/stage_control_plane.json`, `contracts/runtime-program/js-residue-line-lock.json`, `contracts/runtime-program/typescript-package-build-contract.json`, plus AI-first review helper source surfaced by CodeGraph.
- RCA test refs: `tests/ai-first-authoring-boundary.test.ts`, `tests/screenshot-review-ai-first.test.ts`, `tests/ppt-creative-ownership.test.ts`, `tests/xiaohongshu-creative-ownership.test.ts`, `tests/poster-creative-ownership.test.ts`, `tests/review-platform.test.ts`, `tests/product-entry-cases/domain-memory-ref-adapter.test.ts`, `tests/rca-production-acceptance.test.ts`, TypeScript closeout / baseline / package / service-boundary tests.

Fresh semantic result:

- AI-first quality, runtime operating model, deliverable contract model and TypeScript migration policy already matched live boundaries: final visual/review/export judgment remains RCA-owned and AI-first; TypeScript remains default implementation surface with repo-tracked JS retired to zero product-source budget.
- Visual pattern memory policy was the only policy with lifecycle drift: it was still an English dated process note with Now/Next/Defer framing. It is now a Chinese current policy that states owner/purpose/state/machine boundary, `descriptor_proof_contract_landed_runtime_writeback_pending`, locator-only OPL boundary, and the remaining evidence tail.
- `contracts/memory_descriptor.json` and `tests/product-entry-cases/domain-memory-ref-adapter.test.ts` prove OPL consumes domain-memory locator / receipt refs only; OPL cannot write memory body, choose route, accept/reject writeback, issue review/export verdict or mutate artifacts.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full paragraph read of all six `docs/policies/*.md`; live contract/test/source refs listed above. | `docs/policies/visual_pattern_memory_policy.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Archived / tombstoned / deleted docs:

- none. RCA policy support docs remain active support/current policy; stale process framing in visual memory policy was rewritten in place.

Unreviewed docs:

- RCA policy support docs are now covered for AI-first, route/review/export authority, visual memory locator/writeback boundary, TypeScript migration and production-readiness wording.
- RCA remaining reference bodies and history/provenance bodies remain open outside already-covered chunks.
- OPL, MAS, MAG and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future RCA policy/support wording that lets OPL, Agent Lab, product shell, generated wrapper, memory descriptor, mechanical scorecard or projection authorize RCA visual ready, exportable, handoffable, domain ready, production ready, route choice, artifact mutation or review/export verdict is stale pollution.
- Future visual memory wording that writes memory body, current deliverable content, review verdict, export truth, artifact state or hidden layout recipe into memory is stale pollution.
- Future TypeScript policy wording that reopens repo-tracked JS implementation/test/script surfaces without explicit contract and audit support is stale pollution.

Next tranche write scope:

- Continue RCA remaining references/history bodies with old managed/gateway/runtime/session/domain_action_adapter vocabulary, after confirming current role and no-resurrection boundaries from live contracts/tests.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 08:45 CST`
Tranche: `rca-hermes-history-provenance-no-resurrection`
State: `tranche_verified_scope_pending`

本轮覆盖 RCA `docs/history/hermes/` history/provenance 文档，目标是把 repo-local Hermes migration line、upstream `Hermes-Agent` proof lane、service-safe domain entry proof、historical blocker / closeout 继续锁在 provenance 语境，避免旧 `Hermes-backed`、`managed runtime`、`current/next/cutover` wording 回流成当前 default runtime owner、public entry、generated/default caller、production readiness 或 RCA-owned generic runtime shell。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/rca-ideal-state-gap-plan.md`, RCA `docs/docs_portfolio_consolidation.md`。
- RCA `docs/history/README.md`, `docs/history/hermes/README.md`, and all 11 `docs/history/hermes/*.md` provenance bodies。
- RCA `contracts/runtime-program/current-program.json` and runtime-program leaf refs around provider-backed OPL hosting, default `Codex CLI` route policy, `domain-handler export|dispatch`, retired `domain_action_adapter` dispatch tombstones, functional privatization and default-caller deletion evidence。

Fresh semantic result:

- 11 个 Hermes history 正文都已有 `Owner` / `Purpose` / `State` / `Machine boundary` 和 history/provenance note；其中保留的旧 `当前状态`、`下一步`、`cutover` 或 `current target` wording 按原始 tranche date / proof lane 读取。
- 需要治理的是目录索引：`docs/history/hermes/README.md` 原本 English-first 且过薄，未逐份说明历史 brief 的当前读法。现在已改成中文 canonical history index，列出 current truth owner refs、每份 brief 的历史角色 / 当前读法，以及 no-resurrection boundary。
- 当前 RCA 默认仍是 direct RedCube entry + OPL-hosted provider integration + `Codex CLI` first-class concrete executor；`Hermes-Agent` 只作为 explicit optional / proof backend、executor adapter evaluation、diagnostic 或历史参考读取。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full paragraph read of `docs/history/hermes/README.md` and all 11 `docs/history/hermes/*.md` bodies; role read of `docs/history/README.md`; live contract/core-doc refs listed above. | `docs/history/hermes/README.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Archived / tombstoned / deleted docs:

- none. Hermes history bodies remain provenance/proof records; directory-level index now carries the missing canonical read, so no body-level rewrite or doc move was needed.

Unreviewed docs:

- RCA `docs/history/hermes/` bodies are now covered for current owner, historical role and no-resurrection boundaries.
- RCA remaining reference bodies and non-Hermes history/provenance bodies remain open outside already-covered chunks.
- OPL, MAS, MAG and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future RCA prose that treats Hermes history proof lane, repo-local `Hermes`, upstream `Hermes-Agent`, `managed runtime`, `runManagedDeliverable / getManagedRun / superviseManagedRun`, historical cutover board or historical closeout as current default runtime owner, public identity, generated/default caller, generic session/workbench/runtime shell, domain ready, production ready, visual ready, exportable or handoffable is stale pollution.
- Any current rule still embedded only in a Hermes history body must be extracted to core docs, active gap plan, runtime/delivery/source/policy owner docs, machine-readable contracts or source/test surface before being relied on.

Next tranche write scope:

- Continue RCA remaining references and non-Hermes history bodies with old managed/gateway/runtime/session/domain_action_adapter vocabulary, after confirming current role and no-resurrection boundaries from live contracts/tests.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 08:54 CST`
Tranche: `rca-phase-2-history-provenance-index`
State: `tranche_verified_scope_pending`

本轮覆盖 RCA `docs/history/phase-2/` history/provenance 文档，目标是把 absorbed Phase 2 tranche、continuation board、proof lane、manual-test brief、HTML/native route closeout 继续锁在 provenance / proof 语境，并明确当前 truth 回到核心五件套、active gap plan、runtime/delivery/source/policy owner docs 和 machine-readable contracts。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/rca-ideal-state-gap-plan.md`, RCA `docs/docs_portfolio_consolidation.md`。
- RCA `docs/history/README.md`, `docs/history/phase-2/README.md`, and all 17 `docs/history/phase-2/*.md` bodies。
- RCA `contracts/runtime-program/current-program.json`, Phase 2 runtime-program contracts, `ppt-image-first-production-route.json`, `ppt-native-authoring-proof-lane.json`, current-program leaf refs for source intake, publication projection, native PPT operator UX, `runtimeWatch`, retired `domain_action_adapter` tombstones, physical morphology and default-caller deletion evidence。

Fresh semantic result:

- 17 个 Phase 2 history 正文都已有 `Owner` / `Purpose` / `State` / `Machine boundary` 或 first-screen lifecycle note；其中保留的旧 `当前状态`、`Backlog`、`下一步`、`停车结论` 或 closeout wording 按原始 tranche context 读取。
- 需要治理的是目录索引：`docs/history/phase-2/README.md` 原本已有生命周期规则，但仍是 English-first title 和裸文件清单。现在已改成中文 canonical history index，列出 current truth owner refs、每份 brief 的历史角色 / 当前读法，以及 stale wording / no-resurrection boundary。
- 唯一带 current support 语义的 Phase 2 brief 是 `phase_2_ppt_native_authoring_proof_lane.md`：它仍支持 optional native editable PPTX route；默认 PPT 路线仍是 image-first，native PPTX 不绕过 source truth、review、`runtimeWatch` 或 export gate。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full paragraph read of `docs/history/phase-2/README.md` and all 17 `docs/history/phase-2/*.md` bodies; role read of `docs/history/README.md`; live contract/core-doc refs listed above. | `docs/history/phase-2/README.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | this coverage ledger |

Archived / tombstoned / deleted docs:

- none. Phase 2 history bodies remain provenance/proof records; directory-level index now carries the missing per-brief canonical read, so no body-level rewrite or doc move was needed.

Unreviewed docs:

- RCA `docs/history/phase-2/` bodies are now covered for current owner, historical role, current optional-route support and no-resurrection boundaries.
- RCA remaining reference bodies and non-Hermes/non-Phase-2 history bodies remain open outside already-covered chunks.
- OPL, MAS, MAG and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future RCA prose that treats Phase 2 history, continuation boards, old manual-test brief, old HTML lane closeout, old `gateway` / `harness` / `managed` wording, or old OPL-hosted runtime language as current default runtime owner, active backlog, generated/default caller, public identity, visual ready, exportable, handoffable, domain ready, production ready or production visual-stage long-soak evidence is stale pollution.
- Any current rule still embedded only in a Phase 2 history body must be extracted to core docs, active gap plan, runtime/delivery/source/policy owner docs, machine-readable contracts or source/test surface before being relied on.

Next tranche write scope:

- Continue RCA `docs/history/plans/`, `docs/history/positioning/`, `docs/history/runtime/`, `docs/history/tombstones/` and uncovered reference bodies with old managed/gateway/runtime/session/domain_action_adapter vocabulary.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 09:10 CST`
Tranche: `rca-history-plans-runtime-tombstone-index`
State: `tranche_verified`

本轮覆盖 RCA `docs/history/plans/`、`docs/history/positioning/`、`docs/history/runtime/` 与 `docs/history/tombstones/` 的 history/provenance 入口读法，并吸收回 RCA `main`。目标是把剩余非 Hermes、非 Phase 2 的历史计划、历史定位、历史 managed-runtime owner-boundary 和 tombstone 继续锁在 provenance / no-resurrection 语境，避免旧 `managed`、`gateway`、`frontdoor`、`federation`、`upstream Hermes`、`current/next/backlog` 或 `domain_action_adapter` wording 回流成当前 runtime owner、active backlog、generated/default caller、visual readiness、artifact authority 或 production readiness。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `docs/history/README.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/rca-ideal-state-gap-plan.md`, `docs/references/rca-visual-deliverable-agent-ideal-state.md`, and RCA `docs/docs_portfolio_consolidation.md`.
- RCA history docs: `docs/history/plans/README.md`, all 8 `docs/history/plans/*.md` bodies by lifecycle header / heading / stale-term risk map, `docs/history/positioning/README.md`, `docs/history/positioning/domain-harness-os-positioning.md`, `docs/history/runtime/opl-managed-runtime-three-layer-contract.md`, `docs/history/tombstones/README.md`, and both `docs/history/tombstones/*.md` bodies.
- RCA machine refs: `contracts/runtime-program/current-program.json`, `contracts/production_acceptance/rca-production-acceptance.json`, `contracts/functional_privatization_audit.json`, and `contracts/runtime-program/current-program-parts/current_state/active_baton/scope/privatized_functional_module_audit/retired_no_resurrection_guards.json`.

Fresh semantic result:

- `docs/history/plans/README.md` now maps each historical plan to its current read and states that `当前状态`、`下一步`、`Backlog`、`planned`、`done` and `deferred` headings are date-bound historical wording.
- `docs/history/positioning/README.md` now states that `Domain Harness OS` / `Domain Gateway` are historical positioning terms; RCA public identity remains the visual-deliverable domain agent, while OPL-hosted path consumes refs without owning visual truth, review/export verdict, artifact body, memory body or owner receipt body.
- `docs/history/runtime/opl-managed-runtime-three-layer-contract.md` now has a first-screen current-read guard: `managed runtime / session / run / watch / resume owner` is historical owner-boundary wording; current truth is OPL provider-backed stage runtime / attempt ledger / queue / wakeup / projection, with Temporal as required production online substrate and Codex CLI as first-class executor.
- `docs/history/tombstones/README.md` now carries explicit no-resurrection boundaries for `gateway` / `harness`, `managed`, and `Hermes` / `Hermes-Agent`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full read of `docs/history/plans/README.md`, `docs/history/positioning/README.md`, `docs/history/runtime/opl-managed-runtime-three-layer-contract.md`, `docs/history/tombstones/README.md` and tombstone bodies; lifecycle-header / heading / stale-term risk-map pass across all `docs/history/plans/*.md` bodies and `docs/history/positioning/domain-harness-os-positioning.md`; live contract refs listed above. | `docs/docs_portfolio_consolidation.md`, `docs/history/plans/README.md`, `docs/history/positioning/README.md`, `docs/history/runtime/opl-managed-runtime-three-layer-contract.md`, `docs/history/tombstones/README.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The governed docs remain history/provenance/tombstone surfaces; the correction was missing directory/current-read and no-resurrection guidance, not a doc-path retirement.

Unreviewed docs:

- RCA `docs/history/plans/`, `docs/history/positioning/`, `docs/history/runtime/` and `docs/history/tombstones/` are now covered at index/no-resurrection level. Large historical plan bodies remain provenance bodies; they were risk-mapped for lifecycle header, headings and stale terms, but not rewritten paragraph by paragraph in this tranche.
- RCA uncovered reference bodies remain open, especially `docs/references/README.md`, `docs/references/domain_memory_descriptor_locator.md`, `docs/references/governance/series-doc-governance-checklist.md`, `docs/references/product-entry/*.md`, and `docs/references/rca_executor_routing_config.md`.
- OPL, MAS, MAG, OMA and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future RCA prose that treats historical plans, historical positioning, managed runtime three-layer wording, tombstone ids, old `gateway` / `harness` / `frontdoor` / `federation` / `managed` / `Hermes` / `domain_action_adapter` wording or historical checklist headings as current default runtime owner, active backlog, generated/default caller, public identity, visual ready, exportable, handoffable, domain ready, production ready or production visual-stage long-soak evidence is stale pollution.
- Any current rule still embedded only in a historical plan body should be extracted to the correct owner doc or machine surface before being relied on.

Verification / absorb:

- RCA commit `d40eba3 docs: clarify RCA history no-resurrection indexes` is on RCA `main`.
- RCA verification before absorb: `git diff --check`; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; strict README/docs/contracts/tests/src/agent/profiles/scripts conflict-marker scan had no hits.
- RCA tranche worktree `/tmp/rca-history-runtime-coverage-20260526` and branch `codex/rca-history-runtime-coverage-20260526` were removed after absorb.
- OPL safe cleanup also removed already-merged, clean, no-recent-write worktree `/Users/gaofeng/workspace/one-person-lab/.worktrees/codex-dm002-temporal-terminal-first-20260526` and branch `codex/dm002-temporal-terminal-first-20260526`.

Next tranche write scope:

- RCA uncovered reference bodies with old managed/gateway/runtime/session/domain_action_adapter vocabulary, after confirming current role and no-resurrection boundaries from live contracts/tests.
- Or MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Keep App docs delayed until active release/GUI lanes are safe to govern.

Date: `2026-05-26 15:28 CST`
Tranche: `mag-thin-support-index-local-ledger`
State: `tranche_verified`

本轮把 MAG thin support index 覆盖结果补写回 `med-autogrant` repo-local docs portfolio，而不是重新扩大 MAG 全仓覆盖范围。此前全局 ledger 已记录 `mag-specs-thin-index-coverage` 覆盖 MAG `docs/product/README.md`、`docs/runtime/README.md`、`docs/delivery/README.md`、`docs/source/README.md` 与 `docs/policies/README.md`；本轮补齐的是 MAG 本仓 `docs/docs_portfolio_consolidation.md` 中缺失的 coverage ledger，让本地治理入口也能说明这些目录当前保持 thin support role。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/references/med-auto-grant-ideal-state.md`, and `docs/docs_portfolio_consolidation.md`.
- MAG thin support indexes: `docs/product/README.md`, `docs/runtime/README.md`, `docs/delivery/README.md`, `docs/source/README.md`, `docs/policies/README.md`.
- MAG machine/source refs: `contracts/runtime-program/current-program.json`, `contracts/private_functional_surface_policy.json`, `contracts/production_acceptance/mag-production-acceptance.json`, `contracts/runtime-program/opl-family-contract-adoption.json`, `MedAutoGrantDomainEntry`, `MagDomainRuntime.describe_topology()`, `build_product_entry_manifest()`, `build_domain_handler_export()`, `build_source_provenance_surface()`, and `build_opl_substrate_adapter_export()`.

Fresh semantic result:

- The five MAG thin support indexes already carry owner / purpose / state / machine-boundary headers and remain valid active support indexes.
- No runtime owner, source truth, delivery authority, policy owner or product-entry authority leakage was found.
- `MagDomainRuntime.describe_topology()` and current runtime contracts keep OPL/Temporal as runtime owner; MAG stays grant-domain handler, refs-only projection, owner receipt, typed blocker and authority-ref owner.
- `build_source_provenance_surface()` and domain handler export keep OPL source consumption body-free and refs-only.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of `docs/product/README.md`, `docs/runtime/README.md`, `docs/delivery/README.md`, `docs/source/README.md`, `docs/policies/README.md`; role read of MAG local docs portfolio and live contract/source refs listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The five directories currently only contain README indexes; thin support state is intentional and current.

Unreviewed docs:

- This local-ledger catch-up does not close additional MAG whole-repo docs beyond the earlier `mag-specs-thin-index-coverage` tranche. MAG remaining support/reference/history body coverage stays governed by the global ledger and later tranche scopes.
- OPL, MAS, RCA and App repo-wide coverage remains open outside already-recorded chunks; OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Future MAG prose in these directories must not promote thin indexes into second active truth, MAG-owned generic runtime/workbench/scheduler, retired route families, legacy alias shells, or production/domain readiness claim.
- Future source/delivery/product/runtime support prose must continue to point to contracts/source/CLI/read-model surfaces for machine truth and keep grant truth, verdicts, package bodies, memory bodies and owner receipt authority inside MAG-owned boundaries.

Verification / absorb:

- MAG commit `68bf945 docs: record MAG support index coverage` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; MAG CLI help succeeded through `scripts/run-python-clean.sh`.

Next tranche write scope:

- Continue with the next uncovered exact body from the global coverage ledger, with good candidates being RCA uncovered references, MAS product/status/workbench and progress/domain-ref projection shell reconciliation, or App docs after active release/GUI lanes are safe.

Date: `2026-05-26 16:10 CST`
Tranche: `mas-mainline-reference-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/references/mainline/*.md` 七份 mainline support/reference 文档，并把结果吸收回 MAS `main`。目标是把 quality/autonomy、AI-first Research OS、ARS / nature-skills learning intake、modularity、test-lane governance 和旧 repair-priority map 统一固定为 support reference / dated snapshot / external pattern provenance，而不是 current active queue、runtime truth、publication readiness、artifact authority、domain ready 或 production ready。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, `docs/references/README.md`, `docs/active/mas-ideal-state-gap-plan.md`, and MAS `docs/docs_portfolio_consolidation.md`.
- MAS mainline docs: `docs/references/mainline/ai_first_research_os_architecture.md`, `ars_learning_intake.md`, `nature_skills_learning_intake.md`, `mas_single_project_quality_and_autonomy_mainline.md`, `mas_modularity_assessment_2026_05_07.md`, `project_repair_priority_map.md`, `test_lane_governance_2026_05_08.md`.
- MAS machine/source refs: `src/med_autoscience/ars_learning_projection.py`, `contracts/opl-framework/family-contract-adoption.json#academic_research_skills_learning_projection`, `src/med_autoscience/stage_quality_contract.py`, `contracts/stage_control_plane.json`, `contracts/test-lane-manifest.json`, `contracts/action_catalog.json`, `src/med_autoscience/controllers/mainline_status.py`, `src/med_autoscience/controllers/module_boundary_audit.py`, and `src/med_autoscience/controllers/architecture_owner_boundary.py`.
- CodeGraph context / explore for `build_ars_learning_projection`, `build_stage_quality_pack_contract`, `read_mainline_status`, `build_module_boundary_audit_report`, and `build_architecture_owner_boundary_report`.

Fresh semantic result:

- ARS and nature-skills references remain clean-room / external-pattern learning surfaces. Live projection and quality-pack contracts keep them descriptor/ref/freshness/locator only, with no vendor dependency, runtime provider, publication gate, quality verdict, submission readiness or artifact authority.
- `project_repair_priority_map.md` and `test_lane_governance_2026_05_08.md` already route current execution and durable lane intent back to active plan / contracts / test-lane manifest.
- `mas_single_project_quality_and_autonomy_mainline.md` was tightened so “当前 tranche” language is explicitly the formation-time tranche and not the current active execution queue.
- `mas_modularity_assessment_2026_05_07.md` was tightened so 2026-05-08 Sentrux / boundary-fitness / hub-role evidence is dated support and not a permanent quality budget or current completion proof.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all seven `docs/references/mainline/*.md` files; boundary review against ARS projection, family contract adoption, stage quality pack, stage control plane, test-lane manifest, mainline status, module boundary audit and architecture owner boundary surfaces. | `docs/references/mainline/mas_single_project_quality_and_autonomy_mainline.md`; `docs/references/mainline/mas_modularity_assessment_2026_05_07.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The mainline references still carry useful support/provenance roles; stale risk was corrected in place.

Unreviewed docs:

- MAS `docs/references/mainline/*.md` is now covered at paragraph level for the current inventory.
- MAS runtime/control support docs under `docs/runtime/contracts/**` / `docs/runtime/control/**`, and product/status/workbench / progress/domain-ref projection shell docs outside already-covered blocks, remain open.
- OPL, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche; MAG/RCA coverage remains as recorded in compacted ledger scope and later RCA chunks.

Remaining stale / retire candidates:

- Future MAS mainline prose that adds undated “current tranche”, “fresh evidence”, phase checklist, Sentrux numbers, collected test counts or repair priority language is stale pollution unless explicitly bounded as support/reference.
- Modularity/test-lane snapshots must not be used as current source-shape completion, production readiness, domain readiness, physical-delete authorization, permanent test budget or substitute for repo-native verification.

Verification / absorb:

- MAS commit `61f770a2 docs: cover MAS mainline references` is on MAS `main`.
- MAS verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- MAS tranche worktree `/Users/gaofeng/workspace/med-autoscience/.worktrees/codex/mas-runtime-artifact-contract-docs-20260526` and branch `codex/mas-runtime-artifact-contract-docs-20260526` were removed after fast-forward absorb.
- MAS main has unrelated external dirty source edits retained; this tranche only changed documentation files.

Next tranche write scope:

- Continue MAS runtime/control support docs under `docs/runtime/contracts/**` / `docs/runtime/control/**`, or MAS product/status/workbench/progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Or choose RCA uncovered reference bodies or App docs once active release/GUI lanes are safe to govern.

Date: `2026-05-26 16:32 CST`
Tranche: `mas-journal-package-design-currentness`
State: `tranche_verified`

本轮覆盖 MAS `docs/runtime/designs/journal_package_builtins_upgrade_design.md`，并把结果吸收回 MAS `main`。目标是把该 runtime design support 文档从早期“待新增 controller / workflow”读法收敛到当前 live source/test 事实：`journal_requirements`、`journal_package`、publication gate 状态解析与 supervisor sync 已落地；文档继续保留为设计边界支撑，不能重新打开已落地 checklist，也不能把 target-specific projection 写成最终投稿 ready、publication ready、quality verdict 或 artifact authority。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, MAS `docs/docs_portfolio_consolidation.md`, and `docs/history/program/journal_package_builtins_upgrade_plan.md`.
- MAS design doc: `docs/runtime/designs/journal_package_builtins_upgrade_design.md`.
- MAS source / CLI refs: `src/med_autoscience/journal_requirements.py`, `src/med_autoscience/controllers/journal_requirements.py`, `src/med_autoscience/controllers/journal_package.py`, `src/med_autoscience/controllers/publication_gate_parts/state_resolvers.py`, `src/med_autoscience/controllers/publication_gate_parts/report_builders.py`, `src/med_autoscience/controllers/publication_gate_parts/supervisor_and_cli.py`, `src/med_autoscience/cli.py`, and `src/med_autoscience/cli_parts/parser.py`.
- MAS support docs: `docs/delivery/inspection_package.md` and `docs/runtime/contracts/delivery_plane_contract_map.md`.
- Focused tests: `tests/test_journal_requirements_controller.py`, `tests/test_journal_package_controller.py`, `tests/test_publication_gate_cases/drift_and_state_cases.py`, `tests/test_publication_gate_cases/supervisor_cases.py`, `tests/test_cli_cases/public_entry_commands.py`, and `tests/test_cli_cases/domain_handler_and_submission_commands.py`.
- CodeGraph context / explore for `resolve_journal_requirements`, `materialize_journal_package`, `resolve_journal_requirement_state`, `resolve_journal_package_state`, publication gate sync and `submission_packages/<journal_slug>`.

Fresh semantic result:

- `publication resolve-journal-requirements` and `publication materialize-journal-package` are current CLI/controller surfaces, not future design proposals.
- `journal_requirements` writes study-local durable `paper/journal_requirements/<journal_slug>/requirements.json` / `.md`; source authority still depends on official guideline URL and structured payload provenance.
- `materialize_journal_package` writes shallow `submission_packages/<journal_slug>/`, `audit/submission_manifest.json`, `audit/journal_requirements_snapshot.json`, target-confirmation metadata, formatting boundary and zip; unconfirmed targets remain `journal_targeted_projection`.
- publication gate reports `journal_requirements_status`, `journal_package_status`, missing-package blockers and can materialize stale/missing package when requirements are resolved.
- Inspection package remains human-inspection-only and must not call journal package materialization; journal package projection also does not authorize `current_package`, publication eval, controller decisions, final submission or quality gate closure.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/designs/journal_package_builtins_upgrade_design.md`, with supporting source/test/doc evidence listed above. | `docs/runtime/designs/journal_package_builtins_upgrade_design.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The MAS design remains active runtime support because it records current journal requirement / target-specific package boundary. The implementation plan already lives under MAS `docs/history/program/` as provenance.

Unreviewed docs:

- Other MAS files under `docs/runtime/designs/**` were not paragraph-covered in this tranche.
- Remaining MAS runtime/control support docs under `docs/runtime/contracts/**` / `docs/runtime/control/**` not already covered by prior ledger entries remain open.
- MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks remains open.
- OPL, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche; MAG/RCA coverage remains as recorded in compacted ledger scope and later chunks.

Remaining stale / retire candidates:

- Future MAS journal-package prose that says journal requirements or journal package controllers are missing, still only skill/manual/study-local temporary materialization, or still a future CLI addition is stale.
- Future prose that treats `submission_packages/<journal_slug>/`, requirements snapshot, package zip, package currentness, or publication gate missing-package sync as final journal-ready formatting, confirmed submission package, publication quality verdict, artifact mutation authorization, `current_package` freshness proof or paper closure is stale.
- Cover letter / DOCX title-page wording must stay aligned with current materializer output; if future code adds these outputs, docs should cite the source/test surface rather than revive early design suggestions.

Verification / absorb:

- MAS commit `1b3791f6 docs: cover journal package design currentness` is on MAS `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAS verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; publication CLI help listed `resolve-journal-requirements` and `materialize-journal-package`; focused journal-package / publication-gate / CLI tests `118 passed`.

Next tranche write scope:

- MAS paragraph-level coverage for another bounded runtime design/support group, or remaining `docs/runtime/contracts/**` / `docs/runtime/control/**` bodies not covered by prior tranches.
- Or choose RCA uncovered reference bodies or App docs once active release/GUI lanes are safe to govern.

Date: `2026-05-26 10:43 CST`
Tranche: `mas-runtime-root-refs-index-guard-coverage`
State: `tranche_verified`

本轮覆盖 MAS runtime root index 与 domain authority refs index guard，并把结果吸收回 MAS `main`。目标是把 `docs/runtime/README.md` 和 `docs/runtime/domain_authority_refs_index_guard.md` 读回当前 live refs-only contract：MAS refs index 只保存 owner receipt、typed blocker、archive/provenance 和 artifact/source/status locator refs；generic persistence/runtime owner、provider queue、attempt ledger、retry/dead-letter、current control state 与 hosted autonomy 继续归 OPL。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/runtime/README.md`, `docs/runtime/domain_authority_refs_index_guard.md`, and MAS `docs/docs_portfolio_consolidation.md`.
- MAS source / contract refs: `src/med_autoscience/runtime_protocol/domain_authority_refs_index.py`, `contracts/functional_privatization_audit.json`, `contracts/test-lane-manifest.json`, `contracts/production_acceptance/mas-production-acceptance.json`, and product-entry / family-adoption surfaces that consume the refs index.
- Focused tests: `tests/test_opl_family_persistence_adapter.py`, `tests/test_opl_standard_pack.py`, `tests/test_test_lane_governance.py`, plus runtime layout / production acceptance references to `domain_authority_refs_index`.

Fresh semantic result:

- `domain_authority_refs_index_contract()` declares `role=refs_only_domain_authority_receipt_index`, `owner=med-autoscience`, `generic_persistence_owner=one-person-lab`, `generic_runtime_owner=one-person-lab`, `stores_body=false`, `stores_domain_truth=false`, and `runtime_control_owner=one-person-lab`.
- `record_archive_ref`, `record_owner_route_receipt`, `record_dispatch_receipt` and `workspace_authority_refs_index_path` support body-free refs, receipts and archive/provenance indexing; they do not make MAS SQLite a generic lifecycle engine, provider ledger, retry/dead-letter store or current control state owner.
- MAS `docs/runtime/README.md` now describes `designs/` as active / landed runtime design support, so already-landed runtime design support is not misread as only uncontracted future work while source/contracts/tests/CLI-read-model stay the implementation truth.
- MAS `docs/runtime/domain_authority_refs_index_guard.md` now names the current machine contract/test entrances and keeps the document as human-readable boundary guard rather than schema, runtime lifecycle or readiness owner.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/README.md` and `docs/runtime/domain_authority_refs_index_guard.md`, with live refs-only source/contract/test evidence listed above; local docs portfolio placement review. | `docs/runtime/README.md`; `docs/runtime/domain_authority_refs_index_guard.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The MAS guard remains current active support; no history move or tombstone was required.

Unreviewed docs:

- Remaining MAS runtime/control/support docs under `docs/runtime/contracts/**`, `docs/runtime/control/**`, `docs/runtime/projections/**`, `docs/runtime/display/**`, and other `docs/runtime/designs/**` bodies not already paragraph-covered remain open.
- MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks remains open.
- OPL, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche; MAG/RCA coverage remains as recorded in compacted ledger scope and later chunks.

Remaining stale / retire candidates:

- Future MAS runtime-root prose that says `designs/` only contains uncontracted future plans is stale when the design has live source/test/contract support.
- Future refs-index prose that claims MAS owns generic persistence, lifecycle, queue, provider attempt truth, retry/dead-letter, current control state, hosted autonomy, production readiness, paper truth, publication quality, artifact mutation, or `current_package` freshness through SQLite is stale pollution.
- Any active doc that reopens retired runtime lifecycle SQLite, root/quest Git lifecycle truth, MDS daemon, local scheduler, workspace-local generic service, alias/facade wrapper, or default MAS provider path from this guard must be retired or tombstoned.

Verification / absorb:

- MAS commit `a63abafb docs: cover MAS refs index guard` is on MAS `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAS verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused refs-index / standard-pack / test-lane tests `13 passed`.

Next tranche write scope:

- Continue MAS runtime/control support docs under `docs/runtime/contracts/**` / `docs/runtime/control/**`, or MAS product/status/workbench/progress/domain-ref projection shell reconciliation outside already-covered blocks.
- Or choose RCA uncovered reference bodies or App docs once active release/GUI lanes are safe to govern.

Date: `2026-05-26 11:06 CST`
Tranche: `mas-runtime-control-docs-currentness`
State: `tranche_verified`

本轮覆盖 MAS runtime-control support docs 中关于 controller source shape、typed status surface、OPL stage-attempt handoff 与 retired private runtime modules 的当前事实，并把结果吸收回 MAS `main`。目标是把 `docs/runtime/control/controllers.md` 与 `docs/runtime/control/study_runtime_orchestration.md` 从旧 `study_runtime_router.py` / `study_runtime_execution.py` / `study_runtime_transport.py` 兼容叙述收敛到当前 split module、typed surface 和 no-resurrection tests；`study_runtime_control_surface.md` 已全文复核，保持现状。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/architecture.md`, `docs/status.md`, `docs/runtime/control/study_runtime_control_surface.md`, and MAS `docs/docs_portfolio_consolidation.md`.
- MAS runtime-control docs: `docs/runtime/control/controllers.md`, `docs/runtime/control/study_runtime_orchestration.md`, and `docs/runtime/control/study_runtime_control_surface.md`.
- MAS source refs: `src/med_autoscience/controllers/domain_status_projection.py`, `progress_projection.py`, `progress_projection_parts/`, `study_runtime_types.py`, `study_runtime_decision.py`, `study_runtime_decision_parts/`, `study_runtime_startup.py`, `study_runtime_completion.py`, `study_runtime_resolution.py`, `study_runtime_execution_parts/`, and `src/med_autoscience/runtime_control/ports.py`.
- MAS machine/test refs: `contracts/action_catalog.json`, `contracts/functional_privatization_audit.json`, `contracts/test-lane-manifest.json`, `tests/test_study_runtime_router.py`, `tests/test_study_runtime_router_topology.py`, `tests/test_study_runtime_typed_surface.py`, `tests/test_progress_projection_evidence_adoption.py`, `tests/test_opl_standard_pack.py`, `tests/product_entry_cases/action_catalog_parity.py`, `tests/test_study_runtime_execution_control_intent_cases/`, and `tests/test_study_runtime_execution_evidence_adoption_cases/`.

Fresh semantic result:

- `study_runtime_router.py`, `study_runtime_execution.py`, and `study_runtime_transport.py` are not current importable active surfaces. Their names can appear only as retired provenance, migration input, tombstone, diagnostic explanation, or no-resurrection test context.
- Current status/projection shape is `domain_status_projection.progress_projection(...)` plus `progress_projection.py` / `progress_projection_parts/` typed status model. `study_runtime_types.py` is a lazy typed-name import shim, not a router re-export compatibility contract.
- `runtime_control.ports.request_opl_stage_attempt(...)` and the injected domain-health-diagnostic stage-attempt port read `progress_projection` payload and emit OPL admission / owner-handoff refs. They do not execute provider resume/relaunch, queue hydration, retry/dead-letter, current-control-state writes, or MAS-local lifecycle mutation.
- `study_runtime_execution_parts/` is the current controller authorization / owner handoff / control-intent lifecycle / receipt / work-unit evidence adoption helper family. Its internals are not a stable public contract unless upgraded into explicit spec.
- `StudyRuntimeExecutionContext` and `StudyRuntimeExecutionOutcome` are retired execution aggregates; typed-surface tests assert they remain absent from `study_runtime_types` and `domain_status_projection`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/control/controllers.md`, `docs/runtime/control/study_runtime_orchestration.md`, and `docs/runtime/control/study_runtime_control_surface.md`, with source/contract/test evidence listed above. | `docs/runtime/control/controllers.md`; `docs/runtime/control/study_runtime_orchestration.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The retired runtime module names were corrected in MAS support docs; no standalone doc needed history movement.

Unreviewed docs:

- Remaining MAS runtime/control docs outside this bounded group, especially `docs/runtime/contracts/**`, `docs/runtime/projections/**`, `docs/runtime/display/**`, and remaining `docs/runtime/designs/**` bodies not already paragraph-covered by prior ledger entries.
- MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks remains open.
- OPL, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche; MAG/RCA coverage remains as recorded in compacted ledger scope and later chunks.

Remaining stale / retire candidates:

- Future MAS active prose that writes `study_runtime_router.py`, `study_runtime_execution.py`, `study_runtime_transport.py`, router helper monkeypatches, MAS-local transport helper refs, or provider backend alias as current active implementation, compatibility surface, patch target, or MAS-owned generic runtime owner is stale pollution.
- Future typed-surface prose that exposes `StudyRuntimeExecutionContext` or `StudyRuntimeExecutionOutcome` as current stable names is stale unless source and focused tests intentionally change.
- Future controller prose that treats OPL stage-attempt admission, owner-route handoff, provider completion, queue completion, or current-control-state metadata as MAS study truth, publication quality verdict, artifact authority, `current_package` freshness, paper closure, domain ready, or production ready is stale.

Verification / absorb:

- MAS commit `3408f931 docs: cover MAS runtime control docs` is on MAS `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAS verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused runtime-control / typed-surface / progress projection / standard-pack tests `79 passed`.

Next tranche write scope:

- Continue MAS runtime contracts or runtime projection/display/design docs not yet paragraph-covered, or MAS product/status/workbench/progress/domain-ref projection shell reconciliation.
- Or choose RCA uncovered reference bodies or App docs once active release/GUI lanes are safe to govern.

Date: `2026-05-26 11:26 CST`
Tranche: `mas-delivery-plane-contract-currentness`
State: `tranche_verified`

本轮覆盖 MAS `docs/runtime/contracts/delivery_plane_contract_map.md` 全文，并把结果吸收回 MAS `main`。目标是把 delivery-plane contract support 读回当前 runtime/control、journal requirements / journal package、publication gate、inspection export 与 study decision record 的 live source/test 事实；该文档继续作为人读 contract support，不承载 runtime truth、publication quality verdict、artifact mutation authority、`current_package` freshness proof、paper closure、domain ready 或 production ready。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/runtime/contracts/delivery_plane_contract_map.md`, `docs/runtime/control/study_runtime_control_surface.md`, `docs/runtime/control/study_runtime_orchestration.md`, `docs/runtime/designs/journal_package_builtins_upgrade_design.md`, and MAS `docs/docs_portfolio_consolidation.md`.
- MAS source refs: `src/med_autoscience/runtime_protocol/study_runtime.py`, `src/med_autoscience/runtime_protocol/study_runtime_models.py`, `src/med_autoscience/study_decision_record.py`, `src/med_autoscience/controllers/gate_authority_currentness.py`, `src/med_autoscience/controllers/publication_gate_parts/state_resolvers.py`, `src/med_autoscience/controllers/journal_package.py`, `src/med_autoscience/journal_requirements.py`, `src/med_autoscience/controllers/study_delivery_sync_parts/`, `src/med_autoscience/controllers/submission_inspection_export.py`, and `src/med_autoscience/controllers/delivery_inspector.py`.
- Focused tests: `tests/test_journal_package_controller.py`, `tests/test_publication_gate_cases/supervisor_cases.py`, `tests/test_study_outer_loop_cases/runtime_resume_cases.py`, `tests/test_domain_health_diagnostic_cases/event_scan_cases.py`, `tests/test_autonomy_governance.py`, `tests/test_study_delivery_sync_cases/delivery_sync_cases.py`, `tests/test_inspection_package_contract.py`, and `tests/test_submission_inspection_export.py`.
- CodeGraph context for delivery/artifact/runtime authority surfaces including `persist_runtime_artifacts`, `StudyRuntimeArtifacts`, `StudyDecisionRecord`, `write_runtime_escalation_record`, `write_study_decision_record`, `GateAuthorityCurrentness`, and `materialize_journal_package`.

Fresh semantic result:

- MAS delivery-plane docs now distinguish generic `rerun` as unsupported from explicit stopped-quest relaunch, which is supported only through `request_opl_stage_attempt_relaunch` or a direct controller entry with explicit stopped relaunch permission.
- `runtime_protocol.study_runtime.persist_runtime_artifacts(...)` is documented as writing MAS-facing `launch_report` / `runtime_binding` projections; OPL current-control-state and provider attempt ledgers remain runtime truth.
- Current delivery projection surfaces include `study_root/submission_packages/<journal_slug>/` alongside `submission_minimal/`, paper-local `journal_submissions/<publication_profile>/`, `manuscript/current_package/`, inspection packages and artifact mirrors.
- `journal_package` is documented as a controller-owned target-specific package projection with requirements snapshot and formatting boundary. Missing confirmed target, requirements/QC currentness or publication/quality authority refs keeps it at `journal_targeted_projection`; it must not be read as final journal-ready formatting, submission authorization, publication quality verdict, artifact mutation authority, `current_package` freshness proof or paper closure.
- Inspection package, publication gate and study delivery sync remain projection / guard / handoff surfaces only; they do not create a second delivery authority root.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/runtime/contracts/delivery_plane_contract_map.md`, with support reads of `docs/runtime/control/study_runtime_control_surface.md`, `docs/runtime/control/study_runtime_orchestration.md`, and `docs/runtime/designs/journal_package_builtins_upgrade_design.md`; source/test/structural evidence listed above. | `docs/runtime/contracts/delivery_plane_contract_map.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The MAS contract support doc remains active; stale currentness wording was corrected in place.

Unreviewed docs:

- Remaining MAS runtime projections/display/design bodies not already paragraph-covered remain open.
- MAS product/status/workbench and progress/domain-ref projection shell reconciliation outside already-covered blocks remains open.
- OPL, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche; MAG/RCA coverage remains as recorded in compacted ledger scope and later chunks.

Remaining stale / retire candidates:

- Future MAS delivery-plane prose that treats generic rerun as fully supported, or treats explicit stopped relaunch as generic automatic rerun, is stale.
- Future prose saying `study_runtime_execution.py` writes current runtime truth or owns `launch_report` is stale; current docs must route MAS-facing projection wording through `runtime_protocol.study_runtime.persist_runtime_artifacts(...)` and runtime truth through OPL control/provider surfaces.
- Future prose treating `submission_packages/<journal_slug>/`, `journal_package`, inspection exports or delivery sync as final journal-ready / submission-ready / publication-quality / artifact-authority / `current_package`-freshness / paper-closure proof is stale.

Verification / absorb:

- MAS commit `8a0c7236 docs: cover delivery plane contract currentness` is on MAS `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAS verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; focused delivery / journal package / runtime relaunch tests `103 passed`.

Next tranche write scope:

- Continue MAS runtime projection/display/design support docs, or MAS product/status/workbench/progress/domain-ref projection shell reconciliation.
- Or choose RCA uncovered reference bodies or App docs once active release/GUI lanes are safe to govern.

Date: `2026-05-26 12:01 CST`
Tranche: `mag-20260407-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-07 P2/P3A authoring / review 历史 specs，并把结果吸收回 MAG `main`。目标是确认这些 direct-file 历史入口不会把旧 `Current Truth` 标题、CLI-only early authoring route、mentor verdict freeze 或 early audit surface 误读成当前 route owner、runtime owner、quality/export/submission-ready verdict、compatibility interface 或 active backlog；本轮语义结果是既有 lifecycle guard 足够，MAG 正文不需要改写。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-07-p2a-intake-direction-question-mainline-current-truth.md`, `docs/history/specs/2026-04-07-p2b-argument-fit-outline-mainline-current-truth.md`, `docs/history/specs/2026-04-07-p2c-draft-critique-revision-skeleton-mainline-current-truth.md`, and `docs/history/specs/2026-04-07-p3a-mentor-verdict-contract-freeze-current-truth.md`.
- MAG machine truth surfaces: `contracts/runtime-program/current-program.json`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.

Fresh semantic result:

- The four reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- P2.A / P2.B / P2.C are correctly scoped as `historical_authoring_flow_provenance`; P3.A is correctly scoped as `historical_review_gate_provenance`.
- Current route truth, authoring pass, executor boundary, review / quality boundary, OPL/Temporal runtime owner and machine behavior all route back to current core docs, active specs, contracts/schema/source, CLI/API behavior and `contracts/runtime-program/current-program.json`.
- Stale-risk scan found no unguarded Hermes/Gateway/local-manager/local-runtime/attempt-ledger/default-runtime wording in this batch. The only `Current Truth` wording is in historical titles and is guarded by file-level lifecycle notes.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four 2026-04-07 history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, status and current-program runtime owner fields. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, prior portfolio/index coverage, and this 2026-04-07 P2/P3A batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-08 P3/P4 rollback / verification gate records, 2026-04-08 P5 / R-series activation packages, 2026-04-09 R3/R4/R5 / post-R5A records, 2026-04-10 fail-closed / hosted-bundle records, 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted/OPL handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-07 specs as current route registry, runtime owner, default CLI/API contract, quality/export/submission-ready verdict, physical-delete authority or compatibility-interface source is stale pollution.
- `ready_for_submission` in P3.A remains historical verdict semantics only. Current submission-ready / export / human-gate authority must come from MAG-owned active specs, contracts/source, owner receipt or typed blocker surfaces.
- P2/P3 authoring-flow route examples remain provenance. They must not override current OPL/Temporal default runtime ownership, current active route catalog, AI-first quality boundary or product-entry / domain-handler source.

Verification / absorb:

- MAG commit `efbbf91 docs: cover MAG 2026-04-07 history specs` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-08 P3/P4 rollback / verification records or 2026-04-11/2026-04-12 Hermes / hosted handoff specs because stale provider wording risk is higher there.
- Or choose RCA uncovered reference bodies or App docs once active release/GUI lanes are safe to govern.

Date: `2026-05-26 12:18 CST`
Tranche: `mag-20260408-p3p4-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-08 P3/P4 rollback、presubmission、verification gate 与 checkpoint 历史 specs，并把结果吸收回 MAG `main`。目标是确认这些 direct-file 历史入口不会把旧 `Current Truth` 标题、裸 `stage-route-report` verification command、CLI-only validation surface、MCP/controller future scope、`ready_for_submission` / `presubmission_frozen` 或 checkpoint vocabulary 误读成当前 public CLI shape、runtime owner、submission/export authority、production readiness、compatibility interface 或 active backlog；本轮语义结果是既有 lifecycle guard 和 specs lifecycle map 足够，MAG 正文不需要改写。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-08-p3b-revision-transition-and-re-review-hardening-current-truth.md`, `docs/history/specs/2026-04-08-p3c-forced-rollback-and-presubmission-gate-current-truth.md`, `docs/history/specs/2026-04-08-p4a-verification-gate-surface-current-truth.md`, and `docs/history/specs/2026-04-08-p4b-verification-os-and-checkpoint-surface-current-truth.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/route_report.py`, `src/med_autogrant/domain_runtime_parts/substrate.py`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/cli.py`, `src/med_autogrant/domain_entry.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh CLI/read-model probes: `med_autogrant --help`, `med_autogrant workspace --help`, `workspace route-report` on gate-open and gate-closed examples, `workspace next-step` on forced-rollback example, and `MagDomainRuntime().describe_topology()`.

Fresh semantic result:

- The four reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- P3.B / P3.C are correctly scoped as historical review / rollback / presubmission provenance; P4.A / P4.B are correctly scoped as historical verification-gate / checkpoint provenance.
- Current public CLI shape is grouped: `med_autogrant workspace route-report`, not the historical bare `stage-route-report` command examples. The historical examples remain useful provenance but must not be copied into current operator docs without mapping through `public_cli`.
- Current checkpoint aggregation is source-owned by `route_report.build_stage_route_report()` / `build_verification_checkpoint()` and domain entry dispatch; representative fresh probes returned `freeze_ready`, `submission_frozen`, and `argument_building` for the expected gate-open, gate-closed and forced-rollback examples.
- `MagDomainRuntime().describe_topology()` still reports `runtime_owner=one-person-lab`, `can_claim_generic_runtime_owner=False`, `default_formal_entry=CLI`, `supported_protocol_layer=MCP`. These historical specs therefore do not grant MAG a generic runtime, controller, provider, submission-ready or production-ready authority.
- Stale-risk scan found no unguarded Hermes/Gateway/local-manager/local-runtime/attempt-ledger/default-runtime wording in this batch. `Current Truth`, `ready_for_submission`, `MCP/controller`, formal-entry and submission wording appears in historical titles/body text and is guarded by file-level lifecycle notes.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four 2026-04-08 P3/P4 history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, current-program runtime owner fields, route-report source, domain runtime topology, public CLI mapping and representative CLI outputs. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, 2026-04-07 P2/P3A batch and this 2026-04-08 P3/P4 batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-08 P5 / R-series activation packages, 2026-04-09 R3/R4/R5 / post-R5A records, 2026-04-10 fail-closed / hosted-bundle records, 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted/OPL handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-08 specs as current public CLI command shape, runtime owner, default CLI/API contract, controller capability, submission-ready/export-ready verdict, production readiness, physical-delete authority or compatibility-interface source is stale pollution.
- Historical bare `stage-route-report` command examples must be mapped through current public CLI as `workspace route-report`; otherwise they are old verification-package provenance, not active operator docs.
- `ready_for_submission`, `presubmission_frozen`, `freeze_ready`, `submission_frozen` and rollback checkpoint vocabulary remain route/checkpoint semantics. They must not be upgraded to final external submission, export authorization, grant package authority, human-gate approval, provider completion, App/release readiness or production-ready claims.

Verification / absorb:

- MAG commit `4c6a551 docs: cover MAG 2026-04-08 history specs` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- Representative current CLI/read-model probes succeeded: `workspace route-report` returned `freeze_ready` for `p3a_ready_for_submission`, `submission_frozen` for `p3c_presubmission_frozen`, and `workspace next-step` returned `argument_building` for the forced-rollback example.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-08 P5/R activation packages or 2026-04-11/2026-04-12 Hermes / hosted handoff specs because stale provider/hosted wording risk is higher there.
- Or choose RCA uncovered reference bodies or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 12:25 CST`
Tranche: `mag-20260408-p5r1-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-08 P5 second-family / federation future activation packages 与 R1 local-runtime activation packages，并把结果吸收回 MAG `main`。目标是确认这些 direct-file 历史入口不会把旧 future P5、Gateway/federation、local `runtime-run` / `runtime-resume`、run journal、stage action envelope、MCP/controller 或 runtime-productization 词汇误读成当前 active P5 backlog、federation-ready、public CLI command、MAG-owned generic runtime、daemon/scheduler/attempt-loop、attempt ledger、production readiness、compatibility interface 或 active implementation plan；本轮语义结果是既有 lifecycle guard 和 specs lifecycle map 足够，MAG 历史 spec 正文不需要改写。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-08-p5a-second-grant-family-onboarding-activation-package.md`, `docs/history/specs/2026-04-08-p5b-federation-contract-freeze-activation-package.md`, `docs/history/specs/2026-04-08-r1a-local-main-loop-entry-and-stop-reason-activation-package.md`, and `docs/history/specs/2026-04-08-r1b-stage-action-executor-envelope-activation-package.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/domain_runtime_parts/substrate.py`, `src/med_autogrant/domain_entry.py`, `src/med_autogrant/product_entry_parts/functional_closure_skeleton.py`, `tests/test_domain_entry.py`, `tests/product_entry_cases/test_functional_closure.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh read-model probe: `MagDomainRuntime().describe_topology()` plus `public_cli_command("stage-route-report", ...)` and `PUBLIC_GROUP_COMMANDS["workspace"]`.

Fresh semantic result:

- The four reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- P5.A / P5.B are correctly scoped as `future_activation_history` / historical second-family and federation activation provenance. They are not current second-family admitted claims, active P5 backlog, Gateway-ready / federation-ready claims, cross-domain runtime owner claims or public runtime entries.
- R1.A / R1.B are correctly scoped as `historical_activation_package` / local runtime and stage action envelope provenance. They are not current MAG-owned daemon, scheduler, attempt loop, attempt ledger, public `runtime-run` / `runtime-resume` command, local runtime product plan or generic runtime authority.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_substrate=temporal`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, and `mag_owns_attempt_ledger=false`.
- `MagDomainRuntime().describe_topology()` still reports `runtime_owner=one-person-lab`, `can_claim_generic_runtime_owner=False`, `default_formal_entry=CLI`, `supported_protocol_layer=MCP`, `internal_controller_surface=controller`, and `optional_proof_executor_boundary=explicit opt-in only`.
- Current public CLI shape remains grouped; historical bare `stage-route-report` maps through `public_cli` as `workspace route-report`. `runtime-run`、`runtime-resume` 和 `probe-upstream-hermes` are covered by no-resurrection source/tests and must not be restored as active public/domain commands.
- Stale-risk scan found P5/R1 risk terms only inside lifecycle-guarded history/provenance text, explicit future-scope/precondition/stop-condition guardrails, or no-resurrection surfaces.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four 2026-04-08 P5/R1 history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, status, current-program runtime owner fields, public CLI mapping, domain runtime topology and retired command no-resurrection surfaces. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, 2026-04-07 P2/P3A batch, 2026-04-08 P3/P4 batch and this 2026-04-08 P5/R1 batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-08 R2/R3/runtime-first program records, 2026-04-09 R3/R4/R5 / post-R5A records, 2026-04-10 fail-closed / hosted-bundle records, 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted/OPL handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these P5/R1 specs as current public CLI command shape, runtime owner, default runtime, Gateway/federation readiness, controller capability, local run journal authority, attempt ledger, submission/export-ready verdict, production readiness, physical-delete authority or compatibility-interface source is stale pollution.
- Historical `runtime-run` / `runtime-resume` / run journal / stage action envelope vocabulary must remain provenance unless a current active owner and source/contract/tests explicitly re-admit it; current no-resurrection tests guard these commands from reappearing as active public/domain commands.
- P5 second-family and federation language must not be upgraded to admitted family, Grant Foundry readiness, Gateway route, OPL generated/hosted caller readiness, App/release readiness or production-ready claims.

Verification / absorb:

- MAG commit `53425d2 docs: cover MAG 2026-04-08 P5/R1 specs` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- Representative read-model probe confirmed `MagDomainRuntime().describe_topology()` runtime owner and public CLI grouping.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-08 R2/R3/runtime-first records or 2026-04-11/2026-04-12 Hermes / hosted handoff specs because stale local-runtime/provider/hosted wording risk is higher there.
- Or choose RCA uncovered reference bodies or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 12:42 CST`
Tranche: `mag-20260408-r2r3-runtime-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-08 runtime-first program、R1-to-R5 boundary map、R2 artifact-bundle 和 R3 critique/revision executor 历史 specs，并把结果吸收回 MAG `main`。目标是确认这些 direct-file 历史入口不会把旧 runtime-first ladder、local runtime、`runtime-run` / `runtime-resume`、run journal、host-agent、hostedization、R2/R3 activation package、artifact bundle、revision executor 或 R1-R5 honest-stop 词汇误读成当前执行顺序、MAG-owned generic runtime、active local runtime plan、public runtime commands、attempt ledger、OPL/App production readiness、submission/export-ready verdict、compatibility interface 或 active implementation queue；本轮语义结果是既有 lifecycle guard 和 specs lifecycle map 足够，MAG 历史 spec 正文不需要改写。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-08-runtime-first-productization-program.md`, `docs/history/specs/2026-04-08-runtime-first-r1-to-r5-boundary-map.md`, `docs/history/specs/2026-04-08-r2a-artifact-bundle-production-surface-activation-package.md`, and `docs/history/specs/2026-04-08-r3a-critique-revision-executor-surface-activation-package.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/domain_runtime_parts/substrate.py`, `src/med_autogrant/domain_entry.py`, `src/med_autogrant/product_entry_parts/functional_closure_skeleton.py`, `tests/test_domain_entry.py`, `tests/product_entry_cases/test_functional_closure.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh read-model probes: `MagDomainRuntime().describe_topology()`, `public_cli_command("build-artifact-bundle", ...)`, `public_cli_command("execute-revision-pass", ...)`, `PUBLIC_GROUP_COMMANDS["package"]`, `PUBLIC_GROUP_COMMANDS["pass"]`, `med_autogrant package --help`, and `med_autogrant pass --help`.

Fresh semantic result:

- The four reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- `2026-04-08-runtime-first-productization-program.md` and `2026-04-08-runtime-first-r1-to-r5-boundary-map.md` are correctly scoped as historical runtime-first program / boundary-map provenance. They are not current execution order, current local runtime ladder, active R1-R5 backlog, default runtime owner, hosted runtime claim or P5 expansion authority.
- R2.A and R3.A are correctly scoped as `historical_activation_package` records. Their current machine behavior must be read through grouped public CLI/source/contracts: `build-artifact-bundle` maps to `package artifact-bundle`; `execute-revision-pass` maps to `pass revision`.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_substrate=temporal`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, and `mag_owns_attempt_ledger=false`.
- `MagDomainRuntime().describe_topology()` still reports `runtime_owner=one-person-lab`, `can_claim_generic_runtime_owner=False`, `default_formal_entry=CLI`, `supported_protocol_layer=MCP`, `internal_controller_surface=controller`, and `optional_proof_executor_boundary=explicit opt-in only`.
- Current public CLI shape is grouped: R2 package behavior is under `package artifact-bundle`; R3 revision behavior is under `pass revision`; historical bare command examples remain provenance and must not be copied into current operator docs without mapping through `public_cli`.
- `runtime-run`、`runtime-resume`、`run-local` and `probe-upstream-hermes` remain retired/no-resurrection terms covered by source/tests; they must not be restored as active public/domain commands from these history docs.
- Stale-risk scan found R2/R3/runtime-first risk terms only inside lifecycle-guarded history/provenance text, explicit future-scope/precondition/stop-condition guardrails, current-source CLI mapping, or no-resurrection surfaces.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four 2026-04-08 R2/R3/runtime-first history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, status, current-program runtime owner fields, grouped public CLI mapping, domain runtime topology and retired command no-resurrection surfaces. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, 2026-04-07 P2/P3A batch, 2026-04-08 P3/P4 batch, 2026-04-08 P5/R1 batch and this 2026-04-08 R2/R3/runtime-first batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-09 R3/R4/R5 / post-R5A records, 2026-04-10 fail-closed / hosted-bundle records, 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted/OPL handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these runtime-first docs as current execution order, active local runtime ladder, runtime owner, default runtime, public `runtime-run` / `runtime-resume`, local run journal, attempt ledger, hosted runtime readiness, P5 expansion, controller capability, submission/export-ready verdict, production readiness, physical-delete authority or compatibility-interface source is stale pollution.
- Historical bare `build-artifact-bundle` and `execute-revision-pass` command examples must be mapped through current grouped public CLI as `package artifact-bundle` and `pass revision`; otherwise they are old local-runtime provenance, not active operator docs.
- `artifact_bundle`, revision executor, final package and hosted-friendly vocabulary must remain within grant/package/export authority and grouped CLI boundaries. They must not be upgraded to generic OPL artifact lifecycle owner, App/release readiness, production-ready claim, external submission authorization or provider-hosted completion.

Verification / absorb:

- MAG commit `0d7a510 docs: cover MAG 2026-04-08 R2/R3 runtime specs` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- Representative read-model probes confirmed `MagDomainRuntime().describe_topology()` runtime owner, grouped package/pass CLI commands, and no-resurrection boundary for retired runtime commands.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-09 R3/R4/R5 / post-R5A records or 2026-04-11/2026-04-12 Hermes / hosted handoff specs because stale local-runtime/provider/hosted wording risk is higher there.
- Or choose RCA uncovered reference bodies or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 13:11 CST`
Tranche: `mag-20260409-r3r5-post-r5a-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-09 R3 revision mutation、R4 final freeze/export、R5 hosted-friendly session boundary 与 post-R5A local runtime hardening 历史 specs，并把结果吸收回 MAG `main`。目标是确认这些 direct-file 历史入口不会把旧 machine-applicable revision contract、final package、hosted contract bundle、local runtime ladder、`runtime-run` / `runtime-resume`、run journal、host-agent、hostedization 或 post-R5A hardening owner line 误读成当前 public CLI shape、MAG-owned generic runtime、active local runtime plan、attempt ledger、actual hosted runtime、OPL/App production readiness、submission/export-ready verdict、compatibility interface 或 active implementation queue；本轮语义结果是既有 lifecycle guard 和 specs lifecycle map 足够，MAG 历史 spec 正文不需要改写。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-09-r3a-machine-applicable-revision-mutation-contract.md`, `docs/history/specs/2026-04-09-r4a-final-freeze-and-export-package-activation-package.md`, `docs/history/specs/2026-04-09-r5a-hosted-friendly-session-boundary-activation-package.md`, and `docs/history/specs/2026-04-09-post-r5a-local-runtime-hardening-brief.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/cli.py`, `src/med_autogrant/domain_runtime_parts/substrate.py`, `src/med_autogrant/domain_entry.py`, `src/med_autogrant/final_package.py`, `src/med_autogrant/hosted_contract_bundle.py`, `src/med_autogrant/product_entry_parts/functional_closure_skeleton.py`, `tests/test_domain_entry.py`, `tests/test_final_package.py`, `tests/test_hosted_contract_bundle.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh read-model probes: `MagDomainRuntime().describe_topology()`, `public_cli_command()` mapping for `execute-revision-pass` / `build-artifact-bundle` / `build-final-package` / `build-hosted-contract-bundle`, `PUBLIC_GROUP_COMMANDS["package"]`, `PUBLIC_GROUP_COMMANDS["pass"]`, retired public command scan, `med_autogrant package --help`, and `med_autogrant pass --help`.

Fresh semantic result:

- The four reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- R3.A is correctly scoped as historical revision mutation contract provenance. Current revision behavior must be read through source/tests and grouped public CLI: `execute-revision-pass` maps to `pass revision`; this history file does not authorize runtime queue, attempt ledger, hosted runtime owner, final package/export authority or a new authoring engine.
- R4.A is correctly scoped as historical final freeze/export activation provenance. Current package/export behavior must be read through MAG package authority, source/tests and grouped public CLI: `build-final-package` maps to `package final-package`; final package vocabulary must not be upgraded to hosted runtime, external submission approval, App/release readiness or production-ready claims.
- R5.A is correctly scoped as historical hosted-friendly session boundary provenance. Current hosted/default task runtime owner remains OPL/Temporal, and current hosted contract behavior is grouped as `package hosted-contract-bundle`; the file does not grant actual hosted runtime, Gateway owner, daemon, scheduler, attempt ledger, multi-tenant platform, credits/billing or federation authority.
- Post-R5A local runtime hardening is correctly scoped as historical local-runtime closeout / honest-stop provenance. Its local runtime ladder and host-agent wording are not current owner line; current owner line in `current-program.json` is OPL/Temporal hosted autonomous runtime default, with `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, and `mag_owns_attempt_ledger=false`.
- `MagDomainRuntime().describe_topology()` still reports `runtime_owner=one-person-lab`, `can_claim_generic_runtime_owner=False`, `default_formal_entry=CLI`, `supported_protocol_layer=MCP`, `internal_controller_surface=controller`, and `optional_proof_executor_boundary=explicit opt-in only`.
- Current public CLI shape is grouped: revision is under `pass revision`; package behavior is under `package artifact-bundle`, `package final-package`, `package hosted-contract-bundle`, and `package submission-ready`. Historical bare command examples remain provenance and must not be copied into current operator docs without mapping through `public_cli`.
- `run-local`, `runtime-run`, `runtime-resume` and `probe-upstream-hermes` remain retired/no-resurrection terms. The retired command scan returned `state=passed`, no active domain-entry command matches, and no active grouped public CLI command matches.
- Stale-risk scan found R3/R4/R5/post-R5A risk terms only inside lifecycle-guarded history/provenance text, explicit future-scope/precondition/stop-condition guardrails, current-source CLI mapping, or no-resurrection surfaces.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four 2026-04-09 history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, current-program runtime owner fields, grouped public CLI mapping, domain runtime topology, final package / hosted contract source, and retired command no-resurrection surfaces. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, 2026-04-07 P2/P3A batch, 2026-04-08 P3/P4 batch, 2026-04-08 P5/R1 batch, 2026-04-08 R2/R3/runtime-first batch and this 2026-04-09 R3/R4/R5/post-R5A batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-10 fail-closed / hosted-bundle records, 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted/OPL handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-09 specs as current public CLI command shape, runtime owner, default runtime, active local runtime ladder, hosted runtime owner, run journal, attempt ledger, Gateway/federation readiness, controller public formal entry, submission/export-ready verdict, production readiness, physical-delete authority or compatibility-interface source is stale pollution.
- Historical bare `execute-revision-pass`, `build-artifact-bundle`, `build-final-package` and `build-hosted-contract-bundle` examples must be mapped through current grouped public CLI as `pass revision`, `package artifact-bundle`, `package final-package` and `package hosted-contract-bundle`; otherwise they are old local-runtime provenance, not active operator docs.
- `final_package`, `hosted_contract_bundle`, hosted-friendly and post-R5A hardening vocabulary must remain within grant package/export authority, hosted-contract export reference, and history/provenance boundaries. They must not be upgraded to generic OPL artifact lifecycle owner, actual hosted runtime, App/release readiness, external submission authorization, provider-hosted completion or production-ready claim.

Verification / absorb:

- MAG commit `4112d71 docs: cover MAG 2026-04-09 runtime specs` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits after line-start anchoring; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- Representative read-model probes confirmed `MagDomainRuntime().describe_topology()` runtime owner, grouped package/pass CLI commands, and no-resurrection boundary for retired runtime commands.
- An initial clean-runner probe with `MAG_CLEAN_RUNNER_SKIP_SYNC=1` failed because the temporary venv did not exist; rerunning through the repo default clean runner created the external temp venv and the same read-model probes passed. No script or repo fix was needed.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-10 fail-closed / hosted-bundle records or 2026-04-11/2026-04-12 Hermes / hosted handoff specs because stale provider/hosted wording risk is higher there.
- Or choose RCA uncovered reference bodies or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 14:05 CST`
Tranche: `mag-20260410-hosted-bundle-fail-closed-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-10 hosted-contract-bundle final-package fail-closed 与 worktree-aware root resolution 历史 specs，并把结果吸收回 MAG `main`。目标是确认这些 direct-file 历史入口不会把旧 hostedization prep、host-agent、Gateway、final package malformed/fail-closed validation、worktree-aware control-plane root resolution 或 `CURRENT_PROGRAM` root lookup 词汇误读成当前 actual hosted runtime、MAG-owned generic runtime、public hosted runtime、App release ready、production ready、daemon/scheduler/attempt ledger、compatibility interface 或 active implementation queue；本轮语义结果是既有 lifecycle guard 和 specs lifecycle map 足够，MAG 历史 spec 正文不需要改写。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-10-post-r5a-hosted-contract-bundle-final-package-checkpoint-semantics-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-hosted-contract-bundle-final-package-freeze-manifest-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-hosted-contract-bundle-final-package-lineage-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-hosted-contract-bundle-final-package-required-nested-fields-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-hosted-contract-bundle-final-package-required-scalar-fields-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-hosted-contract-bundle-malformed-final-package-fail-closed-activation-package.md`, and `docs/history/specs/2026-04-10-post-r5a-worktree-aware-hosted-contract-control-plane-root-resolution-activation-package.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/hosted_contract_bundle.py`, `src/med_autogrant/final_package_validation.py`, `src/med_autogrant/domain_runtime_parts/contracts.py`, `src/med_autogrant/public_cli.py`, `tests/test_hosted_contract_bundle.py`, `tests/test_hosted_contract_bundle_checkpoint_cases.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh verification probes: `med_autogrant package --help`, `public_cli_command()` mapping for `build-final-package` / `build-hosted-contract-bundle`, retired public command scan, and focused pytest for hosted-contract bundle fail-closed cases.

Fresh semantic result:

- The seven reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- The five `hosted-contract-bundle-final-package-*` specs and the malformed final-package spec are correctly scoped as historical post-R5A hosted-contract final-package fail-closed provenance. Current behavior is source/test owned by `hosted_contract_bundle.build_hosted_contract_bundle_payload()` and `final_package_validation._validate_required_final_package_fields()`, which validate supported package version, required scalar/object fields, required freeze manifest and lineage fields, allowed draft/checkpoint statuses, and checkpoint status consistency before hosted bundle export.
- The worktree-aware root resolution spec is correctly scoped as historical control-plane root resolution provenance. It only describes deterministic `CURRENT_PROGRAM` lookup hardening; it does not change `program_id` semantics, final package identity, hosted bundle payload shape, formal entry, hosted runtime semantics, or runtime owner.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_owner=configured_family_runtime_provider`, `default_runtime_substrate=temporal`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, `mag_owns_attempt_ledger=false`, `default_stage_executor=codex_cli`, and `optional_hosted_carriers=["hermes_agent"]`.
- Current public CLI shape is grouped: `build-final-package` maps to `package final-package`; `build-hosted-contract-bundle` maps to `package hosted-contract-bundle`. Historical bare command examples remain provenance and must not be copied into current operator docs without mapping through `public_cli`.
- Focused hosted-contract bundle verification passed: `tests/test_hosted_contract_bundle.py` and `tests/test_hosted_contract_bundle_checkpoint_cases.py` returned 21 pytest cases plus 30 subtests passed. `med_autogrant package --help` shows `artifact-bundle`, `final-package`, `hosted-contract-bundle`, and `submission-ready` as current package commands.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the seven 2026-04-10 hosted-contract bundle fail-closed / worktree-aware history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, current-program runtime owner fields, hosted contract source, final package validation source, grouped public CLI mapping and focused hosted bundle tests. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These seven MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, 2026-04-07 P2/P3A batch, 2026-04-08 P3/P4 batch, 2026-04-08 P5/R1 batch, 2026-04-08 R2/R3/runtime-first batch, 2026-04-09 R3/R4/R5/post-R5A batch and this 2026-04-10 hosted-contract bundle fail-closed batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-10 local-runtime validation / stage-route / revised / walkthrough records, 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted/OPL handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-10 specs as current public CLI command shape, runtime owner, default runtime, actual hosted runtime, public hosted runtime, Gateway/federation readiness, daemon/scheduler/attempt ledger, controller public formal entry, submission/export-ready verdict, App release readiness, production readiness, physical-delete authority or compatibility-interface source is stale pollution.
- Historical bare `build-final-package` and `build-hosted-contract-bundle` examples must be mapped through current grouped public CLI as `package final-package` and `package hosted-contract-bundle`; otherwise they are old local-runtime / hostedization-prep provenance, not active operator docs.
- `final_package` malformed/fail-closed, hosted-contract bundle and worktree-aware `CURRENT_PROGRAM` lookup vocabulary must remain within grant package/export authority, hosted-contract export reference, deterministic root resolution and history/provenance boundaries. They must not be upgraded to generic OPL artifact lifecycle owner, actual hosted runtime, App/release readiness, external submission authorization, provider-hosted completion or production-ready claim.

Verification / absorb:

- MAG commit `eb565f5 docs: cover MAG 2026-04-10 hosted bundle specs` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- Focused tests passed: `tests/test_hosted_contract_bundle.py` and `tests/test_hosted_contract_bundle_checkpoint_cases.py` returned 21 pytest cases plus 30 subtests passed.
- Representative read-model probes confirmed current-program runtime owner fields, grouped package CLI commands, and no-resurrection boundary for retired public commands.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing remaining 2026-04-10 local-runtime validation / stage-route / revised / walkthrough records or 2026-04-11/2026-04-12 Hermes / hosted handoff specs because stale local-runtime/provider/hosted wording risk is higher there.
- Or choose RCA uncovered reference bodies, OPL uncovered docs, or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 14:32 CST`
Tranche: `mag-20260410-local-runtime-stage-route-history-specs-coverage`
State: `tranche_verified_with_existing_test_drift_noted`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-10 revised workspace validator、validation-failed local-runtime route/checkpoint shape、stage-route checkpoint output consistency 与 local-runtime walkthrough 历史 specs，并把结果吸收回 MAG `main`。目标是确认这些 direct-file 历史入口不会把旧 `runtime-run` / `runtime-resume`、local journal、local runtime ladder、bare command walkthrough、stage-route mirror、same-repo HITL、MCP/controller public formal entry 或 post-R5A hardening wording误读成当前 public CLI command shape、MAG-owned generic runtime、attempt ledger、actual hosted runtime、App/release readiness、production readiness、compatibility interface 或 active implementation queue。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-10-post-r5a-revised-workspace-validator-and-operator-alignment.md`, `docs/history/specs/2026-04-10-post-r5a-local-runtime-validation-failed-route-checkpoint-shape-alignment-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-stage-route-report-checkpoint-status-output-consistency-activation-package.md`, and `docs/history/specs/2026-04-10-post-r5a-local-runtime-walkthrough-and-output-consistency-current-truth.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/route_report.py`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/cli.py`, `src/med_autogrant/domain_runtime_parts/substrate.py`, `src/med_autogrant/domain_entry.py`, `src/med_autogrant/product_entry_parts/functional_closure_skeleton.py`, `tests/test_domain_entry.py`, `tests/test_revision_executor.py`, `tests/test_cli_validate_workspace_revision_cases.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh verification probes: `med_autogrant workspace --help`, `med_autogrant pass --help`, `med_autogrant package --help`, `workspace route-report` on `examples/nsfc_workspace_p2c_critique.json`, `pass revision` on `examples/nsfc_workspace_p3b_re_review_major_revision.json` followed by `workspace validate` and `workspace route-report`, `public_cli_command()` mapping, focused route/revision/domain-entry pytest, and retired public command scan.

Fresh semantic result:

- The four reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- `2026-04-10-post-r5a-revised-workspace-validator-and-operator-alignment.md` needed one small post-2026-05 reading guard because its body still used imperative `runtime-run` / `runtime-resume` language in the historical local runtime ladder. The added note keeps historical body text as provenance and routes current executable operator path to grouped CLI plus no-resurrection scan.
- The validation-failed route/checkpoint, stage-route checkpoint output consistency and local-runtime walkthrough files are correctly scoped as historical local-runtime closeout / fail-closed / output-consistency provenance. Existing lifecycle headers and `specs_lifecycle_map.md` are sufficient for these files; no body rewrite was needed.
- Current route checkpoint behavior is source-owned by `route_report.build_stage_route_report()`: it returns top-level `checkpoint_status` and `verification_checkpoint.checkpoint_status` from the same checkpoint object. Fresh `workspace route-report` on the critique example returned matching `forward_progress` values and a populated route object.
- Generated revised workspace still re-enters current validator/route surfaces. Fresh `pass revision` on the P3.B re-review example followed by `workspace validate` and `workspace route-report` returned `validate.ok=True` and matching `forward_progress` checkpoint values.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_owner=configured_family_runtime_provider`, `default_runtime_substrate=temporal`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, `mag_owns_attempt_ledger=false`, `default_stage_executor=codex_cli`, `optional_hosted_carriers=["hermes_agent"]`, and `historical_baseline=NO_NEW_POST_R5A_LOCAL_RUNTIME_DELTA_HONEST_STOP`.
- Current public CLI shape is grouped: workspace behavior is under `workspace validate|summarize|next-step|critique-summary|route-report`; revision is under `pass revision`; package behavior is under `package artifact-bundle|final-package|hosted-contract-bundle|submission-ready`. Historical bare command examples remain provenance and must not be copied into current operator docs without mapping through `public_cli`.
- `run-local`, `runtime-run`, `runtime-resume` and `probe-upstream-hermes` remain retired/no-resurrection terms. The retired public command scan returned `state=passed` and each retired command was absent from active domain-entry and grouped public CLI catalogs.
- Current verification gap discovered during the audit: `tests/test_cli_validate_workspace_revision_cases.py` still contains two tests for `workspace cockpit` and `product direct-entry`, while current CLI help and parser do not expose those grouped commands. The same focused file passes when those two existing drifted cases are excluded; `tests/test_revision_executor.py` and `tests/test_domain_entry.py` pass. This is a pre-existing product/CLI test drift outside this docs coverage tranche, not a failure of the four history specs' lifecycle classification.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four 2026-04-10 local-runtime / stage-route / revised / walkthrough history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, current-program runtime owner fields, grouped public CLI mapping, route-report source, domain runtime topology, retired command no-resurrection scan and focused route/revision/domain-entry tests. | `docs/docs_portfolio_consolidation.md`; `docs/history/specs/2026-04-10-post-r5a-revised-workspace-validator-and-operator-alignment.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, 2026-04-07 P2/P3A batch, 2026-04-08 P3/P4 batch, 2026-04-08 P5/R1 batch, 2026-04-08 R2/R3/runtime-first batch, 2026-04-09 R3/R4/R5/post-R5A batch, 2026-04-10 hosted-contract bundle fail-closed batch and this 2026-04-10 local-runtime/stage-route/revised/walkthrough batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted/OPL handoff records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-10 specs as current public CLI command shape, runtime owner, default runtime, active local runtime ladder, local journal, `runtime-run` / `runtime-resume`, Gateway/federation readiness, daemon/scheduler/attempt ledger, controller public formal entry, submission/export-ready verdict, App release readiness, production readiness, physical-delete authority or compatibility-interface source is stale pollution.
- Historical bare `validate-workspace`, `summarize-workspace`, `next-step`, `critique-summary`, `stage-route-report`, `execute-revision-pass`, `build-artifact-bundle`, `build-final-package` and `build-hosted-contract-bundle` examples must be mapped through current grouped public CLI as `workspace validate`, `workspace summarize`, `workspace next-step`, `workspace critique-summary`, `workspace route-report`, `pass revision`, `package artifact-bundle`, `package final-package` and `package hosted-contract-bundle`.
- `stage-route-report` checkpoint mirror and revised workspace validation vocabulary must remain workspace route/checkpoint semantics. They must not be upgraded to actual hosted runtime, generic OPL artifact lifecycle owner, App/release readiness, external submission authorization, provider-hosted completion or production-ready claim.

Verification / absorb:

- MAG commit `1bebd9b docs: cover MAG 2026-04-10 local runtime specs` is on MAG `main`; tranche worktree and branch were removed after fast-forward absorb.
- MAG verification before absorb: `git diff --check`; strict README/docs/contracts conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- Focused tests passed: `tests/test_revision_executor.py` and `tests/test_domain_entry.py` returned 34 pytest cases plus 3 subtests; `tests/test_cli_validate_workspace_revision_cases.py` passed 29 cases plus 2 subtests with two pre-existing CLI drift cases deselected.
- Full `tests/test_cli_validate_workspace_revision_cases.py` currently fails two existing tests for unavailable `workspace cockpit` and `product direct-entry` grouped CLI commands; route this to a source/test owner lane before using that file as a green full-suite proof.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-11 Hermes/reset/local-runtime records or 2026-04-12 hosted/OPL handoff specs because stale provider/hosted wording risk is higher there.
- Separately route the pre-existing `workspace cockpit` / `product direct-entry` CLI test drift to a source/test owner lane.
- Or choose RCA uncovered reference bodies, OPL uncovered docs, or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 15:20 CST`
Tranche: `mag-20260411-hermes-reset-local-runtime-history-specs-coverage`
State: `tranche_verified_pending_absorb`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-11 Hermes-backed runtime capability migration map、Hermes-backed runtime substrate program、post-R5A local-runtime upper-bound honest-stop 与 upstream Hermes-Agent truth reset 历史 specs。目标是确认这些 direct-file 历史入口不会把旧 Hermes-default provider proposal、Hermes substrate owner path、repo-local runtime helper、`runtime-run` / `runtime-resume`、local journal、host-agent compatibility bridge、future Hermes host 或 “接入上游 Hermes-Agent” 词汇误读成当前 default runtime owner、active provider owner、MAG-owned daemon/scheduler/attempt-loop、attempt ledger、public runtime command、compatibility bridge、hosted runtime readiness、App/release readiness、production readiness、physical-delete authority 或 active implementation queue。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-11-hermes-backed-runtime-capability-migration-map-current-truth.md`, `docs/history/specs/2026-04-11-hermes-backed-runtime-substrate-program-current-truth.md`, `docs/history/specs/2026-04-11-post-r5a-local-runtime-upper-bound-honest-stop-current-truth.md`, and `docs/history/specs/2026-04-11-upstream-hermes-agent-truth-reset-current-truth.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/domain_entry.py`, `src/med_autogrant/domain_runtime_parts/substrate.py`, `src/med_autogrant/product_entry_parts/functional_closure_skeleton.py`, `src/med_autogrant/critique_executor.py`, `src/med_autogrant/hermes_native_executor.py`, `tests/test_domain_entry.py`, `tests/test_critique_executor.py`, `tests/test_hermes_native_executor.py`, `tests/test_program_control_surfaces.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh read-model probes: `MagDomainRuntime().describe_topology()`, grouped public CLI help for root/workspace/pass/package, `PUBLIC_GROUP_COMMANDS`, `INTERNAL_TO_PUBLIC_COMMAND`, `SERVICE_SAFE_DOMAIN_COMMANDS`, and `retired_public_command_scan`.

Fresh semantic result:

- All four reviewed files carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- The capability migration map is correctly scoped as historical Hermes capability split provenance; its Hermes command mapping is not current runtime owner, default provider, public command catalog, hosted runtime readiness or compatibility target.
- Three higher-risk history specs needed small post-2026-05 reading guards:
  - `2026-04-11-hermes-backed-runtime-substrate-program-current-truth.md` now guards `Hermes-backed runtime substrate`, `runtime-run` / `runtime-resume`, local host-agent compatibility bridge and “切到 Hermes substrate owner path” as 2026-04-11 proposal/proof context only.
  - `2026-04-11-post-r5a-local-runtime-upper-bound-honest-stop-current-truth.md` now guards “Current Repo-Verified Local Runtime Surface” as an honest-stop historical snapshot, not current executable command catalog.
  - `2026-04-11-upstream-hermes-agent-truth-reset-current-truth.md` now guards “当前真实状态”、“仍然成立的本地能力”、“长线目标” and “下一步允许做什么” as 2026-04-11 truth-reset context only.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_owner=configured_family_runtime_provider`, `default_runtime_substrate=temporal`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, `mag_owns_attempt_ledger=false`, `default_stage_executor=codex_cli`, and `optional_hosted_carriers=["hermes_agent"]`.
- `MagDomainRuntime().describe_topology()` still reports `runtime_owner=one-person-lab`, `can_claim_generic_runtime_owner=False`, `default_formal_entry=CLI`, `supported_protocol_layer=MCP`, `internal_controller_surface=controller`, `optional_proof_executor=Hermes-Agent`, and `optional_proof_executor_boundary=explicit opt-in only`.
- Current public CLI shape is grouped under root groups `workspace`, `mainline`, `domain-handler`, `authority`, `pass`, and `package`. `run-local`, `runtime-run`, `runtime-resume` and `probe-upstream-hermes` remain absent from active domain-entry and grouped public CLI catalogs; retired command scan returned `state=passed`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four 2026-04-11 Hermes/reset/local-runtime history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, current-program runtime owner fields, grouped public CLI mapping, domain runtime topology, explicit Hermes proof lane source/tests, and retired command no-resurrection surfaces. | `docs/docs_portfolio_consolidation.md`; `docs/history/specs/2026-04-11-hermes-backed-runtime-substrate-program-current-truth.md`; `docs/history/specs/2026-04-11-post-r5a-local-runtime-upper-bound-honest-stop-current-truth.md`; `docs/history/specs/2026-04-11-upstream-hermes-agent-truth-reset-current-truth.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside the 2026-04-06 foundation batch, 2026-04-07 P2/P3A batch, 2026-04-08 P3/P4 batch, 2026-04-08 P5/R1 batch, 2026-04-08 R2/R3/runtime-first batch, 2026-04-09 R3/R4/R5/post-R5A batch, 2026-04-10 hosted-contract bundle fail-closed batch, 2026-04-10 local-runtime/stage-route/revised/walkthrough batch and this 2026-04-11 Hermes/reset/local-runtime batch remain open for paragraph-level governance.
- Higher-risk remaining MAG batches include 2026-04-12 hosted/OPL handoff and upstream Hermes fast-cutover records.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-11 specs as current runtime owner, default provider, Hermes-backed default route, public `runtime-run` / `runtime-resume`, local run journal, attempt ledger, host-agent bridge, compatibility target, hosted runtime readiness, App/release readiness, production readiness, physical-delete authority or active implementation queue is stale pollution.
- Historical bare command examples must be mapped through current grouped public CLI where a mapped public command exists; `runtime-run`, `runtime-resume`, `run-local` and `probe-upstream-hermes` have no current grouped public command and must remain retired.
- `hermes_agent` vocabulary must remain explicit opt-in executor / receipt / proof lane vocabulary. It must not be upgraded to default task runtime owner, provider owner, grant truth owner, quality/export verdict owner or long-soak completion claim.

Verification / absorb:

- Pending this tranche closeout: MAG and OPL docs-only verification, focused no-resurrection/domain-entry tests, fast-forward absorb into both `main` checkouts, worktree cleanup, then final six-repo lightweight verification.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing 2026-04-12 hosted/OPL handoff and upstream Hermes fast-cutover records because stale hosted/provider wording risk remains high.
- Separately route the pre-existing `workspace cockpit` / `product direct-entry` CLI test drift to a source/test owner lane.
- Or choose RCA uncovered reference bodies, OPL uncovered docs, or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 16:10 CST`
Tranche: `mag-20260412-hosted-opl-handoff-fast-cutover-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-12 hosted caller consumption、hosted contract bundle / route catalog、lightweight product-entry / OPL handoff、OPL-aligned phase map 与 upstream Hermes fast-cutover 历史 specs。目标是确认这些 direct-file 历史入口不会把旧 hosted caller proof、hosted bundle export、`direct` / `opl-handoff` envelope、P1-P4 phase map、Hermes fast-cutover、`runtime-run` / `runtime-resume`、SessionDB attempt durability、`probe-upstream-hermes` 或 future `OPL Gateway` 语义误读成当前 default runtime owner、actual hosted runtime、active public/domain command catalog、App/workbench readiness、production/default caller completion、grant/submission readiness、physical-delete authority 或 compatibility interface。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-12-hosted-caller-consumption-proof-current-truth.md`, `docs/history/specs/2026-04-12-hosted-contract-bundle-entry-and-route-catalog-current-truth.md`, `docs/history/specs/2026-04-12-lightweight-product-entry-and-opl-handoff-current-truth.md`, `docs/history/specs/2026-04-12-opl-aligned-ideal-target-and-phase-map-current-truth.md`, `docs/history/specs/2026-04-12-upstream-hermes-agent-fast-cutover-board.md`, and `docs/history/specs/2026-04-12-upstream-hermes-agent-fast-cutover-current-truth.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/domain_entry.py`, `src/med_autogrant/domain_entry_contract.py`, `src/med_autogrant/domain_runtime_parts/contracts.py`, `src/med_autogrant/hosted_contract_bundle.py`, `src/med_autogrant/public_cli.py`, `tests/test_domain_entry.py`, `tests/test_hosted_contract_bundle.py`, `tests/test_program_control_surfaces.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh read-model probe: clean Python import of `SERVICE_SAFE_DOMAIN_COMMANDS`, `build_domain_entry_contract()` and `build_hosted_authoring_contract()`.

Fresh semantic result:

- All six reviewed files already carried first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- All six files needed small post-2026-05 reading guards because their bodies still contain high-risk direct-file wording: hosted caller proof completed, hosted contract bundle route catalog, `direct` / `opl-handoff`, P1/P3 completed, Hermes substrate cutover, `runtime-run` / `runtime-resume`, `probe-upstream-hermes`, SessionDB attempt durability and future `OPL Gateway`.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_substrate=temporal`, `default_stage_executor=codex_cli`, `optional_hosted_carriers=["hermes_agent"]`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, and `mag_owns_attempt_ledger=false`.
- Fresh command-catalog probe found `SERVICE_SAFE_DOMAIN_COMMANDS` and `domain_entry_contract.supported_commands` both contain 30 current commands. `run-local`, `runtime-run`, `runtime-resume` and `probe-upstream-hermes` are absent from both active domain-entry and grouped public CLI catalogs.
- Fresh hosted authoring contract probe returned the current route id set `direction_screening`, `question_refinement`, `argument_building`, `fit_alignment`, `outline`, `drafting`, `critique`, `revision`, `frozen`, `artifact_bundle`, `final_package`, `hosted_contract_bundle`; historical early landed / pending route splits in these files remain 2026-04-12 snapshots and must not override current source/contracts/tests.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the six 2026-04-12 hosted / OPL handoff / fast-cutover history specs listed above; support read of history specs index, specs lifecycle map, active gap plan, current-program runtime owner fields, domain-entry contract source, hosted authoring contract source, hosted bundle source and retired command no-resurrection surfaces. | `docs/docs_portfolio_consolidation.md`; `docs/history/specs/2026-04-12-hosted-caller-consumption-proof-current-truth.md`; `docs/history/specs/2026-04-12-hosted-contract-bundle-entry-and-route-catalog-current-truth.md`; `docs/history/specs/2026-04-12-lightweight-product-entry-and-opl-handoff-current-truth.md`; `docs/history/specs/2026-04-12-opl-aligned-ideal-target-and-phase-map-current-truth.md`; `docs/history/specs/2026-04-12-upstream-hermes-agent-fast-cutover-board.md`; `docs/history/specs/2026-04-12-upstream-hermes-agent-fast-cutover-current-truth.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These six MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining `docs/history/specs/*.md` files outside recorded batches remain open for paragraph-level governance, including `2026-04-12-author-side-executor-routing-contract-current-truth.md`, `2026-04-12-critique-pending-handoff-contract-current-truth.md`, `2026-04-12-pending-authoring-route-handoff-matrix-current-truth.md`, `2026-04-13-hermes-native-critique-proof-tombstone.md`, and the large 2026-04-10 final-package artifact-bundle fail-closed family not yet covered by a focused tranche.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-12 specs as current runtime owner, default provider, Hermes default route, public `runtime-run` / `runtime-resume`, `probe-upstream-hermes`, local run journal, attempt ledger, hosted runtime readiness, App/release readiness, production readiness, physical-delete authority or active implementation queue is stale pollution.
- Historical `P1` / `P2` / `P3` completed and P4.A/B/C landed wording must remain proof / contract-consumption / product-entry snapshot vocabulary. It must not be upgraded to domain-ready, production-ready, grant-ready, submission-ready, App/workbench ready or physical-delete-ready.
- Historical early route splits and supported-command lists must not override current service-safe command catalog, grouped public CLI or current route catalog. Retired runtime commands have no current grouped public command and must remain retired.
- `direct` / `opl-handoff` vocabulary in these files remains historical product-entry handoff shape. It is not a compatibility interface, production hosted caller, App release gate or external default-caller completion claim.

Verification / absorb:

- MAG docs check passed: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`.
- OPL ledger docs check passed: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`.
- MAG focused tests passed: `tests/test_domain_entry.py`, `tests/test_hosted_contract_bundle.py`, and `tests/test_program_control_surfaces.py` returned 39 pytest cases plus 34 subtests passed.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing the remaining 2026-04-12 route/handoff snapshots, 2026-04-13 Hermes-native tombstone, or the large 2026-04-10 final-package artifact-bundle fail-closed family.
- Separately route the pre-existing `workspace cockpit` / `product direct-entry` CLI test drift to a source/test owner lane.
- Or choose RCA uncovered reference bodies, OPL uncovered docs, or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 16:07 CST`
Tranche: `six-repo-doc-governance-preflight-and-coverage-ledger`
State: `tranche_verified_docs_only`

本轮按 OPL Doc Governance Goal Mode 重新校准默认 OPL series 范围为六仓：`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`。本条是 portfolio-level preflight 与 coverage ledger 修正，不关闭全局 `/goal`，也不把 doctor shape pass 写成六仓 `README*` 与 `docs/**/*.md` 已逐段覆盖。

Fresh live truth inputs:

- 固定 skill 入口 `/Users/gaofeng/workspace/opl-doc-governance/skills/opl-doc-governance/SKILL.md` 与当前 active `/goal`。
- 六仓 `git status --short --branch`、`git worktree list --porcelain`、branch / worktree 最近写入时间和 App 主 checkout 脏状态。
- 六仓 OPL Doc Governance doctor fallback：6/6 `finding_count=0`、`active_truth_status=pass`、`missing=0`、`next_not_ready=0`。doctor 只作为 shape / risk map，不作为语义覆盖证明。
- 六仓主参考 inventory：每仓根层 `README*`、核心 docs 与本仓 active truth owner / ideal-state reference 路径。

Fresh semantic result:

- 六仓均有 active truth baton shape，且 doctor 未发现 prompt 结构缺失；这只说明 active-truth 入口可读，不证明整个 docs portfolio 已语义审计完成。
- `one-person-lab-app` 已纳入默认六仓 governance 范围。App 主 checkout 当前存在外部未提交改动：`README.md`、`docs/status.md`、`docs/testing/README.md`、`package.json`、`scripts/README.md`、`tests/release/app-release-boundary.test.ts`。本轮未触碰这些文件。
- 当前 worktree 清理不满足安全吸收条件：OPL / MAG 有 1 小时内写入的 worktree；MAS 与 App 的附加 worktree 有未提交改动或外部活跃工作痕迹。只清理本轮新建并验证的短 ledger lane。
- 轻量 read-model 探测返回的 JSON 顶层字段与旧记忆字段不一致，本轮不采用旧顶层键作为 readiness / production / domain-ready 语义证据。

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | OPL governance owner docs, six-repo scope checklist, current coverage ledger tail, doctor summary, worktree / branch / App dirty-state evidence. | `docs/active/development-document-portfolio.md` |
| `med-autoscience` | Doctor shape, primary doc inventory, main checkout status and worktree recency only. | none |
| `med-autogrant` | Doctor shape, primary doc inventory, main checkout status and worktree recency only; previous MAG focused history-spec tranche remains the latest paragraph-level write pass. | none |
| `redcube-ai` | Doctor shape, primary doc inventory and clean main checkout status only. | none |
| `opl-meta-agent` | Doctor shape, primary doc inventory and clean main checkout status only; earlier OMA full README/docs tranche remains the paragraph-level coverage owner. | none |
| `one-person-lab-app` | Doctor shape, primary doc inventory and dirty-state / active-lane exclusion only. | none |

Archived / tombstoned / deleted docs:

- none. This tranche only records fresh six-repo governance state and cleanup boundaries.

Unreviewed docs:

- `one-person-lab`: README/docs sections outside already recorded focused OPL / governance chunks remain open for paragraph-level coverage.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: remaining `docs/history/specs/*.md` batches and non-index references listed in prior MAG ledger entries remain open.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche; future work is evidence / hygiene unless docs change.
- `one-person-lab-app`: full App docs coverage remains open. Defer write pass until current App dirty files and release / GUI worktrees are closed or explicitly assigned to this governance lane.

Remaining stale / retire candidates:

- The global stale / retire candidate set remains unchanged: MAG remaining history specs / route-handoff snapshots, MAS evidence / runtime-read / artifact authority wording, RCA reference bodies and runtime/provenance wording, OPL uncovered support docs, and App release-ready / production-ready boundary docs.
- App release-ready / production-ready language remains high risk because App user-path evidence, release artifact evidence and production readiness are separate owner gates.
- Any future cleanup must continue to distinguish doctor shape pass, descriptor/conformance pass, zero-open worklist, refs-only ledger visibility and provider SLO from domain-ready / production-ready / App-release-ready claims.

Next tranche write scope:

- Choose exactly one safe repo / doc cluster at a time. Prefer MAG remaining 2026-04-12 route/handoff snapshots or 2026-04-13 Hermes-native tombstone; RCA uncovered reference bodies; OPL uncovered support docs; or App docs only after the active App dirty lane is resolved or explicitly handed to this goal.
- For each chosen cluster, read live source/contracts/tests/CLI-read-model surfaces first, then update this ledger with reviewed docs, edited docs, archive/tombstone/delete actions, unreviewed docs, stale/retire candidates and next prompt scope.
- Do not mark the global `/goal` complete until all six repos' `README*` and `docs/**/*.md` are paragraph-covered, unreviewed lists are empty, and any remaining gap is closed or moved into the next-round Agent prompt.

Date: `2026-05-26 16:21 CST`
Tranche: `mag-20260410-final-package-artifact-bundle-failclosed-history-specs-coverage`
State: `tranche_verified_absorbed`

本轮覆盖 MAG `docs/history/specs/` 下 2026-04-10 final-package artifact-bundle fail-closed family：14 个 artifact-bundle value/shape hardening specs 加 1 个 malformed artifact bundle spec。目标是确认这些 direct-file 历史入口不会把旧 `build-final-package` fail-closed hardening、artifact bundle value-type proof、local runtime wording 或 package export proof 误读成当前 active implementation queue、public CLI shape、generic OPL artifact owner、submission-ready/export-ready verdict、App release ready、production ready、actual hosted runtime 或 compatibility interface。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-list-element-linked-object-ids-field-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-list-element-linked-object-ids-list-element-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-list-element-required-string-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-list-element-shapes-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-list-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-object-linkage-id-fields-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-object-primary-id-fields-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-object-required-list-element-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-object-required-list-fields-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-object-required-string-fields-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-artifacts-object-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-required-nested-fields-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-required-scalar-value-types-fail-closed-activation-package.md`, `docs/history/specs/2026-04-10-post-r5a-final-package-artifact-bundle-summary-count-value-types-fail-closed-activation-package.md`, and `docs/history/specs/2026-04-10-post-r5a-final-package-malformed-artifact-bundle-fail-closed-activation-package.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `contracts/generated_surface_handoff.json`, `contracts/production_acceptance/mag-production-acceptance.json`, `contracts/external_evidence/mag-evidence-receipt-ledger.json`, `src/med_autogrant/final_package.py`, `src/med_autogrant/final_package_validation.py`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/domain_entry_contract.py`, `src/med_autogrant/hosted_contract_bundle.py`, `tests/test_final_package.py`, `tests/test_hosted_contract_bundle.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh read-model probes: grouped public CLI / domain-entry command catalog, `build_domain_entry_contract()`, `_build_hosted_authoring_contract()`, and current package command mapping.

Fresh semantic result:

- All 15 reviewed files already carry first-screen lifecycle notes plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- These files are correctly scoped as historical post-R5A final-package artifact-bundle fail-closed provenance. They record malformed artifact bundle hardening, not current active implementation work.
- Current final package behavior is source/test owned by `final_package.build_final_package_payload()`, `final_package_validation` / artifact bundle validation helpers, and focused tests in `tests/test_final_package.py`.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_owner=configured_family_runtime_provider`, `default_runtime_substrate=temporal`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, `mag_owns_attempt_ledger=false`, `default_stage_executor=codex_cli`, and `optional_hosted_carriers=["hermes_agent"]`.
- `contracts/production_acceptance/mag-production-acceptance.json` keeps `provider_completion_equals_submission_ready=false`, `structural_conformance_equals_domain_ready=false`, `claims_package_existence_is_submission_ready=false`, and MAG-owned package / submission-ready authority. External evidence remains refs-only and does not carry grant artifact body, package archive body or submission-ready verdict body.
- Current public CLI shape is grouped: historical internal labels `build-artifact-bundle`, `build-final-package`, `build-hosted-contract-bundle`, and `build-submission-ready-package` map to `package artifact-bundle`, `package final-package`, `package hosted-contract-bundle`, and `package submission-ready`.
- Fresh command-catalog probe found 30 current domain-entry supported commands, and retired runtime commands `run-local`, `runtime-run`, `runtime-resume`, and `probe-upstream-hermes` are absent.
- No body rewrite was needed. MAG local ledger was updated; existing lifecycle guards, specs lifecycle map and history specs index are sufficient for the reviewed history files.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the 15 final-package artifact-bundle fail-closed history specs listed above; support read of MAG history specs index, specs lifecycle map, active gap plan, current-program runtime owner fields, production acceptance authority boundaries, generated surface handoff, external evidence ledger, final package source/tests, hosted bundle source/tests, grouped public CLI mapping and command catalog. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These 15 MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining history specs outside recorded batches remain open for paragraph-level governance, including `2026-04-12-author-side-executor-routing-contract-current-truth.md`, `2026-04-12-critique-pending-handoff-contract-current-truth.md`, `2026-04-12-pending-authoring-route-handoff-matrix-current-truth.md`, `2026-04-13-hermes-native-critique-proof-tombstone.md`, and older final-package / presubmission / R2 artifact-bundle provenance not yet covered by focused later ledgers.
- MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- OPL, MAS, RCA and App repo-wide coverage remains open outside recorded chunks. OMA is covered by its earlier full README/docs tranche.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-10 specs as current implementation queue, public CLI command shape, runtime owner, default runtime, active local runtime ladder, actual hosted runtime, App/release readiness, external portal submission authorization, production readiness, physical-delete authority or compatibility-interface source is stale pollution.
- Historical bare package commands must be mapped through current grouped public CLI: `package artifact-bundle`, `package final-package`, `package hosted-contract-bundle`, and `package submission-ready`.
- `final_package` and `artifact_bundle` fail-closed vocabulary must remain within MAG package/export authority, source/test validation evidence and history/provenance boundaries. It must not be upgraded to generic OPL artifact lifecycle ownership, provider-hosted completion, domain ready, grant ready, fundability ready or submission-ready export verdict.

Verification / absorb:

- MAG commit `2cbc052 docs: record final package artifact history coverage` is on MAG `main`; OPL commit `3e6f813a docs: record MAG artifact bundle history coverage` is on OPL `main`.
- MAG focused package tests passed before absorb: `tests/test_final_package.py` and `tests/test_hosted_contract_bundle.py` returned 35 pytest cases plus 186 subtests.
- MAG and OPL docs verification passed before absorb: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor active-truth shape.
- The tranche worktree was no longer present during final cleanup audit; no remaining OPL worktree or branch for this tranche was listed by `git worktree list --porcelain` / merged branch scan.

Next tranche write scope:

- Continue MAG `docs/history/specs/*.md` in date/topic batches, prioritizing remaining 2026-04-12 route/handoff snapshots, `2026-04-13-hermes-native-critique-proof-tombstone.md`, or MAG non-index references such as grant strategy memory policy and OPL family contract adoption.
- Keep the pre-existing `workspace cockpit` / `product direct-entry` CLI test drift routed to a source/test owner lane, not docs-governance closeout.
- Or choose RCA uncovered reference bodies, OPL uncovered docs, or App docs once their main checkout and active worktrees are safe.

Date: `2026-05-26 16:42 CST`
Tranche: `rca-references-family-scope-memory-locator-coverage`
State: `tranche_verified_absorbed`

本轮覆盖 RCA `docs/references/**` 中仍开放的 support reference bodies，重点是 references index、domain memory locator、series governance checklist、executor routing、product-entry support 和 integration support。目标是确认这些 support docs 不把早期“四仓”治理范围、英文旧 lifecycle header、memory descriptor proof、Hermes profile、OPL handoff、`domain_action_adapter` 或 generated/default caller wording 误读成 current active plan、runtime owner、memory body owner、generated wrapper owner、visual ready、domain ready 或 production ready。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/project.md`, `docs/architecture.md`, `docs/active/rca-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`.
- RCA reviewed references: `docs/references/README.md`, `docs/references/domain_memory_descriptor_locator.md`, `docs/references/governance/series-doc-governance-checklist.md`, `docs/references/rca_executor_routing_config.md`, `docs/references/product-entry/README.md`, all three `docs/references/product-entry/*.md`, and both `docs/references/integration/*.md`.
- RCA machine refs: `contracts/runtime-program/current-program.json`, `contracts/functional_privatization_audit.json`, `contracts/production_acceptance/rca-production-acceptance.json`, and current-program `domain_memory_descriptor_locator` / controlled memory apply proof refs.
- OPL status/product docs for current `OPL Framework -> One Person Lab App -> Foundry Agents` layering and six-repo governance scope.
- OPL Doc Governance doctor preflight for RCA as shape/risk map only, not semantic proof.

Fresh semantic result:

- `docs/references/domain_memory_descriptor_locator.md` now has Chinese canonical title, explicit support-reference `Purpose` / `State`, human-readable machine boundary, and lifecycle note for `descriptor_proof_contract_landed_runtime_writeback_pending`.
- The memory locator support now states that OPL can consume locator/provenance/receipt refs, but cannot store memory content, choose RCA route, accept/reject writeback, issue review/export verdicts, write owner receipt bodies or mutate canonical artifacts.
- `docs/references/governance/series-doc-governance-checklist.md` was updated from older four-repo scope to current six-repo OPL family scope: `one-person-lab`, `one-person-lab-app`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`.
- Product-entry and integration support references already matched prior current-caller / generated-wrapper tranches and were rechecked without body edits.
- Executor routing remains an opt-in operator reference: default executor remains `codex_cli`; `hermes_agent` remains explicit non-default proof/backend vocabulary and cannot become default runtime owner.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full read of the reference docs listed above; live contract/core-doc/OPL layering refs listed above. | `docs/references/domain_memory_descriptor_locator.md`; `docs/references/governance/series-doc-governance-checklist.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. RCA reference files remain active support references; the correction was lifecycle metadata and family-scope currentness, not path retirement.

Unreviewed docs:

- RCA root/product-entry/integration/executor-routing/memory-locator/governance reference bodies listed above are now covered for current owner, support role and no-resurrection boundaries.
- RCA remaining uncovered bodies are mainly the long `docs/references/rca-visual-deliverable-agent-ideal-state.md` north-star body if future changes reopen it, plus any new docs created after this tranche. History coverage remains per the prior RCA Hermes / Phase 2 / history plans-runtime-tombstone tranches.
- OPL, MAS, MAG and App repo-wide coverage remains open outside already-recorded chunks. OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Any future RCA reference wording that uses old four-repo governance scope, omits One Person Lab App / OPL Meta Agent from OPL family governance, or moves domain truth / owner receipt / artifact authority into OPL/App is stale pollution.
- Any future RCA memory reference wording that lets OPL store memory body, accept/reject writeback, choose visual route, issue review/export verdict, write owner receipt body, mutate artifacts, or claim runtime writeback complete from descriptor proof alone is stale pollution.
- Any future executor-routing reference wording that treats `hermes_agent`, route-specific Hermes profile, or fallback-with-proof as default executor equivalence, hidden fallback chain, domain ready, production ready, visual ready or export readiness is stale pollution.

Verification / absorb:

- RCA main now includes `4cff9e0 docs: cover RCA reference support boundaries`.
- OPL main now includes `e23381f6 docs: record RCA references coverage tranche`.
- Remaining RCA dirty files are external implementation/test edits unrelated to this docs-governance tranche and were not touched.

Next tranche write scope:

- Continue OPL / MAS / App uncovered docs, or RCA north-star body only if future edits reopen it. Keep App docs delayed until active release / GUI lanes are safe or explicitly handed to this governance goal.

Date: `2026-05-26 16:52 CST`
Tranche: `opl-public-product-support-coverage`
State: `tranche_verified`

本轮重读 OPL `docs/public/**` 公开支撑文档与 `docs/product/opl-public-surface-index.md`，在凌晨 public docs 覆盖 tranche 之后补上公共/产品支撑的 currentness 修正。重点校准公共叙事是否仍被读成旧“三个 domain 仓就是全部 family scope”。本轮不关闭全局 `/goal`，也不表示 OPL 仓 README/docs 已全量逐段覆盖。

Fresh live truth inputs:

- OPL core docs: `docs/README.md`, `docs/status.md`, `docs/project.md`, `docs/architecture.md`.
- Public/product support docs: `docs/public/README.md`, `docs/public/roadmap.md`, `docs/public/task-map.md`, `docs/public/operating-model.md`, `docs/public/unified-harness-engineering-substrate.md`, `docs/product/opl-public-surface-index.md`.
- OPL read models from this worktree:
  - `./bin/opl agents descriptors --json`: descriptor summary reports 3 resolved domain projects and 0 blocked descriptors.
  - `./bin/opl agents conformance --family-defaults --json`: `status=passed`, `passed_count=4`, `blocked_count=0`, `structural_conformance_status=passed`, `production_evidence_tail_count=4`.
  - `./bin/opl runtime app-operator-drilldown --json`: `availability=available`, provider cadence/capability SLO satisfied in summary.
  - `./bin/opl framework readiness --family-defaults --json`: `status=framework_control_plane_available_with_blocked_refs_only_attention`, hard blocker counts 0, open tail count 0, provider cadence/capability SLO satisfied, with refs-only/domain-blocked attention still not a ready claim.

Fresh semantic result:

- Public docs now consistently keep `OPL Framework -> One Person Lab App -> Foundry Agents` as the product layering.
- `docs/public/unified-harness-engineering-substrate.md` now states that UHS first applies to OPL Framework and App/workbench projection, then to the three currently admitted domain capability surfaces: MAS, MAG and RCA.
- `docs/public/unified-harness-engineering-substrate.md` now explicitly keeps `OPL Meta Agent` as Agent Foundry / new-agent builder-test managed module, not a domain truth owner.
- `docs/product/opl-public-surface-index.md` now separates domain capability surfaces from App workbench product surface and OPL Meta Agent managed module / generated plugin consumption.
- No archive/tombstone/delete action was needed; the stale issue was scope wording, not an obsolete document path.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Re-read of `docs/public/README.md`, `docs/public/roadmap.md`, `docs/public/task-map.md`, `docs/public/operating-model.md`, `docs/public/unified-harness-engineering-substrate.md`, `docs/product/opl-public-surface-index.md`, and supporting core docs listed above. | `docs/public/unified-harness-engineering-substrate.md`; `docs/product/opl-public-surface-index.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. Public/product support docs remain active support references with single owner/purpose/state/machine boundary.

Unreviewed docs:

- OPL root `README*`, contracts README files, most `docs/active/**`, `docs/runtime/**`, `docs/delivery/**`, `docs/source/**`, `docs/policies/**`, `docs/specs/**`, most `docs/references/**`, and `docs/history/**` remain open for future paragraph-level coverage outside previously recorded focused tranches.
- MAS, MAG, RCA and App repo-wide coverage remains open outside already-recorded chunks. OMA README/docs coverage remains covered by the earlier OMA tranche.

Remaining stale / retire candidates:

- Any future public/product wording that treats MAS/MAG/RCA descriptor index as the full product layering, omits One Person Lab App from public scope, or promotes OPL Meta Agent into a domain truth / artifact / owner receipt authority is stale pollution.
- Any future wording that turns `agents conformance` pass, descriptor index resolution, App/operator availability, provider SLO satisfied, or zero open tail into domain ready, App release ready or family production ready is stale pollution.

Next tranche write scope:

- Continue OPL uncovered docs cluster by cluster, or switch to MAS/App only when active dirty lanes are safe or explicitly assigned. For OPL, good next clusters are root README/contract README support, runtime support docs, or the remaining current-support references; each needs live contracts/source/CLI read-model truth before edits.

Verification:

- `git diff --check`: passed.
- Strict README/docs/contracts conflict marker scan: passed.
- `python3 /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor . --format json`: `finding_count=0`, active truth status `pass`.

Date: `2026-05-26 17:31 CST`
Tranche: `mag-20260412-route-handoff-20260413-hermes-tombstone-coverage`
State: `tranche_verified_absorbed`

本轮覆盖 MAG `docs/history/specs/` 下剩余 2026-04-12 route / handoff snapshots 和 2026-04-13 Hermes-native critique proof tombstone。目标是确认这些 direct-file 历史入口不会把旧 author-side route snapshot、pending handoff matrix、`runtime-run`、裸 package command、`hermes_native_proof`、Hermes / Gateway wording 或 experimental proof lane 误读成当前 route catalog、public CLI shape、default executor owner、default runtime owner、compatibility interface、App/release readiness、production readiness 或 physical-delete authority。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, and MAG `docs/docs_portfolio_consolidation.md`.
- Reviewed history specs: `docs/history/specs/2026-04-12-author-side-executor-routing-contract-current-truth.md`, `docs/history/specs/2026-04-12-critique-pending-handoff-contract-current-truth.md`, `docs/history/specs/2026-04-12-pending-authoring-route-handoff-matrix-current-truth.md`, and `docs/history/specs/2026-04-13-hermes-native-critique-proof-tombstone.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `src/med_autogrant/public_cli.py`, `src/med_autogrant/domain_entry.py`, `src/med_autogrant/domain_entry_contract.py`, `src/med_autogrant/hosted_contract_bundle.py`, `src/med_autogrant/domain_runtime_parts/substrate.py`, `src/med_autogrant/critique_executor.py`, `src/med_autogrant/hermes_native_executor.py`, `tests/test_domain_entry.py`, `tests/test_critique_executor.py`, `tests/test_program_control_surfaces.py`, active specs listed by `docs/specs/README.md`, schemas/source/CLI/API behavior.
- Fresh read-model probes: `contracts/runtime-program/current-program.json` runtime owner / executor defaults, `MagDomainRuntime().describe_topology()`, `build_domain_entry_contract()`, `_build_hosted_authoring_contract()`, grouped public CLI mapping, active service-safe command catalog, current critique executor vocabulary and retired command absence.

Fresh semantic result:

- All four reviewed files carry first-screen lifecycle signals plus `Owner` / `Purpose` / `State` / `Machine boundary`.
- `2026-04-12-author-side-executor-routing-contract-current-truth.md` remains useful historical author-side executor routing snapshot. It gained one post-2026-05 reading guard because the body still mentions `runtime-run` and bare `build-*` commands. Current operator commands map through grouped CLI, and current route catalog / hosted contract truth is source / contract owned.
- `2026-04-12-critique-pending-handoff-contract-current-truth.md` is already a concise superseded critique pending snapshot. Existing lifecycle guard is sufficient; no body rewrite was needed.
- `2026-04-12-pending-authoring-route-handoff-matrix-current-truth.md` remains useful historical pending handoff matrix. It gained one post-2026-05 reading guard because the body still describes pending authoring routes, Hermes / Gateway collaboration and old surface names. Current `direction_screening -> frozen` routes are landed service-safe commands, and historical workspace surface names map through grouped CLI.
- `2026-04-13-hermes-native-critique-proof-tombstone.md` remains a historical proof tombstone. It gained one post-2026-05 reading guard because the body still uses the superseded `hermes_native_proof` vocabulary. Current explicit non-default executor vocabulary is `executor_kind=hermes_agent`, default critique executor is still `codex_cli`, and non-default executor use requires OPL `AgentExecutionReceipt` style proof with no silent fallback or equivalence claim.
- `contracts/runtime-program/current-program.json` still states `default_task_runtime_owner=one-person-lab`, `default_runtime_owner=configured_family_runtime_provider`, `default_runtime_substrate=temporal`, `default_stage_executor=codex_cli`, `mag_implements_daemon=false`, `mag_implements_scheduler=false`, `mag_implements_attempt_loop=false`, `mag_owns_attempt_ledger=false`, and optional hosted carrier `hermes_agent`.
- Current public CLI shape is grouped. Historical `summarize-workspace`, `stage-route-report`, `critique-summary`, `build-artifact-bundle`, `build-final-package`, `build-hosted-contract-bundle` and `build-submission-ready-package` map to `workspace summarize`, `workspace route-report`, `workspace critique-summary`, `package artifact-bundle`, `package final-package`, `package hosted-contract-bundle` and `package submission-ready`.
- Fresh command-catalog probe found `SERVICE_SAFE_DOMAIN_COMMANDS` has 30 active commands; `run-local`, `runtime-run`, `runtime-resume` and `probe-upstream-hermes` remain absent from active service-safe and grouped public command catalogs.
- Fresh hosted authoring contract probe returned current route ids `direction_screening`, `question_refinement`, `argument_building`, `fit_alignment`, `outline`, `drafting`, `critique`, `revision`, `frozen`, `artifact_bundle`, `final_package`, and `hosted_contract_bundle`; historical pending / landed split text must not override current source/contracts/tests.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four history specs listed above; support read of MAG history specs index, specs lifecycle map, active gap plan, current-program runtime owner / executor defaults, domain-entry contract source, hosted authoring contract source, critique executor source/tests, explicit Hermes adapter proof source/tests and retired command no-resurrection surfaces. | `docs/docs_portfolio_consolidation.md`; `docs/history/specs/2026-04-12-author-side-executor-routing-contract-current-truth.md`; `docs/history/specs/2026-04-12-pending-authoring-route-handoff-matrix-current-truth.md`; `docs/history/specs/2026-04-13-hermes-native-critique-proof-tombstone.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These four MAG files remain useful history provenance; no body move, tombstone, or delete was required.

Unreviewed docs:

- `med-autogrant`: remaining MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist still need paragraph-level checks against current contracts/source unless already covered by a later MAG or OPL ledger entry.
- `one-person-lab`: root `README*`, contracts README files, most active/runtime/delivery/source/policies/specs/references/history docs remain open outside recorded focused tranches.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future direct-file use of these 2026-04-12 / 2026-04-13 files as current route catalog, public CLI command shape, default executor owner, default runtime owner, active `runtime-run` / `runtime-resume`, Gateway/federation readiness, production hosted caller, App release gate, compatibility interface, domain ready, production ready or physical-delete authority is stale pollution.
- `hermes_agent` vocabulary must remain explicit opt-in executor / receipt / proof lane vocabulary. It must not be upgraded to default task runtime owner, provider owner, grant truth owner, quality/export verdict owner, Codex-equivalent executor, long-soak completion or production-ready claim.
- Historical pending matrix and early route split wording must remain 2026-04-12 migration provenance. Current route truth comes from active specs, contracts/source, hosted authoring contract and tests.

Verification / absorb:

- MAG docs verification passed before absorb: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- MAG focused tests passed before absorb: `tests/test_domain_entry.py`, `tests/test_critique_executor.py`, `tests/test_program_control_surfaces.py`, and `tests/test_hosted_contract_bundle.py` returned 46 pytest cases plus 36 subtests.
- OPL ledger worktree verification passed before absorb: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- MAG commit `670d589 docs: cover MAG route handoff history specs` is on MAG `main`; OPL commit `f3e2d769 docs: record MAG route handoff coverage` is on OPL `main`.
- This tranche's MAG and OPL worktrees / branches were removed after fast-forward absorb.

Next tranche write scope:

- Continue MAG non-index references such as grant strategy memory policy, OPL family contract adoption and governance checklist; or choose RCA uncovered reference bodies, OPL uncovered docs, or App docs once their main checkout and active worktrees are safe.
- Keep the pre-existing `workspace cockpit` / `product direct-entry` CLI test drift routed to a source/test owner lane, not docs-governance closeout.

Date: `2026-05-26 18:09 CST`
Tranche: `mag-references-nonindex-coverage`
State: `tranche_verified_absorbed`

本轮覆盖 MAG `docs/references/**` 下剩余非索引支撑文档：grant strategy memory policy、OPL family contract adoption、series doc governance checklist，并复核 references index。目标是关闭上一轮 MAG ledger 中 carry-forward 的 non-index references 缺口，同时校准六仓 OPL series scope、MAG memory authority、OPL projection consumer 和 OMA/App role，不关闭全局 `/goal`。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/references/med-auto-grant-ideal-state.md`, `docs/docs_portfolio_consolidation.md`, and `docs/references/README.md`.
- MAG reviewed references: `docs/references/grant_strategy_memory_policy.md`, `docs/references/integration/opl-family-contract-adoption.md`, `docs/references/governance/series-doc-governance-checklist.md`, and `docs/references/README.md`.
- MAG machine/source truth surfaces: `contracts/runtime-program/current-program.json`, `contracts/runtime-program/opl-family-contract-adoption.json`, `contracts/memory_descriptor.json`, `contracts/pack_compiler_input.json`, `contracts/stage_control_plane.json`, product-entry memory / substrate / manifest source surfaces, `tests/test_opl_family_contract_adoption.py`, and product-entry memory / receipt focused tests.
- OPL support truth: `docs/references/operating-governance/family-domain-memory-governance.md` exists and remains the family-level memory governance reference.

Fresh semantic result:

- MAG grant strategy memory policy already matched current machine truth: memory body and accept/reject authority stay MAG-owned; OPL receives locator / receipt refs only and cannot write memory body or accept/reject writeback.
- MAG OPL family contract adoption already matched current machine truth: OPL is a family-level projection consumer; MAG keeps grant authoring runtime / route truth, quality/fundability/export authority and submission-ready gate.
- MAG pack compiler and stage control contracts confirm `agent/` remains the canonical Declarative Grant Pack and six-stage descriptor/projection surface; this is not a new MAG private runtime or App/workbench readiness claim.
- MAG series governance checklist had stale four-repo wording. It now uses the current six-repo OPL series scope: `one-person-lab`, `one-person-lab-app`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`.
- The same checklist now states that One Person Lab App is App/workbench and operator projection consumer, and OPL Meta Agent is Agent Foundry / new-agent builder-test managed module, not domain truth, artifact authority or owner receipt authority.
- MAG references index now links the governance checklist so support references are discoverable from `docs/references/README.md`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the four references listed above; support read of MAG core docs, ideal-state reference, active gap plan, runtime-program owner fields, OPL family adoption contract, memory descriptor, pack compiler input, stage control plane and relevant memory/adoption tests. | `docs/docs_portfolio_consolidation.md`; `docs/references/README.md`; `docs/references/governance/series-doc-governance-checklist.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. MAG references remain active support references; the correction was stale family-scope wording and index discoverability, not path retirement.

Unreviewed docs:

- `med-autogrant`: the previously named non-index reference gap is now covered. Remaining MAG uncovered scope follows the cumulative ledger: any `docs/history/**` process/history bodies not explicitly covered by focused later ledgers, future newly added docs, and sections reopened by later code/contract changes.
- `one-person-lab`: root `README*`, contracts README files, most active/runtime/delivery/source/policies/specs/references/history docs remain open outside recorded focused tranches.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future MAG reference wording that turns MAG memory into OPL-owned grant strategy content, fundability / quality / export verdict, submission-ready authority, repo-source memory body store or automatic recipe engine is stale pollution.
- Any future MAG adoption wording that turns OPL projection consumption, descriptor index, `agent/` pack, stage control plane or substrate adapter export into MAG private runtime, OPL grant truth owner, quality/export authority, App/workbench readiness, production ready or long-soak completion is stale pollution.
- Any future MAG governance checklist wording that reverts to four-repo scope, omits One Person Lab App, or promotes OPL Meta Agent into domain truth / artifact / owner receipt authority is stale pollution.

Verification before absorb:

- MAG docs verification passed: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- MAG focused memory/adoption/stage-control tests passed: `tests/test_opl_family_contract_adoption.py`, `tests/product_entry_cases/test_domain_memory_descriptor.py`, `tests/product_entry_cases/test_memory_receipt_projection.py`, `tests/product_entry_cases/test_domain_memory_receipt_evidence.py`, `tests/product_entry_cases/test_family_stage_control_plane.py`, and `tests/product_entry_cases/test_opl_substrate_adapter.py` returned 26 pytest cases plus 45 subtests.
- OPL ledger worktree verification passed: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- A broader MAG product family orchestration focused run still exposes a pre-existing product user-loop runtime-state root expectation drift; keep that source/test issue outside this docs-governance tranche.
- MAG commit `adfefd2 docs: cover MAG reference support boundaries` is on MAG `main`; OPL commit `2c152829 docs: record MAG references coverage` is on OPL `main`.
- This tranche's MAG and OPL worktrees / branches were removed after fast-forward absorb.

Next tranche write scope:

- Continue another safe repo/doc cluster: OPL uncovered support docs, MAS remaining repo-wide docs, RCA remaining bodies after external implementation dirt is isolated, or App docs once active App dirty lanes are closed or explicitly assigned.
- Keep the pre-existing MAG `workspace cockpit` / `product direct-entry` / `product user-loop` CLI and runtime-state expectation drift routed to a source/test owner lane, not docs-governance closeout.

Date: `2026-05-26 18:29 CST`
Tranche: `mas-governance-reference-six-repo-scope-coverage`
State: `tranche_verified_absorbed`

本轮覆盖 MAS `docs/references/governance/series-doc-governance-checklist.md` 与 references index discoverability。目标是把 MAS governance support reference 从旧四仓 wording 校准到当前六仓 OPL series scope，并把 MAS runtime-facing refs / OPL hosted runtime split、One Person Lab App、OPL Meta Agent 角色写清。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 已全量逐段覆盖。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/references/positioning/mas_ideal_state.md`, `docs/docs_portfolio_consolidation.md`, and `docs/references/README.md`.
- MAS reviewed references: `docs/references/governance/series-doc-governance-checklist.md`, plus prior `docs/references/integration/*.md` coverage ledger to avoid duplicate integration coverage.
- MAS machine refs: `contracts/generated_surface_handoff.json`, `contracts/functional_privatization_audit.json`, and `contracts/production_acceptance/mas-production-acceptance.json`.
- OPL/App/OMA role truth: OPL current status / decisions / coverage ledger for `OPL Framework -> One Person Lab App -> Foundry Agents`, App README/status for desktop workbench ownership, and OMA README/status for Agent Foundry / new-agent builder-test managed module boundary.

Fresh semantic result:

- MAS series governance checklist now names the current six-repo OPL series scope: `one-person-lab`, `one-person-lab-app`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`.
- The checklist now says MAS owns runtime-facing domain authority refs, owner receipt and typed blocker while default hosted autonomous runtime is OPL/Temporal-owned.
- One Person Lab App is App/workbench and operator projection consumer.
- OPL Meta Agent is Agent Foundry / new-agent builder-test managed module, not MAS/MAG/RCA domain truth, artifact authority or owner receipt authority.
- MAS references index now links the governance directory.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/references/governance/series-doc-governance-checklist.md`; support read of MAS references index, core/current docs, prior integration-reference coverage ledger, generated-surface / functional-privatization / production-acceptance contracts, and OPL/App/OMA role docs. | `docs/references/governance/series-doc-governance-checklist.md`; `docs/references/README.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. MAS governance references remain active support references; stale family-scope wording and index discoverability were corrected in place.

Unreviewed docs:

- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `one-person-lab`: root `README*`, contracts README files, most active/runtime/delivery/source/policies/specs/references/history docs remain open outside recorded focused tranches.
- `med-autogrant`: remaining history/support bodies follow the cumulative MAG ledger; MAG non-index references were covered in the previous tranche.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future MAS governance wording that reverts to four-repo scope, omits One Person Lab App, or promotes OPL Meta Agent into domain truth / artifact / owner receipt authority is stale pollution.
- Any future MAS reference wording that treats MAS runtime-facing refs or owner receipts as MAS-owned generic queue/provider/worker runtime ownership is stale; default hosted autonomous runtime remains OPL/Temporal.

Verification / absorb:

- MAS docs verification passed before absorb: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL ledger worktree verification passed before absorb: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- MAS commit `a1aaff60 docs: cover MAS governance reference scope` is on MAS `main`; OPL commit `8c5dc5f3 docs: record MAS governance reference coverage` is on OPL `main`.
- This tranche's MAS and OPL worktrees / branches were removed after fast-forward absorb.
- Final lightweight six-repo verification passed after absorb: all six repos passed `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- Retained external lanes: OPL `codex/opl-stage-attempt-support-for-oma` has uncommitted source/test edits and recent writes; MAS `codex/mas-guarded-apply-task-id-20260526`, `codex/mas-paper-line-stage-evidence-handoff-20260526`, `fix/dm002-story-surface-workunit-fix`, and `fix/dm002-terminal-stall-bridged-handoff` have uncommitted edits or recent writes; App `codex/full-first-run-stable-gate-20260525` and `codex/nightly-release-20260525` have uncommitted release/docs/test edits. They were not cleaned by this tranche.

Next tranche write scope:

- Continue MAS remaining repo-wide docs, OPL uncovered support docs, RCA remaining bodies after external implementation dirt is isolated, or App docs once active App dirty lanes are closed or explicitly assigned.

Date: `2026-05-26 19:00 CST`
Tranche: `mag-nonspec-history-coverage`
State: `tranche_verified_absorbed`

本轮覆盖 MAG `docs/history/**` 下非 specs 历史入口：历史 plans、product handoff、runtime owner split、positioning 和 OMX index。目标是把旧 scaffold/P1 plan、hosted caller proof、Hermes/Gateway/local-runtime/Domain Harness OS 词汇、轻量 product-entry shell 和 `.omx` / `.runtime-program` 语境限定在 provenance，不关闭全局 `/goal`，也不表示 OPL/MAS/RCA/App repo-wide README/docs 已全量覆盖。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/references/med-auto-grant-ideal-state.md`, `contracts/runtime-program/current-program.json`, and `contracts/production_acceptance/mag-production-acceptance.json`.
- MAG reviewed history docs: `docs/history/README.md`, `docs/history/plans/README.md`, `docs/history/plans/2026-04-06-med-autogrant-minimal-scaffold-plan.md`, `docs/history/plans/2026-04-07-p1-formal-entry-and-durability-planning-brief.md`, `docs/history/plans/2026-04-12-opl-aligned-target-shape-and-hosted-caller-plan.md`, `docs/history/plans/2026-04-13-grant-writing-full-coverage-landing-plan.md`, `docs/history/plans/mag-standard-agent-doc-process-history-2026-05.md`, `docs/history/product/lightweight-product-entry-and-opl-handoff.md`, `docs/history/runtime/opl-managed-runtime-three-layer-contract.md`, `docs/history/positioning/domain-harness-os-positioning.md`, and `docs/history/omx/README.md`.
- Source/read-model support: `MagDomainRuntime.describe_topology` source reports OPL runtime ownership, no generic MAG runtime ownership, `Codex CLI` default stage attempt executor, and `Hermes-Agent` as explicit opt-in proof executor; `PUBLIC_GROUP_COMMANDS` exposes grouped workspace/mainline/domain-handler/authority/pass/package commands.

Fresh semantic result:

- History root, plans index, runtime history, positioning history and OMX index already carry owner / purpose / state / machine-boundary signals or directory inheritance sufficient for direct-file reading.
- Old scaffold, P1 durability, hosted caller and full authoring landing plans are correctly scoped as completed history. Their unchecked task lists, old `docs/plans` paths, `MCP/controller`, `.runtime-program` and hosted proof wording do not reopen active backlog.
- MAG product handoff history had one stale-risk body phrase: “真实 upstream `Hermes-Agent` substrate 已经 landed”. It now states that this was a hosted / upstream proof lane and migration-background claim; current default runtime owner remains OPL/Temporal, and `Hermes-Agent` remains a non-default proof / executor adapter lane.
- No archive, tombstone or deletion action was needed.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Full paragraph read of the MAG non-spec history docs listed above; support read of MAG current status, active gap plan, ideal-state reference, runtime-program owner fields, production acceptance authority boundaries, domain runtime topology source and grouped public CLI shape. | `docs/docs_portfolio_consolidation.md`; `docs/history/product/lightweight-product-entry-and-opl-handoff.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These MAG non-spec history files remain useful provenance; the issue was one stale-risk wording correction, not path retirement.

Unreviewed docs:

- `med-autogrant`: root README, core docs, active plan, ideal-state reference, specs, thin indexes, non-index references, history specs focused batches and this non-spec history cluster now have recorded coverage. Remaining MAG uncovered scope is future new docs, historical bodies not named by final reconcile, or sections reopened by later code/contract changes.
- `one-person-lab`: root `README*`, contracts README files, most active/runtime/delivery/source/policies/specs/references/history docs remain open outside recorded focused tranches.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future MAG history wording that turns hosted / upstream Hermes proof lane into current default runtime owner, provider owner, production-ready claim or Codex-equivalent executor is stale pollution.
- Any future MAG history plan wording that revives `.omx`, `.runtime-program`, old `docs/plans`, Gateway/local-manager, flat CLI alias, local journal, attempt ledger, product-sidecar or compatibility aggregate tests as active surfaces is stale pollution.
- Any future MAG product handoff wording that turns lightweight product-entry / OPL handoff provenance into mature App/workbench readiness, final UX, grant-ready, submission-ready, export-ready or production-ready evidence is stale pollution.

Verification before absorb:

- MAG docs verification passed before absorb: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- MAG live surface probes confirmed `MagDomainRuntime.describe_topology()` reports `runtime_owner="one-person-lab"`, `can_claim_generic_runtime_owner=false`, default stage attempt executor `Codex CLI`, and optional proof executor `Hermes-Agent` with `explicit opt-in only`; grouped public CLI exposes workspace/mainline/domain-handler/authority/pass/package command groups.
- MAG focused tests passed: `./scripts/run-pytest-clean.sh tests/test_program_control_surfaces.py tests/test_domain_entry.py -q` returned 25 pytest cases plus 19 subtests.
- OPL ledger worktree verification passed before commit: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- MAG commit `39e4460 docs: cover MAG non-spec history boundaries` is on MAG `main`.
- OPL commits `ea2d7bdd docs: record MAG non-spec history coverage` and this closeout status update are on OPL `main`.
- This tranche's MAG and OPL worktrees / branches were removed after fast-forward absorb.
- Final lightweight six-repo verification passed after absorb: all six repos returned `git diff --check` exit 0, strict README/docs/contracts conflict-marker scan had no hits, and OPL Doc Governance doctor returned `finding_count=0`, active truth `pass`, `missing=0`, `next_not_ready=0`.

Next tranche write scope:

- Continue OPL uncovered support docs or MAS remaining repo-wide docs while RCA/App main checkouts still carry external dirty implementation/release lanes.
- If returning to MAG, run a final inventory/reconcile pass against all `README*` and `docs/**/*.md` to confirm no new docs appeared after the recorded MAG coverage tranches.

Date: `2026-05-26 19:14 CST`
Tranche: `mag-final-inventory-reconcile`
State: `tranche_verified`

本轮对 MAG 当前 `README*` 与 `docs/**/*.md` 做最终 inventory reconcile，并把 MAG 本地 coverage accounting 与 OPL 全局 ledger 对齐。目标是确认 MAG 当前 inventory 没有新增未治理文档，并把此前 grouped coverage 覆盖但文件名未逐字点名的路径映射清楚；本轮不关闭全局 `/goal`，也不把 MAG docs closeout 升级为 runtime / production / physical-delete 完成。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core docs, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/references/med-auto-grant-ideal-state.md`, and `docs/docs_portfolio_consolidation.md`.
- MAG inventory script over `README*` and `docs/**/*.md`: `inventory_count=120`.
- Reconcile scan before this tranche: `not_explicitly_named_count=26`. The 26 paths map to earlier grouped coverage entries rather than open doc gaps: MAG entry/support docs, docs/core/active owner surfaces, current specs/thin index coverage, 2026-04-06 history specs coverage, non-spec history coverage, and the previous compaction row.
- MAG contract/read-model truth: `contracts/runtime-program/current-program.json`, `contracts/functional_privatization_audit.json`, `contracts/production_acceptance/mag-production-acceptance.json`, `contracts/external_evidence/mag-evidence-receipt-ledger.json`, `MagDomainRuntime.describe_topology()`, and `public_cli.PUBLIC_GROUP_COMMANDS`.

Fresh semantic result:

- Current MAG scope remains 120 `README*` / `docs/**/*.md` files. No new MAG scoped markdown file appeared after the recorded MAG coverage tranches.
- MAG grouped coverage now accounts for root README bilingual/support paths, `agent/README.md`, `contracts/README.md`, `runtime/README.md`, docs entry/core/active support docs, all current specs, thin indexes, history specs batches, non-index references, and non-spec history.
- MAG machine truth still reads as OPL/Temporal default runtime ownership, Codex CLI default stage executor, no MAG daemon / scheduler / attempt loop / attempt ledger, no MAG generic runtime ownership, `claims_domain_repo_physical_delete_authorized=false`, `claims_production_long_run_soak_complete=false`, provider completion not equal to domain/fundability/submission ready, and MAG not implementing App workbench or OPL runtime.
- Fresh MAG clean-runner probe confirmed `MagDomainRuntime.describe_topology()` reports `runtime_owner="one-person-lab"`, `can_claim_generic_runtime_owner=false`, default stage attempt executor `Codex CLI`, and `Hermes-Agent` as explicit opt-in proof executor only; grouped public CLI exposes workspace/mainline/domain-handler/authority/pass/package command groups.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | Current 120-file `README*` / `docs/**/*.md` inventory reconciled against prior grouped MAG coverage entries; support read of MAG core/active/ideal-state docs, current contracts, domain runtime topology and grouped public CLI surface. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | coverage ledger owner only | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. This was a coverage-accounting reconcile; no new MAG stale doc path required archive, tombstone or deletion.

Unreviewed docs:

- `med-autogrant`: none in the current 120-file recorded scope. Future new MAG docs or later source/contract changes can reopen specific sections.
- `one-person-lab`: root `README*`, contracts README files, most active/runtime/delivery/source/policies/specs/references/history docs remain open outside recorded focused tranches.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still has external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- MAG remaining work is implementation/evidence tail, not uncovered docs: physical delete authorization, production long-soak, submission-ready human gate, sustained real consumption and long-soak evidence remain open.
- Any future MAG docs wording that turns OPL projection, Temporal provider completion, descriptor conformance, history provenance, optional Hermes proof lane or zero open worklist into grant-domain ready, fundability ready, submission/export ready, production ready, MAG-owned generic runtime or App/workbench ownership is stale pollution.

Verification before absorb:

- MAG docs verification passed in the tranche worktree: `git diff --check` exited 0, strict README/docs/contracts conflict-marker scan had no hits, and OPL Doc Governance doctor returned `finding_count=0`, active truth `pass`.
- MAG clean-runner topology probe passed via `./scripts/run-python-clean.sh`: `MagDomainRuntime.describe_topology()` returned OPL runtime ownership, no generic MAG runtime ownership, `Codex CLI` default executor and explicit opt-in `Hermes-Agent`; `PUBLIC_GROUP_COMMANDS` returned workspace/mainline/domain-handler/authority/pass/package groups.
- OPL ledger worktree verification passed: `git diff --check` exited 0, strict README/docs/contracts conflict-marker scan had no hits, and OPL Doc Governance doctor returned `finding_count=0`, active truth `pass`.

Next tranche write scope:

- Continue OPL uncovered support docs or MAS remaining repo-wide docs while RCA/App main checkouts still carry external dirty implementation/release lanes.
- Return to MAG only if new MAG docs appear, later code/contract changes reopen a section, or a source/test owner lane closes one of the remaining runtime/evidence/physical-cleanup tails and requires doc foldback.

Date: `2026-05-26 19:28 CST`
Tranche: `opl-policies-docs-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/policies/**` 的稳定治理政策文档。目标是确认 docs lifecycle、domain private functional surface、GitHub CI automation 和 workspace/file lifecycle 政策仍是人读 stable policy，且其硬约束已由核心五件套、contracts、CLI/read-model、scripts 和 tests 承接。本轮不关闭全局 `/goal`，也不表示 OPL repo-root `README*`、contracts README 或所有 `docs/**/*.md` 已逐段覆盖。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, and `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`.
- OPL policy docs: `docs/policies/README.md`, `docs/policies/docs-lifecycle-policy.md`, `docs/policies/domain-private-functional-surface-policy.md`, `docs/policies/github-ci-automation-policy.md`, and `docs/policies/runtime-artifact-hygiene-policy.md`.
- Machine/support surfaces: `docs/invariants.md`, `contracts/family-orchestration/README.md`, `contracts/family-orchestration/README.zh-CN.md`, `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`, `package.json`, `scripts/run-with-repo-temp-env.sh`, `scripts/repo-hygiene.sh`, `scripts/verify.sh`, `tests/src/verification-command-surfaces.test.ts`, `tests/src/cli/cases/agents-scaffold.test.ts`, `tests/src/cli/cases/agents-default-callers.test.ts`, `tests/src/cli/cases/workspace-domain.lifecycle-cleanup.test.ts`, and App/operator / framework readiness tests surfaced by `rg`.
- Fresh OPL read models: `opl framework readiness --family-defaults --json`, `opl agents conformance --family-defaults --json`, `opl agents default-callers --family-defaults --json`, and `opl runtime app-operator-drilldown --json`.

Fresh semantic result:

- All five policy docs already carry owner, purpose, state and machine-boundary signals; no policy body needed stale wording correction this tranche.
- `docs-lifecycle-policy.md` remains a stable human policy: docs prose is not a machine interface, active ledger must not become process log, and hard constraints continue to live in core docs or machine contracts.
- `domain-private-functional-surface-policy.md` remains aligned with the current standard-agent target: `Declarative Domain Pack + OPL generated/hosted surfaces + standard authority functions`. It is supported by scaffold/default-caller/audit contracts and read models; it does not authorize domain repo physical deletion, domain ready or production ready.
- `github-ci-automation-policy.md` remains a human maintenance policy. It separates current failures, queued/in-progress current surfaces, superseded historical failures and manual actions; no repo source or workflow change was required in this tranche.
- `runtime-artifact-hygiene-policy.md` remains aligned with current checkout hygiene: `scripts/verify.sh` enters `scripts/run-with-repo-temp-env.sh`, Python/Node/npm/Cargo/cache paths are routed to a repo-external temp root, and `scripts/repo-hygiene.sh` blocks forbidden tracked/unignored generated paths.
- Fresh conformance read model returned `status=passed`, `passed_count=4`, `blocked_count=0`, `production_evidence_tail_count=4`.
- Fresh default-caller read model returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, `missing_domain_owner_receipt_or_typed_blocker_count=0`, `missing_no_forbidden_write_proof_count=0`, `missing_tombstone_or_provenance_ref_count=0`.
- Fresh framework readiness returned `status=framework_control_plane_available_with_blocked_refs_only_attention`, `control_plane_available=true`, `framework_kernel_hard_blocker_count=0`, `open_tail_count=0`, `domain_blocked_attention_tail_count=266`, and `provider_slo_*` statuses satisfied. These refs-only / typed-blocker attention counts do not authorize domain ready or production ready.
- Fresh App/operator drilldown returned `availability=available`, `functional_privatization_action_required_count=0`, `functional_privatization_active_private_generic_residue_count=0`, `default_caller_deletion_evidence_open_requirement_count=0`, `app_release_user_path_release_ready_claimed=false`, and `app_release_user_path_production_ready_claimed=false`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph read of `docs/policies/README.md`, `docs/policies/docs-lifecycle-policy.md`, `docs/policies/domain-private-functional-surface-policy.md`, `docs/policies/github-ci-automation-policy.md`, and `docs/policies/runtime-artifact-hygiene-policy.md`; support read of OPL core active docs, ideal-state reference, invariants, package scripts, hygiene / verification scripts, and relevant tests/contracts/read-models. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The policy docs remain active stable policies; the tranche only recorded coverage and supporting live evidence.

Unreviewed docs:

- `one-person-lab`: current inventory is 175 `README*` / `docs/**/*.md` / contracts README files. Before this ledger entry, 81 paths were not exact substrings in this coverage ledger; after this policy coverage, OPL root `README*`, contracts README files, `docs/active/opl-family-development-reference.md`, `docs/active/production-framework-closure-gap-matrix.md`, most `docs/history/**`, several `docs/references/current-support/**`, `docs/references/operating-governance/family-domain-quality-projection-contract.md`, and `docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md` remain open outside recorded focused tranches.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future OPL policy wording that treats prose docs as machine-stable interfaces, revives active execution diaries, or pins tests to Markdown wording/path text is stale pollution.
- Any future policy wording that turns structural conformance, default-caller evidence, App/operator drilldown, provider SLO, doctor clean, zero open worklist, refs-only external evidence, or typed blocker accounting into domain ready, App release ready, physical delete authorized or production ready is stale pollution.
- Any future domain-private-surface policy wording that broadens `refs_only_domain_adapter` into a repo-local default caller, workbench/status/product shell, scheduler, queue, attempt ledger, runtime owner, memory/artifact body transport or generated-surface owner reopens the standard-agent source-purity guard.
- Any future workspace/file lifecycle wording that accepts checkout-local `.venv`, `__pycache__`, `.pytest_cache`, egg-info, runtime-state, workspace state or artifact body as normal repo-source output is stale pollution; producer routing must be fixed rather than papered over by ignore rules.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL policy support read models and focused evidence commands above were rerun fresh in the tranche worktree.

Next tranche write scope:

- Continue OPL uncovered support docs or MAS remaining repo-wide docs while RCA/App main checkouts still carry external dirty implementation/release lanes.
- Good OPL next clusters are root `README*` / contracts README coverage, active support docs (`opl-family-development-reference.md`, `production-framework-closure-gap-matrix.md`), current-support references, or history/gateway-federation tombstone bodies.

Date: `2026-05-26 19:41 CST`
Tranche: `opl-current-support-docs-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/references/current-support/**` 当前支撑参考文档。目标是确认安装、GUI/WebUI、发布包、skills、quality details 和 test lane 治理参考仍是 support reference，且行为真相由 CLI/source/contracts/scripts/tests/App release owner 持有。本轮不关闭全局 `/goal`，也不表示 OPL root `README*`、contracts README、active support docs 或 history bodies 已逐段覆盖。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, and `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`.
- Current-support docs: `docs/references/current-support/README.md`, `docs/references/current-support/opl-default-skill-ecosystem.md`, `docs/references/current-support/opl-docker-webui-deployment.md`, `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`, `docs/references/current-support/opl-gui-shell-adapter-boundary.md`, `docs/references/current-support/opl-quality-details.md`, `docs/references/current-support/opl-release-packages-modular-distribution.md`, and `docs/references/current-support/opl-test-lane-governance.md`.
- Machine/support surfaces: `package.json`, `scripts/test-lanes.mjs`, `scripts/verify.sh`, `scripts/run-with-repo-temp-env.sh`, `scripts/run-structural-quality-gate.sh`, `.github/actions/quality-details/action.yml`, `.github/workflows/packages.yml`, `.github/workflows/verify.yml`, `.github/workflows/sentrux-advisory.yml`, `contracts/opl-framework/fresh-install-test-matrix.json`, `contracts/README.md`, `contracts/family-orchestration/README.md`, `src/install-companions.ts`, `src/install-companions/gui-shell.ts`, `src/opl-release.ts`, `src/system-installation/initialize.ts`, `src/system-installation/first-run-contract.ts`, `src/system-installation/turnkey.ts`, `src/aionui-acp-shell.ts`, `src/cli/cases/public-command-specs.ts`, `src/cli/cases/private-command-specs.ts`, and related verification tests surfaced by `rg`.
- Fresh read-only commands: `opl packages manifest --json`, `opl quality details --root . --format json --limit 3`, `opl skill companion status --superpowers lite`, `opl system initialize --json`, `node scripts/test-lanes.mjs list`, and `node scripts/test-lanes.mjs assert-coverage`.

Fresh semantic result:

- All eight current-support docs already carry owner, purpose, state and machine-boundary signals. No support-reference body needed stale wording correction this tranche.
- `README.md` correctly scopes current-support docs as operator references, not runtime topology owners.
- `opl-default-skill-ecosystem.md` remains aligned with live `skill companion` / `skill sync` surfaces: `opl skill companion status --superpowers lite` returned `surface_id=opl_companion_skill_sync`, `mode=observe`, `superpowers_profile=lite`, and `item_count=8`; observe mode does not mutate user state.
- `opl-docker-webui-deployment.md` and `opl-gui-shell-adapter-boundary.md` remain aligned with App/shell owner split: `one-person-lab-app` owns App/WebUI release and `opl-aion-shell` / `shells/aionui` shell implementation, while OPL owns CLI/runtime/contracts/projection surfaces.
- `opl-fresh-install-and-gui-first-launch-testing.md` remains aligned with `contracts/opl-framework/fresh-install-test-matrix.json`, `npm run test:fresh-install`, `fresh-install:smoke`, and App-owned VM proof. OPL main holds CLI clean-room truth; release App VM proof remains in `one-person-lab-app`.
- `opl-quality-details.md` remains aligned with the live `opl quality details` sidecar and Sentrux boundary: fresh JSON returned `surface_kind=opl_code_quality_details.v1` and 3 `agent_triage_targets`; Sentrux remains structural gate/advisory owner, while OPL emits deterministic triage details.
- `opl-release-packages-modular-distribution.md` remains aligned with current Packages status: fresh `opl packages manifest --json` returned `manifest_version=1`, `opl_version=26.4.27`, `module_install_update_source=git_checkout`, `package_consumption_status=packages_defined_not_consumed_by_install_update`, `package_count=4`, and `release_automation_status=prepared_not_consumed_by_module_install_update`. Packages are defined but not the active module install/update source.
- `opl-test-lane-governance.md` remains aligned with `package.json`, `scripts/test-lanes.mjs` and `scripts/verify.sh`: `node scripts/test-lanes.mjs assert-coverage` returned all 194 active test files assigned to a lane. `npm test` still maps to `test:fast`; `test:meta`, `test:read-model-gates`, `fresh-install`, `native`, `structure` and `full` remain separate lanes.
- `opl system initialize --json` returned the `system_initialize` envelope with `setup_flow`, `gui_shell`, `first_run_log`, `gui_first_run_automation`, `recommended_skills`, `online_management`, `readiness`, and domain module surfaces, matching the fresh-install / GUI automation support docs.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph read of all 8 `docs/references/current-support/*.md` files; support read of OPL active docs, ideal-state reference, package scripts, test-lane registry, verify runner, fresh-install contract, Packages manifest surfaces, skill companion surfaces, quality details surfaces, GUI/App shell owner surfaces, workflows and related tests. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The current-support docs remain support references; the tranche only recorded coverage and supporting live evidence.

Unreviewed docs:

- `one-person-lab`: current inventory remains 175 `README*` / `docs/**/*.md` / contracts README files. Before this ledger entry, 72 paths were not exact substrings in this coverage ledger; after this current-support coverage, remaining open clusters are OPL root `README*`, `contracts/opl-framework/README.zh-CN.md`, active support docs such as `docs/active/opl-family-development-reference.md` and `docs/active/production-framework-closure-gap-matrix.md`, most `docs/history/**` compatibility/process bodies, and `docs/references/operating-governance/family-domain-quality-projection-contract.md`.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future current-support wording that turns `one-person-lab-app`, `opl-aion-shell`, WebUI Docker, Full DMG, App user-path evidence, `opl system initialize`, package manifest, quality details, Sentrux advisory, or test lane prose into OPL runtime/domain truth, release-ready verdict, production-ready verdict, or domain owner authority is stale pollution.
- Any future Packages wording that claims `opl module install/update` already consumes GHCR/Packages as the current source before code/read-model support lands is stale pollution; current source remains `git_checkout`.
- Any future GUI/WebUI wording that makes `opl-aion-shell` or App shell an OPL runtime owner, or revives headless Product API as user WebUI entry, is stale pollution.
- Any future test-lane wording that makes prose the lane registry, skips `scripts/test-lanes.mjs assert-coverage`, or treats GUI/App VM proof as OPL main fast/integration lane is stale pollution.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL current-support read-only support commands above were rerun fresh in the tranche worktree; no behavior-changing source/contract edit was made.

Next tranche write scope:

- Continue OPL uncovered root/contract README or active-support docs only if existing external worktrees are safe to absorb/avoid; otherwise pick MAS remaining repo-wide docs.
- Good OPL next clusters after current-support are `contracts/opl-framework/README.zh-CN.md`, `docs/active/opl-family-development-reference.md`, `docs/active/production-framework-closure-gap-matrix.md`, or history/gateway-federation tombstone bodies.

Date: `2026-05-26 19:54 CST`
Tranche: `opl-history-compatibility-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/compatibility/**` 的 gateway / federation / routed-action 历史兼容语料。目标是确认这组文档全部停留在 history / tombstone / provenance 语境，不作为当前 runtime、compatibility interface、machine contract、test oracle、domain admission authority 或保留旧 alias/facade 的依据。本轮不关闭全局 `/goal`，也不表示 OPL `README*`、contracts README、active support 或 `docs/history/process/**` 已逐段覆盖。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`, and `contracts/README.md`.
- Compatibility history docs: `docs/history/compatibility/README.md`, all `docs/history/compatibility/gateway-federation/*.md`, `docs/history/compatibility/gateway-federation/examples-corpora/*.md`, and `docs/history/compatibility/gateway-federation/operating-governance/*.md`.
- Fresh OPL read models: `opl framework readiness --family-defaults --json`, `opl agents conformance --family-defaults --json`, and `opl agents default-callers --family-defaults --json`.

Fresh semantic result:

- The current OPL truth remains stage-led, Codex-default, provider-backed framework runtime with explicit domain-agent activation. Gateway / federation / routed-action wording is historical vocabulary, not current entrypoint, runtime owner, compatibility surface, domain truth owner or production readiness proof.
- Fresh `opl framework readiness --family-defaults --json` returned `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `open_tail_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=268`, and provider SLO cadence/capability satisfied. Refs-only / typed-blocker attention does not authorize domain ready or production ready.
- Fresh `opl agents conformance --family-defaults --json` returned `status=passed`, `passed_count=4`, `blocked_count=0`, and `production_evidence_tail_count=4`; this is structural conformance, not domain / production completion.
- Fresh `opl agents default-callers --family-defaults --json` returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, and zero missing domain-owner / no-forbidden-write / tombstone refs. The report still declares `physical_delete_authorized=false` and cannot claim domain ready, quality verdict, artifact authority or production ready.
- `docs/history/compatibility/README.md` lacked explicit `Purpose`, `State` and `Machine boundary` signals as a standalone long-lived directory index; it now inherits the same tombstone boundary as the gateway-federation subtree.
- `docs/history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md` contained stale-risk present-tense phrases such as “现在可以被激活” and “当前已激活”. These were rewritten as dated historical activation / freeze wording so the old admitted-domain federation package cannot be read as current active activation, admission or runtime authority.
- Other compatibility history bodies already carry `history_only` / provenance boundaries or explicit non-runtime / non-truth / non-test-oracle notes; long acceptance snippets and embedded historical examples remain useful archaeology, not current verification requirements.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph / heading review of `docs/history/compatibility/README.md`, `docs/history/compatibility/gateway-federation/README.md`, `docs/history/compatibility/gateway-federation/gateway-federation.md`, `docs/history/compatibility/gateway-federation/opl-federation-contract.md`, `docs/history/compatibility/gateway-federation/opl-read-only-discovery-gateway.md`, `docs/history/compatibility/gateway-federation/opl-routed-action-gateway.md`, `docs/history/compatibility/gateway-federation/opl-gateway-rollout.md`, `docs/history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md`, `docs/history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md`, `docs/history/compatibility/gateway-federation/examples-corpora/README.md`, `docs/history/compatibility/gateway-federation/examples-corpora/opl-gateway-example-corpus.md`, `docs/history/compatibility/gateway-federation/examples-corpora/opl-routed-safety-example-corpus.md`, `docs/history/compatibility/gateway-federation/examples-corpora/opl-operating-example-corpus.md`, `docs/history/compatibility/gateway-federation/examples-corpora/opl-operating-record-catalog.md`, `docs/history/compatibility/gateway-federation/operating-governance/README.md`, `docs/history/compatibility/gateway-federation/operating-governance/opl-governance-audit-operating-surface.md`, `docs/history/compatibility/gateway-federation/operating-governance/opl-publish-promotion-operating-surface.md`, `docs/history/compatibility/gateway-federation/operating-governance/opl-surface-authority-matrix.md`, `docs/history/compatibility/gateway-federation/operating-governance/opl-surface-lifecycle-map.md`, and `docs/history/compatibility/gateway-federation/operating-governance/opl-surface-review-matrix.md`; support read of OPL core active docs, ideal-state reference, stage-led roadmap, contracts README and fresh read-model outputs. | `docs/history/compatibility/README.md`; `docs/history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files are already in `docs/history/compatibility/**` and remain useful provenance / tombstone material; the tranche corrected lifecycle signals and stale-risk tense rather than moving or deleting paths.

Unreviewed docs:

- `one-person-lab`: current inventory remains 175 `README*` / `docs/**/*.md` / contracts README files. After this compatibility-history coverage, remaining open clusters include OPL root `README*`, `contracts/opl-framework/README.zh-CN.md`, active support docs such as `docs/active/opl-family-development-reference.md` and `docs/active/production-framework-closure-gap-matrix.md`, `docs/history/process/**` convergence / domain-admission / plans / specs / superpowers bodies, and `docs/references/operating-governance/family-domain-quality-projection-contract.md`.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future compatibility-history wording that presents gateway/federation/routed-action/frontdoor/domain-gateway examples as current entrypoint, default runtime, active domain admission gate, mutation route, compatibility interface, machine contract or test oracle is stale pollution.
- Any future history wording that treats old admitted-domain federation activation as current MAS/MAG/RCA/OMA/App readiness, domain-ready, production-ready, physical-delete authorization or default-caller completion is stale pollution.
- Any future use of historical acceptance snippets to pin current tests to Markdown prose, old path names or retired JSON artifacts must be replaced with active contracts, source, CLI/API behavior, generated artifacts, semantic `human_doc:*` IDs or repo-native tests.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL compatibility support read models above were rerun fresh in the tranche worktree; no source or machine-readable contract edit was made.

Next tranche write scope:

- Continue OPL `docs/history/process/**` bodies, `contracts/opl-framework/README.zh-CN.md`, or active-support docs if no external worktree owns them; otherwise pick MAS remaining repo-wide docs.
- Delay RCA/App docs write passes until external implementation/release dirty lanes are isolated or explicitly assigned.

Date: `2026-05-26 20:05 CST`
Tranche: `opl-history-domain-admission-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/process/domain-admission/**` 的 domain admission 过程归档。目标是确认 Phase 1/2、candidate workstream closeout、central reference sync 和 ecosystem owner-line 全部停留在 process history / provenance 语境，不作为当前 active plan、runtime activation package、domain admission authority、gateway/federation 兼容面、OMX continuation 或 recurring material 默认落点。本轮不关闭全局 `/goal`，也不表示 OPL `docs/history/process/**` 其余 convergence / plans / specs / superpowers bodies 已逐段覆盖。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/specs/opl-domain-onboarding-contract.md`, `docs/references/domain-admission/opl-candidate-domain-backlog.md`, `contracts/opl-framework/README.md`, `contracts/opl-framework/domains.json`, `contracts/opl-framework/workstreams.json`, and `contracts/opl-framework/task-topology.json`.
- Domain-admission history docs: `docs/history/process/domain-admission/README.md`, `docs/history/process/domain-admission/opl-candidate-workstream-tranche-closeout.md`, `docs/history/process/domain-admission/opl-phase-1-exit-activation-package.md`, `docs/history/process/domain-admission/opl-phase-2-admitted-domain-delta-intake-refresh.md`, `docs/history/process/domain-admission/opl-phase-2-central-reference-sync-board.md`, and `docs/history/process/domain-admission/opl-phase2-ecosystem-sync-owner-line.md`.
- Fresh read models: `opl framework readiness --family-defaults --json`, `opl agents conformance --family-defaults --json`, `opl agents default-callers --family-defaults --json`, `opl agents descriptors --json`, and `opl stages list --json`.

Fresh semantic result:

- Current active domain-agent catalog still contains `medautoscience`, `medautogrant`, and `redcube`; active workstreams remain `research_ops`, `grant_ops`, and `presentation_ops`. `IP Ops`, `Award Ops`, `Thesis Ops`, and `Review Ops` remain candidate / under-definition topology signals that require full admission packages before formal inclusion.
- Fresh `opl agents conformance --family-defaults --json` returned `status=passed`, `passed_count=4`, `blocked_count=0`, and `production_evidence_tail_count=4`; this is structural conformance, not new domain admission or production readiness.
- Fresh `opl agents default-callers --family-defaults --json` returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, zero missing domain-owner / no-forbidden-write / tombstone refs, and `physical_delete_authorized=false`.
- Fresh `opl framework readiness --family-defaults --json` returned `status=framework_control_plane_available_with_operator_attention`, `hard_blocker_count=0`, `open_tail_count=0`, `domain_blocked_attention_tail_count=268`, and provider SLO cadence/capability satisfied. Operator attention and domain-blocked refs do not authorize domain ready or production ready.
- `opl agents descriptors --json` and `opl stages list --json` returned four family descriptor / stage-domain surfaces; this proves read-model visibility, not candidate admission.
- `docs/history/process/domain-admission/README.md` already carried the correct history-only owner table and current owner jumps.
- Five history body files had stale-risk present-tense or unqualified “latest/current” wording inside historical tranche descriptions. These were rewritten to “当时 / 当时 latest / 当时 absorbed truth” so dated Phase 1/2 process material cannot be read as current active truth, current sync scope, current blocker, or current readiness state.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph / heading review of all six `docs/history/process/domain-admission/*.md` files; support read of current active gap plan, domain onboarding spec, candidate backlog, OPL framework contracts, active domains/workstreams/task topology, and fresh conformance/default-caller/framework/descriptors/stages read models. | `docs/history/process/domain-admission/opl-candidate-workstream-tranche-closeout.md`; `docs/history/process/domain-admission/opl-phase-1-exit-activation-package.md`; `docs/history/process/domain-admission/opl-phase-2-admitted-domain-delta-intake-refresh.md`; `docs/history/process/domain-admission/opl-phase-2-central-reference-sync-board.md`; `docs/history/process/domain-admission/opl-phase2-ecosystem-sync-owner-line.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files already live in `docs/history/process/domain-admission/**` and remain useful provenance; this tranche corrected stale-risk tense and recorded coverage rather than moving or deleting paths.

Unreviewed docs:

- `one-person-lab`: current inventory remains 175 `README*` / `docs/**/*.md` / contracts README files. After this tranche, remaining open exact-missing clusters are `docs/history/process/convergence-governance/**`, `docs/history/process/plans/**`, `docs/history/process/specs/**`, and `docs/history/process/superpowers/**`; plus any non-exact grouped coverage still listed in prior tranche notes such as contracts README / active support docs if not separately reconciled.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future domain-admission history wording that turns Phase 1/2, central reference sync, owner-line or candidate workstream closeout material into current active plan, runtime activation, domain admission authority, gateway/federation compatibility surface, or recurring worktree/prompt entry is stale pollution.
- Any future wording that treats candidate backlog visibility, descriptor/stage read-model visibility, structural conformance, default-caller readiness, or provider/operator attention as formal admission, discovery target, routed-action target, handoff-ready surface, domain ready or production ready is stale pollution.
- Any future use of retired `docs/references/opl-phase-*`, `contracts/opl-framework/phase-*`, OMX, `domain_gateway`, G2/G3 or gateway/federation literals must remain historical provenance unless an active contract/source/read-model explicitly reintroduces a narrow current surface.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL domain-admission support read models and contract probes above were rerun fresh in the tranche worktree; no source or machine-readable contract edit was made.

Next tranche write scope:

- Continue OPL `docs/history/process/convergence-governance/**`, `docs/history/process/plans/**`, `docs/history/process/specs/**`, or `docs/history/process/superpowers/**` in small clusters; alternatively pick MAS remaining repo-wide docs if OPL external lanes make a cluster unsafe.
- Delay RCA/App docs write passes until external implementation/release dirty lanes are isolated or explicitly assigned.

Date: `2026-05-26 20:17 CST`
Tranche: `opl-history-convergence-governance-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/process/convergence-governance/**` 的 convergence governance 过程归档。目标是确认 contract convergence、四仓同步、executor/Hermes 评估、用户面成熟度、外部 orchestration 学习、docs lifecycle rollout、GUI pivot 和产品分层 closeout 都停留在 history / provenance 语境，不作为当前 active plan、roadmap、provider/readiness path、legacy entry 兼容面、Hermes-default 路线、domain admission authority、release-ready 或 production-ready 证据。本轮不关闭全局 `/goal`，也不表示 OPL `docs/history/process/plans/**`、`docs/history/process/specs/**` 或 `docs/history/process/superpowers/**` 已逐段覆盖。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, core five, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, `docs/references/convergence-governance/README.md`, and `docs/history/process/convergence-governance/README.md`.
- OPL machine/read-model surfaces: `contracts/opl-framework/domains.json`, `contracts/opl-framework/workstreams.json`, `contracts/opl-framework/task-topology.json`, `opl framework readiness --family-defaults --json`, `opl agents conformance --family-defaults --json`, `opl agents default-callers --family-defaults --json`, and `opl runtime app-operator-drilldown --json`.
- Convergence history docs: `docs/history/process/convergence-governance/README.md`, `docs/history/process/convergence-governance/contract-convergence-v1-decision-note-2026-04-08.md`, `docs/history/process/convergence-governance/contract-convergence-v1-execution-board-2026-04-11.md`, `docs/history/process/convergence-governance/ecosystem-status-matrix-2026-04.md`, `docs/history/process/convergence-governance/family-content-level-docs-consolidation-2026-05-11.md`, `docs/history/process/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.md`, `docs/history/process/convergence-governance/family-external-orchestration-learning-board-2026-04-30.md`, `docs/history/process/convergence-governance/family-user-facing-maturity-roadmap-2026-04-13.md`, `docs/history/process/convergence-governance/four-repo-doc-series-sync-summary-2026-04-14.md`, `docs/history/process/convergence-governance/four-repo-executor-follow-up-and-hermes-evaluation-2026-04.md`, `docs/history/process/convergence-governance/gui-mainline-pivot-to-aionui-2026-04-21.md`, and `docs/history/process/convergence-governance/opl-product-layer-foundry-agent-rollout-2026-05-12.md`.

Fresh semantic result:

- Current active domain-agent catalog still contains `medautoscience`, `medautogrant`, and `redcube`; active workstreams remain `research_ops`, `grant_ops`, and `presentation_ops`. Candidate topology entries such as thesis/review/IP/award remain under-definition signals, not admitted domains.
- Fresh `opl framework readiness --family-defaults --json` returned `status=framework_control_plane_available_with_blocked_refs_only_attention`, `hard_blocker_count=0`, `operator_payload_required_attention_tail_count=0`, `domain_blocked_attention_tail_count=275`, and provider SLO cadence/capability satisfied. Domain-blocked refs-only attention is not domain ready or production ready.
- Fresh `opl agents conformance --family-defaults --json` returned `status=passed`, `passed_count=4`, `blocked_count=0`, `production_evidence_tail_count=4`, and `conformance_report_can_claim_domain_ready=false`; this is structural conformance, not readiness or admission authority.
- Fresh `opl agents default-callers --family-defaults --json` returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, zero missing domain-owner / no-forbidden-write / tombstone refs, and `physical_delete_authorized_by_this_report=false`.
- Fresh `opl runtime app-operator-drilldown --json` returned `availability=available`, `functional_privatization_action_required_count=0`, `default_caller_deletion_evidence_open_requirement_count=0`, `app_release_user_path_release_ready_claimed=false`, `app_release_user_path_production_ready_claimed=false`, and authority boundaries that do not write domain truth or authorize quality/export verdicts. App/operator drilldown remains refs-only projection.
- The convergence directory index already carried correct history-only owner jumps and no-resurrection guardrails.
- Four history body docs had stale-risk present-tense wording inside archived action records: product-entry companion wording in the user-facing maturity roadmap, 2026-05-12 RH read-model evidence in the external orchestration board, current/default-executor capability wording in the Hermes executor follow-up, and current repo-tracked truth wording in the ecosystem status matrix. These were rewritten as dated historical wording so the archived records cannot be read as current active baton, default runtime proof, App/release readiness, or live read-model authority.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph / heading review of all 12 `docs/history/process/convergence-governance/*.md` files; support read of core docs, active truth owner, ideal-state reference, convergence reference index, framework contracts and fresh framework/conformance/default-caller/App drilldown read models. | `docs/history/process/convergence-governance/ecosystem-status-matrix-2026-04.md`; `docs/history/process/convergence-governance/contract-convergence-v1-execution-board-2026-04-11.md`; `docs/history/process/convergence-governance/family-user-facing-maturity-roadmap-2026-04-13.md`; `docs/history/process/convergence-governance/family-external-orchestration-learning-board-2026-04-30.md`; `docs/history/process/convergence-governance/four-repo-executor-follow-up-and-hermes-evaluation-2026-04.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files already live in `docs/history/process/convergence-governance/**` and remain useful convergence provenance; this tranche corrected stale-risk tense and recorded coverage rather than moving or deleting paths.

Unreviewed docs:

- `one-person-lab`: current inventory remains 175 `README*` / `docs/**/*.md` / contracts README files. After this tranche, remaining exact-missing clusters are `docs/history/process/plans/**`, `docs/history/process/specs/**`, and `docs/history/process/superpowers/**`; plus any non-exact grouped coverage still listed in prior tranche notes such as root/contract README or active support docs if not separately reconciled.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future convergence-history wording that turns Contract Convergence v1, Phase C boards, four-repo sync, user-facing maturity ladder, product-entry companions, external orchestration learning, GUI pivot, AionUI switch, or Foundry Agent product-layer closeout into current roadmap, active plan, provider/readiness path, App release-ready proof, domain-ready proof, production-ready proof, or active compatibility interface is stale pollution.
- Any future wording that makes Hermes-Agent the default OPL executor/provider, revives retired gateway-era entry or routed-action vocabulary as active topology, or makes MDS / DeepScientist an OPL top-level active domain agent must be rejected unless a current contract/source/read-model explicitly reintroduces a narrow surface.
- Any future external-orchestration learning must stay OPL-owned contract/projection vocabulary or domain-owned template work; generic fallback, external scheduler/tracker, SQLite schema, web dashboard, persona library, or domain authority migration remains outside OPL core.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL convergence support read models and contract probes above were rerun fresh in the tranche worktree; no source or machine-readable contract edit was made.

Next tranche write scope:

- Continue OPL `docs/history/process/plans/**`, `docs/history/process/specs/**`, or `docs/history/process/superpowers/**` in small clusters; alternatively pick MAS remaining repo-wide docs if OPL external lanes make a cluster unsafe.
- Delay RCA/App docs write passes until external implementation/release dirty lanes are isolated or explicitly assigned.

Date: `2026-05-26 21:01 CST`
Tranche: `opl-history-plans-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/process/plans/**` 的 historical implementation plan / closeout note 正文。目标是确认早期 bilingual docs、G2/G3 handoff、UHS、历史前台/托管入口、executor adapter、shared reuse、历史产品 API reset、历史 runtime-first pivot、production functional closure、App repo split 和 2026-05 docs process closeout 都停留在 historical plan / closeout / provenance 语境，不作为当前 active implementation queue、runtime owner、历史产品 API spec、旧 gateway 兼容面、外部 executor 默认 provider path、domain admission authority、App release-ready 证据或 production-ready 证据。本轮不关闭全局 `/goal`，也不表示 OPL `docs/history/process/specs/**` 或 `docs/history/process/superpowers/**` 已逐段覆盖。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, core five, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, `docs/history/process/plans/README.md`, and `docs/active/development-document-portfolio.md`.
- OPL machine/read-model surfaces: `contracts/opl-framework/domains.json`, `contracts/opl-framework/workstreams.json`, `contracts/opl-framework/task-topology.json`, `opl agents conformance --family-defaults --json`, and `opl agents default-callers --family-defaults --json`.
- Plans history docs: `docs/history/process/plans/README.md` plus all 15 body files in `docs/history/process/plans/*.md`.

Fresh semantic result:

- Current active domain-agent catalog remains MAS / MAG / RCA through the OPL family contracts, with active workstreams `research_ops`, `grant_ops`, and `presentation_ops`. Candidate topology signals from old plans do not become admitted domains or routed-action targets.
- Fresh `opl agents conformance --family-defaults --json` returned `status=passed`, `passed_count=4`, `blocked_count=0`, `production_evidence_tail_count=4`, and `conformance_report_can_claim_domain_ready=false`; this is structural conformance, not domain readiness, production readiness, historical product API readiness, App release readiness, or old gateway activation.
- Fresh `opl agents default-callers --family-defaults --json` returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, and `physical_delete_authorized_by_this_report=false`; default-caller availability does not authorize physical delete, legacy surface removal without owner proof, or domain ready claims.
- `docs/history/process/plans/README.md` already carried the correct historical_archive boundary and current-owner jumps.
- Four body files carried stale-risk present-tense wording inside historical plan bodies: G2 release closeout, G3 planning brief, G3 planning closeout, and historical product API reset plan. These were rewritten from unqualified `当前` wording to `当时` / dated historical wording so old gateway / historical entry / historical product API / routed-action tasks cannot be read as current work queue or current runtime truth.
- The remaining plan bodies already had sufficient historical headers, machine-boundary statements, or explicit current-owner jumps. Their checkbox lists, file paths, old command examples and verification criteria remain as process provenance only.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph / heading review of `docs/history/process/plans/README.md`, `docs/history/process/plans/2026-04-02-bilingual-homepage-and-core-docs-implementation.md`, `docs/history/process/plans/2026-04-07-g2-release-closeout-note.md`, `docs/history/process/plans/2026-04-07-g3-thin-handoff-planning-brief.md`, `docs/history/process/plans/2026-04-07-g3-thin-handoff-planning-closeout-note.md`, `docs/history/process/plans/2026-04-07-unified-harness-engineering-substrate-doc-alignment.md`, `docs/history/process/plans/2026-04-12-opl-frontdoor-and-family-entry-implementation.md`, `docs/history/process/plans/2026-04-12-opl-hosted-entry-and-control-room-hardening.md`, `docs/history/process/plans/2026-04-13-family-executor-adapter-next-phase.md`, `docs/history/process/plans/2026-04-18-family-reuse-full-landing.md`, `docs/history/process/plans/2026-04-20-opl-product-api-reset-implementation.md`, `docs/history/process/plans/2026-04-21-opl-acp-native-runtime-first-implementation.md`, `docs/history/process/plans/2026-05-14-production-functional-closure-plan.md`, `docs/history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md`, `docs/history/process/plans/2026-05-18-opl-family-doc-process-history.md`, and `docs/history/process/plans/2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md`; support read of core docs, active truth owner, ideal-state reference, framework contracts and fresh conformance/default-caller read models. | `docs/history/process/plans/2026-04-07-g2-release-closeout-note.md`; `docs/history/process/plans/2026-04-07-g3-thin-handoff-planning-brief.md`; `docs/history/process/plans/2026-04-07-g3-thin-handoff-planning-closeout-note.md`; `docs/history/process/plans/2026-04-20-opl-product-api-reset-implementation.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files already live in `docs/history/process/plans/**` and remain useful process provenance; this tranche corrected stale-risk tense and recorded coverage rather than moving or deleting paths.

Unreviewed docs:

- `one-person-lab`: current inventory remains 175 `README*` / `docs/**/*.md` / contracts README files. After this tranche, remaining exact-missing clusters are `docs/history/process/specs/**` and `docs/history/process/superpowers/**`; plus any non-exact grouped coverage still listed in prior tranche notes such as root/contract README or active support docs if not separately reconciled.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future plans-history wording that turns old bilingual rollout, G2/G3 planning, UHS, historical entry/hosted entry, historical product API, historical runtime-first pivot, executor adapter, shared reuse, App split or production functional closeout material into current active plan, current implementation queue, current API spec, default runtime, release-ready evidence, domain-ready evidence, production-ready evidence, compatibility surface or no-active-caller proof is stale pollution.
- Any future wording that makes old gateway-era plans, historical entry plans, historical product API plans, historical runtime-first pivot plans, external shell plans or local manager plans current owner surfaces must be rejected unless live source/contracts/read-model explicitly reintroduce a narrow current surface.
- Any future agent prompt copied from these historical checkbox lists must first be re-derived from current active truth docs, live code/contracts/tests/CLI read models and current owner boundaries.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL plans support contracts and conformance/default-caller read models above were rerun fresh in the tranche worktree; no source or machine-readable contract edit was made.

Next tranche write scope:

- Continue OPL `docs/history/process/specs/**` or `docs/history/process/superpowers/**` in small clusters; alternatively pick MAS remaining repo-wide docs if OPL external lanes make a cluster unsafe.
- Delay RCA/App docs write passes until external implementation/release dirty lanes are isolated or explicitly assigned.

Date: `2026-05-26 20:56 CST`
Tranche: `opl-history-specs-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/process/specs/**` 的 historical design spec 正文。目标是确认早期 bilingual public-doc design、MAG 顶层设计迁移记录、UHS 命名分层、旧产品入口设计、历史产品资源模型 / domain-agent 边界设计、历史 shell projection pivot 都停留在 historical spec / design provenance 语境，不作为当前 active spec、roadmap、implementation queue、runtime provider contract、App release plan、domain admission authority、default executor/provider path、readiness oracle、domain-ready 或 production-ready 证据。本轮不关闭全局 `/goal`，也不表示 OPL `docs/history/process/superpowers/**` 已逐段覆盖。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, core five, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, `docs/history/process/specs/README.md`, and `docs/active/development-document-portfolio.md`.
- OPL machine/read-model surfaces: `contracts/opl-framework/domains.json`, `contracts/opl-framework/workstreams.json`, `contracts/opl-framework/task-topology.json`, `opl agents conformance --family-defaults --json`, and `opl agents default-callers --family-defaults --json`.
- Specs history docs: `docs/history/process/specs/README.md` plus all 6 body files in `docs/history/process/specs/*.md`.

Fresh semantic result:

- Current active domain-agent catalog remains MAS / MAG / RCA through the OPL family contracts. Active workstreams remain `research_ops`, `grant_ops`, and `presentation_ops`; `thesis_ops`, `review_ops`, `ip_ops`, and `award_ops` remain topology signals, not admitted domain agents.
- Fresh `opl agents conformance --family-defaults --json` returned `status=passed`, `passed_count=4`, `blocked_count=0`, `production_evidence_tail_count=4`, and `conformance_report_can_claim_domain_ready=false`; this is structural conformance, not domain readiness, production readiness, historical product-resource readiness, App release readiness, or old entry activation.
- Fresh `opl agents default-callers --family-defaults --json` returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, and `physical_delete_authorized_by_this_report=false`; default-caller availability does not authorize physical delete, compatibility-surface retention, or domain ready claims.
- `docs/history/process/specs/README.md` already carried the correct historical_archive boundary and current-owner jumps.
- Five body files carried stale-risk present-tense wording inside historical design bodies: bilingual public-doc design, UHS naming design, old product-entry design, historical product-resource boundary design, and historical shell projection design. These were rewritten from unqualified `当前` wording to `当时` / dated historical wording so old public-doc, entry, product-resource, shell projection, executor/provider, GUI/API, and historical topology tasks cannot be read as current active specs or current runtime truth.
- The MAG top-level design migration record already points current authority to the independent `med-autogrant` repo and required no body edit.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph / heading review of `docs/history/process/specs/README.md`, `docs/history/process/specs/2026-04-02-bilingual-homepage-and-core-docs-design.md`, `docs/history/process/specs/2026-04-06-med-auto-grant-top-level-design.md`, `docs/history/process/specs/2026-04-07-unified-harness-engineering-substrate-design.md`, `docs/history/process/specs/2026-04-12-opl-frontdoor-and-family-entry-design.md`, `docs/history/process/specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md`, and `docs/history/process/specs/2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md`; support read of core docs, active truth owner, ideal-state reference, framework contracts and fresh conformance/default-caller read models. | `docs/history/process/specs/2026-04-02-bilingual-homepage-and-core-docs-design.md`; `docs/history/process/specs/2026-04-07-unified-harness-engineering-substrate-design.md`; `docs/history/process/specs/2026-04-12-opl-frontdoor-and-family-entry-design.md`; `docs/history/process/specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md`; `docs/history/process/specs/2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files already live in `docs/history/process/specs/**` and remain useful design provenance; this tranche corrected stale-risk tense and recorded coverage rather than moving or deleting paths.

Unreviewed docs:

- `one-person-lab`: current inventory remains 175 `README*` / `docs/**/*.md` / contracts README files. After this tranche, the remaining exact-missing cluster is `docs/history/process/superpowers/**`; plus any non-exact grouped coverage still listed in prior tranche notes such as root/contract README or active support docs if not separately reconciled.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future specs-history wording that turns bilingual public-doc design, MAG migration design, UHS naming, old product-entry design, historical product-resource boundary design or shell projection pivot into current active spec, current implementation queue, current API spec, default runtime, release-ready evidence, domain-ready evidence, production-ready evidence, compatibility surface or no-active-caller proof is stale pollution.
- Any future wording that makes old topology, historical entry plans, historical product-resource plans, historical shell projection plans, external shell plans or local manager plans current owner surfaces must be rejected unless live source/contracts/read-model explicitly reintroduce a narrow current surface.
- Any future agent prompt copied from these historical acceptance criteria must first be re-derived from current active truth docs, live code/contracts/tests/CLI read models and current owner boundaries.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL specs support contracts and conformance/default-caller read models above were rerun fresh in the tranche worktree; no source or machine-readable contract edit was made.

Next tranche write scope:

- Continue OPL `docs/history/process/superpowers/**` as the remaining exact-missing history-process cluster; alternatively pick MAS remaining repo-wide docs if OPL external lanes make that cluster unsafe.
- Delay RCA/App docs write passes until external implementation/release dirty lanes are isolated or explicitly assigned.

Date: `2026-05-26 21:06 CST`
Tranche: `opl-history-superpowers-coverage`
State: `tranche_verified`

本轮覆盖 OPL `docs/history/process/superpowers/**` 的 early Superpowers worker-flow process materials。目标是确认早期 MAS action graph consumer coverage、旧 `frontdoor-readiness`、Multica-inspired shared helper、family runtime/task/skill/automation absorb、domain-agent entry spec v1 和 Workspace Inbox 设计都停留在 history-only worker plan/spec 语境，不作为当前 active spec、implementation queue、runtime/provider contract、App/workbench owner、domain admission authority、readiness oracle、domain-ready、App release-ready 或 production-ready 证据。本轮不关闭全局 `/goal`，也不表示 MAS/RCA/App repo-wide README/docs 覆盖已经完成。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, core five, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, `docs/history/process/superpowers/README.md`, `docs/history/process/superpowers/plans/README.md`, `docs/history/process/superpowers/specs/README.md`, and `docs/active/development-document-portfolio.md`.
- OPL machine/read-model surfaces: `contracts/opl-framework/domains.json`, `contracts/opl-framework/workstreams.json`, `contracts/opl-framework/task-topology.json`, `opl agents conformance --family-defaults --json`, and `opl agents default-callers --family-defaults --json`.
- Superpowers history docs: all 5 body files in `docs/history/process/superpowers/plans/*.md` and all 4 body files in `docs/history/process/superpowers/specs/*.md`.

Fresh semantic result:

- Current active domain-agent catalog remains MAS / MAG / RCA through the OPL family contracts. Active workstreams remain `grant_ops`, `research_ops`, and `presentation_ops`; `thesis_ops`, `review_ops`, `ip_ops`, and `award_ops` remain topology signals, not admitted domain agents.
- Fresh `opl agents conformance --family-defaults --json` returned `status=passed`, `passed_count=4`, `blocked_count=0`, and `production_evidence_tail_count=4`; this is structural conformance, not domain readiness, production readiness, App release readiness, old frontdoor readiness or historical worker-flow completion.
- Fresh `opl agents default-callers --family-defaults --json` returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, and `physical_delete_authorized_by_this_report=false`; generated/default-caller readiness does not authorize physical delete, compatibility-surface retention or old worker-plan execution.
- `docs/history/process/superpowers/README.md`, `plans/README.md`, and `specs/README.md` already carried the correct `history_only` boundary and current-owner jumps.
- Eight body files carried stale-risk natural-language wording such as unqualified `当前`, `current`, `now`, or "now centrally owned" inside historical worker plans/specs. These were rewritten to `当时` / historical-slice wording so old action graph, frontdoor, Multica, shared helper, runtime/task/skill/automation, domain-entry and Workspace Inbox work packages cannot be read as current active specs or current runtime truth.
- `docs/history/process/superpowers/plans/2026-04-22-domain-agent-entry-spec-v1-implementation.md` already pointed current owner to `docs/specs/opl-domain-onboarding-contract.md` and `opl agents descriptors`, so no body edit was needed.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph / heading review of `docs/history/process/superpowers/README.md`, `docs/history/process/superpowers/plans/README.md`, `docs/history/process/superpowers/plans/2026-04-13-medautoscience-action-graph-plan.md`, `docs/history/process/superpowers/plans/2026-04-14-opl-frontdoor-readiness-plan.md`, `docs/history/process/superpowers/plans/2026-04-17-multica-family-reuse-program-implementation.md`, `docs/history/process/superpowers/plans/2026-04-18-family-runtime-task-skill-automation-full-absorb-implementation.md`, `docs/history/process/superpowers/plans/2026-04-22-domain-agent-entry-spec-v1-implementation.md`, `docs/history/process/superpowers/specs/README.md`, `docs/history/process/superpowers/specs/2026-04-13-medautoscience-action-graph-design.md`, `docs/history/process/superpowers/specs/2026-04-17-multica-family-reuse-program-design.md`, `docs/history/process/superpowers/specs/2026-04-18-family-runtime-task-skill-automation-full-absorb-design.md`, and `docs/history/process/superpowers/specs/2026-04-18-workspace-inbox-design.md`; support read of core docs, active truth owner, ideal-state reference, framework contracts and fresh conformance/default-caller read models. | `docs/history/process/superpowers/plans/2026-04-13-medautoscience-action-graph-plan.md`; `docs/history/process/superpowers/plans/2026-04-14-opl-frontdoor-readiness-plan.md`; `docs/history/process/superpowers/plans/2026-04-17-multica-family-reuse-program-implementation.md`; `docs/history/process/superpowers/plans/2026-04-18-family-runtime-task-skill-automation-full-absorb-implementation.md`; `docs/history/process/superpowers/specs/2026-04-13-medautoscience-action-graph-design.md`; `docs/history/process/superpowers/specs/2026-04-17-multica-family-reuse-program-design.md`; `docs/history/process/superpowers/specs/2026-04-18-family-runtime-task-skill-automation-full-absorb-design.md`; `docs/history/process/superpowers/specs/2026-04-18-workspace-inbox-design.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These files already live in `docs/history/process/superpowers/**` and remain useful worker-flow provenance; this tranche corrected stale-risk wording and recorded coverage rather than moving or deleting paths.

Unreviewed docs:

- `one-person-lab`: current inventory remains 175 `README*` / `docs/**/*.md` / contracts README files. After this tranche, no exact-missing OPL path remains in the coverage ledger; any non-exact grouped coverage still listed in prior tranche notes such as root/contract README or active support docs should be reconciled in a future final OPL inventory pass.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Any future wording that turns early Superpowers worker plans/specs into current active plan, current implementation queue, current API spec, default runtime, App/workbench owner, release-ready evidence, domain-ready evidence, production-ready evidence, compatibility surface or no-active-caller proof is stale pollution.
- Any future wording that makes old `frontdoor-readiness`, `opl web`, Multica-inspired shared helper plans, old `src/management.ts` aggregate target, historical workspace inbox, historical generated helper acceptance criteria or worker-flow checkbox lists current owner surfaces must be rejected unless live source/contracts/read-model explicitly reintroduce a narrow current surface.
- Any future agent prompt copied from these historical acceptance criteria must first be re-derived from current active truth docs, live code/contracts/tests/CLI read models and current owner boundaries.

Verification before absorb:

- OPL docs verification passed in the tranche worktree: `git diff --check`, strict README/docs/contracts conflict-marker scan, and OPL Doc Governance doctor `finding_count=0`, active truth `pass`.
- OPL superpowers support contracts and conformance/default-caller read models above were rerun fresh in the tranche worktree; no source or machine-readable contract edit was made.

Next tranche write scope:

- Run a final OPL inventory reconcile over `README*`, `docs/**/*.md`, and contracts README files to convert exact zero-missing into a reviewed OPL closeout statement, then pick MAS/RCA/App remaining repo-wide docs according to dirty-lane safety.
- Delay RCA/App docs write passes until external implementation/release dirty lanes are isolated or explicitly assigned.

Date: `2026-05-26 21:13 CST`
Tranche: `opl-final-inventory-reconcile`
State: `tranche_verified`

本轮对 OPL `README*`、`docs/**/*.md` 与 contracts README 文件做 final inventory reconcile。目标是把前序 focused tranches 的 exact zero-missing 状态转成 reviewed OPL closeout statement：当前 OPL 175 个 inventory path 都已在本 ledger 中显式出现，且其语义覆盖分别落入 current truth、active plan、support reference、history/tombstone 或 policy/spec 层。本轮不新增历史正文改写，不关闭全局 `/goal`，也不把 OPL docs coverage 写成 OPL production ready、domain ready、App release ready 或 MAS/RCA/App docs coverage complete。

Fresh live truth inputs:

- OPL `TASTE.md`, `README.md`, `docs/README.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, and `docs/active/development-document-portfolio.md`.
- OPL inventory script over repo-root `README*`, `docs/**/*.md`, and `contracts/**/README*.md`.
- OPL Doc Governance doctor fallback for active-truth shape.
- OPL machine/read-model surfaces: `contracts/opl-framework/domains.json`, `contracts/opl-framework/workstreams.json`, `contracts/opl-framework/task-topology.json`, `opl agents conformance --family-defaults --json`, and `opl agents default-callers --family-defaults --json`.

Fresh semantic result:

- OPL inventory is `175` files; `not_explicitly_named_count=0`. This means the OPL coverage ledger explicitly names every current repo-root README, docs Markdown file and contracts README file in the governed OPL inventory.
- OPL Doc Governance doctor returned `finding_count=0`, active truth `pass`, `missing_item_count=0`, and `next_round_agent_prompt_not_ready_count=0`.
- Current active domain-agent catalog remains MAS / MAG / RCA through the OPL family contracts. Active workstreams remain `grant_ops`, `research_ops`, and `presentation_ops`; `thesis_ops`, `review_ops`, `ip_ops`, and `award_ops` remain topology signals, not admitted domain agents.
- Fresh `opl agents conformance --family-defaults --json` returned `status=passed`, `passed_count=4`, `blocked_count=0`, and `production_evidence_tail_count=4`; this is structural conformance, not domain readiness, App release readiness, production readiness or docs-governance completion.
- Fresh `opl agents default-callers --family-defaults --json` returned `status=ready_domain_evidence_required`, `generated_default_caller_surface_count=32`, `blocked_surface_count=0`, and `physical_delete_authorized_by_this_report=false`; generated/default-caller readiness does not authorize physical delete, compatibility-surface retention or production default promotion.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Final inventory reconcile over all 175 current `README*`, `docs/**/*.md`, and `contracts/**/README*.md` paths; support read of OPL entry docs, active truth owner, ideal-state reference, framework contracts and fresh conformance/default-caller read models. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. This tranche is an inventory/accounting reconcile only; prior tranches already routed current truth, support reference and history/tombstone material.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current 175-file OPL inventory. Future new README/docs/contracts README files must be added to this ledger or a successor coverage ledger before OPL can remain closed.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- OPL: no exact uncovered path remains in the current inventory; remaining OPL risk is new-doc drift, stale wording introduced after this reconcile, or future source/contract/read-model changes that make an already-covered section stale.
- OPL historical gateway/frontdoor/Hermes/MDS/local-manager/worker-flow vocabulary remains allowed only in `docs/history/**`, retired/tombstone/provenance context, explicit negative guard, or dated process history; it must not return to active docs as current owner surface.
- Global OPL series: MAS, RCA and App repo-wide docs still need future passes according to dirty-lane safety and repo-owned active truth.

Verification before absorb:

- OPL final reconcile verification passed in the tranche worktree: inventory `175`, `not_explicitly_named_count=0`; OPL Doc Governance doctor `finding_count=0`, active truth `pass`; `git diff --check`; strict README/docs/contracts conflict-marker scan.
- OPL support contracts and conformance/default-caller read models above were rerun fresh in the tranche worktree; no source or machine-readable contract edit was made.

Next tranche write scope:

- Pick MAS repo-wide coverage if its main checkout is clean enough, or a safe focused MAS doc cluster if external owner-route changes continue to move.
- Delay RCA/App docs write passes until external implementation/release dirty lanes are isolated or explicitly assigned.

Date: `2026-05-26 21:32 CST`
Tranche: `mas-stage-surface-support-owner-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/active/stage_surface_standardization_program.md`，并吸收回 MAS `main`。目标是把该 active support owner 从旧“stage 统一计划 / 后续执行计划”读法收窄到当前 live stage-surface support 角色：它维护 stage card / route / prompt / skill / knowledge / closeout / review-index / memory / quality pack / workbench projection 边界与剩余 evidence tail；它不作为 MAS production closure 总计划、OPL framework closure 平行计划、按日期增长的执行流水或 Markdown-only stage truth。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`, and `docs/runtime/contracts/stage_surfaces.md`.
- MAS machine/source surfaces: `agent/stages/stage_route_contract.yaml`, `src/med_autoscience/stage_surface_contract.py`, `src/med_autoscience/stage_knowledge_contract.py`, `src/med_autoscience/stage_quality_contract.py`, `src/med_autoscience/controllers/progress_portal_parts/stage_review_parts/locator.py`, `src/med_autoscience/controllers/progress_portal_parts/stage_review_parts/materializer.py`, `src/med_autoscience/controllers/progress_portal_parts/runtime_workbench_projection.py`, generated-surface handoff and functional-privatization contracts.
- Focused test/source inventory read as evidence: stage-surface, stage-knowledge, stage-quality, Progress Portal, memory/skeleton and workbench projection test lanes referenced by MAS contracts.
- CodeGraph context for `build_stage_surface_contract`, stage knowledge closeout packets, stage quality pack projections, stage deliverable review locator/materializer and `mas_opl_runtime_workbench_projection`.

Fresh semantic result:

- `stage_surface_standardization_program.md` remains active support because it is the content-level owner tying stage surface shape, AI-first verdict wording, stage quality pack maturity, Stage Deliverable Review / Index, publication-route memory receipt scaleout and workbench projection together.
- MAS commit `46b36725 docs: cover MAS stage surface support owner` was fast-forwarded into MAS `main`; the tranche worktree and branch were removed.
- The MAS coverage ledger now records full paragraph coverage for this document and keeps remaining MAS repo-wide README/docs coverage open.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/active/stage_surface_standardization_program.md`, with live route / stage-surface / stage-knowledge / stage-quality / stage-review / workbench projection evidence listed above. | `docs/active/stage_surface_standardization_program.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this MAS tranche. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The MAS stage-surface support file remains active support with a unique owner role; stale plan wording was narrowed in place.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current 175-file OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks and this stage-surface support owner tranche.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused RCA chunks; current main checkout still carries external dirty implementation/test files.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App dirty lanes are closed or explicitly assigned.

Remaining stale / retire candidates:

- Future MAS stage-surface prose that treats `stage_surface_standardization_program.md` as MAS production closure plan, OPL framework closure owner, execution diary, commit checklist, generated `stage_surfaces.md` truth source or proof ledger is stale pollution.
- Future prose must not treat stage card, generated Markdown, quality pack descriptor, stage review page, deliverable index, publication-route memory refs, workbench projection, provider completion, queue completion or product-entry descriptor as source readiness, publication quality verdict, submission readiness, artifact mutation authorization, `current_package` freshness, paper closure, domain ready or production ready.
- RCA/App docs write passes remain unsafe until their unrelated dirty implementation/release lanes are isolated or explicitly assigned.

Verification before absorb:

- MAS docs verification after rebase passed: `git diff --check`; strict README/docs conflict-marker scan had no hits; OPL Doc Governance doctor `finding_count=0`, active truth `pass`.

Next tranche write scope:

- Continue MAS repo-wide paragraph coverage from the remaining exact uncovered doc list, or choose the next OPL/RCA/MAG/App uncovered body according to dirty-lane safety.
- Keep RCA/App docs delayed while their main checkouts carry unrelated dirty implementation / release changes.

Date: `2026-05-26 22:05 CST`
Tranche: `rca-northstar-reference-coverage`
State: `tranche_verified`

本轮覆盖 RCA north-star reference 主体 `docs/references/rca-visual-deliverable-agent-ideal-state.md`，并把结果折回 RCA 本地 docs portfolio ledger 与本 OPL series ledger。目标是关闭上一轮 RCA references ledger 中明确留下的 north-star body uncovered 项；本轮不关闭全局 `/goal`，不表示 RCA production ready / domain ready / visual ready，也不表示 MAS/App repo-wide coverage 已完成。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/rca-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`, and `docs/references/rca-visual-deliverable-agent-ideal-state.md`.
- RCA machine refs: `contracts/functional_privatization_audit.json`, `contracts/physical_source_morphology_policy.json`, `contracts/production_acceptance/rca-production-acceptance.json`, `contracts/stage_control_plane.json`, and `package.json`.
- Doctor evidence: RCA OPL Doc Governance doctor preflight reported `finding_count=0`, active truth `pass`; this was used only as a risk map.

Fresh semantic result:

- RCA north-star reference already keeps the correct role: target-state / owner-boundary support, not active completion plan, proof ledger or current CLI/readiness truth.
- The reference matches live contracts on owner split: RCA retains visual truth, route truth, review/export verdict, artifact authority, visual memory accept/reject, owner receipt and native helper implementation; OPL owns/generated-hosts generic runtime, queue, wakeup, attempt ledger, workbench, wrapper and refs-only projection surfaces.
- The reference does not upgrade OPL descriptor readiness, structural conformance, provider completion, transition proof or no-regression refs into visual ready, exportable, handoffable, domain ready, production ready or production visual-stage long-soak completion.
- No RCA north-star body rewrite was needed; the only RCA repo edit was its coverage ledger.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Full paragraph read of `docs/references/rca-visual-deliverable-agent-ideal-state.md`; support read of RCA core docs, active truth owner, local docs portfolio and machine refs listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this RCA tranche. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. RCA north-star reference remains active support; stale body rewrite or doc-path retirement was not required.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current 175-file OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current 120-file recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: prior RCA tranches now cover active/status, product-entry, runtime/integration, delivery/source, policy, references including north-star, Hermes history, Phase 2 history, and plans/runtime/tombstone history chunks. RCA still needs a final inventory reconcile to prove no current `README*` / `docs/**/*.md` path remains outside the recorded chunks, especially after any new docs or external edits.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- Future RCA north-star wording that treats target-state examples, ideal direct product commands, structural conformance, OPL generated/default-caller consumption, provider completion or proof refs as current CLI availability, visual ready, exportable, handoffable, domain ready, production ready, production visual-stage long-soak evidence or OPL ownership of RCA visual truth is stale pollution.
- RCA final inventory reconcile may still find docs not exact-mapped by the current chunk ledger; do not close RCA repo-wide coverage until that reconcile has a zero-missing inventory.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.

Verification before absorb:

- RCA docs verification in the tranche worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger verification in the tranche worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Prefer RCA final inventory reconcile if the checkout remains clean, or continue MAS repo-wide paragraph coverage from the remaining uncovered doc list.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.

Date: `2026-05-26 22:15 CST`
Tranche: `rca-final-inventory-reconcile`
State: `tranche_verified`

本轮对 RCA tracked `README*` 与 `docs/**/*.md` 做 final inventory reconcile，并把结果折回 RCA 本地 docs portfolio ledger 与本 OPL series ledger。目标是把前序 RCA focused tranches 的分组覆盖记录转成当前 inventory closeout：RCA 当前 tracked docs/readme inventory 已按 current truth、active plan、support reference、policy/spec、history/provenance、tombstone 或 prompt/support asset 角色归位。本轮不关闭全局 `/goal`，不表示 RCA visual ready / production ready，也不表示 MAS/App repo-wide coverage 已完成。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, `README.md`, `README.zh-CN.md`, `docs/README.md`, core five, `docs/active/rca-ideal-state-gap-plan.md`, `docs/references/rca-visual-deliverable-agent-ideal-state.md`, and `docs/docs_portfolio_consolidation.md`.
- RCA inventory scripts over tracked repo-root `README*`, `docs/**/*.md`, and all tracked README files under repo support roots.
- RCA support README spot checks: `agent/README.md`, `contracts/README.md`, `runtime/README.md`, `config/local/README.md`, and xiaohongshu prompt asset README files under `prompts/node/aligned/自动小红书/**/README.md`.
- Doctor evidence: RCA OPL Doc Governance doctor reported `finding_count=0`, active truth `pass`; this was used only as a shape/risk input.

Fresh semantic result:

- RCA current root/docs inventory is `91` tracked paths for repo-root `README*` plus `docs/**/*.md`.
- RCA current all-README/docs inventory is `97` tracked paths when repo-local support README files outside `docs/` are included.
- Prior focused tranches already covered RCA active/status, product-entry references, runtime/integration support, delivery/source support, policy support, references including north-star, Hermes history, Phase 2 history, and plans/runtime/tombstone history.
- This reconcile explicitly closes the grouped coverage accounting gap for `docs/history/hermes/*.md`, `docs/history/phase-2/*.md`, `docs/references/product-entry/*.md`, root bilingual README, support README roots and prompt asset README files.
- The prompt README files remain prompt asset support, not active runtime truth, production evidence or generated wrapper owners.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | Final reconcile over 91 tracked repo-root `README*` / `docs/**/*.md` paths and 97 tracked all-README/docs paths including repo-local support README files; support read of RCA core docs, active truth owner, target-state reference, support README roots and doctor output listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this RCA final reconcile. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. This tranche is an inventory/accounting reconcile only; prior RCA tranches already routed current truth, support reference, policy/spec and history/tombstone material.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks.
- `med-autogrant`: current recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: none by current tracked repo-root `README*` + `docs/**/*.md` inventory reconcile. Future new README/docs files, or substantive edits after this tranche, must be covered by a new ledger entry.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- RCA: no current inventory path remains uncovered by role. Remaining RCA risk is future new-doc drift, stale wording introduced after this reconcile, or live source/contract/read-model changes that make an already-covered section stale.
- RCA historical `managed`, `gateway`, `runtime`, `session`, `domain_action_adapter`, Hermes-default, bridge/frontdoor/federation and old route wording remain allowed only in history/provenance/tombstone, semantic-id, negative guard, package/protocol boundary, refs-only adapter, domain handler target or explicit support-reference contexts.
- MAS and App repo-wide docs remain the global OPL series carry-forward.

Verification before absorb:

- RCA docs verification in the tranche worktree: inventory counts `91` root/docs paths and `97` all README/docs paths; `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger verification in the tranche worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Continue MAS repo-wide paragraph coverage from the remaining uncovered doc list if active owner-route dirty lanes are safe or explicitly assigned.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.

Date: `2026-05-26 22:40 CST`
Tranche: `mas-policy-governance-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/policies/**` 中尚未进入 coverage ledger 的 policy index、runtime-governance、repo-ops、quality、publication-route memory 与 study-workflow policy 文档，并吸收回 MAS `main`。目标是把 policy 目录整体读回当前 MAS / OPL owner split：policy 是稳定人读规则，不是 active backlog、runtime truth、publication verdict、artifact authority、submission authorization、`current_package` freshness proof、domain ready 或 production ready 判据。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`.
- MAS policy docs under `docs/policies/**`, with focused reads of policy indexes, runtime-governance policies, repo-ops policies, quality policy group, publication-route memory policy group, study archetypes and research route bias support.
- MAS contracts: `contracts/functional_privatization_audit.json`, `contracts/generated_surface_handoff.json`, `contracts/production_acceptance/mas-production-acceptance.json`, `contracts/action_catalog.json`, and `contracts/test-lane-manifest.json`.

Fresh semantic result:

- Policy docs remain stable human-readable rules and cannot be used as runtime truth, active backlog, production evidence or artifact/publication authority.
- Runtime-governance and repo-ops policies already keep Hermes / MDS / DeepScientist in explicit proof, historical fixture, archive import, backend audit, upstream intake, parity oracle, history/provenance or dev/CI/offline roles; they do not make those surfaces MAS default runtime owners.
- MAS contract evidence continues to prohibit OPL authorization of MAS domain ready, publication ready, medical ready, artifact mutation, memory body, publication verdict or `current_package`.
- One stale active-surface phrase in `docs/policies/runtime-governance/platform_operating_model.md` was narrowed from `gateway / controller` to `domain-agent entry`, controller, and generated descriptor / read-model surface.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | All tracked Markdown under `docs/policies/**` at policy-directory / owner-boundary level, with focused paragraph reads of the policy index, runtime-governance, repo-ops, study-workflow index and current authority-boundary policy groups. | `docs/policies/runtime-governance/platform_operating_model.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this MAS policy tranche. | `docs/active/development-document-portfolio.md` |

Exact MAS policy paths newly recorded by this tranche: `docs/policies/domain_memory_markdown_first_policy.md`; `docs/policies/quality/ai_first_quality_boundary.md`; `docs/policies/quality/ai_reviewer_calibration_corpus.md`; `docs/policies/quality/dm002_manuscript_quality_self_evolution_20260518.md`; `docs/policies/quality/dm003_manuscript_quality_self_evolution_20260522.md`; `docs/policies/quality/evidence_review_contract.md`; `docs/policies/quality/medical_manuscript_first_draft_quality.md`; `docs/policies/quality/publication_gate_policy.md`; `docs/policies/runtime-governance/manual_runtime_stabilization_checklist.md`; `docs/policies/study-workflow/publication_route_memory_library.md`; `docs/policies/study-workflow/publication_route_memory_policy.md`; `docs/policies/study-workflow/research_route_bias_policy.md`; `docs/policies/study-workflow/study_archetypes.md`.

Archived / tombstoned / deleted docs:

- none. MAS policy docs remain active policy/support documents; stale current-surface wording was corrected in place.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks and this policy tranche. Remaining exact uncovered clusters include large history/provenance trees, selected references, and `docs/runtime/projections/artifact_inventory_projection.md`, `runtime_health_kernel.md`, and `study_truth_kernel.md`.
- `med-autogrant`: current recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: none by current tracked repo-root `README*` + `docs/**/*.md` inventory reconcile unless new docs or substantive edits reopen coverage.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- Future MAS policy prose that writes `gateway` as a current MAS owner surface, or treats Hermes / MDS / DeepScientist / local scheduler as default runtime owner, default diagnostic owner, production substrate, study truth, publication quality authority, artifact authority or `current_package` authority is stale pollution.
- Future policy prose must keep merge/verification gates separate from runtime cutover, OPL provider soak, MAS owner receipts, typed blockers and real paper-line evidence; docs coverage, descriptor conformance or provider completion cannot become paper closure or production ready.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.

Verification before absorb:

- MAS policy tranche worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings; policy inventory-vs-ledger recheck confirmed no remaining `docs/policies/**` exact path missing after this ledger entry.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Continue MAS exact uncovered inventory, preferably the remaining runtime projection support docs or a bounded references/history tranche.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.

Date: `2026-05-26 22:35 CST`
Tranche: `mas-active-support-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/active/` 中尚未进入 coverage ledger 的 4 个 active/support 文档，并吸收回 MAS `main`。目标是确认 active 层仍只有 single Active Truth plan、内容线索引、论文自治验收、MDS provenance guard 与 canary registry guard 等唯一 owner 角色；active docs 不保存 dated proof ledger、长执行流水、OPL provider truth、App/workbench backlog 或旧 MDS/Hermes/local scheduler 复活口径。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/active/current-development-lines.md`, `docs/active/program_portfolio_consolidation.md`, and `docs/docs_portfolio_consolidation.md`.
- MAS active docs: `docs/active/README.md`, `docs/active/ai_first_paper_autonomy_closure_program.md`, `docs/active/mas_single_project_mds_absorb_program.md`, and `docs/active/unique_control_plane_canary_registry.md`.
- MAS contracts and source context: `contracts/unique_control_plane_canary_registry.json`, `contracts/functional_privatization_audit.json`, `contracts/generated_surface_handoff.json`, `contracts/production_acceptance/mas-production-acceptance.json`, `contracts/test-lane-manifest.json`, plus CodeGraph context for autonomy governance, OPL runtime refs and unique control-plane canary registry surfaces.

Fresh semantic result:

- `docs/active/README.md` already routes active reading to `mas-ideal-state-gap-plan.md` as single Active Truth owner and keeps process proof / closeout material in history.
- `ai_first_paper_autonomy_closure_program.md` remains paper autonomy target / acceptance owner. It was updated so provider-hosted paper apply records DM002 owner receipt success refs observed with scaleout still pending; this does not authorize paper closure, submission readiness, publication-ready, artifact mutation, or `current_package` freshness.
- `mas_single_project_mds_absorb_program.md` remains landed foundation support for MDS provenance, archive/import, backend audit, upstream learning and parity oracle. It does not reopen MDS default backend, MDS WebUI, MDS daemon, workspace-local service or Git runtime lifecycle.
- `unique_control_plane_canary_registry.md` matches live registry contract: OPL is canonical control-plane owner; MAS owns study truth, quality verdict, artifact authority, owner route facts and owner receipt authority.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/active/README.md`, `docs/active/ai_first_paper_autonomy_closure_program.md`, `docs/active/mas_single_project_mds_absorb_program.md`, and `docs/active/unique_control_plane_canary_registry.md`, with support evidence from core active docs, contracts and CodeGraph surfaces. | `docs/active/ai_first_paper_autonomy_closure_program.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this MAS active-support tranche. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. All four active/support docs retain unique roles; stale currentness wording was corrected in place.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks and this active-support tranche. Remaining exact uncovered clusters are mostly `docs/history/**`, `docs/references/med-deepscientist/**`, selected `docs/references/mainline/**`, selected integration / MDS parity references, `docs/public/README.md`, and `docs/specs/README.md`.
- `med-autogrant`: current recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: none by current tracked repo-root `README*` + `docs/**/*.md` inventory reconcile unless new docs or substantive edits reopen coverage.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- Future MAS active docs that add dated proof ledgers, attempt ids, branch names, command traces or closeout chronology should be folded into `docs/history/**`, runtime ledgers, real workspace receipts or the coverage ledger rather than active owner docs.
- Future paper-autonomy prose must not upgrade DM002 owner receipt refs, OPL provider completion, queue completion, repo tests or provider attempt completion into paper closure, publication-ready, artifact mutation authorization, submission readiness or `current_package` freshness.
- Future MDS / DeepScientist / Hermes wording in active docs must stay in provenance, archive/import, backend audit, upstream learning, parity oracle, explicit executor/proof, or history roles; it must not return as default runtime owner, diagnostic owner, quality owner, artifact authority or hidden runnable substitute.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.

Verification before absorb:

- MAS active-support tranche worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings; active-doc inventory-vs-ledger recheck confirmed no remaining `docs/active/**` exact path missing after this ledger entry.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Continue MAS exact uncovered inventory, preferably `docs/references/med-deepscientist/**` or a bounded history index/provenance tranche.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.

Date: `2026-05-26 22:55 CST`
Tranche: `mas-med-deepscientist-reference-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/references/med-deepscientist/**` 中尚未进入 coverage ledger 的 8 份 support-reference 文档，并吸收回 MAS `main`。目标是把 MDS / DeepScientist 学习、解构、upstream intake、source provenance 与 legacy fork intake 语义读回当前 MAS / OPL owner split：MDS 只能作为 historical source archive、parity fixture、explicit legacy diagnostic、backend audit、source provenance、upstream intake 或 parity oracle reference。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/active/program_portfolio_consolidation.md`, and `docs/docs_portfolio_consolidation.md`.
- MAS med-deepscientist reference docs: `docs/references/med-deepscientist/README.md`, `deepscientist_continuous_learning_policy.md`, `deepscientist_latest_update_learning_protocol.md`, `med_deepscientist_continuous_learning_plan.md`, `med_deepscientist_deconstruction_map.md`, `med_deepscientist_method_learning_disciplines.md`, `med_deepscientist_upstream_source_provenance.md`, and `upstream_intake.md`.
- MAS source/contracts: `src/med_autoscience/med_deepscientist_repo_manifest.py`, `src/med_autoscience/controllers/backend_audit.py`, `contracts/functional_privatization_audit.json`, and `contracts/test-lane-manifest.json`.

Fresh semantic result:

- The reference cluster already kept MDS in support/reference roles and did not require prose corrections beyond coverage ledger recording.
- `med_deepscientist_repo_manifest.py` exposes MDS as `truth_authority_role=event_source_only` and forbids authority/runtime-health surfaces including canonical next action, publication/package/delivery state, runtime health epoch, worker liveness and allowed controller actions.
- `backend_audit.py` keeps external runtime optional and does not block default operation when the controlled backend repo is unconfigured.
- MAS functional privatization contract continues to say generic runtime has been removed from MAS, OPL replacement exists, production long-run soak is not complete, MAS cannot claim generic runtime owner, and OPL cannot authorize quality/export or write domain truth.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all 8 tracked Markdown files under `docs/references/med-deepscientist/**`, with support evidence from MAS core/current docs, MDS manifest inspection source, backend-audit source, functional privatization contract and test-lane manifest. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this MAS reference tranche. | `docs/active/development-document-portfolio.md` |

Exact MAS med-deepscientist reference paths newly recorded by this tranche: `docs/references/med-deepscientist/README.md`; `docs/references/med-deepscientist/deepscientist_continuous_learning_policy.md`; `docs/references/med-deepscientist/deepscientist_latest_update_learning_protocol.md`; `docs/references/med-deepscientist/med_deepscientist_continuous_learning_plan.md`; `docs/references/med-deepscientist/med_deepscientist_deconstruction_map.md`; `docs/references/med-deepscientist/med_deepscientist_method_learning_disciplines.md`; `docs/references/med-deepscientist/med_deepscientist_upstream_source_provenance.md`; `docs/references/med-deepscientist/upstream_intake.md`.

Archived / tombstoned / deleted docs:

- none. The MAS med-deepscientist reference cluster remains useful support/reference material with a consistent owner/purpose/state/machine-boundary shape.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks and this reference tranche. Remaining exact uncovered clusters are mostly `docs/history/**`, selected `docs/references/mainline/**`, selected integration / MDS parity references, `docs/public/README.md`, and `docs/specs/README.md`.
- `med-autogrant`: current recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: none by current tracked repo-root `README*` + `docs/**/*.md` inventory reconcile unless new docs or substantive edits reopen coverage.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- Future MDS / DeepScientist reference prose that treats MDS as default runtime owner, default backend, default diagnostic owner, WebUI/daemon surface, quality/publication authority, artifact authority, `current_package` authority, hosted package surface or hidden runnable substitute is stale pollution.
- Future upstream-learning prose must keep provider/UI/marketing changes out of MAS owner truth unless a MAS-owned contract/template/code slice and verification target are explicitly defined.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.

Verification before absorb:

- MAS med-deepscientist reference tranche worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings; med-deepscientist inventory-vs-ledger recheck confirmed no remaining `docs/references/med-deepscientist/**` exact path missing after this ledger entry.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Continue MAS exact uncovered inventory, preferably bounded `docs/history/**` index/provenance groups or remaining selected `docs/references/mainline/**`, `docs/references/integration/**`, `docs/references/mds-parity/**`, `docs/public/README.md`, and `docs/specs/README.md`.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.

Date: `2026-05-26 23:30 CST`
Tranche: `mas-mds-parity-runtime-drift-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/references/mds-parity/**` 中剩余 exact uncovered 的 3 份 support-reference 文档，并吸收同 cluster 的 stale runtime / Live Console wording 修正。目标是把 MDS WebUI / Live Console / terminal attach parity 参考重新对齐当前 MAS / OPL owner split：MAS owns paper/domain Progress Portal projection；OPL owns runtime drilldown through `current_control_state` / provider attempt projection。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/active/opl_app_mas_runtime_workbench_program.md`, and `docs/docs_portfolio_consolidation.md`.
- MAS mds-parity docs: `docs/references/mds-parity/mds_capability_parity_matrix.md`, `docs/references/mds-parity/mds_webui_cleanroom_behavior_spec.md`, `docs/references/mds-parity/mds_webui_user_parity_gap_review.md`, with supporting correction in `docs/references/mds-parity/mds_behavior_equivalence_gap_matrix.md`.
- MAS machine/test truth: `src/med_autoscience/controllers/mds_capability_parity.py`, `src/med_autoscience/controllers/mds_capability_parity_parts/behavior_equivalence.py`, `src/med_autoscience/controllers/progress_portal_parts/workspace_carrier.py`, `contracts/functional_privatization_audit.json`, `contracts/test-lane-manifest.json`, `tests/test_mds_capability_parity.py`, `tests/test_progress_portal.py`, `tests/progress_portal_cases/test_materialized_surfaces.py`, `tests/test_mas_mds_absorb_governance.py`, and `tests/test_mds_truth_boundary.py`.

Fresh semantic result:

- MAS mds-parity docs now say MAS Progress Portal keeps payload/static per-study pages, route-decision read-only projection, source/artifact refs, owner receipts and typed blockers.
- MAS private Live Console, conversation/session read model, terminal attach gate and Portal local action endpoint are now written as physically retired / history-provenance only.
- Runtime conversation, terminal/log/provider drilldown and future attach/control are routed to OPL `current_control_state` / provider attempt projection; MAS Portal cannot be read as runtime owner, terminal owner, command queue, local HTTP service or action endpoint.
- `mds_behavior_equivalence_gap_matrix.md` was corrected as supporting stale prose even though it was previously ledger-covered, because its old wording conflicted with current machine truth and focused tests.
- MAS inventory-vs-ledger after this tranche reports `docs/references/mds-parity/**` exact missing count `0`.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of `docs/references/mds-parity/mds_capability_parity_matrix.md`, `docs/references/mds-parity/mds_webui_cleanroom_behavior_spec.md`, and `docs/references/mds-parity/mds_webui_user_parity_gap_review.md`; focused stale correction of `docs/references/mds-parity/mds_behavior_equivalence_gap_matrix.md`, with live source/contract/test evidence listed above. | `docs/references/mds-parity/mds_capability_parity_matrix.md`; `docs/references/mds-parity/mds_webui_cleanroom_behavior_spec.md`; `docs/references/mds-parity/mds_webui_user_parity_gap_review.md`; `docs/references/mds-parity/mds_behavior_equivalence_gap_matrix.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this MAS mds-parity tranche. | `docs/active/development-document-portfolio.md` |

Exact MAS mds-parity reference paths newly recorded by this tranche: `docs/references/mds-parity/mds_capability_parity_matrix.md`; `docs/references/mds-parity/mds_webui_cleanroom_behavior_spec.md`; `docs/references/mds-parity/mds_webui_user_parity_gap_review.md`.

Archived / tombstoned / deleted docs:

- none. The mds-parity cluster remains support-reference material; stale current-surface wording was corrected in place.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks and this mds-parity tranche. Remaining exact uncovered clusters are now history-heavy plus selected `docs/references/mainline/**` and `docs/references/integration/**`.
- `med-autogrant`: current recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: none by current tracked repo-root `README*` + `docs/**/*.md` inventory reconcile unless new docs or substantive edits reopen coverage.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- Future MAS mds-parity prose that claims MAS private Live Console, MAS conversation/session read model, terminal attach owner gate, Portal `--serve --enable-actions`, MAS runtime owner apply, terminal command queue, local HTTP action endpoint or MAS-owned terminal attach/input/resize/detach is stale pollution.
- Future MDS WebUI parity prose must keep old WebUI / daemon as clean-room UX oracle and historical fixture; it must not become source import, default runtime owner, diagnostic owner, quality/publication authority, artifact authority, terminal owner or hidden runnable substitute.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.

Verification before absorb:

- MAS mds-parity tranche worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings; mds-parity inventory-vs-ledger recheck confirmed no remaining `docs/references/mds-parity/**` exact path missing after this ledger entry.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Continue MAS exact uncovered inventory, preferably selected `docs/references/mainline/**`, selected `docs/references/integration/**`, or bounded `docs/history/**` index/provenance groups.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.

Date: `2026-05-27 00:09 CST`
Tranche: `mas-mainline-integration-exact-path-reconcile`
State: `tranche_verified`

本轮重新覆盖 MAS `docs/references/mainline/**` 与 `docs/references/integration/**` 中仍被 exact inventory 标为未覆盖的 7 份 support-reference 文档，并修正同一 integration cluster 中 product-entry handoff 参考的当前 CLI / generated-shell 口径漂移。目标是把已有段落级覆盖转成可由 inventory 精确核对的路径记录。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/active/mas-ideal-state-gap-plan.md`, and `docs/docs_portfolio_consolidation.md`.
- MAS target docs: `docs/references/mainline/ars_learning_intake.md`, `docs/references/mainline/nature_skills_learning_intake.md`, `docs/references/mainline/project_repair_priority_map.md`, `docs/references/mainline/test_lane_governance_2026_05_08.md`, `docs/references/integration/opl-family-contract-adoption.md`, `docs/references/integration/opl-managed-runtime-three-layer-contract.md`, and `docs/references/integration/stage_led_autonomy_family_inventory.md`.
- MAS source/contracts/CLI surfaces: ARS projection, medical material passport, stage quality contract, domain entry contract/adapter, public CLI surface, parser/study action commands, product-entry manifest shell refs, family adoption descriptor, OPL family adoption contract, test-lane manifest, action catalog and product-entry manifest schema.
- CLI probes: current `domain-handler export|dispatch --help` pass; top-level `product-entry-manifest` / `build-product-entry` are not current MAS CLI parser choices.
- CodeGraph context/explore for ARS projection, medical material passport, stage quality pack, family stage control plane descriptor, domain memory descriptor and domain entry command surfaces.

Fresh semantic result:

- ARS and nature-skills references remain clean-room / projection-only support references; they do not introduce vendor dependency, runtime provider, quality verdict, publication authority, source body owner, artifact authority, submission readiness or `current_package` freshness proof.
- Repair-priority and test-lane governance references remain support/provenance references; current execution truth stays in MAS active plan, contracts, test-lane manifest, source and fresh verification.
- The exact integration references align with OPL/Temporal default hosted runtime, MAS-owned quality/projection/memory/domain refs, body-free memory descriptor, stage descriptor, and MDS / Hermes provenance-only boundaries.
- `lightweight_product_entry_and_opl_handoff.md` now distinguishes live `SERVICE_SAFE_DOMAIN_COMMANDS` (`study-progress`, `launch-study`, `submit-study-task`, authority-operation commands) from product-entry schema / manifest-shell / OPL generated shell refs. It no longer writes old top-level `product-entry-manifest`, top-level `build-product-entry`, or `medautosci product build-entry` as current MAS CLI truth.

Reviewed documents:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph reread of 7 exact-missing mainline / integration reference docs; focused currentness correction in `docs/references/integration/lightweight_product_entry_and_opl_handoff.md`, with live source/contract/CLI/CodeGraph evidence listed above. | `docs/references/integration/lightweight_product_entry_and_opl_handoff.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family ledger foldback for this MAS exact-path reconcile tranche. | `docs/active/development-document-portfolio.md` |

Exact MAS reference paths newly recorded by this tranche: `docs/references/mainline/ars_learning_intake.md`; `docs/references/mainline/nature_skills_learning_intake.md`; `docs/references/mainline/project_repair_priority_map.md`; `docs/references/mainline/test_lane_governance_2026_05_08.md`; `docs/references/integration/opl-family-contract-adoption.md`; `docs/references/integration/opl-managed-runtime-three-layer-contract.md`; `docs/references/integration/stage_led_autonomy_family_inventory.md`.

Archived / tombstoned / deleted docs:

- none. Target documents remain support references; stale current-surface wording was corrected in place.

Unreviewed docs:

- `one-person-lab`: none by exact inventory coverage for the current OPL inventory.
- `med-autoscience`: repo-wide `README*` and `docs/**/*.md` full paragraph coverage remains open outside prior focused MAS chunks and this exact-path reconcile tranche. Remaining exact uncovered clusters are history-heavy: `docs/history/program`, `docs/history/superpowers/plans`, `docs/history/superpowers/specs`, `docs/history/runtime`, `docs/history/positioning`, `docs/history/capabilities/medical-display`, `docs/history/omx`, and history directory indexes.
- `med-autogrant`: current recorded scope was closed by the MAG final inventory reconcile unless new docs or later source/contract changes reopen a section.
- `redcube-ai`: none by current tracked repo-root `README*` + `docs/**/*.md` inventory reconcile unless new docs or substantive edits reopen coverage.
- `opl-meta-agent`: no unreviewed repo-root `README*` or `docs/**/*.md` from the earlier full OMA tranche unless docs changed after that tranche.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active App release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- Future MAS product-entry / OPL handoff prose that writes retired top-level `product-entry-manifest`, top-level `build-product-entry`, or `medautosci product build-entry` as current MAS CLI truth is stale unless a live parser / generated caller proves it.
- Future ARS / nature / external-skill prose must stay clean-room / projection-only and cannot become MAS authority or runtime dependency.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.

Verification before absorb:

- MAS exact-path reconcile worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings; inventory-vs-ledger recheck confirmed no remaining `docs/references/mainline/**`, `docs/references/integration/**`, or `docs/references/mds-parity/**` exact path missing after this ledger entry.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Continue MAS exact uncovered history inventory, preferably a bounded `docs/history/**` index/provenance group.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.

Date: `2026-05-27 00:48 CST`
Tranche: `series-safety-preflight-and-next-scope-ledger`
State: `tranche_verified`

本轮覆盖 OPL series 6 仓的安全 preflight、doctor active-truth shape、worktree / branch ownership 边界和下一轮可写范围，不改写 MAS/App 外部脏文件，不吸收或清理无法确认本自动化所有权的 worktree。本轮不关闭全局 `/goal`，也不表示 6 仓 `README*` 与 `docs/**/*.md` 已逐段全覆盖。

Fresh live truth inputs:

- OPL Doc Governance skill: `/Users/gaofeng/workspace/opl-doc-governance/skills/opl-doc-governance/SKILL.md`.
- `/goal` state: active long-horizon OPL Doc Governance objective for 6 repos; this tranche is a checkpoint, not global completion.
- 6 仓 `git status --short --branch`, `git worktree list --porcelain`, branch recency, dirty-file paths, and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.
- Subagent read-only audits for OPL/OMA, MAS/App, and MAG/RCA; all reported no file edits, no commits, no worktree cleanup.

Fresh semantic result:

- Doctor preflight shows all six active truth owners have current completion progress, current-state-vs-ideal gaps, and ready next-round Agent prompt shape: OPL `docs/active/current-state-vs-ideal-gap.md`; MAS `docs/active/mas-ideal-state-gap-plan.md`; MAG `docs/active/mag-ideal-state-cross-repo-gap-plan.md`; RCA `docs/active/rca-ideal-state-gap-plan.md`; OMA `docs/active/opl-meta-agent-ideal-state-gap-plan.md`; App `docs/active/app-ideal-state-gap-plan.md`.
- No stale worktree was safe to auto-absorb or delete. OPL, MAS, and App side worktrees are older than one hour but carry uncommitted source / docs / test / release changes or branch ancestry that cannot be attributed to this automation. They remain external active or uncertain lanes.
- MAS main and App main have unrelated dirty files. MAS dirty scope includes `docs/decisions.md`, owner-route / dispatch / workspace-init source and tests, plus new owner-route reconcile files. App dirty scope includes `README.md`, `docs/status.md`, `docs/testing/README.md`, `scripts/README.md`, `package.json`, and release-boundary tests. These paths are protected from this tranche.
- MAG and RCA currently have clean main checkouts for docs governance purposes, but the read-only audit found no urgent semantic drift that justified editing source/contracts/tests; future write work should stay ledger / active-plan scoped unless fresh machine evidence proves drift.
- OMA repo-root `README*` and `docs/**/*.md` remain covered by the earlier full OMA tranche unless docs changed later; follow-up risk is mainly script-to-pack hygiene and OPL-generated default-caller consumption tail, not a missing active-truth owner.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Skill, `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, core five docs, `docs/docs_portfolio_consolidation.md`, active truth owner, ideal-state reference, main active support docs, doctor preflight, worktree / branch status. | `docs/active/development-document-portfolio.md` |
| `med-autoscience` | `AGENTS.md`, `TASTE.md`, root READMEs, core five docs, `docs/docs_portfolio_consolidation.md`, active truth owner, ideal-state reference, current-development support, doctor preflight, dirty scope and worktree status. | none |
| `med-autogrant` | `AGENTS.md`, `TASTE.md`, root READMEs, core five docs, active truth owner, ideal-state reference, portfolio owner, private implementation inventory, machine evidence entry list, doctor preflight. | none |
| `redcube-ai` | `AGENTS.md`, `TASTE.md`, root READMEs, core five docs, active truth owner, ideal-state reference, portfolio owner, private implementation inventory, machine evidence entry list, doctor preflight. | none |
| `opl-meta-agent` | `AGENTS.md`, `TASTE.md`, root READMEs, core docs, active truth owner, ideal-state reference, private implementation inventory, doctor preflight, agent pack README pattern scan. | none |
| `one-person-lab-app` | `AGENTS.md`, `TASTE.md`, root READMEs, core docs, active truth owner, release/testing/scripts README risk scan, doctor preflight, dirty scope and worktree status. | none |

Archived / tombstoned / deleted docs:

- none. This tranche is a safety and coverage-ledger checkpoint.

Unreviewed docs:

- `one-person-lab`: subagent marked remaining reference/history/support docs as not newly governed in this checkpoint, especially `docs/references/runtime-substrate/**` and `docs/history/**`, despite earlier exact inventory coverage claims. Future OPL-only tranche should reconcile exact inventory state with support/history body coverage.
- `med-autoscience`: repo-wide full paragraph coverage remains open mainly in `docs/history/**`, selected history indexes, `docs/history/capabilities/medical-display/**`, and any docs changed after the latest MAS coverage entries.
- `med-autogrant`: current recorded scope remains closed unless new docs or source/contract changes reopen a section; remaining watch items are historical specs / active-support dated specs and `agent/README.md`, `contracts/README.md`, `runtime/README.md` if included in governance scope.
- `redcube-ai`: current tracked repo-root `README*` + `docs/**/*.md` inventory was previously reconciled, but read-only audit still flags body-level history/support risk in `docs/history/phase-2/**`, `docs/history/hermes/**`, delivery/product/runtime/source/support references, and product-entry references.
- `opl-meta-agent`: repo-root `README*` and `docs/**/*.md` remain covered; `agent/knowledge`, `agent/prompts`, `agent/stages`, `agent/skills`, and `agent/quality_gates` were pattern-scanned but not treated as full docs-taxonomy coverage.
- `one-person-lab-app`: full App docs coverage remains open. Do not write App docs until dirty release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- App docs are the highest-priority blocked scope: `docs/active/app-ideal-state-gap-plan.md`, `docs/release/README.md`, release/testing/scripts README surfaces, and possible missing `docs/decisions.md` need governance after external dirty lanes settle.
- MAS history-heavy uncovered inventory remains the next safe MAS body-coverage target once current source/docs dirty work is owned or folded.
- OPL active support docs that overlap `docs/active/current-state-vs-ideal-gap.md` should be checked for duplicate current-state ownership before adding more active prose.
- RCA delivery/product/runtime/source/reference support docs and Hermes / phase-2 history bodies should keep lifecycle boundaries from being read as current runtime or production readiness.
- MAG dated specs/history tails should continue to route current truth back to active specs index, lifecycle map, contracts and current-program evidence.

Verification before absorb:

- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings; final `git status --short --branch`.
- No repo-native source/runtime tests required because this tranche only edits the OPL coverage ledger and does not change machine-readable contracts, source, CLI/API, schema, generated artifacts or runtime semantics.

Next tranche write scope:

- If App dirty lanes are resolved or explicitly assigned, start with App `docs/active/app-ideal-state-gap-plan.md` plus release evidence docs, and protect all unrelated release / GUI changes.
- Otherwise continue MAS bounded `docs/history/**` index/provenance body coverage, or run an RCA support/history body tranche while RCA stays clean.
- Do not clean older worktrees unless they become clean, attributed to this automation, and safely merged or explicitly abandoned.

Date: `2026-05-27 01:35 CST`
Tranche: `mas-history-omx-no-resurrection-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/history/omx/**` 历史/provenance cluster，并把结果回写到 MAS 本地 coverage ledger 与本 OPL family ledger。目标是保留 OMX-era worktree 手册的审计价值，同时让第一屏明确它不是当前 MAS 执行入口，不得复活项目级 `.omx` / `.codex` / hook / tmux / session state 或旧 owner-worktree 便签。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/delivery/medical-display/contracts/medical_display_platform_mainline.md`, `docs/delivery/medical-display/board/medical_display_active_board.md`, and `docs/docs_portfolio_consolidation.md`.
- MAS target docs: `docs/history/omx/README.md` and `docs/history/omx/omx_worktree_startup_and_closeout.md`.
- Six-repo `git status --short --branch`, `git worktree list --porcelain`, branch heads, and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.

Fresh semantic result:

- MAS current truth already says project-level `.codex` and `.omx` are retired; repo-tracked contracts, durable runtime/controller surfaces, generated artifacts, source/tests, CLI/API behavior and owner receipts remain authoritative.
- MAS `docs/decisions.md` records the 2026-04-11 OMX retirement decision: OMX remains only as `docs/history/omx/` material and `.omx/` is forbidden as current workflow entry.
- Medical-display active docs already route current owner-round state to tracked active board / contract surfaces and keep `docs/history/omx/` as audit provenance only.
- `docs/history/omx/README.md` now carries a first-screen dated-read / no-resurrection guard.
- `docs/history/omx/omx_worktree_startup_and_closeout.md` now warns that its "current/recommended/must" wording belongs to the OMX era only; operational details remain as historical provenance.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | `docs/history/omx/README.md`, `docs/history/omx/omx_worktree_startup_and_closeout.md`, plus supporting current-boundary read of `docs/decisions.md`, `docs/invariants.md`, medical-display mainline contract, medical-display active board and MAS local coverage ledger. | `docs/history/omx/README.md`; `docs/history/omx/omx_worktree_startup_and_closeout.md`; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAS history tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. OMX materials stay in `docs/history/omx/**` as audit provenance and no-resurrection guard material.

Unreviewed docs:

- `med-autoscience`: `docs/history/omx/**` exact cluster is now covered. MAS repo-wide full paragraph coverage remains open for other history-heavy groups: `docs/history/program`, `docs/history/runtime`, `docs/history/positioning`, `docs/history/superpowers/**`, `docs/history/capabilities/medical-display/**`, and history directory indexes.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- MAS: any future prose that treats project-level `.omx`, `.codex`, root hook scanning, tmux/session pointer files, OMX prompt/report state, or old owner worktree notes as current execution surface is stale pollution.
- MAS: other history clusters still need bounded first-screen lifecycle/no-resurrection review.
- App: release / GUI docs remain blocked by unrelated dirty work in main and external worktrees.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. MAS and App main checkouts carry unrelated dirty files; OPL/MAS/App external worktrees remain dirty, not merged, recently written, or outside this automation's ownership.
- This tranche's MAS and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAS OMX history worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- Continue MAS bounded history inventory, preferably `docs/history/program`, `docs/history/runtime`, `docs/history/positioning`, `docs/history/superpowers/**`, or `docs/history/capabilities/medical-display/**`.
- Keep App docs delayed until active release / GUI lanes are safe or explicitly assigned.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 01:40 CST`
Tranche: `oma-ai-first-baseline-delta-coverage`
State: `tranche_verified`

本轮覆盖 `opl-meta-agent` 在 `c2fca93 Make OMA baseline generation AI-first` 之后重新打开的 README/docs/agent-pack 文案 delta。目标是确认新 AI-first / Codex `stage-decomposition` typed closeout 口径已经和 live scripts、contracts、tests 与 OPL read-model 对齐；本轮不改 OMA 文档，不关闭全局 `/goal`，也不把 OMA generated surface、registry/App consumption 或 conformance 读数写成 target domain ready、quality verdict、App live rendering 或 default promotion。

Fresh live truth inputs:

- OMA `AGENTS.md`, `TASTE.md`, repo-root `README.md`, `README.zh-CN.md`, `docs/README.md`, core docs, active truth owner, ideal-state reference and private implementation inventory.
- OMA agent-pack support README files under `agent/knowledge`, `agent/prompts`, `agent/quality_gates`, `agent/skills`, and `agent/stages`; focused changed pack files `agent/prompts/stage-decomposition.md`, `agent/skills/agent-baseline-build.md`, and `agent/skills/opl-meta-agent-domain-skill.md`.
- OMA live source/tests/contracts: `scripts/bootstrap-sample-agent.ts`, `scripts/lib/stage-decomposition-runner.ts`, `scripts/lib/stage-decomposition-pack-draft.ts`, `scripts/lib/bootstrap-domain-packs.ts`, `tests/stage-decomposition-materializer.test.ts`, `tests/bootstrap-loop.test.ts`, `package.json`, `runtime/authority_functions/meta-agent-authority-functions.json`, and `contracts/functional_privatization_audit.json`.
- OPL read models: `opl agents interfaces --repo-dir /Users/gaofeng/workspace/opl-meta-agent --json`, `opl agents conformance --family-defaults --json`, and `opl runtime app-operator-drilldown --json`.

Fresh semantic result:

- OMA docs now correctly state that the default `build-agent-baseline` path launches or consumes a Codex `stage-decomposition` typed closeout, and that the closeout is the authority for stage graph, action refs, pack files, independent gate policy and quality gate declarations.
- The implementation matches that claim: `build-agent-baseline` calls `runStageDecompositionAttempt`, then `validateStageDecompositionCloseoutPacket` and `materializeStageDecompositionPackDraft`; free text closeout, partial refs, missing independent gate policy, missing quality gate declaration and self-review fail closed to blocker before baseline receipt signing.
- `scripts/lib/bootstrap-domain-packs.ts` is now only a 28-line compatibility fixture adapter that builds a fixture typed closeout and hands it to the strict materializer. It no longer authors the default stage graph.
- OPL generated interface read-model remains `status=ready` and OPL-owned, with `domain_repo_can_own_generated_surface=false` and generated interface `can_write_domain_truth=false`. Its `build-agent-baseline` descriptor still points to `npm run bootstrap:sample`, so current prose must continue to present `bootstrap:sample` as an explicit secondary command name rather than claiming all generated descriptors have switched to the new npm script name.
- OPL App/operator drilldown reads `opl_meta_agent_registry_status=resolved`, `opl_meta_agent_production_consumption_ready=true`, `opl_meta_agent_claims_domain_ready=false`, `opl_meta_agent_claims_quality_verdict=false`, `opl_meta_agent_claims_default_promotion=false`, `app_release_user_path_release_ready_claimed=false`, and `app_release_user_path_production_ready_claimed=false`. This is OPL refs-only consumption evidence, not target domain readiness or default promotion authority.
- Family conformance still has `passed_count=4`, `blocked_count=0`, and `production_evidence_tail_count=4`; structural conformance is not a production/domain-ready claim.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `opl-meta-agent` | Delta reread of `README.md`, `README.zh-CN.md`, `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/active/opl-meta-agent-ideal-state-gap-plan.md`, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/references/opl-meta-agent-ideal-state.md`, `docs/README.md`, and agent README support files; focused changed pack docs listed above; support read of scripts/tests/contracts/read-model evidence listed above. | none |
| `one-person-lab` | OPL family coverage ledger foldback for this OMA delta tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. OMA docs remain current; no doc path gained a duplicate active-truth role or a proven no-active-role retirement requirement.

Unreviewed docs:

- `opl-meta-agent`: repo-root `README*`, `docs/**/*.md`, and agent README support files remain covered after this delta refresh. Non-README semantic pack files outside the focused changed stage/skill docs were used as support surfaces, not re-governed as full docs-taxonomy bodies in this tranche.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autoscience`, `med-autogrant`, `redcube-ai`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- OMA: future docs or generated descriptors that treat `bootstrap:sample` as the default AI-first authority would be stale; it is now an explicit secondary command / generated descriptor command while `build-agent-baseline` is the documented action implementation.
- OMA: future prose that treats fixture typed closeout, sample smoke, generated surface readiness, registry/App projection, conformance pass, suite pass or OPL refs-only production consumption as real target delivery, target domain ready, quality verdict, App live rendering, owner receipt, production ready or default promotion is stale pollution.
- OMA: `scripts/lib/stage-decomposition-pack-draft.ts` is 788 lines and remains a split-pressure helper; future growth should split fixture builder, validator and materializer, not turn it into a private scaffold generator or Agent Lab runner.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup. OPL, MAS and App extra worktrees are older than one hour but carry uncommitted source/docs/test/release changes or branch ancestry outside this automation's ownership. They remain retained.
- This tranche's OPL ledger worktree should be removed after fast-forward absorb.

Verification before absorb:

- OMA main: `git diff --check`; strict README/docs/agent/contracts/runtime/scripts/tests conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings; `npm test`; `npm run typecheck`.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.

Next tranche write scope:

- Continue MAS bounded history inventory, or start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 02:04 CST`
Tranche: `opl-source-docs-coverage`
State: `tranche_verified`

本轮覆盖 `one-person-lab` 的 `docs/source/**` 两份 active-support 文档。目标是确认 OPL workspace/source intake shell 的人读边界仍与 live contract、source implementation 和 CLI read model 一致：OPL 只持有 locator、registry、refs transport、lifecycle/status projection 与 App/operator workbench grouping；source truth body、workspace truth、source readiness verdict、domain truth、artifact authority、memory body 与质量/交付判断继续归 domain agents。本轮不关闭全局 `/goal`，也不表示 OPL repo-wide README/docs 全覆盖完成。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, core docs, `docs/docs_portfolio_consolidation.md`, `docs/source/README.md`, and `docs/source/workspace-source-intake-boundary.md`.
- `contracts/opl-framework/generic-substrate-projection-contract.json`.
- Source implementation context from `src/runtime-tray-workspace-source-intake.ts` and `src/workspace-registry.ts`.
- `./bin/opl substrate workbench --json` and `./bin/opl substrate projections --json`.

Fresh semantic result:

- `generic-substrate-projection-contract` still defines OPL scope as framework-owned locator, index, lifecycle and projection surface over domain-declared workspace/source/artifact/memory refs.
- `runtime-tray-workspace-source-intake` builds `opl_workspace_source_intake_projection` with `projection_policy=locator_and_handoff_only_no_source_readiness_authority`; authority flags keep `can_authorize_source_readiness=false`, `can_select_domain_profile=false`, and `can_write_domain_truth=false`.
- `workspace-registry` only records allowed OPL/domain project workspace bindings and locator fields; it does not interpret source quality or readiness.
- `./bin/opl substrate workbench --json` returned `surface_kind=opl_generic_substrate_workbench`, `blocked_count=0`, `workspace_ref_count=3`, `source_ref_count=12`, `artifact_ref_count=22`, and `memory_ref_count=3`; its authority boundary keeps OPL at locator/ref transport/lifecycle/operator projection and domain agents at workspace/source/artifact/memory/domain/quality authority.
- `./bin/opl substrate projections --json` returned `surface_kind=opl_generic_substrate_projection_index`, `resolved_manifest_count=3`, `substrate_refs_resolved_count=3`, `blocked_count=0`, and notes that OPL carries locators/lifecycle status only while domain agents retain truth/body/verdict/authority.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full paragraph read of `docs/source/README.md` and `docs/source/workspace-source-intake-boundary.md`, with supporting contract/source/read-model evidence listed above. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. `docs/source/**` remains current active support; no duplicate active truth role or no-active-role retirement requirement was found.

Unreviewed docs:

- `one-person-lab`: `docs/source/**` exact cluster is now covered. Other OPL body docs remain governed by prior ledger entries; future OPL-only tranche should still reconcile support/history/reference body coverage where previous exact inventory and body-level claims disagree.
- `med-autoscience`: repo-wide full paragraph coverage remains open mainly in history-heavy groups and any docs changed after the latest MAS entries.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- Future OPL source/workspace prose that treats `substrate workbench`, `workspace registry`, `workspace_source_intake_projection`, `source_ref_count`, or `substrate_refs_resolved` as source readiness, source-body import, domain truth, domain profile selection, artifact authority, memory writeback authority, quality verdict or production readiness is stale pollution.
- App docs remain unsafe for automatic governance while main and release/GUI lanes carry unrelated dirty changes.
- MAS history-heavy uncovered inventory remains a safe next body-coverage target once current MAS dirty work is owned or folded.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App extra worktrees are dirty, not safely attributable to this automation, recently written, detached probes, or outside the current tranche.
- This tranche's OPL worktree and branch should be removed after fast-forward absorb.

Verification before absorb:

- OPL source docs coverage worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only the coverage ledger and does not change machine-readable contracts, source, CLI/API, schema, generated artifacts or runtime semantics.

Next tranche write scope:

- Continue MAS bounded history inventory, preferably `docs/history/program`, `docs/history/runtime`, `docs/history/positioning`, `docs/history/superpowers/**`, or `docs/history/capabilities/medical-display/**`.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 02:50 CST`
Tranche: `mas-history-positioning-no-resurrection-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/history/positioning/**` 历史/provenance cluster，并把结果回写到 MAS 本地 coverage ledger 与本 OPL family ledger。目标是让旧 `Domain Harness OS`、`Open Harness OS`、`Research Foundry`、`domain gateway`、MAS Runtime OS、local scheduler、MDS / DeepScientist backend 与 repo-split 品牌建议继续保留历史价值，同时避免 dated “当前默认 runtime”“当前正式判断”“推荐公开口径”被读成今天的 active runtime topology、public current truth、generic framework owner 或 runnable CLI surface。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/references/positioning/mas_ideal_state.md`, `contracts/functional_privatization_audit.json`, `contracts/production_acceptance/mas-production-acceptance.json`, and MAS local docs-governance ledger.
- MAS target docs: `docs/history/positioning/README.md`, `domain-harness-os-positioning.md`, `open_harness_os_architecture.md`, `repo_split_between_research_foundry_and_med_autoscience.md`, `research_foundry_medical_phase_ladder.md`, and `research_foundry_positioning.md`.
- CLI currentness probe: `scripts/run-python-clean.sh -m med_autoscience.cli --help`, which shows the current grouped `medautosci <group> <command>` command surface rather than old `mainline-status` / `mainline-phase` examples.
- Six-repo worktree / branch preflight and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.

Fresh semantic result:

- Current MAS truth remains `Declarative Medical Research Pack + OPL generated/hosted surfaces + minimal medical authority functions`: OPL/Temporal owns hosted autonomous runtime, stage attempt, queue, wakeup, retry/dead-letter, attempt ledger, worker residency and generated shells; MAS owns study truth, stage semantics, AI reviewer / auditor quality gate, publication route, artifact authority, memory decision, owner receipts and typed blockers.
- `docs/history/positioning/README.md` already carried the correct directory-level rule that `Domain Harness OS`, `Open Harness OS`, `Domain Gateway`, `Research Foundry`, Hermes-default, MDS/DeepScientist backend and local scheduler default-chain wording are historical positioning materials only.
- `domain-harness-os-positioning.md` now marks `MAS Runtime OS` and local scheduler sections as historical runtime-shape material.
- `research_foundry_medical_phase_ladder.md` now marks the MAS Runtime OS / local scheduler closeout, old command examples and Phase 1 / Phase 2 progress language as historical ladder material.
- `open_harness_os_architecture.md` and `research_foundry_positioning.md` now mark public positioning / Research Foundry recommendations as historical proposals, not standalone authorization for repo identity, runtime owner, CLI/package/import naming or public readiness changes.
- `repo_split_between_research_foundry_and_med_autoscience.md` already read as `history_provenance`; no body edit was needed.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all 6 `docs/history/positioning/*.md` files, with supporting current-boundary read of MAS active truth, core docs, ideal-state reference, functional privatization audit, production acceptance contract and current CLI help. | `docs/history/positioning/domain-harness-os-positioning.md`; `docs/history/positioning/open_harness_os_architecture.md`; `docs/history/positioning/research_foundry_medical_phase_ladder.md`; `docs/history/positioning/research_foundry_positioning.md`; `docs/history/docs-portfolio-coverage-ledger/2026-05-27-part-5.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAS history tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. Positioning materials stay in `docs/history/positioning/**` as historical provenance and no-resurrection guard material.

Unreviewed docs:

- `med-autoscience`: `docs/history/positioning/**` exact cluster is now covered. MAS repo-wide full paragraph coverage remains open for other history-heavy groups: `docs/history/program`, `docs/history/runtime`, `docs/history/superpowers/**`, `docs/history/capabilities/medical-display/**`, and remaining history directory indexes.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- MAS: any future prose that treats `Domain Harness OS`, `Open Harness OS`, `Research Foundry`, `Domain Gateway`, MAS Runtime OS, MAS-owned local scheduler, old `mainline-status` / `mainline-phase`, MDS backend or Hermes gateway cron as current default runtime owner, public product identity, runnable CLI truth or generic framework owner is stale pollution.
- MAS: future public-positioning changes must start from current README/core docs/active plan/contracts and OPL family docs, not from these historical proposals alone.
- App: release / GUI docs remain blocked by unrelated dirty work in main and external worktrees.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App external worktrees remain dirty, recently written, not safely attributable to this automation, detached probes, or outside the current tranche.
- This tranche's MAS and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAS positioning history worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- Continue MAS bounded history inventory, preferably `docs/history/runtime`, `docs/history/program`, `docs/history/superpowers/**`, or `docs/history/capabilities/medical-display/**`.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 03:24 CST`
Tranche: `mas-history-runtime-no-resurrection-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/history/runtime/**` 历史/provenance cluster，并把结果回写到 MAS 本地 coverage ledger 与本 OPL family ledger。目标是把旧 `Domain Gateway` / `Domain Harness OS`、`MAS Runtime OS`、MedDeepScientist authoritative runtime、Hermes active adapter、workspace-local scheduler、MAS private console / Live Console、outer-loop supervision 与 private implementation inventory 统一读回历史语境，避免 dated “当前”“默认”“正式”“active inventory” 被误读成今天的 default runtime owner、active adapter、runnable CLI surface、physical delete authorization 或 production readiness。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/runtime/README.md`, `docs/runtime/contracts/runtime_boundary.md`, `docs/runtime/control/study_runtime_control_surface.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`, `contracts/functional_privatization_audit.json`, `contracts/production_acceptance/mas-production-acceptance.json`, and MAS local docs-governance ledger.
- MAS target docs: all 14 Markdown files under `docs/history/runtime/`.
- Six-repo worktree / branch preflight and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.

Fresh semantic result:

- Current MAS runtime truth remains OPL/Temporal hosted runtime + MAS domain authority refs, owner receipts, typed blockers and minimal authority functions. OPL owns stage attempt, queue, wakeup, retry/dead-letter, attempt ledger, worker residency, provider transport, generic lifecycle/index and App/workbench shell; MAS owns study truth, publication quality, AI reviewer / auditor verdict, artifact authority, publication-route memory decision, owner receipts, typed blockers and domain transition semantics.
- `docs/history/runtime/README.md` now owns the complete runtime history index and maps every file in the cluster to its current owner surface. It no longer names `MedAutoScience Runtime OS` as the index owner.
- `historical_framework_positioning.md` now opens with a historical read rule. Its `Domain Gateway` / `Domain Harness OS` and `MAS Runtime OS` prose is preserved as positioning provenance, not current public positioning or default runtime topology.
- `legacy_runtime_boundary.md` now marks its `med-deepscientist` authoritative runtime and `runtime_transport` dependency rules as early adapter-boundary history. They cannot be reused as today's MAS runtime owner, production dependency, active adapter or compatibility argument.
- `legacy_active_path_tombstones.md`, `runtime_core_convergence_and_controlled_cutover_implementation_plan.md`, `runtime_event_and_outer_loop_input_implementation_plan.md`, and `workspace_knowledge_and_literature_implementation_plan.md` now point current runtime owner language back to OPL/Temporal hosted runtime plus MAS authority refs. Hermes gateway cron is no longer described as a current active adapter.
- `opl-private-implementation-migration-inventory.md` and `opl_private_implementation_migration_inventory.md` now read as runtime-history snapshots. Current functional/private-surface truth stays in machine-readable contracts and the active MAS gap plan; their old active inventory wording is not an execution queue.
- `runtime_supervision_loop.md`, `outer_loop_wakeup_and_decision_loop.md`, `opl_unique_control_plane_boundary_contract.md`, `live_console_ui_contract.md`, and `mas_live_console_mds_webui_parity_plan.md` already carried adequate tombstone / OPL-owner / Progress Portal boundaries after full paragraph read; no body edit was needed.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all 14 `docs/history/runtime/*.md` files, with supporting current-boundary read of MAS active truth, runtime current docs, docs portfolio governance, functional privatization audit and production acceptance contract. | `docs/history/runtime/README.md`; `docs/history/runtime/historical_framework_positioning.md`; `docs/history/runtime/legacy_active_path_tombstones.md`; `docs/history/runtime/legacy_runtime_boundary.md`; `docs/history/runtime/opl-private-implementation-migration-inventory.md`; `docs/history/runtime/opl_private_implementation_migration_inventory.md`; `docs/history/runtime/runtime_core_convergence_and_controlled_cutover_implementation_plan.md`; `docs/history/runtime/runtime_event_and_outer_loop_input_implementation_plan.md`; `docs/history/runtime/workspace_knowledge_and_literature_implementation_plan.md`; `docs/history/docs-portfolio-coverage-ledger/2026-05-27-part-5.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAS history tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. Runtime history materials stay in `docs/history/runtime/**` as historical provenance and no-resurrection guard material.

Unreviewed docs:

- `med-autoscience`: `docs/history/runtime/**` exact cluster is now covered. MAS repo-wide full paragraph coverage remains open for other history-heavy groups: `docs/history/program`, `docs/history/superpowers/**`, `docs/history/capabilities/medical-display/**`, and remaining history directory indexes.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- MAS: any future prose that treats `Domain Gateway`, `Domain Harness OS`, `MAS Runtime OS`, MedDeepScientist authoritative runtime, Hermes active adapter, workspace-local scheduler, MAS private Live Console, `runtime_transport` / `runtime_protocol` as production default runtime owner, runnable CLI truth, active adapter, generic framework owner or physical-delete authorization is stale pollution.
- MAS: future private-surface inventory prose must start from live `contracts/functional_privatization_audit.json`, production acceptance contract and active gap plan. Runtime-history inventory snapshots cannot be used to reopen closed functional / structural gaps or to claim production evidence tail is complete.
- App: release / GUI docs remain blocked by unrelated dirty work in main and external worktrees.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App external worktrees remain dirty, recently written, not safely attributable to this automation, detached probes, or outside the current tranche.
- This tranche's MAS and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAS runtime history worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- Continue MAS bounded history inventory, preferably `docs/history/program`, `docs/history/superpowers/**`, or `docs/history/capabilities/medical-display/**`.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 03:32 CST`
Tranche: `mas-medical-display-history-no-resurrection-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/history/capabilities/medical-display/**` 历史/provenance cluster，并把结果回写到 MAS 本地 coverage ledger 与本 OPL family ledger。目标是让 medical-display 历史扩库账本、已完成 `A-H` first-baseline program、旧 `G` owner brief、template-pack Phase 1-2 实施包和 PaperPlotHub 只读 intake / exhaustion ledger 保留 provenance 价值，同时避免 dated “current / 当前 / owner round / worktree / backlog / checkbox plan” 被读成今天的 active board、当前 owner round、可直接执行计划或 strict inventory 真相。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/delivery/medical-display/README.md`, `docs/delivery/medical-display/board/medical_display_active_board.md`, `docs/delivery/medical-display/contracts/medical_display_platform_mainline.md`, `docs/delivery/medical-display/contracts/medical_display_audit_guide.md`, `docs/delivery/medical-display/catalogs/medical_display_template_catalog.md`, `docs/delivery/medical-display/catalogs/medical_display_arsenal.md`, `docs/delivery/medical-display/catalogs/medical_display_template_backlog.md`, `docs/delivery/medical-display/portfolio/medical_display_portfolio_consolidation.md`, and MAS local docs-governance ledger.
- MAS target docs: all 7 Markdown files under `docs/history/capabilities/medical-display/`.
- Live source read: `scripts/run-python-clean.sh` import of `med_autoscience.display_registry`, confirming current strict inventory as `84` evidence figures, `7` illustration shells, `7` table shells, `98` total display templates.
- Six-repo worktree / branch preflight and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.

Fresh semantic result:

- Current medical-display execution truth is `docs/delivery/medical-display/board/medical_display_active_board.md`: `A-H` first audited baseline is `8/8`, current strict inventory is `84 / 7 / 7 / 98`, the latest absorbed cluster is `A/E / confusion_matrix_heatmap_binary`, and the state is `Phase 4 / post-absorb reroute` with `owner worktree=not_opened`.
- Current inventory truth is `medical_display_audit_guide.md` plus generated `medical_display_template_catalog.md`; `medical_display_arsenal.md` is the human-readable current inventory narrative; `medical_display_template_backlog.md` is candidate-pool support, not active owner board.
- `medical_display_arsenal_history.md` now opens with a read rule for its `当前状态` column.
- `medical_display_family_baseline_program.md` now reads as completed first-baseline program provenance and points current owner round / reroute truth to the active board.
- `medical_display_g_pathway_integrated_composite_owner_brief.md` now marks the `2026-04-19` `G` owner round as historical and closed. Its branch/worktree and recommended implementation order cannot be reused as current worktree instructions.
- `README.md`, `medical_display_template_pack_implementation_plan_2026_04.md`, `paperplothub_exemplar_intake.md`, and `paperplothub_exemplar_exhaustion_ledger.md` already carried adequate history/provenance, link-only exemplar, checkbox-plan and no-runtime-dependency guards after full paragraph read; no body edit was needed.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all 7 `docs/history/capabilities/medical-display/*.md` files, with supporting current-boundary read of medical-display active board, platform mainline, audit guide, template catalog, arsenal, backlog, portfolio map and live registry inventory. | `docs/history/capabilities/medical-display/medical_display_arsenal_history.md`; `docs/history/capabilities/medical-display/medical_display_family_baseline_program.md`; `docs/history/capabilities/medical-display/medical_display_g_pathway_integrated_composite_owner_brief.md`; `docs/history/docs-portfolio-coverage-ledger/2026-05-27-part-5.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAS history tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The medical-display history cluster stays in `docs/history/capabilities/medical-display/**` as history/provenance and no-resurrection guard material.

Unreviewed docs:

- `med-autoscience`: `docs/history/capabilities/medical-display/**` exact cluster is now covered. MAS repo-wide full paragraph coverage remains open for other history-heavy groups: `docs/history/program`, `docs/history/superpowers/**`, and remaining history directory indexes.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- MAS: any future medical-display prose that treats historical `A-H` first-baseline completion program, old owner brief branch/worktree names, historical implementation checkboxes, PaperPlotHub candidate gaps, or retired `.omx/.codex` execution state as current active board, current backlog, current owner round, runnable worktree instruction, or strict inventory truth is stale pollution.
- MAS: PaperPlotHub records remain link-only exemplar/provenance. They do not authorize script/image copying, runtime dependency, display-pack source, new template promotion, or owner round without a real MAS paper demand and explicit schema/renderer/QC/submission-surface evidence.
- App: release / GUI docs remain blocked by unrelated dirty work in main and external worktrees.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App/RCA external worktrees remain dirty, recently written, not safely attributable to this automation, detached probes, or outside the current tranche.
- This tranche's MAS and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAS medical-display history worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers; a live read-only registry probe confirmed current inventory counts.

Next tranche write scope:

- Continue MAS bounded history inventory, preferably `docs/history/program`, `docs/history/superpowers/**`, or remaining history directory indexes.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

## 验证

Docs-only 整理：

- `git diff --check`
- `rg` spot-check 新链接与旧文档引用
- 不新增依赖 Markdown prose 的测试

Date: `2026-05-27 04:25 CST`
Tranche: `mas-program-history-no-resurrection-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/history/program/**` 历史/provenance cluster，并把结果回写到 MAS 本地 coverage ledger 与本 OPL family ledger。目标是让旧 program boards、Hermes-default cutover/activation packages、Research Foundry / Domain Harness OS execution maps、journal package checkbox plan、P2 runtime-retirement program、learning intake snapshots、full records 和 closeout ledgers 保留审计价值，同时避免 dated “当前”“默认”“activation rule”“next step”“P2”“required sub-skill”“checkbox” 被误读成今天的 active execution queue、default runtime topology、runnable CLI truth、publication/artifact authority 或 production readiness。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/invariants.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`, `docs/references/positioning/mas_ideal_state.md`, `docs/runtime/contracts/runtime_boundary.md`, and MAS local docs-governance ledger.
- MAS target docs: all 34 Markdown files under `docs/history/program/`.
- Six-repo worktree / branch preflight and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.

Fresh semantic result:

- Current MAS truth remains `Declarative Medical Research Pack + OPL generated/hosted surfaces + minimal medical authority functions`: OPL/Temporal owns hosted autonomous runtime, stage attempt, queue, wakeup, retry/dead-letter, attempt ledger, worker residency and generated shells; `Codex CLI` is the default stage executor; MAS owns study truth, AI reviewer / auditor quality gates, publication route, artifact authority, memory decision, owner receipts and typed blockers.
- `docs/history/program/README.md` already works as a history index and points current program governance to active owner docs.
- `hermes_backend_activation_package.md`, `hermes_backend_continuation_board.md`, and `upstream_hermes_agent_fast_cutover_board.md` now carry first-screen read rules so Hermes-default default-substrate / activation / cutover language cannot override current OPL/Temporal default runtime and explicit non-default executor/proof/provenance role.
- `research_foundry_medical_mainline.md`, `research_foundry_medical_execution_map.md`, and `open_harness_os_freeze_plan.md` now mark Research Foundry / Domain Harness OS / Open Harness OS phase and freeze wording as historical.
- `journal_package_builtins_upgrade_plan.md` now marks its required sub-skill, checkbox implementation plan and old file list as historical implementation provenance.
- `opl_temporal_mas_runtime_retirement_program.md` now explicitly reads as P2 framework-transition history/provenance rather than a second active plan, and its stale relative link to the active MAS ideal-state gap plan now points to the current active plan.
- Full-record, closeout, ledger and learning-intake docs already carried adequate `program_history_record` / `history_provenance` metadata after full paragraph read. They remain dated provenance and do not become active queue or current truth.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph read of all 34 `docs/history/program/*.md` files, with supporting current-boundary read of MAS active truth, status, invariants, docs portfolio governance, ideal-state reference and runtime boundary. | `docs/history/program/hermes_backend_activation_package.md`; `docs/history/program/hermes_backend_continuation_board.md`; `docs/history/program/upstream_hermes_agent_fast_cutover_board.md`; `docs/history/program/research_foundry_medical_mainline.md`; `docs/history/program/research_foundry_medical_execution_map.md`; `docs/history/program/journal_package_builtins_upgrade_plan.md`; `docs/history/program/opl_temporal_mas_runtime_retirement_program.md`; `docs/history/program/open_harness_os_freeze_plan.md`; `docs/history/docs-portfolio-coverage-ledger/2026-05-27-part-5.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAS history tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The program cluster stays in `docs/history/program/**` as history/provenance and no-resurrection guard material.

Unreviewed docs:

- `med-autoscience`: `docs/history/program/**` exact cluster is now covered. MAS repo-wide full paragraph coverage remains open for `docs/history/superpowers/**` and remaining history directory indexes.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- MAS: any future prose that treats old Hermes-default activation/cutover, Research Foundry / Domain Harness OS phase ladders, Open Harness OS freeze status, journal package checkbox plans, old P2 lanes, learning intake snapshots or full-record checklists as current active queue, default runtime owner, runnable CLI truth, publication/artifact authority, domain-ready or production-ready evidence is stale pollution.
- MAS: future runtime/program prose must keep OPL/Temporal as default hosted runtime owner, `Codex CLI` as stage executor, and Hermes / MDS / DeepScientist / Research Foundry vocabulary in explicit adapter/proof/provenance/history roles unless live contracts/source/tests prove a new active owner.
- App: release / GUI docs remain blocked by unrelated dirty work in main and external worktrees.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App/RCA external worktrees remain dirty, recently written, not safely attributable to this automation, detached probes, or outside the current tranche.
- This tranche's MAS and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAS program history worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- Continue MAS bounded history inventory, preferably `docs/history/superpowers/**` or remaining history directory indexes.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

涉及 contracts/source/runtime/App 的变更：

- 跑触及线路的 focused tests
- 修改 machine-readable contracts、schema、CLI/API 或 runtime semantics 时跑对应 repo-native verification
- 真实 provider/domain soak 必须提供 provider receipts、domain owner receipts、progress delta / human gate / stop-loss / typed blocker evidence

Date: `2026-05-27 04:55 CST`
Tranche: `mas-superpowers-history-no-resurrection-coverage`
State: `tranche_verified`

本轮覆盖 MAS `docs/history/superpowers/**` 历史/provenance cluster，并把结果回写到 MAS 本地 coverage ledger 与本 OPL family ledger。目标是让 repo-tracked Superpowers plan / spec 草稿保留可审计 design / plan provenance，同时避免正文中的 REQUIRED SUB-SKILL、checkbox、File Structure、旧 CLI/MCP/runtime/workspace 路径、DeepScientist/MDS/Hermes 默认口径、绝对路径或当时的 current/default 表述被误读成今天的 active execution queue、current CLI truth、runtime owner、regression oracle、publication/artifact authority 或 production readiness。本轮不关闭全局 `/goal`，也不表示 MAS repo-wide README/docs 覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `docs/status.md`, `docs/invariants.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`, and MAS local docs-governance ledger.
- MAS target docs: all 47 Markdown files under `docs/history/superpowers/`.
- Six-repo worktree / branch preflight and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.

Fresh semantic result:

- Current MAS truth remains `Declarative Medical Research Pack + OPL generated/hosted surfaces + minimal authority functions`: OPL/Temporal owns hosted autonomous runtime, stage attempt, queue, wakeup, retry/dead-letter, attempt ledger, worker residency and generated shells; `Codex CLI` is the default stage executor; MAS owns study truth, AI reviewer / auditor quality gates, publication route, artifact authority, memory decision, owner receipts and typed blockers.
- `docs/history/superpowers/README.md` now carries a directory-level read rule explaining that `plans/` and `specs/` may preserve old process/checklist/current/default language and must be read only as history/provenance and no-resurrection reference.
- All 46 plan/spec files under `plans/` and `specs/` now carry the same first-screen read rule after `Machine boundary`. This protects old implementation checklists, old DeepScientist/MDS/Hermes runtime assumptions, old CLI/MCP/workspace paths, old compatibility wording and old absolute paths from being reused as current execution instructions.
- No current docs, machine-readable contracts, source, tests, CLI/API behavior, runtime/controller durable surfaces, owner receipts, real workspace artifact or active plan semantics changed.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | Full paragraph / first-screen read of all 47 `docs/history/superpowers/**/*.md` files, with supporting current-boundary read of MAS active truth, status, invariants and docs portfolio governance. | `docs/history/superpowers/README.md`; all `docs/history/superpowers/plans/*.md`; all `docs/history/superpowers/specs/*.md`; `docs/history/docs-portfolio-coverage-ledger/2026-05-27-part-5.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAS history tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The superpowers history cluster stays in `docs/history/superpowers/**` as history/provenance and no-resurrection guard material.

Unreviewed docs:

- `med-autoscience`: `docs/history/superpowers/**` exact cluster is now covered. MAS repo-wide full paragraph coverage remains open for remaining history directory indexes and any exact inventory items not yet reconciled against the ledger.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- MAS: any future prose that treats old Superpowers plan/spec checklists, REQUIRED SUB-SKILL lines, File Structure lists, old DeepScientist/MDS/Hermes default runtime assumptions, old CLI/MCP/workspace paths, or historical absolute paths as current active queue, current CLI truth, default runtime owner, regression oracle, publication/artifact authority, domain-ready or production-ready evidence is stale pollution.
- MAS: future active work must start from active owner docs, core docs, contracts, source, tests, runtime/controller surfaces, owner receipts and live read-model, not from these history drafts.
- App: release / GUI docs remain blocked by unrelated dirty work in main and external worktrees.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App/RCA external worktrees remain dirty, recently written, not safely attributable to this automation, detached probes, or outside the current tranche.
- This tranche's MAS and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAS superpowers history worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- Reconcile remaining MAS history directory indexes and exact inventory against coverage ledgers.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 04:10 CST`
Tranche: `mas-history-index-ledger-inventory-reconcile`
State: `tranche_verified`

本轮覆盖 MAS history directory indexes 与 docs-governance coverage-ledger archive files 的自举对账，并把结果回写到 MAS 本地 coverage ledger 与本 OPL family ledger。目标是关闭上一轮留下的“remaining history directory indexes and exact inventory reconcile”尾项：确认历史索引第一屏已经把 current truth / active owner / machine boundary 指回当前核心 docs、active owner docs、contracts、source、tests、runtime/controller surfaces 与 owner receipts；确认 coverage ledger archive files 自身只保存治理 provenance，不成为第二个 current truth、runtime truth 或 active backlog。本轮不关闭全局 `/goal`，也不表示 OPL series 六仓 `README*` 与 `docs/**/*.md` 已全部逐段覆盖完成。

Fresh live truth inputs:

- MAS `AGENTS.md`, `TASTE.md`, `README.md`, `docs/README.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/active/mas-ideal-state-gap-plan.md`, `docs/references/positioning/mas_ideal_state.md`, and `docs/docs_portfolio_consolidation.md`.
- MAS target indexes: `docs/history/README.md`, `docs/history/capabilities/README.md`, `docs/history/capabilities/medical-display/README.md`, `docs/history/omx/README.md`, `docs/history/positioning/README.md`, `docs/history/program/README.md`, `docs/history/runtime/README.md`, and `docs/history/superpowers/README.md`.
- MAS target coverage-ledger archives: all 7 Markdown files under `docs/history/docs-portfolio-coverage-ledger/`.
- Inventory check over MAS repo-root `README*` plus all `docs/**/*.md`, compared against existing coverage-ledger exact path strings.
- Six-repo worktree / branch preflight and doctor preflight from `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`.

Fresh semantic result:

- Current MAS truth remains `Declarative Medical Research Pack + OPL generated/hosted surfaces + minimal authority functions`: OPL/Temporal owns hosted autonomous runtime, stage attempt, queue, wakeup, retry/dead-letter, attempt ledger, worker residency and generated shells; `Codex CLI` is the default stage executor; MAS owns study truth, AI reviewer / auditor quality gates, publication route, artifact authority, memory decision, owner receipts and typed blockers.
- MAS `docs/history/README.md` already marks the history tree as read-only provenance. It does not own active backlog, runtime truth, controller decisions, publication readiness, artifact authority or policy truth.
- MAS history cluster indexes now align with the no-resurrection coverage already recorded for OMX, positioning, runtime, medical-display history, program history and superpowers history.
- All MAS coverage-ledger archive files already carry `history_provenance` lifecycle headers and a machine boundary that forbids treating the ledger as MAS runtime, controller, publication, artifact or study truth.
- A conservative exact-string inventory check over 246 MAS `README*` / `docs/**/*.md` files found that the only paths still absent from the ledger text were the 7 coverage-ledger archive files themselves. This tranche records those files explicitly and confirms they are provenance artifacts, not active owner docs.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autoscience` | First-screen / role read of all 8 history directory indexes and all 7 coverage-ledger archive files; supporting current-boundary read of MAS core docs, active truth plan, ideal-state reference and docs portfolio governance. | `docs/docs_portfolio_consolidation.md`; `docs/history/docs-portfolio-coverage-ledger/2026-05-27-part-6.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAS history-index / inventory-reconcile tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The reviewed files already have a legitimate long-term role as history/provenance indexes or coverage-ledger archives.

Unreviewed docs:

- `med-autoscience`: this tranche closes the remaining history directory index and coverage-ledger self-archive exact-inventory tail. MAS remains part of the larger OPL series goal, and global closure still depends on all six repos.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `med-autogrant`, `redcube-ai`, `opl-meta-agent`: no new docs governed in this tranche; previous coverage state remains unchanged.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.

Remaining stale / retire candidates:

- MAS: any future prose that promotes history materials, coverage ledgers, old program boards, old superpowers drafts, OMX-era instructions, legacy runtime inventories, positioning proposals or capability history into active execution queue, current CLI truth, default runtime owner, publication/artifact authority, domain-ready or production-ready evidence is stale pollution.
- MAS: future coverage-ledger entries must stay provenance-only and must not become a parallel current truth plan.
- App: release / GUI docs remain blocked by unrelated dirty work in main and external worktrees.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App/RCA external worktrees remain dirty, recently written, not safely attributable to this automation, detached probes, or outside the current tranche.
- This tranche's MAS and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAS history-index reconcile worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- Continue OPL series whole-docs coverage outside this MAS history tranche, preferably a remaining clean repo whose worktrees are not externally dirty or recent.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 04:55 CST`
Tranche: `mag-exact-active-spec-path-reconcile`
State: `tranche_verified`

本轮覆盖 MAG final inventory reconcile 之后留下的 17 个 exact-path ledger gap，并把结果回写到 MAG 本地 coverage ledger 与本 OPL family ledger。目标是把 grouped coverage 与当前 MAG `README*` / `docs/**/*.md` exact inventory 对齐，避免把“路径没有逐字出现在本地 ledger”误读成未审文档。本轮不关闭全局 `/goal`，也不表示 OPL series 六仓 `README*` 与 `docs/**/*.md` 已全部逐段覆盖完成。

Fresh live truth inputs:

- MAG `AGENTS.md`, `TASTE.md`, core five, `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/references/med-auto-grant-ideal-state.md`, `docs/docs_portfolio_consolidation.md`, `docs/specs/README.md`, `docs/specs/specs_lifecycle_map.md`, and `docs/history/specs/README.md`.
- MAG current inventory script over repo-root `README*` plus all `docs/**/*.md`, compared against existing MAG coverage-ledger exact path strings.
- First-screen / role read of the 17 exact paths missing from the ledger before this tranche: four 2026-04-06 history foundation specs, two 2026-04-07 support current-truth specs, seven 2026-04-12 / 2026-04-13 product-entry / route / package support specs, and four active current specs for critique executor, quality/autonomy, authoring completion and AI-first quality boundary.

Fresh semantic result:

- Current MAG truth remains `Declarative Grant Pack + OPL generated/hosted surfaces + minimal authority functions`: OPL/Temporal owns hosted task runtime; `Codex CLI` is the default stage executor; `Hermes-Agent` remains explicit opt-in proof / executor adapter provenance; MAG owns grant truth, fundability / quality / export verdicts, package authority, memory decision and owner receipts.
- The four 2026-04-06 history specs already have first-screen lifecycle guards and remain historical foundation provenance.
- `docs/specs/2026-04-07-durability-model-clarification.md` and `docs/specs/2026-04-07-formal-entry-matrix-current-truth.md` remain support records only; they do not restore local journal, attempt ledger, old public runtime commands, Gateway/local-manager path or MAG-owned generic runtime.
- The 2026-04-12 / 2026-04-13 P4 product-entry / route / package specs remain support current-truth by subsection under source, schemas, product-entry manifest and `contracts/runtime-program/current-program.json`; they do not claim mature App/workbench, hosted runtime completion, external submission, grant ready, production ready or physical-delete authorization.
- The critique executor, quality/autonomy, authoring completion and AI-first quality-boundary specs remain active current specs within the narrow boundaries listed by MAG `docs/specs/specs_lifecycle_map.md`.
- No MAG prose body required rewrite. The MAG ledger now records the 17 exact paths directly, closing the local accounting ambiguity without changing current machine truth.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `med-autogrant` | First-screen / role read of the 17 exact paths missing from MAG local ledger, with supporting current-boundary read of MAG specs lifecycle map, history specs index, core docs, active truth plan and ideal-state reference. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this MAG exact-path reconcile tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The reviewed MAG paths already have legitimate long-term roles as history provenance, support current-truth records or narrow active current specs.

Unreviewed docs:

- `med-autogrant`: exact-string inventory now has no uncovered `README*` / `docs/**/*.md` path in the current 117-file scope once this entry is counted. MAG remains part of the larger OPL series goal, and global closure still depends on all six repos.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `redcube-ai`, `one-person-lab-app`: full docs coverage remains open and should wait until active dirty/recent lanes are safe or explicitly handed to this governance goal.
- `opl-meta-agent` and `med-autoscience`: previous full/exact reconcile coverage remains as recorded unless later changes reopen their docs.

Remaining stale / retire candidates:

- MAG: any future prose that promotes historical foundation specs, support current-truth records, active current specs, lifecycle-map rows, OPL projection, Temporal provider completion, optional Hermes proof lane or zero open worklist into grant-domain ready, fundability ready, submission/export ready, production ready, MAG-owned generic runtime or App/workbench ownership is stale pollution.
- MAG: implementation/evidence tails remain separate from docs coverage: physical delete authorization, production long-soak, submission-ready human gate, sustained real consumption and long-soak evidence still require their own source/test/receipt closeout.
- App/RCA: release / GUI / implementation docs remain gated by unrelated dirty or active lanes.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. Existing unrelated OPL/App/RCA lanes were not attributable to this automation or were not safe to clean.
- This tranche's MAG and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- MAG exact-path reconcile worktree: exact inventory script expected `missing_by_exact_string=0`; `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- Six-repo doctor sweep should remain clean before closeout.
- No source/runtime tests are required because this tranche changes only narrative coverage ledgers.

Next tranche write scope:

- Continue OPL series whole-docs coverage outside MAG, preferably a remaining clean repo whose main checkout and worktrees are safe for this automation.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 05:18 CST`
Tranche: `opl-history-process-ledger-exact-reconcile`
State: `tranche_verified`

本轮覆盖 OPL 主仓当前 exact inventory 中唯一未逐字入账的 history/process ledger 文件，并把结果回写到本 OPL family ledger。目标是关闭 OPL 本仓 `README*` / `docs/**/*.md` exact coverage accounting tail，避免把历史 coverage ledger 文件误读成 active truth、runtime truth、当前执行队列或未审正文。本轮不关闭全局 `/goal`，也不表示 OPL series 六仓 `README*` 与 `docs/**/*.md` 已全部逐段覆盖完成。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, root `README.md`, `docs/README.md`, core five, `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, and `docs/history/process/plans/README.md`.
- Target exact path: `docs/history/process/plans/2026-05-26-opl-doc-governance-tranche-ledger.md`.
- OPL current inventory script over repo-root `README*` plus all `docs/**/*.md`, compared against this coverage ledger.
- Fresh OPL read-model probes: `opl agents conformance --family-defaults --json`, `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`, and `opl framework readiness --family-defaults --json`.

Fresh semantic result:

- Current OPL truth remains owned by the core five, `docs/active/current-state-vs-ideal-gap.md`, contracts, source, CLI/read-model output, runtime ledger, provider receipts, domain-owned manifests and real App evidence.
- `docs/history/process/plans/2026-05-26-opl-doc-governance-tranche-ledger.md` already carries `Owner`, `Purpose`, `State=history_provenance`, and a machine boundary that points current truth back to active/core docs and live machine/read-model surfaces.
- `docs/history/process/plans/README.md` already lists this file as `OPL docs governance tranche coverage ledger` and says its current owner is active gap plan, core docs and live CLI/read-model; ledger body is coverage provenance only.
- Fresh conformance read-model summary: structural conformance `passed`, `passed_count=4`, `blocked_count=0`, `production_evidence_tail_count=4`.
- Fresh evidence-worklist summary: `open_worklist_item_count=1`, `open_safe_action_payload_required_item_count=1`, `open_safe_action_payload_free_item_count=0`, `domain_dispatch_evidence_workorder_count=1`, `domain_ready_authorized=false`, `production_ready_authorized=false`; zero-open guards still say worklist status is not domain ready or production ready.
- Fresh framework-readiness summary: `hard_blocker_count=0`, `operator_actionable_attention_tail_count=1`, `operator_payload_required_attention_tail_count=1`, `operator_payload_free_attention_tail_count=0`, provider cadence/capability SLO satisfied. These live counts remain dynamic read-model truth and are not frozen into the history ledger.
- No OPL prose body required rewrite. This tranche records exact coverage only and leaves active truth unchanged.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | First-screen / role read of `docs/history/process/plans/2026-05-26-opl-doc-governance-tranche-ledger.md`, support read of process-plans history index, docs portfolio governance, core docs, active gap plan, ideal-state reference and fresh OPL read-model summaries. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The reviewed path already has a legitimate long-term role as history/provenance coverage ledger.

Unreviewed docs:

- `one-person-lab`: exact-string inventory now has no uncovered `README*` / `docs/**/*.md` path in the current 171-file scope once this entry is counted. OPL remains part of the larger OPL series goal, and global closure still depends on all six repos.
- `redcube-ai`, `one-person-lab-app`: full docs coverage remains open and should wait until active dirty/recent lanes are safe or explicitly handed to this governance goal.
- `opl-meta-agent`, `med-autoscience`, and `med-autogrant`: previous full/exact reconcile coverage remains as recorded unless later changes reopen their docs.

Remaining stale / retire candidates:

- OPL: any future prose that promotes process ledger files, old tranche checklists, historical worktree/branch names, stale read-model counters, Gateway/frontdoor/Hermes-first wording or coverage accounting into current runtime truth, active execution queue, domain ready, App release ready or production ready is stale pollution.
- OPL: live evidence-worklist currently still has one payload-required operator workorder; that is domain/app live refs follow-through, not a docs coverage gap and not a reason to close the global goal.
- App/RCA: release / GUI / implementation docs remain gated by unrelated dirty or active lanes.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. Existing unrelated OPL/App/RCA/MAS lanes were not attributable to this automation or were not safe to clean.
- This tranche's OPL worktree should be removed after fast-forward absorb.

Verification before absorb:

- OPL history-process ledger reconcile worktree: exact inventory script expected `missing_by_exact_string=0`; `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- Six-repo doctor sweep should remain clean before closeout.
- No source/runtime tests are required because this tranche changes only narrative coverage ledger accounting.

Next tranche write scope:

- Continue OPL series whole-docs coverage outside OPL/MAS/MAG/OMA, prioritizing a repo whose main checkout and worktrees are safe for this automation.
- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 04:59 CST`
Tranche: `rca-exact-history-product-index-reconcile`
State: `tranche_verified`

本轮覆盖 RCA final inventory reconcile 之后留下的 47 个 exact-path ledger gap，并把结果回写到 RCA 本地 coverage ledger 与本 OPL family ledger。目标是把 grouped coverage 与当前 RCA `README*` / `docs/**/*.md` exact inventory 对齐，避免把“路径没有逐字出现在本地 ledger”误读成未审文档。本轮不关闭全局 `/goal`，也不表示 OPL series 六仓 `README*` 与 `docs/**/*.md` 已全部逐段覆盖完成。

Fresh live truth inputs:

- RCA `AGENTS.md`, `TASTE.md`, root `README.md`, `docs/README.md`, core five, `docs/active/rca-ideal-state-gap-plan.md`, `docs/references/rca-visual-deliverable-agent-ideal-state.md`, `contracts/runtime-program/current-program.json`, `contracts/production_acceptance/rca-production-acceptance.json`, `contracts/functional_privatization_audit.json`, and `docs/docs_portfolio_consolidation.md`.
- RCA current inventory script over repo-root `README*` plus all `docs/**/*.md`, compared against existing RCA coverage-ledger exact path strings.
- First-screen / role read of the 47 exact paths missing from the RCA ledger before this tranche: `docs/active/README.md`, `docs/active/opl-private-implementation-migration-inventory.md`, `docs/decisions.md`, all 11 `docs/history/hermes/*.md` bodies, all 17 non-index `docs/history/phase-2/*.md` bodies, seven `docs/history/plans/*.md` bodies, both `docs/history/tombstones/*.md` bodies, `docs/invariants.md`, all four `docs/product/*.md` files, `docs/public/README.md`, and `docs/specs/README.md`.

Fresh semantic result:

- Current RCA truth remains `Declarative Visual Pack + OPL generated/hosted surfaces + minimal visual authority functions`: RCA owns visual truth, source readiness, communication/visual direction, review/export verdict, artifact authority, visual memory accept/reject, owner receipt, typed blocker and native helper implementation; OPL owns/generated-hosts generic runtime, queue, wakeup, attempt ledger, workbench, wrapper and refs-only projection surfaces.
- The 47 exact paths already had durable roles through first-screen `Owner` / `Purpose` / `State` / `Machine boundary`, directory index current-read rules, or prior focused tranches. No RCA prose body needed rewrite; the local gap was exact-path accounting.
- RCA active/core/product/public/spec paths remain active support, active inventory or current policy/index surfaces. History/Hermes/Phase 2/plans/tombstones remain provenance/tombstone surfaces and cannot authorize current visual ready, exportable, handoffable, domain ready, production ready, generic runtime owner or OPL-owned RCA visual truth.
- The RCA local exact inventory now has no uncovered repo-root `README*` / `docs/**/*.md` path in the current 91-file scope once this entry is counted.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `redcube-ai` | First-screen / role read of the 47 exact paths listed above, with supporting current-boundary read of RCA core docs, active truth plan, ideal-state reference and machine contracts. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this RCA exact-path reconcile tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The reviewed RCA paths already have legitimate long-term roles as active support, active inventory, current policy, product/public/spec index, history provenance or tombstone.

Unreviewed docs:

- `redcube-ai`: exact-string inventory now has no uncovered `README*` / `docs/**/*.md` path in the current 91-file scope once this entry is counted. RCA remains part of the larger OPL series goal, and global closure still depends on all six repos.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.
- `opl-meta-agent`, `med-autoscience`, and `med-autogrant`: previous full/exact reconcile coverage remains as recorded unless later changes reopen their docs.

Remaining stale / retire candidates:

- RCA: docs coverage is now exact-path reconciled; implementation/evidence/source-purity tails remain separate from docs coverage: production evidence scaleout, generated/default-caller thinning, naming/contract hygiene, compatibility-free retirement, and future source/contract/test drift.
- RCA: any future prose that promotes historical Hermes / Phase 2 / managed / gateway / runtime / session / domain_action_adapter wording, product support guides, public/spec indexes, structural conformance, provider completion, OPL projection or zero open worklist into visual ready, exportable, handoffable, domain ready, production ready, generic runtime owner or OPL-owned RCA visual truth is stale pollution.
- App: release / GUI / implementation docs remain gated by unrelated dirty or active lanes.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. RCA external CI lane and unrelated OPL/App lanes were not attributable to this automation or were not safe to clean.
- This tranche's RCA and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- RCA exact-path reconcile worktree: exact inventory script expected `missing_by_exact_string=0`; `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- Six-repo doctor sweep should remain clean before closeout.
- No source/runtime tests are required because this tranche changes only narrative coverage ledgers.

Next tranche write scope:

- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- If App remains unsafe, continue with any newly reopened exact inventory tail in OPL/MAS/MAG/RCA/OMA caused by later edits.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 05:02 CST`
Tranche: `oma-repo-local-doc-ledger-bootstrap`
State: `tranche_verified`

本轮为 `opl-meta-agent` 新增 repo-local docs governance ledger，并把结果回写到本 OPL family ledger。目标是把此前记录在 OPL family ledger 的 OMA full README/docs coverage 回写成 OMA 本仓可审计入口，使本仓 `README*` / `docs/**/*.md` exact inventory 能自证。本轮不改 OMA active truth，不新增 readiness claim，不关闭 OPL series 全局 `/goal`。

Fresh live truth inputs:

- OMA `AGENTS.md`, `TASTE.md`, root `README.md`, `README.zh-CN.md`, `docs/README.md`, core five, `docs/active/opl-meta-agent-ideal-state-gap-plan.md`, `docs/active/opl-private-implementation-migration-inventory.md`, and `docs/references/opl-meta-agent-ideal-state.md`.
- OMA machine refs: `contracts/functional_privatization_audit.json`, `contracts/default_caller_deletion_evidence.json`, `contracts/production_acceptance/meta-agent-production-acceptance.json`, `contracts/production_acceptance/oma-production-consumption-long-soak-typed-blocker.json`, `runtime/authority_functions/meta-agent-authority-functions.json`, `package.json`, `tests/contracts.test.ts`, and `tests/source-purity.test.ts`.
- OPL family ledger prior OMA coverage: `oma-readme-docs-full-coverage` and `oma-ai-first-baseline-delta-coverage`.
- Current OMA exact inventory over repo-root `README*` plus `docs/**/*.md` and support read of `agent/{knowledge,prompts,quality_gates,skills,stages}/README.md`.

Fresh semantic result:

- OMA already has one active truth owner, one ideal-state reference, one private implementation inventory and one docs entry index. The missing piece was repo-local governance ledger / exact-coverage accounting, not stale current-truth prose.
- Live contracts still read `functional_structure_gap_count=0`, `domain_repo_retained_generic_surface_count=0`, and `remaining_tail_kinds=[opl_generated_default_caller_consumption_tail, domain_refs_only_adapter_thinning, script_to_pack_hygiene, evidence_tail]`. This remains structural/source-shape evidence only; it does not authorize target domain ready, quality verdict, App live rendering, production ready, owner receipt body, artifact readiness or default promotion.
- Production-consumption long-soak remains blocked by `typed_blocker_ref://opl-meta-agent/production-consumption/long-soak-pending`; contract presence and OPL refs-only consumption are not App live closeout or production ready.
- Agent pack README files are support indexes only; machine-required pack files remain non-README markdown files listed by `contracts/pack_compiler_input.json` and verified by tests.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `opl-meta-agent` | First-screen / role read of all current repo-root `README*`, `docs/**/*.md`, agent pack README support files, active truth plan, ideal-state reference, private inventory and live contracts/tests listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this OMA repo-local ledger bootstrap; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The reviewed OMA paths already have legitimate long-term roles as public entry, docs index, current truth, active plan, active inventory, target-state reference or domain-pack support index.

Unreviewed docs:

- `opl-meta-agent`: none for current repo-root `README*` and `docs/**/*.md` inventory once this repo-local ledger is counted. Future README/docs files, or substantive edits after this tranche, must be covered by a new ledger entry.
- `one-person-lab`: no new OPL body docs were governed in this tranche; previous exact coverage claims remain as recorded.
- `one-person-lab-app`: full App docs coverage remains open and should wait until active release / GUI lanes are safe or explicitly assigned.
- OPL, MAS, MAG and RCA previous full/exact reconcile coverage remains as recorded unless later changes reopen their docs.

Remaining stale / retire candidates:

- OMA: remaining work is evidence/hygiene, not doc-path retirement: repeat long-soak / App live render-runtime drilldown evidence, more real target patch-loop owner receipt or typed blocker samples, standard target-agent handoff convergence, and continued script-to-pack / OPL primitive hygiene.
- OMA: any future prose that treats generated-surface proof, registry readiness, App projection readiness, suite pass, schema completeness, OPL refs-only consumption, work-order shape, script materializer presence or source-shape conformance as target domain ready, quality verdict, App live rendering, owner receipt, artifact readiness, production ready or default promotion is stale pollution.
- App: release / GUI / implementation docs remain gated by unrelated dirty or active lanes.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. App remains dirty; OPL external OMA-support and DM002 scheduler worktrees are unrelated and were not safe to clean.
- This tranche's OMA and OPL ledger worktrees should be removed after fast-forward absorb.

Verification before absorb:

- OMA repo-local ledger worktree: exact inventory expected `missing_by_exact_string=0`; `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- Six-repo doctor sweep should remain clean before closeout.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- Start App docs only when release / GUI dirty lanes are safe or explicitly handed to this governance goal.
- If App remains unsafe, continue only with newly reopened exact-inventory tails in OPL/MAS/MAG/RCA/OMA caused by later edits.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 05:19 CST`
Tranche: `app-repo-local-doc-ledger-bootstrap`
State: `tranche_verified`

本轮为 `one-person-lab-app` 新增 repo-local docs governance ledger，并把结果回写到本 OPL family ledger。目标是让 App 仓有本地 coverage accounting 入口，记录当前 App 文档 owner/purpose/state/machine-boundary 读法和未覆盖正文范围。本轮不改 App active truth，不接管 App main checkout 里的 dirty release/testing 文件，不新增 release-ready / production-ready claim，不关闭 OPL series 全局 `/goal`。

Fresh live truth inputs:

- App `AGENTS.md`, `TASTE.md`, root `README.md`, `README.zh-CN.md`, `docs/README.md`, `docs/active/app-ideal-state-gap-plan.md`, `docs/status.md`, `docs/project.md`, `docs/architecture.md`, and `docs/invariants.md`.
- App machine refs: `contracts/app-product-profile.json`, `contracts/app-shell-adapter.json`, `contracts/app-first-run-test-matrix.json`, `contracts/app-page-state-matrix.json`, and `package.json`.
- Current App exact inventory over repo-root `README*` plus `docs/**/*.md`, plus support read of `scripts/README.md`.
- Main checkout safety read: App main remains dirty in release/testing files, so this tranche used an isolated worktree and only added a new ledger file.

Fresh semantic result:

- App already has one active truth owner (`docs/active/app-ideal-state-gap-plan.md`), one docs entry, durable current product-boundary docs, and App-owned contracts for product profile, active shell, first-run and page-state behavior.
- The missing piece was App repo-local governance ledger / exact-coverage accounting. Because the App main checkout has unrelated dirty release/testing files, this tranche intentionally does not rewrite existing App prose bodies.
- Current contracts confirm the App boundary: the App owns product defaults, release assets, updater metadata, first-run UX checks, GUI page-state tests and user documentation; it consumes framework contracts, OPL CLI JSON outputs, runtime snapshots, provider receipts and domain-owned projections; it does not own runtime truth, provider implementation, domain truth, domain quality verdict or domain artifact authority.
- Active shell remains `aionui` under `shells/aionui`, sourced from `gaofeng21cn/opl-aion-shell` with `history_policy=external_checkout_not_merged_into_app_default_branch`.
- First-run and page-state contracts keep release evidence and runtime-page behavior contract-backed but not domain-ready or production-ready proof.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab-app` | First-screen / role read of App `README*`, current docs index, active plan, core product-boundary docs, release/testing/user-guide/screenshot/history indexes, support `scripts/README.md`, and App contracts listed above. | `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this App repo-local ledger bootstrap; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The reviewed App paths currently have legitimate long-term roles as public entry, docs index, active plan, current product truth, release/testing/user support, screenshot guide, history provenance, or script support.

Unreviewed docs:

- `one-person-lab-app`: existing App docs were first-screen / role-read in this tranche, but full paragraph-level semantic governance remains open because release / GUI lanes were dirty and outside this tranche's ownership. Future App tranche should cover the body text of `README*`, `docs/status.md`, `docs/release/README.md`, `docs/testing/README.md`, `docs/user-guides/**`, `docs/screenshots/**`, `docs/history/**`, and `scripts/README.md` once the dirty release/testing lane is safe or explicitly assigned.
- OPL/MAS/MAG/RCA/OMA previous full/exact reconcile coverage remains as recorded unless later changes reopen their docs.

Remaining stale / retire candidates:

- App: any prose that treats App UI rendering, active shell validation, updater metadata, release artifact existence, provider completion, OPL read-model availability, release collector output, or first-run contract presence as MAS/MAG/RCA/OMA domain ready, quality verdict, artifact authority, owner receipt authority, App release ready without evidence, or family production ready is stale pollution.
- App: any future prose that moves active shell implementation truth, shell history, OPL runtime/provider ownership, domain truth, release evidence bodies, owner receipt bodies, memory bodies, artifact bodies, or domain action authority into this repo reopens the active plan.
- App: dirty release/testing lanes remain the gating factor for body-level docs governance in this repo.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL `dm002-scheduler-workflow-not-found` and MAS `dm002-opl-live-projection` had recent writes; App main was dirty; App release/GUI worktrees were not safe to absorb into dirty main; RCA CI lane and unrelated OPL/MAS/App lanes were not attributable to this automation.
- This tranche's App and OPL ledger worktrees should be removed after fast-forward absorb.

Verification before absorb:

- App repo-local ledger worktree: exact inventory should include `docs/docs_portfolio_consolidation.md`; `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- Six-repo doctor sweep should remain clean before closeout.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledgers.

Next tranche write scope:

- When the dirty App release/testing lane is safe or explicitly assigned, perform paragraph-level governance of App `README*`, `docs/status.md`, `docs/release/README.md`, `docs/testing/README.md`, `docs/user-guides/**`, `docs/screenshots/**`, `docs/history/**`, and `scripts/README.md` against App contracts, release/evidence scripts, shell validation and real release artifacts.
- Until then, continue only newly reopened exact-inventory tails in OPL/MAS/MAG/RCA/OMA or App ledger/accounting items that do not touch externally dirty files.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 05:30 CST`
Tranche: `opl-harness-shared-readme-governance`
State: `tranche_verified`

本轮覆盖 OPL nested package README：`python/opl-harness-shared/README.md`。此前 OPL exact coverage ledger 的机器对账范围是仓根 `README*` 加 `docs/**/*.md`，因此不会把这个 Python subpackage README 计入 exact closure；但它仍是 repo-tracked human README，按文档生命周期规则需要有 owner / purpose / state / machine boundary。目标是补齐该 README 的四信号和当前导出模块清单，避免它成为未标注的人读入口或第二真相源。本轮不改 contracts/source/tests，不关闭 OPL series 全局 `/goal`。

Fresh live truth inputs:

- OPL `AGENTS.md`, `TASTE.md`, `docs/docs_portfolio_consolidation.md`, this OPL family ledger, `python/opl-harness-shared/README.md`, `python/opl-harness-shared/pyproject.toml`, `python/opl-harness-shared/src/opl_harness_shared/__init__.py`, package source tree, package tests, `contracts/family-release/shared-owner-release.json`, `src/family-shared-release.ts`, and `tests/src/verification-command-surfaces.test.ts`.
- Repository status/worktree safety read: OPL main was clean; unrelated OPL worktrees remained external or recent, so this tranche used a new isolated worktree and did not absorb unrelated lanes.

Fresh semantic result:

- `python/opl-harness-shared/README.md` is the package-local human index for the OPL-owned family-level Python shared substrate. It is not a current active plan, runtime truth, domain truth, domain-specific authority, release SHA authority, or shared-release consumer ledger.
- Machine truth remains in `pyproject.toml`, `src/opl_harness_shared/`, bundled contracts, root `contracts/`, package tests and family shared-release contracts.
- The previous README had the correct high-level boundary, but lacked explicit lifecycle four-signal metadata and its export list had fallen behind current package modules. The rewrite adds owner/purpose/state/machine-boundary and updates the export list to match current source-level public helpers.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `one-person-lab` | Full read of `python/opl-harness-shared/README.md`; support read of OPL docs governance, family ledger, package metadata/source/tests and shared-release contracts listed above. | `python/opl-harness-shared/README.md`; `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. The reviewed README has a legitimate long-term role as active package support.

Unreviewed docs:

- OPL scoped exact inventory over repo-root `README*` plus `docs/**/*.md` remains previously reconciled. This tranche additionally covers the nested Python package README but does not expand the established exact-accounting scope to every nested package/support README in all repos.
- App full paragraph-level semantic governance remains open while dirty release/testing lanes are outside this goal's ownership.

Remaining stale / retire candidates:

- Future OPL nested package/support README files should either carry owner/purpose/state/machine-boundary or be recorded as support README context in the relevant repo-local or family ledger.
- Any future `opl-harness-shared` prose that treats this package README as runtime truth, domain truth, consumer pin truth, release SHA authority, domain readiness, production readiness, or replacement for root contracts/tests is stale pollution.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL `codex/opl-owner-payload-ledger-intake` had recent writes, OPL other external lanes were dirty or out of scope, MAS `dm002-opl-live-projection` had recent writes, App main remained dirty, and App release/GUI worktrees remained dirty/external.
- This tranche's OPL worktree should be removed after fast-forward absorb.

Verification before absorb:

- `git diff --check`; strict README/docs/contracts conflict-marker scan; focused package README/source export sanity read; OPL Doc Governance doctor active truth pass / no findings; final OPL scoped exact inventory remains `missing_by_exact_string=0`.
- No source/runtime tests are required because this tranche changes only narrative docs and coverage ledger accounting.

Next tranche write scope:

- If App remains dirty, continue only with newly reopened OPL/MAS/MAG/RCA/OMA/App ledger or support README accounting items that do not touch externally dirty files.
- When the dirty App release/testing lane is safe or explicitly assigned, perform App paragraph-level body governance as recorded in the App repo-local ledger.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.

Date: `2026-05-27 05:48 CST`
Tranche: `oma-agent-pack-readme-lifecycle`
State: `tranche_verified`

本轮覆盖 OMA tracked support READMEs：`agent/knowledge/README.md`、`agent/prompts/README.md`、`agent/quality_gates/README.md`、`agent/skills/README.md` 和 `agent/stages/README.md`。这些文件在 OMA exact README/docs scope 外，但已由 OMA repo-local ledger 标记为 domain pack 支撑索引；本轮补齐每个长期文档的 owner / purpose / state / machine boundary，并把 coverage foldback 写回 OMA 本地 ledger 和本 OPL family ledger。目标是维护 support README 生命周期，不改 active truth、不新增 readiness claim、不关闭 OPL series 全局 `/goal`。

Fresh live truth inputs:

- OMA `AGENTS.md`, `TASTE.md`, `docs/README.md`, `docs/status.md`, `docs/architecture.md`, `docs/docs_portfolio_consolidation.md`, and `docs/active/opl-meta-agent-ideal-state-gap-plan.md`.
- Agent pack support READMEs: `agent/knowledge/README.md`, `agent/prompts/README.md`, `agent/quality_gates/README.md`, `agent/skills/README.md`, and `agent/stages/README.md`.
- Machine refs: `contracts/pack_compiler_input.json`, `contracts/stage_control_plane.json`, `tests/contracts.test.ts`, and current tracked `agent/**/*.md` files.

Fresh semantic result:

- The five support README file lists already matched tracked non-README pack files under their directories.
- `contracts/pack_compiler_input.json` `required_domain_pack_paths` matched every tracked non-README `agent/**/*.md` file and excluded all README files.
- The rewrite therefore only adds lifecycle metadata and preserves the support-index role. Machine truth remains in contracts, non-README pack files and tests.

Reviewed documents / sections:

| Repo | Reviewed docs / sections | Edited docs this tranche |
| --- | --- | --- |
| `opl-meta-agent` | `agent/knowledge/README.md`, `agent/prompts/README.md`, `agent/quality_gates/README.md`, `agent/skills/README.md`, `agent/stages/README.md`, plus machine refs listed above. | Five agent pack README files; `docs/docs_portfolio_consolidation.md` |
| `one-person-lab` | OPL family coverage ledger foldback for this OMA support README lifecycle tranche; no OPL active truth / source / contract semantics changed. | `docs/active/development-document-portfolio.md` |

Archived / tombstoned / deleted docs:

- none. These README files remain legitimate support indexes for domain pack maintainers.

Unreviewed docs:

- `opl-meta-agent`: none for current repo-root `README*`, `docs/**/*.md`, or tracked `agent/*/README.md` support indexes once this tranche is counted.
- Agent pack non-README semantic files were used as machine truth refs for file-list and boundary checks; they remain pack body files, not separate docs-governance targets in this tranche.
- App full paragraph-level semantic governance remains open while dirty release/testing lanes are outside this goal's ownership.

Remaining stale / retire candidates:

- OMA doc-path retirement remains empty for the currently reviewed root README/docs and agent-pack README surface.
- OMA evidence/hygiene tails remain: App live render/runtime drilldown evidence, repeat long-soak, real target patch-loop owner receipts or typed blockers, standard target-agent handoff convergence, and script-to-pack / OPL primitive hygiene.
- Future OMA prose that treats README support indexes, generated-surface proof, registry readiness, App projection readiness, suite pass, schema completeness, OPL refs-only consumption, work-order shape, script materializer presence or source-shape conformance as target domain ready, quality verdict, App live rendering, owner receipt, artifact readiness, production ready or default promotion is stale pollution.

Worktree / branch cleanup:

- No external stale worktree/branch qualified for cleanup before this tranche. OPL/MAS/App active lanes remained dirty, recent, unrelated, or externally owned; RCA CI lane remained an external branch and was not safe to absorb or delete.
- This tranche's OMA and OPL worktrees should be removed after fast-forward absorb.

Verification before absorb:

- OMA support README worktree: per-directory README file-list sanity `missing=0` and `extra=0`; `contracts/pack_compiler_input.json` required paths matched tracked non-README `agent/**/*.md`; all edited support README / ledger files had owner/purpose/state/machine-boundary; `git diff --check`; strict README/docs/agent conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- OPL ledger worktree: `git diff --check`; strict README/docs/contracts conflict-marker scan; OPL Doc Governance doctor active truth pass / no findings.
- Six-repo doctor sweep should remain clean before closeout.
- No source/runtime tests are required because this tranche changes only narrative support READMEs and coverage ledgers.

Next tranche write scope:

- If App remains dirty, continue only with newly reopened OPL/MAS/MAG/RCA/OMA/App ledger or support README accounting items that do not touch externally dirty files.
- When the dirty App release/testing lane is safe or explicitly assigned, perform App paragraph-level body governance as recorded in the App repo-local ledger.
- Keep the global `/goal` active until all six repos' `README*` and `docs/**/*.md` ledgers have no uncovered docs and remaining gaps are either closed or carried into the next-round Agent prompt.
