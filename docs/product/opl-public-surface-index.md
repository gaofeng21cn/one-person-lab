# OPL Public Surface Index

本文解释公开 surface 的分组和 owner。精确命令、operation 和字段由 `contracts/opl-framework/public-surface-index.json`、CLI specs 和 `opl --help` 持有。

## User surfaces

| Surface | Owner | 目的 |
| --- | --- | --- |
| `opl` | Framework | 默认 CLI 前门 |
| `opl app state|action` | Framework contract / App consumer | App read/action bridge |
| One Person Lab App | App | 桌面用户体验 |
| OPL Cloud | Cloud | 远端 workspace、resource 和协作 |

## Package surfaces

- `opl packages list|install|update|uninstall|repair`：通过配置 native carrier 工作，诊断使用 `packages status`；
- installed Agent/capability：从 owner descriptor动态发现；
- Cordis contribution：在受控 Host profile 内装配；
- owner publication：由 Package repo release surface 持有。

Framework 的 Package 命令不能成为第二 carrier、catalog 或 version authority。

## Runtime surfaces

- `opl framework readiness`：Framework consumer readiness；
- `opl family-runtime ...`：provider、worker、Attempt 和 recovery；
- `opl runtime app-operator-drilldown`：operator detail；
- `opl cordis inspect`：composition identity 和 services。

这些 surface 不声明 domain quality、artifact acceptance、App release 或 production readiness。

## Domain surfaces

Standard Agent 的 CLI、MCP、Skill、Stage 和 custom view 来自 installed owner descriptor/capability map。Framework 不为每个 Agent增加固定命令模块或成员表。

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
./bin/opl app state --profile fast --json
./bin/opl packages status --json
```

本页不冻结命令数量、Package 数量或 UI 页面。
