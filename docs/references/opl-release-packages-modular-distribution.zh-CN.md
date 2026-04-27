# OPL Release 与 Packages 模块化分发参考

## 定位

- GitHub Releases 面向用户下载，承载 `One Person Lab-<OPL版本>-<平台>-<架构>` 这类桌面 App 安装包。
- GitHub Packages 面向机器消费，适合承载可独立更新的 OPL 内核包、domain module 制品、WebUI/Docker 镜像与预构建 helper。
- `opl-aion-shell` 继续是 GUI 源码与构建输入；用户入口、版本叙事和下载面归到 `one-person-lab`。

## 当前分发边界

| 分发对象 | 推荐渠道 | 是否打入桌面 App | 理由 |
| --- | --- | --- | --- |
| One Person Lab 桌面 App | GitHub Releases | 是 | 用户直接下载和安装 |
| OPL CLI / shared contracts / native helper | npm 或 GitHub Packages | 随一键安装获取 | App 不变时也需要独立修复和更新 |
| MAS | GitHub Packages 或 release artifact | 否 | domain agent 独立演进，按环境管理安装/更新 |
| MDS | GitHub Packages 或 release artifact | 否 | MAS 隐藏运行依赖，在环境管理中维护 |
| MAG | GitHub Packages 或 release artifact | 否 | domain agent 独立演进，按环境管理安装/更新 |
| RCA | GitHub Packages 或 release artifact | 否 | 交付物链路可能较大，不应拖慢 App 更新 |
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

当前已经开始把 GitHub Packages 接成机器消费通道。现状是：

- 用户下载入口仍是 GitHub Releases 里的桌面 App 安装包。
- `opl packages manifest` 输出 WebUI 镜像、native helper、MAS/MDS/MAG/RCA 模块包的 machine-readable 坐标。
- `.github/workflows/packages.yml` 会把模块源码归档和 release manifest 推送到 GHCR，并从 `opl-aion-shell` 构建 WebUI Docker 镜像。
- Native helper 预构建 workflow 会继续上传 CI artifact，同时把 tar.gz archive 推送到 GHCR。
- `opl install` 和环境管理当前仍通过 git checkout / npm / 本地 sibling repo 做模块安装和更新；下一步才会让 `opl module install/update` 优先消费 manifest，失败时回退 git。

你的理解是对的：`Packages` 适合作为 App 不变时的机器更新通道，但它不替代 `Releases` 的用户下载入口。新手用户仍从 `Releases` 下载桌面安装包；`opl install`、环境管理和 Docker 启动脚本再从 `Packages` 或 release artifact 拉取可独立更新的内核与模块。

Manifest 的本地入口：

```bash
opl packages manifest
npm run packages:manifest -- --version 26.4.27
```

Manifest 会同步到 `ghcr.io/gaofeng21cn/one-person-lab-manifest:<opl_version>`，也可以作为 Release artifact 上传：

```json
{
  "opl_version": "26.4.27",
  "gui_version": "1.9.21",
  "release_channel": "stable",
  "generated_at": "2026-04-27T00:00:00Z",
  "modules": {
    "medautoscience": {
      "channel": "stable",
      "version": "26.4.27",
      "artifact_kind": "source_archive",
      "artifact": "ghcr.io/gaofeng21cn/one-person-lab-modules/med-autoscience:26.4.27",
      "fallback_git": {
        "repo_url": "https://github.com/gaofeng21cn/med-autoscience.git",
        "ref": "main"
      },
      "install_strategy": "extract_to_managed_modules_root",
      "rollback": "26.4.26"
    },
    "meddeepscientist": {
      "channel": "stable",
      "version": "26.4.27",
      "artifact_kind": "source_archive",
      "artifact": "ghcr.io/gaofeng21cn/one-person-lab-modules/med-deepscientist:26.4.27",
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
| 模块源码包 | `ghcr.io/gaofeng21cn/one-person-lab-modules/<module>:<version>` | 不含 `.git`、缓存、venv、node_modules 的模块源码归档 | `opl install` 与 App 环境管理 |
| Native helper prebuild | `ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<version>` | Rust helper 二进制、manifest、checksum | `opl native:repair` / `opl install` |
| OPL core npm 包 | `@gaofeng21cn/one-person-lab` 或 npm public package | CLI、contracts、shared helpers、安装脚本 | npm / 一键安装脚本 |
| Release manifest | Release artifact 或 `one-person-lab-manifest:<opl_version>` | 所有制品版本、URL、sha256、回滚目标 | App 环境管理与 CLI |

落地顺序：

1. 已落地 manifest 与 GHCR 发布 workflow。
2. 下一步让 `opl module install/update` 优先读 manifest，失败时回退到 git clone。
3. 再让 `native:repair` 优先拉取匹配平台的 GHCR native helper package。
4. 最后把环境管理的“最新版本”从 `GitHub main` 改成 manifest 中的目标版本。

最小可行规则保持不变：

- Release 继续放 DMG/ZIP/DEB 等用户安装包。
- Packages 放 OPL CLI/core、WebUI Docker 镜像和 domain module 的机器消费制品。
- 环境管理只通过 manifest 判断“当前版本 / 目标版本 / 是否可更新”，不直接猜 GitHub 最新状态。
- 每个制品必须有版本、来源、校验和、回滚目标和安装策略。
- `MDS` 在 manifest 中作为 `MAS` 依赖出现，但环境管理仍显示它的安装和更新状态。

## App 内置策略

默认不把 `MAS/MDS/MAG/RCA` 打进桌面 App：

- App 更新频率应由 GUI 与 OPL release 节奏决定。
- domain modules 的修复、回滚和验证应独立于 App 发版。
- Docker/服务器用户更适合直接拉 WebUI 镜像和模块制品。
- 专业用户可能已有本地 sibling checkout，OPL 应优先识别并复用，不强行覆盖。

只有在面向离线安装包时，才考虑提供“App + 模块缓存”的扩展安装包；该包应与普通 App release 分开命名和发布。
