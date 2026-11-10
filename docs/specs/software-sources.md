# OPL 软件源控制面

本文是公开与私有软件源的操作说明，覆盖来源配置、访问检查、原生软件生命周期和状态回读。来源配置只保存引用；软件清单、版本和安装事实来自各自 owner。Package 目录语义由 [Package Directory](./package-directory.md) 持有，Homebrew 持有 formula/cask 的安装和更新，凭证由 provider 或系统 credential helper 持有。

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

Framework 通过 owner projection、native carrier 和当前身份的软件源状态生成统一目录。Agent Package 使用 `opl packages list --json` 及 `app_state.agent_packages.directory.entries`；Homebrew 原生软件使用 `opl sources list --json` 返回的 `software_sources.entries[].native_items`，并进入 App 的“我的应用”和软件源详情。两处 UI 消费同一份投影。Homebrew tap、OCI/GHCR 和 GitHub 源码仍由各自 owner 维护，App 不另建版本注册表。

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

可用的原生引用由 provider 决定；当前实现支持 `provider:github_packages:gh-cli`、`provider:github_packages:ghcr`、`provider:github_packages:docker` 和受控的 `env:OPL_GITHUB_PACKAGES_TOKEN` 引用。未经 provider 声明的任意 URL、明文 token 或 `credential:` 字符串都会被拒绝。需要切换账号时，先在 provider（例如 `gh auth login`）中完成账号切换，再重新执行 `check`；Framework 不复制 GitHub token。

断开来源只移除本地 credential handle 和后续远端读取能力，不删除已经安装的 Package：

```bash
opl sources disconnect --source-id github-packages:gaofeng21cn --json
```

断开后，已安装的私有条目仍显示最小本地安装事实，并允许停用、修复本地 carrier 或卸载；需要远端 manifest、payload 或更新的动作会显示授权失效并保持不可用。重新 `configure` 后再 `check`，目录和可更新状态才恢复。

## Homebrew 原生软件

