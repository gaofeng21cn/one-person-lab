# OPL Release 与 Packages 模块化分发参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_release_packages_modular_distribution`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 定位

- `one-person-lab-app` GitHub Releases 面向用户下载，承载 `One-Person-Lab-<OPL版本>-<平台>-<架构>` 这类桌面 App 安装包。
- GitHub Packages 面向机器消费，承载可独立更新的 OPL 内核包、domain module package channel 与预构建 helper；WebUI/Docker 镜像坐标与发布证据归 `one-person-lab-app`。
- `opl-aion-shell` 继续是 GUI 源码与构建输入；用户入口、版本叙事、下载面、updater metadata、标准 DMG 与 Full 版 DMG 都归 `one-person-lab-app` release。

## Currentness policy

本文冻结 release / Packages / App / package 分发 owner boundary，不冻结日期、OPL 版本号、GUI 版本号、archive size、checksum、package source head SHA、release artifact、workflow run、GHCR digest、branch/SHA state、本机 package build 结果、Full payload layout、App first-run sequence、签名/公证模式或 VM gate 结果。当前 package 坐标、release discipline、channel manifest shape 和 install/update source 必须从 fresh `opl connect packages manifest`、`src/package-distribution.ts`、`scripts/package-module-archives.mjs`、`scripts/package-release-discipline.mjs`、`.github/workflows/release-package-channel.yml`、`.github/workflows/packages.yml` 与相关测试读取；App 下载资产、Full DMG、updater metadata、Full manifest、first-run matrix、签名/公证结果和 release evidence 继续归 `one-person-lab-app`。

稳定读法是：`GitHub Releases` 是用户下载入口，`GitHub Packages/GHCR` 是机器制品通道；当前默认 latest/App install/update 通过 GHCR `one-person-lab-manifest:latest` channel manifest 消费 `one-person-lab-modules/*`。Framework `.github/workflows/release-package-channel.yml` 在 GitHub Release `published` 时自动调用 `.github/workflows/packages.yml`，发布 package source archive 与 release/channel manifest 到 GHCR；`.github/workflows/daily-package-channel.yml` 每天调度一次，生成候选 package manifest，并用 `scripts/package-channel-daily-check.mjs` 只比较 module / capability package source fingerprint；如果相对当前 GHCR `one-person-lab-manifest:latest` 有 source head / archive sha 变化，则默认用当前 UTC `<YY.M.D>` 不可变版本调用 `packages.yml` 发布并移动 `latest`，否则跳过发布。`workflow_dispatch.opl_version` 只作为显式修复 override，不会追加 channel suffix，且不接受 nightly channel 标签。`packages.yml` 仍保留 `workflow_dispatch` 作为人工修复入口。它同步上传 `opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS` artifact，不会在 tag push 时自动发布，也不会发布或在 Framework manifest 中暴露 `one-person-lab-webui`。Developer Mode 是 App/system settings 中启用 GitHub repo / local checkout 模块来源的正式入口；`OPL_MODULE_SOURCE_MODE=git_checkout`、`OPL_MODULE_PATH_<MODULE_ID>` 或 `OPL_MODULE_REPO_URL_<MODULE_ID>` 只保留为低层诊断/CI override。这些 override 不改变普通 latest/App 默认 package-channel 来源。旧文档中 `packages_defined_not_consumed_by_install_update`、`prepared_only_deprecated`、prepared-only module channel 或 stable/nightly 用户通道只描述历史状态，不能作为当前 package channel 语义。

