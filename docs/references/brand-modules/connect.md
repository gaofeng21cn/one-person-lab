# OPL Connect

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 contracts、generated descriptors、CLI/API 行为、plugin/skill manifests、App release artifacts 和 installer evidence。

## 品牌定位

`OPL Connect` 是 OPL 的外部接口与分发模块。它把同一套 OPL / Foundry Agent contracts 派生到 CLI、MCP、Skill/plugin、OpenAI tools、AI SDK tools、App actions、Homebrew、installer 和 release artifacts。

一句话：`Connect` 管“外部系统和用户怎样稳定接入同一套 OPL 能力”。

## 设计理念

- One source, many surfaces：所有调用面从 Atlas / Stagecraft / Workspace / Runway / Vault 的合同派生。
- Descriptor-only delegates：MCP/Skill/OpenAI/AI SDK 可以描述和 delegate，但不成为 OPL runtime owner。
- Release evidence is separate：install transport 与 semantic truth 分开；Homebrew/App release 只能证明安装路径，不证明 domain ready。
- No wrapper drift：generated surface 必须能追踪 source fingerprint 和 generated artifact fingerprint。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `cli_surface` | `opl` 命令树和 help/spec。 |
| `mcp_descriptor` | MCP tools/resources/prompts 的描述与 delegate boundary。 |
| `skill_pack` | Codex skill/plugin 可见入口。 |
| `openai_tool_descriptor` | OpenAI tool schema。 |
| `ai_sdk_tool_descriptor` | AI SDK tool schema。 |
| `app_action_descriptor` | App action list / execute 的合同。 |
| `release_channel` | Homebrew、DMG、Full bundle、Docker/WebUI、GHCR 等分发入口。 |
| `generated_drift_manifest` | source input 与 generated artifact 的对齐状态。 |

Workspace 级 L4 的 Connect 对象模型必须把 semantic authority 与 transport/install evidence 拆开。最低模型如下：

| 对象 | L4 验收含义 |
| --- | --- |
| `connect_read_model` | external surfaces、module install health、descriptor drift、transport channel 和 semantic source refs 的分层状态。 |
| `semantic_surface_ref` | Atlas/Stagecraft/Workspace/Runway/Vault/domain pack 等 canonical contract refs；决定接口语义。 |
| `transport_install_ref` | Homebrew、App updater、Full bundle、skill/plugin sync、module install、package manifest 等安装/分发证据；只证明 transport。 |
| `generated_interface_bundle` | CLI/MCP/Skill/OpenAI/AI SDK/App action descriptor bundle 与 source/generated fingerprint。 |
| `connect_validation_report` | descriptor consistency、fingerprint、module install contract、fresh-install matrix 和 false authority flags。 |
| `connect_doctor_report` | transport failure、semantic drift、missing descriptor、stale generated artifact 或 release evidence gap 的分层诊断。 |

## Workspace 级 L4 验收 refs

| 层面 | 目标 refs |
| --- | --- |
| `schema / contract` | `contracts/opl-framework/public-surface-index.json`、`contracts/opl-framework/domain-pack-compiler-contract.json`、`contracts/opl-framework/codex-default-profile.json`、`contracts/opl-framework/native-helper-contract.json`、`contracts/opl-framework/fresh-install-test-matrix.json`。 |
| `CLI family` | `opl connect status --json`、`opl connect inspect --json`、`opl connect interfaces --json`、`opl connect validate --json`、`opl connect doctor --json`。 |
| `current delegate CLI` | `opl skill sync --json`、`opl skill list --json`、`opl modules --json`、`opl module install --module medautoscience --json`、`opl packages manifest --json`、`opl agents interfaces --family-defaults --json`、`opl actions export --domain medautoscience --format openai --json`、`opl actions export --domain medautoscience --format ai-sdk --json`、`opl brand-modules inspect --module connect --json`。 |
| `App action / read-model` | App action descriptors、module health、release/update surface、installed agent capability projection；`connect_read_model` 必须把 semantic source、generated descriptor、transport install 和 release evidence 分开。 |
| `descriptor` | CLI spec、MCP descriptor、skill/plugin manifest、OpenAI tool descriptor、AI SDK tool descriptor、App action descriptor、source/generated fingerprint manifest。 |
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
opl connect skills --json
opl connect sync-skills --json
opl connect install --module <agent> --json
opl connect packages manifest --json
opl system startup-maintenance --json
opl packages manifest --json
opl brand-modules inspect --module connect --json
```

Connect 暴露 Skill/MCP/plugin/install transport 时，必须能指回 Foundry Agent series spine：`opl connect skills` 和 `opl connect sync-skills` 输出 `foundry_agent_series`、`frontdoor_spine`、`mcp_projection` 与旧桶退役策略。旧 `opl skill list|sync` 和 `opl module *` 只保留 fail-closed replacement，不再作为普通入口。

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
- `interfaces`：输出 CLI/MCP/Skill/OpenAI/AI SDK/App action descriptor bundle，并标明每个 descriptor 的 canonical semantic source 和 generated artifact fingerprint。
- `validate`：fail closed 检查 public surface index、domain pack compiler、generated descriptors、fingerprints、module install contract、fresh-install matrix 和 authority flags；不能用 Homebrew/App release/skill sync 成功代替 semantic consistency。
- `doctor`：把问题分成 `semantic_drift`、`generated_artifact_stale`、`transport_install_failure`、`release_evidence_missing`、`descriptor_missing` 或 `domain_owner_required`，并给出对应 source refs。

## Authority boundary

- Connect 持有 external surface generation、descriptor distribution、install transport 和 drift evidence。
- Atlas、Stagecraft、Workspace、Runway、Vault 持有被派生 surface 的 canonical source。
- App release、Homebrew、Full bundle、skill/plugin sync 只证明 transport/install path；domain ready 继续归 domain owner 和 runtime evidence。
- 非默认 executor adapter 只能通过显式 descriptor、binding 和 validation refs 暴露。

## Forbidden claims

- 不把 generated descriptor 当成 handler implementation。
- 不让 wrapper / facade 成为第二 truth。
- 不把 release/install pass 写成 App release-ready 之外的 domain ready。
- 不把 Homebrew transport 写成 semantic authority。
- 不把 Skill/MCP/OpenAI/AI SDK descriptor 存在写成 handler 可用。
- 不把单一 channel 安装成功写成全渠道 release complete。
- 不把 transport/install evidence 写成 semantic surface consistency。

## L4 structural baseline 成功标准

- `opl connect status|inspect|interfaces|validate|doctor` 与 `opl skill/module/package/actions/agents` delegate 从同一 public surface / domain pack / install contracts 派生。
- Connect 有自己的 read-model、interface bundle、generated drift manifest、validate gate 和 doctor report，不只依赖 `brand-module-registry` 说明。
- CLI/MCP/Skill/OpenAI/AI SDK/App action 语义一致，且 source/generated fingerprint drift 能被机器发现。
- Clean install / upgrade / skill sync / module health 有明确 evidence，但 evidence 按 transport/install、semantic surface consistency、domain owner readiness 分层。
- 非默认 executor adapter 和 diagnostic tools 只在显式绑定下出现。
- Tests 覆盖 generated descriptor、drift negative、module install/package manifest、fresh-install matrix 和 Homebrew/App release 不等于 semantic authority。
