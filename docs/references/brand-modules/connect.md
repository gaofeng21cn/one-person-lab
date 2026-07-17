# OPL Connect

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 contracts、generated descriptors、CLI/API 行为、plugin/skill manifests、App release artifacts 和 installer evidence。

## 品牌定位

`OPL Connect` 是 OPL 的外部接口与分发模块。它把同一套 OPL / Foundry Agent contracts 派生到 CLI、MCP、Skill/plugin、OpenAI tools、AI SDK tools、Capability Invocation lifecycle descriptors、ToolResultEnvelope descriptors、App actions、Homebrew、installer 和 release artifacts，并承载 OPL Agent Package Core 的 registry / manifest / lock / lifecycle receipt / owner route readback。

一句话：`Connect` 管“外部系统和用户怎样稳定接入同一套 OPL 能力”，其中 Agent Package Core 是 OPL/App 管理智能体 package 的核心；Codex Plugin/local marketplace、OPL App shortcuts、workflow profile、runtime/app release 只是 carrier 或 owner surfaces。

## 设计理念

- One source, many surfaces：所有调用面从 Atlas / Stagecraft / Workspace / Runway / Ledger 的合同派生。
- Descriptor-only delegates：MCP/Skill/OpenAI/AI SDK 可以描述和 delegate，但不成为 OPL runtime owner。
- Release evidence is separate：install transport 与 semantic truth 分开；Homebrew/App release 只能证明安装路径，不证明 domain ready。
- No wrapper drift：generated surface 必须能追踪 source fingerprint 和 generated artifact fingerprint。
- Direct invocation：Connect 可被 CLI、OPL App action、family runtime 或 MAS/MAG/RCA 等 domain-owned 流程直接调用；Console 只是可选展示 / operator projection，不是 Connect 的前置依赖。
- Fabric relationship：Runtime Fabric 是 OPL 的通用资源底座；Connect 属于 Fabric 上的资源连接 / 分发 / discovery 能力之一，但 `opl connect *`、App action 和 runtime 调用面可以独立执行，不需要先经过 Console。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `cli_surface` | `opl` 命令树和 help/spec。 |
| `mcp_descriptor` | MCP tools/resources/prompts 的描述与 delegate boundary。 |
| `capability_invocation_lifecycle_descriptor` | Capability Invocation OS soft discovery / scored fit / hard gate 的 descriptor 和 source ref，让外部调用面消费同一三层 lifecycle。 |
| `tool_result_envelope_descriptor` | ToolResultEnvelope / structured result 的 descriptor 和 source ref，保证外部 tool 调用结果可被 agent 稳定消费。 |
| `skill_pack` | Codex skill/plugin 可见入口。 |
| `openai_tool_descriptor` | OpenAI tool schema。 |
| `ai_sdk_tool_descriptor` | AI SDK tool schema。 |
| `app_action_descriptor` | App action list / execute 的合同。 |
| `release_channel` | Homebrew、DMG、Full bundle、Docker/WebUI、GHCR 等分发入口。 |
| `agent_package_core` | OPL/App 管理智能体 package 的核心：registry、manifest、digest lock、dependency graph、trust tier、lifecycle receipt、exposure、shortcut refs 和 owner-route readback。 |
| `agent_package_carrier_adapter` | Codex Plugin/local marketplace、OPL App shortcuts、workflow profile、runtime/app release、MCP/Web/native 等 carrier 投影；只提供可见面、route、readback、reload guidance 或 owner-specific action refs。 |
| `external_source_connector` | PubMed 等外部资源的只读连接器，返回 normalized source refs、request/read receipt 和 no-authority boundary。 |
| `generated_drift_manifest` | source input 与 generated artifact 的对齐状态。 |
| `capability_package_sync_receipt` | 从外部 package 实际 plugin/Skill 目录记录 source head、安装落点、materialized skill ids 与 false-authority boundary；不维护 domain capability catalog。 |

Workspace 级 L4 的 Connect 对象模型必须把 semantic authority 与 transport/install evidence 拆开。最低模型如下：

