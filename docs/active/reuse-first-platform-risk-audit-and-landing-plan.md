# OPL 复用优先平台风险审计与落地计划

Owner: `One Person Lab`
Purpose: `reuse_first_platform_risk_audit_and_landing_plan`
State: `active_support`
Machine boundary: 本文是人读审计、理想态标准和落地计划。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App evidence 和各 domain repo owner surface。本文不声明 release-ready、production-ready、domain ready、owner acceptance、Brand L5 或 physical delete authorized。

## 当前结论

OPL family 现在最大的复用风险不是“缺少外部 agent framework”，而是通用平台能力已经在多个层面出现自研过厚的趋势：queue / attempt / scheduler / SQLite ledger、schema/CLI parsing、managed update、workspace/pack transport、App/Aion local consumer surface，以及 domain repo 里的默认 caller / private wrapper 尾巴，都有继续演化成第二套平台的风险。

理想方向不是用某个外部 agent framework 替换 OPL，也不是把 MAS/MAG/RCA 的 domain truth 上收到 OPL；而是把 OPL 收敛成 `Temporal-first durable runtime + Kubernetes-style reconciler + schema-first boundary + standard CLI/parser + OCI/content-addressed package + OpenTelemetry-style telemetry + Backstage-like catalog descriptors`。OPL 保留 authority model、stage/owner/receipt/typed blocker 语义和 domain boundary，成熟工程模块承担通用基础能力。

本文最初按复用优先原则给出结构风险审计和一步到位计划；截至 2026-07-04，已按该计划并行吸收多批 first-slice 代码 / 合同 / readback / source-boundary lanes 回 `main`。这些切片把 reuse-first gate、schema/CLI boundary、Runway Temporal-first readback 与 live test-server residency proof、reconciler safe action、managed update owner boundary、Pack/Workspace content-addressed policy、domain-tail matrix、App/Aion consumer-only readback、observability semantic conventions、HTTP `/metrics` endpoint、Collector smoke readback、Connect provider receipts、Connect external skill metadata、Connect agent package registry / manifest / lock / receipt readback、Agent Lab self-evolution work orders、Ledger artifact provenance、source-module owner alignment、family action catalog owner、source-ref kernel helper、runtime snapshot provider injection，以及 Charter / Console / managed update / OMA JSON boundary helper 迁移进可执行维护面；但它们仍不是 OPL production ready、domain ready、App release ready、owner acceptance、full historical risk eliminated 或 physical delete authorization。后续真正关闭每个风险项仍必须逐项替换 active caller，并用 source/contract/CLI/runtime/live owner evidence 分账验收。

本轮可复用经验已沉淀为长期政策：[OPL 复用优先治理政策](../policies/reuse-first-governance-policy.md)。本文继续承载当前执行进度、fresh evidence、完成度与剩余 worklist；长期规则、沉淀路线、full scan / strict diff gate 语义和 forbidden ready claims 归该政策与 reuse-first contract / script 守门。

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

当前机器入口：`contracts/opl-framework/domain-private-platform-tail-matrix.json` 已建立 Phase 7 seed matrix，把 MAS / MAG / RCA / OMA / BookForge / ScholarSkills 的 `private_tail_class`、replacement OPL primitive、retained authority、delete/tombstone gate、forbidden claims 和 verification surface 固定为 refs-only readback 输入。该 seed 只关闭“计划不可机器读取”的缺口；不授权 domain repo 物理删除、不声明 owner acceptance，也不替代 fresh `opl agents default-callers --family-defaults --json` / `opl agents conformance --family-defaults --json` 与 domain repo-native readback。

2026-07-03 lane evidence：`opl agents default-callers --family-defaults --json` 已暴露 `domain_private_platform_tail_matrix` readback，逐 domain 投影 `private_tail_class`、replacement OPL primitive、retained authority、delete/tombstone gate、forbidden claims、`physical_delete_authorized=false` 与 `owner_decision_required`；focused verification 为 `node --experimental-strip-types --test tests/src/domain-tail-default-caller-matrix.test.ts tests/src/cli/cases/agents-default-callers.test.ts`、`npm run typecheck`，并用 wrapper CLI 断言 family-defaults JSON 中 `row_count=6`、MAS `owner_decision_required=true`、ScholarSkills `owner_decision_required=false`。该证据仍只证明 OPL 本仓 readback/verification surface 可执行，不构成 domain repo delete、owner acceptance、domain ready 或 production ready。

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

## 2026-07-05 Runtime / Update / Observability 剩余 findings owner-route worklist

本节只把当前 full scan 剩余 blocker 变成可执行 worklist，不改变产品行为、不写 runtime DB/provider queue、不写 domain truth、不生成 owner receipt，也不声明 ready。机器读面为 `contracts/opl-framework/reuse-first-historical-worklist.json` 的 `residual_readback_2026_07_05`；扫描读面为 `node ./scripts/reuse-first-scan.mjs --max-findings 1000` 的 `historical_decision_summary`。

Fresh readback：full scan 当前为 `finding_count=697`、`hard_gate_finding_count=242`、`advisory_finding_count=455`、`open_worklist_finding_count=0`、`blocking_worklist_finding_count=0`；目标三类为 `custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`。`phase4-src-modules-runtime-queue=0`、`phase6-src-modules-update-package=0`、`phase10-src-modules-observability=0`，含义只是 active `src/modules` 已没有被 scanner 归到这三条 migration item 的剩余命中；不等于 Temporal durable lifecycle、App release owner、package owner、OTLP/exporter/live endpoint 或 domain owner acceptance 完成。

| 类别 | 当前剩余 scan hits | 当前判定 | 必须迁移 / owner route | 允许投影边界 | 不得误判为完成 |
| --- | ---: | --- | --- | --- | --- |
| Runtime queue | 147 | 剩余命中为 `allowed_projection_boundary`；active src migration item 已 0。 | `external_temporal_durable_lifecycle` 仍需 OPL Runway Runtime owner 证明：外部 Temporal workflow/history、managed worker、真实 executor closeout、owner/domain refs。 | tests / fixtures / contracts 中的 queue lifecycle、dead-letter、lease、attempt 等历史或投影词汇可保留。 | `phase4-src-modules-runtime-queue=0`、Temporal test server fixture、SQLite projection、strict diff pass 都不能声明 production durable lifecycle ready。 |
| Update / package | 93 | 剩余命中为 `allowed_projection_boundary`；active src migration item 与 owner-routed command projection item 已 0。 | `app_release_owner_route` 与 `capability_package_channel_owner_route` 仍需 App release owner、Managed Update、Pack / Connect owners 给 owner receipt、typed blocker、descriptor/digest/lock/readback。 | contracts / tests / owner-routed command projection 中的 rollback、manifest、digest、package 词汇可保留。 | `phase6-src-modules-update-package=0`、command registry projection、contract provenance 或 strict diff pass 都不能声明 release/currentness ready。 |
| Observability | 455 | 剩余命中为 `allowed_projection_boundary`；active src migration item 已 0。 | `otlp_exporter_live_endpoint` 仍需 OPL Observability owner 证明：OTLP/OpenTelemetry SDK exporter owner lane、live endpoint、external collector consumption、trace/metric/log/event 语义映射。 | CLI diagnostic drilldown、contracts、tests、`scripts/test-lanes.mjs` file catalog 中的 evidence/receipt/attempt/runtime/drilldown 词汇可保留。 | `phase10-src-modules-observability=0`、OpenMetrics smoke endpoint、diagnostic drilldown projection 或 strict diff pass 都不能声明 production observability ready。 |
| Domain tail / owner acceptance | 不属于上述 scan category | 不是 scanner finding closeout；由 domain tail matrix 和 owner route 持有。 | MAS/MAG/RCA/OMA/BookForge/ScholarSkills 仍需 no-active-caller、replacement OPL primitive、tombstone/provenance、owner acceptance / owner decision / typed blocker。 | OPL 本仓 matrix/readback 只能作为 refs-only projection。 | domain tail matrix、full scan decisioned 或 strict diff pass 都不能授权 physical delete、domain ready 或 owner acceptance。 |

后续 closeout 必须同时读两层：

- `reuse-first-scan` 的 `historical_decision_summary`：证明 full-scan findings 是否已被分类，以及 diff gate 是否阻止新增 hard finding。
- `reuse-first-historical-worklist.json#residual_readback_2026_07_05.owner_route_worklist`：证明 Runtime / Update-package / Observability / Domain owner-route 是否仍有 `owner_live_evidence_required`。只要这里仍有 open item，本文整体只能是 `partial`。
- `reuse-first-historical-worklist.json#owner_live_evidence_preflight_2026_07_05`：把 5 个 owner-live-evidence 项逐个落成 missing evidence、合法 owner/command、forbidden completion evidence 和 stop condition。该读面只证明“下一步能接力”，不证明 owner 已接收、ready、release/currentness 或 production。

Owner live evidence preflight 当前为 5/5 open，均不可由 Framework 本仓 scan/docs/tests 关闭：

| Item | Owner | 当前证据 | 缺口 | 合法下一步 |
| --- | --- | --- | --- | --- |
| `external_temporal_durable_lifecycle` | OPL Runway Runtime | 无外部 owner/live evidence；已有 Temporal test-server proof 只证明 code path。 | external Temporal history/query、managed worker、真实 Codex executor closeout、owner/domain refs。 | 在 owner 提供的 external Temporal 环境跑 live residency proof，并由 Runway Runtime owner 给 receipt、typed blocker 或 route-back。 |
| `app_release_owner_route` | OPL Managed Update / App release owner | 无 App release owner receipt。 | release/currentness source ref、managed update receipt 被 App read model 消费。 | 交给 App release authority；Framework projection 不能替代 release truth。 |
| `capability_package_channel_owner_route` | OPL Pack / Connect package owners | 无 owner package lifecycle receipt。 | descriptor/digest/lock/materializer readback、no-domain-authority/no-package-manager readback。 | 通过 Pack/Connect owner surface 路由 package lifecycle。 |
| `otlp_exporter_live_endpoint` | OPL Observability | bounded OpenMetrics smoke 已有，但不是 live OTLP/exporter endpoint。 | OTLP/OpenTelemetry SDK exporter、live endpoint、external collector consumption、trace/metric/log/event mapping。 | 开 Observability owner lane；bounded smoke 只保留 diagnostic。 |
| `domain_tail_owner_acceptance` | MAS/MAG/RCA/OMA/BookForge/ScholarSkills domain owners | OPL domain tail matrix 是 refs-only projection。 | no-active-caller、replacement primitive、tombstone/provenance、owner acceptance/decision/typed blocker。 | 分 domain owner route；没有 owner 证据前不 physical delete、不声明 domain ready。 |

## 当前完成度与建议顺序

百分比表示相对本文理想态的功能/结构完成度，不是 readiness、release、production 或 owner acceptance。

| 顺序 | 工作项 | 当前完成度 | 状态 | 当前证据 | 下一步 |
| --- | --- | ---: | --- | --- | --- |
| 1 | Reuse-first governance gate | 96% | `partial` | 已落 `contracts/opl-framework/reuse-first-governance.json`、`contracts/opl-framework/reuse-first-historical-worklist.json`、`scripts/reuse-first-scan.mjs`、`npm run reuse-first:scan`、`npm run reuse-first:scan:diff` 与 `./scripts/verify.sh reuse-first`；full scan 现在输出 historical decision/worklist readback；maintainer scripts 已新增共享 JSON/helper 与标准参数解析 helper，`phase0-maintenance-script-boundaries` 当前为 0；`scripts/test-lanes.mjs` 的 23 个 advisory observability hits 已单列为 test lane file catalog projection，不再混入 update/package owner-decision worklist；Agent Lab developer-mode split 后对应 test lane 已注册；本轮已把 8 条超线测试 reviewed baseline 全部拆到 `cases/` 子文件，`source-structure-budget` 当前 `reviewed_baselines=[]`；GitHub Verify 的 lint/structure job 会跑 strict diff gate。 | 继续逐项消化 worklist 中的 migration / owner-decision findings；不要把 worklist 分类或 clean diff gate 当作全仓历史风险已清零。 |
| 2 | Schema boundary consolidation | 80% | `partial` | Phase 1 seed lane 已引入 Ajv-backed `src/kernel/schema-registry.ts`；`ProgressDeltaReceipt` 与 `DomainProgressTransitionRuntime` live readback 已分别迁到 schema registry；runtime / entrypoint CLI JSON boundary 已新增 centralized `json-boundary.ts`，累计消化 runtime command spec、App release / OMA live path、Agent Lab public command、OKF / ScholarSkills public spec 与 Agent Lab payload parser 的分散 helper；Pack / Foundry JSON file boundary 已集中到 `src/kernel/json-file.ts`；Atlas domain-manifest / memory contract、Charter advisory / L5 evidence / source-structure readback、Console app-state / operator drilldown / runtime tray readback、Connect system-installation JSON/readback、Connect skill-pack / ACP stdio / Developer Mode / generated plugin / managed install-update ledger JSON boundary、Pack privatization / residue gate JSON boundary、Ledger artifact provenance bundle / current-owner / evidence dispatch / production-evidence / domain-owner / long-soak / template-consumption JSON boundary、Foundry Lab work-order execution / readiness / default-caller / Agent Lab suite / production acceptance / owner-evidence intake JSON boundary、Stagecraft stage/control-plane/quality/stage-run JSON boundary、Runway stop-loss successor / agent-executor / runtime-store / runtime evidence / dispatch / redrive / native readback / provider projection / lifecycle / task scope / command payload / default-executor receipt / provider followthrough / stage attempt closeout / provider-hosted value JSON boundary、route sync / evidence-currentness / stage-runtime utility JSON boundary、source-module boundary script、maintainer script JSON / argument boundary、测试层 CLI / native helper / contract fixture / governance fixture / state-index / pack bundle / family orchestration / quality / verification surface / reuse-first scan JSON stdout 解析、managed update receipt、OMA ledger readback、kernel profile/auth/runtime mode/managed runtime/system preference first-slice 已复用 `src/kernel/json-record.ts` / `src/kernel/json-file.ts` / `scripts/script-json-boundary.mjs`；Charter error vocabulary 已从非 Charter 模块收回到 `kernel` owner。本轮已把测试层剩余 13 个 handwritten JSON finding 关闭或标成嵌入式外部进程 fixture allow，domain-pack family-defaults readiness 漂移测试已按当前 5 个标准 domain agent readback 校准。`phase1-src-modules-schema-cli-boundaries` 当前为 0；Full scan 当前仍有 `handwritten_json_boundary=2`，仅剩允许的 `src/kernel` shared helper。 | 继续保持 entrypoint CLI、test fixtures、contract provenance 与 workspace projections 复用 schema registry/shared boundary；禁止新增分散 validator。 |
| 3 | CLI parser/command registry | 66% | `partial` | 已落最小 `CommandSpec.registry` 与 `validateCommandRegistryCoverage` adapter，`connect pubmed search`、`connect references verify`、`connect external-skills list/search/inspect/sync`、`connect install/update/reinstall/remove` module actions、`status workspace/runtime/dashboard`，以及 `update status/check/plan/apply/repair/rollback` 都进入 registry；status 与 update 命令已复用 registry parser adapter；maintainer scripts 的重复参数解析已集中到 `scripts/required-value-options.mjs`；private runtime command specs 已拆到 `parts/runtime.ts` / `parts/agents.ts`，总入口降到 650 行；`phase2-cli-entrypoint-boundaries` 当前为 0，owner-routed rollback command projection 已由 scanner allow 收敛为 0，entrypoint 层剩余 17 个 diagnostic drilldown 词项单列为 refs-only command projection。 | 继续把高频 runtime / public command specs 纳入 registry；只有当 Commander/Yargs 能减少现有 parser 分散度时再引入依赖。 |
| 4 | Runway Temporal-first runtime | 82% | `partial` | Temporal SDK 已是一等依赖，docs 已声明 Temporal production substrate；`family-runtime status/queue list` 已暴露 `queue_lifecycle_boundary`；Runway control-loop 已把 competing SQLite queue lifecycle 纳入 Temporal readiness 降级；新增 `family-runtime-temporal-first-contract.json` 与 readback，映射 StageRunWorkflow / StageAttemptActivity / ReconcileWorkflow / HumanGateSignal / OwnerReceiptSignal 到 Temporal workflow/activity/signal/schedule/history；queue lifecycle boundary 现在把旧队列词汇明确降级为 projection / operator handoff readback，并要求 Temporal workflow history/query、retry policy、failure history、stage attempt identity 与 projection repair/retirement receipt；`family-runtime attempt query` 已新增 `temporal_durable_lifecycle_readback`，把 workflow/run/query/history、schedule、task queue 与 stage attempt identity 放到 projection-only readback；非 Runway durable mutation 的 Console / Foundry Lab / Stagecraft readback 已复用 `queue-projection-vocabulary.ts`；Runway 内 task status、stage attempt status、lease/dead-letter/retry SQL helper、lease select row、retry budget projection、default executor / enqueue / store / harness、dedupe / linked task / PaperMission route / stage-attempt query / repair queue / Temporal observation sync / provider proof 的 queue projection fragment 已集中到 `family-runtime-queue-projection-boundary.ts`；`family-runtime residency proof --provider temporal --live --json` 在未配置真实 Codex CLI 时会创建 ephemeral fixture，fresh readback 已证明 Temporal test server + worker + signal history + typed closeout / missing-closeout fail-closed path，且显式 `proves_real_codex_cli=false`。Full scan 当前为 `custom_runtime_queue=147`，其中 `phase4-src-modules-runtime-queue=0`。 | 继续把 stage attempt durable lifecycle 从 SQLite mutation path 迁到真实 Temporal workflow/activity/schedule/history；production proof 仍需要外部 Temporal server、managed worker、真实 executor closeout 和 owner/domain refs。 |
| 5 | Kubernetes-style reconciler | 60% | `partial` | `family-runtime lifecycle reconcile` 已输出 desired_state / observed_state / reconcile_decision / next_safe_action，mutation 只允许进入 lifecycle apply receipt projection，禁止写 domain truth、artifact body、owner receipt 或 typed blocker；`opl runway reconcile --json` 现在把 `queue_lifecycle_boundary` 作为 observed_state，在 local SQLite lifecycle 与 Temporal 竞争时只输出 `observe_queue_lifecycle_boundary` readback，不给 scheduler tick mutation；Runway control-loop 在 queue handoff gate attention 时只给 read-only observation。 | 继续把 worker/App/domain helper mutation 收到统一 Reconciler safe-action source。 |
| 6 | Managed update split | 80% | `partial` | App release channel 与 managed update plane 边界存在；已增加 `owner_route_contract`、`owner_execution_boundary_contract`、组件级 `owner_route` / `owner_execution_boundary` 与 receipt `owner_projection`，把 app binary / runtime substrate / capability packages 明确路由到 owner/readback/apply owner，并保留 no-package-manager forbidden claims；receipt JSON 读取已复用共享 record boundary，不再在 managed update 模块私写 `optionalString` / `optionalStringArray` helper；`ManagedUpdateOperation`、provider ids、component model、owner route、owner execution boundary、receipt projection required fields、no-auto-apply / status-detail builders、component filter/summary、operation mode、receipt write policy、post-apply/reload status、receipt input assembly、rollback/app-state owner decision vocabulary 与 receipt type source 已从 `managed-update-kernel.ts` / runner / Console / Foundry Lab / Runway projections 拆到 `managed-update-owner-boundary.ts`，kernel 只保 projection 组装与 component readback；Console、Foundry Lab 与 Runway 内剩余 previous-version / fallback 指针已改为复用 owner boundary 或标明 refs-only recovery；`connect agent-packages` 已把 registry discovery、manifest validation、install lock 与 lifecycle receipt 固定到 Framework `OPL_STATE_DIR` refs-only writer，并显式保留 no-domain-authority boundary；agent package physical Codex surface 已复用 `system-installation/codex-plugin-registry.ts` 的 local marketplace / config helper，不再在 package registry 内手写第二套 plugin materializer。Full scan 当前为 `custom_update_or_package_manager=93`，其中 `phase6-src-modules-update-package=0`、`phase2-update-command-registry-projection=0`。 | 继续把 runtime materializer、App release updater、capability package channel 与 companion/workflow manual owner route 的 active caller 边界继续拆薄；不要声明 release/currentness ready。 |
| 7 | Pack/Workspace standardization | 64% | `partial` | pack/workspace CLI 与 descriptors 已存在；Pack OS lock/cache/registry 已增加 OCI descriptor/digest 字段，并统一投影 `content_addressed_lock_policy`：OCI media type、sha256 digest、refs-only lock、no registry push/pull、no body、no stage close、no domain truth write；Workspace shared-resource manifest/inventory 已增加 sha256 content-addressing policy。 | 继续把 Workspace validate/doctor 的 hard blocker/repairable finding 口径收紧，并逐步把 remaining pack/workspace transport/cache 历史 findings 归入 standard descriptor/digest/lock。 |
| 8 | Domain private platform retirement | 69% | `partial` | 已落 machine-readable `domain-private-platform-tail-matrix.json` 和 executable `domain_private_platform_tail_matrix` readback，覆盖 MAS/MAG/RCA/OMA/BookForge/ScholarSkills tail class、replacement primitive、retained authority、delete/tombstone gate、forbidden claims、`physical_delete_authorized=false` 与 owner decision gate；OMA live path / production consumption / long-soak ledger JSON readback 已复用共享 OPL JSON boundary；fresh readback 显示 matrix `row_count=6`、全部 domain `physical_delete_authorized=false`，ScholarSkills 仍是 refs-only capability package；仍未执行 domain repo 物理删除或 owner acceptance。 | 下一步只开 sibling capability-map / conformance lane，逐项补 no-active-caller、no-forbidden-write、tombstone/provenance 或 owner decision refs；物理删除继续 owner-gated。 |
| 9 | App/Aion consumer-only | 68% | `partial` | App/Aion 边界已有合同和 release channel；Phase 8 lane 已在 `settings_control_center` 增加 executable consumer-only readback/validator，明确 local scheduler 只允许 refresh/UI/poll，forbidden truth-only paths 可见；fresh OPL readback 中 `app_settings_read_model.consumer_only_readback == app_aion_consumer_only_readback`，但 validation 仍为 `attention_required`，缺 App owner receipt/typed blocker、managed package receipt/typed blocker、domain owner decision/typed blocker；App `validate:release-boundary` pass，`validate:active-shell -- --quick` 仍被 App contract 缺 `openscience_console_projection_ref` 阻断。 | 继续把 App/Aion repo live validator 接入该读面；先处理 App 侧 active-shell contract blocker 和并行 worktree 写集边界，release/currentness claim 仍必须来自 App owner receipt 或 typed blocker。 |
| 10 | OpenTelemetry-style observability | 92% | `partial` | 已落 `contracts/opl-framework/observability-semantic-conventions-contract.json` 与 `src/modules/ledger/observability-semantic-conventions.ts`，把 current owner delta / stage attempt / provider attempt 投影到 trace、metric、log/event vocabulary；`runtime observability-export` 现在直接输出 `semantic_conventions` refs-only readback seed，并在 OpenMetrics 中追加 `opl_queue_length`、`opl_observability_export_boundary`、`opl_observability_exporter_signal_mapping`、`opl_observability_collector_export_boundary` 与 `opl_observability_collector_consumption_config`；JSON readback 已携带 Prometheus receiver / OpenMetrics input / batch processor / debug exporter 的 Collector YAML 等价配置片段，`--format collector-config-json` 可直接输出同一 Collector config JSON；`runtime observability-endpoint` 已用 Node 标准 HTTP server 暴露 read-only OpenMetrics `/metrics` endpoint，并通过 CLI registry 保护 `runtime observability-*` 命令；`runtime observability-collector-smoke` 默认 no-endpoint 路径使用 bounded OPL OpenMetrics smoke endpoint，并用 `--collector-command` / `OPL_OTELCOL_COMMAND` / PATH 上的 `otelcol-contrib|otelcol` 执行 smoke readback；真实 `otelcol-contrib v0.155.0` 已 fresh 观察到 OPL metric，`collector_consumption_observed=true`、`external_collector_connected=true`，同时 authority boundary 仍固定 `can_claim_runtime_ready=false`；Collector binary 缺失时仍输出 `collector_binary_missing` typed blocker readback；`evidence-envelope` projection 与 `app-operator-drilldown` 已绑定同一 semantic convention signal model；Console runtime tray / stage attempt drilldown 已复用 Ledger-owned semantic vocabulary，保持 no-body / no-ready-claim boundary；observability projection field / label vocabulary 已集中到 `src/kernel/observability-projection-vocabulary.ts`，source-module diagnostic drilldown 词项已收为 refs-only command/readback projection，且扫描器仍会保留同一行里的 private ledger terms 风险。Full scan 当前为 `custom_observability_ledger=455`，其中 `phase10-src-modules-observability=0`。 | 继续补外部 runtime endpoint / OTLP SDK exporter owner lane 和部署环境证据；本阶段不声明 runtime、domain、artifact 或 production readiness。 |
| 11 | No-resurrection scan | 99% | `partial` | `reuse-first-scan` 已支持 strict diff hard/advisory gate，新增 schema/CLI/runtime/update/package 类 hard finding 会失败，observability ledger 类先进入 advisory；diff 模式明确不应用 historical worklist 豁免；full 模式按 decision status / category / path-prefix / owner / phase / action / expiry 输出 historical decision/worklist readback，并新增 `open_worklist_finding_count` / `blocking_worklist_finding_count` / `allowed_projection_finding_count`，避免把已决历史投影误报成真 blocker。当前 full scan 为 `finding_count=697`、`hard_gate_finding_count=242`、`advisory_finding_count=455`、`decisioned_finding_count=697`、`undecisioned_finding_count=0`、`open_worklist_finding_count=0`、`blocking_worklist_finding_count=0`，全部归入 `allowed_projection_boundary`；当前 category 为 `handwritten_json_boundary=2`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`；`src/kernel/contract-validation.ts`、共享 JSON boundary helpers、`queue-projection-vocabulary.ts`、`observability-projection-vocabulary.ts`、`family-runtime-queue-projection-boundary.ts` 与 `managed-update-owner-boundary.ts` 被限定为允许的共享 boundary/owner helper；source-module diagnostic drilldown 只在不夹带 private ledger terms 时允许，不能扩大到 generic observability ledger；owner-routed rollback command projection 只在 CLI command projection 文件中允许；`phase1-src-modules-schema-cli-boundaries`、`phase0-maintenance-script-boundaries`、`phase2-cli-entrypoint-boundaries`、`phase2-update-command-registry-projection`、`phase4-src-modules-runtime-queue`、`phase6-src-modules-update-package` 与 `phase10-src-modules-observability` 已降为 0；`residual_readback_2026_07_05.owner_route_worklist` 仍列出 Runtime / Update-package / Observability / Domain owner-live evidence 缺口。 | 继续处理 tests / contracts / entrypoints 里的历史 projection findings；`phase10-test-and-fixture-projections=569`，worklist 分类不是 risk eliminated / release ready；owner-route worklist 未清零前本文整体保持 `partial`。 |

## Phase 1/2 Runway JSON Boundary Closure 2026-07-04

本轮继续消化 Runway 内剩余可安全收薄的 handwritten JSON boundary，只做 helper 复用，不改变 runtime queue、provider attempt、domain truth、owner receipt、typed blocker、release/currentness 或 production 语义。

- Source：`family-runtime-codex-stage-runner` closeout recovery、dead-letter redrive、domain handler process/closeout、PaperMission stage-route runner/terminal sync、evidence worklist helpers、MAS current-control/currentness refs、stage admission/currentness/usage/progress log、queue holds、paper autonomy substrate、task dispatch、functional harness、native index lifecycle 与 observability export 等文件，改为复用 `src/kernel/json-record.ts` / `src/kernel/json-file.ts` 的 shared boundary helper。
- Fresh evidence：三条隔离 lane 分别完成 route/sync、evidence/currentness、stage/runtime utility 聚焦验证；吸收后 full scan readback 为 `finding_count=2561`、`handwritten_json_boundary=476`、`phase1-src-modules-schema-cli-boundaries=0`、`decisioned_finding_count=2561`、`undecisioned_finding_count=0`。
- Residual boundary：该切片关闭的是 src/modules 层的 Phase 1 handwritten JSON migration worklist，不关闭 entrypoint CLI parser 统一、test fixture/projection cleanup、Temporal durable lifecycle 迁移、update/package owner decision、OpenTelemetry collector 消费、release/currentness/domain ready 或 owner acceptance。

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

## Phase 6 Content-Addressed Lock Policy Foldback

本轮继续收薄 Pack OS，只把 OCI descriptor / digest / media type / lock policy 固定成 machine-readable contract 和 CLI/readback 字段；不实现 registry push/pull，不新增包管理器，不关闭 stage，不写 domain truth。

- Contract：`pack-os-contract.json` 的 lock required fields 增加 `content_addressed_lock_policy`，并要求 descriptor/resource media type、`sha256` digest、present local resource digest、external refs 不进 cache、refs-only lock、no registry push/pull、no body storage、no stage close、no domain truth write。
- Source/readback：`pack os inspect/validate/lock/install/registry/cache/distribute` 现在都投影同一套 content-addressed lock policy；validation 增加 descriptor digest 与 refs-only lock policy checks，registry/cache/distribution 继续只记录 refs、digest、cache ref 和 forbidden claims。
- Fresh evidence：`node --experimental-strip-types --test tests/src/pack-os.test.ts tests/src/cli/cases/pack-os-command-surface.test.ts tests/src/cli/cases/workspace-domain-initializer-cases/validation-and-doctor.ts` 17/17 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff` gate_status=ok，`git diff --check` pass。该证据只证明本切片 contract/source/readback/focused tests，不证明 install/release/currentness ready、外部 registry 可用、domain owner acceptance 或 production readiness。

