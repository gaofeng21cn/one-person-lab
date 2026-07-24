# OPL Connect

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 contracts、generated descriptors、CLI/API 行为、plugin/skill manifests、App release artifacts 和 installer evidence。

## 2026-07-24 planned supersession

Connect 的目标是 discovery/delegation，不再持有 Agent Package Core。Package 是唯一
安装单元；Skill、Tool、Plugin、workflow 和 entrypoint 只是 descriptor 可发现
capability。Codex Plugin Manager、Git 或实际 carrier 平台持有 install/list/update/remove
与 currentness；Connect 只投影 descriptors、entrypoints、external connectors 和
no-authority invocation refs。Git history 与 retained compatibility 字段中的
registry/lock/LKG/lifecycle receipt、carrier materialization 和固定 first-party
catalog 只解释旧实现，不得反向定义本文目标边界。
迁移与删除门见
[`OPL Package 平台组合迁移计划`](../../active/opl-package-platform-composition-migration.md)。

## 品牌定位

`OPL Connect` 是 OPL 的外部接口、discovery 与 delegation 模块。它把同一套 OPL / Foundry Agent contracts 派生到 CLI、MCP、Skill/plugin、OpenAI tools、AI SDK tools、Capability Invocation lifecycle descriptors、ToolResultEnvelope descriptors、App actions、installer 和 release artifacts；Package 的物理生命周期与 currentness 留在实际 carrier 平台。

一句话：`Connect` 管“外部系统和用户怎样发现并调用同一套 OPL 能力”；它不再是 Package Manager，也不维护 Package/Agent/Plugin/Module 固定清单。

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
| `package_descriptor_ref` | Package owner 声明的 identity、kind、required/optional identity、capability 和 entrypoint refs；Connect 只分发和发现，不复制成员清单。 |
| `carrier_readback` | Codex Plugin Manager、Git/local carrier，以及消费 Base OCI handoff / offline seed 的 Package runtime adapter 的 installed/callable/currentness 读面。 |
| `external_source_connector` | PubMed 等外部资源的只读连接器，返回 normalized source refs、request/read receipt 和 no-authority boundary。 |
| `generated_drift_manifest` | source input 与 generated artifact 的对齐状态。 |
| `package_capability_projection` | 从 installed Package descriptor 动态投影 Skill/Tool/Plugin/entrypoint；其可用性必须回到 carrier fresh readback 和实际 callability。 |

Workspace 级 L4 的 Connect 对象模型必须把 semantic authority 与 transport/install evidence 拆开。最低模型如下：

