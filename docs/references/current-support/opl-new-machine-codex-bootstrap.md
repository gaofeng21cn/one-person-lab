# OPL 新机器安装

本文给出新 macOS/Linux 开发机的安装与验证路径。当前版本、Package 列表和 App 安装包由各自的发布方提供。产品分工见 [项目概览](../../project.md#产品分层)，安装与发布归属见 [仓库地图](../../public/repo-map.md)。

## 选择产品

- 需要桌面体验：安装 One Person Lab App，使用随 App 提供的运行时和界面。
- 需要 headless/CLI：安装 OPL Framework，启动并检查本机 v2 daemon。
- 需要专业 Agent 或工具：在 Framework 就绪后，按该 Package 的发布说明安装所需能力。

## 安装 Framework

推荐使用 canonical installer：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

开发 checkout：

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git
cd one-person-lab
npm install
npm link
```

随后运行：

```bash
opl --help
opl daemon doctor --include-first-run --json
opl pack list --json
```

安装器验证新链接的 CLI 和本机 daemon。按需安装工作所需的 Agent Packages。

## 安装 App

App installer 和发布资产归 [`one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app#readme)，当前 Shell 选择与 Desktop/WebUI/Docker 构建实现由 App contract 维护：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/install.sh | bash
```

在 macOS 上，安装器优先选择同一发行版的 Full 安装包，并在确认该发行版没有发布 Full 时使用 Standard。装好后从 Applications 启动 App，按界面完成首次设置。

## 安装 Packages

`opl pack list` 查看本机 Package。下例使用已下载的 v2 归档。把 `package_source` 和 `package_id` 改为发布说明中的实际归档路径和 Package ID。若发布方提供 OCI 引用，直接将该引用赋给 `package_source`。

```bash
package_source="./example-package.tar.gz"
package_id="example-package"
opl pack install "$package_source" --json
opl pack inspect "$package_id" --json
```

App official profile 和用户选择决定实际 Package 集合。Framework 根据已安装的描述符发现 Agent、Skill、Tool、Plugin、MCP 和 entrypoint，并向 App 投影入口。

## 完成标准

分别验证：

1. `opl --help`、安装目录和 `opl daemon doctor --include-first-run --json`；
2. 所选任务使用的 executor 可用性，见 `opl runway executors health --json`；
3. 每个所需 Package 的已安装版本、启用和可调用状态；
4. 桌面场景下的 App 版本与实际启动；
5. 至少一个目标 Package 的实际 entrypoint/contribution。

## 常见问题

- 找不到 Package：从 [OPL Catalog](https://github.com/gaofeng21cn/opl-catalog) 或 Package owner 核对产品身份、权限及制品入口。
- daemon 未运行：执行 `opl daemon start --detached` 后重新运行 doctor。
- executor 不可用：根据 `opl runway executors health --json` 的结果检查对应 CLI 和授权。
