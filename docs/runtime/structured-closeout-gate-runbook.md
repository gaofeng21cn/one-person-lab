# StructuredCloseoutGate 与 repair-redrive runbook

Owner: `One Person Lab`
Purpose: `structured_closeout_gate_runtime_support`
State: `active_support`
Machine boundary: 本文是人读 runbook。机器真相继续归 contracts、source、CLI/API、stage attempt ledger、provider receipt、runtime event log、domain-owned receipt / typed blocker / human gate 和 fresh read-model。

Currentness policy: 本文只定义 OPL Framework / Runway primitive 的稳定语义。不要从本文读取当前 attempt id、provider health、repair queue 数量、owner receipt 是否已接受、typed blocker 是否有效、human gate 是否关闭、domain ready、runtime ready、Live Evidence ready 或 production ready；这些必须从 fresh runtime/readback、ledger、provider receipt 和 domain owner surface 读取。

## 结论

`StructuredCloseoutGate` 是 OPL Framework / Runway primitive：它把 selected executor 的终端输出收束成 stage attempt 可消费的 typed JSON closeout packet。它不是 MAS 私有兜底，不是 stage 外控制层，也不是 domain owner。`Codex CLI` 的文字输出、provider completion、测试通过或文件存在都不是 stage attempt completion authority；只有符合 closeout policy 的 structured packet / refs 才能让 OPL 关闭当前 StageRun attempt 并进入下一步投影。

OPL 在这个 primitive 中只做五件事：

- capture：捕获 terminal JSON / last-message / session recovery 中的 closeout candidate。
- schema：按 family/runtime closeout shape 校验 surface kind、attempt identity、refs、outcome 和 authority false flags。
- recovery：在同一 session / terminal history 内恢复合法 refs-only packet，处理格式漂移。
- enforcement：缺 packet、错 identity、unsupported shape 或越权 claim 时 fail closed 为 OPL provider-runtime closeout blocker。
- projection：把 blocker、repair guidance、recovery-repair plan 和 owner route refs 投给 Runway / Console / operator。

OPL 不做这些事：判断 domain 内容是否完成、写 domain truth、签 owner receipt、创建 domain typed blocker、关闭 human gate、写 artifact body / memory body、生成 quality verdict、发布 package authority、声明 domain ready / runtime ready / production ready。

## Stage Closeout 读法

stage closeout 时，OPL 接收的是 structured packet / refs，而不是自由文本结论。packet 可以表达 completed、route-back、waiting owner、human gate、blocked、rejected 或 stop-loss 等 outcome，但这些 outcome 的 domain 语义必须由 domain/stage owner refs、owner answer refs、typed blocker refs、human gate decision refs 或 route-back refs 支撑。

正常推进路径是：

```text
selected executor terminal output
  -> StructuredCloseoutGate capture / schema
  -> typed closeout packet accepted as OPL transport
  -> StageRun attempt terminal projection
  -> domain closeout consumption / owner route refs
  -> next current_owner_delta, route-back, human gate, typed blocker, or stop-loss
```

这个路径只说明 OPL transport 已收到可消费的结构化 packet。下一 stage 是否启动、是否 route back、是否等待 human、是否 stop-loss，继续由 domain/stage outcome 与 owner answer refs 表达。OPL 不能把 packet accepted 写成 domain owner receipt accepted，也不能把 provider completed 写成 stage content completed。

## 5-Agent Smooth Progression Structural Smoke

本 smoke 的稳定读法是结构链路检查，不是 live/domain ready 检查。`opl agents conformance --family-defaults --json` 应证明 MAS、MAG、RCA、OMA 和 BookForge 都在 Foundry Agent OS 中作为 `standard_domain_agent` 暴露，并且 stage-run adoption worklist 接受同一组 owner answer ref shape：`domain_owner_receipt_ref`、`typed_blocker_ref`、`human_gate_ref`、`quality_or_export_receipt_ref`、`no_regression_ref` 和 `long_soak_ref`。`opl foundry agents inspect <agent_id> --json` 应证明每个 agent 仍有 ordinary golden path 和 generated / hosted surface 的 false-authority flags。

交付即推进的最小结构是：

```text
domain StageOutcome / typed closeout packet
  -> accepted owner answer ref shape
  -> OPL closeout transport / stage-run adoption read model
  -> next current_owner_delta, next stage, route-back, stop, or human gate
```

这条链路只说明 OPL 能接住并路由交付信号。`ready_claim_authorized=false` 或等价 authority false 字段必须保持为 false：OPL 不判断 domain 内容是否 ready，不签 owner receipt，不创建 domain typed blocker，不把历史 backlog、retired local residue 或 private wrapper 诊断当作 ordinary next action。

## 格式漂移处理流程

