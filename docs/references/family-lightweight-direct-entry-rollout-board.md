# Family Lightweight Direct Entry 推进板

状态锚点：`2026-04-12`

## 文档目的

这份板面用来回答一个管理问题：

- `OPL` 和三个业务仓现在都知道要从“只能被 agent / operator 调用”往“用户可直接进入的产品入口”推进；
- 但四仓不能再各跑各的入口语义。

所以这里冻结的是：

- 家族级 direct entry 的统一边界；
- 四仓各自的下一棒；
- 哪些仓可以先跑，哪些仓必须保留更重的切换边界。

## 家族级统一真相

四仓后续统一遵守下面三条：

1. `OPL` 是 family-level 总入口，不替代业务仓自身入口。
2. 每个业务仓都应拥有自己的 lightweight direct entry。
3. 统一的是 entry taxonomy、handoff envelope 与 runtime substrate 边界，不是把所有仓压成同一种内部执行流程。

统一 taxonomy：

- `operator entry`
- `agent entry`
- `product entry`

统一 handoff envelope 最小字段：

- `target_domain_id`
- `task_intent`
- `entry_mode`
- `workspace_locator`
- `runtime_session_contract`
- `return_surface_contract`

## 当前基线

### `OPL`

当前已落地：

- 本地 direct product-entry shell 已成立；
- `opl` / `opl <request...>` / `opl doctor|ask|chat|resume|sessions|logs|repair-hermes-gateway` 已成为顶层本地入口面；
- `opl frontdesk-manifest|frontdesk-hosted-bundle` 已把 hosted-friendly shell contract 与 hosted pilot bundle 冻结下来；
- `opl workspace-catalog|workspace-bind|activate|archive` 已把 workspace registry 与 direct-entry locator 管理做成顶层控制面；
- `opl session-ledger|handoff-envelope|dashboard|web` 已把 managed session attribution、family handoff 和 browser front desk 一并落地。

下一棒：

- 把 `LibreChat-first` 或等价 hosted shell 接到已冻结的 hosted-friendly shell contract / hosted pilot bundle 上；
- `OPL bootstrap / launcher / product packaging` 继续收紧；
- family-level session / handoff / runtime ops 继续稳定，并保持顶层与 domain direct-entry locator 对齐。

### `Med Auto Science`

当前已知边界：

- 这条板只覆盖论文配图以外的 research runtime 主线；
- display / 配图资产化是独立支线，不混入这里；
- 当前最诚实的下一棒不是重做 display，而是沿 real adapter cutover 推进研究主线。

下一棒：

- external `Hermes-Agent` kernel 与主线 research runtime 的真实 adapter cutover；
- 保持 `MedDeepScientist` backend 的受控边界，直到替换条件真正成熟。

### `RedCube AI`

当前已知边界：

- 它是最适合尽快长出 lightweight direct entry 的业务仓之一；
- 重点仍是 visual deliverable / source-readiness / family handoff 收口。

下一棒：

- 真实上游 `Hermes-Agent` pilot；
- visual-only lightweight direct entry；
- 与 `OPL` 顶层 handoff 对齐。

### `Med Auto Grant`

当前已知边界：

- 它已经比多数仓更接近真实的 runtime substrate 集成；
- 下一步不再只是补文档，而是把 grant-only direct entry、local runtime、hosted-friendly 边界继续压实。

下一棒：

- grant-only lightweight direct entry；
- hosted-friendly session / export / audit 继续收口；
- 保持与 `OPL` family handoff 的语义一致。

## 推进顺序

### D1. 顶层统一语言

由 `OPL` 继续冻结：

- family entry taxonomy；
- top-level handoff envelope；
- hosted / web front desk 的顶层选型；
- external kernel 与 product packaging 的边界。

### D2. 单仓落本地 direct entry

由各业务仓继续落实：

- `RedCube AI`：visual-only lightweight direct entry
- `Med Auto Grant`：grant-only lightweight direct entry
- `Med Auto Science`：research-only lightweight direct entry（不含 display 支线）

### D3. 接入真实 Hermes-backed runtime

由各业务仓分别完成：

- runtime substrate 对接；
- domain gateway / audit / durable report 对齐；
- product entry 不再依赖 `Codex` 才能成立。

### D4. 迁入 hosted / web 前台

由 `OPL` 先带顶层 hosted / web front desk；
业务仓随后各自补齐 domain-scoped hosted entry，仍共用同一条家族级 handoff 与 runtime substrate 语言。

## 当前优先级

当前最该先跑通的是：

1. `OPL` hosted / web front desk pilot
2. `RedCube AI` lightweight direct entry + Hermes pilot
3. `Med Auto Grant` grant-only direct entry hardening
4. `Med Auto Science` 非 display 主线的 real adapter cutover

原因很简单：

- `OPL` 要先解决“顶层像不像产品”；
- `RedCube AI` 和 `Med Auto Grant` 更适合先做可直接测试的入口强化；
- `Med Auto Science` 更重，且必须继续尊重 display 支线与主线分离。

## 不允许的漂移

下面这些做法都不允许：

- 只让 `OPL` 有产品入口，而业务仓长期只是内部能力层；
- 把 display / 配图资产线混进 `Med Auto Science` 主线 cutover；
- 把 repo-local helper / shim 写成“已经接入真实 Hermes runtime”；
- 把 lightweight direct entry 误写成“已经拥有成熟 hosted 产品”；
- 让四仓重新长出四套互相不兼容的入口语义。

## 一句话结论

家族级入口推进的正确节奏不是“四仓各自想办法长前台”，而是：

- `OPL` 先站稳 family-level front desk；
- 三个业务仓各自长出 lightweight direct entry；
- 再沿统一 handoff envelope 与 external `Hermes-Agent` kernel 迁入 hosted / web 形态。
