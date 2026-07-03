# OPL 复用优先平台风险审计与落地计划

Owner: `One Person Lab`
Purpose: `reuse_first_platform_risk_audit_and_landing_plan`
State: `active_support`
Machine boundary: 本文是人读审计、理想态标准和落地计划。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App evidence 和各 domain repo owner surface。本文不声明 release-ready、production-ready、domain ready、owner acceptance、Brand L5 或 physical delete authorized。

## 当前结论

OPL family 现在最大的复用风险不是“缺少外部 agent framework”，而是通用平台能力已经在多个层面出现自研过厚的趋势：queue / attempt / scheduler / SQLite ledger、schema/CLI parsing、managed update、workspace/pack transport、App/Aion local consumer surface，以及 domain repo 里的默认 caller / private wrapper 尾巴，都有继续演化成第二套平台的风险。

理想方向不是用某个外部 agent framework 替换 OPL，也不是把 MAS/MAG/RCA 的 domain truth 上收到 OPL；而是把 OPL 收敛成 `Temporal-first durable runtime + Kubernetes-style reconciler + schema-first boundary + standard CLI/parser + OCI/content-addressed package + OpenTelemetry-style telemetry + Backstage-like catalog descriptors`。OPL 保留 authority model、stage/owner/receipt/typed blocker 语义和 domain boundary，成熟工程模块承担通用基础能力。

本文最初按复用优先原则给出结构风险审计和一步到位计划；截至 2026-07-04，已按该计划并行吸收多批 first-slice 代码 / 合同 / readback / source-boundary lanes 回 `main`。这些切片把 reuse-first gate、schema/CLI boundary、Runway Temporal-first readback、reconciler safe action、managed update owner boundary、Pack/Workspace content-addressed policy、domain-tail matrix、App/Aion consumer-only readback、observability semantic conventions、Connect provider receipts、Agent Lab self-evolution work orders、Ledger artifact provenance、source-module owner alignment、family action catalog owner、source-ref kernel helper、runtime snapshot provider injection，以及 Charter / Console / managed update / OMA JSON boundary helper 迁移进可执行维护面；但它们仍不是 OPL production ready、domain ready、App release ready、owner acceptance、full historical risk eliminated 或 physical delete authorization。后续真正关闭每个风险项仍必须逐项替换 active caller，并用 source/contract/CLI/runtime/live owner evidence 分账验收。

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

## 当前完成度与建议顺序

百分比表示相对本文理想态的功能/结构完成度，不是 readiness、release、production 或 owner acceptance。

