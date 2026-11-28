# Artifact 与 Package Delivery 边界

本文解释 artifact body、Package publication和Framework refs transport的owner分工。

## Artifact

domain owner创建和修改artifact body，并决定quality、canonical、export和delivery状态。Framework可以保存locator、hash、lineage、receipt ref、retention和restore proof。

```text
domain output
  -> owner manifest / receipt
  -> runtime artifact root
  -> Framework refs/index
  -> App/operator projection
```

文件存在、hash匹配或projection可见都不等于owner accepted。

## Stage artifact

一个Stage Attempt的artifact unit至少绑定：

- StageRun/Attempt identity；
- inputs/outputs；
- artifact manifest；
- evidence和receipt refs；
- content integrity；
- current/canonical/export owner decision。

Framework可以验证结构、投影和恢复；只有domain owner能promotion或accept。

## Package

Package owner持有descriptor、runtime bytes、version和publication。native carrier持有安装/启停/currentness。Framework只下载/验证/hand off owner bytes或调用carrier，并聚合installed/callable。

`ordered_path_length_file_length_bytes` 的字节编码由 Framework 的 [`content-lock.ts`](../../packages/pack/src/build/content-lock.ts) 持有，并以 UTF-8、二进制内容和路径顺序的同一向量验证一致性。具有独立分发载体的调用方可通过 `opl pack build` / `verifyReleaseLock` 与内容锁保持一致；路径选择、identity 和 canonicalization 校验仍由实际调用方负责。

依赖发布解析由 `scripts/resolve-dependency-releases.mjs` 消费 `contracts/opl-framework/dependency-release-sources.json`（需构建源码的依赖绑定 tag commit 或 npm `gitHead`）。`OPL_DEPENDENCY_ARCHIVE_CACHE_DIR` 仅缓存经精确 SHA-256/npm SRI 核验的工具原始归档；Hosted Package source 的归档解包基于 PAX/GNU 元数据校验成员路径与根目录包含性。

私有 Package 从其私有 owner 仓库运行统一发布器，使用该工作流自身的 `GITHUB_TOKEN`
读取精确源码并访问私有 registry。跨仓公开分发已获明确授权的私有源码时，可使用单仓
只读 Deploy Key。公钥登记在对应源码仓库，
私钥保存于受保护发布环境的 `OWNER_SOURCE_READ_KEY_<OWNER>_<REPO>` secret；
`<OWNER>/<REPO>` 取自 canonical Package manifest 的 `source_repo`，转为大写并把
`/`、`.`、`-` 替换为 `_`。例如 `example/private-agent` 对应
`OWNER_SOURCE_READ_KEY_EXAMPLE_PRIVATE_AGENT`，无需新增 Package 名单。
已有 `OWNER_SOURCE_READ_TOKEN` 仍可用于权限限定为所选源码仓库 `Contents: Read`
的检出；公开仓库可沿用工作流自己的 `GITHUB_TOKEN`。凭据只用于源码检出，且不
持久化到 Git；OCI 写入仍使用工作流自身的 Package 权限。

公开 OCI 通道包含完整已提交源码归档，不能把“源码仓库仍私有”当作
归档仍私有。工作流在检出私有源码前匿名核对仓库可见性；公开源码可直接继续，
私有源码须先取得 owner 对该版本完整归档公开的明确授权，再由受保护发布环境的
`PUBLIC_SOURCE_ARCHIVE_COMMIT_<OWNER>_<REPO>` variable 绑定精确源码 commit。
该变量采用上述相同的仓库名称归一方式；读取源码的凭据不构成公开授权。网络错误、
未知可见性、缺失或不匹配的授权均在归档及 OCI 写入前停止。源码仓库自身的可见性不变。

Package status、列表与生命周期命令对原生发现失败保留错误，不将失败解释成空的安装清单。

原生 `plugin list` 读取统一使用 10 秒超时；超时终止子进程，严格发现入口返回失败，不接受未完成命令的部分输出。安装、更新等写操作保留独立的 120 秒上限，超时后的实际结果仍需重新读取确认。

