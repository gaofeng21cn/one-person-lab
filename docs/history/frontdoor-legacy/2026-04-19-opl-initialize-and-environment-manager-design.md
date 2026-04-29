# OPL Initialize 与 Environment / Modules 设计

> 已退役。这个设计属于 `Initialize OPL + frontdoor` 公开语义阶段，当前主线已经改为 `OPL Product API + 独立 GUI 壳`，GUI 主线确定为基于 `AionUI` codebase 的 `opl-aion-shell`。现行边界以 [`docs/specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md`](../../specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md) 为准。保留本文只用于历史审计与迁移回顾。

## 背景

截至 `2026-04-19`，`OPL` 主仓已经完成了 GUI 主线的第一轮收束：

- `OPL` 主仓只保留 headless adapter、CLI product entry、module registry、bootstrap/install surfaces。
- `opl web` 根路由 `/` 返回 machine-readable adapter payload，供外部 GUI overlay 消费。
- `opl frontdoor environment` 已能汇总 `Codex`、`Hermes-Agent`、frontdoor service、managed paths。
- `opl frontdoor modules` 与 `opl frontdoor module install|update|reinstall|remove` 已能管理 domain modules。

当前缺口集中在产品体验层：

1. 首次启动还缺一条正式的 `Initialize OPL` 用户路径。
2. 设置页的 `Environment / Modules` 还缺完整的卡片定义和状态机。
3. `Codex` 与 `Hermes-Agent` 还缺正式的安装、升级、修复动作面。
4. GUI overlay 仓还缺一份稳定的初始化与设置产品规范可以直接接线。

这份设计只解决这四件事，作为独立 overlay 仓和主仓 action surface 的共同依据。

## 设计目标

### 1. 用户只看到一个 OPL

用户的产品认知固定为：

- 安装的是 `OPL Desktop`
- 启动后进入 `Initialize OPL`
- 初始化完成后进入 `OPL` 工作台
- `Codex`、`Hermes-Agent`、`Med Auto Science`、`Med Deep Scientist`、`Med Auto Grant`、`RedCube AI` 都是 `OPL` 管理的环境项或模块

当前 GUI 基座属于内部实现选择，不在用户界面里作为独立产品暴露。

### 2. 首次启动由 OPL 接管环境

`Initialize OPL` 需要覆盖下面的用户流程：

1. 扫描本机环境
2. 复用或安装 `Codex CLI`
3. 可选安装 `Hermes-Agent`
4. 勾选并安装 domain modules
5. 选择 `Workspace Root`
6. 完成初始化并进入工作台

用户进入工作台时，应该已经获得一个可直接使用的 OPL 环境。

### 3. 设置页长期承载 Environment / Modules

初始化完成后，用户仍然需要在设置页管理环境与模块。设置页必须提供统一的 `Environment / Modules` 区域，至少包含：

- `Core Engines`
- `Domain Modules`
- `System`

所有卡片统一展示：

- 安装状态
- 当前版本
- 安装路径
- 健康状态
- 可执行动作

### 4. 主仓与 GUI overlay 共用一套 truth surfaces

`OPL` 主仓负责：

- runtime truth
- module registry
- installation / repair action surfaces
- workspace root 与 frontdoor service management

独立 overlay 仓负责：

- 首次启动向导
- 工作台布局
- 设置页卡片和操作流
- 进度与文件管理的视觉承载

## 当前基线

### 已存在的 surfaces

- `opl web`
  - 提供 headless adapter service
- `opl frontdoor environment`
  - 提供 `core_engines`、`local_frontdoor`、`managed_paths`
- `opl frontdoor modules`
  - 提供 domain modules 列表与健康状态
- `opl frontdoor module install|update|reinstall|remove`
  - 提供模块动作
- `opl frontdoor service install|status|start|stop|open|uninstall`
  - 提供本地 adapter service 管理

### 还缺的 surfaces

- `Initialize OPL` aggregate surface
  - 一次返回初始化向导需要的总状态、待办项与推荐动作
- `Core Engine actions`
  - `Codex install|update|reinstall`
  - `Hermes install|update|reinstall|remove`
- `Workspace Root action`
  - 选择、写入、验证 workspace root
- `System maintenance actions`
  - repair
  - reinstall
  - update channel

## 用户流程

### A. 首次启动

#### Step 1. Welcome / Scan

进入 `Initialize OPL` 后先做环境扫描，页面展示三块内容：

- `Core Engines`
  - `Codex`
  - `Hermes-Agent`
- `Domain Modules`
  - `Med Auto Science`
  - `Med Deep Scientist`
  - `Med Auto Grant`
  - `RedCube AI`
- `Workspace Root`

默认动作：

- 已安装项直接标记为 `Ready to reuse`
- 缺失项标记为 `Install required`
- 可选项标记为 `Optional`

#### Step 2. Core Engines

`Codex` 卡片：

- 若本机已有 `Codex CLI`，显示版本、路径、配置文件、默认模型、健康状态，并提供 `Reuse`
- 若缺失，显示 `Install`
- 若已安装但需要配置，显示 `Configure`

`Hermes-Agent` 卡片：

- 默认标记为可选
- 若已安装，显示版本、路径、gateway 状态、健康状态，并提供 `Reuse`
- 若缺失，显示 `Install Optional Engine`

