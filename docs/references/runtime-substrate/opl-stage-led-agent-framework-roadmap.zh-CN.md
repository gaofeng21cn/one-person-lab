# OPL Stage-Led Agent Framework Roadmap

Owner: `One Person Lab`
Purpose: `development_reference`
State: `active_support`
Machine boundary: this is a human-readable development roadmap. Machine-readable truth must live in `contracts/`, source code, CLI/API behavior, runtime ledgers, or domain-owned manifests.
Date: `2026-05-11`

## 结论

`OPL` 的目标定位应统一为 Codex-first、stage-led family agent framework。

它对标的是 DeerFlow、Dify、LangGraph、AutoGen、CrewAI、Temporal 这类 agent / workflow framework 的工程层能力，但核心差异是：OPL 不把单个 LLM 调用或轻量 agent node 当成主要原子步骤，而是把 `Codex CLI` 作为默认强执行器，把 domain `stage` 作为可观察、可恢复、可审计的语义工作单元。

`MAS`、`MAG`、`RCA` 是运行在这个 family framework 上的独立 domain agents。它们可以被 OPL 托管、唤醒、排队、投影和恢复，也可以继续通过 Codex App 的单一 app skill 直接调用。OPL 不成为这些 domain 的领域大脑、truth owner、quality gate 或 artifact authority。

理想目标是：OPL 提供统一 `domain-agent skeleton`，把所有智能体运行外围能力上收到 framework；MAS、MAG、RCA 按同一套 repo-source 目录、contract 和 lifecycle 接入，只提供领域 stage 定义、提示词、工具/Skill、知识面、质控 gate、artifact locator contract 与 domain truth authority。不同 domain 的业务内部不要求完全同构，但对 OPL 暴露的 skeleton、descriptor、sidecar、receipt schema、projection builder 和生命周期语义应同构。真实论文、基金、PPT、运行日志、receipt 实例和中间产物属于 workspace / runtime artifact root，不属于 domain repo 源码目录。

## 总入口

本文是接下来 OPL family agent framework 的总开发入口。任何涉及以下主题的实现、文档更新或退役清理，都应先从本文判断 owner、边界、优先级和验收门槛：

- OPL 作为 Codex-first、stage-led 智能体框架的顶层设计。
- Temporal / Hermes / local provider 的 runtime substrate 取舍。
- `TypeScript`、`Python`、`Go`、`Rust` 在 framework 与 domain agent 中的分工。
- MAS / MAG / RCA 的 stage/action/projection descriptor 接入、direct skill 等价和 OPL-hosted path。
- MAS 已验证的 SQLite 持久化、file lifecycle、restore proof、artifact index、retention 和 lifecycle 管理经验如何上收到 OPL framework。
- MAS / MAG / RCA 是否按统一 domain-agent skeleton 重组 repo-source 目录、contract 和 entry surface。
- MDS / DeepScientist、Hermes-first、Gateway / compatibility vocabulary、旧 local runtime、旧 workspace-local scheduler 等过时面的退役纪律。

配套入口：

- Temporal provider 细化计划：`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md`
- MAS runtime 退役计划：`med-autoscience/docs/program/opl_temporal_mas_runtime_retirement_program.md`
- Stage control plane adoption：`docs/references/convergence-governance/family-stage-control-plane-adoption-plan.zh-CN.md`
- Domain memory 总入口：`docs/references/operating-governance/family-domain-memory-governance.zh-CN.md`
- 跨仓当前状态：OPL / MAS / MAG / RCA / MDS 各自的 `docs/status.md`、`docs/project.md`、`docs/invariants.md`

开发纪律：

- 新增 framework-level runtime 能力默认先进入 OPL TypeScript control plane、shared contract、provider abstraction 或 App/CLI projection。
- 新增 domain expertise、quality gate、truth reducer、artifact/package authority 默认留在对应 domain repo。
- MAS 中已经证明可复用的 runtime 外围能力，应先拆成 `framework_generic` 与 `mas_domain_specific`；前者迁入 OPL framework，后者留在 MAS。
- 已被退役或降级的旧面不得通过 compatibility alias、帮助文案、测试 fixture 或 product wording 重新变成默认路径。
- 如果需要改变本文的 owner split 或语言/runtime 选择，必须同步更新上述配套入口，不能只改单个 repo 的局部文档。

## 2026-05-11 当前落地评估

结论：前一轮 stage-led / provider-backed 计划已经落到一批可调用 surface，并且 MAS/MAG/RCA 的 standard domain-agent skeleton adapter 已能被 OPL 真实发现和校验；Temporal TypeScript SDK、`StageAttemptWorkflow`、activity、signal/query、CLI start/query/signal、worker lifecycle contract、typed closeout ingestion、Codex stage runner repo/test harness、stage attempt workbench 和 Aion 白名单 signal bridge 均已落地。本轮新增了 typed closeout ledger 的严格幂等 / fail-closed 规则：同一 `closeout_id` 的同一 packet 重放是 no-op，冲突 packet 不会污染 closeout refs 或 activity ledger；Aion workbench 也已把 provider completion、domain ready verdict、human gate、dead letter、rejected writeback 拆成独立 operator 状态轴，并加严 human gate signal payload 必须绑定当前 `stage_attempt_id`。当前仍没有完成端到端生产闭环：真实 Temporal server/worker residency proof、真实 provider-hosted domain 长时 soak、human gate/resume 进入 domain revision/repair owner chain 的运行证明、domain memory writeback apply 证据和旧面物理退役仍未完成。

2026-05-11 fresh CLI 读模型校准：

