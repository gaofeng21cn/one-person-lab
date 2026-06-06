# OPL Family Structure Advisory Report

Owner: `One Person Lab`
Purpose: `references_operating_governance_family_structure_advisory_report`
State: `active_support_dated_snapshot`
Machine boundary: 本文是人读 advisory reference。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、真实 evidence，以及 `scripts/family-structure-advisory.mjs` 的 fresh 输出。

owner: OPL shared governance
purpose: advisory structure scan across OPL-family tracked files
state: OPL-owned current readout plus dated non-OPL refresh rule, not a fail-closed gate
machine boundary: generated from `npm run --silent family:structure-advisory -- --format=json|markdown` or explicit `--repo name=/path`

## Reading Rules

- 本报告是 tracked advisory snapshot，不是结构阻断门。复用精确文件清单、line count、`needs_design_pass`、`mechanical_residue` 或 `public_surface_risk` 前必须重跑 fresh advisory command。
- 2026-05-30 起，`family:structure-advisory` 默认 scope 已收口到当前 OPL series 六仓：`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`。`med-deepscientist` 不再是默认 OPL series scan target；MDS 只按 MAS archive/reference/fixture 语境读取。
- `opl-aion-shell` 是外部 fork / App shell implementation carrier，不进入本报告的 OPL-owned structure cleanup scope；它的 upstream intake 和本地 overlay 边界继续按 App/shell 文档读取。
- 本 tracked 文档的详细 readout 只刷新本 tranche 持有的 `one-person-lab` section。非 OPL repo 的精确 findings 需要在对应 repo clean、snapshot-safe、无活跃 owner lane 时用 explicit `--repo` 或 default six-repo command 重新生成，再折回各 repo owner doc 或新的 process ledger。
- 若 sibling repo dirty、ahead、最近一小时有写入、存在活跃进程、远端/PR owner 信号，命令输出只能作为本地 read-only preflight，不得把其精确 line count 或 findings 提交到 OPL tracked current docs。
- Advisory findings 只能进入 design-pass、contract-surface review 或 cleanup candidate queue；不能直接变成 fail-closed backlog、机械拆分任务、domain ready 判断或 production ready 判断。

## 2026-06-06 Current Finding

Fresh command:

```bash
node ./scripts/family-structure-advisory.mjs --format markdown
```

Current scope:

- Included: `one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`
- Excluded: `opl-aion-shell`

External calibration:

- ESLint `max-lines` treats large files as a maintainability signal, notes that there is no objective universal maximum, and offers configurable `max` plus blank/comment skipping. This supports a ratchet / review policy instead of a universal physical split rule: <https://archive.eslint.org/docs/rules/max-lines>
- Checkstyle `FileLength` frames long files as hard to understand and says they should usually be refactored into classes with a specific task; it also uses a configurable `max` and file-extension scope. This supports semantic refactoring, not arbitrary chunks: <https://checkstyle.org/checks/sizes/filelength.html>
- Thoughtworks' fitness-function guidance treats architectural checks as automated health signals, while warning that overly strict or poorly defined functions can impose unnecessary rigidity. This supports keeping line-budget/Sentrux as fitness signals with explicit escape/ratchet semantics: <https://www.thoughtworks.com/insights/decoder/f/fitness-functions>

Current conclusion:

- Line budget remains useful as a maintainability fitness function, but it is advisory for ordinary development and blocking only in explicit strict maintenance. The strict maintenance unit is `new over-limit growth`, `baseline growth`, `stale baseline`, `retired baseline`, or `missing reviewed owner/reason`; the repair action must be a natural semantic split, owner-boundary move, generated/source separation, or approved reviewed baseline. Do not split a long file into physical shards that must be mentally reassembled.
- `parts/` is acceptable when it names a real owner subdomain. `*_parts/*_parts` or nested `parts` stacks are review signals; they become cleanup tasks only after reading the caller and confirming the directory name is merely a mechanical consequence of the budget.
- Sentrux is still valuable where it has explicit repo rules or produces trend diagnostics. Baseline-only Sentrux is advisory; explicit `.sentrux/rules.toml` should also stay advisory in ordinary development and become blocking only in explicit strict maintenance after the rules reflect current repo truth and avoid generated contracts / schema surfaces that are intentionally large.

Current repo disposition:

