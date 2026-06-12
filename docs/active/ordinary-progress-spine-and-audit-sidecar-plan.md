# Ordinary Progress Spine 与 Audit Sidecar 完整规划

Owner: `One Person Lab`
Purpose: `ordinary_progress_spine_audit_sidecar_plan`
State: `active_support`
Machine boundary: 本文是人读目标规划和治理口径。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker、真实 workspace 与 App evidence。当前执行顺序、live gap 和完成判断仍回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。
Last reviewed: `2026-06-12`

## 结论

当前 MAS / OPL 的方向不是错，而是把正确性、审计、receipt、read-model reconcile、restore proof、lineage 和 currentness 做成了普通推进路径的默认负担。RCA 顺滑、DeepScientist / 旧 MDS 能流畅跑起来的共同经验，不是它们的质量边界更强，而是默认控制面更短：有目标、有状态、有执行循环，有结果就进入下一步。

OPL family 的目标修正为两层：

```text
Ordinary Progress Spine
  current_owner_delta
  -> current stage goal
  -> executor produces concrete delta
  -> domain records ProgressDeltaReceipt / OwnerReceipt / TypedBlocker
  -> Stage Transition Authority derives next current_owner_delta

Audit / Evidence Sidecar
  trace / lineage / refs / replay / restore / long-soak / full readiness / cleanup / production evidence
  -> passive evidence vault and drilldown
  -> hard gate only when safety, authority, irreversible mutation, delivery, publication, release, or human decision requires it
```

普通推进主干优化“能不能继续产生可接力 delta”。审计旁路优化“事后能不能解释、恢复、验证、交付和治理”。两者共享 refs 和 event log，但默认 planning root 只能是 `current_owner_delta`。

## 为什么需要更新规划

本轮复盘暴露出的核心问题是：系统为了证明自己能推进，花了大量时间在推进之外。

| 问题 | 当前症状 | 目标修正 |
| --- | --- | --- |
| closeout 链路过长 | executor 完成后还要经过 OPL closeout、MAS 消费、StageRun/source/idempotency 检查、owner receipt / typed blocker、current_owner_delta 投影、read-model rebuild、attempt admission 等多段握手。 | 普通 step 只要求一个 concrete delta 或 typed blocker；完整 closeout binding 只在 Stage transition、delivery、publication、irreversible mutation 时升级为硬门。 |
| currentness surface 过多 | `current_execution_envelope`、`study_progress`、`current_owner_delta`、stage folder current pointer、publication eval、controller decision、action queue、Portal 都表达“现在到哪”。 | `current_owner_delta` 是默认唯一读根；其他 surface 只能是 source、status、projection 或 audit drilldown，不能独立生成下一步。 |
| Stage Artifact contract 默认过重 | 每个普通推进都像交付合规：manifest、role artifacts、receipt/blocker、lineage、current pointer、retention/restore 全部精确才安心。 | artifact 分层：ordinary delta 用轻 receipt，Stage transition 用 full Stage Artifact Unit，delivery/export/publication 用 package-level proof。 |
| readiness 被前置化 | literature provider、study line、analysis contract、bounded board、journal layer 等 readiness 面容易形成“先补齐所有准备面再写论文”。 | readiness 改成 just-in-time：只在当前 delta 需要时检查；缺口转成下一 owner delta、route-back 或 typed blocker，不阻断所有写作/分析推进。 |
| advisory 机制升格成阻塞 | tournament、reflection、meta-review、memory reuse、knowledge prefetch 等帮助 executor 的机制进入 contract/test/read-model 后变成必须解释的 refs。 | advisory refs 默认只帮助 stage 内执行和 reviewer 找缺口；缺失不能阻断 ordinary launch，除非触发 owner/authority/safety/closeout 硬边界。 |
| OPL/MAS 分权握手成本高 | OPL 负责 runtime，MAS 负责医学 authority，但每次推进都像跨系统审计。 | 普通路径采用标准 owner answer shape；OPL 只 transport / ledger / project，MAS 只签 domain answer。审计补证放到 sidecar。 |
| DeepScientist / MDS 经验被误读 | 旧系统流畅是因为单循环少门槛，不代表应恢复旧 backend 或降低医学审计。 | 只吸收“单一推进循环、少默认门、持续产出”的控制面经验；MDS / DeepScientist 继续只作 provenance、fixture、audit、parity oracle。 |
| cleanup / L5 / release / restore 尾项抢占 | wrapper retirement、refs-only ledger、long-soak、release cohort、restore proof 容易挤进普通 next action。 | cleanup、production evidence、release、long-soak、restore 进入显式 lane；只有被当前 owner delta 或不可逆操作要求时才升级。 |

## 外部经验吸收

这些外部经验只作为工程原则输入，不成为 OPL runtime truth 或新依赖。

