# OPL Family Structure Advisory Report

Owner: `One Person Lab`
Purpose: `references_operating_governance_family_structure_advisory_report`
State: `active_support_dated_snapshot`
Machine boundary: 本文是人读 advisory reference。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、真实 evidence，以及 `scripts/family-structure-advisory.mjs` 的 fresh 输出。

owner: OPL shared governance
purpose: advisory structure scan across OPL-related tracked files
state: OPL-owned current readout, not a fail-closed gate
machine boundary: generated from `npm run --silent family:structure-advisory -- --format=json|markdown` or explicit `--repo name=/path`

## Reading Rules

- 本报告是 tracked advisory snapshot，不是结构阻断门。复用精确文件清单、line count、`needs_design_pass`、`mechanical_residue` 或 `public_surface_risk` 前必须重跑 fresh advisory command。
- 2026-06-06 起，`family:structure-advisory` 默认 scope 覆盖当前 OPL-related 八仓：`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`、`opl-doc`、`opl-flow`。`opl-aion-shell` 是外部 fork / App shell implementation carrier，不进入 OPL-owned structure cleanup scope；`med-deepscientist` 只按 MAS archive/reference/fixture 语境读取。
- 若 sibling repo dirty、ahead、最近一小时有写入、存在活跃进程、远端/PR owner 信号，命令输出只能作为本地 read-only preflight；精确 line count 或 findings 写入对应 repo owner doc 前必须由该 repo owner lane 刷新并验证。
- Advisory findings 只能进入 design-pass、contract-surface review 或 cleanup candidate queue；不能直接变成 fail-closed backlog、机械拆分任务、domain ready 判断或 production ready 判断。

## 2026-06-06 Current Finding

Fresh command:

```bash
node ./scripts/family-structure-advisory.mjs --format=json
```

Fresh eight-repo summary from `2026-06-06T10:35:43Z` after the first landing pass:

- `one-person-lab`: `needs_design_pass=21`, `mechanical_residue=0`, `public_surface_risk=4`, `missing_verify_entry=false`
- `med-autoscience`: `needs_design_pass=25`, `mechanical_residue=0`, `public_surface_risk=4`, `missing_verify_entry=false`
- `med-autogrant`: `needs_design_pass=1`, `mechanical_residue=0`, `public_surface_risk=5`, `missing_verify_entry=false`
- `redcube-ai`: `needs_design_pass=10`, `mechanical_residue=0`, `public_surface_risk=9`, `missing_verify_entry=false`
- `opl-meta-agent`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=1`, `missing_verify_entry=false`
- `one-person-lab-app`: `needs_design_pass=5`, `mechanical_residue=0`, `public_surface_risk=3`, `missing_verify_entry=false`
- `opl-doc`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `opl-flow`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`

Current scope:

- Included standard / Foundry Agent repos: `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`
- Included framework / product / support repos: `one-person-lab`、`one-person-lab-app`、`opl-doc`、`opl-flow`
- Excluded: `opl-aion-shell`

External calibration:

- ESLint `max-lines` treats large files as a maintainability signal, notes that there is no objective universal maximum, and offers configurable `max` plus blank/comment skipping. This supports a ratchet / review policy instead of a universal physical split rule: <https://archive.eslint.org/docs/rules/max-lines>
- Checkstyle `FileLength` frames long files as hard to understand and says they should usually be refactored into classes with a specific task; it also uses a configurable `max` and file-extension scope. This supports semantic refactoring, not arbitrary chunks: <https://checkstyle.org/checks/sizes/filelength.html>
- Thoughtworks' fitness-function guidance treats architectural checks as automated health signals, while warning that overly strict or poorly defined functions can impose unnecessary rigidity. This supports keeping line-budget/Sentrux as fitness signals with explicit escape/ratchet semantics: <https://www.thoughtworks.com/insights/decoder/f/fitness-functions>

Current conclusion:

