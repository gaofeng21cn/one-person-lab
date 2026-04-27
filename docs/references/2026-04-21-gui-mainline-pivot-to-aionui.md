# OPL GUI 主线切换到 AionUI 的历史记录

状态锚点：`2026-04-21`

当前状态：历史参考。当前实现基线以 [`docs/status.md`](../status.md)、[`docs/decisions.md`](../decisions.md) 和 [OPL GUI Shell Adapter 边界说明](./opl-gui-shell-adapter-boundary.zh-CN.md) 为准。

## 结论

- `OPL` 主仓继续负责共享运行时真相、CLI-backed 产品表面、安装 / 环境管理、release distribution surface 与机器可读合同。
- GUI 主线确定为基于 `AionUI` codebase 的 `opl-aion-shell`，因为它更贴近 `Codex CLI` 壳、目录绑定会话和对话主屏这一条产品主线。
- 旧 GUI 备线材料已退役；当前不再维护备选 GUI 路线。
- 历史 `Product API` / `opl web` 本地服务路径已经退役；当前 WebUI 指 OPL-branded AionUI shell 提供的远程 WebUI。

## 主仓继续保留的可复用资产

- 统一产品资源模型：`system`、`engines`、`modules`、`agents`、`workspaces`、`sessions`、`progress`、`artifacts`
- 本地产品入口与机器可读状态面：`opl`、`opl exec`、`opl resume`、`opl system initialize`、`opl packages manifest`
- 会话与工作空间能力：workspace 绑定、session 创建 / 续跑 / 日志、domain launch、handoff envelope
- 进度与交付物能力：progress narration、artifact discovery、workspace catalog、session ledger
- 设置页所需系统能力：environment / modules / workspace root / engine actions / system actions

## AionUI 主线优先复用的 OPL 接口面

### 1. 对话与会话主线

- GUI shell 消费 OPL CLI-backed machine-readable surfaces，确定资源与动作入口
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

## 对 AionUI 新主线的约束

- 不在 `OPL` 主仓里继续发明 GUI 页面
- 新 GUI 只消费 OPL CLI-backed machine-readable surfaces，不倒逼主仓再长出 GUI-only 第二实现
- 旧 GUI 备线命名、计划和实现，不再写入 current status / current implementation
- GUI shell 是可替换 adapter；`OPL` runtime、domain modules 与 shared contracts 不因 GUI 基座更换而改写
