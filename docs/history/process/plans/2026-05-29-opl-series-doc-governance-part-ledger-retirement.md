# 2026-05-29 OPL Series Per-Part Governance Ledger Retirement

Owner: `One Person Lab`
Purpose: `process_ledger_retirement`
State: `history_provenance`
Machine boundary: 本文只记录一次 docs/history 清理。当前 truth 继续归 active owner docs、核心五件套、contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/operator projection。
Date: `2026-05-29`

## Scope

本轮延续 OPL series 文档治理 `/goal`，在 `one-person-lab` 主仓内退役同日生成的 per-part governance ledger shard：

- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-2.md`
- ...
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-79.md`

这 78 个文件只保存过程碎片、命令流水、当时的 read-model 计数、当时的 branch/worktree 状态和下一轮写入范围。它们已经由 active truth owner、核心五件套、live source/contracts/tests/read-model 与历史索引中的 compact provenance 取代。

## Evidence

- `one-person-lab` 主仓在编辑前为 `main...origin/main` clean。
- `git ls-files 'docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-*.md'` 确认共有 78 个 tracked shard。
- `rg` 在 `src`、`tests`、`contracts`、`package.json` 和 `scripts` 中未发现这些 shard 的引用。
- 活跃面引用只剩 `docs/history/process/plans/README.md` 的逐文件长索引，以及 `2026-05-29-opl-active-development-portfolio-ledger-foldback.md` 中对已退役 part-4 ledger 的历史提及。

## Change

| File or group | Action |
| --- | --- |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-2.md` through `part-79.md` | Deleted. |
| `docs/history/process/plans/README.md` | Replaced 78 per-part index rows with this single compact retirement entry. |
| `docs/history/process/plans/2026-05-29-opl-active-development-portfolio-ledger-foldback.md` | Reworded the historical part-4 reference so it no longer points to a deleted file. |

## Current Reading

Deleting the shard files does not delete current truth. Current truth remains:

- OPL current state and gaps: `docs/active/current-state-vs-ideal-gap.md`.
- Core project truth: `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`.
- Docs lifecycle owner: `docs/docs_portfolio_consolidation.md`.
- Machine truth: contracts, source, tests, CLI/read-model output, runtime ledger, provider receipts and domain-owned manifests.

The retired shard set must not be reconstructed as an active queue, compatibility surface, current readiness oracle, domain production evidence, App release evidence, or global `/goal` completion proof.

## Coverage

Reviewed in this tranche:

- `docs/history/process/plans/README.md`
- `docs/history/process/plans/2026-05-29-opl-active-development-portfolio-ledger-foldback.md`
- tracked per-part ledger file list
- source/contracts/tests/script reference scan for per-part ledger filenames
- six-repo dirty-state boundary from this automation run

Deferred in this tranche:

- Full six-repo README/docs section coverage remains open under the global `/goal`.
- `med-autoscience`, `med-autogrant`, `redcube-ai`, and `one-person-lab-app` had existing dirty work in this automation run and were not edited.

## Next Scope

Continue from fresh live truth. If no safe stale source/test/module surface is available in clean repos, continue paragraph-level docs coverage from the active gap plan and docs portfolio owner. Do not restore the deleted per-part ledger shards; add only compact provenance when a future tranche needs a durable record.
