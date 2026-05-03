# OPL Release 与 Packages 模块化分发参考

## 定位

- GitHub Releases 面向用户下载，承载 `One Person Lab-<OPL版本>-<平台>-<架构>` 这类桌面 App 安装包。
- GitHub Packages 面向机器消费，适合承载可独立更新的 OPL 内核包、domain module 制品、WebUI/Docker 镜像与预构建 helper。
- `opl-aion-shell` 继续是 GUI 源码与构建输入；用户入口、版本叙事和下载面归到 `one-person-lab`。

## 当前分发边界

| 分发对象 | 推荐渠道 | 是否打入桌面 App | 理由 |
| --- | --- | --- | --- |
| One Person Lab 桌面 App | GitHub Releases | 是 | 用户直接下载和安装 |
| One Person Lab Full 首次安装包 | GitHub Releases 额外 asset | 只打入 Full 包，不进入标准更新包 | 新用户首次安装时减少 MAS/MDS/MAG/RCA、Hermes、officecli 与推荐 companion skills 配置等待；App 自动更新继续走标准包 |
| OPL CLI / shared contracts / native helper | npm / 当前安装脚本；GitHub Packages 是后续机器通道 | 随一键安装获取 | App 不变时也需要独立修复和更新 |
| MAS | 当前 git checkout / sibling repo；GHCR 模块包是后续机器通道 | 否 | domain agent 独立演进，按环境管理安装/更新 |
| MDS | 当前 git checkout / sibling repo；GHCR 模块包是后续机器通道 | 否 | MAS 隐藏运行依赖，在环境管理中维护 |
| MAG | 当前 git checkout / sibling repo；GHCR 模块包是后续机器通道 | 否 | domain agent 独立演进，按环境管理安装/更新 |
| RCA | 当前 git checkout / sibling repo；GHCR 模块包是后续机器通道 | 否 | 交付物链路可能较大，不应拖慢 App 更新 |
| WebUI Docker 镜像 | GitHub Packages container registry | 否 | 服务器/Docker 场景由镜像直接启动浏览器入口 |

## 模块体积基线

本地完整工作树大小不能代表分发体积。分发时不带 `.git`、未跟踪文件、缓存、虚拟环境和构建产物。`2026-04-26` 用 `git archive --format=tar.gz HEAD` 得到的源码归档参考值：

| 模块 | 源码归档大小 |
| --- | ---: |
| MAS / `med-autoscience` | 2.1 MB |
| MDS / `med-deepscientist` | 34.6 MB |
| MAG / `med-autogrant` | 0.6 MB |
| RCA / `redcube-ai` | 0.8 MB |

浅克隆工作树仍会包含 `.git` 元数据，适合作为开发安装方式，不适合作为 App 内置体积估算。

## Packages 适用方式

当前已经开始设计 GitHub Packages 机器消费通道，但模块安装/更新尚未切到 Packages。现状是：

- 用户下载入口仍是 GitHub Releases 里的桌面 App 安装包。
- `opl packages manifest` 输出 WebUI 镜像、native helper、MAS/MDS/MAG/RCA 模块包的 machine-readable 坐标。
- `.github/workflows/packages.yml` 是 OPL 中央 package workflow 雏形；它不代表 MAS/MDS/MAG/RCA 各 repo 已经各自维护独立 GHCR/Packages 发布面。
- `scripts/package-module-archives.mjs` 会生成 `opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS`，并把每个模块的 `source_git.head_sha`、源码包大小和 `sha256` 写入 manifest。
- `scripts/package-release-discipline.mjs` 是 CI gate：检查 channel manifest、artifact build、checksum、rollback 与旧版本清理策略是否齐全。缺 checksum、缺回退策略或缺清理策略时，package workflow 应直接失败。
- Native helper 预构建 workflow 会继续上传 CI artifact，同时把 tar.gz archive 推送到 GHCR。
- `opl install`、App 更新后的首次启动协调、`opl system reconcile-modules` 和环境管理当前仍通过 git checkout / npm / 本地 sibling repo 做模块安装和更新。
- App 更新后的首次启动会把缺失模块补齐，并把 clean checkout 更新到 upstream/default branch 最新 HEAD；dirty、ahead、diverged 或无 upstream 的开发 checkout 只提示人工处理。
- 下一步如果 Packages/GHCR 真正接入 `opl module install/update`，再把最新来源切到 channel manifest；在那之前，文档不得把 Packages 写成当前模块安装更新机制。