| 对象 | L4 验收含义 |
| --- | --- |
| `connect_read_model` | external surfaces、module install health、descriptor drift、transport channel 和 semantic source refs 的分层状态。 |
| `semantic_surface_ref` | Atlas/Stagecraft/Workspace/Runway/Ledger/domain pack 等 canonical contract refs；决定接口语义。 |
| `transport_install_ref` | Homebrew、App updater、Full bundle、skill/plugin sync、module install、package manifest 等安装/分发证据；只证明 transport。 |
| `agent_package_owner_route_readback` | package core、carrier adapters、digest lock、lifecycle receipt、shortcut/exposure 和 no-package-manager boundary 的 refs-only readback。 |
| `generated_interface_bundle` | CLI/MCP/Skill/OpenAI/AI SDK/App action descriptor bundle 与 source/generated fingerprint。 |
| `connect_validation_report` | descriptor consistency、fingerprint、module install contract、fresh-install matrix 和 false authority flags。 |
| `connect_doctor_report` | transport failure、semantic drift、missing descriptor、stale generated artifact 或 release evidence gap 的分层诊断。 |

## Workspace 级 L4 验收 refs

| 层面 | 目标 refs |
| --- | --- |
| `schema / contract` | `contracts/opl-framework/public-surface-index.json`、`contracts/opl-framework/domain-pack-compiler-contract.json`、`contracts/opl-framework/capability-registry-resolver.schema.json#/$defs/capability_invocation_lifecycle_policy`、`contracts/opl-framework/codex-default-profile.json`、`contracts/opl-framework/native-helper-contract.json`、`contracts/opl-framework/fresh-install-test-matrix.json`。 |
| `CLI family` | `opl connect status --json`、`opl connect inspect --json`、`opl connect interfaces --json`、`opl connect validate --json`、`opl connect doctor --json`。 |
| `current delegate CLI` | `opl connect skills --json`、`opl connect sync-skills --json`、`opl connect modules --json`、`opl connect install --module medautoscience --json`、`opl connect exec --module medautoscience -- doctor entry-modes`、`opl connect packages manifest --json`、`opl agents interfaces --family-defaults --json`、`opl actions export --domain medautoscience --format openai --json`、`opl actions export --domain medautoscience --format ai-sdk --json`、`opl brand-modules inspect --module connect --json`。 |
| `App action / read-model` | App action descriptors、module health、release/update surface、installed agent capability projection；`connect_read_model` 必须把 semantic source、generated descriptor、transport install 和 release evidence 分开。 |
| `descriptor` | CLI spec、MCP descriptor、Capability Invocation lifecycle descriptor、skill/plugin manifest、OpenAI tool descriptor、AI SDK tool descriptor、App action descriptor、source/generated fingerprint manifest。 |
| `validation / doctor` | `opl connect validate --json` 检查 descriptor drift、fingerprint、module install contract、fresh-install matrix 和 false authority；`opl connect doctor --json` 区分 transport failure 与 semantic drift。 |
| `tests` | CLI public spec、generated descriptor fixture、fingerprint drift negative、skill sync/module install/package manifest regression、fresh-install matrix guard、transport-vs-semantic authority guard。 |
| `status` | `docs/status.md`、`docs/product/opl-public-surface-index.md`、`docs/references/current-support/opl-release-packages-modular-distribution.md`、`docs/references/brand-modules/current-maturity-against-workspace.md`、release/install evidence matrix。 |

## 接口与文档

模块级 CLI family 验收入口：

```text
opl connect status --json
opl connect inspect --detail full --json
opl connect interfaces --json
opl connect validate --json
opl connect doctor --json
```

现有 delegate / source-of-truth 入口：

```text
opl foundry interfaces --json
opl agents interfaces --family-defaults --json
opl actions export --domain <id> --json
opl connect scientific search --provider crossref|openalex --query <query> --limit <n> --json
opl connect skills --json
opl connect sync-skills --json
opl connect install --module <agent> --json
opl connect packages manifest --json
opl system startup-maintenance --json
opl brand-modules inspect --module connect --json
```

