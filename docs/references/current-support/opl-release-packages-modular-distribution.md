# OPL Release 与 Packages 模块化分发参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_release_packages_modular_distribution`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 定位

- `one-person-lab-app` GitHub Releases 面向用户下载，承载 `One-Person-Lab-<OPL版本>-<平台>-<架构>` 这类桌面 App 安装包。
- GitHub Packages 面向机器消费，承载可独立更新的 OPL 内核包、App-owned WebUI/Docker 镜像坐标、domain module package channel 与预构建 helper。
- `opl-aion-shell` 继续是 GUI 源码与构建输入；用户入口、版本叙事、下载面、updater metadata、标准 DMG 与 Full 版 DMG 都归 `one-person-lab-app` release。

## Currentness policy

本文冻结 release / Packages / App / module 分发 owner boundary，不冻结日期、OPL 版本号、GUI 版本号、archive size、checksum、module head SHA、release artifact、workflow run、GHCR digest、branch/SHA state、本机 package build 结果、Full payload layout、App first-run sequence、签名/公证模式或 VM gate 结果。当前 package 坐标、release discipline、channel manifest shape 和 install/update source 必须从 fresh `opl packages manifest`、`src/package-distribution.ts`、`scripts/package-module-archives.mjs`、`scripts/package-release-discipline.mjs`、`.github/workflows/release-package-channel.yml`、`.github/workflows/packages.yml` 与相关测试读取；App 下载资产、Full DMG、updater metadata、Full manifest、first-run matrix、签名/公证结果和 release evidence 继续归 `one-person-lab-app`。

稳定读法是：`GitHub Releases` 是用户下载入口，`GitHub Packages/GHCR` 是机器制品通道；当前默认 stable/App install/update 通过 GHCR `one-person-lab-manifest` channel manifest 消费 `one-person-lab-modules/*`。Framework `.github/workflows/release-package-channel.yml` 在 GitHub Release `published` 时自动调用 `.github/workflows/packages.yml`，发布 module source archive 与 release/channel manifest 到 GHCR；`.github/workflows/daily-package-channel.yml` 每天调度一次，生成候选 package manifest，并用 `scripts/package-channel-daily-check.mjs` 只比较 module source fingerprint；如果相对当前 GHCR `one-person-lab-manifest:stable` 有 module head / archive sha 变化，则用 `<opl_version>-daily.YYYYMMDD` 版本调用 `packages.yml` 发布并移动 `stable` / `latest`，否则跳过发布。daily tag 日期按 `Asia/Shanghai` 计算。`packages.yml` 仍保留 `workflow_dispatch` 作为人工修复入口。它同步上传 `opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS` artifact，不会在 tag push 时自动发布，也不会发布 `one-person-lab-webui`。Developer Mode 是 App/system settings 中启用 GitHub repo / local checkout 模块来源的正式入口；`OPL_MODULE_SOURCE_MODE=git_checkout`、`OPL_MODULE_PATH_<MODULE_ID>` 或 `OPL_MODULE_REPO_URL_<MODULE_ID>` 只保留为低层诊断/CI override。这些 override 不改变普通 stable/App 默认 package-channel 来源。旧文档中 `packages_defined_not_consumed_by_install_update`、`prepared_only_deprecated` 或 prepared-only module channel 只描述历史状态，不能作为当前 package channel 语义。

## 当前分发边界