- Fresh scan shows no obvious mechanical residue in the eight-repo scope. That means no tracked `chunk_*` / `part_001` / nested `*_parts/*_parts` class hard split remains in the scanner's current pattern set; it does not mean all structure is ideal.
- Line budget remains useful as a maintainability fitness function, but it is advisory for ordinary development and blocking only in explicit strict maintenance. The strict maintenance unit is `new over-limit growth`, `baseline growth`, `stale baseline`, `retired baseline`, or `missing reviewed owner/reason`; the repair action must be a natural semantic split, owner-boundary move, generated/source separation, or approved reviewed baseline. Do not split a long file into physical shards that must be mentally reassembled.
- `parts/` is acceptable when it names a real owner subdomain. `*_parts/*_parts` or nested `parts` stacks are review signals; they become cleanup tasks only after reading the caller and confirming the directory name is merely a mechanical consequence of the budget.
- Sentrux is still valuable where it has explicit repo rules or produces trend diagnostics. Baseline-only Sentrux is advisory; explicit `.sentrux/rules.toml` should also stay advisory in ordinary development and become blocking only in explicit strict maintenance after the rules reflect current repo truth and avoid generated contracts / schema surfaces that are intentionally large.

Family morphology conclusion:

- Standard / Foundry Agent repos should visibly share the same repo-source shape: `agent/` holds stage prompt / skill / tool affordance / knowledge / quality-gate refs; `contracts/` holds machine-readable domain descriptors and schemas; `runtime/` holds sidecar / projection / lifecycle adapters as source only; `src` or `packages` holds domain implementation and authority functions; `docs/` holds owner truth and policy; `scripts/verify.sh` is the repo-native verification entry.
- Support repos can be lighter but should still be recognizable: `one-person-lab` is the framework / shared governance owner; `one-person-lab-app` is product / release / shell-candidate owner; `opl-doc` and `opl-flow` are plugin / workflow support repos with `.codex-plugin` + `skills/` where applicable, plus `scripts/verify.sh` when they are more than a passive reference pack.
- Current inconsistent family signals are not mostly mechanical splits. They are near-budget semantic modules, large tests, generated public contracts, and support repos whose verification / source morphology is thinner than the standard agent repos.

## 2026-06-06 Landing Evidence

First landing pass closed the clearest unnatural or family-inconsistent structure surfaces without turning line budget into an ordinary development blocker:

- `med-autoscience` `1f8be892`: split `tests/test_domain_owner_action_dispatch_cases/publication_gate_dispatch.py` into a thin entry plus `publication_gate_dispatch_cases/` scenario modules.
- `redcube-ai` `33f03c8d`: removed the duplicate old line-budget checker and routed strict structure verification through the current reviewed-baseline ratchet.
- `med-autogrant` `2b2ea3c`: added generated aggregate source checks so large generated contracts/schemas have a source-shape guard instead of being physically hand-sharded.
- `opl-meta-agent` `4dc72ff`: added a source-structure verification lane and stage-control-plane source/parts/leaf-index surface.
- `one-person-lab-app` `d640d5e`: split active-shell shared contract validators from the top-level validator; the entry remains large and stays in the next App tranche.
- `opl-doc` `757d30c`: split the broad OPL Doc doctor into natural command modules: CLI, profile discovery, invariant checks, plugin sync, family plan, rendering, constants, and common helpers.
- `opl-flow` `764d1ab`: added a thin repo-native `scripts/verify.sh`, closing the missing family-native verify signal.

Fresh verification recorded during this pass:

- MAS: `scripts/run-pytest-clean.sh -q tests/test_domain_owner_action_dispatch_cases/publication_gate_dispatch.py`; `scripts/verify.sh`.
- RCA: `npm run contracts:current-program:check`; `npm run line-budget:strict`; `./scripts/verify.sh line-budget-strict`; `./scripts/verify.sh structure`; `npm run test:meta`.
- MAG: `./scripts/run-python-clean.sh scripts/check_generated_aggregate_sources.py`; focused generated-source tests; `./scripts/verify.sh meta`.
- OMA: `./scripts/verify.sh structure:strict`; `./scripts/verify.sh full`.
- App: `npm run validate:active-shell -- --quick`; `npm run validate:release-boundary`; `scripts/verify.sh structure`.
- OPL Doc: `PYTHONDONTWRITEBYTECODE=1 bash scripts/verify.sh`.
- OPL Flow: `scripts/verify.sh`.