Connect 暴露 Skill/MCP/plugin/install transport 时，必须能指回 Foundry Agent series spine：`opl connect skills` 和 `opl connect sync-skills` 输出 `foundry_agent_series`、`command_surface_spine`、`mcp_projection` 与旧桶退役策略。旧 `opl skill list|sync` 和 `opl module *` 只保留 fail-closed replacement，不再作为普通入口。

OPL Packages 暴露 Agent Package Core 时，必须把 package core 和 carrier adapters 分开读：`opl packages list|status --json` 输出 descriptor/digest/lock/lifecycle/exposure、carrier readback 和 no-package-manager boundary；`install|update|repair|uninstall` 只写 Framework package lock、lifecycle receipt 与受控 carrier 物理面。Connect 只持有 Skill/MCP/plugin transport primitive，不再持有 package lifecycle namespace。Codex Plugin/local marketplace 只是 `codex_plugin_carrier`，OPL App shortcuts 只是 Home / cockpit 可见性 carrier，workflow profile 只是 Codex profile / instruction block carrier，runtime/app release 只是安装与更新 carrier。carrier 可以触发 reload guidance、semantic-merge guidance 或 owner route，但不得成为 package dependency graph、domain truth、runtime authority、release currentness 或 owner receipt 的真相源。

### Agent Package App projection

- `directory.entries[]` 是 Framework package catalog、registry cache 与 installed lock 合并后的唯一公共 collection；不存在 `directory.installed_packages[]` 兼容集合。每个 entry 持有 discovery metadata、role/trust/source explanation、install/activation/readiness，以及严格五字段 `{action_id,action_ref,payload,required_payload_fields,confirmation_required}` 的 `available_actions[]` 可执行 action。
- canonical first-party package identity 只归 `resolveFirstPartyPackageCatalog` 与 Framework-owned Release Set catalog。外部 registry/catalog 声明 `mas|mag|rca|oma|obf|mas-scholar-skills|opl-flow` 时 typed fail，persisted stale collision cache 在目录 merge 时忽略；first-party install 只接受 package id 选择，不接受显式 registry/manifest 或 manifest body 注入来覆盖内建 version/manifest/trust。
- `status_index.packages[package_id]` 是 Console 提供给 App 的归一状态 ABI。它保留 raw `package_dependency_readiness` 作为兼容伴随字段，但 canonical consumer 应读取 `dependency_readiness`、`repair_action`、`dependent_guard`、`capability_exposure`、`action_receipt_ref`、`rollback_ref`、`operational_ready` 与 `launch_allowed`。`repair_action` 是带 `command_ref/enabled/reason_code` 的只读修复摘要，不是 executable action payload，consumer 不得执行 `command_ref`；scope/currentness reconciliation 在 use boundary 自动完成，status index 不发布 activation action 或 command ref。receipt/rollback refs 只来自 selected installed lock；无 lock 时为 `null`，单个 status read 失败也不得丢失 lock 已证明的 recovery refs。它们只用于 ordinary lifecycle receipt/recovery 展示，不证明 live reload 或 rollback 已执行。
- `dependency_readiness` 将 raw `current|missing|incompatible` 映射为 `ready|repair_required|blocked`，并投影 required/ready counts、逐 dependency checks 与真实 closure receipt。dependency check 的 `physical_surface_status` 只取 installed lock 已记录的 `materialized|removed|validated_no_write|not_requested`，没有 owner evidence 时为 `null`，不得从 exposure 或 dependency status 推造 `ready`。closure 字段只有 `transaction_id`、`closure_digest`、`last_known_good_transaction_id`、`last_known_good_closure_digest`；Framework 没有 owner evidence 时不生成 `generation_id`。
- `dependent_guard` 直接来自 installed lock graph 的 required dependents；有 dependent 时 disable/uninstall 都 fail closed。repair 复用既有 `agent_package_repair` App action；自动 use-boundary reconciliation 复用内部 `agent_package_activate` transaction 与 receipt 语义，但该兼容 action 不进入 Settings、directory actions 或 status index。
- fast/full 都提供上述 canonical 字段；fast 将未完成 live verification 的正向 readiness 降为 `verification_deferred`，full 只增加 owner detail。App 与 Shell 只能显示 status projection，并通过 directory `available_actions[].action_ref` 执行显式 mutation；package-backed launch 自行触发 use-boundary reconciliation，不从 status `command_ref`、raw package status、静态 package list、历史 workspace binding 或 carrier path 推断 truth。
- 单个 package status read 不可用时，projector 仍保留 installed lock 已证明的 installed/exposure truth，但 dependency readiness 与 repair action fail closed 为 `status_unavailable`；status projection 在任何状态下都不发布 activation action。
- source、focused tests 与 read-model shape 完成只证明 functional implementation；真实 Stable carrier 安装、package update/optimize、Codex config hygiene、reload 后 skill discovery、live launch 和 release/install readback 继续属于独立 release evidence。

