# Runtime 文档

Owner: `One Person Lab`
Purpose: `runtime_support`
State: `active_support`
Machine boundary: 人读索引。机器真相继续归 `contracts/`、源码、CLI/API、stage attempt ledger、provider receipt 与 runtime evidence。

Currentness policy: 本文只保存 runtime 支撑层的导航、稳定 owner split、动态证据入口和 negative boundary。不要从本文读取当前 attempt id、task id、worklist counter、provider proof snapshot、Search Attribute 安装状态、App/operator drilldown 数值、domain ready 或 production ready；这些必须从 fresh contracts、source、tests、CLI/read-model、runtime ledger、provider receipt 和 domain owner surface 读取。

Wrapper-aware CLI/read-model policy: runtime wrappers 只做被动 observation。缺 selected stage packet / route identity / attempt identity 时记录 advisory 并禁用旧 attempt 复用；不得阻止新 stage，也不得用 read model 选择语义 route。identity conflict 才阻止错误目标 mutation。

本目录承接 OPL framework runtime、provider/executor、control plane、projection/read model、resume/wakeup 和 operator repair 语义的人读支撑。

当前入口先看：

- [架构](../architecture.md)
- [当前状态](../status.md)
- [OPL runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.md)
- ProgressCloseoutProjection：raw artifact 持久化、自动 envelope/hash/lineage 与非阻断质量债务。
- [Stage graph 与 AI 路由边界](./stage-graph-route-transition-runtime.md)
- [OPL Agent Lab 控制面边界](./opl-agent-lab-control-plane.md)
- [Codex-maxxing Operating Loop Adoption](./codex-maxxing-operating-loop-adoption.md)
- [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)
- [Runtime Substrate 参考索引](../references/runtime-substrate/README.md)

## 运行入口读法

Runtime / product / policy 的维护入口按同一条资源链读取：

```text
Foundry Agent product pack
  -> OPL resource model
  -> Stage Attempt Runtime
  -> Codex-selected next declared StageRun
  -> current_owner_delta
  -> App Console / operator action
  -> Agent Lab improvement control plane
```

这条链不是新的 active plan。当前 active gap、下一轮 baton 和完成口径仍回 [OPL Family 当前状态与理想目标差距](../active/current-state-vs-ideal-gap.md)；本目录只解释 runtime 支撑语义和各入口如何消费同一个 owner/truth split。

| 入口问题 | 稳定 owner | 默认阅读面 |
| --- | --- | --- |
| OPL resource model 从哪里读？ | OPL Framework | `docs/project.md`、`docs/status.md`、`docs/invariants.md`；资源从 `agents / workspaces / projects / stages / runs / artifacts / receipts / ledger telemetry / console actions` 组织，不把任一投影写成 domain truth。 |
| Stage currentness 谁裁决？ | OPL runtime | [Stage graph 与 AI 路由边界](./stage-graph-route-transition-runtime.md)；OPL 只校验 StageRun identity/currentness 并投影 artifact refs，Codex CLI 根据可读产物和质量债选择任意 declared stage。 |
| Domain repo 应暴露什么？ | Foundry Agent owner | [Domain 私有功能面准入政策](../policies/domain-private-functional-surface-policy.md)；标准形态是 declarative Domain Pack + OPL generated/hosted surfaces + authority ABI。 |
| 新 surface 如何进入默认入口？ | OPL policy/compiler owner | [Policies 文档](../policies/README.md) 与 `contracts/opl-framework/surface-budget-policy.json`；默认 surface 必须通过 surface budget 分类，不能从支持文档或 debug view 直接进入 ordinary path。 |
| reconciler 如何拆小？ | OPL runtime owner | Route、artifact、owner-delta、telemetry 和 App Console reconciler 都只能做 desired/current 对齐和 refs-only 投影；它们不能生成 domain verdict、owner receipt 或 stage terminal state。 |
| Atlas / Ledger telemetry 如何读？ | OPL Atlas / Ledger | telemetry 只记录 route graph、evidence、receipt、trace、replay、blocker、long-soak 和 cleanup refs；只有 fold 成 owner answer、typed blocker、hard gate 或 `current_owner_delta` 后才影响默认路径。 |
| App Console 如何收薄？ | One Person Lab App / OPL Console | [Product 文档](../product/README.md)；App 默认消费 `opl app state` 与 `current_owner_delta`，full drilldown 只按 operator 显式展开。 |
| 改进闭环在哪里？ | OPL Agent Lab | [OPL Agent Lab 控制面边界](./opl-agent-lab-control-plane.md)；Agent Lab 只产出 improvement refs、work order、risk gate 和 follow-up，不持有 domain truth 或 App release verdict。 |