- `node dist/cli.js agents list --json`：`total_projects_count=3`、`aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`blocked_count=0`。MAS/MAG/RCA 均带 artifact locator surface，OPL 可验证它们的 repo-source skeleton 不包含真实运行产物。
- `node dist/cli.js stages list --json`：`resolved_planes_count=3`、`stages_count=18`。MAS/MAG/RCA 各 6 个 stage plane 已能被 OPL 只读发现。
- `node dist/cli.js domain-memory list --json`：`resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0`。MAS 的 `mas_publication_route_memory`、MAG 的 `mag_grant_strategy_memory`、RCA 的 `rca_visual_pattern_memory` 均已按标准 `family_domain_memory_ref.v1` 被解析；OPL 只读取 locator / freshness / migration plan / seed corpus / receipt locator，不读取 memory 正文。

分层完成度：

| layer | 当前状态 | 说明 |
| --- | --- | --- |
| 定位 / owner split | `landed` | OPL 作为 Codex-first、stage-led family agent framework；MAS/MAG/RCA 作为独立 domain agents；OPL 不持有 domain truth、quality verdict 或 artifact authority。 |
| Shared contracts / schemas | `landed` | action catalog、stage control plane、runtime supervision、persistence / lifecycle / owner-route、standard skeleton 等 contract 已在 OPL shared layer 冻结。 |
| Domain memory locator / receipt / migration plan | `family_index_resolved_all_active_domains_descriptor_only` | `family-domain-memory-ref`、`family-domain-memory-writeback`、stage `knowledge_refs` 与 `opl domain-memory list|inspect|migration-plan` 已冻结 locator、receipt、seed corpus 和 migration plan 级只读投影；MAS/MAG/RCA 当前均已按标准 descriptor 被 OPL 解析；stage attempt query/workbench 已能显示 consumed memory refs、writeback receipt refs 与 rejected writes；真实 retrieval、writeback apply、memory body migration 和跨 domain soak 仍需 domain router/apply receipt 验证。 |
| Local queue / attempt ledger | `usable_dev_baseline` | `opl family-runtime` 已有 typed queue、pending task hydration、guarded dispatch、retry/dead-letter、local inbox 和 stage attempt ledger。 |
| Domain descriptor / adapter | `landed_for_active_domains` | MAS/MAG/RCA 已在各自 main 暴露 stage/action/projection/skeleton adapter，OPL 当前真实 `opl agents list` 可校验三者 aligned。 |
| Lifecycle primitives | `contract_and_locator_landed` | OPL 已有 locator-only lifecycle primitive；MAS 经验已被拆成 framework-generic / MAS-specific 方向，真实跨 domain cleanup/restore apply 仍需 soak。 |
| Provider-backed execution | `production_provider_minimal_loop_landed` | Temporal SDK、workflow/activity/signal/query、worker lifecycle contract、CLI start/query/signal、provider receipt 和 fail-closed readiness 已落地；真实 Temporal server/worker residency proof、production retry 运行证据和 domain soak 仍未完成。 |
| Codex stage activity runner | `live_runner_repo_test_harness_landed_production_soak_pending` | Activity 现能接 stage packet / checkpoint refs，支持 `dry_run`、`live_dry_run` 与 `codex_cli` runner mode；`codex_cli` path 已有进程启动、stdout event summary、timeout、process output summary、checkpoint heartbeat 和 typed closeout completion gate 的 repo/test harness。没有 typed closeout 的 domain dispatch 只能进入 checkpointed，不会被标成 completed；typed closeout ledger 已对 `closeout_id` 重放做幂等处理，并对冲突 packet fail-closed。仍待完成的是生产级长时 domain activity soak、真实 token/cost/progress 观测校准和 MAS/MAG/RCA provider-hosted receipt evidence。 |
| Human gate / resume | `ledger_and_aion_signal_transport_landed` | human gate refs、human gate ledger、user instruction ledger、resume ledger 已进入 attempt ledger/query/workbench；Aion workbench 可通过白名单 bridge 发送 provider-level human gate / resume / dead-letter repair signal，且 human gate payload 必须精确绑定当前 attempt id；真实 worker/domain 执行证明仍未完成。 |
| Operator visibility | `stage_attempt_ops_workbench_landed_descriptor_level` | `opl runtime snapshot --json` 已投影 `stage_attempt_workbench`，展示 provider run/activity/heartbeat、closeout、consumed memory、rejected writes、dead-letter task ledger 与 human gate signals；Aion runtime workbench 已接入 signal 操作，并拆出 provider completion、domain ready verdict、human gate、dead letter、rejected writeback 五个 operator 状态轴；后续仍需按 domain/stage/blocker/memory refs 过滤和真实 domain soak。 |
| Real domain soak / retirement | `domain_side_proofs_partial_provider_soak_not_complete` | MAS real paper line guarded apply 仍未闭合；MAG/RCA 已有 domain-side controlled attempt / memory writeback proof surface，但 OPL/Temporal-hosted controlled soak 仍未形成完整 provider evidence；旧 Hermes/Gateway/local-manager residue 物理退役仍是下一阶段。 |

已落地的 OPL 层 shared module / contract 面包括：

- `python/opl-harness-shared`：覆盖 family action catalog、family orchestration、product-entry companions、runtime task companions、skill catalog、managed runtime、workspace boundary、editable bootstrap 与 shared release。
- `contracts/family-orchestration/`：覆盖 family action catalog / graph、event envelope、checkpoint lineage、human gate、persistence policy、lifecycle ledger、owner route、product-entry manifest v2、runtime supervision 与 stage control plane。
- `contracts/opl-framework/`：覆盖 gateway、runtime manager、domain onboarding、public surface 与 routing vocabulary 合同。
- OPL TypeScript root shared/control-plane surface：覆盖 family runtime、stage control、action catalog、handoff、product-entry、domain catalog、runtime manager、native helper、skill sync 与 runtime tray。

这些统计应按目录和能力面维护，不应把某一次 `find` / `rg` 的文件数量写成长期事实；文件数会随测试、fixture、venv 或实现拆分口径漂移。

跨 repo 消费状态：

- `MAS` 和 `MAG` 已通过 `opl-harness-shared @ 2b08c7efd8acd80355e870087d4ce5be7b45d4d1` 消费 OPL Python shared package。
- `RCA` 已通过 `opl-framework-shared @ 2b08c7efd8acd80355e870087d4ce5be7b45d4d1` 消费 OPL JS shared package。
- MAS/MAG/RCA 的 skeleton adapter 已进入各自 main，并通过 OPL 真实 manifest smoke 对齐：`aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`blocked_count=0`。OPL 消费的 source fields 分别是 MAS `opl_domain_agent_skeleton_mapping`、MAG `domain_agent_skeleton_mapping`、RCA `standard_domain_agent_skeleton`，且三者均带 artifact locator surface。
- `MDS` 仍 pin 在较早的 `opl-harness-shared @ 8523f4ab76af486d44a1ccd3a88996ca860d2cc2`；这与它的 archive / diagnostic / upstream-intake 角色一致，不应被读成 active OPL domain adapter 已跟进。

已落地的 framework 能力：

- family action catalog、family stage control plane schema、family runtime supervision、persistence / lifecycle / owner-route schema 已在 OPL shared layer 冻结。
- `opl actions list|inspect|export` 与 `opl stages list|inspect` 是只读 discovery / parity surface。
- `opl agents list|inspect` 已能读取标准字段和三仓 adapter alias，并强制 artifact locator surface；缺少 locator 的 skeleton 仍保持 `drift_detected`，不会被 OPL 误判为可托管。
- `opl domain-memory list|inspect|migration-plan` 已能读取标准 domain-owned memory descriptor；当前 live binding 中 MAS/MAG/RCA 均 resolved。该入口展示 migration plan ref、seed corpus ref、writeback receipt locator 和 readiness；OPL 只做发现/投影，不执行迁移、不接受写回、不读取 memory 正文。
- `opl family-runtime` 已有 typed queue、MAS/MAG/RCA pending task intake、guarded dispatch、retry/dead-letter / local inbox 信号和 stage attempt local ledger。
- `opl family-runtime attempt create|list|inspect|start|query|signal` 已能登记 provider-backed stage attempt，启动/查询/发送 Temporal workflow 信号，并在缺少 Temporal 地址时明确 fail-closed。
- `opl runtime snapshot --json` 已输出 `stage_attempt_workbench`，Aion runtime workbench 已展示 provider completion 与 domain ready verdict 的边界，并把 human gate、dead letter、rejected writeback 作为独立 operator closure axes。
- MAS/MAG/RCA 已各自声明 stage/action/projection descriptor，OPL 只消费 descriptor，不写 domain truth。

尚未完成的生产闭环：

- Temporal provider code 已落地，但还没有以真实 Temporal server/worker deployment 作为默认 Full online runtime，也没有完成 worker restart/re-query 的真实环境证明。
- Codex CLI stage activity runner 已从 dry-run receipt / fixture-run 推进到 `codex_cli` live process supervision 的 repo/test harness：能 spawn Codex CLI、记录 runner events、timeout、process output summary、checkpoint heartbeat，并要求 typed closeout 才能完成 attempt。尚未完成的是生产级长时 domain activity soak、真实 token/cost/progress 观测校准，以及真实 domain sidecar / Codex activity 产出 owner receipt 的连续 evidence。
- OPL App 已有 stage attempt workbench，并能展示 provider completion 与 domain ready verdict 边界；human gate、resume、dead-letter repair 的 provider-level signal 操作已接入白名单 bridge，其中 human gate signal payload 已限制为当前 attempt id。按 domain/stage/blocker/memory refs 过滤、真实 worker/domain 执行证明仍是后续 visibility/operation lane。
- MAS 的真实 paper line 还没有完全证明 `stage entry packet -> Codex execution -> closeout packet -> router receipt -> progress delta / human gate / stop-loss` 的连续 guarded apply soak；MAG/RCA 已有 domain-side controlled proof surface，但仍需 OPL/Temporal-hosted controlled attempt 证据。
- Hermes/local provider 仍作为迁移期实现信号和 legacy/optional provider 存在，active docs 和部分 domain code 中仍有旧 Hermes / Gateway / compatibility wording，需要按 retirement plan 清理。

