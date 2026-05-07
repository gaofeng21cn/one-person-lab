# OPL Front Desk Delivery Board

> 历史收口说明：此板面记录的是 `frontdoor / overlay` 阶段的已落地 surfaces 与缺口。当前 GUI 主线已确定为基于 `AionUI` codebase 的 `opl-aion-shell`，本文不再作为当前 GUI 实施看板。

状态锚点：`2026-04-19`

## 文档目的

这份板面只回答三个问题：

1. `OPL Front Desk` 当前已经落下了哪些可用能力。
2. 当前主线还缺哪些关键交付。
3. 下一棒应该沿哪条主线继续推进。

## 当前主线

当前主线已经冻结为：

- 主仓：`OPL headless adapter + CLI product entry`
- GUI：独立 shell 仓消费 `OPL Product API`，当前主线按 `AionUI` 推进
- 本地 adapter service：`opl web`
- 默认执行：`Codex`
- 备用执行 / 在线网关：`Hermes-Agent`
- 领域能力：以 `OPL` 管理的模块形式接入

当前产品规格锚点：

- `docs/history/frontdoor-legacy/2026-04-19-opl-initialize-and-environment-manager-design.md`

## 已落地能力

### F0. 顶层直接入口

已完成：

- `opl`
- `opl <request...>`
- `opl ask`
- `opl chat`
- `opl doctor`
- `opl start`
- `opl web`
- `opl session list|resume|logs|ledger`

当前含义：

- `OPL` 已经拥有直接可进的产品入口。
- 默认入口已经是 `OPL` 自己的 front desk，而不是外部聊天壳。

### F1. Workspace / task / progress / files 观察面

已完成：

- `opl status workspace`
- `opl status runtime`
- `opl status dashboard`
- `opl workspace projects|list|bind|activate|archive`
- `opl contract handoff-envelope`

当前含义：

- 多 workspace、多任务、多会话的管理入口已经在 `OPL` 顶层收口。
- progress narration、task 状态和 files deliverables 已经有统一观察面。

### F2. Frontdoor truth surfaces

已完成：

- `opl frontdoor manifest`
- `opl frontdoor entry-guide`
- `opl frontdoor readiness`
- `opl frontdoor initialize`
- `opl frontdoor domain-wiring`
- `opl frontdoor hosted-bundle`
- `opl frontdoor hosted-package`
- `opl frontdoor environment`
- `opl frontdoor engine install|update|reinstall|remove`
- `opl frontdoor repair|reinstall-support|update-channel`
- `opl frontdoor modules`
- `opl frontdoor module install|update|reinstall|remove`
- `opl workspace root|root set|root doctor`

当前含义：

- 外部 GUI overlay、hosted / web 前台与 CLI 已经可以共用一套 truth surfaces。
- initialize、environment、modules、workspace root 与 system maintenance 已经进入同一条 `OPL` 主线，而不是散落在首启脚本和外部设置片段里。

### F3. 已退役的错误路线

已清理：

- repo-tracked desktop shell
- `frontdoor bootstrap`
- fake GUI-shell / `OPL Atlas` 命名残留

当前含义：

- `OPL` 主仓不再承担 GUI 壳实现。
- GUI 主线回到“独立 overlay 仓 + `OPL` adapter surfaces”的冻结路线。

### F4. 服务化运行与 hosted 预备

已完成：

- `opl frontdoor service install|status|start|stop|open|uninstall`
- self-hostable hosted pilot package
- base-path-aware hosted bundle

当前含义：

- 本地 front desk 已经可以长期运行。
- hosted / web 路线已有可验证的包装层和 contract surface。

## 当前缺口

### W1. 独立 overlay 仓还需要正式落地

缺口：

- 还需要把真正的 GUI 壳落到独立 overlay 仓，而不是继续在 `OPL` 主仓内发明替代实现。
- 左侧 workspace / task 管理、右侧 progress + files 边栏、settings 中的 environment / modules 管理，都要在 overlay 仓完成接线。
- 当前 GUI 主线以 `AionUI` codebase 与 `opl-aion-shell` 为准，当前集成事实仍要保持诚实表述。

### W2. hosted / web 入口还没有完全产品化

缺口：

- 当前已具备 hosted 预备能力。
- 正式 hosted front desk 还需要继续围绕同一套 truth surfaces 收口。

### W3. 初始化与设置体验还缺更完整的产品体验

缺口：

- `Initialize OPL` 已经有稳定 action surface，首启向导与 overlay settings 还需要正式接线。
- 版本展示、升级提示、健康状态和最近验证结果还要继续丰富。
- GUI settings 还需要把 core engines、workspace root、模块操作和 system actions 做成更顺手的管理界面。
- `Initialize OPL`、`Core Engines`、`Domain Modules`、`System` 的正式卡片与状态机已冻结在设计文档里，GUI settings 还需要把 core engines、workspace root、模块操作和 system actions 做成更顺手的管理界面。

## 当前进行中

### I1. 独立 overlay 仓接入 OPL adapter surfaces

方向：

- 在独立 GUI 壳里对齐 `Codex App` 风格的浅色极简工作台体验。
- 保持 `workspace + task + progress + files + modules` 为核心信息架构。

### I2. Environment / Modules 设置面接线

方向：

- 让 GUI 直接消费 `frontdoor initialize`、`frontdoor environment`、`frontdoor modules`、`workspace root` 与 `frontdoor system action`。
- 让模块安装、升级、重装和移除都从 settings 进入。
- 让 workspace root、update channel、repair / reinstall-support 与 core engine actions 在同一设置面闭环。
- `Initialize OPL` 与 settings 共用同一套环境真相，避免首启向导和长期设置长成两套口径。
- 让 workspace root、update channel、repair / reinstall-support 与 core engine actions 在同一设置面闭环。

### I3. 模块与环境直达入口对齐

方向：

- 继续把 `Med Auto Science`、`Med Deep Scientist`、`Med Auto Grant`、`RedCube AI` 的安装路径、状态和入口投射到统一模块目录。
- 让 `Codex` 默认执行与 `Hermes-Agent` 备用模式在同一设置面完成切换。
- 让 `Codex` / `Hermes-Agent` / workspace root / update channel 都通过同一套 adapter action surface 被 overlay 消费。

## 推荐下一条执行 issue

- 标题：`Wire Initialize OPL and settings cards to OPL adapter surfaces`
- 目标：在独立 overlay 仓里接入 initialize、workspace / task / progress / files / settings 主线，让 GUI 真正落到冻结路线。
- 边界：`OPL` 主仓继续只维护 adapter/API truth，不回头长自研 GUI。

## 下一棒

1. 继续推进 overlay 仓的布局和视觉落地。
2. 把 `Initialize OPL`、workspace root、core engines、modules、system actions 接到 overlay settings。
3. 把 progress feed 和 files deliverables 边栏继续压成稳定产品面。
4. 让 overlay 仓与后续 hosted / web 前台继续共用同一套 truth surfaces。
