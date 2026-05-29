# OPL Series Doc Governance Ledger - Domain Memory Support Reference

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_domain_memory_support_reference_ledger`
State: `historical_archive`
Machine boundary: 本文只记录本轮文档治理覆盖、证据、阻塞与下一轮写入范围。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 与各 domain owner receipt。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T19:29:34Z`
- Local snapshot time: `2026-05-30T03:29:34+0800`
- Frozen scope: OPL series 6 repo inventory at snapshot only. Snapshot-after activity is next heartbeat intake and did not expand this tranche.

## Frozen Repo / Lane Inventory

| Repo | Snapshot state | Handling |
| --- | --- | --- |
| `one-person-lab` | Root `main` clean/synced at `73b433458877`; extra worktree `.worktrees/github-ci-20260530-opl-queuehold` on `fix/github-ci-20260530-opl-queuehold`, tracking `origin/main`, ahead 1 / behind 2, and snapshot/proximal writes in the queuehold lane. | Root `main` selected for docs-only tranche. Queuehold lane retained. |
| `med-autoscience` | Root `main` clean but ahead `origin/main` by 17 at `9a225c4e`; worktree `.worktrees/github-ci-20260530-mas-preflight` dirty in `src/med_autoscience/dev_preflight_contract.py` and `tests/test_dev_preflight_contract.py`, with recent/post-snapshot writes. | Retained as dirty/recent external lane. |
| `med-autogrant` | Clean/synced at `3fc5041`. | No write in this tranche. |
| `redcube-ai` | Root clean but ahead `origin/main` by 1 at `2f3e9ce`; recent dist/source writes in snapshot window. | Retained as post-snapshot / external lane; no absorb or cleanup. |
| `opl-meta-agent` | Clean/synced at `59e216d`. | No write in this tranche. |
| `one-person-lab-app` | Root dirty/synced at `eadbde5` with App shell/status/docs/script files; dirty remote-backed `.worktrees/codex/full-first-run-stable-gate-20260525` on `codex/full-first-run-stable-gate-20260525`. | Retained as dirty/remote-backed App lane. |

Open PR check returned `[]` for OPL, RCA, OMA and App. MAS and MAG GraphQL queries hit GitHub connection reset during initial inventory; they were not used to justify cleanup. No process scan hit for this docs-only lane.

## Tranche Scope

This tranche only governs the OPL operating-governance domain-memory support reference:

- Edited: `docs/references/operating-governance/family-domain-memory-governance.md`
- Added: this ledger
- Updated: `docs/history/process/plans/README.md`
- Reviewed as context: `docs/references/operating-governance/README.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/active/current-state-vs-ideal-gap.md`, `contracts/family-orchestration/family-domain-memory-ref.schema.json`, `contracts/family-orchestration/family-domain-memory-writeback.schema.json`, `src/family-domain-memory.ts`, domain-memory CLI read-model output.

No source, contract, test, workflow, worktree, branch, remote branch, App lane, MAS lane or RCA lane was absorbed or deleted.

## Fresh Evidence

Fresh `./bin/opl domain-memory list --json` at this run returned:

- `total_projects_count=3`
- `resolved_memory_descriptor_count=3`
- `missing_memory_descriptor_count=0`
- `runtime_receipt_evidence.closeout_count=1360`
- `consumed_memory_ref_count=1`
- `writeback_receipt_ref_count=4`
- `rejected_write_count=1015`
- `opl_writes_memory_body=false`

Fresh inspect samples:

- MAS: descriptor resolved, memory ref `mas_publication_route_memory`, `retrieval_apply_landed=false`, `writeback_apply_landed=false`, `memory_body_migration_landed=false`, `opl_accepts_or_rejects_memory_writeback=false`, `opl_applies_memory_writeback=false`.
- MAG: descriptor resolved, memory ref `mag_grant_strategy_memory`, runtime receipt evidence observed with consumed/writeback refs, and OPL non-authority flags false.
- RCA: descriptor resolved, memory ref `rca_visual_pattern_memory`, runtime writeback pending in descriptor status, and OPL non-authority flags false.

