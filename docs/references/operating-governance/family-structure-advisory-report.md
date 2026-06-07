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

## 2026-06-07 Current Finding

Fresh command:

```bash
node ./scripts/family-structure-advisory.mjs --format=json
```

Fresh eleven-repo local summary from `2026-06-07T04:11:49Z` after the MAG product-entry test split, RCA PPT semantic parts split, OPL-PPT route-builder split, OPL framework evidence/drilldown split, OPL Codex stage-runner test split, OPL domain-pack / family-runtime / runtime-drilldown / framework-readiness / Agent Lab test splits, and MAS medical-readiness / current-control handoff / persisted-dispatch splits. The OPL count below was produced from a detached clean worktree at tracked HEAD so concurrent uncommitted Stage operating principles changes in the main checkout do not pollute this structure snapshot:

- `one-person-lab`: `needs_design_pass=13`, `mechanical_residue=0`, `public_surface_risk=4`, `missing_verify_entry=false`
- `med-autoscience`: `needs_design_pass=25`, `mechanical_residue=0`, `public_surface_risk=5`, `missing_verify_entry=false`
- `med-autogrant`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=5`, `missing_verify_entry=false`
- `redcube-ai`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=9`, `missing_verify_entry=false`
- `opl-meta-agent`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=1`, `missing_verify_entry=false`
- `one-person-lab-app`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=3`, `missing_verify_entry=false`
- `opl-agui-codex-shell`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `opl-doc`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `opl-flow`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `homebrew-one-person-lab`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`
- `OPL-PPT`: `needs_design_pass=0`, `mechanical_residue=0`, `public_surface_risk=0`, `missing_verify_entry=false`

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
- Fresh standard-agent skeleton check confirms `med-autoscience`、`med-autogrant`、`redcube-ai` and `opl-meta-agent` all currently carry `AGENTS.md`、`TASTE.md`、`README.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`scripts/verify.sh`、`contracts/domain_descriptor.json`、`contracts/pack_compiler_input.json` and `agent/`. MAS/MAG are Python-first, RCA is mixed Python/Node, and OMA is Node-first; that language split is domain/runtime reality, not a family-shape inconsistency.
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

## 2026-06-07 Landing Evidence

Second landing pass closed the P1 items that were ready for direct semantic splitting, while keeping the remaining queue advisory and owner-boundary based:

- `one-person-lab` `a0f51ac8` / merge `15c3f71d`: split `src/family-runtime-evidence-worklist.ts` into route worklist items, receipt worklist items and worklist ledger modules; split `src/runtime-tray-app-operator-drilldown.ts` into current-control safe-action and route-transition context modules; removed the retired drilldown line-budget baseline entry.
- `one-person-lab` `c91cf75d`: split Codex stage-runner lifecycle tests into protocol, process lifecycle, session recovery and MAS recovery support modules.
- `one-person-lab` `6c8f03c9`: moved family evidence-worklist fixture setup into shared helpers and made `OPL_FAMILY_WORKSPACE_ROOT` an explicit discovery override, avoiding real sibling-repo drift in structure tests.
- `med-autoscience` `42cf9a92` / `34f02422`: split `tests/test_domain_owner_action_dispatch_cases/medical_paper_readiness_dispatch.py` into medical-readiness scenario cases and fixed followthrough tests to import shared helpers from the case package.
- `med-autoscience`: `src/med_autoscience/controllers/medical_paper_readiness_payload_authoring.py` is now a thin 439-line router over named payload-authoring parts; all current payload-authoring parts are under the advisory limit.
- `med-autogrant` `5795bb5`: split `tests/product_entry_cases/test_manifest_and_status.py` into manifest shell, runtime control, authority handoff, standard agent, status projection, start-surface and readiness cases. Fresh scan now has no MAG source-shape finding.
- `redcube-ai` `fe448d6c`: split RCA PPT/native/image/operator-evidence/visual-pack handoff files into semantic modules: native PPT artifact input/repair scope/shape-plan generation, image generation/prompt-style/repair source, visual-pack authority/generated/contract surfaces, operator evidence constants/scaleout/tail/receipt/efficiency, and mock native builder geometry/intent/grammar. Fresh scan now has no RCA source-shape finding.
- `OPL-PPT` `92c0520`: split both scratch skill-route comparison build scripts by presentation route, deck build phase, route config, primitives/layouts and skill-route comparison responsibility. Fresh scan now has no OPL-PPT source-shape finding.
- `one-person-lab` `0890458d`: split domain-pack generated-interface cases out of `tests/src/cli/cases/domain-pack-compiler.test.ts`; the pack-compiler entry is now 250 lines and the generated-interface case file is 790 lines.
- `one-person-lab` `c95ea087`: split the family-runtime safe-action evidence-worklist case out of `tests/src/cli/cases/family-runtime.test.ts`; the main family-runtime test is now 903 lines and the safe-action case file is 112 lines.
- `one-person-lab` `2a7e4b09`: split App operator drilldown core projection assertions into `runtime-app-operator-drilldown-core-assertions.ts`; the main drilldown scenario is now 770 lines and the assertion helper is 351 lines.
- `one-person-lab` `72ddcff7`: split framework-readiness JSON/read-model value helpers into `src/framework-readiness-values.ts`; `src/framework-readiness.ts` is now 978 lines and retired domain-pack / runtime-drilldown line-budget baselines were removed.
- `one-person-lab` `79a2f502` / `d83fc703`: split Agent Lab mechanism-evolution cases into `tests/src/agent-lab-mechanism-evolution.test.ts`; `tests/src/agent-lab.test.ts` is now 908 lines and its retired reviewed baseline was removed.
- `med-autoscience` `d71cadc6`: split OPL current-control handoff projection into handoff values and terminal-log modules; the prior top-level handoff file is no longer in the fresh design-pass list.
- `med-autoscience` `67d6ca5c`: split consumed transition dispatch helpers into `consumed_transition_owner_routes.py`; `persisted_dispatches.py` is now 889 lines and no longer an oversized source entry.
- `med-autoscience` owner-route follow-up note: an isolated `mas-owner-route-reconcile-split-20260607` worktree reduced `owner_route_reconcile.py` to 953 lines in draft form, but it only had `py_compile` evidence and no full focused pytest / line-budget / diff-check completion. It is not counted as landed in this report.

