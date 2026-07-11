# OPL 复用优先平台风险审计与落地计划

Owner: `One Person Lab`
Purpose: `reuse_first_platform_risk_audit_and_landing_plan`
State: `active_support`
Machine boundary: 本文是人读审计、理想态标准、当前入口和完成度审计口径。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App evidence 和各 domain repo owner surface。本文不声明 release-ready、production-ready、domain ready、owner acceptance、Brand L5 或 physical delete authorized。

## 当前入口

结论：OPL family 的复用优先风险仍然成立，但本文不再维护逐批 lane ledger。当前 active 读法只保留四件事：

- `当前状态`：哪些风险仍是 active concern，哪些已经降为 owner/live evidence gap。
- `排除项`：哪些 worklist 已交给其他 owner/session，不能在本文继续当作本仓 backlog。
- `当前可落地项`：下一轮可在 OPL 本仓用结构/文档/contract/source 切片推进的范围。
- `完成度审计口径`：如何区分 structure landed、owner route landed、live evidence missing 和 forbidden ready claim。

2026-07-03 到 2026-07-05 的细粒度批次、worktree、commit、focused tests、scan count 和 closeout 流水已归档到 [Reuse-first 平台风险落地过程归档](../history/process/plans/2026-07-05-reuse-first-platform-risk-landing-archive.md)。需要追溯某个 lane 的过程证据时读 history；需要判断当前还能做什么时读本文。

## 当前状态

OPL family 最大复用风险不是“缺少外部 agent framework”，而是通用平台能力容易在多个面重复长厚：queue / attempt / scheduler / SQLite ledger、schema/CLI parsing、managed update、workspace/pack transport、App/Aion local consumer surface、observability ledger，以及 domain repo 里的 default caller / private wrapper 尾巴。

理想方向不是用某个外部 agent framework 替换 OPL，也不是把 MAS/MAG/RCA 的 domain truth 上收到 OPL；而是把 OPL 收敛成：

```text
Temporal-first durable runtime
+ Kubernetes-style reconciler
+ schema-first boundary
+ standard CLI/parser registry
+ OCI/content-addressed package
+ OpenTelemetry-style telemetry
+ Backstage-like catalog descriptors
```

OPL 保留 authority model、stage/owner/receipt/typed blocker 语义和 domain boundary；成熟工程模块承担通用基础能力。domain repo 继续持有 domain truth、quality verdict、artifact authority、owner receipt signer 和 minimal authority functions。

长期治理规则已沉淀到 [OPL 复用优先治理政策](../policies/reuse-first-governance-policy.md)。本文只作为 active_support：提供复用优先风险模型、Phase 0-10 标准、当前 completion audit 和下一轮 lane seed。

当前结构 readback 不在本文冻结日期、计数或单轮 proof。维护者需要判断当前状态时，fresh-read 以下 owner surface：

- `reuse-first-scan`、`source-module-boundary`、`line-budget`、`source-module-public-imports` 和 `native-helper-prebuild` 的 CLI/help/JSON 行为；
- `contracts/`、source、focused tests、typecheck、reuse-first diff gate 和 source-module gate；
- Observability、framework operating maturity、test projection pruning、schema/JSON helpers、parser helpers、fallow/cycle/source-size advisory 的 owning source/test/readback。

本文只保留风险模型、当前排除项、可落地范围和 forbidden claims。任何 dated scan count、line-budget count、test count、commit list、worktree closeout 或 source advisory snapshot 都只能作为 history/provenance 或 fresh command output 读取，不能在本文继承为 release/currentness/production/domain-ready 证据。

## 排除项

以下条目不在本文继续展开为 active ledger：