Residual verification note: MAS strict line-budget still flags unrelated existing `tests/study_progress_cases/current_executable_owner_action.py` at 1023 lines. That is a target-external natural split candidate, not a regression from the publication-gate split.

## Repo Disposition

| Repo | Current structure finding | Action |
| --- | --- | --- |
| `one-person-lab` | No mechanical residue. Remaining signals are long framework/App drilldown, Temporal/provider tests, hosted-attempt tests, `family-runtime` files, and large public contracts. | Keep advisory line-budget plus explicit strict ratchet; split only along framework runtime, App read-model, provider, Agent Lab, and generated/source boundaries. |
| `med-autoscience` | Publication-gate dispatch test split is landed. Remaining signals cluster around owner-route reconcile, runtime health, study-progress, persisted dispatches, current executable owner action, and public contracts. | Do not split by line count alone. Next natural tranche is owner-route/currentness, study-progress current executable owner action, and runtime-health boundary cleanup; avoid touching dirty MAS files from concurrent work. |
| `med-autogrant` | Source shape remains mostly clean. Generated aggregate source checks are landed; only source signal remains `product_entry_parts/consumer_thinning_audit.py`; public-surface risk is dominated by generated schemas/contracts. | Keep source split advisory. Continue generator modularity / aggregate-source checks for generated schema/contract size, not physical JSON shards. |
| `redcube-ai` | Duplicate line-budget gate is unified. Remaining source signals are PPT/native helpers, PPT runtime family parts, domain-action adapter parts, large tests, and large runtime-program contracts. | Later semantic split should follow visual delivery boundaries: native layout, native quality, image pages, operator evidence refs, and mock builder responsibilities. Avoid renaming the whole `*-parts` bucket merely for aesthetics. |
| `opl-meta-agent` | Source design-pass remains clean. Source-structure verify lane is landed; remaining signal is `contracts/stage_control_plane.json` as a large public surface. | Treat as generated/public-surface risk. Continue source/parts/leaf-index direction only when generator/source ownership is clear. |
| `one-person-lab-app` | Active-shell shared validators split is landed, but the top-level validator and release/user-path tests remain very large: release boundary, active-shell validator, Full first-install package build, release notes, readiness summary. | Next App tranche should split by product release boundary, active-shell validator orchestration phases, package builder phases, and user-path evidence. This is the clearest remaining non-natural source shape in the support repos. |
| `opl-doc` | OPL Doc doctor split is landed. Fresh scan has no `needs_design_pass`, no mechanical residue, no public-surface risk, and repo-native verify passes. | Keep as current good family morphology example for support/plugin repos: thin command entry plus named doctor responsibility modules. |
| `opl-flow` | Thin repo-native verify entry is landed. Fresh scan has no `needs_design_pass`, no mechanical residue, no public-surface risk, and no missing verify signal. | Keep verify entry thin and repo-native; no Sentrux or extra structure gate is needed until active source growth appears. |

## P1 Structure Queue

These items are higher-signal than generic line-count cleanup. They should be handled in clean or owner-approved repo lanes, not by physically splitting files to satisfy a number.

Closed in the first landing pass:

- `med-autoscience`: publication-gate dispatch cases are split by behavior scenario in `1f8be892`.
- `redcube-ai`: duplicate line-budget semantics are unified in `33f03c8d`.
- `opl-meta-agent`: source-structure verification lane is added in `4dc72ff`.
- `opl-doc`: doctor implementation is split into responsibility modules in `757d30c`.
- `opl-flow`: repo-native verify entry is added in `764d1ab`.
- `med-autogrant`: generated aggregate source checks are added in `2b2ea3c`.

