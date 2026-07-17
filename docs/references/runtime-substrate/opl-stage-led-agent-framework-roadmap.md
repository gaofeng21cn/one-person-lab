# OPL Stage-Led Agent Framework Roadmap

Owner: `One Person Lab`
Purpose: `development_reference`
State: `active_support`
Machine boundary: this is a human-readable development roadmap. Machine-readable truth must live in `contracts/`, source code, CLI/API behavior, runtime ledgers, or domain-owned manifests.
Currentness rule: 本文不冻结日期、receipt id、attempt id、worklist counter、provider proof snapshot、branch/SHA 或本机 binary 状态；当前进度回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts/source/tests 和 live CLI/read-model。

## 结论

`OPL` 的目标定位应统一为知识工程驱动、stage-led、以 Agent executor 为最小执行单位的 family agent framework。

它对标的是 DeerFlow、Dify、LangGraph、AutoGen、CrewAI、Temporal 这类 agent / workflow framework 的工程层能力，但核心差异是：OPL 不把单个 LLM 调用或轻量 agent node 当成主要原子步骤，而是把 `Codex CLI` 作为默认强执行器，把 domain `stage` 作为可观察、可恢复、可审计的语义工作单元。

`MAS`、`MAG`、`RCA` 是运行在这个 family framework 上的独立 domain agents。它们可以被 OPL 托管、唤醒、排队、投影和恢复，也可以继续通过 Codex App 的单一 app skill 直接调用。OPL 不成为这些 domain 的领域大脑、truth owner、quality gate 或 artifact authority。

长期原则是 AI-first、AI 原生专家判断优先、contract-light。OPL 通过 `Codex CLI` 等 AI executor、domain stage pack、prompt、skill、knowledge、rubric 和 quality gate refs 的迭代获得智能体进步；合同只负责 owner boundary、权限、安全、审计、receipt、阻塞、恢复和 projection 这些下限。当前 active 顶层模型统一为 `Minimal Trust Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`：前四者保证启动、安全、审计、恢复、诊断和默认 surface 节制，AI Capability Aperture 则保留开放式专家空间，让模型升级、domain pack 改进和独立 reviewer 能力能直接转化为系统能力。任何新增 framework primitive 都不能把开放式规划、写作、评审、路线判断或修订逻辑固化成封闭脚本，也不能把 scorecard、checklist、contract completeness 或 provider completion 升级成专家质量判断，否则会削弱后续 AI 能力升级带来的收益。

理想目标是：OPL 提供统一 `domain-agent skeleton`，把所有智能体运行外围能力上收到 framework；MAS、MAG、RCA 按同一套 repo-source 目录、contract 和 lifecycle 接入，只提供领域 stage 定义、推荐 AI strategy refs（提示词、工具/Skill、知识面、rubric、质控 gate refs）、artifact locator contract 与 domain truth authority。标准 Agent stage 推荐显式声明执行提示词、可用工具、知识 / memory refs、输入输出、handoff 和“本 stage 怎么算做好”的 reviewer / quality refs，以便复用、审计和 independent review；这些 refs 的完整性不构成 OPL launch hard gate。涉及创作、评估、评审、路线判断、fundability、publication readiness、visual direction、review/export verdict、memory accept/reject 或 artifact mutation authorization 的工作必须 AI-first；程序只做 validator、materializer、receipt signer、guard 和 refs projection。Stage 执行 AI 与 Stage 质控 AI 必须是两个独立智能体任务，可以同用 `Codex CLI` executor，但必须独立 invocation、独立上下文、独立 task record 和独立 receipt。不同 domain 的业务内部不要求完全同构，但对 OPL 暴露的 skeleton、descriptor、sidecar、receipt schema、projection builder 和生命周期语义应同构。真实论文、基金、PPT、运行日志、receipt 实例和中间产物属于 workspace / runtime artifact root，不属于 domain repo 源码目录。

## 总入口

本文是接下来 OPL family agent framework 的总开发入口。任何涉及以下主题的实现、文档更新或退役清理，都应先从本文判断 owner、边界、优先级和验收门槛：