`Packages` 适合作为 App 不变时的机器更新通道，但它不替代 `Releases` 的用户下载入口。新手用户仍从 `one-person-lab` 的 `Releases` 下载桌面安装包；macOS arm64 可选择 `One-Person-Lab-Full-<version>-mac-arm64.dmg` 首次安装资产来预置 MAS/MDS/MAG/RCA、Hermes、officecli CLI binary 与推荐 companion skill payload。当前 `opl install` 与环境管理先通过 git checkout 更新模块，未来再切到 Packages/GHCR 制品。MAS/MDS/MAG/RCA 等 domain repo 不再提供用户安装型 GitHub Release。

Manifest 的本地入口：

```bash
opl packages manifest
npm run packages:manifest -- --version 26.4.27
npm run packages:release-discipline -- --manifest dist/opl-packages/opl-release-manifest.json
```

Manifest 会同步到 `ghcr.io/gaofeng21cn/one-person-lab-manifest:<opl_version>`，并带上 channel manifest 与 `SHA256SUMS`；也可以作为 Release artifact 上传：

```json
{
  "opl_version": "26.4.27",
  "gui_version": "1.9.21",
  "release_channel": "stable",
  "generated_at": "2026-04-27T00:00:00Z",
  "module_install_update_source": "git_checkout",
  "package_consumption_status": "packages_defined_not_consumed_by_install_update",
  "release_automation": {
    "status": "prepared_not_consumed_by_module_install_update",
    "channel_manifest": {
      "manifest_kind": "opl_release_channel_manifest.v1",
      "generated_by": "scripts/package-module-archives.mjs",
      "outputs": {
        "release_manifest": "opl-release-manifest.json",
        "channel_manifest": "opl-channel-manifest.json",
        "checksums": "SHA256SUMS"
      },
      "latest_source_until_packages_consumed": "git_checkout_upstream_default_branch"
    },
    "artifact_build": {
      "workflow": ".github/workflows/packages.yml",
      "command": "npm run packages:manifest -- --version <opl_version>",
      "artifact_kind": "git_archive_source_tarball"
    },
    "checksum": {
      "algorithm": "sha256",
      "recorded_in": ["source_archive.sha256", "SHA256SUMS"],
      "required_before_publish": true
    },
    "rollback": {
      "strategy": "previous_channel_manifest_target",
      "previous_version": "26.4.26",
      "input": "--previous-manifest <path>",
      "failure_behavior": "keep_current_git_checkout_or_restore_previous_manifest_target"
    },
    "cleanup": {
      "strategy": "retain_latest_n_versions_and_declared_rollbacks",
      "retain_versions": 3,
      "applies_to": ["one-person-lab-modules/*", "one-person-lab-manifest"]
    }
  },
  "modules": {
    "medautoscience": {
      "channel": "stable",
      "version": "26.4.27",
      "artifact_kind": "source_archive",
      "artifact": "ghcr.io/gaofeng21cn/one-person-lab-modules/med-autoscience:26.4.27",
      "package_consumption_status": "defined_not_consumed_by_install_update",
      "current_install_update_source": "git_checkout",
      "fallback_git": {
        "repo_url": "https://github.com/gaofeng21cn/med-autoscience.git",
        "ref": "main"
      },
      "source_archive": {
        "file_name": "med-autoscience-26.4.27.tar.gz",
        "size": 2200000,
        "sha256": "<sha256>"
      },
      "source_git": {
        "repo_url": "https://github.com/gaofeng21cn/med-autoscience.git",
        "branch": "main",
        "head_sha": "<module_head_sha>"
      },
      "checksum": {
        "algorithm": "sha256",
        "value": "<sha256>",
        "file": "SHA256SUMS"
      },
      "release_discipline": {
        "module_truth_owner": "med-autoscience",
        "package_publish_owner": "one-person-lab_central_packages_workflow",
        "current_latest_source": "git_checkout_upstream_default_branch",
        "future_package_latest_source": "opl_release_channel_manifest",
        "required_gates": [
          "upstream_default_branch_reachable",
          "clean_checkout_or_fresh_clone",
          "source_archive_built_from_head",
          "sha256_recorded",
          "channel_manifest_written",
          "rollback_target_declared_when_previous_manifest_exists"
        ],
        "rollback": {
          "version": "26.4.26",
          "source": "previous_channel_manifest"
        }
      },
      "install_strategy": "extract_to_managed_modules_root",
      "rollback": "26.4.26"
    },
    "meddeepscientist": {
      "channel": "stable",
      "version": "26.4.27",
      "artifact_kind": "source_archive",
      "artifact": "ghcr.io/gaofeng21cn/one-person-lab-modules/med-deepscientist:26.4.27",
      "package_consumption_status": "defined_not_consumed_by_install_update",
      "current_install_update_source": "git_checkout",
      "install_strategy": "extract_to_managed_modules_root",
      "dependency_of": ["medautoscience"]
    }
  }
}
```

