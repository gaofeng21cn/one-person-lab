# OPL Family External Orchestration Learning Board 2026-04-30

## Purpose

这份 board 把 `MAS` 从外部 agent / orchestration 项目吸收的经验，提升为 `OPL` family 的长期学习入口。它记录方法和边界，不把医学语义、外部 scheduler、外部 tracker 或 persona 库升级成 `OPL` owner。

默认参考来源：

- `MAS` intake：`med-autoscience/docs/history/program/external_agent_orchestration_learning_intake_2026_04_30.md`
- `openai/symphony@58cf97d`
- `msitarzewski/agency-agents@783f6a7`
- `Biajin-PKU/research-harness@006ab44`
- `MAS` 后续落地面：work-unit attempt registry、Medical Quality OS、incident loop、product-entry projection

## Family Learning Logic

外部项目只按能否改善 `OPL` family 的 shared contract 来判断价值：

- `orchestration`：work unit、attempt、retry/backoff、workspace isolation、reconciliation、observability。
- `research-agent`：hypothesis route、failed-path learning、analysis campaign、bounded repair。
- `evaluation`：evidence refs、review refs、claim-evidence consistency、AI reviewer-backed gate。
- `runtime-safety`：trust boundary、secret handling、authorization scope、fail-closed worker。
- `product-ops`：operator projection、handoff、incident learning、soak proof。

## Decision Taxonomy

每个 source 只允许进入一种结论：

- `adopt_family_contract`：提升成 `OPL` family shared contract，例如 attempt/retry/projection/incident 的最小共同语义。
- `adopt_domain_template`：保留给 domain repo 自己医学化、基金化或视觉交付化落地，例如 MAS evidence ledger、MAG fundability gate、RCA render/export proof。
- `watch_only`：继续观察但不进入实现，例如外部 runtime 的新授权模型或 hosted worker isolation 机制。
- `reject`：不吸收，例如 Linear 必需入口、Symphony scheduler owner、NEXUS/generic persona library、marketing lifecycle。
- `reject_as_dependency`：不作为依赖、runner、database、web 或 hosted surface 引入；只允许保留 provenance 和 contract-language 学习记录。
- `saturated`：已有 `OPL` / `MAS` / `MAG` / `RCA` 等价合同，后续只追加 provenance，不再重复实现。

## Current Source Classifications

| Source | Classification | OPL family use | Boundary |
| --- | --- | --- | --- |
| `Ageniti/Ageniti@db92c0a` | `adopt_family_contract` | 借鉴 action contract 到 CLI / HTTP / MCP / OpenAI / React 多 surface 派生、side-effect / idempotency / confirmation / visibility 元数据、统一 envelope 与 streaming event 语义，用于补强 OPL family 对 domain capability surface 的 machine-readable 描述。 | 不把 Ageniti 作为默认 runtime、scheduler、memory、hosted execution 或 domain authority；`@ageniti/core` 仍处 `0.x` 早期阶段，只允许作为 optional prototype / domain template 观察，不进入 OPL core dependency。 |
| `Biajin-PKU/research-harness@006ab44` | `limited adopt_family_contract + adopt_domain_template + reject_as_dependency` | OPL 只吸收 domain-neutral 语言：stage boundary gate、provenance receipt、primitive/action registry、typed artifact refs、resume/checkpoint 和 human review checkpoint，映射到已有 stage control plane、action catalog、attempt ledger、handoff 与 operator projection。 | MAS 可把 literature review、claim/evidence、citation/number verification、adversarial review 等作为 domain template 参考；MAG/RCA 只借 stage-gated artifact proof 形式。拒绝引入 RH 代码、Python package、SQLite `pool.db` schema、auto-runner、HTTP API、web dashboard 或 MCP server 作为 OPL 依赖；PolyForm Noncommercial license 进一步要求只保留学习记录，不复制实现。 |
| `Jiaqi-Guo-0114/cybernetics-agent@4c5a6ee` | `limited adopt_family_contract + watch_only + reject_as_dependency` | 借鉴它把 agent operation 拆成 feedback loop、stability、system identification、budget control、information flow、adaptive tuning 和 hierarchy control 的可读分类；其中最适合 OPL 的是 family control-loop / SLO taxonomy、stage conversion / bottleneck metrics、budget and rate-limit projection、OpenMetrics-style observability、event / alert history 查询这几类 machine-readable projection 语言。 | 不引入 `cybernetics-agent` Python 包、CLI、dashboard、event bus、SQLite schema、plugin loader 或 generic Codex / Claude / Hermes adapters；OPL 继续以 Temporal-backed provider、Codex CLI first-class executor、stage attempt ledger 和 domain-owned truth 为当前 runtime truth。它的 retry / fallback / auto-tuning 只能作为观测和 proposal 语言参考，不得替代 fail-closed typed blocker、human gate、domain owner receipt 或 domain quality verdict。 |