- OPL 作为 stage-led、以 Agent executor 为最小执行单位的智能体框架的顶层设计。
- Temporal / retired Hermes-provider / retired local provider 的 runtime substrate 取舍，其中 Temporal 是 production online OPL 的必需 substrate，local provider 只保留 retired negative guard 与 SQLite projection/index provenance，Hermes provider / Gateway / proof-provider / readiness / compatibility surface 只保留 history/provenance/diagnostic/negative-guard 角色。
- `hermes_agent`、`claude_code` 与 `antigravity_cli` 作为 canonical 显式非默认 executor adapter/backend 单独保留，必须通过独立 receipt、audit、executor binding ref 和 fail-closed gate；其中 `hermes_agent` 额外要求 full-loop proof，`antigravity_cli` 只作为 stage-level explicit model/reasoning selection 示例。
- `TypeScript`、`Python`、`Go`、`Rust` 在 framework 与 domain agent 中的分工。
- MAS / MAG / RCA 的 stage/action/projection descriptor 接入、direct skill 等价和 OPL-hosted path。
- MAS 已验证的 SQLite 持久化、file lifecycle、restore proof、artifact index、retention 和 lifecycle 管理经验如何上收到 OPL framework。
- MAS / MAG / RCA 是否按统一 domain-agent skeleton 重组 repo-source 目录、contract 和 entry surface。
- MDS / DeepScientist、Hermes-first、Gateway / retired-surface vocabulary、旧 local runtime、旧 workspace-local scheduler 等过时面的退役纪律。

配套入口：

- Temporal provider 支撑参考：`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- Production closure gap matrix：`docs/active/production-framework-closure-gap-matrix.md`
- Foundry Kernel 控制面边界：`docs/runtime/opl-foundry-kernel-control-plane.md`
- MAS runtime 退役计划：`med-autoscience/docs/active/opl_temporal_mas_runtime_retirement_program.md`
- Stage control plane adoption：`docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`
- Domain memory 总入口：`docs/references/operating-governance/family-domain-memory-governance.md`
- Domain-agent 统一机器入口：`opl agents descriptors --json` / `opl agents descriptor --domain mas --json`
- 跨仓当前状态：OPL、MAS、MAG、RCA、OPL Meta Agent 和 MDS archive/reference 各自的 `docs/status.md`、`docs/project.md`、`docs/invariants.md`

开发纪律：

- 新增 framework-level runtime 能力默认先进入 OPL TypeScript control plane、shared contract、provider abstraction 或 App/CLI projection。
- 新增合同必须保持 contract-light 且只保下限：只固定边界、安全、权限、receipt、audit、recovery、projection 和 fail-closed 条件；prompt / tool / knowledge / rubric / quality refs 是推荐显式声明的 AI strategy refs，不是 OPL launch hard gate；不得把 AI executor 的开放式专家行为写成固定决策树、硬编码评分器或脚本后处理，也不得把 contract completeness 写成 quality verdict。
- 新增 domain expertise、quality gate、truth reducer、artifact/package authority 默认留在对应 domain repo。
- MAS 中已经证明可复用的 runtime 外围能力，应先拆成 `framework_generic` 与 `mas_domain_specific`；前者迁入 OPL framework，后者留在 MAS。
- 已被退役或降级的旧面不得通过别名、帮助文案、测试 fixture 或 product wording 重新变成默认路径；确认无 active caller 后直接删除或迁入 history/tombstone。
- 如果需要改变本文的 owner split 或语言/runtime 选择，必须同步更新上述配套入口，不能只改单个 repo 的局部文档。

## Live Read-Model 读取规则

本文是 roadmap，不冻结瞬时 worklist、receipt、attempt、stage count 或 provider proof 数字。每轮判断当前状态时，先读取 live machine surfaces，再把 durable 结论折回 active owner 文档或本 roadmap：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl stages readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
```

当前 schema 的默认摘要入口是 `framework_readiness.summary`、stage readiness summary、App/operator drilldown summary、`family_runtime_evidence_worklist.summary`、`standard_domain_agent_conformance.summary` 和 `agent_default_caller_readiness.summary`。这些命令的 open worklist、closed refs-only item、domain-dispatch workorder、blocked envelope、provider SLO、stage admission 和 proof counters 都是动态读数；本文只保留它们的解释规则：

