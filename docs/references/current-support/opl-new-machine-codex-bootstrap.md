# OPL 新机器安装

本文给出新 macOS/Linux 开发机的最短安装与验证路径。release version、Package 列表和 App artifact 必须从 owner current source读取。产品分工见 [项目概览](../../project.md#产品分层)，安装与发布 owner 见 [仓库地图](../../public/repo-map.md)。

## 选择产品

- 需要桌面体验：安装 One Person Lab App；App installer负责其 bundled runtime和shell。
- 需要 headless/CLI：安装 OPL Framework，启动并检查本机 v2 daemon。
- 需要专业 Agent/capability：在 Base 就绪后，通过对应 owner声明的 native carrier安装 Package。

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

安装后从 Applications 启动并完成 App owner定义的 first-run。Framework 命令通过不能替代 App 签名、安装和真实启动验证。

Full 可向 Framework 首装提供 `OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL` 和
`OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL`。没有 managed Codex 时，Framework
直接从配对归档物化 launcher 与平台二进制，并经版本、App Server 协议验证后激活，
无需 npm registry 或 Gateway。App 负责归档与其发布 manifest 的摘要校验；Framework
核对包身份和配对版本。已有安装的更新继续从上游解析最新稳定版，不沿用首装归档。

## 安装 Packages

`opl pack list` 查看本机 Package。按 Package owner 的说明取得 v2 制品或 OCI 引用后安装，并回读已安装的 Package：

```bash
opl pack install <owner-package-source> --json
opl pack inspect <package-id> --json
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
