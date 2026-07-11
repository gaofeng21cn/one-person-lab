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
| OPL Flow | 不属于 `one-person-lab-modules/*` package；从 `gaofeng21cn/opl-flow` 安装 Codex workflow plugin/profile | 否 | 只负责 Codex 工作流 profile、角色库和 managed instruction block，不是 domain module 或 GHCR module package |
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

## Managed Update Kernel

`opl update status --json` 是 OPL 基座统一的受管组件更新状态面。它投影 App 内部 managed components：App-owned runtime substrate、GHCR capability packages、companion tools，以及 projection-only 的 Codex surface 可见面/reload guidance。Managed Update 只做 owner route、component receipt、safe action refs 和 readback projection；它不是 OPL 私有 package manager，也不把 Codex Plugin/local marketplace、OPL App shortcuts、workflow profile、runtime/app release 合并成同一 mutation owner。Installation carrier status 由 App 侧投影到统一更新视图，但桌面 App bundle、Docker/WebUI image 与 Linux package carrier 的 host update route 不进入 Framework managed-update kernel，也不能由 `opl update apply` 声称完成。

新增更新相关术语只按 `contracts/opl-framework/managed-update-kernel-contract.json#update_plane_state_machine` 读取，不再各自扩成独立概念。稳定状态机只有四类：

| 状态 | 能做什么 | 典型对象 | 不能声称 |
| --- | --- | --- | --- |
| `auto_apply` | clean managed target 可以由 Framework 下载、校验、stage、activate、post-apply 并写 receipt。 | `capability_packages`：MAS/MAG/RCA/OMA/MAS Scholar Skills package channel。 | domain truth、owner receipt、quality/export verdict、App release ready。 |
| `controlled_apply` | 只通过显式受控命令改 OPL/App-owned runtime root，并保留 current / staged / rollback pointer。 | `runtime_substrate`：App-owned runtime root、embedded Codex executor、framework runtime artifact channel。 | Homebrew/global npm/system PATH Codex/system Temporal mutation、installation carrier update。 |
| `prompt_only` | Framework 只给 owner-specific route、命令提示或 semantic merge packet；实际更新由对应 owner/host 执行。 | `installation_carrier`、`workflow_profile`、`companion_tools`。 | 自动替换 Docker/WebUI host、Linux package carrier、桌面 App bundle，或静默覆盖用户 Codex profile。 |
| `projection_only` | Framework 只展示派生状态、reload guidance、refs 和 safe action label；不是 apply target。 | `codex_surface`、carrier readback、workflow profile readback。 | domain truth、owner receipt、App release currentness、carrier update complete。 |

因此术语归并如下：`Runtime Fabric` / `Environment Materializer` 属于 runtime substrate 或 runtime environment materialization 的受控 runtime root 语义；`framework runtime artifact channel` 是 `runtime_substrate` 的 controlled artifact source；`Linux runtime self-update` 若指 App-owned runtime root，则是 `controlled_apply`，若指 Linux package carrier，则是 `prompt_only` 的 host package route；`carrier route` 和 `WebUI host update` 都是 installation carrier 的 prompt-only host route；`workflow profile projection` 是 OPL Flow profile 的 semantic-merge projection，不是 `opl update apply` target。

当前 Framework 已落地的是 `opl_managed_updater_kernel` 的状态、计划、修复 action refs、idempotency lock、统一状态词汇、受控执行 runner 和 component-level receipt ledger。它是统一更新协调面，不是每个 component 各自对外暴露更新外壳。每个 component 输出 `coordination_role`：`executable_target` 仅限 `runtime_substrate` 与 `capability_packages`，`derived_projection` 用于 `codex_surface`，`owner_handoff` 用于 installation carrier、companion tools 与 workflow profile。`opl update status/check/plan` 只读投影；`opl update apply/repair/rollback` 会获取 `managed-update-kernel.lock` 单写锁，调用对应 provider adapter，写入 `managed-update-component-receipts.json`，再把 latest receipt 投影回 component 状态。锁竞争以结构化 `managed_update_lock_contention` 报告，避免 App 启动维护、后台 daily、手动检查更新同时执行 staging 或 skill/plugin sync。`capability_packages` component 同时覆盖 domain / Foundry module package 和 framework capability package；MAS Scholar Skills 在这里作为 package-channel target 参与 install、update、rollback 和 post-apply skill exposure。

受控执行仍保留 adapter 边界：

