# OPL Family Ideal Operating Model Redesign

Owner: `One Person Lab`
Purpose: `opl_family_ideal_operating_model_redesign`
State: `active_reference`
Machine boundary: 本文是人读顶层重设计与审计标准。机器真相继续归各 repo 的 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker、release artifact 和真实 workspace/App evidence。

## 读法

本文按 `目的反推必要性，MVP 检查阻碍性` 重新评估 OPL 相关 repo 的实际情况，并给出理想目标态设计。它是 north-star / 验收标准，不是 active backlog owner；只保留评估口径、分类标准和目标操作架构说明。它不声明 production ready、domain ready、App release ready、artifact authority ready 或 physical delete 授权。

本文中的 lane、plane、primitive 和 support index 都只能作为验收标签或审计口径使用。需要记录当前 gap、执行 owner、下一步 baton、完成口径或 live evidence intake 时，必须折回 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 或核心五件套；不能在本文维护第二 active backlog、第二 ordinary route、第二 owner queue 或第二 truth source。

SSOT 边界：本文不维护 live evidence intake。理想 operating model 只描述目标结构、owner split、ordinary path、primitive 边界和 forbidden-claim 标准；live / production / release / Brand L5 / owner-chain evidence 的维护入口是 [OPL Family Live Evidence 维护入口](../references/operating-governance/family-live-evidence-maintenance.md)。因此本文不列 App release cohort、provider long-soak、Brand L5 receipt、domain owner receipt、typed blocker、human gate、run id、attempt id 或 dated closeout 流水。


目标态重设：MAS/OPL 的理想形态是 `multi-plane operating system`。核心判断是：更丝滑的 MAS 推进不来自更多默认 worklist、更多 proof 或更厚 preflight，而来自一个 ordinary progress contract 加上彼此分离的 durable runtime、artifact、evidence、decision、observability 和 improvement 平面。所有外部成熟工程经验只作为 pattern source；它们不能成为 OPL 第二 runtime、MAS 第二 truth、第二 selector 或第二 active backlog。

体验轴读法：本文按 `运行流畅度 / 输出质量 / 品牌感` 反推 OPL 基座能力，而不是按现有实现补洞。核心判断是：OPL 的品牌感不是额外命名、配色或宣传页，而是用户在 MAS 这类旗舰智能体中持续感受到 `任务能继续、结果能审、证据能查、阻塞能接、交付能收口`。外部成熟实践只作为 engineering pattern：Kubernetes controller 的 desired/observed 分离、Temporal 的 durable execution、OpenAI Agents 的 handoff/guardrail/tracing、Anthropic 的 routing/parallel/evaluator-optimizer patterns、Carbon / Material 等设计系统的 token 化一致性，都必须折回 OPL 自有 owner boundary、surface budget 和 `current_owner_delta` single ordinary route。

Foldback 读法：read-model wrapper、Agent Lab / OPL Flow / owner-evidence foldback、App drilldown 顶层投影、Runway wrapper、provider long-soak evidence、workspace currentness 和源码维护切片都不改变本文 north-star。当前状态、计数、workspace binding、receipt refs、source split、Runway repair plan 与下一步 owner gate 必须回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)、[OPL 当前状态](../status.md)、核心五件套、contracts、source、tests 和 fresh CLI/read-model。本文只保留审计标准：这些 surface 可以让 owner handoff 更清楚，但不能升级为 domain ready、App release ready、Brand L5 complete、physical delete authorization 或 production ready。

功能/结构优先读法：原“一步到位落地 OPL family ideal operating model”的长期目标不取消，也不降级为文档任务；它的 active 执行解释必须回到 `functional-structure-first-with-live-evidence-deferred`。当前 OPL 基座、read-model wrapper、completion audit contract、App drilldown、Brand L5 refs-only ledger、provider long-soak refs-only ledger、workspace currentness 和结构维护切片首先用于缩短 ordinary path、收薄私有 wrapper、澄清 owner handoff、同步 generated surface 和防 false-ready。MAS current owner identity、readiness current pointer、owner payload summary、unresolved owner gate、Runway repair plan、provider long-soak state、App release/user-path state 和 Brand L5 state 都是 live readout；本文不保存 task/study refs、lineage refs、receipt refs、counter 样本或某次 closeout 判断，也不把 verified refs-only summary 写成 ready claim。真正未闭合的 Live Evidence closure 仍由后置 owner lane 折回 domain/App/brand/runtime owner：domain owner-chain scaleout、Brand L5、App release verdict、provider long-soak / recovery / dead-letter、private platform physical delete decision、memory/artifact/lifecycle receipt。本文只能保留 north-star 和审计标准；执行目标、owner repo、accepted ref shape、验证命令和下一步 baton 必须折回 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

Owner-route / currentness 审计口径：current-control residue、accepted closeout evidence、domain-owned typed blocker ref、provider attempt state、managed execution envelope、domain-owned `current_work_unit` / `current_execution_envelope`、Runway repair readout 和 provider long-soak readout 必须分开读。Ordinary progress 只从 managed current owner delta / execution envelope 推进；raw workstream、default-executor dispatch、provider current-control residue、evidence worklist、worker restart guard、attempt repair queue 和 provider capability observation 都进入 full-detail provenance、route-back、repair 或 owner-needed work order。它们不能覆盖 live managed envelope，不能由 OPL 写成 domain owner answer，也不能抢占 production-tail owner gates。