Standard Agent 安装、更新或修复时，carrier adapter 从已选择版本的 owner OCI artifact
读取 manifest、payload 和 source layer，核对身份、源码提交、layer size/SHA-256 及
carrier content lock。完整源码与最小插件一同保存于原有 marketplace 根，原子替换后再交给
原生插件管理器。归档中的 Package 描述文件优先读取根目录；根目录未提供时，读取已绑定
payload `source_root` 下的 `opl-package.json`，仍验证物理路径及 Package 身份，不扫描或猜测其他目录。
Full 中存在与当前 owner 版本及 payload source commit 完全匹配的签名源码 seed 时，
同一 carrier adapter 可从 seed 读取字节；仍核验每个 payload 摘要和 content lock，并复制到
原有 marketplace 安装根。seed 不解析 latest、不改变安装选择或 currentness；不匹配时使用
既有 OCI transport，损坏字节直接失败。

下载临时目录不作为运行根。既有 marketplace marker 记录 artifact/source
digest，接口发现与 Hosted action 使用同一个父级源码根，不创建独立 Package registry、
版本指针或源码缓存。缺失声明的 descriptor/action catalog 时，Package status 显示
`hosted_agent_source_unavailable`，保留 carrier callable 的独立事实，提示重新安装 Package。
显式选择 installed/managed 来源后，邻近开发仓和旧 module 镜像不覆盖该选择；显式环境路径仍作为开发覆盖。分离的开发运行根与安装 carrier 必须具有相同 owner 身份、版本、插件选择器、publication 和领域描述入口。启动前检查与实际调用共用身份读取与比较规则，不匹配时返回 `hosted_agent_runtime_identity_mismatch` 并关闭 launch。
这些检查证明源码与入口文件可用；Runway、实际 StageRun 和领域业务验收分别回读。当 Catalog 已选定 `v2_release` 时，若选定 OCI manifest 缺失或不可读，resolver 直接返回 `PACK_DOWNLOAD_FAILED` 并 fail closed，不静默回退旧版 v1 payload；发布前通过 `opl pack inspect` / `opl pack build --dry-run` 与 `scripts/prepare-v2-package-publication.mjs`（含非根 `source_root` 支持）验证源码归档、descriptor 身份与内容锁，不修改用户安装状态，也不替代依赖安装、登录及 clean-VM 验收。
已安装在 OPL state 受管 marketplace 目录中的本地插件包，更新和修复复用安装时的
payload 物化路径，不退回 descriptor 中的 Git 仓库地址另建 marketplace。已有 Git
carrier 和显式开发目录继续使用原有生命周期，不因存在 payload 声明而切换安装来源。
更新目标的版本与能力取自当前 owner projection；是否使用托管 payload 路径取自已安装
carrier 的实际目录。选中新版 projection 时仍保留这项安装事实，更新与修复均遵循此规则。

显式批量更新和修复先按当前 owner 版本核对安装源；已退役、仅开发使用或没有可验证来源的
安装项返回 `skipped` 并说明原因，不调用 carrier，也不计为更新失败。显式操作仍可更新
已停用、第三方和用户管理来源的安装项；后台维护继续使用更严格的自动更新资格。

Capability Package 仅在声明 `publication_ref` 时进入 OCI source acquisition。`local_component`
由父产品交付：只有 Full seed 与 owner 版本、source commit 和物理 owner 描述匹配时，
Framework 才投影安装或修复动作，并继续执行 payload 摘要及 content lock 校验；没有匹配 seed
时不提供安装动作，也不回退在线下载。其他未声明 publication 的外部 Package 保留原生 transport。
已声明但格式或身份不合法的 OCI reference 仍拒绝安装，不回退到其他来源。

Package 不存在共享 Release Set、聚合 `latest-stable` 或整套冻结前置。每个
Package 只发布自己的 immutable version 与 owner channel；Framework、App 和
Homebrew 分别消费自己声明的 artifact。消费者可以在安装或运行时自由组合
不同版本的 Package，不需要等待其他 Package 同步，也不生成组合 currentness。

Framework v2 从官方 Catalog 在线安装时，下载软件中心所展示的编号版本，始终基于 `v2_release` 读取版本与归档摘要，不再保留 v1 过渡回退。
目标态已落地：`v2_release` 必须在不可变 OCI publication 与 manifest readback 成功后才能进入 Catalog，
缺失或损坏的选定 manifest 必须 fail closed，不把 v2 选择降级为 v1；当前已清零的收敛清单见[当前差距](../active/current-state-vs-ideal-gap.md)。
精确发布安装继续核对指定版本与摘要。Full 离线安装将冻结 seed 作为匹配的公开字节加速源，不屏蔽 `authorized_only` 私有源与在线目录更新。