| 排除项 | 当前 owner / session | 本文保留内容 | 禁止误读 |
| --- | --- | --- | --- |
| Managed Update + Agent Packages owner-route | 另会话 / Managed Update / Pack / Connect owners | 只保留 owner-route completion audit 入口和 forbidden claim。 | 不把 `owner_route_readback`、descriptor、digest、lock 或 repair verbs 写成 package lifecycle owner receipt 或 release/currentness ready；Agent Package rollback 已退役，真实 rollback 留给 Managed Update owner route。 |
| package lifecycle verb surfaces | 另会话 / Pack / Connect owners | 只保留复用优先标准：descriptor + digest + lock + receipt projection。 | 不在本文继续追加 `install/update/repair/uninstall/status` 命令流水；不恢复 `connect agent-packages rollback`。 |
| App release/currentness owner route | App release owner / `one-person-lab-app` | 只保留 release truth 不属于 OPL Framework docs 的边界。 | 不用 Framework docs、scan、readback 或 focused tests 替代 App release owner receipt。 |
| external Temporal live substrate | Runway Runtime owner + external Temporal environment | 只保留 `external_temporal_durable_lifecycle` 缺口。 | 不把 Temporal SDK、local/test-server proof、SQLite projection 或 docs 写成 production durable lifecycle ready。 |
| OTLP/exporter live endpoint | Observability owner | 只保留 live endpoint / collector consumption 缺口。 | 不把 bounded OpenMetrics smoke、diagnostic drilldown 或 semantic convention contract 写成 production observability ready。 |
| domain tail owner acceptance | MAS/MAG/RCA/OMA/BookForge/MAS Scholar Skills owners | 只保留 refs-only matrix 和 owner decision gate。 | 不授权 physical delete，不声明 domain ready 或 owner acceptance。 |

## 当前可落地项

当前可在 OPL 本仓安全推进的条目只限非 live、非 release、非 owner-acceptance 的结构切片：

| Item | 可落地范围 | 验证口径 | 不触碰范围 |
| --- | --- | --- | --- |
| Reuse-first gate hygiene | 更新治理政策、scan worklist 说明、diff gate 分类、history/archive 指针。 | `npm run reuse-first:scan:diff -- --strict` 或最小 doc/static check；docs-only 时至少 `git diff --check`。 | 不改 runtime queue、contracts ready claim、domain truth。 |
| Schema / JSON boundary cleanup | 把新增 trust boundary 接到既有 schema registry / shared JSON helpers；删除重复 helper。 | focused tests + typecheck + reuse-first diff gate。 | 不改变 payload semantics 或 owner receipt shape。 |
| CLI registry tail cleanup | 把仍绕过 registry 的 diagnostic command 收到 command registry / parser adapter。 | CLI registry focused tests + typecheck。 | 不新增 parser abstraction，除非明显减少现有分散度。 |
| Reconciler safe-action source convergence | 让 scheduler / worker / App / domain helper 只消费 canonical safe-action source。 | focused CLI/readback tests。 | 不写 runtime DB/provider queue，不写 domain truth。 |
| Pack / Workspace descriptor standardization | 将 pack/workspace projection 收敛到 descriptor + digest + lock + provenance refs。 | focused pack/workspace tests。 | 不实现第二 package manager，不声明 package lifecycle ready。 |
| Source owner/import cleanup | 把 shared helper 归到实际 owner，删除薄 wrapper 或 dead export。 | `npm run source:modules` + focused tests。 | 不做跨 repo physical delete 或 domain tail owner acceptance。 |
| Docs archive hygiene | 把 active 文档中的 dated proof、commit list、scan counter、worktree closeout 移到 `docs/history/**`。 | `git diff --check`。 | 不把 history 摘要写成 current truth。 |

若下一轮目标命中排除项，必须从对应 owner surface 重新开 lane，不能在本文追加流水。

## 审计边界

本轮审计输入来自当前 OPL docs/source/package 读面、domain repo owner surface、App/Aion consumer boundary 和成熟工程项目的一手文档参考。外部经验只作为工程模式，不把外部产品模型直接搬进 OPL。

主要风险信号：

- Runway 曾自持 queue / attempt / lease / dead-letter / scheduler 语义，而 Temporal 已是 production online runtime 必需 substrate。
- schema/readback/CLI parsing 曾分散在 `isRecord`、`optionalString`、`JSON.parse`、`parseArgs` 等局部 helper 中。
- managed update kernel 容易同时承担 app binary、runtime substrate、capability packages、codex surface、companion tools、workflow profile 的 status/check/plan/apply/repair/rollback。
- workspace / pack 容易复刻 descriptor、cache、distribution、registry、lock、validate、lifecycle surface。
- App/Aion consumer surface 容易反向定义 runtime/update/settings truth。
- domain repo 的 generic runner、status sidecar、session/workbench/helper 尾巴容易继续定义 private platform。
- private ledger / drilldown 容易扩成自研 observability stack。

