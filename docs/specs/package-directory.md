# OPL Package Directory 与统一安装管理

本文定义 OPL 软件目录、软件源和当前生效来源的统一管理模型，以及它们与原生安装器的边界。机器字段以 [Package manifest schema](../../contracts/opl-package.v2.schema.json)、[Package 投影实现](../../packages/daemon/src/state/package-projection.ts) 和实际 owner projection 为准；本文不保存动态安装数量或版本。

## 目录是谁的真相

Framework 将软件源目录与本机安装事实投影为 OPL Package Directory。官方源条目以同一 Package identity 关联公开展示、下载权限、安装状态和维护动作。可通过以下入口查看。

```bash
opl pack list --json
opl daemon doctor --include-first-run --json
```

App 与 Studio 通过 `app_state.agent_packages.directory.entries` 消费 Package 状态，通过软件源和安装 owner 投影消费原生产品状态。目录条目必须能同时说明软件 identity、类型、来源/载体、安装回读、就绪状态、来源版本和 owner action。没有实时回读时显示 `unknown` 或“尚未检查”，不能把仓库存在、历史版本或一个可用按钮推断为已安装、可调用或有更新。

目录是发现和编排入口，不是第二个安装数据库。安装、启停、修复、更新和卸载仍由 Package owner 与配置的 native carrier 执行；Framework 聚合安全状态，App 负责呈现和 dispatch，执行后重新读取 owner projection。

### Framework v2 的已安装 Package 更新

`opl pack update --all --dry-run --json` 与 `pack.updatePlan` 仅比对已安装版本与已校验 Catalog/seed 元数据以零下载生成更新计划；`opl pack update --all --json`、`pack.update` 和 `pack.updateAll` 执行实际更新并按内容摘要复用 `cacheRoot` 下载缓存。公共 Catalog 元数据与 `fetched_at` 持久化缓存在 `opl.db`，Official 安装 provenance 记录在 `pack_install_sources`，重启与冷启动不会把已安装的官方包降级为 `unknown`。Full 模式下，`OPL_FULL_RUNTIME_HOME` 仅作公开匹配版本及源码提交的本地字节加速器（不阻塞 `authorized_only` 私有源与在线目录合并；离线时优雅回退至公开 seed）。App 同时投影只读 `opl_base`（`app_state.managed_update`）以及每条 Package 的 `package_currentness`、`presence.callable`、`management_scope` 与 `package_access`（含已安装与未安装私有包）。后台执行传 `background: true`，跳过已停用的包。手动更新会保留包的启停状态。

Framework 持久化来源身份。由官方目录验证的安装可按目录刷新，其余安装沿用原来源以及用户指定的版本或摘要。开发链接、外部载体和缺少来源的历史安装会显示需要手动管理。一个来源不可用时，其他包继续更新，结果列出失败项。

已审核的官方发布可用 `opl pack ensure <id> --release-version <version> --release-commit <git-commit> --release-digest <sha256:digest> --json` 激活。三个参数共同绑定根包的版本、Git 提交和内容锁摘要。若本机已安装的受管发布符合条件，Framework 校验文件并恢复所需依赖与载体。需要安装时，Framework 从官方目录或 Full 安装种子选择候选，在变更依赖前校验根包；候选与审批不符时返回 `PACK_LOCK_MISMATCH`。这条路径保留开发链接和外部管理的安装。可信宿主可调用 `pack.ensureExact`，传入 `package_id` 与 `exact_release: { version, git_commit, digest }`。CLI 通过 `--version --json` 声明 `pack.ensure.exact-release` 能力，早期守护进程会拒绝此 RPC。

## 管理范围与产品类型

软件中心先回答“这是由谁维护的软件”，再回答“它是什么、装了什么、能否更新”。默认范围是 OPL 自己维护的软件，覆盖标准和非标准智能体、应用、扩展、通道和运行依赖及其受支持载体；OPL 核心只是其中一组架构关系。

| 管理范围 | 内容 | 生命周期入口 |
| --- | --- | --- |
| OPL 软件 | OPL 自行维护、有独立用途和生命周期的软件；公开软件和需授权安装的软件共用目录 | 统一安装、更新、卸载入口，调用该软件实际安装器 |
| 其他来源 | Codex 等平台提供的插件、独立 Skills 及其他外部软件 | 按实际来源和管理器展示；使用原平台支持的操作 |
| 运行组件 | 有明确依赖或内嵌关系、由父产品统一维护的组件 | 显示父产品和依赖关系，从父产品维护入口处理 |
| 部署目标 | 云端、移动端、设备端或远端服务产品 | 只提供部署向导、环境检查和远端状态；不进入本机安装清单 |