Agent package 与 capability dependency 采用双形态单源：MAS、MAS Scholar Skills 与其他 capability repo 分开维护；MAS agent package manifest 先声明 Agent Package Core：`id/version/digest/dependencies/trust/lock/lifecycle receipt/exposure/shortcut`，再声明 carrier adapters。Agent Package Core 是 OPL/App 管理智能体 package 的核心 owner surface，只管理 package descriptor、digest lock、dependency graph、trust tier、lifecycle receipt、exposure 和 shortcut refs；它不是 domain runtime、不是 domain truth，也不是通用私有 package manager。Codex Plugin/local marketplace 只是 `codex_plugin_carrier`，负责把 package 投影成 Codex 可见面；OPL App shortcuts 是 package cockpit / Home 可见性 carrier；workflow profile 是 Codex 工作流配置 carrier；runtime/app release 是安装与更新 carrier。上述 carrier 可以提供 route、readback、reload guidance 或 owner-specific action refs，但不拥有 package core、package truth、domain truth、runtime authority、release verdict 或 owner receipt。OPL 读取并校验这份 manifest 来生成 package channel、carrier readback 和 dependency graph，不在 OPL 侧 hard-code MAS 私有依赖，也不把 Agent Package 等同 Codex Plugin。原版 Codex App 独立安装 MAS 时没有 OPL managed dependency graph，因此 MAS Codex standalone carrier 应是 fat plugin：把 MAS 默认能力所需的 `mas-scholar-skills` 随 MAS plugin payload 一起 bundle。OPL App 托管 MAS 时，MAS agent package 保持 thin package：`mas-scholar-skills` 作为 MAS required capability package 独立进入 OPL managed dependency graph，由 capability packages channel 单独安装、更新、回滚；Developer Mode 则可以把 MAS package 或 `mas-scholar-skills` source 分别切到 local checkout / repo URL 做开发修复。该读法只描述支撑面和 owner boundary，不声明 live evidence、production ready 或 owner acceptance。

## 当前分发边界

| 分发对象 | 推荐渠道 | 是否打入桌面 App | 理由 |
| --- | --- | --- | --- |
| One Person Lab 桌面 App | `one-person-lab-app` GitHub Releases | 是 | 用户直接下载和安装 |
| One Person Lab Full 首次安装包 | `one-person-lab-app` GitHub Releases 额外 asset | 只打入 Full 包，不进入标准更新包 | 新用户首次安装时按 App-owned Full manifest / product profile 预置声明的 Framework runtime、domain / Foundry modules、provider support payload、companion tools 和 skills；App 自动更新继续走标准包 |
| OPL CLI / shared contracts / native helper | npm / 当前安装脚本；native helper 通过 GHCR OCI prebuild 恢复 | 随一键安装获取 | App 不变时也需要独立修复和更新 |
| MAS | 默认 GHCR `one-person-lab-modules/med-autoscience`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | domain agent 独立演进，按 agent package manifest 声明 required capability dependency，并由环境管理安装/更新 |
| MDS | MAS 显式可选 companion；不进入默认 OPL package / Full payload | 否 | 仅作为 MAS-declared backend audit、provenance、historical fixture、intake 或 parity oracle 引用 |
| MAG | 默认 GHCR `one-person-lab-modules/med-autogrant`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | domain agent 独立演进，按环境管理安装/更新 |
| RCA | 默认 GHCR `one-person-lab-modules/redcube-ai`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | 交付物链路可能较大，不应拖慢 App 更新 |
| OMA (`oma`; package / repo carrier `opl-meta-agent`) | 默认 GHCR `one-person-lab-modules/opl-meta-agent`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | Agent Foundry 的 managed builder/tester module，随 App/OPL 环境维护；`opl-meta-agent` 是 carrier 名，不替代 `oma` 作为 standard-agent canonical id，也不作为默认 Home assistant 入口 |
| MAS Scholar Skills | 默认 GHCR `one-person-lab-modules/mas-scholar-skills`；Developer Mode 可显式切到 local checkout / path / repo URL | 否 | MAS required capability package；Codex standalone MAS plugin 应随包 bundle，OPL App 托管时作为 managed dependency package 独立安装、更新和修复，供 MAS/MAG/RCA/OMA 等 agent 同步到 workspace / quest 使用 |
| OPL Flow | 独立 workflow package；Framework 通过 `opl packages install|update|rollback opl-flow` 执行其 policy | 否 | 声明最小 profile、依赖、冲突迁移和模型推荐；不是 domain module 或 GHCR module package |
| WebUI Docker 镜像 | App-owned GitHub Packages container registry | 否 | 实际坐标、构建发布、digest 和 release evidence 归 `one-person-lab-app`；Framework package manifest 不再暴露该 App-owned reference |

