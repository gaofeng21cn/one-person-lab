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
- 2026-06-06 起，`family:structure-advisory` 默认 scope 覆盖当前 OPL-related 十一仓：`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`、`opl-agui-codex-shell`、`opl-doc`、`opl-flow`、`homebrew-one-person-lab`、`OPL-PPT`。`opl-aion-shell` 是用户明确排除的外部 fork / App shell implementation carrier，不进入 OPL-owned structure cleanup scope；`med-deepscientist` 和 `DeepScientist` 只按 archive/reference/fixture 语境读取。
- 若 sibling repo dirty、ahead、最近一小时有写入、存在活跃进程、远端/PR owner 信号，命令输出只能作为本地 read-only preflight；精确 line count 或 findings 写入对应 repo owner doc 前必须由该 repo owner lane 刷新并验证。
- Advisory findings 只能进入 design-pass、contract-surface review 或 cleanup candidate queue；不能直接变成 fail-closed backlog、机械拆分任务、domain ready 判断或 production ready 判断。

## 2026-06-06 Current Finding

Fresh command:

```bash
node ./scripts/family-structure-advisory.mjs --format=json
```

Fresh eleven-repo local summary from `2026-06-06T14:20Z` after the AG-UI renderer/main/WebUI/validator, RCA test-structure, OPL owner-delta workstream merge, OMA no-resurrection closeout, App first-run scenario alias retirement, and superseded MAS/App/OMA/MAG/RCA worktree or branch cleanup passes:

- `one-person-lab`: `needs_design_pass=24`, `mechanical_residue=0`, `public_surface_risk=4`, `missing_verify_entry=false`
- `med-autoscience`: `needs_design_pass=25`, `mechanical_residue=0`, `public_surface_risk=4`, `missing_verify_entry=false`
- `med-autogrant`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=5`, `missing_verify_entry=false`
- `redcube-ai`: `needs_design_pass=5`, `mechanical_residue=0`, `public_surface_risk=9`, `missing_verify_entry=false`
- `opl-meta-agent`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=1`, `missing_verify_entry=false`
- `one-person-lab-app`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=3`, `missing_verify_entry=false`
- `opl-agui-codex-shell`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `opl-doc`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `opl-flow`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `homebrew-one-person-lab`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `OPL-PPT`: `needs_design_pass=2`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`

Current scope:

- Included standard / Foundry Agent repos: `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`
- Included framework / product / shell / support repos: `one-person-lab`、`one-person-lab-app`、`opl-agui-codex-shell`、`opl-doc`、`opl-flow`、`homebrew-one-person-lab`、`OPL-PPT`
- Excluded: `opl-aion-shell`、`med-deepscientist`、`DeepScientist`

External calibration:

- ESLint `max-lines` treats large files as a maintainability signal, notes that there is no objective universal maximum, and offers configurable `max` plus blank/comment skipping. This supports a ratchet / review policy instead of a universal physical split rule: <https://archive.eslint.org/docs/rules/max-lines>
- Checkstyle `FileLength` frames long files as hard to understand and says they should usually be refactored into classes with a specific task; it also uses a configurable `max` and file-extension scope. This supports semantic refactoring, not arbitrary chunks: <https://checkstyle.org/checks/sizes/filelength.html>
- Thoughtworks' fitness-function guidance treats architectural checks as automated health signals, while warning that overly strict or poorly defined functions can impose unnecessary rigidity. This supports keeping line-budget/Sentrux as fitness signals with explicit escape/ratchet semantics: <https://www.thoughtworks.com/insights/decoder/f/fitness-functions>

Current conclusion:

- Fresh scan shows no obvious mechanical residue in the eleven-repo scope. That means no tracked `chunk_*` / `part_001` / nested `*_parts/*_parts` class hard split remains in the scanner's current pattern set; it does not mean all structure is ideal.
- Line budget remains useful as a maintainability fitness function, but it is advisory for ordinary development and blocking only in explicit strict maintenance. The strict maintenance unit is `new over-limit growth`, `baseline growth`, `stale baseline`, `retired baseline`, or `missing reviewed owner/reason`; the repair action must be a natural semantic split, owner-boundary move, generated/source separation, or approved reviewed baseline. Do not split a long file into physical shards that must be mentally reassembled.
- `parts/` is acceptable when it names a real owner subdomain. `*_parts/*_parts` or nested `parts` stacks are review signals; they become cleanup tasks only after reading the caller and confirming the directory name is merely a mechanical consequence of the budget.
- Sentrux is still valuable where it has explicit repo rules or produces trend diagnostics. Baseline-only Sentrux is advisory; explicit `.sentrux/rules.toml` should also stay advisory in ordinary development and become blocking only in explicit strict maintenance after the rules reflect current repo truth and avoid generated contracts / schema surfaces that are intentionally large.

