# OPL 项目概览

One Person Lab（OPL）是一套面向复杂知识工作的 AI-native 工作系统。它把目标拆成可恢复的 Stage，让专业 Agent 在明确的材料、权限、产物和责任边界内执行、审阅、修订与交接。

本文只定义产品定位和产品拓扑，不描述实现进度或运行状态。

OPL 的应用共同遵循 **OPL Agent Apps（Agent 原生应用）** 定位：Agent 通过可调用能力推进工作，人按需要进入协作界面并让 Agent 接续同一任务。**OPL MiniApp** 是其中按任务出现的协作单元，覆盖共享视图和专用 MCP App；专业独立应用仍按工作需要保留。共同开发要求、连接和个人知识的复用边界见[开发标准](./policies/agent-native-app-policy.md)。

## 产品分层

- **OPL Base**：Framework、CLI、Stage/Attempt、Workspace、Package discovery、Host composition、runtime provider adapter 和 read model。
- **OPL App**：桌面产品、用户交互、Settings、官方 starter profile 和 product truth。
- **OPL Packages**：可安装的 Agent、capability、workflow profile 和 provider。Package 是唯一安装单元，Skill、Tool、Plugin、MCP 和 entrypoint 是 Package descriptor 中的能力。
- **OPL Cloud**：远端 workspace、managed resource、协作和 Cloud product truth。

专业 Agent 持有各自领域的事实、质量判断、artifact authority、owner receipt、typed blocker 和 human gate。Framework 只提供通用底座与受控投影，不代替领域负责人作结论。

## Framework 的职责

Framework 持有：

- Stage、Attempt、Workspace 和 session continuity 的通用模型；
- Package descriptor 发现、required/optional presence、callability 和 native carrier 聚合；
- Cordis Host composition、受控 profile 和 Client contribution projection；
- Temporal 等 provider 的薄 adapter、运行状态和可恢复控制面；
- refs-only evidence、operator read model 和明确的 action routing；
- 通用 contract、schema、CLI 和跨仓边界。

Framework 不持有：

- App 的产品、交互和发布事实；
- Package owner 的版本、发布节奏和领域实现；
- native carrier 的内部安装状态机；
- 领域质量、交付、投稿、发布或生产就绪判断；
- Cloud resource 的 provider truth。

## Package 拓扑

模块是否拆仓、是否独立发布，是两个不同问题。

1. **仓内模块**：只有本仓调用、与本仓同生命周期、无独立 owner 时，留在真实源码 owner 内。
2. **workspace Package**：在同一仓内已有多个调用者、需要明确 ABI 或独立组合，但仍随本仓发布时，放入 `packages/*`。
3. **独立 owner repo**：能力已被多个产品或仓库复用，需要独立 ownership、issue/review、release 或安全边界时，拆到独立仓。
4. **独立 publication**：只有出现真实外部 consumer、不同发布节奏或必须独立回滚的运行单元后，才建立独立 artifact publication。独立仓本身不自动要求独立发布。

不得为了“以后可能通用”提前拆仓，也不得让已经形成独立 consumer 和 release cadence 的通用能力继续被单一产品仓锁住。当前人读 portfolio 见 [Family capability portfolio](./references/family-capability-portfolio.md)。

## 默认入口

- CLI：`opl`
- 当前状态：`opl app state --profile fast --json`
- Package：`opl packages status --json`
- Framework readiness：`opl framework readiness --family-defaults --json`
- 桌面体验：One Person Lab App

具体命令和 payload 以 `opl --help`、contracts 和 fresh readback 为准。
