# Temporal Family Runtime Provider 支撑参考

Owner: `One Person Lab`
Purpose: `support_reference_temporal_family_runtime_provider`
State: `active_support`
Machine boundary: 本文是人工可读 runtime/provider 支撑参考，不是 active plan、provider receipt、readiness oracle、worklist ledger、domain owner receipt 或 production-ready verdict。机器真相必须落在 `contracts/`、source code、CLI/API 行为、runtime ledger、provider receipt、App/operator read model 或 domain-owned manifests。

Currentness policy: 本文只保存 Temporal-backed provider 的稳定 owner split、语义映射、动态读取入口和 negative boundary。不要从本文读取当前 service / worker / proof / worklist / SLO / attempt 数值；这些必须从 fresh contracts、source、tests、CLI/read-model 和 runtime ledger 读取。dated proof、paper-line 样本、receipt id、counter、worktree/branch、provider snapshot 和本机安装状态只属于历史 provenance。

Master entry: OPL family agent framework 的总开发入口是 `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`。本文只承接 Temporal provider 作为 production online runtime required substrate 的支撑边界：provider abstraction、Codex stage activity、human-gate signal/query、visibility、domain soak 证据门和 retired runtime interface cleanup。跨仓定位、执行语言、依赖取舍、domain-agent 边界和旧面退役纪律以总入口、核心五件套和 live machine surfaces 为准。

## 结论

OPL family runtime 的生产在线架构已经把已退役 Hermes-first online substrate 校准为 Temporal-backed production runtime。`temporal` 是 production online OPL 的必需 substrate，不是可选候选；它应像 `Codex CLI` 一样被安装、检测、修复、监控和持续维护。

Temporal 负责 durable execution：workflow history、activity retry/timeout、signal/query、heartbeat、workflow replay 和长期 attempt recovery。OPL 负责 provider abstraction、stage attempt ledger、stage-attempt projection、human gate transport、dead-letter、observability 与 domain handoff。`Codex CLI` 仍是 Codex-default stage executor 和默认 concrete executor。MAS/MAG/RCA 继续持有 domain truth、quality gate、artifact/package/submission/publication/deliverable authority。

`hermes_agent`、`claude_code` 与 `antigravity_cli` 的定位是显式非默认 executor adapter/backend；旧 Hermes runtime / Gateway / provider 只归历史 provenance、诊断语料、负向 guard 或历史参考材料。Temporal provider 是生产在线路径的必需底座；Hermes 不再作为目标 session/wakeup substrate、active provider interface、Gateway bridge、provider proof surface、install/update target 或 readiness surface；`local_sqlite` 只作为 retired-provider negative guard，SQLite sidecar 只作为 projection/readback index。

Temporal Event History、Visibility 与 Updates/Signals 属于 provider durable-execution 层：它们证明 workflow/activity/signal/update/query/retry/timeout/replay 事实。OPL SQLite attempt ledger 属于 framework control-plane 层：它记录 attempt identity、stage-attempt projection linkage、idempotency/source fingerprint、checkpoint/closeout refs、owner receipt refs、typed blocker refs、human-gate/dead-letter state 和 read-model currentness。`stage_progress_log` 是 OPL family-runtime attempt/progress projection，只从 Temporal provider refs、SQLite ledger refs、domain receipt/typed blocker refs 和 closeout refs 派生。`attempt_true_path_proof` 只把同一 `stage_attempt_id/task_id/workflow_id/run_id` 在 `attempt query`、stage-attempt projection、App full drilldown、stage progress、Temporal visibility 和 Temporal Web UI debug refs 之间连起来，作为真路径可追踪证据，不声明 long-soak、domain-ready、artifact authority 或 quality verdict。Foundry Kernel 可以消费这些 projection refs 做 eval/improvement/root-cause/follow-up read model，但不拥有 runtime log，也不能写 provider history、SQLite ledger、domain truth、owner receipt、artifact body、memory body 或 quality verdict。退役 `stage_execution_log` 名称只允许在 tombstone/provenance 语境中出现。

