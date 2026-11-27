# OPL 架构

OPL Framework v2 在本机运行 `opld`。命令行、Studio 和 SDK 通过本地 JSON-RPC 访问同一组服务。领域 Package 提供专业能力和产物，Studio 展示用户在 OPL App 中可以执行的工作。

## 顶层结构

```text
opl CLI / Studio DSH Application Host / Python SDK
  -> opld (local JSON-RPC)
       -> Pack       安装来源、已安装 Package 和原生载体
       -> Workspace 工作区、知识来源和快照
       -> Connect   连接和消费者授权
       -> Runway    任务、阶段、执行尝试和调度
       -> Ledger    事件、产物引用、审查与收据
  -> 领域 Package / executor / 外部 provider
```

### Host scope boundary

Framework 的 `opld` 装配通用服务、保存本地运行状态并生成 App 投影。Studio 使用 DSH/Cordis 管理自己的插件、原生 Codex 会话、Desktop、WebUI 和 Docker 载体。App 仓持有产品行为、GUI 合同和发布决定。Cloud 与领域 Package 分别持有在线资源和专业结果。各方通过公开接口协作。[App 架构](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/architecture.md)

Studio 从 `app.state.get` 读取软件、工作区、连接和任务。普通页面取 `fast`，诊断可请求包含授权记录、调用记录和 Package 操作的 `full`。读取 Package 贡献使用 `app.contribution.read`，执行已投影动作使用 `app.action.execute`。读取和执行均绑定调用者的本地连接。具体参数及结果由 [RPC 路由](../packages/daemon/src/rpc/router.ts) 和 [App 状态投影](../packages/daemon/src/state/app-state-cache.ts) 定义。

## Source topology

[Core](../packages/core/) 提供 SQLite、迁移、锁、会话和事件等通用能力。五个领域服务按实际调用方向依赖 Core 和其他服务。[`packages/daemon`](../packages/daemon/) 组合服务，提供 CLI 和本地 RPC 入口。[`packages/mcp-app-shared`](../packages/mcp-app-shared/) 提供工作台、表单、交接及视图等共享机制。依赖方向由[源码导入检查](../scripts/check-v2-import-guard.mjs)验证。

| 服务 | 状态与职责 |
| --- | --- |
| [Pack](../packages/pack/) | 验证 Manifest 和内容锁，安装、链接、启停或更新 Package，并向 Codex 载体同步。 |
| [Workspace](../packages/workspace/) | 绑定工作区根目录，登记知识来源与已接受的修订，生成阶段快照并处理写回。 |
| [Connect](../packages/connect/) | 管理连接、能力授权与调用记录，按消费者身份检查访问范围。 |
| [Runway](../packages/runway/) | 保存任务、阶段和尝试，管理调度、租约、重试及人工决定，通过 executor 适配器执行。 |
| [Ledger](../packages/ledger/) | 保存可验证的任务时间线、产物引用、审查与收据，专业验收归领域或人工负责人。 |

### 共用基座的物理归属

- 从源码运行使用 [bin/opl](../bin/opl)。`opl --version --json` 返回当前 CLI 和 API 版本，`opl daemon status --json` 回读当前状态目录对应的进程和连接位置。
- SQLite 文件 `opl.db` 和运行会话位于 Framework 状态目录。可通过 `OPL_STATE_DIR` 指定目录，也可用 `OPL_DATA_DIR` 指定其上层数据位置。未显式设置时按平台选择用户状态目录。[路径解析](../packages/core/src/paths.ts)
- Package owner 维护 `opl-package.json` 和独立发布物。构建与安装读取 [Manifest v2 Schema](../contracts/opl-package.v2.schema.json)。Python 调用方使用 [opl-client](../sdks/python-client/)，从本地守护进程读取该状态目录下的数据。
- 领域代码、产物正文和业务库由对应 owner 维护。用户知识正文保存在原工作区或个人库。Framework 记录来源绑定、修订与授权范围，供 Agent 读取本次阶段使用的输入。[知识来源政策](./policies/knowledge-source-and-memory-policy.md)

## Package architecture

每个 Package 声明身份、依赖、授权需求及提供的入口。安装来源可能是目录、已校验的制品或原生载体。Pack 记录实际安装状态，按 Manifest 提供的能力生成投影。执行器的选择属于一次任务，官方 Profile 则指定首次安装或显式恢复所需的根包。可在[原生应用标准](./policies/agent-native-app-policy.md)和 [Agent/MiniApp SDK](./architecture/agent-miniapp-sdk.md) 查阅工具、工作台与领域产物的分工。

## Runtime control chain

Runway 将工作任务拆成 StageRun 和 Attempt，在 SQLite 中保存运行状态，并通过执行器适配器调用 Codex 或 Antigravity。服务重启时依据持久状态与租约协调恢复；等待人工决定的工作保留原状态。Ledger 把过程证据关联到同一任务。执行器结束后，读者可以分别查到运行结果、产物引用和专业审查结论。[运行实现](../packages/runway/src/runtime/) · [调度器](../packages/runway/src/scheduler/) · [任务账本](../packages/ledger/src/)