Framework v2 首次读取软件目录时，从已配置的 Codex 载体读取原有安装。已安装版本的 OPL 描述符提供 Package ID，Codex 提供版本与启停状态。原先放在内部载体的无界面能力包仍从该载体读取。普通原生插件通过其 Codex 市场管理，执行 `opl pack sync codex` 可刷新 Framework 中的显示。升级发现只读取现有插件和配置。

插件是一种交付方式。OPL 软件即使通过 Codex 插件安装，也仍在 OPL 软件中；PDF、Documents 等外部可选扩展即使随 Codex 提供，也仍属于其他来源。随附安装只证明交付方式，不能据此把扩展称为运行依赖。只有实际依赖合同支持时才使用 `catalog_scope=host_component`；独立软件或用户扩展使用 `catalog_scope=software`。

产品分类使用 **智能体、应用、扩展、通道、依赖**。目录从 owner 声明的 `presentation.software_type` 输出 `agent`、`application`、`extension`、`channel` 或 `dependency`。已有 descriptor 的 `capability` 归一为 `extension`。未声明类型的标准智能体沿原合同归为 `agent`，其余显示 `unknown`。运行加载与调用使用 `standard_agent`、`workflow_profile` 和 `capability_package` 等合同。MCP App、桌面、Web、CLI 是软件入口，独立移动端、设备端和云端产品通过 `management_scope=deployment_target` 出现在部署关联中。

维护归属由 Framework 投影，App 不按名称、ID 前缀或 publisher 字符串猜测：

| 字段 | 含义 |
| --- | --- |
| `catalog_origin=opl\|external\|unknown` | 软件由 OPL 维护、来自外部，或归属尚未确认 |
| `origin_basis=owner_projection\|owner_manifest\|native_carrier\|unknown` | 维护归属的声明依据 |
| `catalog_source.manager` | 该来源的实际管理器，例如 `codex_plugin_manager`、`homebrew`、`opl_framework` |
| `catalog_source.marketplace_id` | 原生载体回读的市场身份；不存在时省略 |
| `catalog_source.delivery=host_bundled\|marketplace\|local\|unknown` | 随附、市场来源、本地接入或尚未确认的交付方式 |

OPL 归属优先来自中央 owner projection；已经安装且拥有真实 OPL owner manifest 的软件，也可使用其明确的第一方来源声明。纯原生外部插件从 native carrier 获得归属与来源。未知归属保留在其他来源的待确认范围，不进入 OPL 数量。上述字段仅用于发现与呈现，不授予信任、安装权限或业务授权。

一个独立软件对应一个稳定 identity 和一个目录条目。公开与私有、标准与完整安装包、不同版本和多个安装器都是同一条目的来源或安装选项。一个 GitHub 仓库可以提供多个软件，也可能只保存源码、资料、概念或实例配置；仓库本身不是安装单元。Studio 随 OPL App 维护，概念方案、资料和私人数据按各自职责管理。

可安装资格仍由稳定身份、实际入口、受支持载体、可验证来源、当前权限和安装回读合同决定。原型软件沿用同一生命周期；尚未满足来源、权限或载体条件时，保留具体原因和当前可用动作。目录按 descriptor 和 carrier 动态发现，不建立 App 自有的软件白名单。

## 成熟度、分发渠道与安装模式

这三个维度独立呈现：

| 维度 | 含义 | 判断依据 |
| --- | --- | --- |
| 产品成熟度 | 原型、预览或稳定等产品定位 | 产品 owner 明确声明及其验收依据；未声明保持未知 |
| 分发渠道 | 选定的正式发行制品或原生正式 carrier | 发布引用、精确 commit、内容锁及来源权限 |
| 安装模式 | 受安装器管理、随 App 提供、显式开发覆盖等本机使用方式 | 安装收据、载体回读和当前生效来源 |

