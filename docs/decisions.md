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

## 本机持久状态只有 `opld` 一个写入入口

CLI、Studio 和 SDK 对 Framework 持久状态统一调用 `opld` 的 JSON-RPC。`opld` 将配置和运行状态写入 SQLite `opl.db`；CLI 子命令（包括 `opl sources`）不能绕过 RPC 写独立 flat JSON，也不能在非 macOS 主机回写 `~/Library/Application Support/OPL/state/...`。现有 JSON 只允许由一次性只读迁移消费，迁移完成后由数据库继续持有事实。

## Catalog 先发布再晋升

Catalog 的 `v2_release` 只有在不可变 OCI 制品发布并完成 manifest 与摘要回读后才能晋升。客户端和 Package resolver 找不到 Catalog 选定的 GHCR manifest 时必须 fail closed；HTTP 404 不能把 v2 选择静默降级为 v1。

## Full 离线 seed 只加速公开字节

`OPL_FULL_RUNTIME_HOME` 只为版本与 commit 匹配的公开 Package 提供已验证字节的离线加速。在线可用时，seed 不屏蔽 `authorized_only` 私有 Package，也不替代目录可见性、授权检查和线上更新。

## OPL Link companion 由 Studio 托管

OPL Link companion server 只由 Studio 的 `opl-host-core` 托管。Framework 及 `@opl/connect` 只提供 Gateway companion authorization（包括 `opl connect gateway authorize-companion` 与对应 RPC），不再承载第二个 companion server。

## v2 完成后移除双轨工具

当活跃 Catalog Package 全部完成 `opl.package.v2` 迁移后，删除固定的 pre-v2 发布工具提交和 runtime v1→v2 adapter。过渡实现不能成为永久的 resolver、currentness 或发布入口。

## 跨产品发布编排与 Framework 解耦

`one-person-lab`（Framework v2）、`opl-catalog`（只读消费者软件目录信任根，仅保存静态目录数据与 attestation，不挂载跨仓写私钥）与 `opl-release`（横向发布交付平台：统一 `.opl-release.json`、`opl.release-receipt.v1` 标准回执、可复用发布工作流与纯只读全景状态回读）分属三个正交职责。`one-person-lab` 只负责自身运行时及其 `publish-framework.yml` 发布通道，禁止继续在 Framework 内新增各产品私有的状态特判（例如按 `product_id` 硬编码分支）、跨产品发布工作流或固定产品清单；现存暂驻脚本待活跃包完成 `opl.package.v2` 收口后整批迁出。

## 退役的产品面

Framework 保留只读 `opl_base` 当前版本投影和公共 Catalog 的 `source_refresh`。Homebrew Tap 原生软件管理、多安装切换 UI、通用 Action Rollback 和旧工作流 `provider_*` 控制不属于 v2 产品面。

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
