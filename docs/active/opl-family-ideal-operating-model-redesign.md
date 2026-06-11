# OPL Family Ideal Operating Model Redesign

Owner: `One Person Lab`
Purpose: `opl_family_ideal_operating_model_redesign`
State: `active_reference`
Machine boundary: 本文是人读顶层重设计与审计标准。机器真相继续归各 repo 的 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker、release artifact 和真实 workspace/App evidence。
Date: `2026-06-10`

## 读法

本文按 `目的反推必要性，MVP 检查阻碍性` 重新评估 OPL 相关 repo 的实际情况，并给出理想目标态设计。它是 north-star / 验收标准，不是 active backlog owner；只保留评估口径、分类标准和目标操作架构说明。它不声明 production ready、domain ready、App release ready、artifact authority ready 或 physical delete 授权。

本文中的 lane、plane、primitive 和 support index 都只能作为验收标签或审计口径使用。需要记录当前 gap、执行 owner、下一步 baton、完成口径或 live evidence intake 时，必须折回 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 或核心五件套；不能在本文维护第二 active backlog、第二 ordinary route、第二 owner queue 或第二 truth source。

2026-06-10 refresh：本文进一步把 MAS/OPL 的理想形态重设为 `multi-plane operating system`。核心判断是：更丝滑的 MAS 推进不来自更多默认 worklist、更多 proof 或更厚 preflight，而来自一个 ordinary progress contract 加上彼此分离的 durable runtime、artifact、evidence、decision、observability 和 improvement 平面。所有外部成熟工程经验只作为 pattern source；它们不能成为 OPL 第二 runtime、MAS 第二 truth、第二 selector 或第二 active backlog。

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
  -> passive evidence vault and diagnostic drilldown
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
  Pack / Stagecraft / Runway / Vault / Console / Foundry Lab / Connect