表中的 package、repo、plugin 和 module 名是分发 / carrier 名，不是 standard-agent identity 轴。标准 domain agent canonical ids 仍是 `mas`、`mag`、`rca`、`oma`、`obf`；`opl-meta-agent` / `opl-bookforge` 这类名称只在对应 repo、package、plugin、alias 或 carrier 语境中读取。`mas-scholar-skills` 是 framework capability package，不是 standard domain agent。

## 模块体积基线

本地完整工作树大小不能代表分发体积。分发时不带 `.git`、未跟踪文件、缓存、虚拟环境和构建产物；浅克隆工作树仍会包含 `.git` 元数据，适合作为开发安装方式，不适合作为 App 内置体积估算。

源码归档大小是 release-time manifest fact：`scripts/package-module-archives.mjs` 以每个 module checkout 的 `git archive --format=tar.gz HEAD` 生成 tarball，并把 `source_archive.size`、`source_archive.sha256` 和 `source_git.head_sha` 写入 `opl-release-manifest.json` / `opl-channel-manifest.json` / `SHA256SUMS`。`framework_core.homebrew_formula` 同时从 `framework_core.version` 与 `source_git.head_sha` 投影 immutable GitHub commit archive URL；Homebrew tap sync 下载该 URL 后计算并写入 formula sha256，不能自行推断版本或改用 moving branch/tag。长期文档只保留这个读取规则，不保留某次本地 archive 的 MB 快照。

## Packages 适用方式

当前 GitHub Packages/GHCR 是 latest/App 模块安装更新的默认机器通道。现状是：