因此，对外和开发文档应避免写成“计划已经全部落地”。准确口径是：OPL family framework 的控制面骨架、local queue/attempt ledger、Temporal provider code、domain adapter discovery、standard skeleton validation、domain memory 3/0 标准索引、Codex stage runner repo/test harness、typed closeout gate、runtime snapshot 和 Aion stage attempt signal workbench 已落地；生产级真实 provider deployment、真实长时 domain stage execution / soak、真实 domain memory apply 和旧接口物理退役仍是下一阶段工作。

## 离理想生产级框架还有多远

如果把理想状态定义为“OPL 可以生产级托管 MAS/MAG/RCA 的长时间 stage attempt，同时 direct skill path 等价、domain truth 不迁出、旧默认面退役干净”，当前大约处在 `60-70% framework landed / 30-40% production closure remaining`。这个比例不是测试分数，只是工程层完成度判断：

| 目标项 | 当前距离 |
| --- | --- |
| OPL 作为完整智能体框架 | 控制面、合同、队列、attempt ledger、Temporal provider code、Codex runner repo/test harness、typed closeout gate、snapshot/workbench 已落地；还差真实 provider residency、长时 domain activity soak、human gate/resume 进入 domain owner chain 的运行证明和生产 cutover。 |
| MAS/MAG/RCA 迁移到统一 skeleton | 已完成 manifest/adapter 同构和 OPL 发现校验；还差物理目录重组、path compatibility audit、direct skill / OPL-hosted parity 的持续回归，以及真实产物根 locator 的 restore/provenance proof。 |
| Domain memory | MAS/MAG/RCA 标准 memory descriptor 均 resolved；还差真实 workspace/runtime memory body migration、accepted/rejected writeback receipt、stage entry 小集合 retrieval 和按 domain/stage 分组的 operator view。 |
| Lifecycle primitives | OPL shared schema/locator 已有，MAS 经验已经分类为 framework_generic / mas_domain_specific；还差跨 domain cleanup/restore/retention 的 guarded apply proof。 |
| Operator product experience | CLI/App 已能读 stage attempt workbench，Aion 已能发送 human gate / resume / dead-letter repair signal；还差真实 worker/domain 执行证明、provider deployment readiness、domain drilldown 与 memory refs 分组操作面。 |
| 旧面退役 | 默认语义已从 Hermes/Gateway/MDS/local-manager 转向 Codex-first/provider-backed/stage-led；public help / command spec 已不再把 Hermes executor、Gateway cron 或 compatibility alias 放在普通默认示例里。还差无 active caller 后的物理删除和 history/tombstone 归档。 |

下一步不应再新增平行总计划。直接按以下闭环推进：

1. `OPL production residency`：真实 Temporal server/worker 启动、readiness、restart/re-query、retry/dead-letter、worker lifecycle proof。
2. `Codex activity runner production soak`：用真实 MAS/MAG/RCA stage attempt 校准 Codex CLI long-running activity、heartbeat、checkpoint、progress/cost sampling、typed closeout ingestion 和 domain owner receipt。
3. `Domain memory apply proof`：保持 memory body 和 accept/reject 在 domain，完成 MAS/MAG/RCA 的真实或 controlled consumed-memory / writeback-receipt 证据。
4. `Soak`：MAS real paper line read-only -> guarded apply；MAG/RCA OPL-hosted controlled stage attempt。
5. `Directory standardization`：在 direct skill path、OPL-hosted path、restore/provenance proof 和 focused tests 都通过后，逐仓做 repo-source 物理目录重组。
6. `Retirement cleanup`：当前已先清理可安全落地的 active-path wording / public-help residue；物理删除旧 vocabulary、legacy manager 和非标准 skeleton 入口仍需等上述 parity/soak 和 no-active-caller 证据通过。

## 执行语言与依赖结论

从智能体框架本身出发，OPL framework/control plane 的主语言应统一到 `TypeScript`；domain agent 内部执行语言不强制统一。

统一到 `TypeScript` 的范围：

- OPL provider abstraction、Temporal workflow/activity/signal/query adapter、stage attempt ledger、typed family queue、human gate、approval/retry/dead-letter、App/API/MCP/CLI bridge。
- family action catalog、stage control plane、handoff envelope、runtime manager、operator projection、domain descriptor validator。
- 跨 repo shared JS package、OPL App / runtime tray / CLI 需要直接消费的 schema 和 projection。

不强制统一的范围：

- MAS 医学统计、数据分析、文献、引用、图表、稿件产物和 scientific stack 继续以 `Python` 为 domain owner surface。
- MAG 申请书 authoring / quality / controller 仍可以保留 Python domain package；OPL 只要求它导出 machine-readable descriptor、receipt schema / refs、projection builder / refs 和 artifact locator contract。
- RCA 长线保持 `TypeScript + Python`：TypeScript 承担 route/contract/service boundary，Python 承担 Office/PPT native helper、截图/导出、文档修复等 native helper。
- `Go` 适合高并发服务或独立基础设施 daemon；当前 OPL 不需要把 stage orchestration 主体改成 Go。Temporal server 用 Go 实现不要求 OPL workflow/control plane 也用 Go。
- `Rust` 适合 native helper、系统探测、索引器、打包、安全/性能关键工具；不适合作为快速演化的 agent orchestration 业务层默认语言。

依赖策略：

- 可以引入外部 runtime dependency；Temporal 是当前生产级 durable execution substrate 的优先候选。
- 引入 Temporal 的目标是 durable workflow history、activity retry/timeout、heartbeat、signal/query、long-run recovery 和 human gate，不是把 domain truth 迁进 Temporal。
- 不再把 Hermes-Agent 当作目标 session/wakeup substrate；它只保留为 `hermes_legacy` provider、显式 executor/proof lane、Codex CLI 备线或可选安装模块。
- 不引入新依赖只为“看起来像框架”；依赖必须能替代当前 OPL 自己难以可靠维护的 durable execution 能力，并能通过 fixture workflow、real domain soak 和 direct skill parity 验收。

对比依据：

| 选择 | 适合的位置 | 不作为 OPL 主控制面的原因 |
| --- | --- | --- |
| `TypeScript` | OPL control plane、CLI/API/MCP、App projection、JSON/schema、Temporal workflow adapter | 不负责医学统计和 native Office/PPT 细节。 |
| `Python` | MAS/MAG domain logic、医学/基金/数据/文献/ML、快速工具原型 | 大型 App/API/control-plane 类型治理、前后端共享 contract 和长期 UI/runtime bridge 更容易松散。 |
| `Go` | 高可靠服务端、轻量 daemon、并发 worker、单文件部署 | agent stage 语义、UI/API/schema 与 domain adapter 演化成本高；Temporal server 用 Go 不等于业务 workflow 必须用 Go。 |
| `Rust` | native helper、indexer、system probe、性能/安全关键工具 | 开发成本高，不适合作为频繁演化的 stage orchestration 主语言。 |

