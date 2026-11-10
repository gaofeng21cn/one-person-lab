# OPL 软件源控制面

本文是公开与私有软件源的操作说明。它只描述来源配置、访问检查和状态回读，不保存 token、密码、动态安装数量或 Package 版本。目录语义仍由 [Package Directory](./package-directory.md) 持有，凭证由 provider 或系统 credential helper 持有。

## 物理位置

软件源的 refs-only 配置默认保存于：

```text
~/Library/Application Support/OPL/state/software-sources.json
```

设置 `OPL_STATE_DIR` 后，文件位于该目录下；文件权限由 Framework 以仅用户可读写方式创建。该文件只保存 `source_id`、是否启用、provider/credential handle 引用和最近状态。它不是凭证数据库，也不保存 token 值。应用、CLI 和 Agent 都通过同一 Framework projection 读取它。

默认来源为：

| source ID | 类型 | 默认可见性 | 用途 |
| --- | --- | --- | --- |
| `homebrew:gaofeng21cn-one-person-lab` | Homebrew tap | `public` | OPL 宿主、CLI 和已声明的原生 carrier |
| `public-registry:opl` | OPL 公共 Package 源 | `public` | 公开 Agent、Workflow 和 Capability |
| `github-packages:gaofeng21cn` | GitHub Packages/GHCR | `authorized_only` | 获授权用户的私有 Package，例如 OCC |

目录入口不是另一个在线应用商店 URL。Framework 通过 owner projection、native carrier 和当前身份的软件源状态合并生成 `opl packages list --json` 及 `app_state.agent_packages.directory.entries`。Homebrew tap、OCI/GHCR 和 GitHub 源码仍由各自 owner 维护，不能在 App 中复制一份版本注册表。

## CLI 操作

先查看来源和当前访问状态：

```bash
opl sources list --json
```

检查单个来源。检查会通过同一 provider 验证登录/凭证，并刷新该来源中可见 Package 的真实读取权限：

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

可用的原生引用由 provider 决定；当前实现支持 `gh-cli`、`ghcr` 和受控的 `env:OPL_GITHUB_PACKAGES_TOKEN` 引用。未经 provider 声明的任意 URL、明文 token 或 `credential:` 字符串都会被拒绝。需要切换账号时，先在 provider（例如 `gh auth login`）中完成账号切换，再重新执行 `check`；Framework 不复制 GitHub token。

断开来源只移除本地 credential handle 和后续远端读取能力，不删除已经安装的 Package：

```bash
opl sources disconnect --source-id github-packages:gaofeng21cn --json
```

断开后，已安装的私有条目仍显示最小本地安装事实，并允许停用、修复本地 carrier 或卸载；需要远端 manifest、payload 或更新的动作会显示授权失效并保持不可用。重新 `configure` 后再 `check`，目录和可更新状态才恢复。

## 私有 Package 的安装前检查

私有条目使用 `visibility=authorized_only`。发现、下载和运行是三条独立授权链：

1. 软件源检查决定当前身份能否看到 metadata 和版本；
2. registry/provider 决定能否读取 manifest、payload、source archive 和 digest；
3. Connect grant、知识来源 grant 和领域 owner 决定已安装 Agent 能否使用连接、Obsidian 知识或业务动作。

安装、更新和需要远端读取的修复在执行前重新检查来源授权。私有制品安装时锁定不可变 digest；`latest-stable` 只用于发现候选版本。公开源的匿名回读与私有源的授权回读是不同验收条件，不能用本机 carrier 已安装替代新用户发行验收。

私有 Package 的签名信任通过受控运行环境提供 `OPL_PACKAGE_SIGNING_PUBLIC_KEY`。该变量只用于验证发布者签名，不能代替 registry 登录、Package read 权限或 Connect/知识授权；生产发行仍须以受保护源中的真实 artifact、授权回读和撤权测试为准。

## UI 展示规则

OPL App 的“应用管理”页与主对话并列，软件源作为一级能力的来源筛选和状态详情。UI 应分别展示：

- 来源：公开、私有·已授权、需要登录、无读取权限、授权过期、访问已撤销、尚未检查；
- Package：可安装、已安装版本、可用版本、更新状态、调用就绪、依赖影响和 owner action；
- 计数：只统计当前身份实际可见的条目；未获准的私有条目不泄露名称、数量或版本。

用户未安装的可选软件属于“可安装”，不计入“需处理”。已安装软件的缺少依赖、carrier 故障或访问撤权才进入处理队列。所有安装、更新、修复、停用和卸载动作完成后都重新读取 Framework/native carrier 状态；UI 不用按钮存在性或旧缓存宣称成功。

Obsidian 等个人知识源沿用同一控制面但不属于软件源：正文仍在用户原资料库，Framework 只管理 source binding、接受版本、授权和运行快照。当前没有知识 owner producer 时，应用管理页必须显示“来源尚未返回/尚未配置”，不得把工作目录路径或空列表推断为已接入。

## 当前验收边界

软件源 CLI、refs-only 持久化、凭证值拒绝、来源状态投影和 UI 状态合同可以通过源码与聚焦测试验证。私有 OCC 的真实授权发行、无权身份拒绝、授权撤销后的重新读取阻断，以及带真实签名/私有制品的端到端安装更新，必须在受保护 registry 和获权/无权账号上单独验收；源码测试不能替代这些外部回读。
