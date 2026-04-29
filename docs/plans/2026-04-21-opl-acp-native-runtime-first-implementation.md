# OPL ACP-native Runtime First Implementation Plan

**Goal:** 把 `OPL` 从 `Product API` 主语切换成 `ACP-native session runtime` 主语，先落地本地 `opl` shell / TUI，再让 `AionUI` 成为第一外部壳。

**Architecture:** `OPL` 的 canonical truth 收敛到 family-level session runtime。`Product API`、`opl web` 与未来 GUI / hosted 入口都降为 projection。实现顺序按 `runtime -> local shell -> ACP bridge -> AionUI shell` 推进。

**Tech Stack:** TypeScript CLI、Node test runner、现有 `opl web` adapter、future ACP compatibility bridge、独立外部 shell repo

---

## 范围边界

- 当前计划覆盖 `one-person-lab` 主仓的 runtime-first 文档同步、session runtime 语义收口、本地 `opl` shell / TUI、ACP compatibility surface 与 AionUI 第一壳接入。
- 当前计划不把 `OPL` 写成 domain-local runtime owner。
- 当前计划不要求第一阶段完成 hosted / online 全功能版。

## 并行 lane

### Lane A: Runtime 文档与 contract 同步

目标：先把 canonical truth 写清楚，防止实现期间 drift。

- 修改：`docs/project.md`
- 修改：`docs/architecture.md`
- 修改：`docs/invariants.md`
- 修改：`docs/decisions.md`
- 修改：`docs/status.md`
- 修改：`README.md`
- 修改：`README.zh-CN.md`
- 修改：`docs/README.md`
- 修改：`docs/README.zh-CN.md`
- 修改：`docs/roadmap.md`
- 修改：`docs/roadmap.zh-CN.md`
- 新增：`docs/specs/2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md`
- 新增：`docs/plans/2026-04-21-opl-acp-native-runtime-first-implementation.md`

验收：

- 核心文档统一把 `OPL` 写成 session-runtime-first
- `AionUI` 被写成 first shell，不是 runtime owner
- `Product API` 被写成 projection surface

### Lane B: 本地 `opl` shell / TUI

目标：让用户在 workspace 中直接运行 `opl` 进入 session-first 交互面。

建议文件范围：

- `src/cli.ts`
- `src/codex.ts`
- `src/frontdoor-runtime-modes.ts`
- `src/frontdoor-task-store.ts`
- 新增 `src/opl-shell-*.ts`
- `tests/src/cli.test.ts`

目标行为：

- 在当前目录启动 interactive session
- 绑定当前 workspace / cwd
- 支持创建 / 恢复 session
- 支持 `@mas`、`@mag`、`@rca` 形式的 agent switch / dispatch
- 中途可查看 progress / artifacts / recent output

验收：

- 本地运行 `opl` 可进入 session shell
- 最少一条通用任务路径和一条 domain-agent 路径可跑通

### Lane C: ACP compatibility surface

目标：为外部壳提供最小可用的 ACP-friendly runtime surface。

建议文件范围：

- 新增 `src/acp-runtime-*.ts`
- 新增 `src/acp-bridge-*.ts`
- `src/types.ts`
- `src/frontdoor-mcp-stdio.ts`
- `tests/src/cli.test.ts`
- 新增 ACP bridge tests

最小覆盖：

- `session/new`
- `session/prompt`
- `session/update`
- `session/request_permission`
- `loadSession` / resume
- `cancel` / `close`

验收：

- OPL 运行时能通过 bridge 把已有 session / task / progress / artifact 真相投影给 ACP client
- 至少一条 fake ACP client 集成测试通过

### Lane D: AionUI 第一外部壳接入

目标：让 `AionUI` 作为第一壳验证 `OPL` runtime，而不是反向定义它。

建议仓范围：

- 独立 `opl-aion-shell` repo 或 AionUI fork worktree
- `AionUI` 的 custom adapter / extension adapter
- workspace selector
- session view
- progress / artifacts side panel

最小要求：

- 不重写 `OPL` runtime
- 优先通过 ACP compatibility surface 接入
- 只保留当前 MVP 需要的页面和模块

验收：

- 可从壳内选择 workspace
- 可创建 / 恢复 `OPL` session
- 可看到 progress / artifacts
- 默认交互走 `Codex`

## 吸收顺序

1. 先完成 Lane A，并吸收回 `main`
2. 并行推进 Lane B 与 Lane C
3. 当 B 与 C 的最小运行路径稳定后，再推进 Lane D
4. 每条 lane 完成后立刻验证、吸收、删除 worktree / branch

## 最小验证口径

- `git diff --check`
- 文档引用与路径自检
- 与 `opl web` / `Product API` 对齐的相关现有测试
- 新增 local shell / ACP bridge 的 targeted tests
- 外部壳至少一条端到端 smoke

## 当前不做的事

- 不先追求 hosted / online 完整产品
- 不先追求与 `Codex App` 完全等像素
- 不让 `AionUI` 重新定义 `OPL` 的 canonical runtime
- 不再维护旧 GUI 备线路线