Family morphology conclusion:

- Standard / Foundry Agent repos should visibly share the same repo-source shape: `agent/` holds stage prompt / skill / tool affordance / knowledge / quality-gate refs; `contracts/` holds machine-readable domain descriptors and schemas; `runtime/` holds sidecar / projection / lifecycle adapters as source only; `src` or `packages` holds domain implementation and authority functions; `docs/` holds owner truth and policy; `scripts/verify.sh` is the repo-native verification entry.
- Support repos can be lighter but should still be recognizable: `one-person-lab` is the framework / shared governance owner; `one-person-lab-app` is product / release / shell-candidate owner; `opl-agui-codex-shell` is App-owned shell-candidate implementation support; `opl-doc` and `opl-flow` are plugin / workflow support repos with `.codex-plugin` + `skills/` where applicable, plus `scripts/verify.sh` when they are more than a passive reference pack; `homebrew-one-person-lab` is distribution transport support; `OPL-PPT` is artifact reference support, so scratch/reference build scripts are advisory rather than active runtime cleanup blockers.
- Current inconsistent family signals are not mostly mechanical splits. They are near-budget semantic modules, large tests, generated public contracts, and support repos whose verification / source morphology is thinner than the standard agent repos.

## 2026-06-06 Landing Evidence

First landing pass closed the clearest unnatural or family-inconsistent structure surfaces without turning line budget into an ordinary development blocker:

- `med-autoscience` `1f8be892`: split `tests/test_domain_owner_action_dispatch_cases/publication_gate_dispatch.py` into a thin entry plus `publication_gate_dispatch_cases/` scenario modules.
- `redcube-ai` `33f03c8d`: removed the duplicate old line-budget checker and routed strict structure verification through the current reviewed-baseline ratchet.
- `redcube-ai` `86e202a4`: split the two 1000-line RCA structure guard aggregators into OPL pack contract tests, RCA retired-surface guard tests, and shared helpers, then updated the meta test registry.
- `med-autogrant` `2b2ea3c`: added generated aggregate source checks so large generated contracts/schemas have a source-shape guard instead of being physically hand-sharded.
- `opl-meta-agent` `4dc72ff`: added a source-structure verification lane and stage-control-plane source/parts/leaf-index surface.
- `one-person-lab-app` `d640d5e`: split active-shell shared contract validators from the top-level validator. The current family scan has no App `needs_design_pass`; future App growth should still split by release boundary, active-shell validation, package building, release notes, and readiness summary before crossing the advisory threshold again.
- `one-person-lab-app` `34b6add`: recorded the future Full VM evidence boundary as history provenance, keeping future cohort Full VM/local authorization/native trust truth in App contracts, workflows, validators, release artifacts, release-boundary tests, and evidence manifests.
- `one-person-lab-app` `251c3f0`: retired first-run scenario `aliases` metadata between the Full first-install policy scenario and the Full DMG release VM gate; validation and release-boundary tests now fail closed if first-run scenario aliases return.
- `opl-meta-agent` `fb6375e`: locked the target-improvement no-resurrection gate into active docs, status, architecture, authority refs, and `tests/source-purity.test.ts`, so missing target-owned improvement policy stays a typed blocker and cannot silently recreate generic `external_agent/*` patch refs.
- `opl-doc` `757d30c`: split the broad OPL Doc doctor into natural command modules: CLI, profile discovery, invariant checks, plugin sync, family plan, rendering, constants, and common helpers.
- `opl-flow` `764d1ab`: added a thin repo-native `scripts/verify.sh`, closing the missing family-native verify signal.
- `opl-agui-codex-shell` `3991af4`: split renderer `App.jsx` and `styles.css` into locale, state, event, thread, view and style responsibility modules, and updated candidate source validation to read the renderer module graph instead of requiring all UI snippets in one file.
- `opl-agui-codex-shell` `74b4e78`: split shell-local Electron main process, Codex app-server client, OPL CLI bridge, UI smoke evidence, WebUI gateway/routes/runtime/static serving, and candidate source-contract validation into named modules.
- `med-autoscience`: superseded `.worktrees/mas-owner-delta-closeout` was backed up to `~/.codex/tmp/opl-family-structure-cleanup-20260606/` and removed after independent read-only review confirmed `main` already carries the effective owner-delta semantics in `244b78a8` / `b9da3263`; absorbing it would have regressed closeout binding and currentness behavior.
- `one-person-lab-app`: superseded detached `.worktrees/opl-family-app-source-shape` was backed up to `~/.codex/tmp/opl-family-structure-cleanup-20260606/` and removed after independent read-only review confirmed `main` already has the more natural Full builder split through `scripts/build-full-first-install-package/macos-trust.ts`, `archive-output.ts`, and `staging.ts`.
- `one-person-lab-app`: residual `.worktrees/codex/app-full-vm-future-evidence-boundary-20260606` and `.worktrees/app-first-run-scenario-alias-retirement-20260606` were absorbed or re-applied on `main`, verified, backed up to `~/.codex/tmp/opl-family-structure-cleanup-20260606/app-branches/`, and removed with their local `codex/*` branches.
- `opl-meta-agent`: superseded `.worktrees/oma-target-improvement-policy-fallback-retirement-20260606` was backed up to `~/.codex/tmp/opl-family-structure-cleanup-20260606/` and removed after independent diff review confirmed the branch would delete or regress the fuller `main` implementation/tests; only its durable no-resurrection governance value was re-applied on `main` in `fb6375e`.
- `med-autogrant`: superseded local `codex/mag-active-inventory-longlist-ssot-20260606`, `codex/mag-private-physical-delete-ssot-20260606`, and `codex/mag-runtime-topology-ssot-20260606` branches had no worktrees and would regress current `main` structure commits; they were backed up under `~/.codex/tmp/opl-family-structure-cleanup-20260606/mag-branches/` and deleted.
- `redcube-ai`: superseded local `codex/rca-product-entry-support-ssot-20260606` and `codex/rca-source-readiness-ssot-20260606` branches had no worktrees and would regress current RCA structure-test splits; they were backed up under `~/.codex/tmp/opl-family-structure-cleanup-20260606/rca-branches/` and deleted.