- 用户下载入口仍是 GitHub Releases 里的桌面 App 安装包。
- `opl connect packages manifest` 输出 active native helper GHCR OCI prebuild 坐标、MAS/MAG/RCA/OPL Meta Agent active module package 坐标、MAS Scholar Skills framework capability package 坐标，以及 `one-person-lab-manifest` channel manifest 坐标；App-owned WebUI 镜像坐标从 App release/contracts/evidence 读取。旧 `opl packages manifest` 已退役并 fail closed 到 Connect 替代入口。
- First-party OPL agent package 的 dependency graph 来自对应 agent package manifest 的 Agent Package Core；Codex Plugin/local marketplace、OPL App shortcuts、workflow profile、runtime/app release、MCP/Web/native 等只作为 carrier / owner surfaces 投影。MAS manifest 若声明 `mas-scholar-skills` 为 required capability package，OPL 只消费这条声明生成 channel/package/readback；不得把该依赖散落成 OPL 私有常量、App 专属列表、单一 Codex carrier manifest、workflow profile 或 hard-coded MAS 知识。
- Source-only 或尚未发布的 first-party agent package manifest 不携带 `distribution_payload`，package/channel compiler 也不投影空值、预设 `latest` 或 fixture digest。只有真实发布元数据存在时才声明该对象；published registry 的 ordinary-user source 必须绑定合法 distribution payload、immutable tag 与 digest lock。
- Manifest 同时投影 bundled Codex default profile；该 profile 只表达产品默认 provider/model endpoint 与 profile role，不包含 secret，也不替代用户本地 Codex 配置或 executor policy。
- `.github/workflows/release-package-channel.yml` 是自动 release gate：GitHub Release `published` 后调用 packages reusable workflow；`.github/workflows/daily-package-channel.yml` 是 daily change-detected package gate：每天生成候选 manifest，和当前 `latest` channel 的 module / capability package source fingerprint 比较，有变化才默认发布当前 UTC `<YY.M.D>` 不可变版本并移动 `latest`，无变化不推 GHCR；`.github/workflows/packages.yml` 是 Framework package source archive / manifest publish workflow，保留手动 `workflow_dispatch` 做修复。它发布 `one-person-lab-modules/*` 和 `one-person-lab-manifest` 到 GHCR，同时上传 workflow artifact；它不代表 MAS/MAG/RCA/OPL Meta Agent/MAS Scholar Skills 各 repo 已经各自维护独立 GHCR/Packages 发布面。
- `scripts/package-module-archives.mjs` 会生成 `opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS`，并把每个模块的 `source_git.head_sha`、源码包大小和 `sha256` 写入 manifest；Framework core 另投影 Homebrew 所需的 manifest-owned version、source head 与 immutable commit archive URL，tap 只负责下载后计算 sha256。
- `scripts/package-release-discipline.mjs` 是 CI gate：检查 channel manifest、artifact build、checksum、rollback、旧版本清理策略与 active package channel、release-gated `workflow_call` / manual dispatch repair 语义是否齐全。缺 checksum、缺回退策略、缺清理策略，或误称 tag push 自动发布 / Framework-owned WebUI publish 时，package workflow 应直接失败。
- Native helper 预构建 workflow 会继续上传 CI artifact，同时把 tar.gz archive 推送到 GHCR，并在 workflow 内验证 native helper package retention/status policy。
- 默认 latest/App install/update 从 GHCR channel manifest 解析目标模块包；Developer Mode `enabled=on` 且 `mode=developer_apply_safe` 时，模块 source policy 切到 Git checkout，并优先使用本地 sibling repo。`OPL_MODULE_SOURCE_MODE=git_checkout`、`OPL_MODULE_PATH_<MODULE_ID>` 和 `OPL_MODULE_REPO_URL_<MODULE_ID>` 继续作为低层诊断/CI override。
- Codex standalone 与 OPL managed 托管不是两套依赖真相。Standalone fat plugin 只是 Codex Plugin carrier 为了让原版 Codex App 独立安装时可用；OPL managed thin package 通过 manifest package core dependency graph 分开 materialize MAS package 与 `mas-scholar-skills` package，Developer Mode source checkout 只覆盖显式选中的 source channel。
- App 更新后的首次启动会按当前 package-channel 目标补齐缺失模块；显式开发 override 由 operator 负责保持可用，不由 latest/App 默认更新强行覆盖。
- package-channel 模块安装/更新必须先把目标 archive 下载并校验到 managed root 旁的 stage root，再原子激活为 current managed root；旧 current 只在 clean package-channel 或 clean managed git checkout 条件下移动到 previous root，并写入 `opl-runtime-module.json` 的 `package_channel_lifecycle.current/previous/rollback_ref`。rollback helper 只能在 recorded previous root 存在且 current/previous tree hash 均匹配时交换 current/previous；dirty package root、developer checkout、无 lifecycle metadata 的普通目录或本机修改都不得被 silent update 或 rollback 覆盖。
- 新增 framework capability package 时，不新增专属 clone / pull / update manager。维护者必须把 package 加入 agent package manifest / package distribution spec、让 `scripts/package-module-archives.mjs` 生成 archive / manifest / checksum、在 `scripts/package-release-discipline.mjs` 固化 source / scope / artifact gate，并补齐 managed update / startup-maintenance / workspace sync 测试和对应文档。MAS Scholar Skills 是该规则的当前实例：ordinary App 路径复用 GHCR package channel，Developer Mode/local checkout 只作为显式开发者观察源。

## 三层生命周期与 Managed Update Kernel

用户只管理三个对象，`managed_update.components[].component_id` 也只允许对应的三个 lifecycle owner：

| 用户对象 | Canonical 入口 | Lifecycle owner | 内部 provider | 边界 |
| --- | --- | --- | --- | --- |
| OPL Base | `opl update status|check|plan|apply|repair|rollback` | `opl_base` | `runtime_substrate` | 管理 Framework/App-owned runtime root；dependency 与 integration 状态折叠在 Base 内。 |
| OPL App | `opl app state --profile fast` 与 App/host updater | `opl_app` | `installation_carrier` | Framework 只读回 host route；桌面 bundle、Docker/WebUI image、Linux carrier 由 App/host owner 更新。 |
| OPL Packages | `opl packages list|status|install|update|enable|disable|repair|uninstall` | `opl_packages` | `capability_packages` | 管理 package lock、digest、物化、projection、profile migration 和单一 lifecycle receipt。 |

`runtime_substrate`、`installation_carrier` 与 `capability_packages` 只是 adapter dispatch 的 `provider_id`，不是 selector、公共 component 或独立 lifecycle owner。Codex plugin/skill 可见性属于 Packages 的 `projection_status`；OPL Flow profile semantic merge 属于 `profile_migration_status`；companion dependency/integration 属于 Base。旧 component alias、旧 receipt id 和旧 namespace 不迁移，读取时 fail closed。