本文的“已落地”只表示 ideal operating model 的审计标准已经被 current-state/status/contracts/tests 消费，不能表示 runtime closure。后续新增内容进入本文的条件是它改变 north-star、体验合同、外部成熟实践吸收分类、plane/primitive 责任边界或 forbidden-claim 标准；如果只是 fresh readout、owner gate 状态、receipt refs、worktree closeout、测试结果、release 证据或具体下一步执行顺序，必须写入 `current-state-vs-ideal-gap.md`、`docs/status.md`、history、runtime ledger 或对应 owner repo。本文允许声明 `active_reference_current`；不允许声明 `owner_gate_closed`、`current_pointer_closeout_done`、`App_release_ready`、`Brand_L5_complete`、`provider_long_soak_complete`、`physical_delete_authorized`、`memory_or_artifact_ready` 或 `production_ready`。

评估范围：

- Core repos: `one-person-lab`、`one-person-lab-app`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`。
- Support repos: `opl-aion-shell`、`opl-doc`。它们是 implementation / governance support，不是 Foundry Agent truth owner。

当前 gap、gate、next action 和执行顺序的唯一 active owner 是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。目标操作架构回到 [OPL Foundry Agent Target Operating Architecture](./opl-foundry-agent-target-operating-architecture.md)。本文件只承载顶层重设计判断、跨仓优化方向和审计标准。

## 结论

理想 OPL family 不是更多 status、worklist、proof lane、wrapper 或 support shell，而是更薄、更可接力的 agent platform：

```text
User purpose
  -> App cockpit
  -> current_owner_delta
  -> Foundry Agent ordinary golden path
  -> stage attempt with Codex executor
  -> stage artifact unit
  -> independent gate / domain owner answer
  -> passive evidence ledger and diagnostic drilldown
```

统一优化方向：

```text
Purpose-first necessity
  keep only what moves owner delta, protects authority, or preserves auditability

MVP-first obstruction check
  demote or retire anything that delays artifact delta, owner answer, or typed blocker

OPL base optimization
  generated/hosted surfaces + durable runtime + passive audit + App cockpit
```

更理想的 MAS/OPL 顶层读法是：

```text
User purpose
  -> Ordinary Progress Contract
  -> Stage Artifact Unit
  -> Domain Authority Kernel
  -> next current_owner_delta

supporting planes:
  Pack / Stagecraft / Runway / Ledger / Console / Foundry Lab / Connect