- structural conformance passed 只证明 standard pack / descriptor / authority boundary 可读，不证明 production ready。
- generated/default caller readiness 只证明 OPL replacement / active caller cutover / deletion-evidence gate 可读，不授权 domain repo 物理删除。
- zero-open worklist 只表示当前没有 OPL 可执行 evidence workorder，不表示 domain owner-chain、artifact authority、App release 或 long-soak 完成。
- positive open worklist 只表示 OPL refs-only accounting 暴露了可提交 route；payload 仍必须来自 domain/App/live owner 的真实 refs 或 typed blocker。
- `domain_ready_authorized=false`、`production_ready_authorized=false` 和各类 release / production ready claim false 是固定 authority 边界；任何 provider proof、descriptor ready、cleanup proof、refs-only ledger receipt 或 App/operator projection 都不能升级为 domain truth、quality/export verdict、artifact authority、App release ready 或 production ready。

具体 2026-05 proof、receipt id、attempt id、read-model snapshot 和 per-domain closeout 数字只按 history/provenance 读取，当前归档入口是 [OPL family 文档过程归档 2026-05](../../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。当前 production closure 的优先级仍是继续证明真实 domain owner-chain、MAS paper-line guarded apply progress、MAG/RCA long soak、artifact/memory/lifecycle apply receipt、App release/user path 和 family production evidence；不得让 dated descriptor/index proof 或 worklist accounting 替代这些 evidence-after-contract 尾项。

## 支撑读法与动态证据入口

本文不维护“分层完成度”、跨 repo 当前状态表、shared package SHA、某次 proof snapshot 或 per-domain closeout 数字。稳定职责是解释 stage-led framework 的 owner split、runtime substrate、retirement 顺序和证据门读法；当前进度、open gate、counter、receipt id、attempt id、App cohort、provider proof 和 domain owner-chain 状态都回到 live surfaces 与 active truth owner。

| 支撑面 | 稳定角色 | 动态入口 | 禁止读法 |
| --- | --- | --- | --- |
| Framework owner split | OPL 持有 stage-led runtime、stage-attempt request/projection、attempt ledger、provider lifecycle、generated/hosted surfaces、operator projection 和 refs-only evidence transport。 | 核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`contracts/`、source/tests。 | OPL 成为 MAS/MAG/RCA 的 truth、quality/export verdict、artifact authority、memory body 或 owner receipt owner。 |
| Provider/runtime substrate | Temporal-backed provider 是 production online runtime 的必需 substrate；local provider 只作 retired negative guard，SQLite 只作 projection/index。 | `opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json`、Temporal provider contracts/source/tests。 | provider completion、SLO satisfied、worker ready 或 residency proof 等于 domain ready / production ready。 |
| Stage readiness | Stage readiness 是 launch/admission/evidence diagnostic lens；它不执行 stage，也不替代 AI executor 或 domain quality gate。 | `opl stages readiness --family-defaults --json` 与 `--domain <domain>` drilldown。 | warning count、contract completeness、proof bundle 或 graph/readiness 结果升级为 publication/fundability/visual verdict。 |
| Standard conformance / default caller | Conformance 与 generated/default caller readiness 只证明 descriptor、replacement owner、active caller cutover、deletion-evidence refs 和 no-forbidden-write 边界可读。 | `opl agents conformance --family-defaults --json`、`opl agents default-callers --family-defaults --json`、domain-owned contracts。 | 结构通过或 deletion evidence observed 等于 physical delete ready、domain ready、production ready 或 domain repo owner 授权。 |
| App/operator evidence | App/operator drilldown 和 evidence worklist 是 refs-only operator read model；它们暴露 route、receipt、typed blocker、workorder、SLO 和 evidence tail。 | `opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`。 | zero-open worklist 等于完成；positive-open worklist 等于 OPL 可自闭；refs-only receipt 等于 owner-chain closeout。 |
| Domain production evidence | MAS/MAG/RCA/OMA 的真实进展只能由 domain owner receipt、typed blocker、owner-chain refs、no-regression refs、quality/export verdict 或 artifact authority refs 关闭。 | 各 domain repo active truth、contracts/source/tests、domain-owned manifests、owner receipts 和 runtime ledger。 | App/user-path、OMA consumption、Developer Mode、standalone external evidence 或 cleanup ledger 被写成 MAS/MAG/RCA production ready。 |

历史完成度表、2026 proof、shared package SHA、fixed conformance/default-caller counters、App/Aion snapshot、DM002/DM003/Obesity 样本叙事和 per-domain evidence closeout 只按 history/provenance 阅读。需要当前判断时，先读取本节 live surfaces，再把 durable 结论折回 active gap plan、核心五件套、相关 support reference、runtime ledger 或 `docs/history/**` ledger。

## 距离理想生产级框架的判断口径

“离理想生产级框架还有多远”不是本文维护的固定状态标签。当前状态由 `docs/active/current-state-vs-ideal-gap.md` 和 live read-model 共同给出；本文只保留长期 completion gates：

1. OPL control plane、provider lifecycle、stage-attempt request/projection、attempt ledger、human gate、retry/dead-letter、stage progress projection 和 App/operator drilldown 必须能在真实 provider-backed stage 中持续可恢复、可审计。
2. MAS/MAG/RCA/OMA 的 standard pack、descriptor、generated/default caller、direct skill path 与 OPL-hosted path 必须持续保持 parity；repo-local generic runtime、wrapper、alias、facade 和 compatibility-only tests 只有在 owner refs 与 no-active-caller proof 齐全后才能物理退役。
3. MAS paper-line、MAG grant-stage、RCA visual-stage 和 OMA new-agent builder 的 production evidence 必须来自 domain-owned owner receipt / typed blocker / no-regression / long-soak / artifact-memory-lifecycle refs；OPL 只投影和验证 refs。
4. Domain memory body、artifact body、quality/export verdict、source truth、publication/fundability/visual judgment 和 final owner receipt 保持在 domain owner；OPL 只持 locator、receipt ref、migration/read-model、transport 和 operator projection。
5. App/user path、Codex App runtime evidence、Developer Mode closeout、standard template consumption、external evidence 和 cleanup ledger 只能关闭各自 refs-only gate；它们不能替代 domain production evidence 或 global goal completion。

下一步不应再新增平行总计划。执行 baton 回到 active gap plan；roadmap 继续作为 owner split、runtime substrate、stage-led execution、domain skeleton、language/runtime dependency 和 retirement discipline 的支撑参考。

## 执行语言与依赖结论

从智能体框架本身出发，OPL framework/control plane 的主语言应统一到 `TypeScript`；domain agent 内部执行语言不强制统一。

统一到 `TypeScript` 的范围：

- OPL provider abstraction、Temporal workflow/activity/signal/query adapter、stage attempt ledger、stage-attempt request/projection、human gate、approval/retry/dead-letter、App/API/MCP/CLI bridge。
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
- 旧 Hermes provider/Gateway 路线不再承担目标 session/wakeup substrate、provider、默认 executor、Codex CLI 备线、可选安装模块、provider proof surface 或 readiness path。
- `hermes_agent`、`claude_code` 与 `antigravity_cli` 是 canonical 显式非默认 executor adapter/backend；其他旧 Hermes 引用只属于历史 provenance、诊断语料或负向 guard 语境。
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
- Temporal 把 durable workflow、activity、retry policy、signal/query 和 workflow history 作为可靠执行的基本单元；它是 OPL family runtime provider 的 production required substrate，而不只是参考对象。
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
| `Temporal` | `adopt_as_required_production_substrate` | 它解决长时间 stage attempt 的 durable workflow、activity retry、heartbeat、signal/query、history replay 和 worker crash recovery；这些能力是 OPL production online runtime 的必要条件，由 OPL 自己维护成本高，且正好对应 OPL provider 层。 |
| `OpenAI background mode` | `use_as_executor_pattern_not_provider` | 它证明长任务应 async/pollable，但只覆盖单次模型 response 的后台执行，不替代 family queue、human gate、domain sidecar dispatch 或 cross-domain attempt ledger。 |
| `LangGraph` | `learn_checkpoint_pattern` | 它的 thread/checkpoint/human-in-the-loop 模式值得吸收；但 OPL 的执行原子是 Codex CLI + domain stage，不需要再把 stage 内部拆成 LangGraph node 作为默认 runtime。 |
| `OpenAI Agents SDK` | `learn_handoff_guardrail_trace_pattern` | 它适合 code-first agent app 的 handoff、guardrail、trace；OPL 可吸收这些边界思想，但不把 MAS/MAG/RCA 重写成 SDK-native agents。 |
| `Cloudflare Agents` | `watch_as_actor_runtime_pattern` | 它的 durable object / schedule / stateful agent 模式说明 actor identity 和 wakeup 很重要；但当前 OPL 本机和多仓 runtime 更贴近 Temporal + stage-attempt projection/readback sidecar，不优先迁到 Cloudflare edge runtime。 |
| `Dify / AutoGen / CrewAI / DeerFlow` | `learn_workflow_and_team_pattern` | 它们展示 workflow、agent team、research flow 的组织方式；OPL 不应引入它们作为核心 runtime，避免把 Codex CLI 的强执行器能力降级成轻量 node 编排。 |

依赖进入 `adopt_as_required_production_substrate` 的门槛：

- 能表达 OPL 的 `stage_attempt`、`activity`、`signal`、`query`、`retry/dead-letter`、`heartbeat/checkpoint` 和 `human gate`。
- 能通过 fixture workflow、MAS real paper-line guarded soak、MAG/RCA controlled stage attempt 和 direct skill parity 验收。
- 不要求 domain truth 迁移到 provider history。
- 不要求 MAS/MAG/RCA 放弃 direct app skill path。
- 能在本机开发、CI fixture 和未来 production provider 三种环境下稳定运行或清晰 fail-closed。

因此，Temporal SDK 已作为 OPL production required provider 引入；下一阶段聚焦真实 Temporal server/worker deployment、Codex runner 的生产长时 domain soak 和 domain receipt evidence，不建议同时引入第二个 agent workflow 框架作为 OPL core runtime。

## Framework 上收范围

OPL 的长期职责不是只做“入口聚合”，而是成为完整的智能体运行框架。凡是 domain-neutral、可跨 MAS/MAG/RCA 复用、服务长时间自治和可恢复执行的外围能力，都应进入 OPL framework 或 OPL shared contract。

应上收到 OPL 的能力：

- `stage_attempt ledger`：attempt id、provider kind、workflow id、stage id、workspace locator、source fingerprint、retry budget、human gate refs、checkpoint refs、closeout refs。
- `stage-attempt request/projection`：domain sidecar export 的 pending task projection、dedupe、lease、retry、dead-letter、notification 和 approval transport。
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
  -> stage-attempt request/projection / wakeup / approval / retry
  -> family runtime provider (Temporal required; local provider retired)
  -> domain app skill or domain capability surface
  -> explicit agent executor (Codex CLI default; hermes_agent/claude_code/antigravity_cli opt-in)
  -> domain-owned quality gate / truth reducer / artifact authority
```

OPL 负责：

- domain module discovery 与 skill sync。
- stage descriptor discovery、stage lifecycle receipt 和 handoff envelope。
- stage-attempt request/projection、idempotency key、lease、retry、dead-letter。
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

结构依赖顺序：

1. Provider abstraction freeze：把 OPL family runtime provider 显式收敛为 `temporal`，并声明 readiness、attempt、signal、query、receipt 字段；`local_sqlite` 和旧 `hermes_legacy` provider selection 必须 fail-closed。
2. Temporal stage workflow schema：冻结 `stage_attempt_id`、domain id、stage id、workspace locator、source fingerprint、checkpoint refs、human gate refs、retry budget、closeout refs。
3. Codex CLI activity runner：把 stage prompt/skill/context packet 作为 activity input，输出 typed closeout、artifact delta refs、receipt 和 next owner。
4. Human gate signal/query/projection：把用户修改要求、approval、stop-loss、resume token 与 App 状态查询接入 Signal/Query。
5. MAS paper-line pilot：选择真实 paper line 做 read-only / guarded apply soak，证明 `stage entry packet -> Codex activity -> closeout packet -> router receipt -> progress delta / human gate / stop-loss`。
6. MAG/RCA controlled attempts：用 controlled workspace 或 fixture 证明 grant/visual stage attempt 可复用同一 provider abstraction。
7. Hermes retirement：Temporal provider 通过 readiness、soak 与 direct skill parity 后，Hermes provider / Gateway / proof-provider / readiness / compatibility surface 仅保留 history/provenance/diagnostic source ref、fixture 或负向 guard；不保留 legacy compatibility provider 或可选安装模块。`hermes_agent` executor adapter/backend 按显式非默认 executor 合同保留。

当前读法：普通 product entry / resume、provider-backed family runtime、retired Hermes provider / Gateway / readiness 语境、explicit executor adapter 边界、descriptor/conformance/default-caller readiness 和 production evidence tail 都回到核心五件套、runtime boundary contract、active gap owner、live CLI/read-model 与 history/provenance 读取。本文只保留依赖顺序和 authority boundary；不冻结实现状态、counter、proof snapshot 或 per-domain closeout 数字。

结构质量信号的当前语义也按这个边界执行：`sentrux gate .` baseline drift、`sentrux check .` explicit rules findings 和 line budget findings 默认都作为 advisory，并触发 OPL quality details 输出帮助定位结构变化；只有 `line-budget:strict`、`structure:strict`、`OPL_LINE_BUDGET_STRICT=1` 或 `OPL_STRUCTURAL_QUALITY_STRICT=1` 这类显式维护入口才把结构 findings 升级为 blocking。后续结构治理可以先做 audit、gap projection 和文档同步，不能把 advisory baseline drift 写成阻塞发布的 hard gate，也不能让 line budget / explicit rules 阻断普通开发提交流程。

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

本节只保留当前 roadmap 级缺口。已落地的 stage descriptor、attempt ledger、handoff envelope、human gate、operator projection、domain memory descriptor 和 default-caller replacement read model 不再作为 open structural gap 书写；具体完成度回到 live CLI/read-model 和 active gap plan。

1. 外部 production Temporal server/worker deployment、长窗口 SLO、retry/dead-letter cadence 和真实 domain owner-chain 不退化证据仍需继续证明。
2. MAS 真实 paper-line guarded apply 还需要连续展示 progress delta、human gate / stop-loss、owner receipt 或 stable typed blocker 经 provider-backed attempt 被 OPL/Aion 看到且不越权写 MAS truth。
3. MAG/RCA 仍需真实或 controlled grant/visual long soak、owner receipt / typed blocker / repeated no-regression evidence 和 artifact/memory/lifecycle apply receipt。
4. Domain memory body、accept/reject、artifact mutation authority 和 final verdict 仍必须留在 domain owner；OPL 当前只持有 locator、receipt ref、migration/read-model 和 rejected writeback projection。
5. Repo-source physical skeleton cleanup、legacy manager/vocabulary/default-entry 删除和 compatibility-only test 退役只能在 replacement parity、active caller cutover、owner receipt / typed blocker、no-forbidden-write proof 和 tombstone/provenance refs 都齐后执行；OPL read model 自身不授权 domain repo physical delete。

## 跨仓迁移与退役矩阵

这张表只定义迁移纪律，不替代各仓 `status/project/invariants` 和具体 contract。

| repo / surface | target role | move to OPL | retain in domain | retire / degrade rule |
| --- | --- | --- | --- | --- |
| `one-person-lab` | family agent framework | provider abstraction、Temporal workflow/activity/signal/query、stage-attempt request/projection、attempt ledger、human gate、operator projection、shared descriptor validation | 不持有任何 domain truth | Hermes-first、Gateway、old local-only runtime wording 进入 legacy/diagnostic/history；public help 不再把这些面展示成默认路径；无 active caller 后删除残留 alias。 |
| `one-person-lab` runtime/lifecycle layer | framework runtime substrate | SQLite projection/index patterns、file lifecycle、artifact index、retention、restore proof、migration ledger、workspace lifecycle、provider receipts | 不持有 domain artifact content 或 verdict | 以 MAS 现有经验为 reference implementation，抽象成 OPL shared contract/provider primitive；不恢复 local provider runtime。 |
| `med-autoscience` | medical research domain agent | online wakeup、retry/dead-letter、stage attempt transport、provider readiness、operator workbench projection；framework-generic SQLite/file lifecycle lessons 上收到 OPL | study truth、publication gate、AI reviewer、evidence/review ledger、route decision、artifact/package authority、sidecar receipt refs | 按 `docs/active/opl_temporal_mas_runtime_retirement_program.md` 执行；Temporal/MAS paper soak 前不得删除 local diagnostics。 |
| `med-autogrant` | grant domain agent | grant stage attempt transport、approval/retry/dead-letter、operator projection、standard skeleton adapter | fundability strategy、specific aims、proposal authoring、critique/revision、submission-ready export authority | 旧 local host-agent runtime、Gateway wording、Hermes provider proof 记录只能保留 provenance/evidence；controlled stage attempt 与 skeleton parity 通过后继续物理清理。 |
| `redcube-ai` | visual-deliverable domain agent | visual stage attempt transport、runtime wakeup、operator projection、provider receipt、standard skeleton adapter | visual direction、artifact creation、review/export gate、canonical artifact authority | 旧 Hermes route wording、historical Gateway file names、repo-local managed runtime pilot 只作 migration provenance；direct route / sidecar / stage descriptor parity 后删除默认残留。 |
| `med-deepscientist` | archive / diagnostic / upstream-intake reference | 无 active provider / stage adapter 迁移 | legacy source、fixture、backend audit、parity oracle、explicit restore/import evidence | 不接入 OPL active domain list；只有 MAS 已具备 source provenance、restore/provenance replacement 和 behavior fixture 后再物理删除旧 daemon/WebUI/quest surface。 |

退役顺序固定为：

1. 先让 OPL provider-backed stage attempt 可运行。
2. 再让 OPL framework primitives 承接 MAS 已验证的 lifecycle / artifact / retention / restore-proof 模式。
3. 再让 domain sidecar / direct skill / stage descriptor / standard skeleton adapter 证明语义等价。
4. 再做真实或 controlled soak。
5. 最后删除旧 vocabulary、compatibility alias、旧 manager、重复 UI/manager surface 和非标准目录入口；有 no-active-caller 证据时直接删除或 tombstone，不保留兼容入口。

任何清理如果会降低 direct skill path、domain diagnostics、restore/provenance 或真实 artifact gate 可解释性，应推迟到 provider soak 之后。

## 实施参考压缩

本文不再维护 `Master P0..P5` 或 `Lane 1..7` 形式的 active execution queue。那些小节的逐项状态、已完成清单、待完成清单、proof snapshot、fixture 口径和 per-domain soak 条目已压缩成下面的 capability map；当前执行 baton、open gate 和下一轮 prompt 回到 `docs/active/current-state-vs-ideal-gap.md`，历史过程回到 `docs/history/process/plans/**`。

| capability | 稳定 owner / SSOT | 当前读法 | carry-forward gate |
| --- | --- | --- | --- |
| 基线入口与旧面退役 | 核心五件套、本文、`docs/docs_portfolio_consolidation.md` | OPL stage-led framework 是总路线支撑；旧 Hermes / Gateway / local-manager / MDS-default 只能作为 history、diagnostic、negative guard 或 tombstone。 | 新增总计划、兼容 alias、active helper 或 public wording 前，必须先证明没有第二 truth source。 |
| Temporal provider core | `contracts/opl-framework/family-runtime-online-substrate-contract.json`、`family-runtime-attempt-contract.json`、`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`、source/tests/live CLI | Temporal 是 production online runtime 的必需 substrate；service / worker / residency / SLO / attempt 数值只从 fresh machine surfaces 读取。 | 持续证明 Temporal server/worker lifecycle、retry/dead-letter、signal/query、visibility 和 residency；不得把 provider proof 写成 domain ready。 |
| Codex stage activity runner | `family-runtime-attempt-contract.json`、`src/family-runtime-codex-stage-runner*`、attempt query / App drilldown / focused tests | `Codex CLI` 是默认 concrete executor；typed closeout、source fingerprint、idempotency、authority boundary 和 refs-only projection 是完成边界。 | 真实 domain stage activity soak 必须返回 domain owner receipt、typed blocker、human gate、route-back 或 no-regression refs。 |
| Framework lifecycle primitives | lifecycle / artifact / state-index contracts、workspace/source/delivery policies、source/tests | OPL 只持 locator、index、receipt ref、restore/provenance 和 projection；MAS/MAG/RCA 持有 truth、artifact body、memory body 和 verdict。 | cleanup / restore / retention / physical delete 只能按 domain owner authorization、typed blocker 或 tombstone/provenance refs 前进。 |
| Standard domain-agent skeleton | `standard-domain-agent-skeleton-contract.json`、domain descriptors、`opl agents conformance --family-defaults --json`、domain repo active truth | Skeleton / descriptor / generated-surface readiness 只证明 structural placement 和 boundary 可读，不等于 physical repo-source 重组完成。 | 物理旧面删除必须具备 replacement parity、active caller cutover、owner refs、no-forbidden-write proof 和 provenance。 |
| Human gate / resume | human gate contracts、Temporal provider signal/query surfaces、attempt ledger、App/operator projection | 用户修改、approval、pause/resume/stop 是 provider-level signal / receipt；domain-owned intake 执行实际内容变化。 | OPL 传递 gate 和 handoff envelope，不 patch domain artifacts，不创建 domain receipt。 |
| Operator visibility | `framework readiness`、`app-operator-drilldown`、`evidence-worklist`、runtime ledger | App/CLI 只显示 provider、attempt、route、receipt、typed blocker、dead-letter、rejected writeback 和 next owner refs。 | zero-open worklist 不是完成；positive-open worklist 不是 OPL 可自闭；projection 不能升级为 quality verdict。 |
| Domain soak and retirement | 各 domain active truth owner、domain-owned receipts / blockers / no-regression refs、repo-native verification | MAS/MAG/RCA/OMA 的真实进展只能由 domain owner evidence 关闭；OPL read model 只承载 transport / ledger / projection。 | Direct skill path 与 OPL-hosted path parity 成立后，再按 no-active-caller / owner authorization 退役旧 vocabulary、manager、wrapper、compat tests。 |

旧 implementation 小节中仍有价值的设计词汇已经归入上面的 capability map、核心五件套、Temporal provider 支撑参考、runtime 命名边界、active gap plan 和 history closeout ledger。需要追溯某次 2026-05 / 2026-06 proof 或 closeout 时读 `docs/history/process/plans/`，不要在本 reference 文档中重建逐轮长清单。

## 开发纪律

- 后续流程优化优先调整 domain stage pack、prompt、skill、quality gate 和 descriptor，而不是把领域路线写成 OPL 脚本分流。
- OPL 可以调度、唤醒、恢复、观察和投影；不能生成领域结论、不能替 domain 宣布 ready、不能写 domain truth。
- 任何新 framework 能力必须先回答：这是 durable framework concern，还是 domain expertise concern。
- 若属于 framework concern，进入 OPL shared contract / helper；若属于 domain expertise concern，留在 MAS/MAG/RCA。
- direct skill path 是硬约束，不能为了 OPL 托管而退化。

## 长期 sequencing rules

1. 先把 Stage Attempt Ledger 与 Domain Handoff Envelope 做成最小可用闭环。
2. 再把 Human Gate / Resume 与 Observability 接到 OPL App / CLI。
3. MAS 做真实 paper line soak，MAG/RCA 做 controlled workspace proof。
4. 最后清理旧的机械分流入口，只保留 router/audit/materializer 角色。