```

这意味着 OPL 只把普通路径做短、把恢复路径做稳、把证据路径做清楚；MAS 只把医学研究 owner answer、publication quality、artifact authority、typed blocker 和 human gate 做准。OPL 不能替 MAS 写 owner receipt，MAS 也不再保留 generic scheduler、queue、attempt loop、status shell 或第二 workbench。

后续最重要的优化不是继续补 core primitive，而是执行三种动作：

- `meets_target`: 默认路径更短，owner 更清楚，artifact / receipt / blocker 更可接力。
- `needs_demotion`: 有诊断、审计、history、support 或 production hardening 价值，但不应进入 ordinary App/CLI/operator path。
- `needs_retirement`: 已被 generated/hosted surface、App contract 或 domain authority function 替代，应走 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 删除门。

## 外部成熟实践吸收

本轮只吸收成熟工程原则，不引入外部 runtime truth。

| 外部经验 | 分类 | OPL/MAS-native 吸收 | 禁止升级 |
| --- | --- | --- | --- |
| [Kubernetes controller / operator](https://kubernetes.io/docs/concepts/architecture/controller/) | `adopt_contract` | `current_owner_delta` / stage pack 是 desired state；attempt、provider、worklist、evidence 是 observed state；`Runway Progress Reconciler` 只输出唯一下一 safe action、owner/gate wait 或 OPL runtime blocker。 | Reconciler 不生成 MAS goal、owner receipt、typed blocker 或 quality verdict；observed status 不成为 domain truth。 |
| [Temporal durable execution](https://docs.temporal.io/temporal) / [Event History](https://docs.temporal.io/encyclopedia/event-history/) / [Signals, Queries, Updates](https://docs.temporal.io/encyclopedia/workflow-message-passing) | `adopt_contract` | `Runway` 持有 durable execution substrate、workflow history refs、task queue、retry/dead-letter、signal/query/update、human-gate transport 和 recovery repair。 | Temporal history、worker health、provider completion 和 repair success 不关闭 MAS stage、publication ready、domain ready 或 L5。 |
| [Dagster software-defined assets](https://docs.dagster.io/api/dagster/assets) / [asset checks](https://docs.dagster.io/api/dagster/asset-checks) | `adopt_template` | `Stage Artifact Unit` 成为可接力资产单元：artifact key、upstream refs、materialization receipt、owner、check refs、freshness / current pointer 分开。 | Asset check 只能影响 artifact / quality gate lane；OPL 不把 check pass 写成 domain verdict。 |
| [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) / [semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/) | `adopt_template` | `Vault` 与 `Console` 使用统一 telemetry vocabulary：trace、metric、log、baggage、resource、stage_attempt、owner_delta、artifact_unit、domain_ref。 | Telemetry 只做 observability、debug、L5 drilldown；trace/metric/log 不生成默认 next action。 |
| [LangGraph durable/stateful agents](https://docs.langchain.com/oss/python/langgraph/overview), [persistence](https://docs.langchain.com/oss/python/langgraph/persistence), [human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) | `adopt_template` | 只吸收 checkpoint、pause/resume、human approval/edit/reject/respond、thread state 和 HITL policy shape，用于 OPL human gate 与 StageRun resume 设计。 | 不引入 LangGraph runtime；checkpoint / memory 不成为 MAS truth 或 App default plan root。 |
| [MLflow Tracking](https://mlflow.org/docs/latest/ml/tracking/) / [Dataset Tracking](https://mlflow.org/docs/latest/ml/dataset/) 与 [DVC dvc.yaml](https://doc.dvc.org/user-guide/project-structure/dvcyaml-files) | `adopt_template` | run metadata、params、metrics、artifact refs、dataset lineage、fingerprint、stage deps/outs 进入 MAS research provenance 和 Vault refs-only lineage。 | MLflow/DVC run 成功不等于 paper progress；dataset lineage 不替代 MAS source truth 或 reviewer/publication gate。 |
| [OpenAI Agents SDK handoffs](https://openai.github.io/openai-agents-python/handoffs/), [guardrails](https://openai.github.io/openai-agents-python/guardrails/) 与 [tracing](https://openai.github.io/openai-agents-python/tracing/) | `adopt_template` | handoff、guardrail、trace 的分层词汇进入 Stagecraft / Console / Vault；handoff payload 必须绑定 owner answer shape。 | Handoff 不是 owner receipt；guardrail pass 不是 quality verdict；trace 不是 progress truth。 |
| [Backstage golden paths](https://backstage.io/docs/golden-path/create-app/) / platform engineering | `adopt_template` | OPL App 只给每个 Foundry Agent 一条 ordinary route；variants、proof、debug、cleanup、release/soak 都显式进入 developer/detail lane。 | 不把平台 catalog 或 template 变成第二 workflow engine。 |
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
| `durable_runway_plane` | `Runway` | admitted stage attempt、provider profile、human gate refs、owner route refs。 | attempt lease、provider observation、retry/dead-letter、repair action、closeout binding refs。 | owner receipt、typed blocker、domain completion。 |
| `authority_decision_plane` | domain kernel + human gate | artifact unit、review refs、source fingerprint、currentness identity。 | owner receipt、quality gate receipt、typed blocker、human gate receipt、route-back evidence。 | generic runtime repair、provider liveness。 |
| `evidence_telemetry_plane` | `Vault` | trace、metric、log、receipt refs、provenance, lineage。 | refs-only evidence index、L5 drilldown、audit packet。 | default next action、body storage、quality verdict。 |
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
passive-evidence-vault
app-state-action-producer
agent-lab-improvement-loop
human-owner-decision-gate
```

