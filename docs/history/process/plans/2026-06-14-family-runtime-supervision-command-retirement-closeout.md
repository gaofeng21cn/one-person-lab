# Family Runtime Supervision Command Retirement Closeout

Owner: `One Person Lab`
Purpose: `family_runtime_supervision_command_retirement_closeout`
State: `history_provenance`
Machine boundary: 本文只记录一次 OPL Doc governance tranche 的 SSOT / value / safety gate、变更、验证和停止证据。当前机器真相继续归 `contracts/`、source、tests、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App evidence、owner receipts、typed blockers 和 fresh command output；本文不得作为 readiness claim、owner receipt、typed blocker、quality/export verdict、artifact authority、physical delete authorization、App release truth 或 compatibility surface。

## Run Snapshot

- `RUN_SNAPSHOT_TS`: `2026-06-13T23:43:54Z`
- Automation: `automation-2` / OPL 系列项目治理与过时面退役
- Scope: six-repo frozen inventory plus writable lane in `/Users/gaofeng/workspace/one-person-lab`
- Snapshot result: all six repos were on `main` and synced with `origin/main`; `med-autoscience` had pre-existing dirty files in `src/med_autoscience/controllers/study_progress_parts/projection_payload_assembly.py` and `tests/study_progress_cases/provider_admission_projection.py`; this tranche did not touch that repo or write set.

## Candidate Gate

| Candidate | Value gate | Safety gate | Decision |
| --- | --- | --- | --- |
| OPL `family-runtime-supervision` stale MAS repair command example | High. OPL contract example and helper test still pointed at `medautoscience runtime-ensure-supervision --profile <profile>`, while MAS current truth says runtime-supervision status / ensure / remove are no longer active CLI / MCP / product-entry / workspace entries. | Safe. The changed surface is an example / helper test / README wording under OPL contracts; schema fields stay unchanged. MAS source was only read as source of truth and had unrelated dirty files that were not touched. | Entered lane. |
| Brand-module registry docs mismatch from earlier checkpoint | Low for current head. Current `one-person-lab` already has ten-module wording; `docs/specs/brand-module-registry.md` and `docs/public/OPL_BRAND_SYSTEM.md` no longer exist on current `main`. | No write needed. | Skipped as stale candidate. |
| Gateway / frontdoor / Hermes / federation broad cleanup | Low. Fresh scans showed hits are history/provenance, negative guards, current explicit non-default executor adapter wording, or policy statements requiring owner receipt / typed blocker / replacement proof. | Unsafe to delete without no-active-caller and owner evidence. | Blocked / low-confidence for this tranche. |

## SSOT Decision

| Semantic theme | Single Source of Truth | Peer-doc / test classification |
| --- | --- | --- |
| MAS runtime supervision command retirement | MAS `docs/decisions.md` states `runtime-supervision-status`, `runtime-ensure-supervision`, and `runtime-remove-supervision` are no longer MAS active CLI / MCP / product-entry / workspace entries. MAS product-entry, study progress and cockpit surfaces point ordinary refresh to `runtime domain-health-diagnostic --runtime-root <runtime_root> --profile <profile> --request-opl-stage-attempts --dry-run`. | OPL `family-runtime-supervision.schema.json` example and `runtime-task-companions` helper test were stale / superseded. OPL family-orchestration README wording was more general support text that needed narrowing so route hints do not resurrect retired MAS commands. |
| OPL authority boundary | OPL `family-runtime-supervision` remains a read-only projection; OPL must not become domain scheduler, session store, memory owner, quality verdict owner or artifact authority. | Schema field names and required fields remain current; no API shape change. Regression test now asserts the example uses the read-only current-control probe and does not contain the retired ensure-supervision command. |

## Evidence Read

- OPL `contracts/family-orchestration/family-runtime-supervision.schema.json`
- OPL `contracts/family-orchestration/README.md`
- OPL `contracts/family-orchestration/README.zh-CN.md`
- OPL `src/runtime-task-companions.ts`
- OPL `tests/src/runtime-task-companions.test.ts`
- OPL `tests/src/family-orchestration.test.ts`
- MAS `docs/decisions.md`
- MAS source/test scans for `runtime-ensure-supervision`, `runtime-supervision-status`, `runtime-remove-supervision`, `domain-health-diagnostic --request-opl-stage-attempts --dry-run`