Remaining P1 natural split / source-shape queue:

- `one-person-lab-app`: split `tests/release/app-release-boundary.test.ts`, `scripts/validate-active-shell.ts`, and `scripts/build-full-first-install-package.ts` by release boundary, active-shell orchestration phase, package-builder phase, and user-path evidence. The first shared-validator extraction is landed but not enough to close the App source-shape tranche.
- `med-autoscience`: split `tests/study_progress_cases/current_executable_owner_action.py` by current-executable-owner-action scenario before using MAS strict line-budget as a clean gate. Owner-route/currentness and runtime-health files remain design-pass inputs.
- `redcube-ai`: current over-1000 source files remain reviewed-baseline candidates, not mechanical split work: `tests/opl-family-contract-adoption.test.ts`, `python/redcube_ai/native_helpers/ppt_deck/native_layouts.py`, and `python/redcube_ai/native_helpers/ppt_deck/native_quality.py`. Future splits should follow test-family, native layout, and native quality responsibilities.
- `opl-meta-agent`: `contracts/stage_control_plane.json` remains the largest standard-agent public contract surface in this scan. Prefer stage / JSON-pointer leaf refs plus generated aggregate, similar to RCA's current-program leaf-index pattern, instead of hand-splitting the JSON file.
- `med-autogrant`: code line-budget is clean except `consumer_thinning_audit.py`; large schemas/contracts (`product-entry-manifest.schema.json`, `functional_privatization_audit.json`, `stage_control_plane.json`) should continue moving toward generated aggregate / leaf-source separation if they keep growing.

## Detailed Readout

### one-person-lab

needs_design_pass:

- `src/runtime-tray-app-operator-drilldown.ts`
- `tests/src/family-runtime-codex-stage-runner.test.ts`
- `tests/src/cli/cases/app-state.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-actions.test.ts`
- `tests/src/agent-lab.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown.test.ts`
- `tests/src/cli/cases/family-runtime-evidence-worklist.test.ts`
- `src/family-runtime-codex-stage-runner.ts`
- `tests/src/cli/cases/family-runtime-queue-guards.test.ts`
- `tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor.ts`
- Additional entries should be read from fresh JSON before implementation.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
- `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`
- `contracts/opl-framework/agent-lab-contract.json`

These are current large machine-readable public surfaces in the OPL scan. They are not immediate split targets, but future edits should prefer schema modularity or generated/source separation over growing them further.

### med-autoscience

Top needs_design_pass:

- `src/med_autoscience/controllers/owner_route_reconcile_parts/action_projection.py`
- `src/med_autoscience/controllers/owner_route_reconcile.py`
- `src/med_autoscience/controllers/runtime_health_kernel.py`
- `tests/study_progress_cases/current_executable_owner_action.py`
- `src/med_autoscience/controllers/domain_owner_action_dispatch_parts/persisted_dispatches.py`
- `src/med_autoscience/controllers/study_progress_parts/progress_first_monitoring/__init__.py`
- `src/med_autoscience/controllers/study_progress_parts/publication_runtime.py`
- `src/med_autoscience/controllers/submission_minimal_parts/shared_base.py`

Interpretation: These are owner-route, currentness, study-progress, dispatch, runtime-health, and publication-gate design-pass inputs. They should be optimized by owner boundary, not by physical chunking.

### med-autogrant

needs_design_pass:

- `src/med_autogrant/product_entry_parts/consumer_thinning_audit.py`

public_surface_risk:

- `schemas/v1/product-entry-manifest.schema.json`
- `contracts/functional_privatization_audit.json`
- `contracts/stage_control_plane.json`
- `contracts/runtime-program/opl-family-contract-adoption.json`
- `schemas/v1/common.schema.json`

Interpretation: Source shape is mostly clean; large schema/contract files are generated/public surface pressure.

### redcube-ai

Top needs_design_pass:

