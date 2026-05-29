# OPL Series Doc Governance Current Support Index Ledger

Owner: `One Person Lab`
Purpose: `process_ledger`
State: `historical_archive`
Machine boundary: 本文只记录本轮 OPL series governance tranche 的覆盖、证据、保留 lane 和下一轮范围。机器 truth 继续归 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和真实 App/release evidence。

## Run Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T18:18:42Z` / `2026-05-30T02:18:42+0800`
- Frozen scope: `one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`
- Open PRs: `one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai` returned `[]` through `gh pr list`; `opl-meta-agent` and `one-person-lab-app` had `gh pr list` exit 1, then REST `gh api .../pulls?state=open` returned `[]`.

## Frozen Inventory

| repo | snapshot state | retained reason |
| --- | --- | --- |
| `one-person-lab` | `main` clean/synced at `392ae6686bc6`; only root worktree; recent writes from prior automation docs/source tranche. | Selected for current-support index cleanup; no branch/worktree deletion because recent writes were inside the frozen one-hour window. |
| `med-autoscience` | `main` clean, ahead `origin/main` by 16 at `4e0ee8f4da74`; no dirty files. | Retained because ahead lane needs semantic intake and long-running structure / quality-details processes were still open. |
| `med-autogrant` | `main` clean/synced at `3fc5041c645e`; no recent snapshot writes in the root checkout. | No safe stale branch/worktree work in this tranche. |
| `redcube-ai` | `main` clean but ahead `origin/main` by 4 at `d95bcb832acb`; recent native-PPT / runtime-program writes in the snapshot window. | Retained as external RCA native-PPT lane; recent writes and large source/contracts/tests diff require separate semantic intake before push/cleanup. |
| `opl-meta-agent` | `main` clean/synced at `59e216dd37a3`; only root worktree. | No safe stale branch/worktree work in this tranche. |
| `one-person-lab-app` | `main` dirty/synced at `eadbde57adeb`; `codex/full-first-run-stable-gate-20260525` worktree dirty and remote-backed. | Retained as App full-first-run / active-shell lane; no deletion or absorb attempted. |

Post-snapshot activity observed in the selected OPL tranche: none in the selected files.

## Reviewed Surfaces

- Canonical context: `TASTE.md`, `docs/README.md`, `docs/status.md`, `docs/active/current-state-vs-ideal-gap.md`.
- Support references: `docs/references/current-support/README.md`, `docs/references/current-support/opl-default-skill-ecosystem.md`.
- Live skill truth: `src/install-companions/catalog.ts`, `src/opl-skills.ts`, `src/system-installation/codex-plugin-registry.ts`, `./bin/opl skill companion status --json`, `./bin/opl skill list --json`.
- Boundary truth: `docs/invariants.md`, `docs/status.md`.

## Change

Cleaned the current-support index metadata into a single owner/purpose/state/machine-boundary role, added an explicit currentness policy, and replaced the vague `MDS internals 留在 MAS 控制下` row wording with the current boundary: MDS / MAS-internal skills can only be read as MAS-declared optional companion / provenance / audit / oracle material and do not become OPL default system skills. Fresh CLI/source evidence shows OPL companion skills are Superpowers, OfficeCLI/UI/MinerU/Codex-bundled support skills, while MAS/MAG/RCA/OMA use plugin/generated surfaces rather than default companion skill mirrors.

## Coverage Ledger

| category | covered this tranche |
| --- | --- |
| Source/contracts/tests/docs reviewed | current-support index, default skill ecosystem reference, companion skill source, family plugin source, plugin registry source, live skill CLI read-models, core MDS boundary docs |
| Source/contracts/tests/docs changed | `docs/references/current-support/README.md`; this ledger; process history index |
| Archived/tombstoned/deleted docs | none |
| Retired modules/interfaces/tests/entries | none; this tranche retired stale/vague index prose only |
| Public surfaces retained | Current skill CLI/read-model and plugin registry surfaces retained because live source/tests/CLI already separate companion skills from domain plugin/generated surfaces |
| Uncovered docs | Remaining current-support docs beyond the index, plus runtime-substrate/operating-governance docs and non-OPL repo README/docs remain for later semantic audit |
| Snapshot blockers retained | MAS ahead 16 plus long-running processes; RCA ahead 4 with recent native-PPT/runtime-program writes; App dirty root/full-first-run lane; OPL recent-write branch cleanup protection |
| Remaining stale/retire candidates | fixed counters, provider proof snapshots, branch/SHA state, local proof paths, MDS/provider wording, default-scope wording, compatibility promises |
| Next write scope | Continue current-support docs (`opl-quality-details`, `opl-test-lane-governance`, Docker/WebUI) or separately intake MAS/RCA/App retained lanes with fresh frozen scope |

## Verification

Minimum verification should cover whitespace/diff health, conflict-marker absence, OPL doc doctor, and a focused skill/verification governance test because this tranche changes an index claim tied to skill and plugin surfaces.
