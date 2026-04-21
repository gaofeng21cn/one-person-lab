# OPL GUI 主线切换到 AionUI

状态锚点：`2026-04-21`

## 结论

- `OPL` 主仓继续只负责 headless `Product API`、共享运行时真相和 `opl web`。
- GUI 主线改为 `AionUI`，因为它更贴近 `Codex CLI` 壳、目录绑定会话和对话主屏这一条产品主线。
- `Onyx` 相关材料全部降为备线，只保留为 benchmark、迁移回顾和失败兜底参考。

## 主仓继续保留的可复用资产

- 统一产品资源模型：`system`、`engines`、`modules`、`agents`、`workspaces`、`sessions`、`progress`、`artifacts`
- 本地产品入口与根载荷：`opl`、`opl web`、根路由 bootstrap payload
- 会话与工作空间能力：workspace 绑定、session 创建 / 续跑 / 日志、domain launch、handoff envelope
- 进度与交付物能力：progress narration、artifact discovery、workspace catalog、session ledger
- 设置页所需系统能力：environment / modules / workspace root / engine actions / system actions

## AionUI 主线优先复用的 OPL 接口面

### 1. 对话与会话主线

- 根载荷先读 `opl web` 的 bootstrap，确定资源与动作入口
- `agents`、`workspaces`、`sessions` 负责左侧列表和新会话创建
- `session resume`、`session logs` 负责恢复与追踪真实运行中的会话

### 2. 右侧 progress / files 侧栏

- `progress` 负责把运行状态翻译成人话
- `artifacts` 负责文件交付与结果面板
- `workspace` 与 `session ledger` 负责把文件和会话挂回正确目录

### 3. 设置页与环境管理

- `system`、`engines`、`modules` 是设置页的主卡片面
- `workspace root`、engine actions、module actions、system actions 是设置页的动作面
- `Codex` / `Hermes-Agent` 模式切换继续通过同一套产品设置与运行时配置暴露

## Onyx 备线保留位置

- `docs/references/opl-hosted-web-frontdesk-benchmark.md`
- `docs/references/opl-frontdesk-delivery-board.md`
- `docs/history/frontdesk-legacy/2026-04-19-opl-initialize-and-onyx-overlay-implementation.md`

这些材料继续保留，但只用于三种场景：

- 回看当时为什么判断 `Onyx` 更合适
- 需要对照一条失败后的备线 GUI 路线
- 审计 `frontdesk / overlay` 阶段已经落下过哪些接口面

## 对 AionUI 新主线的约束

- 不在 `OPL` 主仓里继续发明 GUI 页面
- 新 GUI 只消费 `OPL Product API`，不倒逼主仓再长出壳层语义
- `Onyx` 相关命名、计划和实现，不再写入 current status / current implementation