| Repo | Current structure finding | Action |
| --- | --- | --- |
| `one-person-lab` | No mechanical residue. Remaining signals are long framework/App drilldown/test surfaces and large public contracts. | Keep advisory line-budget plus explicit strict ratchet; split only along owner/runtime/App read-model boundaries in scheduled structure maintenance. |
| `med-autoscience` | Many nested `_parts/_parts` directories and near-budget files, but root currently has local dirty work. | Read-only classification only in this tranche; next writable pass should rename or regroup natural packages such as action execution, stage review, runtime workbench projection, and domain-dispatch evidence payload export. |
| `med-autogrant` | One clear mechanical nested package: `product_entry_parts/manifest_builder_parts/*`. | Landed in an isolated MAG worktree as `product_entry_parts/manifest_shell/*`, with contracts/docs/source refs updated. Also moved Sentrux quality sidecar output out of repo root so scaffold validation and structure diagnostics do not conflict. |
| `redcube-ai` | No `*_parts/_parts` mechanical residue. The main issue is a large `ppt-deck-runtime-family-parts` bucket and near-budget native PPT files. | Landed targeted native PPT preflight split: the stable `native-ppt-plan-preflight.ts` entry is now thin, with quality role, feedback fixes, retry contract, attempt artifact, and shared schema helpers under `native-ppt-plan-preflight/`. Do not rename the whole `*-parts` directory mechanically. |
| `opl-meta-agent` | No mechanical residue; oversized tests and large `stage_control_plane.json`. | Split tests by contract family / external-suite behavior; treat contract size as generated/public-surface risk, not source mechanical split. |
| `one-person-lab-app` | Not over-split; had no repo-native `scripts/verify.sh` and has very large release/validator scripts. | Landed repo-native `scripts/verify.sh` plus `npm run verify` with smoke, structure, active-shell, release-boundary, candidate-shell, and full lanes. Next split release boundary / active-shell validator by release contract, shell candidate, package build, and user-path evidence. |

Sentrux disposition:

| Repo | Current Sentrux state | Keep? | Policy |
| --- | --- | --- | --- |
| `one-person-lab` | Baseline plus OPL quality-details support; baseline drift and explicit rules are advisory by default, with strict maintenance entrypoints retained. | Yes. | Keep as structure sidecar; line-budget remains deterministic maintenance signal, not an ordinary-development blocker. |
| `med-autoscience` | Baseline present; high churn and many nested parts. | Yes, advisory until rules match owner boundaries. | Use to rank cleanup; do not block broad paper/runtime work on stale baseline-only metrics or line-count findings. |
| `med-autogrant` | Baseline and `.sentrux/rules.toml` present, but fresh `sentrux gate/check` on main already reports stale baseline/rules issues unrelated to this rename. | Yes, but repair rules. | Keep sidecar advisory by default; update rules to ignore generated large contracts/schemas and recalibrate max-depth/layer boundary after dependency cleanup before strict use. |
| `redcube-ai` | Baseline-only and CI advisory. | Yes, advisory. | Add `.sentrux/rules.toml` only after PPT/native boundaries are stable. |
| `opl-meta-agent` | No Sentrux. | Optional. | Not urgent; line budget/test split gives clearer signal today. |
| `one-person-lab-app` | No Sentrux. | Optional after deterministic verify matures. | Repo-native verify entry has landed; keep any future line-budget / structure signal advisory by default. Sentrux before calibrating generated contracts, release scripts, and shell carrier paths would still be noisy. |

Residual queue:

- MAS writable cleanup is deferred because `/Users/gaofeng/workspace/med-autoscience` has a local modification in `tests/test_domain_owner_action_dispatch_cases/publication_gate_dispatch.py`; do not overwrite it.
- RCA targeted native PPT preflight split has landed; remaining RCA structure work should focus on later semantic splits in `ppt-deck-runtime-family-parts` only when a concrete owner boundary appears.
- App repo-native verify/structure entry has landed; next App tranche should split `scripts/validate-active-shell.ts`, `tests/release/app-release-boundary.test.ts`, `scripts/build-full-first-install-package.ts`, and `scripts/validate-shell-candidates.ts` along App product, release contract, package build, and shell-candidate boundaries.
- OMA should split oversized tests before adopting new structure tools: `tests/contracts.test.ts` by contract family and `tests/external-suite-self-evolution.test.ts` by external-suite behavior. Treat `contracts/stage_control_plane.json` as generated/public-surface risk unless the generator gains modular source/bundle support.
- MAG Sentrux rule failures are pre-existing: `sentrux gate .` reports god-file baseline drift on main and worktree; `sentrux check .` reports generated contract/schema `max_file_lines` and a layer-direction violation involving `hosted_contract_bundle.py -> runtime_surfaces.py`. Treat this as a Sentrux rules cleanup follow-up, not as a blocker for the manifest shell rename.