| 顺序 | 工作项 | 当前完成度 | 状态 | 当前证据 | 下一步 |
| --- | --- | ---: | --- | --- | --- |
| 1 | Reuse-first governance gate | 91% | `partial` | 已落 `contracts/opl-framework/reuse-first-governance.json`、`contracts/opl-framework/reuse-first-historical-worklist.json`、`scripts/reuse-first-scan.mjs`、`npm run reuse-first:scan`、`npm run reuse-first:scan:diff` 与 `./scripts/verify.sh reuse-first`；full scan 现在输出 historical decision/worklist readback；maintainer scripts 已新增共享 JSON helper，`phase0-maintenance-script-boundaries` 从 59 降到 56；GitHub Verify 的 lint/structure job 会跑 strict diff gate。 | 继续逐项消化 worklist 中的 migration / owner-decision findings；不要把 worklist 分类或 clean diff gate 当作全仓历史风险已清零。 |
| 2 | Schema boundary consolidation | 51% | `partial` | Phase 1 seed lane 已引入 Ajv-backed `src/kernel/schema-registry.ts`；`ProgressDeltaReceipt` 与 `DomainProgressTransitionRuntime` live readback 已分别迁到 schema registry；runtime / entrypoint CLI JSON boundary 已新增 centralized `json-boundary.ts`，累计消化 runtime command spec、App release / OMA live path、Agent Lab public command、OKF / ScholarSkills public spec 与 Agent Lab payload parser 的分散 helper；Pack / Foundry JSON file boundary 已集中到 `src/kernel/json-file.ts`；Atlas domain-manifest / memory contract、Charter advisory / L5 evidence / source-structure readback、Console app-state / operator drilldown / runtime tray readback、Connect system-installation JSON/readback、Connect skill-pack / ACP stdio / Developer Mode / generated plugin / managed install-update ledger JSON boundary、Pack privatization / residue gate JSON boundary、managed update receipt 与 OMA ledger readback first-slice 已复用 `src/kernel/json-record.ts` / `src/kernel/json-file.ts`；Charter error vocabulary 已从非 Charter 模块收回到 `kernel` owner。Full scan 当前仍有 `handwritten_json_boundary=830`。 | 继续把 pack descriptors、workspace projections、剩余 module JSON outputs 接入 schema registry/shared boundary；禁止新增分散 validator。 |
| 3 | CLI parser/command registry | 57% | `partial` | 已落最小 `CommandSpec.registry` 与 `validateCommandRegistryCoverage` adapter，`connect pubmed search`、`connect references verify`、`connect external-skills list/search/inspect/sync`、`connect install/update/reinstall/remove` module actions，以及 `status workspace/runtime/dashboard` 都进入 registry；status 三命令已复用 registry parser adapter；entrypoint CLI handwritten JSON findings 从 52 降到 40，hard findings 从 28 降到 16。 | 继续把高频 public commands 纳入 registry，并继续收敛剩余 runtime / public command specs；只有当 Commander/Yargs 能减少现有 parser 分散度时再引入依赖。 |
| 4 | Runway Temporal-first runtime | 65% | `partial` | Temporal SDK 已是一等依赖，docs 已声明 Temporal production substrate；`family-runtime status/queue list` 已暴露 `queue_lifecycle_boundary`；Runway control-loop 已把 competing SQLite queue lifecycle 纳入 Temporal readiness 降级；新增 `family-runtime-temporal-first-contract.json` 与 readback，映射 StageRunWorkflow / StageAttemptActivity / ReconcileWorkflow / HumanGateSignal / OwnerReceiptSignal 到 Temporal workflow/activity/signal/schedule/history；queue lifecycle boundary 现在把 `lease`、`dead_letter`、`max_attempts` 等旧 vocabulary 明确降级为 projection / operator handoff readback，并要求 Temporal workflow history/query、retry policy、failure history、stage attempt identity 与 projection repair/retirement receipt。 | 继续把 stage attempt durable lifecycle 从 SQLite mutation path 迁到真实 Temporal workflow/activity/schedule/history；local provider 保持 dev/CI/offline diagnostic。 |
| 5 | Kubernetes-style reconciler | 60% | `partial` | `family-runtime lifecycle reconcile` 已输出 desired_state / observed_state / reconcile_decision / next_safe_action，mutation 只允许进入 lifecycle apply receipt projection，禁止写 domain truth、artifact body、owner receipt 或 typed blocker；`opl runway reconcile --json` 现在把 `queue_lifecycle_boundary` 作为 observed_state，在 local SQLite lifecycle 与 Temporal 竞争时只输出 `observe_queue_lifecycle_boundary` readback，不给 scheduler tick mutation；Runway control-loop 在 queue handoff gate attention 时只给 read-only observation。 | 继续把 worker/App/domain helper mutation 收到统一 Reconciler safe-action source。 |
| 6 | Managed update split | 59% | `partial` | App release channel 与 managed update plane 边界存在；已增加 `owner_route_contract`、`owner_execution_boundary_contract`、组件级 `owner_route` / `owner_execution_boundary` 与 receipt `owner_projection`，把 app binary / runtime substrate / capability packages 明确路由到 owner/readback/apply owner，并保留 no-package-manager forbidden claims；receipt JSON 读取已复用共享 record boundary，不再在 managed update 模块私写 `optionalString` / `optionalStringArray` helper。 | 继续把 runtime materializer、App release updater、capability package channel 与 companion/workflow manual owner route 的 active caller 边界继续拆薄；不要声明 release/currentness ready。 |
| 7 | Pack/Workspace standardization | 64% | `partial` | pack/workspace CLI 与 descriptors 已存在；Pack OS lock/cache/registry 已增加 OCI descriptor/digest 字段，并统一投影 `content_addressed_lock_policy`：OCI media type、sha256 digest、refs-only lock、no registry push/pull、no body、no stage close、no domain truth write；Workspace shared-resource manifest/inventory 已增加 sha256 content-addressing policy。 | 继续把 Workspace validate/doctor 的 hard blocker/repairable finding 口径收紧，并逐步把 remaining pack/workspace transport/cache 历史 findings 归入 standard descriptor/digest/lock。 |
| 8 | Domain private platform retirement | 69% | `partial` | 已落 machine-readable `domain-private-platform-tail-matrix.json` 和 executable `domain_private_platform_tail_matrix` readback，覆盖 MAS/MAG/RCA/OMA/BookForge/ScholarSkills tail class、replacement primitive、retained authority、delete/tombstone gate、forbidden claims、`physical_delete_authorized=false` 与 owner decision gate；OMA live path / production consumption / long-soak ledger JSON readback 已复用共享 OPL JSON boundary，降低 Foundry Lab 内继续沉淀私有 readback helper 的风险；仍未执行 domain repo 物理删除或 owner acceptance。 | 下一步结合各 domain repo-native readback，逐项补 no-active-caller、no-forbidden-write、tombstone/provenance 或 owner decision refs。 |
| 9 | App/Aion consumer-only | 68% | `partial` | App/Aion 边界已有合同和 release channel；Phase 8 lane 已在 `settings_control_center` 增加 executable consumer-only readback/validator，明确 local scheduler 只允许 refresh/UI/poll，forbidden truth-only paths 可见，缺 App owner receipt/typed blocker 等可见边界时输出 `validation_status=attention_required` 与 `validator_findings`。 | 继续把 App/Aion repo live validator 接入该读面；release/currentness claim 仍必须来自 App owner receipt 或 typed blocker。 |
| 10 | OpenTelemetry-style observability | 58% | `partial` | 已落 `contracts/opl-framework/observability-semantic-conventions-contract.json` 与 `src/modules/ledger/observability-semantic-conventions.ts`，把 current owner delta / stage attempt / provider attempt 投影到 trace、metric、log/event vocabulary；`runtime observability-export` 现在直接输出 `semantic_conventions` refs-only readback seed，并在 OpenMetrics 中追加 `opl_queue_length` 等 semantic convention metrics 与 `opl_observability_export_boundary`，保持 no-body / no-ready-claim boundary。 | 继续接入真实 Collector/exporter 消费面与 operator drilldown 同源导航；本阶段不声明 runtime、domain、artifact 或 production readiness。 |
| 11 | No-resurrection scan | 90% | `partial` | `reuse-first-scan` 已支持 strict diff hard/advisory gate，新增 schema/CLI/runtime/update/package 类 hard finding 会失败，observability ledger 类先进入 advisory；diff 模式明确不应用 historical worklist 豁免；full 模式按 decision status / category / path-prefix / owner / phase / action / expiry 输出 historical decision/worklist readback。当前 full scan 为 2918 findings，已全部 decisioned，undecisioned=0；`src/kernel/contract-validation.ts` 和共享 JSON boundary helpers 被明确分类为允许的共享 schema / JSON boundary helper。 | 继续把 151 个 `must_migrate`、641 个 `accepted_migration_worklist` 和 181 个 `owner_decision_required` findings 逐批迁移或做 owner 决策；worklist 分类不是 risk eliminated / release ready。 |

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
- Fresh evidence：`npm run typecheck` pass；focused Console / App / Product Entry tests 26/26 pass；`git diff --check` pass；full reuse-first scan 从 3009 降到 2962，`handwritten_json_boundary` 从 921 降到 874，`accepted_migration_worklist` 从 740 降到 693。该证据只证明 Console drilldown/runtime tray JSON boundary 收薄，不证明 App runtime ready、domain ready、release ready、production ready 或 owner acceptance。

