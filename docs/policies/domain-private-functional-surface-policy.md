# Domain 私有功能面准入政策

Owner: `One Person Lab`
Purpose: `domain_private_functional_surface_policy`
State: `active_policy`
Machine boundary: 本文是人读治理规则。机器口径以 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`OPL Pack buildStandardDomainAgentScaffold`、`functional_privatization_audit` 和 repo-native tests 为准。

## 结论

OPL-compatible Foundry Agent 的默认形态是 `Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`。MAS、MAG、RCA 现有代码证明，历史上 domain repo 很容易把 scheduler、SQLite lifecycle、session store、sidecar、status、workbench、review/repair、artifact lifecycle 和 observability 都做成私有实现；这些不能作为新 Agent 模板。

新 Agent 默认不得实现私有 runtime / platform 功能。`functional_privatization_audit` 审计的是所有容易被误读为“功能面”的 domain 代码路径，但机器口径先把它拆成三层：标准 domain pack、minimal authority function、私有 platform residue。只有第三层才是真正需要上收、生成、收薄或退役的私有功能面。

标准机器入口只接受 canonical `functional_privatization_audit`。MAS/MAG/RCA 历史 repo-local 形状，例如 `functional_consumer_boundary`、`privatized_functional_module_audit`、`mag_consumer_thinning_contract.privatized_functional_module_audit` 和 `runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit`，已停止解析；它们不得作为新 Agent 模板、accepted source、scaffold 输入或长期 ABI 组成。

本政策按理想态优先执行。当前 MAS/MAG/RCA 已存在的私有实现不自动获得长期豁免；它们只是迁移清单。为了清洁的标准 OPL Agent 形态，四个 repo 都可以重构，旧 caller 可以迁移，旧模块可以删除。例外必须是小而明确的接口，不是整块私有平台。

`allowed_private_surface_classes` 不是鼓励保留私有平台实现，而是第三层 residue 的处置表。长期允许的 authority function 也必须尽量先尝试声明化；只有无法用 policy/table/schema/fixture/receipt contract 表达的领域裁决，才保留函数，并且必须通过 OPL 标准 ABI 返回 verdict、owner receipt、typed blocker 或 safe action refs。`refs_only_domain_adapter` 只能返回 locator、opaque refs、owner receipts、typed blockers 或 no-regression refs；它不是私有运行时、私有工作台或私有 transport。

Authority function 不能成为复杂知识交付流程的隐藏容器。凡是需要阅读材料、形成审稿意见、判断科学/基金/视觉质量、提出修订建议、决定是否进入下一阶段的工作，都必须先建模为 domain-owned stage 或 review stage；函数只能在 stage 边界签发最小 verdict / receipt / blocker / safe action refs。MAS 的 AI reviewer、publication quality review、MAG 的 fundability review、RCA 的 visual review 都属于 stage 级工作，不应被塞进其他 stage 的 helper 或后处理里。

AI-first quality gate 也不能由执行 attempt 自己闭环。标准 OPL Agent 必须把执行任务和审核任务分成独立 agent task / stage attempt：执行任务产出 artifact refs、source refs、closeout packet 和 owner receipt；审核任务在新上下文中读取这些显式输入，签发 gate receipt、typed blocker 或 route-back。缺少独立审核 receipt、审核证据 stale、或审核与执行来自同一 attempt 时，不能把结果归入 `authority_function_inventory` 的已通过 gate。

默认审计视图只显示 `attention_required`。标准 pack 和 minimal authority function 进入完整追溯清单，但不算私有平台污染；已经证明是 OPL hosted/generated surface、声明式 pack、authority function、refs-only adapter、无默认 caller 的 diagnostic cleanup path 或 provenance/fixture 的项目，默认折叠。只有 blocker、仍需 replacement / migration / tombstone 的项目、仍 active 的 diagnostic cleanup path，或 tombstone 仍有 active caller 的项目，才进入默认 watchlist。

审计还要区分语义等价。`default_watchlist=0` 只说明没有结构性 blocker 或长期 generic owner claim；若 `semantic_equivalence_review_count>0`，说明 active caller 仍需要证明已消费 OPL primitive、OPL generated/hosted surface，或已退成 no-active-caller cleanup/provenance。语义等价未清零前，不能写成“所有功能都已经物理依赖 OPL 实现”。

## 保留、迁移与删除边界

当前严格边界按职责判断，不按目录是否 local 判断：

- 长期保留：`agent/` domain pack、machine-readable contracts、minimal authority function、domain handler target、domain-specific implementation、必要 native helper，以及只输出 owner receipt / typed blocker / no-forbidden-write / opaque refs 的领域权威函数。
- 迁移输入：repo-local default caller、CLI/MCP/Skill/product/status/session/workbench wrapper、sidecar shell、session / queue / attempt / lifecycle / observability shell、script materializer、diagnostic cleanup path、compat facade、re-export wrapper、compatibility-only test。
- 删除尾项：迁移输入在 OPL generated/hosted parity、active caller cutover、domain owner receipt 或 stable typed blocker、no-forbidden-write proof、tombstone/provenance ref 和 no-active-caller proof 成立后，必须删除 active source，或降为上面的长期保留形态。