```

这意味着 OPL 只把普通路径做短、把恢复路径做稳、把证据路径做清楚；MAS 只把医学研究 owner answer、publication quality、artifact authority、typed blocker 和 human gate 做准。OPL 不能替 MAS 写 owner receipt，MAS 也不再保留 generic scheduler、queue、attempt loop、status shell 或第二 workbench。

后续最重要的优化不是继续补 core primitive，而是执行三种动作：

- `meets_target`: 默认路径更短，owner 更清楚，artifact / receipt / blocker 更可接力。
- `needs_demotion`: 有诊断、审计、history、support 或 production hardening 价值，但不应进入 ordinary App/CLI/operator path。
- `needs_retirement`: 已被 generated/hosted surface、App contract 或 domain authority function 替代，应走 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 删除门。

## 2026-06-12 Ideal Experience Redesign

本节只定义理想体验合同和基座优化方向，不维护 active backlog。所有执行 owner、live gap 和验证口径继续折回 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

### 1. 运行流畅度

理想 OPL 的体感应像一个专业团队的持续工作台，而不是一个需要用户理解 runtime ledger 的控制台。普通用户和 operator 只看到四件事：当前目标、当前 owner、这轮要产出的 delta、接受的返回形状。平台内部的 provider、attempt、lease、evidence、long-soak、cleanup、release cohort 和 L5 work order 都在后台保持可追溯，但不抢占默认路径。

流畅度目标合同：

| 体验目标 | OPL 基座职责 | MAS 旗舰体现 | 不能做成 |
| --- | --- | --- | --- |
| `one_continue_button` | `Console` 从 fresh `current_owner_delta` 生成唯一 Continue / Review / Ask / Repair / Park action。 | DM study / paper line 一键进入下一次 paper、analysis、review 或 typed blocker delta。 | route menu、worklist browser、provider trace browser。 |
| `durable_autonomy` | `Runway` 用 Temporal-backed StageRun 保持 resume、retry、dead-letter、human gate 和 repair。 | 长论文线不因 worker 重启、网络失败或上下文切换丢进度。 | MAS 私有 scheduler、daemon、第二 attempt loop。 |
| `artifact_first_progress` | `Workspace` 物化 Stage Artifact Unit，T0/T1/T2/T3 分层。 | 用户能打开 evidence map、analysis pack、manuscript draft、review letter、revision packet。 | 用 receipt count、provider completion 或 schema pass 代替论文进展。 |
| `jit_readiness` | readiness 只在当前 delta 需要时升级；缺口变成 route-back / typed blocker / next owner delta。 | 写作、分析、review 不被全量 readiness inventory 卡住。 | 先补齐所有 preflight 才允许继续工作。 |
| `anti_spin` | repeated receipt-only / reconcile-only / stale-redrive-only 进入 advisory lineage 与 owner-route readback，不直接冻结 launch。 | MAS 若没有 paper/evidence/reviewer/gate delta，由 domain owner明确返回 typed blocker 或 human gate。 | 用平台重复计数替代 Stage Kernel hard gate 或 domain owner answer。 |

理想状态下，`Runway Progress Reconciler` 每次只允许输出一个普通结论：继续执行、等待 owner、请求 human gate、执行 OPL repair、记录 typed blocker、或把证据留在 sidecar。它不能从 raw evidence 自己生成 MAS 下一步。

### 2. 输出质量

理想 OPL 不把质量写成机械 checklist，也不把质量全交给一次 self-review。它应把 `执行 attempt`、`独立 gate attempt` 和 `owner answer` 分开，让更强的 AI executor 有足够空间创作、比较、审阅和修订，同时让质量结论回到 domain owner。

输出质量目标合同：

| 质量层 | 产物 | Gate owner | OPL 持有 | 禁止外推 |
| --- | --- | --- | --- | --- |
| `authoring_quality` | draft / analysis / visual / grant section。 | domain stage owner。 | prompt/skill/knowledge/tool affordance refs、attempt ledger、artifact refs。 | schema complete 等于质量通过。 |
| `independent_review` | reviewer receipt、critique、revision request。 | independent AI reviewer / human reviewer / domain quality owner。 | isolated attempt record、handoff refs、review packet refs。 | 同一上下文自审自批后直接 close。 |
| `evidence_quality` | source lineage、analysis replay、negative check、artifact diff。 | domain evidence / source authority owner。 | refs-only Ledger、restore/provenance、trace/span correlation。 | Ledger verified 等于 publication ready。 |
| `delivery_quality` | manuscript package、submission package、deck export、grant package。 | domain export / release / human owner。 | package/export lifecycle shell、safe action、owner payload transport。 | package exists 等于可提交。 |
| `production_quality` | L5 evidence、long-soak、release/install、owner acceptance。 | module / App / domain owner。 | refs-only ledger、work order projection、no-second-truth guard。 | verified ledger 等于 L5。 |

MAS 作为旗舰智能体的目标质量形态是 `medical research quality kernel`：source truth、study design、analysis validity、manuscript argument、journal fit、AI reviewer verdict、revision delta 和 publication handoff 都有独立 artifact / receipt / blocker。OPL 只负责让这些 stage 可启动、可恢复、可审计、可接力；医学结论、paper quality、artifact authority 和 publication readiness 仍归 MAS。

质量提升应优先采用三种 AI 原生模式：

- `parallel_review`: 对同一 artifact 进行方法学、统计、叙事、clinical relevance、journal fit 分面 review，然后由 domain owner 合成 owner answer。
- `evaluator_optimizer`: authoring attempt 产出 draft，review attempt 给出 critique，revision attempt 生成 delta，直到 owner gate 接受或 typed blocker。
- `route_by_quality_risk`: 低风险文本修订走轻 gate，高风险分析、结论、submission、release 走独立 reviewer / human gate。

### 3. 品牌感

OPL 的品牌感应从产品行为里长出来：用户每次看到的词、状态、按钮、产物、证据、阻塞和交付动作都一致，并且和 `One Person Lab = hosted professional team for complex knowledge work` 对齐。品牌系统不能停在模块名或视觉 token；它必须成为 product grammar、App cockpit、CLI wording、artifact naming、receipt/blocker language 和 L5 evidence 的共同合同。

品牌目标合同：

| 层 | 用户看见什么 | 机器锚点 | 品牌失败信号 |
| --- | --- | --- | --- |
| `product_layer` | `OPL Framework -> One Person Lab App -> Foundry Agents`。 | core docs + brand system profile。 | 用户被迫理解 repo split、provider、executor selector。 |
| `foundry_line` | Research / Grant / Presentation / Agent Foundry 等专业线。 | domain descriptor + product pack。 | MAS/MAG/RCA 像脚本集合而不是专业智能体。 |
| `module_language` | Charter / Atlas / Workspace / Pack / Stagecraft / Runway / Ledger / Console / Foundry Lab / Connect。 | brand module registry + L5 evidence contract。 | 模块名只出现在 docs，不影响 App/CLI/contract/ownership。 |
| `status_language` | Continue、Review、Waiting for owner、Typed blocker、Ready to deliver、Needs human decision。 | current owner delta + owner answer shape。 | 用 provider completed、ledger verified、worklist count 当用户状态。 |
| `visual_language` | tokenized color/type/icon/status/card pattern；专业、安静、可扫描。 | brand-system-profile + App design tokens。 | 每个 surface 自己发明颜色、卡片、文案和状态名。 |
| `evidence_language` | user path、cross-agent scaleout、long-soak、release/install、owner acceptance。 | Brand L5 evidence matrix。 | 把 docs foldback、contract pass 或 CLI governance 当品牌成熟。 |

MAS 的旗舰品牌感应落在 `Research Foundry` 的完整 journey，而不是“能跑医学脚本”：

```text
Question / study intent
  -> Source cohort and evidence map
  -> Analysis pack
  -> Manuscript draft
  -> Independent reviewer letter
  -> Revision packet
  -> Publication handoff
  -> MAS owner receipt / typed blocker / human gate
