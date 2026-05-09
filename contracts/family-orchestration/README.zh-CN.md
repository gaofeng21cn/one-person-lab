[English](./README.md) | **中文**

# Family Orchestration Contracts

这个目录冻结的是当前 active 四仓线（`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`）共享的 family-level orchestration machine-readable companion schemas。

这里吸收的是 `CrewAI` 一类编排框架里最值得复用的思想，但吸收方式是 contract-first，而不是把 `CrewAI` 直接引入为 family runtime dependency，也不是改写现有 owner split：

- `Hermes-Agent` 继续只是显式可选 hosted/runtime provider adapter 方向，不是家族默认 runtime 依赖
- `Codex CLI` 继续是家族默认执行器正式名称，`autonomous` 继续是默认路线模式
- 各 domain 仓继续持有 durable truth、audit truth 与 review truth

这里也吸收 `Ageniti` 最有价值的思想：用一个 app action 定义派生 CLI、MCP、Skill、OpenAI、AI SDK 与 product-entry descriptor。OPL family 采用的是这个 contract 模式，不把 `@ageniti/core` 引入为 runtime dependency。

## 归属边界

`one-person-lab` 在这里负责：

- 顶层 contract 语言
- schema 命名与索引
- 跨 domain 的复用规则

各 domain 仓继续负责：

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
- `family-human-gate.schema.json`
  - 冻结共享的 human-review gate request / decision / resume surface
- `family-product-entry-manifest-v2.schema.json`
  - 冻结共享的 product-entry discovery surface，可指向 graph、action catalog、gate、resume contract、runtime continuity companion、repo-owned runtime control projection，以及 family persistence / lifecycle / owner-route refs

### control-plane-oriented

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

## Persistence / Lifecycle / Owner-Route Freeze

family-level persistence 与 lifecycle surface 只属于共享控制面合同。它们让 domain 仓能用同一形状暴露 durable state role、lifecycle receipt 与 next-owner routing，但不把 domain truth 迁入 `OPL`。

共享控制面包括：

- `family_persistence_policy`
  - 标记哪些 surface 是 file authority、SQLite sidecar index、projection cache 或 legacy diagnostic
- `family_lifecycle_ledger`
  - 记录 dry-run / apply / verify lifecycle receipt，并携带 manifest、checksum 与 restore-proof refs
- `family_owner_route`
  - 记录 route epoch、source fingerprint、next owner、allowed actions、idempotency key 与 handoff / projection refs

`family-product-entry-manifest-v2.schema.json` 只增加这些 surface 的可选 discovery refs。它不要求 `MAG` 或 `RCA` 第一轮把运行状态迁移到 SQLite，也不把 `MAS` 的 publication evaluation、AI review、paper package 或 readiness authority 移出 `MAS`。

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
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-persistence-policy.schema.json`](./family-persistence-policy.schema.json)
- [`family-lifecycle-ledger.schema.json`](./family-lifecycle-ledger.schema.json)
- [`family-owner-route.schema.json`](./family-owner-route.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