Kernel 继续提供统一状态词汇、idempotency lock、受控 runner 和 component receipt ledger，但不再把内部 adapter 暴露成用户选项：

| 执行模式 | 适用 owner | 能做什么 | 不能声称 |
| --- | --- | --- | --- |
| `controlled_apply` | `opl_base` | 校验并切换 App-owned runtime current/staged/rollback pointer。 | Homebrew/global npm/system PATH/System Temporal mutation，或 App carrier 已更新。 |
| `auto_apply` | `opl_packages` | 只覆盖 clean managed package target，完成 stage、activate、projection 和 receipt transaction。 | 覆盖 dirty/developer checkout，或写 domain truth/owner receipt/quality verdict。 |
| `manual_required` | `opl_app` 或任何 owner-gated target | 返回 host/owner route、typed reason 与 readback。 | 由 Framework 代替 host updater 或静默覆盖用户 profile。 |

`opl update` 固定选择 `opl_base`，不接受 component selector；`opl packages update` 固定选择 `opl_packages`。两者共享 `managed-update-kernel.lock` 和 `managed-update-component-receipts.json`，receipt 同时记录 lifecycle owner、内部 provider、adapter、content identity、post-apply 与 reload guidance。`opl_app` 只进入读模型和 owner handoff，不进入 Framework apply runner。

受控 adapter 边界保持不变：`runtime_substrate_adapter` 只写 App-owned runtime root；`capability_packages_adapter` 只处理 clean managed package roots；`installation_carrier_status_adapter` 只读 App/host route。Package transaction 后可刷新 plugin registry、local marketplace、plugin-packaged skills 与 OMA generated carrier，但这些都不是第二套 package truth。OPL Flow profile 只能 semantic merge，禁止静默覆盖用户 Codex profile。

App / Settings 的 `module_sync`、`settings_sync_capabilities` 与 `settings_apply_opl_packages` 委托 `opl packages update`；`settings_check_app_update` 委托 `opl app state --profile fast`；`settings_rollback_runtime_substrate` 委托 `opl update rollback`。target-bound workspace / quest Skill sync 仍直接走 `opl connect sync-skills --domain mas-scholar-skills --scope workspace|quest ...`，因为它需要显式用户目标路径。

Packages 是 App 不变时的机器更新通道，但不替代 App repo `Releases` 的用户下载入口。普通用户仍从 `one-person-lab-app` 的 `Releases` 获取桌面安装包；package 安装真相必须记录 immutable version、digest、SHA-256、source fingerprint 或 Git head。MAS/MAG/RCA 等 domain repo 不提供第二套用户安装型 Release，domain truth、artifact body、quality/export verdict 与 owner receipt 始终留在 domain owner。

Manifest 的本地入口只用于读取 fresh machine output，不作为本文冻结的字段快照：

```bash
opl connect packages manifest
npm run packages:manifest -- --version <opl_version>
npm run packages:daily-check -- --candidate-manifest dist/opl-packages/opl-channel-manifest.json --current-manifest <latest-channel-manifest.json> --version <opl_version>
npm run packages:release-discipline -- --manifest dist/opl-packages/opl-release-manifest.json
npm run packages:cleanup-ghcr -- --summary-path ghcr-package-cleanup.json
npm run packages:cleanup-ghcr -- --protected-tag <tag> --execute
```

Fresh 读法按机器入口分层：

