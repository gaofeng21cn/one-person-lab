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

## 验证

从源码 checkout 读取本机任务与执行器状态。

```bash
./bin/opl runway list --json
./bin/opl runway executors health --json
```

从任务列表取得 task ID，使用 `opl runway status <taskId> --json` 查看其阶段和尝试，或使用 `opl ledger timeline <taskId> --json` 读取该任务的事件和证据。