## Phase 1 Connect System Installation JSON Boundary Foldback 2026-07-04

本轮继续消化 Connect system-installation 的局部 JSON helper，只把 Docker/WebUI doctor、engine action/update receipt、framework self-update、module package channel、packaged module marker、module workflow stdout JSON 与 seed manifest 读取接回 `kernel` shared JSON boundary；不改变 install/update 执行语义、App release truth、runtime currentness、owner receipt、typed blocker、release-ready 或 production-ready claim。

- Connect system-installation：`docker-webui-doctor.ts`、`engine-actions.ts`、`engine-helpers.ts`、`environment.ts`、`framework-self-update.ts`、`module-action-workflow.ts`、`module-package-channel.ts`、`module-packaged.ts`、`modules.ts`、`seed-manifest.ts` 复用 `parseJsonText()`、`readJsonFileOrNull()`、`readJsonPayloadFile()`、`isRecord()` 与 `stringValue()`；`shared.ts` 修正 modular layout 下的 project root 解析，`framework-self-update.ts` 的 framework root 判定接受 target CLI entrypoint，`local-codex-defaults.ts` 修正 modular source layout 下的 bundled profile path，`system-update-management.test.ts` 的 framework runtime sentinel 跟随 `src/modules/runway/**`；`src/modules/connect/system-installation/**` 的 `handwritten_json_boundary` diff findings 清零。
- Fresh evidence：`npm run typecheck` pass；focused system-install / system-update / startup-maintenance / engine / module / seed / package-channel tests 75/75 pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full reuse-first scan 从 2962 降到 2941，`handwritten_json_boundary` 从 874 降到 853，`accepted_migration_worklist` 从 693 降到 664。