`publication_channel_admission=development_only` 表示当前只有开发覆盖，不能作为软件中心的安装、更新或修复来源；它不等于“预览软件”。`admitted` 也不证明产品稳定。目录不从这两个值、版本号、是否有 GitHub Release 或实现语言推断成熟度。成熟度由 owner 的产品声明和验收决定。

开发 checkout 仅作为显式 Developer Mode 覆盖。它可以被 Agent/开发者调用和回读，但不进入软件中心的可安装版本，不参与普通更新检查，也不由软件中心卸载。正式 Package 的发布输入须声明 `admitted` 和 OCI `publication_ref`，再由发布流程生成并回读不可变制品；目录声明本身不证明制品已可下载。正式原生产品必须有对应的 native carrier。技术原型与其他软件使用同一管理合同，专业结果资格继续由领域 owner 判断。

## 软件源应包括什么

软件源是“提供哪些可安装版本及如何验证和获取”的入口。统一管理接入可验证的公开和授权私有 Package 来源，以及各产品声明支持的本机原生应用、CLI 和本地服务来源；OPL 维护的软件与获准的生态/第三方软件遵循同一准入原则。它们按稳定软件 identity 合并，保留各自来源、可安装版本、授权和安装选项。Homebrew tap 是原生来源之一，不复制整个 Homebrew 或任意 GitHub 仓库列表到 OPL 软件目录。

OPL 的公开 registry、授权私有源和 Homebrew tap 是同一个 OPL 软件目录的获取渠道。其他来源的软件按原管理器独立呈现；独立 Skills 由其原生 Skill 管理入口负责，不把插件列表当作所有 Skills 的清单。只有明确的内嵌或依赖合同才进入运行组件。用户连接的 Obsidian 资料库、邮箱、GitHub 账号和模型账号属于共享资源或连接，通过原有 Connect、知识和账号 owner 管理。

软件源接入独立 OPL 目录、受授权的 GitHub Packages 和 Homebrew tap。其他本机应用载体按同一合同接入自身 adapter；独立远端部署不进入此本机安装目录；软件属于某种产品类型不等于其所有载体都已接通。固定源码只保留为开发者覆盖 provider，不是软件中心来源。

开发 checkout 可作为某个软件显式选择的开发来源覆盖，不因存在于工作区而自动成为分发源。它必须绑定明确版本和回读合同，但永远不成为普通安装、更新或修复动作的来源。软件源连接成功、来源有版本、本机已安装和当前运行采用该版本必须分别检查。

## 软件源的物理入口

