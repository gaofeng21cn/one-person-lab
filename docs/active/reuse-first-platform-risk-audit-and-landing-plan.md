# OPL 复用优先平台风险审计与落地计划

Owner: `One Person Lab`
Purpose: `reuse_first_platform_risk_audit_and_landing_plan`
State: `active_support`
Machine boundary: 本文是人读审计、理想态标准和落地计划。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App evidence 和各 domain repo owner surface。本文不声明 release-ready、production-ready、domain ready、owner acceptance、Brand L5 或 physical delete authorized。

## 当前结论

OPL family 现在最大的复用风险不是“缺少外部 agent framework”，而是通用平台能力已经在多个层面出现自研过厚的趋势：queue / attempt / scheduler / SQLite ledger、schema/CLI parsing、managed update、workspace/pack transport、App/Aion local consumer surface，以及 domain repo 里的默认 caller / private wrapper 尾巴，都有继续演化成第二套平台的风险。

理想方向不是用某个外部 agent framework 替换 OPL，也不是把 MAS/MAG/RCA 的 domain truth 上收到 OPL；而是把 OPL 收敛成 `Temporal-first durable runtime + Kubernetes-style reconciler + schema-first boundary + standard CLI/parser + OCI/content-addressed package + OpenTelemetry-style telemetry + Backstage-like catalog descriptors`。OPL 保留 authority model、stage/owner/receipt/typed blocker 语义和 domain boundary，成熟工程模块承担通用基础能力。

本轮按复用优先原则给出的是结构风险审计和一步到位计划；代码级替换尚未执行。后续真正落地时必须按本文的 phase 顺序开隔离 lanes，逐步替换 active caller，并用 source/contract/CLI/runtime evidence 关闭每个风险项。

## 审计边界

本轮审计输入：

- OPL root 当前 docs/source/package 读面：`package.json` 只依赖 Temporal SDK 与 TypeScript；`src/modules/runway` 有 240 个文件，`src/modules/connect` 57 个，`src/modules/workspace` 19 个，`src/modules/pack` 21 个。
- OPL source 风险信号：`src/modules/runway/family-runtime-store.ts` 自持 `tasks/events/notifications/queue_holds` SQLite 表、attempts、lease、dead-letter、scheduler dir；`src/modules/connect/managed-update-kernel.ts` 同时覆盖 `status/check/plan/apply/repair/rollback` 和多类 provider。
- OPL hand-written boundary 信号：`isRecord`、`optionalString`、`parseArgs`、`JSON.parse` 直接匹配有数千处命中；这不是缺陷计数，但说明 schema/CLI/readback 边界已经高度分散。
- OPL family docs/contracts 读面：Temporal 是 production online runtime 必需 substrate；local provider 只能是 dev/CI/offline diagnostic baseline；Runway 目标态已经写成 Temporal durable substrate、worker supervisor 保 liveness、scheduler 只给 cadence、Progress Reconciler 负责 desired/current safe action。
- domain repo 读面：MAS generic runtime 已从 domain repo 退役但 live runtime readiness 仍是后置；MAG/RCA/OMA/BookForge 仍有 default-caller、product/status/workbench/session/helper 等迁移尾巴；ScholarSkills 是 refs-only capability package，不是 domain truth 或 runtime authority。
- App/Aion 读面：App release channel 只持 app binary；module/runtime updates 归 managed update plane；Aion managed update maintenance 是前端 consumer/scheduler/read-model，不应成为 truth source。

外部经验只使用成熟项目的一手文档作为参考，不把外部项目的产品模型直接搬进 OPL：

