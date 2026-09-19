# Receipt：ibd-oma-create-09 —— 四类缺陷修复后的端到端实证

> 每个 receipt 文件都是 OPL 运行时（`foundry/provider-runs/foundry-c2729b7a…/`）落盘的原件，sha256 见下表，可独立复算。**先看"一眼结论"表，再点文件核对。**

## 一眼结论

| 问题（修复前 8 次全卡死） | 是否解决 | 成功标志（点开即验证） |
|---|---|---|
| #1 框架自己的产出被自家 work-item-root 边界误判越权 → 物化失败 | ✅ | [`closeout-packet.json`](./closeout-packet.json)：mission-intake 的 typed closeout **被框架物化落盘**（修复前这一步直接抛 `artifact_ref_outside_work_item_root`，根本不会存在这个文件） |
| #4 模型输出了完全合法的 closeout 却被静默丢弃 → 路由决定丢失 | ✅ | 同上文件的 `route_impact.stage_route_decision` 字段 = `{"decision_kind":"advance","target_stage_id":"design-basis-admission"}` —— **closeout 被认下且路由被框架执行**（下一阶段 15:43:38 自动拉起） |
| #3 Stage 未声明 review lane 时模型 hint 被判致命 → reviewer 永远拉不起来 | ✅ | [`review-closeout.json`](./review-closeout.json)：`"role":"reviewer"` 的 typed closeout **存在**——runs 05/07/08 全部死在 reviewer 之前，这是第一个被真实拉起的 reviewer |
| #2 长 closeout 会话补交 120s 超时 | ✅ | run 07 中 900s 预算下 resume 会话成功补交（本 run 未再触发 resume） |

## receipt 文件清单与哈希

| 文件 | 大小 | sha256 | 证明什么 |
|---|---|---|---|
| `closeout-packet.json` | 2164 B | `863dd6dc20cb455ffe3801338e50ad4a8b200d5ab39a87e04bd371e84fb44f8d` | mission-intake typed closeout 被框架认下；含路由决定 advance → design-basis-admission |
| `mission-intake.json` | 18103 B | 见运行台账 | producer 的真实领域产物（验收判据 7 条），落在规范 work-item root 内 |
| `design-basis.md` | 7728 B | `a159f3b5f8808d98…` | design-basis-admission producer 产物（人读版） |
| `review-design-basis-admission.json` | 12393 B | `78dcf81f767bdadf…` | reviewer 的独立评审产物 |
| `review-closeout.json` | 5531 B | `a9af4af2e2d8d937f843bd4b7e4aefee6f11a42d697ff14397d78be26fa1805e` | reviewer typed closeout：复算 9/9 快照摘要一致、无伪造/越权，并抓出 1 项 major 缺陷（A1/A7 输入域矛盾）——**质量循环在做真实审查** |

## 运行身份链

```
request_id      ibd-agent-20260919-09
提交命令        opl agents run --domain oma --action engineer-agent \
                  --workspace ~/Desktop/ibd2 \
                  --payload-file …/inputs/design-request-20260919-create-09.json
FoundryRun      opl-foundry-88823b0e3990076aa0058f3e42bc84b1bf23b20f475be2914e15d048c77c7b8b
台账事件        foundry_run_accepted → design_started
时间线          15:36:50 mission-intake producer 启动
                15:43:33 mission-intake completed（closeout 认下）
                15:43:38 design-basis-admission producer 自动拉起
                15:52:45 reviewer 自动拉起（首次）
```

## 关键字段速查

`closeout-packet.json`（修复 #1/#4 的直接成功标志）：
```json
{
  "surface_kind": "stage_attempt_closeout_packet",
  "route_impact": { "stage_route_decision": { "decision_kind": "advance",
                  "target_stage_id": "design-basis-admission" } },
  "domain_output": {}
}
```

`review-closeout.json`（修复 #3 的直接成功标志，节选）：
```
"role": "reviewer",
"stage_log_summary": "独立评审 design-basis-admission 冻结快照：重算全部 9 个快照
成员摘要一致；……无目标域真值伪造、无越权声明、无新增执行门……发现 1 项 major
必检缺陷：A1 与 A7 就公开动作输入域……"
```

## 未覆盖部分（如实）

六阶段中后四阶段（target-agent-assessment → evaluation-design）在 receipt 采集时点（2026-09-20 00:14 GMT+8）仍在运行；六阶段全部走完后将以同格式补充最终 receipt。
