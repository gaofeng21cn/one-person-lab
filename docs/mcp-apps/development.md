# OPL Agent App 开发指南

本指南将[开发标准](../policies/agent-native-app-policy.md)变成可执行的接入步骤。使用现有 Package 和 owner 工程，不创建另一种 MiniApp 包。协议、贡献 ABI 和工具行为见 [SPEC](./SPEC.md)。

## 从一条真实工作流开始

先在现有产品 SPEC 或 OMA 蓝图中写清下面的设计事实，不增加第二份配置 manifest：

| 设计项 | 应给出的内容 |
| --- | --- |
| 目标与业务 owner | 用户要完成什么、真实数据/产物在哪、谁接受结果 |
| Agent 主流程 | 已有读/写入口、输入/结果 schema、长操作身份、错误与恢复方法 |
| 人介入点 | 需要比较、选择、编辑、专业判断或授权的具体时刻；明确只读也可成立 |
| 共用环境 | 需要哪些连接能力和知识范围，哪些必要、哪些可选；已有授权和来源如何复用 |
| 展示选择 | 无 UI、共享视图、专用 MCP App 或专业应用；说明具体理由 |
| 交接数据 | 精确对象、workspace/task/artifact 身份、revision、选择状态、返回结果 |
| 验证与分发 | 代表性成功/失败场景，所需 Host 能力，选定 carrier 与 owner 发布路径 |

优先完成“Agent 读取对象 → 打开必要 UI → 人作出一项选择/编辑 → 原 owner 应用 → Agent 回读继续”这条纵向链路。先证明它，再扩展页面和通用模块。

## 选择最小 UI

| 工作需求 | 采用方式 | 代码/声明归属 |
| --- | --- | --- |
| 单值查询、后台运行、没有人类操作点 | 现有工具/CLI/API | 领域 owner；无需新前端 |
| 进度、列表、产物、审阅、差异与选择 | 共享声明式视图 | owner descriptor + contribution adapter；Framework renderer |
| 邮件编辑、媒体审看等密集交互 | 专用标准 MCP App | 领域仓 UI + 同一业务服务；官方 SDK |
| 高频创作、设备控制、地图或常驻监测 | 保留专业应用，提供可调用操作及对象链接 | 既有应用 owner；按需要增加轻量审阅面 |

只读 UI 不必复制完整的 Agent 动作集。可调用能力与人类需要直接操作的范围分别设计；真正的写操作仍走同一 owner。

## 复用现有接线

共享视图从 installed descriptor 发现。`app-contribution-adapter.json` 将现有 `data_ref`/`action_ref` 映射到 owner 的 JSON 读取、固定命令或已有 `runtime_context`；其路径、输入和输出以 [SPEC](./SPEC.md#adapters) 为准。工作区默认值可由绑定提供，不能靠让用户每次寻找 manifest 文件填空。

Agent 使用 `open_opl_apps` 指定所需 Package/view 与上下文；`opl_app_contribution_read` 读同一 owner；写入使用 `opl_app_contribution_execute` 及 owner 的确认/revision 要求。这些名字是现有接口，不是要求每个 Package 再实现一份同名服务。专用 App 使用标准工具与资源，复用领域服务；不复制共享 dispatcher。

通用状态组件应覆盖加载、空结果、错误、缺少输入、过期视图、动作待定和可用产物。renderer 按 `view_kind`/schema 选择；领域格式转换应尽量在领域 owner 内完成，避免在 Framework 增加按产品名分支。文件预览与媒体定位复用宿主已授权的 artifact 桥，保留路径与工作区校验。

连接接入复用 [Connect](../specs/connection-authorization.md)。可信 Host 初始化 owner 的消费者上下文，页面只请求该 owner 已暴露的操作；页面 Package 选择不能激活任意消费者。知识接入复用 Framework 的现行知识命令和合同，绑定用户已有来源、按任务读取冻结版本；不提供尚不存在的通用 `context.knowledge` API。正在迁移的来源 schema 由知识 owner 交付，接入时以其实际 CLI/schema 为准。

## 可重复的开发验收

开发环境用合成账号、资料和产物跑代表性流程。下面是测试场景，不要求创建单独测试框架或为每个低风险页面复制全部测试：

1. **基本闭环**：Agent 发现并读取；精确 UI 打开；人修改/选择；owner 返回结果；Agent 可继续。已有数据或授权不再重复询问。
2. **对象与并发**：选择 A 后迅速切换 B，A 的慢请求不得覆盖 B；过期 revision 不能覆盖新编辑；不同 workspace/project 的对象不能串用。
3. **副作用**：双击、网络中断、关闭重开不会自动重复发送/发布/应用；未知结果回到原 owner 查询。
4. **共用环境**：已授权/未授权/撤销的连接；有个人资料库/只有工作目录；来源变更、过期和写回冲突。凭据和私人正文不进入公共 UI 元数据或日志。
5. **宿主与降级**：选定的真实 Host 内完成交互；无 UI Host 能读取结果并走明确替代入口；sandbox 无存储权限时仍可启动；工具 visibility/线程/服务器边界拒绝越权。
6. **交付**：选定 carrier 安装后，声明资源真实存在，调用与重开仍成立。独立发行、App 内嵌和源码版本分别回读。

验收结果使用“已通过 / 未通过 / 未验证 / 不适用＋理由”，附精确版本和证据。协议 fixture 不能替真实宿主验收；领域输出另由专业 owner 接受。

## 参考实现的选择

Framework shared App 是通用进度/产物/审阅组件的来源。Relay 专用工作台展示了工具/UI 共用邮件服务与浏览器回退；Med Auto Cast 的 review feedback 展示 revision 与 request ID；Photo Steward 展示计划差异后由原 CLI 应用。参考其真实当前源码与测试，不把这些产品 ID 固定进 runtime catalog，也不把它们现有安装状态写成所有新应用的保证。

第二个真实消费者接入时，记录哪些 owner 代码直接复用、哪些适配仍有重复。优先删除重复的连接处理、状态镜像、UI 状态机和手工上下文录入；仅当相同复杂性确实跨消费者存在时抽取公共模块。开发效率看首次可用闭环所需工作、重复实现减少和验收缺陷，而非新建模块数量。