Connect 暴露外部资源连接器时，必须保持“平台接入”和“领域判断”分离。`opl connect scientific search --provider crossref|openalex` 是 optional scientific connector profile 的统一只读搜索入口；`opl connect references verify` 另可消费 PubMed、PMC、Semantic Scholar、Crossmark 与 Publisher metadata。PubMed ESummary、Europe PMC core metadata / XML body probe、retry、cache、identifier normalization 和 receipt candidate 属于 Connect transport；`full_text_available` 与 `full_text_body_verified` 必须分开。它们不建立第二文献库、不判断引用质量、不写 MAS paper truth，也不签 owner receipt。MAS 的 scout/write/review/figure 等 Skill 负责医学 query strategy、citation judgment、claim-evidence map、review ledger、论文质量判断和 owner route。

MAS Scholar Skills 兼容 projection 边界：

- `opl packages` 是唯一 lifecycle owner；Connect 的旧 sync primitive 仅可作为内部兼容迁移输入，不进入 App catalog、MAS manifest、正常 activation/launch 或用户 repair 路由。
- MAS Scholar Skills 的完整 export catalog 与 10 module contract ids 由 provider manifest 持有。Packages 在每个 hosted action / 新 child Attempt 首次启动时解析最新可运行 generation，把完整 35 Skills 写入 Attempt 自有的只读 `.agents/skills` generation；`<target>/.codex/skills/` 只作 Codex discovery/兼容投影。11 core Skill 与 10 module ids 是 hard readiness floor，module ids 不物化为 Skill 目录，named specialties 缺失只降级并在下一 use boundary 自动恢复。
- source channel 更新、scope/provenance 漂移或 receipt 缺失由下一 hosted action / 新 child Attempt 静默 reconcile；新 generation admission 失败自动使用 LKG，不发布人工 activation/reload/repair 要求。只有 current 与 LKG 都缺少必需 ABI/Skill/runtime bytes，或路径、权限、安全、health/handler probe 真实失败时才停止。
- Connect 不判断 MAS 质量、paper truth、owner receipt、typed blocker、runtime queue、artifact authority 或 publication/export readiness。

理想文档：

```text
docs/references/brand-modules/connect.md
docs/references/current-support/opl-release-packages-modular-distribution.md
docs/product/opl-public-surface-index.md
contracts/opl-framework/domain-pack-compiler-contract.json
contracts/opl-framework/public-surface-index.json
```

## 模块级 CLI 验收说明

- `status`：返回 semantic source health、generated descriptor health、module install health、transport channel status、release evidence refs 和 drift summary。
- `inspect`：返回对象模型、contract refs、transport/install refs、descriptor refs、fingerprints、forbidden claims 和与 `opl skill/module/package/actions/agents` delegate 的 mapping。
- `interfaces`：输出 CLI/MCP/Skill/OpenAI/AI SDK/App action descriptor bundle，并标明每个 descriptor 的 canonical semantic source 和 generated artifact fingerprint；Capability Invocation lifecycle descriptor 必须指回 Pack/resolver/current-owner-delta refs。
- `validate`：fail closed 检查 public surface index、domain pack compiler、generated descriptors、fingerprints、module install contract、fresh-install matrix 和 authority flags；不能用 Homebrew/App release/skill sync 成功代替 semantic consistency。
- `doctor`：把问题分成 `semantic_drift`、`generated_artifact_stale`、`transport_install_failure`、`release_evidence_missing`、`descriptor_missing` 或 `domain_owner_required`，并给出对应 source refs。

