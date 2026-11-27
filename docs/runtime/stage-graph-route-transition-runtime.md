# Stage graph 与 AI 路由边界

Owner: `OPL Runway`
Purpose: `stage_graph_route_transition_runtime_support`
State: `active_support`
Machine boundary: 本文是 StageRun、Attempt 与跨 Stage 物化边界的人读说明。机器真相归 [`packages/runway/src/types.ts`](../../packages/runway/src/types.ts)、[`runway-runtime.ts`](../../packages/runway/src/runtime/runway-runtime.ts)、[`opl runway`](../../packages/daemon/src/cli/main.ts) CLI 与 [`packages/ledger/src/`](../../packages/ledger/src/index.ts)。

## 当前结论

Stage graph 只声明可用 stage 与 artifact handoff 范围，不是可执行状态机。语义 route owner 是当前 StageRun 的决定性执行 Attempt（producer 或独立 reviewer）。Codex 与 Antigravity 是当前支持的一等 executor；executor 根据当前 artifact、阴性结果、review finding、质量债与用户目标，产出阶段建议或路由意见。

OPL Framework 只持有 Runway 任务/阶段编排、SQLite 持久化状态（`opl.db`）、执行租约（`lease-manager.ts`）、artifact refs 与 operator projection。它不替代领域负责人执行专业判断或质量裁决。

在一个 StageRun 内，决定性 Attempt 提交结构化进度与阶段输出；当审查明确指出需要修复或回溯到其他 declared Stage 时，由 Runway 记录 findings 与质量债并触发后续 StageRun，避免在错误阶段继续空跑。hard stop 只提交 typed blocker 或 human gate（`awaiting_human`），由授权决策（`opl runway decide` / `runway.humanGate.resolve`）解阻后再推进。

## Durable invocation 与持久化执行

Runway 将 Task、StageRun、Attempt、Schedule 与租约保存在状态目录的 SQLite `opl.db` 中，不依赖外置队列数据库。守护进程重启或恢复时，通过租约检查和状态对账恢复可继续的任务；等待人工决定（`awaiting_human`）的阶段保留挂起状态，直到人工决策落盘。

要对生成产物做独立审查，先通过 `runway.stage.start` 传入 `role: "producer"` 和 `complete_stage_status: "awaiting_review"`；完成后在同一 StageRun 或指定新阶段发起 `role: "reviewer"` 与 `reviewed_attempt_id`，由独立执行会话核对 `attempts[].reviewed_attempt_id` 与观察到的能力调用摘要（`capability_call_receipts`）。

Python 能力处理器由 `ContributionDispatcher` 与执行器环境注入内置 `sdks/python-client/src` 到 `PYTHONPATH`，保留已有环境配置与显式路径；缺失所需依赖时返回可诊断错误，不隐式改写用户全局环境。

## Progress-first 与合法硬停

- 任意可读 artifact、部分草稿、失败尝试、阴性结果或已物化的 diagnostic 都是下一 stage 的合法输入。
- 质量债只能关闭 `accepted`、`ready`、`publication`、`export` 或 `promotion` 声明，不能在无安全风险时阻断下游审阅与修复流转。
- 只有以下边界可阻断推进：selected executor 不可用；权限、凭据、安全或 authority 边界；wrong-target identity/currentness 不匹配；不可逆外部动作；明确 human/owner decision；或多次诊断尝试仍零可消费产物。

这些硬停保护执行安全与身份一致性，不评价内容质量，也不替代领域验收。

## 当前机器入口

- [`packages/runway/src/types.ts`](../../packages/runway/src/types.ts)
- [`packages/runway/src/runtime/runway-runtime.ts`](../../packages/runway/src/runtime/runway-runtime.ts)
- [`packages/runway/src/runtime/lease-manager.ts`](../../packages/runway/src/runtime/lease-manager.ts)
- [`packages/runway/src/store/sqlite-store.ts`](../../packages/runway/src/store/sqlite-store.ts)
- [`packages/runway/src/store/capability-call-receipts.ts`](../../packages/runway/src/store/capability-call-receipts.ts)
- [`packages/ledger/src/store.ts`](../../packages/ledger/src/store.ts)