#### Step 3. Domain Modules

四个模块都按统一卡片展示：

- 名称
- 说明
- 安装状态
- 版本 / SHA
- 路径
- 健康状态
- `Install / Update / Reinstall / Remove`

初始化向导里默认支持勾选安装，进入工作台后继续在设置页维护。

#### Step 4. Workspace Root

用户需要选定一个 workspace 根目录，`OPL` 在这里管理：

- workspace registry
- 任务对应目录
- 文件交付目录
- GUI 右侧 files 边栏的数据来源

这一页需要支持：

- 选择现有目录
- 创建新目录
- 健康检查与写入权限验证

#### Step 5. Finalize

完成后写入：

- runtime modes
- workspace root
- selected modules
- local frontdoor service settings

随后直接进入工作台。

### B. 初始化后的设置页

设置页的 `Environment / Modules` 区域固定为三个区块。

#### Core Engines

卡片：

- `Codex`
- `Hermes-Agent`

字段：

- install_status
- current_version
- install_path
- health_status
- config_summary

动作：

- `Install`
- `Update`
- `Reinstall`
- `Open Config`
- `Repair`
- `Remove` 仅 `Hermes-Agent`

#### Domain Modules

卡片：

- `Med Auto Science`
- `Med Deep Scientist`
- `Med Auto Grant`
- `RedCube AI`

字段：

- install_status
- current_version
- checkout_path
- health_status
- last_verified_at

动作：

- `Install`
- `Update`
- `Reinstall`
- `Remove`
- `Open Module`

#### System

卡片：

- `Workspace Storage`
- `Version / Health`
- `Update Channel`
- `Repair / Reinstall`

字段：

- workspace_root
- registry_path
- service_status
- app_version
- health_summary
- update_channel

动作：

- `Change Workspace Root`
- `Open Storage`
- `Repair`
- `Reinstall OPL Support Files`
- `Check Updates`

## 工作台与设置页的关系

GUI 工作台继续保持三栏：

- 左侧：workspace / task
- 中间：conversation
- 右侧：progress / files

`Initialize OPL` 决定这套工作台是否可用；
设置页决定这套工作台能否长期稳定维护；
二者都读取同一套 `OPL` adapter surfaces。

## 状态机

初始化与设置管理共享下面的状态机：

- `uninitialized`
  - 首次启动，尚未完成扫描
- `scanning`
  - 正在读取 engines、modules、workspace、service 状态
- `attention_needed`
  - 至少一个核心项需要安装、配置或修复
- `ready_to_finalize`
  - 已满足进入工作台的最低条件
- `installing`
  - 正在执行安装、更新、重装或修复
- `ready`
  - 可以进入并持续使用工作台

最低进入条件定义为：

- `Codex` 可用
- `Workspace Root` 已选择
- frontdoor service 可以按需启动

`Hermes-Agent` 和 domain modules 支持稍后补装。

## 需要补到主仓的 API / CLI surfaces

### 1. Initialize aggregate

建议新增：

- `opl frontdoor initialize`
- `GET /api/frontdoor/initialize`

返回内容：

- overall_state
- checklist
- core_engines
- domain_modules
- workspace_root
- local_frontdoor
- recommended_next_action

### 2. Core engine actions

建议新增：

- `opl frontdoor engine install --engine codex|hermes`
- `opl frontdoor engine update --engine codex|hermes`
- `opl frontdoor engine reinstall --engine codex|hermes`
- `opl frontdoor engine remove --engine hermes`
- 对应 web action endpoint

### 3. Workspace root actions

建议新增：

- `opl workspace root`
- `opl workspace root set --path <path>`
- `opl workspace root doctor`
- 对应 web endpoint

### 4. System maintenance actions

建议新增：

- `opl frontdoor repair`
- `opl frontdoor reinstall-support`
- `opl frontdoor update-channel`

## 与独立 GUI 壳的边界

独立 overlay 仓负责：

- 复用当前 GUI 主线的工作台布局和浅色极简视觉方向
- 渲染 `Initialize OPL`
- 渲染设置页 `Environment / Modules`
- 把右侧 `progress / files` 边栏压成稳定产品面

`OPL` 主仓负责：

- 提供所有数据与动作 contract
- 提供安装、升级、修复、健康检查真相
- 提供 workspace / task / progress / files / settings 所需 adapter surfaces

## 实施顺序

### P1. 主仓先补 Initialize 与 engine/system action surfaces

交付：

- `Initialize OPL` aggregate surface
- `Core Engines` actions
- `Workspace Root` actions
- `System` maintenance actions

### P2. 独立 GUI 壳起步

交付：

- 基于外部 GUI 基座的最薄 shell 仓
- 首屏三栏工作台
- 设置页 `Environment / Modules`
- 首次启动向导 `Initialize OPL`

### P3. 工作台收束

交付：

- 右侧 `progress / files` 稳定接线
- workspace / task 管理与 settings 联通
- `Codex` / `Hermes-Agent` 模式切换进入同一设置面

## 明确不做

- 不在 `OPL` 主仓内继续实现 repo-tracked GUI
- 不把当前 GUI 基座暴露成用户需要理解的独立产品
- 不要求用户先手工学习 `Codex` 与 `Hermes-Agent` 的安装顺序
- 不把 domain modules 写成脱离 `OPL` 管理的散装依赖
