# OPL Release 与 Packages 模块化分发参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_release_packages_modular_distribution`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 定位

- `one-person-lab-app` GitHub Releases 面向用户下载，承载 `One-Person-Lab-<OPL版本>-<平台>-<架构>` 这类桌面 App 安装包。
- GitHub Packages 面向机器消费，适合承载可独立更新的 OPL 内核包、domain module 制品、WebUI/Docker 镜像与预构建 helper。
- `opl-aion-shell` 继续是 GUI 源码与构建输入；用户入口、版本叙事、下载面、updater metadata、标准 DMG 与 Full 版 DMG 都归 `one-person-lab-app` release。

## Currentness policy

本文冻结 release / Packages / App / module 分发 owner boundary，不冻结日期、OPL 版本号、GUI 版本号、archive size、checksum、module head SHA、release artifact、workflow run、GHCR digest、branch/SHA state、本机 package build 结果、Full payload layout、App first-run sequence、签名/公证模式或 VM gate 结果。当前 package 坐标、release discipline、channel manifest shape 和 install/update source 必须从 fresh `opl packages manifest`、`src/package-distribution.ts`、`scripts/package-module-archives.mjs`、`scripts/package-release-discipline.mjs`、`.github/workflows/packages.yml` 与相关测试读取；App 下载资产、Full DMG、updater metadata、Full manifest、first-run matrix、签名/公证结果和 release evidence 继续归 `one-person-lab-app`。

稳定读法是：`GitHub Releases` 是用户下载入口，`GitHub Packages/GHCR` 是机器制品通道；当前 `module_install_update_source` 仍是 `git_checkout`，`package_consumption_status` 仍是 `packages_defined_not_consumed_by_install_update`。Packages/GHCR 只有在 `opl module install/update` 或 App 环境管理真的消费 channel manifest 之后，才能写成当前安装更新机制。

## 当前分发边界

| 分发对象 | 推荐渠道 | 是否打入桌面 App | 理由 |
| --- | --- | --- | --- |
| One Person Lab 桌面 App | `one-person-lab-app` GitHub Releases | 是 | 用户直接下载和安装 |
| One Person Lab Full 首次安装包 | `one-person-lab-app` GitHub Releases 额外 asset | 只打入 Full 包，不进入标准更新包 | 新用户首次安装时按 App-owned Full manifest / product profile 预置声明的 Framework runtime、domain / Foundry modules、provider support payload、companion tools 和 skills；App 自动更新继续走标准包 |
| OPL CLI / shared contracts / native helper | npm / 当前安装脚本；GitHub Packages 是后续机器通道 | 随一键安装获取 | App 不变时也需要独立修复和更新 |
| MAS | 当前 git checkout / sibling repo；GHCR 模块包是后续机器通道 | 否 | domain agent 独立演进，按环境管理安装/更新 |
| MDS | MAS 显式可选 companion；不进入默认 OPL package / Full payload | 否 | 仅作为 MAS-declared backend audit、provenance、historical fixture、intake 或 parity oracle 引用 |
| MAG | 当前 git checkout / sibling repo；GHCR 模块包是后续机器通道 | 否 | domain agent 独立演进，按环境管理安装/更新 |
| RCA | 当前 git checkout / sibling repo；GHCR 模块包是后续机器通道 | 否 | 交付物链路可能较大，不应拖慢 App 更新 |
| WebUI Docker 镜像 | GitHub Packages container registry | 否 | 服务器/Docker 场景由镜像直接启动浏览器入口 |

## 模块体积基线

本地完整工作树大小不能代表分发体积。分发时不带 `.git`、未跟踪文件、缓存、虚拟环境和构建产物；浅克隆工作树仍会包含 `.git` 元数据，适合作为开发安装方式，不适合作为 App 内置体积估算。