| 来源 | 成熟经验 | OPL 采用方式 |
| --- | --- | --- |
| [Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | 生产 agent 优先简单、可组合 pattern，复杂框架只在必要时加入。 | ordinary path 固定短链路；多 agent tournament、proof lane、diagnostic、long-soak 和 replay 显式 lane 化。 |
| [OpenAI Agents SDK handoff](https://openai.github.io/openai-agents-js/guides/handoffs/) / [guardrails](https://openai.github.io/openai-agents-js/guides/guardrails) / [tracing](https://openai.github.io/openai-agents-python/tracing/) | handoff 结构化；guardrail 按 workflow / input / output / tool 边界分层；trace 用于 debug / monitor。 | handoff 必须落成 owner answer / typed blocker / current owner delta；guardrail 分 launch-hard、runtime-enforced、domain/human gate、audit-only；trace 只进 sidecar。 |
| [Kubernetes controller](https://kubernetes.io/docs/concepts/architecture/controller/) 与 [spec/status](https://kubernetes.io/docs/concepts/overview/working-with-objects/) | desired state 与 observed status 分离，controller reconcile 后写 status。 | stage pack / current_owner_delta 是 desired；attempt/provider/worklist/read-model 是 status。status 不生成 domain goal。 |
| [Temporal durable execution](https://docs.temporal.io/) | durable runtime 保存 workflow history、retry、timeout、worker、signal/query/update 等执行事实。 | OPL Runway 持 attempt / lease / retry / closeout / provider observation；domain repo 不复制 scheduler 或 generic attempt loop。 |
| [Argo CD automated sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/) / [sync options](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/) / [resource health](https://argo-cd.readthedocs.io/en/latest/operator-manual/health/) | GitOps 用 desired/live diff 驱动 sync，用 health/status 观测结果；prune/delete/replace/force 等危险操作有显式策略或确认。 | OPL 可以自动推进 owner delta 与可恢复 attempt；physical delete、artifact/package mutation、publication/submission/release claim 必须显式 owner/human gate。 |
| [SLSA provenance](https://slsa.dev/spec/latest/) | provenance/attestation 证明产物来源、构建输入和供应链完整性，但下游仍要验证并按风险解释。 | Stage Artifact Unit 保留 manifest、hash、lineage、restore refs；这些证明进入 artifact authority 输入，不能单独升级为 publication-ready、package-ready 或 production-ready。 |
| [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | checkpoint 支撑 human-in-the-loop、time travel、fault-tolerant execution。 | checkpoint / event log 服务 resume、replay 和 human gate；默认推进仍看 artifact delta 与 owner answer。 |
| [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) | traces、metrics、logs、baggage 等信号分层观察系统。 | Vault 记录信号；Console 默认只显示 owner signal，trace/log/raw refs 进入 drilldown。 |
| [Backstage software templates](https://backstage.io/docs/software-templates/generated-index) / golden paths | 平台给用户 paved road，而不是把内部路径都暴露给用户。 | 每个 Foundry Agent 只有一个 ordinary golden path；variant、diagnostic、proof、cleanup 显式进入。 |
| [Google SRE toil elimination](https://sre.google/sre-book/eliminating-toil/) | 重复、手工、战术性、无长期价值的工作应通过工程设计消除。 | receipt-only、read-model reconcile-only、stale route redrive-only、accounting-only 循环进入 stop-loss 或 sidecar，不再作为日常推进。 |
| [DORA continuous delivery](https://dora.dev/capabilities/continuous-delivery/) | 快速、安全、可持续交付依赖过程简化、架构改善和每个人可见的快速反馈。 | Operator 默认反馈必须是 owner、delta、artifact/blocker 和 accepted answer shape，而不是内部计数。 |

## 目标对象

### Ordinary Progress Spine

普通推进主干只回答五个问题：

1. 当前 task / study / deliverable 处在哪个 Stage。
2. 当前 owner 是谁。
3. 这一轮必须产出什么 concrete delta。
4. 接受什么返回形状。
5. 产出后下一个 owner / blocker 是什么。

标准 payload：

```text
current_owner_delta
  delta_id
  domain
  task_or_study_ref
  stage_ref
  current_owner
  desired_delta_kind
  desired_delta_description
  accepted_answer_shape
  hard_gate
  advisory_warnings
  latest_owner_answer_ref
  next_owner_or_stage
```

ordinary path 不读取 raw worklist 作为 planning root，不从 evidence ledger 生成下一步，不用 provider completion 关闭 Stage，不用 read-model refresh 表示进度。

### ProgressDeltaReceipt

普通 step 需要一个比 full owner receipt 更轻的进展记录：

```text
ProgressDeltaReceipt
  receipt_id
  domain
  task_or_study_ref
  stage_ref
  producer
  delta_classification
    paper_progress_delta | deliverable_progress_delta | platform_repair_delta | advisory_delta
  changed_surfaces[]
  produced_refs[]
  consumed_refs[]
  next_owner
  next_required_delta
  blocker_ref?
```

它的作用是让 executor 的真实工作能被接力。它不能单独授权 publication-ready、release-ready、artifact mutation、memory accept/reject 或 production-ready。涉及 Stage transition、交付、不可逆 mutation 或正式 quality verdict 时，必须升级到 `OwnerReceipt` / `TypedBlocker` / human gate / delivery receipt。

### Artifact Tiering

Stage Artifact Unit 保留，但不再把全部重量压到每个普通 step。

| 层级 | 适用对象 | 必须有 | 不得外推 |
| --- | --- | --- | --- |
| `T0_progress_delta` | 普通写作、分析、证据整理、review 修订、平台修复 | `ProgressDeltaReceipt`、changed surfaces、minimal refs、next owner / blocker | 不等于 Stage complete 或 publication/package ready。 |
| `T1_stage_transition` | Stage 关闭、下一 Stage 准备、owner gate | stage manifest、role artifacts、OwnerReceipt / TypedBlocker、current pointer / StageRun binding | 不等于 domain ready 或 production ready。 |
| `T2_delivery_artifact` | publication package、RCA export、MAG submission、App release | package manifest、authority receipt、independent review / human gate、restore/retention refs | 不等于长期 production maturity。 |
| `T3_production_evidence` | long-soak、restore proof、L5、cleanup、release cohort | refs-only ledger、operator evidence、owner acceptance、no-regression refs | 不进入 ordinary next action，除非当前 owner delta 明确要求。 |

### Audit Sidecar

Sidecar 记录完整证据，但默认不规划。

```text
audit_sidecar
  event_log_refs
  trace_refs
  evidence_refs
  replay_refs
  lineage_refs
  restore_refs
  readiness_inventory
  long_soak_refs
  cleanup_refs
  production_evidence_refs
```

Sidecar 只有在以下条件触发时升级为 hard gate：

- owner、scope、selected executor、authority boundary 不合法；
- provider attempt、attempt lease、execution authorization 或 forbidden-write guard 缺失；
- accepted answer shape 不合法，或 receipt/blocker 不能绑定当前 StageRun / manifest / current pointer / source fingerprint / idempotency；
- 操作会写 domain truth、artifact body、memory body、package、submission、release 或 physical delete；
- publication/submission/export/release/production-ready/L5 等正式声明需要证据；
- human/safety/compliance gate 未关闭；
- current pointer、manifest、artifact hash、restore proof 损坏到无法恢复或无法审计。

其余缺口都保持 advisory、diagnostic、route-back、cleanup 或 production evidence lane。

## 对 MAS 的具体应用

MAS 的普通论文推进应读作：

```text
current_owner_delta
  -> medical stage goal
  -> Codex executor produces paper/evidence/reviewer/gate delta
  -> MAS records ProgressDeltaReceipt / OwnerReceipt / TypedBlocker
  -> OPL projects next owner delta
```

`complete_medical_paper_readiness_surface` 这类 readiness owner surface 应该是 just-in-time 的 delta 面：当前缺什么 surface，就补什么 surface 或写 stable typed blocker。它不应变成“先把全部 readiness inventory 补齐再允许写作/分析”的前置大门。

MDS / DeepScientist 的经验吸收口径固定为：

- 学习它们的单一运行体、少门槛、持续推进和 UI 体感；
- 不恢复它们作为 MAS 默认 backend、runtime owner、quality owner 或 artifact authority；
- 不用它们的流畅性降低 MAS 的 evidence pack、negative ledger、decision trace、artifact lineage、AI reviewer、owner receipt 或 typed blocker 最低审计链；
- 把它们作为 parity oracle 检查 MAS 是否把控制面做得过重：如果 MAS 只是在 receipt/reconcile/accounting 中循环，没有 paper/evidence/reviewer/gate delta，就必须回到 ordinary progress spine。

## OPL 基座优化

| OPL 模块 | 优化方向 | 普通路径读法 |
| --- | --- | --- |
| `OPL Runway` | stage attempt、lease、retry、dead-letter、closeout binding、provider observation 统一围绕 StageRun。 | Runway 只证明能执行和恢复；不生成 domain goal。 |
| `OPL Stagecraft` | stage pack 提供 goal、context、tool affordance、knowledge、rubric、quality gate；Stage 内保留 executor 自主策略。 | prompt/tool/knowledge/rubric refs 缺失默认 advisory，除非破坏启动安全或 closeout。 |
| `OPL Pack` | domain pack + authority ABI + generated surfaces 生成普通入口和 accepted answer shape。 | Domain repo 保留 semantic pack 与最小 authority function，不复制 wrapper / scheduler。 |
| `OPL Vault` | passive evidence vault；record everything, plan from folded owner delta only。 | verified ledger 只证明 refs transport，不关闭 stage。 |
| `OPL Console` | 默认 cockpit 只显示 purpose、stage、current owner、required delta、accepted answer shape、artifact/blocker。 | raw worklist、provider trace、release proof、L5 evidence、cleanup gate 只在 drilldown。 |
| `OPL Foundry Lab` | improvement work order 从 progress failures 和 sidecar evidence 生成。 | improvement 不抢占 domain ordinary path，除非当前 owner 是 OPL runtime / framework。 |

## 实施规划

### P0：文档和规划收口

完成口径：

- 本文作为完整规划入口进入 active support。
- `current-state-vs-ideal-gap.md` 只维护 active owner、gap、next action 和完成口径。
- MAS active gap / Stage Native / handoff docs 同步说明普通推进主干、artifact tiering、readiness JIT 和 MDS/DeepScientist 学习口径。

### P1：Default read surface 收敛

目标：

- App/CLI/operator 默认只从 `current_owner_delta` 派生下一步。
- `current_execution_envelope`、`study_progress`、worklist、stage folder projection、publication eval、controller decision、Portal 只能作为 source/status/projection/audit。
- zero open worklist 不清空 current owner delta。

验收：

- 默认读面能回答 owner、delta、accepted answer shape、hard gate、next owner。
- raw worklist、typed-blocker group、provider trace、private residue 不能生成 default next action。

### P2：ProgressDeltaReceipt 与 artifact tiering

目标：

- ordinary step 可以用轻量 `ProgressDeltaReceipt` 接力。
- Stage transition / delivery / production evidence 分层升级。
- 平台修复和 paper/deliverable 进展分账。

验收：

- 每次 terminal closeout 能归类为 `paper_progress_delta`、`deliverable_progress_delta`、`platform_repair_delta`、`advisory_delta`、`typed_blocker` 或 `human_gate`。
- platform repair 不能写成 paper progress。

### P3：Readiness JIT 与 stop-loss

目标：

- readiness inventory 只在当前 delta 需要时进入。
- 同一 lineage 反复 receipt-only、read-model reconcile-only、stale-route redrive-only 时冻结普通 launch，只接受 fresh owner delta、stable typed blocker 或 human gate。

验收：

- readiness 缺口能转为下一 owner delta，而不是阻断整个 Stage。
- stop-loss 输出必须说明下一次必须产出的 concrete delta 或 blocker。

### P4：Audit sidecar passive 化

目标：

- trace、lineage、restore、long-soak、cleanup、release cohort、L5 evidence 默认作为 sidecar。
- 只有升级条件成立时进入 hard gate。

验收：

- Vault / worklist / drilldown 能解释证据，但不能替代 owner answer。
- release、publication、export、physical delete、production-ready 声明仍由对应 owner receipt / verdict 关闭。

### P5：私有平台和旧补偿链退役

目标：

- Domain repo 私有 scheduler、runner、session store、wrapper、status shell、workbench、sidecar 等只作为迁移输入。
- 替代面成熟后走 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 删除门。

验收：

- 没有 active caller 的旧面直接退役或 tombstone。
- cleanup lane 不进入 ordinary next action。

## 验收标准

整体规划只有在下面条件成立时才算达到目标态：

1. 普通 operator 不需要理解 worklist、route menu、provider trace、receipt count、private residue、restore proof 或 wrapper lineage，也能看清当前谁欠什么、接受什么返回形状、下一步能否执行。
2. executor 每次普通 attempt 至少产生 concrete delta、ProgressDeltaReceipt、OwnerReceipt、TypedBlocker、human gate、route-back 或明确 stop-loss；不能只留下 read-model refresh 或 receipt accounting。
3. Stage complete 只来自 manifest、role artifact、owner receipt / typed blocker、current pointer 和 StageRun binding；provider completion、file presence、verified ledger、schema pass 都不能替代。
4. readiness、advisory、trace、lineage、restore、long-soak、cleanup 和 production evidence 默认可追溯，但不阻塞 ordinary progress。
5. MAS/MAG/RCA/OMA 都保持一个 ordinary golden path；diagnostic、proof、cleanup、long-soak、legacy provenance 显式 lane 化。
6. MDS / DeepScientist 只作为 smoothness learning、provenance、fixture、audit 和 parity oracle，不成为默认 runtime 或质量权威。

## 当前不能写成

- 不能把本文写成 implementation landed。
- 不能把 OPL refs-only ledger、provider completion、read-model repaired、worklist=0、docs updated 或 conformance pass 写成 domain ready、paper ready、App release ready、production ready 或 L5 complete。
- 不能把 ProgressDeltaReceipt 写成 publication / submission / artifact mutation authority。
- 不能把 audit sidecar passive 化理解为降低 safety、authority、receipt binding、human gate、release gate 或 physical delete gate。