## Phase 1 Connect Skill-Pack JSON Boundary Foldback 2026-07-04

本轮继续消化 Connect skill-pack / ACP / Developer Mode / generated plugin / managed install-update ledger，以及 Pack privatization / Console tray snapshot / Charter contract loader 的局部 JSON helper，把 Foundry Agent series contract 读取、plugin manifest 读取、packaged module marker 读取、specialist skill sync marker 读取、Developer Mode GitHub fixture 读取、managed install/update ledger 与 lock 读写、ACP bridge payload record/string 读取、ACP stdio JSONL 读取、Pack residue gate 投影与 Charter contract JSON 读取接回 `kernel` shared JSON boundary；不改变 skill sync scope、project/workspace/quest/codex 安装语义、ACP payload contract、domain truth、owner receipt、typed blocker、release-ready 或 production-ready claim。

- Connect / Pack / Console / Charter：`opl-skills.ts`、`opl-skills-parts/sync.ts`、`managed-install-update-ledger.ts`、`opl-acp-bridge.ts`、`opl-acp-stdio.ts`、`developer-mode-source-policy.ts`、`managed-update-lock.ts`、`managed-update-kernel-runner.ts`、`opl-skills-parts/generated-plugin.ts`、`functional-privatization-audit.ts`、`private-platform-residue-deletion-gate.ts`、`runtime-tray-domain-projection-ingestion.ts`、`runtime-tray-snapshot-utils.ts` 与 `contracts.ts` 复用 `parseJsonText()`、`readJsonFileResult()`、`readJsonFileOrNull()`、`writeJsonPayloadFile()`、`isRecord()` 与 `stringValue()`；`json-file.ts` 新增 centralized JSON payload serialization/write helper，后续 ledger/package/workspace JSON 写入应优先复用该 helper。
- Fresh evidence：`npm run typecheck` pass；focused Connect skill sync / ACP stdio / managed install-update / Developer Mode tests 66/66 pass；`npm run source:modules -- --strict-imports` status=ok；`npm run reuse-first:scan:diff -- --strict` gate_status=ok；`git diff --check` pass；full reuse-first scan 从 2941 降到 2918，`handwritten_json_boundary` 从 853 降到 830，`accepted_migration_worklist` 从 664 降到 641。

## Plan Completion Audit

