# OPL Foundry 扩展与控制边界

Owner: `One Person Lab`
Purpose: `foundry_extension_control_plane`
State: `active_support`
Machine boundary: 本文说明 `extensions/foundry/`（`opl-foundry`）的职责与边界。当前实现与测试入口以 [`extensions/foundry/src/cli.mjs`](../../extensions/foundry/src/cli.mjs)、[`extensions/foundry/README.md`](../../extensions/foundry/README.md) 与 `opl foundry --help` 为准。

## 控制面模型

`opl-foundry` 是声明 `opl.package.v2`（`intent: "extension"`）的官方 CLI 扩展包，负责标准智能体与能力包的脚手架生成、静态校验、确定性冻结评测、风险比较以及 CAS 激活/回滚。它不持有领域业务真相、包安装目录权威或产品发布权威。

标准命令行链路为：

- `opl foundry init <dir> --id <id> [--intent <agent|app|extension|channel>]`：生成符合 `opl.package.v2` 的最小包骨架；
- `opl foundry validate <dir>`：核对 `opl-package.json` schema、安全相对路径、declared entrypoints/skills、`ui` 交叉引用及 `opl-release.lock.json` 完整性；
- `opl foundry eval <dir> [--suite <path>] [--state-dir <dir>]`：运行确定性冻结评测，向 `${OPL_STATE_DIR}/foundry/` 追加带 SHA-256 哈希链的 `opl-foundry-run-event.v1` 事件账本与 `EvidenceBundle`，不修改目标包源码目录；
- `opl foundry compare --baseline <dir> --candidate <dir> [--regression-tolerance <n>]`：重算风险分级（`low` / `medium` / `high`）、检查非弱化门禁并检测指标退化；
- `opl foundry promote <targetAgentId> --run-id <runId> [--expected-revision <n>] [--authority-receipt-ref <ref>]` 与 `opl foundry rollback ...`：按显式 CAS `expected_revision` 与 owner gate（中高风险要求 `authority-receipt-ref`）推进或回滚激活指针。

## 权限与安全边界

- **不可变评测**：`eval` 与 `compare` 不修改目标包目录，删除或弱化既有保护测试用例将在门禁校验阶段被 fail-closed 拦截。
- **CAS 与权属隔离**：`promote` 与 `rollback` 通过 `expected_revision` 防止并发覆写，不改写历史事件账本；领域业务验收与公开发布仍由各 Package owner 独立承担。
- **验收证据**：构建与协议验收见 [Foundry 构建验收](../delivery/foundry-package-construction-acceptance.md)；源码测试位于 [`extensions/foundry/tests/`](../../extensions/foundry/tests/foundry.test.mjs)。
领域资格结论必须来自所组合端口的真实执行及独立审核证据。
