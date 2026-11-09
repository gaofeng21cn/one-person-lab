# OPL Agent App 开发指南

本指南将[开发标准](../policies/agent-native-app-policy.md)变成可执行的接入步骤，适用于标准智能体、其他 Agent、个人工作流和 Agent 原生 App。先接入需要的共用基座，再选择是否提供 UI。使用现有 Package 和 owner 工程，不创建另一种 MiniApp 包。协议、贡献 ABI 和工具行为见 [SPEC](./SPEC.md)。

## 从一条真实工作流开始

先在现有产品 SPEC 或 OMA 蓝图中写清下面的设计事实，不增加第二份配置 manifest：

| 设计项 | 应给出的内容 |
| --- | --- |
| 目标与业务 owner | 用户要完成什么、真实数据/产物在哪、谁接受结果 |
| Agent 主流程 | 已有读/写入口、输入/结果 schema、长操作身份、错误与恢复方法 |
| 人介入点 | 需要比较、选择、编辑、专业判断或授权的具体时刻；明确只读也可成立 |
| 共用环境 | 需要哪些连接能力和知识范围，哪些必要、哪些可选；公共 owner、实际 caller、已接入或待迁移处，以及不适用理由 |
| 展示选择 | 无 UI、共享视图、专用 MCP App 或专业应用；说明具体理由 |
| 交接数据 | 精确对象、workspace/task/artifact 身份、revision、选择状态、返回结果 |
| 验证与分发 | 代表性成功/失败场景，所需 Host 能力，选定 carrier 与 owner 发布路径 |

优先完成“复用已有环境 → Agent 读取对象 → 原 owner 执行 → Agent 回读结果”的链路。有人类操作点时，再加入精确 UI 打开、选择或编辑和同一对象交接。先证明所需链路，再扩展页面和通用模块。

## 让已有环境可直接使用

按真实需求选用已有入口，不要求所有应用依赖所有基座能力，也不要求轻量工具改成标准智能体。

