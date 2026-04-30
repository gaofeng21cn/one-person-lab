# OPL Family External Orchestration Learning Board 2026-04-30

## Purpose

这份 board 把 `MAS` 从外部 agent / orchestration 项目吸收的经验，提升为 `OPL` family 的长期学习入口。它记录方法和边界，不把医学语义、外部 scheduler、外部 tracker 或 persona 库升级成 `OPL` owner。

默认参考来源：

- `MAS` intake：`med-autoscience/docs/program/external_agent_orchestration_learning_intake_2026_04_30.md`
- `openai/symphony@58cf97d`
- `msitarzewski/agency-agents@783f6a7`
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
- `saturated`：已有 `OPL` / `MAS` / `MAG` / `RCA` 等价合同，后续只追加 provenance，不再重复实现。

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
