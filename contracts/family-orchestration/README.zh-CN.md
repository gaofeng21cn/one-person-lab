[English](./README.md) | **中文**

# Family Orchestration Contracts

这个目录冻结的是当前 active 四仓线（`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`）共享的 family-level orchestration machine-readable companion schemas。

这里吸收的是 `CrewAI` 一类编排框架里最值得复用的思想，但吸收方式是 contract-first，而不是把 `CrewAI` 直接引入为 family runtime dependency，也不是改写现有 owner split：

- Temporal-backed provider 是 Full readiness 的 online runtime substrate，也是 durable orchestration 的生产必需 provider；`Hermes-Agent` 只作为显式非 provider executor/proof diagnostic 或历史 provenance，local provider 只用于 dev/CI/offline diagnostics
- `Codex CLI` 继续是默认具体执行器正式名称，`autonomous` 继续是默认路线模式，除非 domain route 显式选择其他 executor
- `one-person-lab` 持有 Temporal-backed family runtime provider 之上的 typed family queue 与产品控制面，不复制 runtime kernel
- 各 domain 仓继续持有 durable truth、audit truth 与 review truth

这里也吸收 `Ageniti` 最有价值的思想：用一个 app action 定义派生 CLI、MCP、Skill、OpenAI、AI SDK 与 product-entry descriptor。OPL family 采用的是这个 contract 模式，不把 `@ageniti/core` 引入为 runtime dependency。

## 归属边界

`one-person-lab` 在这里负责：

- 顶层 contract 语言
- schema 命名与索引
- 跨 domain 的复用规则

各 domain 仓继续负责：

- 真实 domain dispatch 的接受或拒绝
- 真实 runtime event 的发出
- 真实 checkpoint 的落地
- 真实 action graph 的 domain 语义
- 真实 human review surface
- 真实 product-entry truth

因此，这些 schema 冻结的是跨仓互操作语义，不是某个单体 runtime 实现。

## 当前 companion contract 集

### runtime-oriented

- `family-event-envelope.schema.json`
  - 冻结共享的 event correlation、producer、session、audit reference envelope
- `family-checkpoint-lineage.schema.json`
  - 冻结共享的 checkpoint ancestry、resume 与 state reference envelope

### domain-oriented

- `family-action-graph.schema.json`
  - 冻结共享的 action graph topology、node、edge、human gate 与 checkpoint policy surface
- `family-action-catalog.schema.json`
  - 冻结共享的 callable-action catalog，覆盖 action id、owner、effect、input/output schema refs、source command、supported surfaces、human gates、workspace locator fields 与 authority boundary
- `family-stage-control-plane.schema.json`
  - 冻结共享的 stage descriptor companion，覆盖 stage goal、domain stage refs、skill / prompt / evaluation refs、handoff refs 与 authority boundary
- `family-domain-memory-ref.schema.json`
  - 冻结 domain-owned memory pack 的 locator-only 引用，覆盖 memory family、pack ref、stage applicability、retrieval/writeback/receipt/recall refs、freshness 与 OPL forbidden authority
- `family-domain-memory-writeback.schema.json`
  - 冻结 stage closeout 到 domain memory router 的 proposal / receipt 形状；OPL 只投影 proposal 与 receipt refs，accept/reject 由 domain router 决定
- `family-human-gate.schema.json`
  - 冻结共享的 human-review gate request / decision / resume surface
- `family-product-entry-manifest-v2.schema.json`
  - 冻结共享的 product-entry discovery surface，可指向 graph、action catalog、domain memory descriptor、gate、resume contract、runtime continuity companion、repo-owned runtime control projection，以及 family persistence / lifecycle / owner-route refs

### control-plane-oriented

- `../opl-framework/family-runtime-online-substrate-contract.json`
  - 冻结 provider-backed family runtime 的 owner split、OPL typed family queue / dispatch bridge、stage attempt ledger 与 degraded diagnostics；Hermes 不再作为 provider surface，只保留显式 proof/diagnostic 或历史 provenance 语义
- `family-runtime-supervision.schema.json`
  - 冻结共享的只读 wakeup / supervision projection，覆盖 adapter id、cadence、last success / tick、lease freshness、SLO state、repair command、safe reconcile hint、domain-owned source refs 与 authority boundary
- `family-persistence-policy.schema.json`
  - 冻结共享策略，用来区分 `file_authority`、`sqlite_sidecar_index`、`projection_cache` 与 `source_provenance_only`
- `family-lifecycle-ledger.schema.json`
  - 冻结 lifecycle receipt surface，覆盖 dry-run / apply / verify action、manifest ref、checksum 与 restore proof
- `family-owner-route.schema.json`
  - 冻结 owner-route envelope，覆盖 `route_epoch`、`source_fingerprint`、next owner、allowed actions、idempotency key，以及 handoff / projection refs

## Runtime Continuity Freeze

`family-product-entry-manifest-v2.schema.json` 现在正式冻结 `OPL` 跨三仓消费的 runtime continuity discovery layer。

