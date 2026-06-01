# Codex-maxxing Operating Loop Adoption

Owner: `One Person Lab`
Purpose: `runtime_operating_loop_adoption_support`
State: `active_support`
Machine boundary: 本文是人读 adoption bundle。机器真相归 `contracts/opl-framework/operating-loop-adoption-policy.json`、现有 OPL contracts、source、CLI/API、runtime ledger、provider receipt、domain-owned manifest、App/operator read model 和真实 workspace / App evidence。

## 结论

Jason Liu 的 Codex-maxxing 原文可作为 operating-loop 参考，但不能成为 OPL truth。OPL 吸收的是让长任务持续推进的工作方式：workstream/thread continuity、带真实 oracle 的 goal、heartbeat/steering、artifact-first review、explicit memory 和 side-panel operator review。落地方式是把这些概念折进 OPL 已有的 stage attempt、owner route、receipt、typed blocker、App/operator read model、memory refs 和 surface budget；不引入外部 runtime，不改变 `Codex CLI` first-class executor，不把博客流程写成 hard gate。

本次 adoption 的机器锚点是 `contracts/opl-framework/operating-loop-adoption-policy.json`。该合同只冻结 owner surface、字段族、禁止语义和验证建议；它不定义新的调度器、planner、memory store、artifact authority 或 domain verdict。

## 吸收映射

| Codex-maxxing 概念 | OPL-native 落点 | 稳定读法 |
| --- | --- | --- |
| Workstream / pinned thread | `workstreams.json`、`family-runtime-attempt-contract.json`、App/operator `active_workstream_summary` | thread 是 admitted workstream 与 stage attempt refs 的 operator continuity view；它可以影响关注顺序，不能改变 owner route、provider state 或 domain verdict。 |
| Goal oracle | stage pack、expected receipt refs、verification command refs、domain-owned gate / owner receipt / typed blocker / human gate | goal 必须有真实 oracle。没有 oracle 的 goal只能形成 warning、typed blocker、human gate 或 route-back；provider completed、计划已执行或 worklist 为 0 都不是 completion。 |
| Heartbeat / steering | provider heartbeat、monitor refs、operator attention、safe action shell、resume/user instruction refs | heartbeat 是 liveness、monitor 和 steering surface。它能定期检查、请求 payload、暴露决策点或路由 safe action；不能直接写 domain truth、发送不可逆外部消息、改 artifact body、接受 memory writeback 或签 owner receipt。 |
| Artifact-first review / side panel | `opl app state/action`、App/operator drilldown、artifact refs-only projection、domain artifact authority | artifact 应作为可预览、可评论、可 route-back 的一等对象；OPL 只展示与路由 refs，不从 artifact body 推断质量，也不绕过 domain owner mutation authority。 |
| Disk-backed memory / explicit memory | domain memory descriptor、memory locator/index projection、writeback proposal refs、writeback receipt refs | memory 采用 refs-first。OPL 可索引、投影和验证 receipt refs；memory body、accept/reject、语义和 evidence authority 留在 domain owner。 |
| Remote steering / mobile check-in | App/operator read model、owner-aware safe actions、human gate / resume refs | steering 是 operator intervention，不是另一个 runtime。远程介入必须经 owner-aware action、human gate、resume ref 或 payload workorder 落账。 |

## 不照搬内容

- 不把外部博客、个人 workflow 或原文命名写成 runtime truth。
- 不新增 thread-local scheduler、memory body store、artifact mutation engine、review engine 或 fallback runtime。
- 不把 pinned thread、heartbeat cadence、side-panel preview、artifact visible、memory ref visible 或 worklist zero 写成 done / ready。
- 不让 App shell、browser panel、connector、remote control 或 automation 变成 domain truth、artifact authority、memory owner、quality verdict owner 或 production readiness owner。
- 不把 goal 写成 Markdown plan implementation；goal completion 必须回到 tests、owner receipt、typed blocker、human gate、independent reviewer gate、artifact mutation receipt、stop decision 或其它可复验 oracle。

## Product / Operator 读法

App/operator 默认读面应显示 continuity 和 attention，而不是再造 runtime：

- active workstream / pinned thread refs
- 当前 goal oracle 状态与 missing oracle blocker
- heartbeat / monitor / liveness attention
- artifact review refs、comment refs 与 route-back refs
- memory trace projection、writeback proposal refs 与 writeback receipt refs
- next safe action、owner route 或 human gate

这些内容必须继续保持 summary-first、refs-only、owner-aware 和 explicit drilldown。full detail 可以展开 attempt、artifact、memory、receipt、Temporal 或 provider refs；默认页面不能读取 transcript、memory body、artifact body 或 domain verdict body 来合成 truth。

## 验证口径

Docs/contract-only adoption 的最小验证：

```bash
rtk git diff --check
rtk rg -n "^(<<<<<<<|>>>>>>>|=======)" docs contracts/opl-framework
```

如果后续把本 policy 接入 source、App state/action、read model 或 validator，再追加：

```bash
rtk ./scripts/verify.sh
rtk npm run test:fast
rtk npm run test:meta
rtk npm run test:artifact
rtk opl framework readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
```