源码归档大小是 release-time manifest fact：`scripts/package-module-archives.mjs` 以每个 module checkout 的 `git archive --format=tar.gz HEAD` 生成 tarball，并把 `source_archive.size`、`source_archive.sha256` 和 `source_git.head_sha` 写入 `opl-release-manifest.json` / `opl-channel-manifest.json` / `SHA256SUMS`。长期文档只保留这个读取规则，不保留某次本地 archive 的 MB 快照。

## Packages 适用方式

当前已经开始设计 GitHub Packages 机器消费通道，但模块安装/更新尚未切到 Packages。现状是：

- 用户下载入口仍是 GitHub Releases 里的桌面 App 安装包。
- `opl packages manifest` 输出 WebUI 镜像、native helper、MAS/MAG/RCA 模块包的 machine-readable 坐标。
- Manifest 同时投影 bundled Codex default profile；该 profile 只表达产品默认 provider/model endpoint 与 profile role，不包含 secret，也不替代用户本地 Codex 配置或 executor policy。
- `.github/workflows/packages.yml` 是 OPL 中央 package workflow 雏形；它不代表 MAS/MAG/RCA 各 repo 已经各自维护独立 GHCR/Packages 发布面。
- `scripts/package-module-archives.mjs` 会生成 `opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS`，并把每个模块的 `source_git.head_sha`、源码包大小和 `sha256` 写入 manifest。
- `scripts/package-release-discipline.mjs` 是 CI gate：检查 channel manifest、artifact build、checksum、rollback 与旧版本清理策略是否齐全。缺 checksum、缺回退策略或缺清理策略时，package workflow 应直接失败。
- Native helper 预构建 workflow 会继续上传 CI artifact，同时把 tar.gz archive 推送到 GHCR。
- `opl install`、App 更新后的首次启动协调、`opl system reconcile-modules` 和环境管理当前仍通过 git checkout / npm / 本地 sibling repo 做模块安装和更新。
- App 更新后的首次启动会把缺失模块补齐，并把 clean checkout 更新到 upstream/default branch 最新 HEAD；dirty、ahead、diverged 或无 upstream 的开发 checkout 只提示人工处理。
- 下一步如果 Packages/GHCR 真正接入 `opl module install/update`，再把最新来源切到 channel manifest；在那之前，文档不得把 Packages 写成当前模块安装更新机制。

`Packages` 适合作为 App 不变时的机器更新通道，但它不替代 App repo `Releases` 的用户下载入口。新手用户从 `one-person-lab-app` 的 `Releases` 下载桌面安装包；macOS arm64 可选择 App-owned Full 首次安装资产来预置 Full manifest / product profile 声明的 runtime、domain / Foundry module、provider support、companion tool 与 skill payload。Packages/GHCR 被 live source、tests、CLI/read-model 或 App 环境管理消费前，当前 `opl install` 与环境管理仍通过 git checkout 更新模块。MAS/MAG/RCA 等 domain repo 不再提供用户安装型 GitHub Release；MDS 只保留为显式可选 companion / provider adapter，不作为默认分发模块。

Manifest 的本地入口只用于读取 fresh machine output，不作为本文冻结的字段快照：

```bash
opl packages manifest
npm run packages:manifest -- --version <opl_version>
npm run packages:release-discipline -- --manifest dist/opl-packages/opl-release-manifest.json
```

Fresh 读法按机器入口分层：

