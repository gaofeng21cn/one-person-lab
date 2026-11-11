# Agent 原生 App 共用基座与 SDK

本文归属 Framework，是[Agent 原生开发标准](../policies/agent-native-app-policy.md)的 SDK 实现与复用边界说明，适用于 OPL Agent、OPL MiniApp、标准智能体、非标准智能体和独立 MCP App。它回答两个问题：哪些能力必须共用，以及遇到成熟第三方能力时 OPL 应该做到哪一层。

OPL Framework 本身就是共用 SDK 与运行基座，继续使用 `one-person-lab` 的源码、合同、公开 exports、CLI 和 Python runtime；不另建一个同名 SDK 仓库或安装包。App 是产品入口，Studio 是其 DSH/Cordis 应用宿主实现，领域 Agent/MiniApp 是消费者。

## 目标

Agent 负责发现、调用和编排；人在需要选择、授权、确认、编辑或复核时进入 UI。UI 是同一业务 owner 的协作面，不是第二套业务逻辑。一个产品可以只有 Agent 入口，也可以同时提供 MCP App、桌面面板或移动端界面，但这些入口必须共享同一身份、凭证引用、知识来源、任务和结果合同。

## 基座边界

| 层 | 共用 owner | 复用规则 | OPL 自有增量 |
| --- | --- | --- | --- |
| Package 身份与安装 | Framework | 复用统一 manifest、carrier、content lock、安装回读和 action | 只做来源合并、状态投影和薄适配 |
| 应用宿主与 Agent 会话 | DSH/Cordis 应用宿主与 Codex 原生会话 | 复用官方生命周期、slot 和 Codex session owner | 只组合 OPL profile 与产品入口，不再建第二个 agent loop |
| MCP UI | 官方 MCP Apps SDK | 复用标准 resource、tool result、交互事件和宿主生命周期 | 只提供 OPL Host bridge、统一导航和安全投影 |
| 凭证与连接 | Connect、系统钥匙串和原生 provider | 复用 provider 的授权、轮换和回读 | 只保存 opaque reference、scope、revision 和状态，不复制秘密 |
| 知识与记忆 | Framework knowledge source + Obsidian | Obsidian Markdown 是正文 authority；复用 Profile/Workspace 绑定和接受 revision | 只管理来源、范围、快照和写回 receipt，不复制第二份正文 |
| 任务与工作流 | Framework Task/StageRun 或领域 owner | 复用既有 durable execution、receipt 和 artifact ref | 只补领域所需的输入输出映射 |
| 外部工具 | 工具自身 owner（Temporal、Codex、Python、uv、Node 等） | 使用官方 CLI/API/SDK 和其升级路径 | 只做参数、身份、revision、结果和错误的薄适配 |
| 领域逻辑 | 具体 Agent/App owner | 保持在领域仓，不塞进 Framework | 维护业务判断、质量、结果与专业数据 |

## 什么时候抽取 OPL 公共模块

满足以下三个条件才进入 Framework 或共享 SDK：

1. 至少有两个真实消费者；
2. 第三方官方能力不能直接满足 OPL 的身份、边界或回读要求；
3. 抽取后不会产生第二份凭证、知识正文、版本、任务、registry 或业务结果真相。

如果第三方已经解决了功能，优先直接调用；需要统一时只写适配层。适配层必须是无状态或只保存 refs-only 的投影，并保留第三方的错误和版本语义。不得因为“方便”复制 resolver、插件 Host、更新器、队列、凭证库或知识库。

## 软件中心与共用基座的关系

软件中心统一管理 OPL 自有的本机 Package 和原生产品。它通过 `product_id` 合并公开/私有 OCI、Homebrew Formula/Cask 和其他已接通的原生 carrier；Homebrew 与公共 Package 目录是两个 carrier、一个语义目录。Codex 官方插件、第三方 Skills 和 PDF/Documents 等外部扩展单列并由其原生管理器负责。

云端、移动端和设备端产品拥有独立生命周期，不作为本机安装软件进入主目录。OPL App 可以提供部署向导、环境检查、远端状态和跳转；它们的部署动作和版本真相仍归 Cloud、iOS、设备或远端产品 owner。

开发 checkout 是开发者覆盖，不能作为用户安装、更新或修复来源。软件中心的 OPL Package 必须有正式 OCI artifact；原生 App/CLI 必须有对应正式 carrier。缺少正式制品的项目可以出现在开发者诊断中，但不能出现在“可安装”列表。

## 共享资源

用户在“共享资源”中管理两类基座资源：

- **知识与记忆**：Obsidian vault、Markdown 工作区、Profile/Workspace 绑定、接受 revision、范围和写回状态；正文留在原资料库。
- **连接与凭证**：GitHub、邮箱、模型、云端、设备等连接的 provider、授权 scope、revision、freshness 和可用性；秘密留在系统钥匙串或 provider。

软件源授权回到同一个连接 owner。软件中心不再出现第二套登录框，Agent 与 UI 使用相同的 connection handle 和 fresh check。

## 变更准入

新增 Agent、MiniApp 或能力包时，提交同一份 Package manifest、明确产品类型和管理范围，说明使用的官方 Host/SDK、连接 owner、知识来源、任务 owner 和 carrier。只有真实的 OPL-specific gap 才能新增基座模块；该 gap、退出条件和复用理由必须写进对应 contract。

机器字段继续使用既有 Package、Connect、知识和 App state/action 合同；软件目录与安装规则见 [`package-directory.md`](../specs/package-directory.md)。


## 当前复用路径

| 通用需求 | 当前实现与复用 | 保留在 OPL 的必要边界 |
| --- | --- | --- |
| 插件组合、设置与面板 | Studio 的官方 DSH/Cordis 依赖和 slots | App 的产品路由与 Framework 状态适配 |
| 模型执行与对话 | Codex CLI / App Server | Package 与消费者身份、调用范围 |
| MCP 工具和协作界面 | 官方 `@modelcontextprotocol/sdk` / `ext-apps` | 同一业务 owner 的 refs、revision、权限映射 |
| 持久工作流 | Temporal 官方 SDK / 服务 | 领域 Task、StageRun 与产物引用，不另造工作流引擎 |
| 安装与制品 | Homebrew、Codex 原生管理器、OCI/GHCR、ORAS、Cosign | 软件身份合并、精确来源与安装回读 |
| 个人知识 | Obsidian/Markdown 原文 | 按消费者授权、接受版本、来源快照和写回协议 |
| 账号与凭证 | 系统钥匙串、原生 OAuth/credential provider | Connect handle 与独立消费者授权 |

这些是当前共用边界，不是要求所有软件强制加载所有依赖。Framework 的内容锁、授权修订和安全投影有多个真实消费者，属于跨产品所需的标准接口；它们不能扩展成通用密码库、笔记应用、包管理器或第二套 Agent 引擎。今后新增适配必须指出官方能力的具体缺口，并在上游补齐后删除对应适配。