- Temporal Task Queues / retries / tasks / event history: [Task Queues](https://docs.temporal.io/task-queue), [Tasks](https://docs.temporal.io/tasks), [Retry Policies](https://docs.temporal.io/encyclopedia/retry-policies), [Temporal SDKs and Event History](https://docs.temporal.io/encyclopedia/temporal-sdks)
- Kubernetes controller / operator / spec-status pattern: [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/), [Operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/), [Custom resources status subresource](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/), [Extending Kubernetes](https://kubernetes.io/docs/concepts/extend-kubernetes/)
- Schema validation: [Zod](https://zod.dev/), [Zod JSON Schema](https://zod.dev/json-schema), [Ajv getting started](https://ajv.js.org/guide/getting-started.html), [Ajv schema management](https://ajv.js.org/guide/managing-schemas.html)
- CLI parser: [Commander](https://www.npmjs.com/package/commander), [Yargs](https://yargs.js.org/)
- Catalog / ownership descriptors: [Backstage descriptor format](https://backstage.io/docs/features/software-catalog/descriptor-format/), [Backstage catalog graph](https://backstage.io/docs/features/software-catalog/creating-the-catalog-graph/)
- Package/artifact distribution: [OCI image manifest](https://specs.opencontainers.org/image-spec/manifest/), [OCI descriptor](https://specs.opencontainers.org/image-spec/descriptor/), [OCI distribution spec](https://specs.opencontainers.org/distribution-spec/?v=v1.0.0)
- Observability: [OpenTelemetry docs](https://opentelemetry.io/docs/), [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/), [OpenTelemetry overview](https://opentelemetry.io/docs/specs/otel/overview/)

## 风险清单

| Priority | 风险点 | 当前信号 | 影响 | 优化方向 |
| --- | --- | --- | --- | --- |
| P0 | domain repo 私有通用平台尾巴 | MAG/RCA/OMA/BookForge 仍有 default-caller、product/status/helper、session/workbench 或 materializer tail；MAS 已有 generic runtime retirement 但 live readiness partial。 | 每个 domain 都可能维护自己的 scheduler/runner/status/workbench，OPL primitive 无法成为统一基座。 | domain repo 只保留 declarative pack、domain authority functions、quality verdict、artifact authority 和 owner receipt signer；generic runtime、workspace、queue、session、workbench、update、observability 全回 OPL hosted/generated surface。 |
| P1 | Runway queue/attempt/scheduler/SQLite 与 Temporal 重叠 | `family-runtime-store.ts` 自持 queue table、attempts、lease、dead-letter、scheduler dir；Temporal 已是必需 production substrate。 | 两套 retry/dead-letter/lease/currentness 语义并存，后续故障会难以判断是 Temporal truth、SQLite projection 还是 custom scheduler truth。 | Temporal 持有 durable workflow history、task queue、activity retry、schedule；OPL SQLite 只保留 append-only authority refs、projection/cache 和 audit drilldown。 |
| P1 | hand-written schema/readback/CLI parsing 分散 | `isRecord`、`optionalString`、`JSON.parse`、`parseArgs` 在 source/tests 中大量重复。 | trust boundary 不一致，错误信息和 schema 漂移难治理，CLI 参数行为难以统一。 | 选择 Zod 或 Ajv 作为 OPL boundary schema 层；CLI 采用 Commander/Yargs 或一个极薄中央 parser adapter；schema、JSON Schema、CLI help/readback 从单一 command/schema registry 派生。 |
| P1 | Managed update kernel 变成私有 package/update manager | `managed-update-kernel.ts` 同时覆盖 app binary、runtime substrate、capability packages、codex surface、companion tools、workflow profile 的 status/check/plan/apply/repair/rollback。 | OPL 容易自研安装器、包管理器、更新器、repair orchestrator；App/Aion 也容易消费或复制本地 truth。 | 拆成四层：标准 app updater truth、OCI/content-addressed capability package channel、runtime substrate doctor/materializer、receipt/projection read model；OPL 不自研完整包管理器。 |
| P2 | Workspace/Pack 自定义 transport/index 过厚 | `workspace`、`pack` 有独立 descriptor、cache、distribution、registry、lock、validate、lifecycle surface。 | 长期可能复刻 OCI、catalog、package lock、artifact store 和 workspace inventory；跨机器复现成本高。 | Pack 采用 declarative descriptor + OCI/content-addressed artifact + lockfile；Workspace 只做 generated projection、lifecycle shell、refs-only provenance。 |
| P2 | App/Aion consumer surface 可能反向定义 truth | App release channel、Aion local scheduler/read-model 与 managed update plane 并存。 | 产品入口可能显示“可操作状态”，但 truth 不在 OPL/App owner surface，造成 release/currentness 漂移。 | App/Aion 只消费 OPL/App contract/read-model 和 receipt；本地 scheduler 只能触发 refresh，不得成为 update/runtime truth。 |
| P2 | external executor adapter 过度扩张 | Hermes/Claude/Antigravity 可作为 adapter，但不得成为 provider/readiness/default executor。 | 容易为了兼容外部 executor 重新发明 provider kernel 或弱化 Codex-first closeout gate。 | adapter registry 只声明 explicit executor binding、capability、receipt shape 和 fail-closed 规则；不 fork/vendor 外部 runtime kernel。 |
| P2 | Observability 自定义 ledger 越来越多 | OPL runtime ledger、App drilldown、evidence ledgers、attempt lists 都承担观测职责。 | trace、metric、log、event、receipt 混杂，难以接入现有 observability 工具和 operator workflow。 | 采用 OpenTelemetry-style signal model：trace/span 表示 stage/attempt/reconcile path，metric 表示 queue/latency/error rate，log/event 表示 authority/event refs；ledger 只保留 authority refs 与审计索引。 |

## 外部经验吸收

Temporal 给 OPL 的结论：不要把 durable execution、task queue、activity retry、event history 和 schedule 再手搓一遍。OPL 应把 stage attempt、provider worker、retry/dead-letter 和 schedule cadence 映射到 Temporal workflow/activity/task queue/schedule；SQLite 只保存 OPL authority event refs、projection、operator drilldown 和可恢复审计索引。

Kubernetes 给 OPL 的结论：OPL Runway 应像 controller 一样只做 desired/current reconciliation。Domain owner route、stage manifest、receipt/typed blocker/human gate 是 desired/source refs；provider attempt、Temporal history、ledger projection、App read model 是 observed/current refs；reconciler 输出唯一 next safe action、owner wait、human gate 或 runtime blocker。不要让 scheduler、worker、App 或 domain helper 直接改变 current pointer。

Zod/Ajv 给 OPL 的结论：trust boundary 必须 schema-first。对 TypeScript 内部开发者体验，Zod 更适合 `schema -> inferred type -> JSON Schema`；对 machine-readable contract 和大量 JSON Schema 运行时验证，Ajv 更适合 `JSON Schema -> compiled validator cache`。理想方案是二选一作为主入口，另一个只作为生成/兼容 lane，不允许每个模块继续写自己的 `isRecord`/`optionalString`。

Commander/Yargs 给 OPL 的结论：CLI 不应继续靠分散 `process.argv` 和 ad-hoc parser。OPL 需要一个 command registry：command name、options、schema、help、JSON output shape、authority boundary 和 verification refs 绑定在一起；parser 库负责参数解析和 help，OPL 负责命令语义与 authority。

OCI 给 OPL 的结论：capability package、domain pack、native helper prebuild、plugin/skill bundle 应尽量转成 content-addressed artifacts、descriptor、manifest、digest、lock 和 distribution channel。OPL 不应维护第二套包格式和 cache 语义；需要的只是 OPL-specific descriptor media type、receipt 和 policy。

Backstage 给 OPL 的结论：catalog 可以借鉴 `entity descriptor + owner + lifecycle + relations + graph`，但只作为 inventory/projection。OPL family catalog 不持 domain truth，不签 quality verdict，也不替代 App/domain/release owner。

OpenTelemetry 给 OPL 的结论：可观测性不要继续扩张成多个私有 ledger UI。StageRun、attempt、route reconcile、provider worker、App action、package update 和 owner handoff 都应映射成一致的 trace/metric/log/event vocabulary；ledger 保持 refs-only authority surface，collector/exporter 负责外部观测。

## 理想目标态

理想态不受当前实现分布限制：

1. `Runway`
   - Temporal 是唯一 production durable execution substrate。
   - Worker supervisor 只保 worker process liveness。
   - Scheduler 只制造 reconcile cadence，不消费 domain truth，不写 terminal state。
   - Progress Reconciler 对 desired owner route 与 observed runtime state 做 idempotent reconciliation。
   - SQLite/ledger 只保 authority refs、projection、audit drilldown，不再自持 queue truth。

2. `StageRun / Authority`
   - Stage current pointer、terminal state、`current_owner_delta` 只能从 OPL append-only authority event log 派生。
   - Provider completion、test pass、file existence、projection clean 都不能关闭 stage。
   - owner receipt、typed blocker、human gate、route-back ref 是关闭或推进的唯一语义输入。

3. `Schema / Contract`
   - 所有外部输入、contract JSON、readback JSON、CLI JSON output、receipt、descriptor、pack manifest 和 App payload 都有单一 schema owner。
   - 手写 `isRecord`/`optionalString` 只允许在极小内部 helper 中存在；新增 trust boundary 必须走 schema registry。
   - schema 生成 TypeScript type、JSON Schema、CLI output validator 和 docs fragment。

4. `CLI / API`
   - `opl` command tree 从 command registry 派生。
   - parser 库负责 options/help/errors；OPL command handler 只处理业务语义和 authority boundary。
   - JSON output shape 由 schema 验证；tests 验证 machine payload，不固定 prose 文案。

5. `Pack / Connect`
   - Pack 是 declarative descriptor、content-addressed artifact、lockfile 和 distribution policy。
   - Connect 是 adapter registry / discovery / sync surface，不是更新系统和第二 package manager。
   - Skill/plugin/native helper/domain pack 统一走 descriptor + digest + receipt。

6. `Workspace`
   - Workspace 是 `Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker` 的 generated projection 和 lifecycle shell。
   - Workspace 不持 domain truth、artifact authority、quality verdict、memory body 或 package/export readiness。
   - workspace validate/doctor 输出 repairable finding、hard blocker、owner route，而不是用 heuristic 自动补真相。

7. `App / Aion`
   - App 是 ordinary user/operator cockpit，消费 OPL/App/domain owner truth。
   - Aion shell 是 adapter/consumer，不维护 settings/update/runtime policy。
   - App release、installer、runtime substrate、capability package、developer checkout override 都有明确 owner 和 receipt。

8. `Domain agents`
   - MAS/MAG/RCA/OMA/BookForge 是 `Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`。
   - Domain repo 保留 domain truth、quality verdict、artifact authority、memory accept/reject、owner receipt signer。
   - Domain repo 不保留私有 scheduler、queue、attempt ledger、workspace lifecycle、session store、status sidecar、generic workbench 或 package/update manager。

## 一步到位落地计划

### Phase 0: Reuse-first gate 与 inventory freeze

目标：先把“能复用就不手搓”变成 repo 可执行治理规则，而不是口号。

动作：

- 建立 `reuse-first decision gate`：新增通用 runtime/schema/CLI/update/package/workspace/observability 代码前，必须列出成熟模块候选、采用/拒绝原因、license/maintenance/security/API fit、OPL authority boundary。
- 为现有 `runway/connect/workspace/pack/console/domain tails` 建立 machine-readable inventory 或 structured doc map：surface、owner、active caller、可替代成熟模块、retirement gate、verification command。
- 只允许三类自研例外：OPL authority model 独有；成熟模块无法覆盖且写明 gap；成熟模块引入成本高于极薄 native helper。

完成门：新增规则进核心维护面或 contract/support doc；扫描命令能列出 reuse-first worklist；没有把 docs 写成 ready claim。

### Phase 1: Schema boundary consolidation

目标：消除分散 hand-written validator。

动作：

- 选择主 schema engine：优先建议 `Zod primary + JSON Schema export`，因为 OPL 是 TypeScript-first 控制面；若 contracts 已强依赖 JSON Schema，则采用 `Ajv primary + generated TS types`。
- 建立 `src/modules/*/schemas` 或 `src/kernel/schema-registry`，每个 external JSON boundary 必须注册 schema id、owner、machine output shape、error vocabulary。
- 把高风险入口先迁移：runtime receipts、stage closeout packet、managed update receipt、pack descriptor、workspace projection、CLI JSON output。
- 清理同义 helper：保留一个 internal JSON helper；禁止模块私有 `isRecord`/`optionalString` 重复增长。

完成门：新增/修改 JSON boundary 必须 schema validated；focused tests 覆盖 valid/invalid payload；`rg` 扫描不再出现新增分散 validator。

### Phase 2: CLI parser and command registry

目标：让 `opl` command tree 从一个注册表派生，而不是每条命令手写 parser。

动作：

- 选 Commander 或 Yargs；建议先用 Commander，因当前 OPL CLI 更像 command/options/help tree，不需要重型 interactive parser。
- 建立 command registry：command id、aliases、options schema、JSON output schema、authority boundary、handler、help metadata。
- 每个 handler 接收 typed options，不再直接读 `process.argv`。
- CLI tests 只断言 command schema、JSON output、exit code 和 authority boundary，不固定 help prose。

完成门：top 20 高使用命令迁入 registry；新增命令无法绕过 registry；legacy parser 有 tombstone/retirement gate。

### Phase 3: Runway Temporal-first redesign

目标：把当前自研 queue/attempt/scheduler 降级为 Temporal projection/audit，不再与 Temporal 竞争 truth。

动作：

- 定义 `StageRunWorkflow`、`StageAttemptActivity`、`ReconcileWorkflow`、`HumanGateSignal`、`OwnerReceiptSignal`。
- Temporal Task Queue 按 domain/runtime lane 分组，priority/rate 只用 Temporal 或 worker-level policy 表达。
- Activity retry/dead-letter 走 Temporal retry policy；OPL dead-letter 只记录 authority ref 和 operator projection。
- SQLite `tasks` 表拆为 projection/cache；attempt lease 与 running truth 以 Temporal workflow/activity history 为准。
- scheduler 只触发 reconcile schedule；不直接 enqueue domain work 或写 terminal state。

完成门：Temporal provider configured 时，stage attempt lifecycle 可从 Temporal history + OPL authority event 重建；local provider 只保 dev/CI/offline diagnostic；old queue mutation path no-active-caller。

### Phase 4: Kubernetes-style Reconciler split

目标：把 scheduler、worker、App、domain helper 的动作统一收到 desired/current reconciliation。

动作：

- 定义 desired spec：domain owner route refs、stage manifest refs、workspace/artifact scope refs、policy refs、human gate refs。
- 定义 observed status：Temporal workflow status、provider worker status、ledger projection、receipt/blocker refs、App read model。
- Reconciler 只输出四类结果：next safe action、wait owner/human gate、runtime repair action、typed blocker/route-back required。
- 所有 mutation 都要 idempotency key、generation、source fingerprint、owner boundary。

完成门：`opl runway reconcile --json` 是唯一 safe-action source；scheduler/worker/status commands 只能 read/projection；App 默认只消费 current_owner_delta。

### Phase 5: Managed update split

目标：避免 OPL 自研全能 updater/package manager。

动作：

- App binary 更新归 App release/updater owner。
- Runtime substrate 归 system doctor/materializer：只检查 Codex CLI、Temporal service、worker supervisor、native helper、toolchain。
- Capability packages 走 OCI/content-addressed descriptors、digest、lock 和 registry/cache。
- Codex surface / companion tools / workflow profile 走 Connect sync + receipt，不承担 package truth。
- `managed-update-kernel` 拆成 adapter registry、plan model、receipt projection 和 owner-specific executor。

完成门：每个 component 有单一 owner；`status/check/plan/apply/repair/rollback` 不再由一个 kernel 同时决定所有组件 truth；App/Aion consumer 只读 receipt/projection。

### Phase 6: Pack / Workspace standardization

目标：减少自研 transport、cache、distribution 和 workspace inventory。

动作：

- Pack descriptor 引入 OCI media type、digest、manifest、lockfile、artifact layout。
- native helper prebuild、skill/plugin bundle、domain pack、ScholarSkills package 均使用 content address。
- Workspace projection 保持 generated/ref-only；shared resource manifest 不保存 body，只保存 provenance/checksum/ref。
- workspace lifecycle 不关闭 stage，不删除 project root，不签 domain receipt。

完成门：pack install/cache/distribute/lock/validate 都可由 descriptor+digest 复现；workspace validate/doctor 只按 hard blocker/repairable finding 分级。

### Phase 7: Domain private platform retirement

目标：彻底切掉 MAS/MAG/RCA/OMA/BookForge 的通用平台尾巴。

动作：

- 每个 domain repo 出一张 tail matrix：surface、active caller、replacement OPL primitive、authority retained、delete/tombstone gate。
- MAS：防止 generic runtime 回流；live readiness 留后置，不阻塞结构清理。
- MAG/RCA：product/status/user-loop/session/control-plane/lifecycle tail 迁到 OPL hosted/generated surface；domain 只保业务 authority。
- OMA/BookForge：helper/materializer 只保 explicit authority functions 或 build helper，不扩成 private runner/promotion gate。
- ScholarSkills：保持 refs-only capability package，不成为 MAS truth、standard domain agent 或 typed blocker authority。

完成门：`opl agents default-callers --family-defaults --json` 暴露 no-active-caller 或 owner-decision gate；物理删除只在 owner decision、replacement owner、tombstone/provenance 和 no-forbidden-write 齐备后执行。

### Phase 8: App/Aion consumer-only enforcement

目标：App/Aion 不反向定义 runtime/update/settings truth。

动作：

- App settings/control-center 只消费 App-owned contract 与 OPL read/action surface。
- Aion shell local scheduler 只触发 refresh 或 UI maintenance，不写 policy/currentness truth。
- Release channel、installer、developer mode、managed checkout、capability packages 都显示 owner、current source、blocked reason 和 receipt ref。

完成门：App/Aion 无本地 truth-only path；active-shell validator 与 App product contract 对齐；release/currentness claim 必须来自 App owner receipt或 typed blocker。

### Phase 9: OpenTelemetry-style observability

目标：把 ledger/drilldown/attempt/progress/readiness 转成统一观测模型。

动作：

- 定义 OPL semantic conventions：stage_run_id、attempt_id、domain_id、owner_id、route_ref、receipt_ref、typed_blocker_ref、workflow_id、task_queue、generation、source_fingerprint。
- stage/attempt/reconcile/provider/update 走 trace/span；queue length、retry count、dead-letter、latency 走 metrics；authority event 和 owner handoff 走 event/log refs。
- OPL ledger 只保 append-only authority refs 和 audit index；OpenTelemetry Collector 或 exporter 负责外部观测接入。

完成门：operator drilldown 能从 trace/metric/log/event vocabulary 读出同一 current owner delta；不再为每个 plane 新建私有 ledger UI。

### Phase 10: No-resurrection governance

目标：防止被退役的手搓模块重新长回来。

动作：

- 增加 `reuse-first lint`：扫描新增私有 parser、queue、scheduler、schema validator、package manager、workspace transport、observability ledger、domain private runtime。
- CI/report 只作为 advisory 或 hard gate 取决于风险：authority/runtime/update/schema boundary 违规 hard fail；普通重构提示 advisory。
- 每次新增依赖或拒绝依赖都要写入 decision record；每次自研例外有 expiry/review date。

完成门：新增 code review 默认能回答“为什么不用成熟模块”；退役面有 tombstone/no-active-caller scan；history/provenance 不污染 active path。

## 当前完成度与建议顺序

百分比表示相对本文理想态的功能/结构完成度，不是 readiness、release、production 或 owner acceptance。

| 顺序 | 工作项 | 当前完成度 | 状态 | 当前证据 | 下一步 |
| --- | --- | ---: | --- | --- | --- |
| 1 | Reuse-first governance gate | 85% | `partial` | 已落 `contracts/opl-framework/reuse-first-governance.json`、`scripts/reuse-first-scan.mjs`、`npm run reuse-first:scan`、`npm run reuse-first:scan:diff` 与 `./scripts/verify.sh reuse-first`；GitHub Verify 的 lint/structure job 会跑 strict diff gate。 | 继续按后续 phases 消化 full-scan historical findings；不要把 clean diff gate 当作全仓历史风险已清零。 |
| 2 | Schema boundary consolidation | 20% | `partial` | Phase 1 seed lane 已引入 Ajv-backed `src/kernel/schema-registry.ts`；`ProgressDeltaReceipt` 已从局部手写 shape validator 迁到 `contracts/opl-framework/progress-delta-receipt.schema.json` + shared schema registry，并有 valid/invalid focused test 覆盖 false-authority drift。大量 hand-written JSON/readback helper 仍未迁移。 | 继续把 runtime receipts、descriptors、readbacks 逐步接入 schema registry；禁止新增分散 validator。 |
| 3 | CLI parser/command registry | 30% | `partial` | 已落最小 `CommandSpec.registry` 与 `validateCommandRegistryCoverage` adapter，`opl help connect pubmed search --json` 可读出 parser、options、schema ref 与 false-authority boundary。 | 继续把高频 public commands 纳入 registry；只有当 Commander/Yargs 能减少现有 parser 分散度时再引入依赖。 |
| 4 | Runway Temporal-first runtime | 50% | `partial` | Temporal SDK 已是一等依赖，docs 已声明 Temporal production substrate；`family-runtime status/queue list` 已暴露 `queue_lifecycle_boundary`，在 Temporal provider 下若 SQLite 本地 queue lifecycle 与 Temporal 竞争 truth，会降级 readiness。 | 继续把 stage attempt durable lifecycle 从 SQLite mutation path 迁到 Temporal workflow/activity/schedule/history；local provider 保持 dev/CI/offline diagnostic。 |
| 5 | Kubernetes-style reconciler | 55% | `partial` | `family-runtime lifecycle reconcile` 已输出 desired_state / observed_state / reconcile_decision / next_safe_action，mutation 只允许进入 lifecycle apply receipt projection，禁止写 domain truth、artifact body、owner receipt 或 typed blocker。 | 继续把 scheduler/worker/App/domain helper mutation 收到统一 Reconciler safe-action source。 |
| 6 | Managed update split | 50% | `partial` | App release channel 与 managed update plane 边界存在；已增加 `owner_route_contract` 和组件级 `owner_route`，把 app binary / runtime substrate / capability packages 明确路由到 owner/readback/apply owner，并保留 no-package-manager forbidden claims。 | 继续把 runner adapter / receipt projection 按 owner 拆薄。 |
| 7 | Pack/Workspace standardization | 57% | `partial` | pack/workspace CLI 与 descriptors 已存在；Pack OS lock/cache/registry 已增加 OCI descriptor/digest 字段，Workspace shared-resource manifest/inventory 已增加 sha256 content-addressing policy。 | 继续统一 descriptor/digest/lock/cache/distribution，并把 workspace validate/doctor 的 hard blocker/repairable finding 口径收紧。 |
| 8 | Domain private platform retirement | 55% | `partial` | MAS generic runtime 退役较深；MAG/RCA/OMA/BookForge 仍有默认 caller/helper tail。 | Phase 7：逐 repo tail matrix、replacement owner、no-active-caller、delete/tombstone gate。 |
| 9 | App/Aion consumer-only | 60% | `partial` | App/Aion 边界已有合同和 release channel；local scheduler/read-model 仍需 no-truth guard。 | Phase 8：validator/contract 强制 consumer-only。 |
| 10 | OpenTelemetry-style observability | 35% | `partial` | 已落 `contracts/opl-framework/observability-semantic-conventions-contract.json` 与 `src/modules/ledger/observability-semantic-conventions.ts`，把 current owner delta / stage attempt / provider attempt 投影到 trace、metric、log/event vocabulary，且保持 refs-only / no-body / no-ready-claim boundary。 | 继续接入 operator drilldown、exporter/collector strategy 和现有 ledger/readback 消费面。 |
| 11 | No-resurrection scan | 65% | `partial` | `reuse-first-scan` 已支持 strict diff hard/advisory gate，新增 schema/CLI/runtime/update/package 类 hard finding 会失败，observability ledger 类先进入 advisory；CI lint/structure job 已接入 `./scripts/verify.sh reuse-first`。 | 继续为历史 findings 建立采用/拒绝 decision record / expiry，并逐批迁移或标注例外。 |

建议落地顺序是 `0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 7 -> 8 -> 6 -> 9 -> 10`。原因：先把 schema/CLI boundary 收敛，能降低后续 runtime/update/pack 迁移时的 drift；再切 Runway/managed update 这两个最大风险；domain tail 和 App consumer-only 依赖 OPL replacement surface；Pack/Workspace 与 Observability 可并行但不应抢在 authority/runtime 之前。

## Repo-by-repo owner route

| Repo / surface | 理想角色 | 风险判断 | Owner route |
| --- | --- | --- | --- |
| `one-person-lab` | framework runtime、activation、Runway、StageRun、typed queue、schema/CLI/pack/workspace primitives。 | 需要把通用能力从手搓实现收薄到成熟 substrate。 | OPL root lanes 先做 Phase 0-6、9-10。 |
| `one-person-lab-app` | ordinary user/operator cockpit、App release truth、settings/control-center。 | App/Aion 容易把 local scheduler/read-model 当 truth。 | App owner lane 做 consumer-only contract/readback/validator。 |
| `opl-aion-shell` | App/Aion adapter/consumer。 | 不应持 update/runtime/settings truth。 | 只消费 App/OPL contract；local maintenance 降级为 refresh trigger。 |
| `med-autoscience` | MAS domain truth、publication/quality/artifact authority。 | generic runtime 已退役但 live readiness partial；禁止 private runtime 回流。 | MAS lane 只保 domain authority；OPL lane 提供 hosted runtime/projection。 |
| `med-autogrant` | MAG grant truth、verdict、package/memory/receipt authority。 | product/status/user-loop/control-plane/lifecycle tail 需迁出。 | MAG tail matrix + OPL generated surface cutover。 |
| `redcube-ai` | RCA visual truth、quality/export verdict、artifact authority。 | old runtime/DAG/run store 已退役，仍有 route-run/session/product shell tail。 | RCA tail matrix + owner receipt/adapter 边界。 |
| `opl-meta-agent` | target-agent / Foundry Agent domain pack 与 authority functions。 | materializer/helper 不得扩成 private runner/promotion gate。 | Keep helpers explicit；promotion/runtime 走 OPL Agent Lab/Runway。 |
| `opl-bookforge` | book/manuscript domain pack、export authority。 | publication helper 不能演化成自持 runtime/update/workbench。 | OPL hosted surface + BookForge authority function split。 |
| `opl-scholarskills` | refs-only capability package/gallery/judgment helper。 | 不应成为 standard domain agent、MAS truth 或 blocker authority。 | Pack/Connect channel + no-authority guard。 |
| `homebrew-one-person-lab` | downstream distribution。 | 不应成为 App release/update truth。 | 只镜像 App release authority。 |

## Phase 5-6 First-Slice Foldback

Phase 5-6 的第一批收薄已吸收进 `main`，不是 readiness、release、owner acceptance 或完整 platform closeout。

- Managed update：新增 `owner_route_contract` 与组件级 `owner_route`，让 `installation_carrier` 显式走 App/host owner route，`runtime_substrate` 显式走 App-owned runtime materializer，`capability_packages` 显式走 OCI/content-addressed clean managed module channel；所有组件保留 `package_manager_claim=false` 和 forbidden claims，避免把 `opl update` 写成通用包管理器。
- Pack OS：在已有 sha256/content-addressed cache 上补 `descriptor_oci` 与 resource `oci_descriptor`，registry/cache/distribution 继续是 refs-only manifest，不新增 distribution engine 或 package manager。
- Workspace：shared-resource manifest 与 inventory 只增加 sha256 content-addressing policy；仍然 `body_ref=null`、不存 body、不关闭 stage、不写 domain truth。
- Fresh evidence：focused managed-update / Pack OS / workspace projection tests pass，`npm run typecheck` pass，`git diff --check` pass；这只证明 first-slice 行为和类型检查，不证明 release/currentness/owner acceptance。

## Plan Completion Audit

| 审计项 | 状态 | 完成度 | 新鲜证据 | 缺口 | 后续动作 |
| --- | --- | ---: | --- | --- | --- |
| 按实际情况落复用优先审计文档 | `done` | 100% | 本文位于 `docs/active/reuse-first-platform-risk-audit-and-landing-plan.md`，声明 owner/purpose/state/machine boundary。 | 无。 | 由 `docs/active/README.md` 索引为 active_support。 |
| 讲清风险点和优化方向 | `done` | 100% | `风险清单` 覆盖 Runway、schema/CLI、managed update、pack/workspace、App/Aion、domain private tails、observability。 | 代码级风险仍未消除。 | 按 phase 拆 lanes 执行。 |
| 吸收外部成熟工程经验 | `done` | 100% | 已引用 Temporal、Kubernetes、Zod/Ajv、Commander/Yargs、OCI、Backstage、OpenTelemetry 官方/一手文档。 | 未做 benchmark 或 PoC。 | Phase 1-6 中对候选模块做 ADR/PoC。 |
| 给出理想态一步到位计划 | `done` | 100% | `一步到位落地计划` 给出 Phase 0-10、完成门和建议顺序。 | 计划本身已落；目标态实现仍是长期工程。 | 继续按本文完成度表推进剩余 partial / not-started 项。 |
| 当前完成度和建议落地顺序 | `done` | 100% | `当前完成度与建议顺序` 表逐项给出百分比、状态、证据和下一步，已按本轮 first-slice 代码/合同吸收结果更新。 | 百分比是审计判断，不是 runtime/readiness evidence。 | 后续每轮都用 fresh evidence 校准。 |
| 彻底解决所有代码风险 | `partial` | 30% | Phase 0/1/2/5/6/8/9/10 都已有 first-slice 代码或合同托底：schema registry seed、CLI registry seed、Runway lifecycle reconcile/readiness guard、managed update owner routes、Pack/Workspace descriptor/digest、App/Aion consumer-only contract、artifact provenance bundle、observability semantic conventions、reuse-first hard/advisory gate，以及 CI strict diff gate。 | Runway durable lifecycle 仍未完全迁到 Temporal；大量手写 schema/parser/readback helper 未迁移；domain private tail、App release/live evidence、exporter/collector、historical full-scan findings 仍需后续 owner lane。 | 继续按 runtime、schema/CLI 扩面、domain tail、observability exporter 和 historical findings 消化顺序推进；不得把 first-slice 测试绿包装成 production ready。 |

## Forbidden Claims

- 本文不能被引用为 OPL ready、domain ready、App release-ready、production ready、Brand L5、owner acceptance 或 physical delete authorization。
- `Temporal SDK 已安装` 不等于 Temporal-first runtime 已完成；必须看 workflow/activity/schedule/history 是否接管 durable lifecycle。
- `schema plan 已写` 不等于 boundary schema current；必须看 source handler 是否实际使用 schema registry。
- `CLI registry 计划已写` 不等于 command parser 已统一；必须看 commands 是否不再绕过 registry。
- `domain tail matrix 已写` 不等于 private platform 已退役；必须看 active caller、replacement owner、tombstone/provenance 和 no-forbidden-write。
- `App/Aion contract/read-model 存在` 不等于 consumer-only；必须看 local scheduler/update/runtime path 是否无法写 truth。