Fresh verification recorded during this pass:

- OPL: `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-evidence-worklist.test.ts`; `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-evidence-worklist-default-caller.test.ts tests/src/cli/cases/family-runtime-evidence-worklist-domain-blockers.test.ts`; `node --experimental-strip-types --test tests/src/cli/cases/runtime-app-operator-drilldown-actions.test.ts`; `node --experimental-strip-types --test tests/src/cli/cases/domain-pack-compiler.test.ts tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts`; `node --experimental-strip-types --test tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/family-runtime-evidence-worklist-safe-actions.test.ts`; `node --experimental-strip-types --test tests/src/cli/cases/runtime-app-operator-drilldown.test.ts`; `node --experimental-strip-types --test tests/src/cli/cases/framework-readiness.test.ts`; `node --experimental-strip-types --test tests/src/agent-lab.test.ts tests/src/agent-lab-mechanism-evolution.test.ts`; `npm run line-budget`; `node scripts/family-structure-advisory.mjs --format=json`; `node --experimental-strip-types --test tests/src/family-structure-advisory.test.ts`; `git diff --check`.
- MAS: `scripts/run-pytest-clean.sh -q tests/test_domain_owner_action_dispatch_cases/medical_paper_readiness_dispatch.py tests/test_domain_owner_action_dispatch_cases/medical_paper_readiness_followthrough.py`; `./scripts/run-pytest-clean.sh tests/test_domain_owner_action_dispatch_cases/consumed_gate_replay_currentness.py -q`; `./scripts/run-pytest-clean.sh tests/test_domain_owner_action_dispatch.py -q`; `./scripts/run-python-clean.sh scripts/line_budget.py`; `git diff --check`.
- MAG: `scripts/run-pytest-clean.sh tests/product_entry_cases/test_manifest_and_status.py -q`; `scripts/verify.sh meta`; `scripts/run-python-clean.sh scripts/line_budget.py`; `git diff --check`.
- RCA: `npm run typecheck`; `npm run test:line-budget`; `git diff --check`.
- OPL-PPT: `node --check` over both thin route-builder entries and all new route modules; `git diff --check`.

Current interpretation:

- Fresh scan from `2026-06-07T04:11:49Z` still shows no scanner-detected mechanical split residue in the included eleven-repo scope.
- MAG, RCA, OPL-PPT, OMA, App, AG-UI shell, OPL Doc, OPL Flow and Homebrew support now have no source-shape findings. OPL source-shape findings are down to 13 on the clean tracked snapshot, and MAS remains at 25 because many residual files are near-budget owner-route/runtime/progress modules.
- Remaining source-shape work should be handled as natural owner-boundary design work, not as a fail-closed line-count gate. Strongest residual queues are OPL Codex stage-runner, family-runtime evidence/queue/provider-hosted attempts, runtime-drilldown domain/provider case files, framework-readiness test/system-installation, and MAS owner-route/currentness/runtime-health/progress-monitoring files.

## Repo Disposition