| 分发对象 | 推荐渠道 | 是否打入桌面 App | 理由 |
| --- | --- | --- | --- |
| One Person Lab 桌面 App | `one-person-lab-app` GitHub Releases | 是 | 用户直接下载和安装 |
| One Person Lab Full 首次安装包 | `one-person-lab-app` GitHub Releases 额外 asset | 只打入 Full 包，不进入标准更新包 | 新用户首次安装时按 App-owned Full manifest / product profile 预置声明的 Framework runtime、domain / Foundry modules、provider support payload、companion tools 和 skills；App 自动更新继续走标准包 |
| OPL CLI / shared contracts / native helper | npm / 当前安装脚本；native helper 通过 GHCR OCI prebuild 恢复 | 随一键安装获取 | App 不变时也需要独立修复和更新 |
| MAS | 默认 GHCR `one-person-lab-modules/med-autoscience`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | domain agent 独立演进，按环境管理安装/更新 |
| MDS | MAS 显式可选 companion；不进入默认 OPL package / Full payload | 否 | 仅作为 MAS-declared backend audit、provenance、historical fixture、intake 或 parity oracle 引用 |
| MAG | 默认 GHCR `one-person-lab-modules/med-autogrant`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | domain agent 独立演进，按环境管理安装/更新 |
| RCA | 默认 GHCR `one-person-lab-modules/redcube-ai`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | 交付物链路可能较大，不应拖慢 App 更新 |
| OPL Meta Agent / OMA | 默认 GHCR `one-person-lab-modules/opl-meta-agent`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | Agent Foundry 的 managed builder/tester module，随 App/OPL 环境维护，但不作为默认 Home assistant 入口 |
| OPL Flow | 不属于 `one-person-lab-modules/*` package；从 `gaofeng21cn/opl-flow` 安装 Codex workflow plugin/profile | 否 | 只负责 Codex 工作流 profile、角色库和 managed instruction block，不是 domain module 或 GHCR module package |
| WebUI Docker 镜像 | App-owned GitHub Packages container registry | 否 | Framework manifest 只保留 App-owned external package/reference；实际构建发布归 `one-person-lab-app` |

## 模块体积基线

本地完整工作树大小不能代表分发体积。分发时不带 `.git`、未跟踪文件、缓存、虚拟环境和构建产物；浅克隆工作树仍会包含 `.git` 元数据，适合作为开发安装方式，不适合作为 App 内置体积估算。

源码归档大小是 release-time manifest fact：`scripts/package-module-archives.mjs` 以每个 module checkout 的 `git archive --format=tar.gz HEAD` 生成 tarball，并把 `source_archive.size`、`source_archive.sha256` 和 `source_git.head_sha` 写入 `opl-release-manifest.json` / `opl-channel-manifest.json` / `SHA256SUMS`。长期文档只保留这个读取规则，不保留某次本地 archive 的 MB 快照。

## Packages 适用方式

当前 GitHub Packages/GHCR 是 stable/App 模块安装更新的默认机器通道。现状是：

- 用户下载入口仍是 GitHub Releases 里的桌面 App 安装包。
- `opl packages manifest` 输出 App-owned WebUI 镜像 reference、active native helper GHCR OCI prebuild 坐标、MAS/MAG/RCA/OPL Meta Agent active module package 坐标，以及 `one-person-lab-manifest` channel manifest 坐标。
- Manifest 同时投影 bundled Codex default profile；该 profile 只表达产品默认 provider/model endpoint 与 profile role，不包含 secret，也不替代用户本地 Codex 配置或 executor policy。
- `.github/workflows/release-package-channel.yml` 是自动 release gate：GitHub Release `published` 后调用 packages reusable workflow；`.github/workflows/daily-package-channel.yml` 是 daily change-detected package gate：每天生成候选 manifest，和当前 stable channel 的 module source fingerprint 比较，有变化才发布 `<opl_version>-daily.YYYYMMDD`，无变化不推 GHCR；`.github/workflows/packages.yml` 是 Framework module source archive / manifest publish workflow，保留手动 `workflow_dispatch` 做修复。它发布 `one-person-lab-modules/*` 和 `one-person-lab-manifest` 到 GHCR，同时上传 workflow artifact；它不代表 MAS/MAG/RCA/OPL Meta Agent 各 repo 已经各自维护独立 GHCR/Packages 发布面。
- `scripts/package-module-archives.mjs` 会生成 `opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS`，并把每个模块的 `source_git.head_sha`、源码包大小和 `sha256` 写入 manifest。
- `scripts/package-release-discipline.mjs` 是 CI gate：检查 channel manifest、artifact build、checksum、rollback、旧版本清理策略与 active package channel、release-gated `workflow_call` / manual dispatch repair 语义是否齐全。缺 checksum、缺回退策略、缺清理策略，或误称 tag push 自动发布 / Framework-owned WebUI publish 时，package workflow 应直接失败。
- Native helper 预构建 workflow 会继续上传 CI artifact，同时把 tar.gz archive 推送到 GHCR，并在 workflow 内验证 native helper package retention/status policy。
- 默认 stable/App install/update 从 GHCR channel manifest 解析目标模块包；Developer Mode `enabled=on` 且 `mode=developer_apply_safe` 时，模块 source policy 切到 Git checkout，并优先使用本地 sibling repo。`OPL_MODULE_SOURCE_MODE=git_checkout`、`OPL_MODULE_PATH_<MODULE_ID>` 和 `OPL_MODULE_REPO_URL_<MODULE_ID>` 继续作为低层诊断/CI override。
- App 更新后的首次启动会按当前 package-channel 目标补齐缺失模块；显式开发 override 由 operator 负责保持可用，不由 stable/App 默认更新强行覆盖。