具体发布物按三层切开：

| 发布物 | 推荐 Packages 名称 | 内容 | 触发方 |
| --- | --- | --- | --- |
| Docker/WebUI 镜像 | `ghcr.io/gaofeng21cn/one-person-lab-webui:<opl_version>` | OPL WebUI runtime、Codex/Hermes 初始化脚本、浏览器入口 | Docker 用户直接 `docker run` |
| 模块源码包 | `ghcr.io/gaofeng21cn/one-person-lab-modules/<module>:<version>` | 不含 `.git`、缓存、venv、node_modules 的模块源码归档 | 后续 `opl module install/update` 接入 manifest 后消费；当前不作为正式安装更新来源 |
| Native helper prebuild | `ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<version>` | Rust helper 二进制、manifest、checksum | `opl native:repair` / `opl install` |
| OPL core npm 包 | `@gaofeng21cn/one-person-lab` 或 npm public package | CLI、contracts、shared helpers、安装脚本 | npm / 一键安装脚本 |
| Release manifest | Release artifact 或 `one-person-lab-manifest:<opl_version>` | 所有制品版本、URL、sha256、回滚目标 | App 环境管理与 CLI |

落地顺序：

1. 当前正式安装更新路径是 git checkout / sibling repo。
2. 已有中央 manifest、channel manifest、checksum 与 release discipline gate，但尚未成为 `opl module install/update` 的执行来源。
3. 下一步让 `opl module install/update` 优先读 manifest，失败时回退到 git clone。
4. 再让 `native:repair` 优先拉取匹配平台的 GHCR native helper package。
5. 最后把环境管理的“最新版本”从 `GitHub main` 改成 manifest 中的目标版本。

最小可行规则保持不变：

- Release 继续放 DMG/ZIP/DEB 等用户安装包。
- Packages 放 OPL CLI/core、WebUI Docker 镜像和 domain module 的机器消费制品；只有 install/update 真正消费它们之后，才把它们写成当前机制。
- 当前环境管理通过 git upstream 判断“当前版本 / 是否可更新”；切到 Packages 后再改为通过 manifest 判断目标版本。
- 每个制品必须有版本、来源、校验和、回滚目标和安装策略。
- 旧版本清理不靠手工记忆：package workflow 的 manifest 必须声明 `retain_latest_n_versions_and_declared_rollbacks`，后续 GHCR retention/cleanup job 只消费这个策略，不重新解释模块状态。
- `MDS` 在 manifest 中作为 `MAS` 依赖出现，但环境管理仍显示它的安装和更新状态。

## App 内置策略

标准 App 和自动更新包默认不把 `MAS/MDS/MAG/RCA` 打进桌面 App：

- App 更新频率应由 GUI 与 OPL release 节奏决定。
- domain modules 的修复、回滚和验证应独立于 App 发版。
- Docker/服务器用户更适合直接拉 WebUI 镜像和模块制品。
- 专业用户可能已有本地 sibling checkout，OPL 应优先识别并复用，不强行覆盖。

Full 首次安装包是标准 App 之外的额外 GitHub Release asset，用于减少新用户从安装到开始 MAS/MAG/RCA 工作的等待。它必须满足：

- 文件名使用 `One-Person-Lab-Full-<version>-mac-arm64.dmg`，与标准更新包分开。
- 随包 runtime 首启安装到稳定路径 `~/Library/Application Support/OPL/runtime/current`，App 后续从该路径引用 runtime。
- runtime 版本只写入 `~/Library/Application Support/OPL/runtime/current.json` 和 `runtime/current/.opl-full-runtime-installed.json`，不进入安装目录名，后续 Full 包刷新同一路径。
- runtime payload 包含 MAS/MDS/MAG/RCA、Hermes lean runtime、`officecli` CLI binary、MAS/MAG/RCA domain skills、officecli skill 组与 `ui-ux-pro-max`；App 首启仍执行统一 `opl install --skip-gui-open`，把模块和 skills 同步到标准 OPL state / Codex 可见目录。
- `latest*.yml` 只引用标准 `One-Person-Lab-<version>-mac-arm64.*` 资产，不引用 Full DMG。
- Full 包的签名/公证模式与当前标准 GitHub DMG 保持一致：CI 配置 Developer ID secrets 时走签名/公证校验；未配置时仍可产出同等未签名 Release asset，不阻断首次安装包验证和上传。