参考项目：

- Temporal: Task Queues、Tasks、Retry Policies、Event History。
- Kubernetes: controller / operator / spec-status pattern。
- Zod / Ajv: schema-first trust boundary。
- Commander / Yargs: command parser and help surface。
- OCI: manifest、descriptor、distribution、content address。
- Backstage: catalog descriptor、owner、lifecycle、relations。
- OpenTelemetry: trace / metric / log / event signal model。

## 风险清单

| Priority | 风险点 | 当前读法 | 优化方向 |
| --- | --- | --- | --- |
| P0 | domain repo 私有通用平台尾巴 | 仍需 domain owner route 和 no-active-caller / owner decision evidence。 | domain repo 只保 declarative pack、domain authority functions、quality verdict、artifact authority、owner receipt signer。 |
| P1 | Runway queue/attempt/scheduler/SQLite 与 Temporal 重叠 | active src migration item 曾被结构收薄，但 external durable lifecycle 仍需 live owner evidence。 | Temporal 持有 durable workflow history、task queue、activity retry、schedule；OPL SQLite 只保 authority refs、projection/cache 和 audit drilldown。 |
| P1 | hand-written schema/readback/CLI parsing 分散 | 已有 shared schema/JSON boundary 与 command registry；新增边界必须复用现有入口。 | 单一 schema owner 和 command registry 派生 CLI/API/readback shape。 |
| P1 | Managed update kernel 变成私有 package/update manager | owner-route 和 package lifecycle verb surfaces 另会话处理。 | app binary、runtime substrate、capability packages、Connect sync、receipt/projection 分 owner。 |
| P2 | Workspace/Pack 自定义 transport/index 过厚 | 只允许 refs/provenance/projection；package lifecycle owner receipt 不在本文关闭。 | descriptor + digest + lock + content-addressed artifact。 |
| P2 | App/Aion consumer surface 反向定义 truth | consumer-only structural work 不等于 App release ready。 | App/Aion 只消费 owner contract/read-model/receipt。 |
| P2 | external executor adapter 过度扩张 | Codex CLI 仍是一等默认 executor，其他 executor 只走 explicit adapter。 | adapter registry 只声明 binding、capability、receipt shape、fail-closed 规则。 |
| P2 | Observability 自定义 ledger 越来越多 | semantic conventions 和 diagnostic endpoint 不等于 live exporter。 | OpenTelemetry-style trace/metric/log/event；ledger 只保 authority refs 与审计索引。 |

## 理想目标态

1. `Runway`
   - Temporal 是唯一 production durable execution substrate。
   - Worker supervisor 只保 worker process liveness。
   - Scheduler 只制造 reconcile cadence。
   - Progress Reconciler 对 desired owner route 与 observed runtime state 做 idempotent reconciliation。
   - SQLite/ledger 只保 authority refs、projection、audit drilldown。

2. `StageRun / Authority`
   - Stage current pointer、terminal state、`current_owner_delta` 只能从 OPL append-only authority event log 派生。
   - Provider completion、test pass、file existence、projection clean 都不能关闭 stage。
   - owner receipt、typed blocker、human gate、route-back ref 是关闭或推进的唯一语义输入。

3. `Schema / Contract`
   - external JSON boundary、contract JSON、readback JSON、CLI JSON output、receipt、descriptor、pack manifest 和 App payload 都有单一 schema owner。
   - 手写 record/scalar helper 只允许在极小 shared helper 中存在。

4. `CLI / API`
   - `opl` command tree 从 command registry 派生。
   - parser 库或现有 thin adapter 负责 options/help/errors；handler 只处理业务语义和 authority boundary。
   - tests 验证 machine payload，不固定 prose 文案。

5. `Pack / Connect`
   - Pack 是 declarative descriptor、content-addressed artifact、lockfile 和 distribution policy。
   - Connect 是 adapter registry / discovery / sync surface，不是更新系统和第二 package manager。

6. `Workspace`
   - Workspace 是 generated projection 和 lifecycle shell。
   - Workspace 不持 domain truth、artifact authority、quality verdict、memory body 或 package/export readiness。

7. `App / Aion`
   - App 是 ordinary user/operator cockpit，消费 OPL/App/domain owner truth。
   - Aion shell 是 adapter/consumer，不维护 settings/update/runtime policy。