系统 Codex App 只承载用户直接使用的交互式插件。descriptor 声明
`codex_surface.interaction_mode = headless_internal` 的内部能力 Package，
使用 OPL state 下的 `internal-package-carrier` 作为独立 `CODEX_HOME`，仍由
Codex 原生插件管理器安装、更新和卸载；Framework 聚合两个作用域的真实安装状态，
不维护第二套 registry、lock 或 currentness。内部作用域不复制用户认证、会话或 Profile。

微信远程由 Studio 的原生通道插件交付。Fleet Agent 与 Scholar Skills 保留其 Package 安装及调用入口，Relay、Persona、Flow 和领域 Agent 等交互式入口继续使用用户 Codex 配置。

官方软件目录 `gaofeng21cn/opl-catalog` 保存 Package 投影、不可变版本的 payload manifest 和 carrier allowlist。Catalog 索引发布当前目录条目。历史入口可通过精确 Git revision 与不可变发布产物追溯。测试验证当前 descriptor 与不可变 payload 的身份绑定、同版本写入拒绝和 seed 摘要匹配。

所有已准入 Package 均声明 `opl.package.v2` 并由当前 Framework v2 构建器统一校验和打包，不再依赖旧提交上的载体路径解析器。

Flow managed policy 由安装的 owner descriptor 指定来源，Framework 解释 `opl_flow_workflow_policy.v4` 的 required、experience baseline 和 optional 能力平面。

Agent Reach 由其 CLI 维护，Framework 读取 `version` 和 `doctor` 的结构化输出并用 `skill link <skills-dir>` 补齐缺失 Skill；包就绪检查验证 CLI 和诊断结果，具体渠道状态由 Agent Reach 返回。

### 媒体能力包

包含媒体的独立 capability package 与标准 Agent 共用 OCI 源包获取、精确版本与载荷校验。源包允许最多 2 GiB，下载落盘并按流计算 SHA-256；JSON 与单个载荷文件继续使用 128 MiB 边界。发布校验只解包一次，安装时逐文件写入并从磁盘计算内容锁。只有标准 Agent 要求 domain descriptor，资产 capability 的入口与内容由自身 owner descriptor 与内容锁定义；安装更新使用 required closure。

## Publication

独立publication只在真实外部consumer、不同release cadence或独立rollback需求存在时建立。source repo、workspace Package和published artifact是不同层。

publication完成至少需要owner workflow、immutable ref/digest、可见性和consumer readback。本地build、task branch或Framework catalog不能替代。

Framework 维护 Framework channel，App 维护 App release channel，每个 Package 维护自己的
package channel。每日观察报告汇总这些入口的运行与公开回读；发布版本、冻结候选和
更新指针由各自的 owner 管理。App 安装包自身的
构建来源、签名、公证和制品校验只描述该安装包，不规定外部 Framework
与 Package 的安装组合，也不能成为其发布前置。

Framework 的入口为 `.github/workflows/publish-framework.yml`；它仅发布
`one-person-lab-framework:<SemVer>` 并推进该 artifact 自己的 `latest-stable`。
自更新直接读取 OCI manifest 的 version、revision 和唯一 Framework source layer，
按 digest 校验下载内容。Homebrew Formula 消费同一 Framework artifact，
App Cask 消费 App 的发布结果，两者独立推进。

### 跨产品与日常发布边界

