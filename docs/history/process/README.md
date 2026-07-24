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
历史计划子目录索引也只保留主题级读法；文件级细节保留在原历史正文和 git history，不再维护逐文件 current-owner 长表。

| Theme | Compressed read | Current owner |
| --- | --- | --- |
| OPL series docs governance | OPL series docs-governance dated ledger chain has been folded into one rollup; future coverage records should stay topic-level and repo-local. | Each repo active owner docs, core docs, contracts/source/tests/read-model, repo-local process index, git history |
| Public whitepaper and command surface | Whitepaper lifecycle metadata is source-first; command-surface wording has been separated from retired Gateway/frontdoor route vocabulary. | `docs/whitepapers/opl-whitepaper.md`, `contracts/whitepaper_profile.json`, generated whitepaper artifacts, contracts/source/tests/CLI read-model |
| Retired active vocabulary and compatibility surfaces | Active `frontdoor` machine fields, old owner-map route vocabulary, App release-boundary prose oracle, Agent Lab RHO/workflow docs-prose oracle, family structure advisory generated-risk prose oracle, Homebrew tap PR compatibility wording, and similar compatibility surfaces are retired or guarded. Narrative docs may point to contracts, but tests must keep machine acceptance on contracts/source/CLI/read-model rather than exact Markdown wording or generated file lists copied into Markdown. | Current contracts/source/tests/validators, App release owner surfaces, Agent Lab contracts/CLI/read-model, structure advisory source/JSON output, history/tombstone provenance |
| Retired production-closeout command surface | `framework production-closeout` and the earlier `family-runtime production-closeout` were old aggregate closeout/readiness surfaces. Current production-tail truth is split into owner-delta-first `framework readiness`, W7 `framework operating-maturity`, `family-runtime evidence-worklist`, App/operator drilldown, provider long-soak evidence, Brand L5 status, and domain/App owner receipts or typed blockers. | `docs/status.md`, `src/cli/main.ts` retired-command guard, `framework operating-maturity` source/tests, `framework readiness` source/tests, live CLI/read-model |
| Active gap and design-audit compression | Active gap proof ledgers, purpose-first audit snapshots, MVP-friction diagnostic lists, proof transcripts, branch/worktree logs, and dated readout tables were compressed into current active/support owners plus historical provenance. | `docs/active/current-state-vs-ideal-gap.md`, active support docs, core five docs, live CLI/read-model |
| App/workbench and framework split provenance | Framework/App/shell split and earlier active-ledger consolidation remain historical background only. | `docs/product/`, App repo contracts/release evidence, core docs, live contracts/read-model |
| Standard agent and cross-repo design audit | MAS/MAG/RCA/OMA design-consistency snapshots only preserve provenance; current conformance and production tail must be read from live OPL read-models and repo-local active docs. | OPL read-models, domain repo active owner docs, contracts/source/tests |
| Package Manager supersession | Durable 轻量 transaction、通用 lock/LKG/receipt/closure manager 和固定 Package/Skill inventory 已归档；只保留幂等、局部失败、fresh inspect/reconcile、external drift 与单文件/用户数据保护原则。 | `docs/architecture.md`, `docs/decisions.md`, `docs/active/opl-package-platform-composition-migration.md`, configured carrier fresh readback, [historical decision](./plans/2026-07-24-package-manager-superseded-designs.md) |
| Runtime environment substrate evidence foldback | Runtime environment bundle/cache target design no longer carries 2026-06-21 command transcripts, branch/worktree state, MAS Gallery dependency prepares, App shell validation outputs, adoption percentages or proof-ledger tables. Those records are historical provenance only; current runtime environment truth is read from the contract, source, focused tests and `opl runtime env * --json`, while domain/App/release claims stay with their owner repos. | `docs/active/runtime-environment-bundle-cache-target-design.md`, `contracts/opl-framework/runtime-environment-substrate-contract.json`, `src/runtime-environment-substrate.ts`, live CLI/read-model and repo-local owner surfaces |
| Status currentness proof ledger compression | `docs/status.md` no longer freezes dated GitHub Actions run ids, sibling repo clean-current SHAs, external-owner ahead/behind notes or absorption-audit outcomes. Those are high-drift currentness evidence and must be reread from the owning repo or release surface before any currentness/CI/release claim. | `docs/status.md`, `docs/references/operating-governance/family-live-evidence-maintenance.md`, owning repo git/CI/release readbacks, git history |
| Runtime transition readback follow-through compression | `docs/decisions.md` no longer carries the full dated 2026-06-18 through 2026-06-20 implementation chain for DomainProgressTransitionRuntime physical JSONL readback, replay audit, current-control provider admission, enqueue canonicalization or terminal-consumed projection. The active decision keeps only the durable SSOT rule: complete command/event/outbox transaction plus outbox and StageRun identity, fail-closed incomplete projection, and no domain/provider/paper-ready authority. | `docs/decisions.md`, `docs/status.md`, `docs/invariants.md`, `contracts/opl-framework/*`, `src/family-runtime-*`, focused tests, live CLI/read-model, git history |
| Foundry target and Stage-route decision follow-through compression | Foundry target architecture remains active support, not a second active backlog; current owner truth is split between target architecture contracts, Foundry series contract, active target architecture support, active gap owner and north-star references. The eight-suggestion tracker no longer carries stale lane/pending wording, and `docs/decisions.md` keeps Stage-route / Foundry Agent OS follow-through as durable rules rather than dated field-level implementation chains. | `contracts/opl-framework/target-operating-architecture-contract.json#foundry_agent_os_standard`, `contracts/opl-framework/foundry-agent-series-contract.json`, `docs/active/current-state-vs-ideal-gap.md`, `docs/active/opl-foundry-agent-target-operating-architecture.md`, `docs/decisions.md`, source/contracts/tests/read-model, git history |
| OPL main docs portfolio coverage 2026-06-12 | Root `README*`, docs-like tracked support `README.md` files, every tracked `docs/*.md` and `docs/**/*.md` have owner routes through `docs/README.md`, `docs/docs_portfolio_consolidation.md`, directory indexes, active owner docs, policy/spec/reference indexes and history indexes. Active/current docs retain `Last reviewed` metadata where they remain current support; dated proof, worktree logs and closeout ledgers stay in history/runtime/git provenance. This is OPL main tranche foldback, not completion of the parent six-repo goal. | `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, core five docs, contracts/source/tests/read-model, repo-local history indexes |