| 审计项 | 状态 | 完成度 | 新鲜证据 | 缺口 | 后续动作 |
| --- | --- | ---: | --- | --- | --- |
| 按实际情况落复用优先审计文档 | `done` | 100% | 本文位于 `docs/active/reuse-first-platform-risk-audit-and-landing-plan.md`，声明 owner/purpose/state/machine boundary。 | 无。 | 由 `docs/active/README.md` 索引为 active_support。 |
| 讲清风险点和优化方向 | `done` | 100% | `风险清单` 覆盖 Runway、schema/CLI、managed update、pack/workspace、App/Aion、domain private tails、observability。 | 代码级风险仍未消除。 | 按 phase 拆 lanes 执行。 |
| 吸收外部成熟工程经验 | `done` | 100% | 已引用 Temporal、Kubernetes、Zod/Ajv、Commander/Yargs、OCI、Backstage、OpenTelemetry 官方/一手文档。 | 未做 benchmark 或 PoC。 | Phase 1-6 中对候选模块做 ADR/PoC。 |
| 给出理想态一步到位计划 | `done` | 100% | `一步到位落地计划` 给出 Phase 0-10、完成门和建议顺序。 | 计划本身已落；目标态实现仍是长期工程。 | 继续按本文完成度表推进剩余 partial / not-started 项。 |
| 当前完成度和建议落地顺序 | `done` | 100% | `当前完成度与建议顺序` 表逐项给出百分比、状态、证据和下一步，已按本轮 first-slice 代码/合同吸收结果更新。 | 百分比是审计判断，不是 runtime/readiness evidence。 | 后续每轮都用 fresh evidence 校准。 |
| 彻底解决所有代码风险 | `partial` | 84% | Phase 0/1/2/3/4/5/6/8/9/10 都已有 first-slice 代码或合同托底：schema registry seed、ProgressDeltaReceipt schema、DomainProgressTransitionRuntime live-readback schema、runtime / entrypoint CLI JSON boundary helper、Atlas JSON helper first-slice、Pack / Foundry JSON file helper、Charter advisory / L5 evidence / source-structure readback shared JSON boundary、Console app-state / operator drilldown / runtime tray readback shared JSON boundary、Connect system-installation shared JSON boundary、Connect skill-pack / ACP / Developer Mode / generated plugin / managed install-update ledger shared JSON boundary、Pack privatization / residue gate shared JSON boundary、Console action / managed update receipt / OMA ledger readback shared JSON boundary、maintainer script JSON helper、CLI registry seed、status command registry coverage、Connect module action registry、Connect external scientific skill source registry / selective sync、Connect reference verification provider receipt readback（含 Publisher metadata provider）、Runway lifecycle reconcile/readiness guard、Runway queue lifecycle observed-status safe action、Runway Temporal-first workflow/activity/signal contract readback、Runway durable lifecycle handoff readback、queue vocabulary Temporal handoff readback、runtime snapshot provider injection、managed update owner routes / owner execution boundary / receipt owner projection、Pack OS content-addressed lock policy、Workspace digest policy、domain private tail matrix executable readback、App/Aion consumer-only contract、artifact provenance bundle、artifact provenance ledger event schema/readback、Agent Lab self-evolution work-order schema/failure token registry/capability routing guard/work-order dry-run receipt、observability semantic conventions/export seed、runtime observability export semantic-convention binding、source module public-boundary cleanup、source module owner alignment / forbidden dependency policy、source-ref kernel helper、Charter error boundary kernel owner、Workspace topology owner foldback、owner id kernel helper、Console Product Entry handoff owner foldback、Foundry Lab developer-mode closeout ledger owner foldback、Pack generated-interface helper owner foldback、Charter contract-validator owner foldback、Kernel neutral helper owner foldback、Pack functional privatization owner foldback、Stagecraft stage manifest owner foldback、Charter standard-agent registry owner foldback、reuse-first hard/advisory gate、CI strict diff gate，以及 historical decision/worklist readback。当前 fresh evidence：`npm run typecheck` pass，focused stage/scaffold/public command tests 17/17 pass，focused Console / App / Product Entry tests 26/26 pass，focused Connect system-install/update/startup/engine/module/seed/package-channel tests 75/75 pass，focused Connect skill sync / ACP stdio / managed install-update / Developer Mode tests 66/66 pass，`npm test` smoke 76/76 pass，`npm run source:modules -- --strict-imports` status=ok 且 `deep_import_violations=0`、`forbidden_dependency_violations=0`，dependency-cycle count=0，`npm run reuse-first:scan -- --max-findings=0` 返回 `finding_count=2918`、`hard_gate_finding_count=1378`、`advisory_finding_count=1540`、`decisioned_finding_count=2918`、`undecisioned_finding_count=0`。 | Runway durable lifecycle 仍未完全迁到真实 Temporal history；大量手写 schema/parser/readback helper 未迁移，full scan 仍有 `handwritten_json_boundary=830`；domain private tail 尚未逐 repo no-active-caller/owner decision physical closeout；App/Aion consumer-only live validator、real Collector/exporter 消费、full reuse-first scan 仍有 2918 个历史 findings，其中 151 个 `must_migrate`、181 个 `owner_decision_required`、641 个 `accepted_migration_worklist` 仍需后续处理；source dependency cycle 已清零，后续需防止重生。 | 继续按 runtime durable lifecycle、schema/CLI 扩面、domain tail、App/Aion consumer-only、observability collector/exporter、source dependency cycle 和 historical findings worklist 顺序推进；不得把 worklist 分类、first-slice 测试绿或 clean diff gate 包装成 production ready。 |

## Forbidden Claims

- 本文不能被引用为 OPL ready、domain ready、App release-ready、production ready、Brand L5、owner acceptance 或 physical delete authorization。
- `Temporal SDK 已安装` 不等于 Temporal-first runtime 已完成；必须看 workflow/activity/schedule/history 是否接管 durable lifecycle。
- `schema plan 已写` 不等于 boundary schema current；必须看 source handler 是否实际使用 schema registry。
- `CLI registry 计划已写` 不等于 command parser 已统一；必须看 commands 是否不再绕过 registry。
- `domain tail matrix 已写` 不等于 private platform 已退役；必须看 active caller、replacement owner、tombstone/provenance 和 no-forbidden-write。
- `App/Aion contract/read-model 存在` 不等于 consumer-only；必须看 local scheduler/update/runtime path 是否无法写 truth。
