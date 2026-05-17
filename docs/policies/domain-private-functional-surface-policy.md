# Domain 私有功能面准入政策

Owner: `One Person Lab`
Purpose: `domain_private_functional_surface_policy`
State: `active_policy`
Machine boundary: 本文是人读治理规则。机器口径以 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`opl agents scaffold`、`functional_privatization_audit` 和 repo-native tests 为准。

## 结论

OPL-compatible Foundry Agent 的默认形态是 `Declarative Domain Pack + OPL generated/hosted surfaces + standard authority functions`。MAS、MAG、RCA 现有代码证明，历史上 domain repo 很容易把 scheduler、SQLite lifecycle、session store、sidecar、status、workbench、review/repair、artifact lifecycle 和 observability 都做成私有实现；这些不能作为新 Agent 模板。

新 Agent 默认不得实现私有 runtime / platform 功能。`functional_privatization_audit` 审计的是所有容易被误读为“功能面”的 domain 代码路径，但机器口径先把它拆成三层：标准 domain pack、标准 authority function、私有 platform residue。只有第三层才是真正需要上收、生成、收薄或退役的私有功能面。

本政策按理想态优先执行。当前 MAS/MAG/RCA 已存在的私有实现不自动获得长期豁免；它们只是迁移清单。为了清洁的标准 OPL Agent 形态，四个 repo 都可以重构，旧 caller 可以迁移，旧模块可以删除。例外必须是小而明确的接口，不是整块私有平台。

`allowed_private_surface_classes` 不是鼓励保留私有平台实现，而是第三层 residue 的处置表。长期允许的 authority function 也必须尽量先尝试声明化；只有无法用 policy/table/schema/fixture/receipt contract 表达的领域裁决，才保留函数，并且必须通过 OPL 标准 ABI 返回 verdict、owner receipt、typed blocker 或 safe action refs。`refs_only_domain_adapter` 只能返回 locator、opaque refs、owner receipts、typed blockers 或 no-regression refs；它不是私有运行时、私有工作台或私有 transport。

默认审计视图只显示 `attention_required`。标准 pack 和标准 authority function 进入完整追溯清单，但不算私有平台污染；已经证明是 OPL hosted/generated surface、声明式 pack、authority function、refs-only adapter、无默认 caller 的 diagnostic cleanup path 或 provenance/fixture 的项目，默认折叠。只有 blocker、仍需 replacement / migration / tombstone 的项目、仍 active 的 diagnostic cleanup path，或 tombstone 仍有 active caller 的项目，才进入默认 watchlist。

审计还要区分语义等价。`default_watchlist=0` 只说明没有结构性 blocker 或长期 generic owner claim；若 `semantic_equivalence_review_count>0`，说明 active caller 仍需要证明已消费 OPL primitive、OPL generated/hosted surface，或已退成 no-active-caller cleanup/provenance。语义等价未清零前，不能写成“所有功能都已经物理依赖 OPL 实现”。

## 成熟系统参考

外部成熟系统给出的共同模式是平台持有通用运行基座，应用只提交 spec、policy、handler 或 authority output：

- Kubernetes：controller 观察当前状态并把对象推进到期望状态；领域逻辑通过 spec/status 和 controller 边界表达。
- Temporal：durable workflow、activity retry、signal/query、history 和长时状态在 runtime 层；业务 activity 返回可恢复结果。
- Airflow：DAG / task 描述工作流，scheduler/executor 是平台能力。
- Dapr：sidecar / building blocks 承担 state、pub/sub、workflow、jobs 等通用外围，应用代码保留业务 handler。
- LangGraph / Agents SDK：checkpoint、thread/store、tools、handoffs、tracing 是运行基座，领域 agent 提供 graph、tools 和 policy。

OPL 的对应设计是：OPL 持有 stage attempt、queue、attempt ledger、transition runner、memory/artifact locator、generated surface、workbench 和 observability；domain repo 只保留领域真相、判断和回执。

## 三层审计 taxonomy

`functional_privatization_audit` 的核心目标不是把 stage 定义、domain policy 或 quality verdict 都标成私有功能，而是给所有“看起来像功能代码”的路径一个可审计归位：

| 层级 | 是否私有功能面 | 长期 owner | OPL 管理方式 | 例子 |
| --- | --- | --- | --- | --- |
| `standard_domain_pack_inventory` | 否 | domain agent | schema validation、pack compilation、generated / hosted runtime | stage 定义、transition table、action metadata、policy、rubric、knowledge、fixture、receipt schema |
| `authority_function_inventory` | 否 | domain agent | 标准 ABI、call envelope、receipt projection、no-forbidden-write guard | publication quality verdict、grant fundability/export verdict、visual review/export verdict、artifact mutation authorization、memory accept/reject、owner receipt signer |
| `private_platform_residue_inventory` | 是 | OPL replacement 或 retirement gate | OPL generated/hosted surface、refs-only 收薄、diagnostic cleanup 或 tombstone | scheduler、queue/attempt ledger、session store、SQLite lifecycle engine、workbench/status shell、memory/artifact transport、native helper envelope、observability/SLO runtime |

因此，标准 OPL 智能体不是“没有代码”，而是代码只能落在标准 domain pack 或标准 authority ABI 里。凡是实现了通用运行平台、状态机、持久化、调度、展示、transport、lifecycle 或 observability 的模块，都必须进入 `private_platform_residue_inventory`，不能用“历史上已经写在 domain 仓里”作为长期保留理由。

Authority function 的标准 ABI 固定为：

- 输入：`stage_attempt_ref`、`source_refs`、`artifact_refs`、`memory_refs`、`policy_refs`、`prior_receipt_refs`。
- 输出：`verdict`、`owner_receipt`、`typed_blocker`、`safe_action_refs`、`no_forbidden_write_evidence_ref`。
- 禁止输出：`generic_runtime_state`、`queue_or_attempt_ledger_mutation`、`session_store_mutation`、`scheduler_installation`、`OPL_lifecycle_store_write`。

## 允许的私有功能面

| 类别 | 长期允许 | 接口形态 | 必要性 |
| --- | --- | --- | --- |
| `minimal_authority_function` | 是，但属于 `authority_function_inventory` 而非私有 platform residue | `runtime/authority_functions/<function>` + receipt schema + OPL 标准 ABI | 领域裁决无法可靠声明化，例如 publication quality、fundability/export verdict、visual review/export verdict、artifact mutation authorization、memory accept/reject、source readiness、owner receipt signing 或 domain-native helper implementation。 |
| `refs_only_domain_adapter` | 是 | contract / projection 只返回 opaque refs、owner receipt、typed blocker、no-regression refs | OPL generic shell 需要 locator 或 receipt refs，但 memory body、artifact body、quality/export verdict 仍归 domain。 |
| `temporary_migration_bridge` | 否 | `generated_surface_handoff` + active caller inventory + replacement target | OPL generated/replacement surface 正在同一 program 内替换旧手写 shell；必须有迁移动作和退役门。 |
| `diagnostic_cleanup_path` | 否 | 显式 opt-in status/remove/inspect；不得 install、trigger、schedule 或成为 default caller | 仅用于检查或移除旧 runtime 状态，例如 MAS legacy local LaunchAgent cleanup。 |
| `provenance_or_fixture` | 是 | history/tombstone ref 或 deterministic fixture | 只用于回归、parity 或 source provenance；不得声明 runtime owner。 |

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
