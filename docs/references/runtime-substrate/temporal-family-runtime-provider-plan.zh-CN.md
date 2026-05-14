# Temporal Family Runtime Provider 落地计划

Owner: `One Person Lab`
Purpose: `development_plan`
State: `active_support; repo implementation landed; production soak pending`
Machine boundary: 本文是人工可读开发计划。机器真相必须落在 `contracts/`、source code、CLI/API 行为、runtime ledger 或 domain-owned manifests。
Date: `2026-05-12`

Master entry: OPL family agent framework 的总开发入口是 `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md`。本文只承接其中 `Master P1-P5` 的 Temporal provider 技术细化：provider skeleton、Codex stage activity、human-gate signal/query、visibility、domain soak 和 Hermes downgrade。跨仓定位、执行语言、依赖取舍、domain-agent 边界和旧面退役纪律以总入口为准。

## 结论

OPL family runtime 的生产在线架构已经从 Hermes-first online substrate 校准为 Temporal-backed production runtime。`temporal` 是 production online OPL 的必需 substrate，不是可选候选；它应像 `Codex CLI` 一样被安装、检测、修复、监控和持续维护。

Temporal 负责 durable execution：workflow history、activity retry/timeout、signal/query、heartbeat、workflow replay 和长期 attempt recovery。OPL 负责 provider abstraction、stage attempt ledger、typed family queue、human gate transport、dead-letter、observability 与 domain handoff。`Codex CLI` 仍是 stage 内默认 concrete executor。MAS/MAG/RCA 继续持有 domain truth、quality gate、artifact/package/submission/publication/deliverable authority。

Hermes-Agent 的新定位是：显式非 provider executor/proof diagnostic、Codex CLI 备线评估材料或历史 provenance。Temporal provider 是生产在线路径的必需底座；Hermes 不再作为目标 session/wakeup substrate，也不再作为 active provider compatibility interface；local provider 只作为 dev/CI/offline diagnostic baseline。

2026-05-12 closeout：Temporal provider 的 repo code path、worker lifecycle contract、CLI start/query/signal、typed closeout ingestion、fail-closed readiness、repo-native Temporal live residency proof 和 Agent Executor Adapter 接入链路已经落地。2026-05-13 fresh closeout 进一步证明本机 managed Temporal service / worker 当前 ready，显式 Temporal provider view 为 `full_online_ready=true`、`durable_online_ready=true`，`opl family-runtime residency proof --provider temporal --production` 返回 `production_residency_proven`，并把 proof receipt 写入 runtime event ledger；`framework production-closeout` 可读到 `provider_continuous_proof.continuous_proof_status=all_observed_proofs_proven`，`runtime snapshot` 已把 provider proof 投到 operator attention/recent item。剩余验收集中在周期性长时 residency / SLO、真实 domain stage activity soak、provider-hosted guarded apply 和真实 cost/progress 校准。

## 顶层设计

