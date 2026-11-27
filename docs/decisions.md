# OPL 关键决策

本文只保留当前仍有效、且不能仅从代码结构直接读出的决策。实施状态属于 [状态](./status.md)，未完成事项属于 [当前差距](./active/current-state-vs-ideal-gap.md)。

## 产品分为 Base、App、Packages 和 Cloud

[产品分层](./project.md#产品分层) 让通用底座、桌面体验、专业能力和云端资源各自演进。专业判断留在领域 owner，避免 Framework 成为所有产品与领域的中央负责人。

## 应用以 Agent 可调用能力为核心，协作 UI 按工作需要出现

[Agent 原生应用标准](./policies/agent-native-app-policy.md)统一开发理念：工具与 UI 共用领域 owner，已有连接和个人知识在授权范围内复用；MiniApp 复用 Package 与标准 MCP Apps。采用共享视图、专用 MCP App 或专业应用，由实际人机协作需求决定。这让新增应用复用已有基座，而不强制每个 Agent 新建前端、凭证库和个人资料副本。

## Package 拓扑按真实生命周期晋升

[Package 拓扑](./project.md#package-拓扑) 将拆仓与发布分开判断：前者解决责任和复用，后者解决分发与回滚。该选择避免提前平台化，也避免真实通用能力被单一产品发布节奏锁住。

## 安装事实由实际载体维护

Package owner 声明身份、依赖和公开的能力。Pack 管理本机安装、链接及制品内容校验。原生 carrier 保留自身的物理安装事实；App 从 Framework 投影获取安装状态和可用动作。

## Family capability 使用动态 portfolio

[Portfolio](./references/family-capability-portfolio.md) 用于解释能力，物理源码、安装和发布分别由实际 owner 持有。品牌名称不能决定目录或安装成员，因而新增能力不需要复制一套品牌状态文档。

## Studio 和 Framework 各自管理进程内状态

Studio 使用 DSH/Cordis 装配客户端插件和 Codex 会话。Framework 将任务、Package 与连接状态集中在本机 `opld`，让 GUI、CLI 和 SDK 可使用相同的读写入口。两者通过带会话握手的本地 RPC 协作。[Host scope boundary](./architecture.md#host-scope-boundary)

## 长任务由 Runway 持久化

Runway 将工作状态、执行尝试与调度记录保存到相应状态目录的 SQLite 数据库。守护进程恢复时依据任务状态和租约协调重启，任务可保留人工暂停。领域负责人和人工评审保留产物验收和发布决定。

## Codex carrier 随安装载体归属

Base/headless 安装必须自包含可用的 Codex executable carrier；App 使用其 shell 或 product owner 选择的 exact carrier。两者是互斥部署角色，不是同时生效的双 authority。

稳定边界是 `OPL_CODEX_BIN + codex app-server --stdio`。Framework 不解析 App 私有 carrier manifest，App 也不通过 Framework fallback 猜测 executable。

一键安装的初始检查与最终就绪投影只读取已选 Codex 的本地版本和兼容性；兼容 carrier 直接复用，不为就绪检查查询上游最新版。缺少可用 carrier 的实际安装与显式升级仍由正式 resolver 选择目标，未查询的 `latest_version` 保持未知。

## 知识以用户与业务归属组织，运行目录只表达消费关系

个人投资、长期研究主题和团队政策的生命周期通常长于某次任务，也可能被多个 Agent 使用。把知识归属绑定到 Agent 或项目目录，会造成重复维护，并使换工具或移动文件变成事实迁移。

因此，[知识来源与记忆政策](./policies/knowledge-source-and-memory-policy.md)将归属、内容性质、来源和访问分别表达。已有个人库直接承载正文；没有个人库时使用普通业务工作目录；运行时从同一机制读取并冻结本次使用的内容。明确的版本与消费回执提供可追溯性，无需维持强制的中间全文投影。派生摘要必须随来源版本和授权变化重新判断，不能成为隐蔽的第二事实源。

## 文档直接收敛，不保留当前树内的历史兼容面

当前文档用于指导下一次工作，Git 用于追溯历史。执行流水与兼容说明混入当前文档会被误读为受支持能力，因此直接收敛当前 owner。具体保留、退役和检查规则仅由 [文档生命周期政策](./policies/docs-lifecycle-policy.md) 定义。