8. `Domain agents`
   - MAS/MAG/RCA/OMA/BookForge 是 `Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`。
   - Domain repo 不保留私有 scheduler、queue、attempt ledger、workspace lifecycle、session store、generic workbench 或 package/update manager。

## Phase 0-10 标准

| Phase | 目标 | 完成门 | 当前 active 读法 |
| --- | --- | --- | --- |
| 0 Reuse-first gate | 让“能复用就不手搓”成为 repo 可执行规则。 | scan/worklist 能列出风险；diff gate 阻止新增 hard finding；不写 ready claim。 | 结构面大体已落，继续维护 gate hygiene。 |
| 1 Schema boundary | 消除分散 hand-written validator。 | 新增/修改 JSON boundary 必须 schema/shared helper validated。 | 继续按新增 diff 守门。 |
| 2 CLI registry | command tree 从 registry 派生。 | 新增 command 无法绕过 registry；legacy parser 有 retirement gate。 | 继续消化 diagnostic tail。 |
| 3 Temporal-first runtime | 自研 queue/attempt/scheduler 降级为 projection/audit。 | stage attempt lifecycle 可从 Temporal history + authority event 重建。 | live substrate evidence 仍 open。 |
| 4 Reconciler split | scheduler/worker/App/domain helper 统一收到 desired/current reconciliation。 | `opl runway reconcile --json` 是唯一 safe-action source。 | 继续收敛 active caller。 |
| 5 Managed update split | 避免 OPL 自研全能 updater/package manager。 | 每个 component 有单一 owner，kernel 不同时决定所有 truth。 | 排除，另会话/owner-route 处理。 |
| 6 Pack / Workspace standardization | 减少自研 transport、cache、distribution、workspace inventory。 | descriptor + digest + lock 可复现；workspace validate/doctor 只分 blocker/finding。 | package lifecycle verbs 排除，descriptor/projection 可继续做。 |
| 7 Domain private platform retirement | 切掉 MAS/MAG/RCA/OMA/BookForge 的通用平台尾巴。 | no-active-caller 或 owner-decision gate；physical delete 需 owner decision。 | owner acceptance 仍 open。 |
| 8 App/Aion consumer-only | App/Aion 不反向定义 runtime/update/settings truth。 | App/Aion 无本地 truth-only path。 | release owner evidence 仍 open。 |
| 9 OpenTelemetry-style observability | ledger/drilldown/attempt/progress/readiness 转成统一观测模型。 | trace/metric/log/event vocabulary 能读同一 current owner delta。 | live exporter/collector evidence 仍 open。 |
| 10 No-resurrection governance | 防止退役手搓模块重新长回来。 | reuse-first lint / diff gate / tombstone scan 防新增。 | 继续跟随 Phase 0 gate。 |

## 完成度审计口径

百分比只表示相对本文理想态的功能/结构完成度，不是 readiness、release、production 或 owner acceptance。

