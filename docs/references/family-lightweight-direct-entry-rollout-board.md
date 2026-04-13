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
2. 每个业务仓都应拥有自己的 lightweight direct entry，并把 `frontdesk_surface` 与 `operator_loop_surface` 诚实区分。
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
- `opl frontdesk-manifest|frontdesk-hosted-bundle|frontdesk-hosted-package` 已把 hosted-friendly shell contract、hosted pilot bundle 与 self-hostable hosted pilot package 冻结下来；
- `opl workspace-catalog|workspace-bind|activate|archive` 已把 workspace registry 与 direct-entry locator 管理做成顶层控制面；当前 binding 还可额外冻结 domain-owned `manifest_command`，让 family wiring 指向诚实的 product-entry manifest；
- `opl session-ledger|handoff-envelope|dashboard|web` 已把 managed session attribution、family handoff 和 browser front desk 一并落地；
- `domain-manifests / dashboard / handoff-envelope / opl web` 现在会统一消费 domain manifest 里的 `frontdesk_surface`，不再只知道每个业务仓“当前 operator loop 是什么”。
- 三个业务仓当前也都已经开始把 `frontdesk_surface` 与 `operator_loop_surface` 明确分开；`OPL` 顶层现在消费的已不再只是“哪个 loop 可跑”，而是“当前 frontdoor 是什么、底下真实 loop 是什么”。

下一棒：

- 把 `LibreChat-first` 或等价 hosted shell 接到已冻结的 hosted-friendly shell contract / hosted pilot bundle / self-hostable hosted pilot package 上；
- `OPL bootstrap / launcher / product packaging` 继续收紧；
- family-level session / handoff / runtime ops 继续稳定，并保持顶层与 domain direct-entry locator 对齐。

### `Med Auto Science`

当前已知边界：

- 这条板只覆盖论文配图以外的 research runtime 主线；
- display / 配图资产化是独立支线，不混入这里；
- 当前最诚实的下一棒不是重做 display，而是沿 real adapter cutover 推进研究主线。
- repo-tracked research-only lightweight direct-entry shell 已经落地：`workspace-cockpit`、`submit-study-task`、`launch-study`、`build-product-entry` 现在共同承担启动、下任务、看进度与 shared handoff envelope 输出。
- 当前又新增了一层 controller-owned `product-frontdesk`：它显式作为 `frontdesk_surface` 暴露当前 frontdoor，而把 `workspace-cockpit` 留作真实 operator loop。

下一棒：

- external `Hermes-Agent` kernel 与主线 research runtime 的真实 adapter cutover；
- 保持 `MedDeepScientist` backend 的受控边界，直到替换条件真正成熟；
- 在 external gate 仍存在的前提下，把已 landed shell 继续收成更诚实的 direct-entry 回路，而不是把它误写成成熟前台。

### `RedCube AI`

当前已知边界：

- 它是最适合尽快长出 lightweight direct entry 的业务仓之一；
- 重点仍是 visual deliverable / source-readiness / family handoff 收口。
- repo-tracked lightweight direct-entry shell 已经落地：`redcube product frontdesk` 现在作为 direct frontdesk，`redcube product manifest` 会显式导出 `frontdesk_surface`，而 `redcube product invoke|federate|session` 继续承担 direct / `OPL` handoff 共用的 shared envelope 与续跑面。
- 三个业务仓的 repo-tracked manifest 现在开始补上 `family_orchestration` companion preview，顶层 `OPL` 的 `domain-manifests / dashboard / opl web` 也会回显 human gate / resume / checkpoint lineage 摘要。
- 它当前也是家族里最接近“frontdesk contract 已清晰、operator loop contract 也清晰”的参考形态。

下一棒：

- 真实上游 `Hermes-Agent` pilot；
- 把 visual-only lightweight direct entry 从“可输出 envelope 的 contract shell”继续收成更完整的 direct-entry 面；
- 与 `OPL` 顶层 handoff、workspace locator 与 domain locator 配置继续对齐。

### `Med Auto Grant`

当前已知边界：

- 它已经比多数仓更接近真实的 runtime substrate 集成；
- `build-product-entry`、`grant-progress`、`grant-cockpit` 已经让 grant-only lightweight direct entry 走在三仓最前；
- 当前又新增了一层 controller-owned `product-frontdesk`：它显式作为 `frontdesk_surface` 暴露当前 frontdoor，而把 `grant-user-loop` 留作真实 operator loop；
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

- `RedCube AI`：从已 landed 的 `product-entry` contract shell 继续压实 visual-only lightweight direct entry
- `Med Auto Grant`：在已 landed 的 structured shell 与 read-only projection 上继续压实 grant-only lightweight direct entry
- `Med Auto Science`：在已 landed 的 research-only shell 与 `build-product-entry` 上继续压实 lightweight direct entry（不含 display 支线）

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