- `runtime_substrate_adapter` 只调用 App/OPL 管理的 Codex runtime substrate action，receipt 记录 runtime 版本、current/staged/rollback pointer 与 smoke/post-apply 结果；它不静默修改 Homebrew、global npm、system PATH Codex 或 system Temporal。
- `capability_packages_adapter` 对普通用户的 clean managed module root 执行 install/update/sync，并刷新 plugin-packaged skills、plugin registry 与 OMA generated plugin surface；dirty checkout、Developer Mode checkout、ahead/diverged/unknown checkout 会进入 manual/repair 语义，不被静默覆盖。
- `codex_exposure_status_adapter` 只投影由模块状态派生的 Codex skill/plugin/local marketplace 可见面和 reload guidance，不拥有 package core、domain truth，也不是 `opl update apply --component` 的 mutation target。
- Installation carrier 不属于 Framework managed-update kernel。桌面 App bundle、Docker/WebUI image、Linux package carrier、标准 updater metadata、签名/公证和用户下载资产继续归 `one-person-lab-app`；Framework 只输出 runtime substrate、capability packages、companion tools 等内部 managed components，并把 Codex surface 作为 post-apply projection/reload guidance 投影出来。
- OPL App shortcuts 与 workflow profile 只消费 package lock、lifecycle receipt、owner route readback 和 reload / semantic-merge guidance；它们不能成为 package dependency graph、release currentness、domain readiness 或 owner receipt 的第二真相源。

这个入口不替代具体 adapter：

- Installation carrier 仍由 App repo 的 standard updater、Docker/WebUI host route、Linux package carrier 和 release assets 治理。
- Runtime substrate 仍只允许写 App-owned runtime root、staged root、current pointer 和 rollback pointer，不静默修改 Homebrew、global npm、system PATH Codex 或 system Temporal。
- MAS/MAG/RCA/OPL Meta Agent/MAS Scholar Skills 的普通用户来源仍是 GHCR `one-person-lab-manifest:latest` 与 `one-person-lab-modules/*` package channel；`latest` 只作为 rolling channel selector，安装真相必须记录 immutable version tag、digest、sha256、source fingerprint 或 git head。
- Codex plugin registry、local marketplace、plugin-packaged skills、OPL App shortcuts、workflow profile 和 OMA generated plugin surface 是 package update 后的 post-apply projection/reload guidance，不是第二套 package truth 或 domain truth，也不通过单独的 `codex_surface` / shortcut / profile apply 完成。

App / Settings 的更新类 action 默认消费 `opl update` 协调面：`module_sync`、`settings_sync_capabilities` 与 `settings_apply_opl_packages` 委托 `opl update apply --component capability_packages`，`settings_check_app_update` 委托 `opl update status --component installation_carrier`，`settings_rollback_runtime_substrate` 委托 `opl update rollback --component runtime_substrate`。target-bound workspace / quest Skill sync 仍直接走 `opl connect sync-skills --domain mas-scholar-skills --scope workspace|quest ...`，因为它是显式目标投影，不是后台包更新 shell。

`opl update plan --component capability_packages --json` 给出安全 action refs，例如 `opl connect reconcile-modules --json` 和 `opl connect sync-skills --json`。`opl update apply --component capability_packages --json` 会实际运行受控 adapter 并写 component receipt。dirty checkout、Developer Mode checkout、ahead/diverged/no-upstream checkout、domain truth、owner receipt、artifact body、quality/export verdict 都不属于 silent updater 的 mutation scope。

`Packages` 是 App 不变时的机器更新通道，但它不替代 App repo `Releases` 的用户下载入口。新手用户从 `one-person-lab-app` 的 `Releases` 下载桌面安装包；macOS arm64 可选择 App-owned Full 首次安装资产来预置 Full manifest / product profile 声明的 runtime、domain / Foundry module、provider support、companion tool 与 skill payload。MAS/MAG/RCA 等 domain repo 不再提供用户安装型 GitHub Release；MDS 只保留为 MAS 显式声明的可选 companion / provenance / audit / oracle 引用，不作为 provider adapter、默认分发模块或 Full payload。

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
- `OPL Meta Agent` 与 `MAS Scholar Skills` 当前源码已纳入 Framework package manifest 的 active package 集合；实际可拉取性以 workflow 发布结果和 GHCR package 可见性为准。`opl-flow` 不属于这个集合，它走 Codex workflow plugin/profile 安装边界。
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