| Primitive | 持有职责 | 不持有 |
| --- | --- | --- |
| `owner-delta-controller` | desired/current reconcile、next owner、accepted answer shape、hard gate、stop-loss。 | domain goal generation、quality verdict、artifact authority。 |
| `stage-attempt-runtime` | admission、provider binding、execution authorization、attempt lease、Codex executor launch、retry/dead-letter、closeout receipt binding。 | stage 内认知策略、工具顺序、domain judgment。 |
| `stage-artifact-kernel` | physical output、manifest、hash、owner answer、current pointer、lineage。 | artifact body verdict、publication/export/visual quality。 |
| `agent-product-pack-compiler` | domain pack、stage refs、tool affordance、quality gate refs、golden path profile。 | domain-specific truth 或 private runtime loop。 |
| `generated-surface-host` | CLI/MCP/App/status/workbench/default-caller shell。 | domain repo wrapper compatibility。 |
| `passive-evidence-vault` | raw evidence、trace、replay、typed blocker group、long-soak、cleanup provenance。 | default planning root。 |
| `app-state-action-producer` | App fast/full state、safe action shell、operator payload handoff。 | GUI product release authority 或 domain truth。 |
| `agent-lab-improvement-loop` | eval refs、root cause、work-order candidate、risk-tier promotion evidence。 | target owner receipt、domain truth、memory/artifact body。 |
| `human-owner-decision-gate` | approval/edit/reject/respond、quality reviewer handoff、release owner decision、physical delete owner decision。 | 隐式批准、silent fallback、provider-completion-to-domain-ready。 |

基座优化方向：

1. 默认 CLI/App/operator summary 改为 owner-delta-only；raw count 只在 `--detail full`。
2. 所有 new surface 必须先走 surface budget，默认分类为 diagnostic/reference。
3. `compact_owner_delta_projection` 从 active/default surfaces 退役，文档和 App contract 只首选 `current_owner_delta`；审计尾项进入显式 `current_owner_delta_read_model`。
4. generated surfaces 成为 CLI/MCP/status/workbench/default-caller 的默认承载；domain repo retained wrapper 只作为 deletion-gate candidate / domain cleanup surface 读取。
5. Evidence Vault 坚持 `record everything, plan from nothing`。

### 2. One Person Lab App

App 理想形态是 `Codex App wrapper + Foundry Agent cockpit`：

- Home：purpose entry，不是 plugin/backend/agent selector。
- Runtime：task/stage/owner/action，不是 ledger browser。
- Settings：App profile、access、agents/capabilities、local environment、appearance、advanced、about/update，不暴露 ordinary backend/provider selector。
- Release：cohort-bound evidence，不外推到 family production ready。

优化方向：App 普通路径只展示 `purpose -> task -> current_owner_delta -> owner action`。Shell candidate、AionUI upstream detail、provider trace、release proof、full drilldown 都下沉为 diagnostics / release / developer detail。

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

OPL 对 MAS 的进一步优化重点不是再补 MAS 私有推进器，而是把 `current_execution_envelope`、`current_owner_delta`、StageRun closeout binding、Stage Artifact Unit、source fingerprint、publication quality gate 和 owner answer bridge 做成单一可接力路径。MAS 仍保留医学 source policy、publication quality、paper artifact authority、reviewer verdict、memory accept/reject、owner receipt 和 typed blocker；generic queue、daemon、dashboard、artifact lifecycle shell、source transport、App cockpit 和 evidence telemetry 上收到 OPL。

2026-06-11 implementation foldback：同一 dedupe-key 下 stale `queued` / `waiting_approval` MAS current-control provider admission 被 fresh work-unit/source currentness identity 取代时，属于 OPL `durable_runway_plane` / `reconciler_plane` 的 queue currentness 修复，可原地刷新 payload、重置 attempts，并保留既有 approval gate。owner-answer bridge 仍只接受带完整 StageRun closeout binding 的 domain-owned owner receipt / typed blocker；binding 必须匹配 provider attempt、active lease、execution authorization decision、source fingerprint 与 idempotency。fresh audit 中 `sat_c0348bcfa41849926ebb46f9` 的 MAS typed blocker 是真实业务阻塞证据，但缺少匹配该 StageRun 的 closeout binding，不能由 OPL 绑定成当前 owner answer 或 domain ready。

### 4. Support Repos

`opl-aion-shell` 和 `opl-doc` 不进入 Foundry Agent core truth set。

- Shell：只实现 App contract；上游 AionUI detail 是 implementation material。
- OPL Doc：只做 workflow steward / doctor / profile sync；doctor clean 不是 truth clean。

