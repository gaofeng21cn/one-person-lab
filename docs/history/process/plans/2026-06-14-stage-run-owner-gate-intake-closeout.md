# StageRun Authorization And Owner-Gate Intake Closeout

Owner: `One Person Lab`
Purpose: `stage_run_owner_gate_intake_closeout`
State: `history_provenance`
Machine boundary: 本文只记录一次 OPL series governance tranche 的 value / safety gate、SSOT foldback、变更、验证和停止证据。当前机器真相继续归 `contracts/`、source、tests、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App evidence、owner receipts、typed blockers 和 fresh command output；本文不得作为 readiness claim、owner receipt、typed blocker、quality/export verdict、artifact authority、physical delete authorization、App release truth 或 compatibility surface。

## Run Snapshot

- `RUN_SNAPSHOT_TS`: `2026-06-14T00:17:05Z`
- Automation: `automation-2` / OPL 系列项目治理与过时面退役
- Scope: six-repo frozen inventory across `/Users/gaofeng/workspace/one-person-lab`, `/Users/gaofeng/workspace/med-autoscience`, `/Users/gaofeng/workspace/med-autogrant`, `/Users/gaofeng/workspace/redcube-ai`, `/Users/gaofeng/workspace/opl-meta-agent`, and `/Users/gaofeng/workspace/one-person-lab-app`
- Snapshot result: all six repos were on `main` and synced with `origin/main`. `one-person-lab` and `med-autoscience` had coherent dirty write sets; the other four repos were clean. No extra worktree was created for this tranche.
- Post-snapshot activity: the dirty write sets were treated as candidate lanes rather than blockers, verified, committed, pushed, and folded back into current docs / tests where appropriate.

## Candidate Gate

| Candidate | Value gate | Safety gate | Decision |
| --- | --- | --- | --- |
| OPL StageRun execution authorization exact identity preflight | High. OPL already owned refs-only StageRun execution authorization, but the record path needed a dry-run / no-write operator preflight and stronger identity fields before ledger writes. | Safe. CodeGraph showed the affected surface is `recordStageRunExecutionAuthorizationReceipts`, the CLI command spec, Temporal launch authorization builder, cockpit/current-owner consumers and focused tests. Authority boundary remains refs-only and does not write domain truth. | Entered lane; landed in OPL. |
| MAS study owner-gate decision intake | High. MAS owner gate requests such as `stage_packet_not_current_selected_dispatch` needed a formal operator / human-gate decision record surface that can dry-run, apply to intervention events, and return accepted answer refs without mutating paper/runtime artifacts. | Safe. CodeGraph showed the affected surface is `study_interventions`, CLI parser / handler and CLI tests. The command writes only `artifacts/interventions/events.jsonl` on apply; dry-run writes nothing. | Entered lane; landed in MAS. |
| MAS display registry stale renderer assertions | Medium. Current display registry returns `r_ggplot2` for many evidence figure specs while stale tests asserted `python`, creating false regression pressure against the current renderer contract. | Safe. Change is test-only and focused; no display source or artifact generation logic changed. | Entered lane; landed in MAS. |
| Broad stale keyword / history wording cleanup | Low. Fresh scans still mostly hit history/provenance, negative guards, current explicit non-default executor boundaries, or surfaces requiring owner receipt / typed blocker / replacement proof. | Unsafe to delete without no-active-caller and owner evidence. | Skipped for this tranche. |

## SSOT Decisions

| Semantic theme | Single Source of Truth | Peer-doc / test classification |
| --- | --- | --- |
| StageRun execution authorization identity | OPL source and tests: `src/stage-run-execution-authorization-ledger.ts`, `src/cli/cases/runtime-stage-run-authorization-command-spec.ts`, `src/family-runtime-temporal.ts`, focused StageRun / owner-delta / domain-dispatch tests. | `docs/status.md`, `docs/decisions.md`, and `docs/active/current-state-vs-ideal-gap.md` were support foldback: they now state the boundary and explicitly prevent dry-run / ledger evidence from being read as owner answer or readiness. |
| MAS owner-gate intake | MAS source and tests: `src/med_autoscience/controllers/study_interventions.py`, `src/med_autoscience/cli_parts/study_owner_gate_commands.py`, CLI parser / dispatch tests, and `tests/test_study_interventions.py`. | MAS `docs/decisions.md` is decision support text. It records that the command is a human-gate / owner-decision intake, not paper progress or provider admission by itself. |
| Display renderer family assertions | MAS display registry source is the source of truth; `tests/test_display_registry.py` should assert the current registry contract rather than preserve stale `python` expectations. | Test-only stale assertions were updated; no docs or runtime surfaces were changed. |

## Evidence Read

- OPL `src/stage-run-execution-authorization-ledger.ts`
- OPL `src/cli/cases/runtime-stage-run-authorization-command-spec.ts`
- OPL `src/family-runtime-temporal.ts`
- OPL `tests/src/cli/cases/runtime-stage-run-execution-authorization-ledger.test.ts`
- OPL `tests/src/cli/cases/family-runtime-evidence-worklist-payload-handoff.test.ts`
- OPL `tests/src/current-owner-delta-topline.test.ts`
- OPL `tests/src/domain-dispatch-evidence-payload-preflight.test.ts`
- OPL `docs/status.md`, `docs/decisions.md`, `docs/active/current-state-vs-ideal-gap.md`
- MAS `src/med_autoscience/controllers/study_interventions.py`
- MAS `src/med_autoscience/cli.py`
- MAS `src/med_autoscience/cli_parts/parser.py`
- MAS `src/med_autoscience/cli_parts/study_owner_gate_commands.py`
- MAS `src/med_autoscience/controllers/study_progress.py`
- MAS `tests/test_cli.py`, `tests/test_study_interventions.py`, `tests/test_display_registry.py`
- MAS `docs/decisions.md`

