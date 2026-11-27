# OPL Public Surface Index

本文解释公开 surface 的分组和 owner。精确命令、operation 和字段以 [`packages/daemon/src/cli/main.ts`](../../packages/daemon/src/cli/main.ts)、[`packages/daemon/src/rpc/router.ts`](../../packages/daemon/src/rpc/router.ts) 和 `./bin/opl --help` 持有。

## User surfaces

| Surface | Owner | 目的 |
| --- | --- | --- |
| `opl` | Framework | 默认 CLI 前门 |
| `app.state.get` / `app.action.execute` / `app.contribution.*` | Framework RPC / App consumer | App read/action bridge |
| One Person Lab App | App | 桌面用户体验 |
| OPL Cloud | Cloud | 远端 workspace、resource 和协作 |

## Package surfaces

- `opl pack search|list|inspect|install|ensure|update|uninstall|enable|disable|link|unlink|sync|build|migrate-v1`：Package 生命周期与载体同步；
- `opl sources list|configure|check|disconnect`：软件源配置与连接检查；
- installed Agent/capability：从 owner descriptor 动态发现（如启用 `opl-foundry` 扩展则自动暴露 `opl foundry`）；
- owner publication：由 Package repo release surface 持有。

Framework 的 Package 命令不能成为第二 carrier、catalog 或 version authority。

## Runtime surfaces

- `opl daemon start|stop|restart|status|logs|doctor`：守护进程生命周期与只读诊断；
- `opl workspace init|list|inspect|sources|snapshot|writeback`：工作区与知识来源管理；
- `opl connect ...`：Connect 连接、授权、Gateway 与 MCP App stdio 通道；
- `opl runway ...` & `opl ledger ...`：长任务 StageRun/Attempt 执行控制、调度器与审计账本；
- Framework v2 的 `app.operatorDrilldown.get` RPC 供设置诊断与发布工具读取。同一个 SQLite 快照包含任务、阶段、尝试、Ledger 记录和包操作的总计，每类附最近 100 条记录的身份与状态。响应的 `schema` 是 `opl.operator_drilldown.v2`，`detail` 为 `full`。

这些 surface 不声明 domain quality、artifact acceptance、App release 或 production readiness。

## Domain surfaces

Standard Agent 的 CLI、MCP、Skill、Stage 和 custom view 来自 installed owner descriptor/capability map。Framework 不为每个 Agent 增加固定命令模块或成员表。

## Surface admission

新增默认公开 surface 必须有真实用户/caller，并至少满足一项：

- launch 或安全边界；
- authority/currentness；
- repeated user action；
- App/runtime 稳定消费；
- evidence、recovery 或 route-back。

纯诊断、审计、迁移或一次性 closeout 使用 detail/operator surface，不进入默认产品入口。

## Currentness

```bash
./bin/opl --help
./bin/opl daemon doctor --include-first-run --json
./bin/opl pack list --json
```

本页不冻结命令数量、Package 数量或 UI 页面。