## 外部工程经验

成熟系统给出的共同方向很一致：

- LangGraph 把线程、checkpoint、persistence、human-in-the-loop 和 resume 作为长期 agent 的基础能力。
- Temporal 把 durable workflow、activity、retry policy、signal/query 和 workflow history 作为可靠执行的基本单元；它是 OPL family runtime provider 的生产 substrate 候选，而不只是参考对象。
- OpenAI Agents SDK 把 handoff、guardrail 和 tracing 当作多 agent 运行的基础结构能力。
- Cloudflare Agents 强调 durable identity、state、schedule 和 event-driven agent runtime。
- Pydantic AI durable execution 把 long-running、async、human-in-the-loop 和 restart recovery 归入 durable agent 的生产可靠性问题。
- Dify、AutoGen、CrewAI、DeerFlow 等系统说明了 workflow / agent team / research flow 的组织方式。OPL 应吸收这些工程模式；其中 Temporal 与这类 agent 框架不同，可以作为 durable execution substrate 被正式评估和接入。

这些经验不支持让程序硬编码领域思路。更稳的结构是：durable state、typed handoff、checkpoint、retry/dead-letter、human gate、trace、projection 和 owner boundary 由 framework 提供；领域判断由 domain agent stage pack 和 Codex 执行器完成。

参考来源：

- LangGraph persistence: <https://docs.langchain.com/oss/python/langgraph/persistence>
- Temporal durable execution: <https://docs.temporal.io/>
- OpenAI Agents SDK: <https://openai.github.io/openai-agents-python/>
- Cloudflare Agents: <https://developers.cloudflare.com/agents/>
- Pydantic AI durable execution: <https://pydantic.dev/docs/ai/integrations/durable_execution/overview/>
- Dify workflow: <https://docs.dify.ai/>
- AutoGen: <https://microsoft.github.io/autogen/>
- CrewAI: <https://docs.crewai.com/>
- DeerFlow: <https://github.com/bytedance/deer-flow>

## 依赖引入判断

OPL 可以引入新的 runtime 依赖，但依赖必须替代 framework 层真实难题，而不是替代 domain agent 的思考能力。

当前推荐是：

| candidate | decision | reason |
| --- | --- | --- |
| `Temporal` | `adopt_as_provider_target` | 它解决长时间 stage attempt 的 durable workflow、activity retry、heartbeat、signal/query、history replay 和 worker crash recovery；这些能力由 OPL 自己维护成本高，且正好对应 OPL provider 层。 |
| `OpenAI background mode` | `use_as_executor_pattern_not_provider` | 它证明长任务应 async/pollable，但只覆盖单次模型 response 的后台执行，不替代 family queue、human gate、domain sidecar dispatch 或 cross-domain attempt ledger。 |
| `LangGraph` | `learn_checkpoint_pattern` | 它的 thread/checkpoint/human-in-the-loop 模式值得吸收；但 OPL 的执行原子是 Codex CLI + domain stage，不需要再把 stage 内部拆成 LangGraph node 作为默认 runtime。 |
| `OpenAI Agents SDK` | `learn_handoff_guardrail_trace_pattern` | 它适合 code-first agent app 的 handoff、guardrail、trace；OPL 可吸收这些边界思想，但不把 MAS/MAG/RCA 重写成 SDK-native agents。 |
| `Cloudflare Agents` | `watch_as_actor_runtime_pattern` | 它的 durable object / schedule / stateful agent 模式说明 actor identity 和 wakeup 很重要；但当前 OPL 本机和多仓 runtime 更贴近 Temporal + local provider，不优先迁到 Cloudflare edge runtime。 |
| `Dify / AutoGen / CrewAI / DeerFlow` | `learn_workflow_and_team_pattern` | 它们展示 workflow、agent team、research flow 的组织方式；OPL 不应引入它们作为核心 runtime，避免把 Codex CLI 的强执行器能力降级成轻量 node 编排。 |

依赖进入 `adopt_as_provider_target` 的门槛：

- 能表达 OPL 的 `stage_attempt`、`activity`、`signal`、`query`、`retry/dead-letter`、`heartbeat/checkpoint` 和 `human gate`。
- 能通过 fixture workflow、MAS real paper-line guarded soak、MAG/RCA controlled stage attempt 和 direct skill parity 验收。
- 不要求 domain truth 迁移到 provider history。
- 不要求 MAS/MAG/RCA 放弃 direct app skill path。
- 能在本机开发、CI fixture 和未来 production provider 三种环境下稳定运行或清晰 fail-closed。

因此，Temporal SDK 已作为 OPL production provider target 引入；下一阶段聚焦真实 Temporal server/worker deployment、Codex runner 的生产长时 domain soak 和 domain receipt evidence，不建议同时引入第二个 agent workflow 框架作为 OPL core runtime。

## Framework 上收范围

OPL 的长期职责不是只做“入口聚合”，而是成为完整的智能体运行框架。凡是 domain-neutral、可跨 MAS/MAG/RCA 复用、服务长时间自治和可恢复执行的外围能力，都应进入 OPL framework 或 OPL shared contract。

应上收到 OPL 的能力：

- `stage_attempt ledger`：attempt id、provider kind、workflow id、stage id、workspace locator、source fingerprint、retry budget、human gate refs、checkpoint refs、closeout refs。
- `typed family queue`：domain sidecar export 的 pending task hydration、dedupe、lease、retry、dead-letter、notification 和 approval transport。
- `checkpoint / closeout / receipt`：统一记录 Codex stage activity 的进度、结果、artifact delta refs、blocked reason、rejected writes 和 next owner。
- `source_fingerprint / idempotency_key`：跨 provider、跨 domain 的重复启动防护。
- `artifact index / file lifecycle / retention`：artifact locator、retention policy、safe cache cleanup、restore proof、migration ledger、artifact freshness projection。
- `workspace lifecycle`：workspace registration、runtime state root、profile discovery、module install/update、restore/import/provenance references。
- `human gate / resume token`：用户插入指令、approval、pause/resume/stop、milestone reactivation intake 的 provider-level signal 和 receipt。
- `operator projection / workbench`：attention queue、running/recent items、attempt freshness、blocked reason、source refs、artifact locators、domain drilldown links。
- `domain-agent skeleton validation`：统一检查 stage descriptor、action catalog、sidecar export/dispatch、skill refs、prompt refs、knowledge refs、quality gate refs 和 authority boundary。

不得从 domain 迁出的内容：

- MAS 的 study truth、clinical claim、evidence ledger、review ledger、publication gate、AI reviewer verdict、manuscript/package authority。
- MAG 的 grant strategy、fundability judgment、specific aims、proposal quality gate、submission-ready export authority。
- RCA 的 visual direction、creative artifact generation、review/export gate、canonical artifact authority。
- 任何 domain-specific memory truth、domain quality verdict、domain final ready verdict。

迁移原则：

- MAS 现有 SQLite / file lifecycle 经验应作为 OPL framework 的参考实现和 parity oracle，而不是把 MAS runtime database 直接升格为 OPL truth。
- OPL 持有的是 lifecycle metadata、attempt/control receipt ref、artifact locator 和 restore proof；domain 持有的是 artifact 内容、质量判断和业务真相。
- 如果一个能力能服务 MAS/MAG/RCA 且不包含领域判断，它应进入 OPL shared module 或 provider layer。
- 如果一个能力需要理解医学、基金或视觉创作语义，它只能留在 domain repo，并通过 descriptor、receipt refs、projection refs 和 artifact locator contract 暴露给 OPL。