跨产品日常编排（`control-daily-releases.yml`）、纯只读全景看板（`observe-daily-releases.yml`）、macOS Sparkle 复用打包链（`reusable-macos-sparkle-release.yml`）及标准回执契约（`opl.release-receipt.v1`）均由横向发布平台 [`gaofeng21cn/opl-release`](https://github.com/gaofeng21cn/opl-release) 持有。`one-person-lab` 仅保留自身的 `product-release.json`、`publish-framework.yml`，以及因其绑定 `one-person-lab-packages/*` GHCR 命名空间所有权而保留的 `opl.package.v2` OCI Package 发布通道（`daily-package-channel.yml`、`daily-package-channel-publication.yml` 与 `publish-package.yml`）。

每个产品仓库保留各自的版本、构建、签名、公证、干净设备验收与发布决定；`opl-release` 通过协议探针（OCI / GitHub Release / Sparkle Appcast）与标准 `opl.release-receipt.v1` 产物只读汇总全家族状态，不持有任何产品私有的发布特判逻辑。

全部活跃 Catalog Package 均已迁至 `opl.package.v2`：日跑工作流直接基于当前 Framework `main` 构建与发布（已清除 pre-v2 固定工具提交及对 `opl-flow` 的反向调用），`publish-package.yml` 对公开 Package 同步产并上传标准 `opl.release-receipt.v1` 产物。

## 软件包的发布入口

Package 只有一套软件包发布机制：`publish-package.yml` 发布不可变版本并推进该
Package 自己的 `latest-stable`。用户通过 `opl pack ensure <package-id> --json` / `opl pack install <source> --json`
安装，或在 OPL 的软件包界面选择安装；原生插件管理器负责实际载体生命周期。

一个 Package 是否已进入该流程，从它当前 projection 的
`codex_surface.configured_codex_plugin_carrier.publication_ref` 读取：指向
`one-person-lab-packages/<package-id>` 的 reference 与 `latest-stable` channel tag
共同表示它已有 OCI 渠道。已有 OCI 渠道的 Package 不再新增第二种机制：不创建
GitHub Release 页面及附件，也不建立 ZIP、wheel 等平行安装包发布脚本。源码的
annotated tag 仍用于绑定正式发布内容；版本说明直接使用仓库文档与源码变更记录，
不构成第二个发布渠道。README 提供统一安装命令和 OCI 地址。

私有 Package 从其私有 owner 仓库通过薄 workflow 调用同一个 `publish-package.yml`，使用自身 `GITHUB_TOKEN` 与受保护 `release-stable` 环境签名密钥（第一方优先使用随 Framework 交付的 `contracts/opl-framework/keys/private-packages/<package_id>.pub` 公钥验证，或回退已有 `private-package-signing.pub`）。新私有 namespace 先上传固定无敏感内容标记并经只读核验证明 `visibility=private` 与匿名访问拒绝后，再上传源码、manifest 与载荷。跨仓公开分发已获授权的私有源码可使用只读 Deploy Key（`OWNER_SOURCE_READ_KEY_<OWNER>_<REPO>`）或 `OWNER_SOURCE_READ_TOKEN` 检出，并通过 `PUBLIC_SOURCE_ARCHIVE_COMMIT_<OWNER>_<REPO>` 绑定精确源码 commit 授权。公开 `Daily OPL Package Channel` 同步私有包在 `opl-catalog` 的投影并刷新其私有 wrapper pin，不读取私有源码，实际构建与 OCI 推送仍由各自私有 owner 工作流接力。

该规则覆盖全部 package id。未进入 OCI 流程的内部模块由各自 owner descriptor 声明其 carrier 与安装入口。App 等独立安装产物的 Release Bundle 控制面、Schema 与发布说明校验由 `one-person-lab-app` 自行持有；领域质量、资格和运行可用性与软件包发布分别据实记录。

## 每日稳定发布

`daily-package-channel.yml` 每天检查已准入 Package 的 owner `main`。owner 根目录的
`release-automation.json` 声明 `daily_patch` 或 `manual`、正式载体生成与验证命令，以及
额外版本文件（由 `scripts/package_release/owner.py` 中的 `owner_settings` 校验字段结构）。`release_paths`
把同产品的原生界面、构建脚本等源码纳入变更检测。源码位置、Package
身份、公开/私有访问策略和交付文件仍来自现有 descriptor、publication source 与内容锁。

`product-release.json` 的 `package` lane 声明中央每日派发入口。Framework 核对 Package Release GitHub App 的数字身份、`opl-release` 主线定时任务的首次运行及历史派发，再进入现有完整扫描。中央派发验收后，将 Framework 仓库变量 `OPL_RELEASE_CENTRAL_DAILY` 设为 `true`，即可跳过本地定时运行。按包指定的手动恢复沿用同一工作流。

`publication_channel_admission=retired` 停止该 Package 的新发布、默认注册和安装来源，
同时保留已有安装的身份、私有访问策略及原生 carrier 管理。退休元数据不形成新的
发布目标；历史载荷的不可变来源继续保留。

没有交付内容变化时跳过；已有合法的新版本就复用，有变化但版本未提升时递增 patch。
major/minor 由 owner 显式选择。通用版本准备只修改已声明的版本文件，调用 owner 的载体生成
命令后重新验证内容锁。JSON、Python、macOS plist 和 Windows project 使用同一产品版本；
macOS 内部 build counter 保持递增。已有新版本也重新对齐已声明文件。
`release_workflows` 声明同 tag 的原生发布 workflow；准备器回读准确源码与 tag 的成功运行后
才生成稳定 OCI 投影。签名、公证、原生构建与资产回读继续由产品的原生发布器负责。
精确主线 CI 失败时停止该包；版本与投影变更通过 PR 和精确 head CI 合并，
合并前重新检查主线未前进，源码 tag 绑定实际合入的提交。
合并后逐树核对正式源码与已经通过 PR CI 的文件树一致；相同字节不重复等待 merge/tag
再次触发的通用扫描。原生发布 workflow、精确 tag、签名与 OCI 门禁仍独立执行。
跨仓身份使用 OPL Package Publisher 的短时 GitHub App token，CI 正常触发。App 安装覆盖账号的当前及未来仓库；每日任务根据
Framework 动态准入和 owner 配置选择发布对象，新 Package 无需重复配置安装范围。
未声明 owner 配置、未知可见性和无权读取分别记录，不解释成缺版本或缺产物。

Framework 随后使用 `v2_projection.prepare_v2_projection` 生成 `opl-catalog` v2 投影和目录索引，Catalog CI 通过后合入。现有 `publish-package.yml` 消费该不可变 Catalog 快照。每日计划绑定工作流源码、Framework 工具 commit、Catalog 投影 commit、owner 源码、版本、前序 digest 和稳定发布请求 ID。发布器在进入自动环境前从 GitHub 回读同一主线任务及 artifact，逐字段校验，并对公开 Package 生成并上传标准 `opl.release-receipt.v1`；手动发布继续使用原受保护环境。私有包仍从私有 owner 的固定 Framework wrapper 执行并使用原有私有签名环境，公共调度只读状态与派发，不取得私有签名密钥。发布回执和签名证明同时记录 Framework、Catalog 和 owner 的准确提交。

稳定请求 ID 由 Package、版本和源码提交组成，跨日回读相同身份的在途和成功运行，避免
重复排队。已存在的准备分支按完整文件树核对；相同内容沿用原提交和 CI，不同内容保留并报告冲突。
单包版本冲突、CI失败、访问失败和未知派发结果单独记录，其他合法候选继续。
私有发布入口的同步失败也只阻止对应 Package，当前批次继续检测其他候选。
已发布载荷的源码与 owner 当前 main 没有共同祖先时，准备器先确认两个准确提交均可读，
再抓取原提交并按 owner 既有交付路径比较字节。该比较不改写旧载荷来源；缺失提交、
身份拒绝和其他比较错误继续阻止该 Package 的准备。

准备失败的 Package 从当天发布计划排除；派发任务在处理完合法候选后汇总失败并标红，
保留逐包结果 artifact 和任务摘要，便于定位和下次对账。
未知写结果先按请求身份回读；不可变版本、单包串行、前序 digest/CAS、可见性、回执和证明
验证继续由同一个发布器执行。`latest-stable` 更新表示有新软件包可安装，设备是否自动更新
遵循用户已有安装策略。

RedNote Steward 的独立安装脚本读取同一 OCI `latest-stable` 和源码层，校验 manifest、
各 layer 与 payload 文件摘要，随后交给它原有本地安装器。Package-only 软件以 OCI 为唯一
稳定制品源，移除没有消费者的旧 GitHub Release 下载对象，源码 tags 保留历史。
同一产品的 Package 与原生 App 共享版本和源码 tag；GitHub Release 只承载该版本确有需要的
原生或设备安装资产。旧迁移产品仅保留实际仍被旧客户端读取的最终桥接版本，页面明确指向
继任产品；不继续发布另一套产品版本。安装/升级 feed 与固定迁移资产先核对消费者再清理。

## App

App展示artifact和Package state，发起受控action，并持有App release truth。App不读取domain artifact body来推断quality，也不建立第二Package carrier。

## Safety

- path、symlink、scope、hash和authorization不满足时fail closed；
- destructive cleanup需要owner receipt和restore/retention policy；
- repair只修改当前owner的index或transport；
- publication、submission和external mutation单独授权。

## 验证

分别验证 artifact integrity、owner receipt、Package publication、native carrier installed、effective entrypoint 和 App user path。任一层通过都不能外推其他层。
