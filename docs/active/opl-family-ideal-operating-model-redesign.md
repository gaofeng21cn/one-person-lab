# OPL Family Ideal Operating Model Redesign

Owner: `One Person Lab`
Purpose: `opl_family_ideal_operating_model_redesign`
State: `active_support`
Machine boundary: 本文是人读顶层重设计与审计标准。机器真相继续归各 repo 的 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker、release artifact 和真实 workspace/App evidence。
Date: `2026-06-05`

## 读法

本文按 `目的反推必要性，MVP 检查阻碍性` 重新评估 OPL 相关 repo 的实际情况，并给出理想目标态设计。它不声明 production ready、domain ready、App release ready、artifact authority ready 或 physical delete 授权。

评估范围：

- Core repos: `one-person-lab`、`one-person-lab-app`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`。
- Support repos: `opl-aion-shell`、`opl-doc`。它们是 implementation / governance support，不是 Foundry Agent truth owner。

当前 gap owner 仍是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。目标操作架构回到 [OPL Foundry Agent Target Operating Architecture](./opl-foundry-agent-target-operating-architecture.md)。本文件只承载这一轮顶层重设计判断、跨仓优化方向和审计标准。

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

后续最重要的优化不是继续补 core primitive，而是执行三种动作：

- `meets_target`: 默认路径更短，owner 更清楚，artifact / receipt / blocker 更可接力。
- `needs_demotion`: 有诊断、审计、history、support 或 production hardening 价值，但不应进入 ordinary App/CLI/operator path。
- `needs_retirement`: 已被 generated/hosted surface、App contract 或 domain authority function 替代，应走 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 删除门。

## 外部成熟实践吸收

本轮只吸收成熟工程原则，不引入外部 runtime truth。

| 外部经验 | OPL 吸收原则 | 重设计影响 |
| --- | --- | --- |
| [Anthropic agent engineering](https://www.anthropic.com/engineering/building-effective-agents) | 从简单、可组合 pattern 开始，只在必要时增加复杂度。 | OPL ordinary path 必须短；multi-agent、proof、diagnostic、long-soak 和 replay 只做 explicit lane。 |
| [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents) / [guardrails](https://openai.github.io/openai-agents-python/guardrails/) / [tracing](https://openai.github.io/openai-agents-js/guides/tracing) | handoff 显式结构化；guardrail 按 boundary 分层；trace 用于 debug/monitor。 | `owner_answer` / `current_owner_delta` 才能驱动默认路径；trace/evidence 进入 audit plane，fold 后才影响 planning。 |
| [Kubernetes controller / deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) | desired/current 分离，controller 只 reconcile。 | `current_owner_delta` 和 stage pack 是 desired；attempt/provider/worklist 是 status，status 不生成 domain goal。 |
| [Temporal durable execution](https://docs.temporal.io/) | history、retry、timeout、task queue、worker liveness 由 durable substrate 承担。 | OPL/Temporal 持有长跑底座；domain repo 不保 generic daemon、scheduler、attempt loop。 |
| [Backstage golden paths](https://backstage.io/docs/golden-path/create-app/) | 平台给用户一条 paved road，而不是暴露所有内部路径。 | 每个 Foundry Agent 只有一个 ordinary route；variant/proof/debug/cleanup 显式进入。 |
| [CNCF platform engineering maturity model](https://www.cncf.io/blog/2023/11/20/announcing-the-platform-engineering-maturity-model/) | 平台成熟度靠 self-service、paved road、feedback loop。 | OPL 是 thinnest viable agent platform；domain pack 自助接入，App 默认只显示 owner delta。 |
| [Google SRE toil](https://sre.google/sre-book/eliminating-toil/) | 可自动化、重复、战术性、无持久价值的工作要消除。 | receipt-only、reconcile-only、stale redrive-only、count accounting-only 要 stop-loss 或下沉。 |
| [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) | traces、metrics、logs 是分层信号，不是业务目标。 | provider trace、replay、raw ledger 是 observability；默认 planning 看 owner delta。 |
| [DORA continuous delivery metrics](https://dora.dev/guides/dora-metrics/) | 快速、高质量反馈必须对团队可见。 | App/CLI 反馈必须是 next owner、accepted answer shape、artifact delta 或 blocker，而不是内部计数。 |

这些原则合在一起给出一个架构判断：OPL 应像 `platform golden path + durable controller + passive observability`，而不是把 agent runtime 做成工作流脚本、ledger browser 或多 backend launcher。

## Cross-Repo Current Assessment

| Repo | 当前更接近目标的部分 | 仍可优化的面 | 分类 |
| --- | --- | --- | --- |
| `one-person-lab` | `current_owner_delta` root、Temporal provider、stage attempt、Stage Artifact Unit、Tool Affordance Boundary、single golden path、wrapper retirement gate 已进入主干，default summary / compact alias 复活有 guard。 | 仍需长期守住 no-resurrection；raw count、blocked envelope、typed-blocker group 和 replay count 只能留在 diagnostic/full-detail。 | `meets_target` for default path, `needs_demotion` for diagnostics |
| `one-person-lab-app` | Codex wrapper、purpose entries、fast state、Runtime owner-action default、ordinary cockpit surface budget、first conversation warmup、Full runtime native trust / release-boundary gate 和 release typed-blocker path contract guard 已明确。 | Latest stable `v26.6.3` 仍缺同 cohort 远端 gatekeeper/native-trust assets、完整 release evidence bundle、VM/user-path/operator evidence 和 release-owner refs；release proof 不能进入 ordinary cockpit。 | `meets_target` for contract guard, `needs_demotion` for release detail |
| `med-autoscience` | MAS 已是 Research Foundry pack；AI reviewer record-only handoff/currentness、request persistence、provider admission 和 provider handoff 后 terminal materialize refresh 已从 owner-route 角度推进，paper-line authority 留在 MAS。 | 平台 repair、read-model currentness、storage/index maintenance 仍不能写成 research progress；真实 paper owner receipt / reviewer receipt / publication gate 仍是证据尾项。 | `meets_target` for structure/currentness, `needs_domain_evidence` |
| `med-autogrant` | Grant pack、submission-ready human gate、purpose-first adapter thinning、OPL runtime owner boundary 清楚；stale specs lifecycle 叙事已降到 docs/provenance；physical morphology guard 不再把外部证据齐全写成 cleanup complete。 | product/status/user-loop/domain-handler/grouped CLI shell 仍作为 active adapter 暂留；submission gate 和 physical delete 只能由 human/MAG owner receipt 或 MAG typed blocker 关闭。 | `needs_retirement` with overclaim guard |
| `redcube-ai` | RCA visual pack、image-first path、Stage Artifact adoption、review/export authority、production acceptance refs shape 强；real-route probe 已移入 history/process provenance；retained wrapper 审计确认 delete-auth false / safe-to-delete false guard 已在机器面。 | session/domain_action_adapter/runtimeWatch/operator projection 和 route variants 仍有 tail；long-soak / no-regression 是真实 production evidence tail。 | `needs_retirement` plus owner-delta evidence tail |
| `opl-meta-agent` | OMA 边界已经防止第二 Framework：只产出 candidate package、work order、mechanism proposal 或 typed blocker；active docs 已改为 fresh-read / live evidence 口径；全部 TS scripts 已被 script-to-pack retirement/retention gate 覆盖；developer work-order policy 与 standard Foundry policy bundle 已迁入 contract-backed projection。 | 后续新增或继续稳定下来的 policy 继续迁入 `agent/`、contracts、authority functions 或 OPL primitive；`stage-decomposition-pack-draft.ts` 仍需拆分降复杂度；保留脚本只能作为 refs/smoke/work-order/helper。 | `meets_target` for script gate coverage, `stable_policy_contracts_landed` |
| `opl-aion-shell` | Shell boundary 已声明只实现 App-owned contracts；Runtime bridge 默认消费 `opl app state`；ACP initial message warmup 与 Full runtime payload trust 已落地。 | Root/upstream shell叙事和 implementation detail 仍需防止反向定义 OPL/App/domain truth；legacy IPC / migration path 有明确 deletion gates。 | support `meets_target` for entry boundary |
| `opl-doc` | Doctor / native profile / family-plan 的 no-authority boundary 清楚，README/usage/invariants 已强化 support repo 不进入 Foundry Agent truth set。 | 风险是把 doctor clean、profile sync 或 family-plan 当 truth/readiness；应保持 workflow steward 定位。 | support `meets_target` |

## Ideal Top-Level Redesign

### 1. OPL Framework Base

OPL 基座应收敛成 8 个稳定 primitive：

```text
owner-delta-controller
stage-attempt-runtime
stage-artifact-kernel
agent-product-pack-compiler
generated-surface-host
passive-evidence-vault
app-state-action-producer
agent-lab-improvement-loop
```

| Primitive | 持有职责 | 不持有 |
| --- | --- | --- |
| `owner-delta-controller` | desired/current reconcile、next owner、accepted answer shape、hard gate、stop-loss。 | domain goal generation、quality verdict、artifact authority。 |
| `stage-attempt-runtime` | admission、provider binding、Codex executor launch、retry/dead-letter、closeout refs。 | stage 内认知策略、工具顺序、domain judgment。 |
| `stage-artifact-kernel` | physical output、manifest、hash、owner answer、current pointer、lineage。 | artifact body verdict、publication/export/visual quality。 |
| `agent-product-pack-compiler` | domain pack、stage refs、tool affordance、quality gate refs、golden path profile。 | domain-specific truth 或 private runtime loop。 |
| `generated-surface-host` | CLI/MCP/App/status/workbench/default-caller shell。 | domain repo wrapper compatibility。 |
| `passive-evidence-vault` | raw evidence、trace、replay、typed blocker group、long-soak、cleanup provenance。 | default planning root。 |
| `app-state-action-producer` | App fast/full state、safe action shell、operator payload handoff。 | GUI product release authority 或 domain truth。 |
| `agent-lab-improvement-loop` | eval refs、root cause、work-order candidate、risk-tier promotion evidence。 | target owner receipt、domain truth、memory/artifact body。 |

基座优化方向：

1. 默认 CLI/App/operator summary 改为 owner-delta-only；raw count 只在 `--detail full`。
2. 所有 new surface 必须先走 surface budget，默认分类为 diagnostic/reference。
3. `compact_owner_delta_projection` 只保 compatibility alias，文档和 App contract 首选 `current_owner_delta`。
4. generated surfaces 成为 CLI/MCP/status/workbench/default-caller 的默认承载；domain repo retained wrapper 只按 delete gate 暂留。
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

### 4. Support Repos

`opl-aion-shell` 和 `opl-doc` 不进入 Foundry Agent core truth set。

- Shell：只实现 App contract；上游 AionUI detail 是 implementation material。
- OPL Doc：只做 workflow steward / doctor / profile sync；doctor clean 不是 truth clean。

## Redesign Support Index

本节只保留理想 operating model 对 backlog lane 的设计含义。当前状态、下一步 owner、证据缺口和 closeout 口径回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)，避免本文成为第二份 active plan。

| Lane | Target reading | Acceptance standard |
| --- | --- | --- |
| `summary_de_noise` | OPL default summaries owner-delta-only，raw counts 只作 diagnostic-only。 | ordinary summary 不以 worklist/replay/blocked envelope count 作为 next-action root。 |
| `current_owner_delta_cutover` | 默认命名和 payload root 都说 `current_owner_delta`，`compact_owner_delta_projection` 只作 compatibility/full-detail alias。 | `compact_*` 只在 compatibility alias / history / negative guard 中出现，不能成为 default planning root。 |
| `domain_wrapper_delete_gate` | retained wrapper 逐项 delete/tombstone；delete-auth false / safe-to-delete false guard 防止 premature physical delete。 | no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance machine-readable。 |
| `real_owner_delta_tail` | production evidence tail 必须回到 domain owner answer，不用平台 repair 或 docs/provenance 替代。 | 真实 paper/grant/visual/target-agent owner receipt、typed blocker、human gate、review/export receipt 或 no-regression ref。 |
| `app_contract_compaction` | App ordinary path contract 收薄，并由 active-shell / release-boundary guard 检查。 | Home/Runtime/Settings 只显示 purpose、task status、next owner、artifact/blocker、release facts；release detail 只在 release/developer/detail 语境。 |
| `oma_script_to_pack_hygiene` | Stable scripts 迁到 `agent/`、contracts、authority functions 或 OPL primitive；保留脚本只能是 refs/smoke/work-order/helper。 | 新增或收薄脚本必须更新 machine gate。 |
| `support_entry_clarity` | Shell/doc support repo 只做 implementation carrier / workflow steward。 | support repo 不反向定义 OPL/App/domain truth，并持续防止 implementation detail 或 doctor-clean 变成 readiness。 |

## Audit Standard

每次评估按下面问题给结论：

1. `default_path`: 普通路径是否从 `current_owner_delta` 开始。
2. `progress_truth`: 是否只有 artifact + manifest + owner answer + current pointer 算 progress。
3. `mvp_friction`: 是否减少 receipt/reconcile/proof/status 循环。
4. `authority_boundary`: 是否保持 domain verdict 和 artifact authority 在 domain repo。
5. `surface_budget`: 新 surface 是否真有 default 资格。
6. `golden_path`: 每个 agent 是否只有一个 ordinary route。
7. `wrapper_retirement`: 被替代 wrapper 是否进入删除门。
8. `app_cockpit`: App 是否是 cockpit，而不是 ledger browser。
9. `evidence_vault`: evidence 是否 passive，不能直接 plan。

输出只允许三类：`meets_target`、`needs_demotion`、`needs_retirement`。

禁止用 `test pass`、`conformance pass`、`verified ledger`、`doctor clean` 或 `open_worklist=0` 单独关闭设计 gap。

## Baton Boundary

下一步执行顺序不在本文维护。需要行动时读取 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 的 `Redesign Backlog 状态`、`测试 / 证据差距` 和 `下一轮 Agent prompt`，再 fresh 读取 live contracts/source/CLI/read-model。本文只提供评估口径：每个新发现的 surface 先分类为 `meets_target`、`needs_demotion` 或 `needs_retirement`。