| 对象 | L4 验收含义 |
| --- | --- |
| `connect_read_model` | external surfaces、module install health、descriptor drift、transport channel 和 semantic source refs 的分层状态。 |
| `semantic_surface_ref` | Atlas/Stagecraft/Workspace/Runway/Ledger/domain pack 等 canonical contract refs；决定接口语义。 |
| `transport_install_ref` | Homebrew、App updater、Full bundle、skill/plugin sync、module install、package descriptor 等安装/分发证据；只证明 transport。 |
| `package_discovery_readback` | owner descriptor、carrier installed/callable 状态、required/optional presence、shortcut/exposure 和 owner route 的 refs-only 聚合；不包含 Framework lock 或 lifecycle ledger。 |
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
opl connect scientific search --provider crossref|openalex|pubmed|pmc --query <query> --limit <n> --json
opl connect references verify --references-file <json> --providers pubmed,pmc --json
opl connect mcp-stdio
opl connect skills --json
opl connect sync-skills --json
opl connect install --module <agent> --json
opl connect packages manifest --json
opl system startup-maintenance --json
opl brand-modules inspect --module connect --json
```

Connect 暴露 Skill/MCP/plugin/install transport 时，必须能指回 Foundry Agent series spine：`opl connect skills` 和 `opl connect sync-skills` 输出 `foundry_agent_series`、`command_surface_spine`、`mcp_projection` 与旧桶退役策略。旧 `opl skill list|sync` 和 `opl module *` 只保留 fail-closed replacement，不再作为普通入口。

`opl packages` 作为迁移期公共 façade 时，必须把 owner descriptor、carrier readback 和 App projection 分开读：`list|status` 从配置的 native carrier 动态聚合 installed/callable 状态；`install|update|remove` 只把用户选择的 root 及其缺失 required identity 委托给对应 carrier/runtime adapter。Connect 只持有 Skill/MCP/plugin descriptor 与 external connector primitive，不持有 Package lifecycle namespace。Codex Plugin Manager 只是首个 carrier adapter，OPL App shortcuts 只是 Home / cockpit 可见性，workflow profile 只是 executor 配置投影。任何 carrier 都不得反向拥有 Package identity、domain truth、runtime authority、release verdict 或 owner receipt。

### Agent Package App projection

- `directory.entries[]` 从 owner descriptor 与配置的 carrier fresh discovery 动态聚合，不从固定 first-party allowlist、Release Set、Full manifest 或 App source 分支构造生态上限。Official Profile 只补充首次安装/显式恢复的 desired roots。
- 每个 entry 投影 Package identity、kind、capabilities、required/optional presence、installed、callable、enabled、Home preference、owner route 和 carrier-local currentness。App 不保存 Package lock、payload、LKG、receipt 或 rollback 状态机。
- required dependency 缺失时，安装或更新只 ensure 当前 root 及其 required identity；不得把其他已安装或 Profile roots 纳入同一 selection。缺失只局部阻止依赖它的 root，其他 Package 继续工作。
- `available_actions[]` 只投影 carrier/runtime adapter 真实支持的 install、update、remove、enable/disable 和 owner-specific action。无法 fresh readback 时报告 `status_unavailable` 或 `physical_unavailable`，不得从 descriptor、Plugin cache 或历史 projection 猜测 installed。
- Package version 可展示，精确 ref/digest 可记录在一次 build/release artifact 中，但二者都不是普通 dependency readiness 或跨 Package currentness 门禁。
- source、focused tests 与 read-model shape 完成只证明 functional implementation；真实 carrier 安装、静默更新、reload 后 discovery、live launch 和 release/install readback 继续属于独立 evidence。

Connect 暴露外部资源连接器时，必须保持“平台接入”和“领域判断”分离。`opl connect scientific search --provider crossref|openalex|pubmed|pmc` 是 optional scientific connector profile 的统一只读搜索入口；PubMed 使用 ESearch + ESummary，Europe PMC 使用 search API，并保留 PMID / PMCID / DOI、article types 和检索计数核对。`opl connect references verify` 另可消费 PubMed、PMC、Semantic Scholar、Crossmark 与 Publisher metadata。PubMed ESummary、Europe PMC core metadata / XML body probe、retry、cache、identifier normalization 和 receipt candidate 属于 Connect transport；`full_text_available` 与 `full_text_body_verified` 必须分开。`opl connect mcp-stdio` 仅以 progressive search / describe / execute meta-tools 精选暴露同一 scientific / references 实现，不镜像完整 CLI。它们不建立第二文献库、不判断引用质量、不写 MAS paper truth，也不签 owner receipt。MAS 的 scout/write/review/figure 等 Skill 负责医学 query strategy、citation judgment、claim-evidence map、review ledger、论文质量判断和 owner route。

MAS Scholar Skills 兼容 projection 边界：

- `mas` owner descriptor 声明 `mas-scholar-skills` 为 required Package identity；Framework 不复制 Scholar Skill id 清单或固定数量。
- 配置的 carrier/runtime adapter 只 ensure `mas` 与缺失的 `mas-scholar-skills`，并用 fresh readback 证明两者 installed 且 MAS 所需入口 callable；其他 Package roots 不进入该操作。
- ScholarSkills owner descriptor 和实际已安装目录动态声明当前 Skill/capability exports；workspace / quest discovery 只是 carrier 投影，不是另一份 lifecycle authority。缺失 required Package 只阻止 MAS route，单个 optional/named Skill 不可用只局部降级对应能力。
- Package 更新按 owner `latest-stable` 和 native carrier 独立进行；不以固定 generation、SemVer/ABI range、lock、digest、LKG 或 closure receipt 作为 MAS 普通启动门禁。
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
- Package owner 持有 Package identity、descriptor、capability 与 dependency intent；配置的 carrier/runtime adapter 持有 install/update/remove 和 native readback。Connect 只发现、分发 descriptor 与委托 carrier。
- Base 只下载、校验并 handoff OCI bytes；Codex Plugin Manager、Git/local carrier、消费 OCI/offline handoff 的 Package runtime adapter、OPL App shortcuts、workflow profile、MCP/Web/native 承接各自 lifecycle 或 projection。它们都不拥有 Package identity、domain truth、runtime authority、release verdict 或 owner receipt。
- Managed Update 对 Package 只聚合 owner route、carrier currentness、safe action refs 和 fresh readback；它不是私有 package manager，也不能用单一 carrier apply 声称 package、release 或 domain 已完成。
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
- 不把 Package identity 写成 Codex Plugin/local marketplace、OPL App shortcut、workflow profile 或 runtime/app release 的附属物；carrier 只能投影 owner descriptor，不能反向拥有 identity。
- 不把 Managed Update Kernel 或 Connect 写成 OPL 私有 package manager；它们只做 discovery、delegation、readback projection 和受控 action refs。
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
