# OPL Family Structure Advisory Report

Owner: `One Person Lab`
Purpose: `references_operating_governance_family_structure_advisory_report`
State: `dated_snapshot`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

owner: OPL shared governance  
purpose: advisory structure scan across OPL-family tracked files  
state: dated advisory report, not a fail-closed gate
machine boundary: generated from `npm run --silent family:structure-advisory -- --format=markdown`

2026-05-26 02:38 CST 读法：本文是 tracked advisory snapshot，不是结构阻断门。复用精确文件清单、line count、needs-design-pass 或 public-surface-risk 前必须重跑 `npm run --silent family:structure-advisory -- --format=json|markdown`。本轮 fresh scan 仍显示 advisory-only；它覆盖 `one-person-lab`、`med-autogrant`、`med-deepscientist` 和 `one-person-lab-app`，不扫描 MAS、RCA、OMA，也不再把 `opl-aion-shell` 当作当前 OPL series scan 对象。任何条目都只能进入 design-pass 或 contract-surface review queue，不能直接变成 fail-closed backlog 或机械拆分任务。

2026-05-28 OPL docs tranche 复核：从本 worktree 运行 `npm run --silent family:structure-advisory -- --format=markdown` 时，只扫描到当前 `one-person-lab` worktree；按 sibling layout 推断的其他 repo root 在该 worktree 路径下不可见。因此，本报告的 family-wide 文件清单仍是 dated snapshot；任何精确跨仓 line count、needs-design-pass、mechanical-residue 或 public-surface-risk 复用前，必须从根 checkout 或显式配置 sibling repo layout 重新生成。

## Scope

This report covers tracked files in:

- `one-person-lab`
- `med-autogrant`
- `med-deepscientist`
- `one-person-lab-app`

It intentionally does not scan MAS, RCA, or OMA. The guard is advisory: it identifies structural pressure, mechanical split residue, nested parts, large shared buckets, public machine-readable surfaces, and near-1000-line part files. It does not force semantic holdouts through mechanical splitting.

## Current Readout

### one-person-lab

safe_to_keep:

- `src/product-entry-parts/*` remains a semantic split below the advisory part budget.
- `tests/src/cli/helpers-parts/*` remains a semantic test helper split below the advisory part budget.
- Small shared surfaces such as `src/management/shared.ts`, `src/system-installation/shared.ts`, and `src/opl-runtime-paths/shared.ts` stay reviewable.

needs_design_pass:

- Current advisory scan flags these OPL-owned files over the 1000-line source threshold:
  - `src/runtime-tray-app-operator-drilldown.ts`
  - `tests/src/agent-lab.test.ts`
  - `src/family-stage-control-plane.ts`
  - `src/agent-lab-complete.ts`
  - `src/runtime-tray-app-operator-drilldown-parts/detail-view.ts`

These are design-pass inputs only. Do not mechanically split them unless a real owner boundary, generated/source separation, or reusable OPL primitive falls out of the code path.

resolved_since_last_readout:

- `src/standard-domain-agent-conformance.ts` was thinned below the blocking line budget by extracting physical morphology policy and active residue scanning into `src/standard-domain-agent-conformance-physical-morphology.ts` and shared helpers into `src/standard-domain-agent-conformance-utils.ts`. This is a semantic owner-boundary extraction, not a numeric split: conformance remains the thin read-only report aggregator, while physical morphology remains a scoped structural guard.
- Earlier large runtime lifecycle / conformance test files are no longer in the current OPL needs-design-pass top signal; keep them out of active backlog unless a fresh scan reintroduces them.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`
- `contracts/opl-framework/agent-lab-contract.json`

These are the current large machine-readable public surfaces in the advisory scan. They are not immediate split targets, but future edits should prefer schema modularity or generated/source separation over growing them further.

### med-autogrant

safe_to_keep:

- Most `product_entry_parts`, `domain_runtime_parts`, `cli_parts`, and focused `*_parts.py` files remain semantic and below the advisory part budget.
- Examples include `product_entry_parts/loop_contracts.py`, `domain_runtime_parts/io.py`, `product_entry_parts/runtime_surfaces.py`, and `domain_runtime_parts/substrate.py`.

needs_design_pass:

- `src/med_autogrant/product_entry_parts/consumer_thinning_audit.py`

This is near the 1000-line part-file boundary. The correct next action is a design pass around natural ownership, not a numeric split.

mechanical_residue:

- `src/med_autogrant/product_entry_parts/manifest_builder_parts/shell_assembly.py`
- `src/med_autogrant/product_entry_parts/manifest_builder_parts/runtime_task_shell.py`
- `src/med_autogrant/product_entry_parts/manifest_builder_parts/__init__.py`

These nested `parts` paths are advisory residue candidates only. Do not flatten or delete them until reading the manifest-builder code path and confirming the split is mechanical rather than a real owner boundary.

public_surface_risk:

- `schemas/v1/product-entry-manifest.schema.json`
- `contracts/functional_privatization_audit.json`
- `contracts/stage_control_plane.json`
- `contracts/runtime-program/opl-family-contract-adoption.json`
- `schemas/v1/common.schema.json`

These are large schema surfaces. Treat growth here as public contract risk.

### med-deepscientist

safe_to_keep:

- Generated or vendored UI sources under `src/ui/public/monaco/**` and `src/ui/vendor/**` are classified separately from design debt.
- `src/deepscientist/artifact/service_parts/*` is a semantic split under the advisory part budget.
- Small shared UI/runtime surfaces remain safe to keep.

needs_design_pass:

- Large repo-owned implementation files dominate the signal, including:
  - `src/deepscientist/artifact/service.py`
  - `src/deepscientist/quest/service.py`
  - `src/deepscientist/daemon/app.py`
  - `src/ui/src/lib/plugins/ai-manus/AiManusChatView.tsx`
  - `src/ui/src/lib/plugins/lab/components/LabQuestGraphCanvas.tsx`
  - `src/ui/src/lib/api/lab.ts`
  - `src/ui/src/components/workspace/QuestWorkspaceSurface.tsx`
  - large test files such as `tests/test_memory_and_artifact.py` and `tests/test_daemon_api.py`

This repo needs a separate design pass. The current lane is read-only for MDS.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- none from the current advisory scan.

### one-person-lab-app

safe_to_keep:

- none from the current advisory scan.

needs_design_pass:

- Current App advisory scan flags:
  - `tests/release/app-release-boundary.test.ts`
  - `scripts/build-full-first-install-package.ts`

This repo currently has no `scripts/verify.sh`, so this lane records read-only advisory findings only. App release-ready / production-ready remains owned by App release lanes, not this OPL reference document.

mechanical_residue:

- none from tracked `chunk_*`, `part_*`, `split_*`, or nested `parts` directory patterns.

public_surface_risk:

- none from the current advisory scan.

## Operating Rule

Use `npm run --silent family:structure-advisory -- --format=markdown` from OPL to refresh the report. Treat `needs_design_pass` and `public_surface_risk` as review queue inputs. Treat `mechanical_residue` as cleanup candidates only after reading the owning code path and confirming the split is mechanical rather than a valid domain term.