## Phase 5 Owner-Execution Boundary Foldback

本轮继续收薄 Managed update split，只落 Framework 本仓 owner route / runner / receipt projection 边界，不实现真实 App updater、host installer 或 release/currentness ready claim。

- Contract：`managed-update-kernel-contract.json` 新增 `owner_execution_boundary_contract`，要求每个组件声明 owner executor、可执行操作、readback ref、receipt projection、diagnostic-only 与 `package_manager_claim=false`；runner 可执行范围只允许 `runtime_substrate` 与 `capability_packages`。
- Source：组件 projection 新增 `owner_execution_boundary`；runner 不再只看 `auto_apply.mode` 判定可执行性，而是读取 owner boundary；`installation_carrier`、`codex_surface`、`companion_tools`、`workflow_profile` 在 `opl update apply` 下保持 skipped / projection / manual owner route，不写 component receipt。
- Receipt：component receipt 新增 `owner_projection`，把 owner、authority surface、readback ref、apply owner 和 forbidden claims 写入 receipt ledger；旧 receipt 读取时保守投影为 legacy projection，且 `package_manager_claim=false`。
- Fresh evidence：focused managed-update tests 14/14 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff` gate_status=ok。该证据只证明本切片 contract/source/tests 与 diff gate，不证明 App release、runtime currentness、owner acceptance 或 production readiness。

## Phase 1 Runtime Live-Readback Schema Foldback

本轮继续收敛 schema boundary，只把 `DomainProgressTransitionRuntime` live readback 的 JSON 形状与 false-authority 字段交给 Ajv schema registry；事务完整性、StageRun identity 和 outbox identity 仍由现有 runtime 语义判断负责。

- Contract：新增 `contracts/opl-framework/domain-progress-transition-runtime-live-readback.schema.json`，要求 live readback 声明 `surface_kind`、`runtime_id`、append-only storage、transaction status、authority boundary、projection metadata、replay audit 与 latest transaction readback；schema 明确 `opl_can_create_domain_owner_receipt=false`、`opl_can_create_domain_typed_blocker=false`、`provider_completion_is_domain_ready=false`。
- Source：`validCompleteTransitionRuntimeLiveReadback` 先通过 shared `validateJsonSchemaPayload` 做 JSON boundary validation，再继续执行 complete transaction / outbox identity / StageRun identity 语义判断；无效 readback 仍 fail-closed 为 `false`，不向 current-control/provider-admission 调用链泄漏异常。
- Fresh evidence：`npx tsx tests/src/cli/cases/family-runtime-domain-progress-transition-runtime-cases/live-readback.ts` 5/5 pass，`npx tsx tests/src/target-architecture-schema-contracts.test.ts` 2/2 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff` gate_status=ok。该证据只证明 runtime live-readback schema 切片，不证明 Temporal durable lifecycle、production readiness、owner acceptance 或 domain ready。

## Phase 3-4 First-Slice Foldback

Phase 3-4 的本轮收薄是 Runway control-loop / reconciler 的 safe-action readback 切片，不是 Temporal runtime 重写，也不声明 runtime ready。

- Temporal-first boundary：`family-runtime control-loop status` 复用既有 `queue_lifecycle_boundary`，当 Temporal provider 下存在没有 Temporal stage attempt/history 的本地 SQLite lifecycle 状态时，Runway readiness 降级，`provider_backed_runtime_ready=false`，`live_workflow_execution_ready=false`。
- Reconciler safe action：`opl runway reconcile --json` 的 observed state 暴露 `queue_lifecycle_boundary`；competing queue lifecycle 的 selected action 是 `observe_queue_lifecycle_boundary`，命令是只读 `opl family-runtime queue list --json`，不再把该风险导向 scheduler tick mutation。
- Local provider boundary：Runway control-loop provider readback 明确 `local_provider_role=dev_ci_offline_diagnostic_baseline_only_not_online_readiness_substitute`；local SQLite 仍只能作为 dev/CI/offline diagnostic baseline。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/brand-modules-cases/runway-control-loop.ts` 11/11 pass，`npm run typecheck` pass。该证据只证明 control-loop / reconciler projection 切片和类型检查，不证明 production readiness、Temporal live history 接管、owner acceptance 或 release readiness。

## Phase 3 Temporal-First Contract Readback Foldback

本 lane 只落 Runway Temporal-first workflow / activity / signal contract readback，不启动真实 Temporal service，不写 runtime DB / provider queue data，不声明 live workflow execution ready。

- Contract：新增 `contracts/opl-framework/family-runtime-temporal-first-contract.json`，把目标 `StageRunWorkflow`、`StageAttemptActivity`、`ReconcileWorkflow`、`HumanGateSignal`、`OwnerReceiptSignal` 映射到当前 Temporal adapter（`StageAttemptWorkflow`、`CodexStageActivity` / `DomainHandlerDispatchActivity`、`SchedulerTickWorkflow` / `SchedulerTickActivity`），并显式写出 task queue、retry、schedule、event history、SQLite projection-only 与 local provider diagnostic-only 角色。
- Source readback：`buildTemporalFirstRuntimeContract()` 进入 `family-runtime status`、Runway control-loop provider_runtime 与 Temporal worker lifecycle projection；`OwnerReceiptSignal` 作为 refs-only signal/update payload 进入 workflow signal contract，`owner_receipt_ref` 只进入 workflow history/projection，不授权 OPL 签 owner receipt。
- False-ready boundary：contract/readback 明确 `contract_readback`、`sqlite_projection_clean`、`local_provider_pass`、`focused_tests_pass` 和 provider completion 都不能证明 production ready、domain ready、owner acceptance 或 live workflow execution ready。
- Fresh evidence：2026-07-03 lane verification 为 `node --test --experimental-strip-types tests/src/cli/cases/brand-modules-cases/runway-control-loop.ts` 12/12 pass、`npm run typecheck` pass、`npm run reuse-first:scan:diff` gate_status=ok、`git diff --check` pass；该证据只证明 OPL 本仓 contract/readback 切片可执行，不证明真实 Temporal service、production readiness、owner receipt consumption 或 domain ready。

## Phase 3 Durable Lifecycle Handoff Foldback

本 lane 继续收薄 Runway queue lifecycle 边界，只把 local SQLite competing lifecycle 变成 Temporal handoff/readback，不执行 runtime DB/provider queue migration，不声明 live Temporal ready。

- Source/readback：`queue_lifecycle_boundary.gate` 新增 `temporal_migration_required` 与 required evidence；`temporal_durable_lifecycle_handoff` 显式要求用 workflow id、Temporal workflow history/query readback、stage attempt identity 与 authority event/projection rebuild ref 才能关闭 migration gap。
- Authority：local action 只允许 `read_projection_and_emit_operator_handoff_only`；禁止把 SQLite task status 当 Temporal lifecycle truth、禁止绕过 Temporal retry/dead-letter、禁止声明 provider-backed runtime ready、domain progress 或 domain ready。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/brand-modules-cases/runway-control-loop.ts` 30/30 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff` gate_status=ok，`git diff --check` pass。该证据只证明 handoff/readback 切片，不证明真实 Temporal history 已接管 durable lifecycle、production ready 或 owner acceptance。

## Phase 3/4 Temporal Durable Lifecycle Readback Binding Lane 2026-07-04

本 lane 只把 `family-runtime attempt query` 的 stage-attempt readback 明确绑定到 Temporal workflow history/query、schedule identity 与 task queue identity；不启动真实生产 Temporal service，不写 runtime DB / provider queue data，不声明 runtime ready、domain ready、production ready 或 owner acceptance。

- Source/readback：`stage_attempt_query.temporal_durable_lifecycle_readback` 与顶层 `family_runtime_stage_attempt_query.temporal_durable_lifecycle_readback` 现在输出 workflow id、run id、StageAttemptQuery ref、history ref、schedule id、task queue、stage attempt identity、required evidence 与 observed evidence；没有 Temporal query/history 时状态保持 `missing_temporal_history_or_query`，本地 SQLite status 只保留 projection role。
- Contract：`family-runtime-temporal-first-contract.json` / `buildTemporalFirstRuntimeContract()` 新增 `durable_lifecycle_readback`，把 `opl family-runtime attempt query <stage_attempt_id>` 定为该切片的 command surface，并要求 workflow/query/history、stage attempt identity、schedule identity、task queue identity 与 authority event/projection rebuild ref。
- Authority：该 readback 只证明 OPL Runway command/readback 已能暴露 durable lifecycle handoff 所需 identity，不授权 scheduler mutation、domain truth、owner receipt、typed blocker、provider-backed runtime ready 或 domain progress claim。
- Fresh evidence：focused `family-runtime-stage-attempts-temporal-provider-cli.test.ts` + `runway-control-loop.ts` 20/20 pass，focused `family-runtime-stage-attempts-temporal-provider.test.ts` 12/12 pass，`npm run typecheck` pass，`npm run source:modules -- --strict-imports` status=ok，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`git diff --check` pass。该证据只证明 command/contract/readback binding 切片，不证明 durable lifecycle 已完全迁到 Temporal history、production ready、domain ready 或 owner acceptance。

## Phase 1 / 7 / 9 First-Slice Foldback

Phase 1、Phase 7、Phase 9 的本轮收薄已吸收进 `main`，属于 schema boundary、domain-tail matrix 与 observability exporter/readback seed，不是完整 platform closeout。

- Schema boundary：`ProgressDeltaReceipt` 已从局部手写 shape validator 迁到 Ajv-backed `assertJsonSchemaPayload`，`contracts/opl-framework/progress-delta-receipt.schema.json` 收紧 refs 与 authority boundary，focused valid/invalid tests 覆盖 false-authority drift。
- Domain private tail：新增 `contracts/opl-framework/domain-private-platform-tail-matrix.json`，把 MAS/MAG/RCA/OMA/BookForge/ScholarSkills 的 private tail class、replacement primitive、retained authority、delete/tombstone gate、forbidden claims 和 verification surface 固定为 machine-readable seed；该 seed 不授权物理删除、owner acceptance、domain ready 或 production ready。
- Observability：新增 refs-only JSON / OpenMetrics export seed，按 trace、metric、log/event signal grouping 输出 OpenTelemetry-style projection；不保存 payload body，不创建私有 ledger UI，不声明 runtime/domain/artifact/production readiness。
- Fresh evidence：合并后 focused tests 22/22 pass，`npm run typecheck` pass，`npm run build` pass，`npm test` smoke 72/72 pass，`npm run reuse-first:scan:diff` gate_status=ok。Full reuse-first scan 仍有历史 findings，不能把 clean diff gate 说成全仓历史风险清零。

## Phase 2 Status Command Registry Lane

本 lane 只扩展 CLI command registry 覆盖，不声明完整 parser 统一、CLI tree closeout、runtime readiness 或 owner acceptance。

- Status registry coverage：`status workspace`、`status runtime`、`status dashboard` 已进入 `CommandSpec.registry`、`contracts/opl-framework/cli-command-registry.json` required command set 与 `validateCommandRegistryCoverage` protected `status` 前缀。
- Parser risk reduction：status 三命令的 handler 不再走各自 hand-written status parser，改用既有 `parseRegisteredCommandOptions` / `node_util_parse_args` adapter，并保留原输出行为。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/cli-command-registry.test.ts` 6/6 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff` gate_status=ok。
- Residual boundary：大量 runtime、pack、workspace、agents 命令仍未进入 registry；本 lane 不引入 Commander/Yargs，也不迁移 provider/runtime mutation path。

## Phase 1/2 Runtime CLI JSON Boundary Lane 2026-07-03

本 lane 只收敛 runtime CLI command spec 的局部 JSON/readback helper，不改变命令语义、ledger 写入语义或 JSON output shape，也不声明 CLI parser 统一完成。

- Source：`runtime developer-mode-closeout`、`runtime domain-owner-payload-summary`、`runtime mag-manifest-sustained-consumption`、`runtime memory-artifact-lifecycle-evidence` 四个 command spec 删除局部 `isRecord` / `optionalString` / `stringList` / `JSON.parse` helper，统一复用 `src/entrypoints/cli/modules/json-boundary.ts`；该 helper 复用 `src/kernel/contract-validation.ts` 的 `isRecord`，只保留一个带 reuse-first allow marker 的 stdlib `JSON.parse` CLI usage-error wrapper。
- Boundary：错误消息、payload key alias、refs-only authority boundary、record / verify / list output shape 均保持原 command spec 行为；未触碰 Runway runtime/provider queue、managed update、pack/workspace lane、domain truth、owner receipts、typed blockers 或 release artifacts。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/runtime-developer-mode-closeout-ledger.test.ts` 12/12 pass；`node --test --experimental-strip-types tests/src/cli/cases/runtime-app-operator-drilldown-mas-payload-summary.test.ts tests/src/cli/cases/runtime-app-operator-drilldown-mag-payload-summary.test.ts` 8/8 pass；`node --test --experimental-strip-types tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts` 9/9 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff` gate_status=ok；`git diff --check` pass。
- Residual boundary：其他 runtime CLI command specs 仍有历史 `handwritten_json_boundary` findings；本 lane 只消化四个低冲突 command specs，不把 diff gate clean 说成 full scan 清零。

## Phase 1 Pack / Foundry JSON File Boundary Lane 2026-07-03

本 lane 只收薄 Pack descriptor/bundle 与 Foundry Lab scaffold/conformance evidence tail 的 JSON file/object boundary；不改变 Pack output shape、Foundry validation blockers、refs-only/authority boundary、domain truth、owner receipts、typed blockers、runtime/provider queues、managed update、observability exporter、App/Aion consumer path 或 release artifacts。

- Source：新增 `src/kernel/json-file.ts`，集中 `readFileSync` / `JSON.parse` / JSON object root / optional string / status-result helper；`JSON.parse` 与 scalar normalization 的 reuse-first allow marker 只放在该共享 helper。`pack-bundle.ts` 删除局部 `readJsonFile` 与 `JSON.parse` object boundary；`pack-os-parts/descriptor.ts` 保留对外 thin `readJsonFile` export 以兼容现有 `pack-os.ts` caller，但实际 JSON/object boundary 复用 kernel helper；`standard-domain-agent-scaffold-validation.ts` 删除局部 nullable JSON parser；`standard-domain-agent-conformance-evidence-tail.ts` 删除局部 `isRecord` / `optionalString` / JSON parse status helper。
- Boundary：Pack bundle/descriptor 的 `contract_file_missing`、`contract_json_invalid`、`contract_shape_invalid` 错误码、message 和 details key 保持 caller-owned；Foundry scaffold invalid/missing JSON 继续按 nullable payload 进入现有 blockers；conformance evidence tail missing/invalid/resolved status shape 保持不变。
- Fresh evidence：`node --experimental-strip-types --test tests/src/json-file-boundary.test.ts tests/src/pack-bundle.test.ts tests/src/cli/cases/pack-bundle-command-surface.test.ts tests/src/pack-os.test.ts tests/src/cli/cases/pack-os-command-surface.test.ts tests/src/cli/cases/agents-scaffold-validation-failures.test.ts tests/src/cli/cases/agents-scaffold-progress-first.test.ts tests/src/cli/cases/agents-conformance.test.ts` 59/59 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff` gate_status=ok；`git diff --check` pass。
- Residual boundary：本 lane 只消化 Pack/Foundry Lab 四个指定 file/schema boundary；其他 `src/modules/pack/**`、`src/modules/foundry-lab/**` 与跨模块历史 `handwritten_json_boundary` findings 仍在 full-scan worklist 中，不声明 Phase 1 完整完成、production ready、domain ready、owner acceptance 或 release/currentness ready。

## Post-Absorption Evidence 2026-07-03