`Packages` 是 App 不变时的机器更新通道，但它不替代 App repo `Releases` 的用户下载入口。新手用户从 `one-person-lab-app` 的 `Releases` 下载桌面安装包；macOS arm64 可选择 App-owned Full 首次安装资产来预置 Full manifest / product profile 声明的 runtime、domain / Foundry module、provider support、companion tool 与 skill payload。MAS/MAG/RCA 等 domain repo 不再提供用户安装型 GitHub Release；MDS 只保留为 MAS 显式声明的可选 companion / provenance / audit / oracle 引用，不作为 provider adapter、默认分发模块或 Full payload。

Manifest 的本地入口只用于读取 fresh machine output，不作为本文冻结的字段快照：

```bash
opl packages manifest
npm run packages:manifest -- --version <opl_version>
npm run packages:daily-check -- --candidate-manifest dist/opl-packages/opl-channel-manifest.json --current-manifest <stable-channel-manifest.json> --version <opl_version>
npm run packages:release-discipline -- --manifest dist/opl-packages/opl-release-manifest.json
npm run packages:cleanup-ghcr -- --summary-path ghcr-package-cleanup.json
npm run packages:cleanup-ghcr -- --rollback-tag <version> --execute
```

Fresh 读法按机器入口分层：

| 机器入口 | 当前职责 | 不从本文读取的动态事实 |
| --- | --- | --- |
| `src/package-distribution.ts` / `opl packages manifest` | 定义 package manifest shape、module ids、GHCR 坐标、Codex default profile 投影、`module_install_update_source` 和 `package_consumption_status`。 | 当前版本号、生成时间、owner、release channel、Codex profile 字段值和 module 坐标的实际输出。 |
| `scripts/package-module-archives.mjs` | 用 module checkout 的 `git archive --format=tar.gz HEAD` 生成 source tarball，写出 `opl-release-manifest.json`、`opl-channel-manifest.json` 和 `SHA256SUMS`。 | archive size、sha256、module branch、module head SHA 和本机输出路径。 |
| `scripts/package-release-discipline.mjs` | 校验 manifest 声明 package-channel current source、channel manifest output、checksum、rollback 和 retention policy。 | 某次 release 的 previous manifest、retain count、失败列表和实际 gate 输出。 |
| `scripts/cleanup-ghcr-package-versions.mjs` | 按 manifest 的 native-helper active policy 与 active modules/manifest lifecycle 做 GHCR retention dry-run；只有 `--execute` 才删除候选 package versions。 | 当前远端 package version 列表、候选删除列表、rollback tag、实际删除结果。 |
| `.github/workflows/release-package-channel.yml` | GitHub Release `published` 后自动调用 packages reusable workflow；手工 `workflow_dispatch` 可作为 release gate 修复入口。 | release event、caller workflow run、被调用 packages workflow run。 |
| `.github/workflows/daily-package-channel.yml` | 每天调度 package-channel change detector；候选 manifest 相对 `one-person-lab-manifest:stable` 有 module source fingerprint 变化时，发布 `<opl_version>-daily.YYYYMMDD` 并移动 channel tag；无变化跳过发布。 | 当天调度 run、候选 manifest、当前 stable manifest、change detector summary、是否实际调用 packages workflow。 |
| `.github/workflows/packages.yml` | 通过 reusable `workflow_call` 构建 module source archive、运行 release-discipline gate、发布 module archive / release manifest 到 GHCR，并上传 release manifest / channel manifest / checksum artifact；直接 `workflow_dispatch` 仅保留为人工修复入口；不构建或发布 WebUI image。 | workflow run 状态、artifact URL、远端 package 可见性和本机 package build 结果。 |
| `.github/workflows/native-helper-prebuilds.yml` / `scripts/native-helper-prebuild.mjs` | 维护 native helper prebuild artifact / GHCR package 的构建入口。 | 具体 target、native helper version、checksum、CI artifact 和 GHCR tag。 |
| `one-person-lab-app` release contracts / workflows / evidence | 拥有标准 App 安装包、Full DMG、Full manifest、first-run matrix、updater metadata、签名/公证和用户下载面。 | App release ready、Full package asset、download URL、latest yml、Full runtime layout、payload refs、签名/公证结果和 release evidence。 |

