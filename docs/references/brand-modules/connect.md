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

## 接口与文档

理想接口：

```text
opl agents interfaces --family-defaults --json
opl actions export --domain <id> --json
opl skill sync --json
opl module install <agent> --json
opl system startup-maintenance --json
```

理想文档：

```text
docs/references/brand-modules/connect.md
docs/references/current-support/opl-release-packages-modular-distribution.md
docs/product/opl-public-surface-index.md
contracts/opl-framework/domain-pack-compiler-contract.json
contracts/opl-framework/public-surface-index.json
```

## 不做什么

- 不把 generated descriptor 当成 handler implementation。
- 不让 wrapper / facade 成为第二 truth。
- 不把 release/install pass 写成 App release-ready 之外的 domain ready。
- 不把 Homebrew transport 写成 semantic authority。

## 成功标准

- CLI/MCP/Skill/OpenAI/AI SDK/App action 语义一致。
- Generated surface drift 能被机器发现。
- Clean install / upgrade / skill sync / module health 有明确 evidence。
- 非默认 executor adapter 和 diagnostic tools 只在显式绑定下出现。