这个 schema 现在 fail-closed 要求 family caller 必须能发现单一 app skill、runtime control、session continuity、progress projection、artifact inventory 与 runtime loop closure；这些字段只指向 repo-owned truth，不把底层 domain runtime 迁到 `OPL`。

当前 family-level 共享 surface 名称包括：

- `runtime_inventory`
- `task_lifecycle`
- `session_continuity`
- `progress_projection`
- `artifact_inventory`

负责把回路闭合成 runtime continuity truth 的 control reference 包括：

- `runtime_control`
- `runtime_loop_closure`
- 挂在共享 projection surface 里的 repo-owned `research_runtime_control_projection` companion

这样一来，`OPL` 可以继续只消费统一的 session / progress / artifact / restore-point continuity 合同，而底层 runtime truth 与 repo-specific projection 字段仍由各 domain 仓自己持有。

对 `MAS` v2，可消费 projection 锚点是 domain-owned `study_charter`、`evidence_ledger`、`review_ledger`、`publication_eval/latest.json`、AI reviewer artifacts、`StudyTruthKernel` / `RuntimeHealthKernel` 或 truth health reducers / runtime health reducers。OPL only consumes projections, does not issue MAS ready verdicts, and does not hold publication judgment。

## Unified Domain-Agent Descriptor Read Model

