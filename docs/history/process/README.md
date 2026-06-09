# 过程历史归档

Owner: `One Person Lab`
Purpose: `history_process_archive_index`
State: `history_only`
Machine boundary: 本目录是人读过程历史索引。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实验证 evidence。

本目录收纳已经完成或被取代的实施计划、设计草稿和 Superpowers 生成的过程材料。

这些文件只用于审计、迁移回顾和来源追溯，不是 `OPL` 当前实现合同。旧双语计划、旧路径和旧命令保留为历史证据；`docs/**` 当前只维护中文 canonical 内容。

当前真相统一回到：

- [文档索引](../../README.md)
- [项目概览](../../project.md)
- [当前状态](../../status.md)
- [架构](../../architecture.md)
- [硬约束](../../invariants.md)
- [关键决策](../../decisions.md)
- [活跃规格](../../specs/)；当前无活跃 specs 时回到核心五件套和 `docs/active/`

## 归档分区

- [Plans](./plans/)：已经完成或被取代的 implementation plans、planning freeze、closeout brief 和过程归档；其中 `Goal`、`current`、`next` 和 checkbox task 均按历史文件日期阅读。
- [Specs](./specs/)：已被当前产品边界取代的历史设计规格，包括 Product API / ACP native 形成过程。
- [Convergence Governance](./convergence-governance/)：已退出 active/reference 层的四仓同步、executor 评估、用户面成熟度和外部 orchestration learning 快照。
- [Domain Admission](./domain-admission/)：已完成的 candidate workstream closeout、Phase 1/2 activation package、central reference sync board 和 ecosystem owner-line 过程记录。
- [Shared Boundary](./shared-boundary/)：已吸收的 shared-foundation framing 页面；其中 owner split 已迁入当前 active owner surface。
- [Superpowers](./superpowers/)：早期 worker flow 生成的 plan/spec 过程材料。

## 边界

当前仍留在 `docs/specs/` 的只有活跃 runtime / product-boundary 规格；如果 specs 索引为空，说明当前规格真相已经收敛到核心五件套、`docs/active/`、runtime-substrate roadmap 和机器可读合同。
新增一次性规划材料在完成、被取代或退出活跃工作面后，应迁入本目录。

## 近期归档主题

顶层索引只保留主题级 provenance，避免恢复逐日 closeout 长清单。
完整逐文件历史索引继续维护在 [Plans](./plans/README.md)。

| Theme | Compressed read | Current owner |
| --- | --- | --- |
| OPL series docs governance | OPL series docs-governance dated ledger chain has been folded into one rollup; future coverage records should stay topic-level and repo-local. | Each repo active owner docs, core docs, contracts/source/tests/read-model, repo-local process index, git history |
| Public whitepaper and command surface | Whitepaper lifecycle metadata is source-first; command-surface wording has been separated from retired Gateway/frontdoor route vocabulary. | `docs/public/whitepaper/opl-whitepaper.source.json`, generated whitepaper artifacts, contracts/source/tests/CLI read-model |
| Retired active vocabulary and compatibility surfaces | Active `frontdoor` machine fields, old owner-map route vocabulary, App release-boundary prose oracle, Homebrew tap PR compatibility wording, and similar compatibility surfaces are retired or guarded. | Current contracts/source/tests/validators, App release owner surfaces, history/tombstone provenance |
| Active gap and design-audit compression | Active gap proof ledgers, purpose-first audit snapshots, MVP-friction diagnostic lists, proof transcripts, branch/worktree logs, and dated readout tables were compressed into current active/support owners plus historical provenance. | `docs/active/current-state-vs-ideal-gap.md`, active support docs, core five docs, live CLI/read-model |
| App/workbench and framework split provenance | Framework/App/shell split and earlier active-ledger consolidation remain historical background only. | `docs/product/`, App repo contracts/release evidence, core docs, live contracts/read-model |
| Standard agent and cross-repo design audit | MAS/MAG/RCA/OMA design-consistency snapshots only preserve provenance; current conformance and production tail must be read from live OPL read-models and repo-local active docs. | OPL read-models, domain repo active owner docs, contracts/source/tests |
