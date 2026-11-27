# OPL 当前状态

Framework v2 提供本机运行、软件包、工作区和连接服务。动态的 Package、任务、执行器健康状态与安装版本可以在目标机器上直接读取。

## 已实现

| 能力 | 当前实现及可观察结果 |
| --- | --- |
| 本机运行 | `opl` CLI 和 Studio 通过本机接口调用 `opld`。守护进程管理 SQLite 状态，并通过 `app.state.get` 向 App 提供 fast 和 full 两种读面。组成模块见[架构](./architecture.md)。 |
| Package 与 capability | Pack 读取 [v2 描述文件](../contracts/opl-package.v2.schema.json)，提供安装、启停、检查和原生载体同步。目录的描述、实际安装记录和宿主可调用性可以分别回读。Package 发布及专业能力归发布方。 |
| 任务与证据 | Runway 记录任务、阶段、执行尝试和调度状态。Ledger 提供时间线、证据与回执查询。最终产物及质量结论归领域 owner。 |
| 工作区与知识 | Workspace 维护工作区、知识来源绑定、阶段快照和写回提案。知识正文由用户或领域工作区保管，业务授权与内容接受由原 owner 决定。 |
| 连接与应用 | Connect 维护连接、授权和调用记录。Studio 的 DSH/Cordis 宿主提供界面、插件组合和 Codex 集成。App 仓持有桌面产品和发布验收，Cloud 持有在线资源。 |

## 动态真相入口

在安装环境使用 `opl`，在开发 checkout 使用 `./bin/opl`。

```bash
opl --version --json
opl daemon doctor --include-first-run --json
opl pack list --json
opl workspace list --json
opl connect list --json
opl runway list --json
opl runway executors health --json
```

检查某个 Package 时，使用 `opl pack inspect` 加实际安装 ID。诊断任务时，以 `runway list` 返回的任务 ID 查询 `opl runway status` 和 `opl ledger timeline`。首次安装步骤见[新机器安装](./references/current-support/opl-new-machine-codex-bootstrap.md)。

## Production Evidence

Framework 可以证明本机服务可运行、任务执行状态可回读。App 安装、签名、公开发布和实际用户操作由 App 验收。Package 的发布制品、载体安装与实际 contribution 由对应的发布方和载体验证。领域产物、质量和业务确认由负责该项工作的领域验收，远程部署及凭据可用性由对应服务验证。

## 当前差距

跨组件待完成事项见[当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)。
