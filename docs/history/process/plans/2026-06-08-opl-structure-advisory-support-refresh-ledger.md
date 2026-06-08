# 2026-06-08 OPL Structure Advisory Support Refresh Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_structure_advisory_support_refresh_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage / compression ledger。当前 family structure advisory truth 继续归 `scripts/family-structure-advisory.mjs`、`package.json` `family:structure-advisory` script、`tests/src/family-structure-advisory.test.ts`、fresh generated output、repo-local source/tests/contracts 和 repo-native verification。

## Scope

本轮延续 OPL Doc Governance `/goal`，只覆盖 OPL `operating-governance` 里的 family structure advisory support snapshot。全局六仓 README/docs body-level coverage 仍未关闭，本 ledger 不声明 OPL series docs governance complete。

| Item | Handling |
| --- | --- |
| Semantic theme | OPL family structure advisory 如何表达 source-shape / public-surface / verify-entry review queue，而不把 line count、fresh scan 或 past landing evidence 写成 fail-closed backlog、domain ready、production ready 或 physical delete authorization。 |
| Single Source of Truth | 扫描 scope、分类规则、threshold、默认 excluded repos 和 markdown/json 输出归 `scripts/family-structure-advisory.mjs`；command exposure 归 `package.json`；coverage guard 归 `tests/src/family-structure-advisory.test.ts`。 |
| Support doc role | `docs/references/operating-governance/family-structure-advisory-report.md` 只保留当前 fresh advisory snapshot、reading rules、repo disposition 和可测 one-person-lab detail。 |
| Edited docs | `docs/references/operating-governance/family-structure-advisory-report.md`、本 ledger 与 `docs/history/process/plans/README.md`。 |

## Reviewed Surfaces

| Area | Reviewed evidence |
| --- | --- |
| Governance inputs | `AGENTS.md`、`TASTE.md`、OPL Doc skill、`docs/docs_portfolio_consolidation.md`、`docs/active/current-state-vs-ideal-gap.md`。 |
| Support references | `docs/references/operating-governance/README.md`、`docs/references/operating-governance/family-structure-advisory-report.md`。 |
| Machine source / tests | `scripts/family-structure-advisory.mjs`、`package.json` `family:structure-advisory`、`tests/src/family-structure-advisory.test.ts`。 |
| Fresh generated output | `npm run --silent family:structure-advisory -- --format=json` from `2026-06-08T09:10:19Z` in the root OPL checkout after fast-forward revalidation. |
| History index | `docs/history/process/plans/README.md` for support-refresh ledger discovery and current owner pointer. |

## Coverage Result

- The support report now records fresh `2026-06-08` summary counts instead of preserving stale `2026-06-07` counts.
- The support report keeps `one-person-lab` detailed `public_surface_risk` entries because the focused test guards this list against generated single-repo output.
- The support report no longer carries long 2026-06-06 / 2026-06-07 landing-evidence and verification-command chronology as current reference body.
- Current structure advisory readout is explicitly advisory-only: no mechanical residue or missing verify entry exists in the eleven-repo scan, but source-shape queues now exist again for `one-person-lab`、`med-autoscience` and `med-autogrant`.
- Root revalidation after the first push observed MAS drift from 33 to 34 `needs_design_pass` items, adding `src/med_autoscience/controllers/study_progress_parts/progress_first_monitoring/summary.py`; the support report now records the root-checkout fresh readout rather than the earlier isolated-worktree count.
- Remaining source-shape work is routed to owner-boundary review in the owning repo lanes; this OPL docs tranche does not authorize physical deletion, forced shards, domain ready claims or production ready claims.

## Retired / Guarded Stale Readings

| Stale reading | Current handling |
| --- | --- |
| `one-person-lab` has no source-shape queue | Retired; fresh scan now reports 16 OPL `needs_design_pass` items. |
| `med-autoscience` residual queue is only 21 near-budget semantic part files | Retired; fresh root-checkout scan reports 34 MAS `needs_design_pass` items including over-1000 source/test files and progress-first monitoring residue. |
| `med-autogrant` has no source-shape queue | Retired; fresh scan now reports `src/med_autogrant/opl_standard_pack.py`. |
| Historical landing commit lists as current structure truth | Compressed into this history ledger; current reference points to fresh generated output and owner-boundary disposition. |
| Advisory finding as fail-closed blocker or production/domain readiness claim | Guarded by support report reading rules and machine `advisory_only=true` output. |

## Uncovered Scope

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: other operating-governance docs, runtime-substrate docs, active support docs, history clusters, root README variants and remaining non-exact-covered docs remain under the global `/goal`.
- `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`: no body-level edits in this tranche. Their source-shape queues require fresh repo-owner lanes before commit-bound action.
- Physical source splitting, contract modularization, generated schema/source separation and no-active-caller retirement were not performed here.

## Next Write Scope

Continue OPL support-reference coverage from fresh live truth. A natural next OPL lane is to choose one of the fresh OPL-owned source-shape items from the structure advisory queue, read its callers/tests, and either split by semantic owner boundary or record why it remains an approved reviewed baseline. Cross-repo MAS/MAG/RCA/App source-shape action should only happen from clean, owner-approved repo lanes.

## Verification

Minimum verification for this tranche:

- `git diff --check`
- conflict-marker scan over `README* docs`
- `npm run --silent family:structure-advisory -- --format=json`
- `node --experimental-strip-types --test tests/src/family-structure-advisory.test.ts`
- OPL Doc doctor JSON output for the OPL repo

This ledger is history/provenance only. It does not close the global `/goal`.
