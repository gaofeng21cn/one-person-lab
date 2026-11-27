# OPL Runtime 命名与边界

Runway 管理长任务，Workspace 决定任务材料所属的工作区，Ledger 将证据关联到同一个任务。[运行时类型](../../packages/runway/src/types.ts)

| 对象 | 身份与职责 |
| --- | --- |
| Task | 一个工作目标，按 task ID 关联工作区、Agent、阶段及其执行结果。 |
| Stage / StageRun | Stage 描述专业工作阶段，StageRun 记录该任务中阶段的执行状态。 |
| Attempt | 一次执行尝试，关联阶段、执行器、状态和可回读的结果。 |
| Executor | 通过适配器调用实际后端。执行结果与专业验收分别由执行器和领域负责人提供。 |
| Workspace | 登记工作区根目录与身份，管理材料来源、快照与写回。 |
| Ledger entry | 证据、事件、产物引用或审查记录。产物正文由相应工作区或领域应用保管。 |

## 控制链与恢复

`opld` 装配 Runway 和调度器。Runway 持久化任务、StageRun、Attempt 及执行租约，按状态决定可继续的工作。服务恢复时保留人工暂停，后续决定回到同一任务。核对运行恢复可查看任务状态、执行器健康及 Ledger 时间线，专业结果由领域负责人验收。[运行实现](../../packages/runway/src/runtime/) · [Ledger](../../packages/ledger/)

## 从 v1 升级时只读检查遗留运行

保留旧工作区、领域应用数据目录及旧审计索引（如 `<原状态目录>/family-runtime/queue.sqlite`）时，v2 启动不会自动接管或续跑旧执行，但可通过下列只读诊断入口查看历史记录（对应实现见 [`legacy-runs.ts`](../../packages/daemon/src/cli/legacy-runs.ts)）：

```bash
opl --state-dir "$OLD_OPL_STATE_DIR" daemon doctor --legacy-runs --json
```

`last_recorded_status` 表示旧索引最后记下的状态；输出给出每类记录总数，默认各列最近 100 条（可用 `--limit <数量>` 扩大范围），并固定标明 `live_status_verified: false`。`index_absent` 表示该路径没有旧索引。v2 Runway 的自动恢复只覆盖自身写入 `opl.db` 的持久化执行。如需转到 v2 继续，请先保留原任务引用和人工决定，再通过领域负责人确认的下一步在 Runway 启动新任务。

## 已观察的能力调用与独立审查

要审查某次生成，先用本地 RPC `runway.stage.start` 传入 `stage_run_id`、`role: "producer"` 和 `complete_stage_status: "awaiting_review"`。生成结束后，再对同一 StageRun 发送 `role: "reviewer"` 与 `reviewed_attempt_id`。独立审查使用自己的执行会话；若采用单独的审查阶段，可显式指定同一任务内已成功的生成或修复 Attempt。设定 `await_completion: true` 可等待该次执行并取得 Attempt 标识。

通过 `opl runway status <taskId> --json` 的 `attempts[].reviewed_attempt_id` 和 `capability_call_receipts` 核对生成与审查的关联。对 Codex 已完成的 MCP 工具调用，Runway 保存调用的 Attempt、工具标识、输入与输出的 SHA-256 摘要。调用身份由 `attempt_id`、`call_id_source` 和 `call_id` 共同确定。Codex exec 发出本进程的 item ID，app-server 发出线程中的 item ID。同一键重复出现且结果冲突时，记录标记为 `conflict`。

校验时，对冻结的调用入参按 [Core 的规范 JSON 编码](../../packages/core/src/ids.ts)计算输入摘要。输出摘要覆盖同次成功回包的 `content`、`structuredContent` 和 `_meta`，缺失的后两项编码为 JSON null。能力提供方可在该回包的 MCP 元数据 `_meta["onepersonlab.org/bindingDigest"]` 提供其实际服务数据的绑定摘要，格式为 `sha256:<64 位小写十六进制>`。审查方将这一值与领域负责人保管的绑定材料核对。缺少该字段时 `binding_digest` 为 null。当前的自动关联覆盖 Codex exec 与 app-server 报告的成功 MCP 调用。直接调用 Connect 或使用其他执行器时，若缺少可关联到本次 Attempt 的受支持事件，回执列表为空。部署隐私准入与领域结论分别由相应负责人举证。

## 验证

从源码 checkout 读取本机任务与执行器状态。

```bash
./bin/opl runway list --json
./bin/opl runway executors health --json
```

从任务列表取得 task ID，使用 `opl runway status <taskId> --json` 查看其阶段和尝试，或使用 `opl ledger timeline <taskId> --json` 读取该任务的事件和证据。
