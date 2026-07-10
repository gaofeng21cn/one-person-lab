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
opl agents foundry interfaces --json
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

Connect 暴露 OPL Agent Packages 时，必须把 Agent Package Core 和 carrier adapters 分开读：`opl connect agent-packages list|status --json` 输出 package core、descriptor/digest/lock/lifecycle/exposure、carrier readback 和 no-package-manager boundary；`install|update|repair|rollback|uninstall` 只写 Framework package lock、lifecycle receipt 与受控 carrier 物理面。Codex Plugin/local marketplace 只是 `codex_plugin_carrier`，OPL App shortcuts 只是 Home / cockpit 可见性 carrier，workflow profile 只是 Codex profile / instruction block carrier，runtime/app release 只是安装与更新 carrier。carrier 可以触发 reload guidance、semantic-merge guidance 或 owner route，但不得成为 package dependency graph、domain truth、runtime authority、release currentness 或 owner receipt 的真相源。

Connect 暴露外部资源连接器时，必须保持“平台接入”和“领域判断”分离。`opl connect scientific search --provider crossref|openalex` 是 optional scientific connector profile 的统一只读入口；引用校验另可消费 Semantic Scholar、Crossmark 与 Publisher metadata。它们只返回 source refs、metadata、URL、connector invocation ref 和 ledger receipt candidate ref；不保存全文、不建立第二文献库、不判断引用质量、不写 MAS paper truth，也不签 owner receipt。PubMed client 与医学 normalization 归 MAS adapter；MAS 的 scout/write/review/figure 等 Skill 负责医学检索策略、citation judgment、claim-evidence map、review ledger、论文质量判断和 owner route。

MAS Scholar Skills 同步模型：

- `opl connect sync-skills --domain mas-scholar-skills` 是 package owner-facing 入口；无 workspace/quest target 时只输出 skipped/readback，不把 Skill 写入 MAS repo 或系统 Codex。
- Connect 按外部 plugin manifest 和实际 Skill 目录分发、安装、同步和发现，不维护 required/default profile，也不判断 MAS 质量、paper truth、owner receipt、typed blocker 或 runtime queue。
- MAS Scholar Skills 的专业 Skill 清单和内容由外部 package 的 `.codex-plugin/plugin.json` 与实际 `skills/*/SKILL.md` 持有；Connect 不维护 required/default 医学列表，也不为未物化名称生成占位状态。MAS stage prompt 不由 Connect 同步；Connect 只校验并同步 package owner 已物化的 Skill，记录 target-bound receipt。临床数据 body、source readiness verdict、不可逆 mutation、owner receipt、typed blocker 和 publication readiness 仍归 MAS / domain owner。
- workspace/quest scope 的默认落点是 `<target>/.codex/skills/`；project scope 仍是显式、非默认、deprecated-for-paper-execution 的 MAS project-local mirror；codex scope 仍需显式请求。
- 这些 Skill 包是 MAS 可消费的同步能力源，不是 MAS domain truth、runtime owner gate、owner receipt、typed blocker、artifact authority 或 publication/export readiness。

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