```text
User / Codex App / OPL GUI / CLI
  -> OPL stage control plane
  -> family runtime provider abstraction
      -> local_sqlite provider (dev/CI/offline diagnostic)
      -> temporal provider (production required)
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

## 开发优先级

### P0. Provider Abstraction Freeze

状态：已落地到可用机器面。

交付：

- 已冻结 provider 枚举：`local_sqlite`、`temporal`，其中 `temporal` 是 production required provider，`local_sqlite` 只服务 dev/CI/offline diagnostic baseline。`hermes_legacy` 已退役为非法 provider selection，旧配置必须 fail-closed。
- 已统一 provider readiness、attempt status、receipt 与 dead-letter 字段；Temporal provider code 与 repo-native live residency proof 已落地；`opl family-runtime service start|status|stop --provider temporal` 已作为本机托管 Temporal service lifecycle 入口落地，`opl family-runtime residency proof --provider temporal --production` 可消费本机 managed service + worker state。未配置、服务不可达、launcher 缺失、worker 未 ready 或 worker transport probe 失败时均 fail-closed；2026-05-13 fresh 本机 managed service/worker 已 ready 且 production proof 已通过。真实 MAS domain soak 仍属 P2 后续证据。
- `OPL Runtime Manager` 与 `opl family-runtime` 文案和输出已改为 provider-backed 口径。
- `opl family-runtime attempt create|list|inspect` 已可写入 / 读取 SQLite stage attempt ledger。

验收：

- 已通过 focused CLI / contract tests 验证 local 路径能作为 `local_sqlite` provider 被识别，并验证 `hermes_legacy` provider selection fail-closed。
- 活跃合同不再把 Hermes 写成未来目标唯一 substrate；历史文档只保留 supersede 语境。
- Direct Codex skill path 不受 provider abstraction 影响。

### P1. Temporal Stage Workflow Core

状态：已落地到 repo/test 可用实现，并补齐本机托管 production proof 入口。OPL 已引入 Temporal TypeScript SDK，新增真实 `StageAttemptWorkflow`、Codex / domain sidecar activity、human gate / user instruction / resume signal、stage attempt query、CLI `attempt start/query/signal`、worker helper、worker lifecycle contract 和本机 Temporal service lifecycle。缺少 Temporal 地址且没有 managed local service state 时 CLI 明确 fail-closed 为 production required dependency blocker；provider readiness 需要 Temporal service 可达与 worker ready 信号同时存在。2026-05-12 已补齐 worker resident state re-query / restart already-ready / stop 后 worker-not-ready 的直接 proof test，Codex live runner timeout / checkpoint heartbeat / process output summary proof test，`opl family-runtime residency proof --provider temporal --live` 的 Temporal test server + real worker code-path proof，`service start|status|stop` 本机托管入口，以及 `--production` 对本机 managed service / managed worker 的 fail-closed 验收入口。2026-05-13 fresh 本机 managed service/worker 当前 ready，显式 Temporal provider view full/durable ready，production proof 返回 `production_residency_proven`。尚未完成的是把 production service 长时托管真实 MAS paper line、真实 activity retry 运行证据和 MAS 真实 paper line 的 provider-hosted guarded apply soak。

交付：

- 已完成：`StageAttemptWorkflow` 输入 domain/stage/workspace/source fingerprint，输出 provider state / attempt receipt，并保留 provider completion 与 domain ready verdict 边界。
- 已完成：`CodexStageActivity` 与 `DomainSidecarDispatchActivity` 作为 Temporal activity，记录 checkpoint / closeout refs、consumed refs、consumed memory refs、writeback receipt refs、rejected writes、route impact 和 authority boundary。
- 已完成：`HumanGateSignal`、`UserInstructionSignal`、`ResumeSignal` 进入同一 workflow signal surface。
- 已完成：`StageAttemptQuery` 返回 attempt status、freshness、next owner、blocked reason、refs。
- 已完成：Codex activity runner 的 repo/test harness，覆盖 `dry_run`、`live_dry_run` 与 `codex_cli` process supervision、stdout summary、timeout、checkpoint heartbeat 和 typed closeout completion gate。
- 已完成：repo-native Temporal live residency proof 可启动 Temporal test server 与真实 worker，跑通 completed attempt、human/user/resume signals、worker restart 后 re-query、missing-closeout blocked 和 domain-truth boundary。
- 已完成：本机 production service 入口 `opl family-runtime service start|status|stop --provider temporal`；默认优先使用 PATH 上的 `temporal server start-dev`，也可用 `OPL_TEMPORAL_SERVICE_START_COMMAND` 显式指定 launcher。service state 写入 OPL family-runtime state root，worker 与 production proof 可在没有额外 `OPL_TEMPORAL_ADDRESS` 的情况下消费 managed local service address。
- 已完成：production proof 入口 `opl family-runtime residency proof --provider temporal --production`；它只使用配置好的 Temporal service / managed worker，未配置、不可达、launcher 缺失、worker 未 ready 或 worker transport probe 失败时返回 typed platform blocker、operator repair action、runtime snapshot 和 blocked proof receipt，配置完成后证明 completed / blocked attempt、signal history、restart re-query、typed-closeout required 和 authority boundary。
- 已完成：2026-05-13 fresh production proof 在本机 managed Temporal service / worker 上返回 `production_residency_proven`；checks 覆盖 service reachable、worker ready、completed attempt、restart re-query、signal history、typed closeout required、missing closeout blocked、retry/dead-letter boundary 和 domain-truth boundary。
- 待完成：真实长时 domain activity soak、domain sidecar live dispatch、生产 retry/dead-letter 运行证据，以及 token/cost/progress 观测校准。

验收：

- 已通过 repo focused tests 证明 Temporal workflow/activity/signal/query contract 可执行。
- Workflow 不写 MAS/MAG/RCA truth，只写 OPL attempt ledger / provider receipt。
- Activity 幂等键和 source fingerprint 可阻止重复启动同一 intent；生产环境还需通过真实 worker / domain soak 复核。

### P2. MAS Paper-Line Pilot

状态：read-only pilot proof 已落地，production provider-hosted guarded apply 未完成。2026-05-12 fresh MAS closeout projection 覆盖 DM002、DM003、Obesity 三篇真实 paper line：DM002 为 `ai_reviewer_re_eval`，DM003 与 Obesity 为 `artifact_delta`，三篇均 `writes_performed=false`。DM002 同时显示 publication-route memory consumed ref 和 MAS-owned writeback receipt refs。该证据证明 MAS 可以给 OPL 提供 typed closeout / owner refs；它不等于 Temporal worker 已长驻，也不等于 Codex activity 已在生产 provider 中完成 guarded apply。

交付：

- 当前优先级从“三仓泛化证明”收敛为 MAS real paper line。MAG/RCA 已完成 OPL task-bound sidecar receipt / no-regression evidence ref ingestion；grant/visual long soak 与 domain owner receipt 仍后移，但 descriptor/index 不得退化。
- 已用 DM002、DM003、Obesity 三篇 active paper line 做 read-only closeout projection，并用 DM002 guarded apply 跑出 OPL-ingestable `blocked_no_mas_owner_apply_receipt` typed closeout；下一步只在 MAS owner gate 允许时继续 provider-hosted guarded apply owner chain。
- 将 `stage_knowledge_packet -> Codex activity -> stage_memory_closeout_packet -> router receipt -> progress delta / human gate / stop-loss` 作为 provider attempt trace 展示。
- 失败时落到 typed blocker、dead-letter 或 human gate，不伪造阳性结论。

验收：

- Read-only 验收已满足：三篇真实 paper line 至少各有一个 OPL-ingestable typed closeout packet，指向 MAS-owned evidence refs；可接受结果包括 artifact delta、publication gate replay、AI reviewer update、route decision、human gate、stop-loss 或 typed blocker。
- Read-only memory proof 已满足：至少一篇 paper line 证明 publication-route memory 被 stage entry 消费，并由 MAS router 产出 accepted/rejected writeback receipt ref。
- Production 验收仍待完成：真实 MAS provider-hosted attempt 需要留下 workflow/activity query、MAS sidecar dispatch receipt、typed closeout、MAS owner receipt、progress delta / human gate / stop-loss / typed blocker，以及 no-forbidden-write proof。
- MAS `publication_eval`、`controller_decisions`、`current_package` 等 truth surface 仍只由 MAS owner 写。

### P3. MAG/RCA Controlled Attempts

状态：task-bound ingestion 已落地，long soak 仍后移。OPL 已把显式 provider-hosted MAG guarded-run task 和 RCA `emit_no_regression_evidence` task 写入 stage attempt ledger，并 ingest MAG sidecar receipt refs / RCA no-regression evidence refs；这证明 OPL provider-hosted attempt bridge 可跨 grant / visual domain 运转。它仍不等于 MAG grant-stage owner receipt、RCA artifact-producing owner receipt、grant/visual quality verdict 或长时 controlled soak 已完成。

交付：

- MAG：已用 guarded-run sidecar task 做 task-bound receipt ingestion；后续仍需 grant stage pack 产出 domain owner receipt、typed blocker 或 no-regression evidence。
- RCA：已用 `emit_no_regression_evidence` sidecar task 做 task-bound no-regression evidence ingestion；后续仍需 visual stage pack 产出 artifact-producing owner receipt、typed blocker 或 long-run no-regression evidence。
- 两者都走同一 provider abstraction 与 stage attempt ledger，OPL 只保存 refs / receipts / blockers，不写 grant 或 visual truth。

验收：

- OPL 能显示 stage attempt、human gate、artifact refs、receipt refs、no-regression refs 与 next owner。
- MAG/RCA 质量与导出 verdict 仍回到各自 domain gate。

### P4. Visibility And Operator Console

状态：部分落地。CLI 已显示 provider kind、attempt id、stage attempt summary、task-bound attempt refs；`opl runtime snapshot --json` 已输出 `stage_attempt_workbench`，并从该 workbench 派生 `opl:stage-attempt:<id>` operator item，可展示 provider run/activity/heartbeat、controlled apply refs、artifact locator / restore proof、closeout refs、consumed refs、consumed memory refs、writeback receipt refs、rejected writes、route impact、human gate/user instruction/resume signals 和 dead-letter。Aion Runtime Attempt Workbench 已消费该只读投影，并已通过白名单 bridge 支持 provider-level human gate / resume / dead-letter repair signal。Temporal worker/domain 代码路径已由 live residency proof 覆盖；仍待完成的是真实 MAS domain soak 与真实 domain owner receipt / artifact mutation receipt 证据。

交付：

- OPL App / CLI 显示 provider kind、attempt id、workflow status、activity status、signal history、query freshness、controlled apply refs、artifact locator / restore proof、closeout/consumed memory/rejected writeback refs、dead-letter reason。
- 对 Hermes/local/Temporal provider 使用同一投影结构。
- 对 domain truth 只显示 source refs，不复制 truth。

验收：

- Operator 能判断当前卡在 provider、Codex activity、domain gate、human gate 还是 artifact/package downstream。
- UI wording 不把 Temporal history 写成 domain quality verdict。

### P5. Hermes Retirement / Downgrade

状态：OPL 侧 operator closeout 已从保留兼容面转为 active interface 退役。当前默认执行语义保持 `Codex-default executor -> explicit OPL activation -> provider-backed stage runtime when durable orchestration is needed -> selected domain-agent entry`。默认用户入口、当前 roadmap、active public surface 和 operator-facing guidance 不再把 Hermes/Gateway/frontdoor/local-manager/default-compat 写成默认 runtime、默认 executor、Full readiness blocker、provider compatibility interface 或 domain owner。生产 runtime core 与 provider 实现只保留 `local_sqlite | temporal`；旧实现面只能作为 history/provenance/diagnostic source ref 或负向 guard 存在。

交付：

- Hermes-first 文档、contracts、install/readiness 文案从 active provider 面删除。
- Hermes executor proof 与 diagnostic module 只留在显式非 provider lane。
- Full readiness 目标从 Hermes readiness 转为 Temporal provider readiness，Temporal 是 production required provider。
- Active-path residue scan 覆盖 public docs、active docs、runtime-substrate / operator-governance references 和 CLI root help，防止默认路径重新出现 Hermes/Gateway/frontdoor/local-manager wording。

验收：

- 默认新投入不再新增 Hermes-first session/wakeup 功能。
- 需要 Hermes 的功能必须标为 explicit executor/proof/diagnostic 或 history/provenance，并不得进入 provider abstraction。
- 清理旧 alias、旧 vocabulary 和过时 docs，避免二次污染。

## 退役方案

应退役或降级：

- 退役 Hermes-first default online substrate wording。
- 把 Hermes gateway readiness 写成 Full OPL 未来唯一 readiness 的文案。
- 把 Hermes session/memory/scheduler 当作 OPL 未来 domain runtime owner 的解释。
- 任何绕过 stage output / domain closeout 直接生成 winning path、quality verdict 或 artifact authority 的旧机械分流。

保留但降级：

- Hermes executor/proof lane：用于评估非 Codex executor 或 structured agent loop。
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