```

App 和 CLI 都应使用同一套专业名词，但保持用户面简洁：普通用户看到 `Evidence Map`、`Analysis Pack`、`Manuscript Draft`、`Reviewer Letter`、`Revision Packet`；developer/operator drilldown 才看到 StageRun、source fingerprint、idempotency、lease、Temporal workflow 和 refs-only ledger。

### 4. OPL 基座优化

为了支撑以上三轴，OPL 基座的理想能力应从“更多 surface”转为“少数强 primitive”：

| Primitive | 为什么需要 | 验收口径 |
| --- | --- | --- |
| `OwnerDeltaController` | 让所有默认入口只问当前 owner 欠什么。 | `framework readiness`、App fast state、operator drilldown、work order summary 同源 current owner delta。 |
| `RunwayControlLoop` | 把长跑、恢复、retry/dead-letter、human gate 放到 durable substrate。 | provider failure 不丢 StageRun；repair 输出 OPL runtime blocker，不写 domain truth。 |
| `StageArtifactKernel` | 让进展以 artifact / manifest / pointer / owner answer 接力。 | T0/T1/T2/T3 分层清楚，platform repair 不混成 paper progress。 |
| `QualityGateRuntime` | 让执行、审核、修订、owner answer 分离。 | review attempt 独立，receipt/blocker 可绑定 StageRun / artifact / source fingerprint。 |
| `BrandExperienceProfile` | 让品牌系统从文案和视觉进入合同。 | App/CLI/docs/status/card/token/receipt wording 从同一 profile 派生。 |
| `PassiveEvidenceLedger` | 让证据完整但不驱动默认计划。 | `record everything, plan from current_owner_delta` 成为回归门。 |
| `L5EvidenceRouter` | 让品牌成熟度可接力而不误闭合。 | 每个 module requirement 有 owner、accepted refs、record/verify、false-authority guard。 |
| `AgentProductPackCompiler` | 让新 Foundry Agent 从 pack 生成 surface，而不是复制历史 wrapper。 | CLI/MCP/Skill/App/status/workbench 派生一致，domain repo 只保 semantic pack + authority functions。 |

这组 primitive 的共同验收标准是：它们减少普通路径心智负担，同时增强审计、恢复和质量边界；任何 primitive 若只能增加计数、展示更多 refs 或解释历史，而不能缩短 owner delta、保护 authority、物化 artifact、承载 durable execution 或支撑 owner gate，就应降为 diagnostic / support / history。

## 外部成熟实践吸收

本轮只吸收成熟工程原则，不引入外部 runtime truth。

| 外部经验 | 分类 | OPL/MAS-native 吸收 | 禁止升级 |
| --- | --- | --- | --- |
| [Kubernetes controller / operator](https://kubernetes.io/docs/concepts/architecture/controller/) | `adopt_contract` | `current_owner_delta` / stage pack 是 desired state；attempt、provider、worklist、evidence 是 observed state；`Runway Progress Reconciler` 只输出唯一下一 safe action、owner/gate wait 或 OPL runtime blocker。 | Reconciler 不生成 MAS goal、owner receipt、typed blocker 或 quality verdict；observed status 不成为 domain truth。 |
| [Temporal durable execution](https://docs.temporal.io/temporal) / [Event History](https://docs.temporal.io/encyclopedia/event-history/) / [Signals, Queries, Updates](https://docs.temporal.io/encyclopedia/workflow-message-passing) | `adopt_contract` | `Runway` 持有 durable execution substrate、workflow history refs、task queue、retry/dead-letter、signal/query/update、human-gate transport 和 recovery repair。 | Temporal history、worker health、provider completion 和 repair success 不关闭 MAS stage、publication ready、domain ready 或 L5。 |
| [Dagster software-defined assets](https://docs.dagster.io/api/dagster/assets) / [asset checks](https://docs.dagster.io/api/dagster/asset-checks) | `adopt_template` | `Stage Artifact Unit` 成为可接力资产单元：artifact key、upstream refs、materialization receipt、owner、check refs、freshness / current pointer 分开。 | Asset check 只能影响 artifact / quality gate lane；OPL 不把 check pass 写成 domain verdict。 |
| [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) / [semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/) | `adopt_template` | `Ledger` 与 `Console` 使用统一 telemetry vocabulary：trace、metric、log、baggage、resource、stage_attempt、owner_delta、artifact_unit、domain_ref。 | Telemetry 只做 observability、debug、L5 drilldown；trace/metric/log 不生成默认 next action。 |
| [LangGraph durable/stateful agents](https://docs.langchain.com/oss/python/langgraph/overview), [persistence](https://docs.langchain.com/oss/python/langgraph/persistence), [human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) | `adopt_template` | 只吸收 checkpoint、pause/resume、human approval/edit/reject/respond、thread state 和 HITL policy shape，用于 OPL human gate 与 StageRun resume 设计。 | 不引入 LangGraph runtime；checkpoint / memory 不成为 MAS truth 或 App default plan root。 |
| [MLflow Tracking](https://mlflow.org/docs/latest/ml/tracking/) / [Dataset Tracking](https://mlflow.org/docs/latest/ml/dataset/) 与 [DVC dvc.yaml](https://doc.dvc.org/user-guide/project-structure/dvcyaml-files) | `adopt_template` | run metadata、params、metrics、artifact refs、dataset lineage、fingerprint、stage deps/outs 进入 MAS research provenance 和 Ledger refs-only lineage。 | MLflow/DVC run 成功不等于 paper progress；dataset lineage 不替代 MAS source truth 或 reviewer/publication gate。 |
| [OpenAI Agents SDK handoffs](https://openai.github.io/openai-agents-python/handoffs/), [guardrails](https://openai.github.io/openai-agents-python/guardrails/) 与 [tracing](https://openai.github.io/openai-agents-python/tracing/) | `adopt_template` | handoff、guardrail、trace 的分层词汇进入 Stagecraft / Console / Ledger；handoff payload 必须绑定 owner answer shape。 | Handoff 不是 owner receipt；guardrail pass 不是 quality verdict；trace 不是 progress truth。 |
| [Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | `adopt_template` | routing、parallelization、orchestrator-workers、evaluator-optimizer 等模式只作为 Stagecraft 的 AI-first stage strategy refs；用于 MAS independent review、parallel review 和 revision loop。 | 不把这些模式编译成 OPL 固定 workflow script；strategy refs 不替代 domain quality gate。 |
| [Backstage golden paths](https://backstage.io/docs/golden-path/create-app/) / platform engineering | `adopt_template` | OPL App 只给每个 Foundry Agent 一条 ordinary route；variants、proof、debug、cleanup、release/soak 都显式进入 developer/detail lane。 | 不把平台 catalog 或 template 变成第二 workflow engine。 |
| [Carbon Design System tokens](https://carbondesignsystem.com/elements/color/tokens/) / [Material Design tokens](https://m3.material.io/foundations/design-tokens/overview) | `adopt_template` | `BrandExperienceProfile` 把颜色、状态、图标、卡片、文案和 evidence language token 化；App、CLI、docs 和 Foundry Agent surfaces 从同一品牌合同派生。 | design token validation 不声明 App release ready、Brand L5、domain ready 或 production ready。 |
| [Google SRE toil](https://sre.google/sre-book/eliminating-toil/) / DORA feedback metrics | `adopt_template` | receipt-only、reconcile-only、stale-redrive-only、count-accounting-only 进入 anti-spin / stop-loss；L5 看 lead time、owner-answer latency、blocked recovery、release/user-path pass。 | 活动量、counter、open worklist 和 verified ledger 不作为完成证明。 |

这些原则合在一起给出一个架构判断：OPL 应像 `platform golden path + durable controller + passive observability`，而不是把 agent runtime 做成工作流脚本、ledger browser 或多 backend launcher。

## Cross-Repo Current Assessment

| Repo | 当前更接近目标的部分 | 仍可优化的面 | 分类 |
| --- | --- | --- | --- |
| `one-person-lab` | `current_owner_delta` root、Temporal provider、stage attempt、Stage Artifact Unit、Tool Affordance Boundary、single golden path、wrapper retirement gate 已进入主干，default summary / compact alias 复活有 guard。 | 仍需长期守住 no-resurrection；raw count、blocked envelope、typed-blocker group 和 replay count 只能留在 diagnostic/full-detail。 | `meets_target` |
| `one-person-lab-app` | Codex wrapper、purpose entries、fast state、Runtime owner-action default、ordinary cockpit surface budget、first conversation warmup、Full runtime native trust / release-boundary gate、release typed-blocker path contract guard 和 release readiness false-positive guard 已明确。 | Release proof、operator evidence bundle 和 cohort evidence 只能留在 release/developer detail；普通 cockpit 不外推 App release ready。 | `meets_target` |
| `med-autoscience` | MAS 已是 Research Foundry pack；owner-route/currentness/read-model 修复更清楚地把 paper-line authority 留在 MAS。 | 平台 repair、read-model currentness、storage/index maintenance、gate replay routing 和 liveness arbitration 仍不能写成 research progress；真实 paper owner receipt / reviewer receipt / publication gate 仍是 evidence tail。 | `meets_target` |
| `med-autogrant` | Grant pack、submission-ready human gate、purpose-first adapter thinning、OPL runtime owner boundary 清楚；stale specs lifecycle 叙事已降到 docs/provenance。 | product/status/user-loop/domain-handler/grouped CLI shell 只作为 retained deletion-gate candidate / domain cleanup surface 读取；submission gate 和 physical delete 只能由 human/MAG owner receipt 或 MAG typed blocker 关闭。 | `needs_retirement` |
| `redcube-ai` | RCA visual pack、image-first path、Stage Artifact adoption、review/export authority、production acceptance refs shape 强；retained wrapper 审计已有 delete-auth false / safe-to-delete false guard。 | session/domain_action_adapter/runtimeWatch/operator projection 和 route variants 仍有 tail；long-soak / no-regression 是真实 production evidence tail。 | `needs_retirement` |
| `opl-meta-agent` | OMA 边界已经防止第二 Framework：只产出 candidate package、work order、mechanism proposal 或 typed blocker；script-to-pack 和 developer work-order policy 已归入 contract-backed projection。 | 新增或继续稳定下来的 policy 继续迁入 `agent/`、contracts、authority functions 或 OPL primitive；保留脚本只能作为 refs/smoke/work-order/helper。 | `meets_target` |
| `opl-aion-shell` | Shell boundary 已声明只实现 App-owned contracts；Runtime bridge 默认消费 `opl app state`；ACP initial message warmup 与 Full runtime payload trust 已落地。 | Root/upstream shell叙事和 implementation detail 仍需防止反向定义 OPL/App/domain truth；legacy IPC / migration path 走 deletion gates。 | `meets_target` |
| `opl-doc` | Doctor / native profile / family-plan 的 no-authority boundary 清楚，README/usage/invariants 已强化 support repo 不进入 Foundry Agent truth set。 | 风险是把 doctor clean、profile sync 或 family-plan 当 truth/readiness；应保持 workflow steward 定位。 | `meets_target` |

## Ideal Top-Level Redesign

### 0. Multi-Plane Operating System

理想 OPL/MAS 不应把所有状态塞进一个默认状态机。应把推进系统拆成九个平面，每个平面有单一 owner、单一输入和明确 forbidden claims：

| Plane | OPL 主模块 | 输入 | 输出 | 不拥有 |
| --- | --- | --- | --- | --- |
| `purpose_pack_plane` | `Pack` + `Stagecraft` | Domain Declarative Pack、stage goal、prompt/skill/knowledge/tool refs、quality gate refs。 | 可启动 stage pack、accepted answer shape、tool affordance boundary。 | domain truth、review verdict、artifact body。 |
| `ordinary_progress_plane` | `Console` + `Stagecraft` | fresh `current_owner_delta`、current stage goal、owner answer requirement。 | default next owner、required delta、accepted answer shape、hard gate。 | raw worklist planning、provider trace planning。 |
| `stage_artifact_plane` | `Workspace` | stage output refs、manifest、hash、lineage、role artifact。 | `Stage Artifact Unit`、current pointer、handoff-ready refs。 | artifact quality verdict、publication/export approval。 |
| `durable_runway_plane` | `Runway` | requested stage、provider profile、human gate refs、owner route refs。 | attempt transport、provider observation、quality-budget accounting、failure diagnostic、repair action。 | semantic route、owner receipt、typed blocker、domain completion。 |
| `authority_decision_plane` | domain kernel + human gate | artifact unit、review refs、source fingerprint、currentness identity。 | owner receipt、quality gate receipt、typed blocker、human gate receipt、route-back evidence。 | generic runtime repair、provider liveness。 |
| `evidence_telemetry_plane` | `Ledger` | trace、metric、log、receipt refs、provenance, lineage。 | refs-only evidence index、L5 drilldown、audit packet。 | default next action、body storage、quality verdict。 |
| `reconciler_plane` | `Runway` + `Console` | desired owner delta、observed attempt/provider/receipt/gate refs。 | exactly one safe action、owner/gate wait、OPL repair blocker。 | domain goal generation、artifact mutation。 |
| `app_cockpit_plane` | `Console` + App | current owner delta projection、artifact/blocker refs、safe actions。 | Start / Continue / Review / Open artifact。 | GUI release verdict之外的 product truth、domain truth。 |
| `improvement_plane` | `Foundry Lab` + `OMA` | eval refs、failure evidence、owner feedback、no-regression refs。 | developer work order、mechanism patch proposal、typed blocker。 | target-agent acceptance、promotion authority。 |

这九个平面的关系固定为：ordinary progress plane 是默认用户路径；durable runway plane 只保证执行可恢复；stage artifact plane 保证结果可接力；authority decision plane 才能关闭领域进度；evidence telemetry plane 只提供可追踪性；improvement plane 只产出可审核 work order。

### 1. OPL Framework Base

OPL 基座应收敛成 9 个稳定 primitive：

```text
owner-delta-controller
stage-attempt-runtime
stage-artifact-kernel
agent-product-pack-compiler
generated-surface-host
passive-evidence-ledger
app-state-action-producer
agent-lab-improvement-loop
human-owner-decision-gate
```

| Primitive | 持有职责 | 不持有 |
| --- | --- | --- |
| `owner-delta-controller` | desired/current reconcile、next owner、accepted answer shape和 identity/authority/currentness hard gate；重复 lineage 只做 advisory。 | domain goal generation、quality verdict、artifact authority或基于重复计数的 launch freeze。 |
| `stage-attempt-runtime` | provider binding、attempt currentness、Codex executor launch、quality budget、failure diagnostic、retry/dead-letter。 | semantic route、stage 内认知策略、domain judgment。 |
| `stage-artifact-kernel` | physical output、manifest、hash、owner answer、current pointer、lineage。 | artifact body verdict、publication/export/visual quality。 |
| `agent-product-pack-compiler` | domain pack、stage refs、tool affordance、quality gate refs、golden path profile。 | domain-specific truth 或 private runtime loop。 |
| `generated-surface-host` | CLI/MCP/App/status/workbench/default-caller shell。 | domain repo wrapper compatibility。 |
| `passive-evidence-ledger` | raw evidence、trace、replay、typed blocker group、long-soak、cleanup provenance。 | default planning root。 |
| `app-state-action-producer` | App fast/full state、safe action shell、operator payload handoff。 | GUI product release authority 或 domain truth。 |
| `agent-lab-improvement-loop` | eval refs、root cause、work-order candidate、risk-tier promotion evidence。 | target owner receipt、domain truth、memory/artifact body。 |
| `human-owner-decision-gate` | approval/edit/reject/respond、quality reviewer handoff、release owner decision、physical delete owner decision。 | 隐式批准、silent fallback、provider-completion-to-domain-ready。 |

基座优化方向：

1. 默认 CLI/App/operator summary 改为 owner-delta-only；raw count 只在 `--detail full`。
2. 所有 new surface 必须先走 surface budget，默认分类为 diagnostic/reference。
3. `compact_owner_delta_projection` 从 active/default surfaces 退役，文档和 App contract 只首选 `current_owner_delta`；审计尾项进入显式 `current_owner_delta_read_model`。
4. generated surfaces 成为 CLI/MCP/status/workbench/default-caller 的默认承载；domain repo retained wrapper 只作为 deletion-gate candidate / domain cleanup surface 读取。
5. passive evidence ledger 坚持 `record everything, plan from nothing`。

### 2. One Person Lab App

App 理想形态是 `Codex App wrapper + Foundry Agent cockpit`：

- Home：purpose entry，不是 plugin/backend/agent selector。
- Runtime：task/stage/owner/action，不是 ledger browser。
- Settings：App profile、access、agents/capabilities、local environment、appearance、advanced、about/update，不暴露 ordinary backend/provider selector。
- Release：cohort-bound evidence，不外推到 family production ready。

优化方向：App 普通路径只展示 `purpose -> task -> current_owner_delta -> owner action`。Shell candidate、AionUI upstream detail、provider trace、release proof、full drilldown 都下沉为 diagnostics / release / developer detail。GUI 路线按 App owner policy 固定为 AionUI 主线、`opl-native-workbench` foreground alternative、Hermes Desktop / `hermes-codex` retained explicit reference candidate、AGUI / `agui-codex` archived technical proof；除非用户明确要求 AGUI，AGUI 不再进入默认优化、验证、polish、release 或 adoption 路线。后续按本文推进功能面缺口时，任何来自 AGUI proof 的 UI、WebUI、adapter 或 smoke 待办都只能作为历史 replay 输入读取，不能转化为 OPL App 的默认开发 lane。

### 3. MAS / MAG / RCA / OMA

四个 Foundry Agent 的理想共同形态：

```text
agent/
contracts/
runtime/authority_functions/
minimal src/native helpers
docs/tests
```

| Agent | 默认 owner delta | 长期 authority | 应退役 / 下沉 |
| --- | --- | --- | --- |
| MAS | paper/evidence/reviewer/human-gate delta or MAS typed blocker | study truth、publication quality、artifact/package/memory authority、AI reviewer/auditor receipt。 | progress portal internals、read-model repair、storage compaction、MDS/runtime provenance 默认化。 |
| MAG | grant authoring/fundability/export/submission delta or MAG typed blocker | grant truth、fundability/quality/export/submission gate、package/memory authority。 | grouped CLI shell、product/status/user-loop/domain-runtime wrapper、Hermes proof lane 默认化。 |
| RCA | image-first artifact/review/export delta or RCA typed blocker | visual truth、review/export verdict、artifact/visual memory authority、native helper implementation。 | session/runtimeWatch/domain_action_adapter wrapper、HTML/native PPTX route variant 默认化、identity alias authority。 |
| OMA | target-agent candidate/work-order/mechanism delta or typed blocker | agent-building semantics、work-order policy、candidate/proposal authority。 | second Agent Lab、promotion gate owner、worktree lifecycle owner、registry/App shell、script runner growth。 |

MAS 的理想普通路径还需要单独强调：

```text
Medical Research Pack
  -> Study / source truth envelope
  -> Analysis Stage Artifact Unit
  -> Manuscript Stage Artifact Unit
  -> Independent AI reviewer / publication quality gate
  -> Revision / package handoff
  -> MAS owner receipt / typed blocker / human gate
  -> next current_owner_delta
