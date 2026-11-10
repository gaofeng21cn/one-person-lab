# OPL 软件源控制面

本文是公开与私有软件源的操作说明，覆盖来源配置、访问检查、原生软件生命周期和状态回读。来源配置只保存引用；软件清单、版本和安装事实来自各自 owner。Package 目录语义由 [Package Directory](./package-directory.md) 持有，Homebrew 持有 formula/cask 的安装和更新，凭证由 provider 或系统 credential helper 持有。

## 物理位置

软件源的 refs-only 配置默认保存于：

```text
~/Library/Application Support/OPL/state/software-sources.json
```

设置 `OPL_STATE_DIR` 后，文件位于该目录下；文件权限由 Framework 以仅用户可读写方式创建。该文件只保存 `source_id`、是否启用、provider/credential handle 引用和最近状态。它不是凭证数据库，也不保存 token 值。应用、CLI 和 Agent 都通过同一 Framework projection 读取它。

## 一个目录，多个获取渠道

OPL 软件源是用户认识“我们维护的软件”的统一入口。公开 registry、授权私有源和 Homebrew tap 提供不同获取渠道，合并为同一软件目录；用户从软件条目安装和更新，不必先理解技术载体。公开或私有只改变访问条件，不改变产品分类、状态表达和操作方式。

