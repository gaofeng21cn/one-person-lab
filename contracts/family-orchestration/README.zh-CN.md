[English](./README.md) | **中文**

# Family Orchestration Contracts

这个目录冻结的是 `OPL` 四仓主线共享的 family-level orchestration machine-readable companion schemas。

这里吸收的是 `CrewAI` 一类编排框架里最值得复用的思想，但吸收方式是 contract-first，而不是把 `CrewAI` 直接引入为 family runtime dependency，也不是改写现有 owner split：

- `Hermes-Agent` 继续只是外部 runtime substrate 方向
- `Codex CLI` 继续是家族默认执行器正式名称，`autonomous` 继续是默认路线模式
- 各 domain 仓继续持有 durable truth、audit truth 与 review truth

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
- `family-human-gate.schema.json`
  - 冻结共享的 human-review gate request / decision / resume surface
- `family-product-entry-manifest-v2.schema.json`
  - 冻结共享的 product-entry discovery surface，可指向 graph、gate、resume contract、runtime continuity companion，以及 repo-owned runtime control projection

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

## 这个目录不冻结什么

这个目录不负责：

- 统一某一套 LLM wrapper
- 统一某一套 `Crew` / `Agent` / `Memory` runtime object model
- 固定某个具体模型家族
- 把 `OPL` 改写成 domain harness 的 runtime owner
- 暗示跨仓 runtime core ingest 已经完成

## 预期吸收路径

- `one-person-lab`
  - 负责发布 contract 语言、schema 与 reference wording
- `med-autoscience`
  - 优先吸收 `family event envelope`、`family checkpoint lineage`、`family human gate`
- `med-autogrant`
  - 优先吸收 `family action graph`、`family human gate`、`family product-entry manifest v2`
- `redcube-ai`
  - 优先吸收 `family product-entry manifest v2`，以及围绕 operator loop continuity 的 action-graph / gate 语义

## 相关文档

- [Shared Runtime Contract](../../docs/shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](../../docs/shared-domain-contract.zh-CN.md)
- [吸收 CrewAI 的收编说明](../../docs/references/family-orchestration-contract-absorb-crewai.md)

## 文件

- [`family-event-envelope.schema.json`](./family-event-envelope.schema.json)
- [`family-checkpoint-lineage.schema.json`](./family-checkpoint-lineage.schema.json)
- [`family-action-graph.schema.json`](./family-action-graph.schema.json)
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