| 机器入口 | 当前职责 | 不从本文读取的动态事实 |
| --- | --- | --- |
| `src/package-distribution.ts` / `opl connect packages manifest` | 定义 package manifest shape、module / capability package ids、GHCR 坐标、Codex default profile 投影、install/update source 和 `package_consumption_status`。 | 当前版本号、生成时间、owner、release channel、Codex profile 字段值和 package 坐标的实际输出。 |
| `scripts/package-module-archives.mjs` | 用 package source checkout 的 `git archive --format=tar.gz HEAD` 生成 source tarball，写出 `opl-release-manifest.json`、`opl-channel-manifest.json` 和 `SHA256SUMS`。 | archive size、sha256、source branch、source head SHA 和本机输出路径。 |
| `scripts/package-release-discipline.mjs` | 校验 manifest 声明 package-channel current source、channel manifest output、checksum、rollback 和 retention policy。 | 某次 release 的 previous manifest、retain count、失败列表和实际 gate 输出。 |
| `scripts/cleanup-ghcr-package-versions.mjs` | 按 manifest 的 native-helper active policy 与 active modules/manifest lifecycle 做 GHCR retention dry-run；只有 `--execute` 才删除候选 package versions。 | 当前远端 package version 列表、候选删除列表、显式 protected tag、实际删除结果。 |
| `.github/workflows/release-package-channel.yml` | GitHub Release `published` 后自动调用 packages reusable workflow；手工 `workflow_dispatch` 可作为 release gate 修复入口。 | release event、caller workflow run、被调用 packages workflow run。 |
| `.github/workflows/daily-package-channel.yml` | 每天调度 package-channel change detector；候选 manifest 相对 `one-person-lab-manifest:latest` 有 module / capability package source fingerprint 变化时，默认发布当前 UTC `<YY.M.D>` 不可变版本并移动 `latest`；无变化跳过发布。 | 当天调度 run、候选 manifest、当前 latest manifest、change detector summary、是否实际调用 packages workflow。 |
| `.github/workflows/packages.yml` | 通过 reusable `workflow_call` 构建 package source archive、运行 release-discipline gate、发布 package archive / release manifest 到 GHCR，并上传 release manifest / channel manifest / checksum artifact；直接 `workflow_dispatch` 仅保留为人工修复入口；不构建或发布 WebUI image。 | workflow run 状态、artifact URL、远端 package 可见性和本机 package build 结果。 |
| `.github/workflows/native-helper-prebuilds.yml` / `scripts/native-helper-prebuild.mjs` | 维护 native helper prebuild artifact / GHCR package 的构建入口。 | 具体 target、native helper version、checksum、CI artifact 和 GHCR tag。 |
| `one-person-lab-app` release contracts / workflows / evidence | 拥有标准 App 安装包、Full DMG、Full manifest、first-run matrix、updater metadata、签名/公证和用户下载面。 | App release ready、Full package asset、download URL、latest yml、Full runtime layout、payload refs、签名/公证结果和 release evidence。 |

具体发布物按三层切开：

| 发布物 | 推荐 Packages 名称 | 内容 | 触发方 |
| --- | --- | --- | --- |
| 模块 / 能力包源码包 | `ghcr.io/gaofeng21cn/one-person-lab-modules/<package>:<version>` | 不含 `.git`、缓存、venv、node_modules 的源码归档；当前 lifecycle 为 `active_release_channel` | latest/App install/update 通过 GHCR channel manifest 消费；Developer Mode 可显式 override 到 Git checkout / local path |
| Native helper prebuild | `ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<version>` | Rust helper 二进制、manifest、checksum | `opl system repair-native-helpers` / `opl install`；底层 lifecycle script 为 `npm run native:repair` |
| OPL core npm 包 | `@gaofeng21cn/one-person-lab` 或 npm public package | CLI、contracts、shared helpers、安装脚本 | npm / 一键安装脚本 |
| Release manifest | `ghcr.io/gaofeng21cn/one-person-lab-manifest:<opl_version>`，moving tag: `latest` | 制品版本、module refs、sha256、回滚目标、channel manifest | latest/App install/update 当前读取的 GHCR channel manifest；workflow artifact 是同源审计输出 |

维护规则：