Fresh verification recorded during this pass:

- MAS: `scripts/run-pytest-clean.sh -q tests/test_domain_owner_action_dispatch_cases/publication_gate_dispatch.py`; `scripts/verify.sh`.
- RCA: `npm run contracts:current-program:check`; `npm run line-budget:strict`; `./scripts/verify.sh line-budget-strict`; `./scripts/verify.sh structure`; `npm run test:meta`; after `86e202a4`, `npm run test:meta -- --test-reporter=dot` and `npm run test:line-budget`.
- MAG: `./scripts/run-python-clean.sh scripts/check_generated_aggregate_sources.py`; focused generated-source tests; `./scripts/verify.sh meta`.
- OMA: `./scripts/verify.sh structure:strict`; `./scripts/verify.sh full`; after `fb6375e`, `node --experimental-strip-types --test tests/source-purity.test.ts`; `npm run typecheck`; `npm test`; `npm run verify`; `git diff --check`.
- App: `npm run validate:active-shell -- --quick`; `npm run validate:release-boundary`; `scripts/verify.sh structure`; after `34b6add` / `251c3f0`, `npm run test:release-boundary -- --runInBand`; `node --experimental-strip-types scripts/validate-active-shell.ts --quick`; `opl-doc-doctor doctor . --format json`; `git diff --check`.
- OPL Doc: `PYTHONDONTWRITEBYTECODE=1 bash scripts/verify.sh`.
- OPL Flow: `scripts/verify.sh`.
- AG-UI shell: `npm run verify`; `npm run build:renderer`; `npm run smoke:webui`.
- Final OPL family advisory refresh: `node scripts/family-structure-advisory.mjs --format=json`; `node --experimental-strip-types --test tests/src/family-structure-advisory.test.ts`; `git diff --check`.

Residual verification note: MAS strict line-budget still flags unrelated existing `tests/study_progress_cases/current_executable_owner_action.py` at 1023 lines. That is a target-external natural split candidate, not a regression from the publication-gate split.

## Repo Disposition

