# G3 thin handoff planning closeout note

状态：`planning-freeze-closeout`

日期锚点：`2026-04-07`

## 目的

这份 note 用来冻结当前 `Phase 1 / G3 thin handoff planning freeze hardening` 的完成边界，
避免顶层公开文档、gateway 合同与参考同步文档继续在 `G3` 口径上漂移。

它是 repo-tracked 的 planning closeout 记录，
不是新的公开主线真相面，也不是 routed-action runtime 的启动面。

## 当前已冻结边界

截至 `2026-04-07`，当前仓库对 `G3` 只冻结三项 planning-level contract 操作：

- `route_request`
- `build_handoff_payload`
- `audit_routing_decision`

它们当前只服务顶层 thin handoff planning，
不代表 `OPL` 已进入真正的 routed-action implementation。

## handoff 边界

当前唯一允许的成功 handoff 目标只能是 `domain_gateway`。

硬规则如下：

- `OPL` 不得绕过 domain gateway
- 不得直达 `domain_harness`
- 不得把 routed handoff 写成 launcher 或 runtime activation

换句话说，当前 routed handoff 只冻结：

```text
OPL Gateway -> domain_gateway
```

而不冻结：

```text
OPL Gateway -> domain_harness
```

## 当前明确不包含

本轮 `Phase 1 / G3 thin handoff planning freeze hardening` 明确不包含：

- 不新增 mutation entry
- 不新增 run launch
- 不新增 workspace write
- 不把 routed-actions schema 写成 launcher
- 不把 `OPL` 升格成 runtime owner
- 不把 `Unified Harness Engineering Substrate` 写成共享代码框架

## 文档合同完成信号

只有当下面这些条件都成立时，本轮 planning closeout 才算完成：

1. roadmap、rollout、acceptance spec、contracts README、routed-action docs、public surface index 已统一到同一 `G3` 口径。
2. 所有文档都把 `G3` 写成 planning gate / planning-level contract，而不是已激活 runtime。
3. `domain_gateway` 被保持为唯一 allowed successful handoff target。
4. no-bypass 规则被写成可审计、可复核的硬边界。
5. example / reference 文档中的 routed-action 片段都已降回 planning-level contract。

## 与 G2 的关系

已完成的 `Phase 1 / G2 release-closeout` 继续固定 `G2 stable public baseline`。
当前这份 closeout note 只是在此基础上，把下一棒压到 `G3` 的 planning freeze hardening，
而不是重开新的执行主线。
