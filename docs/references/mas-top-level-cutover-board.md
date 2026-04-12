# MAS 顶层切换板

## 1. 目的

这份板面只负责冻结 `OPL -> Med Auto Science` 的顶层协作边界。
它不是 `Med Auto Science` 仓内的实现计划，也不是 display / 配图资产化支线的工作板。

它要解决的是：

- `OPL` 现在已经拥有 family-level front desk 与 handoff shell；
- `Med Auto Science` 需要在不丢稳定性的前提下，逐步把 outer runtime substrate 切到真实上游 `Hermes-Agent` 协作形态；
- 这个切换必须在顶层口径上保持诚实，不把 repo-side seam、adapter scaffold 或 transition shell 写成“已经完全替换 backend”。

## 2. 当前顶层真相

- `OPL` 顶层现在已经可以直接通过 `opl` 进入 family-level front desk。
- `OPL <-> MAS` 的下一个真实目标，不是重写论文配图能力，而是收紧 `Research Ops` 主线的 family handoff、domain product entry 与 runtime substrate 边界。
- `MAS` 当前的真实主线仍是：
  - 外层 product/runtime orchestration 往 `Hermes-Agent` 靠拢；
  - 研究 inner-loop 仍存在受控 `MedDeepScientist` backend 事实；
  - honest next step 是 real adapter cutover，而不是直接宣称 backend 已被完全吸收。

## 3. 明确排除项

以下内容不属于这条顶层切换板的交付：

- 论文配图 / display 资产化支线
- display 素材包、图像模板、视觉重组
- `Med Auto Science` 仓内任何与 display 资产化直接耦合的改动
- 把 `MedDeepScientist` 一次性彻底拆除的激进迁移叙事

这条板默认只覆盖 display 以外的 `Research Ops` 主线。

## 4. 切换对象

### OPL 顶层负责冻结的对象

- `OPL Front Desk` 如何把研究请求 handoff 到 `MAS`
- family-level `Domain Handoff` envelope 在 `Research Ops` 路径上的最小字段
- `OPL` 文档里关于 `MAS` 集成深度、runtime substrate 与 authority boundary 的真实表述

### MAS 仓内负责冻结的对象

- domain product entry
- runtime session binding
- outer-loop audit / report / stop-reason surface
- `Hermes-Agent` 与现有 research backend 的 adapter contract

## 5. 顶层 handoff 最小字段

`OPL -> MAS` 至少要稳定这些字段：

- `target_domain_id = medautoscience`
- `task_intent`
- `entry_mode`
- `workspace_locator`
- `runtime_session_contract`
- `return_surface_contract`
- `study_or_workspace_authority`
- `evidence_boundary`

其中：

- 顶层只冻结字段语义；
- 具体 study object、workspace object、publication object 仍由 `MAS` 域内真相拥有。

## 6. 切换阶段

### C0. 顶层真相冻结

- `OPL` 公开文档、reference docs、family entry 文档对齐
- 不再把 `MAS` 写成“已经完全 Hermes-native”
- 不再把 display 线混入主切换线

### C1. Domain product entry 对齐

- `MAS` 域内明确 research-only lightweight direct entry
- 与 `OPL Front Desk` 的 handoff envelope 对齐
- 不要求这一步就替换掉所有 backend 执行器

### C2. Runtime substrate 切换

- 把 outer runtime substrate 迁到真实的 `Hermes-Agent` 协作形态
- pause / resume / stop / watch / session binding 的顶层语义与 `OPL` 保持一致
- 仍允许 inner-loop 通过受控 backend 执行，只要 truth surface 诚实

### C3. Backend 吸收或替换评估

- 只有在上一步已经稳定后，才评估哪些 backend 能力值得继续吸收、替换或保留
- 这一阶段才讨论 `MedDeepScientist` 的进一步解构

## 7. 提升条件

只有同时满足以下条件，`OPL` 才能把 `MAS` 的集成深度继续往上提升：

- 顶层 handoff envelope 已冻结
- `MAS` research 主线与 display 支线保持清楚分离
- repo-tracked docs、tests、runtime evidence 一致
- 没有再把 transition seam 写成“已完成 backend 替换”

## 8. 当前结论

当前最合理的做法是：

- `OPL` 继续维护 family-level front desk 与顶层 truth；
- `MAS` 主线继续围绕 display 以外的 research runtime / adapter cutover 推进；
- display 资产化单独开线，不混线；
- 顶层所有公开叙述都必须持续区分：
  - 已落地的 front desk / handoff truth
  - 正在推进的 runtime cutover truth
  - 尚未完成的 backend absorb truth
