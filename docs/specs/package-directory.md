# OPL Package Directory 与统一安装管理

本文说明 OPL 面向用户的 Agent、工作流和共享能力目录，以及它与 Homebrew 等物理载体的边界。机器字段以 [`cli-command-registry.json`](../../contracts/opl-framework/cli-command-registry.json) 中的 `packages_list`、Package manifest schema 和实际 owner projection 为准；本文不保存动态安装数量或版本。

## 目录是谁的真相

OPL Package Directory 是 Framework 的 owner projection。公开源与获授权私有源合并到同一目录，使用同一 Package identity、安装状态和 owner action。入口为：

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

以下项目不应显示为可安装条目：仅开发用或未发布的 checkout、已冻结或归档项目、缺少 publication ref 的草稿、只有 Skill/素材而没有 Package 入口的仓库、未能证明安装和调用回读的镜像。私有项目采用下述授权目录合同，仓库私有或本机已安装不构成其他用户可以下载安装的证据。

目录分区由 `package_role` 动态决定。App 不维护 GitHub 仓库白名单，也不因仓库“活跃”就自动注册；重复仓库或 fork 先 canonicalize 到同一 Package ID，再由 owner 决定是否显示多个 carrier。

## 软件源的物理入口

| 维护对象 | 物理入口 | 责任 |
| --- | --- | --- |
| 第一方目录 projection | [`contracts/opl-framework/packages/`](../../contracts/opl-framework/packages)；[GitHub 入口](https://github.com/gaofeng21cn/one-person-lab/tree/main/contracts/opl-framework/packages) | 从 Package owner descriptor 形成可分发的语义声明；与 native carrier 回读合并，不保存本机安装事实 |
| 公开 Homebrew tap | [`gaofeng21cn/homebrew-one-person-lab`](https://github.com/gaofeng21cn/homebrew-one-person-lab)；`brew tap gaofeng21cn/one-person-lab` | Formula/Cask、宿主和原生依赖的安装更新 |
| Package 制品 | descriptor 的 `publication_ref`；第一方 OCI namespace 为 `ghcr.io/gaofeng21cn/one-person-lab-packages/` | 版本、内容摘要和包级读取权限 |
| 当前用户的目录与状态 | `opl packages list --json` 与 `app_state.agent_packages.directory.entries` | 合并当前获准来源与本机 carrier 的安装回读 |

公开仓内只放可公开的目录声明。需要隐藏名称、说明或版本的私有条目由受权限保护的软件源提供，Framework 对当前身份获准的条目做同样的 identity 合并；不能先把完整私有清单放入公开文件，再依赖 UI 隐藏。软件源配置和凭证不进入公共 Package metadata。

## 私有 Package 的访问合同

私有源沿用公开 Package 的安装与管理界面。访问规则分成独立的四个判断：

| 判断 | 权威 owner | 含义 |
| --- | --- | --- |
| 目录可见性 | Package 发布者和软件源 | 当前身份能否读取名称、版本和 descriptor；`visibility=authorized_only` 的条目需要授权后发现 |
| 制品下载 | GitHub/GHCR 或其他 registry | 当前身份能否读取选定 Package 的 manifest、payload、source archive 与 digest；仓库 read 不自动授予 package pull |
| 本机安装与管理 | Package owner 与 native carrier | 已安装、启停、依赖、更新、修复和卸载事实，以及每个动作的当前可执行性 |
| 运行时资源与业务动作 | Connect、知识 owner 与领域 owner | 已安装消费者能否访问知识、账号或业务能力；安装授权不授予券商操作或私人知识访问 |

`visibility`、`access_policy_ref` 和 `credential_provider` 是来源声明。访问状态、授权修订和校验时间由可信安装器及 provider 回读产生，descriptor 自称 authorized 不构成授权。公开 projection 只带安全引用和状态，凭证继续由 provider、系统钥匙串或 credential helper 保管。安装前使用 Framework installer 的身份，不借用尚未安装 Package 的 Connect consumer grant；运行时连接规则见 [Connect 连接授权](./connection-authorization.md)。

目录按当前身份和来源权限过滤后计数。尚未获准发现的私有条目不出现，也不暴露其数量；来源本身可以显示登录、授权过期或连接失败状态。已获准读取 metadata 但无制品下载权限的条目可以显示权限问题，安装和更新按钮保持不可用。凭证存在只能证明找到凭证来源，不能证明 registry 已接受它。

安装、检查更新、下载更新和需要读取远端内容的修复均重新校验来源权限。凭证、authorization revision 或账号变更不能沿用其他身份的目录缓存或旧 access decision。卸载与禁用依据本地 carrier 和依赖关系执行，远端撤权不阻止用户管理已经安装的软件。

撤权后，尚未安装的私有条目从授权目录移除；已安装条目保留必要的本地名称、版本、载体和卸载入口，并显示访问失效。后续远端读取被拒绝，不自动删除本地文件。Registry 撤权不是运行许可证；运行时连接或知识权限的撤销仍由各自 owner 单独执行。

## Homebrew 的位置

Homebrew 是 OPL 的一个 carrier，不是 Agent 目录。它适合分发宿主工具、CLI、原生运行依赖和已经声明 Homebrew 支持的 OPL App 载体；Formula/Cask 的版本与 digest 必须追随对应公开 artifact，并由各自 owner 回读。

私有 tap 也可承载已声明 Homebrew 支持的内部 App/CLI。Tap 的 Git 读取权限与安装文件的下载权限分别验证。已有 OCI Package 的 Agent 直接复用 registry 权限和原 carrier 更新动作，不再生成一套 Formula 版本真相。

用户在 OPL App 中看到的是 Package Directory 的语义：可发现、可安装、已安装版本、可用版本、更新状态、调用就绪和受影响的依赖。底层动作可以走 Framework、Homebrew、npm、OCI、GitHub Release 或其他 native carrier，但 App 不把不同 carrier 拼成第二套目录，也不要求用户理解载体差异。

因此：

- Package Directory 决定“有什么、属于什么角色、是否准入”；
- native carrier 决定“怎么装、怎么更新、怎么回读”；
- Homebrew 只在它是声明的 carrier 时执行动作；
- App/Studio 的统一管理页是用户认知入口，owner projection 是机器真相。

## 版本与更新

目录同时投影 `installed_version` 和 `selected_version`/`stable_version`。两者不一致时显示“已安装版本”和“可安装版本”；只有 owner 的 `package_currentness.status=update_available` 才显示“有更新”。`available_actions.update` 只是可执行能力，不等于已经发现新版本。

OPL App 的“应用管理”是一级能力，与主对话并列，统一呈现“我的应用、更新、共享资源”。它可以按角色、状态、来源和更新状态筛选，动作仍按 owner action 执行并在完成后 fresh readback。Settings 中保留的细节页是诊断和深链入口，不能另建一套目录或版本注册中心。

公开/私有与访问状态独立于安装状态显示。UI 区分“公开”“私有·已授权”“需要登录”“无读取权限”“授权过期”“访问已撤销”和“尚未检查”，仅使用 owner 提供的明确状态。未选择安装的可选软件计入“可安装”，不计入“需处理”；已安装软件的依赖或访问故障才进入处理入口。更新页只统计当前用户可读取的新版本，不能用无权访问的远端版本制造更新提示。

对 OCI carrier，channel tag 用于发现选定版本，digest 绑定本次下载的具体内容。不可变版本、manifest、payload、source archive 和 content lock 必须保持一致。公开发布用匿名回读证明可获取；私有发布用授权回读证明可获取，并确认匿名访问被拒绝。发布者声明私有时，流水线不能把包改成 public；源代码归档、签名材料和发布附件遵守相同可见性。安装与更新仍由原 carrier 负责，这些校验不另建版本解析器。

## 新项目接入顺序

1. 先确认项目的领域 owner、Package ID、角色和真实调用入口。
2. 补齐 manifest/descriptor、公开或私有可见性、发布来源、carrier 和安装后 readback；私有源还须绑定访问策略与凭证 provider。
3. 在 Framework projection 中登记可安全展示的版本、访问状态、就绪、依赖和 action refs；不写入秘密、正文或绝对路径。
4. 用 `opl packages list --json` 和 `opl app state --profile fast --json` 回读，再在 OPL App 的目录页完成安装、更新、停用、修复和卸载验收。私有源同时验证无权限、过期、撤权、重新授权和账号切换。
5. 只有通过安装、调用和更新回读的项目，才从“候选/开发”转为用户可安装条目。