具体发布物按三层切开：

| 发布物 | 推荐 Packages 名称 | 内容 | 触发方 |
| --- | --- | --- | --- |
| Docker/WebUI 镜像 | `ghcr.io/gaofeng21cn/one-person-lab-webui:<opl_version>` | One Person Lab 品牌 AionUI WebUI shell、web-cli、SPA 静态文件、bundled backend 和浏览器入口；实际 runtime/env/auth/session 以 active shell Dockerfile / web-cli / web-host、App Docker smoke 和 image manifest 为准 | App-owned publish surface；Framework 只记录 external reference / coordinate |
| 模块源码包 | `ghcr.io/gaofeng21cn/one-person-lab-modules/<module>:<version>` | 不含 `.git`、缓存、venv、node_modules 的模块源码归档；当前 lifecycle 为 `active_release_channel` | stable/App install/update 通过 GHCR channel manifest 消费；Developer Mode 可显式 override 到 Git checkout |
| Native helper prebuild | `ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<version>` | Rust helper 二进制、manifest、checksum | `opl system repair-native-helpers` / `opl install`；底层 lifecycle script 为 `npm run native:repair` |
| OPL core npm 包 | `@gaofeng21cn/one-person-lab` 或 npm public package | CLI、contracts、shared helpers、安装脚本 | npm / 一键安装脚本 |
| Release manifest | `ghcr.io/gaofeng21cn/one-person-lab-manifest:<opl_version>`，moving tags: `stable` / `latest` | 制品版本、module refs、sha256、回滚目标、channel manifest | stable/App install/update 当前读取的 GHCR channel manifest；workflow artifact 是同源审计输出 |

维护规则：

- Release 继续放 DMG/ZIP/DEB 等用户安装包。
- Packages 放 OPL CLI/core、App-owned WebUI Docker 镜像 reference、active native helper OCI prebuild、active domain module source archive channel 与 `one-person-lab-manifest` channel manifest；WebUI 镜像发布归 `one-person-lab-app`，Framework package workflow 只维护坐标/reference、native helper 与 module/channel packages。
- stable/App 环境管理通过 GHCR channel manifest 判断目标模块版本；Developer Mode override 模式下由显式 checkout/path/repo URL 决定来源。
- Daily package channel 只响应 module source fingerprint 变化。仅 `opl_version`、`generated_at` 或 artifact tag 因日期变化而改变，不触发发布；这样避免无内容变化时每天制造无意义 package versions。
- 每个制品必须有版本、来源、校验和、回滚目标和安装策略。
- 旧版本清理不靠手工记忆：package workflow 的 manifest 必须声明 `retain_latest_n_versions_and_declared_rollbacks`，并且 cleanup 只能是 `dry_run_first_explicit_execute_required`。`latest`、`stable`、`nightly` 这类 moving tags 和显式 rollback tag 始终受保护；后续 GHCR retention/cleanup job 只消费这个策略，不重新解释模块状态；真正删除 package version 需要显式执行与 package admin / `delete:packages` 权限，不在普通 release workflow 中隐式发生。
- `MDS` 不进入默认 manifest / Full payload；如 MAS 需要 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle，只能通过 MAS 明确声明的可选 companion 路径读取。
- `OPL Meta Agent` 当前源码已纳入 Framework package manifest 的 active module package 集合；实际可拉取性以 workflow 发布结果和 GHCR package 可见性为准。`opl-flow` 不属于这个集合，它走 Codex workflow plugin/profile 安装边界。
- 若后续改变 package channel、override 语义或 WebUI publish owner，先改 `src/package-distribution.ts`、release discipline、workflow 和相关测试，再更新本文。

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