本轮四条并行 lanes 已由主会话 cherry-pick 吸收到 `main`，随后执行合并后验证。该证据证明本轮切片在 Framework main 上可编译、可测试、未新增 reuse-first diff 违规；不证明 OPL production ready、domain ready、App release ready、owner acceptance 或历史风险清零。

- Absorbed commits：`d4fb9643` schema/runtime live-readback、`b0b33042` CLI status registry、`069cf4c0` domain private tail readback、`8331dcf5` managed update owner execution boundary。
- Fresh verification：focused tests 39/39 pass，`npm run typecheck` pass，`npm run build` pass，`npm test` smoke 72/72 pass，`./scripts/verify.sh reuse-first` pass，`npm run reuse-first:scan:diff` gate_status=ok，`git diff --check` pass。
- Full scan current risk inventory：`npm run reuse-first:scan` 仍返回 `finding_count=3161`、`hard_gate_finding_count=1622`、`advisory_finding_count=1539`。这些是历史消化队列，不阻断本轮 diff gate，但仍是后续 migration/exception decision worklist。

## Post-Absorption Evidence 2026-07-03 Second Batch

本轮第二批三条并行 lanes 已由主会话 cherry-pick 吸收到 `main`，覆盖 runtime CLI JSON boundary、Runway Temporal-first contract readback 与 Pack OS content-addressed lock policy。该证据仍只证明 OPL Framework 本仓结构切片，不证明 live Temporal、外部 OCI registry、release/currentness ready、domain owner acceptance 或 full scan 清零。

- Absorbed commits：`4cf1a4f3` runtime CLI JSON boundary helper、`4f73e6eb` Runway Temporal-first contract readback、`21048819` Pack OS content-addressed locks。
- Fresh lane evidence：runtime CLI focused tests 29/29 pass；Runway control-loop focused tests 12/12 pass；Pack/Workspace focused tests 17/17 pass；三条 lane 均 `npm run typecheck` pass、`npm run reuse-first:scan:diff` gate_status=ok、`git diff --check` pass。
- Post-absorption verification：主 checkout 重新执行 `npm run typecheck` pass、`npm run build` pass、`npm test` smoke 72/72 pass、`./scripts/verify.sh reuse-first` pass、`npm run reuse-first:scan:diff` gate_status=ok、`git diff --check` pass。
- Full scan current risk inventory after absorption：`node ./scripts/reuse-first-scan.mjs --max-findings=0` 返回 `finding_count=3149`、`hard_gate_finding_count=1610`、`advisory_finding_count=1539`。相对上一批减少 12 个 hard findings，但仍是历史消化队列。

## Phase 8 App/Aion Consumer-only Executable Readback Lane 2026-07-03

本 lane 只落 OPL Framework 本仓 Settings Control Center 的 App/Aion consumer-only executable readback/validator，不触碰 `one-person-lab-app`、`opl-aion-shell`、domain truth、owner receipts、typed blockers、runtime DB/provider queue data 或 release artifacts。

- Contract：`settings-control-center-action-read-model-contract.json` 将 `app_aion_consumer_only_readback` 固定为 `settings_control_center` 必需读面，并要求 `app_settings_read_model.consumer_only_readback` 直接复用同一读面；contract 同步声明 validator status 与 missing visible boundary field 的 finding policy。
- Source/readback：`app_state.settings_control_center.app_aion_consumer_only_readback` 现在逐项投影 settings policy、App release/installer、runtime/provider/stage status、managed module/capability packages 与 domain private platform residue 的 owner、current source、delegated action、receipt/blocker/blocked reason slots；local scheduler role 限定为 refresh/UI/poll，forbidden truth-only paths 与 App/Aion false authority flags 可执行可读。
- Validator behavior：当前 fixture 缺少 App owner receipt/typed blocker、managed package receipt/typed blocker 与 domain owner decision/typed blocker 时，readback 输出 `validation_status=attention_required` 和对应 `validator_findings`，不把 Settings 读面包装成 release/currentness/domain cleanup truth。
- Fresh lane evidence：`node --experimental-strip-types --test tests/src/verification-command-surfaces.test.ts tests/src/cli/cases/app-state.test.ts tests/src/cli/cases/app-action.test.ts` 29/29 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff` gate_status=ok；`git diff --check` pass。
- Residual boundary：该证据只证明 OPL Framework Settings readback/validator 切片；不证明 App/Aion repo live validator 已接入、不证明 App release/currentness ready、不证明 owner acceptance、不证明 domain cleanup authorization。

## Historical Findings Decision/Worklist Evidence 2026-07-03

本轮在 `codex/reuse-first-historical-worklist-20260703` 隔离 lane 内落地 historical findings decision/worklist 机制。该证据只证明 OPL Framework 本仓 reuse-first full-scan readback 和 diff No-resurrection gate 行为；不证明历史风险已清零、release ready、production ready、domain ready、owner acceptance 或 physical delete authorization。

- Source：新增 `contracts/opl-framework/reuse-first-historical-worklist.json`，定义 `undecisioned`、`accepted_migration_worklist`、`allowed_projection_boundary`、`must_migrate`、`owner_decision_required` 五类历史决策状态；每个 worklist item 绑定 category、path-prefix、owner、phase、action、expiry 与 decision ref。
- Scan behavior：`scripts/reuse-first-scan.mjs` 在 full scan 输出 `historical_decision_summary`，按 decision status / category / path-prefix / owner / phase / action / expiry / worklist item 汇总；在 diff scan 输出 `applied=false`，明确 historical worklist 不参与新增 finding 豁免。
- Full scan readback：`node ./scripts/reuse-first-scan.mjs --max-findings=0` 返回 `finding_count=3149`、`hard_gate_finding_count=1610`、`advisory_finding_count=1539`，`historical_decision_summary.applied=true`，`decisioned_finding_count=3148`，`undecisioned_finding_count=1`。按 status 分布为 `allowed_projection_boundary=1925`、`accepted_migration_worklist=887`、`owner_decision_required=185`、`must_migrate=151`、`undecisioned=1`。
- Diff false-ready guard：focused test 覆盖 broad historical worklist 也不能豁免 diff strict hard finding；本轮 `npm run reuse-first:scan:diff` 返回 `gate_status=ok` 且 `historical_decision_summary.applied=false`，证明当前 diff 未新增 finding，同时不改变 No-resurrection hard gate 语义。
- Fresh lane evidence：`node --test --experimental-strip-types tests/src/reuse-first-scan.test.ts` 7/7 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff` gate_status=ok，`git diff --check` pass。

## Phase 9 Runtime Observability Binding Lane 2026-07-03

本 lane 只把现有 `runtime observability-export` 绑定到已经落地的 OpenTelemetry-style semantic conventions，不新增私有 ledger UI、不接入真实 Collector、不声明 runtime/domain/artifact/production readiness。

- Source/readback：`observability-export.ts` 现在复用 `observability-semantic-conventions.ts`，从 runtime tray snapshot、stage attempt workbench、App operator current owner delta 和 provider proof 中抽取 canonical attributes，输出 `semantic_conventions` readback seed、runtime export binding、canonical fields/attributes、trace/metric/log/event mapping 和 no-body policy。
- OpenMetrics：`runtime observability-export --format openmetrics` 继续输出原 provider/stage/gate/memory/SLO metrics，并追加 semantic convention metrics（如 `opl_queue_length`）与 `opl_observability_export_boundary`，明确 refs-only、no payload body、no runtime/domain/production ready claim。
- Fresh lane evidence：`node --test --experimental-strip-types tests/src/cli/cases/runtime-observability-export.test.ts tests/src/observability-semantic-conventions.test.ts` 5/5 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`git diff --check` pass。该证据只证明 OPL 本仓 runtime observability export/readback 切片，不证明真实 Collector/exporter 消费、production readiness、domain ready 或 owner acceptance。

## Phase 0/10 Kernel Worklist Classification 2026-07-03

本 lane 只关闭 reuse-first full scan 的未分类项，不把历史 findings 包装成已修复。

- Contract：`reuse-first-historical-worklist.json` 新增 `phase1-kernel-shared-json-boundary-helper`，把 `src/kernel/contract-validation.ts` 的 `isRecord` 分类为共享 schema registry / JSON boundary helper；module-local validator 仍留在 migration worklist。
- Fresh readback：`node ./scripts/reuse-first-scan.mjs --max-findings=0` 返回 `finding_count=3143`、`hard_gate_finding_count=1604`、`advisory_finding_count=1539`、`decisioned_finding_count=3143`、`undecisioned_finding_count=0`。该证据只证明历史 worklist 已完全分类，不证明风险清零、release ready、production ready、domain ready 或 owner acceptance。

## Phase 1/2 Runtime CLI JSON Boundary Third Lane 2026-07-03

本 lane 继续收敛 runtime CLI command spec 的局部 JSON/readback helper，不改变命令语义、ledger 写入语义、JSON output shape 或 authority boundary。

- Source：`runtime-provider-long-soak-evidence`、`runtime-stage-replay-missing-receipt`、`runtime-oma-production-consumption`、`runtime-brand-module-l5-evidence`、`runtime-codex-app-runtime-evidence`、`runtime-standard-agent-template-consumption` 六个 command spec 复用 `src/entrypoints/cli/modules/json-boundary.ts` 的 `readJsonObject` / `readOptionalString` / `readStringList`。
- Fresh evidence：相关 focused tests 42/42 pass，provider-long-soak 以临时 `OPL_STATE_DIR` 执行 CLI `record/list` smoke，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`git diff --check` pass。
- Residual boundary：`runtime-stage-transition-authority`、`runtime-stage-run-authorization`、`runtime-research-hypothesis-portfolio`、`runtime-app-release-evidence`、`runtime-research-evidence-pack`、`runtime-oma-app-live-path` 仍在 CLI/schema migration worklist；本 lane 不声明 CLI parser 统一完成。

## Phase 0/10 Maintainer Script JSON Boundary Lane 2026-07-03

本 lane 只收薄 maintainer scripts 的重复 JSON file boundary，不把脚本工作流包装成 package manager、observability system 或 release/currentness truth。

- Source：新增 `scripts/script-json-boundary.mjs`，`scripts/line-budget.mjs`、`scripts/package-channel-daily-check.mjs` 与 `scripts/source-module-boundary.mjs` 复用该 helper 读取 JSON object。
- Fresh evidence：`npm run line-budget` exit 0（仍有既有 20 条 advisory）、`npm run source:modules` status=ok、`package-channel-daily-check.mjs` temp manifest smoke 输出 `status=skipped` / `package_channel_unchanged`、`npm run reuse-first:scan:diff -- --strict` gate_status=ok、`git diff --check` pass。
- Full scan delta：`phase0-maintenance-script-boundaries` 从 59 降到 56；剩余项主要是 script `parseArgs/isRecord/JSON.parse`、`rollback` update/package wording 与 `test-lanes.mjs` 的 `drilldown` observability wording，仍按 owner-decision worklist 管理。

## Phase 3/4 Queue Vocabulary Temporal Handoff Lane 2026-07-03

本 lane 只强化 Runway queue lifecycle readback 的 Temporal handoff/projection 边界，不启动真实 Temporal service，不写 runtime DB/provider queue data，不声明 runtime ready。