## 动态证据入口

| runtime 面 | 稳定读法 | 当前机器入口 |
| --- | --- | --- |
| Conflict / blocker envelope | Stage attempt、closeout 和 App/operator projection 共享同一 fail-closed blocker/conflict vocabulary；OPL 只投影 envelope、refs、owner-aware route 和 drilldown target。 | `contracts/family-orchestration/family-conflict-envelope.schema.json`、`contracts/family-orchestration/README.md`、相关 `family-conflict-envelope` source/tests。 |
| Runtime manager / route handoff | OPL 接收 domain-declared route refs，持有 stage-attempt projection、stage attempt ledger、liveness projection、provider wakeup、retry/dead-letter；domain repo 继续持有 truth、owner receipt、typed blocker、quality/artifact authority。 | `contracts/opl-framework/runtime-manager-contract.json`、`src/family-runtime*.ts`、`opl family-runtime status|attempt query|attempt inspect`。 |
| Progress closeout projection | `ProgressCloseoutProjection` 持久化 Codex raw output，并自动派生 refs、hash、lineage 与最小 progress envelope。typed JSON 是优选但不是 gate；格式、schema、receipt 缺口只进入质量债务。只有零可读 artifact 的 provider/基础设施失败才阻断。 | `contracts/family-orchestration/README.md`、`contracts/family-orchestration/README.zh-CN.md`、stage attempt closeout source/read-model。 |
| Runtime environment substrate | OPL 当前环境策略分三档：`Fast Local Env` 是默认路径，服务 R / Python / MAS 画图等本机依赖；`Local Docker / Devcontainer` 和 `Remote Sandbox` 是显式后置 provider。普通用户入口是 `opl env doctor|prepare|run`；底层 `opl runtime env ...` 保留为 advanced/operator surface。Runtime Environment Substrate 持有 env profile、compiler、doctor、dependency descriptor / lock / bundle manifest / managed runtime root / run-context / cache inventory；domain repo 只声明 dependency intent。R 通过 `renv.lock` refs 与 `R_LIBS_USER` managed library handoff，并按 profile source 使用 CRAN、GitHub 或 Bioconductor (`BiocManager`)；Python 通过 `uv.lock` / project refs 与 `UV_PROJECT_ENVIRONMENT` managed env handoff。Doctor 只检查 host binary、语言包和 system hints；doctor pass、materialization receipt、run-context 或 cache hit 都不能声明 provider ready、runtime ready、domain ready、App release ready 或 production ready。 | `contracts/opl-framework/runtime-environment-substrate-contract.json`、`src/modules/runway/runtime-environment-substrate.ts`、`tests/src/runtime-environment-substrate.test.ts`、`tests/src/cli/cases/runtime-environment-substrate-command-surface.test.ts`、ordinary `opl env doctor|prepare|run`、advanced `opl runtime env inspect|lock|build|prepare|materialize|verify|cache|doctor|run-context|contract --json`。 |
| Runway agent sandbox provider | Runway sandbox provider 是后置隔离执行层，不是当前 R/Python dependency prepare 的默认前置条件。需要更强隔离或复现时显式选择 Local Docker / Devcontainer；Codex stage runner 无显式 sandbox provider 时走 host executor，不默认启动 local devcontainer。需要远程执行时显式选择当前已实现的 E2B，并保留 credential-ref / provider-receipt-ref / no-secret-log guard；Daytona / Modal 只保留为参考候选，不声明 runner 已实现。E2B 属于外部 provider / OPL Connect 配置辅助，不是默认依赖。OPL 持有 provider selection、local image/template refs、optional remote credential preflight、run-context binding、sandbox receipt projection 和 false-ready guard；不把 sandbox run 写成 domain truth、owner receipt、App release ready 或 production ready。 | 当前机器真相是 `contracts/opl-framework/runtime-environment-substrate-contract.json` 的 `default_provider_kind=fast_local_env`、`implemented_external_substrates=[e2b]`、`opl runtime env ... --json` 的 `default_current_path` / `standard_tool_handoff`、Codex stage runner 的可选 `sandbox_execution` receipt、以及 external sandbox adapter 的 credential-ref / provider-receipt-ref preflight。Fast Local Env doctor/run-context、live Docker/devcontainer run、remote credential run、provider long-soak 和 App release cohort 是不同证据层。 |
| Stage attempt / progress projection | `stage_progress_log` 是 OPL attempt/progress projection，不是平行 log database；它从 attempt ledger、provider run、activity events、usage projection、typed closeout packet 和 refs 派生。 | `contracts/opl-framework/family-runtime-attempt-contract.json`、`contracts/opl-framework/README.md`、`src/family-runtime-stage-progress-log.ts`、`tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`、`opl family-runtime attempt query|inspect`。 |
| Temporal scheduler / worker readiness | Scheduler cadence 是 provider-gated reconcile opportunity，不是 domain daemon；worker readiness status 只通过 lifecycle/read-model builder 输出，内部 status resolver 不是外部接口。`worker_source_stale`、scheduler missing 或 provider blocker 必须读作 OPL runtime repair owner。 | `src/family-runtime-scheduler.ts`、`src/family-runtime-temporal-provider-parts/scheduler-cadence.ts`、`src/family-runtime-temporal-readiness.ts`、`tests/src/family-runtime-temporal-provider-cases/scheduler-and-readiness.ts`、`opl family-runtime scheduler status --provider temporal --json`、`opl family-runtime worker status --provider temporal --json`、`opl runway readiness --json`。 |
| Temporal visibility / repair | Temporal Search Attributes 和 Web UI refs 是 provider lifecycle / operator debug surface；payload 只能是 refs 与可索引摘要，不能携带 transcript、artifact body、memory body、domain body 或 owner verdict。 | `src/family-runtime-providers.ts`、`src/family-runtime-temporal-provider-parts/attempt-query.ts`、`tests/src/cli/cases/family-runtime.test.ts`、`opl family-runtime provider repair --provider temporal`。 |
| AI-selected stage route | Codex CLI 读取上一 stage 的 artifact、阴性结果、review finding 与非权威 route context，自主选择任意 declared stage；可跳过、重复、逆向或 route-back。OPL 不运行 transition oracle、fixed-point semantic reconciler 或 exactly-one route gate。 | `contracts/opl-framework/family-runtime-attempt-contract.json`、`src/modules/runway/standard-agent-action-runtime.ts`、`src/modules/stagecraft/stage-run-kernel.ts`、`tests/src/standard-agent-action-runtime.test.ts`。 |
| Stage graph / App drilldown | Stage graph、runtime visualization、App/operator drilldown 和 evidence worklist 只是 refs-only operator lens；可见、通过、blocked 或 closed counter 不能升级为 domain ready、artifact authority、quality/export verdict 或 production ready，也不能否决 Codex 的 stage route。 | `src/runtime-tray-snapshot.ts`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。 |
| State Index / SQLite sidecar | SQLite sidecar 是可重建索引，不是 truth。`doctor` 只读健康度；`rebuild` 从 Stage Folder manifest、receipt refs、content hash、lineage 和 retention proof 回填 artifact/read-model rows。SQLite row 不能让 stage complete。 | `contracts/opl-framework/state-index-kernel-contract.json`、`src/family-runtime-state-index.ts`、`tests/src/family-runtime-state-index.test.ts`、`opl index doctor|rebuild|checkpoint|integrity-check|backup --json`。 |

