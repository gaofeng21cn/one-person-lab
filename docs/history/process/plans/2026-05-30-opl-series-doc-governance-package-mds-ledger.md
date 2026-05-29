# OPL Series Doc Governance Package MDS Ledger

Owner: `One Person Lab`
Purpose: `process_ledger`
State: `historical_archive`
Machine boundary: 本文只记录本轮 OPL series governance tranche 的覆盖、证据、保留 lane 和下一轮范围。机器 truth 继续归 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和真实 App/release evidence。

## Run Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T18:09:49Z` / `2026-05-30T02:09:49+0800`
- Frozen scope: `one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`
- Open PRs at intake: six repos returned `[]`.

## Frozen Inventory

| repo | snapshot state | retained reason |
| --- | --- | --- |
| `one-person-lab` | `main` clean/synced at `1a2a91954d38`; only root worktree; recent snapshot writes from prior automation docs/source tranche. | Selected for this support-reference tranche; no worktree/branch deletion because recent writes were inside the frozen one-hour window. |
| `med-autoscience` | `main` clean, ahead `origin/main` by 16 at `4e0ee8f4da74`; fetch hit transient GitHub SSL failure; no dirty files. | Retained because ahead lane needs semantic intake and long-running `scripts/verify.sh structure` / `opl quality details --root med-autoscience` processes were still open. |
| `med-autogrant` | `main` clean/synced at `3fc5041c645e`; recent writes in `.agents/plugins/marketplace.json` and docs portfolio. | Retained due recent snapshot writes; no cleanup action. |
| `redcube-ai` | `main` ahead `origin/main` by 3 at `42dee414723d`; root dirty and multiple native-PPT worktrees dirty or recent. | Retained as active RCA native-PPT lane; no deletion or absorb attempted. |
| `opl-meta-agent` | `main` clean/synced at `59e216dd37a3`; only root worktree. | No safe stale branch/worktree work in this tranche. |
| `one-person-lab-app` | `main` dirty/synced at `eadbde57adeb`; `codex/full-first-run-stable-gate-20260525` worktree dirty and remote-backed. | Retained as App full-first-run / active-shell lane; no deletion or absorb attempted. |

Post-snapshot activity observed in the selected OPL tranche: none in the selected files. RCA root had post-snapshot writes in native-PPT docs/prompts; closeout recheck also showed `docs/status.md` dirty in RCA. All RCA changes remain outside this tranche and carry to the next heartbeat intake.

## Reviewed Surfaces

- Canonical context: `TASTE.md`, `README.md`, `docs/README.md`, `docs/status.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`.
- Support reference under edit: `docs/references/current-support/opl-release-packages-modular-distribution.md`.
- Live package truth: `src/package-distribution.ts`, `tests/src/cli/cases/package-distribution.test.ts`, `./bin/opl packages manifest --json`.
- Boundary truth: `docs/invariants.md`, `docs/status.md`, `docs/architecture.md`.

## Change

Retired one stale support-doc phrase that described `MDS` as a possible provider adapter in package/distribution context. Fresh source and CLI output show the package manifest contains only `medautoscience`, `medautogrant`, `redcube`, and `oplmetaagent`; the focused test asserts `meddeepscientist` is absent. Core invariants/status/architecture say `MDS` is only a MAS-declared optional companion for backend audit, source provenance, historical fixture, explicit archive import, upstream intake, or parity oracle, and must not be an OPL default install dependency or managed domain agent.

## Coverage Ledger

| category | covered this tranche |
| --- | --- |
| Source/contracts/tests/docs reviewed | package-distribution source/test, package manifest CLI, current-support package reference, core MDS boundary docs |
| Source/contracts/tests/docs changed | `docs/references/current-support/opl-release-packages-modular-distribution.md`; this ledger; process history index |
| Archived/tombstoned/deleted docs | none |
| Retired modules/interfaces/tests/entries | none; this tranche retired stale prose only |
| Public surfaces retained | Package manifest module set and App/Packages owner split retained because live source/tests/CLI already match current boundary |
| Uncovered docs | Remaining `docs/references/current-support/**`, `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, and non-OPL repo README/docs remain for later tranche-by-tranche semantic audit |
| Snapshot blockers retained | MAS ahead 16 plus long-running processes; RCA dirty native-PPT lanes; App dirty root/full-first-run lane; MAG recent write protection; OPL recent-write branch cleanup protection |
| Remaining stale/retire candidates | stale fixed counters, provider proof snapshots, branch/SHA state, legacy default-scope wording, local proof paths, MDS/provider wording, compatibility promises |
| Next write scope | Continue current-support / runtime-substrate support references, or separately intake MAS ahead / RCA native-PPT / App full-first-run lanes with fresh frozen scope |

## Verification

Minimum verification should cover whitespace/diff health, conflict-marker absence, OPL doc doctor, package-distribution tests, and line-budget because this tranche changes docs/history only but depends on package-distribution live truth.
