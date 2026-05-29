# OPL Series Structure Advisory Ledger

Owner: `One Person Lab`
Purpose: `process_ledger`
State: `historical_archive`
Machine boundary: 本文只记录 automation-2 本轮 structure advisory workflow / support-doc cleanup。当前 truth 继续归 active owner docs、contracts/source/tests、CLI/read-model、runtime ledger 和 domain-owned manifests。

## Run Scope

- `RUN_SNAPSHOT_TS`: `2026-05-29T17:51:05Z`
- 本轮 tranche: `one-person-lab` operating-governance structure advisory workflow currentness cleanup。
- 覆盖文档: `docs/references/operating-governance/family-structure-advisory-report.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/active/current-state-vs-ideal-gap.md`、`docs/status.md`、`docs/README.md`、root `README.md`、history process index。
- 覆盖机器面: `scripts/family-structure-advisory.mjs`、`package.json` `family:structure-advisory` script、`tests/src/family-structure-advisory.test.ts`、fresh `family:structure-advisory` JSON/Markdown output。

## Frozen Inventory

- `one-person-lab`: clean/synced at `b88531d3a2e3`; only root worktree; snapshot-window recent writes came from prior automation docs tranche and `.officecli/config.json`.
- `med-autoscience`: root `main` clean but ahead `origin/main` by 16 at `4e0ee8f4da74`; long-running `scripts/verify.sh structure` and `opl quality details --root med-autoscience` processes retained.
- `med-autogrant`: clean/synced at `3fc5041c645e`; snapshot-window recent docs / plugin marketplace writes from prior governance tranche retained.
- `redcube-ai`: root dirty/synced at `7586ffcb89d2`; multiple dirty native-PPT / RCA worktrees and snapshot-window writes retained.
- `opl-meta-agent`: clean/synced at `59e216dd37a3`; snapshot-window docs portfolio write from prior governance tranche retained.
- `one-person-lab-app`: root dirty/synced at `eadbde57adeb`; `codex/full-first-run-stable-gate-20260525` worktree dirty and remote-backed; retained.
- Open PRs: `one-person-lab`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, and `one-person-lab-app` all read as `[]` after retry for transient GitHub EOF / connection reset.

## Live Evidence

Fresh OPL-only command:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

Readout:

- `advisory_only=true`
- `tracked_files=1019`
- `code_files_scanned=755`
- `missing_verify_entry=false`
- `needs_design_pass=9`
- `mechanical_residue=0`
- `public_surface_risk=3`

Fresh default command after the workflow fix resolves the current six repo names: `one-person-lab`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, and `one-person-lab-app`. Exact non-OPL findings were not folded into current docs because snapshot-retained repos were dirty, ahead, recently written, or process-active.

## Change

- `scripts/family-structure-advisory.mjs` default scope now follows the current OPL series six repos and removes the stale default `med-deepscientist` target.
- `docs/references/operating-governance/family-structure-advisory-report.md` now records OPL-only fresh counts, current OPL design-pass inputs, and a clean/snapshot-safe refresh rule for non-OPL repos.
- Old detailed `med-autogrant`, `med-deepscientist`, and `one-person-lab-app` advisory lists from the 2026-05-26 snapshot were removed from the active report body; they remain historical provenance only.
- `tests/src/family-structure-advisory.test.ts` now guards the current default six-repo scope and keeps the tracked OPL `public_surface_risk` list aligned with generated OPL-only output.

No domain source, contracts, runtime interfaces, workflows, CLI aliases, module APIs, or domain tests were retired in this tranche beyond the stale advisory default target and stale report body.

## Retained Public Surfaces

The OPL `public_surface_risk` list remains advisory only:

- `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`
- `contracts/opl-framework/agent-lab-contract.json`

These are retained because they are active machine-readable public surfaces. Future edits should prefer schema modularity or generated/source separation over growth, but this tranche did not split them.

## Carry Forward

- Re-run structure advisory for MAS/MAG/RCA/OMA/App only from clean or explicitly owner-approved snapshot-safe roots before committing exact findings.
- Continue auditing OPL support references for fixed counters, legacy default scope, dated proof snapshots, receipt IDs, branch/SHA state, local proof paths, and retired repo names.
- Snapshot-retained lanes remain for MAS ahead-main work, RCA dirty/native-PPT worktrees, MAG/OMA prior-tranche recent writes, and App dirty root/full-first-run worktree.
