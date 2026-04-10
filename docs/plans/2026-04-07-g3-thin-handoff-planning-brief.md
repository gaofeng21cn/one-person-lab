# G3 thin handoff planning brief

状态：`planning freeze`

日期锚点：`2026-04-07`

> Historical / completed planning brief：该 brief 对应的 `G3 thin handoff planning freeze` 已完成并被后续 `Phase 1 exit + next-stage activation package freeze` 与 `Phase 2 / Minimal admitted-domain federation activation package` 作为前序门槛吸收；它不再代表当前 active follow-on。

## 目的

这份 brief 只服务当前 `Phase 1` 的下一棒：

- 在 `G2 stable public baseline` 收口之后，
- 预冻结 `G3 thin handoff planning` 的最小边界，
- 但**不**把当前仓库推进到真正的 routed-action implementation。

它的职责，是把 `route_request`、`build_handoff_payload`、`audit_routing_decision` 三个动作的最小语义、输入输出边界与 `no-bypass` 规则写清楚，供后续实现或验收时复用。

## freeze closeout 当时的阶段硬边界

- 当时仓库仍停留在 `CLI-first / read-only gateway baseline + planning freeze`。
- 当时不实现真正的 `G3 mutation/routed-action runtime`。
- 当时不把 `OPL` 升格为统一 runtime owner。
- 当时不抽共享执行内核。
- 当时所有 routed-action 相关 schema / prose / examples，都只能被解释为 **planning dependency / contract pre-freeze**，不能被解释为当前可执行入口。

## thin handoff 的最小定义

`thin handoff` 只包含三件事：

1. **route_request**：把顶层请求分类到已知 workstream / domain 边界，或显式停在 refusal / unknown_domain / ambiguous_task。
2. **build_handoff_payload**：只在 `route_request.status = routed` 后，构建一个面向 `domain_gateway` 的薄 payload。
3. **audit_routing_decision**：把这次顶层 routing decision 的依据写成 machine-readable audit record。

不包含：

- domain mutation
- run launch
- workspace write
- review / publish / release
- domain-private runtime truth 接管

## no-bypass 规则

当前必须把下面这条规则写成硬边界，而不是偏好建议：

> `OPL` 不得绕过 `domain gateway`，也不得直接 targeting `domain harness`.

换句话说，当前 routed handoff 的硬规则就是：**不得绕过 domain gateway**。

因此允许的唯一成功 handoff 主链是：

```text
OPL Gateway -> Domain Gateway
```

而不是：

```text
OPL Gateway -> Domain Harness OS
```

## 三个动作的最小边界

### 1. `route_request`

最小职责：

- 读取已冻结的 `G1` registry / routing vocabulary
- 判定 `workstream_id`
- 判定 `domain_id`
- 给出 `entry_surface = domain_gateway` 或显式非成功状态
- 写清 `reason` 与 `routing_evidence`

最小禁止项：

- 不凭空发明 owner
- 不在 ownership 未注册时伪造 routed 状态
- 不把 `xiaohongshu` 自动等同于 `presentation_ops`
- 不把 planned workstream 写成已 admitted routed target

### 2. `build_handoff_payload`

最小职责：

- 只在 `route_request.status = routed` 时执行
- 输出保持在 `handoff.schema.json` 已冻结字段范围内
- 目标固定为 `domain_gateway`

最小禁止项：

- 不向 `domain_harness` 直接发 payload
- 不塞入 domain-private runtime state
- 不扩成 launch / execute / mutate 命令

### 3. `audit_routing_decision`

最小职责：

- 记录 `request_id`
- 记录 `decision_status`
- 记录 `resolved_* / candidate_*`
- 记录 `reason`
- 记录 `routing_evidence`
- 记录 `timestamp`

最小禁止项：

- 不把 domain review truth / publish truth 上收给 `OPL`
- 不用 best-effort prose 替代 machine-readable evidence

## 与现有 surface 的关系

- `docs/opl-routed-action-gateway*.md`：继续承担长程 `G3` contract prose，但在当前阶段只能被解释为 planning-level contract。
- `contracts/opl-gateway/routed-actions.schema.json`：当前作为 `thin handoff planning` 的 schema dependency，不等于 routed-action runtime 已激活。
- `docs/references/opl-gateway-acceptance-test-spec*.md`：当前只应把 `G3` 写成 contract / planning gate，不应写成已落地 runtime。
- `docs/references/opl-gateway-rollout*.md`：需要显式写明当前只到 `thin handoff planning` 预冻结。

## 历史最小验收口径（planning-only）

只有当下面这些条件都成立时，才算完成本轮 `planning freeze`：

1. `route_request`、`build_handoff_payload`、`audit_routing_decision` 的最小边界已 repo-tracked。
2. `no-bypass` 规则已写成硬边界。
3. `G2 baseline` 与 `G3 planning` 的阶段边界已在顶层文档写清。
4. 当前文档没有把 `OPL` 写成 runtime owner、shared truth store 或 mutation gateway。
5. 当前文档没有把 planned workstream / planned routed-action 写成已实现能力。

## 明确不做

- 不新增 `G3` CLI 命令
- 不新增 mutation entry
- 不把 routed-actions schema 变成 launcher
- 不引入统一 runtime owner 叙事
- 不把 shared execution core 提前写成当前主线