`opl agents descriptors --json` 和 `opl agents descriptor --domain <domain> --json` 是当前 admitted domain agent 的统一机器读入口。它们不新增新的 schema family；它们把本目录和 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json` 已冻结的 manifest surfaces 聚合为一个 read model：

- `domain_agent_entry_spec`
- `standard_domain_agent_skeleton`
- `family_action_catalog`
- `family_stage_control_plane`
- `domain_memory_descriptor`
- `skill_catalog`
- `runtime_inventory` / `session_continuity` / `progress_projection` / `artifact_inventory`
- `descriptor_refs`、parity、readiness 与 authority boundary

这个 read model 用于 CLI/App discovery、维护者检查、admission gate 和 operator drilldown。它只承载 refs、status、locator、parity 和 forbidden-authority flags；它不承载 memory 正文、prompt/skill 长正文、domain route 判断、quality verdict、publication/fundability/visual verdict 或 artifact authority。

因此 MAS 的 `mas_publication_route_memory` 可以作为 `domain_memory_descriptor` 被统一 descriptor 发现，但论文套路正文仍由 MAS Markdown-first memory 管理；OPL 只把 operator 带到正确 refs。

## Persistence / Lifecycle / Owner-Route Freeze

family-level persistence 与 lifecycle surface 只属于共享控制面合同。它们让 domain 仓能用同一形状暴露 durable state role、lifecycle receipt 与 next-owner routing，但不把 domain truth 迁入 `OPL`。

共享控制面包括：

- `family_persistence_policy`
  - 标记哪些 surface 是 file authority、SQLite sidecar index、projection cache 或 legacy diagnostic
- `family_lifecycle_ledger`
  - 记录 dry-run / apply / verify lifecycle receipt，并携带 manifest、checksum 与 restore-proof refs
- `family_owner_route`
  - 记录 route epoch、source fingerprint、next owner、allowed actions、idempotency key 与 handoff / projection refs

`family-product-entry-manifest-v2.schema.json` 只增加这些 surface 的可选 discovery refs。stage attempt query 现在也会投影 locator-only lifecycle primitive：workspace/runtime/artifact roots、已索引的 closeout 或 consumed refs、已声明的 restore refs 以及 cleanup gate。这个投影严格只读；`OPL` 可以索引 refs 并显示缺失的 restore proof，但不能 apply retention、删除 artifact、恢复 workspace 内容或写入 domain truth。它不要求 `MAG` 或 `RCA` 第一轮把运行状态迁移到 SQLite，也不把 `MAS` 的 publication evaluation、AI review、paper package 或 readiness authority 移出 `MAS`。同理，`domain_memory_descriptor` 只暴露 locator / freshness / receipt refs，不把 memory content 或 writeback authority 移入 `OPL`。

## Runtime Supervision Freeze

`family-runtime-supervision.schema.json` 冻结 family-level runtime wakeup / supervision 只读投影。它让 `MAS`、`MAG`、`RCA` 以及未来 admitted domain 用同一形状暴露 adapter id、cadence、latest tick、latest success、lease freshness、SLO state、repair command、safe reconcile hint 与 domain-owned source references。

这个 surface 不是 domain scheduler contract。已配置的 family runtime provider 承担 OPL-managed online wakeup / queue / attempt substrate；`OPL` 可以发现、导出、比较、入队、tick 和投影它，用于 parity 与 operator visibility；`OPL` 不因此成为 domain scheduler、session store、memory owner、quality verdict owner 或 artifact authority。`repair_command` 与 `safe_reconcile_hint` 只是把修复动作路由回 domain-owned repair / supervision surface。

## Action Catalog Freeze

`family-action-catalog.schema.json` 是 family callable-action metadata contract。它和 `family-action-graph.schema.json` 的职责分开：

- `family-action-graph` 描述 workflow topology、gate 与 checkpoint policy。
- `family-action-catalog` 描述可调用 action，以及能从这些 action 派生出的 descriptor。

一个 domain-owned action catalog 可以派生：

- CLI command descriptor
- MCP tool catalog descriptor
- Skill command contract descriptor
- product-entry operator-loop action descriptor
- OpenAI function tool descriptor
- AI SDK tool descriptor

`OPL` 只持有 schema、TypeScript/Python mirror helper、manifest discovery、parity check 与只读 `opl actions list|inspect|export` 命令。各 domain 仓继续持有真实 handler、runtime truth、review truth、quality authority、publication / deliverable gates 与任何写入效果。

`MAG` 第一轮可以暴露 `descriptor_only=true`、`public_runtime=false` 的 MCP-compatible descriptor；只有 public MCP runtime entry 经过验证后，才能写成已落地 runtime。

## Stage Control Plane Freeze

`family-stage-control-plane.schema.json` 是从 MAS Stage-Led Autonomy 经验上升出来的 family stage descriptor companion。它只做 descriptor 和 projection，不是 workflow engine。

这个 contract 记录 stage goal、domain-owned stage refs、输入/输出 refs、knowledge refs、skill refs、prompt refs、evaluation refs、handoff metadata、allowed action refs 与 authority boundary。`OPL` 持有 schema、manifest discovery、parity check 和只读 `opl stages list|inspect` 命令。各 domain 仓继续持有实际 route contract、stage execution、memory content、review verdict、quality authority 与 artifacts。

对 `MAS` 来说，这意味着在既有 `scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` route contract 之上做 inventory 与 descriptor projection，不重命名或替换这些 route。对 `RCA` 和 `MAG` 来说，第一轮吸收应保持为现有视觉交付与基金写作 surface 上的轻量 stage-pack projection。

## Domain Memory Ref / Writeback Freeze

`family-domain-memory-ref.schema.json` 与 `family-domain-memory-writeback.schema.json` 补齐的是 stage-led agent framework 需要的记忆引用层。它们只描述 domain-owned memory pack 的 locator、freshness、stage targeting、proposal ref 和 router receipt ref。

`OPL` 可以做：

- discover / index domain memory refs；
- 在 stage attempt packet 中携带 `knowledge_refs`；
- 在 operator workbench 中展示 consumed refs、writeback proposal refs、accepted/rejected receipt refs；
- 检查 freshness 和 forbidden authority。

`OPL` 不可以做：

- 存储或改写 domain memory 正文；
- 把 memory card 提升为 evidence / review / grant / visual truth；
- 接受或拒绝 memory writeback；
- 依据 memory ref 生成 publication、fundability、visual quality 或 artifact readiness verdict。

MAS 的 `publication_route_memory`、MAG 的 grant strategy memory、RCA 的 visual pattern memory 都应通过各自 domain manifest 暴露 locator/receipt refs；正文、路由判断、质量 gate 和 artifact authority 保持在 domain 仓。

## 这个目录不冻结什么

这个目录不负责：

- 统一某一套 LLM wrapper
- 统一某一套 `Crew` / `Agent` / `Memory` runtime object model
- 固定某个具体模型家族
- 把 `OPL` 改写成 domain-owned truth 的 runtime owner
- 暗示跨仓 runtime core ingest 已经完成

## 预期吸收路径

- `one-person-lab`
  - 负责发布 contract 语言、schema 与 reference wording
- `med-autoscience`
  - 优先吸收 `family event envelope`、`family checkpoint lineage`、`family human gate`，并作为 persistence / lifecycle / owner-route 与 action catalog 的完整参考 adapter
- `med-autogrant`
  - 优先吸收 `family action graph`、`family action catalog`、`family human gate`、`family product-entry manifest v2`，并在现有 runtime-control 与 grant-progress surfaces 上提供轻 adapter
- `redcube-ai`
  - 优先吸收 `family product-entry manifest v2`，以及围绕 operator loop continuity 的 action-catalog / action-graph / gate 语义，并提供 managed-run/session/review projection 的厚 adapter

## 相关文档

- [Shared Runtime Contract](../../docs/active/shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](../../docs/active/shared-domain-contract.zh-CN.md)
- [吸收 CrewAI 的收编说明](../../docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md)

## 文件

- [`family-event-envelope.schema.json`](./family-event-envelope.schema.json)
- [`family-checkpoint-lineage.schema.json`](./family-checkpoint-lineage.schema.json)
- [`family-action-graph.schema.json`](./family-action-graph.schema.json)
- [`family-action-catalog.schema.json`](./family-action-catalog.schema.json)
- [`family-stage-control-plane.schema.json`](./family-stage-control-plane.schema.json)
- [`family-domain-memory-ref.schema.json`](./family-domain-memory-ref.schema.json)
- [`family-domain-memory-writeback.schema.json`](./family-domain-memory-writeback.schema.json)
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-runtime-supervision.schema.json`](./family-runtime-supervision.schema.json)
- [`family-persistence-policy.schema.json`](./family-persistence-policy.schema.json)
- [`family-lifecycle-ledger.schema.json`](./family-lifecycle-ledger.schema.json)
- [`family-owner-route.schema.json`](./family-owner-route.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