当 executor 结束但 closeout 格式漂移、字段过大、refs 形态变化或 provider result 缺 packet 时，OPL 按固定顺序处理：

1. terminal JSON capture：优先从明确 structured JSON / closeout file / last message refs 捕获 packet candidate。
2. session recovery：在同一 session 的 terminal history 中恢复合法 refs-only closeout；object-shaped refs 可保留元数据，但必须归一化为可索引 closeout refs。
3. same-session enforcement：恢复成功则继续同一 attempt closeout；恢复失败不得跨 session 猜测，不得从 prose 摘要生成 packet。
4. domain receipt recovery if applicable：如果 domain owner 已经返回合法 receipt / typed blocker / human gate / route-back ref，OPL 只记录这些 refs 并交给对应 domain consumption；不补写 owner receipt。
5. provider-runtime closeout blocker：仍缺合法 packet 时，attempt 进入 OPL provider-runtime blocker，例如 `typed_closeout_packet_required` / `completed_missing_typed_closeout`。
6. recovery-repair projection：Runway / Console 投影 repair plan、候选 refs、下一 owner 和禁止 claims，供 operator 或 repair lane 查询。

这条流程的停止条件是 accepted structured packet、合法 domain owner ref 被消费、typed blocker / human gate / route-back 已由 owner surface 给出，或 OPL provider-runtime blocker 被投影。任何一步都不能把格式漂移误标为 completed；漂移只能落到现有 machine surface 的 typed repair / provider-runtime blocker reason，不能靠纯文本摘要、关键词或跨 session 猜测生成下一步推进。

## Repair / Redrive 边界

repair / redrive 是 query / decision surface，不是 authority fabrication surface。它可以回答：

- 当前 attempt 是否缺 typed closeout packet。
- 是否能从同一 session 恢复合法 refs-only closeout。
- 是否已有 domain owner receipt / typed blocker / human gate / route-back ref 可交给 owner consumption。
- 是否应该 redrive 同一 stage attempt、route back 到 owner、等待 human、进入 provider-runtime blocker，或 stop-loss。
- 哪些 refs、identity、stage packet、source fingerprint 或 owner answer 缺失。

repair / redrive 不可以：

- 伪造 typed blocker 或 owner receipt。
- 把 provider completion、Codex CLI prose、tests green、docs patch、read-model refreshed 或 recovery projection 写成 completed。
- 绕过 `current_owner_delta`、owner route、human gate 或 domain closeout consumption。
- 写 MAS/MAG/RCA/OMA truth、artifact body、memory body、publication / fundability / visual verdict。

默认 redrive 只有在 currentness identity、stage packet identity、source fingerprint、attempt idempotency 和 authority boundary 都完整，且没有 stable owner answer / typed blocker / human gate / stop-loss 时才是候选动作。稳定 domain typed blocker、human gate、owner answer 或 provider hard gate 会停止默认 redrive。

## Operator Checklist

处理 closeout 卡点时按这个顺序读：

1. attempt identity：确认 domain、stage、source fingerprint、attempt idempotency、selected executor 和 stage packet refs。
2. terminal evidence：确认是否有 structured closeout packet / refs，而不是只有 `Codex CLI` prose 或 provider completed。
3. recovery scope：只在同一 session / terminal history 内恢复；跨 session 只能作为 repair input。
4. owner refs：确认是否有 domain owner receipt、typed blocker、human gate、route-back 或 owner answer refs。
5. projection result：accepted packet、owner-consumption pending、human gate、route-back、provider-runtime blocker 或 stop-loss 必须恰好一个成为当前 read-model 主结论。
6. forbidden claims：docs/tests/read-model/refs-only ledger、recovery-repair projection 和 provider completion 都不能声明 runtime ready、domain ready、Live Evidence ready 或 production ready。

## 与现有 surface 的关系

- `family-conflict-envelope` 承载不能继续、不能确认完成或冲突时的 fail-closed vocabulary。
- `family-owner-route` 承载下一 owner、allowed action、route-back、typed blocker、human gate 和 owner receipt refs。
- `family-stage-replay-certification` 只能读取 append-only event log、attempt ledger、runtime event refs 和 closeout receipt refs；它不重新询问 AI、人或外部系统。
- `DomainProgressTransitionRuntime` 负责 append-only event log、StageRun identity、fixed-point reconcile、NonAdvancingApply、human gate resume 和 closeout transport。
- `Runway recovery-repair` 只是 bounded repair/query projection；它不 redrive、不写 ledger truth、不签 owner receipt、不创建 typed blocker。

## 非目标

本 runbook 不声明 StructuredCloseoutGate 已具备 Live Evidence、provider long-soak、App release、Brand L5 或 production readiness。它只固定 docs/contracts 层的 closeout repair-redrive 语义和 false-ready 边界。