## Redesign Support Index

本节只保留理想 operating model 对 active owner baton 的设计含义。当前状态、下一步 owner、证据缺口和 closeout 口径回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)，避免本文成为第二份 active plan。表内 `Lane` 是验收标准标签，不是本文件维护的待办队列。

| Lane | Target reading | Acceptance standard |
| --- | --- | --- |
| `multi_plane_os_split` | 默认推进、durable runtime、artifact、authority decision、telemetry、reconciler、App cockpit 和 improvement 平面分离。 | ordinary path 只从 `current_owner_delta` 推进；其他平面只能提供 refs、safe action、owner gate 或 audit drilldown。 |
| `summary_de_noise` | OPL default summaries owner-delta-only，raw counts 只作 diagnostic-only。 | ordinary summary 不以 worklist/replay/blocked envelope count 作为 next-action root。 |
| `current_owner_delta_cutover` | 默认命名和 payload root 都说 `current_owner_delta`，`current_owner_delta_read_model` 只承载显式 audit/full-detail refs。 | `compact_*` 只在 history / negative guard 中出现，不能成为 default planning root 或 active compatibility alias。 |
| `domain_wrapper_delete_gate` | retained wrapper 逐项 delete/tombstone；delete-auth false / safe-to-delete false guard 防止 premature physical delete。 | no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance machine-readable。 |
| `real_owner_delta_tail` | production evidence tail 必须回到 domain owner answer，不用平台 repair 或 docs/provenance 替代。 | 真实 paper/grant/visual/target-agent owner receipt、typed blocker、human gate、review/export receipt 或 no-regression ref。 |
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
10. `evidence_vault`: evidence 是否 passive，不能直接 plan。
11. `human_owner_gate`: human / domain owner decision 是否显式产出 receipt、typed blocker、human gate 或 route-back evidence。

输出只允许三类：`meets_target`、`needs_demotion`、`needs_retirement`。

禁止用 `test pass`、`conformance pass`、`verified ledger`、`doctor clean` 或 `open_worklist=0` 单独关闭设计 gap。

## Execution Discipline

为了提高落地效率，凡任务互不冲突、写集可隔离、source of truth 清楚，且不会阻断当前 critical path，默认允许用 subagent + 独立 worktree 并行推进审计、实现、验证或 docs foldback lane。每条 subagent lane 必须写清任务、cwd、权限、source of truth、停止条件和禁止范围；主会话负责核查 diff、live evidence、验证输出和残余风险。

并行 lane 完善后必须及时吸收回 `main`，并清理对应 worktree、branch、thread 与临时状态。已有并发 worktree / branch 默认视为外部 owner lane，除非用户明确授权，不得吸收、清理、覆盖或把其状态并入本轮完成口径。subagent 完成报告不能替代 owner receipt、domain verdict、delete authority、App release readiness、production readiness 或最终验收。

W7 owner-evidence docs foldback 只能记录 `operating-maturity`、Brand L5 和 operating-model projection 的 fresh 判断：owner-route work order 是 refs-only 投影和字段/guard，不是 closing authority。当前 owner answer 仍回 `med-autoscience` owner receipt / typed blocker；Brand L5、App release/user-path、provider long-soak、cleanup 和 memory/artifact/lifecycle evidence 都按各自 owner lane 关闭，不能由本文或 OPL 投影生成 ready claim。

## Baton Boundary

下一步执行顺序不在本文维护。需要行动时读取 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 的 `Operating Model Foldback 状态`、`测试 / 证据差距` 和 `下一轮 Agent prompt`，再 fresh 读取 live contracts/source/CLI/read-model。本文只提供评估口径：每个新发现的 surface 先分类为 `meets_target`、`needs_demotion` 或 `needs_retirement`；需要落地或关闭时回到 active gap owner 记录 owner、source of truth、accepted answer shape 和验证命令。本文不得维护 W7 owner-route queue、Brand L5 backlog、App release/user-path backlog、provider long-soak backlog 或 dated worktree closeout。
