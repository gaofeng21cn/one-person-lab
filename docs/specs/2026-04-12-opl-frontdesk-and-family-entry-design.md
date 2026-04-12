# OPL Front Desk And Family Entry 设计

## 背景

截至 `2026-04-12`，`OPL` 已经有了第一版本地 product-entry shell：

- `opl doctor`
- `opl ask`
- `opl chat`

这解决了“必须先开 Codex 才能进入 OPL”的第一层问题，但距离理想形态还差四块：

1. `opl` 裸命令本身还不是默认自然语言前台
2. 会话与 bootstrap 管理还没有作为正式入口层暴露出来
3. `OPL -> domain` 的 family-level lightweight entry 对齐还停在文档与概念层
4. `MedAutoScience` 作为最重 runtime 主线，还缺一份与 OPL 顶层入口对齐的 cutover board

这次设计的目标，是在不破坏已落下的 `Phase 1` read-only gateway contract 的前提下，把 `OPL` 往“真正可直接使用的本地产品前台”再推进一大步。

## 设计目标

### 1. 让 `opl` 裸命令成为默认自然语言入口

预期行为：

- `opl`
  - 直接进入一个由 `OPL` 预热过的 Hermes 交互会话
- `opl <自然语言请求>`
  - 默认按 quick ask 处理
- `opl doctor` / `opl ask` / `opl chat`
  - 继续保留为显式控制面

这一步的关键不是“让 Hermes 直接代替 OPL”，而是：

- 先由 `OPL` 做顶层路由 / family handoff
- 再把会话交给 Hermes 承载

### 2. 把会话与 bootstrap 能力上收到 OPL 产品层

`OPL` 不重造 session store，也不复制 Hermes 的日志 / profile / gateway 管理逻辑。
正确做法是：

- `OPL` 负责产品层托管、封装和入口语义
- Hermes 继续负责底层 session / logs / gateway / profile substrate

这次入口层最少要补出：

- `opl resume <session_id>`
- `opl sessions`
- `opl logs [agent|gateway|errors]`
- `opl repair-hermes-gateway`

这些命令应尽量复用上游 Hermes CLI，而不是重写一套平行 substrate。

### 3. 冻结 family-level handoff envelope 与 domain lightweight entry 对齐

这次不要求在顶层仓里实现三个业务仓的全部入口，但要求把 family 级 contract 进一步冻结清楚：

- `OPL` 作为 family-level front desk
- 三个业务仓继续各自成长出 lightweight direct entry
- `OPL -> domain` handoff envelope 字段保持统一

需要明确写清：

- 哪些字段是 family 通用
- 哪些字段仍是 domain-specific payload
- 哪些行为属于 `OPL` 顶层入口
- 哪些行为必须继续留在 domain gateway / harness 侧

### 4. 为 MAS 主线补顶层对齐的 cutover board

`MedAutoScience` 当前最重，且真实长跑能力最关键。
本轮不在 `OPL` 仓里直接改 MAS 实现，但需要把下面这件事写清：

- `OPL` 顶层入口如何与 MAS 当前 `real adapter cutover` 主线协作
- `OPL` 顶层入口需要 MAS 提供哪些稳定 entry / return surface
- 在 MAS 还没完全完成 runtime cutover 前，`OPL` 顶层不应如何越权描述

## 方案比较

### 方案 A：继续保守，只保留 `doctor / ask / chat`

优点：

- 风险最低
- 不会碰到 `opl` 裸命令行为变更

缺点：

- `OPL` 仍然不像真正产品前台
- 用户记忆负担仍然高
- 下一轮还得再补一轮入口壳

结论：

- 不选

### 方案 B：一次性把 `opl` 做成全功能前台，并同时在三个业务仓直接落所有 domain entry

优点：

- 一次性目标感最强

缺点：

- 变更范围过大
- 会把 OPL 顶层入口、family contract、三个 domain 入口、MAS 主线切换混在一个 tranche 里
- 很容易造成边界漂移

结论：

- 不选

### 方案 C：在 OPL 先落完整的 family-level front desk，同时把 domain 对齐与 MAS cutover board 作为 contract/doc surface 一起冻结

优点：

- `opl` 裸命令真的变成前台
- session / logs / repair / resume 有了产品层入口
- 顶层入口和 domain 入口语义能一起收紧
- 不会在 OPL 仓里越权重写三个业务仓

缺点：

- 仍然需要后续在 domain 仓各自继续落轻量入口
- MAS 的最终 runtime 切换仍需在 MAS 仓里完成

结论：

- 选择方案 C

## 架构结论

### 顶层入口链

本轮落地后，目标入口链应变成：

`User -> opl front desk -> OPL routing / handoff -> Hermes session substrate -> domain handoff / domain entry -> domain harness`

### 顶层与 Hermes 的边界

`OPL` 负责：

- 默认入口行为
- family-level routing
- handoff prompt / envelope
- 面向用户的 bootstrap / repair / sessions / logs 入口语义

`Hermes` 负责：

- 交互会话 substrate
- session 持久化
- logs
- gateway service
- profile substrate

### 与现有 read-only gateway contract 的关系

这次新增的 front desk 不会替代当前 formal contract。

当前仍然并行存在两层：

1. `Phase 1` read-only gateway contract surface
2. 本地 `OPL` product-entry / front-desk surface

前者负责顶层联邦真相；后者负责用户入口。

## 本轮落地范围

- 修改 `opl` 裸命令默认行为
- 新增 `resume / sessions / logs / repair-hermes-gateway`
- 更新 README / status / architecture / roadmap / SVG
- 冻结 family entry alignment 文档
- 新增 MAS top-level cutover board
- 补测试与构建产物验证

## 明确不做

- 不把 OPL 写成 domain runtime owner
- 不在 OPL 仓里直接重写三个业务仓的入口实现
- 不把 hosted / web 入口写成已经落地
- 不把 MAS 的 runtime cutover 写成已经完成
