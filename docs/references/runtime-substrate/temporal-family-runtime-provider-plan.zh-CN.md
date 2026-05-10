# Temporal Family Runtime Provider 落地计划

Owner: `One Person Lab`
Purpose: `development_plan`
State: `active_support`
Machine boundary: 本文是人工可读开发计划。机器真相必须落在 `contracts/`、source code、CLI/API 行为、runtime ledger 或 domain-owned manifests。
Date: `2026-05-10`

## 结论

OPL family runtime 的生产目标应从 Hermes-first online substrate 调整为 provider-backed runtime，其中 `temporal` 是优先生产候选。

Temporal 负责 durable execution：workflow history、activity retry/timeout、signal/query、heartbeat、workflow replay 和长期 attempt recovery。OPL 负责 provider abstraction、stage attempt ledger、typed family queue、human gate transport、dead-letter、observability 与 domain handoff。`Codex CLI` 仍是 stage 内默认 concrete executor。MAS/MAG/RCA 继续持有 domain truth、quality gate、artifact/package/submission/publication/deliverable authority。

Hermes-Agent 的新定位是：迁移期 `hermes_legacy` provider、显式 executor/proof lane、Codex CLI 备线或可选安装模块。Temporal provider 落地并通过 soak 后，Hermes 不再作为目标 session/wakeup substrate。

## 顶层设计

```text
User / Codex App / OPL GUI / CLI
  -> OPL stage control plane
  -> family runtime provider abstraction
      -> local_sqlite provider (dev/offline)
      -> hermes_legacy provider (migration/proof)
      -> temporal provider (production target)
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
| `progress projection` | Query | OPL App / CLI 读取当前状态、next owner、blocked reason。 |
| `retry/dead-letter` | Retry policy / failure state | Provider 只表达运行失败和重试预算，不解释 domain quality。 |
| `history/replay` | Workflow history | 作为 runtime audit，不替代 domain truth。 |

## 开发优先级

### P0. Provider Abstraction Freeze

状态：已落地到可用机器面。

交付：

- 已冻结 provider 枚举：`local_sqlite`、`hermes_legacy`、`temporal`。
- 已统一 provider readiness、attempt status、receipt 与 dead-letter 字段；Temporal 先以 `skeleton_contract_ready` 暴露，真实 worker 仍属 P1。
- `OPL Runtime Manager` 与 `opl family-runtime` 文案和输出已改为 provider-backed 口径。
- `opl family-runtime attempt create|list|inspect` 已可写入 / 读取 SQLite stage attempt ledger。

验收：

- 已通过 focused CLI / contract tests 验证现有 Hermes/local 路径能作为 `hermes_legacy` 或 `local_sqlite` provider 被识别。
- 活跃合同不再把 Hermes 写成未来目标唯一 substrate；历史文档只保留 supersede 语境。
- Direct Codex skill path 不受 provider abstraction 影响。

### P1. Temporal Stage Workflow Skeleton

状态：未落地。当前只冻结了 Temporal provider contract surface；还没有引入 Temporal SDK、dev server、worker 或 workflow/activity 实现。

交付：

- `StageAttemptWorkflow`：输入 domain/stage/workspace/source fingerprint，输出 attempt receipt。
- `CodexStageActivity`：以 stage packet / handoff envelope 为输入，调用 Codex CLI 或 domain sidecar。
- `HumanGateSignal`、`UserInstructionSignal`、`ResumeSignal`。
- `StageAttemptQuery`：返回 attempt status、freshness、next owner、blocked reason、refs。

验收：

- 本地 Temporal dev server 或 test environment 能跑 fixture workflow。
- Workflow 不写 MAS/MAG/RCA truth，只写 OPL attempt ledger / provider receipt。
- Activity 幂等键和 source fingerprint 可阻止重复启动同一 intent。

### P2. MAS Paper-Line Pilot

交付：

- 选一条 MAS real paper line 做 guarded apply 或 read-only soak。
- 将 `stage_knowledge_packet -> Codex activity -> stage_memory_closeout_packet -> router receipt -> progress delta / human gate / stop-loss` 作为 provider attempt trace 展示。
- 失败时落到 typed blocker、dead-letter 或 human gate，不伪造阳性结论。

验收：

- 至少一条真实 paper line 能在 OPL App / CLI 看见 provider attempt、consumed refs、closeout refs、router receipt、next owner。
- MAS `publication_eval`、`controller_decisions`、`current_package` 等 truth surface 仍只由 MAS owner 写。

### P3. MAG/RCA Controlled Attempts

交付：

- MAG：用 grant stage pack 做 controlled `critique/revision` 或 `package` attempt。
- RCA：用 visual stage pack 做 controlled `review_and_revision` 或 `package_and_handoff` attempt。
- 两者都走同一 provider abstraction 与 stage attempt ledger。

验收：

- OPL 能显示 stage attempt、human gate、artifact refs 与 next owner。
- MAG/RCA 质量与导出 verdict 仍回到各自 domain gate。

### P4. Visibility And Operator Console

状态：部分落地。CLI 已显示 provider kind、attempt id、stage attempt summary、task-bound attempt refs；OPL App / GUI projection 仍待接入同一 ledger。

交付：

- OPL App / CLI 显示 provider kind、attempt id、workflow status、activity status、signal history、query freshness、dead-letter reason。
- 对 Hermes/local/Temporal provider 使用同一投影结构。
- 对 domain truth 只显示 source refs，不复制 truth。

验收：

- Operator 能判断当前卡在 provider、Codex activity、domain gate、human gate 还是 artifact/package downstream。
- UI wording 不把 Temporal history 写成 domain quality verdict。

### P5. Hermes Retirement / Downgrade

交付：

- Hermes-first 文档、contracts、install/readiness 文案改为 `hermes_legacy`。
- Hermes executor proof 与 optional module 留在显式 lane。
- Full readiness 目标从 Hermes readiness 转为 provider readiness，Temporal 是 production provider。

验收：

- 默认新投入不再新增 Hermes-first session/wakeup 功能。
- 需要 Hermes 的功能必须标为 legacy/optional/proof，并能被 provider abstraction 替换。
- 清理旧 alias、旧 vocabulary 和过时 docs，避免二次污染。

## 退役方案

应退役或降级：

- Hermes-first default online substrate wording。
- 把 Hermes gateway readiness 写成 Full OPL 未来唯一 readiness 的文案。
- 把 Hermes session/memory/scheduler 当作 OPL 未来 domain runtime owner 的解释。
- 任何绕过 stage output / domain closeout 直接生成 winning path、quality verdict 或 artifact authority 的旧机械分流。

保留但降级：

- `hermes_legacy` provider：迁移期兼容与回归基线。
- Hermes executor/proof lane：用于评估非 Codex executor 或 structured agent loop。
- Local provider：开发、离线诊断、fixture 和 fail-closed baseline。

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