## Scope

Current command default target set:

- `one-person-lab`
- `med-autoscience`
- `med-autogrant`
- `redcube-ai`
- `opl-meta-agent`
- `one-person-lab-app`

The guard classifies tracked files that look like semantic parts, mechanical split residue, large shared buckets, near-budget source files, or large public machine-readable surfaces. It does not force semantic holdouts through mechanical splitting.

## Current OPL Readout

Fresh explicit command:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

Fresh readout at `2026-05-30T01:20:00Z`:

- `advisory_only`: `true`
- `tracked_files`: `1043`
- `code_files_scanned`: `763`
- `missing_verify_entry`: `false`
- `needs_design_pass`: `13`
- `mechanical_residue`: `0`
- `public_surface_risk`: `4`

### one-person-lab

safe_to_keep:

- `src/runtime-tray-app-operator-drilldown-parts/*` remains a semantic split below the advisory part budget for the smaller part files; larger tail files below are design-pass inputs, not mechanical split instructions.
- `tests/src/cli/helpers-parts/*` remains a semantic test helper split below the advisory part budget.
- Small shared surfaces such as `src/management/shared.ts`, `src/system-installation/shared.ts`, and `src/opl-runtime-paths/shared.ts` stay reviewable.

needs_design_pass:

- `src/runtime-tray-app-operator-drilldown.ts`
- `tests/src/agent-lab.test.ts`
- `src/standard-domain-agent-scaffold.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown.test.ts`
- `tests/src/cli/cases/family-runtime.test.ts`
- `src/family-runtime-stage-attempts.ts`
- `tests/src/family-runtime-codex-stage-runner.test.ts`
- `tests/src/cli/cases/domain-pack-compiler.test.ts`
- `src/app-state.ts`
- `src/agent-lab-complete.ts`
- `tests/src/cli/cases/workspace-domain.stages.test.ts`
- `src/runtime-tray-app-operator-drilldown-parts/app-release-user-path.ts`
- `src/runtime-tray-app-operator-drilldown-parts/detail-view.ts`

These are design-pass inputs only. Do not mechanically split them unless a real owner boundary, generated/source separation, or reusable OPL primitive falls out of the code path.

resolved_since_last_readout:

- `src/standard-domain-agent-conformance.ts` remains below the blocking line budget after extracting physical morphology policy and active residue scanning into `src/standard-domain-agent-conformance-physical-morphology.ts` and shared helpers into `src/standard-domain-agent-conformance-utils.ts`.
- Earlier large runtime lifecycle / conformance test files are no longer in the current OPL needs-design-pass top signal; keep them out of active backlog unless a fresh scan reintroduces them.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
- `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`
- `contracts/opl-framework/agent-lab-contract.json`

These are current large machine-readable public surfaces in the OPL-only advisory scan. They are not immediate split targets, but future edits should prefer schema modularity or generated/source separation over growing them further.

## Non-OPL Refresh Status

At this tranche snapshot, non-OPL exact findings were deliberately not folded into this tracked report:

- `med-autoscience`: root `main` was clean but ahead of `origin/main` by 16 commits, with long-running verify / quality processes retained.
- `med-autogrant`: root was clean/synced but had snapshot-window recent writes from the immediately prior governance tranche.
- `redcube-ai`: root and multiple worktrees were dirty with active native-PPT / RCA lanes.
- `opl-meta-agent`: root was clean/synced but had snapshot-window recent docs-portfolio writes from the immediately prior governance tranche.
- `one-person-lab-app`: root and `codex/full-first-run-stable-gate-20260525` worktree were dirty.

Each repo needs its own clean or explicitly owner-approved refresh before precise findings are committed into a current doc. Old detailed findings for `med-autogrant`, `med-deepscientist`, and `one-person-lab-app` from the 2026-05-26 snapshot have been retired from this active body; use history/provenance only if the old exact list is needed.

## Operating Rule

Use default six-repo scope for read-only preflight:

```bash
npm run --silent family:structure-advisory -- --format=json
npm run --silent family:structure-advisory -- --format=markdown
```

Use explicit repo scope for commit-bound docs or focused design work:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

Treat `needs_design_pass` and `public_surface_risk` as review queue inputs. Treat `mechanical_residue` as cleanup candidates only after reading the owning code path and confirming the split is mechanical rather than a valid domain term.