Temporal provider 的 repo code path、worker lifecycle contract、CLI start/query/signal、typed closeout ingestion、fail-closed readiness、repo-native Temporal live residency proof 和 Agent Executor Adapter 接入链路都必须按 live machine surfaces 读取：`opl family-runtime service status --provider temporal --json`、`opl family-runtime worker status --provider temporal --json`、`opl family-runtime residency proof --provider temporal --production --json`、`opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json` 和 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。这些读面可以证明 service / worker / proof / provider SLO / refs-only worklist 的当前形状，但不能授权 domain ready、production ready、quality/export verdict 或 artifact mutation authority。open worklist 为 0 时只表示当前没有 OPL 可执行 evidence workorder；open worklist 大于 0 时只表示 OPL refs-only accounting 暴露了需要 domain/App/live owner payload 或 typed blocker 的 route。剩余证据门集中在持续 residency / SLO、真实 domain stage activity soak、MAS owner-chain guarded apply、MAG/RCA controlled soak 和真实 cost/progress 校准。

## 顶层设计

```text
User / Codex App / OPL GUI / CLI
  -> OPL stage control plane
  -> family runtime provider abstraction
      -> temporal provider (production required)
  -> SQLite sidecar projection/readback index
  -> domain handoff envelope
  -> Codex CLI activity inside domain stage
  -> domain-owned closeout / quality gate / artifact authority
```

Provider 层只持有 runtime/control metadata：

- `stage_attempt_id`
- domain id、stage id、workspace locator
- executor kind 与 source fingerprint
- checkpoint refs、closeout refs、human gate refs
- retry budget、timeout policy、dead-letter reason
- query/projection status

Provider 层不持有：

- 医学 evidence ledger、review ledger、publication verdict
- 基金 fundability verdict、submission-ready export gate
- RedCube canonical artifacts、visual review/export authority
- domain memory truth、claim truth 或 package authority

## Temporal 语义映射

| OPL 语义 | Temporal 对应 | 说明 |
| --- | --- | --- |
| `stage_attempt` | Workflow | 一次 domain stage 的 durable attempt。 |
| `Codex CLI execution` | Activity | 运行 Codex、domain sidecar dispatch、gate replay 或 artifact rebuild。 |
| `user instruction intake` | Signal | 里程碑后用户 10 条修改要求、approval、pause/resume/stop。 |
| `progress projection` | Query | OPL App / CLI 读取当前状态、next owner、blocked reason；provider proof 作为 operator item 展示，但不升级为 domain ready。 |
| `retry/dead-letter` | Retry policy / failure state | Provider 只表达运行失败和重试预算，不解释 domain quality。 |
| `history/replay` | Workflow history | 作为 runtime audit，不替代 domain truth。 |

Temporal Visibility 只提供 provider 运行发现与过滤索引，不是 OPL attempt ledger。Temporal Updates/Signals 只承载 workflow 内的人类指令、human gate、pause/resume/stop 或修复信号，不直接写 domain truth。OPL SQLite attempt ledger、`stage_progress_log` 和 `attempt_true_path_proof` 引用这些 provider refs 后，仍只表达 control-plane progress、operator projection 和同一 attempt 的 refs-only 可追踪性。

## 支撑分层与动态证据入口

本节不是 implementation ledger。它只说明 Temporal provider support reference 应该如何被读取，以及当前事实回到哪些机器面。