来源配置与实际管理器仍分别保留。其他渠道的软件位于“其他来源”，沿各自管理器发现和维护；当前目录已接入 Codex 原生插件回读，独立 Skills 沿现有 Skill 管理入口处理，不由插件清单推断其安装或更新状态。它们不会因为也使用插件格式就进入 OPL 自有软件数量。随 Codex 附带的 PDF 等可选扩展也不自动成为运行组件。归属字段和显示规则由 [Package Directory](./package-directory.md#管理范围与产品类型) 持有。

默认 OPL 获取渠道为：

| source ID | 类型 | 默认可见性 | 用途 |
| --- | --- | --- | --- |
| `homebrew:gaofeng21cn-one-person-lab` | Homebrew tap | `public` | OPL 宿主、CLI 和已声明的原生 carrier |
| `public-registry:opl` | OPL 公共 Package 源 | `public` | 公开 Agent、Workflow 和 Capability |
| `github-packages:gaofeng21cn` | GitHub Packages/GHCR | `authorized_only` | 获授权用户的私有 Package，例如 OCC |

Framework 通过 owner projection、native carrier 和当前身份的软件源状态生成统一目录。Agent Package 使用 `opl packages list --json` 及 `app_state.agent_packages.directory.entries`；Homebrew 原生软件使用 `opl sources list --json` 返回的 `software_sources.entries[].native_items`，并进入 App 的 OPL 软件目录和软件源详情。两处 UI 消费同一份投影。Homebrew tap、OCI/GHCR 和 GitHub 源码仍由各自 owner 维护，App 不另建版本注册表。

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

Framework 从 `brew tap-info --json` 和 `brew info --json=v2` 读取当前 tap 成员、配方版本与 Homebrew 收据；产品的实际安装还结合受支持的应用 bundle 与 Framework 安装 owner 回读。快速列表读取可重建投影；检查本机清单会重新读取本机配方及安装证据，不执行 `brew update`。只有“刷新来源版本”联网更新配方。`available_version` 表示本机配方中的安装目标，主列表显示为“可用版本”，来源详情保留配方依据与检查时间；没有联网刷新证据时不称为远端最新版本。

软件标题使用发布者的正式 `display_name`，技术身份使用稳定的 `item_id` / `name`，二者分开呈现。Homebrew Cask 使用配方声明的正式名称；Formula 没有独立名称字段时，复用已有产品品牌合同中的载体绑定。例如 `gaofeng21cn/one-person-lab/opl` 展示为 **OPL Framework**，命令和安装 ID 仍为 `opl`。品牌合同只提供名称与用途说明，不保存版本或安装状态；修改文案不改变生命周期修订号。目录优先显示当前语言的 `description_i18n`，其余说明来自原发布者。

同一投影位于 `app_state.agent_packages.sources.entries[].native_items`，机器合同见 [Settings Control Center 的 Homebrew 定义](../../contracts/opl-framework/settings-control-center-action-read-model-contract.json)。源投影包含 `inventory_status`（`available`、`not_checked` 或 `unavailable`）、`inventory_reason`、`inventory_checked_at`、`inventory_refresh_required`、`entry_count`、`version_basis=homebrew_local_recipes`、`installation_owner=homebrew` 和 `native_items`。无快照、旧字段或快照过期时，`inventory_refresh_required=true` 让界面复用 `source_check` 重新读取本机状态；快速投影本身不运行 Homebrew。每个原生条目包含：

- `item_id`、`name`、`display_name`、`description` 和 `kind`（`formula` 或 `cask`）；
- `catalog_origin`、`origin_basis` 和 `catalog_source` 表达维护归属与原生来源；这组展示信息不改变下载权限、安装 owner 或动作授权；
- `product_id` 归并同一产品的多个配方；`item_id` 继续标识各自安装选项；
- `installed`、`installed_version` 表示经受支持证据确认的本机产品安装，`homebrew_installed`、`homebrew_installed_version` 单独表示 Homebrew 收据；
- `installation_owner`、`installation_kind`、`installation_evidence`、`installed_source_revision` 和 `owner_settings_route` 说明实际安装方式、证据及维护入口；
- `available_version` 是当前配方来源版本，`update_status` 为 `available`、`current`、`not_installed` 或 `unknown`；
- `installed_display_version`、`available_display_version` 提供产品发布者声明的展示版本；`installed_build_kind` 和 `installed_build_id` 提供已安装 App 自身声明的开发构建身份，未确认时为 `null`；
- `revision`、`disabled`、`pinned` 和带完整 payload 的 `available_actions`。

OPL App 的显示版本与更新器机器版本遵循 [App 发布合同](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/contracts/app-release-channel.json)。列表优先展示显示版本，并仅依据 bundle 的 `OPLBuildKind=local-development` 标注“开发版”；不能根据版本领先、目录渠道或缺少 Homebrew 收据推断开发版。Framework 从匹配的 App bundle 及其既有 Full manifest 读取本机显示身份，或在机器版本完全匹配时复用该 Cask 明确声明的机器／显示版本对；来源显示版本同时绑定配方的 Release 下载 URL。原始机器版本、配方版本和构建 ID 留在详情，更新比较、Homebrew 收据和可执行动作继续使用各自 owner 的原始字段。缺少展示身份时不通过算术反推版本，也不把开发构建标成正式发布。

软件源投影根级的 `installed_products` 独立于 `entries` 和 Homebrew 清单缓存。当前已接入 Framework 安装 owner：从有效安装收据和真实入口回读 `managed:opl-framework`，输出 `kind=managed_runtime`、`product_id=github:gaofeng21cn/one-person-lab`、本机版本、`installation_owner=opl_framework` 和 `owner_settings_route=updates`，不附加 Homebrew 动作。即使本机未安装 Homebrew、未接入 tap 或来源缓存不可用，该安装记录仍可显示；来源自身继续如实返回未检查或不可用，不合成配方条目。UI 按 `product_id` 将本机产品与可用来源选项合并。

这个独立安装读面目前覆盖 Framework owner；其他原生应用仍通过已支持的软件源和 bundle 回读提供状态。它不表示已经发现所有平台、所有安装器或全部外部应用。

来源层的 `installation_owner=homebrew` 表示配方操作归 Homebrew；条目层的安装 owner 可以不同。比如本机 Framework 已由 OPL 管理，Homebrew 配方仍没有收据；界面显示实际 Framework 版本，并从安装 owner 进入维护，不显示“本机未安装”。OPL App 的标准、完整和 Nightly 配方按 `product_id` 归并成产品，各安装选项在来源详情中分别显示收据与版本；发现一个 App bundle 不表示这些渠道都已安装。

安装、更新和卸载分别使用 `source_install`、`source_update`、`source_uninstall`，CLI 对应 `sources install`、`sources update`、`sources uninstall`。三者只接受 `source_id`、`item_id`、`expected_revision`。调用时使用最近一次清单返回的条目身份和修订号，例如：

```bash
opl sources install \
  --source-id homebrew:gaofeng21cn-one-person-lab \
  --item-id formula:gaofeng21cn/one-person-lab/opl \
  --expected-revision <revision-from-source-readback> --json
```

Homebrew 动作执行前重新读取该来源，核对固定 OPL tap、当前版本、Homebrew 收据及可执行动作；清单已变化时要求重新查看后再执行。安装、更新、卸载分别委托 `brew install`、`brew upgrade`、`brew uninstall`，完成后以新的 Homebrew 收据回读决定结果。其他 owner 已持有的安装不借用 Homebrew 动作更新或卸载，也不以安装另一份 Homebrew 软件替代管理现有实例。卸载禁用依赖自动清理，不使用 `--zap` 或强制删除，保留用户配置、Obsidian 资料库及业务数据。

## 私有 Package 的安装前检查

私有条目使用 `visibility=authorized_only`。发现、下载和运行是三条独立授权链：

1. 软件源检查决定当前身份能否看到 metadata 和版本；
2. registry/provider 决定能否读取 manifest、payload、source archive 和 digest；
3. Connect grant、知识来源 grant 和领域 owner 决定已安装 Agent 能否使用连接、Obsidian 知识或业务动作。

安装、更新和需要远端读取的修复在执行前重新检查来源授权。私有制品安装时锁定不可变 digest；`latest-stable` 只用于发现候选版本。公开源的匿名回读与私有源的授权回读是不同验收条件，不能用本机 carrier 已安装替代新用户发行验收。

第一方私有 Package 的签名信任由 Framework 随版本交付的 `contracts/opl-framework/keys/private-package-signing.pub` 提供，仅用于 `gaofeng21cn/one-person-lab-private-packages`。其他发布者由 Host 显式配置 `OPL_PACKAGE_SIGNING_PUBLIC_KEY` 绝对公钥路径；显式配置优先，配置错误不会回退到默认信任。公钥不从制品或用户覆盖的目录中取得。发布流程在上传前核对受保护私钥派生的公钥与随 Framework 交付的公钥一致。私钥与密码保存在私有 owner 仓库的 `release-stable` 发布环境；该仓库通过固定 Framework commit 的正式 workflow 调用统一发布器，使用自身 `GITHUB_TOKEN` 读取精确源码和访问 registry。签名信任不能代替 registry 登录、Package read 权限或 Connect/知识授权；实际发行仍须完成授权回读及匿名拒绝验证。

私有制品的归属由 canonical Package owner、经认证的精确私有 workflow caller、源码 commit/tag，以及 OCI source annotation 和签名 provenance 共同绑定。GitHub Package REST 返回的 `repository` 是可选关联投影：存在时必须与该私有 owner 一致；缺失时明确记录 `association_metadata_unavailable`，不得宣称关联已验证。发布器仍须实际读取目标私有 namespace，并在上传前后用同一只读核验路径证明 `visibility=private` 和匿名访问被拒绝；明确的公开状态或错误 owner 均拒绝发布。首次创建只允许先上传不含源码或凭据的固定访问标记，完成同样核验后才上传 Package 内容。

## UI 展示规则

OPL App 的“应用管理”页与主对话并列，软件源作为一级能力的来源筛选和状态详情。UI 应分别展示：

- 来源：公开、账户已连接、需要登录、无读取权限、授权过期、访问已撤销、尚未检查。来源的 `authorized` 只表示账户身份检查成功；每个私有 Package 的可见性与下载权限仍逐项验证；
- Package：产品类型 `software_type`、配置 carrier 的安装与版本、来源版本、更新状态、调用就绪、依赖影响和 owner action；另有 `local_installations` 时显示原安装器实例及安装/开发模式，操作继续归该实例 owner；
- 计数：`entry_count` 只统计当前身份实际可见的条目；未获准的私有条目不泄露名称、数量或版本。Homebrew 来源的 `entry_count` 统计配方条目，主软件目录按产品 identity 去重，二者不可混用。Homebrew 清单尚未读取或读取失败时返回 `null`，UI 显示“尚未读取”或具体不可用原因；只有成功读取后的空清单才能显示零个条目。

用户未安装的可选软件属于“可安装”，不计入“需处理”。已安装软件的缺少依赖、carrier 故障或访问撤权才进入处理队列。所有安装、更新、修复、停用和卸载动作完成后都重新读取 Framework/native carrier 状态；UI 不用按钮存在性或旧缓存宣称成功。

Obsidian 等个人知识源在“共享资源 → 知识与记忆”管理，复用[知识来源接口](./knowledge-sources.md)的真实 Profile/Workspace projection 与接入、配置、检查、断开动作。正文保留在用户原资料库，Framework 管理来源 binding、接受版本、授权和运行快照。账号连接、模型能力、基础依赖也在共享资源按原 owner 管理；软件源权限链接回同一“软件源”页面。读取失败或尚未返回时显示明确状态，只有 owner 成功回读的空列表才表示尚未配置。

## 当前验收边界

软件源 CLI、refs-only 持久化、凭证值拒绝、来源状态投影和 UI 状态合同通过源码与聚焦测试验证。Homebrew adapter 的命令参数、身份及版本漂移拒绝和生命周期结果回读使用 runner fixture 验证，本机只读清单核对真实 Homebrew 字段。真实安装、更新和卸载的生效结果，以执行后的 native carrier 回读为准。私有 OCC 的真实授权发行、无权身份拒绝、授权撤销后的重新读取阻断，以及带真实签名/私有制品的端到端安装更新，仍需受保护 registry 和获权/无权账号的实际证据。
