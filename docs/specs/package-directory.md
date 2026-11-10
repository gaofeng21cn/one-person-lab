# OPL Package Directory 与统一安装管理

本文说明 OPL 面向用户的 Agent、工作流和共享能力目录，以及它与 Homebrew 等物理载体的边界。机器字段以 [`cli-command-registry.json`](../../contracts/opl-framework/cli-command-registry.json) 中的 `packages_list`、Package manifest schema 和实际 owner projection 为准；本文不保存动态安装数量或版本。

## 目录是谁的真相

OPL Package Directory 是 Framework 的 owner projection，公开入口为：

```bash
opl packages list --json
opl app state --profile fast --json
opl app state --profile full --json
```

App 与 Studio 只消费 `app_state.agent_packages.directory.entries` 及其状态合并结果。目录条目必须能同时说明 package identity、角色、发布/载体、安装回读、就绪状态、可用版本和 owner action。没有实时回读时显示 `unknown` 或“尚未检查”，不能把仓库存在、历史版本或一个可用按钮推断为已安装、可调用或有更新。

目录是发现和编排入口，不是第二个安装数据库。安装、启停、修复、更新和卸载仍由 Package owner 与配置的 native carrier 执行；Framework 聚合安全状态，App 负责呈现和 dispatch，执行后重新读取 owner projection。

## 哪些项目可以进入目录

GitHub 仓库本身不是可安装软件。一个项目只有在具备稳定 Package identity、受支持的 manifest/descriptor、可调用入口、已声明的 carrier、可验证的发布来源，以及安装后 readback 合同后，才可以进入可安装目录。

| Package role | 用户目录分区 | 准入要求 |
| --- | --- | --- |
| `standard_agent` | Agents | Agent 入口、输入/结果合同、版本和安装/调用回读 |
| `workflow_profile` | Workflows | 可执行工作流入口、所需依赖和 owner action |
| `capability_package` | Shared capabilities | 能力入口、依赖、授权范围和 carrier 回读 |
| 宿主、Framework、Cloud、分发仓、基础依赖 | Infrastructure 或产品设置 | 作为依赖/宿主呈现，不伪装成普通 Agent |

以下项目不应显示为可安装条目：仅开发用或未发布的 checkout、已冻结或归档项目、缺少 publication ref 的草稿、只有 Skill/素材而没有 Package 入口的仓库、未能证明安装和调用回读的镜像。私有项目可以进入 `authorized-only` 目录，但必须沿同一 identity 和授权边界显示。

目录分区由 `package_role` 动态决定。App 不维护 GitHub 仓库白名单，也不因仓库“活跃”就自动注册；重复仓库或 fork 先 canonicalize 到同一 Package ID，再由 owner 决定是否显示多个 carrier。

## Homebrew 的位置

Homebrew 是 OPL 的一个 carrier，不是 Agent 目录。它适合分发宿主工具、CLI、原生运行依赖和已经声明 Homebrew 支持的 OPL App 载体；Formula/Cask 的版本与 digest 必须追随对应公开 artifact，并由各自 owner 回读。

用户在 OPL App 中看到的是 Package Directory 的语义：可发现、可安装、已安装版本、可用版本、更新状态、调用就绪和受影响的依赖。底层动作可以走 Framework、Homebrew、npm、OCI、GitHub Release 或其他 native carrier，但 App 不把不同 carrier 拼成第二套目录，也不要求用户理解载体差异。

因此：

- Package Directory 决定“有什么、属于什么角色、是否准入”；
- native carrier 决定“怎么装、怎么更新、怎么回读”；
- Homebrew 只在它是声明的 carrier 时执行动作；
- App/Studio 的统一管理页是用户认知入口，owner projection 是机器真相。

## 版本与更新

目录同时投影 `installed_version` 和 `selected_version`/`stable_version`。两者不一致时显示“已安装版本”和“可安装版本”；只有 owner 的 `package_currentness.status=update_available` 才显示“有更新”。`available_actions.update` 只是可执行能力，不等于已经发现新版本。

OPL App 的“应用管理”是一级能力，与主对话并列，统一呈现“我的应用、更新、共享资源”。它可以按角色、状态、来源和更新状态筛选，动作仍按 owner action 执行并在完成后 fresh readback。Settings 中保留的细节页是诊断和深链入口，不能另建一套目录或版本注册中心。

## 新项目接入顺序

1. 先确认项目的领域 owner、Package ID、角色和真实调用入口。
2. 补齐 manifest/descriptor、发布来源、carrier 和安装后 readback。
3. 在 Framework projection 中登记可安全展示的版本、就绪、依赖和 action refs；不写入秘密、正文或绝对路径。
4. 用 `opl packages list --json` 和 `opl app state --profile fast --json` 回读，再在 OPL App 的目录页完成安装、更新、停用和修复验收。
5. 只有通过安装、调用和更新回读的项目，才从“候选/开发”转为用户可安装条目。

