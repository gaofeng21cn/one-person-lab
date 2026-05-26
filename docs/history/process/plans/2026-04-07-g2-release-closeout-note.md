# G2 release-closeout note

Owner: `One Person Lab`
Purpose: `historical_g2_release_closeout`
State: `historical_closeout`
Machine boundary: 本文是人读 historical closeout note。机器 truth 继续归当前核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt 和 domain-owned manifest。
Date: `2026-04-07`

> Historical closeout：本文冻结 2026-04-07 的 G2 public baseline。正文中的 `当前`、`G3`、`下一棒` 和 no-bypass 规则只按当时 gateway / thin handoff planning 语境读取；当前 topology 回到 stage-led OPL Framework、Temporal-backed provider、domain onboarding 和 live read-model。

## 目的

这份 note 用来冻结当时 `Phase 1 / G2 stable public baseline` 的完成边界，
避免顶层公开文档与四仓状态同步继续漂移。

它是 repo-tracked 的 closeout 记录，
不是新的公开主线真相面，也不是后续 runtime 扩面的入口。

## 当时已完成边界

截至 `2026-04-07`，`one-person-lab` 已具备可运行的本地 `TypeScript CLI`-first / framework contract baseline。

本轮 `G2 stable public baseline` 的完成边界是：

- 顶层公开口径统一收口到单一、repo-tracked 的 `Phase 1 / G2` 基线
- CLI 继续只读取已冻结 contracts，不接管 domain runtime truth
- 顶层可稳定暴露 workstream / domain / surface discovery
- 顶层可稳定暴露 boundary explanation 与只读 routing explanation
- README、roadmap、framework contracts、public surface index、gateway rollout 与四仓状态参考面已同步到同一日期锚点

## 当时明确不包含

下面这些能力 **不** 属于本轮 `G2` closeout：

- mutation entry
- routed-action execution
- domain run launch
- unified runtime owner
- shared truth store
- shared execution core

`Unified Harness Engineering Substrate` 在当时阶段仍然只是共享架构基座，不是共享代码框架。

## G3 当时边界

`G3` 仍未激活。

当时只允许把 `G3` 理解为 `thin handoff planning freeze`，即：

- 只预冻结 `route_request`
- 只预冻结 `build_handoff_payload`
- 只预冻结 `audit_routing_decision`

当时不实现真正的 `G3 mutation/routed-action runtime`。

## no-bypass / no-overclaim

- 不得绕过 `domain gateway`
- 不得把 planned workstream 写成已实现能力
- 不得把 planned routed-action 写成当时可执行能力
- 不得把 `docs/references/**` 反向抬升为 `OPL` 公开主线真相

## 当时下一棒

当时下一棒是：

1. 继续维护这条单一、repo-tracked 的 `G2` 顶层公开基线
2. 继续把四仓最新停车点同步回 `OPL` 顶层参考同步面
3. 把 `G3` 严格压在 `thin handoff planning freeze`
4. 任何会把 `OPL` 升格成 runtime owner、shared truth store 或 mutation gateway 的动作都继续后置