`refs_only_domain_adapter` 的允许边界很窄：它可以是 domain handler 的返回形态或合同/receipt 投影，不能是一个继续承载默认 caller、workbench、transport、scheduler、session、lifecycle 或 generated surface ownership 的 repo-local shell。`tombstone/provenance` 只能留在 `docs/history/**`、提交历史、外部 receipt 或 deterministic fixture；active code path 里的 tombstone/provenance wrapper 仍按迁移输入处理。

因此，功能不降级的做法不是保留旧 wrapper，而是先让 OPL generated/hosted surface 调到同一个 domain handler / authority output；domain repo 保留真实领域能力和 owner refs，删除通用外围。若删除会丢失 direct path 功能，说明 active caller cutover 或 parity 还没完成，不能把该 wrapper 写成长期标准组成。

`source_shape=landed`、`source_purity_cutover_status=standard_agent_source_shape_landed` 或 `functional_structure_gap_count=0` 只说明标准源码形态和 owner 分类已经闭合；它们不自动授权 domain repo 物理删除，也不关闭 production/live evidence、owner-chain、memory/artifact/lifecycle receipt 或 long-soak gate。

## 成熟系统参考

外部成熟系统给出的共同模式是平台持有通用运行基座，应用只提交 spec、policy、handler 或 authority output：

- Kubernetes：controller 观察当前状态并把对象推进到期望状态；领域逻辑通过 spec/status 和 controller 边界表达。
- Temporal：durable workflow、activity retry、signal/query、history 和长时状态在 runtime 层；业务 activity 返回可恢复结果。
- Airflow：DAG / task 描述工作流，scheduler/executor 是平台能力。
- Dapr：sidecar / building blocks 承担 state、pub/sub、workflow、jobs 等通用外围，应用代码保留业务 handler。
- LangGraph / Agents SDK：checkpoint、thread/store、tools、handoffs、tracing 是运行基座，领域 agent 提供 graph、tools 和 policy。

OPL 的对应设计是：OPL 持有 stage attempt、queue、attempt ledger、memory/artifact locator、generated surface、workbench 和 observability；domain repo 保留领域真相、判断、回执与非权威 route context，Codex CLI 独占语义 route。

## 三层审计 taxonomy

`functional_privatization_audit` 的核心目标不是把 stage 定义、domain policy 或 quality verdict 都标成私有功能，而是给所有“看起来像功能代码”的路径一个可审计归位：

| 层级 | 是否私有功能面 | 长期 owner | OPL 管理方式 | 例子 |
| --- | --- | --- | --- | --- |
| `standard_domain_pack_inventory` | 否 | domain agent | schema validation、pack compilation、generated / hosted runtime | stage 定义、transition table、action metadata、policy、rubric、knowledge、fixture、receipt schema |
| `authority_function_inventory` | 否 | domain agent | 标准 ABI、call envelope、receipt projection、no-forbidden-write guard | publication quality verdict、grant fundability/export verdict、visual review/export verdict、artifact mutation authorization、memory accept/reject、owner receipt signer |
| `private_platform_residue_inventory` | 是 | OPL replacement 或 retirement gate | OPL generated/hosted surface、refs-only 收薄、diagnostic cleanup 或 tombstone | scheduler、queue/attempt ledger、session store、SQLite lifecycle engine、workbench/status shell、memory/artifact transport、native helper envelope、observability/SLO runtime |

因此，标准 OPL 智能体不是“没有代码”，而是代码只能落在标准 domain pack 或标准 authority ABI 里。凡是实现了通用运行平台、状态机、持久化、调度、展示、transport、lifecycle 或 observability 的模块，都必须进入 `private_platform_residue_inventory`，不能用“历史上已经写在 domain 仓里”作为长期保留理由。

标准 domain pack 中的 stage / review 定义应优先表达复杂知识工作；标准 authority ABI 只表达边界裁决。用函数承载完整 AI 审稿、质量审核、revision planning 或 deliverable review，会同时破坏 stage 可观察性和 AI-first gate 的独立性，应按建模错误处理，而不是按允许的 `minimal_authority_function` 处理。

Authority function 的标准 ABI 固定为：

- 输入：`stage_attempt_ref`、`source_refs`、`artifact_refs`、`memory_refs`、`policy_refs`、`prior_receipt_refs`。
- 输出：`verdict`、`owner_receipt`、`typed_blocker`、`safe_action_refs`、`no_forbidden_write_evidence_ref`。
- 禁止输出：`generic_runtime_state`、`queue_or_attempt_ledger_mutation`、`session_store_mutation`、`scheduler_installation`、`OPL_lifecycle_store_write`。