| 机器入口 | 当前职责 | 不从本文读取的动态事实 |
| --- | --- | --- |
| `src/package-distribution.ts` / `opl packages manifest` | 定义 package manifest shape、module ids、GHCR 坐标、Codex default profile 投影、`module_install_update_source` 和 `package_consumption_status`。 | 当前版本号、生成时间、owner、release channel、Codex profile 字段值和 module 坐标的实际输出。 |
| `scripts/package-module-archives.mjs` | 用 module checkout 的 `git archive --format=tar.gz HEAD` 生成 source tarball，写出 `opl-release-manifest.json`、`opl-channel-manifest.json` 和 `SHA256SUMS`。 | archive size、sha256、module branch、module head SHA 和本机输出路径。 |
| `scripts/package-release-discipline.mjs` | 校验 manifest 仍声明 git-checkout current source、channel manifest output、checksum、rollback 和 retention policy。 | 某次 release 的 previous manifest、retain count、失败列表和实际 gate 输出。 |
| `.github/workflows/packages.yml` | 构建 module source archive、上传 release manifest artifact、推送 module archive / release manifest 到 GHCR，并从 `one-person-lab-app#main:shells/aionui` 构建/推送 WebUI image。 | workflow run 状态、GHCR digest、artifact URL、远端 package 可见性和 `VITE_OPL_DEFAULT_LANGUAGE` 等瞬时 build arg。 |
| `.github/workflows/native-helper-prebuilds.yml` / `scripts/native-helper-prebuild.mjs` | 维护 native helper prebuild artifact / GHCR package 的构建入口。 | 具体 target、native helper version、checksum、CI artifact 和 GHCR tag。 |
| `one-person-lab-app` release contracts / workflows / evidence | 拥有标准 App 安装包、Full DMG、Full manifest、first-run matrix、updater metadata、签名/公证和用户下载面。 | App release ready、Full package asset、download URL、latest yml、Full runtime layout、payload refs、签名/公证结果和 release evidence。 |

具体发布物按三层切开：

| 发布物 | 推荐 Packages 名称 | 内容 | 触发方 |
| --- | --- | --- | --- |
| Docker/WebUI 镜像 | `ghcr.io/gaofeng21cn/one-person-lab-webui:<opl_version>` | One Person Lab 品牌 AionUI WebUI shell、web-cli、SPA 静态文件、bundled backend 和浏览器入口；实际 runtime/env/auth/session 以 active shell Dockerfile / web-cli / web-host、App Docker smoke 和 image manifest 为准 | Docker 用户直接 `docker run` |
| 模块源码包 | `ghcr.io/gaofeng21cn/one-person-lab-modules/<module>:<version>` | 不含 `.git`、缓存、venv、node_modules 的模块源码归档 | 后续 `opl module install/update` 接入 manifest 后消费；当前不作为正式安装更新来源 |
| Native helper prebuild | `ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<version>` | Rust helper 二进制、manifest、checksum | `opl native:repair` / `opl install` |
| OPL core npm 包 | `@gaofeng21cn/one-person-lab` 或 npm public package | CLI、contracts、shared helpers、安装脚本 | npm / 一键安装脚本 |
| Release manifest | Release artifact 或 `one-person-lab-manifest:<opl_version>` | 制品版本、URL、sha256、回滚目标 | App 环境管理与 CLI；当前只有被 install/update 或 App 环境管理 live source 消费后才成为安装更新来源 |

维护规则：

- Release 继续放 DMG/ZIP/DEB 等用户安装包。
- Packages 放 OPL CLI/core、WebUI Docker 镜像和 domain module 的机器消费制品；WebUI 镜像由 OPL 中央 package workflow 从 App repo 的 active shell checkout 构建发布，App release / user-path truth 仍归 `one-person-lab-app`；只有 install/update 真正消费 Packages channel manifest 之后，才把模块 Packages 写成当前安装更新机制。
- 当前环境管理通过 git upstream 判断“当前版本 / 是否可更新”；切到 Packages 后再改为通过 manifest 判断目标版本。
- 每个制品必须有版本、来源、校验和、回滚目标和安装策略。
- 旧版本清理不靠手工记忆：package workflow 的 manifest 必须声明 `retain_latest_n_versions_and_declared_rollbacks`，后续 GHCR retention/cleanup job 只消费这个策略，不重新解释模块状态。
- `MDS` 不进入默认 manifest / Full payload；如 MAS 需要 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle，只能通过 MAS 明确声明的可选 companion 路径读取。
- Packages/GHCR 接入 `opl module install/update` 或 App 环境管理时，先改 live source、tests、CLI/read-model 和 release evidence，再更新本文；本文不得先替未来实现写当前事实。

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