## Changed Surface

| File | Change |
| --- | --- |
| `contracts/family-orchestration/family-runtime-supervision.schema.json` | Replaced stale MAS `runtime-ensure-supervision` example with `medautosci runtime domain-health-diagnostic --runtime-root <runtime_root> --profile <profile> --request-opl-stage-attempts --dry-run`; safe reconcile hint now says read-only current-control probe and forbids recreating retired MAS supervision commands. |
| `contracts/family-orchestration/README.md` | Clarified `repair_command` / `safe_reconcile_hint` point to domain-owned read-only current-control probes or owner repair surfaces, not retired MAS runtime-supervision entrypoints. |
| `contracts/family-orchestration/README.zh-CN.md` | Same lifecycle clarification in Chinese. |
| `tests/src/runtime-task-companions.test.ts` | Updated helper fixture to the current read-only MAS probe. |
| `tests/src/family-orchestration.test.ts` | Added regression assertions that the schema example uses the current read-only probe and does not contain `runtime-ensure-supervision` / `runtime ensure-supervision`. |

No source runtime behavior, schema required fields, workflow, package script, CLI parser or MAS file was changed.

## Verification

```bash
rtk git diff --check
rtk rg -n "runtime-ensure-supervision|runtime ensure-supervision|ensure-supervision --profile|domain-owned repair / supervision surface" contracts/family-orchestration tests/src/runtime-task-companions.test.ts tests/src/family-orchestration.test.ts
rtk node --experimental-strip-types --test tests/src/runtime-task-companions.test.ts tests/src/family-orchestration.test.ts
rtk python3 /Users/gaofeng/workspace/opl-doc/scripts/opl_doc_doctor.py doctor . --format json
```

Results:

- `git diff --check`: passed.
- Targeted stale scan: only the new negative assertion in `tests/src/family-orchestration.test.ts` matched the retired command string.
- Focused tests: `21` tests passed.
- OPL Doc doctor: `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=230`.

Post-push result:

- Commit: `429ff83d contracts: retire stale supervision command example`
- Pushed to `origin/main`.
- `one-person-lab` ended clean and synced with `origin/main`.

## Post-Mutation Reevaluation

After the commit, the retired MAS supervision command scan across OPL returned only:

- `docs/decisions.md` retirement decision text.
- The new negative assertion in `tests/src/family-orchestration.test.ts`.

Broader six-repo scans for `runtime-ensure-supervision`, `readRepoFile('docs/`, `Active-Goal Agent Prompt`, stale owner-gate selectors, `--hermes-root`, retired brand-module spec/public paths, nine-module wording, Gateway/frontdoor/federation/Hermes-first vocabulary found no additional high-confidence, disjoint, safe deletion lane:

- OPL hits were history/provenance, explicit no-resurrection policy, active gap prompt wording already accepted by OPL Doc doctor, negative guards, or current explicit non-default executor adapter boundaries.
- MAS retained unrelated dirty files in a control-plane/test lane; runtime-supervision hits there are either the MAS retirement decision, history, negative tests, or current read-only domain-health-diagnostic operator command surfaces.
- MAG/RCA/App hits were history/provenance, no-resurrection ledgers, negative guards, or active owner surfaces that require owner receipt / typed blocker / replacement proof before physical deletion.

## Next Run Slate

- Freeze fresh six-repo inventory again before editing.
- Prefer concrete source / contract / test / workflow / CLI/API retirements with no-active-caller evidence and replacement-owner proof.
- Reopen MAS runtime-supervision physical cleanup only when MAS dirty control-plane/test lane is resolved and the write set is safe.
- Continue treating Gateway/frontdoor/federation/Hermes-first/MDS/default-compat wording as low-confidence unless a hit is outside history/provenance/negative-guard/current explicit-adapter context.
- Do not spend a tranche on doctor/header-only repair, stale keyword sweeps without SSOT, or history wording polish.