## 允许的私有功能面

| 类别 | 长期允许 | 接口形态 | 必要性 |
| --- | --- | --- | --- |
| `minimal_authority_function` | 是，但属于 `authority_function_inventory` 而非私有 platform residue | `runtime/authority_functions/<function>` + receipt schema + OPL 标准 ABI | 领域裁决无法可靠声明化，例如 publication quality、fundability/export verdict、visual review/export verdict、artifact mutation authorization、memory accept/reject、source readiness、owner receipt signing 或 domain-native helper implementation。 |
| `refs_only_domain_adapter` | 仅限 domain handler / contract output，不允许作为长期 repo-local shell | contract / projection 只返回 opaque refs、owner receipt、typed blocker、no-regression refs | OPL generic shell 需要 locator 或 receipt refs，但 memory body、artifact body、quality/export verdict 仍归 domain；若它还拥有 default caller、transport、workbench、lifecycle 或 generated surface，则必须迁移或删除。 |
| `temporary_migration_bridge` | 否 | `generated_surface_handoff` + active caller inventory + replacement target | OPL generated/replacement surface 正在同一 program 内替换旧手写 shell；必须有迁移动作和退役门。 |
| `diagnostic_cleanup_path` | 否 | 显式 opt-in status/remove/inspect；不得 install、trigger、schedule 或成为 default caller | 仅用于检查、证明或移除旧 runtime 状态，例如 MAS legacy local LaunchAgent cleanup；repo-local `legacy_cleanup_physical_retired` 也归一化到这一类，并在无 active caller 时默认折叠。 |
| `provenance_or_fixture` | 是，但只能在非 active wrapper 形态保留 | history/tombstone ref 或 deterministic fixture | 只用于回归、parity 或 source provenance；不得声明 runtime owner，不能保留 active tombstone wrapper。 |

## 禁止的私有功能面

Domain repo 不得长期拥有这些能力：

- generic scheduler / daemon；
- generic queue / attempt ledger / retry / dead-letter；
- generic state-machine runner / transition matrix runner；
- generic persistence engine 或 SQLite lifecycle engine；
- generic CLI / MCP / product-entry wrapper；
- generic sidecar / status / workbench shell；
- generic session store；
- generic workspace/source intake shell；
- generic memory transport；
- generic artifact/package lifecycle shell；
- generic review/repair transport；
- generic native helper execution envelope；
- generic observability / SLO runtime。

如果代码里仍存在这些能力，默认解释为 `opl_owned_replacement` 或 `temporary_migration_bridge`，不能写成 domain 必要功能。

## 必填证据

每个保留在 domain repo 的私有功能面都必须写清：

- `module_id`
- `code_paths`
- `active_callers`
- `active_caller_status`
- `migration_class`
- `cannot_absorb_reason` 或 `retirement_gate`
- `receipt_schema_ref` 或 `fixture_ref`
- `no_forbidden_write_evidence`
- `direct_and_opl_hosted_parity`，或明确是非默认 diagnostic cleanup path

缺少这些字段时，OPL 读模型应把它作为 blocker 或 migration gap，而不是默认接受为合理私有实现。

## 新 Agent 开发规则

1. 先写 `contracts/pack_compiler_input.json`，声明 stage、transition、action、memory policy、artifact policy、receipt schema 和 authority functions。
2. CLI/MCP/product-entry/sidecar/status/workbench/harness 由 OPL pack compiler 生成或托管。
3. 只有无法声明化的 domain judgment 才进入 `runtime/authority_functions/`。
4. 任何私有 adapter 都只能返回 refs、receipt、typed blocker 或 no-regression evidence，不返回 memory body、artifact body 或 ready verdict。
5. diagnostic cleanup path 必须显式 opt-in，默认路径不能调用。
6. 替换完成后旧 shell 必须删除或迁入 history/tombstone，不保留兼容 alias。

## 现有 Agent 重构规则

1. 现有私有实现按目标态重新分类，不按历史 ownership 分类。
2. 若模块承担通用 transport、ledger、index、lifecycle、scheduler、runner、session、workbench、observability、sidecar/status wrapper 或 generated entry surface，默认迁向 OPL primitive / pack compiler。
3. 若模块承担领域 truth、quality/export verdict、memory accept/reject、artifact mutation authorization、source readiness verdict、owner receipt signing 或 domain-native helper mutation，先尝试声明化；无法声明化时才保留为 `minimal_authority_function`。
4. 若模块只是 OPL 未成熟前的 hand-written shell，必须写 `replacement_surface_ref`、active caller 迁移计划和删除门。
5. 若当前没有优雅替代方案，先开 OPL-level design / external research lane；调研结果必须进入 OPL generic primitive 或 generated surface，不允许把临时私有实现固化成 domain 平台。
