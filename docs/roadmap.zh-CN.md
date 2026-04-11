[English](./roadmap.md) | **中文**

# OPL 路线图

## 当前公开主线

截至 `2026-04-11`，`OPL` 的当前公开主线仍然是两部分的组合：

- 已 admitted domain federation 的公开边界
- 本仓已经落下的本地 `TypeScript CLI`-first / read-only gateway baseline

这在当前意味着：

- `OPL` 继续是实验室的顶层 `Gateway / Federation` 语言
- `MedAutoScience` 继续是活跃的 `Research Ops` domain gateway 与 harness
- `RedCube AI` 继续是已 admitted 的视觉交付 domain gateway 与 harness
- `Grant Foundry -> Med Auto Grant` 继续只是 future direction / public signal，而不是已 admitted 的 domain gateway
- `OPL` 层的 formal entry 继续保持 `CLI-first`，`MCP` 继续保持 supported protocol layer，`controller` 继续只保留 internal surface 语义
- 当前 deployment shape 继续是 `Codex-default host-agent runtime`，但这不是 `OPL` 产品身份，也不是 shared substrate 的身份

更早的 phase / activation-package 冻结仍然保留在 `docs/references/` 里作为历史锚点，但它们不再是当前 repo-tracked follow-on 的正确标签。

## 当前 repo-tracked follow-on：`S1 / shared runtime substrate v1 contract freeze`

当前 repo-tracked follow-on 不是“再来一轮 central sync”。
它是 `S1 / shared runtime substrate v1 contract freeze`。

`S1` 的目标，是把 `OPL` 向“垂类在线 agent 平台族”演进所必需的顶层 runtime substrate 语言先冻结下来，同时不假装 runtime 已经统一、已经托管或已经平台化。

`S1` 要冻结的 6 组共享对象是：

- `runtime profile`
- `session substrate`
- `gateway runtime status`
- `memory provider hook`
- `delivery / cron substrate`
- `approval / interrupt / resume`

对于 `OPL` 顶层来说，`S1` 算完成，至少要同时满足：

- `README*`、`docs/README*`、`roadmap*`、`operating-model*`、`unified-harness-engineering-substrate*`、`opl-runtime-naming-and-boundary-contract*`、`contracts/README.md`、`contracts/opl-gateway/README*` 不再互相打架
- Hermes 吸收结果被明确冻结为 `adopted / adapted / deferred / rejected`
- `med-autoscience`、`med-autogrant`、`redcube-ai` 的下一轮 truthful adoption 顺序被 repo-tracked 固定下来
- 不再制造第二真相源

## 为什么现在做

现在冻结这条线，有三个直接原因：

- 公开 gateway 与 domain 边界语言已经比 runtime substrate 语言稳定得多
- 三个业务仓现在需要同一个上位 north star，避免各自发展出互不兼容的 runtime 叙事
- Hermes benchmark 已经给出了足够的外部参照，使我们可以诚实地冻结语言与 ownership boundary，而不必编造尚不存在的共享实现

## `S1` 明确不能做什么

`S1` 不能：

- 宣称统一平台 runtime 已经存在
- 宣称托管式 `Web / API` runtime 已经实现
- 把 `OPL` 提升成当前 runtime owner
- 把三个业务仓强行压成同一个 execution kernel
- 把 future product entry 写成 current truth
- 把尚未证明属于 gateway-owned 的 substrate 语言直接写进 `contracts/opl-gateway/*.json`

## `S1` 之后的紧接下一棒

顶层冻结完成后，下一轮 truthful 推进顺序是：

1. `med-autoscience`
   - 先证明第一条成熟的本地产品 runtime pilot
2. `med-autogrant`
   - 再把同一套语言压进更清楚的 revision / final / export runtime 路径
3. `redcube-ai`
   - 等 `source-readiness / research-mainline` 更稳定后，再吸收真正可复用的那部分 substrate

这只是 domain adoption 的推进顺序，不等于这三个 domain 要变成同一种实现。

## 当前评估标准

判断 `OPL` 是否在沿正确方向推进，当前最重要的是：

- 读者能否清楚区分“公开主线”和“当前 repo-tracked follow-on”
- 读者能否看出 `OPL` 仍然是 `Gateway / Federation`，而不是 runtime owner
- 读者能否看出 `shared runtime substrate v1` 只是 contract freeze，而不是实现声明
- 读者能否看出 formal entry 继续是 `CLI-first`、`MCP` 继续是 supported layer、`controller` 继续是 internal surface
- 读者能否看出三个业务仓的 adoption 顺序分别是什么

## 延伸阅读

- [OPL 运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)
- [OPL Runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)
- [Hermes Agent Runtime Substrate 对标与吸收清单](./references/hermes-agent-runtime-substrate-benchmark.md)
- [OPL 垂类在线 Agent 平台演进蓝图](./references/opl-vertical-online-agent-platform-roadmap.md)