先按[物理归属](../architecture.md#共用基座的物理归属)找到实际 owner。开发与安装环境使用 `opl framework locate --json` 核对选定的 Framework；模块通过公开 export 或既有 CLI 调用，Python carrier 使用基座的现有投影流程。代码安装根、运行状态目录、Profile/Workspace 与知识正文位置分别配置，不把个人 checkout 或默认 Codex home 当作所有消费者的共同来源。

| 需求 | 接入方式 | 验证重点 |
| --- | --- | --- |
| 复用外部服务账号 | 可信服务启动时通过 `opl-framework/connection-authorization-host` 的 `activateInstalledPackageConnectionContext` 绑定自己的 installed Package；消费注入的 `connect` port | 已有 grant 可用；撤权、连接修订或载体变化阻止后续调用；业务结果回到 provider |
| 复用模型能力 | 调用既有模型/provider owner 的公开执行入口；图片 API 回退使用 `opl-framework/domain-task-runtime` 的 `runDomainImageGeneration`，详见[接口](../specs/domain-image-generation.md) | 领域保留 built-in 优先和专业质量判断；选定账号由公共 owner 解析，缺失不换账号，未知结果不自动重试 |
| 读取个人或主题知识 | 已知知识 ID 使用 `opl knowledge read-source`，派生摘要使用 `verify-dependencies`，按获授权 workspace/domain/project 取用 | 真实来源及接受版本可读；撤权、过期或原文改变时排除旧内容 |
| 固定一轮任务的知识依据 | 使用 `prepare`、`read-context` 和行动前 `revalidate --for-action`；托管 StageRun 使用自动绑定 | 真实上下文消费、依赖版本和缺口可回读；只有空 catalog 或命令存在不算接入 |
| 修改已登记的知识 | `propose/review/apply`，或原处编辑后 `inspect-source/review-source`；移动时维护 locator | 正文、接受版本与派生摘要一致；冲突不覆盖，旧缓存不掩盖失效 |
| 复用工作与成果 | 短操作返回原 owner 结果；长操作使用已有 Task/StageRun 或领域任务身份 | 同一对象查询和恢复；领域业务库与产物权威保留在原处 |

连接工厂只用于可信 Host/服务启动，安装根来自自身模块位置，Package 身份由启动代码固定。它不会安装、授权或根据页面选项切换消费者。完整约定见[Connect 接口](../specs/connection-authorization.md)。非 Package 的直接用户工具沿用既有 owner 入口，不能借用其他 Package 的身份。

知识接口见[来源与上下文接口](../specs/knowledge-sources.md)。轻量工具读取单个获授权来源无需创建空 Task/StageRun；`recall/prepare` 按接口要求提供产品 catalog、repository、真实 domain、适用阶段及工作区/项目。来源绑定完成后，只询问仍缺失、冲突或过期的信息；不要再次收集已获授权的同一偏好或资料。没有个人库时，工作目录可作为相同机制下的来源。

就绪情况从各 owner 回读，清楚区分缺安装、缺连接、缺 grant、缺知识、来源过期与业务尚未执行，并给出该 owner 的修复入口。公共 provider 尚未实现时先补 owner 的最小能力，再接消费者；不要让各应用用新的配置文件、授权副本或知识库暂代。

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

UI 使用前述已接入的 owner 上下文，页面只请求该 owner 已暴露的操作；页面 Package 选择不能激活任意消费者。知识正文与冻结上下文通过现行知识命令读取，来源视图仅投影获准的元数据；不提供尚不存在的通用 `context.knowledge` API。

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

## 精确交接与来源视图

共享页面将 `open_opl_apps` 的 `input` 绑定到具体 Package/view。切到同包其他视图时不沿用原视图的领域参数；已打开的执行表单使用当时的目标与版本。owner 在 `actions[].input` 中提供完整对象与 revision/digest，并在 `command_inputs[action_ref].input_schema` 将这些字段设为 `readOnly`；执行端仍须核对精确版本。UI 的绑定不代替 owner 并发检查。

owner 执行结果可附已有贡献引用形式的 `readback: { data_ref, input }`。共享页面只接受同包已声明的数据引用，将操作输入、owner 结果和只读回读请求交回 Agent。传输中断后仅尝试原目标只读回读，保留“操作结果待核对”，不重发写入。无 UI 的 Host 仍可使用 `open_opl_apps` 返回的结构化结果以及 owner 原有 CLI/API。

`opl-runtime / opl.runtime.knowledge` 是阶段知识来源视图，通过 canonical `item_id` 找到实际任务、当前阶段、工作区和已安装 owner，再读取知识 owner 的召回元数据。它不接受页面提供的 Package 路径或领域身份作为授权，不显示正文、私有来源路径或凭据。此视图展示当前阶段通用召回会选用的来源和缺口，`selection_scope=stage_only` 明确不含仅适用某个动作的知识；已运行任务的冻结上下文继续由知识 owner 的 `prepare/read-context` 与行动前 `revalidate --for-action` 管理。


`runtime_context` 的产物读取可携带 `runtime_handoff: { package_id, view_id, input }` 返回原任务。共享页面只打开 catalog 中的目标；当前产物的工作项身份、工作区相对引用和 SHA-256 随 `review_context` 进入原 runtime action，执行前重新核对来源字节。人工决定引用写入原 Attempt 不等于阶段通过或已继续运行；后续仍由实际任务/controller 按其质量门禁处理。


## 人工审阅后继续原任务

共享视图的 `human_gate` 记录人工决定引用。后续阶段沿用既有领域 action 或 `opl family-runtime attempt create`，保留原 `--task`、execution scope 和 workspace locator，以新的稳定 `--stage-run-invocation-id` 创建同任务的后续 StageRun。`--human-gate-ref` 同时通过 `--input-artifact-ref` 与 `--input-artifact-sha256` 绑定精确决定字节；决定进入不可变输入和 checkpoint，producer 与 reviewer 保留原 Task 身份。

相同 invocation 的重开查询既有运行；改变决定、输入或目标必须使用新 invocation，旧摘要不能读取新字节。决定记录、阶段执行完成和领域质量接受分别回读；这条路径不解除 quality Attempt 的通用 resume 禁令，也不把人的批注当作专业质量批准。