## Cybernetics Agent Intake 2026-05-16

`Jiaqi-Guo-0114/cybernetics-agent` 当前公开版本为 `0.6.3`，本次复核 clone commit 为 `4c5a6ee46fb06fe876a53072bc17d26abf0292bf`。项目定位是 framework-agnostic Python enhancement layer，源码围绕 `CyberneticsContext`、事件总线、模块状态、metrics、SQLite event store、alert manager 和若干 framework / CLI adapter 组织。

对 OPL 有用的是分类和投影语言，不是 runtime implementation：

- 可吸收为 family contract / projection 候选：`control_loop` 语义可以映射为 `trigger -> decision/proposal -> action route -> owner receipt -> cooldown/depth`；`system identification` 可映射为跨 domain stage conversion、latency、retry/dead-letter、human-gate 和 bottleneck read model；`optimal control` 可映射为 stage attempt 的 token / cost / API / cadence budget projection；`OpenMetrics` 与 event / alert history 可作为 operator observability 输出格式参考。
- 已有等价或更强 OPL surface：Temporal provider、typed family queue、stage attempt ledger、closeout packet、provider SLO receipt、domain-memory receipt refs、operator workbench、artifact / restore proof 和 runtime snapshot 已覆盖它的大部分 runtime control 目标；这些面不需要再引入一层 generic event bus。
- 只观察：generic adapter list、dashboard layout、configuration hot reload 和 adaptive tuning UX。它们可以提示 OPL App / workbench 如何展示状态，但不改变 OPL Framework 的 owner split。
- 明确拒绝：automatic graceful degradation、字符串规则触发 retry、runtime-local plugin discovery、adapter subprocess wrapper 和默认 `~/.hermes` state path。OPL 的高价值知识工作不能通过 generic fallback 宣称成功；预算不足、工具失败或 quality blocker 应进入 typed blocker / human gate / owner receipt，而不是自动降级成低质量交付。

### Non-Core Pattern Absorption 2026-05-16

这些外部机制不是完全不能学，但只能以 OPL 边界内的低风险形态吸收：

- `generic fallback`：可转成 `degraded_attempt` 或 `alternative_route_proposal`，必须带 blocker、evidence gap 和 owner receipt ref；不能自动标记成功，不能绕过 typed blocker、human gate 或 domain owner receipt。
- `string rule retry`：可转成 typed SLO / retry policy schema，字段必须包含 trigger kind、metric source、cooldown、max attempts、owner、allowed action 和 receipt refs；规则解析失败必须 fail-closed。
- `generic event bus`：只吸收事件分类和观测字段，导出为只读 projection；真实状态仍以 OPL stage attempt ledger、Temporal history/proof、typed queue、closeout packet 和 domain-owned receipt 为准。
- `runtime adapter`：只保留显式 executor adapter registry；每个 adapter 必须有 capability boundary、receipt shape、tool-event proof、timeout / closeout rule 和 fail-closed gate，不能共享“process started = success”的泛化成功语义。

对应合同入口已经落到 `contracts/opl-framework/family-runtime-attempt-contract.json` 的 `external_stability_pattern_policy` 和 `contracts/opl-framework/family-product-operator-projection.json` 的 `external_stability_learning_policy`。学习方向保持为 control-loop 分类、观测指标、SLO/告警表达、budget projection 和 dashboard 组织；不把通用兜底执行机制引入 OPL core。

后续若要落地，只应开 OPL-owned 小 lane：

1. 在 runtime snapshot / production closeout 上增加 family control-loop summary，展示 trigger、decision owner、action route、receipt ref、cooldown 和 blocker。
2. 在 stage attempt ledger 上增加 budget / usage projection，先读 Codex runner 和 domain sidecar 已有 token / cost / duration refs，不新增执行路径。
3. 增加只读 OpenMetrics / JSON observability export，来源限定为 OPL ledger、Temporal proof receipt、domain-owned projection refs 和 App workbench read model。

