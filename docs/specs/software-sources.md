# OPL 软件源控制面

本文是公开与私有软件源的操作说明，覆盖来源配置、访问检查和状态回读。来源配置只保存引用；软件清单、版本和安装事实来自各自 owner。Package 目录语义由 [Package Directory](./package-directory.md) 持有，凭证由 provider 或系统 credential helper 持有。

## 物理位置与单写入边界

在 Framework v2 中，本机持久化状态的唯一写入入口是 `opld` JSON-RPC 写入 SQLite `opl.db`；应用、CLI 与 SDK 通过同一投影读取。当前 `software-sources` 正在从 legacy `software-sources.json`（及历史 macOS 路径只读迁移）向 `opl.db` + `pack.sources.*` RPC 收敛（见[当前差距](../active/current-state-vs-ideal-gap.md)）。来源配置只保存 `source_id`、是否启用、provider/credential handle 引用和最近状态，不是凭证数据库，也不保存 token 值。

## 一个目录，多个获取渠道

OPL 软件源是用户认识“我们维护的软件”的统一入口。公开目录与授权私有源提供不同获取渠道，合并为同一软件目录；用户从软件条目安装和更新，不必先理解技术载体。公开或私有只改变访问条件，不改变产品分类、状态表达和操作方式。

来源配置与实际管理器仍分别保留。其他渠道的软件位于“其他来源”，沿各自管理器发现和维护；当前目录已接入 Codex 原生插件回读，独立 Skills 沿现有 Skill 管理入口处理，不由插件清单推断其安装或更新状态。它们不会因为也使用插件格式就进入 OPL 自有软件数量。归属字段和显示规则由 [Package Directory](./package-directory.md#管理范围与产品类型) 持有。

默认 OPL 获取渠道为：

| source ID | 类型 | 默认可见性 | 用途 |
| --- | --- | --- | --- |
| `public-registry:opl` | [OPL 官方目录](https://github.com/gaofeng21cn/opl-catalog) | `public` | 智能体、应用、扩展、通道和依赖。支持 `source_refresh` 刷新目录索引 |
| `github-packages:gaofeng21cn` | GitHub Packages/GHCR | `authorized_only` | 获授权用户的私有 Package，例如 OCC |

Framework 通过 owner projection、native carrier 和当前身份的软件源状态生成统一目录。Agent Package 使用 `opl pack list --json` 及 `app_state.agent_packages.directory.entries`；OCI/GHCR 仍由各自 owner 维护，App 不另建版本注册表。GitHub 保存开发源码与发布来源，开发 checkout 只通过显式开发覆盖接入，不作为普通安装或更新渠道。Homebrew Tap 原生软件管理与多安装实例切换已退役，不再属于 v2 软件源产品面。

## 配置私有软件源与公开目录刷新

首次使用私有 Package 时，在软件中心的软件源设置选择 GitHub 命名空间，连接已登录的 GitHub CLI 账户，或在高级设置中选择 Docker 登录或受控环境凭据。也可以使用下列 `opl sources` 命令配置和断开来源。v2 在 CLI、Studio 和 Flow 发布工具之间共用此处的凭据引用。

`configure` 启用来源后立即检查 GitHub 账户。此后可用 `check` 再次检查。账户通过验证后，具体 Package 的下载和发布还需要对应的仓库和 GHCR 权限。仅列出软件源时不会联系 GitHub。

先查看来源和当前访问状态：

```bash
opl sources list --json
```

检查指定来源当前选定凭据对应的 GitHub 身份：

```bash
opl sources check --source-id github-packages:gaofeng21cn --json
```

连接或更新来源时只传入已有凭证的引用，不把秘密放在命令行：

```bash
opl sources configure \
  --source-id github-packages:gaofeng21cn \
  --provider-id github_packages \
  --credential-handle provider:github_packages:gh-cli \
  --enabled true --json
```

可用的原生引用由 provider 决定；当前实现支持 `provider:github_packages:gh-cli`、`provider:github_packages:ghcr`、`provider:github_packages:docker` 和受控的 `env:OPL_GITHUB_PACKAGES_TOKEN` 引用。未经 provider 声明的任意 URL、明文 token 或 `credential:` 字符串都会被拒绝。需要切换账号时，先在 provider（例如 `gh auth login`）中完成账号切换，再重新执行 `check`；Framework 不复制 GitHub token。

断开来源只移除本地 credential handle 和后续远端读取能力，不删除已经安装的 Package：

```bash
opl sources disconnect --source-id github-packages:gaofeng21cn --json
```

断开后，已安装的私有条目仍显示最小本地安装事实，并允许停用、修复本地 carrier 或卸载；需要远端 manifest、payload 或更新的动作会显示授权失效并保持不可用。公开目录源保留 `source_refresh` 能力用于显式刷新目录索引缓存，安装和更新继续在各软件条目执行。

## 私有 Package 的安装前检查

私有条目使用 `visibility=authorized_only`。发现、下载和运行是三条独立授权链：

1. 官方目录提供可公开的条目和版本。软件源检查决定当前身份能否读取受保护的详情。
2. registry/provider 决定能否读取 manifest、payload、source archive 与 digest。
3. Connect grant、知识来源 grant 和领域 owner 决定已安装 Agent 能否使用连接、Obsidian 知识或业务动作。

安装、更新和需要远端读取的修复在执行前重新检查来源授权。私有制品安装时锁定不可变 digest，`latest-stable` 只用于发现候选版本。公开源匿名回读与私有源授权回读分别验收。私有签名密钥、受保护发布流与 OCI namespace 归属校验机制由 [Artifact 与 Package Delivery 边界](../delivery/artifact-package-lifecycle-boundary.md) 持有；界面及状态展示规范由 [Package Directory 与统一安装管理](./package-directory.md#名称说明与状态展示) 持有。

Obsidian 等个人知识源在“共享资源 → 知识与记忆”管理，账号及模型连接在“共享资源 → 连接与凭证”管理；具体接口与展示细节归各自主题 owner。

## 当前验收边界

软件源 CLI/RPC、refs-only 持久化、凭证值拒绝、来源状态投影和 UI 状态合同通过源码与聚焦测试验证。真实安装、更新和卸载的生效结果，以执行后的 native carrier 回读为准。每个私有发行须提供受保护 registry 的授权回读、匿名拒绝、签名与安装回读证据；一个 Package 的验收不能代替另一个版本或消费者的验收。