| Repo | Current structure finding | Action |
| --- | --- | --- |
| `one-person-lab` | No mechanical residue. Evidence worklist source, main drilldown entry, domain-pack compiler test, family-runtime test, runtime-drilldown main scenario, framework-readiness value helpers and Agent Lab mechanism-evolution tests are split. Clean tracked scan still flags 13 residual source-shape items, mostly Codex stage-runner, family-runtime evidence/queue/provider-hosted attempts, runtime-drilldown domain/provider tests, system-installation and near-budget drilldown parts. | Keep advisory line-budget plus explicit strict ratchet; next splits should follow provider lifecycle, queue/evidence worklist case family, domain/provider drilldown case family, stage-attempt primitive, system-installation module boundary and generated/source boundaries. |
| `med-autoscience` | Publication-gate and medical-readiness dispatch splits are landed, payload authoring is a thin router, OPL current-control handoff is split, and persisted dispatch consumed-transition helpers are split. Fresh scan still flags owner-route/currentness, runtime health, progress-first monitoring, near-budget provider adapters and public contracts. | Do not split by line count alone. Next natural tranche is owner-route/currentness, action-execution/progress-monitoring `__init__.py` thinning, runtime-health and near-budget provider-adapter boundary cleanup. The draft owner-route worktree needs full focused pytest / line-budget / diff-check before absorption. |
| `med-autogrant` | Source shape is clean in the fresh scan; product-entry manifest/status cases are split. Public-surface risk is dominated by generated schemas/contracts. | Continue generator modularity / aggregate-source checks for generated schema/contract size, not physical JSON shards. |
| `redcube-ai` | Fresh scan has no source-shape findings after the RCA PPT/native/image/operator-evidence/visual-pack handoff split. Remaining risk is generated/public contract size and large shared buckets. | Keep the new semantic PPT/native/image/operator-evidence module boundaries; future work should target generated/public-surface modularity and shared-bucket ownership, not physical shards. |
| `opl-meta-agent` | Source design-pass remains clean. Source-structure verify lane is landed; remaining signal is `contracts/stage_control_plane.json` as a large public surface. | Treat as generated/public-surface risk. Continue source/parts/leaf-index direction only when generator/source ownership is clear. |
| `one-person-lab-app` | Active-shell shared validators split is landed, and the fresh scan has no `needs_design_pass` signal. Public-surface risk remains in large App contracts. | Keep App source-shape cleanup advisory. Future App growth should split by product release boundary, active-shell validator orchestration phases, package builder phases, release notes, readiness summary, and user-path evidence before crossing the advisory threshold again. |
| `opl-agui-codex-shell` | Renderer, main-process, WebUI server and candidate validator structure splits are landed. Fresh scan has no `needs_design_pass`, no mechanical residue and no public-surface risk. | Keep shell-local implementation thin and App-owned product truth out of the shell. Future growth should stay in the new named modules or split along the same IPC, app-server, WebUI route/runtime/static, smoke-evidence and source-contract boundaries. |
| `opl-doc` | OPL Doc doctor split is landed. Fresh scan has no `needs_design_pass`, no mechanical residue, no public-surface risk, and repo-native verify passes. | Keep as current good family morphology example for support/plugin repos: thin command entry plus named doctor responsibility modules. |
| `opl-flow` | Thin repo-native verify entry is landed. Fresh scan has no `needs_design_pass`, no mechanical residue, no public-surface risk, and no missing verify signal. | Keep verify entry thin and repo-native; no Sentrux or extra structure gate is needed until active source growth appears. |
| `homebrew-one-person-lab` | No source design-pass signal; no repo-native verify required by current policy. | Keep lightweight as distribution transport support. Do not add structure gates until formula support grows beyond the current tap shape. |
| `OPL-PPT` | Fresh scan has no source-shape findings after route-builder scripts were split into route, deck phase, layout/primitive and comparison modules. | Keep as artifact reference support; if scratch graduates into maintained support code, preserve the same route/build-phase/comparison module shape. |

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
- `one-person-lab-app`: first-run scenario alias metadata is retired in `251c3f0`; Full first-install policy and Full DMG release VM gate now use distinct canonical scenario ids without alias metadata.
- `opl-agui-codex-shell`: renderer source modules are split in `3991af4`, and source-only candidate validation now follows the renderer module graph.
- `opl-agui-codex-shell`: main-process, WebUI server and candidate validator responsibilities are split in `74b4e78`; AG-UI now has no source-shape item in the fresh family scan.
- `redcube-ai`: `tests/opl-agent-pack-contracts.test.ts` and `tests/rca-retired-surface-guard.test.ts` are replaced by semantic test families and helpers in `86e202a4`.
- `opl-meta-agent`: target-improvement no-resurrection governance is locked in `fb6375e`; missing target-owned improvement policy remains a typed blocker, not an implicit source patch work order.