| 维护对象 | 物理入口 | 责任 |
| --- | --- | --- |
| 官方目录 | [`gaofeng21cn/opl-catalog`](https://github.com/gaofeng21cn/opl-catalog) | 维护按产品分类的 Package 目录条目与可刷新索引。Framework 提供软件源协议并合并本机 carrier 回读 |
| 公开 Homebrew tap | [`gaofeng21cn/homebrew-one-person-lab`](https://github.com/gaofeng21cn/homebrew-one-person-lab)；`brew tap gaofeng21cn/one-person-lab` | Formula/Cask、宿主和原生依赖的安装更新 |
| 公开 Package 制品 | descriptor 的 `publication_ref`；第一方 OCI namespace 为 `ghcr.io/gaofeng21cn/one-person-lab-packages/` | 版本、内容摘要和匿名读取回读 |
| 私有 Package 制品 | 发行制品使用 descriptor 的 `publication_ref`，第一方 OCI namespace 为 `ghcr.io/gaofeng21cn/one-person-lab-private-packages/` | OCI 包级权限、签名和授权回读；不提供源码安装路径 |
| 当前用户的目录与状态 | `opl pack list --json` 与 `app_state.agent_packages.directory.entries` | 合并当前获准来源与本机 carrier 的安装回读 |

官方目录可显示需授权软件已获准公开的名称、说明、版本和产品分类。受保护元数据随授权来源提供，Framework 以同一 Package identity 合并。软件源凭证由 provider 管理，制品由实际安装来源交付。

## 私有 Package 的访问与生命周期

私有源沿用公开 Package 的安装与管理界面，其软件源 CLI 与授权配置入口见 [软件源控制面](./software-sources.md)。各判断由实际 owner 执行。

| 判断 | 权威 owner | 含义 |
| --- | --- | --- |
| 目录可见性 | Package 发布者和软件源 | 已获准公开的展示信息可由官方目录匿名读取。受保护的详情来自已授权的软件源 |
| 制品下载 | GitHub/GHCR 或其他 registry | 当前身份能否读取选定 Package 的 manifest、payload、source archive 与 digest；仓库 read 不自动授予 package pull |
| 本机安装与管理 | Package owner 与 native carrier | 已安装、启停、依赖、更新、修复和卸载事实，以及每个动作的当前可执行性 |
| 运行时资源与业务动作 | Connect、知识 owner 与领域 owner | 已安装消费者能否访问知识、账号或业务能力；安装授权不授予券商操作或私人知识访问 |

`visibility`、`access_policy_ref` 和 `credential_provider` 是来源声明。访问状态、授权修订和校验时间由可信安装器及 provider 回读产生，descriptor 自称 authorized 不构成授权。目录显示已公开的条目及授权状态。下载、安装、更新和其他远端读取取决于独立的制品授权。本地已安装项保留管理事实与卸载入口。快速 App state 使用只读缓存，缺少快照或过期时通过 `access_refresh_required=true` 请求 `source_check` 刷新。运行时连接规则见 [Connect 连接授权](./connection-authorization.md)。

## Carrier 与宿主位置

Codex 原生载体负责 Agent Package 的实际插件安装与回读；OPL App 桌面安装包由 App updater 或发行载体维护。Homebrew Tap 原生软件管理与多安装切换已退役，不再属于 v2 软件目录与设置产品面。

## 下载进度与后台安装

安装、更新和修复通过 [Package 后台操作贡献](../../packages/daemon/src/contributions/package-operations.ts) 和 `PackService` 共享同一套操作与进度机制。确认后，可通过同步或 `package_operation_start` 后台 worker 执行 `agent_package_install` / `agent_package_update` / `agent_package_repair`，并通过 `package_operation_cancel` 请求安全边界取消（`pack.operation.cancel`）。App 通过 `package_operation_status` 回读准备、下载、校验、解压、安装和最终结果；下载字节、速度和 ETA 来自传输实际写入量，其他阶段不伪造百分比。原生注册期间不可取消；下载或文件准备期间的取消只产生请求，worker 到达安全边界后才报告 `cancelled`。进程消失报告 `interrupted`，不自动重发生命周期操作。

系统 curl 继续持有 HTTP、重定向与 Range。剩余归档达到 16 MiB 时，worker 默认并行发起 4 个有界 Range 请求，最多 8 个；只有每个响应都返回精确的 HTTP 206、Content-Range 和分片长度时才合并。任何不支持 Range、状态或长度不匹配的响应都会安全回退到既有单连接断点路径。Framework 只补齐当前 OCI 到原生 marketplace 的缺口：digest 命名的私有缓存目录、完整内容校验、暂存与进度投影。此缓存不决定版本、不替代 carrier registry。重复安装先重新验证缓存；断线重试保留 partial，取消和失败均不将 partial 激活。取消安装不会撤销此前已经成功安装的必需依赖。

后台操作按当前 Codex 宿主隔离，并拒绝同一宿主的并发后台安装。离开软件中心或重载页面不会停止 worker。恢复时读取 owner 状态；只有现有 native lifecycle 的最终回读成功才能显示安装完成。

## 安装位置与当前生效来源

统一的是定位、状态和操作方式，不要求所有文件搬进一个物理目录。路径由实际安装器持有；Framework 通过既有 locator、安装收据和 carrier 回读定位，不新增路径注册表。

| 内容 | 现有物理归属 | 更新与移除责任 |
| --- | --- | --- |
| OPL App 与原生应用 | 平台应用目录，例如 macOS 的 `/Applications`；App 随附组件位于其 bundle/runtime 布局 | App updater 或实际安装该应用的原生安装器 |
| Framework 可执行安装 | 所选 npm/Homebrew/OPL managed 或 App runtime 安装；`~/.opl/one-person-lab` 是已有 managed locator 入口 | 对应安装 owner；以宿主实际选中的入口为准 |
| OPL 受管模块 | `OPL_MODULES_ROOT`，默认 `<state_dir>/modules` | 现有模块安装 owner |
| Codex 原生 Package | Codex 的插件安装/cache 布局，由原生 `plugin/list` 回读 | Codex 原生 carrier |
| 开发源码 | 用户选定的 workspace/worktree；通过 Developer Mode 或明确路径覆盖选用 | 开发工作流；不由软件卸载动作删除 |
| 状态、知识与业务数据 | Framework state、用户 Obsidian 和各领域数据目录 | 对应数据 owner；软件更新和普通卸载保留用户数据 |

`opl framework locate --json` 定位当前调用的 Framework root、bin、contracts、state 和模块根目录。它证明该调用的解析结果，不能把从开发 worktree 执行的 CLI 当成用户默认安装证据。Package 的 source policy 区分所需来源、实际来源、配置者及可用性；`configured_by=native_git_checkout` 是原生管理机制，不能仅凭 `git_checkout` 将它标为开发覆盖。显式 Developer Mode、模块路径覆盖或可编辑安装须展示其实际选中的位置和原因。

软件源投影的根级 `installed_products` 保存独立于来源可用性的本机产品回读；当前由 Framework 安装 owner 提供实际安装及维护入口。Homebrew 未安装、tap 未接入或来源缓存失效，不会抹掉这份安装事实；UI 用 `product_id` 将其与来源安装选项归并。其他原生应用继续使用已支持的来源和 bundle 回读，尚未接入的安装器不由此推断为已支持。

Package 目录的 `installed`、`installed_version` 仍表示配置的原生插件 carrier 安装，不能复用这两个字段冒充其他安装器的管理权。`local_installations` 另行投影已支持的 owner 安装收据与 uv tool 回读，保留 `installation_id`、`kind`、`version`、`mode`、`manager`、`management_scope`、`location_ref` 和 `evidence_ref`。`mode=development` 要有可编辑安装或显式开发来源证据；`mode=installed` 表示该安装实例，不声明产品成熟度。目录可以据此说明“本机另有安装／开发安装，当前插件载体未装”，避免把一个 carrier 的空清单说成整个软件未安装。

这些额外实例的 `management_scope=owner_only` 表示更新和移除仍归原安装器，不使用插件安装、更新或卸载 action 操作它们。位置与证据使用安全引用，不在公共目录声明中发布用户绝对路径。尚未支持的安装器需补自身回读 adapter，不能因存在同名 checkout 或命令就合成安装记录。

同一软件可同时有受安装器管理的版本和开发源码。界面应先回答“本机装了什么、现在用哪一份”，再显示其他安装选项。已安装版本来自安装收据或原生回读，生效版本来自实际调用入口，来源版本来自所选分发源；三者不相互补造。开发覆盖启用后，更新动作必须遵守该来源的 owner 规则，不能静默覆盖未提交代码或切回另一个安装实例。

某个安装器没有收据，只能说明它没有持有该安装。例如 Homebrew 未安装 `opl`，不能推断本机没有 npm 或 App 提供的 Framework。确认另一载体已安装后，主目录显示该实例和管理者；Homebrew 来源详情仍显示自己的收据状态。读取不到受支持的安装证据时显示未知，而不是根据仓库目录、文件名或可执行文件的存在猜测版本与管理权。新的安装器接入须补齐自身回读和动作路由，不能只增加一个“已安装”标签。

## 安装与激活的统一模型

产品、可获取版本、安装实例和激活选择是四个对象。一个产品可以从多个来源取得版本，也可以保留多个安装；在同一环境中最多只有一个激活的运行实例。软件中心聚合各 owner 的回读，调用 owner 的切换操作，不持有第二套激活数据库。

- **软件源**回答从哪里取得制品；公开或私有只是访问规则。
- **发布轨道**回答跟随哪组更新，默认 Stable，Nightly 为显式选择。Standard/Full 是同版本的安装规格。
- **安装实例**绑定真实代码路径、版本、安装器、模式和入口。一个目录选项没有安装收据时不是安装实例；多个安装器观察同一路径时合并为一份安装。
- **激活实例**是 owner 当前选择的运行代码。OPL App、Agent、CLI 和协作 UI 通过已有入口读取该选择；附属入口不另建激活身份。

首次安装优先发布者声明的推荐发行；已明确选择的轨道沿自己的精确目标更新。开发 checkout 只有显式接入才成为安装，显式激活才参与调用。目录扫描和版本排序都不能激活源码。开发版支持查看、激活、解除接入；代码更新沿 Git/开发工具执行，解除接入不删除源码或业务资料。旧的有效选择保持回读，不借迁移隐式切换。

本机详情展示 owner 验证的绝对代码路径、安装模式、管理器、当前和可用版本及激活状态。用户资料、Obsidian 正文和密钥不因此进入软件清单。激活和生命周期动作绑定精确 installation_id 与 revision；操作后读取同一 owner。冲突、未知和未激活分别展示，禁止通过最大版本号掩盖不一致。

Framework 托管运行时同样按实际安装执行更新，复用 Framework 自更新器和更新锁。可用版本来自其 OCI 发布频道；旧安装或频道修订的请求不能执行。暂存成功显示待重启，新一代通过启动验证后才成为激活版本；Codex 的版本和健康状态不代替 Framework 自身状态。

有独立原生安装器的 Package 在 `entrypoints` 声明 `kind=opl_software_installation_cli`、`protocol=opl_software_installation.v1`、`runtime`、`source_ref` 和 `operations`。helper 必须随已安装 carrier 交付并纳入 content lock。Framework 通过固定 `--stdin` JSON 调用 owner，不执行 UI 提供的任意命令，也不执行软件源中尚未安装的新 helper。旧 carrier 可按 owner 的 `discovery.kind=macos_bundle` 回读实际 bundle，提示先更新集成组件；此时不猜测激活状态。集成组件记录留在 carrier 详情，不重复算作该产品的另一份程序安装。

helper 的 `inspect` 不联网、不修改配置，返回 `package_id`、`installations`、`active_installation_id` 和 `active_installation_status`。每份实例提供位置、版本、`mode=release|development`、revision、active 和 supported_actions。已有实例的 activate/update/uninstall/unlink 均携带 id 和 revision；update 还绑定精确目标版本。Framework 投影 `installations`、`installation_actions` 及激活状态，App 仅渲染这些 owner 提供的动作。首装用 `operation=install`、精确 version 及安装清单 revision，无 installation_id；fresh inspect 后交还 owner 在锁内核对目标不存在或拒绝覆盖。开发安装保留原选择，安装发布版不自动替换已激活的开发版。

可选的大型数据安装沿用同一个 Package：owner 声明 `installation_scope=supplemental_payload` 和 `installation_profiles`，投影带本地化标签及 profile 的精确安装动作。默认核心 carrier 继续负责代码激活，附加 `data_directory` 与它并存，不替代核心安装或依赖解析。选择附加方式时先由现有 Package 安装器准备核心，并核对所选版本与内容摘要，再执行已安装核心中的 owner helper；附加资料的卸载不移除核心。MAC 素材库以此提供可选离线完整版，默认依赖仍是轻量目录包。

Codex carrier 的实例动作复用已有 Package 生命周期：先核对已装 descriptor、真实位置、版本和 revision，再交给原生管理器更新或移除。开发插件只提供解除接入，保留源码。全局 Developer Mode 的源码维护偏好不等于运行时激活；标准智能体须回读实际 hosted runtime，普通能力包须回读真正的已安装入口，不能把恰好存在的仓库或 monorepo 根版本当作正在使用的软件。

## 名称、说明与状态展示

目录列表以 owner 的正式 `display_name` 为标题，按所选语言使用 `display_name_i18n`；`package_id` 或统一管理条目的稳定 ID 是次级身份，供搜索、复制和 Agent 调用。不得将小写 ID 与其他软件的正式名称混排为标题，也不按 ID 机械生成产品名。

用途说明来自 owner 的 `presentation.description_i18n`。原生插件没有 owner 展示声明时，依次复用其 `interface.shortDescription` 和 `description`。缺失说明保持未知，不重复软件名称作为占位说明；App 不维护独立名称或说明字典。

主列表固定呈现软件名称与短说明、产品类型、已装版本、可用版本、状态和主操作。稳定 ID 可作为名称下的次级文本；同一产品不因多个来源或多个安装实例重复出现。用户可以按已安装、未安装、可更新和产品类型筛选，计数始终与当前管理范围一致。开发接入计入已安装，并以安装方式标签区分，不另设互斥的软件数量。

详情承载来源、安装器、安装位置、多个安装实例、开发模式、依赖和技术合同。源码提交、GitHub Release、制品摘要等是版本证据，放在相应来源或安装详情中，不作为主列表的并列分类。开发接入是安装方式标签；成熟度只展示 owner 的明确声明。

主状态收敛为“未安装、已安装、可更新、需处理、待检查”。已安装不等于已确认最新；更新必须来自 owner 的明确 currentness。未知安装状态显示待检查，未选择安装的可选软件显示未安装而不是故障。权限、调用就绪和领域资格在详情保留各自事实及处理入口，不为简化主状态而丢失证据。

## 版本与更新

目录主列使用“已装版本”和“可用版本”。已装版本来自选定安装实例；可用版本来自当前所选软件源的精确安装目标。多个实例没有唯一选择时，主列提示查看多个安装，详情逐个列出，不拼接多个版本号或擅自选择最高版本。发布者必须为多个可获取目标声明默认选择；已安装来源优先绑定当前更新轨道。主列展示一个精确版本，不以“多个渠道”代替版本。暂缺来源目标用“—”，详情区分尚未发布、访问失败和外部平台负责更新。

`installed_version` 与 `selected_version`/`stable_version` 不一致不自动代表可更新。只有 owner 的 `package_currentness.status=update_available` 才显示更新动作；`available_actions.update` 仅表示执行能力。来源落后于本机版本时保留两份事实，不能提示降级；来源未检查或不可访问时保持待检查。正式 OCI 或原生 carrier 才能提供可用版本，源码 main 的版本号不能代替可获取的安装目标。

OPL App 的“应用管理”是一级能力，与主对话并列，统一呈现“软件目录、更新、共享资源、软件源”。默认展示 OPL 软件，其他来源和运行组件另行查看；产品类型只是筛选。动作仍按 owner action 执行并在完成后 fresh readback。Settings 中保留的细节页是诊断和深链入口，不能另建一套目录或版本注册中心。

公开/私有与访问状态独立于安装状态显示。UI 区分“公开”“私有·已授权”“需要登录”“无读取权限”“授权过期”“访问已撤销”和“尚未检查”，仅使用 owner 提供的明确状态。未选择安装的可选软件归入“未安装”，不计入“需处理”；已安装软件的依赖或访问故障才进入处理入口。更新页只统计当前用户可读取的新版本，不能用无权访问的远端版本制造更新提示。

对 OCI carrier，channel tag 用于发现选定版本，digest 绑定本次下载的具体内容。不可变版本、manifest、payload、source archive 和 content lock 必须保持一致。公开发布用匿名回读证明可获取；私有发布用授权回读证明可获取，并确认匿名访问被拒绝。发布者声明私有时，流水线不能把包改成 public；源代码归档、签名材料和发布附件遵守相同可见性。安装与更新仍由原 carrier 负责，这些校验不另建版本解析器。

第一方发布与下载按 `visibility` 固定选择 namespace：`public` 使用 `one-person-lab-packages`，`authorized_only` 使用 `one-person-lab-private-packages`。访问策略引用必须与私有制品路径一致；私有包发布规则见 [Artifact 与 Package Delivery 边界](../delivery/artifact-package-lifecycle-boundary.md)。

## 软件图标

`presentation.icon_ref` 指向 Package payload 内的真实图标文件。目录从同一 payload 的精确源码提交和文件声明产生 `icon_url`，支持嵌套 carrier 路径；不从软件名称猜路径，也不跟踪可变 `main`。私有来源不产生匿名图标 URL。缺少可读取图标时，宿主按正式名称和产品类型显示可区分的 fallback，不维护固定软件 ID 清单。

## 新项目接入顺序

1. 先确认软件 owner、稳定 identity、产品类型和真实调用入口；采用 OPL Package 时同时声明其技术角色。
2. 补齐 manifest/descriptor、公开或私有可见性、发布来源、carrier 和安装后 readback；私有源还须绑定访问策略与凭证 provider。
3. 在 Framework projection 中登记版本、访问状态、就绪、依赖和 action refs；公开目录不写入本机路径，本地安装回读只展示代码位置，不包含秘密或资料正文。
4. 用 `opl pack list --json` 和 `app.state.get`（`fast`）回读，再在 OPL App 的目录页完成安装、更新、停用、修复和卸载验收。私有源同时验证无权限、过期、撤权、重新授权和账号切换。
5. 用真实 carrier 的安装、更新和卸载回读验证管理能力；按运行依赖显示调用就绪状态。原型与已发行产品使用同一管理规则，开发 checkout 只作为显式开发覆盖，发行与领域业务资格仍由 owner 各自验收。
