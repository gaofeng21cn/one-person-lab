# OPL MAS Progress Command Projection Retirement Closeout

Owner: `One Person Lab`
Purpose: `opl_mas_progress_command_projection_retirement_closeout`
State: `history_provenance`
Machine boundary: 本文是人读 OPL-side command projection closeout。当前机器真相继续归 OPL source/tests/fixtures、MAS CLI parser / workspace wrappers / runtime docs、domain-owned manifest 和 repo-native verification。

## Semantic Theme

本轮治理主题是 `OPL-side MAS progress command projection retirement`。

MAS 已在 `med-autoscience/docs/history/program/progress_projection_command_retirement_closeout_2026_06_06.md` 关闭 public `progress-projection` command、grouped `study progress-projection` alias 和 workspace-local `ops/medautoscience/bin/progress-projection` wrapper。OPL 根仓仍把 `study progress-projection` 作为 runtime tray、App-state activity 和 MAS product-entry fixture 的正向推荐命令，这是跨仓 stale projection surface。

## Single Source of Truth

MAS current public read surface:

- `medautosci study progress --profile <profile> --study-id <study_id> --format json`
- `ops/medautoscience/bin/study-progress <study_id> --format json`

OPL active projection owners:

- `src/app-state-runtime-activity.ts`
- `src/runtime-tray-mas-portal.ts`
- `src/runtime-tray-snapshot.ts`
- `tests/fixtures/family-manifests/med-autoscience-product-entry-manifest.json`

Internal `progress_projection` read-model / contract naming remains active and is not the retired public command.

## Classification

| Classification | Readout |
| --- | --- |
| `covered_by_ssot` | MAS public progress read command truth is canonical `study progress --format json`; OPL projection code and MAS fixture now consume that command only. |
| `more_specific_detail` | OPL keeps internal `progress_projection` support and foundry policy version strings because they describe read-model / contract fields, not the retired public CLI command. |
| `conflicts_with_ssot` | OPL runtime tray, App-state runtime activity, runtime manager tests, workspace-domain tests and MAS fixture previously surfaced `study progress-projection` as a positive recommendation. |
| `history_or_provenance` | MAS command retirement provenance remains in `med-autoscience/docs/history/program/progress_projection_command_retirement_closeout_2026_06_06.md`; this file records the OPL-side projection foldback. |
| `stale_or_superseded` | The OPL-side second recommended command `inspect_progress_projection` was removed; MAS artifact/runtime/check command strings in the OPL fixture now use `study progress`. |
| `out_of_scope` | This lane did not change MAS CLI behavior, MAS runtime read-model internals, OPL provider/runtime semantics, App release surfaces, domain readiness or broader six-repo cleanup. |

## Changes

- Retired the `progress-projection` command parameter from the three OPL MAS command builders.
- Removed the second `study_progress_projection` recommended command from MAS runtime tray and App-state projections.
- Rewrote OPL MAS product-entry fixture command strings to canonical `study progress`.
- Updated runtime tray, runtime manager, workspace-domain and family-domain-catalog tests.
- Added a no-resurrection guard for `study progress-projection` in OPL source and active MAS fixture surfaces.

## Verification

Focused red/green evidence:

- Red: `rtk node --experimental-strip-types --test tests/src/cli/cases/runtime-tray-mas-portal.test.ts` failed because the implementation still returned `study progress-projection`.
- Green: `rtk node --experimental-strip-types --test tests/src/cli/cases/runtime-tray-mas-portal.test.ts tests/src/cli/cases/runtime-manager-native.test.ts tests/src/cli/cases/workspace-domain.progress.test.ts tests/src/cli/cases/workspace-domain.registry.test.ts tests/src/family-domain-catalog.test.ts tests/src/stale-compat-retirement-guard.test.ts` passed with `32` tests.

Targeted active scan after the implementation change left only no-resurrection assertions and internal policy version strings:

```bash
rtk rg -n '\bstudy progress-projection\b|\bprogress-projection\b' src tests/fixtures/family-manifests/med-autoscience-product-entry-manifest.json tests/src docs/active docs/status.md docs/runtime docs/product contracts --glob '!docs/history/**'
```

Final main-checkout verification after absorption:

- `rtk node --experimental-strip-types --test tests/src/cli/cases/runtime-tray-mas-portal.test.ts tests/src/cli/cases/runtime-manager-native.test.ts tests/src/cli/cases/workspace-domain.progress.test.ts tests/src/cli/cases/workspace-domain.registry.test.ts tests/src/family-domain-catalog.test.ts tests/src/stale-compat-retirement-guard.test.ts` passed with `32` tests.
- `rtk ./scripts/verify.sh smoke` passed with `44` tests.
- `rtk git diff --check` passed.
- Conflict-marker scan over `src tests docs contracts` returned `conflict_marker_scan=clean`.
- Active retired-command scan over OPL source, MAS family fixture and active tests returned `retired_command_active_scan=clean`.
- `rtk /Users/gaofeng/.local/bin/opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Remaining Scope

This closeout only closes the OPL-side projection of the retired MAS public command.

Subagent-discovered follow-up candidates remain separate lanes: App release-notes `Full clean-install` wording, App active-shell SHA second truth, MAS `legacy_upgrade_queue` renderer fallback, MAS readiness snapshot docs second truth, MAG private-inventory line-count docs second truth, RCA/OMA negative-guard second-truth cleanup.
