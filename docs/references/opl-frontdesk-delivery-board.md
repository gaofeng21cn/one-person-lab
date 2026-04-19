# OPL Front Desk Delivery Board

状态锚点：`2026-04-19`

## 文档目的

这份板面只回答三个问题：

1. `OPL Front Desk` 当前已经落下了哪些可用能力。
2. 当前主线还缺哪些关键交付。
3. 下一棒应该沿哪条主线继续推进。

## 当前主线

当前主线已经冻结为：

- 桌面壳：`Onyx-style Desktop shell`
- 浏览器 companion：`opl web`
- 默认执行：`Codex`
- 备用执行 / 在线网关：`Hermes-Agent`
- 领域能力：以 `OPL` 管理的模块形式接入

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

### F2. Frontdesk truth surfaces

已完成：

- `opl frontdesk manifest`
- `opl frontdesk entry-guide`
- `opl frontdesk readiness`
- `opl frontdesk domain-wiring`
- `opl frontdesk hosted-bundle`
- `opl frontdesk hosted-package`
- `opl frontdesk environment`
- `opl frontdesk modules`
- `opl frontdesk module install|update|reinstall|remove`

当前含义：

- GUI 壳和 web companion 已经可以共用一套 truth surfaces。
- environment 与 modules 管理已经进入 `OPL` 主线，而不是散落在外部脚本里。

### F3. 本机 GUI 入口

已完成：

- `opl frontdesk bootstrap`
- `OPL Atlas` Desktop bootstrap package

当前含义：

- 本机默认 GUI 路径已经收口到桌面壳。
- 桌面壳当前复用 `opl web` 的 truth surface，并向 `Onyx` 风格工作台靠拢。

### F4. 服务化运行与 hosted 预备

已完成：

- `opl frontdesk service install|status|start|stop|open|uninstall`
- self-hostable hosted pilot package
- base-path-aware hosted bundle

当前含义：

- 本地 front desk 已经可以长期运行。
- hosted / web 路线已有可验证的包装层和 contract surface。

## 当前缺口

### W1. 桌面壳视觉与交互还需要继续打磨

缺口：

- 左侧 workspace / task 管理还需要更贴近目标工作台形态。
- 右侧 progress + files 边栏还需要更稳定的最终布局。
- settings 还需要把 environment / modules 管理面完整接起来。

### W2. hosted / web 入口还没有完全产品化

缺口：

- 当前已具备 hosted 预备能力。
- 正式 hosted front desk 还需要继续围绕同一套 truth surfaces 收口。

### W3. 模块管理还缺更完整的产品体验

缺口：

- 版本展示、升级提示、健康状态和最近验证结果还要继续丰富。
- GUI settings 还需要把模块操作做成更顺手的管理界面。

## 当前进行中

### I1. Onyx 风格桌面壳打磨

方向：

- 继续把桌面壳打磨到接近 `Codex App` 的浅色极简工作台体验。
- 保持 `workspace + task + progress + files + modules` 为核心信息架构。

### I2. Environment / Modules 设置面接线

方向：

- 让 GUI 直接消费 `frontdesk environment` 和 `frontdesk modules`。
- 让模块安装、升级、重装和移除都从 settings 进入。

### I3. 模块直达入口对齐

方向：

- 继续把 `Med Auto Science`、`Med Deep Scientist`、`Med Auto Grant`、`RedCube AI` 的安装路径、状态和入口投射到统一模块目录。
- 让 `Codex` 默认执行与 `Hermes-Agent` 备用模式在同一设置面完成切换。

## 推荐下一条执行 issue

- 标题：`Polish OPL Front Desk shell and wire environment/modules into settings`
- 目标：把桌面壳、右侧边栏和 settings 主线一起压稳，让 `OPL` 形成可持续演进的工作台入口。
- 边界：继续复用现有 truth surfaces，不引入新的外部聊天壳依赖，不把 `OPL` 写成 domain runtime owner。

## 下一棒

1. 继续打磨桌面壳布局和视觉。
2. 把 settings 接到 `environment / modules`。
3. 把 progress feed 和 files deliverables 边栏继续压成稳定产品面。
4. 让桌面端与后续 hosted / web 前台继续共用同一套 truth surfaces。