## Changed Surface

| Repo | Commit | Change |
| --- | --- | --- |
| `one-person-lab` | `ad0eee2d` `runtime: validate StageRun authorization identity` | Added required StageRun authorization receipt identity fields, dry-run / no-write record mode, identity blocker reasons, Temporal launch identity derivation, public command usage update, focused tests, and active/status foldback. |
| `one-person-lab` | `11add144` `feat(runtime): validate stage-run authorization identity` | Tightened command parsing / public spec follow-up for StageRun authorization record dry-run support. |
| `one-person-lab` | `14eab4cb` `docs: record StageRun authorization boundary` | Added OPL decision text that keeps the StageRun authorization record path refs-only and not-readiness-authorizing. |
| `med-autoscience` | `f747cb734` `cli: restore study progress markdown export` | Re-exported the existing study-progress markdown renderer from the controller aggregate, fixing CLI aggregation tests that monkeypatch the documented controller surface. |
| `med-autoscience` | `01190c485` `feat(owner-gate): add study owner decision intake` | Added `study-owner-gate-decision` CLI / handler / intervention surface with dry-run, apply, accepted answer refs, truth event input, and fail-closed identity requirements. |
| `med-autoscience` | `941fbe6a7` `test(display): align registry renderer assertions` | Updated stale display registry renderer-family assertions to the current `r_ggplot2` contract. |

No MAG, RCA, OMA or App files were changed in this tranche.

## Verification

```bash
# one-person-lab
rtk git diff --check
rtk node --experimental-strip-types --test \
  tests/src/cli/cases/runtime-stage-run-execution-authorization-ledger.test.ts \
  tests/src/cli/cases/family-runtime-evidence-worklist-payload-handoff.test.ts \
  tests/src/current-owner-delta-topline.test.ts \
  tests/src/domain-dispatch-evidence-payload-preflight.test.ts
python3 /Users/gaofeng/workspace/opl-doc/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json

# med-autoscience
rtk git diff --check
scripts/run-pytest-clean.sh -q tests/test_cli.py tests/test_study_interventions.py tests/test_display_registry.py
python3 /Users/gaofeng/workspace/opl-doc/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/med-autoscience --format json
```

Results:

- OPL diff check: passed.
- OPL focused Node tests: `37` passed, `0` failed.
- OPL Doc doctor risk map: `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=231`.
- MAS diff check: passed.
- MAS clean pytest: `350` passed, `0` failed.
- MAS OPL Doc doctor risk map: `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=275`.

Final six-repo inventory after push:

| Repo | Final `HEAD` | `HEAD...origin/main` | Status |
| --- | --- | --- | --- |
| `one-person-lab` | `14eab4cb7a72` | `0 0` | clean / synced |
| `med-autoscience` | `941fbe6a7b8a` | `0 0` | clean / synced |
| `med-autogrant` | `14dfd42ac294` | `0 0` | clean / synced |
| `redcube-ai` | `0e0e7534dca9` | `0 0` | clean / synced |
| `opl-meta-agent` | `6bd09e823794` | `0 0` | clean / synced |
| `one-person-lab-app` | `65e1126e975b` | `0 0` | clean / synced |

## Post-Mutation Reevaluation

After the OPL and MAS lanes landed, a second six-repo inventory showed no remaining dirty or ahead/behind repo state. The candidate queue was reevaluated:

- The StageRun execution authorization and owner-gate intake gaps were closed for this tranche as concrete source / CLI / test surfaces.
- MAS display renderer assertions were aligned to the current registry; no source mutation was needed.
- Remaining broad stale-wording candidates still need fresh SSOT / no-active-caller proof before physical deletion. Continuing this run would drift into low-confidence keyword cleanup or history/provenance wording polish.
- No next candidate had a clearly disjoint, high-confidence write set plus focused verification command ready for a safe commit/push/cleanup loop.

## Next Run Slate

- Freeze fresh six-repo inventory and treat `one-person-lab@14eab4cb7a72`, `med-autoscience@941fbe6a7b8a`, `med-autogrant@14dfd42ac294`, `redcube-ai@0e0e7534dca9`, `opl-meta-agent@6bd09e823794`, and `one-person-lab-app@65e1126e975b` as current baselines.
- Prefer concrete source / contract / test / workflow / CLI/API retirements with no-active-caller evidence and replacement-owner proof.
- Reopen stale keyword or history cleanup only when the hit is outside history/provenance/negative-guard/current explicit-adapter context and has a clear SSOT owner.
- Do not treat StageRun authorization dry-run, planned receipt, recorded receipt, verified ledger, owner-gate command output, display test alignment, docs foldback or doctor pass as domain owner answer, typed blocker, current pointer closeout, paper ready, App release ready or production ready.