| 审计项 | 状态 | 完成度 | 当前证据类型 | 缺口 / 后续动作 |
| --- | --- | ---: | --- | --- |
| active reuse-first 文档去流水账化 | `done` | 100% | 本文入口压缩为 current status / exclusions / landable items / audit；历史流水移到 history archive。 | 后续不得在本文继续追加 dated closeout ledger。 |
| Reuse-first governance gate | `partial` | 98% | contract/support doc、strict diff gate、policy、history archive 指针；`reuse-first-scan --help` 与 `reuse-first:scan:diff` 已落。 | 继续按 fresh diff gate 消化新增 hard finding；不能声明历史风险清零。 |
| Schema boundary consolidation | `partial` | 88% | shared schema/JSON helper、focused tests、typecheck、diff gate；receipt ledger 和 scalar handling 的当前 owner 是 `src/kernel/json-file.ts`、`json-record.ts` 与实际 consumer imports。 | 继续禁止新增分散 validator；receipt helper 不改变 payload semantics 或 owner receipt shape；legacy alias 随 caller 迁移逐步退休。 |
| CLI parser/command registry | `partial` | 92% | command registry、parser adapter、protected/required command set，以及 maintainer scripts / runtime command 的 fresh help/json readback。 | 继续迁 remaining public/runtime diagnostic commands；避免新增 parser dependency。 |
| Runway Temporal-first runtime | `blocked` | 88% | local/test-server proof、readback contract、queue projection boundary。 | 需要 external Temporal history/query、managed worker、真实 executor closeout、owner/domain refs。 |
| Kubernetes-style reconciler | `partial` | 68% | safe-action source / desired-observed readback。 | 继续把 worker/App/domain helper mutation 收到 canonical safe-action source。 |
| Managed update split | `partial` | 80% | owner-route projection、receipt boundary、component owner split。 | 排除：Managed Update owner-route 另会话处理；不声明 release/currentness ready。 |
| Pack / Workspace standardization | `partial` | 74% | descriptor/digest/lock/provenance refs、workspace hard-blocker precedence；Pack OS source advisory 已通过 CLI args 邻近 part 拆分关闭，未改变 refs-only pack authority boundary。 | 排除：package lifecycle verbs 和 owner receipt 另 owner/session。 |
| Domain private platform retirement | `blocked` | 92% | OPL refs-only matrix、domain repo structural follow-ups。 | 需要 domain owner acceptance / typed blocker / explicit physical-delete decision。 |
| App/Aion consumer-only | `partial` | 93% | App/Aion refresh/projection-only contract/readback evidence。 | 需要 App release owner receipt 和 release/currentness source ref。 |
| OpenTelemetry-style observability | `partial` | 94% | semantic convention、bounded endpoint/readback、collector smoke；export source wording 已从 private ledger/drilldown 收薄到 OpenTelemetry/ref projection。 | 需要 OTLP/exporter live endpoint、external collector owner receipt、production chain evidence。 |
| Test / contract projection pruning | `done` | 100% | provider evidence projection tests、route-support tests、App release evidence guard、runtime protocol fixtures 和 source/test size gate 共同持有当前结构读法；具体 scan/count 只能 fresh-read。 | residual watch-only：package/update 相关项由另会话处理，runtime protocol fixture 保留真实 queue 语义，contract/CLI/schema/projection 名保留真实 surface；不声明 runtime/domain/App release ready。 |
| Fallow / source owner hygiene | `partial` | 90% | `.fallowrc.json` stale source entrypoint 改回真实 `src/entrypoints/**` / `src/modules/**` paths；`foreground-paths.ts` 不再 import family runtime store，切断 Runway Temporal provider cycle tail；删除 3 个私有 unused wrapper/source hygiene files 后，fresh fallow unused files 为 6。 | `hygiene:fallow` 仍是 advisory cleanup gate；剩余 public/dynamic/action/owner surfaces、dead exports / clone groups 需要逐项 active caller 与 owner route 审核，不能按 aggregate count 批量 physical delete。 |
| No-resurrection governance | `partial` | 91% | scan/diff gate、tombstone/archive policy、compact scan summary。 | 继续用 fresh diff gate 防新增 hard finding。 |
| Source/test size watch-only | `done` | 100% | 当前结构预算只能从 `node ./scripts/line-budget.mjs --format json` 和 touched source/test diff fresh-read；本文不冻结 oversize/failure count。 | 后续 touched source 文件继续按语义拆；不能把结构预算通过写成 readiness、release/currentness 或 owner acceptance。 |

## Forbidden Claims

- 本文不能被引用为 OPL ready、domain ready、App release-ready、production ready、Brand L5、owner acceptance 或 physical delete authorization。
- `Temporal SDK 已安装`、Temporal test server proof 或 SQLite projection 不等于 Temporal-first production durable lifecycle。
- `schema/helper 已收敛` 不等于所有 boundary schema current；必须看 source handler 是否实际使用 shared schema/JSON boundary。
- `CLI registry 计划或部分命令已落` 不等于 command parser 已统一；必须看 command 是否仍绕过 registry。
- `owner_route_readback`、descriptor、digest、lock 或 lifecycle verbs 不等于 package lifecycle owner receipt。
- `domain tail matrix 已写` 不等于 private platform 已退役；必须看 active caller、replacement owner、tombstone/provenance、owner decision 和 no-forbidden-write。
- `App/Aion contract/read-model 存在` 不等于 consumer-only release readiness；必须看 local scheduler/update/runtime path 是否无法写 truth，并由 App release owner 给 receipt 或 typed blocker。
- `OpenMetrics smoke`、diagnostic drilldown 或 semantic conventions 不等于 OTLP/exporter live endpoint。