- `tests/opl-family-contract-adoption.test.ts`
- `python/redcube_ai/native_helpers/ppt_deck/native_layouts.py`
- `python/redcube_ai/native_helpers/ppt_deck/native_quality.py`
- `tests/opl-agent-pack-contracts.test.ts`
- `tests/rca-retired-surface-guard.test.ts`
- `packages/redcube-runtime-family-ppt/src/ppt-deck-runtime-family-parts/native-ppt.ts`
- `packages/redcube-domain-entry/src/actions/domain-action-adapter-parts/visual-pack-compiler-handoff.ts`
- `packages/redcube-runtime-family-ppt/src/ppt-deck-runtime-family-parts/image-pages.ts`

Interpretation: Remaining split work should follow visual stage / native PPT / generated interface / test-family boundaries.

### opl-meta-agent

needs_design_pass:

- none

public_surface_risk:

- `contracts/stage_control_plane.json`

Interpretation: Current source shape is acceptable. Contract bundle modularity is a generator/source concern, not a source-file split task.

### one-person-lab-app

needs_design_pass:

- `tests/release/app-release-boundary.test.ts`
- `scripts/validate-active-shell.ts`
- `scripts/build-full-first-install-package.ts`
- `scripts/release-notes.ts`
- `tests/release/release-readiness-summary.test.ts`

Interpretation: This is the strongest remaining natural split queue in the support repos. Split by release boundary, active-shell validation, package building, release note generation, and readiness summary.

### opl-doc

needs_design_pass:

- none

Interpretation: Doctor responsibility split is landed; keep future growth in the existing `scripts/opl_doc_doctor_parts/` responsibility modules.

### opl-flow

needs_design_pass:

- none

mechanical_residue:

- none

missing_verify_entry:

- `false`

Interpretation: Thin verify entry is landed; keep it as the repo-native maintenance surface.

## Sentrux Disposition

| Repo | Current Sentrux state | Keep? | Policy |
| --- | --- | --- | --- |
| `one-person-lab` | Baseline plus OPL quality-details support; baseline drift and explicit rules are advisory by default, with strict maintenance entrypoints retained. | Yes. | Keep as structure sidecar; line-budget remains deterministic maintenance signal, not an ordinary-development blocker. |
| `med-autoscience` | Baseline present; high churn and many near-budget owner-route/runtime files. | Yes, advisory until rules match owner boundaries. | Use to rank cleanup; do not block broad paper/runtime work on stale baseline-only metrics or line-count findings. |
| `med-autogrant` | Baseline and `.sentrux/rules.toml` present; large generated schemas/contracts can make naive line rules noisy. | Yes, but rules need calibration. | Keep sidecar advisory by default; update rules to ignore generated large contracts/schemas before strict use. |
| `redcube-ai` | Baseline-only / advisory style. | Yes, advisory. | Add or tighten explicit rules only after PPT/native boundaries are stable. |
| `opl-meta-agent` | No current Sentrux signal in this scan. | Optional. | Not urgent; line budget/test split gives clearer signal today. |
| `one-person-lab-app` | No current Sentrux signal in this scan. | Optional after deterministic verify matures. | Repo-native verify is more important today; future structure signal should remain advisory by default. |
| `opl-doc` | No current Sentrux signal in this scan. | Optional. | Use only if doctor/plugin docs validation grows; avoid making docs support work depend on noisy structural gates. |
| `opl-flow` | No current Sentrux signal in this scan. | Optional. | Not worth adding before active source growth; current repo-native verify is sufficient. |

## Operating Rule

Use default eight-repo scope for read-only preflight:

```bash
npm run --silent family:structure-advisory -- --format=json
npm run --silent family:structure-advisory -- --format=markdown
```

Use explicit repo scope for commit-bound docs or focused design work:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

Treat `needs_design_pass` and `public_surface_risk` as review queue inputs. Treat `mechanical_residue` as cleanup candidates only after reading the owning code path and confirming the split is mechanical rather than a valid domain term.