## Runtime Environment / Sandbox 组织方式

当前环境能力按三档组织，避免把普通 R/Python 依赖准备、local sandbox 和 remote sandbox 混成一套心智：

```text
Fast Local Env
  -> Local Sandbox / Docker
  -> Remote Sandbox / E2B-style provider
```

| 档位 | 默认状态 | 使用场景 | 主 owner | 协同模块 |
| --- | --- | --- | --- | --- |
| `Fast Local Env` | 默认路径 | R / Python / MAS display 等本机高频依赖；要求低 overhead、可诊断、可接力。 | `OPL Runway` 的 Runtime Environment Substrate | `OPL Pack` 声明 dependency intent；`OPL Workspace` 提供 paper/project root；`OPL Ledger` 保存 run-context / receipt refs；`OPL Console` 展示 doctor / repair。 |
| `Local Sandbox / Docker` | 显式后置 provider | 需要更强隔离、跨机器复现、CI/release evidence 或 host 环境污染排查。 | `OPL Runway` 的 stage sandbox provider selection / executor run / receipt projection | `OPL Workspace` 负责 workspace transport / mount 语义；`OPL Ledger` 保存 `sandbox_execution` refs；`OPL Console` 展示 preflight blocker；`OPL Connect` 不拥有本地执行。 |
| `Remote Sandbox / E2B-style` | 显式后置 provider | 需要远程隔离、云端长会话、扩容或 provider-managed sandbox。 | `OPL Runway` 的 external sandbox execution adapter | `OPL Connect` 只做 provider discovery / configuration / credential-ref assist；`OPL Ledger` 保存 provider receipt refs；`OPL Console` 展示 credential / provider receipt blocker。 |