| support lane | 稳定读法 | 当前证据入口 |
| --- | --- | --- |
| Provider selection | `temporal` 是唯一 production runtime provider；`local_sqlite` 是 retired-provider negative guard，不再是允许成功 provider；非法旧 provider selection 必须 fail closed。 | `contracts/opl-framework/family-runtime-online-substrate-contract.json`、`contracts/opl-framework/runtime-manager-contract.json`、provider selection / readiness tests。 |
| Temporal workflow core | `StageAttemptWorkflow`、Codex/domain activity、human gate / user instruction / resume signal、query/update、typed closeout 和 retry/dead-letter 是 provider-backed stage attempt runtime 的机器面。 | `contracts/opl-framework/family-runtime-attempt-contract.json`、`src/family-runtime-temporal*.ts`、`tests/src/family-runtime-temporal-provider.test.ts`、`tests/src/cli/cases/family-runtime-stage-attempts*.test.ts`。 |
| Service / worker lifecycle | Temporal service、worker、visibility repair、managed local service state 和 production residency proof 是 OPL provider lifecycle surface；当前 ready / stale / blocked 状态只能 live 查询。 | `opl family-runtime service status --provider temporal --json`、`opl family-runtime worker status --provider temporal --json`、`opl family-runtime residency proof --provider temporal --production --json`、runtime state ledger。 |
| Attempt projection | OPL SQLite attempt ledger、provider run projection、activity events、`stage_progress_log`、`attempt_true_path_proof`、Temporal visibility 和 `temporal_webui_ref` 共同表达 refs-only progress。 | `opl family-runtime attempt query|inspect`、`opl runtime app-operator-drilldown --detail full --json`、`contracts/opl-framework/family-runtime-attempt-contract.json`、`tests/src/family-runtime-attempt-contract.test.ts`。 |
| Domain pilot / soak | MAS/MAG/RCA provider-hosted attempt、owner-chain guarded apply、grant/visual controlled soak、memory/artifact/lifecycle receipt 和 no-regression 只能由 domain owner refs、typed blocker、owner receipt 或 no-forbidden-write proof 关闭。 | domain-owned owner surfaces、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`、App/operator drilldown、runtime ledger。 |
| Operator visibility | App/operator drilldown、framework readiness 和 evidence worklist 是 refs-only operator read model；worklist/open/closed/SLO/attention counters 都是动态读数。 | `opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。 |
| Retired runtime vocabulary | Hermes provider / Gateway / frontdoor / local-manager / default-compat 只能作为 history/provenance/diagnostic source ref 或 negative guard；`hermes_agent` 只作为显式非默认 executor adapter/backend。 | `contracts/opl-framework/family-executor-adapter-defaults.json`、`docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`、`docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`、negative guard tests。 |

## 剩余证据门

Temporal provider support 当前不把任何机器面单独写成 production complete。后续 closeout 只能按 live evidence 判断：

- Provider lifecycle 需要持续证明 service / worker / visibility / residency proof 的 fresh 状态；stale worker、missing service、visibility misconfiguration 或 blocked repair receipt 都是 provider-side attention，不是 domain failure。
- MAS real paper-line 需要 domain owner receipt、typed blocker、progress delta、AI reviewer / publication gate refs、artifact delta、human gate、stop-loss 或 no-forbidden-write proof；OPL provider attempt、stage-attempt projection 或 worklist accounting 不能替代这些 refs。
- MAG grant stage 与 RCA visual stage 需要各自 domain owner receipt、typed blocker、no-regression、artifact/memory/lifecycle receipt 和 controlled soak evidence；task-bound sidecar ingestion 或 App/operator visibility 不能升级为 fundability、visual/export verdict 或 production soak complete。
- App/operator 和 framework readiness 的 zero-open 或 positive-open worklist 都只是 operator attention state；zero-open 不是 completion/domain-ready/production-ready，positive-open 只表示等待 domain/App/live owner payload 或 typed blocker。

## 退役方案

应退役或降级：

- 退役 Hermes-first default online substrate wording。
- 把 Hermes gateway readiness 写成 Full OPL 未来唯一 readiness 的文案。
- 把 Hermes session/memory/scheduler 当作 OPL 未来 domain runtime owner 的解释。
- 任何绕过 stage output / domain closeout 直接生成 winning path、quality verdict 或 artifact authority 的旧机械分流。

保留但降级：

- Hermes-Agent：`hermes_agent` 作为显式非默认 executor adapter/backend 保留；Hermes provider bridge、Gateway cron、compatibility alias、default executor、provider proof surface 或 readiness path 不恢复。其他非默认 executor adapter 同样只能通过显式 selection 和独立 receipt / audit 进入，不影响 Temporal provider 默认底座。
- Local provider：开发、CI、离线诊断、fixture 和 fail-closed baseline；不能替代 production online readiness。

不得退役：

- Direct Codex App skill path。
- Domain-owned sidecar export/dispatch、product-entry manifest、stage descriptor、quality gate 和 truth reducer。
- OPL shared contracts、attempt ledger、human gate transport、projection 和 parity helpers。

## 外部工程依据

- Temporal：durable workflow、activity、retry policy、signal/query、workflow history。
- LangGraph：thread/checkpoint/persistence/human-in-the-loop/resume。
- OpenAI Agents SDK：handoff、guardrail、tracing。
- Cloudflare Agents：durable identity、state、schedule、event-driven runtime。
- Pydantic AI durable execution：long-running、async、human-in-the-loop、restart recovery。

采用原则：可以引入 Temporal 作为 runtime dependency，因为它解决的是生产级 durable execution substrate；不把通用 agent framework 引入为领域大脑，也不把外部 runtime history 升级为 domain truth。