- Release 继续放 DMG/ZIP/DEB 等用户安装包。
- Packages 放 OPL CLI/core、active native helper OCI prebuild、active domain module / framework capability package source archive channel 与 `one-person-lab-manifest` channel manifest；WebUI 镜像发布和坐标归 `one-person-lab-app`，Framework package workflow 只维护 native helper 与 package/channel packages。
- latest/App 环境管理通过 GHCR channel manifest 判断目标模块版本；Developer Mode override 模式下由显式 checkout/path/repo URL 决定来源。
- MAS 与 `mas-scholar-skills` repo 分开维护；OPL 只根据 MAS agent package manifest 建立 required capability dependency graph。需要给原版 Codex App 独立安装的 MAS standalone plugin 可以携带 bundled capability payload；OPL App managed path 不因此把 capability repo 合并进 MAS package。
- Daily package channel 只响应 module / capability package source fingerprint 变化。仅 `generated_at` 或 artifact tag 变化不触发发布；这样避免无内容变化时制造无意义 package versions。
- Daily package channel 的 `workflow_dispatch.force_publish=true` 只用于明确的修复/迁移场景，例如 tag 模板调整后需要把相同 module fingerprint 重新发布到当前 UTC `<YY.M.D>` 或显式 override 版本；常规每日调度继续按 fingerprint 无变化跳过。
- 每个制品必须有版本、来源、校验和、回滚目标和安装策略。
- 旧版本清理不靠手工记忆：package workflow 的 manifest 必须声明 `retain_latest_n_versions_and_declared_rollbacks`，并且 cleanup 只能是 `dry_run_first_explicit_execute_required`。`latest` moving tag 和显式 protected tag 始终受保护；后续 GHCR retention/cleanup job 只消费这个策略，不重新解释模块状态；真正删除 package version 需要显式执行与 package admin / `delete:packages` 权限，不在普通 release workflow 中隐式发生。
- `MDS` 不进入默认 manifest / Full payload；如 MAS 需要 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle，只能通过 MAS 明确声明的可选 companion 路径读取。
- `OPL Meta Agent` 与 `MAS Scholar Skills` 当前源码已纳入 Framework package manifest 的 active package 集合；实际可拉取性以 workflow 发布结果和 GHCR package 可见性为准。`opl-flow` 不属于 domain module 集合，它走 Framework-owned workflow package lifecycle。
- 若后续改变 package channel、override 语义或重新引入 Framework WebUI reference，先改 `src/package-distribution.ts`、release discipline、workflow 和相关测试，再更新本文。

## App 内置策略

标准 App 和自动更新包默认不把 `MAS/MAG/RCA` 打进桌面 App：

- App 更新频率应由 GUI 与 OPL release 节奏决定。
- domain modules 的修复、回滚和验证应独立于 App 发版。
- Docker/服务器用户更适合直接拉 WebUI 镜像和模块制品。
- 专业用户可能已有本地 sibling checkout，OPL 应优先识别并复用，不强行覆盖。

Full 首次安装包是 App repo 标准 App 之外的额外 GitHub Release asset，用于减少新用户从安装到开始 MAS/MAG/RCA 工作的等待。Framework 只作为 Full 版 DMG 内 runtime/CLI/contracts 的内容来源，不拥有 App 发布流程、Full manifest、updater metadata、first-run VM gate 或签名/公证结果。

当前 Full 首次安装包的具体文件名、runtime 安装路径、runtime metadata 路径、payload allowlist、Codex / Temporal payload assertion、size budget、同 tag 刷新策略、`latest*.yml` 排除规则、签名/公证模式和 VM release gate 只从 `one-person-lab-app` 的 `contracts/app-release-channel.json`、`contracts/app-first-run-test-matrix.json`、`scripts/full-first-install-package.ts`、`scripts/build-full-first-install-package.ts`、`scripts/publish-release.ts`、release workflow 和远端 release evidence 读取。OPL 支撑文档只保留稳定边界：

- Full 是 first-install download，不是标准 updater channel；标准 App 自动更新继续只读 App-owned standard metadata。
- Full payload 只能 assembly / validate declared framework runtime、domain module、Foundry Agent 和 companion tool payload；runtime truth、provider implementation、domain truth、quality verdict 和 artifact authority 仍归 OPL Framework 与 domain agents。
- Full runtime readiness 以 App-owned first-run / release gate 读取；Temporal-backed provider 是 production online runtime 的必需 substrate，Hermes/Gateway payload 只能作为退役或显式 diagnostic/proof 语境，不能写成 Full 默认在线底座。
- App release ready、Full package ready、签名/公证通过、VM smoke 通过或 user-path evidence observed 都不能由本文推出；必须回到 App repo contracts、workflows、release evidence 和真实 GitHub Release assets。