组织原则：

- `Fast Local Env` 不要求 Docker，也不因为 doctor pass、run-context 存在或 cache hit 声明 provider/runtime/domain/App ready。
- Local Docker / Devcontainer 不再是 Codex stage runner 默认路径；只有显式选择 sandbox provider 才进入 local sandbox。
- E2B 是当前实现的 remote provider option；缺 endpoint、credential ref、provider receipt 或 workspace transport 时 fail closed，不回落到 host。Daytona / Modal 只作 reference candidate。
- `OPL Connect` 可以帮助配置 provider 和分发 connector，但不拥有 stage execution sandbox，也不替 Runway 签 provider ready。
- `OPL Pack` 只声明 domain dependency intent；不把 R/Python/Docker/E2B 安装细节下沉到 domain agent。
- `OPL Ledger` 只保存 refs-only evidence；不保存 artifact body、domain truth、quality verdict 或 App release verdict。

## Runtime 总览职责补充

围绕 App Runtime 页，Framework 的职责固定为三层：

1. **Aggregation**
   - 从 admitted workspace bindings 和 domain workspace 的产品结构聚合候选任务线；MAS 论文全集来自已登记课题 workspace 的 `studies/`，不是来自 Temporal attempt 是否存在。
   - Temporal / provider read model 只叠加正在运行、heartbeat、duration、stage attempt refs 与 token/cost telemetry 等执行证据；历史论文没有 provider telemetry 时仍应显示为可见 work item。
   - 只有结构化 domain progress 或当前可执行 owner route 表明需要处理时，默认页才显示“需要系统处理”。仅由 `studies/` / `STUDY_STATUS.md` / `submission/STATUS.json` 兜底发现的历史项目，即使存在旧 failed/blocked attempt，也只能把该 attempt 保留为诊断证据，不能抢占用户主状态。
   - 不把 active workspace 当成唯一范围。