| Repo | Current structure finding | Action |
| --- | --- | --- |
| `one-person-lab` | No mechanical residue. Remaining signals are long framework/App drilldown, Temporal/provider tests, hosted-attempt tests, `family-runtime` files, and large public contracts. | Keep advisory line-budget plus explicit strict ratchet; split only along framework runtime, App read-model, provider, Agent Lab, and generated/source boundaries. |
| `med-autoscience` | Publication-gate dispatch test split is landed. Remaining signals cluster around owner-route reconcile, runtime health, study-progress, persisted dispatches, current executable owner action, and public contracts. | Do not split by line count alone. Next natural tranche is owner-route/currentness, study-progress current executable owner action, and runtime-health boundary cleanup; avoid touching dirty MAS files from concurrent work. |
| `med-autogrant` | Source shape remains mostly clean. Generated aggregate source checks are landed; only source signal remains `product_entry_parts/consumer_thinning_audit.py`; public-surface risk is dominated by generated schemas/contracts. | Keep source split advisory. Continue generator modularity / aggregate-source checks for generated schema/contract size, not physical JSON shards. |
| `redcube-ai` | Duplicate line-budget gate is unified and two 1000-line test aggregators are split. Remaining source signals are PPT/native helper, PPT runtime family, domain-action adapter, operator evidence and mock-builder responsibilities plus large runtime-program contracts. | Continue semantic splits along visual delivery boundaries: native PPT, image pages, operator evidence refs, visual-pack compiler handoff and mock builder responsibilities. Avoid renaming the whole `*-parts` bucket merely for aesthetics. |
| `opl-meta-agent` | Source design-pass remains clean. Source-structure verify lane is landed; remaining signal is `contracts/stage_control_plane.json` as a large public surface. | Treat as generated/public-surface risk. Continue source/parts/leaf-index direction only when generator/source ownership is clear. |
| `one-person-lab-app` | Active-shell shared validators split is landed, and the fresh scan has no `needs_design_pass` signal. Public-surface risk remains in large App contracts. | Keep App source-shape cleanup advisory. Future App growth should split by product release boundary, active-shell validator orchestration phases, package builder phases, release notes, readiness summary, and user-path evidence before crossing the advisory threshold again. |
| `opl-agui-codex-shell` | Renderer, main-process, WebUI server and candidate validator structure splits are landed. Fresh scan has no `needs_design_pass`, no mechanical residue and no public-surface risk. | Keep shell-local implementation thin and App-owned product truth out of the shell. Future growth should stay in the new named modules or split along the same IPC, app-server, WebUI route/runtime/static, smoke-evidence and source-contract boundaries. |
| `opl-doc` | OPL Doc doctor split is landed. Fresh scan has no `needs_design_pass`, no mechanical residue, no public-surface risk, and repo-native verify passes. | Keep as current good family morphology example for support/plugin repos: thin command entry plus named doctor responsibility modules. |
| `opl-flow` | Thin repo-native verify entry is landed. Fresh scan has no `needs_design_pass`, no mechanical residue, no public-surface risk, and no missing verify signal. | Keep verify entry thin and repo-native; no Sentrux or extra structure gate is needed until active source growth appears. |
| `homebrew-one-person-lab` | No source design-pass signal; no repo-native verify required by current policy. | Keep lightweight as distribution transport support. Do not add structure gates until formula support grows beyond the current tap shape. |
| `OPL-PPT` | Two large `scratch/skill-route-comparison-*` build scripts remain as artifact-reference signals. | Treat as scratch/reference artifact support, not active runtime cleanup. If reused, split by generated deck route / skill-route comparison responsibility in that reference repo. |

## P1 Structure Queue

These items are higher-signal than generic line-count cleanup. They should be handled in clean or owner-approved repo lanes, not by physically splitting files to satisfy a number.

Closed in the first landing pass:

- `med-autoscience`: publication-gate dispatch cases are split by behavior scenario in `1f8be892`.
- `redcube-ai`: duplicate line-budget semantics are unified in `33f03c8d`.
- `opl-meta-agent`: source-structure verification lane is added in `4dc72ff`.
- `opl-doc`: doctor implementation is split into responsibility modules in `757d30c`.
- `opl-flow`: repo-native verify entry is added in `764d1ab`.
- `med-autogrant`: generated aggregate source checks are added in `2b2ea3c`.
- `one-person-lab-app`: active-shell shared validator extraction is landed in `d640d5e`, and fresh family scan now shows no App source-shape item.
- `one-person-lab-app`: first-run scenario alias metadata is retired in `251c3f0`; Full first-install policy and Full DMG release VM gate now use distinct canonical scenario ids without compatibility aliases.
- `opl-agui-codex-shell`: renderer source modules are split in `3991af4`, and source-only candidate validation now follows the renderer module graph.
- `opl-agui-codex-shell`: main-process, WebUI server and candidate validator responsibilities are split in `74b4e78`; AG-UI now has no source-shape item in the fresh family scan.
- `redcube-ai`: `tests/opl-agent-pack-contracts.test.ts` and `tests/rca-retired-surface-guard.test.ts` are replaced by semantic test families and helpers in `86e202a4`.
- `opl-meta-agent`: target-improvement no-resurrection governance is locked in `fb6375e`; missing target-owned improvement policy remains a typed blocker, not an implicit source patch work order.

Remaining P1 natural split / source-shape queue:

- `med-autoscience`: split `tests/study_progress_cases/current_executable_owner_action.py` by current-executable-owner-action scenario before using MAS strict line-budget as a clean gate. Owner-route/currentness and runtime-health files remain design-pass inputs.
- `redcube-ai`: current over-1000 source files remain reviewed-baseline candidates, not mechanical split work: `tests/opl-family-contract-adoption.test.ts`, `python/redcube_ai/native_helpers/ppt_deck/native_layouts.py`, and `python/redcube_ai/native_helpers/ppt_deck/native_quality.py`. Future splits should follow test-family, native layout, native quality, image-page, operator-evidence and visual-pack handoff responsibilities.
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

- none in the fresh `2026-06-06T12:39Z` eleven-repo scan.

Interpretation: The previous support-repo source-shape pressure has been reduced by App-side and shell-side splits. Future App growth should still split by release boundary, active-shell validation, package building, release note generation, and readiness summary before it crosses the advisory threshold again.

### opl-agui-codex-shell

needs_design_pass:

- none

Interpretation: Renderer `App.jsx` is no longer a source-shape finding after the `3991af4` split, and the shell-local main process / WebUI server / candidate validator tranche is closed by `74b4e78`. Current AG-UI source shape is a good support-shell example: thin entries, named main-process modules, named WebUI modules, and source-contract validation that follows module graphs.

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

### homebrew-one-person-lab

needs_design_pass:

- none

Interpretation: The tap is lightweight distribution transport support. It does not need a repo-native verify entry or Sentrux lane until active source growth appears.

### OPL-PPT

needs_design_pass:

- `scratch/skill-route-comparison-opl-v3b-32p/officecli-pptx-skill/src/build-opl-v3b-officecli-pptx-skill.mjs`
- `scratch/skill-route-comparison-opl-v3b-32p/presentations-skill/src/build-opl-v3b-presentations-skill.mjs`

Interpretation: These are scratch/reference artifact-support scripts, not active runtime or standard-agent source. If they become reusable support code, split them by presentation route, deck build phase and skill-route comparison responsibility inside OPL-PPT.

## Sentrux Disposition

| Repo | Current Sentrux state | Keep? | Policy |
| --- | --- | --- | --- |
| `one-person-lab` | Baseline plus OPL quality-details support; baseline drift and explicit rules are advisory by default, with strict maintenance entrypoints retained. | Yes. | Keep as structure sidecar; line-budget remains deterministic maintenance signal, not an ordinary-development blocker. |
| `med-autoscience` | Baseline present; high churn and many near-budget owner-route/runtime files. | Yes, advisory until rules match owner boundaries. | Use to rank cleanup; do not block broad paper/runtime work on stale baseline-only metrics or line-count findings. |
| `med-autogrant` | Baseline and `.sentrux/rules.toml` present; large generated schemas/contracts can make naive line rules noisy. | Yes, but rules need calibration. | Keep sidecar advisory by default; update rules to ignore generated large contracts/schemas before strict use. |
| `redcube-ai` | Baseline-only / advisory style. | Yes, advisory. | Add or tighten explicit rules only after PPT/native boundaries are stable. |
| `opl-meta-agent` | No current Sentrux signal in this scan. | Optional. | Not urgent; line budget/test split gives clearer signal today. |
| `one-person-lab-app` | No current Sentrux signal in this scan. | Optional after deterministic verify matures. | Repo-native verify is more important today; future structure signal should remain advisory by default. |
| `opl-agui-codex-shell` | No current Sentrux signal in this scan. | Optional. | Candidate validator and repo-native verify give clearer signal today; add Sentrux only after shell-candidate source boundaries stabilize. |
| `opl-doc` | No current Sentrux signal in this scan. | Optional. | Use only if doctor/plugin docs validation grows; avoid making docs support work depend on noisy structural gates. |
| `opl-flow` | No current Sentrux signal in this scan. | Optional. | Not worth adding before active source growth; current repo-native verify is sufficient. |
| `homebrew-one-person-lab` | No current Sentrux signal in this scan. | No. | Tap formula transport is too small for a structural sidecar today. |
| `OPL-PPT` | No current Sentrux signal in this scan. | Optional only if scratch becomes maintained source. | Do not gate reference artifact scratch work on Sentrux unless it becomes active support code. |

## Operating Rule

Use default eleven-repo scope for read-only preflight:

```bash
npm run --silent family:structure-advisory -- --format=json
npm run --silent family:structure-advisory -- --format=markdown
```

Use explicit repo scope for commit-bound docs or focused design work:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

Treat `needs_design_pass` and `public_surface_risk` as review queue inputs. Treat `mechanical_residue` as cleanup candidates only after reading the owning code path and confirming the split is mechanical rather than a valid domain term.