## Research Harness Closeout Calibration 2026-05-12

`Biajin-PKU/research-harness` 当前仍保持在 `006ab44`，最新公开 release 是 `v0.4.0`。本次复核没有发现需要改变 owner split 的新事实：新增的 agent-first workbench、Cursor surface 和 Docling parser 都属于 RH 自身的 research product/runtime 体验，不改变 OPL 只吸收 shared contract vocabulary、typed artifact / provenance / stage gate pattern 的边界。

因此 RH 对 OPL 的本阶段吸收状态标记为 `saturated_for_opl_framework_core`：

- 已吸收进 OPL：standard domain agent skeleton / locator normalization、stage descriptor / gate vocabulary、typed attempt / closeout / projection 语义，以及 operator 能区分 provider completion、domain verdict、human gate、dead letter、rejected writeback 的投影口径。
- 已留给 domain repo：MAS 的 literature review、gap ranking、adversarial research review、paper writing gate、numeric trace / claim-evidence verification 继续属于 MAS-owned publication/reporting contract；MAG/RCA 只借 stage-gated proof 形式。
- 明确不吸收进 OPL：RH runtime、runner、SQLite schema、HTTP/API/Web/MCP server、研究领域判断、citation/number quality verdict、文献检索策略和 paper-ready verdict。
- 当前 OPL 读模型证据：`./bin/opl agents list --json` 为 `aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0`、`production_closure_gap_count=12`、`provider_temporal_residency_gap_status=closed_by_fresh_proven_proof`；`./bin/opl agents descriptors --json` 为 `descriptor_surfaces_resolved_count=3`、`memory_descriptor_resolved_count=3`、`stage_control_plane_resolved_count=3`、`action_catalog_resolved_count=3`、`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0`、`production_closure_gap_count=12`、`provider_temporal_residency_gap_status=closed_by_fresh_proven_proof`；`./bin/opl stages list --json` 为 `resolved_planes_count=3`、`stages_count=18`；`./bin/opl domain-memory list --json` 为 `resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0`。

后续只有两类变化需要重新打开 RH 学习 lane：

1. RH 新 release 提供了可抽象成 OPL-neutral machine contract 的新证据，例如更强的 typed receipt schema、stage-gate replay contract 或 human review resume envelope。
2. MAS/MAG/RCA 需要把 RH 的 domain template 转成各自 repo-owned quality/reporting contract；这类工作只在 domain repo 内实现，OPL 只消费 descriptor、locator、receipt 和 projection。

## Adopted Family Defaults

- `OPL` 持有 family-level shared modules、contracts、indexes、activation、projection。
- `MAS`、`MAG`、`RCA` 继续持有 domain-owned truth、domain quality judgment、domain route semantics。
- `OPL Runtime Manager` 只做 product-managed projection / diagnostic / indexing，不成为 scheduler、session、memory 或 domain truth owner。
- 加速只来自隔离 worktree、bounded read/analysis、independent repair unit、domain-owned proof，不绕过 domain quality gate。
- 所有学习结果必须落到 repo-tracked docs、contracts 或 tests；不能只留在聊天、memory 或 terminal prose。

## Stop Rules

继续学习外部 source 前必须先检查这些停止条件：

- 已有 `OPL` family 等价 contract 时，标记 `saturated`。
- 只剩外部 tracker mechanics / external tracker mechanics、Linear workflow、generic persona routing、marketing lifecycle 或通用 QA label 时，标记 `reject`。
- 新 source 不能改变 runtime contract、domain quality projection、operator projection、incident loop 或 tests 时，不进入 implementation lane。
- 外部项目要求接管 `OPL` 默认 runtime、`MAS/MAG/RCA` domain owner 或 Codex-default session semantics 时，停止吸收。

## Implementation Lanes

本 board 的落地顺序固定为：

1. family runtime attempt contract
2. domain quality projection contract
3. family incident learning loop
4. product operator projection
5. cross-repo domain adoption

这个顺序保证先冻结 owner split，再把 runtime、quality、incident 三个核心面分开落地，最后才聚合到用户可见投影和各 domain repo。

## Default Entry

后续 agent / maintainer 做外部编排学习时，从本文件开始，再进入相应合同：

- `docs/references/family-runtime-attempt-contract.md`
- `docs/references/family-domain-quality-projection-contract.md`
- `docs/references/family-incident-learning-loop.md`
- `docs/references/family-product-operator-projection.md`