The schema/source evidence confirms OPL only projects locator/proposal/receipt refs and runtime receipt evidence:

- `family-domain-memory-writeback.schema.json` describes OPL as proposal transport / receipt projection only.
- `src/family-domain-memory.ts` builds `RuntimeReceiptEvidence` with `opl_writes_memory_body=false`, `opl_accepts_or_rejects_memory_writeback=false`, and `opl_applies_memory_writeback=false`.

## Changes

- Replaced the support doc's dated / execution-ledger-like `现在适合落地`, `当前完成度`, `下一步收口顺序`, and `下一阶段再做` sections with stable `支撑面与动态证据入口` plus `证据门与长期候选`.
- Moved dynamic counters and per-domain evidence into this history ledger, not the long-lived support reference.
- Preserved the natural-language memory vs strong-contract classification and domain owner boundary.
- Re-emphasized that descriptor projection, runtime receipt evidence, App/operator projection and framework attention lenses do not imply retrieval apply, writeback apply, memory body migration, domain ready, production ready, App release ready, artifact authority or quality/export verdict.

## Retirements / No-Resurrection Notes

- Retired reading `family-domain-memory-governance.md` as a current execution ledger or completion table.
- Retired stale single-proof / dated-proof wording as current family-memory truth.
- Retired any reading that OPL can own memory body, accept/reject writeback, apply memory migration, write domain truth, choose visual/fundability/publication route, or authorize quality/export verdict.
- No public CLI entry, code module, test, workflow, worktree or branch was retired.

## Verification

Commands were run after edits on `one-person-lab` `main`:

- `rtk ./bin/opl domain-memory list --json`
- `rtk ./bin/opl domain-memory inspect --domain mas --json`
- `rtk ./bin/opl domain-memory inspect --domain mag --json`
- `rtk ./bin/opl domain-memory inspect --domain rca --json`
- `rtk node --experimental-strip-types --test tests/src/cli/cases/workspace-domain.memory.test.ts tests/src/cli/cases/runtime-app-operator-drilldown.test.ts`
- `rtk git diff --check`
- `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs/**/*.md`
- `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json`
- `rtk ./scripts/verify.sh line-budget`

Final command results are recorded in automation memory for this run.

## Coverage Ledger

- Snapshot repo inventory covered: all six default OPL series repos.
- Snapshot worktree/branch scope covered: OPL root and OPL/MAS/App retained worktrees plus RCA ahead root lane were classified.
- Source/contracts/tests/docs audited: OPL domain-memory support reference and relevant contract/source/read-model/test surfaces listed above.
- Source/contracts/tests/docs changed: only the support reference, this ledger and history process index.
- Archived/tombstoned/deleted docs: none.
- Retired modules/interfaces/tests/entries: none.
- Retained public surfaces: `opl domain-memory list|inspect|migration-plan`, App/operator memory refs, framework readiness and evidence-worklist.
- Uncovered docs in this tranche: remaining `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/runtime/**`, current-support docs and the other five repos' README/docs body-level audits.
- Snapshot blockers retained: OPL queuehold worktree, MAS ahead/dirty preflight lane, RCA ahead/recent lane, App root dirty and App full-first-run worktree.
- `post_snapshot_activity`: OPL queuehold wrote after snapshot, MAS preflight wrote after snapshot, and RCA had recent dist/source output; none expanded this tranche.
- Next write scope: continue OPL runtime-substrate / operating-governance support-reference cleanup for fixed counters, dated proof snapshots, branch/SHA anchors, local proof paths, stale provider/MDS wording, App release shortcuts and compatibility promises; separately fresh-intake MAS, RCA and App retained lanes before any absorb/cleanup decision.