```

OPL 对 MAS 的进一步优化重点不是再补 MAS 私有推进器，而是让 `current_owner_delta`、StageRun observation、Stage Artifact Unit、failure/negative-result diagnostic、source fingerprint、publication quality gate 和 owner answer refs 形成单一可接力路径。任何 stage 结果都可成为下一 stage 输入；质量债只关闭 publication/ready 声明。

2026-07-12 implementation foldback：旧 provider attempt identity 已重命名为 provider attempt identity，只用于 currentness / dedupe。StageRun 不再要求 closeout binding 或 execution authorization；缺 receipt、manifest、review 或可读输出时生成 progress/failure diagnostic 与质量债，Codex 仍可推进、跳转、重复或 route-back。owner evidence 只决定 domain-ready / publication-ready 等声明。

2026-07-12 implementation foldback：StageRun provider attempt identity 只用于 dedupe/currentness。`stage_packet_ref`、receipt、manifest、scope 或 source fingerprint 缺失会禁用 stale reuse并形成诊断，但不阻止 Codex 启动任意 declared stage；identity 冲突仅防止写入错误目标。

### 4. Support Repos

`opl-aion-shell`、`opl-agui-codex-shell` 和 `opl-doc` 不进入 Foundry Agent core truth set。

- Shell：AionUI shell 是当前 App GUI 主线，只实现 App contract；`opl-native-workbench` 是 foreground alternative；Hermes Desktop 是 retained explicit reference candidate；AGUI shell 只保留为 archived technical proof / explicit replay provenance，不做默认更新或完善。上游 AionUI detail 是 implementation material。
- OPL Doc：只做 workflow steward / doctor / profile sync；doctor clean 不是 truth clean。

## Redesign Support Index

本节只保留理想 operating model 对 active owner baton 的设计含义。当前状态、下一步 owner、证据缺口和 closeout 口径回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)，避免本文成为第二份 active plan。表内 `Lane` 是验收标准标签，不是本文件维护的待办队列。

| Lane | Target reading | Acceptance standard |
| --- | --- | --- |
| `multi_plane_os_split` | 默认推进、durable runtime、artifact、authority decision、telemetry、reconciler、App cockpit 和 improvement 平面分离。 | ordinary path 只从 `current_owner_delta` 推进；其他平面只能提供 refs、safe action、owner gate 或 audit drilldown。 |
| `summary_de_noise` | OPL default summaries owner-delta-only，raw counts 只作 diagnostic-only。 | ordinary summary 不以 worklist/replay/blocked envelope count 作为 next-action root。 |
| `current_owner_delta_cutover` | 默认命名和 payload root 都说 `current_owner_delta`，`current_owner_delta_read_model` 只承载显式 audit/full-detail refs。 | `compact_*` 只在 history / negative guard 中出现，不能成为 default planning root 或 active compatibility alias。 |
| `domain_wrapper_delete_gate` | retained wrapper 逐项 delete/tombstone；delete-auth false / safe-to-delete false guard 防止 premature physical delete。 | no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance machine-readable。 |
| `real_owner_delta_tail` | production evidence tail 必须回到 domain owner answer，不用平台 repair 或 docs/provenance 替代；OPL 只用完整 StageRun currentness identity 保护 route/currentness，不用通用 idempotency、旧 dispatch、provider completion 或 read-model refresh 伪造 progress。 | 真实 paper/grant/visual/target-agent owner receipt、typed blocker、human gate、review/export receipt 或 no-regression ref。 |
| `owner_route_residue_separation` | managed execution envelope、current owner delta、provider attempt current-control residue 和 accepted closeout evidence 分开读。 | executable owner action 需要 owner delta / receipt / typed blocker；旧 typed blocker residue 只能做 audit/currentness evidence，不能覆盖 current pointer。 |
| `app_contract_compaction` | App ordinary path contract 收薄，并由 active-shell / release-boundary guard 检查。 | Home/Runtime/Settings 只显示 purpose、task status、next owner、artifact/blocker、release facts；release detail 只在 release/developer/detail 语境。 |
| `oma_script_to_pack_hygiene` | Stable scripts 迁到 `agent/`、contracts、authority functions 或 OPL primitive；保留脚本只能是 refs/smoke/work-order/helper。 | 新增或收薄脚本必须更新 machine gate。 |
| `support_entry_clarity` | Shell/doc support repo 只做 implementation carrier / workflow steward。 | support repo 不反向定义 OPL/App/domain truth，并持续防止 implementation detail 或 doctor-clean 变成 readiness。 |

## Audit Standard

每次评估按下面问题给结论：

1. `multi_plane_split`: 新设计是否把 progress、runtime、artifact、decision、telemetry、App 和 improvement 平面分清。
2. `default_path`: 普通路径是否从 `current_owner_delta` 开始。
3. `progress_truth`: 是否只有 artifact + manifest + owner answer + current pointer 算 progress。
4. `mvp_friction`: 是否减少 receipt/reconcile/proof/status 循环。
5. `authority_boundary`: 是否保持 domain verdict 和 artifact authority 在 domain repo。
6. `surface_budget`: 新 surface 是否真有 default 资格。
7. `golden_path`: 每个 agent 是否只有一个 ordinary route。
8. `wrapper_retirement`: 被替代 wrapper 是否进入删除门。
9. `app_cockpit`: App 是否是 cockpit，而不是 ledger browser。
10. `evidence_ledger`: evidence 是否 passive，不能直接 plan。
11. `human_owner_gate`: human / domain owner decision 是否显式产出 receipt、typed blocker、human gate 或 route-back evidence。

输出只允许三类：`meets_target`、`needs_demotion`、`needs_retirement`。

禁止用 `test pass`、`conformance pass`、`verified ledger`、`doctor clean` 或 `open_worklist=0` 单独关闭设计 gap。

## Execution Discipline

为了提高落地效率，凡任务互不冲突、写集可隔离、source of truth 清楚，且不会阻断当前 critical path，默认允许用 subagent + 独立 worktree 并行推进审计、实现、验证或 docs foldback lane。每条 subagent lane 必须写清任务、cwd、权限、source of truth、停止条件和禁止范围；主会话负责核查 diff、live evidence、验证输出和残余风险。

并行 lane 完善后必须及时吸收回 `main`，并清理对应 worktree、branch、thread 与临时状态。已有并发 worktree / branch 默认视为外部 owner lane，除非用户明确授权，不得吸收、清理、覆盖或把其状态并入本轮完成口径。subagent 完成报告不能替代 owner receipt、domain verdict、delete authority、App release readiness、production readiness 或最终验收。

W7 owner-evidence docs foldback 只能记录 active owner 已消费的 fresh 判断：owner-route work order、Brand L5、App release/user-path、provider long-soak、cleanup 和 memory/artifact/lifecycle evidence 都是 refs-only 输入或 owner lane routing，不是 closing authority。结构维护 foldback只能说明某个 OPL read model、runtime queue coordinator 或 support doc 更易维护。这些都必须回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 与 [OPL 当前状态](../status.md) 读取最新 identity、计数、refs、source split 和 owner gate；本文不得保存动态快照，也不得把 source-boundary cleanup、line budget pass、structure advisory clean、semantic part split、verified ledger、typed blocker ref 或 App 投影写成 MAS/MAG/RCA/OMA owner answer、App release verdict、Brand L5、physical delete authorization 或 production readiness。

Current readout 审计口径：fresh readout 只能证明 owner-answer identity、provider currentness、safe-mutation guard 或 evidence-intake 当前；这些信号既不能阻断普通 stage 推进，也不能升级为 domain ready、App release ready、Brand L5 或 `production_ready`。

后续若继续并行推进，默认拆成两类 lane：`owner-evidence lane` 可以跨 MAS/MAG/RCA/OMA/App/brand/runtime owner repo 处理真实 receipt / blocker / verdict / long-soak / delete decision；`hygiene-support lane` 只能处理 OPL source-boundary、docs foldback、guard 或 read-model clarity。两类 lane 可以并行，但 completion audit 必须分账：hygiene-support 不能提高 W7 owner-evidence 完成度，只能降低维护风险或误判风险。

## Baton Boundary

执行顺序不在本文维护。需要行动时读取 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 的 `Active Planning Gap Register`、`功能 / 结构差距`、`Ready / Release 声明边界` 和 `Next-Round Agent Prompt`，再 fresh 读取 source/contracts/tests/CLI/read-model 的 wrapper payload。本文只提供评估口径：每个新发现的 surface 先分类为 `meets_target`、`needs_demotion` 或 `needs_retirement`；需要落地或关闭时回到 active gap owner 记录 owner、source of truth、accepted answer shape 和验证命令。本文不得维护 W7 owner-route queue、Brand L5 backlog、App release/user-path backlog、provider long-soak backlog 或 dated worktree closeout。
