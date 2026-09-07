# OPL 关键决策

本文只保留当前仍有效、且不能仅从代码结构直接读出的决策。实施状态属于 [状态](./status.md)，未完成事项属于 [当前差距](./active/current-state-vs-ideal-gap.md)。

## 产品分为 Base、App、Packages 和 Cloud

[产品分层](./project.md#产品分层) 让通用底座、桌面体验、专业能力和云端资源各自演进。专业判断留在领域 owner，避免 Framework 成为所有产品与领域的中央负责人。

## Package 拓扑按真实生命周期晋升

[Package 拓扑](./project.md#package-拓扑) 将拆仓与发布分开判断：前者解决责任和复用，后者解决分发与回滚。该选择避免提前平台化，也避免真实通用能力被单一产品发布节奏锁住。

## Package 生命周期服从 native carrier

Package identity 由 owner descriptor 持有，物理 installed/enabled/currentness 由 native carrier 持有。Framework 只做配置 carrier 的薄 adapter、presence/callability 和统一 projection。

Framework 不维护普通 Package 的中央版本求解、installed lock、payload lock、LKG、materializer 或 transaction。required dependency 只要求指定 identity 存在且入口可调用。

## Family capability 使用动态 portfolio

[Portfolio](./references/family-capability-portfolio.md) 用于解释能力，物理源码、安装和发布分别由实际 owner 持有。品牌名称不能决定目录或安装成员，因而新增能力不需要复制一套品牌状态文档。

## Cordis 是共同的进程内 composition runtime，Host 唯一性按 scope 判断

采用官方 Cordis 可复用现成的进程内组合机制，避免再维护一套 service locator、event bus 或 lifecycle。Host 的唯一性限定在责任范围内：Framework 管运行、Package graph 与 App 投影，Studio 管 DSH、Codex 与 delivery composition。具体连接和禁止共享的状态见 [Host scope boundary](./architecture.md#host-scope-boundary)。

## Temporal 承担 durable execution，不承担专业判断

Temporal service 和 worker 承担 workflow history、retry、task queue 和 durable execution。Framework 将其投影为 Stage/Attempt、repair route 和 operator state。

workflow 完成只能证明 transport/runtime 结果可读取。是否接受产物、是否进入下一 Stage、是否可发布，仍由 domain owner 和 human gate 决定。

## Codex carrier 随安装载体归属

Base/headless 安装必须自包含可用的 Codex executable carrier；App 使用其 shell 或 product owner 选择的 exact carrier。两者是互斥部署角色，不是同时生效的双 authority。

稳定边界是 `OPL_CODEX_BIN + codex app-server --stdio`。Framework 不解析 App 私有 carrier manifest，App 也不通过 Framework fallback 猜测 executable。

## 文档直接收敛，不保留当前树内的历史兼容面

当前文档用于指导下一次工作，Git 用于追溯历史。执行流水与兼容说明混入当前文档会被误读为受支持能力，因此直接收敛当前 owner。具体保留、退役和检查规则仅由 [文档生命周期政策](./policies/docs-lifecycle-policy.md) 定义。
