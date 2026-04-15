# OPL GUI shell taxonomy and MAS workspace mapping design

## Context

- `OPL` 现在已经有 `opl` 和 `opl web` 两层 top-level frontdoor，但本地 `opl web` 仍偏向 operator control room。
- 另一条线正在推进 `LibreChat-first` GUI；那条线需要一个稳定、repo-tracked 的上层入口语义，而不是继续直接消费零散的 dashboard / manifest / wiring 碎片。
- `MAS` 的 domain workspace 语义与 `OPL` 的 family workspace 语义并不相同。`OPL Workspace` 是 family-level 任务容器，`MAS Workspace` 则是进入 research domain 后的 workspace / study queue。

## 目标

这次 slice 只做三件事：

1. 冻结一份给 AI / GUI 壳消费的 `frontdesk-entry-guide` surface。
2. 明确 `OPL Workspace -> Domain Workspace` 的映射语义，尤其是 `MAS` 的 research workspace / study queue 关系。
3. 明确 `OPL Cortex` 与 repo 内部 `frontdesk_*` machine-readable surface 的命名边界。

## 非目标

- 不改 `LibreChat` 那条线的具体页面结构、组件树或视觉实现。
- 不在这条线强行重做 `opl web` 的人类 GUI。
- 不改 `MAS` 仓内的 research runtime、display 支线或 study 内部对象模型。
- 不把 `OPL` 写成 domain runtime owner，也不发明第二真相源。

## 方案选择

### 方案 A：只补文档，不动 API 和页面

- 优点：风险最低。
- 问题：GUI 线仍拿不到稳定对象面；本地 `opl web` 仍反人类。

### 方案 B：只改局部页面或文案，不补 machine-readable surface

- 优点：肉眼上更快看到变化。
- 问题：GUI 线继续只能抓现有散乱 surface；另一条线无法共享统一 taxonomy。

### 方案 C：新增一份 family-level entry guide surface，并让 CLI / API / startup payload 暴露它

- 优点：对象面先稳定下来；本地 frontdoor、`LibreChat-first` GUI 与未来 `OPL Cortex` 壳都能复用同一份入口语义。
- 风险：需要改 CLI / web / docs / tests，但范围仍然集中。

结论：采用方案 C。

## 设计

### 1. 新增 `frontdesk-entry-guide` surface

它是 family-level derived surface，基于现有：

- `projects`
- `domain-manifests`
- `frontdesk-readiness`
- `frontdesk-domain-wiring`
- 各 domain 已发布的 `product_entry_start / preflight / readiness / overview / family_orchestration`

派生出一份更适合 GUI 和人类消费的入口说明面。

### 2. 对象层级

#### `OPL Workspace`

- family-level task container
- 用来承接“糖尿病科研”“垂体瘤 PPT”“基金申请书”这类顶层任务
- 由 `OPL` frontdesk 持有和路由

#### `Domain Workspace`

- routed domain 内部的工作对象
- `MAS`：research workspace / study queue
- `RedCube`：deliverable workspace / entry session
- `MAG`：grant workspace / draft lane

#### 映射关系

- 一个 `OPL Workspace` 只在 handoff 到某个 domain 后，才关联该 domain 的 workspace 语义
- `MAS` 不等于 `OPL`；它只是 routed domain 之一
- `MAS` 的 workspace 说明要明确为 research workspace / study queue，而不是 family workspace

### 3. shell 与命名边界

- `frontdesk-entry-guide` 是 machine-readable entry surface，主要给 AI / GUI 壳消费。
- `opl web` 当前继续保留为本地 operator pilot；这条线不把它强行升级成最终人类 GUI。
- 若另一条线把用户前台命名为 `OPL Cortex`，那属于产品壳名字；当前 repo 内部的 `frontdesk_*` 继续保持 contract / API 命名，不在本 tranche 做 repo-wide rename。

### 4. MAS 需要冻结的 GUI 语义

- `OPL` 顶层看到的是 research domain card
- 进入 `MAS` 后：
  - frontdoor = `product_frontdesk`
  - workspace shell = `workspace_cockpit`
  - 新任务 = `submit_task`
  - 继续已有研究 = `continue_study`
- 在 GUI 说明上明确：
  - `OPL Workspace` 是 family task
  - `MAS Workspace` 是研究域内 workspace / study queue

## 验证

- CLI source tests 覆盖新 command / manifest wiring / page copy
- built tests 覆盖 machine-readable 输出和 web 可发现性
- `npm run build`
- `./scripts/verify.sh typecheck`
- 针对 slice 的最小回归

## 一句话结论

这次不是“再堆一层控制台功能”，而是先把 `OPL` 顶层入口的 machine-readable entry layer 冻结下来，让 GUI / AI 壳以后都消费同一份 family-level taxonomy，而不是继续抓散落的 dashboard / wiring 碎片。