## Standard Domain-Agent Skeleton

目标结构如下。它定义 OPL 需要发现和托管的标准边界，不要求每个 repo 内部文件名、语言和业务实现完全一致。

```text
domain-repo/
  agent/
    stages/
    prompts/
    skills/
    knowledge/
    quality_gates/
  contracts/
    domain_descriptor.json
    stage_control_plane.json
    action_catalog.json
    sidecar_export.schema.json
    sidecar_dispatch_receipt.schema.json
  runtime/
    sidecar/
    projection_builders/
    lifecycle_adapters/
  docs/
    project.md
    status.md
    invariants.md
    decisions.md
```

标准含义：

- `agent/stages/`：domain-owned stage definition，包含 stage goal、entry condition、success gate、stop rule、route-back 和 human gate policy。
- `agent/prompts/`：stage prompt、role policy、review prompt、repair prompt；OPL 只索引 ref，不解释内容。
- `agent/skills/`：Codex App direct skill 与 stage 内工具说明；必须能不经过 OPL 直接使用。
- `agent/knowledge/`：domain memory、literature/reference context、failed path、reusable lesson 的读取/回写合同；跨 study 或跨 deliverable 的记忆写入必须有 proposal/receipt。
- `agent/quality_gates/`：domain quality gate、AI reviewer、export gate、submission/package gate；OPL 只能读取 verdict refs。
- `contracts/`：给 OPL 的 machine-readable boundary，不能用 Markdown 段落当机器接口；包括 artifact locator / artifact index / receipt schema / sidecar dispatch schema，不包括真实产物。
- `runtime/sidecar/`：OPL provider 调用 domain 的唯一受控桥；必须 fail-closed 拒绝 forbidden writes。
- `runtime/projection_builders/`：给 OPL App / CLI / workbench 生成只读投影的 repo-side builder，不保存运行实例。
- `runtime/lifecycle_adapters/`：把 workspace artifact root、runtime receipts、retention / restore proof 映射成 OPL 可读 locator / proof refs 的 adapter。
- workspace / runtime artifact root：保存 domain-owned truth、receipt 实例、中间产物和最终交付物；它由 domain agent 管辖，但不在 domain repo 源码 skeleton 内。OPL 只持 locator、freshness 和 proof refs。

迁移目标：

- MAS、MAG、RCA 都应逐步把现有入口、manifest、sidecar、stage descriptor、skill 和 projection 映射到这套 skeleton。
- 已有实现可以先用 adapter / manifest projection 对齐，不要求一次性物理移动目录。
- 物理目录重组只能在 direct skill path、OPL-hosted path、existing tests、restore/provenance proof 都稳定后执行。
- 目录统一的目标是降低 OPL 托管成本和减少二次污染，不是把 domain repo 改成同一套业务代码。

## 目标架构

```text
User / Codex App / OPL GUI / CLI
  -> OPL Codex-default session runtime
  -> OPL activation + stage control plane
  -> typed family queue / wakeup / approval / retry
  -> family runtime provider (Temporal target; Hermes/local legacy)
  -> domain app skill or domain capability surface
  -> Codex CLI executing a domain-owned stage
  -> domain-owned quality gate / truth reducer / artifact authority
```

OPL 负责：

- domain module discovery 与 skill sync。
- stage descriptor discovery、stage lifecycle receipt 和 handoff envelope。
- typed family queue、idempotency key、lease、retry、dead-letter。
- human gate / approval transport、notification、wakeup。
- durable session/runtime status、attempt ledger、checkpoint、trace projection。
- artifact index、file lifecycle、retention、restore proof、migration ledger 和 workspace lifecycle metadata。
- cross-domain progress、attention queue、artifact locator 和 operator dashboard。
- 标准 domain-agent skeleton 的 discovery、validation、parity check 和 migration guidance。
- parity helper、manifest validation、framework-level governance。

## Temporal-Backed Runtime Provider

Temporal provider 的定位是生产级 durable substrate，不是新的领域大脑。

语义映射：

- Temporal Workflow = `stage_attempt`。一次 scout、idea、analysis-campaign、review、decision 等 stage attempt 进入可恢复 workflow history。
- Temporal Activity = `Codex CLI` stage execution、domain sidecar dispatch、artifact rebuild、review/gate replay 等可重试外部动作。
- Temporal Signal = human gate、用户插入修改要求、approval、pause/resume/stop、milestone 后 reactivation intake。
- Temporal Query = OPL App / CLI / Portal 读取 stage progress、attempt status、next owner、blocked reason、artifact refs。
- Temporal retry / timeout / heartbeat / history = OPL durable execution 的生产可靠性底座。

不迁移的内容：

- MAS/MAG/RCA 的 domain truth、quality gate、artifact/package authority 不进入 Temporal。
- Temporal 不生成研究方向、基金策略或视觉审美判断；这些仍由 domain stage pack、prompt/skill、AI reviewer/review gate 和 Codex CLI 执行器完成。
- Temporal history 只能作为 runtime audit / replay evidence，不能替代 evidence ledger、review ledger、publication_eval、submission-ready gate 或 visual export gate。

优先落地顺序：

1. Provider abstraction freeze：把 OPL family runtime provider 显式枚举为 `local_sqlite | hermes_legacy | temporal`，并声明一致的 readiness、attempt、signal、query、receipt 字段。
2. Temporal stage workflow schema：冻结 `stage_attempt_id`、domain id、stage id、workspace locator、source fingerprint、checkpoint refs、human gate refs、retry budget、closeout refs。
3. Codex CLI activity runner：把 stage prompt/skill/context packet 作为 activity input，输出 typed closeout、artifact delta refs、receipt 和 next owner。
4. Human gate signal/query/projection：把用户修改要求、approval、stop-loss、resume token 与 App 状态查询接入 Signal/Query。
5. MAS paper-line pilot：选择真实 paper line 做 read-only / guarded apply soak，证明 `stage entry packet -> Codex activity -> closeout packet -> router receipt -> progress delta / human gate / stop-loss`。
6. MAG/RCA controlled attempts：用 controlled workspace 或 fixture 证明 grant/visual stage attempt 可复用同一 provider abstraction。
7. Hermes retirement：Temporal provider 通过 readiness、soak 与 direct skill parity 后，Hermes 退到 optional executor/proof backend、legacy compatibility provider 或可选安装模块。

当前落地校准（2026-05-11）：普通 `Product Entry`、`opl resume` 与 `opl session resume` 已收敛为 Codex-default executor；`opl status runtime` 顶层已经报告 provider-backed family runtime。Hermes 相关输出仅保留在 `hermes_legacy` provider、diagnostics/provenance/test fixture 与可选安装模块语境。下一步不需要等待“完整智能体平台”才能继续做 descriptor / gate / projection / Codex runner / runtime status 的收口；真实 Temporal server/worker residency、长时 domain activity soak、真实 paper/grant/visual provider-hosted apply、memory body apply receipt 与物理旧面删除仍属于平台成熟后的 production closure。

Domain agent 负责：

- stage sequence、stage goal、prompt、skill 和 role policy。
- domain data / source / evidence / material truth。
- quality gate、reviewer logic、submission / publication / deliverable verdict。
- artifact build、package authority 和 final export gate。
- domain-specific stop-loss、claim downgrade、route switch、revision reactivation。

Codex CLI 负责：