2. **Projection**
   - 输出 scope options、current scope、scope source 和 inferred scope hint；默认 scope 只面向用户认知层：全部项目、智能体、项目。单篇论文 / task、workspace binding id、autopush 或 stage-attempt 名称只进任务详情或诊断。
   - 输出用户主状态、自动运行副状态、阶段、时长、token、liveness、next owner 与 blocker route；未观测到 token/cost telemetry 时必须保持 missing / null，不得把未记录写成 0。
   - `project_catalog.display_name` 严格取 canonical `workspace_path` 的 basename；workspace binding label 只可作为诊断元数据，不能覆盖用户看到的项目名。
   - `work-item-projection.v2` action 同时输出兼容文案 `title/summary` 与稳定语义 `title_key/summary_key/message_args/owner_kind`。Framework lifecycle action 必须使用 `lifecycle.*` 语义键，中文文案不得成为唯一机器真相。
   - 手工归档是独立 `visibility=visible|archived` 轴，不改写 domain business lifecycle，也不停止 runtime、清空 Stage Map/action/telemetry。`items` 保留 archived 任务供归档库读取；`work_item_count` 与运行/attention/telemetry 摘要默认只统计 visible，另投影 visible/archived/total 计数。
   - 每个 item 的 visibility 都携带 durable control ledger 全局 `generation`；即使没有该 item 的 control entry，也投影当前 generation 供 App 提交 `expected_generation`。归档与恢复统一走 `work_item_visibility_set`，lifecycle 变更继续走 `work_item_lifecycle_set`，两轴共享 generation conflict 且互不覆盖。
   - `work-item-projection.v2` 的 `delivered_paused` Stage Map 在 canonical `last_recorded_stage_id` 可解析时，只展示 domain stage index 中截至该锚点的已发生历程；锚点缺失或无法解析时保留完整 stage list 与诊断，不从 status 或排列顺序猜测截断边界。
   - 保留 provider/control-plane 术语到 diagnostic refs。

3. **Boundary**
   - 不在 Framework projection 里发明第二套 domain truth。
   - 不把 stale blocked attempt、queue residue 或 provider counter 直接当用户项目结论。
   - 不把 shell 分组需求写回 runtime truth。

因此，`runtime_activity_items`、`task_drilldowns`、`task_run_projection_v2`、`work_item_projection_v1`
和相关 scope/status projection 是 Framework owner surface；`work_item_projection_v1`
只把同一 `task_run_projection_v2` refs-only 数据整理成用户认知顺序：scope、work item、agent、stage、
attempt、action、evidence 与 conditions envelope，并通过 `family_stage_control_plane` / `family_action_catalog`
refs 标明 stage label、attempt refs 与 next-action template 来源。它不写 domain truth，不生成 owner receipt、
typed blocker、quality verdict 或 App release/currentness 结论；“显示成什么词、分成哪几组、哪些
细节默认折叠”仍是 App 与 shell owner surface。

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-runtime-naming-and-boundary-contract.md` | `active_support` | OPL runtime owner | 解释 Codex-default executor、provider-backed stage runtime、Temporal substrate、explicit executor adapter、已退役 Hermes/Gateway/frontdoor/local-manager 语义边界；机器真相仍归 contracts/source/CLI/API/runtime ledger/provider receipt。 |
| `codex-maxxing-operating-loop-adoption.md` | `active_support` | OPL runtime / product operator owner | 解释 Codex-maxxing operating-loop 参考如何收敛为 OPL-native workstream/thread、goal oracle、heartbeat/steering、artifact-first review、memory refs、receipt 和 read-model 边界；机器锚点是 `contracts/opl-framework/operating-loop-adoption-policy.json`。 |
| `stage-graph-route-transition-runtime.md` | `active_support` | OPL runtime owner | 解释 stage graph 只是 declared route context、Codex CLI 是唯一语义 route owner、StageRun 只持有 transport/currentness/artifact refs，以及 progress-first 与合法硬停边界。 |
| `opl-agent-lab-control-plane.md` | `active_runtime_support` | OPL Agent Lab control-plane owner | 解释 Agent Lab 作为 OPL Framework 内部统一 eval / improvement control plane 的职责、输入输出、stage completion policy conformance 和 authority boundary；它只聚合 refs/evidence/follow-up，不持有 domain truth、stage 内容完成判断、quality verdict 或 artifact authority。 |