## Authority boundary

- Connect 持有 external surface generation、descriptor distribution、install transport 和 drift evidence。
- Connect 持有 OPL Agent Package Core 的 registry / manifest / lock / lifecycle receipt / owner-route readback；该 core 只管理 package id、version、digest、dependency、trust、lock、lifecycle receipt、exposure 和 shortcut refs。
- Codex Plugin/local marketplace、OPL App shortcuts、workflow profile、runtime/app release、MCP/Web/native 只作为 carrier / owner surfaces；它们不拥有 package core、package truth、domain truth、runtime authority、release verdict 或 owner receipt。
- Managed Update 对 agent packages 只提供 owner route、component receipt、safe action refs 和 readback projection；它不是私有 package manager，也不能用单独的 carrier apply 声称 package、release 或 domain 已完成。
- Connect 持有 external source connector 的 API 调用、normalized refs、错误/限流语义和 invocation receipt candidate；domain agent 持有引用取舍、证据解释、artifact 写入和 owner verdict。
- Atlas、Stagecraft、Workspace、Runway、Ledger 持有被派生 surface 的 canonical source。
- Capability Invocation lifecycle descriptor 只描述 Pack 的三层 lifecycle；soft/scored 层不执行工具，hard gate 只引用 `current_owner_delta`，不让 Connect 判断 domain readiness。
- App release、Homebrew、Full bundle、skill/plugin sync 只证明 transport/install path；domain ready 继续归 domain owner 和 runtime evidence。
- 非默认 executor adapter 只能通过显式 descriptor、binding 和 validation refs 暴露。

## Forbidden claims

- 不把 generated descriptor 当成 handler implementation。
- 不让 wrapper / facade 成为第二 truth。
- 不把 release/install pass 写成 App release-ready 之外的 domain ready。
- 不把 Homebrew transport 写成 semantic authority。
- 不把 Skill/MCP/OpenAI/AI SDK descriptor 存在写成 handler 可用。
- 不把 Agent Package Core 写成 Codex Plugin/local marketplace、OPL App shortcut、workflow profile 或 runtime/app release 的附属物；carrier 只能投影 core，不能反向拥有 core。
- 不把 Managed Update Kernel 写成 OPL 私有 package manager；它只做 owner route/readback/receipt projection 和受控 action refs。
- 不把 Codex Plugin/local marketplace 安装、App shortcut 可见、workflow profile 同步或 runtime/app release 投影写成 package truth、domain ready、release currentness、owner receipt 或 runtime authority。
- 不把 Capability Invocation lifecycle descriptor 写成 handler readiness、owner answer、typed blocker 或 current-owner authorization。
- 不把 ToolResultEnvelope descriptor 或 structured result presence 写成 domain authority、owner answer 或 handler readiness。
- 不把单一 channel 安装成功写成全渠道 release complete。
- 不把 transport/install evidence 写成 semantic surface consistency。

## L4 structural baseline 成功标准

- `opl connect status|inspect|interfaces|validate|doctor` 与 `opl connect skills|sync-skills|modules|install|packages`、actions、agents delegate 从同一 public surface / domain pack / install contracts 派生。
- Connect 有自己的 read-model、interface bundle、generated drift manifest、validate gate 和 doctor report，不只依赖 `brand-module-registry` 说明。
- CLI/MCP/Skill/OpenAI/AI SDK/App action 语义一致，且 source/generated fingerprint drift 能被机器发现。
- Clean install / upgrade / skill sync / module health 有明确 evidence，但 evidence 按 transport/install、semantic surface consistency、domain owner readiness 分层。
- 非默认 executor adapter 和 diagnostic tools 只在显式绑定下出现。
- Tests 覆盖 generated descriptor、drift negative、module install/package manifest、fresh-install matrix 和 Homebrew/App release 不等于 semantic authority。