- 在 stage 目标与 boundary 内自主拆解、阅读、实现、运行验证、修订和交付。
- 输出 stage closeout、artifact delta、review notes、receipts 和 handoff evidence。

## 主要缺口

1. Stage descriptor 已有雏形，但还没有成为 OPL family runtime 的第一等 attempt lifecycle。
2. Domain handoff envelope 与 direct skill invocation 仍需统一成同一套 machine-readable owner split。
3. Stage attempt ledger 需要记录 executor、source fingerprint、checkpoint refs、closeout refs、cost/token、retry budget、human gate 和 dead-letter。
4. Framework guardrail 与 domain quality gate 还需要明确分层：OPL 只能检查 contract completeness、forbidden writes、freshness 和 owner boundary；domain 才能判断论文、基金、视觉交付质量。
5. Human gate 需要统一 approval request、decision receipt、resume token 和 route-back semantics。
6. Observability 需要把 stage freshness、consumed refs、rejected writes、route impact、next owner 和 artifact proof 投影到 OPL App / CLI，而不制造第二 truth。
7. Direct skill compatibility 需要被固定为开发纪律：domain skill 仍可直接被 Codex App 调用，OPL 消费的是同一 skill/action/stage catalog。
8. MAS 已验证的 SQLite / file lifecycle / restore proof / retention 经验还没有完全上收成 OPL framework primitive。
9. MAS/MAG/RCA 尚未按统一 domain-agent skeleton 完成 repo-source 目录和 contract 物理重组；当前主要仍是 descriptor/projection 对齐，真实运行产物继续留在 workspace / runtime artifact root。

## 跨仓迁移与退役矩阵

这张表只定义迁移纪律，不替代各仓 `status/project/invariants` 和具体 contract。

| repo / surface | target role | move to OPL | retain in domain | retire / degrade rule |
| --- | --- | --- | --- | --- |
| `one-person-lab` | family agent framework | provider abstraction、Temporal workflow/activity/signal/query、typed queue、attempt ledger、human gate、operator projection、shared descriptor validation | 不持有任何 domain truth | Hermes-first、Gateway、old local-only runtime wording 进入 legacy/diagnostic/history；public help 不再把这些面展示成默认路径；无 active caller 后删除残留 alias。 |
| `one-person-lab` runtime/lifecycle layer | framework runtime substrate | SQLite/local provider patterns、file lifecycle、artifact index、retention、restore proof、migration ledger、workspace lifecycle、provider receipts | 不持有 domain artifact content 或 verdict | 以 MAS 现有经验为 reference implementation，抽象成 OPL shared contract/provider primitive。 |
| `med-autoscience` | medical research domain agent | online wakeup、retry/dead-letter、stage attempt transport、provider readiness、operator workbench projection；framework-generic SQLite/file lifecycle lessons 上收到 OPL | study truth、publication gate、AI reviewer、evidence/review ledger、route decision、artifact/package authority、sidecar receipt refs | 按 `docs/program/opl_temporal_mas_runtime_retirement_program.md` 执行；Temporal/MAS paper soak 前不得删除 local diagnostics。 |
| `med-autogrant` | grant domain agent | grant stage attempt transport、approval/retry/dead-letter、operator projection、standard skeleton adapter | fundability strategy、specific aims、proposal authoring、critique/revision、submission-ready export authority | 旧 local host-agent runtime、Gateway wording、Hermes proof lane 只能保留 provenance/proof；controlled stage attempt 与 skeleton parity 通过后继续物理清理。 |
| `redcube-ai` | visual-deliverable domain agent | visual stage attempt transport、runtime wakeup、operator projection、provider receipt、standard skeleton adapter | visual direction、artifact creation、review/export gate、canonical artifact authority | 旧 Hermes route wording、historical Gateway file names、repo-local managed runtime pilot 只作 migration provenance；direct route / sidecar / stage descriptor parity 后删除默认残留。 |
| `med-deepscientist` | archive / diagnostic / upstream-intake reference | 无 active provider / stage adapter 迁移 | legacy source、fixture、backend audit、parity oracle、explicit restore/import evidence | 不接入 OPL active domain list；只有 MAS 已具备 source provenance、restore/provenance replacement 和 behavior fixture 后再物理删除旧 daemon/WebUI/quest surface。 |

退役顺序固定为：

1. 先让 OPL provider-backed stage attempt 可运行。
2. 再让 OPL framework primitives 承接 MAS 已验证的 lifecycle / artifact / retention / restore-proof 模式。
3. 再让 domain sidecar / direct skill / stage descriptor / standard skeleton adapter 证明语义等价。
4. 再做真实或 controlled soak。
5. 最后删除旧 vocabulary、compatibility alias、旧 manager、重复 UI/manager surface 和非标准目录入口。

任何清理如果会降低 direct skill path、domain diagnostics、restore/provenance 或真实 artifact gate 可解释性，应推迟到 provider soak 之后。

## 落地计划

### Master P0. 基线冻结与总入口对齐

目标：让所有 repo 都明确从本文进入 OPL stage-led framework 开发，不再产生平行总计划。

交付：

- OPL `docs/README*`、`docs/status.md`、`docs/architecture.md` 明确本文是 framework master entry。
- MAS `opl_temporal_mas_runtime_retirement_program.md` 回指本文，并把 MAS 本地 scheduler / watchdog / MDS compatibility 清理列为 domain-side execution plan。
- MAG/RCA/MDS `docs/status.md` / `project.md` / `invariants.md` 继续声明自己是 domain agent 或 archive/reference，不成为 OPL 内部模块。
- 搜索 Hermes-first、Gateway、legacy local runtime、MDS/default backend、old manager wording，并分成 active / legacy / diagnostics / retired。

验收：

- 新增实现不能绕过本文另建“OPL 总计划”。
- 文档中的目标状态和当前状态必须拆开，不能把 Temporal provider 写成已 fully landed。

### Master P1. Temporal Provider Core

状态：已落地 `temporal` provider core。OPL 已引入 Temporal TypeScript SDK，新增 `StageAttemptWorkflow`、Codex / domain sidecar activity、human gate / user instruction / resume signal、stage attempt query、CLI `attempt start/query/signal`、worker helper 和 worker lifecycle contract；缺少 Temporal 地址时 start/query/signal 明确 fail-closed，provider readiness 也要求 worker 已显式确认。

目标：把已落地的 provider core 从 repo/test 可用推进到真实 Temporal server/worker deployment，并用 domain soak 证明它能稳定托管 stage attempt。

交付：

- 已完成：`StageAttemptWorkflow`、`CodexStageActivity`、`DomainSidecarDispatchActivity`、`HumanGateSignal`、`UserInstructionSignal`、`ResumeSignal`、`StageAttemptQuery` 形成 OPL Temporal provider code。
- 已完成：`opl family-runtime attempt start|query|signal` 可走 Temporal client；没有 `OPL_TEMPORAL_ADDRESS` / `TEMPORAL_ADDRESS` 时 fail-closed，不伪装为已执行。
- 已完成：provider receipt 继续写入现有 stage attempt ledger；provider status 暴露 worker lifecycle contract，不把仅配置地址误报成 Full ready。
- 待完成：真实 Temporal server / worker residency proof、worker restart/re-query proof、生产 activity retry 和真实 domain soak。

验收：

- workflow replay 不重复触发 domain work unit。
- Activity retry 使用 source fingerprint / idempotency key。
- Temporal failure / dead-letter 不被 domain 误读为 quality verdict。

下一开发入口：

