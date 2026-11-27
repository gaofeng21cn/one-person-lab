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

## 从 Temporal 升级时交接在途工作

**升级前，用 v1 的 `opl` 清点工作。** 同时保留原工作区、领域应用的数据目录和原执行环境，直到每条在途工作都有去向。以下命令读取 v1 的配置或运行索引。把占位符换成列表中的实际 ID。

```bash
opl family-runtime status --json
opl family-runtime attempt list --json
opl family-runtime attempt inspect <stage_attempt_id> --json
```

从状态输出的 `family_runtime.provider_runtime.providers.temporal.details` 读取实际的 `address` 和 `namespace`。用原服务确认仍在运行或等待人工决定的工作。下列命令示例中的环境变量取自这次回读。对于多个同名执行，用相应的 run ID 回读精确历史。

```bash
temporal workflow list --address "$TEMPORAL_ADDRESS" --namespace "$TEMPORAL_NAMESPACE" --query "ExecutionStatus = 'Running'"
temporal workflow describe --address "$TEMPORAL_ADDRESS" --namespace "$TEMPORAL_NAMESPACE" --workflow-id "$WORKFLOW_ID" --run-id "$RUN_ID"
temporal schedule list --address "$TEMPORAL_ADDRESS" --namespace "$TEMPORAL_NAMESPACE"
```

- **运行中。** 记录 workflow ID、run ID、领域任务 ID、工作区、最近交付物和已发生的外部动作。原 Worker 仍能处理时，让当前工作在 v1 结束并回读结果。有周期任务时，一并核对旧 Schedule；重新建立相同计划前，先经原管理入口暂停其后续触发，并确认已派发执行的状态。
- **等待人工决定。** 保留原 gate、待决定事项和已有回执。沿原任务的审阅入口处理，记录决定并用原 workflow 确认是否推进。一个已接受的信号只能证明收到指令；质量审阅的下一次尝试由原 StageRun 控制。若决定尚未做出，继续保留待审状态。
- **原服务不可达，或动作结果未知。** 保留原任务 ID、索引、回执和产物，标记“待核实”，待能访问原服务或领域系统后查明结果。尤其是已经发出的提交、发送或其他外部动作，确认结果前避免再次执行。

**保留原记录。** v1 的本地审计索引是 `<原状态目录>/family-runtime/queue.sqlite`。macOS 由 OPL 托管的本机 Temporal 服务通常将历史保存在 `family-runtime/temporal-server/temporal.sqlite`；外部服务的历史由原地址和 namespace 管理。保存 SQLite 时用一致性备份或停止对应写入者后保全数据库及相关 WAL 文件。同时保留 `workspace-registry.json`、工作区实际目录和领域业务库。仅保存软件或 `queue.sqlite` 无法恢复完整的 Temporal 执行历史。

**升级后，先找回原任务。** v2 在同一状态目录读取已有工作区绑定和原生软件载体，领域应用可按原业务 ID 打开其支持的已有数据。用下列命令只读查看 v1 本地记录的 workflow、StageRun 和 Attempt 引用。该命令可直接指向旧状态目录，无需启动新旧执行服务。

```bash
opl --state-dir "$OLD_OPL_STATE_DIR" daemon doctor --legacy-runs --json
```

`last_recorded_status` 表示旧索引最后记下的状态。输出给出每类记录总数，默认各列最近 100 条；可用 `--limit <数量>` 扩大范围。`index_absent` 表示该路径没有旧索引，Temporal 服务和已保留的领域记录仍可独立核查。v2 Runway 的自动恢复只覆盖自身持久化的执行；旧 Temporal 工作流和 Schedule 继续由原服务管理。如需转到 v2 继续，请先确认原运行已经结束或停止，保留原任务引用和人工决定，再从领域负责人确认的下一步开始。

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
