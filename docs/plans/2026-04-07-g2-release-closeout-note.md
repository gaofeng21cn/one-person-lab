# G2 release-closeout note

状态：`release-closeout`

日期锚点：`2026-04-07`

## 目的

这份 note 用来冻结当前 `Phase 1 / G2 stable public baseline` 的完成边界，
避免顶层公开文档与四仓状态同步继续漂移。

它是 repo-tracked 的 closeout 记录，
不是新的公开主线真相面，也不是后续 runtime 扩面的入口。

## 当前已完成边界

截至 `2026-04-07`，`one-person-lab` 已具备可运行的本地 `TypeScript CLI`-first / gateway contract baseline。

本轮 `G2 stable public baseline` 的完成边界是：

- 顶层公开口径统一收口到单一、repo-tracked 的 `Phase 1 / G2` 基线
- CLI 继续只读取已冻结 contracts，不接管 domain runtime truth
- 顶层可稳定暴露 workstream / domain / surface discovery
- 顶层可稳定暴露 boundary explanation 与只读 routing explanation
- README、roadmap、gateway contracts、public surface index、gateway rollout 与四仓状态参考面已同步到同一日期锚点

## 当前明确不包含

下面这些能力 **不** 属于本轮 `G2` closeout：

- mutation entry
- routed-action execution
- domain run launch
- unified runtime owner
- shared truth store
- shared execution core

`Unified Harness Engineering Substrate` 在当前阶段仍然只是共享架构基座，不是共享代码框架。

## G3 当前边界

`G3` 仍未激活。

当前只允许把 `G3` 理解为 `thin handoff planning freeze`，即：

- 只预冻结 `route_request`
- 只预冻结 `build_handoff_payload`
- 只预冻结 `audit_routing_decision`

当前不实现真正的 `G3 mutation/routed-action runtime`。

## no-bypass / no-overclaim

- 不得绕过 `domain gateway`
- 不得把 planned workstream 写成已实现能力
- 不得把 planned routed-action 写成当前可执行能力
- 不得把 `docs/references/**` 反向抬升为 `OPL` 公开主线真相

## 下一棒

下一棒仍是：

1. 继续维护这条单一、repo-tracked 的 `G2` 顶层公开基线
2. 继续把四仓最新停车点同步回 `OPL` 顶层参考同步面
3. 把 `G3` 严格压在 `thin handoff planning freeze`
4. 任何会把 `OPL` 升格成 runtime owner、shared truth store 或 mutation gateway 的动作都继续后置