- 主仓：`/Users/gaofeng/workspace/one-person-lab`
- 主文档：本文
- 细化文档：`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md`
- 首个后续代码 tranche：`Master P2. Codex Stage Activity Runner`
- 同步子计划：MAS 只跟随 `/Users/gaofeng/workspace/med-autoscience/docs/program/opl_temporal_mas_runtime_retirement_program.md` 做 provider-ready contract / sidecar / guarded soak，不抢先物理删除本地诊断面。

### Master P2. Codex Stage Activity Runner

状态：已落地 Temporal activity、local fixture 的 typed closeout ingestion、dry-run / live-dry-run / `codex_cli` runner receipt、进程监督 repo/test harness 和完成态 gate；生产级长时 domain activity soak 仍是后续实现。

目标：把 Codex CLI 作为 stage 内默认 concrete executor 接入 provider。

交付：

- 已完成：stage packet ref、workspace locator、authority boundary 可进入 fixture activity input。
- 已完成：typed closeout packet 强制要求 `closeout_refs`，并投影 consumed refs、consumed memory refs、writeback receipt refs、rejected writes、route impact、next owner、domain ready verdict。
- 已完成：typed closeout ledger 对同一 `closeout_id` 的完全相同 packet 重放保持幂等，对同一 id 的冲突 packet fail-closed，避免污染 closeout refs、activity ledger 或 route impact。
- 已完成：checkpoint refs、human gate ledger、user instruction ledger、resume ledger 和 dead-letter task ledger 进入 attempt ledger/query/workbench projection。
- 已完成：缺少 typed closeout 的 domain dispatch 只进入 checkpointed，不能被标成 completed。
- 已完成：`codex_cli` runner mode 可启动 Codex CLI、记录 stdout event summary、timeout、process output summary、checkpoint heartbeat，并保持 typed closeout required-for-completion。
- 待完成：真实 MAS/MAG/RCA 长时 stage activity soak、token/cost/progress sampling 校准、domain sidecar live dispatch 和 owner receipt 连续 evidence。

验收：

- Codex activity runner 可 dry-run / live-dry-run / `codex_cli` fixture harness。
- 没有 typed closeout 时 attempt 不得被标成 completed。
- OPL 只保存 refs 和 receipt，不复制 domain truth。

### Master P2b. Framework Lifecycle Primitives From MAS

状态：已落地 locator-only lifecycle primitive contract；MAS/MAG/RCA domain-side inventory/adapter 已进入各自 main，并可由 OPL manifest discovery 消费。真实跨 domain cleanup / restore apply、retention receipt 和 long-run soak 仍未完成。

目标：把 MAS 已验证的 SQLite 持久化层、file lifecycle、artifact index、retention、restore proof 和 lifecycle 管理经验抽象为 OPL framework primitive。

交付：

- 定义 OPL-owned `lifecycle ledger`、`artifact index`、`retention policy`、`restore proof`、`migration ledger`、`workspace lifecycle metadata` 的 shared schema。
- 从 MAS 现有实现中拆出 `framework_generic` pattern 与 `mas_domain_specific` truth 清单。
- OPL local provider 使用 framework-generic schema；MAS/MAG/RCA 通过 sidecar/projection 暴露 domain-owned refs。
- 明确 OPL 只能持有 locator、freshness、receipt、proof、migration state；不能复制 domain artifact content 或 domain verdict。

验收：

- MAS 现有 SQLite/file lifecycle 能力被映射为 OPL primitive 或 MAS-retained truth，没有灰色区域。
- MAG/RCA 能复用同一 artifact index / retention / restore proof 合同，不需要复制 MAS 私有实现。
- OPL cleanup / retention / restore 操作只能作用于 framework-owned cache、index、receipt 或 provider state；domain-owned artifact 删除必须回到 domain receipt。

### Master P2c. Standard Domain-Agent Skeleton Rollout

状态：OPL 已落地 `standard-domain-agent-skeleton-contract.json`、alias-aware manifest normalizer 和 `opl agents list|inspect`；MAS/MAG/RCA adapter 已进入各自 main。当前真实 manifest smoke 显示三仓 skeleton 均 aligned，且都通过 artifact locator surface 证明真实 artifact 不进入 domain repo source skeleton。

目标：让 MAS、MAG、RCA 按统一 skeleton 暴露 stage、prompt、skill、knowledge、quality gate、contract、sidecar、receipt schema / refs、projection builder / refs 和 artifact locator contract。

交付：

- 已完成：在 OPL 冻结 `standard_domain_agent_skeleton` contract：repo-source 只允许 `agent/`、`contracts/`、`runtime/`、`docs/`，真实 artifact 只能通过 locator 暴露。
- 已完成：MAS/MAG/RCA 各自生成 skeleton mapping：现有 repo-source 文件/manifest 到 `agent/`、`contracts/`、`runtime/`、`docs/` 的对应关系，以及 workspace artifact root / runtime artifact root 的 locator contract。
- 已完成：OPL normalizer 消费 MAS `opl_domain_agent_skeleton_mapping`、MAG `domain_agent_skeleton_mapping`、RCA `domain_agent_skeleton_adapter`；缺少 artifact locator surface 时保持 `drift_detected`。
- 先以 manifest/adapter 对齐，再分 repo 做物理目录重组计划。
- 已完成：OPL `opl agents inspect` / `opl stages inspect` 能展示 skeleton completeness、missing refs、nonstandard legacy surface 和 migration blockers。

验收：

- MAS、MAG、RCA 都能在不经过 OPL 的 direct skill path 下继续工作。
- OPL-hosted path 和 direct skill path 读取同一 descriptor、skill refs、quality gate refs、sidecar receipt refs 和 artifact locator refs。
- 任何物理目录移动前都有 path compatibility audit、restore/provenance proof、focused tests 和 rollback plan。
- 目录重组不得把 domain truth 迁到 OPL，也不得把 OPL provider state 写回 workspace / runtime artifact root 中的 domain final artifacts。

### Master P3. Human Gate、用户插入指令与 Resume

目标：把用户修改要求、审批、暂停/恢复做成 provider-level signal，同时交给 domain-owned intake 执行。

交付：

- user instruction intake signal / receipt。
- approval、pause/resume/stop signal。
- milestone 后 reactivation handoff：MAS 投稿包后 10 条修改要求、MAG/RCA 返修要求都回到各自 domain revision stage。

验收：

- 用户插入要求不会新开第二条 truth line。
- OPL 不直接 patch domain artifacts，只传递 signal 和 handoff envelope。

### Master P4. Operator Visibility

状态：已落地 stage attempt workbench 核心投影、Aion 白名单 signal bridge、attempt-bound human gate signal 校验，以及 provider completion / domain ready verdict / human gate / dead letter / rejected writeback 五轴状态显示；真实 worker/domain 执行证明、按 refs 分组的操作体验和跨 domain soak 仍待完成。

目标：让 OPL App / CLI 能看懂 stage attempt 卡在哪里。

交付：

- OPL App / CLI 显示 provider kind、attempt id、stage、activity、heartbeat、consumed refs、consumed memory refs、writeback receipt refs、closeout refs、rejected writes、route impact、next owner、human gate、dead-letter reason。
- Aion Runtime Workbench 已显示 provider completion、domain ready verdict、human gate、dead letter 和 rejected writeback 五个独立 operator 状态轴；signal bridge 只允许 snapshot 读取和受限 attempt signal，不开放任意 `family-runtime` fan-out。
- 支持按 domain / workspace / stage / blocker / dead-letter 过滤。

验收：