Remaining P1 natural split / source-shape queue:

- `one-person-lab`: continue residual test/runtime splits by real owner boundary: Codex stage-runner/provider lifecycle, family-runtime evidence-worklist and queue-guard case families, provider-hosted MAS executor case, runtime drilldown domain-dispatch/provider-worker case families, stage-attempt primitive, system-installation modules, and near-budget drilldown parts. Agent Lab and domain-pack compiler main tests are no longer source-shape findings after this pass.
- `med-autoscience`: continue residual splits around owner-route/currentness, runtime health, progress-first monitoring, near-budget `medical_paper_readiness_payload_authoring_parts/provider_adapters.py`, and large implementation-bearing `__init__.py` files. Medical-readiness dispatch, payload-authoring entry, OPL current-control handoff and persisted dispatch consumed-transition helpers are already split.
- `opl-meta-agent`: `contracts/stage_control_plane.json` remains the largest standard-agent public contract surface in this scan. Prefer stage / JSON-pointer leaf refs plus generated aggregate, similar to RCA's current-program leaf-index pattern, instead of hand-splitting the JSON file.

## Detailed Readout

### one-person-lab

needs_design_pass from the clean tracked OPL snapshot:

- `src/family-runtime-codex-stage-runner.ts`
- `tests/src/cli/cases/family-runtime-evidence-worklist.test.ts`
- `tests/src/cli/cases/family-runtime-queue-guards.test.ts`
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-domain-dispatch-compaction.test.ts`
- `src/family-runtime-stage-attempts.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-provider-worker-actions.test.ts`
- `tests/src/cli/cases/agents-scaffold.test.ts`
- `src/agent-lab-complete.ts`
- `src/system-installation/modules.ts`
- `tests/src/cli/cases/framework-readiness.test.ts`
- `src/runtime-tray-app-operator-drilldown-parts/detail-view.ts`
- `src/runtime-tray-app-operator-drilldown-parts/app-release-user-path.ts`
- Additional entries should be read from fresh JSON before implementation, especially if concurrent Stage operating principles / conformance lanes are active.

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

- `src/med_autoscience/controllers/owner_route_reconcile.py`
- `src/med_autoscience/controllers/runtime_health_kernel.py`
- `src/med_autoscience/controllers/study_progress_parts/progress_first_monitoring/__init__.py`
- `src/med_autoscience/controllers/owner_route_reconcile_parts/current_truth_owner.py`
- `src/med_autoscience/controllers/study_progress_parts/publication_runtime.py`
- `src/med_autoscience/controllers/owner_route_reconcile_parts/action_projection.py`
- `src/med_autoscience/controllers/submission_minimal_parts/shared_base.py`
- `src/med_autoscience/controllers/real_paper_autonomy_soak_inventory_parts/paper_line_canary.py`
- `src/med_autoscience/controllers/medical_paper_readiness_payload_authoring_parts/provider_adapters.py`
- `src/med_autoscience/controllers/study_progress_parts/projection_payload_assembly.py`
- `src/med_autoscience/controllers/domain_owner_action_dispatch_parts/persisted_dispatches.py` remains a near-budget 889-line part, not an over-1000 entry.

Interpretation: These are owner-route/currentness, study-progress, dispatch, runtime-health, publication runtime and near-budget provider-adapter design-pass inputs. The remaining large `__init__.py` files are still family-style smells because OPL standard-agent code should put implementation in named responsibility modules, not package initializers. The draft owner-route split in the isolated worktree is a useful candidate but is not landed until full focused verification passes.

### med-autogrant

needs_design_pass:

- none

public_surface_risk:

- `schemas/v1/product-entry-manifest.schema.json`
- `contracts/functional_privatization_audit.json`
- `contracts/stage_control_plane.json`
- `contracts/runtime-program/opl-family-contract-adoption.json`
- `schemas/v1/common.schema.json`

Interpretation: Source shape is clean in the fresh scan; large schema/contract files remain generated/public surface pressure.

### redcube-ai

needs_design_pass:

- none

Interpretation: The prior PPT/native/image/operator-evidence/visual-pack handoff findings are split. Remaining RCA structure pressure is generated/public-surface size and large shared buckets, not source-file semantic ownership.

### opl-meta-agent

needs_design_pass:

- none

public_surface_risk:

- `contracts/stage_control_plane.json`

Interpretation: Current source shape is acceptable. Contract bundle modularity is a generator/source concern, not a source-file split task.

### one-person-lab-app

needs_design_pass:

- none in the fresh `2026-06-07T01:31Z` eleven-repo scan.

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

- none

Interpretation: The scratch route builders are now split by route, deck phase, layout/primitive and comparison responsibility. Keep this shape if the reference scripts become maintained support code.

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