- Source/readback：`queue_lifecycle_boundary` / `temporal_durable_lifecycle_handoff` 现在把 `lease`、`dead_letter`、`max_attempts` 等旧 SQLite queue vocabulary 明确降级为 projection / operator handoff readback，并要求 Temporal workflow history/query、retry policy、failure history、stage attempt identity、projection repair / retirement receipt 才能关闭 migration gap。
- Reconciler boundary：Runway reconcile/control-loop 在该 gate attention 时只输出 read-only observation，不给 scheduler mutation、domain progress、domain ready 或 provider-backed runtime ready claim。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/brand-modules-cases/runway-control-loop.ts` 30/30 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`git diff --check` pass。
- Residual boundary：stage attempt durable lifecycle 仍需后续从真实 Temporal workflow/activity/schedule/history 与 OPL authority projection rebuild/link；该项继续保持 `must_migrate`，不能用 readback/test green 代替 live Temporal migration。

## Source Module Boundary Cleanup Foldback 2026-07-03

本轮吸收了与 reuse-first 并行暴露出的 source module boundary cleanup，目标是减少跨模块深 import 和重复 helper，不改变 runtime/domain authority。

- Source：`runtime-state-paths` 迁到 kernel shared helper；`refs-only authority boundary` 迁到 kernel helper；StageRun cockpit / MAS owner-answer projection 从 console 投影面移回 stagecraft owner，并通过 thin public entry 暴露。
- Fresh evidence：`npm run source:modules` status=ok，source-module/app-state/runtime-app-operator-drilldown focused tests 29/29 pass，合并后 `npm run typecheck`、`npm run build`、`npm test` smoke 与 reuse-first diff gate 均通过。
- Boundary：该 cleanup 不声明 runtime readiness、domain ready、owner acceptance 或 release currentness；dependency cycle 仍是 source-module advisory，不作为本轮 closeout claim。

## Source Module Owner Alignment Foldback 2026-07-03

本 lane 继续把 source module 的物理 owner 与公共 entrypoint 归位，不改变 runtime/domain authority，不声明 dependency cycle 完成清零。

- Source：通用 `json-record`、OPL runtime endpoint、system preferences 收进 `kernel`；App release user-path evidence ledger 收进 `Ledger`；stage replay missing receipt workorder 收进 `Stagecraft`；stage-attempt tray projection parts 收进 `Runway`；相关 callers 改为通过 owning module public entry 或 thin public entry 引用。
- Contract/docs：`module-dependency-policy.json` 增加第一批 forbidden dependency pairs，把 `ledger -> runway`、`stagecraft -> runway`、`workspace -> console` 等方向穿透列为可执行 source-boundary 约束；`docs/status.md` 与 source-module reference 文档同步说明该口径只证明 owner/import gate。
- Fresh evidence：`npm run source:modules` 返回 `status=ok`，deep import violation 为 0，forbidden dependency violation 为 0；cycle 仍是 advisory，不能写成 source dependency 全局完成。

## Family Action Catalog Kernel Owner Foldback 2026-07-03

本 lane 继续收薄 source module 边界，把 family action catalog contract 从 Console 实现面迁到 brand-neutral `kernel` owner；Console 只保留 thin re-export facade，Atlas / Connect / Foundry Lab / Pack / Stagecraft 等消费者改为直接读取 kernel owner。该改动不改变 action catalog schema、generated surfaces、stage admission、proof bundle、domain truth、owner receipt、typed blocker、runtime DB/provider queue 或 release artifact。

- Source：新增 `src/kernel/family-action-catalog-contract.ts` 并从 `src/kernel/types.ts` 暴露类型；`src/modules/console/family-action-catalog-contract.ts` 降为兼容薄入口；Atlas domain manifest、Connect generated plugin、Foundry Lab conformance/generated interface、Pack repo descriptor、Stagecraft human-review/admission/proof-bundle 调用方改为从 kernel 读取 shared contract。
- Reuse-first boundary：new kernel contract 复用 `src/kernel/json-record.ts` 的 JSON record / scalar helpers，不新增模块私有 `isRecord` / `optionalString` helper；`npm run reuse-first:scan:diff -- --strict` 对该 diff 返回 clean。
- Fresh evidence：focused family stage tests 36/36 pass，`npm run typecheck` pass，`npm run source:modules` status=ok，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`git diff --check` pass；合并后 `origin/main` 为 `38bc528e`。该证据只证明 shared action catalog owner/import/reuse-first diff gate 切片，不证明 domain ready、App release ready、owner acceptance 或 production readiness。

## Phase 1/2 Atlas And Entrypoint JSON Boundary Foldback 2026-07-03

本 lane 继续消化 schema/CLI handwritten boundary worklist，只迁移低冲突 JSON helper；不改变 command semantics、manifest/readback output shape、domain truth、owner receipt、typed blocker、runtime DB/provider queue 或 release artifact。

- Entrypoint CLI：`agent-lab-public-command-specs.ts`、`runtime-app-release-evidence-command-spec.ts`、`runtime-oma-app-live-path-command-spec.ts`、`okf.ts`、`scholar-skills.ts` 与 `agent-lab-public-payloads.ts` 复用 `src/entrypoints/cli/modules/json-boundary.ts`，删除局部 `isRecord` / `optionalString` / `JSON.parse` helper；`d181aa7a` 只补 OKF parsed pack input 的类型边界。
- Atlas：`domain-manifest/shared-utils.ts`、`projection-cache.ts`、`resolver.ts` 与 `family-domain-memory-contract.ts` 复用 `src/kernel/json-record.ts`，把 Atlas first-slice handwritten JSON helper 收回 shared boundary。
- Fresh evidence：CLI lane focused tests 70/70 pass，Atlas lane focused tests 18/18 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok；full scan readback 当前 `handwritten_json_boundary=1008`，entrypoint path findings 从 52 降到 40，Atlas handwritten JSON findings 从 14 降到 7。该证据只证明本批 helper 收敛，不声明 CLI parser 全量完成、schema boundary 完成、domain ready、release ready 或 owner acceptance。

## Source Ref And Runtime Snapshot Provider Foldback 2026-07-03

本 lane 继续收薄 source-module 方向依赖，把 source refs 与 runtime snapshot dependency 从 Console implementation 中拆出；不改变 runtime truth、App operator truth、domain authority 或 release/currentness claim。

- Source refs：新增 `src/kernel/source-ref.ts`，`runtime-tray-snapshot-utils.ts` 与 Foundry Lab OMA consumption 改用 kernel helper，避免 source-ref normalization 继续绑定 Console 投影面。
- Runtime snapshot provider：新增 `src/modules/runway/runtime-tray-snapshot-provider.ts`，Runway 的 evidence-worklist、runtime action execution 与 observability export 不再直接 import Console `buildRuntimeTraySnapshot`；CLI/App Console caller 显式注入 Console-owned snapshot provider。
- Fresh evidence：focused `family-runtime-evidence-worklist` / `family-runtime` / `runtime-observability-export` / `app-action` tests 30/30 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`git diff --check` pass，`npm run source:modules` status=ok；source-module readback 中 `runway -> console` pair 已消失，dependency cycle 仍是 advisory。该证据只证明 owner/import direction 收薄，不证明 runtime ready、Temporal live migration、domain ready、App release ready 或 production readiness。

## Foundry Readiness Console Boundary Foldback 2026-07-03

本 lane 继续收薄 source-module 方向依赖，把 Foundry Lab 的 readiness / maturity readout 从 Console implementation 前置依赖中拆出；不改变 App/operator projection owner、runtime truth、domain authority、owner receipt、typed blocker、release/currentness claim 或 production readiness。

- Runtime snapshot provider：`framework readiness`、`framework readiness --detail compact` 和 `framework operating-maturity` 改为接收 `runtimeSnapshotProvider`；public CLI caller 显式注入 Console-owned `buildRuntimeTraySnapshot`，Foundry Lab 不再直接 import Console snapshot builder。
- Evidence action projection：App release user-path evidence 的 payload template / ref hints / workorder helper 迁入 Ledger public surface；Foundry Lab 的 readiness next-safe-action 直接消费 Ledger payload helper 和 snapshot 中的 refs-only evidence，不再从 Console 读取 framework action helper。
- Contract/docs：`module-dependency-policy.json` 新增 enforced `foundry-lab -> console` forbidden dependency；source-module reference 文档同步记录 Console 已从 dependency-cycle SCC 中退出。
- Fresh evidence：`npm run source:modules` 返回 `status=ok`、`deep_import_violations=0`、`forbidden_dependency_violations=0`，`foundry-lab -> console` pair 消失，dependency-cycle SCC 从 10 模块 / edge_count 57 收薄到 9 模块 / edge_count 47；focused readiness / maturity / app-release-user-path tests 39/39 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`npm test` smoke 76/76 pass。该证据只证明 Foundry / Console owner boundary 与 import gate 收薄，不证明 strict cycles 全部完成、App release ready、domain ready、owner acceptance 或 production readiness。

## Charter Error Boundary Foldback 2026-07-03

本 lane 把 Framework 通用错误词汇从 Charter public entrypoint 使用面收回到 `kernel` owner，避免 Atlas / Connect / Console / Foundry Lab / Ledger / Pack / Runway / Stagecraft / Workspace 因为只需要 `FrameworkContractError` 而额外依赖 Charter；不改变错误码、JSON error shape、CLI exit code、contract truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 Brand L5 状态。

- Source：非 Charter 模块中的 `FrameworkContractError` import 改为直接读取 `src/kernel/contract-validation.ts`；Charter 继续通过 `src/modules/charter/contracts.ts` re-export 该错误类，以保持 Charter 自身 contract validator 和旧 public entrypoint 行为。
- Boundary：该改动只移动 shared error vocabulary 的 source owner，不把 Charter contract truth 上收到 kernel，也不把 domain truth、App/operator projection 或 Connect provider receipt 改写成 kernel authority。
- Fresh evidence：`npm run typecheck` pass，`npm run source:modules` 返回 `status=ok`、`deep_import_violations=0`、`forbidden_dependency_violations=0`，dependency-cycle SCC edge_count 从 47 继续收薄到 44；`npm run reuse-first:scan:diff -- --strict` 返回 `gate_status=ok`；`npm test` smoke 76/76 pass；`npm run test:fast` pass。该证据只证明 error-boundary import direction、test-lane ownership 和 no-resurrection diff gate 收薄，不证明 strict cycles 全部完成、production ready、domain ready、owner acceptance、App release ready 或 Brand L5。

## Workspace Topology and Owner Id Foldback 2026-07-03

本 lane 把 workspace topology profile 从 Foundry Agent series 内联定义迁回 Workspace owner，避免 Workspace 为读取自身 topology profile 反向依赖 Foundry Lab；同时把通用 owner id normalization 从 Connect 收回到 `kernel` shared primitive，避免 Ledger / Foundry Lab 为通用 owner alias 依赖 Connect；不改变 Foundry Agent series 合同含义、workspace layout、Project Unit / Stage Artifact Unit 语义、domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 Brand L5 状态。

- Source：新增 `WORKSPACE_TOPOLOGY_PROFILE_CONTRACT` 作为 `src/modules/workspace/workspace-topology.ts` 的 Workspace-owned public contract；Foundry Lab 的 `STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.workspace_topology_profile` 改为消费该 Workspace public contract。
- Kernel helper：新增 `src/kernel/owner-id.ts`，Connect 继续 re-export `canonicalOwnerId` 以保留 public surface，Ledger / Foundry Lab 直接消费 kernel owner。
- Boundary：该改动只移动 topology profile 与 owner id normalization 的 source owner，不把 Foundry Lab 的 agent scaffold / work order / canary authority 上收到 Workspace，也不把 Workspace protocol、Connect connector authority 或 Ledger evidence authority 改写成 kernel authority。
- Fresh evidence：`npm run typecheck` pass，`npm run source:modules` 返回 `status=ok`、`deep_import_violations=0`、`forbidden_dependency_violations=0`，dependency-cycle SCC edge_count 从 44 继续收薄到 35，Workspace 不再进入 SCC；focused scaffold / workspace norm tests 3/3 pass。该证据只证明 Workspace topology 与 owner id import direction 收薄，不证明 strict cycles 全部完成、production ready、domain ready、owner acceptance、App release ready 或 Brand L5。

## Source Owner Follow-up Lanes 2026-07-03

本轮继续把几类已经明确归属的 source owner 收薄到实际 owner，减少 Console / Connect / Ledger / Pack / Charter 之间的语义错位；不改变任何 domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 Brand L5 状态。

- Console / Product Entry：`buildProductEntryHandoffBundleView` 迁到 `src/modules/console/product-entry-handoff-bundle.ts`，Ledger 只保留 evidence vocabulary，不再承载 Product Entry handoff builder。
- Foundry Lab：developer-mode closeout ledger 实现迁到 Foundry Lab owner，Connect 旧路径仅保留兼容调用面所需的 thin shim；CLI active caller 直接消费 Foundry Lab owner。
- Pack：repo generated-interface bundle 组装收回 Pack，Connect generated plugin 只消费 Pack public helper，不再重复拼装 repo contract descriptor / generated interface read model。
- Charter：contract loader 使用的 domain / workspace / pack / ScholarSkills contract validators 迁入 `src/modules/charter/contract-validators/`，Charter 直接持有合同加载校验；Atlas / Workspace / Pack 不再为了服务 contract loader 持有这些 validator source。
- Fresh evidence：`npm run typecheck` pass；`npm run source:modules` 返回 `status=ok`、`deep_import_violations=0`、`forbidden_dependency_violations=0`，dependency-cycle SCC 不含 Console / Workspace，edge_count 为 31；focused handoff / ScholarSkills / developer-mode / contract / workspace / conformance tests 通过；`npm run reuse-first:scan:diff -- --strict` gate_status=ok。该证据只证明 source owner alignment 和 no-resurrection diff gate，不证明 strict cycles 全部完成、runtime ready、domain ready、owner acceptance、App release ready、production ready 或 Brand L5。

## OPL Connect Reference Verification Lane 2026-07-03

本 lane 把引用 metadata 校验从领域 prompt / 手写脚本候选沉淀为 OPL Connect 的只读 provider receipt surface，不写 MAS truth，不签 owner receipt，不创建 typed blocker。

- Source/CLI：新增 `opl connect references verify --references-file <json> --providers crossref,pubmed,openalex,semantic-scholar,crossmark,publisher --cache-root <path> --max-retries <n> --json`，输出 Crossref / PubMed / OpenAlex / Semantic Scholar / Crossmark / Publisher provider evidence、provider receipt candidate、cache hit/miss/write、retry attempts 和 no-authority boundary；Crossmark 通过 DOI/Crossref-backed metadata 只读投影，Publisher 通过 DOI resolver landing page metadata lookup 形成 receipt candidate，不下载全文、不验证 paywalled full-text body，也不伪装成 reference truth。
- Registry/docs：`connect references verify` 进入 `cli-command-registry.json` 与 Connect public command spec；新增人读支撑文档 `docs/active/opl-connect-reference-verification.md`，`docs/status.md` 和 decisions 明确引用质量、claim-evidence map、publication-ready 和 domain-ready 仍归 MAS/domain owner。
- Verification：fresh focused `node --test --experimental-strip-types tests/src/cli/cases/connect-reference-verification.test.ts tests/src/cli/cases/cli-command-registry.test.ts` 11/11 pass，`npm run typecheck` pass，`npm run build` pass，`npm test` smoke 76/76 pass；`connect-reference-verification.test.ts` 也已纳入 fast lane。该证据只证明 provider metadata readback / cache / retry / registry surface，不证明 citation correctness、paper evidence quality、domain ready 或 production ready。

## Phase 1/2 Runtime CLI JSON Boundary Fourth Lane 2026-07-03

本 lane 继续收敛 runtime CLI command spec 的局部 JSON/readback helper，不改变命令语义、ledger 写入语义、JSON output shape 或 authority boundary。

- Source：`runtime-stage-transition-authority`、`runtime-stage-run-authorization`、`runtime-research-hypothesis-portfolio`、`runtime-research-evidence-pack` 四个 command spec 复用 `src/entrypoints/cli/modules/json-boundary.ts` 的 `readJsonObject` / `readOptionalString` / `readStringList`，删除局部 `isRecord` / `optionalString` / `JSON.parse` parser。
- Fresh evidence：focused tests `runtime-stage-transition-authority.test.ts`、`runtime-stage-run-execution-authorization-ledger.test.ts`、`runtime-research-hypothesis-portfolio-read-model.test.ts`、`runtime-research-evidence-pack-read-model.test.ts` 21/21 pass；`npm run reuse-first:scan:diff -- --strict` gate_status=ok。该证据只证明这 4 个 command specs 的 boundary 收敛，不声明 CLI parser 全量完成、runtime readiness 或 owner acceptance。
- Residual boundary：`runtime-app-release-evidence`、`runtime-oma-app-live-path` 与其他 src/modules JSON/readback helpers 仍在 historical migration worklist；full scan 当前仍有 `handwritten_json_boundary=1029`。

## Additional Platform Landing Lanes 2026-07-03

本轮还吸收了三条与 reuse-first 平台能力相关的并行 lanes；它们都只声明 OPL 本仓 contract/source/readback 可执行，不声明外部 owner acceptance、release/currentness ready、domain ready 或 production ready。

- OPL Connect external scientific skills：新增 `connect external-skills sources add|list|search|inspect|sync` 与 source registry/readback，允许登记 repo、pin 和可选本地 checkout 路径，默认只做显式 source checkout 的 single-skill selective sync；不 vendor 外部 skill library，不默认安装全量技能，不写 MAS domain truth。Fresh focused evidence：`connect-external-skills.test.ts` + `cli-command-registry.test.ts` + `contracts-entry.test.ts` 42/42 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok。
- OPL Connect external skill metadata：skill card / sync receipt 现在暴露 `source_license`、`category`、`keywords`、`risk_flags`、`has_scripts` 与 single-skill selector；这些字段只用于发现、审阅、策略判断和显式 selective sync，不把外部 skills 变成 MAS 默认能力或 domain authority。Fresh focused evidence：`node --test --experimental-strip-types tests/src/cli/cases/connect-external-skills.test.ts` 8/8 pass，`npm run typecheck` pass，`npm run source:modules -- --strict-imports --strict-cycles` status=ok，`npm run reuse-first:scan:diff -- --strict` finding_count=0，`npm test` smoke 81/81 pass。
- OPL Connect reference verification：新增 `connect references verify` provider receipt readback，Crossref / PubMed / OpenAlex / Semantic Scholar / Crossmark / Publisher 可执行；Publisher 只证明 DOI landing page metadata lookup，不判断 citation truth，不写 MAS domain truth。Fresh focused evidence：reference verification + command registry tests 11/11 pass，typecheck/build/smoke pass，fast lane includes the new test.
- OPL Ledger artifact provenance events：新增 `artifact-provenance-ledger-event.schema.json` 与 artifact provenance issue event record/inspect/doctor/export readback，记录 refs、hash、section issue 和 authority boundary；不读 artifact body，不签 owner receipt，不授权质量/export verdict。Fresh focused evidence：`artifact-provenance-bundle-ledger.test.ts` 4/4 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok。
- Agent Lab self-evolution work orders：新增 failure token registry、self-evolution work-order schema、FeedbackOps capability-hit readback、capability_map self-evolution routing guard 与 `opl work-order execute --dry-run` no-write planning receipt，把失败证据路由到 capability map / owner closeout boundary，并允许执行前验证 target repo、verification command、forbidden surface 与 closeout boundary；不创建第二 runner/queue，不写 target domain truth，不创建 typed blocker 或 owner receipt。Fresh focused evidence：`agent-lab-feedbackops.test.ts` 6/6 pass，work-order/scaffold focused tests 24/24 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok。

## Phase 1 JSON Boundary Tranche Foldback 2026-07-04

本轮继续处理 `handwritten_json_boundary` worklist，只做行为保持的 shared JSON boundary 迁移，不改变 action 执行语义、managed update receipt 语义、OMA ledger readback 语义、domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 production readiness。

- Console action：`app-state-parts/action-execute.ts` 删除局部 `isRecord` / `JSON.parse` / string trim helper，复用 `kernel` JSON record helper；`app.action execute` payload shape 和 authority boundary 不变。
- Managed update receipt：`managed-update-component-receipts.ts` 复用 `readJsonPayloadFile()`、`optionalStringValue()`、`stringArrayValue()`；`post_apply_hooks` 保持原始 string 数组语义，不做 trim/drop empty；receipt projection 继续 `package_manager_claim=false`，不写 release/currentness truth。
- Foundry Lab OMA ledgers：`oma-app-live-path-ledger.ts`、`oma-production-consumption-ledger.ts`、`oma-long-soak-observation.ts` 删除局部 JSON/scalar helpers，复用 shared JSON boundary；该迁移只降低 OMA readback helper 分散度，不授权 domain repo physical delete、owner acceptance 或 domain ready。
- Absorption：三条隔离 worktree lane 已按 stable patch-id 等价吸收进 `main`，对应 main commits 为 `b918cce3`、`53225387`、`99a20703`；lane worktree/branch 已清理。Fresh evidence：focused JSON-boundary tests 35/35 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`npm run source:modules` status=ok，`npm test` smoke 76/76 pass；full reuse-first scan 从 3039 降到 3024，`handwritten_json_boundary` 从 950 降到 936，`custom_update_or_package_manager` 从 251 降到 250。

## Phase 1 Charter / Console JSON Boundary Foldback 2026-07-04

本轮继续消化 `phase1-src-modules-schema-cli-boundaries` worklist，只收薄 Charter 与 Console 中已经明确可共享的 JSON boundary；不改变 advisory knowledge、L5 evidence、source structure readback、App state、release channel、runtime activity、domain truth、owner receipt、typed blocker、release/currentness claim 或 production readiness。

- Charter：`advisory-knowledge-boundary.ts`、`brand-module-l5-evidence-ledger.ts`、`source-structure-operator-readback.ts` 复用 `kernel` JSON record / JSON file helpers；`advisory` projection 中的 string list 保留原有 whitespace 行为，避免把边界收薄混成数据语义变更。
- Console：`app-state-current-owner-delta.ts`、`app-state-release.ts`、`app-state-runtime-activity.ts`、`app-state.ts`、`automation-companions.ts` 删除局部 `isRecord` / `optionalString` / `JSON.parse` helper，改用 shared JSON boundary；App release / runtime activity 仍是 readback/projection，不新增 App release/currentness truth。
- Absorption：两条隔离 worktree lane 已吸收进 `main`，对应 main commits 为 `8af64c3b` 与 `d3be40da`；同批还包含 `652226c4` 的 Charter JSON file helper 收薄。Fresh evidence：focused Charter / Console tests 28/28 pass，`npm run typecheck` pass，`npm run reuse-first:scan:diff -- --strict` gate_status=ok，`npm run source:modules` status=ok，`npm test` smoke 76/76 pass；full reuse-first scan 从 3024 降到 3009，`handwritten_json_boundary` 从 936 降到 921。

## Source Module Owner DAG Foldback 2026-07-04

本轮继续收薄 source module DAG，只移动已经有稳定使用面的 shared owner，不改变 CLI output schema、stage routing semantics、runtime/domain authority、owner receipt、typed blocker、runtime DB/provider queue、release artifact 或 production readiness。

- Kernel：承接跨模块 neutral helpers，包括 workspace root、managed shell command env、default caller retirement/surface gates、standard domain-agent family repos 与 ScholarSkills module ids。Workspace / Connect / Foundry Lab 保留 thin compatibility exports。
- Pack：承接 Standard Agent Pack ABI 与 functional privatization audit / envelope / private-platform residue deletion gate；Foundry Lab 保留 compatibility wrappers 和 OMA replay receipt adapter。
- Stagecraft：承接 stage policy、typed blocker lineage policy、progress delta policy 与 stage manifest structural readback；Runway 通过显式 manifest loader 注入使用 stagecraft，避免 stagecraft 反向依赖 Atlas。
- Charter / Atlas：standard agent registry 归 Charter owner，Atlas 保留 public route / compatibility surface。
- Absorption：source module owner DAG 的代码变更已吸收进 `main`，对应 main commit 为 `8da4306f`。Fresh evidence：`npm run typecheck` pass；focused stage/scaffold/public command tests 17/17 pass；`npm run source:modules -- --strict-imports` 返回 `status=ok`、`deep_import_violations=0`、`forbidden_dependency_violations=0`，dependency-cycle SCC 不含 Console / Workspace / Charter / Stagecraft，edge_count 从 31 收薄到 15；`npm test` smoke 76/76 pass；full reuse-first scan 仍为 3009 findings，全部 decisioned，undecisioned=0。该证据只证明 source owner DAG 和 import gate 收薄，不证明 strict cycles 全部完成、runtime ready、domain ready、owner acceptance、App release ready、production ready 或 Brand L5。

## Phase 1 Console Drilldown JSON Boundary Foldback 2026-07-04

本轮继续消化 Console operator drilldown helpers 中的局部 JSON/scalar helper，只把 `record`、`recordList`、`stringValue`、`stringList` 和 `countValue` 收回到 `kernel/json-record.ts`；不改变 runtime tray readback、operator drilldown payload、domain truth、owner receipt、typed blocker、release/currentness claim 或 production readiness。

- Console drilldown：`runtime-tray-app-operator-drilldown-parts/value-utils.ts` 改为复用 shared JSON record helper，其余 drilldown part 文件删除局部 `record` / `stringValue` / `stringList` / `numberValue` 形态的重复 helper。
- Console runtime tray：`runtime-tray-snapshot-utils.ts`、runtime tray display / evidence / ingestion / workbench / status narration 等 readback helper 继续复用 shared JSON record helper，保持 readback/projection 语义。
- Fresh evidence：`npm run typecheck` pass；focused Console / App / Product Entry tests 26/26 pass；`git diff --check` pass；`npm test` smoke 76/76 pass；full reuse-first scan 从 3009 降到 2962，`handwritten_json_boundary` 从 921 降到 874，`accepted_migration_worklist` 从 740 降到 693。该证据只证明 Console drilldown/runtime tray JSON boundary 收薄，不证明 App runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Phase 1 Connect System Installation JSON Boundary Foldback 2026-07-04

本轮继续消化 Connect system-installation 的局部 JSON helper，只把 Docker/WebUI doctor、engine action/update receipt、framework self-update、module package channel、packaged module marker、module workflow stdout JSON 与 seed manifest 读取接回 `kernel` shared JSON boundary；不改变 install/update 执行语义、App release truth、runtime currentness、owner receipt、typed blocker、release-ready 或 production-ready claim。

- Connect system-installation：`docker-webui-doctor.ts`、`engine-actions.ts`、`engine-helpers.ts`、`environment.ts`、`framework-self-update.ts`、`module-action-workflow.ts`、`module-package-channel.ts`、`module-packaged.ts`、`modules.ts`、`seed-manifest.ts` 复用 `parseJsonText()`、`readJsonFileOrNull()`、`readJsonPayloadFile()`、`isRecord()` 与 `stringValue()`；`shared.ts` 修正 modular layout 下的 project root 解析，`framework-self-update.ts` 的 framework root 判定接受 target CLI entrypoint，`local-codex-defaults.ts` 修正 modular source layout 下的 bundled profile path，`system-update-management.test.ts` 的 framework runtime sentinel 跟随 `src/modules/runway/**`；`src/modules/connect/system-installation/**` 的 `handwritten_json_boundary` diff findings 清零。
- Fresh evidence：`npm run typecheck` pass；focused system-install / system-update / startup-maintenance / engine / module / seed / package-channel tests 75/75 pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；`npm test` smoke 76/76 pass；full reuse-first scan 从 2962 降到 2941，`handwritten_json_boundary` 从 874 降到 853，`accepted_migration_worklist` 从 693 降到 664。

## Phase 1 Connect Skill-Pack JSON Boundary Foldback 2026-07-04

本轮继续消化 Connect skill-pack / ACP / Developer Mode / generated plugin / managed install-update ledger，以及 Pack privatization / Console tray snapshot / Charter contract loader 的局部 JSON helper，把 Foundry Agent series contract 读取、plugin manifest 读取、packaged module marker 读取、specialist skill sync marker 读取、Developer Mode GitHub fixture 读取、managed install/update ledger 与 lock 读写、ACP bridge payload record/string 读取、ACP stdio JSONL 读取、Pack residue gate 投影与 Charter contract JSON 读取接回 `kernel` shared JSON boundary；不改变 skill sync scope、project/workspace/quest/codex 安装语义、ACP payload contract、domain truth、owner receipt、typed blocker、release-ready 或 production-ready claim。

- Connect / Pack / Console / Charter：`opl-skills.ts`、`opl-skills-parts/sync.ts`、`managed-install-update-ledger.ts`、`opl-acp-bridge.ts`、`opl-acp-stdio.ts`、`developer-mode-source-policy.ts`、`managed-update-lock.ts`、`managed-update-kernel-runner.ts`、`opl-skills-parts/generated-plugin.ts`、`functional-privatization-audit.ts`、`private-platform-residue-deletion-gate.ts`、`runtime-tray-domain-projection-ingestion.ts`、`runtime-tray-snapshot-utils.ts` 与 `contracts.ts` 复用 `parseJsonText()`、`readJsonFileResult()`、`readJsonFileOrNull()`、`writeJsonPayloadFile()`、`isRecord()` 与 `stringValue()`；`json-file.ts` 新增 centralized JSON payload serialization/write helper，后续 ledger/package/workspace JSON 写入应优先复用该 helper。
- Fresh evidence：`npm run typecheck` pass；focused Connect skill sync / ACP stdio / managed install-update / Developer Mode tests 66/66 pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full reuse-first scan 从 2941 降到 2918，`handwritten_json_boundary` 从 853 降到 830，`accepted_migration_worklist` 从 664 降到 641。

## Phase 1 Ledger / Runway JSON Boundary Foldback 2026-07-04

本轮继续吸收两条隔离 worktree lane，只做行为保持的 JSON boundary 迁移，不改变 artifact provenance authority、stage attempt lifecycle、stop-loss admission policy、domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 production readiness。

- Ledger artifact provenance：`artifact-provenance-bundle.ts` 复用 `parseJsonText()`、`readJsonPayloadFile()`、`writeJsonPayloadFile()`、`isRecord()`、`stringValue()` 与 `uniqueStringList()`；bundle manifest / ledger file 仍是 refs/hash/issue readback，不读 artifact body，不签 owner receipt，不授权质量或 export verdict。
- Runway stop-loss successor：`family-runtime-stop-loss-successor-policy.ts` 复用 `parseJsonText()`、`record()` 与 `stringValue()`；反循环 stop-loss successor admission 的 payload、closeout refs 与 policy event 解析语义保持不变，durable lifecycle 仍未迁到真实 Temporal history。
- Absorption：Runway lane `ec8e377f` 与 Ledger lane `8496ad50` 已 cherry-pick 吸收为 main commits `bf5853e5` 与 `7f6e3d38`。Fresh evidence：`npm run typecheck` pass；focused stop-loss successor / artifact provenance ledger tests 10/10 pass；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full reuse-first scan 从 2918 降到 2909，`handwritten_json_boundary` 从 830 降到 821，`accepted_migration_worklist` 从 641 降到 632。

## Phase 1 Foundry / Runway JSON Boundary Foldback 2026-07-04

本轮继续吸收三条隔离 worktree lane，只做行为保持的 shared JSON boundary 迁移，不改变 work-order execution、executor selection、queue projection、stage attempt lifecycle、domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 production readiness。

- Foundry Lab work-order execution：`agent-lab-work-order-execution.ts` 复用 `parseJsonText()`、`writeJsonPayloadFile()`、`isRecord()`、`stringValue()` 与 `stringList()`；work-order execute 仍只产出 source patch / closeout refs，不写 target domain truth。
- Runway agent executor：`agent-executor.ts` 复用 `parseJsonText()`、`isRecord()` 与 `stringValue()`；Codex CLI 仍是 default executor，非默认 executor 仍是 adapter receipt only 且 fail-closed。
- Runway runtime store：`family-runtime-store.ts` 复用 `parseJsonText()` 与 `isRecord()`；SQLite queue/event/notification payload 仍是 projection/readback surface，不升级为 Temporal durable lifecycle truth。
- Absorption：Foundry lane `77f0df17`、Runway executor lane `bac5d164` 与 Runway store lane `3a4e6c69` 已 cherry-pick 吸收为 main commits `925c6985`、`65f0903a` 与 `fb5a52e8`。Fresh evidence：`npm run typecheck` pass；focused work-order / agent-executor / runtime-store tests 110/110 pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full reuse-first scan 从 2909 降到 2897，`handwritten_json_boundary` 从 821 降到 809，`accepted_migration_worklist` 从 632 降到 620。

## Phase 1 Foundry / Ledger Shared JSON Boundary Foldback 2026-07-04

本轮继续吸收 Foundry Lab 与 Ledger 的 shared JSON boundary lane，只做行为保持的 helper 收薄，不改变 default caller delete gate、framework readiness attention、Agent Lab suite readback、current owner delta、domain dispatch evidence、production evidence tail、long-soak evidence、domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 production readiness。

- Foundry Lab readiness / default-caller readback：`agent-default-caller-delete-read-model.ts`、`agent-lab-work-order-execution-surfaces.ts`、`agent-readiness.ts`、`framework-readiness-attention-actions.ts`、`framework-readiness-attention-first-payload.ts`、`framework-readiness-owner-delta-handoff-summary.ts`、`framework-readiness-semantic-hygiene.ts`、`framework-readiness-typed-blocker-attention.ts` 与 `private-platform-residue-owner-decisions.ts` 复用 shared JSON record/string/list helpers；readback 仍只表达 delete gate、attention payload 与 owner decision，不授权 physical delete、domain ready 或 owner acceptance。
- Ledger current-owner / evidence dispatch：`current-owner-delta-parts/values.ts`、`current-owner-delta-stage-run-closeout.ts`、`current-owner-delta-topline.ts`、`domain-dispatch-evidence-identity-guidance.ts`、`domain-dispatch-evidence-payload-preflight.ts`、`domain-dispatch-evidence-payload-refs.ts`、`domain-dispatch-evidence-workorder-packet.ts`、`evidence-envelope.ts`、`evidence-requirement.ts`、`external-evidence-receipt-classification.ts` 与 `production-evidence-tail-ledger.ts` 复用 shared JSON helpers；Ledger 继续保持 refs / classification / preflight projection，不签 domain receipt、不写 artifact body、不替代 owner verdict。
- Foundry Lab Agent Lab suite readback：`agent-lab-ahe-evidence.ts`、`agent-lab-codex-attempt-flywheel.ts`、`agent-lab-developer-mode.ts`、`agent-lab-efficiency-nonregression.ts`、`agent-lab-executor-capability-aperture.ts`、`agent-lab-mechanism-inputs.ts`、`agent-lab-production-evidence.ts`、`agent-lab-promotion.ts`、`agent-lab.ts`、`family-domain-agent-skeleton.ts`、`opl-meta-agent-consumption-parts/shared.ts`、`opl-meta-agent-descriptor-adapter.ts`、`standard-domain-agent-conformance-utils.ts` 与 `standard-domain-agent-stage-pack-v2.ts` 继续复用 kernel/shared helpers；Agent Lab 仍是 evaluation / promotion / scaffold readback，不写 domain truth 或自动 owner receipt。
- Ledger evidence ledger continuation：`domain-owner-payload-summary-ledger.ts`、`external-evidence-ledger.ts`、`mag-manifest-sustained-consumption-ledger.ts`、`memory-artifact-lifecycle-evidence-ledger.ts`、`provider-long-soak-evidence-ledger.ts` 与 `standard-agent-template-consumption-ledger.ts` 复用 shared JSON file / record helpers；这些 ledger 继续保持 refs-only receipt projection，不把 long-soak、template consumption 或 owner payload summary 升级为 readiness / release / domain owner truth。
- Absorption：首批 Foundry lane `fb88d6b4` 与 Ledger lane `e2318b09` 已通过 `git cherry -v main <branch>` 证明 stable patch-id 等价，并吸收为 main commits `b269b30c` 与 `23dccfad`；后续 Foundry lane `117e770b` 与 Ledger lane `3f462a57` 已吸收为 main commits `4f7f40bb` 与 `bdab2d94`。Fresh evidence：lane-local `npm run typecheck` pass、`npm run reuse-first:scan:diff -- --diff-ref HEAD --strict` gate_status=ok、`git diff --check` pass；focused Foundry Agent Lab / readiness / scaffold / conformance tests 58/58 pass；focused Ledger evidence / long-soak / template / App release evidence tests 55/55 pass；main `npm run typecheck` pass；main `npm run reuse-first:scan:diff -- --strict` gate_status=ok；full reuse-first scan 从 2874 降到 2830，`handwritten_json_boundary` 从 786 降到 742，`accepted_migration_worklist` 从 597 降到 553。

## Phase 1 Runway / Foundry / Stagecraft / Scripts JSON Boundary Foldback 2026-07-04

本轮继续吸收四条隔离 worktree lane 与一个 root fixture repair，只做行为保持的 shared JSON boundary 迁移和完整 live-readback fixture 对齐，不改变 runtime lifecycle truth、stage authority、Foundry promotion authority、domain truth、owner receipt、typed blocker、runtime DB/provider queue、release/currentness claim 或 production readiness。

- Runway readback / projection：`codex-app-runtime-evidence-ledger.ts`、`codex-app-runtime-long-soak-observation.ts`、`family-runtime-codex-session-usage.ts`、`family-runtime-dispatch-command.ts`、`family-runtime-domain-intake.ts`、`family-runtime-redrive.ts`、`generic-substrate-projection.ts`、`native-helper-runtime.ts`、`native-index-summary.ts` 与 `runtime-task-companions.ts` 复用 shared JSON helpers；这些面继续是 runtime/readback/projection，不迁移 durable lifecycle truth。
- Foundry Lab residual boundary：`agent-lab-feedbackops.ts`、`agent-lab-rho-backend.ts`、`agent-lab-risk-tier-promotion-ledger.ts`、`agent-platform-surface-ownership.ts`、`developer-mode-closeout-ledger.ts`、`foundry-agent-cli-spine.ts`、`foundry-agent-os-owner-evidence-intake.ts`、`opl-meta-agent-production-acceptance.ts` 与 `research-hypothesis-portfolio.ts` 等残余文件复用 shared JSON helpers；`src/modules/foundry-lab/**` 的 `handwritten_json_boundary` full-scan count 已降为 0。
- Stagecraft boundary：stage admission、stage control-plane、stage proof/source/spec、stage run cockpit/kernel、stage transition authority、quality gate/runtime 与 stage replay missing receipt ledger 复用 shared JSON helpers；`src/modules/stagecraft/**` 的 `handwritten_json_boundary` full-scan count 已降为 0。
- Maintainer scripts：native helper pack/prebuild/repair/family smoke、package archives/release discipline、fresh install/new machine smoke、family shared release 与 GHCR cleanup 脚本复用 `scripts/script-json-boundary.mjs`；`phase0-maintenance-script-boundaries` 从 56 降到 37。
- OMA descriptor / stage replay receipts：`opl agents descriptor` 和 `family-runtime evidence-worklist` 增加 repo-tracked OMA descriptor / stage replay receipt 注入入口；current-control provider admission fixtures 补齐完整 `DomainProgressTransitionRuntime` live-readback 字段，避免测试继续依赖 legacy projection gap。
- Absorption：Runway lane `62f43123`、scripts lane `559a003c`、Foundry lane `eb06dc2e`、Stagecraft lane `df42c5fd` 已吸收为 main commits `f54de4b4`、`af585fd5`、`91626d67` 与 `7edceb47`；root fixture repair 为 `18cd8051`，OMA descriptor / receipt surfacing 为 `804d481a`。Fresh evidence：`npm run typecheck` pass；focused domain descriptor / evidence-worklist / provider-admission tests 39/39 pass；subagent focused Runway tests 35/35 pass、Foundry tests 62/62 pass、Stagecraft tests 128/128 pass；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full reuse-first scan 从 2830 降到 2706，`handwritten_json_boundary` 从 742 降到 618，`accepted_migration_worklist` 从 553 降到 449，`owner_decision_required` 从 181 降到 162。

## Phase 1/3/4 Runway Runtime Boundary Foldback 2026-07-04

本轮继续吸收三条 Runway shared JSON boundary lane，只做行为保持的 projection / lifecycle / operator readback helper 收薄；不改变 Temporal production substrate 目标、stage attempt durable truth、domain truth、owner receipt、typed blocker、runtime DB/provider queue、release/currentness claim 或 production readiness。

- Runtime projections：`family-runtime-domain-intake-*`、stage attempt projections、memory locator、package/export lifecycle、review repair queue 与 route-decision graph 继续复用 shared JSON boundary helper，减少 domain-intake / stage-attempt readback 的局部 validator。
- Enqueue / current-control：existing dedupe、semantic guard、default executor currentness、MAS maintenance 与 current-control command readback 复用 shared schema boundary helper；queue / dedupe 仍是 operator readback 与 migration input，不升级为 Temporal durable lifecycle truth。
- Runtime core：controlled apply、current-control state、dispatch task、lifecycle store、provider projection、Temporal terminal observation、Temporal history/visibility/service、operator action execution 与 task-scope readback 继续复用 shared JSON boundary helper；`family-runtime-store` 仍只是 projection/cache/audit surface，不能替代 Temporal history 或 owner receipt。
- Fresh evidence：`npm run typecheck` pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok；focused Runway/domain-intake/provider/runtime tests 395/395 pass；full reuse-first scan 当前为 2605 findings，`handwritten_json_boundary=517`、`accepted_migration_worklist=358`、`owner_decision_required=152`。

## Phase 0/2 Maintainer Script Parser Boundary Foldback 2026-07-04

本轮继续收薄 maintainer scripts，只把重复参数解析、JSON 读取和 object boundary 迁回共享 helper；不改变 release/package/update/currentness truth，也不把脚本包装成包管理器或 release authority。

- Source：`scripts/required-value-options.mjs` 承接 required value option parsing；`source-module-boundary.mjs` 复用 `script-json-boundary.mjs` 的 `isJsonObject`；`line-budget.mjs`、`reuse-first-scan.mjs`、`source-module-boundary.mjs`、`source-module-public-imports.mjs`、fresh-install smoke、package / cleanup / structure advisory / profile export scripts 复用 target CLI / shared helper 和 `script-json-boundary.mjs`。
- Boundary：`--strict` 等用户可见 flag 仍以显式常量保留，避免 helper 收薄把 literal flag 从 source 中抹掉后影响既有 line-budget/governance test。
- Fresh evidence：`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok；full scan 中 `scripts` path findings 当前为 23，hard findings 0；full scan 当前为 2601 findings，`custom_update_or_package_manager=247`。

## Atlas Manifest / OMA Registry Source Boundary Foldback 2026-07-04

本轮把 OPL Meta Agent registry extension 和 wrapper sidecar skeleton readback 放入 `opl domain manifests` 的正式投影路径，同时修正 modular source layout 下 Connect framework locator 的当前源码根；不改变 OMA production authority、domain ready、owner acceptance、manifest command authority 或 App/operator release truth。

- Atlas / Foundry consumer boundary：`opl domain manifests --json` 现在由 CLI consumer 通过 Foundry Lab wrapper 注入 `opl_meta_agent_registry` readback；Atlas catalog builder 自身不静态依赖 Foundry Lab，避免重建 source-module cycle。该 readback 只表达 OMA registry extension、production consumption followthrough 和 no-ready-claim summary，不写 domain truth、不签 owner receipt。
- Atlas manifest normalizer：standard domain-agent skeleton 可从 manifest wrapper sidecar 或内层 manifest 读取，支持 repo wrapper / sidecar 形态下的 standard skeleton discovery，而不把 wrapper 本身变成新的 truth owner。
- Connect framework locator：modular source layout 下 `current_cli_entry` resolution 以 repo root 为 framework root，避免 Connect 在 `src/modules/connect` 内误判 source root。
- Fresh evidence：`npm run source:modules -- --strict-imports` status=ok，deep import violations 为 0，forbidden dependency violations 为 0，dependency cycle 为 0；focused workspace-domain registry / skeleton / descriptor / framework locator / Connect external skills tests 26/26 pass；该证据只证明 manifest/readback/source-boundary 切片，不证明 OMA production ready、domain ready、owner acceptance 或 release/currentness ready。

## Phase 0 Package Release Verifier Boundary Foldback 2026-07-04

本轮只把 `scripts/package-release-discipline.mjs` 中 package-channel rollback 字段的用途标定为 release contract verifier，不把该脚本升级为 updater、package manager、runtime rollback executor 或 release/currentness authority。

- Source：`runtime_substrate_apply_and_rollback_tested` 与 `release_automation.rollback.strategy` 两处检查保留，因为它们验证既有 package-channel contract；代码行用 reuse-first allow marker 声明“verifier only”，避免 no-resurrection scan 把 verifier 误读成新增 update execution。
- Fresh evidence：focused package distribution / package surface tests 21/21 pass；`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok；full scan 从 2604 降到 2602，`custom_update_or_package_manager` 从 250 降到 248，scripts hard findings 从 3 降到 1。该证据只证明 script verifier boundary 分类收薄，不证明 package release ready、currentness ready 或 rollback execution readiness。

## Phase 0 GHCR Cleanup Protected Tag Boundary Foldback 2026-07-04

本轮把 GHCR cleanup 脚本的人工保留入口从 rollback 专用词收薄为显式 protected tag，保持 cleanup 只做 dry-run-first retention 工具，不把人工保留标签解释成 release rollback truth。

- Source：`scripts/cleanup-ghcr-package-versions.mjs` 使用 `--protected-tag <tag>` 和 `extra_protected_tags`，与 manifest 内置 `protected_tags` 合并计算 protected version ids；`rollback` 仍由 release manifest / channel manifest owning surface 表达，cleanup 脚本只消费显式保护集合。
- Fresh evidence：focused package distribution / package surface tests 35/35 pass；`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok；full scan 当前为 2601，`custom_update_or_package_manager` 当前为 247，scripts path findings 当前为 23，scripts hard findings 为 0。该证据只证明 cleanup protected-tag boundary 分类收薄，不证明 GHCR cleanup 已执行、package release ready、currentness ready 或 rollback execution readiness。

## Phase 1 Runway Command Payload JSON Boundary Foldback 2026-07-04

本轮只把 `family-runtime` command payload 的 JSON parse 收到 `kernel/json-file.ts` 的共享 parse helper；保留原有 CLI payload 必须是 JSON object 的 fail-closed 行为，不改变 runtime task payload、queue mutation、provider dispatch、owner receipt 或 typed blocker authority。

- Source：`src/modules/runway/family-runtime-command-parts/shared.ts` 的 `parsePayload` 复用 `parseJsonText`，本地仍检查 root object 并继续抛出 `cli_usage_error`。
- Fresh evidence：focused family-runtime / worker command tests 35/35 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --diff-ref main --strict` gate_status=ok；full scan 从 2601 降到 2600，`handwritten_json_boundary` 从 516 降到 515，Phase 1 migration worklist 从 40 降到 39。该证据只证明 command payload JSON boundary 收薄，不证明 runtime durable lifecycle、Temporal production readiness、domain ready 或 owner acceptance。

## Phase 1 Default Executor Receipt JSON Boundary Foldback 2026-07-04

本轮把 default-executor receipt recovery 的可选 JSON 文件读取改为复用 `kernel/json-file.ts` 的 fail-soft read helper；保留“文件缺失、JSON 无效或 root 非 object 时返回 null”的既有传输边界，不改变 MAS truth、default executor closeout authority 或 typed blocker 写入权限。

- Source：`src/modules/runway/family-runtime-codex-stage-runner-parts/default-executor-recovery.ts` 的 `readJsonRecordFile` 复用 `readJsonFileOrNull`，继续只把 object payload 作为 transport receipt candidate。
- Fresh evidence：focused family-runtime / worker / temporal terminal sync tests 50/50 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --diff-ref main --strict` gate_status=ok；full scan 从 2600 降到 2599，`handwritten_json_boundary` 从 515 降到 514，Phase 1 migration worklist 从 39 降到 38。该证据只证明 default-executor receipt JSON boundary 收薄，不证明 runtime durable lifecycle、Temporal production readiness、domain ready 或 owner acceptance。

## Phase 1 Runway Shared JSON Value Helper Foldback 2026-07-04

本轮继续收薄 Runway provider-hosted attempt value helper、provider followthrough 与 stage attempt closeout ledger 的 JSON / record / string list 边界；只复用 `kernel/json-record.ts`、`kernel/json-file.ts` 与 `kernel/contract-validation.ts` 的共享 helper，不改变 provider dispatch、stage attempt lifecycle、runtime queue mutation、owner receipt 或 typed blocker authority。

- Source：`family-runtime-provider-hosted-attempts-parts/values.ts` 复用共享 `isRecord`、`stringValue`、`recordList`、`stringList` 与 `uniqueStringList`；`family-runtime-parts/provider-followthrough.ts` 和 `family-runtime-stage-attempt-ledger.ts` 复用 `parseJsonText` / `record`，保留非 object root fail-soft 投影。
- Fresh evidence：focused provider-hosted attempts / stage attempt closeout ledger tests 120/120 pass；default-executor recovery tests 13/13 pass；`npm run typecheck` pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full scan 当前为 2593，`hard_gate_finding_count=1053`、`handwritten_json_boundary=508`、Phase 1 migration worklist 为 32。该证据只证明本批 Runway shared JSON helper 收薄，不证明 durable lifecycle 已迁到 Temporal、production readiness、domain ready 或 owner acceptance。

## Phase 0 Test Lane Registry Classification Foldback 2026-07-04

本轮只把 `scripts/test-lanes.mjs` 的 test file-name catalog hits 从 maintainer script owner-decision worklist 分离为 test harness projection boundary；不改变测试 lane 执行、CI、observability、runtime、release/currentness 或 production 语义。

- Contract：`reuse-first-historical-worklist.json` 新增 `phase0-test-lane-registry-file-catalog`，把 `scripts/test-lanes.mjs` 的 advisory `custom_observability_ledger` hits 标记为 test lane file catalog projection，false-ready guard 明确该分类不豁免 production observability 或 operator drilldown 迁移。
- Fresh evidence：`node --experimental-strip-types --test tests/src/reuse-first-scan.test.ts` 7/7 pass；`npm run reuse-first:scan:diff -- --diff-ref main --strict` gate_status=ok；full scan 仍为 `finding_count=2561`，但 `owner_decision_required` 从 148 降到 125，`phase0-maintenance-script-boundaries` 从 23 降到 0，`scripts/test-lanes.mjs` 的 23 个 advisory hits 转入 allowed projection boundary。该证据只证明 worklist 分类精度提升，不证明 observability Collector、runtime ready、release ready 或 owner acceptance。

## Phase 2 Update Command Registry Foldback 2026-07-04

本轮把 `opl update *` 这组高频 public command 纳入 CLI registry，并把 entrypoint 层剩余的 update / diagnostic drilldown 词项拆成命令投影边界；不改变 managed update kernel 的 owner route、组件执行语义、rollback 语义、runtime substrate、App release channel、domain truth 或 production readiness。

- Source：`public-command-specs-parts/update.ts` 删除私有 `parseUpdateArgs`，改用 `parseRegisteredCommandOptions`；`public-command-specs.ts` 把 `update` 加入 registry coverage；`cli-command-registry.json` 增加 `update status/check/plan/apply/repair/rollback` metadata、options、schema refs 与 no-domain-truth authority boundary。
- Contract：`reuse-first-historical-worklist.json` 新增 `phase2-update-command-registry-projection` 与 `phase2-diagnostic-drilldown-command-projection`，把 command names、help text 和 refs-only diagnostic terms 从 generic Phase 2 migration worklist 拆为 allowed projection boundary；`phase2-cli-entrypoint-boundaries` 当前为 0。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/cli-command-registry.test.ts` 8/8 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --diff-ref main --strict` gate_status=ok；full scan 仍为 `finding_count=2561`，但 `accepted_migration_worklist` 从 318 降到 278，`phase2-cli-entrypoint-boundaries` 从 40 降到 0，40 个 entrypoint hits 转入 allowed projection boundary。该证据只证明 CLI registry / worklist 边界推进，不证明 managed update split 完成、release ready、production ready 或 owner acceptance。

## Phase 4/5 Queue Projection Vocabulary Foldback 2026-07-04

本轮只处理非 durable mutation 的队列词汇投影，把 Console / Foundry Lab / Stagecraft 中用于 readback、owner-boundary、surface-alias 和 conflict envelope 的旧队列词汇集中到 kernel vocabulary；不改变 `family-runtime-store`、SQLite queue mutation、Temporal handoff、provider queue、owner receipt、typed blocker、domain truth 或 runtime readiness。

- Source：新增 `src/kernel/queue-projection-vocabulary.ts`，集中 `dead_letter`、`lease_owner`、`max_attempts` 等 projection vocabulary；Console drilldown、stage-attempt workbench、Foundry Lab loop-risk / platform-surface / maturity evidence lane 与 Stagecraft conflict envelope 改为消费该 vocabulary，保留既有输出 shape。
- No-resurrection guard：`reuse-first-scan` 只允许 `queue-projection-vocabulary.ts` 承载这些 projection vocabulary；focused test 证明同类词项出现在其他 runtime 文件仍会被扫描出来。
- Fresh evidence：focused app/operator / app-state / stage-pack / Agent Lab / reuse-first tests 27/27 pass；`npm run typecheck` pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok；full scan 当前为 `finding_count=2507`、`custom_runtime_queue=282`、`phase4-src-modules-runtime-queue=135`。该证据只证明 projection vocabulary foldback 与 no-resurrection gate，不证明 Temporal durable lifecycle、runtime ready、domain ready、production ready 或 owner acceptance。

## Phase 5 Managed Update Owner Boundary Split 2026-07-04

本轮继续收薄 Managed Update，只把 owner route / execution boundary / receipt projection vocabulary 从大 kernel 拆成独立 owner-boundary surface；不改变 `status/check/plan/apply/repair/rollback` 语义，不执行 release update，不写 App/Aion/domain truth，不创建 owner receipt 或 typed blocker。

- Source：新增 `src/modules/connect/managed-update-owner-boundary.ts`，集中 `ManagedUpdateOperation`、provider ids、component model、owner route、owner execution boundary、receipt required fields、`componentReceipt()`、`noAutoApply()`、`statusDetail()` 等 owner-boundary vocabulary；`managed-update-kernel.ts` 降为 component projection/readback 组装，`managed-update-kernel-runner.ts`、receipt ledger、lock 和 CLI update spec 只消费该 boundary type。
- No-resurrection guard：`reuse-first-scan` 只允许该 owner-boundary 文件承载 managed update 元数据词项，并新增 focused test 证明同类词项出现在其他 Connect 文件仍会被扫描出来；该分类不允许新增 generic package manager 或 updater 执行面。
- Fresh evidence：focused managed-update / launcher / reuse-first tests 43/43 pass；`npm run typecheck` pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；`npm test` smoke 78/78 pass；full scan 当前为 `finding_count=2523`、`custom_update_or_package_manager=224`、`phase6-src-modules-update-package=103`。该证据只证明 owner-boundary split 与 no-resurrection diff gate，不证明 managed update split 完成、App release ready、runtime currentness ready、production ready 或 owner acceptance。

## Phase 5/6 Connect Agent Package Registry Foldback 2026-07-04

本轮把专业智能体 package 的 registry / manifest / lock / receipt 路径收进 OPL Connect，而不是让 App、domain agent 或 Console 各自手搓安装器、包管理器和 receipt store。该切片只写 Framework `OPL_STATE_DIR` 下的 registry cache、package lock 和 lifecycle ledger，不写 domain truth、owner receipt、typed blocker、App release channel 或 runtime substrate truth。

- Source：新增 `src/modules/connect/agent-package-registry.ts`，提供 `registry refresh`、`validate-manifest`、`install` 和 `list` 四个 refs-only Framework writer/readback；`connect.ts` 和 `cli-command-registry.json` 增加 `connect agent-packages *` command registry；`runtime-state-paths.ts` 增加 agent package state 文件；Settings Control Center / `app action execute --action install_from_manifest_url` 只委托 Connect writer；`scripts/test-lanes.mjs` 已注册对应 active test lane ownership。
- Boundary：registry 只做 discovery，安装 authority 来自 validated manifest + Framework package lock receipt；registry entry 与 manifest 的 `package_id` / version 必须一致；manifest 显式拒绝 `session_contract_ref`、domain workflow schema、prompt body、artifact schema、readiness / quality verdict rule 与 owner receipt authority；output 固定 `can_write_domain_truth=false`、`can_create_owner_receipt=false`、`can_create_typed_blocker=false`、`can_claim_domain_ready=false`、`can_claim_production_ready=false`。
- Fresh evidence：`node --test --experimental-strip-types tests/src/verification-test-governance.test.ts tests/src/cli/cases/connect-agent-packages.test.ts tests/src/cli/cases/app-state-cases/settings-control-center.test.ts` 17/17 pass；`npm run typecheck` pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass。该证据只证明 Framework package registry / manifest / lock / receipt 切片，不证明第三方 registry 安全审计、真实 package 安装可用性、App release/currentness ready、domain ready、production ready 或 owner acceptance。

## Phase 5/6 Agent Package Physical Surface Reuse Foldback 2026-07-04

本轮吸收 `codex/agent-package-materialize-20260704` 的 agent package physical Codex surface，但先按 reuse-first 原则把该 lane 原本重复手写的 marketplace wrapper / `config.toml` plugin registration / unregister helper 收回到既有 `src/modules/connect/system-installation/codex-plugin-registry.ts`。Agent package registry 只保留 package manifest、lock、receipt、copy-to-cache 和 package lifecycle 语义；Codex marketplace/config 写入复用 Connect system-installation 已有 surface。

- Source：`src/modules/connect/agent-package-registry.ts` 支持 manifest 的 `codex_surface.plugin_source_path` / `plugin_ids`，安装、更新、回滚、修复和卸载会 materialize / remove package-scoped Codex plugin cache、OPL-owned local marketplace wrapper 与 `CODEX_HOME/config.toml` plugin table；lock 与 lifecycle receipt 同步携带 `physical_surface` refs-only readback。`src/modules/connect/system-installation/codex-plugin-registry.ts` 公开 `materializeLocalCodexPluginMarketplace()`、`registerLocalCodexPlugin()` 与 `unregisterLocalCodexPlugin()`，供 family plugin sync 与 agent package install 共用同一 Codex plugin registration boundary。
- Boundary：physical surface 仍只写临时/用户指定 `CODEX_HOME`、`OPL_STATE_DIR` 下的 local cache / marketplace wrapper / Codex config，不写 domain repo marketplace、不写 domain truth、owner receipt、typed blocker、runtime queue、App release channel 或 production update truth；`reload_required=true` 只表示 Codex plugin config changed，不等于 runtime ready 或 owner acceptance。
- Fresh evidence：focused package lifecycle test `node --test --experimental-strip-types tests/src/cli/cases/connect-agent-packages.test.ts` 为 5/5 pass；family plugin registration regression `node --test --experimental-strip-types tests/src/opl-skills-boundary.test.ts tests/src/cli/cases/system-configure-codex.test.ts tests/src/cli-codex-default-shell-sync-skills.test.ts` 为 19/19 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass。该证据只证明 agent package physical Codex surface 和既有 plugin registry helper reuse；不证明第三方 package 安全审计、真实用户 Codex 重载、App release/currentness ready、domain ready、production ready 或 owner acceptance。

## Phase 9 Evidence Envelope Semantic Convention Binding 2026-07-04

本轮继续收薄 Observability，只把 evidence envelope projection 接到已建立的 OPL semantic convention signal model；不创建新的私有 ledger UI，不保存 payload body，不改变 domain truth、owner receipt、typed blocker、runtime DB/provider queue 或 production readiness。

- Source：`src/modules/ledger/evidence-envelope.ts` 现在从 refs-only envelope summary 生成 `semantic_conventions` export seed，把 blocked/open envelope 映射到 trace、metric、log/event signals；`selected_envelope_id`、owner、route、receipt、typed blocker 和 source fingerprint 都保持 refs-only。
- Fresh evidence：`node --test --experimental-strip-types tests/src/observability-semantic-conventions.test.ts` 4/4 pass；吸收后复跑综合 focused tests 44/44 pass，`npm run typecheck` pass，`npm run source:modules -- --strict-imports` status=ok，`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok，`npm test` smoke 77/77 pass；full scan 当前为 `finding_count=2546`、`custom_observability_ledger=1525`、`accepted_migration_worklist=263`、`decisioned_finding_count=2546`、`undecisioned_finding_count=0`。该证据只证明 evidence envelope observability 绑定推进，不证明真实 Collector/exporter、runtime ready、domain ready、artifact ready、production ready 或 owner acceptance。

## Phase 9 App Operator Drilldown Semantic Convention Surface 2026-07-04

本轮继续把 App/operator drilldown 的观测面接到同一 semantic convention model；只增加 refs-only readback 字段，不扩大 App、Console 或 Ledger 的 authority。

- Source：`buildAppOperatorDrilldown` 现在把 `evidence_envelope.semantic_conventions` 投影为顶层 `semantic_conventions`，让 App/operator drilldown 与 `runtime observability-export` 使用同一 trace/metric/log vocabulary。
- Fresh evidence：后续 Console drilldown lane 继续把 runtime tray / stage attempt readback 迁到 Ledger-owned semantic vocabulary；收尾修复将 `appOperatorProjection*` 只通过 `src/modules/ledger/index.ts` 公共入口暴露，避免 Console 深导入 Ledger 内部文件；diagnostic drilldown scan boundary 只允许 source-module refs-only command/readback wording，仍扫描同一行中的 private ledger terms；lane focused tests 18/18 pass；主线 `npm run source:modules -- --strict-imports` status=ok；full scan readback 为 `custom_observability_ledger=536`、`phase10-src-modules-observability=0`。该证据只证明 readback 同源、public entrypoint boundary、diagnostic projection 分类与 private observability worklist 收薄，不证明真实 Collector/exporter、runtime ready、domain ready、artifact ready、production ready 或 owner acceptance。

## Phase 9 Observability Exporter Boundary Contract 2026-07-04

本轮把 Observability semantic convention 从局部 readback 固定为 Ledger-owned machine contract 和 Runway exporter seed；不接入真实 Collector，不导出 payload body，不创建私有 ledger UI，不改变 runtime DB/provider queue、domain truth、owner receipt、typed blocker 或 production readiness。

- Contract：`observability-semantic-conventions-contract.json` 增加 `export_readback_seed`，明确 JSON / OpenMetrics formats、trace / metric / log exporter signal mapping、collector export boundary、forbidden body fields、signal groups、refs-only body policy 与 `readiness_claim=not_claimed`。
- Source/readback：`observability-semantic-conventions.ts` 生成同源 semantic convention readback 和 export seed；`runtime observability-export` 复用该 seed，并在 OpenMetrics 输出 `opl_observability_exporter_signal_mapping`、`opl_observability_collector_export_boundary` 与 no-ready-claim boundary。
- Fresh evidence：`node --test --experimental-strip-types tests/src/observability-semantic-conventions.test.ts tests/src/cli/cases/runtime-observability-export.test.ts` 6/6 pass；`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok。该证据只证明 exporter boundary contract / readback / OpenMetrics seed，不证明真实 Collector/exporter、runtime ready、domain ready、artifact ready、production ready 或 owner acceptance。

## Phase 9 Collector Consumption Config Readback 2026-07-04

本轮把 refs-only OpenMetrics seed 向 OpenTelemetry Collector 可消费结构推进一刀：不新增私有 ledger/exporter UI，不引入 JS 依赖，不启动外部 Collector，不导出 payload body，也不声明 runtime/domain/artifact/production readiness。

- Contract/source：`observability-semantic-conventions-contract.json` 与 `observability-semantic-conventions.ts` 增加 `collector_consumption_config`，按 OpenTelemetry Collector 的 `receivers -> processors -> exporters -> service.pipelines.metrics` 结构提供 Prometheus receiver / OpenMetrics input / batch processor / debug exporter 的 YAML 等价 JSON fragment，并显式标出 `endpoint_required=true`、默认 scrape target、`external_collector_connected=false` 与 no-ready-claim。
- Runtime readback：`runtime observability-export` 的 JSON payload 现在携带同一 `collector_consumption_config`；OpenMetrics 输出新增 `opl_observability_collector_consumption_config` guard metric，让 Collector 消费面、Prometheus receiver 入口和 no-body/no-ready 边界可被下游观测系统读取。
- Collector config export：`runtime observability-export --format collector-config-json` 直接输出同一个 Prometheus receiver / batch processor / debug exporter config JSON，供外部 Collector owner 写入配置文件或管道消费；OPL 仍只导出 config/readback，不启动 Collector，不声明 external collector connected。
- 依赖边界：本切片复用现有 OpenMetrics 输出与 Collector 标准配置结构即可形成可消费 config/readback；真正暴露 HTTP `/metrics` endpoint、运行外部 Collector 或接入 OTLP SDK exporter 需要 runtime endpoint / deployment owner lane，不在本次允许写集内，因此未修改 `package.json` / `package-lock.json`。
- Fresh evidence：`node --test --experimental-strip-types tests/src/observability-semantic-conventions.test.ts tests/src/cli/cases/runtime-observability-export.test.ts` 7/7 pass；`runtime-observability-export.test.ts` 解析 `--format collector-config-json` stdout 并验证 metrics pipeline、Prometheus scrape target 与 no-body leak；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass。该证据只证明 Collector-config-consumable readback/export 切片，不证明外部 Collector 已运行、runtime ready、domain ready、artifact ready、production ready 或 owner acceptance。

## Phase 9 HTTP Metrics Endpoint Foldback 2026-07-04

本轮把 OpenMetrics readback 从 stdout export 推进到真实 HTTP `/metrics` endpoint；实现只使用 Node 标准库 `node:http`，不新增 Web server 依赖、不创建私有 observability UI、不写 runtime/domain truth、不导出 payload body，也不声明 runtime/domain/artifact/production readiness。

- Source：`observability-export.ts` 新增 `startObservabilityMetricsEndpoint()` / `serveObservabilityMetricsEndpoint()`，每次 GET `/metrics` 都从现有 `buildObservabilityExport(..., format=openmetrics)` 生成响应；endpoint readback 固定 `server_runtime=node_http_standard_library`、`external_collector_connected=false`、`payload_body_exported=false` 与 no-ready/no-domain-authority boundary。
- CLI/contract：新增 `opl runtime observability-endpoint [--host <host>] [--port <port>] [--metrics-path <path>] [--once] [--ready-file <path>]`；`runtime observability-export` 与 `runtime observability-endpoint` 都纳入 `cli-command-registry.json` 和 public command registry coverage；`collector_consumption_config.scrape_endpoint` 现在同时写明 stdout export command 与 endpoint command。
- Runtime evidence：CLI one-shot readback 使用 `--port 0 --once --ready-file` 启动真实 HTTP endpoint，读取 ready-file 后用 `fetch()` 命中 `/metrics`，返回 `200` 且包含 `# TYPE opl_provider_ready gauge`；该证据只证明本地 HTTP endpoint 可被 Prometheus/OpenTelemetry Collector scrape，不证明外部 Collector 已运行。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/runtime-observability-export.test.ts tests/src/observability-semantic-conventions.test.ts tests/src/cli/cases/cli-command-registry.test.ts tests/src/family-product-operator-projection.test.ts` 23/23 pass；`npm run typecheck` pass；`npm run source:modules -- --strict-imports --strict-cycles` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`npm test` smoke 81/81 pass；full scan 仍为 `finding_count=1276`、`decisioned_finding_count=1276`、`undecisioned_finding_count=0`。该证据只证明 HTTP metrics endpoint、CLI registry 和 contract/readback 同步，不证明 runtime ready、domain ready、production ready、外部 Collector connected 或 owner acceptance。

## Phase 9 Collector Smoke Readback Foldback 2026-07-04

本轮把 HTTP `/metrics` endpoint 与 Collector consumption config 接到一个可执行 smoke readback；默认 no-endpoint 路径使用 bounded OPL OpenMetrics smoke endpoint，显式 `--endpoint` 仍保留给外部 runtime endpoint / deployment owner 证明；仍不新增 OpenTelemetry JS SDK、不 vendor Collector、不写 payload body、不声明 runtime ready、domain ready、artifact ready、production ready 或 owner acceptance。

- Source/CLI：新增 `opl runtime observability-collector-smoke [--collector-command <path>] [--endpoint <url>] [--host <host>] [--port <port>] [--metrics-path <path>] [--timeout-ms <ms>]`，查找顺序为显式 `--collector-command`、`OPL_OTELCOL_COMMAND`、PATH 上的 `otelcol-contrib`、`otelcol`；没有外部 endpoint 时由 OPL 临时启动 bounded read-only smoke `/metrics` endpoint，并写入临时 Collector config；Collector config 的 batch processor 固定 `timeout=1s` / `send_batch_size=1`，让 debug exporter 能在 smoke timeout 内输出 OPL metric。
- Boundary：smoke readback 只观察 Collector debug/stdout/stderr 是否消费到 OPL OpenMetrics metric；Collector binary 缺失时返回 `collector_binary_missing` typed blocker readback，且 authority boundary 固定 `external_collector_connected=false`、`can_claim_runtime_ready=false`、`can_claim_production_ready=false`。
- Fresh evidence：合并后 `node --test --experimental-strip-types tests/src/cli/cases/runtime-observability-export.test.ts tests/src/observability-semantic-conventions.test.ts tests/src/cli/cases/cli-command-registry.test.ts` 19/19 pass；`./bin/opl runtime observability-collector-smoke --collector-command /tmp/definitely-missing-otelcol --timeout-ms 50 --json` 返回 `status=blocked`、`typed_blocker.blocker_type=collector_binary_missing`、`authority_boundary.can_claim_runtime_ready=false`；本机下载的真实 `otelcol-contrib v0.155.0` 通过 `./bin/opl runtime observability-collector-smoke --collector-command /tmp/opl-otelcol.Ieu1rl/otelcol-contrib --json` 返回 `status=observed`、`collector_consumption_observed=true`、`observed_metric_name=opl_provider_ready`、`external_collector_connected=true`、`can_claim_runtime_ready=false`。该证据证明真实 OpenTelemetry Collector 可以消费 OPL bounded smoke endpoint，不证明外部 runtime endpoint、OTLP exporter、runtime ready、domain ready、production ready 或 owner acceptance。

## Phase 9 Diagnostic Drilldown Projection Scan Boundary 2026-07-04

本轮只修正 No-resurrection scan 对 source-module diagnostic drilldown 的分类：`drilldown` 作为显式 diagnostic command/readback projection 不是私有 observability ledger；但同一行如果仍包含 `evidence_ledger`、`receipt_ledger`、`attempt ledger` 或 `runtime ledger`，仍保留为 Phase 10 observability migration finding。

- Source：新增 `src/kernel/observability-projection-vocabulary.ts` 作为 observability projection field / label vocabulary 的集中面；`scripts/reuse-first-scan.mjs` 增加 `isAllowedObservabilityProjectionVocabularyLine()` 与 `isAllowedDiagnosticProjectionLine()`，只允许 kernel vocabulary 与 `src/modules/**` 中的 diagnostic drilldown projection wording；这些 allow 不覆盖 source-module private ledger terms，也不影响 diff strict hard gate。
- Regression：`tests/src/reuse-first-scan.test.ts` 覆盖 source-module `app-operator-drilldown` command/readback projection 不被误报、kernel vocabulary 集中面不被误报，同时证明 source-module `evidence_ledger` / `attempt ledger` 仍会被扫描出来。
- Fresh evidence：合并后 full scan 当前为 `finding_count=1207`、`hard_gate_finding_count=740`、`advisory_finding_count=467`、`decisioned_finding_count=1207`、`undecisioned_finding_count=0`；`custom_observability_ledger=467`、`phase10-src-modules-observability=0`。该证据只证明 diagnostic projection 分类更准，不证明真实 Collector/exporter、runtime ready、domain ready、artifact ready、production ready 或 owner acceptance。

## Runtime App Operator Drilldown Test Projection Cleanup 2026-07-04

本轮只清理低风险 tests/fixture/projection 词汇：App/operator drilldown 测试内部变量统一称为 `projection`，避免把 refs-only App read model 误读成私有 observability ledger。命令名、文件名和公开 surface 仍保留 `app-operator-drilldown`，因为它们是现有 CLI/API 入口和回归夹具，不在本轮改名。

- Scope：本 lane 不改 `src/modules` active runtime/update/schema behavior，不改 `src/kernel/**`、domain truth、owner receipt、typed blocker、runtime DB/provider queue、release artifact 或 App/Aion repo；当前 full scan 中的 kernel helper finding 属于 existing allowed projection boundary，不是本 lane 写集。
- Test fixture：runtime App/operator drilldown 相关测试只做内部命名收敛，断言内容、CLI 命令、fixture 数据、authority boundary 与 owner receipt / typed blocker 语义不变。
- Fresh evidence：合并后 touched runtime App/operator projection tests 54/54 pass，`npm run typecheck` pass，`npm run source:modules -- --strict-imports --strict-cycles` status=ok，`npm run reuse-first:scan:diff -- --strict` exit 0 且 hard finding 为 0；full scan 当前为 `finding_count=1207`、`hard_gate_finding_count=740`、`advisory_finding_count=467`、`handwritten_json_boundary=472`、`phase1-kernel-shared-json-boundary-helper=13`、`phase10-test-and-fixture-projections=1046`。该证据只证明测试投影命名收敛，不证明 runtime ready、domain ready、production ready 或 owner acceptance。

## Additional Test JSON Boundary Cleanup 2026-07-04

本轮继续消化测试层 `handwritten_json_boundary` worklist，只把真实 stdout / contract JSON 解析迁到共享 helper；作为 fixture 内容出现的 `JSON.parse("{}")` 等字符串保留原样，避免把测试输入语义改成 helper 行为测试。

- Source：`tests/src/cli-codex-default-shell-helpers.ts` 复用 `parseJsonText()`；Codex default shell、Connect skill sync 与 reuse-first scan 测试中的 stdout / contract JSON 解析复用该 helper，不再直接手写 `JSON.parse`。
- Boundary：该 cleanup 只覆盖测试解析边界，不改变 CLI passthrough、Connect skill sync、reuse-first scan 分类、domain truth、owner receipt、typed blocker、runtime DB/provider queue、release artifact 或 production readiness。
- Absorption：两条隔离 worktree lane 已吸收进 `main`，对应 main commits 为 `9875e38b` 与 `756a0e1d`；当前 full scan 从 `1207` 降到 `1193`，`hard_gate_finding_count` 从 `740` 降到 `726`，`handwritten_json_boundary` 从 `472` 降到 `458`，`phase10-test-and-fixture-projections` 从 `1046` 降到 `1032`。
- Fresh evidence：focused combined tests `node --test --experimental-strip-types tests/src/cli-codex-default-shell.test.ts tests/src/cli-codex-default-shell-sync-skills.test.ts tests/src/reuse-first-scan.test.ts` 为 41/41 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full scan 为 `finding_count=1193`、`hard_gate_finding_count=726`、`advisory_finding_count=467`、`decisioned_finding_count=1193`、`undecisioned_finding_count=0`。该证据只证明测试 JSON boundary 收薄，不证明 schema boundary 全量完成、runtime ready、domain ready、production ready 或 owner acceptance。

## Kernel JSON Boundary Cleanup 2026-07-04

本轮继续消化 kernel 层低冲突 `handwritten_json_boundary`，只把现有 profile/auth/runtime mode/managed runtime/system preference JSON 读取迁到共享 JSON boundary helper；不改变 Codex profile 写入、system preference 写入、managed shell recovery、runtime mode fallback、managed runtime contract shape、release/currentness、domain truth、owner receipt、typed blocker 或 runtime DB/provider queue。

- Source：`local-codex-defaults`、`local-codex-defaults-parts/access-state`、`runtime-modes`、`managed-runtime-contract`、`managed-shell-command-env` 与 `system-preferences` 复用 `parseJsonText()`、`readJsonPayloadFile()` 或 `readJsonFileOrNull()`；quoted TOML value、auth state、runtime mode、managed runtime contract、workspace root、update channel 与 developer supervisor state 的既有 fail-soft / fail-closed 行为保持不变。
- Fresh evidence：focused kernel / App action / system preferences tests `node --test --experimental-strip-types tests/src/managed-shell-command-env.test.ts tests/src/opl-managed-runtime-three-layer-contract.test.ts tests/src/json-file-boundary.test.ts tests/src/cli/cases/system-workspace-settings.test.ts tests/src/cli/cases/app-action.test.ts` 为 21/21 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --strict` finding_count=0；full scan 从 `1196` 降到 `1185`，`hard_gate_finding_count` 从 `728` 降到 `717`，`handwritten_json_boundary` 从 `458` 降到 `447`，`decisioned_finding_count=1185`、`undecisioned_finding_count=0`。该证据只证明 kernel JSON boundary 收薄，不证明 schema boundary 全量完成、runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Module Cohesion / Long File Split 2026-07-04

本轮只做模块内聚和长文件收薄：把 Console、Connect、Runway、Charter、Ledger 与 Foundry Lab 内已经有明确 owner 的静态 catalog、payload builder、projection builder、runtime intake、contract loader、artifact provenance 和 scaffold/readiness helpers 拆到同模块 `parts/` 或 owner-local sibling 文件；不新增抽象层、不改 runtime/domain/release authority，不把本地 projection 提升成生产 truth。

- Console：`app-state-settings-control-center.ts` 把 Settings Control Center catalog 下沉到 `app-state-settings-control-center-parts/catalog.ts`，action payload 和 view model sections 分别下沉到 `app-state-parts/action-execute-payloads.ts` 与 `app-state-parts/view-model-sections.ts`。
- Connect：`managed-update-kernel.ts` 把 installation carrier / runtime substrate projection 组装拆到 `managed-update-kernel-parts/`，kernel 保持 owner route / projection 汇总入口。
- Connect self-update：`framework-self-update.ts` 把 channel artifact projection 拆到 `framework-self-update-parts/channel-artifact.ts`，self-update 仍只保 framework-owned channel artifact / managed update readback，不声明 App release 或 runtime currentness ready。
- Runway：`paper-mission-route-handoff.ts` 把 materialized readback、owner wait、runtime request、source task 和 shared helper 拆到同名 parts；`family-runtime.ts` 下沉 approval helper；`observability-export.ts` 下沉 OpenMetrics / Collector shared projection helper。
- Charter / Ledger：contract loader manifest / location resolution、target operating architecture plan experience、artifact provenance bundle types 拆到 owner-local 文件，contract loader / artifact provenance 仍只保持 machine contract / refs-only provenance boundary。
- Foundry Lab：Agent Lab work-order IO / prompt、framework readiness diagnostic、standard domain-agent scaffold capability-map 拆到 Foundry Lab owner-local parts，work-order / readiness / scaffold 仍不写 domain truth、不签 owner receipt、不授权 production acceptance。
- Absorption：隔离 implementation lane 经主线复核后已在 `origin/main`，对应 commits 为 `ef576e04`、`21a5cddf`、`81fbce71`、`ad596750`、`0d32746b`、`23e1998b`，docs / policy / line-budget foldback 为 `07225e80`、`363b8ba2`、`cce4492f`、`9c205065`、`1272050c`；所有临时 worktree / `codex/modular-*` branches 已清理。
- Fresh evidence：目标长文件当前行数为 Settings Control Center `645`、Console action execute `972`、Console view model `971`、managed update kernel `826`、framework self-update `821`、paper mission route handoff `332`、family runtime `985`、observability export `996`、Charter contracts `807`、Charter target operating architecture sections `891`、Ledger artifact provenance bundle `908`、Foundry work-order execution `985`、Foundry readiness `945`、Foundry scaffold template `917`；`npm run line-budget` pass，`npm run line-budget:strict` pass，`git diff --check` pass，full scan 当前 `finding_count=1196`、`hard_gate_finding_count=728`、`advisory_finding_count=468`、`decisioned_finding_count=1196`、`undecisioned_finding_count=0`，`npm run reuse-first:scan:diff -- --strict` finding_count=0。此前同批 main verification 还包括 `npm run typecheck` pass、`npm run build` pass、`npm run source:modules -- --strict-imports --strict-cycles` status=ok、focused Console / Connect / Runway tests 50/50 pass、Foundry focused tests 49/49 pass、Charter / Ledger focused tests 41/41 pass、`npm test` smoke pass、`npm run lint` pass。该证据只证明文件边界、source budget ratchet 和模块内聚更清楚，不证明 runtime live evidence、release readiness、domain readiness、owner receipt 或 Brand L5。

## Phase 5 Managed Update Execution Helper Foldback 2026-07-04

本轮继续收薄 Managed Update split，只把 owner execution 选择、component 过滤/汇总、operation mode、receipt write policy、post-apply / reload status 与 receipt input assembly 收到 `managed-update-owner-boundary.ts`；不改变 `opl update status/check/plan/apply/repair/rollback` 的 owner route，不执行 App release update，不写 App/Aion/domain truth，不创建 owner receipt 或 typed blocker。

- Source：`managed-update-kernel.ts` 不再维护 component alias filter、summary、operation mode 或 receipt policy helper；`managed-update-kernel-runner.ts` 不再本地维护 owner execution bind、post-apply / reload status、post-apply action receipt 或 component receipt field 拼装。
- Boundary：`managed-update-owner-boundary.ts` 现在是 managed update owner/execution/readback vocabulary 的唯一集中面；该文件仍只表达 owner route、可执行操作、receipt projection 和 forbidden claims，不能扩张成通用 updater/package manager。
- Fresh evidence：主线继续吸收 `refactor(connect): centralize managed update receipt types`、`refactor(connect): reuse managed update owner boundary vocabulary` 与 `refactor(connect): close managed update owner worklist`，把 receipt 类型、rollback/app-state owner decision vocabulary、Foundry Lab promotion/dev-mode fallback vocabulary 与 Runway runtime-environment fallback projection 收到 owner boundary 或 refs-only recovery constant；`managedUpdateCommand()` 默认保持 `--json`，Settings delegated surface 显式使用 `{ json: false }` 以保留既有 action/readback 字符串；lane focused tests 39/39 pass；收尾 root 验证 `npm run typecheck` pass、`npm run source:modules -- --strict-imports --strict-cycles` status=ok、`npm run reuse-first:scan:diff -- --diff-ref origin/main --strict` gate_status=ok；主线 full scan readback 为 `custom_update_or_package_manager=121`、`phase6-src-modules-update-package=0`。该证据只证明 owner-boundary helper / receipt type / fallback projection 收薄，不证明 managed update split 完成、App release ready、runtime currentness ready、production ready 或 owner acceptance。

## Phase 3/4 Runway Queue Projection Boundary Foldback 2026-07-04

本轮继续收薄 Runway queue/attempt/scheduler/SQLite 风险，只把本地 queue projection 词汇、task/stage-attempt status 与 lease/dead-letter/retry SQL helper 集中到 `family-runtime-queue-projection-boundary.ts`；不把本地 SQLite queue 升级为 production durable queue，也不改变 Temporal-first 目标态、domain truth、owner receipt、typed blocker、runtime DB/provider queue authority 或 production readiness。

- Source：新增 `FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY`，声明 durable lifecycle owner 为 Temporal workflow/activity/retry/schedule/history，本地 store 只做 projection/cache/operator audit index；`family-runtime-store.ts`、`family-runtime-redrive.ts`、`family-runtime-task-dispatch.ts`、`family-runtime-tick.ts`、provider-hosted attempts 与 PaperMission terminal sync 改为复用该边界。
- Boundary：task `max_attempts`、`lease_owner`、`lease_expires_at`、`dead_letter_reason` 与 stage attempt `dead_lettered` 仍只允许作为 local projection/audit vocabulary；Temporal retry policy、worker/activity truth 和 failure history 仍是目标 owner。
- Fresh evidence：主线继续吸收 `refactor(runway): fold remaining queue projection fields`、`refactor(runway): reuse queue projection boundary fragments` 与 `refactor(runway): centralize remaining queue projection vocabulary`，把 default executor currentness、MAS route maintenance、PaperMission preflight、queue hold/release、provider-hosted attempt lease select、redrive retry budget、stage attempt usage/create/progress-log、Temporal observation sync 与 Temporal proof fixture 的 queue projection 字段接入同一 queue boundary；focused family-runtime/provider tests 556/556 pass；主线 full scan readback 为 `finding_count=2153`、`custom_runtime_queue=147`、`phase4-src-modules-runtime-queue=0`。该证据只证明 queue projection boundary 继续收薄，不证明 durable lifecycle 已迁到 Temporal、runtime ready、domain ready、production ready 或 owner acceptance。

## Phase 3 Temporal Live Residency Proof Fixture Foldback 2026-07-04

本轮把 Temporal live residency proof 从依赖本地测试自造 fixture 改成 runtime 内置 deterministic ephemeral fixture；该 fixture 只在 `OPL_CODEX_BIN` 未配置时使用，用于证明 Temporal worker / history / signal / closeout path，不证明真实 Codex CLI、domain ready、owner acceptance、production ready 或 release ready。

- Source/readback：`family-runtime-temporal-residency-proof.ts` 在 live proof 中生成临时 fake Codex executable，并把 `codex_fixture` 写入 JSON readback：`mode=ephemeral_temporal_residency_fixture`、`proves_real_codex_cli=false`、`proves_temporal_worker_history_signal_and_closeout_path=true`；测试从本地 fixture 迁到 runtime readback 断言。
- Runtime proof：`OPL_TEMPORAL_ADDRESS= TEMPORAL_ADDRESS= ./bin/opl family-runtime residency proof --provider temporal --live --json` fresh readback 返回 `proof_mode=temporal_live_test_server_worker`、`closeout_status=production_residency_code_path_proven`、`worker_completed_attempt=true`、`signal_history_preserved=true`、`typed_closeout_required_for_completed=true`、`missing_closeout_blocks_completion=true`、`codex_fixture.proves_real_codex_cli=false`。
- Fresh evidence：合并后 `node --test --experimental-strip-types tests/src/cli/cases/family-runtime-worker.test.ts` 17/17 pass，Temporal live CLI readback 成功，`npm run typecheck`、`npm run source:modules -- --strict-imports --strict-cycles`、`npm run reuse-first:scan:diff -- --strict`、`npm test`、`npm run build`、`npm run lint` 均通过。该证据只证明 Temporal live test-server path 与 fail-closed closeout semantics，不证明外部 production Temporal/worker/executor readiness。

## CLI Registry Projection and Line-Budget Ratchet 2026-07-04

本轮吸收三条小型隔离 lane：update command registry projection、private runtime command spec split、Agent Lab developer-mode test split。它们只做 registry/readback 分类、文件边界和测试 lane 归位，不改变 command 行为、runtime truth、domain truth、owner receipt、typed blocker、release/currentness claim 或 production readiness。

- CLI registry projection：`update status/check/plan/apply/repair/rollback` 已作为 owner-routed managed update command projection 保留；scanner 现在只允许 CLI command projection 文件中的 `rollback` wording，full scan 中 `phase2-update-command-registry-projection=0`，不再落入 active migration worklist。`runtime app-operator-drilldown` 作为 diagnostic refs-only projection 保留；full scan 中 `phase2-diagnostic-drilldown-command-projection=17`。
- Private command spec split：`src/entrypoints/cli/cases/private-command-specs.ts` 从历史超线拆到 650 行；runtime command specs 进入 `src/entrypoints/cli/cases/private-command-specs-parts/runtime.ts`，agent specs 进入同目录 `agents.ts`。该拆分只降低 CLI spec 文件内聚风险，不声明 CLI parser 统一完成。
- Agent Lab test split：`tests/src/agent-lab-complete.test.ts` 从历史超线拆到 668 行；developer-mode cases 进入 `tests/src/agent-lab-complete-cases/developer-mode.test.ts`，并注册到 `scripts/test-lanes.mjs`。该切片后 `contracts/opl-framework/source-structure-budget.json` 的 reviewed baseline 剩 8 条，后续 Test Line-Budget Baseline Split 继续降到 4 条。
- Fresh evidence：focused combined tests `node --test --experimental-strip-types tests/src/cli/cases/system-commands.test.ts tests/src/cli/cases/system-install.test.ts tests/src/cli/cases/cli-command-registry.test.ts tests/src/agent-lab-complete.test.ts tests/src/agent-lab-complete-cases/developer-mode.test.ts tests/src/cli/cases/managed-update-kernel-projection.test.ts tests/src/cli/cases/managed-update-kernel.test.ts` 为 67/67 pass；`npm run typecheck` pass；`npm run line-budget:strict` pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass；该切片时 full scan 为 `finding_count=1171`、`hard_gate_finding_count=710`、`advisory_finding_count=461`、`decisioned_finding_count=1171`、`undecisioned_finding_count=0`。该证据只证明本轮 projection/split/ratchet 已落地，不证明 production ready、domain ready、release ready 或 owner acceptance。

## Test Line-Budget Baseline Split 2026-07-04

本轮继续处理 strict line-budget 的历史测试基线，只做行为保持的 test-case 文件拆分和 reviewed baseline ratchet；不改 `src/**` runtime behavior，不改 domain truth、owner receipt、typed blocker、runtime DB/provider queue、release/currentness 或 production 语义。

- Source：`app-action.test.ts` 的 dry-run action cases 拆到 `app-action-cases/dry-run-actions.test.ts`；`app-state.test.ts` 拆成 canonical GUI、Settings Control Center、MAS activity 与 fast guard cases；`contracts-entry.test.ts` 的 native helper doctor case 拆到 `contracts-entry-cases/native-helper-doctor.test.ts`；`system-seed-manifest.test.ts` 的 Docker WebUI doctor cases 拆到 `system-seed-manifest-cases/docker-webui-doctor.test.ts`。
- Line-budget ratchet：`app-action.test.ts=889`、`app-state.test.ts=5`、`contracts-entry.test.ts=996`、`system-seed-manifest.test.ts=868`；新增 case 文件均低于 1000 行。`contracts/opl-framework/source-structure-budget.json` 移除这四条 reviewed baselines，剩余 strict baseline 为 4 条测试文件：`family-runtime.test.ts`、`managed-update-kernel-projection.test.ts`、`system-startup-maintenance-maintenance.test.ts`、`family-runtime-temporal-provider.test.ts`。
- Fresh evidence：split focused tests `node --test --experimental-strip-types tests/src/cli/cases/app-action.test.ts tests/src/cli/cases/app-state.test.ts tests/src/cli/cases/contracts-entry.test.ts tests/src/cli/cases/system-seed-manifest.test.ts` 为 57/57 pass；post-marker App action/state rerun 15/15 pass；`npm run typecheck` pass；`npm run line-budget:strict` pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass；full scan 当前为 `finding_count=1164`、`hard_gate_finding_count=707`、`advisory_finding_count=457`、`decisioned_finding_count=1164`、`undecisioned_finding_count=0`。该证据只证明测试文件边界和 line-budget ratchet 更收敛，不证明 runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Remaining Test Line-Budget Baseline Split 2026-07-04

本轮继续把剩余 4 条 strict line-budget 测试历史基线拆完，只做行为保持的 test-case 文件拆分和 contract ratchet；不改 `src/**` runtime behavior，不改 domain truth、owner receipt、typed blocker、runtime DB/provider queue、release/currentness 或 production 语义。

- Source：`family-runtime.test.ts` 拆到 `family-runtime-cases/{status-lifecycle,provider-repair,enqueue-approval-hold,attempt-ledger,admission-tick,helpers}.ts`；`managed-update-kernel-projection.test.ts` 拆到 `managed-update-kernel-projection-cases/{plan,projection-only-apply-guards,companion-tools,workflow-profile,selector-alias-scenarios}.ts`；`system-startup-maintenance-maintenance.test.ts` 拆到 `system-startup-maintenance-cases/{framework-artifacts-and-rollback,codex-refresh,module-sync,oma-managed-root,health-timeout,developer-checkout-maintenance}.ts`；`family-runtime-temporal-provider.test.ts` 拆出 operator Update cases 到 `family-runtime-temporal-provider-cases/operator-updates.ts`。
- Line-budget ratchet：剩余基线文件当前行数为 `family-runtime.test.ts=5`、`managed-update-kernel-projection.test.ts=728`、`system-startup-maintenance-maintenance.test.ts=6`、`family-runtime-temporal-provider.test.ts=968`；新增 / 既有 case 文件均低于 1000 行。`contracts/opl-framework/source-structure-budget.json` 已移除全部 reviewed baselines，当前 `reviewed_baselines=[]`。
- Fresh evidence：remaining baseline focused tests `node --test --experimental-strip-types tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/managed-update-kernel-projection.test.ts tests/src/cli/cases/system-startup-maintenance-maintenance.test.ts tests/src/family-runtime-temporal-provider.test.ts` 为 63/63 pass；`npm run typecheck` pass；`npm run line-budget:strict` pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass；本轮 scanner foldback 后 full scan 当前为 `finding_count=1136`、`hard_gate_finding_count=681`、`advisory_finding_count=455`、`decisioned_finding_count=1136`、`undecisioned_finding_count=0`。该证据只证明测试文件边界、strict baseline 清零和 no-resurrection diff gate，不证明 runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Test Lane Registry Repair 2026-07-04

本轮吸收 OpenScience provenance substrate 后，`npm test` 的 smoke lane 暴露 `tests/src/substrate-provenance-surface.test.ts` 未登记到 test lane registry；这是测试治理缺口，不是 substrate provenance runtime/readiness 缺口。

- Source：`scripts/test-lanes.mjs` 将 `tests/src/substrate-provenance-surface.test.ts` 登记到 fast ownership lane，保持单一 test lane registry 作为 active test ownership source。
- Fresh evidence：修复后 `npm test` / `npm run test:smoke` 为 81/81 pass；该证据只证明 test ownership registry 已恢复，不证明 OpenScience substrate provenance surface 的 domain ready、artifact ready、production ready 或 owner acceptance。

## Test JSON Boundary Cleanup 2026-07-04

本轮继续消化测试层 `handwritten_json_boundary` worklist，只把测试读取 contract fixture、CLI stdout/stderr、JSON line、request body 或 fixture file 的 JSON 解析迁到已有 `src/kernel/json-file.ts` 的 `parseJsonText()`；用于模拟外部进程 stdout 的 fixture `JSON.stringify(...)` 与 embedded fixture JS 字符串保持原样，避免把测试输入语义改成 helper 行为测试。

- Source：已分批迁移 top-level contract/runtime/quality tests、CLI helpers、product-entry companion fixtures、Pack OS / Ledger / Agent conformance / package-channel CLI fixture readers、verification surface readers，以及多组 governance / schema / state-index / family orchestration readback readers；`tests/src/cli/helpers.ts` 重新导出 shared JSON helper，便于 CLI case fixtures 继续收敛。
- Absorption：前三条隔离 worktree lane 已按 latest `main` rebase 后 fast-forward 吸收，主线 commits 为 `50950a6b`、`7f4863cc` 与 `b42fb4f3`；后续 main 小切片与四条隔离 lanes 对应 commits 为 `c74f08da`、`90c3fc76`、`8045ec24`、`36ff2c5d`、`caa9db93`、`f46936ca`、`e5defca8` 与 `8797a5b3`；本轮追加 helper / product / CLI fixture lanes 已吸收为 `87ea63eb`、`0f135d44` 与 `ae105f9c`，patch-equivalent worker commits 为 `fd260a3f`、`b9678b82` 与 `faeb1bbd`。
- Fresh evidence：本轮追加 helper lane focused tests 73/73 pass；product/top-level fixture lane focused tests 57/57 pass；CLI fixture lane focused tests 41/41 pass；主线合并后 touched focused tests `node --test --experimental-strip-types` 为 171/171 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass；该轮 full reuse-first scan 为 `finding_count=1023`、`hard_gate_finding_count=568`、`advisory_finding_count=455`、`decisioned_finding_count=1023`、`undecisioned_finding_count=0`、`handwritten_json_boundary=328`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`phase10-test-and-fixture-projections=895`。该证据只证明测试 JSON boundary 收薄和 no-resurrection diff gate，不证明 runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Test Contract/CLI JSON Boundary Follow-up 2026-07-04

本轮继续消化测试层 contract / CLI fixture 的 `handwritten_json_boundary` worklist，只把直接 `JSON.parse(...)` 读取 contract fixture、plugin manifest、CLI stdout 和 workspace projection 文件的地方改为复用既有 `parseJsonText()`；不新增依赖、不新增测试框架、不改测试语义，也不改变 domain truth、owner receipt、typed blocker、runtime DB/provider queue、release/currentness 或 production 语义。

- Source：`contracts-help.test.ts`、`contracts-entry.test.ts`、`scholar-skills-plugin-surface.test.ts`、`system-install-fixtures.ts`、`app-state-cases/public-surface.ts`、`domain-pack-compiler-generated-interfaces.test.ts`、`family-runtime-provider-repair.test.ts`、`workspace-domain.initializer.test.ts` 与 `workspace-domain.projections.test.ts` 复用 `tests/src/cli/helpers.ts` re-export 的 shared JSON parser。
- Fresh evidence：两条隔离 worktree lane 已吸收进 `main`，commits 为 `21cdc2bd` 与 `18754f9e`；主线 focused tests `node --test --experimental-strip-types tests/src/cli/cases/contracts-help.test.ts tests/src/cli/cases/contracts-entry.test.ts tests/src/cli/cases/scholar-skills-plugin-surface.test.ts tests/src/cli/cases/system-configure-codex.test.ts tests/src/cli/cases/app-state-cases/public-surface.ts tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts tests/src/cli/cases/family-runtime-provider-repair.test.ts tests/src/cli/cases/workspace-domain.initializer.test.ts tests/src/cli/cases/workspace-domain.projections.test.ts` 为 124/124 pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass；当前 full scan 当时为 `finding_count=881`、`hard_gate_finding_count=426`、`advisory_finding_count=455`、`decisioned_finding_count=881`、`undecisioned_finding_count=0`、`handwritten_json_boundary=186`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`phase10-test-and-fixture-projections=753`。该证据只证明本轮测试 fixture JSON boundary 收薄和 no-resurrection diff gate，不证明 runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Test Fixture JSON Boundary Follow-up 2026-07-04

本轮继续收薄低风险测试 fixture JSON boundary，只把测试读取 CLI stdout、runtime fixture、governance projection、scaffold generated payload、managed update receipt 与 MAS live-attempt fixture 的直接 `JSON.parse(...)` 改为复用既有 `parseJsonText()`；不新增依赖、不新增测试框架、不改 fixture 输入语义，也不改变 runtime queue、domain truth、owner receipt、typed blocker、release/currentness 或 production 语义。

- Source：`tests/src/cli/cases/agent-lab-rho-git-history.test.ts`、`family-runtime-contracts.test.ts`、`family-runtime-current-control-provider-admission.test.ts`、`family-runtime-evidence-worklist-provider-scheduler.test.ts`、`agents-scaffold-generation.test.ts`、`managed-update-kernel.test.ts`、`family-runtime-provider-hosted-attempts.test.ts` 及其 case fixtures 继续复用 `tests/src/cli/helpers.ts` re-export 的 shared JSON parser，深层 fixtures 直接读取 `src/kernel/json-file.ts` 的 `parseJsonText()`。
- Absorption：前七条隔离 lanes 已吸收进 `main`，commits 为 `bfaa6787`、`dc2ff206`、`da9e4589`、`71cc4da7`、`292a6023`、`0615356b` 与 `253eb245`；追加三条隔离 lanes 已吸收进 `main`，commits 为 `5bb1beea`、`67269bdd` 与 `70907551`。
- Fresh evidence：追加三条 lanes 覆盖 conformance、runtime fixture cases 与 package distribution fixture；主线 focused combined tests `node --test --experimental-strip-types tests/src/cli/cases/agents-conformance.test.ts tests/src/cli/cases/agents-conformance-cases/production-acceptance-and-morphology.ts tests/src/cli/cases/family-runtime-current-control-provider-admission.test.ts tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts tests/src/cli/cases/package-distribution.test.ts` 为 206/206 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；当前 full scan 当时为 `finding_count=881`、`hard_gate_finding_count=426`、`advisory_finding_count=455`、`decisioned_finding_count=881`、`undecisioned_finding_count=0`、`handwritten_json_boundary=186`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`phase10-test-and-fixture-projections=753`。该证据只证明测试 fixture JSON boundary 继续收薄和 no-resurrection diff gate，不证明 schema boundary 全量完成、runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Test Fixture JSON Boundary Finalization Slice 2026-07-04

本轮继续按 reuse-first 原则消化低风险测试 fixture JSON boundary，吸收 agents、brand、provider-hosted attempts 与 current-control provider admission 四条 disjoint lane；同时修正 `connect agent-packages rollback` lifecycle projection 在 no-resurrection scanner 中的 owner-routed allow 规则，避免把已明确为 Framework-owned package lifecycle receipt projection 的 rollback 词项误报为新增私有 package manager。该修正只允许 CLI registry / Connect package registry / App action delegation / focused package lifecycle test 中的既有 owner-routed projection 词项，不放宽任意 `rollback`、`source_manifest_ref`、`post_apply_hooks` 或 runtime updater 实现。

- Source：`tests/src/cli/cases/agents-*`、`tests/src/cli/cases/brand-modules*`、`tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/*` 与 `tests/src/cli/cases/family-runtime-current-control-provider-admission-cases/*` 中读取 CLI stdout、runtime rows、fixture files 与 JSON lines 的直接 `JSON.parse(...)` 改为复用 `tests/src/cli/helpers.ts` / `src/kernel/json-file.ts` 的 `parseJsonText()`；`scripts/reuse-first-scan.mjs` 新增 focused owner-routed package lifecycle projection allow，`tests/src/reuse-first-scan.test.ts` 增加正反 fixture。
- Absorption：lanes 已吸收进 `main`，commits 为 `021c61c3`、`1a20bafe`、`5d7633ef`、`6ea0b274`，并包含类型修正 `d930a129` / `6b2c304f` 与 scanner foldback `c847f047`。
- Fresh evidence：combined focused tests `node --test --experimental-strip-types tests/src/cli/cases/brand-modules.test.ts tests/src/cli/cases/agents-default-callers.test.ts tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts tests/src/cli/cases/family-runtime-current-control-provider-admission.test.ts tests/src/reuse-first-scan.test.ts` 为 233/233 pass；`node --test --experimental-strip-types tests/src/cli/cases/connect-agent-packages.test.ts` 为 5/5 pass；`node --test --experimental-strip-types tests/src/reuse-first-scan.test.ts` 为 15/15 pass；`npm run typecheck` pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass；当前 full scan 为 `finding_count=743`、`hard_gate_finding_count=288`、`advisory_finding_count=455`、`decisioned_finding_count=743`、`undecisioned_finding_count=0`、`handwritten_json_boundary=48`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`phase10-test-and-fixture-projections=582`。该证据只证明测试 fixture JSON boundary 进一步收薄、agent package lifecycle projection allow 被约束到 owner-routed surfaces、no-resurrection diff gate 保持；不证明 schema boundary 全量完成、runtime ready、domain ready、release ready、production ready、owner acceptance 或 App/Aion live validator 完成。

## Test Fixture JSON Boundary Follow-through 2026-07-04

本轮继续按 reuse-first 原则消化测试 fixture / CLI readback 的直接 JSON 解析，只把测试内读取 CLI stdout/stderr、fixture files、operator logs、external evidence ledgers、runtime manager persistence、MAS route payloads 与 Temporal provider error payload 的 `JSON.parse(...)` 改为复用既有 `parseJsonText()`。该切片不新增依赖、不新增抽象、不改变嵌入式外部进程 fixture 语义，不改变 runtime queue、domain truth、owner receipt、typed blocker、release/currentness 或 production 语义。

- Source：`tests/src/cli/cases/scholar-skills-command-surface.test.ts`、`family-runtime-worker-lifecycle.test.ts`、`tests/src/family-runtime-temporal-terminal-sync.test.ts`、`family-runtime-stage-attempts-temporal-provider-cli.test.ts`、`golden-path-single-default.test.ts`、`runtime-app-release-user-path-long-operator.test.ts`、`app-action.test.ts`、`system-seed-manifest.test.ts`、`workspace-domain.external-evidence.test.ts`、`runtime-manager-native.test.ts`、`runtime-manager-provider.test.ts`、`family-runtime-stage-attempts-temporal-provider.test.ts`、`family-runtime-binding-intake-requeue-cases.ts`、`publication-aftercare-paper.ts`、`family-runtime-paper-autonomy.test.ts` 与 `hydration-and-active-route.ts` 继续复用 `tests/src/cli/helpers.ts` re-export 的 shared JSON parser。
- Absorption：subagent lane `codex/test-json-cli-boundary-20260704` 已吸收为 `7cb66bce`；主会话追加 CLI readback 与 runtime manager fixture 切片为 `30401634`、`63431d3e`；subagent lane `codex/mas-route-json-boundary-20260704` 已吸收为 `f9c9bc57`。
- Fresh evidence：focused tests `node --test --experimental-strip-types tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider-cli.test.ts tests/src/cli/cases/golden-path-single-default.test.ts tests/src/cli/cases/runtime-app-release-user-path-long-operator.test.ts tests/src/cli/cases/scholar-skills-command-surface.test.ts tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts tests/src/family-runtime-temporal-terminal-sync.test.ts` 为 75/75 pass；runtime manager / App / system / evidence focused tests 为 51/51 pass；MAS route focused tests 为 17/17 pass；`npm run typecheck` pass；`npm test` smoke 84/84 pass；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check HEAD~4..HEAD` pass；当时 full scan 为 `finding_count=743`、`hard_gate_finding_count=288`、`advisory_finding_count=455`、`decisioned_finding_count=743`、`undecisioned_finding_count=0`、`handwritten_json_boundary=48`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`phase10-test-and-fixture-projections=615`。该证据只证明本轮测试 JSON boundary 继续收薄和 no-resurrection diff gate 保持；不证明 schema boundary 全量完成、runtime ready、domain ready、release ready、production ready、owner acceptance 或 App/Aion live validator 完成。

## Test Fixture JSON Boundary Sweep 2026-07-04

本轮继续消化测试层 direct `JSON.parse(...)`，只把测试进程中读取 CLI stdout/stderr、fixture file、operator logs、package/update summaries、research read-model schema examples、workspace/project protocol files、readiness / runtime evidence ledger payload 与 runtime dispatch payload 的解析迁到 `tests/src/cli/helpers.ts` re-export 的 `parseJsonText()`。嵌入式外部进程 fixture 里的 `JSON.parse` 保留，因为它们模拟 external executor / native helper / Rscript / node:sqlite runtime，不属于测试侧 JSON boundary；`domain-pack-compiler-canonical-targets.test.ts` 保留 3 处，因为该文件 focused test 在无本轮改动下仍有 readiness 语义漂移，不能把 JSON helper 迁移混入语义修复。

- Absorption：主会话 commit `547a6174` 处理 runtime fixture readbacks；subagent commits `8509d84c`、`bd84999d`、`76db1c93` 分别吸收为 main commits `18e26e60`、`e34b610e`、`8391d9a7`；主会话从未提交 subagent diff 中吸收 built CLI 与 research read-model fixtures 为 `d4670108`、`abb43f1a`；type follow-up 为 `0b9a2eae`。
- Fresh evidence：combined focused tests `node --test --experimental-strip-types` 覆盖 runtime binding / MAS route / Temporal provider / worker lifecycle / readiness ledgers / research read-model / ScholarSkills artifact / managed update / package daily check / system engine / install / workspace registry / workspace project protocol / BookForge artifact lifecycle 等为 `224/224 pass`；`npm run typecheck` pass；`npm test` smoke `84/84 pass`；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check HEAD~6..HEAD` 与 `git diff --check` pass；当前 full scan 为 `finding_count=710`、`hard_gate_finding_count=255`、`advisory_finding_count=455`、`decisioned_finding_count=710`、`undecisioned_finding_count=0`、`handwritten_json_boundary=15`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`phase10-test-and-fixture-projections=582`。该证据只证明测试/fixture JSON boundary 继续收薄和 no-resurrection diff gate 保持；不证明 schema boundary 全量完成、runtime ready、domain ready、release ready、production ready、owner acceptance 或 App/Aion live validator 完成。

## Console Runtime Activity Status Gate 2026-07-04

本轮修正 App/operator workbench 对 OPL family-runtime stage attempt 的状态投影：`checkpointed` 不再被当作 running 项目呈现，`failed` / `blocked` / `dead_lettered` / `human_gate` 只进入 attention lane，并继续携带 refs-only stage attempt refs。该改动只修正 Console readback/projection 语义，不写 MAS domain truth、不签 owner receipt、不创建 typed blocker、不改 runtime DB/provider queue、不声明 paper progress、domain ready、runtime ready、App release ready 或 production readiness。

- Source：`src/modules/console/app-state-runtime-activity.ts` 将 stage attempt status 明确分为 running lane 与 attention lane；checkpointed 不再覆盖 MAS study 原始 attention/readback；attention lane 的 action owner / action kind 保持 operator attention 语义。
- Test：`tests/src/cli/cases/app-state-cases/mas-activity.test.ts` 增加 checkpointed / failed stage attempt fixtures，分别断言 checkpointed 不进入 running、不携带 running stage attempt ids，failed 进入 attention 并携带 attempt refs。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/app-state.test.ts tests/src/cli/cases/app-state-cases/mas-activity.test.ts` 为 17/17 pass；`npm run typecheck` pass；`npm run source:modules -- --strict-imports --strict-cycles` status=ok；`npm run reuse-first:scan:diff -- --strict` finding_count=0；`git diff --check` pass；`npm test` smoke 84/84 pass；full scan 仍为 `finding_count=1111`、`hard_gate_finding_count=656`、`advisory_finding_count=455`、`decisioned_finding_count=1111`、`undecisioned_finding_count=0`。该证据只证明 App/operator status projection 避免 false running；不证明 MAS owner consumption、stage terminalization、runtime readiness 或 domain progress。

## Observability Export File Boundary Split 2026-07-04

本轮处理 strict line-budget 重新暴露的 `src/modules/runway/observability-export.ts` 超线问题，只按语义边界把 Collector smoke 进程 / endpoint / typed blocker 逻辑拆到同 owner 子模块；不改变 OpenMetrics 输出、Collector smoke readback、semantic convention contract、runtime truth、domain truth、owner receipt、typed blocker 或 production readiness。

- Source：新增 `src/modules/runway/observability-export-parts/collector-smoke.ts` 承接 `runObservabilityCollectorSmoke`、Collector binary resolution、smoke config、bounded local endpoint 和 metric observation；`observability-export-parts/shared.ts` 承接 endpoint readback / JSON response helper；`observability-export.ts` 保留 export payload、OpenMetrics render 和 public metrics endpoint。
- Boundary：`observability-export.ts` 从 1130 行降到 574 行；新增 Collector smoke part 为 532 行，均低于 1000 行预算。该拆分只降低文件边界风险，不新增 wrapper、不引入依赖、不改变 public import surface。
- Fresh evidence：`node --test --experimental-strip-types tests/src/cli/cases/runtime-observability-export.test.ts tests/src/cli/cases/app-state.test.ts tests/src/cli/cases/app-state-cases/mas-activity.test.ts` 为 23/23 pass；`npm run typecheck` pass；`npm run source:modules -- --strict-imports --strict-cycles` status=ok；`npm run reuse-first:scan:diff -- --strict` finding_count=0；`npm run line-budget` pass；`npm run line-budget:strict` pass；`git diff --check` pass；`npm test` smoke 84/84 pass；`npm run build` pass；`npm run lint` pass；full scan 仍为 `finding_count=1111`、`hard_gate_finding_count=656`、`advisory_finding_count=455`、`decisioned_finding_count=1111`、`undecisioned_finding_count=0`。该证据只证明 Observability file boundary、collector smoke 行为和 no-resurrection diff gate 保持；不证明外部 runtime endpoint、OTLP exporter、runtime ready、domain ready、production ready 或 owner acceptance。

## Reuse-first Residual Closeout 2026-07-05

本轮并行关闭剩余测试层 handwritten JSON findings，修正 full scan 对历史投影 worklist 的 blocker 语义，并把 runtime / update-package / observability 剩余项落到 owner-route readback。该切片不改变 runtime queue、managed update、observability exporter 产品行为，不写 domain truth、owner receipt、typed blocker、release/currentness 或 production readiness。

- Source：测试层剩余 direct `JSON.parse(...)` 已迁到 `parseJsonText()`，真正嵌入式 external executor / native helper fixture 保留并加 reuse-first allow marker；`domain-pack-compiler-canonical-targets.test.ts` 按当前 family-defaults 5 个标准 domain agent readback 校准，ScholarSkills 继续作为 refs-only capability package tail 而不是 generated interfaces default domain agent。
- Governance：`reuse-first-scan` 新增 `open_worklist_finding_count`、`blocking_worklist_finding_count` 与 `allowed_projection_finding_count`，diff strict gate 仍不应用 historical worklist 豁免；full scan 现在区分“历史投影允许存在”和“真正未决 blocker”。
- Owner route：`contracts/opl-framework/reuse-first-historical-worklist.json#residual_readback_2026_07_05` 固化 5 个仍需 owner/live evidence 的后续项：external Temporal durable lifecycle、App release owner route、capability package channel owner route、OTLP/exporter live endpoint、domain tail owner acceptance。
- Owner-live preflight：`contracts/opl-framework/reuse-first-historical-worklist.json#owner_live_evidence_preflight_2026_07_05` 逐项固化 5 个 open item 的 missing evidence、legal next owner/command、forbidden completion evidence 与 stop condition；`current_evidence_available=false`、`open_item_count=5`、`can_claim_*_ready=false`。
- Fresh evidence：focused JSON/readiness tests `58/58 pass`；`node --test --experimental-strip-types tests/src/reuse-first-scan.test.ts` 为 `16/16 pass`；full scan 当前为 `finding_count=697`、`hard_gate_finding_count=242`、`advisory_finding_count=455`、`decisioned_finding_count=697`、`undecisioned_finding_count=0`、`open_worklist_finding_count=0`、`blocking_worklist_finding_count=0`、`allowed_projection_finding_count=697`、`handwritten_json_boundary=2`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`owner_route_worklist_count=5`、`owner_live_evidence_required_count=5`、`owner_route_open_count=5`、`owner_live_preflight_open_item_count=5`、`owner_live_preflight_current_evidence_available=false`、`owner_live_preflight_can_claim_runtime_ready=false`；`npm run reuse-first:scan:diff -- --strict` 返回 `finding_count=0`；`git diff --check` pass。该证据只证明 historical worklist 已决、测试 JSON boundary 收薄、no-resurrection diff gate 保持和 owner-route / owner-live-preflight worklist 清晰；不证明 runtime ready、release ready、production ready、domain ready 或 owner acceptance。

## Plan Completion Audit

| 审计项 | 状态 | 完成度 | 新鲜证据 | 缺口 | 后续动作 |
| --- | --- | ---: | --- | --- | --- |
| 按实际情况落复用优先审计文档 | `done` | 100% | 本文位于 `docs/active/reuse-first-platform-risk-audit-and-landing-plan.md`，声明 owner/purpose/state/machine boundary。 | 无。 | 由 `docs/active/README.md` 索引为 active_support。 |
| 讲清风险点和优化方向 | `done` | 100% | `风险清单` 覆盖 Runway、schema/CLI、managed update、pack/workspace、App/Aion、domain private tails、observability。 | 代码级风险仍未消除。 | 按 phase 拆 lanes 执行。 |
| 吸收外部成熟工程经验 | `done` | 100% | 已引用 Temporal、Kubernetes、Zod/Ajv、Commander/Yargs、OCI、Backstage、OpenTelemetry 官方/一手文档。 | 未做 benchmark 或 PoC。 | Phase 1-6 中对候选模块做 ADR/PoC。 |
| 给出理想态一步到位计划 | `done` | 100% | `一步到位落地计划` 给出 Phase 0-10、完成门和建议顺序。 | 计划本身已落；目标态实现仍是长期工程。 | 继续按本文完成度表推进剩余 partial / not-started 项。 |
| 当前完成度和建议落地顺序 | `done` | 100% | `当前完成度与建议顺序` 表逐项给出百分比、状态、证据和下一步，已按本轮 first-slice 代码/合同吸收结果更新。 | 百分比是审计判断，不是 runtime/readiness evidence。 | 后续每轮都用 fresh evidence 校准。 |
| 彻底解决所有代码风险 | `partial` | 99% | 最新结构切片已落到源码与文档：`family-runtime residency proof --provider temporal --live` 已有 runtime 内置 ephemeral fixture，fresh readback 证明 Temporal test server / worker / signal history / typed closeout / missing-closeout fail-closed path，且显式 `proves_real_codex_cli=false`；`runtime observability-collector-smoke` 已能启动 bounded smoke metrics endpoint、生成 Collector config、在缺 binary 时返回 `collector_binary_missing` blocker readback，并已用真实 `otelcol-contrib v0.155.0` 观察到 OPL metric；runtime App/operator tests 内部 projection 命名已收敛，Console runtime activity status gate 已防止 checkpointed stage attempt 被投影成 running，Observability exporter 超线文件已按 Collector smoke 语义边界拆分，测试层 CLI / native helper / contract fixture / governance fixture / state-index / pack bundle / family orchestration / quality / verification surface / reuse-first scan JSON stdout 解析已复用共享 helper，kernel profile/auth/runtime mode/managed runtime/system preference JSON 读取已复用共享 helper，Console / Connect / Runway / Charter / Ledger / Foundry Lab 高风险长文件族已拆到同模块 parts 或 owner-local sibling 文件，agent package physical Codex surface 已复用既有 Connect system-installation plugin registry helper，目标源码文件均低于 1000 行，private CLI command specs、Agent Lab developer-mode tests 与 substrate provenance surface 已进入 test lane registry，owner-routed rollback command projection 已由 scanner allow 从 worklist hard hits 中移除，本轮已拆完 8 条超线测试 reviewed baselines，line-budget contract 当前 `reviewed_baselines=[]`；既有 shared JSON boundary、CLI registry、managed update owner boundary、queue projection boundary、observability semantic convention、HTTP `/metrics` endpoint 与 no-resurrection scan 继续生效；`owner_live_evidence_preflight_2026_07_05` 已把剩余 5 个 owner-live-evidence item 的 missing evidence、legal next owner/command、forbidden completion evidence 和 stop condition 固化为 machine-readable readback，明确 `current_evidence_available=false`、`open_item_count=5`、`can_claim_*_ready=false`；full scan 已把 `owner_route_worklist_count=5`、`owner_live_evidence_required_count=5`、`owner_route_open_count=5`、`owner_live_preflight_open_item_count=5`、`owner_live_preflight_current_evidence_available=false`、`owner_live_preflight_can_claim_runtime_ready=false` 提升到顶层和 `historical_decision_summary`，避免把 `open_worklist_finding_count=0` 误读成 owner/live evidence 已关闭。Fresh evidence：agent package physical surface focused test 5/5 pass；family plugin registration regression 19/19 pass；collector/semantic/CLI registry focused tests 19/19 pass；真实 `otelcol-contrib v0.155.0` collector smoke `status=observed`、`collector_consumption_observed=true`、`observed_metric_name=opl_provider_ready`、`can_claim_runtime_ready=false`；runtime App/operator projection touched tests 54/54 pass；App state runtime activity focused tests 17/17 pass；Observability / App state boundary focused tests 23/23 pass；Codex default shell / Connect skill sync / reuse-first scan focused tests 41/41 pass；kernel/App state focused tests 35/35 pass；Console / Connect / Runway focused tests 50/50 pass；Foundry focused tests 49/49 pass；Charter / Ledger focused tests 41/41 pass；Temporal worker/live proof tests 17/17 pass；CLI / Agent Lab / managed update tests 67/67 pass；first split focused tests 57/57 pass，post-marker App action/state rerun 15/15 pass；remaining baseline focused tests 63/63 pass；test JSON boundary focused tests 47/47 pass；续跑 test JSON boundary focused tests 58/58 pass；本轮 test JSON boundary focused tests 56/56 pass；后续四条隔离 lanes 分别为 23/23、29/29、40/40、8/8 pass，合并后 combined focused tests 100/100 pass；追加三条隔离 lanes 分别为 12/12、15/15、33/33 pass，吸收后 touched focused tests 60/60 pass；helper / product / CLI fixture 追加 lanes 分别为 73/73、57/57、41/41 pass，主线合并后 touched focused tests 171/171 pass；contract / CLI fixture follow-up focused tests 124/124 pass；test fixture follow-up focused tests 175/175 pass；finalization slice focused tests 233/233 pass；Connect package lifecycle focused tests 5/5 pass；reuse-first scanner focused tests 15/15 pass；Temporal live CLI readback `closeout_status=production_residency_code_path_proven` 且 `codex_fixture.proves_real_codex_cli=false`；collector missing-binary CLI readback `status=blocked`、`typed_blocker.blocker_type=collector_binary_missing`、`can_claim_runtime_ready=false`；`npm run typecheck` pass；`npm run source:modules -- --strict-imports --strict-cycles` status=ok；`npm run reuse-first:scan:diff -- --strict` finding_count=0；`git diff --check` pass；`npm test` smoke 84/84 pass；`npm run build` pass；`npm run lint` pass；`npm run line-budget` pass；`npm run line-budget:strict` pass；当前 full reuse-first scan `finding_count=697`、`hard_gate_finding_count=242`、`advisory_finding_count=455`、`decisioned_finding_count=697`、`undecisioned_finding_count=0`、`open_worklist_finding_count=0`、`blocking_worklist_finding_count=0`、`allowed_projection_boundary=697`、`owner_route_worklist_count=5`、`owner_live_evidence_required_count=5`、`owner_route_open_count=5`、`owner_live_preflight_open_item_count=5`、`owner_live_preflight_current_evidence_available=false`、`owner_live_preflight_can_claim_runtime_ready=false`、`handwritten_json_boundary=2`、`custom_runtime_queue=147`、`custom_update_or_package_manager=93`、`custom_observability_ledger=455`、`phase2-update-command-registry-projection=0`、`phase4-src-modules-runtime-queue=0`、`phase6-src-modules-update-package=0`、`phase10-src-modules-observability=0`。 | 仍不是全量完成：Runway durable lifecycle 尚未完全迁到真实 external Temporal history；live proof 仍使用 ephemeral Codex fixture，不证明真实 Codex CLI；schema/CLI/readback 边界仍有 2 个历史 handwritten JSON findings，均为允许的 kernel shared helper；runtime queue 仍有 147 个历史/projection findings；update/package 仍有 93 个 allowed projection findings；observability 仍有 455 个历史/advisory findings，Collector smoke 已证明真实 Collector 可消费 bounded OPL smoke endpoint，但仍不证明外部 runtime endpoint、OTLP exporter、runtime ready、domain ready 或 owner acceptance；测试层仍有 569 个允许的 projection/fixture findings，但不再是 line-budget reviewed baseline；agent package physical surface 仍未证明第三方 package 安全审计、真实用户 Codex reload 或 owner acceptance；5 个 owner-live-evidence item 仍全部 open；domain private tail 尚未逐 repo physical closeout；App/Aion live validator、外部 Collector/exporter 消费和 owner acceptance 尚未完成。 | 继续按 external Temporal durable lifecycle、外部 runtime endpoint/OTLP owner lane、test fixture/projection cleanup、domain tail、App/Aion consumer-only、historical findings worklist 顺序推进；不得把 worklist 分类、fixture/live-test proof、first-slice 测试绿或 clean diff gate 包装成 production ready。 |

## Forbidden Claims

- 本文不能被引用为 OPL ready、domain ready、App release-ready、production ready、Brand L5、owner acceptance 或 physical delete authorization。
- `Temporal SDK 已安装` 不等于 Temporal-first runtime 已完成；必须看 workflow/activity/schedule/history 是否接管 durable lifecycle。
- `schema plan 已写` 不等于 boundary schema current；必须看 source handler 是否实际使用 schema registry。
- `CLI registry 计划已写` 不等于 command parser 已统一；必须看 commands 是否不再绕过 registry。
- `domain tail matrix 已写` 不等于 private platform 已退役；必须看 active caller、replacement owner、tombstone/provenance 和 no-forbidden-write。
- `App/Aion contract/read-model 存在` 不等于 consumer-only；必须看 local scheduler/update/runtime path 是否无法写 truth。