- 用户能区分卡在 provider、Codex activity、domain gate、artifact downstream 还是 human gate。
- UI 不把 provider completed 写成论文/基金/PPT ready。

### Master P5. Domain Soak And Retirement

目标：用真实或 controlled domain line 证明 OPL 托管不降级，然后清理旧路径。

交付：

- MAS：一条真实 paper line 做 read-only -> guarded apply soak，执行 MAS 本地 retirement program。
- MAG：controlled grant stage attempt，验证 critique/revision/package handoff。
- RCA：controlled visual stage attempt，验证 review/revision/export handoff。
- MDS：保持 archive/reference，不接入 active OPL stage adapter。
- 退役 Hermes-first wording、old Gateway vocabulary、旧 local runtime / manager alias、MDS default dependency、重复 UI/manager surface。

验收：

- direct skill path 与 OPL-hosted path 语义等价。
- 清理旧面前必须证明无 default caller、无 public surface 依赖、无 fixture/provenance 必需，或已有 explicit diagnostic/history replacement。
- 各 repo native verification green。

### Lane 1. Family Stage Descriptor Contract

目标：把 stage 作为 OPL family framework 的正式语义单元。

交付：

- 扩展 `family-stage-control-plane` descriptor，稳定 `stage_id`、`domain_owner`、`stage_kind`、`goal`、`required_inputs`、`expected_outputs`、`skill_refs`、`prompt_refs`、`evaluation_refs`、`handoff_refs`、`authority_boundary`。
- 扩展可选 `knowledge_refs`，只指向 domain-owned memory / literature / failed-path / reusable-lesson locator，不承载正文或 verdict。
- 把 descriptor 接入 `family-product-entry-manifest-v2` discovery。
- 保持 `opl stages list|inspect` 只读，不执行 stage。

验收：

- MAS/MAG/RCA 都能声明 stage projection。
- descriptor 不包含 domain verdict 字段。
- OPL 无法通过 descriptor 生成 publication-ready、submission-ready 或 deliverable-ready 结论。

### Lane 2. Stage Attempt Ledger

状态：已落地到 `opl family-runtime attempt create|list|inspect` 和 `${OPL_STATE_DIR}/family-runtime/queue.sqlite#stage_attempts`。当前实现覆盖本地 ledger、provider receipt、task-bound lifecycle projection；OPL App 展示仍属于后续 visibility lane。

目标：把一次 stage 执行变成可恢复、可审计的 attempt。

交付：

- `stage_attempt_id`、domain id、stage id、executor kind、workspace locator、source fingerprint、checkpoint refs、closeout refs、status、retry budget、human gate refs。
- attempt status 最少覆盖 `queued`、`running`、`checkpointed`、`blocked`、`human_gate`、`completed`、`failed`、`dead_lettered`。
- OPL 只记录 attempt/control metadata；stage outputs 和 quality verdict 留在 domain surface。

验收：

- OPL App 能显示 current stage attempt、freshness、last checkpoint、next owner。
- 重复 dispatch 使用 idempotency key，不重复启动同一 intent。
- failed attempt 可以指向 domain-owned resume / repair surface。

### Lane 3. Domain Handoff Envelope

目标：统一 OPL 托管调用与 Codex direct skill 调用的边界。

交付：

- `target_domain_id`、`task_intent`、`entry_mode`、`workspace_locator`、`stage_id`、`runtime_session_contract`、`return_surface_contract`、`human_gate_policy`。
- domain 返回 `receipt`、`stage_closeout_ref`、`artifact_refs`、`next_owner`、`blocked_reason`、`rejected_writes`。
- direct skill catalog 与 OPL handoff 使用同一 domain-owned action/stage metadata。

验收：

- MAS/MAG/RCA direct skill invocation 不依赖 OPL 才能解释 task。
- OPL handoff 不绕过 domain route/gate。
- OPL handoff 与 direct call 在同一 domain entry 后收敛到同一 truth surface。

### Lane 4. Guardrails And Quality Boundary

目标：防止 OPL framework 越权成为 domain truth owner。

交付：

- OPL generic guardrails：schema completeness、forbidden authority writes、stale refs、missing owner, retry budget, human gate required。
- Domain quality gates：MAS publication / AI reviewer, MAG fundability / authoring quality, RCA visual review / export gate。
- 每个 projection 明确 `projection_only`、`domain_authority_ref`、`forbidden_verdicts`。

验收：

- OPL 能阻断 forbidden write，不能宣布 domain quality pass。
- Portal / App / CLI 的 ready 类 wording 都必须回指 domain authority。
- 测试只断言 machine-readable contract，不锁 Markdown 措辞。

### Lane 5. Human Gate And Resume

目标：把用户插入指令、审批和修改要求变成可恢复的 stage event。

交付：

- approval request、user instruction intake、decision receipt、resume token、route-back policy。
- milestone package 后的用户修改要求进入 domain-owned revision/reactivation intake。
- OPL 只传递 gate/approval，不直接 patch domain artifacts。

验收：

- MAS 投稿包后 10 条修改要求进入 MAS durable revision intake。
- MAG/RCA 的用户返修进入各自 stage closeout / revision stage。
- human gate 关闭后能恢复到正确 domain stage，而不是新开第二 truth line。

### Lane 6. Observability And Operator Console

目标：让 stage-led autonomy 可见、可诊断、可追责。

交付：

- OPL App / CLI 显示 stage freshness、attempt ledger、consumed refs、artifact refs、closeout receipt、rejected writes、route impact、next owner。
- 支持按 domain、workspace、stage、human gate、dead-letter 过滤。
- trace projection 可回指 domain truth，不复制 domain truth。

验收：

- 至少 MAS 一条真实 paper line 显示 `stage entry -> Codex execution -> closeout -> router receipt -> progress delta / human gate / stop-loss`。
- MAG/RCA 至少各有一条 fixture 或 controlled workspace stage attempt。
- UI/CLI 不把 projection 写成最终质量 verdict。

### Lane 7. Direct Skill Compatibility

目标：固定“OPL 支撑运行，不垄断入口”的开发纪律。

交付：

- 每个 domain 的单一 app skill 继续作为 Codex App 可直接调用入口。
- OPL skill sync 只同步/发现，不改写 skill semantics。
- Domain action/stage catalog 是 OPL 和 direct skill 的共同元数据来源。

验收：

- 不经过 OPL，也能用 MAS/MAG/RCA skill 进入工作。
- 经过 OPL 时，调用仍回到同一 domain-owned command/action/stage surface。
- 文档和 contract 不出现“domain agent 是 OPL 内部模块”的表述。

## 开发纪律

- 后续流程优化优先调整 domain stage pack、prompt、skill、quality gate 和 descriptor，而不是把领域路线写成 OPL 脚本分流。
- OPL 可以调度、唤醒、恢复、观察和投影；不能生成领域结论、不能替 domain 宣布 ready、不能写 domain truth。
- 任何新 framework 能力必须先回答：这是 durable framework concern，还是 domain expertise concern。
- 若属于 framework concern，进入 OPL shared contract / helper；若属于 domain expertise concern，留在 MAS/MAG/RCA。
- direct skill path 是硬约束，不能为了 OPL 托管而退化。

## 推荐优先级

1. 先把 Stage Attempt Ledger 与 Domain Handoff Envelope 做成最小可用闭环。
2. 再把 Human Gate / Resume 与 Observability 接到 OPL App / CLI。
3. MAS 做真实 paper line soak，MAG/RCA 做 controlled workspace proof。
4. 最后清理旧的机械分流入口，只保留 router/audit/materializer 角色。