公开 tap 的物理入口是 [gaofeng21cn/homebrew-one-person-lab](https://github.com/gaofeng21cn/homebrew-one-person-lab)，Homebrew 名称为 `gaofeng21cn/one-person-lab`。首次接入、检查和联网刷新各自有明确动作：

| 操作 | CLI | 影响 |
| --- | --- | --- |
| 接入软件源 | `opl sources setup --source-id homebrew:gaofeng21cn-one-person-lab --json` | 使用已有 Homebrew 执行固定 OPL tap 的接入，随后回读清单 |
| 检查本机清单 | `opl sources check --source-id homebrew:gaofeng21cn-one-person-lab --json` | 读取本机 tap 配方和安装状态，不联网更新配方 |
| 刷新来源版本 | `opl sources refresh --source-id homebrew:gaofeng21cn-one-person-lab --json` | 通过 `brew update` 更新 Homebrew 配方元数据，随后回读，不升级已安装软件 |

尚未安装 Homebrew 时，UI 显示“需要安装 Homebrew”并指向其官方安装入口；Framework 不执行远程安装脚本。已安装 Homebrew 但尚未接入 OPL tap 时，显示“未接入”和接入动作。`setup`、`refresh` 以及安装、更新、卸载都使用现有 App 确认流程。`brew update` 会刷新 Homebrew 管理的配方元数据，影响范围不限于 OPL tap。

Framework 从 `brew tap-info --json` 和 `brew info --json=v2` 读取当前 tap 成员、版本和安装事实。快速列表只读取可重建的投影缓存；显式检查或生命周期动作会重新读取 Homebrew。`available_version` 表示本机配方中的来源版本，UI 显示“来源版本”，不把未联网刷新的配方称为远端最新版本。

软件标题使用发布者的正式 `display_name`，技术身份使用稳定的 `item_id` / `name`，二者分开呈现。Homebrew Cask 使用配方声明的正式名称；Formula 没有独立名称字段时，复用已有产品品牌合同中的载体绑定。例如 `gaofeng21cn/one-person-lab/opl` 展示为 **OPL Framework**，命令和安装 ID 仍为 `opl`。品牌合同只提供名称与用途说明，不保存版本或安装状态；修改文案不改变生命周期修订号。目录优先显示当前语言的 `description_i18n`，其余说明来自原发布者。

同一投影位于 `app_state.agent_packages.sources.entries[].native_items`，机器合同见 [Settings Control Center 的 Homebrew 定义](../../contracts/opl-framework/settings-control-center-action-read-model-contract.json)。源投影包含 `inventory_status`（`available`、`not_checked` 或 `unavailable`）、`inventory_reason`、`inventory_checked_at`、`entry_count`、`version_basis=homebrew_local_recipes`、`installation_owner=homebrew` 和 `native_items`。每个原生条目包含：

- `item_id`、`name`、`display_name`、`description` 和 `kind`（`formula` 或 `cask`）；
- `installed`、`installed_version`、`available_version` 和 `update_status`（`available`、`current`、`not_installed` 或 `unknown`）；
- `revision`、`disabled`、`pinned` 和带完整 payload 的 `available_actions`。

安装、更新和卸载分别使用 `source_install`、`source_update`、`source_uninstall`，CLI 对应 `sources install`、`sources update`、`sources uninstall`。三者只接受 `source_id`、`item_id`、`expected_revision`。调用时使用最近一次清单返回的条目身份和修订号，例如：

```bash
opl sources install \
  --source-id homebrew:gaofeng21cn-one-person-lab \
  --item-id formula:gaofeng21cn/one-person-lab/opl \
  --expected-revision <revision-from-source-readback> --json
```

执行前重新读取 Homebrew，核对条目确属固定 OPL tap、当前版本和可执行动作；清单已变化时要求重新查看后再执行。安装、更新、卸载分别委托 `brew install`、`brew upgrade`、`brew uninstall`，完成后以新的 Homebrew 回读决定结果。卸载禁用依赖自动清理，不使用 `--zap` 或强制删除，保留用户配置、Obsidian 资料库及业务数据。

## 私有 Package 的安装前检查

私有条目使用 `visibility=authorized_only`。发现、下载和运行是三条独立授权链：

1. 软件源检查决定当前身份能否看到 metadata 和版本；
2. registry/provider 决定能否读取 manifest、payload、source archive 和 digest；
3. Connect grant、知识来源 grant 和领域 owner 决定已安装 Agent 能否使用连接、Obsidian 知识或业务动作。

安装、更新和需要远端读取的修复在执行前重新检查来源授权。私有制品安装时锁定不可变 digest；`latest-stable` 只用于发现候选版本。公开源的匿名回读与私有源的授权回读是不同验收条件，不能用本机 carrier 已安装替代新用户发行验收。

私有 Package 的签名信任通过受控运行环境提供 `OPL_PACKAGE_SIGNING_PUBLIC_KEY`。该变量只用于验证发布者签名，不能代替 registry 登录、Package read 权限或 Connect/知识授权；生产发行仍须以受保护源中的真实 artifact、授权回读和撤权测试为准。

## UI 展示规则

OPL App 的“应用管理”页与主对话并列，软件源作为一级能力的来源筛选和状态详情。UI 应分别展示：

- 来源：公开、账户已连接、需要登录、无读取权限、授权过期、访问已撤销、尚未检查。来源的 `authorized` 只表示账户身份检查成功；每个私有 Package 的可见性与下载权限仍逐项验证；
- Package：可安装、已安装版本、可用版本、更新状态、调用就绪、依赖影响和 owner action；
- 计数：`entry_count` 只统计当前身份实际可见的条目；未获准的私有条目不泄露名称、数量或版本。Homebrew 清单尚未读取或读取失败时返回 `null`，UI 显示“尚未读取”或具体不可用原因；只有成功读取后的空清单才能显示零个软件。

用户未安装的可选软件属于“可安装”，不计入“需处理”。已安装软件的缺少依赖、carrier 故障或访问撤权才进入处理队列。所有安装、更新、修复、停用和卸载动作完成后都重新读取 Framework/native carrier 状态；UI 不用按钮存在性或旧缓存宣称成功。

Obsidian 等个人知识源在“共享资源 → 知识与记忆”管理，复用[知识来源接口](./knowledge-sources.md)的真实 Profile/Workspace projection 与接入、配置、检查、断开动作。正文保留在用户原资料库，Framework 管理来源 binding、接受版本、授权和运行快照。账号连接、模型能力、基础依赖也在共享资源按原 owner 管理；软件源权限链接回同一“软件源”页面。读取失败或尚未返回时显示明确状态，只有 owner 成功回读的空列表才表示尚未配置。

## 当前验收边界

软件源 CLI、refs-only 持久化、凭证值拒绝、来源状态投影和 UI 状态合同通过源码与聚焦测试验证。Homebrew adapter 的命令参数、身份及版本漂移拒绝和生命周期结果回读使用 runner fixture 验证，本机只读清单核对真实 Homebrew 字段。真实安装、更新和卸载的生效结果，以执行后的 native carrier 回读为准。私有 OCC 的真实授权发行、无权身份拒绝、授权撤销后的重新读取阻断，以及带真实签名/私有制品的端到端安装更新，仍需受保护 registry 和获权/无权账号的实际证据。
