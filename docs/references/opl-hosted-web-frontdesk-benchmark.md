# OPL GUI / Front Desk 选型基准

状态锚点：`2026-04-19`

## 文档目的

这份文档冻结当前 `OPL` 的 GUI 技术路线，回答三个问题：

1. 当前最适合复用的开源前端壳是什么。
2. `OPL` 自己应该持有哪些 truth surface 和产品语义。
3. 桌面端与 hosted / web 端接下来如何共用一套主线。

## 当前前提

- `OPL` 的默认交互与执行链路已经冻结为 `GUI -> Codex -> OPL -> domain modules`。
- `Hermes-Agent` 保留为显式备用模式与 online gateway。
- `OPL` 自己持有 workspace、task、progress、files、environment、modules 这些 truth surface。
- `MAS / Med Auto Science`、`MDS / Med Deep Scientist`、`MAG / Med Auto Grant`、`RedCube AI` 都属于 `OPL` 管理的模块。
- 桌面端体验优先级高于浏览器演示壳。

## 评估标准

本轮只按下面五条评估：

1. 能否贴近 `Codex App` 的浅色极简工作台风格。
2. 能否自然承载 `workspace + task + progress + files + modules` 这套产品语义。
3. 能否让桌面端和 web companion 共用一套 `OPL` truth surfaces。
4. 能否减少我们自己长期维护整套前端壳的成本。
5. 能否保留后续把 hosted / web 入口继续做成 `OPL` 自有前台的空间。

## 候选结论

### 1. `Onyx`

优点：

- 默认产品形态最接近 `workspace + agents + files` 这一类工作台，而不是单纯聊天壳。
- 视觉气质更接近目标方向，后续更容易贴到 `Codex App` 的浅色极简风格。
- 适合把 `OPL` 自己的 workspace、task、progress、files、modules 真相嵌进去。
- 更适合作为桌面壳和管理壳的上游参考。

结论：

- 当前主推荐基座。

### 2. `Open WebUI`

优点：

- 开放性强，生态和自托管能力成熟。
- 作为通用 agent 前台很灵活。

问题：

- 产品语义更像通用 AI 工作台。
- 要压成 `OPL` 这种产品心智，界面和信息架构改造量更大。

结论：

- 保留为重要参考面。

### 3. `AnythingLLM`

优点：

- 文档、知识库和 agent 工作台能力较全。
- 适合快速搭出综合 AI 工作面。

问题：

- 工作台语义更偏知识库和聊天整合。
- 对 `workspace + deliverable files + domain modules` 的贴合度一般。

结论：

- 保留为参考，不作为主基座。

### 4. `LobeChat`

优点：

- 前端完成度高，设计感强。
- 作为聊天产品壳很成熟。

问题：

- 产品重心更偏对话体验。
- 对 `OPL` 这类项目 / 工作区 / 模块管理型产品，信息架构迁移成本更高。

结论：

- 不作为当前主基座。

## 冻结结论

当前冻结的 GUI 路线是：

- 桌面端：`Onyx-style Desktop shell`
- 浏览器端：`OPL web companion`
- 长期 hosted / web：继续收口到 `OPL` 自有 front desk

这条路线的含义是：

- 前端壳尽量复用 `Onyx` 的成熟布局和交互范式。
- `OPL` 继续只维护自己的 truth surface、模块管理、路由语义和领域工作流。
- 桌面壳与 web companion 读取同一套 `frontdesk manifest / entry-guide / readiness / environment / modules / project-progress`。

## 结构边界

`Onyx` 负责的东西：

- 桌面壳形态
- 左中右工作台布局
- 多 workspace / 多会话的壳层交互
- 视觉与组件骨架

`OPL` 负责的东西：

- `Codex` / `Hermes-Agent` 模式切换
- workspace registry
- project progress narration
- files / deliverables 观察面
- environment / modules 管理
- domain module handoff 与执行入口

## 当前实施形态

当前主线已经按下面的方式收口：

- `opl frontdesk bootstrap` 准备本地 `OPL Atlas` Desktop 壳
- `opl web` 提供同一套 truth surface 的浏览器 companion
- `opl frontdesk environment` 提供 `Codex` / `Hermes-Agent` / managed paths 的环境观察
- `opl frontdesk modules` 与 `opl frontdesk module <action>` 提供模块安装、升级、重装和移除

## 下一步

1. 继续把 `Onyx` 风格桌面壳打磨到更接近 `Codex App` 的工作台体验。
2. 让 settings 页面直接消费 `environment / modules` 两类 surface。
3. 让右侧边栏稳定承载 progress feed、task cards 和 files deliverables。
4. 让同一套 frontdesk truth surface 同时服务桌面端和 hosted / web 前台。
